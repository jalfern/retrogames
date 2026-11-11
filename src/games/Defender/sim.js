// sim.js — the seeded engine and arcade scoring of DEFENDER (#1473 batch 17).
//
// Pre-port the Feb shell had no score, no lives and no terminal — the ship
// could not die — and terrain, wave dice and jitter all rolled off the raw
// unseeded RNG. This module extracts the whole simulation into one pure,
// seeded engine so Node audits can replay a planet and the scoring law without
// a browser, and so `?seed=N` replays the exact world (mulberry32 via
// seedRng, #1473).
//
// Fidelity (Williams arcade, 1981): landers (150) descend, abduct a human and
// haul it skyward; shot while carrying, the human falls — catch it (+250) and
// deliver it back to the surface (+500); a human that hits the ground is gone
// for the whole game. A lander that reaches the ground empty mutates into a
// mutant (1500) and hunts the ship. Clearing every lander and mutant resurfaces
// the wave (+1000). 3 lives, extra ship every 10,000, ~0.5 s death freeze
// (#1531), respawn grace, and the
// run ends honestly at GAME OVER. Documented gaps (see README): smart bomb,
// hyperspace, meteor-swarm bonus; collisions at the wrap seam are skipped.

export const WORLD_WIDTH = 4000
export const HUMAN_COUNT = 5
export const LANDER_SPEED = 0.9      // descend/ascend pace, px per tick
export const MUTANT_SPEED = 2.4
export const WALK_SPEED = 0.3

// Arcade score table: lander 150, mutant 1500, falling human caught 250,
// carried human delivered 500, wave cleared 1000, extra ship every 10,000.
export const SCORE_LANDER = 150
export const SCORE_MUTANT = 1500
export const SCORE_CATCH = 250
export const SCORE_DELIVER = 500
export const SCORE_WAVE = 1000
export const BONUS_LIFE_EVERY = 10000

export const START_LIVES = 3
export const RESPAWN_DELAY = 60     // ~1 s dark before the ship returns
export const INVULN_TICKS = 120     // ~2 s blinking grace after respawn
export const DEATH_FREEZE = 30      // ~0.5 s the machine holds the dead frame
                                    // before the respawn countdown (#1531)

// Shortest signed distance on the wrap-around planet.
export function wrapDelta(dx, width = WORLD_WIDTH) {
    let d = dx % width
    if (d > width / 2) d -= width
    if (d < -width / 2) d += width
    return d
}

// Heightmap: one sample per 10 px, seeded wandering between the limits of
// the original's terrain band.
export function makeTerrain(rand, width, height) {
    const pts = []
    let y = height - 100
    for (let x = 0; x <= width; x += 10) {
        y += (rand() - 0.5) * 40
        if (y > height - 20) y = height - 20
        if (y < height - 200) y = height - 200
        pts.push(y)
    }
    return pts
}

export function groundAt(pts, x) {
    const w = pts.length * 10 - 10
    let xi = x % w
    if (xi < 0) xi += w
    const i = Math.min(Math.floor(xi / 10), pts.length - 2)
    const t = (xi - i * 10) / 10
    return pts[i] * (1 - t) + pts[i + 1] * t
}

// Five humans, evenly spread around the planet, each walking one way.
export function makeHumans(rand, pts) {
    const humans = []
    const seg = WORLD_WIDTH / HUMAN_COUNT
    for (let i = 0; i < HUMAN_COUNT; i++) {
        const x = (i + 0.2 + 0.6 * rand()) * seg
        humans.push({ x, y: groundAt(pts, x) - 4, dir: rand() < 0.5 ? -1 : 1, state: 'walk' })
    }
    return humans
}

// Wave field: the original opened with 8 landers; each wave adds one, capped
// at 12 so late waves stay survivable.
export function spawnWave(rand, wave, height) {
    const landers = []
    const count = Math.min(7 + wave, 12)
    for (let i = 0; i < count; i++) {
        landers.push({
            x: rand() * WORLD_WIDTH,
            y: 60 + rand() * Math.max(60, height * 0.45),
            vx: (rand() - 0.5) * 1.2,
            vy: 0.2 + rand() * 0.4,
            type: 'lander',
            state: 'wander',
            carry: null,
        })
    }
    return landers
}

// How many extra ships the score has earned (arcade: one per 10,000).
export const livesForScore = (score) => Math.floor(score / BONUS_LIFE_EVERY)

// Count of still-living humans (walk/abducted/falling/carried all count;
// only `dead` is gone).
export const humansAlive = (humans) => humans.filter((h) => h.state !== 'dead').length

