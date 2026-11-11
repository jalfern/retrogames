// sim.js — the seeded dice, arcade scoring, the WHOLE play tick and the
// WATCH driver of ASTEROIDS (#1473 batch 16; #1637 batch 26).
//
// Pre-port the shape/velocity/position dice rolled off the unseeded die, the
// ship could not die, and there was no score at all — no terminal existed.
// This module extracts the pure half: asteroid creation on the run's mulberry32
// stream, wave spawning, and the 1979 arcade scoring table
// (large 20 / medium 50 / small 100) so pongcheck-style Node audits can replay
// a field and the score law without a browser.
//
// Batch 26 lifted the whole rule set (b24/b25 template): makeRun(seed) is the
// entire world, tickAsteroids(gs, input) is what update() used to be, and
// asteroidscheck proves the SHIPPED physics — survival, splits, waves, the
// terminal — in plain Node. index.jsx keeps only shell: canvas, sound, chrome.
//
// Fidelity note: the b15 handoff map sketched "10/50/20 per rock size" — that
// is not the arcade table. The machine paid large=20, medium=50, small=100,
// and the extra life came at 10,000 points. Fidelity beats the map (#237 law);
// the disagreement is recorded on #1473.

export const SHIP_SIZE = 20
// The arcade wedge with the thruster-side notch (#2001 look polish, docs/ART.md):
// the cabinet's ship is not a plain triangle — the flat back carries a shallow
// V where the thruster sits. Ship-local, nose along +x, drawn from this table so
// the look and the asteroidscheck pin can never drift apart.
export const SHIP_HULL = [
    [SHIP_SIZE, 0],
    [-SHIP_SIZE * 0.45, SHIP_SIZE * 0.4],
    [-SHIP_SIZE * 0.15, 0],
    [-SHIP_SIZE * 0.45, -SHIP_SIZE * 0.4],
]
export const BULLET_SPEED = 6
export const ROTATION_SPEED = 0.08
export const ACCELERATION = 0.1
export const FRICTION = 0.99

export const START_LIVES = 3
export const RESPAWN_DELAY = 60   // ~1 s dark before the ship returns
export const INVULN_TICKS = 120   // ~2 s blinking invulnerability (arcade grace)
// #2001 hyperspace — the desperate teleport: a panic button with its own
// cooldown; the arrival lands with mercy (the original ran a crash lottery;
// this machine gives you the blink and the grace instead).
export const HYPER_COOLDOWN = 60  // no re-jump for ~1 s (held button cannot spam)
export const HYPER_INVULN = 45    // ~0.75 s of arrival grace
export const HYPER_BLINK = 15     // hidden while rematerialising (~0.25 s)
export const BONUS_LIFE_EVERY = 10000
export const FIRE_COOLDOWN = 15

// Flying saucers (#2001) — the 1979 machine's signature threat. It paid 200
// for the large saucer and 1000 for the small one, and a saucer's OWN bullet
// that smashed a rock paid more than the player's: the large UFO 50/100/200
// and the small UFO 200/1000/5000 (small/medium/large rock) — the reckless
// alien gunner is bonus fire. These are the machine's tables (#237 law).
export const SAUCER_RADIUS = { big: 22, small: 12 }
export const SAUCER_BULLET_SPEED = 4
export const SAUCER_SCORE = { big: 200, small: 1000 }
export const SAUCER_ROCK_BONUS = {
    big: { big: 200, medium: 100, small: 50 },
    small: { big: 5000, medium: 1000, small: 200 },
}
const sizeTier = (size) => (size >= 30 ? 'big' : size >= 20 ? 'medium' : 'small')
// Alarms arrive every 8–14 s while rocks are on the field; the first after
// ~18 s — the arcade never opened an alarm the instant the game did.
const SAUCER_FIRST = 1080
const saucerGap = (gs) => gs.tickN + 480 + Math.floor(rnd(gs) * 360)

// The machine's stream: one mulberry32 state carried INSIDE gs (b16 law), so
// a rollout can clone the world and fork the dice deterministically, and the
// hash covers the stream position too. Identical steps to seedRng(seed).
export function rnd(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Arcade size tiers by screen size: 40 → 20 → 10 through the split chain.
export const scoreForSize = (size) => (size >= 30 ? 20 : size >= 20 ? 50 : 100)

// One asteroid: silhouette, velocity and (when unforced) position on the stream.
// #2001 look polish — the machine's rocks JAG: the vector sets the cabinet etched
// are irregular, more pronounced the bigger the rock (docs/ART.md bar 1). The
// jag is per size tier; the dice COUNT per rock is untouched, so the stream's
// position and every downstream roll stay identical to pre-polish seeds.
const JAG = (size) => (size >= 30 ? 0.25 : size >= 20 ? 0.2 : 0.15)
export function makeAsteroid(rand, x, y, size, width, height) {
    const vertices = []
    const numVertices = 8 + Math.floor(rand() * 4)
    const jag = JAG(size)
    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2
        const r = size * (1 - jag + rand() * jag * 2)
        vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    }
    return {
        x: x !== null && x !== undefined ? x : rand() * width,
        y: y !== null && y !== undefined ? y : rand() * height,
        vx: (rand() - 0.5) * 2,
        vy: (rand() - 0.5) * 2,
        size,
        vertices,
    }
}

