// TIDAL RUSH — sim.js: THE RACE. Pure, seeded, 60 Hz, zero DOM, zero clock,
// zero Math.random. Every die the sim rolls rides one mulberry32 integer state
// carried INSIDE gs (snapshot/restore stays byte-exact, #494 law).
//
// Rules (Wave Race 64, N64 1996 — its five signatures, own IP):
//  • buoy slalom — gates alternate RED (pass on the right) and YELLOW (pass on
//    the left); judged by the craft's heading at the moment it takes the gate;
//  • clean pass charges the sprint boost + scores; a miss (wrong side, or
//    skipping past the gate line) chokes the throttle for a beat;
//  • the hull rides the analytic swell field (water.js): matched surface vy on
//    the crests, airborne launches off kickers, landings splash;
//  • airborne + A spins a 360 (+250); full-lock steer in the air rolls a
//    BARREL (+200) — one trick per air, whichever completes;
//  • three laps against two seeded CPU skis; standings by unwrapped course
//    progress, so nobody games the gates.
//
// Rung 2 (#3104): STORM BAY is the same venue with the weather dialled to
// mutiny — the sea is a live table (`gs.seaCur`) blended toward a seeded
// per-lap re-roll (`gs.seaTarget`), lightning is scheduled by the sim's own
// rng, and gate judgement rides course PROGRESS instead of a lateral corridor,
// so skirting far outside the line can no longer escape judgement.
//
// Rung 3 (“BIG WATER”): the re-roll now TRAVELS. On each player lap crossing a
// squall front (`gs.front`, see water.js) sweeps the bay along the new swell's
// direction — behind it the new sea, ahead of it the old — and every hull
// sample mixes the two evaluated tables by the front weight, the same weight
// the vertex shader computes (drawn ≡ ridden across the front). A landed trick
// banks an air-time bonus; rivals take visibly different lines.

import { heightAt, surfaceVy, sunnySea, stormSea, mixHeight, mixVy, makeFront, frontW, WAVES, FRONT_SPEED } from './water.js'

export const DT = 1 / 60
export const LAPS = 3
export const SIM_MS = 1000 * DT

// --- tunables ---------------------------------------------------------------
const V_MAX = 17.0            // m/s cruise (~61 km/h)
const V_BOOST = 1.32          // sprint multiplier while BOOST is burning
const THRUST = 7.5            // throttle authority (m/s^2)
const DRAG = 0.021            // quadratic drag → v_term = sqrt(T/DRG) ≈ 19
export { THRUST, DRAG }
const TURN_K = 1.16           // rad/s at full lock, speed-scaled below
const LEAN_MAX = 0.62         // body-lean angle at full lock (radians)
const LAUNCH_VY = -1.90       // sunny: surface falling this fast under a fast hull = kicker
const LAUNCH_VY_STORM = -2.35 // storm seas are bigger; a hair higher threshold keeps lines rideable
const G = 9.81
const TRICK_RATE = 9.5        // rad/s spin while A held airborne
const BARREL_RATE = 10.0      // rad/s barrel roll while steer is pinned airborne
const AIR_BONUS_RATE = 50     // score per second of hang-time under a landed trick
const AIR_BONUS_CAP = 100     // a 2 s send gets the whole cap
const BOOST_DRAIN = 0.30      // meter per second while sprinting
const GATE_R = 9.0            // judgement radius around a buoy
const SKIP_MARGIN = 14        // past the gate line by this much unjudged = miss
const PENALTY_T = 1.5         // throttle choked this long after a miss
const PENALTY_CAP = 0.35
// Rain is gameplay (#3191): inside the squall band the hull drags and drifts.
export const RAIN_DRAG = 0.005 // extra quadratic drag × rain — v_term 19 → ~16.9 m/s
export const RAIN_PUSH = 1.55 // m/s crosswind drift at full rain, along the new swell
export const RAIN_VIS = 0.72  // gate dimming ceiling — the shell lerps buoy colours by this

