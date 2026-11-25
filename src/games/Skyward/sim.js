// SKYWARD — the school, in pure sim: 60 Hz, seed-deterministic, zero DOM,
// zero Math.random (events[] is juice-only and never reaches the hash).
//
// Free flight is the resting state: you cruise Gullwing Isle in the school
// plane. Fly to a glowing marker and press A to check out that event:
//   RING RUN  (plane)  — thread 8 rings over the bay; +100 each, under-par
//                         finishes pay a time bonus up to 200.
//   SPOT LANDING (glider) — launched off the saddle, ride the thermals, put it
//                         on the bullseye: 1000 → 60 by distance band.
//   TARGET DROP (belt) — skim the east coast low and drop three supply crates
//                         onto the sand pads; accuracy scores.
//   THUNDERPASS (plane, rung 2) — five gates driven THROUGH the storm cell:
//                         gusts, core downdraft and buffet fight the whole line.
//                         +140/gate, time bonus to 300; clear all five for the
//                         STORM WINGS badge (the licence math stays core-three).
// Score all three once and you graduate — WINGS, or ACE at ≥2400 of 2999.
// The school is forgiving: a crash only puts you back where you started.

import { makeWorld, G } from './world.js'

export const FIXED_DT = 1000 / 60
export const CFG = {
    RING_R: 9,
    RING_PAR: 30,
    PAD_BANDS: [[4.5, 1000], [9, 700], [15, 450], [24, 200]],
    PAD_LAND: 30,
    DROP_BANDS: [[4.5, 333], [8, 222], [13, 111]],
    RING_MAX: 1000, DROP_MAX: 999,
    PASS_R: 11, PASS_PAR: 30, PASS_MAX: 1000,
    ACE: 2400, WINGS: 1500,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

// the harness / DebugKit entry: check out an event directly (the same path
// the A-at-marker shortcut takes), so proofs and the F1 panel don't need to
// fly the approach first.
export function checkout(g, m) { startEvent(g, m); return g }
export function recycleCraft(g) { recycle(g); return g }
export { placePlaneAtStart, placeRingStart, placeGliderLaunch, placeBeltStart }

export function randomSeed() {
    // only ever called OUTSIDE the sim (the shell's default seed)
    return (Date.now() ^ (Math.floor(performance?.now?.() ?? 0) * 0x1000000000)) >>> 0
}

export function makeGame(seed, opts = {}) {
    const world = makeWorld(seed)
    const g = {
        seed: seed >>> 0,
        tick: 0, t: 0, score: 0, done: false,
        phase: 'free',
        craft: 'plane',
        // the hull: heading (yaw, 0 = +z), pitch (+ = nose up), roll (+ = right)
        p: { x: -80, y: 36, z: 300 },
        vel: { x: 0, y: 0, z: 0 },
        heading: Math.PI, pitch: 0, roll: 0, speed: 34,
        vy: 0, thrusting: false,
        throttle: 1,
        ringsPassed: 0, ringTimes: [], eventT: 0, par: CFG.RING_PAR,
        grad: { ring: null, spot: null, drop: null, pass: null },
        license: null,
        stormWings: false,
        passIdx: 0,
        attempts: 0, crashes: 0,
        dropIdx: 0, crates: [], dropped: [],
        spotState: 'idle',  // idle | flying | landed | splashed
        respawnT: 0, ditchT: 0,
        lastSafe: { x: 0, y: 34, z: 320, heading: Math.PI },
        events: [],
        _prevA: false, _prevB: false,
        _zPrev: 300, // last tick's z — ring near-miss crossing detector (juice only)
        lift: 0,     // thermal lift on the craft right now (HUD/audio only)
        windEase: 0,
        stormS: 0, // how deep the craft is in the cell (renderer/HUD only)
        hash: 0,
    }
    if (opts.attract) g.attract = true
    g.world = world
    return g
}

function ev(g, kind, data = {}) { g.events.push({ kind, ...data }) }

// ── craft placements ────────────────────────────────────────────────────────
function placePlaneAtStart(g) {
    const w = g.world
    g.craft = 'plane'
    g.p = { x: -80, y: 36, z: 300 }
    g.heading = Math.PI // fly north, over the isle
    g.pitch = 0; g.roll = 0; g.speed = 34; g.vy = 0
    g.lastSafe = { ...g.p, heading: g.heading }
    void w
}
function placeRingStart(g) {
    g.craft = 'plane'
    const r0 = g.world.rings[0]
    g.p = { x: r0.x, y: r0.y + 14, z: r0.z - 150 }
    g.heading = 0 // face south DOWN the ring line (rings run +z)
    g.pitch = 0; g.roll = 0; g.speed = 38; g.vy = 0
    g.ringsPassed = 0; g.ringTimes = []; g.eventT = 0
    g._zPrev = g.p.z
    g.lastSafe = { x: g.p.x, y: Math.max(g.p.y, 24), z: g.p.z, heading: g.heading }
}
function placeGliderLaunch(g) {
    g.craft = 'glider'
    const L = g.world.launch
    const y = g.world.terrainHeight(L.x, L.z) + 42
    g.p = { x: L.x, y, z: L.z }
    g.heading = 0; g.pitch = 0.12; g.roll = 0; g.speed = 12; g.vy = -1
    g.spotState = 'flying'
}
function placeBeltStart(g) {
    g.craft = 'belt'
    const s = g.world.school
    g.p = { x: s.x + 30, y: 18, z: s.z + 40 }
    g.heading = 0; g.pitch = 0; g.roll = 0; g.speed = 0; g.vy = 0
    g.dropIdx = 0; g.crates = []; g.dropped = []
}
function placePassStart(g) {
    g.craft = 'plane'
    const s = g.world.passStart
    g.p = { x: s.x, y: 26, z: s.z }
    g.heading = Math.PI / 2 // face east, straight at the storm front
    g.pitch = 0; g.roll = 0; g.speed = 38; g.vy = 0
    g.passIdx = 0; g.passTimes = []; g.eventT = 0
    g.lastSafe = { x: s.x, y: 26, z: s.z, heading: Math.PI / 2 }
}

// ── markers: which launch is the player near ───────────────────────────────
export function markerNear(g) {
    if (g.phase !== 'free') return null
    const { rings, launch, school, passStart } = g.world
    const ringsGate = { x: rings[0].x, z: rings[0].z - 150 }
    const near = (x, z, r) => Math.hypot(g.p.x - x, g.p.z - z) < r
    if (g.craft === 'plane' && near(ringsGate.x, ringsGate.z, 60)) return 'ring'
    if (g.craft === 'plane' && near(launch.x, launch.z, 55) && g.p.y > g.world.terrainHeight(launch.x, launch.z) + 60) return 'spot'
    if (g.craft === 'plane' && near(school.x + 30, school.z + 40, 55)) return 'drop'
    if (g.craft === 'plane' && near(passStart.x, passStart.z, 70)) return 'pass'
    return null
}

function crash(g, where) {
    g.crashes++
    ev(g, 'crash')
    if (g.phase === 'ring') {
        const r = g.world.rings[Math.max(0, g.ringsPassed - 1)]
        g.p = { x: r.x, y: r.y + 10, z: r.z - 60 }
        g.heading = 0; g.pitch = 0; g.roll = 0; g.speed = 34; g.vy = 0
        g.respawnT = 1.0
    } else if (g.phase === 'drop') {
        const keepCrates = g.crates
        placeBeltStart(g)
        g.crates = keepCrates // crates already away keep flying; only the rest re-sit
        g.dropIdx = Math.max(g.dropped.length, keepCrates.length ? keepCrates[keepCrates.length - 1].target + 1 : 0)
        g.respawnT = 1.0
    } else if (g.phase === 'pass') {
        const pg = g.world.passRings[Math.max(0, g.passIdx)]
        g.p = { x: pg.x, y: pg.y + 12, z: pg.z - 60 }
        g.heading = Math.PI / 2; g.pitch = 0; g.roll = 0; g.speed = 34; g.vy = 0
        g.respawnT = 1.0
    } else if (g.phase === 'spot') {
        placeGliderLaunch(g)
        g.attempts++
        g.respawnT = 0.8
    } else {
        placePlaneAtStart(g)
        g.respawnT = 1.0
    }
    void where
}

// the ground crew: B at the school apron hands you the next craft in the
// syllabus — plane → belt → glider → plane. The glider is driven up to the
// saddle; the belt and plane are handed over on the apron itself.
function recycle(g) {
    const order = ['plane', 'belt', 'glider']
    const next = order[(order.indexOf(g.craft) + 1) % 3]
    if (next === 'plane') {
        g.craft = 'plane'
        g.p = { x: g.world.school.x - 40, y: 26, z: g.world.school.z - 30 }
        g.heading = Math.PI; g.pitch = 0; g.roll = 0; g.speed = 30; g.vy = 0
    } else if (next === 'belt') {
        placeBeltStart(g)
    } else {
        placeGliderLaunch(g)
    }
    g.respawnT = 0.5
    ev(g, 'switch', { craft: next })
}

// ── one tick ────────────────────────────────────────────────────────────────
export function step(g, pad = {}) {
    const dt = FIXED_DT / 1000
    g.t += dt; g.tick++
    const w = g.world
    const a = !!pad.a, b = !!pad.b
    const sx = clamp(pad.x ?? ((pad.right ? 1 : 0) - (pad.left ? 1 : 0)), -1, 1)
    const sy = clamp(pad.y ?? ((pad.up ? 1 : 0) - (pad.down ? 1 : 0)), -1, 1)

    if (g.respawnT > 0) g.respawnT = Math.max(0, g.respawnT - dt)

    if (g.craft === 'plane') { g.lift = 0; stepPlane(g, w, sx, sy, dt) }
    else if (g.craft === 'glider') stepGlider(g, w, sx, sy, dt)
    else { g.lift = 0; stepBelt(g, w, sx, sy, a, dt) }

    // marker activation (edge on A near a launch point, free flight only)
    const m = markerNear(g)
    g.marker = m
    if (a && !g._prevA && m && !g.done) startEvent(g, m)
    if (b && !g._prevB && g.phase === 'drop') dropCrate(g)
    if (b && !g._prevB && g.phase === 'free' && !g.done && g.respawnT <= 0
        && Math.hypot(g.p.x - w.school.x, g.p.z - w.school.z) < 74) recycle(g)
    g._prevA = a; g._prevB = b

    if (g.phase === 'ring' || g.phase === 'pass') g.eventT += dt

    cratesFly(g, w, dt)
    g.hash = stateHash(g)
    return g
}

function startEvent(g, m) {
    if (m === 'ring') {
        g.phase = 'ring'
        placeRingStart(g)
        ev(g, 'start', { event: 'RING RUN' })
    } else if (m === 'spot') {
        g.phase = 'spot'
        g.grad.spot = null // re-sitting improves the score; it stays banked only when better
        placeGliderLaunch(g)
        ev(g, 'start', { event: 'SPOT LANDING' })
    } else if (m === 'drop') {
        g.phase = 'drop'
        placeBeltStart(g)
        ev(g, 'start', { event: 'TARGET DROP' })
    } else if (m === 'pass') {
        g.phase = 'pass'
        placePassStart(g)
        ev(g, 'start', { event: 'THUNDERPASS' })
    }
}

function finishEvent(g, kind, gained, label) {
    g.phase = 'free'
    g.grad[kind] = Math.max(g.grad[kind] ?? 0, gained)
    g.score = (g.grad.ring ?? 0) + (g.grad.spot ?? 0) + (g.grad.drop ?? 0)
    if (kind === 'pass') g.stormWings = true
    ev(g, 'finish', { event: label ?? kind, gained })
    if (g.grad.ring != null && g.grad.spot != null && g.grad.drop != null) {
        g.done = true
        g.license = g.score >= CFG.ACE ? 'ACE' : g.score >= CFG.WINGS ? 'WINGS' : 'STUDENT'
        ev(g, 'graduate', { score: g.score, license: g.license })
    }
}

// banked drop score = sum of crate hits
function getDropScore(g) { return g.dropped.reduce((s, d) => s + d.score, 0) }

// ── the plane ───────────────────────────────────────────────────────────────
function stepPlane(g, w, sx, sy, dt) {
    g.speed += (0.0212 * (38 * 38 - g.speed * g.speed) / 38) * dt * 60 * 0.25
    const targetRoll = sx * 0.85
    g.roll = lerp(g.roll, targetRoll, 0.14)
    const stall = g.speed < 18
    const targetPitch = stall ? -0.3 : sy * 0.42
    g.pitch = lerp(g.pitch, targetPitch, 0.1)
    if (g.roll !== 0) g.heading += Math.sin(g.roll) * (32 / Math.max(g.speed, 12)) * dt * 0.62
    const dirX = Math.sin(g.heading), dirZ = Math.cos(g.heading)
    const dirY = Math.sin(g.pitch)
    g.speed = clamp(g.speed + (-G * dirY) * dt, 6, 60)
    g.vy = g.speed * dirY
    const wind = w.wind
    g.p.x += (dirX * g.speed + wind.x) * dt
    g.p.z += (dirZ * g.speed + wind.z) * dt
    g.p.y += g.vy * dt

    // rung 2 — the storm is REAL for the plane: gusts shove the hull, the
    // core downdraft pulls it down, buffet rattles the wings. (Rung 1: only
    // the glider and the belt answered the cell.)
    const st = w.stormAt(g.p.x, g.p.z, g.t)
    g.stormS = st.s
    if (st.s > 0.02) {
        g.p.x += st.gust.x * 0.8 * dt
        g.p.z += st.gust.z * 0.8 * dt
        g.p.y += st.vy * 0.6 * dt
        g.roll += st.gust.x * 0.012 * Math.sin(g.t * 11.3)
        g.pitch = clamp(g.pitch + st.gust.z * 0.010 * Math.sin(g.t * 9.7), -0.6, 0.6)
    }

    const floor = Math.max(w.terrainHeight(g.p.x, g.p.z), w.waterHeightAt(g.p.x, g.p.z, g.t))
    if (g.p.y < floor + 1.4) {
        const overWater = w.terrainHeight(g.p.x, g.p.z) < 0.5
        if (overWater && g.vy > -5.5 && g.speed < 32) {
            // ditch: bob on the swell, then claw back airborne
            g.p.y = w.waterHeightAt(g.p.x, g.p.z, g.t) + 0.5
            g.speed *= 0.985
            g.vy = Math.max(g.vy, w.waterVy(g.p.x, g.p.z, g.t))
            g.ditchT = 2.2
            ev(g, 'splash')
        } else {
            crash(g, 'plane')
        }
    } else if (g.ditchT > 0) {
        g.ditchT -= dt
        g.speed = Math.max(g.speed, 22)
    }
    if (g.respawnT > 0) return

    // ring judgement — only the ACTIVE ring counts, clean pass on proximity;
    // missing it while crossing the ring plane close is a NEAR MISS: a juice
    // event only (never scored, never hashed) so the cabinet can whistle. (#3138)
    if (g.phase === 'ring' && g.ringsPassed < g.world.rings.length) {
        const r = g.world.rings[g.ringsPassed]
        const d = Math.hypot(g.p.x - r.x, g.p.y - r.y, g.p.z - r.z)
        if (d < CFG.RING_R + 1.5) {
            g.ringsPassed++
            g.ringTimes.push(g.eventT)
            ev(g, 'ring', { idx: g.ringsPassed })
            g.lastSafe = { x: r.x, y: r.y + 10, z: r.z - 30, heading: 0 }
            if (g.ringsPassed === g.world.rings.length) {
                const bonus = clamp(Math.round((g.par - g.eventT) * 12), 0, 200)
                finishEvent(g, 'ring', g.world.rings.length * 100 + bonus)
            }
        } else if (d < CFG.RING_R + 7.5 && g.p.z >= r.z && g._zPrev < r.z) {
            ev(g, 'near', { idx: g.ringsPassed + 1, d: +d.toFixed(1) })
        }
    }
    g._zPrev = g.p.z

    // thunderpass — sequence-law gates driven through the cell
    if (g.phase === 'pass' && g.passIdx < w.passRings.length) {
        const pg = w.passRings[g.passIdx]
        if (Math.hypot(g.p.x - pg.x, g.p.y - pg.y, g.p.z - pg.z) < CFG.PASS_R + 2.5) {
            g.passIdx++
            g.passTimes.push(g.eventT)
            ev(g, 'gate', { idx: g.passIdx })
            g.lastSafe = { x: pg.x, y: pg.y + 10, z: pg.z, heading: Math.PI / 2 }
            if (g.passIdx === w.passRings.length) {
                const bonus = clamp(Math.round((CFG.PASS_PAR - g.eventT) * 15), 0, 300)
                finishEvent(g, 'pass', w.passRings.length * 140 + bonus, 'THUNDERPASS')
            }
        }
    }
    void sx
}

// ── the hang glider ─────────────────────────────────────────────────────────
function sinkOf(v) { return 1.2 + 0.014 * (v - 10.5) * (v - 10.5) }
function stepGlider(g, w, sx, sy, dt) {
    g.roll = lerp(g.roll, sx * 1.05, 0.12)
    if (g.roll !== 0) g.heading += Math.sin(g.roll) * (6 / Math.max(g.speed, 7)) * dt
    const targetSpeed = 10.5 + (sy < 0 ? -sy * 7 : 0) - sy * 2.2 // nose-down pushes speed
    g.speed = lerp(g.speed, clamp(targetSpeed, 7, 19), 0.06)
    const storm = w.stormAt(g.p.x, g.p.z, g.t)
    g.stormS = storm.s // #3272: the bed follows EVERY craft, not just the plane
    g.lift = w.thermalLift(g.p.x, g.p.z, g.t)
    g.vy = -sinkOf(g.speed) + g.lift + storm.vy
    const dirX = Math.sin(g.heading), dirZ = Math.cos(g.heading)
    g.p.x += (dirX * g.speed + w.wind.x + storm.gust.x) * dt
    g.p.z += (dirZ * g.speed + w.wind.z + storm.gust.z) * dt
    g.p.y += g.vy * dt
    if (Math.abs(g.vy) > 0.6) g.pitch = clamp(-g.vy * 0.09, -0.5, 0.4)

    if (g.respawnT > 0 || g.spotState !== 'flying') return

    // the floor is the SEA where there is sea — otherwise the glider sinks
    // through the surf and splashes eight metres down at the sea floor
    const ter = w.terrainHeight(g.p.x, g.p.z)
    const gh = g.p.y - Math.max(ter, w.waterHeightAt(g.p.x, g.p.z, g.t))
    if (gh < 0.7) {
        const padD = Math.hypot(g.p.x - w.pad.x, g.p.z - w.pad.z)
        if (ter < 0.4) { ev(g, 'splash'); g.spotState = 'splashed'; crash(g, 'sea') ; return }
        const soft = g.vy > -4.2 && g.speed < 12.5
        if (!soft) { g.spotState = 'landed'; ev(g, 'tumble'); crash(g, 'glider-tumble'); return }
        g.spotState = 'landed'
        let score = 60
        for (const [rad, pts] of CFG.PAD_BANDS) if (padD <= rad) { score = pts; break }
        ev(g, 'land', { padD: +padD.toFixed(1), score })
        finishEvent(g, 'spot', score)
    }
}

// ── the rocket belt ─────────────────────────────────────────────────────────
function stepBelt(g, w, sx, sy, a, dt) {
    g.thrusting = !!a // the belt always answers the throttle, even mid-respawn
    // heading-relative stick: x banks/turns, y pitches the thrust vector
    g.heading += sx * 0.85 * dt
    g.roll = lerp(g.roll, sx * 0.5, 0.16)
    g.pitch = lerp(g.pitch, sy * 0.5, 0.16)
    const fwdX = Math.sin(g.heading), fwdZ = Math.cos(g.heading)
    const rgtX = Math.cos(g.heading), rgtZ = -Math.sin(g.heading)
    const tiltA = Math.hypot(sx, sy) * 0.5 // how far the nozzle leans
    const T = g.thrusting ? 15.4 : 0
    const storm = w.stormAt(g.p.x, g.p.z, g.t)
    g.stormS = storm.s // #3272: the bed follows EVERY craft, not just the plane
    const desX = (fwdX * sy + rgtX * sx) * 17
    const desZ = (fwdZ * sy + rgtZ * sx) * 17
    g.vel.x = lerp(g.vel.x, desX + w.wind.x * 0.35 + storm.gust.x * 0.55, 0.05)
    g.vel.z = lerp(g.vel.z, desZ + w.wind.z * 0.35 + storm.gust.z * 0.55, 0.05)
    g.vy = clamp(g.vy + (T * Math.cos(tiltA) - G + storm.vy * 0.5) * dt, -18, 18)
    g.p.x += g.vel.x * dt
    g.p.z += g.vel.z * dt
    g.p.y += g.vy * dt
    g.speed = Math.hypot(g.vel.x, g.vel.z)

    const ter = w.terrainHeight(g.p.x, g.p.z)
    const floor = Math.max(ter, w.waterHeightAt(g.p.x, g.p.z, g.t))
    if (g.p.y < floor + 0.8) {
        if (g.vy < -5.2 || g.speed > 10) { crash(g, 'belt') ; return }
        g.p.y = floor + 0.8
        g.vy = Math.max(g.vy, 0)
        g.vel.x *= 0.6; g.vel.z *= 0.6
    }
    if (g.respawnT > 0) return

    // target judgement happens when the crate lands (cratesFly)
    if (g.phase === 'drop' && g.dropIdx >= w.targets.length && g.crates.length === 0) {
        finishEvent(g, 'drop', getDropScore(g))
    }
}

function dropCrate(g) {
    if (g.phase !== 'drop' || g.dropIdx >= g.world.targets.length || g.respawnT > 0) return
    g.crates.push({
        x: g.p.x, y: g.p.y - 1, z: g.p.z,
        vx: g.vel.x, vy: Math.min(g.vy, 0) - 1, vz: g.vel.z,
        target: g.dropIdx,
    })
    g.dropIdx++
    ev(g, 'drop', { idx: g.dropIdx })
}

function cratesFly(g, w, dt) {
    const keep = []
    for (const c of g.crates) {
        c.vy = Math.max(c.vy - G * dt * 0.55, -14)
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt
        const ter = w.terrainHeight(c.x, c.z)
        const floor = Math.max(ter, w.waterHeightAt(c.x, c.z, g.t))
        if (c.y <= floor + 0.2) {
            const t = w.targets[c.target]
            const d = Math.hypot(c.x - t.x, c.z - t.z)
            let score = 0
            for (const [rad, pts] of CFG.DROP_BANDS) if (d <= rad) { score = pts; break }
            g.dropped.push({ target: c.target, d: +d.toFixed(1), score })
            ev(g, 'hit', { target: c.target, d: +d.toFixed(1), score })
            if (g.dropIdx >= w.targets.length && keep.length === 0) {
                finishEvent(g, 'drop', getDropScore(g))
            }
        } else keep.push(c)
    }
    g.crates = keep
}

// ── storm audio law (#3272 items 1+4) ──────────────────────────────────────
// Pure rules kept OUT of the cabinet so skywardcheck can pin them, exactly
// like the lift→shimmer pairing (#3138): the sim exposes the hull's depth in
// the cell, these numbers decide what the ears get. stormBed maps depth to a
// continuous rain-rumble bed — quiet and dark at the edge, loud and bright at
// the core (rain is both). stormCue holds the edge laws with hysteresis so a
// hull buffeting at a threshold can't machine-gun: crossing into the core
// (≥0.50, armed below 0.38) stings; first rise onto the cell (≥0.06, armed
// below 0.045) warns — the free-flight telegraph the cell never had.
export function stormBed(s) {
    const d = Number.isFinite(s) ? clamp(s, 0, 1) : 0
    if (d <= 0.02) return { gain: 0, cut: 0 }
    return { gain: +(0.006 + 0.048 * d * d).toFixed(4), cut: Math.round(240 + 760 * d) }
}

export function stormCue(s, prevS) {
    const a = Number.isFinite(s) ? s : 0
    const b = Number.isFinite(prevS) ? prevS : 0
    if (a >= 0.5 && b < 0.38) return 'core'
    if (a >= 0.06 && b < 0.045) return 'warn'
    return null
}

// ── engine audio law (#3295) ───────────────────────────────────────────────
// The other half of the old honest-gap bullet: the motor was per-action, the
// rain bed (#3272) was the first sustained channel — now the engine follows
// the same shape, as a pure law the cabinet rides every frame. engineBed maps
// what the hull is DOING to a continuous hum: for the plane the throttle the
// pilot never had is airspeed + climb load (a fast or climbing hull is a
// working engine — louder and brighter; a deep-stall hull nearly cuts out and
// re-spools on recovery); the belt answers its fan directly (thrusting bites
// a whole tone higher); and the glider is motorless — its silence is the rule
// the bed teaches, wind and rain keep the sky alone. Deep rain DUCKS the motor
// (×(1−0.5·depth)) instead of duelling it: at the core the rain owns the mix.
// `raw` is the pre-duck gain so the edge cues can't be fooled by the storm.
// Cue law holds the #3272 hysteresis idiom: spool rises from near-silence
// (armed below 0.006, fires at ≥0.012 — boarding after gliding, the game's
// first tick, a stall recovered); cut is a true death to zero (glider on).
export function engineBed(craft, speed, vy, thrusting, stormS) {
    const d = Number.isFinite(stormS) ? clamp(stormS, 0, 1) : 0
    const v = Number.isFinite(speed) ? speed : 0
    const climb = Number.isFinite(vy) && vy > 0 ? vy : 0
    let raw = 0, freq = 0
    if (craft === 'plane') {
        const load = clamp((v - 22) / 26 + climb * 0.025, 0, 1)
        raw = 0.004 + 0.030 * load
        freq = 64 + 86 * load
    } else if (craft === 'belt') {
        raw = thrusting ? 0.026 : 0.014
        freq = thrusting ? 128 : 92
    } // glider: no motor, no bed — {gain 0, freq 0}
    return { gain: +(raw * (1 - 0.5 * d)).toFixed(4), freq: Math.round(freq), raw: +raw.toFixed(4) }
}

export function engineCue(raw, prevRaw) {
    const a = Number.isFinite(raw) ? raw : 0
    const b = Number.isFinite(prevRaw) ? prevRaw : 0
    if (b < 0.006 && a >= 0.012) return 'spool'
    if (b > 0 && a <= 0) return 'cut'
    return null
}

// ── state for the contract / harness ───────────────────────────────────────
export function stateOf(g) {
    return {
        tick: g.tick, score: g.score, done: g.done,
        phase: g.phase, craft: g.craft,
        x: +g.p.x.toFixed(2), y: +g.p.y.toFixed(2), z: +g.p.z.toFixed(2),
        heading: +g.heading.toFixed(3), speed: +g.speed.toFixed(2), vy: +g.vy.toFixed(2),
        ringsPassed: g.ringsPassed, eventT: +g.eventT.toFixed(2),
        grad: { ...g.grad }, license: g.license, crashes: g.crashes,
        dropped: g.dropped.length, marker: g.marker ?? null,
        passIdx: g.passIdx, stormWings: !!g.stormWings, stormS: +g.stormS.toFixed(2),
        hash: g.hash, seed: g.seed,
    }
}

function stateHash(g) {
    // FNV-1a over the quantized sim spine — the replay/re-record proof
    const q = (v) => Math.round(v * 1000) | 0
    const nums = [
        g.tick, g.score | 0, g.done ? 1 : 0,
        q(g.p.x), q(g.p.y), q(g.p.z), q(g.heading), q(g.speed), q(g.vy),
        g.ringsPassed, q(g.eventT), g.crashes, g.dropIdx,
        g.grad.ring ?? -1, g.grad.spot ?? -1, g.grad.drop ?? -1,
        g.passIdx, g.grad.pass ?? -1,
        g.phase.charCodeAt(0) + g.craft.charCodeAt(0), g.dropped.length,
    ]
    let h = 0x811c9dc5
    for (let n of nums) {
        for (let i = 0; i < 4; i++) { h ^= (n >>> (i * 8)) & 255; h = Math.imul(h, 0x01000193) }
    }
    return h >>> 0
}