// Wave field: the port opened with 6 large rocks; each wave adds one more,
// capped at 11 so late waves stay survivable.
export function spawnWave(rand, wave, width, height) {
    const rocks = []
    const count = Math.min(5 + wave, 11)
    for (let i = 0; i < count; i++) rocks.push(makeAsteroid(rand, null, null, 40, width, height))
    return rocks
}

// How many extra lives the total score has earned (arcade: one per 10,000).
export const livesForScore = (score) => Math.floor(score / BONUS_LIFE_EVERY)

// ---------------------------------------------------------------------------
// The world. makeRun(seed) is the whole game state: rocks, ship, bullets and
// every die on one seeded stream, so ?seed=N replays the exact field.
// ---------------------------------------------------------------------------
export function makeRun(seed, opts = {}) {
    const width = opts.width || 600
    const height = opts.height || 800
    const gs = {
        seed: seed >>> 0,
        rngState: seed | 0,
        width,
        height,
        tickN: 0,
        score: 0,
        lives: START_LIVES,
        bonusLives: 0,
        wave: 1,
        over: false,
        attract: !!opts.attract,
        watching: false, // #1637 b26 — the WATCH seat
        respawnAt: -1,   // tick the ship returns from, -1 = alive
        invulnUntil: 0,
        hyperReadyAt: 0, // #2001 — earliest tick the next hyperspace may fire
        hyperUntil: 0,   // hidden while rematerialising until this tick
        ship: { x: width / 2, y: height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, cooldown: 0 },
        asteroids: [],
        saucers: [],
        nextSaucerAt: 0, // set after the wave dice so the opening field stays the seed's
        bullets: [],
        particles: [],
    }
    gs.asteroids = spawnWave(() => rnd(gs), gs.wave, width, height)
    gs.nextSaucerAt = SAUCER_FIRST + Math.floor(rnd(gs) * 360)
    return gs
}

const shipAlive = (gs) => gs.respawnAt < 0

export function resetShip(gs) {
    gs.ship.x = gs.width / 2
    gs.ship.y = gs.height / 2
    gs.ship.vx = 0
    gs.ship.vy = 0
    gs.ship.angle = -Math.PI / 2
}

// Rebuild the board around the current dims (first real resize; the attract
// demo's field-empty refill). Mirrors pre-lift initGame().
export function rebuildBoard(gs) {
    resetShip(gs)
    gs.respawnAt = -1
    gs.invulnUntil = 0
    gs.hyperReadyAt = 0
    gs.hyperUntil = 0
    gs.asteroids = spawnWave(() => rnd(gs), gs.wave, gs.width, gs.height)
    gs.saucers = []
    gs.nextSaucerAt = saucerGap(gs)
    gs.bullets = []
    gs.particles = []
}

function spawnParticles(gs, x, y, count = 5) {
    for (let i = 0; i < count; i++) {
        gs.particles.push({
            x, y,
            vx: (rnd(gs) - 0.5) * 2,
            vy: (rnd(gs) - 0.5) * 2,
            life: 1.0,
        })
    }
}

function fire(gs, ev) {
    gs.bullets.push({
        x: gs.ship.x + Math.cos(gs.ship.angle) * SHIP_SIZE,
        y: gs.ship.y + Math.sin(gs.ship.angle) * SHIP_SIZE,
        vx: Math.cos(gs.ship.angle) * BULLET_SPEED,
        vy: Math.sin(gs.ship.angle) * BULLET_SPEED,
        life: 60,
    })
    gs.ship.cooldown = FIRE_COOLDOWN
    ev.pitch = rnd(gs) // the shot's voice — one die on the stream, shell-side pitch
    ev.shot = true
    // Recoil
    gs.ship.vx -= Math.cos(gs.ship.angle) * 0.1
    gs.ship.vy -= Math.sin(gs.ship.angle) * 0.1
}

function killShip(gs, ev) {
    spawnParticles(gs, gs.ship.x, gs.ship.y, 14)
    ev.flash.push({ x: gs.ship.x, y: gs.ship.y, r: SHIP_SIZE * 2 }) // #2001 — the death blooms
    gs.lives--
    ev.died = true
    if (gs.lives <= 0) {
        gs.lives = 0
        gs.over = true
    } else {
        gs.respawnAt = gs.tickN + RESPAWN_DELAY
    }
}