// --- seeded rng as pure state-in/state-out (JSON-safe) ----------------------
export function rnd(s) {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}
const rand = (gs) => { const [v, s] = rnd(gs.rngS); gs.rngS = s; return v }

// --- SUNNY BAY course ---------------------------------------------------------
// A closed slalom ellipse; 10 gates alternate red/yellow. The start/finish is
// gate 0's arc. Dense polyline samples give every craft a monotone progress.
export const RX = 74
export const RZ = 46
export const N_GATES = 10
const N_SAMPLE = 720

export function courseSamples() {
    const pts = []
    for (let i = 0; i < N_SAMPLE; i++) {
        const a = (i / N_SAMPLE) * Math.PI * 2
        pts.push({ x: RX * Math.cos(a), z: RZ * Math.sin(a) })
    }
    return pts
}

export function buildCourse(seed) {
    const pts = courseSamples()
    const arcs = [0]
    let len = 0
    for (let i = 1; i <= N_SAMPLE; i++) {
        const a = pts[i - 1], b = pts[i % N_SAMPLE]
        len += Math.hypot(b.x - a.x, b.z - a.z)
        arcs.push(len)
    }
    const gates = []
    for (let i = 0; i < N_GATES; i++) {
        const a = (i / N_GATES) * Math.PI * 2 - Math.PI / 2 // first gate off the beach
        const x = RX * Math.cos(a), z = RZ * Math.sin(a)
        // tangent of travel (counter-clockwise on x-z as drawn)
        const tx = -RX * Math.sin(a), tz = RZ * Math.cos(a)
        const tl = Math.hypot(tx, tz)
        const tangent = { x: tx / tl, z: tz / tl }
        gates.push({
            x, z,
            color: i % 2 === 0 ? 'red' : 'yellow',
            arc: arcs[Math.round(((i / N_GATES) * N_SAMPLE + N_SAMPLE * 0.75) % N_SAMPLE)],
            tangent,
            // which lateral side the CORRECT pass keeps the buoy on, world-frame:
            // red ⇒ buoy right of heading ⇒ craft passes left of buoy.
            side: i % 2 === 0 ? -1 : 1,
        })
    }
    return { pts, arcs, len, gates, seed: seed >>> 0 }
}

// Unwrapped progress along the course: nearest polyline sample, delta wrapped
// to (-half, +half] so the loop crossing is continuous. Returns {s, idx}.
function progressAt(course, prevIdx, prevS, x, z) {
    const pts = course.pts
    let best = prevIdx
    let bestD = Infinity
    for (let k = -24; k <= 24; k++) {
        const i = (prevIdx + k + N_SAMPLE) % N_SAMPLE
        const p = pts[i]
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
        if (d < bestD) { bestD = d; best = i }
    }
    const half = course.len / 2
    let ds = course.arcs[best + 1] - course.arcs[prevIdx + 1]
    if (ds > half) ds -= course.len
    if (ds < -half) ds += course.len
    return { s: prevS + ds, idx: best }
}

// --- craft -------------------------------------------------------------------
function makeCraft(id, name, color, startArc, skill) {
    return {
        id, name, color, skill,
        arc: startArc,                 // spawn position along the course
        x: 0, z: 0, y: 0,
        heading: 0,                   // radians; (+x=sin, +z=cos convention)
        speed: 0, throttle: 0, steer: 0,
        rain: 0,                      // squall intensity at the hull 0..1 (#3191)
        lean: 0, pitch: 0, roll: 0,
        airborne: false, vy: 0, spin: 0, spinArmed: false, trickPts: 0, trickArmed: 0,
        rollSpin: 0, airT: 0,        // barrel radians + hang-time accumulated this air
        boost: 0, boosting: false,
        penalty: 0,                   // seconds of choked throttle left
        lap: 1, judged: new Array(N_GATES).fill(0), // 0 pending, 1 clean, -1 missed
        judgedEpoch: 0,
        progress: 0, progIdx: 0,
        targetArc: -1e6,            // unwrapped arc of the next pending gate (progress-based judging)
        targetIdx: 0,
        finished: false, finishT: 0,
        hits: 0,                      // rival-to-rival bumps (spark, no damage)
    }
}

