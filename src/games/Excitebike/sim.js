// EXCITEBIKE — the pure sim. `step(state, input)` is the only way time moves,
// it imports nothing but the course data, and it contains no Math.random:
// everything the browser draws and everything scripts/excitecheck.mjs audits
// comes out of this file unchanged.
//
// The physics is one rule: the bike is ALWAYS ballistic (gravity every tick,
// position integrated every tick); the ground is simply the place the
// trajectory clips. That single choice gives the whole feel for free —
// crests launch you when your accumulated climb-rate outruns gravity, whoops
// make you hop because the sine throws you, and a 40px up-step is a wall
// unless you arrive airborne — no special-cased "launch zones" anywhere.
// Lean is the other rule: airborne, pitch only answers to the rider. Land
// with the nose too far under the slope and you go over the bars; the
// autopilot rolls the REAL sim to decide its lean, exactly the lesson the
// Spy Hunter planner learned the hard way.

import { LAP, groundY, slopeAt, featureAt, rivalSpeed, track, RIVALS } from './levels.js'

export const W = 256
export const H = 240
export const GY0 = 208                     // screen y of world-height 0
export const VS = 0.92                     // world height -> screen px

export const CFG = {
    g: 0.16,                               // gravity, px/tick²
    accelHigh: 0.026,
    accelLow: 0.052,
    maxHigh: 6.2,                          // px/tick at high gear
    maxLow: 4.3,
    hotDerate: 0.68,                       // top-speed factor while overheated
    heatGain: 0.13,                        // per tick, scaled (v/max)^4 — a
                                           // sustained redline boils in ~11s
    heatCool: 0.11,
    heatBoil: 100,
    heatCoolOff: 26,                       // engine comes back below this
    jump: 3.2,                             // base jump vy — mostly speed-INDEPENDENT:
    jumpPerV: 0.18,                        // a running jump flies FARTHER, not
                                           // higher. The arcade law that makes
                                           // an up-step always recoverable:
                                           // even from a crash-restart you can
                                           // hop the wall, you just land short
                                           // and slow. A v-scaled jump makes
                                           // the step unclimbable at walking
                                           // speed — a law no policy can beat,
                                           // which is how the track-0 trap
                                           // was born.
    jumpHold: 12,                          // ticks of hang-time while held
    jumpHoldF: 0.055,
    brake: 0.06,
    grade: 0.028,                          // slope drag on ground
    mudDrag: 0.02,                         // px/tick² while rolling through
    mudKick: 0.125,                        // per pump press
    pumpBack: 0.4,                         // v floor for a mud pump to bite
    waterDrag: 0.034,
    waterStall: 2.3,                       // entering slower than this stalls
    stallFix: 92,                          // ticks stuck (pumping shortens)
    stallFixMin: 38,
    boostV: 7.45,                          // boost sets speed to at least this
    boostCool: 3.5,                        // boosts bleed engine heat
    landFwd: 0.5,                          // nose-under-slope crash threshold
    landBack: 0.72,                        // nose-over crash (endo the loop)
    landNoseHigh: 0.42,                    // tail-first but legal: scrub speed
    leanRate: 0.02,
    crashTicks: 112,
    crashMash: 3,                          // ticks shaved per A press
    crashMin: 46,
    clock: 70,                             // start clock, seconds
    lapBonus: 34,                          // seconds at the line
    laps: 2,
    count: 200,                            // ticks of 1-2-3-GO
    wallClip: 7,                           // ballistic clipping into ground
}

export const GEARS = { high: { a: CFG.accelHigh, m: CFG.maxHigh }, low: { a: CFG.accelLow, m: CFG.maxLow } }

let uid = 0

