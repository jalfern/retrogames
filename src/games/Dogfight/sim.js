// WWI DOGFIGHT — the pure sky. step(state, input) is the whole world:
// one scout, a patrol of Albatroses, synchronized guns, and an energy
// budget you cannot cheat.
//
// The disciplines this file exists to keep (the archery/galaga lessons,
// wearing a flying cap):
//   - zero Math.random, zero Date.now — a patrol is a PROOF, and the attract
//     demo replays the autopilot's own witness tick for tick;
//   - the fixed-wing contract is the GAME: velocity is forward × airspeed,
//     so pitching up spends speed (−g·sin γ), speed buys height, and below
//     the pinned stall speed lift collapses and the nose drops by itself.
//     There is no hover, no strafe, no undo;
//   - an exact rounds ledger EVERY tick: belt + flying + hit + missed ==
//     total, per plane. A round may change state, never go for a walk.
//
// Muscles the issue named:
//   - flight model: thrust − drag − gravity-along-path; coordinated bank
//     turns (ω = TURN·g·tan φ / v); elevators bite proportionally to how
//     much air is on the tail;
//   - stall: under V_STALL the wing stops flying — pitch authority fades,
//     the nose pitches over, and the deck is suddenly very interested in you;
//   - ammo belts: a finite synchronized Vickers per plane, ballistically
//     dropping tracers, and a bot that forward-simulates the EXACT bullet
//     integrator before it commits a round (the archery rule: aim with the
//     integrator you fly, not the raycast you wish you had).

import { buildMission } from './levels.js'

export const FIXED_DT = 1 / 30
export const G = 9.8