const RIVALS = [
    { name: 'MAKO', color: 0xff5a3c, skill: 0.985 },
    { name: 'TUNDRA', color: 0xffc233, skill: 0.94 },
]

// Point + travel tangent at a signed arc position on the course line.
function pointAtArc(course, arc) {
    const L = course.len
    const a = ((arc % L) + L) % L
    const fi = (a / L) * N_SAMPLE
    const i = Math.floor(fi) % N_SAMPLE
    const j = (i + 1) % N_SAMPLE
    const f = fi - Math.floor(fi)
    const p = course.pts[i], q = course.pts[j]
    const tx = q.x - p.x, tz = q.z - p.z
    const tl = Math.hypot(tx, tz) || 1
    return {
        x: p.x + (q.x - p.x) * f,
        z: p.z + (q.z - p.z) * f,
        tangent: { x: tx / tl, z: tz / tl },
        idx: i,
    }
}

export function makeGame(seed, stage = 'sunny') {
    const course = buildCourse(seed)
    const sea0 = stage === 'storm' ? stormSea(seed >>> 0, 1) : sunnySea()
    // Grid forms BEHIND the start/finish line (gate 0) so every gate is met in
    // order 0..9 — line up, then everything the lap logic sees is ahead.
    const g0 = course.gates[0].arc
    const spawns = [g0 - 4, g0 - 9, g0 - 14]
    const crafts = [makeCraft(0, 'KAI', 0x2ee6c8, spawns[0], 1)]
    for (let i = 0; i < RIVALS.length; i++) {
        crafts.push(makeCraft(i + 1, RIVALS[i].name, RIVALS[i].color, spawns[i + 1], RIVALS[i].skill))
    }
    // snap spawn positions onto the course line
    for (const c of crafts) {
        const p = pointAtArc(course, c.arc)
        c.x = p.x; c.z = p.z
        c.heading = Math.atan2(p.tangent.x, p.tangent.z)
        c.progIdx = p.idx
        c.progress = c.arc
        c.y = heightAt(c.x, c.z, 0, sea0)
        c.targetArc = g0 > c.progress ? g0 : g0 + course.len
    }
    const gs = {
        tick: 0, t: 0, seed: seed >>> 0, rngS: (seed ^ 0x9e3779b9) >>> 0,
        course, crafts,
        stage,                                  // 'sunny' | 'storm'
        seaCur: sea0,                         // the table the bay rides now (outgoing during a front)
        seaTarget: sea0.map((w) => ({ ...w })), // swell-shift re-rolls land here
        front: null,                          // live squall front {dx,dz,h,prog,band} | null
        flash: 0, nextFlash: 0,              // storm lightning, sim-owned (seeded)
        rainOn: false,                      // Kai inside the band? drives the rain event (#3191)
        score: 0, done: false, rank: 1,
        startT: 0, lightPhase: 0,           // false-start lights: 3 reds then GO
        events: [],
    }
    if (stage === 'storm') {
        let x = ((seed >>> 0) ^ 0xc0ffee) >>> 0
        x = (x + 0x6d2b79f5) >>> 0
        x = Math.imul(x ^ (x >>> 15), x | 1)
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
        gs.nextFlash = 4 + (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 6
    }
    return gs
}

// Keep the unwrapped arc target of the next pending gate (or lap 2's gate 0
// once the set is complete). While the SAME gate is pending its target is
// frozen; only when pending advances does the target step forward (unwrapped
// past any lap already counted), so progress-based skips judge honestly.
function syncTarget(gs, c) {
    const g = gs.course.gates
    const pi = c.judged.findIndex((j) => j === 0)
    const idx = pi >= 0 ? pi : 0
    if (idx === c.targetIdx) return
    c.targetIdx = idx
    let u = g[idx].arc
    while (u <= c.targetArc + 1e-9) u += gs.course.len
    c.targetArc = u
}

// Gate judgement: side = heading × (craft − buoy); RED must read < 0 (buoy on
// the craft's right), YELLOW > 0. Heading from actual velocity when moving.
function judgeGate(gs, c, g, i) {
    const dx = c.x - g.x, dz = c.z - g.z
    const hx = Math.sin(c.heading), hz = Math.cos(c.heading)
    const side = hx * dz - hz * dx
    const want = g.color === 'red' ? -1 : 1
    const clean = side * want > 0
    c.judged[i] = clean ? 1 : -1
    if (clean) {
        c.boost = Math.min(1, c.boost + 0.10)
        if (c.id === 0) { gs.score += 100; gs.events.push({ t: gs.tick, type: 'pass', i }) }
    } else {
        c.penalty = PENALTY_T
        c.boost = Math.max(0, c.boost - 0.25)
        if (c.id === 0) gs.events.push({ t: gs.tick, type: 'miss', i })
    }
}

// --- rain: the squall as a field, not a wallpaper (#3191) ---------------------
// Intensity at any point = how far the front has passed it (frontW is the same
// weight the sea mix and the shader ride, so rain ≡ sea ≡ drawn). No front in
// STORM BAY ⇒ the whole bay is weather; SUNNY is always dry.
export function rainAt(gs, x, z) {
    if (gs.stage !== 'storm') return 0
    return gs.front ? frontW(x, z, gs.front) : 1
}
// The squall blows along the dominant swell of the sea it carries in — the
// same direction the drawn rain is slanted.
export function windAt(gs) {
    const w = (gs.front ? gs.seaTarget : gs.seaCur)[0]
    return { x: w.dx, z: w.dz }
}
// Seeded gusting without touching the rng stream: phase algebra on gs.t keeps
// replays byte-exact (the rng only carries tricks/lightning).
export function windGust(gs) {
    const s = (gs.seed >>> 0) % 97
    return 0.78 + 0.22 * Math.sin(gs.t * 1.7 + s * 0.64) * Math.sin(gs.t * 0.53 + 1.7)
}

// per-craft physics; pad = {throttle 0..1, steer -1..1, brake, a, b}
function stepCraft(gs, c, pad) {
    const g = gs.course.gates

    // --- gates & laps ------------------------------------------------------
    const pr = progressAt(gs.course, c.progIdx, c.progress, c.x, c.z)
    c.progress = pr.s; c.progIdx = pr.idx
    const nextPending = c.judged.findIndex((j) => j === 0)
    for (let i = 0; i < N_GATES; i++) {
        if (c.judged[i] !== 0) continue
        // Only the NEXT gate in order judges — a shortcut across the middle can
        // never pre-judge a gate it physically clipped (rung-2 exploit audit).
        if (i !== nextPending) continue
        const gt = g[i]
        const dx = c.x - gt.x, dz = c.z - gt.z
        const d2 = dx * dx + dz * dz
        if (d2 < GATE_R * GATE_R) { judgeGate(gs, c, gt, i); continue }
        // Past the gate line, unjudged ⇒ skipped — by geometry OR by course
        // progress. No lateral corridor: rung 1 let a craft skirt 40 m outside
        // the line unjudged; progress keeps boundary-crawlers honest too.
        const along = gt.tangent.x * dx + gt.tangent.z * dz
        if (along > SKIP_MARGIN || c.progress > c.targetArc + SKIP_MARGIN) {
            c.judged[i] = -1
            c.penalty = PENALTY_T
            if (c.id === 0) gs.events.push({ t: gs.tick, type: 'miss', i })
        }
    }
    if (c.judged.every((j) => j !== 0)) {
        c.lap += 1
        c.judgedEpoch += 1
        if (c.lap > LAPS && !c.finished) {
            c.finished = true
            c.finishT = gs.t
            if (c.id === 0) {
                gs.done = true
                const rank = rankAt(gs, 0)
                gs.rank = rank
                gs.score += rank === 1 ? 1500 : rank === 2 ? 900 : 500
                gs.score += Math.max(0, Math.round((240 - c.finishT) * 10)) // swift courses pay
                gs.events.push({ t: gs.tick, type: 'finish', rank })
            }
        } else if (c.id === 0) {
            gs.events.push({ t: gs.tick, type: 'lap', lap: c.lap })
            // STORM BAY: the swell re-rolls lap to lap (WR64's signature) —
            // rung 3: the new sea rides in behind a squall front. A front still
            // mid-bay completes first (deterministic snap, never two fronts).
            if (gs.stage === 'storm') {
                if (gs.front) { gs.seaCur = gs.seaTarget.map((w) => ({ ...w })); gs.front = null }
                gs.seaTarget = stormSea(gs.seed, c.lap)
                gs.front = makeFront(gs.seaTarget, RX + 26, RZ + 26)
                gs.events.push({ t: gs.tick, type: 'swell', lap: c.lap })
            }
        }
        c.judged = new Array(N_GATES).fill(0)
    }
    syncTarget(gs, c)

    // --- drive ---------------------------------------------------------------
    if (c.finished) { c.throttle = 0.25 } // coast across; keep it lively
    let cap = c.penalty > 0 ? PENALTY_CAP : 1
    c.penalty = Math.max(0, c.penalty - DT)
    c.throttle = pad.throttle * cap
    c.steer = pad.steer

    c.boosting = pad.b && c.boost > 0 && !c.finished
    const vCap = V_MAX * (c.boosting ? V_BOOST : 1) * (c.finished ? 0.7 : 1)
    if (c.boosting) c.boost = Math.max(0, c.boost - BOOST_DRAIN * DT)

    // rain is terrain (#3191): heavier air, slower top end
    const rain = rainAt(gs, c.x, c.z)
    c.rain = rain

    const brake = pad.brake ? 10 : 0
    c.speed += (THRUST * c.throttle - (DRAG + RAIN_DRAG * rain) * c.speed * c.speed - brake) * DT
    if (c.speed > vCap) c.speed = Math.max(vCap, c.speed - 8 * DT) // ease off, don't clip
    if (c.speed < 0) c.speed = 0

    // steering needs way on; lean lags the bar like a skiier's body
    const wantLean = c.steer * LEAN_MAX
    c.lean += (wantLean - c.lean) * Math.min(1, 7 * DT)
    const authority = c.speed / (c.speed + 3.2)
    c.heading += c.steer * TURN_K * authority * (c.airborne ? 0.35 : 1) * DT

    // --- hull on the swell ---------------------------------------------------
    // Rung 3: every sample is the front-mixed surface — the outgoing table
    // ahead of the squall, the incoming one behind it. The weights come from
    // the SAME frontW the vertex shader evaluates (seaGLSLFront/frontWeight).
    const old = gs.seaCur, next = gs.seaTarget, fr = gs.front
    const hS = (px, pz) => (fr ? mixHeight(px, pz, gs.t, old, next, frontW(px, pz, fr)) : heightAt(px, pz, gs.t, old))
    const surfY = hS(c.x, c.z)
    const surfVy = fr ? mixVy(c.x, c.z, gs.t, old, next, frontW(c.x, c.z, fr)) : surfaceVy(c.x, c.z, gs.t, old)
    if (c.airborne) {
        c.airT += DT
        c.vy -= G * DT
        c.y += c.vy * DT
        if (pad.a) c.spin += TRICK_RATE * DT
        if (Math.abs(c.steer) > 0.7) c.rollSpin += Math.sign(c.steer) * BARREL_RATE * DT
        if (c.y <= surfY) {
            c.airborne = false; c.y = surfY; c.vy = surfVy
            const spun = c.spin >= Math.PI * 2 - 0.6
            const rolled = Math.abs(c.rollSpin) >= Math.PI * 2 - 0.8
            if (spun) {
                c.trickPts = 1
                c.boost = Math.min(1, c.boost + 0.30)
                if (c.id === 0) { gs.score += 250; gs.events.push({ t: gs.tick, type: 'trick' }) }
            } else if (rolled) {
                // barrel roll: carved hard off a crest, landed clean
                c.boost = Math.min(1, c.boost + 0.22)
                if (c.id === 0) { gs.score += 200; gs.events.push({ t: gs.tick, type: 'barrel' }) }
            } else if (c.spin > 0.3 && c.id === 0) {
                gs.events.push({ t: gs.tick, type: 'splashes' })
            }
            // the hang-time pays: a landed trick banks its air (rung 3)
            if ((spun || rolled) && c.id === 0) {
                const airR = Math.round(c.airT * 100) / 100 // what the event reports
                const bonus = Math.min(AIR_BONUS_CAP, Math.round(airR * AIR_BONUS_RATE))
                if (bonus > 0) {
                    gs.score += bonus
                    gs.events.push({ t: gs.tick, type: 'airbonus', pts: bonus, airT: airR })
                }
            }
            c.spin = 0
            c.rollSpin = 0
            c.airT = 0
            c.speed *= 0.985 // slap the water, lose a whisper
        }
    } else {
        c.y = surfY
        c.vy = surfVy
        // a fast hull over a falling face leaves the bay behind it
        if (surfVy < (gs.stage === 'storm' ? LAUNCH_VY_STORM : LAUNCH_VY) && c.speed > 7.5 && !c.finished) {
            c.airborne = true
            c.airT = 0
            c.vy = surfVy * 0.85 + c.speed * 0.18 // carry off the crest: up, not down
            if (c.id === 0) gs.events.push({ t: gs.tick, type: 'air' })
        }
    }
    // attitude: pitch from the slope along the heading, roll from lean+beam slope
    const e = 1.4
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading)
    const ahead = hS(c.x + fx * e, c.z + fz * e)
    const astern = hS(c.x - fx * e, c.z - fz * e)
    const wantPitch = -Math.atan2(ahead - astern, 2 * e)
    c.pitch += (wantPitch - c.pitch) * Math.min(1, 6 * DT)
    const bx = Math.cos(c.heading), bz = -Math.sin(c.heading)
    const beam = hS(c.x + bx * e, c.z + bz * e) - hS(c.x - bx * e, c.z - bz * e)
    const wantRoll = c.lean + Math.atan2(beam, 2 * e)
    c.roll += (wantRoll - c.roll) * Math.min(1, 6 * DT)

    // integrate position on the surface plane — plus the squall's shove: the
    // hull drifts world-space along the wind, so holding the bar lets the
    // gust walk you off the racing line; counter-steering pays (#3191)
    if (rain > 0.02) {
        const wnd = windAt(gs)
        const drift = RAIN_PUSH * rain * windGust(gs)
        c.x += (fx * c.speed + wnd.x * drift) * DT
        c.z += (fz * c.speed + wnd.z * drift) * DT
    } else {
        c.x += fx * c.speed * DT
        c.z += fz * c.speed * DT
    }

    // bay bounds — an honest wall of the headland; scrape and slow
    const rr = (c.x / (RX + 26)) ** 2 + (c.z / (RZ + 26)) ** 2
    if (rr > 1) {
        const s = 1 / Math.sqrt(rr)
        c.x *= s; c.z *= s
        c.speed *= 0.90
    }
}

