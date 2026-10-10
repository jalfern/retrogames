// BEEZEE — the simulation. No three.js, no DOM, no React: plain Node can import
// this file, and `scripts/beecheck.mjs` does exactly that — it proves every garden
// is winnable (a deterministic autopilot flies it) before a browser is ever opened,
// in the spirit of heistcheck/zorkcheck.
//
// The rules that matter, and why each is the shape it is:
//
// - You are a honeybee leaving the hive to forage until sunset. Hover on a flower
//   center to drink nectar / dust pollen; carry up to CARRY nectar; dump the load
//   at the hive to bank it. The sun is the clock: deliver before it sets.
// - Wind is a real vector added to position each tick (a 2 g drift is metres a
//   second you must fly against). It exists so flower centers are hard to *hold*:
//   hovering is the game. `beecheck` pins the sign so an inverted wind cannot
//   silently ship as "a tailwind game".
// - UV vision is the issue's request made mechanical: deep-cup flowers present a
//   landing target a bee can see but humans cannot. Out of UV their effective
//   landing radius is a fraction of a metre — you must hover essentially dead
//   on center against the wind. In UV the bullseye opens the radius. The radius
//   rule is asserted both ways by beecheck; it is the load-bearing line.
// - Hazards are four, cheap, and each is *posed* where autopilot will meet one:
//   webs (stuck, the clock bleeds), wasps (patrol, aggro, sting), a bird
//   (dive from the sun when you are high and over grass), and a pet gecko on
//   the hive rock (tongue-lash if you linger under it while loading).
// - Everything random is mulberry32 off one seed: attract demo, harness and
//   player share one deterministic world per seed.

export const FIXED_DT = 1 / 60

export const CFG = {
    day: 100,            // seconds of sunlight
    radius: 60,          // garden half-width, metres
    skyMin: 0.45,        // you are a bee: the interesting stuff is knee-high
    skyMax: 11,
    thrust: 12,          // m/s^2
    sprintThrust: 21,
    maxSpeed: 9,
    sprintSpeed: 13,
    turnRate: 2.1,       // rad/s
    pitchRate: 1.6,
    drag: 3.2,           // per second, applied to velocity
    windGain: 1,         // metres/second added to *position* per wind m/s — full
    carry: 4,            // nectar capacity
    stingGrace: 1.5,     // s of invulnerability after a sting
    health: 4,
    webStuck: 1.9,       // seconds tangled
    uvBonus: 2.2,        // multiplier on a uvOnly flower's landing radius
    deliverRadius: 2.6,  // hive mouth
    nestValue: 25,       // points per delivered nectar
    pollenValue: 12,
}

export const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------- gardens --------
// A garden is a *seed*, not a hand-placed file: the same seed rebuilds the exact
// world in Node and in the browser. The layout must satisfy invariants beecheck
// enforces (every flower inside the ring, no flower inside a hazard, wasps not
// on the hive pad, at least one deep-cup and one web between hive and the far
// arc — a hazard that cannot be met is scenery, not a hazard).
export const GARDENS = [
    { name: 'CLOVER MEADOW', seed: 1337, windBase: 2.4, windGust: 1.6, flowers: 9 },
    { name: 'SUNNHY MEADOW', seed: 80421, windBase: 3.4, windGust: 2.4, flowers: 11 },
]

const kindFor = (rnd) => {
    const r = rnd()
    if (r < 0.34) return { kind: 'daisy', hide: 1.25, uv: false, nectar: 3 }
    if (r < 0.67) return { kind: 'tulip', hide: 0.85, uv: false, nectar: 4 }
    return { kind: 'deepcup', hide: 0.34, uv: true, nectar: 5 }
}

