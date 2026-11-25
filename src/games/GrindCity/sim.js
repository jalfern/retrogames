// GRIND CITY — the whole game as step(state, input) at 60 Hz.
// Pure + seeded: zero Math.random, every sim random derives from state.rng.
// The renderer and grindcheck import this SAME file — the ridden park IS the
// drawn park (park.js is the single surface).

import { parkHeight, gradAt, RAILS, LETTERS, GAP, BOUND, railClosest, railAt, railLen } from './park.js'

const G = 9.8 * 1.35            // game gravity (snappier than real)
const MAXV = 11.5              // m/s ground speed ceiling
const TURN = 2.35             // base steer rad/s at low speed
const PUMP_GAIN = 1.15        // m/s added per pump frame-ish (rate-limited)
const OLLIE_VY = 4.6
const GRIND_LL = 0.6          // latch radius, metres
const GRIND_DY = 0.42         // latch vertical tolerance
const CHAIN_BANK_T = 0.6      // s of clean riding that commits a combo
const MANUAL_GRACE = 0.22     // s after landing a manual press still counts
const RUN_TIME = 120
const FREE_TIME = 300
export const SCORE_GOAL = 1200

export const TRICK_PTS = {
    Grab: 60, Spin: 40, Flip: 80, Boardslide: 100, '50-50': 90,
    Manual: 30, Gap: 500, Manual180: 120,
}

