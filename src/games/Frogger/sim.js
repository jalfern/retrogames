// FROGGER — pure world-spawn helpers (#1473 seedpin batch 15).
// The only dice the engine rolls are here: each floating lane's dive-phase
// offset and which home hosts the fly. Both come from the injected rand
// (seedRng(seed) upstream), so a seeded world reproduces its traffic exactly —
// lane geometry, offsets and bonus house included.

export const CELL = 20
export const COLS = 13
export const W = COLS * CELL
export const DIVE_CYCLE = 4.5 * 60

// Death feedback, as pure data so froggercheck can gate it without a browser.
// The arcade distinguishes its deaths: a car crush squashes, a splash/time-out
// rings, and going OFF the board is its own mark — it must NOT reuse the water
// ripple (the whole point of #1508's "distinct off-board splat").
export function deathStyle(cause) {
    if (cause === 'car') return { kind: 'squash', color: '#5adb5a' }
    if (cause === 'time') return { kind: 'ripple', color: '#ffe14d' }
    if (cause === 'off') return { kind: 'splat', color: '#ff7a5c' }
    return { kind: 'ripple', color: 'rgba(160,210,255,0.9)' } // water / default
}

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
