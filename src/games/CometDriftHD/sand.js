// SAND — the desert remembers the pack (#995).
//
// The HD sand was porcelain: karts drove off the asphalt and left nothing
// behind. This is a coarse wear field in track-space (px, not vertices — the
// ribbons hold thousands of verts and the field holds a few thousand cells):
// every kart whose surface is sand stamps a soft rut, the field fades over
// ~35 s of race clock, and `deformGeo` pushes the gutter ribbon DOWN and
// DARK where the field is scarred — real geometry, vertex-coloured, riding
// the #530 easing so banking and elevation stay intact.
//
// Pure module: no DOM, no renderer, one import of the sim's own surface law,
// so `cometdrifthdsandcheck` runs whole headless races through it.

import { surfaceAt } from '../CometDrift/track.js'

export const SAND_WEAR = {
    cell: 14,
    radius: 34,
    add: 0.5,
    max: 1,
    decay: 1 / 2100,
    sink: 0.11,
    dark: 0.42,
    minV: 1.5,
}

export function makeWear(minx, minz, maxx, maxz) {
    const cell = SAND_WEAR.cell
    const nx = Math.max(1, Math.ceil((maxx - minx) / cell))
    const nz = Math.max(1, Math.ceil((maxz - minz) / cell))
    return { minx, minz, nx, nz, cell, grid: new Float32Array(nx * nz) }
}

export function resetWear(w) { w.grid.fill(0) }

export function wearAt(w, x, z) {
    const ix = Math.floor((x - w.minx) / w.cell)
    const iz = Math.floor((z - w.minz) / w.cell)
    if (ix < 0 || iz < 0 || ix >= w.nx || iz >= w.nz) return 0
    return w.grid[iz * w.nx + ix]
}

// Soft round stamp: falloff (1 - d²/r²), additive, clamped at max. Returns
// the number of cells that actually deepened this stamp.
export function stampWear(w, x, z, a = SAND_WEAR.add) {
    const r = SAND_WEAR.radius
    const ci = (x - w.minx) / w.cell
    const cj = (z - w.minz) / w.cell
    const rad = r / w.cell
    const i0 = Math.max(0, Math.floor(ci - rad)); const i1 = Math.min(w.nx - 1, Math.ceil(ci + rad))
    const j0 = Math.max(0, Math.floor(cj - rad)); const j1 = Math.min(w.nz - 1, Math.ceil(cj + rad))
    let hits = 0
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const dx = (i + 0.5 - ci) * w.cell
            const dy = (j + 0.5 - cj) * w.cell
            const d2 = dx * dx + dy * dy
            if (d2 > r * r) continue
            const old = w.grid[j * w.nx + i]
            const nv = Math.min(SAND_WEAR.max, old + a * (1 - d2 / (r * r)))
            if (nv > old) hits++
            w.grid[j * w.nx + i] = nv
        }
    }
    return hits
}

export function decayWear(w, k = SAND_WEAR.decay) {
    const g = w.grid
    for (let i = 0; i < g.length; i++) g[i] = g[i] > 0 ? Math.max(0, g[i] - k) : 0
}

export function scarStats(w) {
    let cells = 0; let depth = 0; let sum = 0
    for (let i = 0; i < w.grid.length; i++) {
        const v = w.grid[i]
        if (v > 0) { cells++; sum += v; if (v > depth) depth = v }
    }
    return { cells, depth: +depth.toFixed(3), sum: +sum.toFixed(1), size: w.grid.length }
}

// The pack's law: any kart, any lap, any surface==sand deepens the rut.
// Hints ride a side table so the sim's own search cache stays untouched.
export function stampKarts(w, karts, hints = {}) {
    let stamped = 0
    for (const k of karts) {
        if (k.finished || k.v < SAND_WEAR.minV) continue
        const s = surfaceAt(k.x, k.y, hints[k.name])
        hints[k.name] = s.i
        if (s.surf === 'sand') stamped += stampWear(w, k.x, k.y)
    }
    return stamped
}

// Push the ribbon down and dark where the field is scarred. Base arrays are
// captured once per geometry (course rebuilds call `clearGeoBase`), so every
// update recomputes from scratch — wear is an offset, never an accumulation.
export function deformGeo(geo, w) {
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    let base = geo.userData.sandBase
    if (!base) {
        if (!w || scarStats(w).cells === 0) return 0
        base = geo.userData.sandBase = {
            pos: Float32Array.from(pos.array),
            col: col ? Float32Array.from(col.array) : null,
        }
    }
    let touched = 0
    for (let i = 0; i < pos.count; i++) {
        const v = wearAt(w, base.pos[i * 3], base.pos[i * 3 + 2])
        pos.setY(i, base.pos[i * 3 + 1] - v * SAND_WEAR.sink)
        if (col && base.col) {
            const d = 1 - v * SAND_WEAR.dark
            col.setXYZ(i, base.col[i * 3] * d, base.col[i * 3 + 1] * d, base.col[i * 3 + 2] * d)
        }
        if (v > 0) touched++
    }
    pos.needsUpdate = true
    if (col) col.needsUpdate = true
    return touched
}

export function clearGeoBase(geo) { delete geo.userData.sandBase }