// deterministic mulberry32 stored as an integer counter in state
function rnd(s) {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0
    let t = s.rng
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function makeGame(seed = 1, mode = 'run') {
    const s = {
        seed, mode, tick: 0, score: 0, done: false, won: false,
        phase: 'menu',            // menu | play | tumble | over
        x: 6, z: -31.5, y: parkHeight(6, -31.5),
        heading: Math.PI / 2,    // +z (down the drop-in)
        speed: 3.0, vy: 0, air: false,
        lastSlope: 0,
        grind: null,             // {ri,t,vt,bal,drift,name}
        manual: null,            // {t,spin}
        airTrick: null,          // {t,grab,flip,flipDir,spin,spinDir,rot,flipRot,spaceWas}
        manualT: 0,
        grindCd: 0,
        gapArmed: false, overHole: false,
        chain: [],               // trick names this chain (uniques drive mult)
        chainPts: 0, chainClean: 0,
        bailT: 0,
        letters: {}, gapDone: false, goalsDone: { score: false, letters: false, gap: false },
        timeLeft: mode === 'run' ? RUN_TIME : FREE_TIME,
        msg: null, msgT: 0,
        rng: seed >>> 0,
        events: [],             // drained by art/sound each frame
        camShake: 0,
        stats: { tricks: 0, bestChain: 0, grinds: 0 },
        aPrev: false, bPrev: false,
        bankFlashT: 0, bankFlashPts: 0,
    }
    return s
}

function ev(s, e) { if (s.events.length < 24) s.events.push(e) }
function say(s, m, t = 1.6) { s.msg = m; s.msgT = t }

const UNIQUE_MULT_CAP = 10

function addTrick(s, name, pts) {
    s.chainPts += pts
    if (!s.chain.includes(name)) s.chain.push(name)
    s.stats.tricks++
    ev(s, `trick:${name}:${pts}`)
}
function mult(s) { return Math.min(s.chain.length + 1, UNIQUE_MULT_CAP) }

function bank(s) {
    if (s.chain.length === 0) return
    const pts = Math.round(s.chainPts * mult(s))
    s.score += pts
    s.stats.bestChain = Math.max(s.stats.bestChain, pts)
    say(s, `+${pts}  x${mult(s)} ${s.chain.length}-TRICK LINE`)
    ev(s, `bank:${pts}`)
    s.bankFlashT = 1.2; s.bankFlashPts = pts
    s.chain = []; s.chainPts = 0; s.chainClean = 0
    checkGoals(s)
}

function checkGoals(s) {
    if (s.mode !== 'run') return
    if (!s.goalsDone.score && s.score >= SCORE_GOAL) {
        s.goalsDone.score = true; s.score += 2500; say(s, 'GOAL! SCORE TARGET +2500'); ev(s, 'goal:score')
    }
    if (!s.goalsDone.letters && LETTERS.every(l => s.letters[l.k])) {
        s.goalsDone.letters = true; s.score += 2500; say(s, 'GOAL! S-K-A-T-E +2500'); ev(s, 'goal:letters')
    }
    if (!s.goalsDone.gap && s.gapDone) {
        s.goalsDone.gap = true; s.score += 2500; say(s, 'GOAL! GAP OF THE DAY +2500'); ev(s, 'goal:gap')
    }
    if (LETTER_SATISFIED(s) && s.goalsDone.score && s.goalsDone.gap) {
        s.score += 10000; s.won = true; s.done = true; s.phase = 'over'
        say(s, 'ALL GOALS! YOU RULE! +10000', 3)
        ev(s, 'win')
    }
}
const LETTER_SATISFIED = s => s.goalsDone.letters || LETTERS.every(l => s.letters[l.k])

function bail(s, why) {
    if (s.phase !== 'play') return
    s.phase = 'tumble'; s.bailT = 1.15
    s.grind = null; s.manual = null; s.airTrick = null; s.air = false
    s.chain = []; s.chainPts = 0; s.chainClean = 0
    s.speed = 0; s.vy = 0
    s.camShake = 1
    say(s, why)
    ev(s, 'bail')
}

const LETTER_R = 1.5

function land(s) {
    const at = s.airTrick
    s.air = false
    let bailedAir = false
    if (at) {
        if (at.flip !== 0 && Math.abs(at.flipRot) < 300) bailedAir = true
        if (!bailedAir && Math.abs(at.spin) > 0 && Math.abs(at.rot) < Math.abs(at.spin) - 35) bailedAir = true
        if (!bailedAir) {
            if (at.grab) addTrick(s, at.grab, TRICK_PTS.Grab)
            if (Math.abs(at.spin) > 0) addTrick(s, 'Spin', TRICK_PTS.Spin)
            if (at.flip !== 0) addTrick(s, 'Flip', TRICK_PTS.Flip)
        }
        s.airTrick = null
    }
    if (bailedAir) { bail(s, 'BAILED — landed it short'); return }
    const h = parkHeight(s.x, s.z)
    s.y = h
    // gap resolution: cleared the trench without touching it
    if (s.gapArmed) {
        s.gapArmed = false
        if (s.overHole && s.z >= GAP.z1 - 1.2) {
            s.gapDone = true
            addTrick(s, 'Gap', TRICK_PTS.Gap)
            say(s, 'GAP! +500')
            ev(s, 'gap')
            checkGoals(s)
        }
    }
    s.overHole = false
    s.manualT = MANUAL_GRACE   // grace window counted down in grounded step
    ev(s, `land:${Math.min(9, Math.abs(s.vy)).toFixed(1)}`)
    s.vy = 0
    // convert downhill momentum along slope
    const g = gradAt(s.x, s.z)
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading)
    s.speed = Math.max(s.speed * 0.94, Math.abs(s.airVXZ || s.speed))
    s.lastSlope = g.gx * fx + g.gz * fz
    checkGoals(s)
}

