// BRITANNIA ambient life — pure sim, no DOM (#1135): the land is never empty.
// Birds wheel over the moors, fish break the surface at sea. Like the weather
// (weather.js), events are decided per 8x8-tile cell from a hash of
// (cell, epoch, seed): deterministic, replayable, spread over the whole land —
// and the pattern rides the same west-to-east wind as the sky (8 tiles per 720
// ticks = one region per WX_EPOCH), so a flock is born at a cell and travels.
// Fish prefer the shallows: a sea cell touching land is far livelier than the
// open ocean, which reads (and stays) mostly empty. Gates in
// scripts/britanniacheck.mjs.

import { WX_EPOCH } from './weather.js'

export const AMB = { NONE: 0, BIRD: 1, FISH: 2 }
export const AMB_NAME = ['—', 'birds', 'fish']
export const AMB_CELL = 8
export const CELL_DRIFT = WX_EPOCH / 2

const hash3 = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const driftCells = (tick) => Math.floor(tick / CELL_DRIFT)
export const progressOf = (tick) => (tick % CELL_DRIFT) / CELL_DRIFT

// the raw roll for a cell — exposes the drift so the harness can prove the
// wildlife pattern rides the wind exactly like the weather fronts do
export const rollOf = (x, y, tick, seed = 0) =>
    hash3(Math.floor(x / AMB_CELL) - driftCells(tick), Math.floor(y / AMB_CELL), (seed * 2654435761) | 0)

// terr is the terrain byte (0 = sea); coast marks sea cells that touch land.
// Kind depends only on (drifting cell, seed) — exactly like weatherAt: a cell
// keeps its wildlife for its whole life and a new lineup rides in from the west.
export function ambientAt(x, y, terr, coast = false, tick, seed = 0) {
    const r = rollOf(x, y, tick, seed)
    if (terr === 0) return r < (coast ? 0.42 : 0.18) ? AMB.FISH : AMB.NONE
    return r < 0.45 ? AMB.BIRD : AMB.NONE
}

// flock composition per cell: how many, which way, how high — fixed for the
// cell's life (same hash inputs), so the birds are individuals, not a flicker
export function flockOf(x, y, tick, seed = 0) {
    const cx = Math.floor(x / AMB_CELL), cy = Math.floor(y / AMB_CELL)
    const d = driftCells(tick)
    const h1 = hash3(cx - d, cy, ((seed * 2654435761) ^ 0x5eed) | 0)
    const h2 = hash3(cy - d, cx, ((seed * 668265263) ^ 0xbeef) | 0)
    return { n: 3 + Math.floor(h1 * 3), dir: h2 > 0.5 ? 1 : -1, lift: h1 * 26 }
}

// where the flock is inside its life: -1 (west edge) → +1 (east edge), riding
// its own direction; the draw layer scales this to screen px
export function flightOf(x, y, tick, seed = 0) {
    return flockOf(x, y, tick, seed).dir * (progressOf(tick) * 2 - 1)
}