export function makeGame(trackIdx = 0, opts = {}) {
    const tr = track(trackIdx)
    const clockSec = opts.clock !== undefined ? opts.clock : CFG.clock
    return {
        id: ++uid,
        tick: 0,
        track: trackIdx,
        gear: opts.gear || 'high',
        laps: opts.laps !== undefined ? opts.laps : CFG.laps,
        lap: 1,
        x: 0,                              // px into the lap
        total: 0,                          // px of the whole race (for rank)
        v: 0,
        alt: groundY(tr.ground, 0),        // world height of the wheels
        vy: 0,
        air: false,
        airT: 0,
        pitch: 0,
        onGround: true,
        heat: 0,
        hot: false,
        jumpT: 0,
        pumpT: 0,
        stall: 0,
        crash: 0,
        crashWhy: '',
        clock: Math.round(clockSec * 60),
        boostAt: -999,
        inBand: null,
        rank: RIVALS.length + 1,
        rivals: RIVALS.map((r) => ({ ...r, d: 0 })),
        score: 0,
        end: null,
        count: opts.count !== undefined ? opts.count : CFG.count,
        prevJ: false,
        events: [],
        // slack knobs (the harness taxes these; the game never does)
        mudTax: opts.mudTax || 0,          // extra drag / weaker kicks
        heatTax: opts.heatTax || 0,        // extra heat per tick
        bonusTax: opts.bonusTax || 0,      // fewer seconds at the line
        _clockFrac: 0,
    }
}

// total distance a rival covers in one tick (they run the same terrain ease)
function rivalTick(g) {
    const tr = track(g.track)
    for (const r of g.rivals) r.d += rivalSpeed(tr, r.d, r.base)
}

export function rankOf(g) {
    let ahead = 0
    for (const r of g.rivals) if (r.d > g.total + 0.01) ahead++
    return ahead + 1
}

// landing slope a ballistic hop WOULD find at x (used only for event truth;
// the planner gets its own answer by rolling this same step())
function emit(g, e) { g.events.push(e) }

function crash(g, why) {
    g.crash = CFG.crashTicks
    g.crashWhy = why
    g.air = false
    g.vy = 0
    g.v = 0
    emit(g, { type: 'crash', why, x: g.x })
}

