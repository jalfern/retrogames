// PAPERBOY — the route solver. A grid DP over (tick, x-slot) through the SAME
// blocked-geometry the sim uses (sweepBlock / the crate / dog / cart rules
// below are derived from CFG and levels.js only), so what the planner proves
// dodgeable IS dodgeable. It exploits the one honest fact of a scripted world:
// at a FIXED pedal the whole world is a pure timeline — s = v·t, every cart,
// dog and crate at an exact x for every tick.
//
// The DP keeps the reachable set of x-slots per tick (bang-bang steering =
// ±3 grid steps), blocks the interval every hazard would punish at that tick,
// and CONSTRAINS the set at each house's chosen throw tick to the lean side
// — that is the difference between "reachable" and "deliverable". Solved
// scripts are replayed through the real step() by papercheck; a planner that
// lies about geometry cannot survive that witness.

import { CFG, G, XMAX, PEDAL, STEER, cartAt, sweepBlock, houseList, makeGame, step } from './sim.js'
import { STAGES } from './levels.js'

const N = Math.round((2 * XMAX) / G) + 1     // 161 slots, -64..64 step 0.8
const SLOT0 = (N - 1) / 2                     // slot of x=0
const D = Math.round(STEER / G)               // 3 slots per tick

// one tick of blocked intervals in the DP's paranoid frame (padded a hair past
// the sim's hitboxes so the DP never promises a slot the sim might take)
function blocksAt(stage, v, t, t0, pad) {
    const s = v * t
    const out = []
    for (const c of stage.crates) {
        if (Math.abs(c.s - s) < CFG.crateS + pad) {
            const w = (c.w ?? CFG.crateW) + 5 + pad
            out.push([c.x - w, c.x + w])
        }
    }
    for (const d of stage.dogs) {
        if (Math.abs(d.s0 - s) >= 10 + pad) continue
        if (!CFG.dogLunge) { out.push([d.side * 60 - 9 - pad, d.side * 60 + 9 + pad]); continue }
        const tL = Math.ceil((d.s0 - CFG.dogR) / v)          // s-driven, like the sim
        if (t < tL) continue
        const k = Math.min(t - tL, CFG.dogTicks)
        const xd = d.side * (60 - CFG.dogSpd * k)
        out.push([xd - 9 - pad, xd + 9 + pad])
    }
    for (const c of stage.crossings) {
        // launches anchored to ph on the absolute tick grid (like the sim):
        // first launch at or after local time 0
        const tl = ((c.ph - t0) % c.P + c.P) % c.P
        for (let L = tl; L <= t; L += c.P) {
            const xc = cartAt(c, t, L)                        // local time is launch-invariant
            if (Math.abs(xc) > 84) continue
            if (Math.abs(c.s - s) < CFG.carBand + pad) {
                const [lo, hi] = sweepBlock(xc, c.from)
                out.push([lo - pad, hi + pad])
            }
        }
    }
    return out
}