// --- rivals: waypoint autopilot over the SAME rules ---------------------------
function rivalPad(gs, c) {
    const g = gs.course.gates
    let i = c.judged.findIndex((j) => j === 0)
    if (i < 0) i = 0
    const gt = g[i]
    // aim at the correct side of the buoy: red ⇒ pass left of it, yellow right.
    // Rung 3: each rival keeps its own lateral line (MAKO tight and inside,
    // TUNDRA wider) — the pack reads as racing lines, not a conga.
    const lat = { x: gt.tangent.z, z: -gt.tangent.x } // left of travel
    const off = (gt.color === 'red' ? 1 : -1) * (c.id === 1 ? 2.3 : 3.6)
    const tx = gt.x + lat.x * off, tz = gt.z + lat.z * off
    const want = Math.atan2(tx - c.x, tz - c.z)
    let d = want - c.heading
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    const steer = Math.max(-1, Math.min(1, d / 0.55))
    // skill decides throttle discipline in the turns and when to send it
    const corner = Math.abs(d) > 0.5 && c.speed > 11 ? 0.55 : 1
    const throttle = corner * c.skill + (gs.t > 3 ? 0.02 * (rand(gs) - 0.5) : 0)
    // tricks on big air: a seeded maybe, held for the whole air pocket
    let a = false
    if (c.airborne) a = c.trickArmed === 1
    if (!c.airborne && c.vy < -1.2 && rand(gs) < 0.004) c.trickArmed = 1
    if (!c.airborne && c.vy > 0) c.trickArmed = 0
    const b = c.boost > 0.5 && Math.abs(d) < 0.25 && !c.finished
    return { throttle: Math.min(1, throttle), steer, brake: false, a, b }
}

