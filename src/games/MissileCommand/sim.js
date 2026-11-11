// MISSILE COMMAND — the whole-tick sim (#1637 batch 29) plus the PROVEN route.
//
// Seedpin batch 15 lifted only the spawn dice here; the physics still lived in
// index.jsx's useEffect closure and the wave break ran on setTimeout. This is
// the b27 lift (DonkeyKong shape): makeRun(seed) builds the whole world,
// tickMc(gs, cmd) advances exactly one fixed tick, no wall clock and no
// Math.random anywhere inside. ?seed=N now replays the ENTIRE raid — spawner,
// intercepts, splashes and all — which is what lets the sweep prove the driver
// before a live seat is honest.
//
// The proof (missilecmdcheck): every seed clears waves 1..5 with ALL SIX
// CITIES STANDING. Doctrine: INTERCEPT HIGH. Structure anchors sit at y 530
// and 550 and the blast maxes at radius 40, so a detonation centered at
// y <= 485 can never touch a friendly — altitude is life, exactly the arcade
// lesson. The driver re-simulates each warhead with the sim's own stepping,
// finds the earliest tick an ABM can meet it (arrive-and-detonate math with
// the engine's discrete step rules, not continuous approximations), fires at
// that future point from the engine's own nearest-silo choice, and covers each
// warhead until its shot detonates — retry the moment a cover lapses while
// the warhead still lives.

import { seedRng } from '../../utils/gameContract.js'

export const SCREEN_WIDTH = 800
export const SCREEN_HEIGHT = 600
export const GROUND_Y = 550
export const ABM_SPEED = 15
export const WARHEAD_SPEED_BASE = 1
export const BLAST_RADIUS_MAX = 40
export const BLAST_SPEED = 1
export const WAVE_BREAK_TICKS = 180 // the original 3 s pause, on the sim clock (#1525)

// Anything detonating at or above this line is out of every structure's reach:
// silo anchors 530 - 485 = 45 > 40, city anchors 550 - 485 = 65 > 40.
export const SAFE_Y = 485

export const START_WAVE = 1
export const PROVEN_WAVES = 5 // the sweep's bar: clear waves 1..PROVEN_WAVES untouched

export function chooseEnemySpawn(rand, targets, width = SCREEN_WIDTH) {
    const target = targets[Math.floor(rand() * targets.length)]
    return { target, x: rand() * width, startX: rand() * width }
}

const CITY_X = [120, 200, 280, 520, 600, 680]
const SILO_X = [40, 400, 760]

// ------------------------------------------------------------------ world ----
export function makeRun(seed) {
    const rng = seedRng(seed >>> 0 || 1)
    return {
        seed: seed >>> 0 || 1,
        rand: rng,
        tick: 0,
        score: 0,
        wave: START_WAVE,
        cities: CITY_X.map((x) => ({ x, y: GROUND_Y, alive: true })),
        silos: SILO_X.map((x) => ({ x, y: GROUND_Y - 20, ammo: 10, alive: true })),
        abms: [],
        warheads: [],
        blasts: [],
        crosshair: { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 },
        state: 'playing', // playing | waveEnd | gameOver
        spawning: true,
        spawnTimer: 0,
        missilesLeftInWave: 10 + START_WAVE * 2,
        waveBreak: 0,
        over: false,
        watch: false,
        nextId: 1,
        events: [], // per-tick sound hooks the shell turns into tones
    }
}

export const citiesAlive = (gs) => gs.cities.filter((c) => c.alive).length

export function startWave(gs) {
    gs.missilesLeftInWave = 10 + gs.wave * 2
    gs.spawning = true
    gs.state = 'playing'
}

function nextWave(gs) {
    gs.wave++
    gs.state = 'waveEnd'
    let bonus = 0
    gs.cities.forEach((c) => { if (c.alive) bonus += 100 })
    gs.silos.forEach((s) => { if (s.alive) bonus += s.ammo * 50; s.ammo = 10 })
    gs.score += bonus
    gs.waveBreak = WAVE_BREAK_TICKS // world seconds, never setTimeout (#1525)
    gs.events.push('wave')
}

// The engine's own click law: nearest live silo by |dx| to the aim point.
export function nearestSilo(gs, x) {
    let best = null
    let min = Infinity
    gs.silos.forEach((s) => {
        if (s.alive && s.ammo > 0) {
            const d = Math.abs(s.x - x)
            if (d < min) { min = d; best = s }
        }
    })
    return best
}

export function fireAt(gs, x, y, wid = null) {
    if (gs.state !== 'playing') return false
    const silo = nearestSilo(gs, x)
    if (!silo) return false
    silo.ammo--
    gs.abms.push({
        x: silo.x, y: silo.y,
        startX: silo.x, startY: silo.y,
        targetX: x, targetY: y,
        speed: ABM_SPEED,
        color: '#00ffff',
        wid,
        boom: null, // tick the shot detonates — the driver's cover window
    })
    gs.events.push('pew')
    return true
}

function spawnBlast(gs, x, y) {
    gs.blasts.push({
        x, y,
        radius: 1,
        growing: true,
        color: gs.rand() > 0.5 ? '#ffffff' : '#ff0000',
    })
    gs.events.push('boom')
}

// ---------------------------------------------------------------- physics ----
// Step one warhead exactly as the update below does — the driver's predictions
// must share the engine's discrete feet, not approximations of them.
export function stepWarhead(m, steps) {
    let { x, y } = m
    for (let i = 0; i < steps; i++) {
        const dx = m.targetX - x
        const dy = m.targetY - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) { x = m.targetX; y = m.targetY }
        else {
            const a = Math.atan2(dy, dx)
            x += Math.cos(a) * m.speed
            y += Math.sin(a) * m.speed
        }
    }
    return { x, y }
}