function tryLatch(s) {
    if (s.vy > 0.6 || s.grindCd > 0) return
    for (let ri = 0; ri < RAILS.length; ri++) {
        const r = RAILS[ri]
        const c = railClosest(r, s.x, s.z)
        if (c.d > GRIND_LL) continue
        if (c.t <= 0.03 || c.t >= 0.97) continue   // never latch at a rail tip
        const p = railAt(r, c.t)
        if (Math.abs(s.y - p.y) > GRIND_DY) continue
        const L = railLen(r)
        const rx = (r.bx - r.ax) / L, rz = (r.bz - r.az) / L
        const fx = Math.cos(s.heading), fz = Math.sin(s.heading)
        const along = s.speed * (fx * rx + fz * rz)
        const travel = Math.sign(along) || 1
        if (Math.abs(along) < 1.6) continue
        const ang = Math.acos(Math.min(1, Math.abs(fx * rx + fz * rz))) * 180 / Math.PI
        s.grind = {
            ri, t: c.t, travel,
            vt: Math.max(2.2, Math.abs(along) * 0.92),
            bal: 0, drift: (rnd(s) - 0.5) * 0.5,
            name: ang < 18 ? (r.kind === 'coping' ? '50-50' : '50-50') : 'Boardslide',
            trickle: 0,
        }
        s.air = false; s.vy = 0
        s.y = p.y
        s.airTrick = null
        s.stats.grinds++
        addTrick(s, s.grind.name, TRICK_PTS[s.grind.name])
        say(s, s.grind.name.toUpperCase())
        ev(s, 'grind:start')
        return
    }
}