// Every score path runs the arcade bonus-life check (one extra per 10,000).
function addScore(gs, pts) {
    gs.score += pts
    const earned = livesForScore(gs.score)
    if (earned > gs.bonusLives) { gs.lives += earned - gs.bonusLives; gs.bonusLives = earned }
}

// Saucers (#2001): enter from a random edge, cross and wrap, and fire at the
// ship — the large one sprays (±0.55 rad of error, erratic course changes),
// the small one flies the arcade's sine weave nearly dead-on (±0.15). Attract
// mode gets the sight but never the fire. Dice all ride the run's stream, so
// ?seed=N replays every alarm's arrival, size, path and shot.
function tickSaucers(gs, ev) {
    if (gs.asteroids.length > 0 && gs.tickN >= gs.nextSaucerAt) {
        const big = rnd(gs) < 0.5
        const fromLeft = rnd(gs) < 0.5
        const r = SAUCER_RADIUS[big ? 'big' : 'small']
        gs.saucers.push({
            big,
            x: fromLeft ? -r : gs.width + r,
            y: 50 + rnd(gs) * (gs.height - 100),
            vx: (fromLeft ? 1 : -1) * (big ? 2.0 : 2.7),
            vy: big ? (rnd(gs) < 0.5 ? -1.4 : 1.4) : 0,
            phase: rnd(gs) * Math.PI * 2,
            amp: big ? 0 : 1.1 + rnd(gs) * 0.7,
            cooldown: big ? 60 : 40,
            life: 900, // an alarm that outlives its set piece leaves with the night
        })
        gs.nextSaucerAt = saucerGap(gs)
        ev.saucerSpawn = big ? 'big' : 'small' // truthy for ANY alarm — both sizes arrive with their sound
    }
    for (const s of gs.saucers) {
        s.x += s.vx
        s.life--
        const r = SAUCER_RADIUS[s.big ? 'big' : 'small']
        if (s.big) {
            s.y += s.vy
            if (gs.tickN % 30 === 0 && rnd(gs) < 0.6) s.vy = -s.vy
            if (s.y < 30) { s.y = 30; s.vy = Math.abs(s.vy) }
            if (s.y > gs.height - 30) { s.y = gs.height - 30; s.vy = -Math.abs(s.vy) }
        } else {
            s.phase += 0.07
            s.y += Math.sin(s.phase) * s.amp
        }
        if (s.x < -r) s.x = gs.width + r
        if (s.x > gs.width + r) s.x = -r
        s.cooldown--
        if (s.cooldown <= 0 && !gs.attract && shipAlive(gs)) {
            let ang = Math.atan2(gs.ship.y - s.y, gs.ship.x - s.x)
            ang += (rnd(gs) - 0.5) * (s.big ? 1.1 : 0.3)
            gs.bullets.push({
                x: s.x, y: s.y,
                vx: Math.cos(ang) * SAUCER_BULLET_SPEED,
                vy: Math.sin(ang) * SAUCER_BULLET_SPEED,
                life: 140, hostile: true, owner: s.big ? 'big' : 'small',
            })
            s.cooldown = s.big ? 80 + Math.floor(rnd(gs) * 40) : 45 + Math.floor(rnd(gs) * 25)
            ev.saucerShot = true
        }
    }
}

// The attract demo (pre-lift, verbatim): aim at the nearest rock, fire when
// aligned, drift toward it if far, refill the field on a die when empty.
function attractDemo(gs, ev) {
    let nearest = null
    let minDist = Infinity
    gs.asteroids.forEach(a => {
        const dx = a.x - gs.ship.x
        const dy = a.y - gs.ship.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist) { minDist = dist; nearest = a }
    })
    if (nearest) {
        const targetAngle = Math.atan2(nearest.y - gs.ship.y, nearest.x - gs.ship.x)
        let diff = targetAngle - gs.ship.angle
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        if (Math.abs(diff) < ROTATION_SPEED) {
            gs.ship.angle = targetAngle
            if (gs.ship.cooldown <= 0 && minDist < 300) fire(gs, ev)
        } else {
            gs.ship.angle += Math.sign(diff) * ROTATION_SPEED
        }
        if (minDist > 200) {
            gs.ship.vx += Math.cos(gs.ship.angle) * ACCELERATION * 0.5
            gs.ship.vy += Math.sin(gs.ship.angle) * ACCELERATION * 0.5
        }
    } else {
        if (rnd(gs) < 0.01) rebuildBoard(gs) // Respawn field if empty
    }
}

