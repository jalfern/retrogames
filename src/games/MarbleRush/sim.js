// MARBLE RUSH — sim.js: the marble. Pure, seeded, 60 Hz, zero Math.random.
// The whole game is (s,u) physics on the analytic manifold in ./course.js:
// gravity rides the grade, throttle and brakes spend speed, one friction
// budget is shared between holding the curve and steering, banking tilts the
// budget, and everything you cannot hold slides you toward the sky. The floor
// you were riding has opinions about where it ends.

import {
    compileStage, moverDeck, sweeperBar, seedRng, STAGES,
    G, GRIP, ACC, BRAKE, ROLL_C, DRAG_C, STEER_ACCEL, LAT_DAMP, SLIDE_K,
    MAX_V, LAUNCH, FALL_Y, MARBLE_R,
} from './course.js'

export const SIM_MS = 1000 / 60
export const DT = 1 / 60
export const GO_DELAY = 1.0
export const STAGE_COUNT = STAGES.length

// The trick hop (#3224): a player-launched pop off the deck. It costs speed
// up front (HOP_COST) and buys a ~0.47 s arc — air skips the sweeping bars
// (which only bite grounded marble) and lands you past a lip if you are quick.
// The autopilot never presses A, so every bot line and hash baseline the
// checks pin is untouched by this verb.
export const HOP_V = 2.3
export const HOP_COST = 0.88

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const CACHE = []
export function courseFor(i) {
    if (!CACHE[i]) CACHE[i] = compileStage(STAGES[i])
    return CACHE[i]
}

