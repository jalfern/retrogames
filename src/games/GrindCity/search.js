// GRIND CITY — the thinking autopilot (#3394).
//
// planner.js recites: fixed waypoints, fixed choreography. Honest, proven — and
// exactly the gap #3394 names: it shows the park is winnable, not that the
// trick system is deep. This module THINKS instead: at every trick decision it
// pushes candidate press-schedules through the REAL sim (sim.step — the same
// pure physics the player rides), scores what actually happens, and commits the
// best schedule it found. The route stays a route (drive() mirrors planner's
// steering, pump and grind balance — route knowledge is earned human line, not
// choreography); what the search owns is WHEN to pop, grab, flip, pump and
// manual. Same approach state ⇒ same chosen schedule: planning is a pure
// function of the sim state, so attract stays deterministic end to end.
//
// The witness line (planner v0) is untouched — grindcheck still grades exactly
// that bot. This is style v3, the fourth attract loop's rider.

import { step, unpackIn } from './sim.js'
import { WP } from './planner.js'

/** Full copy of a live sim state — every field sim.step mutates. Rollouts
 *  mutate clones only; grindcheck pins that a search never touches the live
 *  board (a rollout that leaks is a save-scum on the attract). */
export function cloneSim(s) {
    const c = { ...s }
    c.letters = { ...s.letters }
    c.goalsDone = { ...s.goalsDone }
    c.chain = s.chain.slice()
    c.events = []
    c.grind = s.grind ? { ...s.grind } : null
    c.stall = s.stall ? { ...s.stall } : null
    c.manual = s.manual ? { ...s.manual } : null
    c.airTrick = s.airTrick ? { ...s.airTrick } : null
    c.stats = { ...s.stats }
    return c
}

export function makeSearchBot(start = {}) {
    return {
        thinks: true,
        i: start.i ?? 0, cool: 0, rc: 0, nSearch: 0, nCommit: 0,
        wasAir: false, wasGrind: false,
        sched: null, sc: 0,          // committed overlay words
        mDone: false, rDone: false, cDone: false, gDone: false,
    }
}

