// BRITANNIA — the land texture. The modern tiles shade from a smooth value
// noise keyed to WORLD position, not tile-local position: neighbouring tiles
// sample the same field, so the land reads as soft, continuous terrain with
// large patches of tone — never the per-pixel salt-and-pepper static the old
// per-block hash gave (#1146), and never a repeating tile stamp, because there
// is no fixed per-tile pattern to repeat. Pure math (no canvas) so the grain
// gate in britanniacheck measures the very shades the renderer paints.
export const TILE = 32
export const SUB = 2            // 2x2 sub-blocks per tile (16px each)
export const NOISE_CELL = 96    // world px per noise cell (~3 tiles) -> soft, large patches

// per-terrain base colors: 0 sea, 1 grass, 2 marsh, 3 rock, 4 hill, 5 forest,
// 6 heath, 7 plains, 8 coast/sand — each [dark, mid, light]
export const TERR = [
    ['#123a63', '#1a4c7e', '#25639b'],
    ['#27521f', '#316527', '#3d7a31'],
    ['#3d4a24', '#4a5a2c', '#586a37'],
    ['#4c4636', '#5d5744', '#6e6752'],
    ['#54564f', '#666a61', '#787d73'],
    ['#1c3d18', '#264f20', '#316229'],
    ['#46523a', '#556247', '#647354'],
    ['#6d7a3f', '#7f8d4c', '#92a15b'],
    ['#b7a267', '#c9b57a', '#dcc98e'],
]

export const hash2 = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = t => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

// smooth value noise in [0,1] over world pixels: a coarse random grid (one
// value per NOISE_CELL x NOISE_CELL), bilinearly interpolated. Terrain-
// independent — it is one shared lighting/relief field the whole land renders
// through its own palette.
export function worldNoise(wx, wy) {
    const fx = wx / NOISE_CELL
    const fy = wy / NOISE_CELL
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const a = lerp(hash2(ix, iy, 0), hash2(ix + 1, iy, 0), smooth(fx - ix))
    const b = lerp(hash2(ix, iy + 1, 0), hash2(ix + 1, iy + 1, 0), smooth(fx - ix))
    return lerp(a, b, smooth(fy - iy))
}

// which shade a world point takes: 0 dark, 1 mid, 2 light
export function shadeAt(wx, wy) {
    const n = worldNoise(wx, wy)
    if (n > 0.62) return 2
    if (n < 0.38) return 0
    return 1
}

// the exact shades the renderer paints for the tile at world (tx,ty): the
// SUB x SUB block centers, so the grain gate measures the real output
export function blockShades(tx, ty) {
    const out = []
    const bs = TILE / SUB
    const wx0 = tx * TILE
    const wy0 = ty * TILE
    for (let by = 0; by < SUB; by++) for (let bx = 0; bx < SUB; bx++) {
        out.push(shadeAt(wx0 + (bx + 0.5) * bs, wy0 + (by + 0.5) * bs))
    }
    return out
}
