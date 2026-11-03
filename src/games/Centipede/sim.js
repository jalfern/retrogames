// sim.js — the seeded field and arcade scoring of CENTIPEDE (#1473 batch 16).
//
// Pre-port the mushroom field scattered off Math.random, `state.score` was
// dead (never incremented), one touch of the centipede hard-reset the whole
// game, and a cut body never grew a new head. This module holds the pure half
// so centipedechek can replay a field from a seed and pin the arcade point
// table in plain Node: body 10, head 100, mushroom 1 (atari 1981).

export const CELL_SIZE = 16
export const START_LIVES = 3
export const INVULN_TICKS = 90   // ~1.5 s blinking grace after a respawn

// Arcade point table: head shot 100, body 10, destroyed mushroom 1.
export const scoreForSegment = (isHead) => (isHead ? 100 : 10)
export const MUSHROOM_POINTS = 1

// The opening mushroom field: the port's baseline of 40, scattered on the
// run's stream, kept off the top band where the centipede spawns AND off the
// bottom strip the zapper owns — the arcade never plants the field in the
// player zone, and a walled-in start is no start at all.
export function mushroomField(rand, width, height) {
    const cols = Math.floor(width / CELL_SIZE)
    const top = Math.ceil(50 / CELL_SIZE)                    // clear the spawn band
    const bottom = Math.floor((height - 150) / CELL_SIZE)    // clear the zapper strip
    const span = Math.max(1, bottom - top)
    const field = []
    for (let i = 0; i < 40; i++) {
        field.push({
            x: Math.floor(rand() * cols) * CELL_SIZE,
            y: (top + Math.floor(rand() * span)) * CELL_SIZE,
            health: 3,
        })
    }
    return field
}