export const CFG = {
    thrust: 12,           // m/s^2 at full throttle
    drag0: 0.6,
    dragK: 0.0018,        // terminal at full throttle: sqrt((12-0.6)/K) ≈ 79.6 m/s
    stall: 33,            // m/s — below this the wing stops flying
    sink: 0.05,           // rad/s of nose-dropped per (stall − v)
    pitchRate: 0.9,       // rad/s elevator authority at full bite
    rollRate: 2.1,
    rollReturn: 1.4,      // dihedral: the wings want level
    maxRoll: 1.1,
    turn: 1.8,            // ω = turn·g·tanφ/v — banked, coordinated, or nothing
    minSpeed: 14,
    muzzle: 400,          // m/s out of the synchronized Vickers
    rofTicks: 4,          // ~7.5 rounds/s per gun
    hitR: 6.5,            // a biplane is a big slow target
    bulletLife: 3.4,      // seconds — bullets that find no dirt retire as 'miss'
    deck: 6,              // ground plane
    ceil: 620,
    // test-only switches so the harness can prove each muscle is load-bearing
    stallOn: true,
    bulletGravity: true,
    dragOn: true,
    consume: true,        // false: the belt feeds air — a machine gun on a statue
    turnOn: true,         // false: the bank flies nowhere
    hitScale: 1,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function wrap(a) {
    let w = a
    while (w > Math.PI) w -= Math.PI * 2
    while (w < -Math.PI) w += Math.PI * 2
    return w
}

const fwd = (p) => {
    const cp = Math.cos(p.pitch)
    return { x: Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: Math.cos(p.yaw) * cp }
}

export function newGame(missionIdx = 0) {
    const m = buildMission(missionIdx)
    const plane = (src, faction, id, name) => ({
        id, faction, name,
        x: src.x, y: src.y, z: src.z,
        yaw: src.yaw, pitch: 0, roll: 0,
        v: faction === 0 ? 55 : 62,
        throttle: faction === 0 ? 0.85 : 1,
        // a bandit spec without a belt would feed the gun NaN, and NaN > 0
        // is false — the simulation would look "peaceful", not broken.
        belt: src.belt ?? 240, total: src.belt ?? 240, hp: src.hp ?? 2,
        alive: true, deadT: 0, cooldown: 0, stalled: false,
        skill: src.skill ?? 0, slot: src.slot ?? 0,
        hits: 0, missed: 0, fired: 0,
    })
    const g = {
        name: m.name, clock: m.clock, arena: m.arena, minAlt: m.minAlt,
        p: plane(m.player, 0, 0, 'SCOUT'),
        foes: m.enemies.map((e, i) => plane(e, 1, i + 1, `ALBATROS ${String.fromCharCode(65 + i)}`)),
        bullets: [], bulletSeq: 0,
        tick: 0, end: null, why: '', events: [], cmds: [],
    }
    return g
}

const all = (g) => [g.p, ...g.foes]

// ------------------------------------------------------------- flight model ----
function flyPlane(g, pl, inp) {
    if (!pl.alive) {
        // a downed scout falls: nose heavy, no authority, until the deck
        pl.y -= (52 + pl.deadT * 6) * FIXED_DT
        pl.pitch = Math.max(-1.1, pl.pitch - 0.5 * FIXED_DT)
        pl.deadT++
        return
    }
    const i = inp || { roll: 0, pitch: 0, throttle: pl.throttle, fire: false }
    const stalling = CFG.stallOn && pl.v < CFG.stall
    const bite = clamp(pl.v / CFG.stall, 0.35, 1.1)

    // roll: ailerons + dihedral weathervaning back to level
    pl.roll = clamp(pl.roll + (i.roll || 0) * CFG.rollRate * FIXED_DT, -CFG.maxRoll, CFG.maxRoll)
    if (!i.roll) pl.roll -= pl.roll * CFG.rollReturn * FIXED_DT

    // coordinated turn — the bank flies the arc, or nothing turns you
    if (CFG.turnOn) {
        // ω = g·tanφ / v — and the v in that fraction is why SPEED is the
        // argument in a turning fight: slow down, and your circle shrinks
        // under his. (Clamp only to keep the frame integrable at min speed.)
        const w = clamp(CFG.turn * G * Math.tan(pl.roll) / Math.max(pl.v, 25), -0.85, 0.85)
        pl.yaw = wrap(pl.yaw + w * FIXED_DT)
    }

    // elevator: authority is how much air is on the tail. A stall takes the
    // air away — and then the wing drops the nose all by itself.
    pl.pitch = clamp(pl.pitch + (i.pitch || 0) * CFG.pitchRate * bite * FIXED_DT, -1.25, 1.25)
    if (stalling) {
        pl.pitch = clamp(pl.pitch - (CFG.stall - pl.v) * CFG.sink * FIXED_DT, -1.25, 1.25)
        if (!pl.stalled) { pl.stalled = true; g.events.push({ type: 'stall', who: pl.id }) }
    } else if (pl.v > CFG.stall + 4) pl.stalled = false

    // the energy budget, in one line: engine in, drag out, gravity on the hill
    const thrustA = CFG.thrust * clamp(i.throttle ?? pl.throttle, 0, 1)
    const drag = CFG.dragOn ? CFG.drag0 + CFG.dragK * pl.v * pl.v : 0
    pl.v = clamp(pl.v + (thrustA - drag - G * Math.sin(pl.pitch)) * FIXED_DT, CFG.minSpeed, 130)

    const f = fwd(pl)
    pl.x += f.x * pl.v * FIXED_DT
    pl.y += f.y * pl.v * FIXED_DT
    pl.z += f.z * pl.v * FIXED_DT
    pl.y = Math.min(pl.y, CFG.ceil)

    if (pl.y <= CFG.deck && pl.alive) {
        pl.alive = false; pl.deadT = 0
        g.events.push({ type: 'crash', who: pl.id, cause: pl.faction === 0 ? 'into the deck' : 'down in no-man\u2019s-land' })
    }
}

// ------------------------------------------------------------- synchronized guns ----
function flyGun(g, pl, fire) {
    if (pl.cooldown > 0) pl.cooldown--
    if (!fire || !pl.alive || pl.cooldown > 0) return
    if (pl.belt <= 0) {
        if (pl.cooldown === 0) { g.events.push({ type: 'dry', who: pl.id }); pl.cooldown = 8 }
        return
    }
    const f = fwd(pl)
    pl.belt--
    pl.fired++
    if (!CFG.consume) pl.belt++          // mutant: the belt feeds air
    pl.cooldown = CFG.rofTicks
    g.bullets.push({
        id: ++g.bulletSeq, faction: pl.faction, owner: pl.id,
        x: pl.x + f.x * 5, y: pl.y + f.y * 5, z: pl.z + f.z * 5,
        vx: f.x * CFG.muzzle + f.x * pl.v * 0.4,
        vy: f.y * CFG.muzzle + f.y * pl.v * 0.4,
        vz: f.z * CFG.muzzle + f.z * pl.v * 0.4,
        age: 0,
    })
    g.events.push({ type: 'shot', who: pl.id })
}

function spendBullet(g, b, why) {
    const shooter = all(g).find((q) => q.id === b.owner)
    if (shooter) shooter.missed++
    const k = g.bullets.indexOf(b)
    if (k >= 0) g.bullets.splice(k, 1)
    if (why) g.events.push({ type: 'miss', who: b.owner, why })
}

function stepBullets(g) {
    for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i]
        b.age++
        if (CFG.bulletGravity) b.vy -= G * FIXED_DT
        const sp = Math.hypot(b.vx, b.vy, b.vz)
        const steps = Math.max(1, Math.ceil((sp * FIXED_DT) / 3))
        let done = false
        for (let s = 0; s < steps && !done; s++) {
            b.x += (b.vx * FIXED_DT) / steps
            b.y += (b.vy * FIXED_DT) / steps
            b.z += (b.vz * FIXED_DT) / steps
            if (b.y <= 0) { spendBullet(g, b, 'dirt'); done = true; break }
            for (const q of all(g)) {
                if (!q.alive || q.faction === b.faction) continue
                if (Math.hypot(q.x - b.x, q.y - b.y, q.z - b.z) < CFG.hitR * CFG.hitScale) {
                    q.hp--
                    const shooter = all(g).find((p) => p.id === b.owner)
                    if (shooter) shooter.hits++
                    const k = g.bullets.indexOf(b)
                    if (k >= 0) g.bullets.splice(k, 1)
                    g.events.push({ type: 'hit', who: b.owner, victim: q.id, hp: q.hp })
                    if (q.hp <= 0 && q.alive) {
                        q.alive = false; q.deadT = 0
                        g.events.push({ type: 'down', who: q.id, victim: q.faction === 1 ? 'bandit' : 'scout' })
                    }
                    done = true
                    break
                }
            }
        }
        if (!done && (b.age > CFG.bulletLife * 30 ||
            Math.hypot(b.x - g.arena.cx, b.z - g.arena.cz) > g.arena.r * 2)) {
            spendBullet(g, b, 'flight')
        }
    }
}

