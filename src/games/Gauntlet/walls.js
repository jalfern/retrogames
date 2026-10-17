// GAUNTLET walls — the pure half of the corridor look (issue #275 item 2).
// index.jsx's drawView renders exactly what this module decides, and
// gauntletcheck proves the decisions in plain Node. No canvas at import.
//
// The real cabinet corridors read as raised brick courses, and the whole
// maze is lit by the hero's torch: the stone is bright around him and falls
// away to dark toward the screen's edge. A flat, evenly-lit wall reads as a
// smudge; a lit, two-toned course reads as stone you could touch. The
// DECISIONS live here; the pixels are index.jsx's.

import { CFG } from './sim.js'

// the torch's reach in cells: full bright at the hero, dark past this.
// (the overhead view is ~16x12.5 cells, so this covers the screen and fades
// at its edges rather than the maze's far corners)
export const TORCH_REACH = CFG.torchReach

// the maze never goes fully black: the ambient the stone keeps out of reach
export const AMBIENT = 0.28

// torch brightness at a point, in [0,1]: 1 at the hero, falling to 0 at
// TORCH_REACH cells away. Monotonic in distance (never brighter the farther
// you get).
export function torch(dx, dy, reach = TORCH_REACH) {
    if (reach <= 0) return 1
    const d = Math.hypot(dx, dy)
    return Math.max(0, Math.min(1, 1 - d / reach))
}

// #rrggbb -> [r,g,b]
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// light a stone colour by the torch: full colour at light=1, the dim ambient
// at light=0. Monotonic in light — no channel ever darkens as it brightens.
export function litColor(stone, light, ambient = AMBIENT) {
    const [r, g, b] = hex(stone)
    const m = ambient + (1 - ambient) * light
    return [r, g, b].map((v) => Math.round(v * m))
}

// the two mortar tones per material: the dark recess + the light bevel that
// catches the torch. Both come from the material (so every world reads as its
// own stone), and they are never the same colour — a one-tone course is the
// flat look this pass is removing.
export function mortarTones(mat) {
    return { recess: mat.mortar, bevel: mat.lite }
}

// an rgb triple as a CSS colour
export const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`

// the sum of a colour's channels — brighter stone has a higher lum. The
// check uses it to prove the torch actually changes how a wall reads.
export const lum = (c) => c[0] + c[1] + c[2]
