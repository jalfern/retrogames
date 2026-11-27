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

// --- The menagerie (#3604): the garden's three wandering threats ----------
// 1981 point table, continued: spider pays proximity bands — the closer the
// kill, the braver the shot. 900/600/300 are the arcade's published values;
// the exact pixel bands are UNVERIFIED in-repo, so the distances we ship are
// the pinned spec here (never the arcade's, claimed).
export const SPIDER_POINTS = (distance) => (distance < 100 ? 900 : distance < 200 ? 600 : 300)
export const SCORPION_POINTS = 1000
export const FLEA_POINTS = 200

// Cadence lives (ticks): each menace crosses the garden on the run's stream,
// one at a time, with a gap between visits. Arcade cadence is UNVERIFIED —
// these numbers are the honest shipped spec.
export const SPIDER_EVERY = 420
export const SCORPION_EVERY = 560
export const FLEA_COOLDOWN = 240

// The scorpion poisons the mushroom it stands on — unless it is already
// chewing apart under shots. Poison survives every fate except a full
// rebuild (startRun): the garden remembers.
export const poisonMushroom = (m) => {
    if (m.poison || m.health < 3) return false
    m.poison = true
    return true
}

// The top-band fairness for the zapper's summons: a bullet that flies clear
// out of the field has crossed everything the garden can offer.
export const bulletEscapes = (y) => y < 0

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
