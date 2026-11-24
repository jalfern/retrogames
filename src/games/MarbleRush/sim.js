// MARBLE RUSH — sim.js: the marble. Pure, seeded, 60 Hz, zero Math.random.
// The whole game is (s,u) physics on the analytic manifold in ./course.js:
// gravity rides the grade, throttle and brakes spend speed, one friction
// budget is shared between holding the curve and steering, banking tilts the
// budget, and everything you cannot hold slides you toward the sky. The floor
// you were riding has opinions about where it ends.

import {
    compileStage, moverDeck, STAGES,
    G, GRIP, ACC, BRAKE, ROLL_C, DRAG_C, STEER_ACCEL, LAT_DAMP, SLIDE_K,
    MAX_V, LAUNCH, FALL_Y, MARBLE_R,
} from './course.js'

export const SIM_MS = 1000 / 60
export const DT = 1 / 60
export const GO_DELAY = 1.0
export const STAGE_COUNT = STAGES.length

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const CACHE = []
export function courseFor(i) {
    if (!CACHE[i]) CACHE[i] = compileStage(STAGES[i])
    return CACHE[i]
}

export function makeGame(seed, stageIdx = 0) {
    const course = courseFor(stageIdx)
    return {
        seed: seed >>> 0,
        stageIdx,
        tick: 0,
        t: 0,                    // stage clock (starts at GO)
        phase: 0,              // 0..1 pre-roll
        s: 2, u: 0, v: 0, wlat: 0,
        y: 0, vy: 0, air: false,
        rolling: 0,            // wheel angle for the render (v/r integrated)
        falling: false,
        done: false,
        fail: false,
        medal: null,           // 'gold' | 'silver' | 'bronze' | 'none'
        score: 0,
        bumpCd: 0,
        events: [],
        len: course.len,
        // bumper hit bookkeeping (sim side)
        bumps: course.bumpers.map(() => 0),
    }
}

export function step(gs, pad) {
    gs.events.length = 0
    gs.tick += 1
    if (gs.done) return

    if (gs.phase < 1) {
        gs.phase += DT / GO_DELAY
        if (gs.phase >= 1) gs.events.push({ type: 'go' })
        return
    }
    gs.t += DT
    if (gs.bumpCd > 0) gs.bumpCd -= DT

    const course = courseFor(gs.stageIdx)

    // ---- the fall: no floor, no mercy --------------------------------------
    if (gs.falling) {
        gs.v *= 1 - 1.8 * DT
        gs.s += gs.v * DT
        gs.y += gs.vy * DT
        gs.vy -= G * DT
        if (gs.y < FALL_Y) {
            gs.done = true
            gs.fail = true
            gs.events.push({ type: 'die' })
        }
        return
    }

    const k = course.curvOf(gs.s)
    const grade = course.gradeOf(gs.s)
    const bank = course.bankOf(gs.s)
    const mi = course.moverAt(gs.s)
    const deck = mi >= 0 ? moverDeck(course, mi, gs.t) : { u: 0, w: course.halfWidthOf(gs.s) }
    const overGap = course.gapAt(gs.s)

    // ---- longitudinal -------------------------------------------------------
    const slopeAcc = -G * grade / Math.sqrt(1 + grade * grade)
    if (!gs.air) {
        gs.v += slopeAcc * DT
        gs.v += pad.throttle * ACC * DT
        if (pad.brake) gs.v -= BRAKE * DT
        gs.v -= gs.v * ROLL_C * DT
        gs.v -= Math.sign(gs.v) * gs.v * gs.v * DRAG_C * DT
        gs.v = clamp(gs.v, 0, MAX_V)
    } else {
        gs.v += slopeAcc * DT * 0.2
        gs.v = clamp(gs.v, 0, MAX_V)
    }

    // deck friction: a moving bridge drags the marble along with it — this is
    // what makes riding a swing bridge feel like riding it
    if (!gs.air && mi >= 0) {
        const m = course.movers[mi]
        const deckVel = m.A * m.omega * Math.cos(m.omega * gs.t + m.phase)
        gs.wlat += (deckVel - gs.wlat) * Math.min(1, 2.6 * DT)
    }

    // ---- lateral: one budget, spent by the curve first ---------------------
    gs.wlat += pad.steer * STEER_ACCEL * (gs.air ? 0.35 : 1) * DT
    const need = gs.v * gs.v * k
    const avail = G * (GRIP + (Math.sign(bank) === Math.sign(k) ? Math.sin(Math.abs(bank)) : -Math.sin(Math.abs(bank))))
    const excess = need - avail
    if (excess > 0) gs.wlat += Math.sign(k) * excess * SLIDE_K * DT
    gs.wlat -= gs.wlat * Math.min(1, LAT_DAMP * DT)

    gs.u += gs.wlat * DT
    gs.s += gs.v * DT
    gs.rolling += (gs.v / MARBLE_R) * DT

    // ---- airborne ballistics --------------------------------------------------
    if (gs.air) {
        gs.y += gs.vy * DT
        gs.vy -= G * DT
        if (gs.y <= 0) {
            if (overGap) {
                // flew too short: the sky catches you
                gs.y = 0
                gs.falling = true
                gs.vy = -1
                gs.v *= 0.4
                gs.events.push({ type: 'fall' })
            } else {
                gs.y = 0
                gs.vy = 0
                gs.air = false
                gs.v *= 0.985
                gs.events.push({ type: 'land' })
            }
        }
    }

    // ---- floor under you ------------------------------------------------------
    if (!gs.air) {
        // kicker lips launch you — resolved BEFORE the hole check, or the lip
        // that saves you and the gap behind it would kill you in one tick
        let launched = false
        for (const kick of course.kickers) {
            if (gs.s > kick.s && gs.s - gs.v * DT <= kick.s && gs.v > 6) {
                gs.air = true
                gs.vy = LAUNCH + gs.v * 0.16
                gs.y = 0.01
                gs.events.push({ type: 'jump' })
                launched = true
            }
        }
        if (!launched) {
            const onDeck = mi >= 0 && Math.abs(gs.u - deck.u) <= deck.w + MARBLE_R * 0.25
            if (overGap && !onDeck) {
                gs.falling = true
                gs.vy = -1
                gs.v *= 0.4
                gs.events.push({ type: 'fall' })
            } else if (!overGap && Math.abs(gs.u - deck.u) > deck.w + MARBLE_R * 0.25) {
                gs.falling = true
                gs.vy = 0.6
                gs.v *= 0.5
                gs.events.push({ type: 'fall' })
            }
        }
    }

    // ---- bumpers ---------------------------------------------------------------
    if (gs.bumpCd <= 0) {
        for (let bi = 0; bi < course.bumpers.length; bi++) {
            const b = course.bumpers[bi]
            const ds = Math.abs(gs.s - b.s)
            const du = gs.u - (mi >= 0 ? b.u + deck.u : b.u)
            if (ds < b.r + MARBLE_R && Math.abs(du) < b.r + MARBLE_R) {
                gs.bumps[bi] += 1
                gs.score += 50
                gs.v = clamp(gs.v * 1.18 + 1.2, 0, MAX_V)
                gs.wlat += Math.sign(du || 1) * 4.2
                gs.bumpCd = 0.45
                gs.events.push({ type: 'bumper', s: b.s })
                break
            }
        }
    }

    // ---- goal -------------------------------------------------------------------
    if (gs.s >= course.len) {
        gs.s = course.len
        gs.done = true
        gs.fail = false
        const [g, sv, bz] = course.medals
        gs.medal = gs.t <= g ? 'gold' : gs.t <= sv ? 'silver' : gs.t <= bz ? 'bronze' : 'none'
        const medalBonus = { gold: 1000, silver: 500, bronze: 250, none: 50 }[gs.medal]
        gs.score += medalBonus + Math.max(0, Math.round((course.par - gs.t) * 20))
        gs.events.push({ type: 'finish', medal: gs.medal, t: gs.t, bonus: medalBonus })
    }
}

