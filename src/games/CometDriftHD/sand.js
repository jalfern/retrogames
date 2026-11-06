// SAND — the desert remembers the pack (#995).
//
// The HD sand was porcelain: karts drove off the asphalt and left nothing
// behind. This is a coarse wear field in track-space (px, not vertices — the
// ribbons hold thousands of verts and the field holds a few thousand cells):
// every kart whose surface is sand stamps a soft rut, the field fades over
// ~35 s of race clock, and `deformGeo` pushes the gutter ribbon DOWN and
// DARK where the field is scarred and raises a sand LIP (displaced stratum)
// at the rut edge — real geometry, vertex-coloured, riding the #530 easing
// so banking and elevation stay intact. `plumePuffs` sizes the dust a fresh
// stamp kicks, and the field carries across re-races (the desert remembers
// the session), resetting only on a course swap.
//
// Pure module: no DOM, no renderer, imports only the sim's own surface law
// and mark constants, so `cometdrifthdsandcheck` runs whole headless races
// through it.

import { surfaceAt, TEX, TEX_S } from '../CometDrift/track.js'
import { SAND } from '../CometDrift/sim.js'

export const SAND_WEAR = {
    cell: 14,
    radius: 34,
    add: 0.5,
    max: 1,
    decay: 1 / 2100,
    sink: 0.11,
    dark: 0.42,
    minV: 1.5,
    lip: 0.09,
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
// Returns `{stamped, karts}`: the total cells deepened, and the karts that
// actually carved this tick (their stamp points — where a fresh rut kicks dust).
export function stampKarts(w, karts, hints = {}) {
    let stamped = 0
    const plowers = []
    for (const k of karts) {
        if (k.finished || k.v < SAND_WEAR.minV) continue
        const s = surfaceAt(k.x, k.y, hints[k.name])
        hints[k.name] = s.i
        if (s.surf === 'sand') {
            const h = stampWear(w, k.x, k.y)
            stamped += h
            if (h > 0) plowers.push(k)
        }
    }
    return { stamped, karts: plowers }
}

// The plume a fresh stamp kicks off the sand: puffs per plowing kart. Pure so
// the Node check pins the law; index.jsx maps the count onto the wheel dust
// pool. The player plows full, rivals on alternate ticks (half rate).
export const STAMP_PLUME = { perKart: 4, ttl: 20, col: 0xb08058 }

export function plumePuffs(rep, player, tick) {
    if (!STAMP_PLUME.perKart || !rep.karts.length) return 0
    let n = 0
    for (const k of rep.karts) {
        if (k !== player && (tick & 1) !== 0) continue
        n += STAMP_PLUME.perKart
    }
    return n
}

// The rut's vertical profile, in world units: sunk by `sink` at a full-depth
// centre, a raised stratum (the `lip` berm) where the wear gradient peaks at
// the worn edge, and 0 on untouched sand. gpc is the wear gained per cell
// (0..~0.85) — the displaced sand that a rut pushes up to its rim.
export function rutOffset(v, gpc) {
    return -v * SAND_WEAR.sink + gpc * SAND_WEAR.lip
}

// Push the ribbon down-and-dark where the field is scarred, and raise the worn
// edge into a berm. Base arrays are captured once per geometry (course rebuilds
// call `clearGeoBase`), so every update recomputes from scratch — wear is an
// offset, never an accumulation. The rim height follows the central-difference
// wear gradient, which peaks at the patch edge and is zero at the centre.
export function deformGeo(geo, w) {
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    let base = geo.userData.sandBase
    if (!base) {
        if (!w || (scarStats(w).cells === 0 && !(w.sim && w.sim.some((x) => x > 0)))) return 0
        base = geo.userData.sandBase = {
            pos: Float32Array.from(pos.array),
            col: col ? Float32Array.from(col.array) : null,
        }
    }
    let touched = 0
    const c = w.cell
    for (let i = 0; i < pos.count; i++) {
        const bx = base.pos[i * 3], by = base.pos[i * 3 + 1], bz = base.pos[i * 3 + 2]
        const v0 = wearAt(w, bx, bz)
        // #1718 item 5: merge the sim's authoritative scar on top of the
        // kart-stamp approximation — crater cores sink full, self-heal lowers
        // it again when syncMarks rebuilds the grid next tick.
        const v = Math.min(SAND_WEAR.max, v0 + simAt(w, bx, bz))
        const gx = (wearAt(w, bx + c, bz) - wearAt(w, bx - c, bz)) / (2 * c)
        const gz = (wearAt(w, bx, bz + c) - wearAt(w, bx, bz - c)) / (2 * c)
        const gpc = Math.hypot(gx, gz) * c
        pos.setY(i, by + rutOffset(v, gpc))
        if (col && base.col) {
            let d = 1 - v * SAND_WEAR.dark
            let r = base.col[i * 3] * d; let gg = base.col[i * 3 + 1] * d; let b = base.col[i * 3 + 2] * d
            const mix = coalAt(w, bx, bz)
            if (mix > 0) {
                r += (SIM_SCAR.coal[0] - r) * mix; gg += (SIM_SCAR.coal[1] - gg) * mix; b += (SIM_SCAR.coal[2] - b) * mix
            }
            col.setXYZ(i, r, gg, b)
        }
        if (v > 0) touched++
    }
    pos.needsUpdate = true
    if (col) col.needsUpdate = true
    return touched
}

export function clearGeoBase(geo) { delete geo.userData.sandBase }

// ---- #1718 item 5: the sim's marks ARE the desert -------------------------
// The HD twin approximated ruts from kart centres; the sim had always carried
// the authoritative field (`gs.marks`: roll 1 / hot 2 / crater 3, lip −1, the
// #1702 self-heal and re-arm law, and the #1718 coal chips) — and HD read none
// of it, so spins left no craters, bumps left no chips, and the ruts healed on
// a different clock than the GP twin's. `syncMarks` rebuilds two side grids
// from the live Map every deform tick — `sim` (carve depth normalised to
// 0..1, crater = full) and `coal` (chip/crack decal mix toward coal, mirroring
// the 2D twin's 0.62/0.42 blend) — and deformGeo merges them into the same
// sink-and-dark push the kart stamp already drives. Rebuilding from the Map (vs
// draining deltas) makes self-heal AND deletion land for free: a cell gone
// from gs.marks is gone from the mesh at the next rebuild. The sim is read
// only — nothing here feeds back into physics, and the drain of `markDelta`
// (the 2D bake renderer's queue, which HD never consumed) keeps the array
// bounded in HD sessions too.
export const SIM_SCAR = { div: 3, chipMix: 0.62, crackMix: 0.42, coal: [26, 20, 16] }

export function ensureSimGrids(w) {
    if (!w.sim) w.sim = new Float32Array(w.grid.length)
    if (!w.coal) w.coal = new Float32Array(w.grid.length)
}

// depth law: integer carves are depth/3 of a full sink; the fractional decal
// range (crack/chip, >= SAND.crack) reads as full-dark with a coal blend;
// lips (d < 0) are deliberately skipped — the berm already crowns every scar
// via the wear gradient in deformGeo.
export function markScar(d) {
    if (d >= SAND.crack) return { v: 1, mix: d >= SAND.chip ? SIM_SCAR.chipMix : SIM_SCAR.crackMix }
    if (d > 0) return { v: Math.min(SAND_WEAR.max, d / SIM_SCAR.div), mix: 0 }
    return { v: 0, mix: 0 }
}

export function syncMarks(w, g) {
    ensureSimGrids(w)
    w.sim.fill(0); w.coal.fill(0)
    let cells = 0; let coals = 0; let depth = 0
    if (g.marks instanceof Map) {
        for (const [key, d] of g.marks) {
            const tx = key % TEX; const ty = (key - tx) / TEX
            const x = (tx + 0.5) / TEX_S; const z = (ty + 0.5) / TEX_S
            const ix = Math.floor((x - w.minx) / w.cell); const iz = Math.floor((z - w.minz) / w.cell)
            if (ix < 0 || iz < 0 || ix >= w.nx || iz >= w.nz) continue
            const idx = iz * w.nx + ix
            const s = markScar(d)
            if (s.v > 0) { if (s.v > w.sim[idx]) w.sim[idx] = s.v; cells++; if (s.v > depth) depth = s.v }
            if (s.mix > 0) { w.coal[idx] = Math.max(w.coal[idx], s.mix); coals++ }
        }
    }
    if (Array.isArray(g.markDelta)) g.markDelta.length = 0
    return { cells, coals, depth }
}

export function simAt(w, x, z) {
    if (!w.sim) return 0
    const ix = Math.floor((x - w.minx) / w.cell)
    const iz = Math.floor((z - w.minz) / w.cell)
    if (ix < 0 || iz < 0 || ix >= w.nx || iz >= w.nz) return 0
    return w.sim[iz * w.nx + ix]
}

export function coalAt(w, x, z) {
    if (!w.coal) return 0
    const ix = Math.floor((x - w.minx) / w.cell)
    const iz = Math.floor((z - w.minz) / w.cell)
    if (ix < 0 || iz < 0 || ix >= w.nx || iz >= w.nz) return 0
    return w.coal[iz * w.nx + ix]
}

export function simStats(w) {
    if (!w.sim) return { cells: 0, coals: 0, depth: 0 }
    let cells = 0; let coals = 0; let depth = 0
    for (let i = 0; i < w.sim.length; i++) {
        const v = w.sim[i]
        if (v > 0) { cells++; if (v > depth) depth = v }
        if (w.coal[i] > 0) coals++
    }
    return { cells, coals, depth: +depth.toFixed(3) }
}