// Route/pump/balance driving — mirrors planner's non-choreography rules on
// RAW state fields (planner reads its rounded JSON view; the searcher works
// at full precision because it also rolls the clone forward).
export function drive(s, bot) {
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    if (s.phase !== 'play') return pad
    if (s.grind) {
        if (s.grind.bal > 0.12) pad.left = true
        if (s.grind.bal < -0.12) pad.right = true
        bot.wasAir = false
        bot.wasGrind = true
        return pad
    }
    if (bot.wasGrind && !s.grind) { bot.wasGrind = false; if (bot.i === 7) bot.i = 8 }
    if (s.x <= -43.5 && Math.cos(s.heading) < -0.05) {
        pad.right = true
        if (s.lastSlope > 0.18 && !s.air) pad.b = true
        return pad
    }
    if (bot.i === 5 && s.x < -30 && Math.cos(s.heading) > 0.2) bot.i = 6
    if (bot.i < WP.length) {
        const w = WP[bot.i]
        if (Math.hypot(s.x - w.x, s.z - w.z) < w.r) bot.i++
        const err = Math.atan2(w.z - s.z, w.x - s.x) - s.heading
        const e = ((err + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
        const st = Math.max(-1, Math.min(1, e * 2.6))
        if (st > 0.12) pad.right = true
        if (st < -0.12) pad.left = true
    }
    if (s.lastSlope > 0.18 && s.speed < 10 && !s.air) pad.b = true
    if (bot.cool > 0) bot.cool--
    return pad
}

// ── candidate schedules ────────────────────────────────────────────────────
// Words are packIn layouts (a=16, b=32) so merge/rollback is one number.
const popSched = (off, grab, flip) => {
    const w = []
    for (let t = 0; t < off; t++) w.push(0)
    w.push(16)                       // ollie (A edge)
    w.push(0, 0)                     // release — the grab needs its own edge
    if (grab) for (let t = 0; t < 24; t++) w.push(16)
    w.push(0)
    if (flip) { w.push(0, 0, 32, 0) }   // flip tap mid-air
    return w
}
const manualSched = (off, hold) => {
    const w = []
    for (let t = 0; t < off; t++) w.push(0)
    for (let t = 0; t < hold; t++) w.push(16)
    return w
}

// kind → { candidates: word[][], horizon, grace } . Order matters: the scan
// is first-max (ties fall to the EARLIER candidate) so the choice is stable.
function candidates(s, bot) {
    // Window starts at z 1.6 — the kicker's usable face. A pop off the lower
    // slope (z<1.5) flies flat into the trench (measured: lands at z≈9 short
    // of the far lip, stalls in the hole). The offsets then search up the
    // lip so the searched line keeps the letter-E approach the witness rides.
    if (bot.i === 2 && !s.air && !s.grind && !s.manual && s.z > 1.6 && s.z < 3.6 && s.speed > 3.5 && !bot.gDone) {
        const c = []
        for (const off of [0, 3, 6, 9]) { c.push(popSched(off, true, false)); c.push(popSched(off, true, true)) }
        // PROVEN AIR: a gap plan commits only if the rollout actually clears the
        // trench. A prettier-but-short pop landing in the hole is worth less
        // than waiting one more search tick on the pumping kicker face.
        return { kind: 'gap', cands: c, hz: 220, need: 'gap' }
    }
    if (bot.i === 5 && !s.air && !s.grind && !s.manual && s.x <= -41.0 && s.speed > 4 && !bot.cDone) {
        const c = []
        for (const off of [0, 2, 4, 6]) { c.push(popSched(off, true, false)); c.push(popSched(off, true, true)) }
        c.push(popSched(2, false, false))
        return { kind: 'coping', cands: c, hz: 220 }
    }
    if (bot.i === 7 && !s.air && !s.grind && s.speed > 4 && Math.hypot(s.x - WP[7].x, s.z - WP[7].z) < 4.0 && !bot.rDone) {
        const c = []
        for (const off of [0, 2, 4, 6, 8]) c.push(popSched(off, false, false))
        // PROVEN AIR again: a rail pop commits only when the rollout LATCHES.
        return { kind: 'rail', cands: c, hz: 180, need: 'grind' }
    }
    // manual off a landing: press inside the grace window, hold, release.
    if (bot.wasAirLanded && s.manualT > 0 && !s.manual && !s.air && bot.cool === 0 && !bot.mDone) {
        bot.mDone = true
        return { kind: 'manual', cands: [manualSched(2, 25), manualSched(2, 45), manualSched(6, 40)], hz: 110 }
    }
    return null
}

// Roll one schedule through the real sim. Returns outcome facts; a bail is
// fatal (score −∞ equivalent via null), grinds end the rollout, the tail past
// the landing waits out the 0.6 s bank so banked points count honestly.
export function rollout(s0, bot0, words, hz) {
    const c = cloneSim(s0)
    const b = { ...bot0, sched: null, sc: 0 }
    const score0 = c.score
    const l0 = Object.keys(c.letters).length
    const sx = c.x, sz = c.z
    let wasAir = c.air, landed = !c.air, post = 0, ticks = 0, killed = false
    let grindHit = false, bail = false
    for (let t = 0; t < hz; t++) {
        const d = drive(c, b)
        if (c.grind) { grindHit = true; killed = true }
        if (!killed && t < words.length) {
            const w = unpackIn(words[t])
            d.a = d.a || w.a
            d.b = d.b || w.b
            d.down = d.down || w.down
        }
        step(c, d)
        ticks++
        if (c.phase === 'tumble') { bail = true; break }
        if (wasAir && !c.air && !c.grind) landed = true
        wasAir = c.air
        // U-turn letters (K) arrive ~120 ticks after a coping landing — the
        // view must be open that long or the search cannot see the law that
        // keeps the letter line (seed-7 trace: K banked at post 118).
        if (landed && !c.air && !c.grind) { post++; if (post > 150) break }
        if (grindHit) break
    }
    return {
        bail, grindHit, gap: c.gapDone,
        letters: Object.keys(c.letters).length - l0,
        pts: c.score - score0,
        disp: Math.hypot(c.x - sx, c.z - sz),
        ticks,
    }
}

// Honesty of the value law: letters gate the +2500 S-K-A-T-E goal, so a plan
// the rollout sees bank a letter is worth far more than the +50 on the tick —
// that future weight (+400) is what keeps searched air ON the letter line
// instead of clipping 1 m wide of E (found by the seed-7 trace).
const value = (r, base) => r.pts + 400 * r.letters + (r.grindHit ? 120 : 0) + 1.5 * (r.disp - (base ? base.disp : 0)) - 0.05 * r.ticks

/** One tick of the thinking bot. `s` is the RAW sim state (this drives and
 *  rolls the real sim), bot from makeSearchBot. */
export function searchPad(s, bot) {
    if (s.phase !== 'play') { bot.sched = null; bot.sc = 0; bot.wasAirLanded = false; return drive(s, bot) }
    if (s.grind || s.stall) { bot.sched = null; bot.sc = 0 }
    if (bot.rc > 0) bot.rc--

    const landedEdge = bot.wasAir && !s.air && !s.grind
    bot.wasAir = s.air
    if (landedEdge) bot.wasAirLanded = true
    if (!s.air) bot.wasAirLanded = s.manualT > 0 && !s.manual ? bot.wasAirLanded : false

    // committed schedule: overlay its words on the live drive
    if (bot.sched && bot.sc < bot.sched.length) {
        const p = drive(s, bot)
        if (!s.grind && !s.stall) {
            const w = unpackIn(bot.sched[bot.sc++])
            p.a = p.a || w.a
            p.b = p.b || w.b
            p.down = p.down || w.down
        }
        if (bot.sc >= bot.sched.length) { bot.sched = null; bot.sc = 0 }
        return p
    }

    const trig = candidates(s, bot)
    if (trig && bot.cool === 0 && bot.rc === 0) {
        bot.nSearch++
        let best = null
        const base = rollout(s, bot, [], trig.hz)
        if (!base.bail) {
            for (const words of trig.cands) {
                const r = rollout(s, bot, words, trig.hz)
                if (r.bail) continue
                if (trig.need === 'gap' && !r.gap) continue
                if (trig.need === 'grind' && !r.grindHit) continue
                const v = value(r, base)
                if (best === null || v > best.v + 1e-9) best = { v, words }
            }
            if (best && best.v > value(base, base) + 40) {
                bot.sched = best.words
                bot.sc = 0
                bot.cool = 40
                bot.rc = 0
                bot.nCommit++
                if (trig.kind === 'gap') bot.gDone = true
                if (trig.kind === 'coping') bot.cDone = true
                if (trig.kind === 'rail') bot.rDone = true
            } else {
                bot.rc = 4   // nothing worth doing yet — re-think in 4 ticks
            }
        } else {
            bot.rc = 4
        }
    }
    return drive(s, bot)
}