// ---- autopilot: the same driver the attract mode shows and the check proves --
export function autoPad(gs) {
    if (gs.done || gs.falling) return { throttle: 0, steer: 0, brake: false }
    const course = courseFor(gs.stageIdx)

    // target line: center, minus bumper avoidance, plus mover decks — decks
    // are searched well ahead and aimed at their position AT the crossing,
    // or the first swing bridge throws you the moment it starts
    let uT = 0
    let miFound = -1
    let dFound = 0
    for (let d = 0; d < 26 + gs.v * 1.2; d += 2) {
        const mi = course.moverAt(Math.min(gs.len, gs.s + d))
        if (mi >= 0) { miFound = mi; dFound = d; break }
    }
    if (miFound >= 0) uT = moverDeck(course, miFound, gs.t + dFound / Math.max(4, gs.v)).u
    for (const b of course.bumpers) {
        if (b.s > gs.s && b.s < gs.s + 9 + gs.v * 0.5) {
            const side = b.u >= 0 ? -1 : 1
            const w = course.halfWidthOf(b.s)
            uT = clamp(b.u + side * (b.r + 0.9), -(w - 0.45), w - 0.45)
            break
        }
    }

    // speed target: hold the grip budget through the tightest curve ahead,
    // but commit to the throttle before a kicker — a slow marble is a lost one
    let kMax = 0
    for (let d = 2; d < 16; d += 2) kMax = Math.max(kMax, Math.abs(course.curvOf(Math.min(gs.len, gs.s + d))))
    let vLim = Math.sqrt((0.82 * G * GRIP) / Math.max(0.004, kMax))
    const kick = course.kickers.find((kk) => kk.s > gs.s - 1)
    if (kick && kick.s - gs.s < 26) vLim = 100
    vLim = Math.min(vLim, MAX_V)

    const commit = !!(kick && kick.s - gs.s < 26)
    const throttle = commit || gs.v < vLim - 0.4 ? 1 : 0
    const brake = gs.v > vLim + 0.6 && !commit

    const k = course.curvOf(gs.s)
    const ff = clamp(-(k * gs.v * gs.v * 0.6) / STEER_ACCEL, -1.2, 1.2)
    const steer = clamp(0.95 * (uT - gs.u) - 0.5 * gs.wlat + ff, -1, 1)

    return { throttle, steer, brake: !!brake, a: false, b: false }
}

export function stateOf(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        done: gs.done,
        fail: gs.fail,
        stage: gs.stageIdx + 1,
        medal: gs.medal,
        t: Math.round(gs.t * 1000) / 1000,
        progress: Math.round((gs.s / gs.len) * 1000) / 1000,
        speed: Math.round(gs.v * 100) / 100,
        falling: gs.falling,
        air: gs.air,
    }
}

export function stateHash(gs) {
    const q = (v) => Math.round(v * 1000)
    let h = 0x811c9dc5
    const mix = (n) => {
        h ^= n & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193)
    }
    mix(gs.tick); mix(q(gs.s)); mix(q(gs.u)); mix(q(gs.v)); mix(q(gs.wlat))
    mix(q(gs.y)); mix(q(gs.phase)); mix(gs.score); mix(gs.done ? 1 : 0)
    mix(gs.fail ? 1 : 0); mix(gs.falling ? 1 : 0); mix(gs.bumps.reduce((a, b, i) => a + b * (i + 3), 0))
    return h >>> 0
}