// ---------------------------------------------------------------------------
// One full play tick, lifted verbatim from index.jsx update() (#1637 b26) so
// asteroidscheck proves the SHIPPED physics: drift, wrap, splits through the
// 40→20→10 chain, respawn dark + grace, wave regen, the terminal. Mutates gs;
// returns the events index.jsx turns into sound. `input` ({left,right,thrust,
// fire}) is the held-key view — the same entry a keyframe and __game.step use;
// while watching with no human input, watchStep drives instead.
// ---------------------------------------------------------------------------
export function tickAsteroids(gs, input = null) {
    const ev = { shot: false, pitch: 0, smashed: 0, died: false, respawn: false, wave: 0, over: false, saucerSpawn: false, saucerShot: false, saucerKilled: null, hyper: false, flash: [] }
    gs.tickN++
    if (gs.over) { ev.over = true; return ev }

    // Respawn handling: dark pause, then return at center with grace.
    if (!shipAlive(gs) && gs.tickN >= gs.respawnAt) {
        resetShip(gs)
        gs.respawnAt = -1
        gs.invulnUntil = gs.tickN + INVULN_TICKS
        ev.respawn = true
    }

    if (gs.attract) {
        attractDemo(gs, ev)
    } else if (shipAlive(gs)) {
        const act = input || (gs.watching ? watchStep(gs) : null)
        if (act) {
            if (act.left) gs.ship.angle -= ROTATION_SPEED
            if (act.right) gs.ship.angle += ROTATION_SPEED
            if (act.thrust) {
                gs.ship.vx += Math.cos(gs.ship.angle) * ACCELERATION
                gs.ship.vy += Math.sin(gs.ship.angle) * ACCELERATION
                // Thruster particles (on the run's stream)
                if (rnd(gs) > 0.5) {
                    gs.particles.push({
                        x: gs.ship.x - Math.cos(gs.ship.angle) * SHIP_SIZE,
                        y: gs.ship.y - Math.sin(gs.ship.angle) * SHIP_SIZE,
                        vx: -Math.cos(gs.ship.angle) + (rnd(gs) - 0.5),
                        vy: -Math.sin(gs.ship.angle) + (rnd(gs) - 0.5),
                        life: 0.5,
                    })
                }
            }
            if (act.fire && gs.ship.cooldown <= 0) fire(gs, ev)
            // Hyperspace (#2001) — vanish, rematerialise at a SEEDED random
            // point (same seed, same panic), throttle zeroed, then the blink
            // and the arrival grace above. The driver never presses it.
            if (act.hyper && gs.tickN >= gs.hyperReadyAt) {
                gs.ship.x = rnd(gs) * gs.width
                gs.ship.y = rnd(gs) * gs.height
                gs.ship.vx = 0
                gs.ship.vy = 0
                gs.hyperReadyAt = gs.tickN + HYPER_COOLDOWN
                gs.hyperUntil = gs.tickN + HYPER_BLINK
                gs.invulnUntil = gs.tickN + HYPER_INVULN
                ev.hyper = true
            }
        }
    }

    if (gs.ship.cooldown > 0) gs.ship.cooldown--

    // Physics
    gs.ship.x += gs.ship.vx
    gs.ship.y += gs.ship.vy
    gs.ship.vx *= FRICTION
    gs.ship.vy *= FRICTION

    // Wrap Ship
    if (gs.ship.x < 0) gs.ship.x = gs.width
    if (gs.ship.x > gs.width) gs.ship.x = 0
    if (gs.ship.y < 0) gs.ship.y = gs.height
    if (gs.ship.y > gs.height) gs.ship.y = 0

    // Bullets
    gs.bullets.forEach(b => {
        b.x += b.vx
        b.y += b.vy
        b.life--
    })
    gs.bullets = gs.bullets.filter(b => b.life > 0)

    // Asteroids
    gs.asteroids.forEach(a => {
        a.x += a.vx
        a.y += a.vy
        // Wrap
        if (a.x < -a.size) a.x = gs.width + a.size
        if (a.x > gs.width + a.size) a.x = -a.size
        if (a.y < -a.size) a.y = gs.height + a.size
        if (a.y > gs.height + a.size) a.y = -a.size
    })

    // Particles
    gs.particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.02
    })
    gs.particles = gs.particles.filter(p => p.life > 0)

    // Saucers (#2001) — arrival, weave, fire.
    tickSaucers(gs, ev)

    // Collisions: player bullets vs saucers — 200 big / 1000 small, and the
    // bullet spends itself in the kill.
    gs.bullets.forEach(b => {
        if (b.hostile || b.life <= 0) return
        for (const s of gs.saucers) {
            if (s.dead) continue
            const dx = b.x - s.x
            const dy = b.y - s.y
            if (Math.sqrt(dx * dx + dy * dy) < SAUCER_RADIUS[s.big ? 'big' : 'small']) {
                b.life = 0
                s.dead = true
                addScore(gs, SAUCER_SCORE[s.big ? 'big' : 'small'])
                spawnParticles(gs, s.x, s.y, 12)
                ev.flash.push({ x: s.x, y: s.y, r: SAUCER_RADIUS[s.big ? 'big' : 'small'] * 1.8 })
                ev.saucerKilled = s.big ? 'big' : 'small'
                break
            }
        }
    })

    // Collisions: bullets vs rocks — arcade table 20/50/100 by size,
    // big rocks split into two mediums, mediums into two smalls. A SAUCER's
    // bullet smashing a rock pays the bonus table instead (50/100/200 from
    // the large UFO, 200/1000/5000 from the small one) — and it splits the
    // rock the same way; the field is shared.
    gs.bullets.forEach(b => {
        gs.asteroids.forEach(a => {
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < a.size) {
                // Hit
                b.life = 0
                a.hit = true
                addScore(gs, b.hostile ? SAUCER_ROCK_BONUS[b.owner][sizeTier(a.size)] : scoreForSize(a.size))
                // Split?
                if (a.size > 15) {
                    gs.asteroids.push(makeAsteroid(() => rnd(gs), a.x, a.y, a.size / 2, gs.width, gs.height))
                    gs.asteroids.push(makeAsteroid(() => rnd(gs), a.x, a.y, a.size / 2, gs.width, gs.height))
                }
                // Particle FX
                spawnParticles(gs, a.x, a.y)
                ev.flash.push({ x: a.x, y: a.y, r: a.size * 1.5 }) // #2001 — flash scales with the rock
                ev.smashed++
            }
        })
    })

    // Clean up hit asteroids and downed saucers
    gs.asteroids = gs.asteroids.filter(a => !a.hit)
    gs.saucers = gs.saucers.filter(s => !s.dead && s.life > 0)

    // Ship vs rocks (1979 law — the pre-batch ship could not die).
    if (shipAlive(gs) && gs.tickN >= gs.invulnUntil && !gs.attract) {
        for (const a of gs.asteroids) {
            const dx = a.x - gs.ship.x
            const dy = a.y - gs.ship.y
            if (Math.sqrt(dx * dx + dy * dy) < a.size + SHIP_SIZE * 0.4) {
                killShip(gs, ev)
                break
            }
        }
    }

    // Ship vs saucers and saucer fire — the alien kills on contact and on
    // hit; the respawn grace covers both (same 1979 mercy).
    if (shipAlive(gs) && gs.tickN >= gs.invulnUntil && !gs.attract && gs.saucers.length > 0) {
        for (const s of gs.saucers) {
            const dx = s.x - gs.ship.x
            const dy = s.y - gs.ship.y
            if (Math.sqrt(dx * dx + dy * dy) < SAUCER_RADIUS[s.big ? 'big' : 'small'] + SHIP_SIZE * 0.4) {
                killShip(gs, ev)
                break
            }
        }
    }
    if (!gs.attract && shipAlive(gs) && gs.tickN >= gs.invulnUntil && gs.bullets.length > 0) {
        for (const b of gs.bullets) {
            if (!b.hostile) continue
            const dx = b.x - gs.ship.x
            const dy = b.y - gs.ship.y
            if (Math.sqrt(dx * dx + dy * dy) < SHIP_SIZE * 0.5) {
                b.life = 0
                killShip(gs, ev)
                break
            }
        }
    }

    // Wave clear: the field empties → next wave (arcade refill). Saucers
    // never gate it — the machine's wave was rocks only.
    if (!gs.attract && !gs.over && gs.asteroids.length === 0) {
        gs.wave++
        gs.asteroids = spawnWave(() => rnd(gs), gs.wave, gs.width, gs.height)
        gs.nextSaucerAt = saucerGap(gs)
        ev.wave = gs.wave
    }
    return ev
}