// ----------------------------------------------------------------- the bandits ----
// Scripted energy pursuit: bank toward the bearing, pull only when the nose
// is roughly on, fire only inside an honest gate, respect the stall (a bandit
// that stalls is a bandit the harness could defeat by flying in a circle).
function banditInput(g, e) {
    if (!e.alive || !g.p.alive) return null
    const dx = g.p.x - e.x, dy = g.p.y - e.y, dz = g.p.z - e.z
    const hd = Math.hypot(dx, dz)
    const range = Math.hypot(dx, dy, dz)
    const bearing = wrap(Math.atan2(dx, dz) - e.yaw)
    const pitchErr = Math.atan2(dy, hd || 1) - e.pitch
    const gain = e.skill > 0 ? 1.7 : 1.15

    // energy + deck honesty FIRST. A bandit that porpoises into a hillside is
    // not an adversary, it is scenery with a hangar — and an audit that
    // "wins" against crashing AI proves nothing about the pilot.
    if (e.v < CFG.stall + 9) return { roll: -e.roll * 0.8, pitch: -0.7, throttle: 1, fire: false }
    if (e.y < 120 && Math.sin(e.pitch) < 0.02) return { roll: e.roll * 0.4, pitch: 0.4, throttle: 1, fire: false }

    let roll = 0, pitch = 0
    if (Math.hypot(e.x - g.arena.cx, e.z - g.arena.cz) > g.arena.r * 0.82) {
        roll = clamp(wrap(Math.atan2(g.arena.cx - e.x, g.arena.cz - e.z) - e.yaw) * gain, -1, 1)
    } else {
        // roll works the bearing, pitch works the elevation — BOTH axes, all
        // the time. A bandit that zeroes pitch while banked is a bandit who
        // never brings his gun to the merge, and a sky with no return fire
        // is a shooting gallery, not a patrol.
        // PD, not P: pitch and bank both INTEGRATE their command, so a pure
        // P aim limit-cycles across the gate forever and the merge is
        // gun-free theatre. The D is the aircraft's own last-tick attitude.
        const bearD = wrap(bearing - (e.bearPrev ?? bearing))
        const pitchD = pitchErr - (e.pitchPrev ?? pitchErr)
        e.bearPrev = bearing
        e.pitchPrev = pitchErr
        roll = clamp(bearing * (Math.abs(bearing) > 0.1 ? gain * 0.6 : 1.4) - bearD * 5, -1, 1)
        pitch = clamp(pitchErr * 1.6 - pitchD * 6, -0.5, 0.5)
    }
    if (e.v < CFG.stall + 20) pitch = Math.min(pitch, 0)
    // Circus doctrine: ONE bandit — the closest — is the lead and works the
    // player at gun range. The wingmen fly the chase too (the swarm is the
    // shape of the fight) but hold their fire to a desperate self-defence
    // range. Three guns firing simultaneously is not a dogfight, it is an
    // execution, and no honest autopilot wins an execution.
    let lead = g.foes[0]
    let ld = 1e18
    for (const f of g.foes) {
        if (!f.alive) continue
        const d = (f.x - g.p.x) ** 2 + (f.y - g.p.y) ** 2 + (f.z - g.p.z) ** 2
        if (d < ld) { ld = d; lead = f }
    }
    const gunRange = e === lead ? (e.skill > 0 ? 300 : 220) : 140
    const closing = dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw) > 0
    const fire = Math.abs(bearing) < (e.skill > 0 ? 0.05 : 0.07) && Math.abs(pitchErr) < 0.06 &&
        range < gunRange && closing && e.v > 50 && e.belt > 0
    const throttle = e.v < 66 ? 1 : 0.88
    return { roll, pitch, throttle, fire }
}