export function makeGame(seed, stageIdx = 0) {
    const course = courseFor(stageIdx)
    const rnd = seedRng(seed)
    // the seed moves the bridges' phases — same authored track, different
    // moment: which way each deck is swinging when you arrive is seeded luck
    const mvPhase = STAGES[stageIdx].movers.map(() => rnd() * Math.PI * 2)
    // same luck for the sweeping bars — the bar's moment is seeded too
    const swPhase = STAGES[stageIdx].sweepers.map(() => rnd() * Math.PI * 2)
    return {
        seed: seed >>> 0,
        stageIdx,
        mvPhase,
        swPhase,
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
        swCd: 0,                 // sweeper knock cooldown
        swHits: 0,
        cpS: course.cp || 0,     // checkpoint station (0 = none on this shelf)
        cpArmed: false,          // gate crossed — a fall respawns at the gate
        respawned: 0,
        hops: 0,                 // trick hops taken this stage (never by autoPad)
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
    if (gs.swCd > 0) gs.swCd -= DT

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
        const deckVel = m.A * m.omega * Math.cos(m.omega * (gs.t + gs.mvPhase[mi]) + m.phase)
        gs.wlat += (deckVel - gs.wlat) * Math.min(1, 3.6 * DT)
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

    // Floor resolution happens AFTER advancing s: the ground you actually
    // reach at the end of the tick decides, not the one you left. Width and
    // gap are step fields (nearest sample) — a road edge must not smudge.
    const miE = course.moverAt(gs.s)
    const overGap = course.gapAt(gs.s)
    const deckE = miE >= 0 ? moverDeck(course, miE, gs.t + gs.mvPhase[miE]) : { u: 0, w: course.halfWidthOf(gs.s) }

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
        // ---- trick hop: the player's own verb (#3224) ------------------------
        // Space/A pops the marble off whatever deck it is riding. Costs speed
        // now, buys arc later; the launch tick must not also drop you through
        // the lip edge you jumped from, so it counts as launched.
        if (!gs.air && pad.a) {
            gs.air = true
            gs.vy = HOP_V
            gs.y = 0.01
            gs.v = clamp(gs.v * HOP_COST, 0, MAX_V)
            gs.hops += 1
            gs.events.push({ type: 'hop', s: gs.s })
            launched = true
        }
        if (!launched) {
            const onDeck = miE >= 0 && Math.abs(gs.u - deckE.u) <= deckE.w + MARBLE_R * 0.25
            if (overGap && !onDeck) {
                gs.falling = true
                gs.vy = -1
                gs.v *= 0.4
                gs.events.push({ type: 'fall' })
            } else if (!overGap && Math.abs(gs.u - deckE.u) > deckE.w + MARBLE_R * 0.25) {
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
            const du = gs.u - (miE >= 0 ? b.u + deckE.u : b.u)
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

    // ---- sweeping bars (stage 2 verb) ------------------------------------------
    // the bar sweeps across its station on the moverDeck sine, seeded phase.
    // contact = hard lateral knock + speed bite — the knock walks you toward
    // the edge, and the edge is honest about what it does next.
    if (!gs.air && gs.swCd <= 0) {
        for (let si = 0; si < course.sweepers.length; si++) {
            const sw = course.sweepers[si]
            const barU = sweeperBar(course, si, gs.t + gs.swPhase[si])
            if (Math.abs(gs.s - sw.s) < 0.55 + MARBLE_R && Math.abs(gs.u - barU) < sw.w + MARBLE_R) {
                gs.swHits += 1
                gs.wlat += Math.sign(gs.u - barU || 1) * 5.2
                gs.v = clamp(gs.v * 0.72, 0, MAX_V)
                gs.swCd = 0.5
                gs.events.push({ type: 'sweep', s: sw.s, u: barU })
                break
            }
        }
    }

    // ---- checkpoint gate ---------------------------------------------------------
    if (!gs.cpArmed && gs.cpS > 0 && gs.s >= gs.cpS) {
        gs.cpArmed = true
        gs.events.push({ type: 'gate', s: gs.cpS })
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
    if (miFound >= 0) {
        // while riding a deck, aim where it WILL be at the exit — the deck
        // can swing a metre either way during a long crossing
        const miNow = course.moverAt(gs.s)
        const dExit = miFound === miNow && gs.v > 1 ? Math.max(0, (course.movers[miFound].to - gs.s) / gs.v) : dFound / Math.max(4, gs.v)
        uT = moverDeck(course, miFound, gs.t + gs.mvPhase[miFound] + dExit).u
    }
    for (const b of course.bumpers) {
        if (b.s > gs.s && b.s < gs.s + 9 + gs.v * 0.5) {
            const side = b.u >= 0 ? -1 : 1
            const w = course.halfWidthOf(b.s)
            uT = clamp(b.u + side * (b.r + 0.9), -(w - 0.45), w - 0.45)
            break
        }
    }
    // sweeping bars: aim the open side of where the bar WILL be at the
    // crossing time, and hold that line through the station
    for (let si = 0; si < course.sweepers.length; si++) {
        const sw = course.sweepers[si]
        if (sw.s >= gs.s - (1.2 + MARBLE_R) && sw.s < gs.s + 10 + gs.v * 0.9) {
            const tc = gs.t + (sw.s - gs.s) / Math.max(4, gs.v) + gs.swPhase[si]
            const barU = sweeperBar(course, si, tc)
            const w0 = course.halfWidthOf(sw.s)
            const side = barU >= 0 ? -1 : 1
            const need = Math.abs(barU) + sw.w + MARBLE_R + 0.35
            uT = side * clamp(Math.max(need, 0.9), 0.9, Math.max(0.9, w0 - 0.18))
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

// respawn at an armed checkpoint: same seed, same clock (t keeps running, so
// medals stay honest and seeded bridge/bar phases stay in step with reality).
// Only the marble goes back to the gate.
export function respawn(gs) {
    if (!gs.cpArmed || gs.done && !gs.fail) return false
    gs.falling = false
    gs.done = false
    gs.fail = false
    gs.air = false
    gs.s = Math.max(2, gs.cpS - 4)
    gs.u = 0
    gs.v = 8
    gs.wlat = 0
    gs.y = 0
    gs.vy = 0
    gs.bumpCd = 0
    gs.swCd = 0
    gs.respawned += 1
    gs.events.push({ type: 'respawn', s: gs.s })
    return true
}

export function stateOf(gs) {
    return {
        tick: gs.tick,
        seed: gs.seed,
        hash: stateHash(gs),
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
        cpArmed: gs.cpArmed,
        respawns: gs.respawned,
        hops: gs.hops,
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
    mix(gs.cpArmed ? 1 : 0); mix(gs.respawned); mix(gs.swHits)
    return h >>> 0
}