// ---------------------------------------------------------------------------
// WATCH driver (#1637 b26). Reactive against live state every tick (Rogue
// law): seats anywhere, steers back, re-seats from exactly there. No rand in
// the policy — rollouts clone the world and fork the dice from the state, so
// every candidate is judged under identical future weather and the Node sweep
// and the seat drive ONE identical policy.
// ---------------------------------------------------------------------------

const WATCH_HORIZON = 70   // ~1.2 s — long enough for a led shot to fly and kill

// Wrap-aware delta (the whole field wraps — so does the driver's eye).
const wrapDelta = (d, span) => {
    while (d > span / 2) d -= span
    while (d < -span / 2) d += span
    return d
}

// Clone only what the tick mutates. Silhouettes are read-only: shared refs.
function cloneWorld(gs) {
    return {
        seed: gs.seed,
        rngState: ((gs.rngState ^ Math.imul(gs.tickN + 1, 2654435761)) ^ Math.imul(gs.seed, 40503)) | 0,
        width: gs.width,
        height: gs.height,
        tickN: gs.tickN,
        score: gs.score,
        lives: gs.lives,
        bonusLives: gs.bonusLives,
        wave: gs.wave,
        over: false,
        attract: false,
        watching: false,
        respawnAt: gs.respawnAt,
        invulnUntil: gs.invulnUntil,
        ship: { ...gs.ship },
        asteroids: gs.asteroids.map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, size: a.size, vertices: a.vertices })),
        saucers: gs.saucers.map(s => ({ ...s })),
        nextSaucerAt: gs.nextSaucerAt,
        hyperReadyAt: gs.hyperReadyAt, // #2001 pt4 — the rollout must see the reserve state
        hyperUntil: gs.hyperUntil,
        bullets: gs.bullets.map(b => ({ ...b })),
        particles: [],
    }
}