// ------------------------------------------------------------------- the pilot ----
// One policy drives the attract demo AND the harness: keep the energy
// budget honest (never stall, never find the deck), solve the lead, and
// fire ONLY what the real bullet integrator says will arrive. The slack
// rule grades this function with 20 rounds and 40 metres fewer.
export function pilotInput(g) {
    const me = g.p
    if (!me.alive) return null
    const foes = g.foes.filter((f) => f.alive)
    if (!foes.length) return { roll: 0, pitch: 0, throttle: 0.7, fire: false }

    let tgt = foes[0], bd = 1e18
    for (const f of foes) {
        const d = (f.x - me.x) ** 2 + (f.y - me.y) ** 2 + (f.z - me.z) ** 2
        if (d < bd) { bd = d; tgt = f }
    }
    const range = Math.sqrt(bd)

    // lead: iterate the shot on the bullet's OWN measured flight time —
    // one fixed lead walked itself out of every pass against a turning foe
    let tx = tgt.x, ty = tgt.y, tz = tgt.z
    const tvx = Math.sin(tgt.yaw) * Math.cos(tgt.pitch) * tgt.v
    const tvy = Math.sin(tgt.pitch) * tgt.v
    const tvz = Math.cos(tgt.yaw) * Math.cos(tgt.pitch) * tgt.v
    for (let pass = 0; pass < 2; pass++) {
        const t = Math.hypot(tx - me.x, ty - me.y, tz - me.z) / CFG.muzzle
        tx = tgt.x + tvx * t
        ty = tgt.y + tvy * t + 0.5 * G * t * t
        tz = tgt.z + tvz * t
    }
    const yawWant = Math.atan2(tx - me.x, tz - me.z)
    const pitchWant = Math.atan2(ty - me.y, Math.hypot(tx - me.x, tz - me.z))
    const yawErr = wrap(yawWant - me.yaw)
    const pitchErr = pitchWant - me.pitch

    // the trigger gate: the attitude is on the solution AND the exact
    // integrator says this round arrives at the foe's own future position.
    // No receipt, no round.
    let fire = false
    if (me.belt > 0 && range < 380 && me.v > 52 &&
        Math.abs(yawErr) < 0.05 && Math.abs(pitchErr) < 0.05) {
        fire = predictHit(g, me, tgt) >= 0
    }

    let roll = clamp(yawErr * 1.9, -1, 1)
    let pitch = clamp(pitchErr * 2.2, -1, 1)
    // throttle is a WEAPON: in a hard turn the circle shrinks with speed,
    // so the pilot pays km/h to buy degrees. But the debt is only payable
    // from an energy surplus — at the deck, or with a bandit on the tail,
    // speed IS altitude and the answer is full throttle and a break turn.
    let throttle = me.v < 56 ? 1 : 0.85
    const threatBehind = foes.some((f) => {
        const d = Math.hypot(f.x - me.x, f.y - me.y, f.z - me.z)
        if (d > 220) return false
        const f2 = fwd(me)
        const dot = ((f.x - me.x) * f2.x + (f.z - me.z) * f2.z) / (d || 1)
        return dot < -0.3
    })
    if (Math.abs(roll) > 0.55 && me.v > 66 && !threatBehind && me.y > g.minAlt + 60) throttle = 0.45
    if (threatBehind) { throttle = 1; roll = clamp(yawErr * 1.9 + (me.roll || 0.001) * 0.2, -1, 1) }
    if (me.y < g.minAlt + 55) throttle = Math.max(throttle, 0.95)
    if (me.v > 88) throttle = 0.4

    // the honest dodge: an enemy round is visible state. If one is inbound
    // and close, break HARD — roll perpendicular to its line, dive a touch,
    // throttle for the energy to outrun the next deflection. A pilot that
    // cannot dodge what it can see is not an autopilot, it is a target.
    for (const b of g.bullets) {
        if (b.faction === 0) continue
        const bx = b.x - me.x, by = b.y - me.y, bz = b.z - me.z
        const d = Math.hypot(bx, by, bz)
        if (d > 150) continue
        const closing = bx * b.vx + by * b.vy + bz * b.vz < 0
        if (!closing) continue
        throttle = 1
        // break the OTHER way: a deflected shot already aims where you were
        // continuing, so reversing the turn is what actually misses the round
        roll = me.roll > 0 ? -0.95 : 0.95
        pitch = me.y > g.minAlt + 80 ? Math.min(pitch, -0.25) : Math.max(pitch, 0.3)
        break
    }

    // energy honesty comes before the solution: a stalled scout has no
    // elevator, and a scout under the deck has no second chance
    if (me.v < CFG.stall + 8) { pitch = -0.9; roll = -me.roll; throttle = 1 }
    else if (me.y < g.minAlt + 45 && (Math.sin(me.pitch) < 0 || me.v < CFG.stall + 14)) pitch = Math.max(pitch, 0.5)
    if (me.v > 92) pitch = Math.max(pitch, 0.35)

    // hold the patrol box
    if (Math.hypot(me.x - g.arena.cx, me.z - g.arena.cz) > g.arena.r * 0.8) {
        const home = Math.atan2(g.arena.cx - me.x, g.arena.cz - me.z)
        roll = clamp(wrap(home - me.yaw) * 1.9, -1, 1)
    }
    return { roll, pitch, throttle, fire }
}

