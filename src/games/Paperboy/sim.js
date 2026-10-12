// PAPERBOY — the simulation. No DOM, no React, no canvas, and no Math.random
// anywhere: the route is a pure function of (stage, input script). That is what
// lets `scripts/papercheck.mjs` import this file in plain Node and prove a
// stage deliverable BEFORE a browser is ever opened — and what makes the
// planner's solved script (planner.js) an exact witness, tick for tick.
//
// The world is a tick-timeline in FORWARD distance s (the route unrolls toward
// the camera) and lateral x in [-64, 64] (the road; sidewalks beyond |x|>52):
//
// - THE ROUTE IS SCRIPTED, NOT RANDOM. Every crate, dog and cross-cart in a
//   stage is named in levels.js at an exact `s`. Cross-carts launch on a fixed
//   period, dogs lunge when your `s` enters their range, crates are static.
//   Given your speed the whole world is a pure function of the tick — which is
//   exactly what the planner exploits (an interval DP over x per tick).
// - THE DOOR WINDOW IS THE ONE CONSUMABLE. A paper thrown toward a house is
//   judged where it crosses the door: |throwS - houseS| <= CFG.wwin, and you
//   must be LEANED that way (x past LEAN on that side). A miss wastes the
//   paper and the streak. papercheck re-solves every stage with the window
//   2 px tighter per side, at full throttle and at a crawl (the slack rule).
// - A CROSS-CART SWEEPS: the road behind its front is closed, because the cart
//   (3 px/t) is faster than the handlebars (2.4 px/t) — you never beat a cart
//   you are behind of; you enter ahead of it or wait it out. The planner's
//   blocked-set models the sweep exactly, so "dodgeable" is proven, not vibes.
// - A CRASH COSTS A LIFE: a crate, a dog, or a cart takes a life, drops the
//   streak, and stuns you for 45 ticks of frozen scroll. Three lives across
//   all three stages; the solved route crashes ZERO times.
// - THROWS: SPACE hurls a paper toward the side you are leaning (it must cross
//   that door to count). F hurls one down the lane — the only answer to a dog
//   that has already lunged into your path.

import { STAGES } from './levels.js'

export const W = 256
export const H = 224
export const XMAX = 64
export const G = 0.8                       // planner grid step; STEER = 3G
export const ROAD = 52                     // |x| > ROAD is sidewalk (and its props)
export const LEAN = 6                      // how far you must lean to throw that way
export const PAPERSPD = 6                  // paper lateral px/tick
export const PEDAL = [1.2, 2.0, 2.8]       // lo / mid / hi  (mid = 2.5G: s(t) lands on the grid)

export const CFG = {
    steer: 2.4,                              // lateral px per tick, bang-bang
    wwin: 16,                              // door window, +/- px of s (THE consumable)
    dogR: 30,                              // the lunge starts this close — late AND mean:
                                           // the crossing lands INSIDE the dog's s-band,
                                           // threatening the lane PAST centre. Hug the
                                           // dog's own kerb after it launches.
    dogSpd: 2.4, dogTicks: 50,             // the lunge crosses the road in 120 px
    dogHit: 9,                             // |dogX - x| hitbox
    carW: 14, carBand: 12, carSpd: 3, carAhead: 26,   // the sweeper
    crateW: 12, crateS: 11,
    stun: 45, iframes: 120, lives: 3, sparePapers: 6,
    // Engine switches. All normal in play; they exist ONLY so
    // `papercheck --mutate` can prove each rule load-bearing.
    leanGate: true,                        // you must LEAN to throw that way
    dogLunge: true,                        // dogs actually leave the kerb
    carSweep: true,                        // the road behind a cart's front is closed
    crashReset: true,                      // a crash resets the streak
}

export const dStep = (s, i) => s.houseBase + i * s.houseStep
export const houseList = (stage) => {
    const out = []
    for (let i = 0; i < stage.houses.length; i++) {
        const c = stage.houses[i]
        if (c === ' ') continue
        out.push({ s: dStep(stage, i), side: c === 'L' ? -1 : 1 })
    }
    return out
}