// ABM arrival rule of the update below: launched before tick n moves, it
// detonates on floor(d/speed)+1 — the strict `dist < speed` test costs the
// extra tick on exact multiples; predictions that miss it hit early.
export function abmArrivalTicks(d) {
    return Math.floor(d / ABM_SPEED) + 1
}

// One fixed tick. `cmd` is { aimX, aimY, wid? } when something decides to
// shoot this tick (attract pilot, the proven gunner, or a human click/key).
export function tickMc(gs, cmd = null) {
    gs.tick++
    gs.events.length = 0
    if (gs.state === 'gameOver') return

    if (cmd && gs.state === 'playing') fireAt(gs, cmd.aimX, cmd.aimY, cmd.wid ?? null)

    if (gs.state === 'waveEnd') {
        gs.waveBreak--
        if (gs.waveBreak <= 0) startWave(gs)
    }

    if (gs.state === 'playing') {
        if (gs.spawning) {
            gs.spawnTimer--
            if (gs.spawnTimer <= 0) {
                if (gs.missilesLeftInWave > 0) {
                    const targets = [...gs.cities, ...gs.silos].filter((t) => t.alive)
                    if (targets.length > 0) {
                        const pick = chooseEnemySpawn(gs.rand, targets)
                        gs.warheads.push({
                            id: gs.nextId++,
                            x: pick.x, y: 0,
                            startX: pick.startX, startY: 0,
                            targetX: pick.target.x,
                            targetY: pick.target.y,
                            speed: WARHEAD_SPEED_BASE + gs.wave * 0.1,
                            color: '#ff0000',
                            coverUntil: 0, // driver bookkeeping, inert without it
                        })
                        gs.missilesLeftInWave--
                        gs.spawnTimer = Math.max(10, 100 - gs.wave * 5)
                    }
                } else {
                    gs.spawning = false
                }
            }
        }

        // Wave clears only when the sky AND the fire are empty (verbatim law).
        if (!gs.spawning && gs.warheads.length === 0 && gs.blasts.length === 0) {
            nextWave(gs)
        }
    }

    gs.abms.forEach((m) => {
        const dx = m.targetX - m.x
        const dy = m.targetY - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) {
            spawnBlast(gs, m.targetX, m.targetY)
            m.dead = true
        } else {
            const a = Math.atan2(dy, dx)
            m.x += Math.cos(a) * m.speed
            m.y += Math.sin(a) * m.speed
        }
    })
    gs.abms = gs.abms.filter((m) => !m.dead)

    gs.warheads.forEach((m) => {
        const dx = m.targetX - m.x
        const dy = m.targetY - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < m.speed) {
            spawnBlast(gs, m.targetX, m.targetY)
            m.dead = true
        } else {
            const a = Math.atan2(dy, dx)
            m.x += Math.cos(a) * m.speed
            m.y += Math.sin(a) * m.speed
        }
    })

    gs.blasts.forEach((e) => {
        if (e.growing) {
            e.radius += BLAST_SPEED
            if (e.radius >= BLAST_RADIUS_MAX) e.growing = false
        } else {
            e.radius -= BLAST_SPEED
            if (e.radius <= 0) e.dead = true
        }
        gs.warheads.forEach((m) => {
            const dx = m.x - e.x
            const dy = m.y - e.y
            if (Math.sqrt(dx * dx + dy * dy) < e.radius) {
                m.dead = true
                gs.score += 25
            }
        })
        ;[...gs.cities, ...gs.silos].forEach((t) => {
            if (t.alive) {
                const dx = t.x - e.x
                const dy = t.y - e.y
                if (Math.sqrt(dx * dx + dy * dy) < e.radius) {
                    t.alive = false
                    if (gs.cities.every((c) => !c.alive)) {
                        gs.over = true
                        gs.state = 'gameOver'
                        gs.events.push('over')
                    }
                }
            }
        })
    })
    gs.blasts = gs.blasts.filter((e) => !e.dead)
    gs.warheads = gs.warheads.filter((m) => !m.dead)
}

// ---------------------------------------------------------- the gunner -------
// The proven route (#1637 b29). Reactive per tick — seat it from any position,
// hand it back mid-barrage. Priority is the LOWEST live warhead (the one
// closest to getting a city), and each warhead gets exactly one shot in
// flight; when its cover lapses and it still lives, the next tick re-solves.
export function gunnerStep(gs) {
    if (gs.state !== 'playing') return null
    const live = gs.warheads.filter((m) => !m.dead).sort((a, b) => b.y - a.y)
    for (const w of live) {
        if (gs.tick < w.coverUntil) continue // a shot is already promised to it
        let fired = null
        for (let j = 1; j <= 500; j++) {
            const p = stepWarhead(w, j)
            if (p.y > SAFE_Y) break // it only falls further; no safe meet ahead
            const silo = nearestSilo(gs, p.x)
            if (!silo) return null // batteries dry or dead — nothing to spend
            const d = Math.hypot(p.x - silo.x, p.y - silo.y)
            const k = abmArrivalTicks(d)
            if (k <= j) {
                // Detonates at tick now+k with radius >= 1; the warhead is at
                // this exact point at now+j >= now+k — distance 0 < radius.
                fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k }
                break
            }
        }
        if (fired) {
            w.coverUntil = fired.boom + 4
            return fired
        }
        // No safe intercept exists for the lowest warhead — higher ones are
        // covered by their own shots already in the air or by the next tick.
    }
    return null
}