// forward-simulate the ACTUAL bullet the trigger would spawn (muzzle offset,
// gravity, substeps) against the foe's own FUTURE position, extrapolated
// linearly from its current velocity — the archery rule: predictions that
// ignore the integrator promise shots the sky will never allow. The lead
// point the caller aims at is NOT re-led here — that double-counted the foe's
// motion and put every "proven" shot behind him.
export function predictHit(g, me, tgt) {
    const f = fwd(me)
    let x = me.x + f.x * 5, y = me.y + f.y * 5, z = me.z + f.z * 5
    const vx = f.x * CFG.muzzle + f.x * me.v * 0.4
    let vy = f.y * CFG.muzzle + f.y * me.v * 0.4
    const vz = f.z * CFG.muzzle + f.z * me.v * 0.4
    const ttx = Math.sin(tgt.yaw) * Math.cos(tgt.pitch) * tgt.v
    const tty = Math.sin(tgt.pitch) * tgt.v
    const ttz = Math.cos(tgt.yaw) * Math.cos(tgt.pitch) * tgt.v
    const sp = Math.hypot(vx, vy, vz)
    const steps = Math.max(1, Math.ceil((sp * FIXED_DT) / 3))
    for (let t = 0; t < CFG.bulletLife * 30; t++) {
        if (CFG.bulletGravity) vy -= G * FIXED_DT
        for (let s = 0; s < steps; s++) {
            x += (vx * FIXED_DT) / steps
            y += (vy * FIXED_DT) / steps
            z += (vz * FIXED_DT) / steps
            if (y <= 0) return -1
        }
        const dtT = t / 30
        const dx = tgt.x + ttx * dtT - x
        const dy = tgt.y + tty * dtT - y
        const dz = tgt.z + ttz * dtT - z
        if (dx * dx + dy * dy + dz * dz < (CFG.hitR * 0.85) ** 2) return t
        if (Math.hypot(x - g.arena.cx, z - g.arena.cz) > g.arena.r * 2) return -1
    }
    return -1
}

