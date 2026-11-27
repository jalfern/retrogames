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

// The munch law (#3632): the swarm is never silent. Its column clacks as it
// moves, and the arcade tightens the screw as it descends — the click rises
// in pitch and shortens its interval the nearer the column's front comes to
// the zapper. All arithmetic, no dice, no wall clock: a distance in px maps
// to { freq Hz, every ticks }. 240 px is the dread horizon; past it the
// clack idles at the floor, at contact it screams at the ceiling.
export const MUNCH_MIN_EVERY = 3    // ~20 clicks/s at the muzzle
export const MUNCH_MAX_EVERY = 9    // ~6.7 clicks/s across the garden
export const MUNCH_FLOOR = 220
export const MUNCH_CEIL = 1500
export const munchCue = (distance) => {
    const t = 1 - Math.min(1, Math.max(0, distance) / 240) // 0 far → 1 contact
    return {
        freq: Math.round(MUNCH_FLOOR + t * (MUNCH_CEIL - MUNCH_FLOOR)),
        every: Math.round(MUNCH_MAX_EVERY - t * (MUNCH_MAX_EVERY - MUNCH_MIN_EVERY)),
    }
}

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

// The opening mushroom field: the port's baseline of 40, kept off the top
// band where the centipede spawns AND off the bottom strip the zapper owns —
// the arcade never plants the field in the player zone, and a walled-in
// start is no start at all.
//
// #3620: the arcade lays its garden in shapes, not confetti — the classic
// clover (a 2x2 block) and the hedge (a level run of five) anchor the wave,
// and the remainder scatters on the run's stream. Formations draw from the
// same seeded rand, so ?seed=N still replays the whole field; a shape the
// band can't seat (tiny test canvases, crowded waves) falls through to the
// scatter, which keeps the count honest at exactly 40.
const FIELD_TOTAL = 40
const CLOVERS = 3                       // 2x2 blocks — the arcade's clover
const HEDGES = 2                        // level runs — the arcade's hedge
const HEDGE_LEN = 5

export function mushroomField(rand, width, height) {
    const cols = Math.floor(width / CELL_SIZE)
    const top = Math.ceil(50 / CELL_SIZE)                    // clear the spawn band
    const bottom = Math.floor((height - 150) / CELL_SIZE)    // clear the zapper strip
    const span = Math.max(1, bottom - top)
    const field = []
    const taken = new Set()
    const seats = (cells) => cells.every(([cx, cy]) =>
        cx >= 0 && cx < cols && cy >= top && cy < bottom && !taken.has(cx + ',' + cy))
    const shape = (kind, cx, cy) => kind === 'clover'
        ? [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]]
        : Array.from({ length: HEDGE_LEN }, (_, k) => [cx + k, cy])
    for (let i = 0; i < CLOVERS + HEDGES; i++) {
        const kind = i < CLOVERS ? 'clover' : 'hedge'
        let seated = false
        for (let tries = 0; tries < 60 && !seated; tries++) {
            const cx = Math.floor(rand() * cols)
            const cy = top + Math.floor(rand() * span)
            const cells = shape(kind, cx, cy)
            if (!seats(cells)) continue
            for (const [cx2, cy2] of cells) {
                taken.add(cx2 + ',' + cy2)
                field.push({ x: cx2 * CELL_SIZE, y: cy2 * CELL_SIZE, health: 3 })
            }
            seated = true
        }
        // An unseated shape leaves its caps to the scatter below.
    }
    for (let i = field.length; i < FIELD_TOTAL; i++) {
        field.push({
            x: Math.floor(rand() * cols) * CELL_SIZE,
            y: (top + Math.floor(rand() * span)) * CELL_SIZE,
            health: 3,
        })
    }
    return field
}

// #3631 — wave speed ladder (the arcade law: each cleared wave spawns faster,
// and the rear half behind every cut escapes at a higher pace). The exact
// rates are this repo's pinned spec, not claims about the machine; the
// direction (monotone ramp, compounding split boost) is the arcade law.
// Dice-free: pure functions of wave/spd, so seeded rollouts replay whole.
export const WAVE_RAMP = 0.08
export const SPLIT_BOOST = 1.25
export const SPEED_CAP = 2
export const waveSpeed = (wave) => Math.min(1 + (wave - 1) * WAVE_RAMP, SPEED_CAP)
export const splitSpd = (spd) => Math.min((spd || 1) * SPLIT_BOOST, SPEED_CAP)