// --- the attract/check autopilot (drives slot 0 — Kai) ------------------------
// Same head as the rivals, tuned to Kai at full skill: it proves the course is
// drivable and the harness can WIN the race headless.
export function autoPad(gs) {
    const c = gs.crafts[0]
    const g = gs.course.gates
    let i = c.judged.findIndex((j) => j === 0)
    if (i < 0) i = 0
    const gt = g[i]
    const lat = { x: gt.tangent.z, z: -gt.tangent.x } // left of travel
    const off = gt.color === 'red' ? 2.2 : -2.2
    const tx = gt.x + lat.x * off, tz = gt.z + lat.z * off
    const want = Math.atan2(tx - c.x, tz - c.z)
    let d = want - c.heading
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    const steer = Math.max(-1, Math.min(1, d / 0.5))
    const throttle = Math.abs(d) > 0.55 && c.speed > 12 ? 0.5 : 1
    // tricks are the point: flat-spin in clean air, barrel-roll on carved crests
    const a = c.airborne && Math.abs(steer) < 0.5
    const b = c.boost > 0.3 && Math.abs(d) < 0.25 && !c.finished
    return { throttle, steer, brake: false, a, b }
}

export function rankAt(gs, id) {
    const order = [...gs.crafts].sort((a, b) => {
        if (a.finished && b.finished) return a.finishT - b.finishT
        if (a.finished) return -1
        if (b.finished) return 1
        return b.progress - a.progress
    })
    return order.findIndex((c) => c.id === id) + 1
}

