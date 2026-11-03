// FROGGER — pure world-spawn helpers (#1473 seedpin batch 15).
// The only dice the engine rolls are here: each floating lane's dive-phase
// offset and which home hosts the fly. Both come from the injected rand
// (seedRng(seed) upstream), so a seeded world reproduces its traffic exactly —
// lane geometry, offsets and bonus house included.

export const CELL = 20
export const COLS = 13
export const W = COLS * CELL
export const DIVE_CYCLE = 4.5 * 60

export function makeLane({ dir, speed, kind, widths, gap, phase = 0, dive = false }, rand) {
    const pattern = [...widths]
    let list = []
    let cycle = 0
    let guard = 0
    while (cycle < W + 4 * CELL && guard++ < 20) {
        list = list.concat(pattern)
        cycle = list.reduce((s, w) => s + (w + gap) * CELL, 0)
    }
    const maxW = Math.max(...list)
    const items = []
    let x = phase * CELL
    for (const w of list) {
        items.push({ x, w })
        x += (w + gap) * CELL
    }
    return { dir, speed, kind, items, cycle, maxW, dive, t: Math.floor(rand() * DIVE_CYCLE) }
}