// WATCH route (#1637 batch 18; defends the humans since batch 19) — the patrol
// the attract screen already flies, extracted from index.jsx so ONE brain drives
// attract, seat and proof (the no-forked-brain law). Pure per-tick reaction: the
// planet's own job ranking. A lander HAULING a human outranks everything — shoot
// it and the human drops, recoverable; a lander on a dive is next. A held human
// is carried down the elevator and set back on the surface (+500, and a full
// street at wave clear is the arcade's own bonus). A falling human is flown into,
// not shot at: sit just above it and let gravity bring it into the harness (+250).
// Otherwise chase the nearest threat on the wrap (vertical proximity weighs more —
// the guns fire flat along the facing), lift off the wireframe it hugs, and fire
// at anything level inside laser range — EXCEPT when a walking human stands in the
// laser line closer than the target (the arcade's friendly-fire law runs both
// ways). No rand, no memory — honest from any position.
// Honest measure (defendercheck's WITNESS, two seeded 150-second patrol sets
// — 20 witness + 20 untuned holdout): every seed survives to the horizon with
// lives to spare, banks its floor (witness >= 7,000, holdout >= 1,300), and
// NO seed crashes twice (b21 crash law). The patrol rescues a human
// (catch + deliver) on most seeds, does NOT fly collision-free (a graze about
// once a patrol — see the README for the six b21 policing designs that all
// traded flow or floors), and cannot always reach a far-side haul before it
// crests. The watch advertises the route, not invincibility — any input takes
// over, and the seat releases with the run.
export const watchRoute = (s) => {
    const input = { left: false, right: false, up: false, down: false, fire: false }
    const p = s.player
    if (s.over || p.dark > 0) return input
    const lookX = ((p.x + p.vx * 12) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
    const floorY = Math.min(groundAt(s.terrain, p.x), groundAt(s.terrain, lookX))
    const climbing = p.y > floorY - 30
    if (climbing) input.up = true

    // Delivery: a held human rides below the ship — descend the elevator and hold
    // the ~10 px band above the wireframe so it touches down and walks (+500).
    if (s.carrying !== null) {
        const want = groundAt(s.terrain, p.x) - 13
        if (p.y < want - 2) input.down = true
        else if (p.y > want + 2) input.up = true
        if (p.vx > 1.2) input.left = true
        else if (p.vx < -1.2) input.right = true
        return input
    }

    // Rescue: a human already falling is worth banking if the ship can get under
    // it before the surface — chase only a realistically reachable one (scaled to
    // how far it still has to fall and how low it already is), then sit just
    // above and let it drop into the harness.
    let fall = null
    let fallD = Infinity
    for (const h of s.humans) {
        if (h.state !== 'falling') continue
        const d = Math.abs(wrapDelta(h.x - p.x)) + Math.abs(h.y - p.y) * 3
        if (d < fallD) { fallD = d; fall = h }
    }
    if (fall && fallD < 1000 && !climbing) {
        const fdx = wrapDelta(fall.x - p.x)
        if (fdx > 4) input.right = true
        else if (fdx < -4) input.left = true
        const wantY = fall.y - 12
        if (p.y < wantY - 4) input.down = true
        else if (p.y > wantY + 6) input.up = true
        return input
    }

    // Threat choice, weighted by the planet's job: a hauler is the top priority,
    // a diver next, everything else nearest-first.
    let best = null
    let bestD = Infinity
    for (const e of s.enemies) {
        let d = Math.abs(wrapDelta(e.x - p.x)) + Math.abs(e.y - p.y) * 6
        if (e.type === 'lander' && e.carry !== null) d *= 0.25
        else if (e.type === 'lander' && e.state === 'descend') d *= 0.7
        if (d < bestD) { bestD = d; best = e }
    }
    if (best) {
        const dx = wrapDelta(best.x - p.x)
        const dy = best.y - p.y
        if (dx > 6) input.right = true
        else if (dx < -6) input.left = true
        if (!climbing) {
            if (dy > 10) input.down = true
            else if (dy < -10) input.up = true
        }
        if (Math.abs(dy) < 15 && Math.abs(dx) < 560 && (dx === 0 || Math.sign(dx) === p.facing)) {
            // Friendly-fire guard: never send a laser down a line where a walking
            // human stands closer than the target — your shots kill humans too.
            let shield = false
            for (const h of s.humans) {
                if (h.state !== 'walk') continue
                const hd = wrapDelta(h.x - p.x)
                if (Math.abs(hd) < Math.abs(dx) + 8 && Math.sign(hd || p.facing) === Math.sign(dx || p.facing) && Math.abs(h.y - p.y) < 10) shield = true
            }
            if (!shield) input.fire = true
            else input.holdTell = true // #1907: the brain SHOWS why it held the trigger
        }
    }
    return input
}

// One full simulation step. `input` = {left,right,up,down,fire}; the planet
// wrap, scoring, abduction chain, mutation and terminal all live here, driven
// by a single mulberry32 stream `rand` (seedRng(seed)).
export function createSim({ rand, height }) {
    const s = {
        tick: 0,
        score: 0,
        lives: START_LIVES,
        wave: 1,
        over: false,
        bonusLives: 0,
        terrain: makeTerrain(rand, WORLD_WIDTH, height),
        humans: [],
        enemies: [],
        lasers: [],
        particles: [],
        player: { x: 200, y: 200, vx: 3, vy: 0, facing: 1, cooldown: 0, dark: 0, invuln: 0 },
        carrying: null,
        freeze: 0,
        celebrate: 0, // #1907: wave-clear celebration ticks (the planet-explode beat)
        events: [],
    }
    s.humans = makeHumans(rand, s.terrain)
    s.enemies = spawnWave(rand, 1, height)

    // #1907: kills read by COLOR, like the cabinet — landers pop green, mutants
    // burst red, the wreck burns orange, a lost human sparks gold.
    const killFx = (x, y, n, col = '#ffffff') => {
        for (let i = 0; i < n; i++) {
            s.particles.push({ x, y, vx: (rand() - 0.5) * 10, vy: (rand() - 0.5) * 10, life: 30, col })
        }
    }
    // #1907: a rand-FREE burst — the seedpin law says the witness stream may
    // not shift by a single draw, so announced flashes use a fixed pattern.
    const flashBurst = (x, y, col) => {
        for (let i = 0; i < 8; i++) {
            s.particles.push({ x, y, vx: Math.cos(i * Math.PI / 4) * 4, vy: Math.sin(i * Math.PI / 4) * 4, life: 22, col })
        }
    }

    const addScore = (pts) => {
        s.score += pts
        if (livesForScore(s.score) > s.bonusLives) { s.bonusLives += 1; s.lives += 1; s.events.push({ t: 'bonus' }) }
    }

    const die = () => {
        s.lives -= 1
        s.events.push({ t: 'die' })
        killFx(s.player.x, s.player.y, 16, '#ff8a3c')
        if (s.lives <= 0) {
            s.lives = 0
            s.over = true
            s.events.push({ t: 'over' })
            return
        }
        s.player.x = 200
        s.player.y = 200
        s.player.vx = 3
        s.player.vy = 0
        s.player.dark = RESPAWN_DELAY
        s.player.invuln = RESPAWN_DELAY + INVULN_TICKS
        s.freeze = DEATH_FREEZE // the machine holds the explosion on screen
        // A ship captured at death is dropped; if it falls through the ground
        // it dies, like everything else that hits the surface.
        if (s.carrying !== null) { s.humans[s.carrying].state = 'falling'; s.humans[s.carrying].vy = 1; s.carrying = null }
    }

    s.step = (input) => {
        s.tick += 1
        s.events = []
        if (s.over) return s
        // Death pause (#1531): the cabinet froze the screen with the wreck on
        // it for half a second before the respawn countdown — nothing moves,
        // particles included; only the clock runs.
        if (s.freeze > 0) { s.freeze -= 1; return s }
        if (s.celebrate > 0) s.celebrate -= 1 // #1907: the wave-clear beat burns its own clock

        const p = s.player

        // --- Player flight (inertia like the Jupiter fighter) ---
        if (p.dark > 0) {
            p.dark -= 1
            p.invuln -= 1
        } else {
            if (input.left) { p.vx -= 0.5; p.facing = -1 }
            if (input.right) { p.vx += 0.5; p.facing = 1 }
            if (input.up) p.vy -= 0.5
            if (input.down) p.vy += 0.5
        }
        p.vx *= 0.98
        p.vy *= 0.95
        p.vx = Math.max(-8, Math.min(8, p.vx))
        p.vy = Math.max(-8, Math.min(8, p.vy))
        p.x = ((p.x + p.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        p.y += p.vy
        if (p.y < 60) p.y = 60
        const ceil = groundAt(s.terrain, p.x)
        if (p.dark <= 0 && p.invuln <= 0 && ceil - p.y < 8) { die(); return s }
        if (p.y > groundAt(s.terrain, p.x) - 8) p.y = groundAt(s.terrain, p.x) - 8
        if (p.cooldown > 0) p.cooldown -= 1

        // --- Lasers ---
        if (input.fire && p.cooldown <= 0 && p.dark <= 0) {
            s.lasers.push({ x: p.x + (p.facing === 1 ? 20 : -20), y: p.y, vx: p.facing * 20, life: 60 })
            p.cooldown = 10
        }
        s.lasers.forEach((l) => {
            l.x = ((l.x + l.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
            l.life -= 1
        })
        s.lasers = s.lasers.filter((l) => l.life > 0)

        // --- Humans ---
        s.humans.forEach((h) => {
            if (h.state === 'walk') {
                h.x = ((h.x + h.dir * WALK_SPEED) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                h.y = groundAt(s.terrain, h.x) - 4
            } else if (h.state === 'abducted' || h.state === 'carried') {
                // position is owned by the carrier below
            } else if (h.state === 'falling') {
                h.vy += 0.05
                h.y += h.vy
                if (h.y >= groundAt(s.terrain, h.x) - 4) {
                    h.state = 'dead'
                    h.y = groundAt(s.terrain, h.x) - 4
                    s.events.push({ t: 'humanDied' })
                    killFx(h.x, h.y, 6, '#ffd23f')
                }
            }
        })

        // --- Enemies: landers (wander → descend → abduct → ascend) and mutants ---
        s.enemies.forEach((e) => {
            if (e.type === 'mutant') {
                // Fast, evasive chase on the wrap.
                const dx = wrapDelta(p.x - e.x)
                const dy = p.y - e.y
                e.vx += Math.sign(dx) * 0.12
                e.vy += Math.sign(dy) * 0.12
                if (rand() < 0.03) e.vy += (rand() - 0.5) * 3
                e.vx = Math.max(-MUTANT_SPEED, Math.min(MUTANT_SPEED, e.vx))
                e.vy = Math.max(-MUTANT_SPEED, Math.min(MUTANT_SPEED, e.vy))
            } else {
                const held = e.carry !== null ? s.humans[e.carry] : null
                if (e.state === 'wander') {
                    e.vy += (rand() - 0.42) * 0.06
                    e.vy = Math.max(-0.4, Math.min(0.6, e.vy))
                    if (rand() < 0.008) {
                        // Pick the nearest living walking human and dive for it.
                        let best = null
                        let bestD = Infinity
                        s.humans.forEach((h, i) => {
                            if (h.state !== 'walk') return
                            const d = Math.abs(wrapDelta(h.x - e.x))
                            if (d < bestD) { bestD = d; best = i }
                        })
                        if (best !== null) { e.state = 'descend'; e.target = best }
                    }
                } else if (e.state === 'descend') {
                    const h = s.humans[e.target]
                    if (!h || h.state !== 'walk') {
                        // Losing the target mid-dive must never leave a human
                        // frozen mid-air: whatever it held starts falling.
                        if (e.carry !== null) {
                            const held0 = s.humans[e.carry]
                            if (held0.state === 'abducted') { held0.state = 'falling'; held0.vy = 1 }
                        }
                        e.carry = null
                        e.state = 'ascend'
                    } else {
                        const dx = wrapDelta(h.x - e.x)
                        const dy = (h.y - 14) - e.y
                        e.x += Math.sign(dx) * Math.min(Math.abs(dx), LANDER_SPEED)
                        e.y += Math.sign(dy) * Math.min(Math.abs(dy), LANDER_SPEED)
                        if (Math.abs(dx) < 6 && Math.abs(dy) < 8) {
                            // Abduction: the human dangles below and rises with it.
                            h.state = 'abducted'
                            e.carry = e.target
                            e.target = null
                            e.state = 'ascend'
                            s.events.push({ t: 'abduct' })
                        }
                    }
                } else if (e.state === 'ascend') {
                    e.vy = -(LANDER_SPEED * 0.8)
                    if (held) {
                        // Haul the human toward the surface again — if it lands
                        // with its catch, the human is gone and the shell mutates.
                        if (e.y > groundAt(s.terrain, e.x) - 14) {
                            held.state = 'dead'
                            held.y = groundAt(s.terrain, held.x) - 4
                            held.vy = 0
                            e.carry = null
                            e.state = 'hunt'
                            e.type = 'mutant'
                            e.vy = -1.5
                            s.events.push({ t: 'humanDied' })
                            s.events.push({ t: 'mutate' })
                            flashBurst(e.x, e.y, '#b1ff5e') // #1907: mutation flash, same tell as a ground mutate
                        }
                    }
                    if (e.state === 'ascend' && e.y < 70) {
                        e.state = 'wander'
                        e.carry = null
                        if (held) {
                            held.state = 'dead'
                            held.vy = 0
                            held.y = groundAt(s.terrain, held.x) - 4
                            s.events.push({ t: 'humanDied' })
                        }
                    }
                }
                if (e.state === 'wander' || e.state === 'descend') {
                    e.x = ((e.x + e.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                    e.y += e.vy
                } else if (e.state === 'ascend') {
                    e.x = ((e.x + e.vx * 0.5) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                    e.y += e.vy
                }
                // Empty lander touching the ground mutates (the 1981 law).
                if (e.type === 'lander' && !e.carry && e.y >= groundAt(s.terrain, e.x) - 12) {
                    e.type = 'mutant'
                    e.state = 'hunt'
                    e.vy = -1.5
                    s.events.push({ t: 'mutate' })
                    flashBurst(e.x, e.y, '#b1ff5e') // #1907: the shell flashes green as it turns
                }
                // Carried human rides just below the shell.
                if (e.carry !== null) {
                    const h2 = s.humans[e.carry]
                    h2.x = e.x
                    h2.y = e.y + 16
                }
            }
            e.x = ((e.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
            e.y = Math.max(55, Math.min(groundAt(s.terrain, e.x) - 2, e.y))
        })

        // --- Laser hits: the arcade's scoring table ---
        s.lasers.forEach((l) => {
            s.enemies.forEach((e) => {
                if (e.dead || l.life <= 0) return
                if (Math.abs(wrapDelta(l.x - e.x)) < 20 && Math.abs(l.y - e.y) < 16) {
                    e.dead = true
                    l.life = 0
                    if (e.type === 'lander') {
                        addScore(SCORE_LANDER)
                        s.events.push({ t: 'killLander', pts: SCORE_LANDER })
                        killFx(e.x, e.y, 10, '#3dff5e') // the arcade's green lander pop (#1907)
                        if (e.carry !== null) {
                            const h = s.humans[e.carry]
                            h.state = 'falling'
                            h.vy = 1
                            e.carry = null
                        }
                    } else {
                        addScore(SCORE_MUTANT)
                        s.events.push({ t: 'killMutant', pts: SCORE_MUTANT })
                        killFx(e.x, e.y, 10, '#ff5555') // mutants burst red (#1907)
                    }
                }
            })
            // Friendly fire exists in the original — your shots can kill the
            // very humans you are defending.
            s.humans.forEach((h) => {
                if (h.state === 'walk' && Math.abs(wrapDelta(l.x - h.x)) < 8 && Math.abs(l.y - h.y) < 8) {
                    l.life = 0
                    h.state = 'dead'
                    s.events.push({ t: 'humanDied' })
                }
            })
        })
        s.enemies = s.enemies.filter((e) => !e.dead)
        s.lasers = s.lasers.filter((l) => l.life > 0)

        // --- Falling humans: mid-air catch, then delivery ---
        s.humans.forEach((h, i) => {
            if (h.state === 'falling' && p.dark <= 0 && s.carrying === null) {
                if (Math.abs(wrapDelta(h.x - p.x)) < 16 && Math.abs(h.y - p.y - 12) < 16) {
                    h.state = 'carried'
                    s.carrying = i
                    addScore(SCORE_CATCH)
                    s.events.push({ t: 'catch', pts: SCORE_CATCH })
                }
            }
            if (h.state === 'carried') {
                h.x = p.x
                h.y = p.y + 12
                if (groundAt(s.terrain, h.x) - h.y < 6) {
                    h.state = 'walk'
                    h.y = groundAt(s.terrain, h.x) - 4
                    s.carrying = null
                    addScore(SCORE_DELIVER)
                    s.events.push({ t: 'deliver', pts: SCORE_DELIVER })
                }
            }
        })

        // --- Ship collision: enemies kill the fighter ---
        if (p.dark <= 0 && p.invuln <= 0) {
            for (const e of s.enemies) {
                if (Math.abs(wrapDelta(e.x - p.x)) < 18 && Math.abs(e.y - p.y) < 16) { die(); break }
            }
        }

        // --- Wave clear ---
        if (s.enemies.length === 0) {
            addScore(SCORE_WAVE)
            s.wave += 1
            s.enemies = spawnWave(rand, s.wave, height)
            s.celebrate = 100 // #1907: the planet-exploses celebration beat before the new wave settles
            s.events.push({ t: 'wave', pts: SCORE_WAVE })
        }

        // --- Particles ---
        s.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.life -= 1 })
        s.particles = s.particles.filter((pt) => pt.life > 0)
        return s
    }

    return s
}