// rival-vs-rival and rival-vs-player proximity: spark, shove, noise.
function bumpPass(gs) {
    const cs = gs.crafts
    for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
            const a = cs[i], b = cs[j]
            const dx = b.x - a.x, dz = b.z - a.z
            const d2 = dx * dx + dz * dz
            if (d2 < 2.4 * 2.4 && d2 > 0.0001) {
                const d = Math.sqrt(d2), nx = dx / d, nz = dz / d
                const push = (2.4 - d) * 0.5
                a.x -= nx * push; a.z -= nz * push
                b.x += nx * push; b.z += nz * push
                a.speed *= 0.985; b.speed *= 0.985
                a.hits += 1; b.hits += 1
                if ((a.id === 0 || b.id === 0) && gs.tick % 12 === 0) {
                    gs.events.push({ t: gs.tick, type: 'bump' })
                }
            }
        }
    }
}

// --- one world tick -------------------------------------------------------------
export function step(gs, padIn) {
    gs.events = []
    // false-start lights: 1.4 s of reds, then GO. Throttle early costs nothing
    // here (WR64 hauled you back; we just hold the boats).
    gs.lightPhase = gs.t < 1.4 ? gs.t / 1.4 : 1
    const gatesOpen = gs.lightPhase >= 1

    // Rung 3: no more whole-bay blend. A live squall front advances at
    // FRONT_SPEED; hull sampling (stepCraft) and the shader (front uniforms)
    // both read gs.front, so drawn ≡ ridden across the transition. When the
    // band clears the far side, the incoming table becomes the current one.
    if (gs.front) {
        gs.front.prog += FRONT_SPEED * DT
        if (gs.front.prog >= 2 * gs.front.h + gs.front.band) {
            gs.seaCur = gs.seaTarget.map((w) => ({ ...w }))
            gs.front = null
            gs.events.push({ t: gs.tick, type: 'frontDone' })
        }
    }
    if (gs.stage === 'storm') {
        gs.nextFlash -= DT
        if (gs.nextFlash <= 0) {
            gs.flash = 1
            gs.events.push({ t: gs.tick, type: 'flash' })
            gs.nextFlash = 5 + rand(gs) * 9
        }
        gs.flash = Math.max(0, gs.flash - DT * 3.2)
    }

    gs.crafts.forEach((c, idx) => {
        const pad = c.id === 0
            ? (gatesOpen ? padIn : { throttle: 0, steer: 0, brake: false, a: false, b: false })
            : (gatesOpen ? rivalPad(gs, c) : { throttle: 0, steer: 0, brake: false, a: false, b: false })
        pad.throttle = Math.max(0, Math.min(1, pad.throttle))
        pad.steer = Math.max(-1, Math.min(1, pad.steer))
        stepCraft(gs, c, pad)
        void idx
    })
    bumpPass(gs)

    // crossing the band edge answers with an event (#3191) — the shell turns it
    // into the wind sweep; hysteresis at 0.5 keeps it from chattering
    const kaiOn = gs.crafts[0].rain >= 0.5
    if (kaiOn !== gs.rainOn) {
        gs.rainOn = kaiOn
        gs.events.push({ t: gs.tick, type: 'rain', on: kaiOn })
    }

    gs.rank = rankAt(gs, 0)
    gs.score = Math.max(gs.score, 0)
    gs.t += DT
    gs.tick += 1
    return gs
}