export function buildGarden(gardenIdx) {
    const g = GARDENS[gardenIdx % GARDENS.length]
    const rnd = mulberry32(g.seed)
    const R = CFG.radius

    const flowers = []
    let guard = 0
    while (flowers.length < g.flowers && guard++ < 600) {
        const a = rnd() * Math.PI * 2
        const d = 12 + rnd() * (R - 18)
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        if (Math.hypot(x, z) < 11) continue                    // keep the hive pad clear
        if (flowers.some(f => Math.hypot(f.x - x, f.z - z) < 7)) continue
        const k = kindFor(rnd)
        flowers.push({ id: flowers.length, x, z, stemH: 0.5 + rnd() * 0.7, sway: rnd() * 6.28, ...k })
    }

    const webs = []
    guard = 0
    while (webs.length < 3 && guard++ < 600) {
        const a = rnd() * Math.PI * 2
        const d = 16 + rnd() * (R - 30)
        const x = Math.cos(a) * d
        const z = Math.sin(a) * d
        if (flowers.some(f => Math.hypot(f.x - x, f.z - z) < 3.4)) continue // webs hang ON flowers
        webs.push({ x, z, y: 0.8 + rnd() * 1.6, r: 1.5 })
    }
    // One web between the hive and the far arc, always: the route must pay.
    const far = flowers.reduce((b, f) => (Math.hypot(f.x, f.z) > Math.hypot(b.x, b.z) ? f : b), flowers[0])
    const fa = Math.atan2(far.z, far.x)
    webs[0] = { x: Math.cos(fa) * (Math.hypot(far.x, far.z) * 0.55), z: Math.sin(fa) * (Math.hypot(far.x, far.z) * 0.55), y: 1.1, r: 1.5 }

    // A web you cannot avoid on the way to a flower is not a hazard, it is a
    // tax on the level. Re-place any flower a web was strung on top of.
    for (const f of flowers) {
        const w = webs.find(w => Math.hypot(w.x - f.x, w.z - f.z) < 4.5)
        if (!w) continue
        let tries = 0
        do {
            const a = rnd() * Math.PI * 2
            f.x += Math.cos(a) * 3.2; f.z += Math.sin(a) * 3.2
            const d = Math.hypot(f.x, f.z)
            if (d > R - 4 || d < 11) { f.x *= 0.8; f.z *= 0.8 }
            tries++
        } while (tries < 40 && (webs.some(w => Math.hypot(w.x - f.x, w.z - f.z) < 4.5)
            || flowers.some(o => o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 6.5)))
    }

    const wasps = []
    const waspN = 2 + (gardenIdx % 2)
    for (let i = 0; i < waspN; i++) {
        const a = rnd() * Math.PI * 2
        const d = 18 + rnd() * 24
        const x = Math.cos(a) * d, z = Math.sin(a) * d
        wasps.push({
            x, z, y: 1 + rnd(), home: { x, z }, r: 0.7,
            aggro: 9, speed: 3.6, orbit: rnd() * 6.28, wait: 0, stun: 0,
        })
    }

    const gecko = { x: 4.6, z: 0.5, range: 2.0, cool: 1.5, lash: 0 }

    return {
        name: g.name, seed: g.seed, windBase: g.windBase, windGust: g.windGust,
        flowers, webs, wasps, gecko,
    }
}

// ------------------------------------------------------------------ new game -----
export function newGame(gardenIdx = 0, seedShift = 0) {
    const world = buildGarden(gardenIdx)
    if (seedShift) {
        const rnd = mulberry32(world.seed ^ seedShift)
        world.flowers.forEach(f => { f.nectar = Math.max(1, f.nectar - Math.floor(rnd() * 2)) })
    }
    return {
        world,
        t: 0,
        end: null,                       // 'sun' | 'stung' | 'delivered' | 'over'
        score: 0,
        delivered: 0,
        bee: { x: 0, y: 1.3, z: 5.5, yaw: Math.PI, pitch: 0, vx: 0, vy: 0, vz: 0, stuck: 0, grace: 0, nectar: 0, pollen: 0 },
        uv: false,
        health: CFG.health,
        scare: 0,
        bird: { on: false, x: 0, y: 24, z: 0, mode: 'cruise', t: 0 },
        events: [],
        windSeed: mulberry32(world.seed ^ 0x9e3779b9),
    }
}

// Wind: a base direction with gusts layered on, deterministic in game time.
// Returns [wx, wz] m/s. The sign convention is load-bearing (see file header).
export function windAt(gs, t) {
    const base = gs.windBase
    const dir = (gs.seed % 7) / 7 * Math.PI * 2
    const gust = Math.sin(t * 0.35) * 0.5 + Math.sin(t * 0.11 + 2) * 0.5
    const m = Math.max(0, base + gust * gs.windGust)
    return [Math.cos(dir) * m, Math.sin(dir) * m]
}

/**
 * Effective landing radius of a flower for the bee as it currently is configured.
 * THE load-bearing rule of the game (header): deep-cup centers only "open" in UV.
 */
export function landRadius(flower, uv) {
    return flower.uv && !uv ? flower.hide * 0.25 : flower.uv ? flower.hide * CFG.uvBonus : flower.hide
}