/** One 60 Hz tick. input = {left,right,up,down,a,b} booleans. */
export function step(s, input, dt = 1 / 60) {
    s.tick++
    if (s.msgT > 0) s.msgT -= dt
    if (s.bankFlashT > 0) s.bankFlashT -= dt
    if (s.grindCd > 0) s.grindCd -= dt
    if (s.camShake > 0) s.camShake = Math.max(0, s.camShake - dt * 2.2)
    const a = !!input.a, b = !!input.b
    const aEdge = a && !s.aPrev
    const bEdge = b && !s.bPrev

    if (s.phase === 'menu' || s.phase === 'over') { s.aPrev = a; s.bPrev = b; return s }

    if (s.mode === 'run') {
        s.timeLeft -= dt
        if (s.timeLeft <= 0) {
            s.timeLeft = 0; s.done = true; s.phase = 'over'
            say(s, 'TIME! FINAL SCORE ' + s.score, 4)
            ev(s, 'timeup')
            return s
        }
    } else { s.timeLeft = Math.max(0, s.timeLeft - dt) }

    if (s.phase === 'tumble') {
        s.bailT -= dt
        if (s.bailT <= 0) {
            s.phase = 'play'
            const h = parkHeight(s.x, s.z)
            s.y = h; s.speed = 1.6; s.vy = 0; s.grind = null; s.manual = null
        }
        s.aPrev = a; s.bPrev = b
        return s
    }

    // ── grinding ──────────────────────────────────────────────────────────
    if (s.grind) {
        const r = RAILS[s.grind.ri]
        const L = railLen(r)
        s.grind.vt = Math.max(1.6, s.grind.vt + (-((r.by - r.ay) / L)) * G * 0.55 * dt)
        s.grind.t += (s.grind.vt * dt / L) * s.grind.travel
        s.grind.trickle += dt
        if (s.grind.trickle > 0.15) { s.grind.trickle -= 0.15; s.chainPts += 6; ev(s, 'spark') }
        // balance: seeded drift + counter-steer
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
        s.grind.bal += (s.grind.drift + steer * 1.5) * dt
        if (Math.abs(s.grind.bal) > 1) { bail(s, 'BAILED — washed out the grind'); s.aPrev = a; s.bPrev = b; return s }
        const p = railAt(r, s.grind.t)
        s.x = p.x; s.z = p.z; s.y = p.y + 0.02
        s.speed = s.grind.vt
        const rx = (r.bx - r.ax) / L, rz = (r.bz - r.az) / L
        s.heading = Math.atan2(rz * s.grind.travel, rx * s.grind.travel)
        if (aEdge) {   // ollie out of the grind — keeps the chain alive
            s.grind = null
            s.grindCd = 0.3
            s.air = true; s.vy = OLLIE_VY * 0.9
            s.airTrick = { t: 0, grab: null, flip: 0, flipRot: 0, spin: 0, spinDir: 0, rot: 0 }
            s.chainClean = 0
            ev(s, 'ollie')
        } else if (s.grind.t <= 0 || s.grind.t >= 1) {
            s.grind = null
            s.grindCd = 0.4
            s.air = true; s.vy = 1.2
            s.airTrick = null
            ev(s, 'grind:end')
        }
        s.aPrev = a; s.bPrev = b
        return s
    }

    // ── airborne ──────────────────────────────────────────────────────────
    if (s.air) {
        const at = s.airTrick
        if (at) {
            at.t += dt
            if (at.grab && !a) { at.grabOut = (at.grabOut || 0) + dt }
            if (!at.grab && aEdge && at.t > 0.05) {
                const grips = ['Indy', 'Nosegrab', 'Method', 'Melon']
                at.grab = grips[s.stats.tricks % grips.length]
                ev(s, 'grab')
            }
            if (bEdge && at.flip === 0) { at.flip = 1; at.flipDir = s.speed > 5 ? 1 : -1; ev(s, 'flip') }
            if (at.flip !== 0) at.flipRot += dt * 1020 * at.flipDir
            const spinTarget = at.spin
            if (spinTarget !== 0 && Math.abs(at.rot) < Math.abs(spinTarget)) {
                at.rot += dt * 340 * Math.sign(spinTarget)
                s.heading += dt * 340 * Math.sign(spinTarget) * Math.PI / 180
            }
        }
        s.x += Math.cos(s.heading) * s.speed * dt
        s.z += Math.sin(s.heading) * s.speed * dt
        s.vy -= G * dt
        s.y += s.vy * dt
        s.x = Math.max(-BOUND, Math.min(BOUND, s.x))
        s.z = Math.max(-BOUND, Math.min(BOUND, s.z))
        // gap sensing (the trench runs along +z)
        if (s.z > GAP.z0 && s.z < GAP.z1 && s.x > GAP.x0 && s.x < GAP.x1) {
            s.gapArmed = true
            if (parkHeight(s.x, s.z) < GAP.floor) s.overHole = true
        }
        tryLatch(s)
        if (!s.grind && s.y <= parkHeight(s.x, s.z)) { s.airVXZ = s.speed; land(s) }
        s.aPrev = a; s.bPrev = b
        return s
    }

    // ── grounded ──────────────────────────────────────────────────────────
    // manual management first
    if (s.manual) {
        if (!a || s.manual.t > 5) {
            const name = s.manual.spin ? 'Manual180' : 'Manual'
            addTrick(s, name, TRICK_PTS[name] + Math.round(s.manual.t * 70))
            s.manual = null
            s.chainClean = 0
        } else {
            s.manual.t += dt
            const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
            if (steer !== 0 && s.manual.t < 0.6) s.manual.steer = steer
            if (s.manual.steer && s.manual.t > 0.35 && !s.manual.spin) {
                s.manual.spin = true
                ev(s, 'manual180')
            }
            s.heading += (s.manual.spin ? 180 * Math.sign(s.manual.steer) * dt / 0.45 : 0) * Math.PI / 180
            ev(s, 'manual')
        }
    }
    if (s.manualT > 0) s.manualT -= dt
    let manualStarted = false
    if (aEdge && s.manualT > 0 && !s.manual) {
        s.manual = { t: 0.001 }
        manualStarted = true
        s.chainClean = 0
        s.speed *= 0.96
        ev(s, 'manual:start')
    }

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    // gravity along slope
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading)
    const g = gradAt(s.x, s.z)
    const slope = g.gx * fx + g.gz * fz
    s.lastSlope = slope
    s.speed -= G * slope * dt
    // pump: crouch on a transition adds speed (THPS pumping)
    if (b && slope > 0.18 && s.speed < MAXV) s.speed += PUMP_GAIN * dt
    // carve drag + rolling resistance
    const turn = steer * TURN * dt * (0.55 + Math.min(1, s.speed / 6) * 0.45)
    s.heading += turn
    s.speed -= Math.abs(turn) * Math.min(s.speed, 8) * 0.10
    s.speed -= s.speed * 0.045 * dt
    s.speed = Math.max(0, Math.min(MAXV, s.speed))

    // a dead stop on a slope: roll downhill instead of sticking
    const gm = Math.hypot(g.gx, g.gz)
    if (s.speed < 0.5 && !s.manual && gm > 0.18) {
        const dh = Math.atan2(-g.gz, -g.gx)
        let e = dh - s.heading
        while (e > Math.PI) e -= 2 * Math.PI
        while (e < -Math.PI) e += 2 * Math.PI
        s.heading += Math.max(-4, Math.min(4, e)) * dt
        s.speed += G * gm * 0.8 * dt
    }

    if (aEdge && !manualStarted) {   // ollie
        s.air = true
        s.vy = OLLIE_VY + s.speed * 0.16
        s.airTrick = { t: 0, grab: null, flip: 0, flipRot: 0, rot: 0, spin: steer * 180 }
        s.chainClean = 0
        s.chainPts += 10
        ev(s, 'ollie')
    } else {
        // ride the surface
        s.x += fx * s.speed * dt
        s.z += fz * s.speed * dt
        s.x = Math.max(-BOUND, Math.min(BOUND, s.x))
        s.z = Math.max(-BOUND, Math.min(BOUND, s.z))
        const h = parkHeight(s.x, s.z)
        // drop-away launches: ground falls away faster than gravity can follow
        const drop = h - s.y
        if (drop < -(0.06 + 0.55 * s.speed * dt) && s.speed > 3) {
            s.air = true
            s.vy = Math.max(0.4, s.speed * Math.max(0, s.lastSlope) * 0.8)
            s.airTrick = { t: 0, grab: null, flip: 0, flipRot: 0, rot: 0, spin: 0 }
            s.airVXZ = s.speed
            ev(s, 'launch')
        } else {
            s.y = h
        }
    }

    // letters
    for (const l of LETTERS) {
        if (!s.letters[l.k] && Math.hypot(s.x - l.x, s.z - l.z) < LETTER_R && Math.abs(s.y - l.y) < 2.2) {
            s.letters[l.k] = true
            s.score += 50
            say(s, l.k + '!')
            ev(s, `letter:${l.k}`)
            checkGoals(s)
        }
    }

    // combo commit: clean riding after the last trick banks it
    if (s.chain.length > 0) {
        s.chainClean += dt
        if (s.chainClean > CHAIN_BANK_T) bank(s)
    }

    s.aPrev = a; s.bPrev = b
    return s
}

