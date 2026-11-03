// sim.js — the seeded dice and arcade scoring of ASTEROIDS (#1473 batch 16).
//
// Pre-port the shape/velocity/position dice rolled off Math.random, the ship
// could not die, and there was no score at all — no terminal existed. This
// module extracts the pure half: asteroid creation on the run's mulberry32
// stream, wave spawning, and the 1979 arcade scoring table
// (large 20 / medium 50 / small 100) so pongcheck-style Node audits can replay
// a field and the score law without a browser.
//
// Fidelity note: the b15 handoff map sketched "10/50/20 per rock size" — that
// is not the arcade table. The machine paid large=20, medium=50, small=100,
// and the extra life came at 10,000 points. Fidelity beats the map (#237 law);
// the disagreement is recorded on #1473.

export const SHIP_SIZE = 20
export const BULLET_SPEED = 6
export const ROTATION_SPEED = 0.08
export const ACCELERATION = 0.1
export const FRICTION = 0.99

export const START_LIVES = 3
export const RESPAWN_DELAY = 60   // ~1 s dark before the ship returns
export const INVULN_TICKS = 120   // ~2 s blinking invulnerability (arcade grace)
export const BONUS_LIFE_EVERY = 10000

// Arcade size tiers by screen size: 40 → 20 → 10 through the split chain.
export const scoreForSize = (size) => (size >= 30 ? 20 : size >= 20 ? 50 : 100)

// One asteroid: silhouette, velocity and (when unforced) position on the stream.
export function makeAsteroid(rand, x, y, size, width, height) {
    const vertices = []
    const numVertices = 8 + Math.floor(rand() * 4)
    for (let i = 0; i < numVertices; i++) {
        const angle = (i / numVertices) * Math.PI * 2
        const r = size * (0.8 + rand() * 0.4)
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