const hash = (str) => {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

// Everything the future can depend on. Two identical scripts must produce
// identical hashes at every tick; a dropped input must not.
export function stateHash(g) {
    let s = `${g.tick}|${g.si}|${g.s}|${g.x}|${g.pedal}|${g.lives}|${g.score}|${g.streak}|${g.papers}|${g.delivered}|${g.missed}|${g.leaned}|${g.scared}|${g.stun}|${g.inv}|${g.end}`
    for (const d of g.dogs) s += `|d${d.s0},${d.side},${d.tL ?? -1},${d.x.toFixed(2)},${d.gone ? 1 : 0},${d.vx}`
    for (const f of g.flights) s += `|f${f.x.toFixed(2)},${f.s.toFixed(2)},${f.side},${f.fwd ? 1 : 0},${f.s0.toFixed(2)}`
    for (const h of g.houses) s += h.done ? 'D' : '.'
    for (const c of g.crossings) s += `|c${c.launched.length},${c.nextL}`
    return hash(s)
}

function loadStage(g, i) {
    const st = STAGES[i]
    g.si = i
    g.s = 0
    g.x = 0
    g.pedal = 1
    g.stun = 0
    g.inv = 150                               // a breath of grace at every stage start
    g.papers = st.houseCount + CFG.sparePapers
    g.houses = houseList(st).map((h) => ({ ...h, done: false }))
    g.crates = st.crates.map((c) => ({ ...c }))
    g.dogs = st.dogs.map((d) => ({ ...d, tL: null, x: d.side * 60, gone: false, vx: 0 }))
    g.crossings = st.crossings.map((c) => ({ ...c, launched: [], nextL: c.ph }))
    g.flights = []
}

export function makeGame(stageIdx = 0) {
    const g = {
        tick: 0,
        si: -1,
        s: 0, x: 0, pedal: 1,
        lives: CFG.lives,
        score: 0, streak: 0, best: 0,
        papers: 0, delivered: 0, missed: 0, leaned: 0, scared: 0,
        totalHouses: STAGES.reduce((n, st) => n + st.houseCount, 0),
        stun: 0, inv: 0,
        end: null, win: false,
        houses: [], crates: [], dogs: [], crossings: [], flights: [],
        cmds: [], events: [],
    }
    loadStage(g, stageIdx)
    return g
}

// The cross-cart sweep, shared by the sim AND the planner so the planner's
// "blocked" is exactly what the boy would have felt. A cart launched from
// side `from` enters the road at |x| = 84; the road it has SWEPT — from its
// rear edge to `carAhead` px past its front — is closed, because a cart
// (carSpd) is faster than handlebars (STEER): you never beat a cart that is
// already beside your lane.
// A cart enters the road at |x| = 84 on side `from` and drives TOWARD the far
// side; it lives while |x| <= 84 — one full sweep of the street.
export const cartAt = (c, t, t0) => c.from * (84 - (t - t0) * CFG.carSpd)
export function sweepBlock(xc, from) {
    const mv = from < 0                                  // moving right
    const back = mv ? xc - CFG.carW - 4 : xc + CFG.carW + 4
    const head = mv ? xc + CFG.carW + 4 + CFG.carAhead : xc - CFG.carW - 4 - CFG.carAhead
    return mv ? [back, head] : [head, back]
}

export function push(g, e) { if (!g.search) g.events.push(e) }

function crash(g, what) {
    if (g.inv > 0 || g.stun > 0 || g.end) return
    g.lives--
    if (CFG.crashReset) g.streak = 0
    g.stun = CFG.stun
    g.inv = CFG.iframes
    g.s += 16                    // spill PAST the thing that took the life
    g.x = Math.max(-40, Math.min(40, g.x))
    push(g, { type: 'crash', what, s: g.s, lives: g.lives })
    if (g.lives <= 0) { g.end = 'dead'; push(g, { type: 'dead' }) }
}

// One tick. inp = { steer: -1|0|1, pedal: 0|1|2, throw: null|-1|1|2 }
export function step(g, inp = {}) {
    if (g.end) return
    g.tick++
    g.cmds.push({ t: g.tick, i: inp })
    if (g.inv > 0) g.inv--

    g.pedal = inp.pedal === 0 || inp.pedal === 2 ? inp.pedal : 1
    if (g.stun > 0) { g.stun-- } else { g.s += PEDAL[g.pedal] }

    // cross-cart launches (pure function of the tick — periodic traffic)
    for (const c of g.crossings) {
        while (c.nextL < g.tick + 400) {           // launch a hair early: it walks in from off-road
            if (c.nextL >= g.tick) c.launched.push(c.nextL)
            c.nextL += c.P
            if (c.launched.length > 8) c.launched.shift()
        }
        // NOTE: nextL is advanced into the future for planning convenience;
        // only launches <= tick may actually exist on the road (checked below).
    }

    // dogs: the lunge is triggered by YOUR forward position
    for (const d of g.dogs) {
        if (d.gone) { d.x += d.vx; continue }
        if (d.tL === null) {
            if (CFG.dogLunge && g.s >= d.s0 - CFG.dogR && g.s < d.s0 + 30) {
                d.tL = g.tick
                push(g, { type: 'lunge', s: d.s0, side: d.side })
            }
        } else {
            const k = Math.min(g.tick - d.tL, CFG.dogTicks)
            d.x = d.side * (60 - CFG.dogSpd * k)
        }
    }

    // the handlebars: bang-bang, exactly STEER per tick
    if (g.stun <= 0) g.x = Math.max(-XMAX, Math.min(XMAX, g.x + (inp.steer || 0) * CFG.steer))

    // throws
    if (inp.throw === -1 || inp.throw === 1 || inp.throw === 2) {
        if (g.papers <= 0) {
            push(g, { type: 'empty', t: g.tick })
        } else {
            g.papers--
            if (inp.throw === 2) {
                g.flights.push({ x: g.x, s: g.s + 10, s0: g.s + 10, side: 0, fwd: true })
            } else if (CFG.leanGate && (inp.throw < 0 ? g.x > -LEAN : g.x < LEAN)) {
                g.leaned++
                g.streak = 0
                push(g, { type: 'lean', x: g.x, side: inp.throw })
            } else {
                g.flights.push({ x: g.x, s: g.s, s0: g.s, side: inp.throw, fwd: false })
            }
        }
    }

    // papers in flight: sideways across a door, or straight down the lane
    for (let i = g.flights.length - 1; i >= 0; i--) {
        const f = g.flights[i]
        if (f.fwd) {
            f.s += 8
            for (const d of g.dogs) {
                if (d.gone) continue
                if (Math.abs(d.x - f.x) < 20 && Math.abs(d.s0 - f.s) < 10) {
                    d.gone = true
                    d.vx = (d.x >= 0 ? 1 : -1) * 3
                    g.scared++
                    g.score += 100
                    push(g, { type: 'scare', s: d.s0, x: d.x })
                    g.flights.splice(i, 1)
                    break
                }
            }
            if (g.flights[i] && f.s > g.s + 170) g.flights.splice(i, 1)
            continue
        }
        f.x += f.side * PAPERSPD
        const crossed = f.side < 0 ? f.x <= -60 : f.x >= 60
        if (!crossed) continue
        g.flights.splice(i, 1)
        const hit = g.houses.find((h) => h.side === f.side && !h.done && Math.abs(h.s - f.s0) <= CFG.wwin)
        if (hit) {
            hit.done = true
            g.delivered++
            g.streak++
            if (g.streak > g.best) g.best = g.streak
            const pts = 50 + 25 * Math.min(g.streak - 1, 4)
            g.score += pts
            push(g, { type: 'deliver', side: f.side, s: hit.s, pts, streak: g.streak })
        } else {
            g.missed++
            g.streak = 0
            push(g, { type: 'miss', side: f.side, s: f.s0 })
        }
    }

    // the sweeper: a live cart closes its swept span while it is on the road
    let hurt = false
    for (const c of g.crossings) {
        for (let k = c.launched.length - 1; k >= 0; k--) {
            const t0 = c.launched[k]
            if (t0 > g.tick) continue
            const xc = cartAt(c, g.tick, t0)
            if (Math.abs(xc) > 84) { c.launched.splice(k, 1); continue }
            if (Math.abs(c.s - g.s) < CFG.carBand) {
                // with carSweep off the cart is just a moving body; with it on,
                // the road behind the nose is closed too (you cannot out-steer it)
                const [lo, hi] = CFG.carSweep
                    ? sweepBlock(xc, c.from)
                    : [xc - CFG.carW - 4, xc + CFG.carW + 4]
                if (g.x >= lo && g.x <= hi) hurt = true
            }
        }
    }
    if (hurt) crash(g, 'cart')

    // static wreckage
    for (const c of g.crates) {
        if (Math.abs(c.s - g.s) < CFG.crateS && Math.abs(c.x - g.x) < (c.w ?? CFG.crateW) + 5) { crash(g, 'crate'); break }
    }
    // dogs on the road
    for (const d of g.dogs) {
        if (d.gone) continue
        if (Math.abs(d.s0 - g.s) < 10 && Math.abs(d.x - g.x) < CFG.dogHit) { crash(g, 'dog'); break }
    }

    // the end of the route
    if (g.s >= STAGES[g.si].len) {
        const perfect = g.delivered === g.houses.length
        const bonus = g.papers * 25 + g.lives * 100 + (perfect ? 1000 : 0)
        g.score += bonus
        push(g, { type: 'stageclear', si: g.si, bonus, perfect })
        if (g.si + 1 < STAGES.length) {
            loadStage(g, g.si + 1)
        } else {
            g.end = 'win'; g.win = true
            push(g, { type: 'win' })
        }
    }
}