// Signed gap from the hull to the nearest hazard (wrap-aware), negative = doom.
// #2001: saucers and their fire count as hazards too.
function closestGap(c) {
    let best = Infinity
    for (const a of c.asteroids) {
        const dx = wrapDelta(a.x - c.ship.x, c.width)
        const dy = wrapDelta(a.y - c.ship.y, c.height)
        const g = Math.sqrt(dx * dx + dy * dy) - (a.size + SHIP_SIZE * 0.4)
        if (g < best) best = g
    }
    for (const s of c.saucers) {
        const dx = wrapDelta(s.x - c.ship.x, c.width)
        const dy = wrapDelta(s.y - c.ship.y, c.height)
        const g = Math.sqrt(dx * dx + dy * dy) - (SAUCER_RADIUS[s.big ? 'big' : 'small'] + SHIP_SIZE * 0.4)
        if (g < best) best = g
    }
    for (const b of c.bullets) {
        if (!b.hostile) continue
        const dx = wrapDelta(b.x - c.ship.x, c.width)
        const dy = wrapDelta(b.y - c.ship.y, c.height)
        const g = Math.sqrt(dx * dx + dy * dy) - (2.5 + SHIP_SIZE * 0.4)
        if (g < best) best = g
    }
    return best
}

// Honest time-to-collision on the torus-relative line (|Δ + v·t| = rr).
function arriveTTC(dx, dy, rvx, rvy, rr) {
    const cq = dx * dx + dy * dy - rr * rr
    let ttc = Infinity
    if (cq <= 0) ttc = 0
    else {
        const bq = dx * rvx + dy * rvy
        if (bq < 0) {
            const disc = bq * bq - cq
            if (disc > 0) ttc = -bq - Math.sqrt(disc)
        }
    }
    return ttc
}

// The saucer's instantaneous vertical velocity — the large one drifts on a
// flipped course, the small one rides its sine weave.
const saucerVy = (s) => (s.big ? s.vy : Math.cos(s.phase) * s.amp)