// fixed pedal v, stage solved in LOCAL ticks (t0 = absolute tick the stage
// starts at, so cross-cart phase matches the chained game exactly)
export function solveStage(si, { v = PEDAL[1], t0 = 0, wwin = CFG.wwin } = {}) {
    const stage = STAGES[si]
    const houses = houseList(stage)
    const tEnd = Math.ceil(stage.len / v)

    // candidate throw ticks per house, centre-first (bumped on retry)
    const cand = houses.map((h) => {
        const lo = Math.max(1, Math.ceil((h.s - wwin) / v))
        const hi = Math.min(tEnd - 1, Math.floor((h.s + wwin) / v))
        const list = []
        for (let t = lo; t <= hi; t++) list.push(t)
        list.sort((a, b) => Math.abs(a - (lo + hi) / 2) - Math.abs(b - (lo + hi) / 2))
        return list
    })
    const pick = houses.map(() => 0)

    const reach = new Uint8Array(N)
    const next = new Uint8Array(N)
    const mask = new Uint8Array(N)
    const path = new Uint8Array((tEnd + 1) * N)

    for (let attempt = 0; attempt < 60; attempt++) {
        const throwAt = new Int32Array(houses.length).fill(-1)
        const thrown = new Set()
        reach.fill(0)
        reach[SLOT0] = 1
        let failHouse = -1

        for (let t = 1; t <= tEnd; t++) {
            mask.fill(0)
            for (const [lo, hi] of blocksAt(stage, v, t, t0, 0.35)) {
                const ja = Math.max(0, Math.ceil((lo + XMAX) / G))
                const jb = Math.min(N - 1, Math.floor((hi + XMAX) / G))
                for (let j = ja; j <= jb; j++) mask[j] = 1
            }
            next.fill(0)
            for (let j = 0; j < N; j++) {
                if (mask[j]) continue
                let p = -1
                if (j - D >= 0 && reach[j - D]) p = j - D
                else if (reach[j]) p = j
                else if (j + D < N && reach[j + D]) p = j + D
                if (p >= 0) { next[j] = 1; path[t * N + j] = p }
            }
            // house constraint at this tick?
            for (let hi = 0; hi < houses.length; hi++) {
                if (thrown.has(hi)) continue
                const cs = cand[hi]
                if (!cs.length || t !== cs[pick[hi]]) continue
                // THE ONE-TRUE EDGE: j 72 is x=-6.0, j 88 is x=+6.0, and the
                // sim's lean gate (x > -6 refuses left, x < +6 refuses right)
                // keeps EXACTLY those slots. Braces here are not cosmetics:
                // an `if (...) for (...) if (...) x++` / `else` chain dangles
                // the else onto the wrong if and the count silently lies.
                let cnt = 0
                const jA = houses[hi].side < 0 ? 0 : 88
                const jB = houses[hi].side < 0 ? 72 : N - 1
                for (let j = jA; j <= jB; j++) { if (next[j]) cnt++ }
                if (cnt === 0) continue                        // try another tick next attempt
                thrown.add(hi)
                throwAt[hi] = t
                if (houses[hi].side < 0) { for (let j = 73; j < N; j++) next[j] = 0 }
                else { for (let j = 0; j <= 87; j++) next[j] = 0 }
            }
            const any = next.some((r) => r)
            if (!any) {
                failHouse = hiLeft(thrown, throwAt)
                break
            }
            reach.set(next)
        }
        if (thrown.size === houses.length) {
            return extract(stage, houses, throwAt, path, reach, v, tEnd, t0)
        }
        failHouse = failHouse >= 0 ? failHouse : hiLeft(thrown, throwAt)
        if (failHouse < 0) return { ok: false, why: 'no reachable route' }
        // bump the earliest missing house's candidate tick and retry
        let bumped = false
        for (let hi = 0; hi < houses.length; hi++) {
            if (thrown.has(hi)) continue
            if (pick[hi] + 1 < cand[hi].length) { pick[hi]++; bumped = true }
            break
        }
        if (!bumped) {
            // widen: bump the LAST thrown house one slot outward (its tick may
            // have cornered the route)
            for (let hi = houses.length - 1; hi >= 0; hi--) {
                if (thrown.has(hi) && pick[hi] + 1 < cand[hi].length) { pick[hi]++; bumped = true; break }
            }
        }
        if (!bumped) return { ok: false, why: `window starved at house ${failHouse} (s=${houses[failHouse]?.s})` }
    }
    const starve = houses.findIndex((h, i) => throwMissing(pick, cand, i))
    return { ok: false, why: `retries exhausted (house ${starve} s=${houses[starve]?.s} pick=${pick[starve]}/${cand[starve]?.length})` }
}
const throwMissing = (pick, cand, i) => pick[i] >= cand[i].length

function hiLeft(thrown, throwAt) {
    for (let i = 0; i < throwAt.length; i++) if (throwAt[i] < 0 && !thrown.has(i)) return i
    for (let i = 0; i < throwAt.length; i++) if (!thrown.has(i)) return i
    return -1
}