// --- state / hash for the contract and checks -----------------------------------
export function stateOf(gs) {
    const p = gs.crafts[0]
    return {
        tick: gs.tick, score: gs.score, done: gs.done, seed: gs.seed,
        t: Math.round(gs.t * 100) / 100,
        lap: Math.min(p.lap, LAPS), rank: gs.rank,
        speed: Math.round(p.speed * 100) / 100,
        rain: Math.round(p.rain * 100) / 100,  // squall at Kai's hull (#3191)
        boost: Math.round(p.boost * 100) / 100,
        airborne: p.airborne, penalty: p.penalty > 0,
        stage: gs.stage,
        // swell as KAI feels it: front-mixed dominant amplitude at the hull
        swell: Math.round((gs.seaCur[0].amp + (gs.seaTarget[0].amp - gs.seaCur[0].amp) * frontW(gs.crafts[0].x, gs.crafts[0].z, gs.front)) * 100) / 100,
        frontPct: gs.front ? Math.round(Math.min(1, gs.front.prog / (2 * gs.front.h + gs.front.band)) * 100) : 0,
        flash: gs.flash > 0,
        hash: stateHash(gs),
    }
}

export function stateHash(gs) {
    let h = 0x811c9dc5
    const mix = (n) => {
        h ^= n & 0xff; h = Math.imul(h, 0x01000193) >>> 0
        h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0
        h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193) >>> 0
        h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193) >>> 0
    }
    mix(gs.tick); mix(gs.score >>> 0)
    mix(gs.stage === 'storm' ? 1 : 0)
    for (const w of gs.seaCur) { mix(Math.round(w.amp * 100)); mix(Math.round(w.len * 100)); mix(Math.round(w.phase * 100)) }
    for (const w of gs.seaTarget) { mix(Math.round(w.amp * 100)); mix(Math.round(w.len * 100)) }
    mix(gs.front ? Math.round(gs.front.prog * 100) : -1)
    mix(Math.round(gs.flash * 100))
    for (const c of gs.crafts) {
        mix(Math.round(c.x * 100)); mix(Math.round(c.z * 100)); mix(Math.round(c.speed * 50))
        mix(Math.round(c.rain * 100))
        mix(c.lap); mix(c.judged.reduce((a, j) => a * 3 + j + 1, 0) >>> 0)
        mix(c.airborne ? 1 : 0); mix(Math.round(c.spin * 100)); mix(Math.round(c.rollSpin * 100))
    }
    mix(gs.rngS)
    return h >>> 0
}

// WAVES is re-exported so the check can pin the CPU/GLSL shared table shape.
export { WAVES }