// Scan once for the two things the policy reads: the rock whose honest time
// to collision is soonest (|Δ + v·t| = rr on the torus-relative line — a
// pebble creeping at 1 px/t never arrives, and fleeing it is what left the
// first driver orbiting the last rock forever), and the lead aim at the
// nearest rock: solve |Δ + vRock·t| = BULLET_SPEED·t (the game's own linear
// arithmetic — bullets spawn at constant speed off the hull) and aim where
// the rock will be when the bullet gets there.
function scan(c) {
    let threat = null
    let tThreat = Infinity
    let nd = Infinity
    let ndx = 0
    let ndy = 0
    let ndvx = 0
    let ndvy = 0
    let ndR = 0
    let near = null
    for (const a of c.asteroids) {
        const dx = wrapDelta(a.x - c.ship.x, c.width)
        const dy = wrapDelta(a.y - c.ship.y, c.height)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < nd) { nd = dist; near = a; ndx = dx; ndy = dy; ndvx = a.vx; ndvy = a.vy; ndR = a.size }
        const rr = a.size + SHIP_SIZE * 0.4
        const ttc = arriveTTC(dx, dy, a.vx - c.ship.vx, a.vy - c.ship.vy, rr)
        if (ttc < 45 && ttc < tThreat) { tThreat = ttc; threat = a }
    }
    // #2001 — the saucers shoot back, so they enter the driver's eye twice:
    // as threats (hull and fire) and as targets worth closing on. A kill pays
    // 200/1000 against a rock's 20/50/100, so the eye discounts their
    // distance by 120 px — the machine's own economics, aimed with their
    // instantaneous velocity (the weave is slow, the lead stays honest).
    for (const s of c.saucers) {
        const dx = wrapDelta(s.x - c.ship.x, c.width)
        const dy = wrapDelta(s.y - c.ship.y, c.height)
        const svy = saucerVy(s)
        const rr = SAUCER_RADIUS[s.big ? 'big' : 'small'] + SHIP_SIZE * 0.4
        const ttc = arriveTTC(dx, dy, s.vx - c.ship.vx, svy - c.ship.vy, rr)
        if (ttc < 75 && ttc < tThreat) { tThreat = ttc; threat = { x: s.x, y: s.y } }
        // Hunt the UFO, but never buzz the muzzle: the kill discount applies
        // only beyond 160 px — inside that, its own gun outranks its bounty.
        const raw = Math.sqrt(dx * dx + dy * dy)
        const dist = raw - (raw > 160 ? 120 : 0)
        if (dist < nd) { nd = dist; near = s; ndx = dx; ndy = dy; ndvx = s.vx; ndvy = svy; ndR = SAUCER_RADIUS[s.big ? 'big' : 'small'] }
    }
    for (const b of c.bullets) {
        if (!b.hostile) continue
        const dx = wrapDelta(b.x - c.ship.x, c.width)
        const dy = wrapDelta(b.y - c.ship.y, c.height)
        const ttc = arriveTTC(dx, dy, b.vx - c.ship.vx, b.vy - c.ship.vy, 2.5 + SHIP_SIZE * 0.4)
        if (ttc < 60 && ttc < tThreat) { tThreat = ttc; threat = { x: b.x, y: b.y } }
    }
    let aim = null
    if (near) {
        let aimX = ndx
        let aimY = ndy
        const qa = ndvx * ndvx - BULLET_SPEED * BULLET_SPEED
        const qb = 2 * (ndx * ndvx + ndy * ndvy)
        const qc = ndx * ndx + ndy * ndy
        let tHit = 0
        if (Math.abs(qa) < 1e-9) {
            if (Math.abs(qb) > 1e-9) tHit = -qc / qb
        } else {
            const disc = qb * qb - 4 * qa * qc
            if (disc >= 0) {
                const r1 = (-qb - Math.sqrt(disc)) / (2 * qa)
                const r2 = (-qb + Math.sqrt(disc)) / (2 * qa)
                tHit = Math.min(...[r1, r2].filter(t => t > 0)) || 0
            }
        }
        if (tHit > 0 && tHit < WATCH_HORIZON) {
            aimX = ndx + ndvx * tHit
            aimY = ndy + ndvy * tHit
        }
        const raw = Math.atan2(aimY, aimX)
        let diff = raw - c.ship.angle
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        const dist = Math.sqrt(aimX * aimX + aimY * aimY)
        // The target's angular half-size at the shot's distance: rotation ticks
        // are quantized at ROTATION_SPEED, so the fire window opens when a
        // settled heading can put the bullet inside it — distant pebbles
        // need the ship to CLOSE before a hit is geometrically possible.
        const window = Math.max(0.05, ndR / Math.max(dist, 40))
        aim = { diff, dist, window, closing: tThreat }
    }
    return { threat, tThreat, nd, aim }
}

// The obvious play: turn and thrust away from a rock that actually reaches
// you; else close on the nearest rock and hold the lead aim, firing when the
// firing solution is settled. The driver re-decides every tick, so a rollout
// owes only this continuation.
function greedy(c) {
    const s = scan(c)
    if (s.threat) {
        const away = Math.atan2(-wrapDelta(s.threat.x - c.ship.x, c.width), -wrapDelta(s.threat.y - c.ship.y, c.height))
        let diff = away - c.ship.angle
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        return {
            left: diff < -ROTATION_SPEED / 2,
            right: diff > ROTATION_SPEED / 2,
            thrust: s.tThreat < 25 || Math.abs(diff) < ROTATION_SPEED,
            fire: false,
        }
    }
    if (!s.aim) return { left: false, right: false, thrust: false, fire: false }
    return {
        left: s.aim.diff < -0.03,
        right: s.aim.diff > 0.03,
        thrust: true,
        fire: c.ship.cooldown <= 0 && s.aim.dist < 340 && Math.abs(s.aim.diff) <= s.aim.window,
    }
}

// Value one candidate by replaying the game's OWN physics + dice on a cloned
// world for WATCH_HORIZON ticks: dying at tick t is worth t; surviving pays
// the horizon big, plus smashed rocks and clearance. The candidate is HELD
// for HOLD ticks before greedy takes over — one rotation tick barely bends the
// future, and when every candidate ties the ship never turns: holding a turn
// long enough to matter (10 ticks ≈ 0.8 rad) is what gives the shaping term
// and the kills-in-horizon a real difference to rank. Shaping keeps the last
// rock dying: with nothing left to fear every candidate survives, and closing
// on + aligning with the lead aim keeps a gradient toward the kill until a
// rollout horizon is long enough to SEE it (then `broken` ranks alone).
const HOLD = 10