function extract(stage, houses, throwAt, path, reach, v, tEnd, t0) {
    let j = -1
    for (let k = 0; k < N && j < 0; k++) {
        if (SLOT0 + k < N && reach[SLOT0 + k]) j = SLOT0 + k
        else if (SLOT0 - k >= 0 && reach[SLOT0 - k]) j = SLOT0 - k
    }
    if (j < 0) return { ok: false, why: 'end state unreachable' }
    const px = new Int16Array(tEnd + 1)
    let cur = j
    for (let t = tEnd; t >= 1; t--) { px[t] = cur; cur = path[t * N + cur] }
    px[0] = cur
    const script = []
    const throws = new Map()
    houses.forEach((h, i) => throws.set(throwAt[i], h.side))
    for (let t = 1; t <= tEnd; t++) {
        const dx = px[t] - px[t - 1]
        const steer = dx > 0 ? 1 : dx < 0 ? -1 : 0
        const inp = { steer, pedal: v === PEDAL[2] ? 2 : v === PEDAL[0] ? 0 : 1 }
        if (throws.has(t)) inp.throw = throws.get(t)
        script.push(inp)
    }
    return { ok: true, script, tEnd, t0, throws: houses.length }
}

// Replay a solved script through the REAL sim. The DP may model geometry;
// step() is the law. Returns receipts; papercheck refuses to believe a solve
// the DP does not honour (zero crashes, every door, every paper accounted).
// `g` lets a caller thread the chained game (stage 1 continuing from stage 0)
// through; otherwise a fresh game on this stage is made.
export function replay(si, solved, { wwin = CFG.wwin, g = null, expectDelivered } = {}) {
    const stage = STAGES[si]
    const own = !g
    if (own) g = makeGame(si)
    const saveW = CFG.wwin
    CFG.wwin = wwin
    let crashes = 0
    const d0 = g.delivered
    for (let t = 0; t < solved.script.length && !g.end; t++) {
        step(g, solved.script[t])
        for (const e of g.events) if (e.type === 'crash') crashes++
        g.events.length = 0
    }
    CFG.wwin = saveW
    const delivered = g.delivered - d0
    const want = expectDelivered ?? stage.houseCount
    return {
        ok: delivered >= want && crashes === 0,
        delivered, crashes, papersLeft: g.papers, missed: g.missed,
        leaned: g.leaned, score: g.score, end: g.end, si: g.si, s: g.s,
    }
}

// Solve the WHOLE game (three chained stages) at one pedal, and prove it by
// replaying the stitched script through one continuous makeGame(0). This is
// the attract demo's witness AND papercheck's proven run.
export function solveGame({ v = PEDAL[1], wwin = CFG.wwin } = {}) {
    const scripts = []
    let t0 = 0
    for (let si = 0; si < STAGES.length; si++) {
        const s = solveStage(si, { v, t0, wwin })
        if (!s.ok) return { ok: false, why: `stage ${si}: ${s.why}` }
        scripts.push({ si, t0, script: s.script, tEnd: s.tEnd })
        t0 += s.tEnd
    }
    // one continuous run to the win — THE witness. (Per-stage receipts come
    // from snapshots of this run: a stage script solved with a t0 phase can
    // only be replayed inside the chained game, never in a fresh tick-0 one.)
    const g = makeGame(0)
    const saveW = CFG.wwin
    CFG.wwin = wwin
    const flat = []
    for (const part of scripts) for (const inp of part.script) flat.push(inp)
    let t = 0, crashes = 0
    const receipts = scripts.map((part) => ({ si: part.si, delivered: 0, score: 0 }))
    let lastSi = 0, seen = 0, tPrev = 0
    while (!g.end && t < flat.length + 400) {
        step(g, flat[t] || {})
        for (const e of g.events) if (e.type === 'crash') crashes++
        g.events.length = 0
        if (g.si !== lastSi) {
            receipts[lastSi] = { si: lastSi, delivered: g.delivered - seen, crashes: 0, tStart: tPrev, tEnd: t }
            seen = g.delivered; tPrev = t; lastSi = g.si
        }
        t++
    }
    receipts[lastSi] = { si: lastSi, delivered: g.delivered - seen, crashes: 0, tStart: tPrev, tEnd: t }
    CFG.wwin = saveW
    const total = STAGES.reduce((n, st) => n + st.houseCount, 0)
    const ok = g.end === 'win' && g.delivered === total && crashes === 0
    return { ok, g, script: flat, crashes, delivered: g.delivered, total, score: g.score, receipts }
}