// -------------------------------------------------------------------- step -------
// One fixed tick. `input` = { yaw, pitch, thrust, sprint, uv } each clamped.
// Mutates g; pushes {type,...} to g.events for audio and the harness.
export function step(g, input = {}) {
    g.events.length = 0
    if (g.end) return g

    const dt = FIXED_DT
    const b = g.bee
    g.t += dt
    if (b.grace > 0) b.grace = Math.max(0, b.grace - dt)
    if (g.scare > 0) g.scare = Math.max(0, g.scare - dt)

    const uvOn = !!input.uv
    g.uv = uvOn

    if (b.stuck > 0) {
        b.stuck = Math.max(0, b.stuck - dt)
        // Tangled: wind still shakes the web (and you with it) — the clock is the sting.
        const [wx, wz] = windAt(g.world, g.t)
        b.x += Math.sin(g.t * 6) * dt * 0.4 + wx * dt * 0.15
        b.z += Math.cos(g.t * 5) * dt * 0.4 + wz * dt * 0.15
        if (b.stuck === 0) g.events.push({ type: 'freed' })
    } else {
        const yaw = (input.yaw || 0) * CFG.turnRate * dt
        const pit = (input.pitch || 0) * CFG.pitchRate * dt
        b.yaw += yaw
        b.pitch = Math.max(-0.9, Math.min(0.9, b.pitch + pit))

        if (input.thrust) {
            const a = input.sprint ? CFG.sprintThrust : CFG.thrust
            const cy = Math.cos(b.pitch)
            b.vx += Math.sin(b.yaw) * cy * a * dt
            b.vy += Math.sin(b.pitch) * a * dt
            b.vz += Math.cos(b.yaw) * cy * a * dt
        }
        const k = Math.max(0, 1 - CFG.drag * dt)
        b.vx *= k; b.vy *= k; b.vz *= k

        const cap = input.sprint ? CFG.sprintSpeed : CFG.maxSpeed
        const sp = Math.hypot(b.vx, b.vy, b.vz)
        if (sp > cap) { const s = cap / sp; b.vx *= s; b.vy *= s; b.vz *= s }

        const [wx, wz] = windAt(g.world, g.t)
        b.x += (b.vx + wx * CFG.windGain) * dt
        b.z += (b.vz + wz * CFG.windGain) * dt
        b.y += b.vy * dt
    }

    // soft world ring: you are a bee over a meadow, not a missile — nudge back
    const d = Math.hypot(b.x, b.z)
    if (d > CFG.radius) {
        const s = CFG.radius / d
        b.x *= s; b.z *= s
        b.vx *= -0.3; b.vz *= -0.3
        g.events.push({ type: 'edge' })
    }
    b.y = Math.max(CFG.skyMin, Math.min(CFG.skyMax, b.y))
    if (b.y === CFG.skyMin && b.vy < 0) b.vy = 0

    // ---- flowers: hover the center to drink ----
    if (b.stuck <= 0) {
        for (const f of g.world.flowers) {
            if (f.nectar <= 0) continue
            const dx = b.x - f.x, dz = b.z - f.z
            const horiz = Math.hypot(dx, dz)
            const vert = Math.abs(b.y - (f.stemH + 0.35))
            const r = landRadius(f, g.uv)
            if (horiz < r && vert < 0.9) {
                f.drink = (f.drink || 0) + dt
                if (f.drink >= 0.7) {
                    f.drink = 0
                    if (b.nectar < CFG.carry) {
                        f.nectar--
                        b.nectar++
                        b.pollen = Math.min(9, b.pollen + 1)
                        g.events.push({ type: 'collect', flower: f.id, kind: f.kind, uv: g.uv })
                    }
                }
            } else if (f.drink) f.drink = 0
        }
    }

    // ---- hive: dump the load ----
    const hd = Math.hypot(b.x, b.z)
    if (hd < CFG.deliverRadius && b.y < 3 && (b.nectar > 0 || b.pollen > 0)) {
        const pts = b.nectar * CFG.nestValue + b.pollen * CFG.pollenValue
        g.score += pts
        g.delivered += b.nectar
        g.events.push({ type: 'deliver', points: pts, nectar: b.nectar })
        b.nectar = 0
        b.pollen = 0
    }

    // ---- webs ----
    if (b.stuck <= 0) {
        for (const w of g.world.webs) {
            if (Math.hypot(b.x - w.x, b.z - w.z) < w.r && Math.abs(b.y - w.y) < w.r) {
                b.stuck = CFG.webStuck
                b.vx = b.vy = b.vz = 0
                g.events.push({ type: 'web' })
                break
            }
        }
    }

    // ---- wasps: lazy orbit at home, chase inside aggro AND on leash, sting on contact ----
    for (const wp of g.world.wasps) {
        if (wp.stun > 0) { wp.stun -= dt; continue }
        const homeD = Math.hypot(wp.x - wp.home.x, wp.z - wp.home.z)
        const bd = Math.hypot(b.x - wp.x, b.z - wp.z)
        if (bd < wp.aggro && b.stuck <= 0 && homeD < 11) {
            const s = wp.speed * dt
            wp.x += (b.x - wp.x) / bd * s
            wp.z += (b.z - wp.z) / bd * s
            wp.y += ((b.y - wp.y) * 0.8 + Math.sin(g.t * 7 + wp.orbit) * 0.3) * dt
            wp.y = Math.max(0.4, Math.min(CFG.skyMax, wp.y))
        } else {
            wp.orbit += dt * 0.8
            wp.x += (wp.home.x + Math.cos(wp.orbit) * 4 - wp.x) * dt * 0.9
            wp.z += (wp.home.z + Math.sin(wp.orbit) * 4 - wp.z) * dt * 0.9
            wp.y += (1 + Math.sin(g.t * 2 + wp.orbit) * 0.4 - wp.y) * dt
        }
        if (bd < wp.r + 0.5 && b.grace <= 0 && b.stuck <= 0) {
            b.grace = CFG.stingGrace
            b.vx += (b.x - wp.x) * 4; b.vz += (b.z - wp.z) * 4; b.vy = 2
            wp.stun = 0.8
            hurt(g, 'wasp')
        }
    }

    // ---- bird: cruises; dives if the bee is high and clear of grass ----
    const bird = g.bird
    bird.t -= dt
    if (!bird.on && bird.t <= 0) {
        const a = Math.atan2(b.z, b.x) + (g.windSeed() - 0.5)
        bird.on = true
        bird.x = b.x - Math.cos(a) * 40
        bird.z = b.z - Math.sin(a) * 40
        bird.y = 22
        bird.mode = 'cruise'
        bird.t = 12
    }
    if (bird.on) {
        if (bird.mode === 'cruise') {
            const toB = Math.hypot(b.x - bird.x, b.z - bird.z)
            bird.x += (b.x - bird.x) / toB * 8 * dt
            bird.z += (b.z - bird.z) / toB * 8 * dt
            bird.y = 18 + Math.sin(g.t * 2) * 2
            if (toB < 14 && b.y > 2.2 && bird.t > 3) bird.mode = 'dive'
        } else {
            const dx = b.x - bird.x, dy = b.y - bird.y, dz = b.z - bird.z
            const dd = Math.hypot(dx, dy, dz) || 1
            const s = 15 * dt
            bird.x += dx / dd * s; bird.y += dy / dd * s; bird.z += dz / dd * s
            if (dd < 0.9 && b.grace <= 0 && b.stuck <= 0) {
                b.grace = CFG.stingGrace
                hurt(g, 'bird')
                bird.mode = 'pull'
                bird.t = 4
            }
            if (bird.y < CFG.skyMin + 0.5) { bird.mode = 'pull'; bird.t = 4 }
        }
        if (bird.mode === 'pull') {
            bird.y += 10 * dt
            if (bird.y > 22) { bird.on = false; bird.t = 9 + g.windSeed() * 9 }
        }
    }

    // ---- pet gecko on the hive rock: tongue-lash if you linger loading ----
    const ge = g.world.gecko
    if (ge.cool > 0) ge.cool -= dt
    if (ge.lash > 0) ge.lash -= dt
    const gd = Math.hypot(b.x - ge.x, b.z - ge.z)
    if (ge.cool <= 0 && gd < ge.range && b.y < 2.6) {
        ge.lash = 0.35
        ge.cool = 2.5 + g.windSeed() * 2
        if (b.grace <= 0) { b.grace = CFG.stingGrace; hurt(g, 'gecko') }
    }

    // ---- sun ----
    if (g.t >= CFG.day) {
        g.end = 'sun'
        g.score += 0
        g.events.push({ type: 'sunset' })
    }
    return g
}