function rollout(gs, cand) {
    const c = cloneWorld(gs)
    const s0 = scan(c)
    let broken = 0
    let minGap = Infinity
    for (let t = 0; t < WATCH_HORIZON; t++) {
        const ev = tickAsteroids(c, t < HOLD ? cand : greedy(c))
        if (ev.died) return t
        broken += ev.smashed
        if (ev.wave) broken += 4 // a cleared field pays like a few more rocks
        const g = closestGap(c)
        if (g < minGap) minGap = g
    }
    let shaping = 0
    const s1 = scan(c)
    if (s1.aim && s0.nd < Infinity) {
        shaping += Math.max(-120, Math.min(120, s0.nd - s1.nd)) * 2 // px of the gap shut
        shaping += Math.abs(s1.aim.diff) <= s1.aim.window ? 150 : Math.max(0, 90 - Math.abs(s1.aim.diff) * 30)
        if (s1.aim.dist < 340 && s1.aim.closing === Infinity) shaping += 60 // a clean shot is loaded
    }
    return WATCH_HORIZON * 10000 + broken * 120 + shaping + Math.min(minGap, 150)
}

// Candidate order IS the tie-break: hold the line and shoot first, coast next,
// burn rubber, then the turns (fire before drift in each family) — the arcade
// player's instinct: kill what you're aimed at, move when it matters.
const CANDIDATES = [
    { fire: true },
    {},
    { thrust: true },
    { thrust: true, fire: true },
    { left: true, fire: true },
    { right: true, fire: true },
    { left: true, thrust: true, fire: true },
    { right: true, thrust: true, fire: true },
    { left: true },
    { right: true },
    { left: true, thrust: true },
    { right: true, thrust: true },
].map(c => ({ left: !!c.left, right: !!c.right, thrust: !!c.thrust, fire: !!c.fire }))

// Null = nothing steerable yet (game over, attract, or the dark respawn gap —
// the honest wait, matching the frogger seat's doctrine).
export function watchStep(gs) {
    if (gs.over || gs.attract) return null
    if (!shipAlive(gs)) return null
    let best = null
    let bestV = -Infinity
    // The immediate greedy play competes as candidate zero: when the horizon
    // genuinely cannot separate actions, the arcade instinct keeps the wheel.
    for (const cand of [greedy(gs), ...CANDIDATES]) {
        const v = rollout(gs, cand)
        if (v > bestV) { bestV = v; best = cand }
    }
    // #2001 part 4 — panic reserve: the arcade ace kept hyperspace for the
    // desperate moment, never as transport. A candidate that comes back DEAD
    // (value < the horizon×10000 survival floor, allowance for gap noise) has
    // been steered into its death; only when EVERY steering option is doomed
    // does the jump get considered, and it must outlive them to be taken.
    // The jump rides the run's seeded stream, so the sweep judges the exact
    // teleport the seat will make (cloneWorld carries the cooldown state).
    if (bestV < WATCH_HORIZON * 10000 - 5000 &&
        gs.tickN >= gs.hyperReadyAt && gs.tickN >= gs.hyperUntil) {
        const panic = { left: false, right: false, thrust: false, fire: false, hyper: true }
        const v = rollout(gs, panic)
        if (v > bestV) { bestV = v; best = panic }
    }
    return best || { left: false, right: false, thrust: false, fire: false }
}

// FNV-1a over everything the physics carries — the sweep's byte-equal replay
// witness and the contract state hash.
export function stateHash(gs) {
    const r4 = (n) => Math.round(n * 1e4)
    let s = `A${gs.tickN}|${gs.score}|${gs.lives}|${gs.bonusLives}|${gs.wave}|${gs.over ? 1 : 0}|${gs.respawnAt}|${gs.invulnUntil}|${gs.rngState}|`
    s += `${r4(gs.ship.x)},${r4(gs.ship.y)},${r4(gs.ship.vx)},${r4(gs.ship.vy)},${r4(gs.ship.angle)},${gs.ship.cooldown}|`
    s += gs.asteroids.map(a => `${r4(a.x)},${r4(a.y)},${r4(a.vx)},${r4(a.vy)},${a.size}`).join(';') + '|'
    s += gs.saucers.map(sv => `${r4(sv.x)},${r4(sv.y)},${sv.big ? 'B' : 's'},${sv.life},${sv.cooldown}`).join(';') + `|${gs.nextSaucerAt}|${gs.hyperReadyAt}|${gs.hyperUntil}|`
    s += gs.bullets.map(b => `${r4(b.x)},${r4(b.y)},${r4(b.life)},${b.hostile ? 'H' : ''}`).join(';') + '|'
    s += gs.particles.length
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
}
