// camera.js — the per-section camera push-in for MARBLE MADNESS (#1758 item 5).
// On the cabinet the view eased IN as the marble committed to a sky bridge and
// back OUT over an open apron — the void under a one-tile span tightened the
// frame and sold the exposure. #265 gave us a follow camera at a flat 2× zoom
// that scrolls the whole course off every edge; this law makes that zoom breathe
// per section without touching the deterministic sim in sim.js (the same painter-
// side seam the bed (#1752/#1758), dynamics (item 2) and knock wobble (item 4)
// chose). Pure over the heightmap + the marble's tile cell, so stateHash and the
// attract replay stay bit-identical and marblecheck can audit it in plain Node.
// No rng, no Date, no audio, no DOM.
//
// Narrowness is corridor WIDTH, not neighbour density: AERIAL's sky bridges are
// three tiles wide, so a 3×3 solid count reads the same as an open field. The
// tell is that a bridge is LONG along one axis and THIN across the other, while
// an apron is wide both ways — so the shorter contiguous solid run through the
// marble's cell (row vs column) is what measures the section.

export const ZOOM_BASE = 2      // the #265 follow-camera zoom on open ground
export const PUSH_GAIN = 0.45   // extra zoom on a one-tile span (base -> base*1.45)
export const ZOOM_SMOOTH = 0.12 // zoom eases toward its per-section target per tick
export const OPEN_WIDTH = 6     // corridor this wide or wider -> fully pulled back
export const TIGHT_WIDTH = 1    // a one-tile span -> fully pushed in

// contiguous solid cells through `start` along one axis of the grid, `fixed` the
// other index. Out-of-grid and void (height < 0) both break the run.
function span(heights, grid, fixed, start, alongRow) {
    const solid = (i) => {
        const r = alongRow ? fixed : i
        const c = alongRow ? i : fixed
        return r >= 0 && c >= 0 && r < grid && c < grid && heights[r][c] >= 0
    }
    if (!solid(start)) return 0
    let n = 1
    for (let i = start + 1; solid(i); i++) n++
    for (let i = start - 1; solid(i); i--) n++
    return n
}

// corridor width under cell (r,c): the shorter of its solid row-run and column-
// run. An open course tile scores wide both ways; a bridge scores thin across.
export function corridorWidth(heights, grid, r, c) {
    return Math.min(span(heights, grid, r, c, true), span(heights, grid, c, r, false))
}

// 0 over open ground, 1 on a one-tile span, linear between the thresholds.
export function narrowness(heights, grid, r, c) {
    const w = corridorWidth(heights, grid, r, c)
    if (w >= OPEN_WIDTH) return 0
    if (w <= TIGHT_WIDTH) return 1
    return (OPEN_WIDTH - w) / (OPEN_WIDTH - TIGHT_WIDTH)
}

// the zoom this frame is easing toward, given the marble's tile cell.
export function targetZoom(heights, grid, r, c) {
    return ZOOM_BASE * (1 + PUSH_GAIN * narrowness(heights, grid, r, c))
}
