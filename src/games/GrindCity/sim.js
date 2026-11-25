// GRIND CITY — the whole game as step(state, input) at 60 Hz.
// Pure + seeded: zero Math.random, every sim random derives from state.rng.
// The renderer and grindcheck import this SAME file — the ridden park IS the
// drawn park (park.js is the single surface).

import { parkHeight, gradAt, RAILS, LETTERS, GAP, BOUND, GEMS, GEM_PTS, SECRET, railClosest, railAt, railLen } from './park.js'

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

// Rail vocabulary (#3289): grabs on grinds + coping stalls.
const GRAB_COMMIT_T = 0.30    // s a rail grab must be held before it pays
const STALL_COMMIT_T = 0.30   // s a stall must be held before it pays
const STALL_MAX_T = 4         // s auto-pop cap (like the manual's 5 s)
const STALL_BAIL = 1.15       // balance meter limit — tighter than a grind's 1
const LIP_LL = 0.9            // m lateral reach of a coping lip
const LIP_DY = 0.75           // m vertical reach — coping sits ~0.7 above decks

export const TRICK_PTS = {
    Grab: 60, Spin: 40, Flip: 80, Boardslide: 100, '50-50': 90,
    Manual: 30, Gap: 500, Manual180: 120,
    Feeble: 70, Crooked: 70, Stall: 40,
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
        grind: null,             // {ri,t,vt,bal,drift,name,grab,grabT,trickle}
        stall: null,             // {ri,rt,t,bal,drift,trickle} — tail-in on a coping lip (#3289)
        manual: null,            // {t,spin}
        airTrick: null,          // {t,grab,flip,flipDir,spin,spinDir,rot,flipRot,spaceWas}
        manualT: 0,
        grindCd: 0,
        gapArmed: false, overHole: false,
        chain: [],               // trick names this chain (uniques drive mult)
        chainPts: 0, chainClean: 0,
        bailT: 0,
        letters: {}, gapDone: false, goalsDone: { score: false, letters: false, gap: false },
        gemBits: 0, gemsAll: false, secretFound: false,   // #3246: optional objects
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

// ── gems + secret spot (#3246) — optional, never part of the win law ──────
export const GEM_ALL = (1 << GEMS.length) - 1
export const gemCount = b => { let n = 0; while (b) { n += b & 1; b >>= 1 } return n }
const GEM_R = 1.2
const GEM_DY = 2.2
const GEM_RUN_BONUS = 1500
const SECRET_BONUS = 250

function collectPretty(s) {
    for (let i = 0; i < GEMS.length; i++) {
        if (s.gemBits & (1 << i)) continue
        const g = GEMS[i]
        if (Math.hypot(s.x - g.x, s.z - g.z) < GEM_R && Math.abs(s.y - g.y) < GEM_DY) {
            s.gemBits |= 1 << i
            s.score += GEM_PTS
            say(s, `GEM +${GEM_PTS}`)
            ev(s, 'gem')
            if (!s.gemsAll && s.gemBits === GEM_ALL) {
                s.gemsAll = true
                s.score += GEM_RUN_BONUS
                say(s, `GEM RUN! ALL ${GEMS.length} +${GEM_RUN_BONUS}`, 3)
                ev(s, 'gems:all')
            }
        }
    }
    // the secret bowl: reward for skaters who leave the map they can see
    if (!s.secretFound && Math.hypot(s.x - SECRET.x, s.z - SECRET.z) < SECRET.r && s.y < SECRET.floor + 1.2) {
        s.secretFound = true
        s.score += SECRET_BONUS
        say(s, 'OFF THE MAP! SECRET SPOT +250', 3)
        ev(s, 'secret')
    }
}

function bail(s, why) {
    if (s.phase !== 'play') return
    s.phase = 'tumble'; s.bailT = 1.15
    s.grind = null; s.stall = null; s.manual = null; s.airTrick = null; s.air = false
    s.chain = []; s.chainPts = 0; s.chainClean = 0
    s.speed = 0; s.vy = 0
    s.camShake = 1
    say(s, why)
    ev(s, 'bail')
}

const LETTER_R = 1.5

// Coping-lip proximity (#3289): the stall zone. Reuses the same rail maths as
// the grind latch — no new physics surface. Decks sit ~0.7 m under their
// coping, pipe lips ~0.06, so the vertical reach is 0.75.
function lipNear(s) {
    for (let ri = 0; ri < RAILS.length; ri++) {
        const r = RAILS[ri]
        if (r.kind !== 'coping') continue
        const c = railClosest(r, s.x, s.z)
        if (c.d > LIP_LL || c.t <= 0.05 || c.t >= 0.95) continue
        const p = railAt(r, c.t)
        if (Math.abs(s.y - p.y) > LIP_DY) continue
        return { ri, rt: c.t }
    }
    return null
}

// A grind grab pays once held long enough — mashing B never commits (#3289).
function commitGrindGrab(s) {
    const g = s.grind
    if (!g || !g.grab) return
    if (g.grabT >= GRAB_COMMIT_T) {
        addTrick(s, g.grab, TRICK_PTS[g.grab])
        say(s, `${g.grab.toUpperCase()} GRAB +${TRICK_PTS[g.grab]}`)
    }
    g.grab = null; g.grabT = 0
}

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
            s.y = h; s.speed = 1.6; s.vy = 0; s.grind = null; s.stall = null; s.manual = null
        }
        s.aPrev = a; s.bPrev = b
        return s
    }

    // ── stalled on a coping lip (#3289) ───────────────────────────────────
    // Frozen on the rail line; trickle ticks pay, a tighter meter than a
    // grind decides the slip-out. A press pops back with a hop, chain alive.
    if (s.stall) {
        const st = s.stall
        const p = railAt(RAILS[st.ri], st.rt)
        s.x = p.x; s.z = p.z; s.y = p.y
        s.speed = 0; s.vy = 0; s.air = false
        st.t += dt
        st.trickle += dt
        if (st.trickle > 0.15) { st.trickle -= 0.15; s.chainPts += 8; ev(s, 'spark') }
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
        st.bal += (st.drift + steer * 1.6) * dt
        if (Math.abs(st.bal) > STALL_BAIL) { bail(s, 'BAILED — slipped out the stall'); s.aPrev = a; s.bPrev = b; return s }
        if (aEdge || st.t > STALL_MAX_T) {
            if (st.t >= STALL_COMMIT_T) {
                const pts = TRICK_PTS.Stall + Math.round(st.t * 80)
                addTrick(s, 'Stall', pts)
                say(s, `STALL +${pts}`)
            }
            s.stall = null
            s.grindCd = 0.3
            s.air = true; s.vy = 2.8; s.speed = 1.2
            s.airTrick = { t: 0, grab: null, flip: 0, flipRot: 0, rot: 0, spin: 0 }
            s.chainClean = 0
            ev(s, 'ollie')
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
        // rail grab (#3289): hold B — reach down, double trickle, steadier meter
        if (bEdge && !s.grind.grab) {
            s.grind.grab = s.grind.travel > 0 ? 'Feeble' : 'Crooked'
            s.grind.grabT = 0
            ev(s, 'grab')
        }
        if (s.grind.grab) s.grind.grabT += dt
        if (!b && s.grind.grab) commitGrindGrab(s)
        if (s.grind.trickle > 0.15) { s.grind.trickle -= 0.15; s.chainPts += s.grind.grab ? 12 : 6; ev(s, 'spark') }
        // balance: seeded drift + counter-steer; the grab damps the drift
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
        s.grind.bal += ((s.grind.grab ? s.grind.drift * 0.55 : s.grind.drift) + steer * 1.5) * dt
        if (Math.abs(s.grind.bal) > 1) { bail(s, 'BAILED — washed out the grind'); s.aPrev = a; s.bPrev = b; return s }
        const p = railAt(r, s.grind.t)
        s.x = p.x; s.z = p.z; s.y = p.y + 0.02
        s.speed = s.grind.vt
        const rx = (r.bx - r.ax) / L, rz = (r.bz - r.az) / L
        s.heading = Math.atan2(rz * s.grind.travel, rx * s.grind.travel)
        if (aEdge) {   // ollie out of the grind — keeps the chain alive
            commitGrindGrab(s)
            s.grind = null
            s.grindCd = 0.3
            s.air = true; s.vy = OLLIE_VY * 0.9
            s.airTrick = { t: 0, grab: null, flip: 0, flipRot: 0, spin: 0, spinDir: 0, rot: 0 }
            s.chainClean = 0
            ev(s, 'ollie')
        } else if (s.grind.t <= 0 || s.grind.t >= 1) {
            commitGrindGrab(s)
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
        collectPretty(s)   // gems and the secret spot read in the air too
        tryLatch(s)
        if (!s.grind && s.y <= parkHeight(s.x, s.z)) { s.airVXZ = s.speed; land(s) }
        s.aPrev = a; s.bPrev = b
        return s
    }

    // ── grounded ──────────────────────────────────────────────────────────
    // coping stall entry (#3289): crouch (↓) + A at a coping lip locks the
    // board tail-in. Away from a lip ↓+A is just an ollie — no dead combo.
    if (aEdge && input.down && s.grindCd <= 0) {
        const lip = lipNear(s)
        if (lip) {
            s.stall = { ri: lip.ri, rt: lip.rt, t: 0, bal: 0, drift: (rnd(s) - 0.5) * 0.9, trickle: 0 }
            const lp = railAt(RAILS[lip.ri], lip.rt)
            s.x = lp.x; s.z = lp.z; s.y = lp.y   // lock onto the coping immediately
            s.speed = 0; s.vy = 0
            s.chainClean = 0
            say(s, 'STALL')
            ev(s, 'stall')
            s.aPrev = a; s.bPrev = b
            return s
        }
    }

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
    if (aEdge && s.manualT > 0 && !s.manual && !input.down) {
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
    collectPretty(s)   // gems + secret spot (#3246) — optional, win law untouched

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
    // flip tell (#3233 item 4): read-only — hashState hashes the sim, not this
    airFlip: !!(s.air && s.airTrick && s.airTrick.flip),
        // manual identity (#3233 tail): the live name + the value it WOULD pay
        // if released this tick — the same law the commit uses, so the chip can
        // never over-promise. Additive; packIn and the replay wire untouched.
        manualName: s.manual ? (s.manual.spin ? 'MANUAL 180' : 'MANUAL') : null,
        manualPts: s.manual
            ? TRICK_PTS[s.manual.spin ? 'Manual180' : 'Manual'] + Math.round(s.manual.t * 70)
            : 0,
        grindBal: s.grind ? Math.round(s.grind.bal * 1000) / 1000 : 0,
        railGrab: s.grind && s.grind.grab ? s.grind.grab : null,
        stall: !!s.stall,
        stallT: s.stall ? Math.round(s.stall.t * 100) / 100 : 0,
        stallBal: s.stall ? Math.round(s.stall.bal * 1000) / 1000 : 0,
        chain: s.chain.length, chainPts: Math.round(s.chainPts), mult: mult(s),
        letters: s.letters, gapDone: s.gapDone, goalsDone: s.goalsDone,
        gems: gemCount(s.gemBits), gemTotal: GEMS.length, gemsAll: s.gemsAll, secret: s.secretFound,
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

/** Replay window law (#3225): the last 10 s of the line; a run shorter than
 *  REPLAY_MIN was barely skating. Exported so the trigger law below and the
 *  cabinet share one number instead of two that can drift. */
export const REPLAY_MAX = 600
export const REPLAY_MIN = 120

/** Does this finished run earn a replay? (#3374)
 *  Long enough to be worth watching, OR it banked at least one letter —
 *  the near-miss (letters in, dead before 2 s) teaches what got away
 *  instead of vanishing straight to the results card. Letterless short
 *  runs keep the old silent card; the 10 s window law is untouched. */
export const replayWorthy = (ticks, lettersGot) =>
    ticks >= REPLAY_MIN || lettersGot >= 1

/** Session best-line law (#3374): the attract card remembers the best run of
 *  this page load (memory only — persisting/exporting runs is its own stage).
 *  Higher score wins; tie → more letters banked; second tie → newer run. */
export const betterLine = (prev, run) => {
    if (!prev) return run
    if (!run) return prev
    if (run.score !== prev.score) return run.score > prev.score ? run : prev
    if ((run.letters || 0) !== (prev.letters || 0)) return (run.letters || 0) > (prev.letters || 0) ? run : prev
    return run
}

/** Strict all-time law (#3381): the stored record falls to strictly more
 *  score, or an equal score with strictly more letters — recency alone never
 *  fakes a record. The badge and the storage write both read this law; it is
 *  the unambiguous subset of betterLine (#3374), where a full tie goes to
 *  the newer run. */
export const beatsLine = (prev, run) => {
    if (!prev) return true
    if (run.score !== prev.score) return run.score > prev.score
    return (run.letters || 0) > (prev.letters || 0)
}

/** Share codec (#3381) — a line is seed + pads, and one packed pad word is
 *  exactly six bits, so the wire is one URL-safe char per tick: no bit
 *  twiddling, no run-length ambiguity, and the round-trip is exact. Code =
 *  seed · score · ticks · body (numbers in canonical base36, which lets
 *  decode reject non-canonical junk). Total: garbage, oversized or
 *  out-of-alphabet input decodes to null — never throws, never half-rides. */
export const SHARE_MAX_TICKS = 7500     // the full 2:00 clock, plus settle headroom
export const SHARE_MAX_CODE = 8192
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64V = Object.fromEntries([...B64].map((c, i) => [c, i]))
export function encodeLine(line) {
    if (!line || !Array.isArray(line.log) || line.log.length < 1 || line.log.length > SHARE_MAX_TICKS) return null
    if (!Number.isInteger(line.seed) || line.seed < 0 || line.seed > 0xffffffff) return null
    if (!Number.isInteger(line.score) || line.score < 0) return null
    let body = ''
    for (const w of line.log) {
        if (!Number.isInteger(w) || w < 0 || w > 63) return null
        body += B64[w]
    }
    const code = `${line.seed.toString(36)}.${line.score.toString(36)}.${line.log.length.toString(36)}.${body}`
    return code.length <= SHARE_MAX_CODE ? code : null
}
export function decodeLine(code) {
    if (typeof code !== 'string' || code.length < 3 || code.length > SHARE_MAX_CODE) return null
    const parts = code.split('.')
    if (parts.length !== 4) return null
    const [seedS, scoreS, ticksS, body] = parts
    const seed = Number.parseInt(seedS, 36)
    const score = Number.parseInt(scoreS, 36)
    const ticks = Number.parseInt(ticksS, 36)
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || seed.toString(36) !== seedS) return null
    if (!Number.isInteger(score) || score < 0 || score.toString(36) !== scoreS) return null
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > SHARE_MAX_TICKS || ticks.toString(36) !== ticksS) return null
    if (!body || body.length !== ticks) return null
    const log = new Array(ticks)
    for (let i = 0; i < ticks; i++) {
        const v = B64V[body[i]]
        if (v === undefined) return null
        log[i] = v
    }
    return { seed, score, log }
}

/** Stored-bank law (#3381): what may live in localStorage — the same shape
 *  the attract bank rides (a bankable line with honest numbers), so a corrupt
 *  or hand-edited store falls back to a plain cold plaza instead of parading
 *  a fake record behind the title. */
export const validBank = (b) => !!b && typeof b === 'object' && !Array.isArray(b) && b.v === 1
    && Number.isInteger(b.seed) && b.seed >= 0 && b.seed <= 0xffffffff
    && Array.isArray(b.log) && b.log.length >= REPLAY_MIN && b.log.length <= SHARE_MAX_TICKS
    && b.log.every((w) => Number.isInteger(w) && w >= 0 && w <= 63)
    && Number.isInteger(b.score) && b.score >= 0
    && Number.isInteger(b.letters) && b.letters >= 0 && b.letters <= 5
    && typeof b.won === 'boolean'

export function hashState(s) {
    let h = 2166136261
    const str = JSON.stringify(stateOf(s))
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}