function hurt(g, by) {
    g.health--
    g.events.push({ type: 'sting', by })
    // A bee swatted mid-load drops its load. The cost of carelessness is the
    // trip you just flew, not a life — that is what makes wasps tense, not unfair.
    if (g.bee.nectar > 0) {
        g.events.push({ type: 'spill', lost: g.bee.nectar })
        g.bee.nectar = 0
    }
    g.scare = 6
    if (g.health <= 0) {
        g.end = 'stung'
        g.events.push({ type: 'down' })
    }
}

/**
 * The attract-mode brain. Pure, deterministic, and deliberately NOT given the
 * answer: it steers with the same turn rates and suffers the same wind the
 * player does. beecheck runs it to prove each garden is winnable, so a level
 * design that only looks fun but cannot be *flown* cannot ship.
 */
export function autopilot(g) {
    const b = g.bee
    if (g.end) return { yaw: 0, pitch: 0, thrust: false, uv: g.uv }
    if (b.stuck > 0) return { yaw: 0, pitch: 0.3, thrust: true, uv: g.uv }

    const sunLeft = CFG.day - g.t
    const mustBank = b.nectar >= CFG.carry || sunLeft < 22 || g.scare > 0
    g.uvGoal = false
    let target = null

    // wasps nearer than 9 m (their aggro): run. A bee does not out-turn a wasp, it out-dashes it.
    for (const w of g.world.wasps) {
        const wd = Math.hypot(w.x - b.x, w.z - b.z)
        if (wd < 9 && Math.abs(w.y - b.y) < 3) {
            const ad = Math.hypot(b.x - w.x, b.z - w.z) || 1
            let fx = b.x + (b.x - w.x) / ad * 14, fz = b.z + (b.z - w.z) / ad * 14
            const fd = Math.hypot(fx, fz)
            if (fd > CFG.radius * 0.7) { const s = CFG.radius * 0.7 / fd; fx *= s; fz *= s }
            target = { x: fx, z: fz, y: Math.min(CFG.skyMax, b.y + 2), flee: true }
            break
        }
    }
    if (!target) {
        if (mustBank) target = { x: 0, z: 0, y: 1.6, home: true }
        else {
            let best = null, bs = Infinity
            for (const f of g.world.flowers) {
                if (f.nectar <= 0) continue
                const risk = (g.world.webs.some(w => Math.hypot(w.x - f.x, w.z - f.z) < 2.5) ? 4 : 0)
                    + (g.world.wasps.some(w => Math.hypot(w.home.x - f.x, w.home.z - f.z) < 12) ? 6 : 0)
                const d = Math.hypot(f.x - b.x, f.z - b.z) + risk
                if (d < bs) { bs = d; best = f }
            }
            if (!best) target = { x: 0, z: 0, y: 1.6, home: true }
            else {
                target = { x: best.x, z: best.z, y: best.stemH + 0.4 }
                if (best.uv) g.uvGoal = true
            }
        }
    }
    g.uv = g.uvGoal

    // steer toward a target with an optional waypoint around a web
    let tx = target.x, tz = target.z
    const dist = Math.hypot(tx - b.x, tz - b.z)
    for (const w of g.world.webs) {
        if (Math.abs(w.y - (target.y || 1.5)) > w.r + 1) continue
        const t = ((w.x - b.x) * (tx - b.x) + (w.z - b.z) * (tz - b.z)) / (dist * dist || 1)
        if (t < 0.05 || t > 0.95) continue
        const px = b.x + (tx - b.x) * t, pz = b.z + (tz - b.z) * t
        const cross = (tx - b.x) * (w.z - b.z) - (tz - b.z) * (w.x - b.x)
        if (Math.hypot(w.x - px, w.z - pz) < w.r + 1.2) {
            const side = cross >= 0 ? 1 : -1
            const nx = -(tz - b.z) / dist, nz = (tx - b.x) / dist
            tx = px + nx * side * (w.r + 2.2)
            tz = pz + nz * side * (w.r + 2.2)
        }
    }

    // wanted AIR velocity: position error drive, minus the wind that carries us
    const k = dist < 2.5 ? 1.5 : 2.2
    const [wx, wz] = windAt(g.world, g.t)
    let avx = (tx - b.x) * k - wx
    let avz = (tz - b.z) * k - wz
    let avy = ((target.y || 1.5) - b.y) * 2.2
    const want = Math.hypot(avx, avy, avz)
    if (want > CFG.maxSpeed * 0.85) { const s = CFG.maxSpeed * 0.85 / want; avx *= s; avz *= s; avy *= s }

    const yawWant = Math.atan2(avx, avz)
    let dyaw = yawWant - b.yaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    const pitchWant = Math.max(-0.8, Math.min(0.8, Math.asin(Math.max(-1, Math.min(1, avy / (want || 1))))))
    const close = dist < 1.4 && Math.abs(b.y - (target.y || 1.5)) < 0.8

    return {
        yaw: Math.max(-1, Math.min(1, dyaw * 2.6)),
        pitch: Math.max(-1, Math.min(1, (pitchWant - b.pitch) * 2.6)),
        thrust: want > 0.45 || (close && Math.abs(b.y - (target.y || 1.5)) > 0.3),
        sprint: (target.flee && dist > 4) || (!target.flee && dist > 16 && Math.abs(dyaw) < 0.6),
        uv: g.uv,
    }
}
