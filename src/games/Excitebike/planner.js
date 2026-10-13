// EXCITEBIKE — the autopilot. The attract demo is this file's output replayed
// tick-for-tick, and scripts/excitecheck.mjs grades the SAME call, so the
// demo you watch is the proof, not a story about the proof.
//
// Every decision is made by ROLLING THE REAL SIM forward (the Spy Hunter
// lesson: a hand-drawn "threat ring" lost to the real box twice). On the
// ground it picks the candidate that carries the bike farthest in ~45 ticks
// while dodging crashes, stalls and cooked engines; in the air it picks the
// lean (nose up / neutral / nose down) that survives the landing. Nothing is
// hard-coded to a specific ramp — it discovers the jumps by driving them.

import { makeGame, step, CFG } from './sim.js'
import { LAP, groundY, featureAt, track } from './levels.js'

const H = 48                    // lookahead, ticks
const EVERY = 2                 // replan every N ticks (odd ticks are carried)

// score a rollout: how far it got, minus every way the course hurts you.
function score(g) {
    let s = g.total
    if (g.crash > 0) s -= 14000
    if (g.stall > 0) s -= 9000
    if (g.hot) s -= 40
    s -= g.heat * 3
    if (g.end === 'win') s += 999999
    if (g.end === 'time') s -= 888888
    return s
}

// is there a launch (convex lip or up-step) within d px ahead?
function lipAhead(tr, x, span) {
    for (let d = 6; d < span; d += 4) {
        const here = groundY(tr.ground, x + d)
        const after = groundY(tr.ground, x + d + 8)
        if (here - groundY(tr.ground, x + d - 6) > 3 && here - after > 5) return d
    }
    return -1
}

// decide one input for a given live state (also drives DebugKit's PROGNOSIS)
export function decide(g, mem) {
    const tr = track(g.track)
    const x = g.x
    const band = featureAt(tr, x)
    const inp = { g: false, b: false, u: false, d: false, j: false }

    if (g.crash > 0 || g.stall > 0) { inp.j = (mem.pump = (mem.pump + 1) % 2) === 0; return inp }

    if (g.air) {
        // pick the lean that survives the landing: roll the real sim forward
        // until the bike TOUCHES DOWN (a rollout that ends mid-air scores a
        // crash that happens two ticks later as a win — that is how nose-down
        // landings crept into the demo), then prefer the calmest survival.
        let best = null
        for (const lean of ['u', 'n', 'd']) {
            const c = structuredClone(g)
            for (let k = 0; k < 70 && c.air && !c.crash && !c.end; k++) {
                step(c, { u: lean === 'u', d: lean === 'd' })
            }
            const s = (c.crash > 0 || c.end) ? -1e6 : 1e6 - Math.abs(c.pitch)
            if (best === null || s > best.s) best = { lean, s }
        }
        inp.u = best.lean === 'u'; inp.d = best.lean === 'd'
        return inp
    }

    // on the ground: pump mud/water with a tapped jump
    if (band && (band.kind === 'mud' || band.kind === 'water')) {
        inp.g = g.v < CFG.boostV
        inp.j = (mem.pump = (mem.pump + 1) % 2) === 0
        return inp
    }

    // otherwise choose among gas / gas+brake-before-a-climb / jump-now.
    // The horizon stretches when the bike is slow: a fixed 48-tick look at
    // walking speed ends BEFORE the wall, and the rollout can neither see
    // the slam it must avoid nor the acceleration that clears it. The
    // lesson from the harness: trust the rollout — a smuggled preference
    // ("nudge it to hop when a lip is near") manufactured a trap where the
    // bike hopped impotently in front of the wall forever.
    const Hh = Math.max(H, Math.round(150 / Math.max(1.2, g.v)) + 26)
    const lip = lipAhead(tr, x, 60)
    void lip
    const opts = []
    opts.push({ g: true })
    opts.push({ g: true, j: true })                       // hop now
    if (g.v > CFG.maxHigh * 0.7) opts.push({ g: true, b: true })   // lift off the gas into heat
    const cand = opts.map((o) => ({ ...inp, ...o }))
    let best = null
    for (const c of cand) {
        const st = structuredClone(g)
        for (let k = 0; k < Hh; k++) {
            step(st, { ...c, j: k === 0 && c.j })
            if (st.end) break
        }
        const s = score(st)
        if (best === null || s > best.s) best = { s, inp: c }
    }
    return best.inp
}

// roll a full race with the autopilot, recording the input script.
// opts pass straight through to makeGame so the slack rule can tax it:
// { laps, clock, bonusTax, mudTax, heatTax, gear }.
export function plan(opts = {}) {
    const g = makeGame(opts.track || 0, opts)
    const script = []
    const mem = { pump: 0 }
    const receipts = { crashes: 0, stalls: 0, airs: 0, boosts: 0, pumps: 0 }
    const onEvent = opts.onEvent || (() => {})
    let guard = 0
    const maxTicks = (opts.maxTicks || 12000)
    const keep = opts.record !== false

    while (!g.end && guard++ < maxTicks) {
        // the countdown is scripted empty; inputs start at GO
        if (g.count > 0) { const i = {}; script.push(i); step(g, i); continue }
        const inp = (g.tick % EVERY === 0) ? decide(g, mem) : (keep ? script[script.length - 1] : {})
        if (keep) script.push(inp)
        const wasAir = g.air
        step(g, inp)
        for (const e of g.events) {
            if (e.type === 'crash') receipts.crashes++
            else if (e.type === 'stall') receipts.stalls++
            else if (e.type === 'air') receipts.airs++
            else if (e.type === 'boost') receipts.boosts++
            onEvent(e)
        }
        if (inp.j && wasAir === false && g.pumpT > 0) receipts.pumps++
        g.events.length = 0
    }
    if (keep) while (keep && script.length < g.tick) script.push({})

    return {
        ok: g.end === 'win' && g.rank === 1,
        rank: g.rank,
        end: g.end,
        ticks: g.tick,
        game: g,
        script,
        receipts,
    }
}