/** JSON state for the contract + checks. */
export function stateOf(s) {
    return {
        tick: s.tick, score: s.score, done: s.done, won: s.won,
        phase: s.phase, mode: s.mode, seed: s.seed,
        x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, z: Math.round(s.z * 100) / 100,
        heading: Math.round(s.heading * 1000) / 1000, speed: Math.round(s.speed * 100) / 100,
        vy: Math.round(s.vy * 100) / 100, slope: Math.round(s.lastSlope * 1000) / 1000,
        air: !!s.air, grinding: !!s.grind, manual: !!s.manual,
        grindBal: s.grind ? Math.round(s.grind.bal * 1000) / 1000 : 0,
        chain: s.chain.length, chainPts: Math.round(s.chainPts), mult: mult(s),
        letters: s.letters, gapDone: s.gapDone, goalsDone: s.goalsDone,
        timeLeft: Math.round(s.timeLeft * 10) / 10,
        stats: s.stats,
    }
}

/** Pack/unpack one tick of pads for the cabinet's run-replay log (#3225).
 *  Pure + total: the cabinet logs packIn(input) each played tick, and a replay
 *  re-steps step(s, unpackIn(word)) from the same seed — byte-identical. */
export const packIn = i =>
    (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) | (i.down ? 8 : 0) | (i.a ? 16 : 0) | (i.b ? 32 : 0)
export const unpackIn = p => ({
    left: !!(p & 1), right: !!(p & 2), up: !!(p & 4), down: !!(p & 8), a: !!(p & 16), b: !!(p & 32),
})

export function hashState(s) {
    let h = 2166136261
    const str = JSON.stringify(stateOf(s))
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}