export function step(g, inp) {
    g.tick++
    const tr = track(g.track)
    const jEdge = !!inp.j && !g.prevJ
    g.prevJ = !!inp.j

    if (g.end) return

    // ---- countdown gate ------------------------------------------------
    if (g.count > 0) {
        g.count--
        if (g.count === 0) emit(g, { type: 'go' })
        return
    }

    // ---- clock ----------------------------------------------------------
    g._clockFrac += 1
    if (g._clockFrac >= 60) {
        g._clockFrac -= 60
        g.clock--
        if (g.clock <= 0) { g.clock = 0; g.end = 'time'; emit(g, { type: 'gameover', why: 'time' }); return }
    }

    // ---- wrecked: mash A to walk it back --------------------------------
    if (g.crash > 0) {
        g.crash--
        // mashing A walks you back — each press shaves ticks, and it must be
        // able to reach ZERO. A floor here (crashMin) used to re-arm the wreck
        // under a continuous autopilot pump, locking the bike forever.
        if (jEdge) g.crash = Math.max(0, g.crash - CFG.crashMash)
        g.v *= 0.9
        g.alt = groundY(tr.ground, g.x)
        g.pitch *= 0.8
        g.x += g.v; g.total += g.v
        if (g.crash === 0) { g.v = 1.6; g.pitch = 0; emit(g, { type: 'recover' }) }
        g.heat = Math.max(0, g.heat - CFG.heatCool * 0.5)
        rivalTick(g); g.rank = rankOf(g)
        return
    }

    // ---- stalled in the water hole ---------------------------------------
    if (g.stall > 0) {
        g.stall--
        if (jEdge) g.stall = Math.max(0, g.stall - 4)
        g.v = Math.max(0, g.v - 0.2)
        g.alt = groundY(tr.ground, g.x)
        g.onGround = true
        if (g.stall === 0) { g.v = 2.4; emit(g, { type: 'unstall' }) }
        rivalTick(g); g.rank = rankOf(g)
        return
    }

    const gear = GEARS[g.gear]
    const maxV = gear.m * (g.hot ? CFG.hotDerate : 1)

    // ---- horizontal -------------------------------------------------------
    if (!g.air) {
        if (inp.g && g.v < maxV) g.v += gear.a
        if (inp.b) g.v = Math.max(0, g.v - CFG.brake)
        if (!inp.g) g.v = Math.max(0, g.v - 0.004)
        // terrain grade
        const sl = slopeAt(tr.ground, g.x)
        g.v = Math.max(0, g.v - sl * CFG.grade)
        // bands
        const band = featureAt(tr, g.x)
        g.inBand = band ? band.kind : null
        if (band && band.kind === 'mud') {
            g.v = Math.max(0, g.v - (CFG.mudDrag + g.mudTax))
            if (g.pumpT > 0 && g.v > CFG.pumpBack) g.v += CFG.mudKick - g.mudTax * 2
        } else if (band && band.kind === 'water') {
            g.v = Math.max(0, g.v - (CFG.waterDrag + g.mudTax * 1.5))
            if (g.pumpT > 0 && g.v > CFG.pumpBack) g.v += CFG.mudKick - g.mudTax * 2
            if (g.v < CFG.waterStall && g.v > 0.4) {
                g.stall = CFG.stallFix
                g.v = 0
                emit(g, { type: 'stall', x: g.x })
            }
        } else if (band && band.kind === 'boost') {
            if (g.v < CFG.boostV) {
                if (g.boostAt < g.x - LAP / 2) { g.score += 250; emit(g, { type: 'boost', pts: 250, x: g.x }) }
                g.boostAt = g.x
                g.v = Math.max(g.v, CFG.boostV)
                g.heat = Math.max(0, g.heat - CFG.boostCool)
            }
        }
        // the engine has a limiter: everything above the gear's ceiling
        // (a boost that outlived its arrows, a downhill that ran away)
        // bleeds back off once the bike is back on honest ground. Without
        // this the boost leaks through the whole lap and the heat ledger
        // (which reads v/maxV) never boils.
        if ((!band || band.kind !== 'boost') && g.v > maxV) g.v = Math.max(maxV, g.v - 0.03)
    } else if (inp.b) {
        g.v = Math.max(0, g.v - CFG.brake * 0.3)
    }
    g.v = Math.min(g.v, CFG.boostV + 0.1)
    if (g.pumpT > 0) g.pumpT--
    if (jEdge && g.onGround && !g.air) {
        // the jump — and the pump on mud/water
        const band = featureAt(tr, g.x)
        if (band && (band.kind === 'mud' || band.kind === 'water') && g.v <= CFG.maxLow + 1.5) {
            g.pumpT = 6
        } else if (g.v > 0.4) {
            g.air = true
            g.vy = CFG.jump + CFG.jumpPerV * g.v
            g.jumpT = CFG.jumpHold
            g.onGround = false
        }
    } else if (jEdge && g.air && g.jumpT > 0) {
        g.jumpT = CFG.jumpHold          // holding jump in early air hangs longer
    }

    // ---- heat -------------------------------------------------------------
    if (!g.air) {
        const r = Math.min(1, g.v / maxV)
        if (inp.g && !g.hot && r > 0.55) g.heat += CFG.heatGain * Math.pow(r, 4) + g.heatTax * 0.02
        else g.heat = Math.max(0, g.heat - CFG.heatCool * (inp.g ? 0.4 : 1))
        if (g.heat >= CFG.heatBoil) { g.hot = true; emit(g, { type: 'overheat' }) }
        if (g.hot && g.heat <= CFG.heatCoolOff) { g.hot = false; emit(g, { type: 'cooled' }) }
    } else {
        g.heat = Math.max(0, g.heat - CFG.heatCool * 0.5)
    }

    // ---- always-ballistic integrate ----------------------------------------
    // holding A through the rise weakens gravity (the NES "hold for float");
    // lean answers only in the air — on the ground U is gas and D is brake
    const prevX = g.x
    g.x += g.v
    g.total += g.v
    const hang = g.air && g.jumpT > 0 && g.vy > 0 && inp.j
    g.vy -= hang ? CFG.g * 0.55 : CFG.g
    if (g.air) {
        if (inp.u) g.pitch += CFG.leanRate
        if (inp.d) g.pitch -= CFG.leanRate
        if (g.jumpT > 0) g.jumpT--
    }
    const ny = g.alt + g.vy
    const gy = groundY(tr.ground, g.x)

    // A rider keeps the bike roughly level in the air: with no U/D input the
    // pitch eases toward the slope it is about to meet, so a clean hop lands
    // clean. Actively leaning (U/D) overrides this — throw the bike too far
    // and land on the nose and you still go over the bars. This is the
    // difference between an unforgivable bug and the arcade's own feel.
    if (g.air && !inp.u && !inp.d) {
        const want = Math.atan(slopeAt(tr.ground, g.x + Math.max(8, g.v * 6)))
        g.pitch += (want - g.pitch) * 0.16
    }

    if (ny >= gy) {
        // still (or newly) airborne
        if (!g.air) {
            g.air = true
            g.airT = 0
        }
        g.alt = ny
        g.airT++
    } else {
        // trajectory hit the ground — landing, or clipping a wall
        if (ny < gy - CFG.wallClip && g.v > 0) {
            // wall: the step slammed into. Speed decides survive vs wipeout,
            // and either way the bike is knocked BACK — the arcade never
            // leaves you pinned at the foot of a wall with no runway to
            // rev and try the jump again.
            g.x = prevX
            g.alt = groundY(tr.ground, prevX)
            const knock = Math.min(230, 14 + g.v * 38)
            g.x = Math.max(2, prevX - knock)
            g.alt = groundY(tr.ground, g.x)
            if (g.v < 2.6) {
                crash(g, 'wall')
            } else {
                g.v *= 0.28
                emit(g, { type: 'slam', x: g.x })
            }
        } else {
            const sl = slopeAt(tr.ground, g.x)
            const slopeA = Math.atan(sl)
            const err = g.pitch - slopeA
            if (err < -CFG.landFwd || err > CFG.landBack) {
                crash(g, err < 0 ? 'forward' : 'backward')
                g.alt = gy
            } else {
                if (g.air) {
                    // a real landing
                    if (g.airT >= 40) {
                        const pts = 100 + Math.floor((g.airT - 40) / 10) * 50
                        g.score += pts
                        emit(g, { type: 'air', pts, t: g.airT, x: g.x })
                    }
                    if (err > CFG.landNoseHigh) {
                        g.v *= 0.88
                        emit(g, { type: 'nosehigh', x: g.x })
                    }
                    g.pitch = slopeA
                }
                g.alt = gy
                g.air = false
                g.airT = 0
                g.vy = 0
                g.onGround = true
            }
        }
    }

    // pitch tracks the ground while rolling
    if (!g.air && g.crash === 0) {
        const want = Math.atan(slopeAt(tr.ground, g.x))
        g.pitch += (want - g.pitch) * 0.25
    }

    // ---- lap line ---------------------------------------------------------
    if (g.x >= LAP) {
        g.x -= LAP
        g.boostAt = -999
        if (g.lap >= g.laps) {
            const rank = rankOf(g)
            g.score += 1000 + Math.max(0, (6 - rank) * 1000) + 2500
            g.end = 'win'
            emit(g, { type: 'finish', rank, pts: 1000 + Math.max(0, (6 - rank) * 1000) + 2500 })
        } else {
            g.lap++
            const bonus = Math.max(8, CFG.lapBonus - g.bonusTax)
            g.clock += bonus * 60
            g.score += 1000
            emit(g, { type: 'lap', lap: g.lap, bonus, pts: 1000 })
        }
    }

    rivalTick(g)
    g.rank = rankOf(g)
}

export function stateHash(g) {
    const f = [g.x, g.v, g.alt, g.pitch, g.heat, g.clock, g.score, g.total, g.rank]
    let h = 2166136261
    for (const n of f) {
        const s = Math.round(n * 1000)
        h ^= s & 0xff; h = Math.imul(h, 16777619)
        h ^= (s >>> 8) & 0xff; h = Math.imul(h, 16777619)
        h ^= (s >>> 16) & 0xff; h = Math.imul(h, 16777619)
    }
    h ^= g.tick; h = Math.imul(h, 16777619)
    return (h >>> 0).toString(16)
}