// ------------------------------------------------------------------ the tick ----
export function step(g, input = null) {
    if (g.end) return
    flyPlane(g, g.p, input)
    for (const e of g.foes) {
        const inp = banditInput(g, e)
        flyPlane(g, e, inp)
        flyGun(g, e, inp ? inp.fire : false)
    }
    flyGun(g, g.p, input?.fire)
    stepBullets(g)
    for (const q of all(g)) {
        if (!q.alive && q.faction === 1 && q.hp <= 0 && q.deadT === 20) {
            g.events.push({ type: 'wreck', who: q.id })
        }
    }
    g.tick++
    if (g.p.alive && !g.foes.some((f) => f.alive)) { g.end = 'win'; g.why = 'patrol cleared' }
    else if (!g.p.alive) { g.end = 'lose'; g.why = g.p.hp <= 0 ? 'shot down' : 'into the deck' }
    else if (g.tick >= g.clock * 30) {
        g.end = 'time'
        g.why = 'fuel dry — the patrol went home without you'
    }
    if (g.end) g.events.push({ type: 'over', end: g.end, why: g.why })
}

export function stateHash(g) {
    let h = 0x811c9dc5
    const mix = (n) => {
        let v = Math.round(n * 256) | 0
        h ^= v & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193)
    }
    mix(g.tick)
    for (const q of all(g)) {
        mix(q.x); mix(q.y); mix(q.z); mix(q.v); mix(q.yaw); mix(q.pitch)
        mix(q.belt); mix(q.hp); mix(q.alive ? 1 : 0)
    }
    mix(g.bullets.length); mix(g.bulletSeq)
    for (const b of g.bullets) { mix(b.id); mix(b.x); mix(b.y); mix(b.z) }
    mix(g.p.fired); mix(g.p.hits); mix(g.p.missed)
    return (h >>> 0).toString(16)
}

export function replay(missionIdx, cmds, opts = {}) {
    const g = newGame(missionIdx)
    const byTick = new Map()
    for (const c of cmds) byTick.set(c.tick, c.in)
    const max = opts.maxTicks ?? g.clock * 30 + 60
    while (!g.end && g.tick < max) step(g, byTick.get(g.tick) ?? null)
    return g
}

export function recordMission(missionIdx = 0, opts = {}) {
    const g = newGame(missionIdx)
    if (opts.belt) g.p.belt = g.p.total = opts.belt
    if (opts.alt) g.p.y = opts.alt
    const cap = g.clock * 30 + 60
    while (!g.end && g.tick < cap) {
        const inp = pilotInput(g)
        g.cmds.push({ tick: g.tick, in: inp })
        step(g, inp)
    }
    return g
}

// deep copy for the DebugKit's PROGNOSIS: fly the PILOT again from the live,
// possibly-cheated state and answer "can this patrol still be cleared?"
export function cloneGame(g) {
    return structuredClone(g)
}
