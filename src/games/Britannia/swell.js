// BRITANNIA — coastal swell (#1135 polish): the sea is never painted flat.
// A plane of swells rides west-to-east over every ocean tile — the same wind
// the weather fronts drift on — and foam gathers along the edges where land
// holds the sea back. The foam breaks into painted speckles (the ocean-demo
// lee-face dissolve technique, shrunk to tile scale). Pure math + hashes:
// same tile + tick + seed, same crests — the sim and its hashes are untouched.

import { hash2, TILE } from './tiles.js'
import { isSea } from './britmap.js'

export const SWELL_TILE = 24   // a crest advances one tile every 24 ticks (~1.3 px/tick)
export const SWELL_PH = 0.5    // one crest per 2 tiles
export const PH_T = -SWELL_PH / SWELL_TILE // phase falls as t rises at fixed x => crests run EAST
const PH_Y = 0.31              // wavefronts tilt slightly, so crests are not screen-perfect lines

// soft crest band in [0,1] for sea tile (tx,ty) at tick t.
// The exact value at (tx, ty, t) reappears at (tx+k, ty, t+k*SWELL_TILE):
// the pattern rides east without changing shape.
export function crest(tx, ty, t) {
    const u = tx * SWELL_PH + ty * PH_Y + t * PH_T
    const f = u - Math.floor(u)
    const c = Math.cos(f * Math.PI * 2) * 0.5 + 0.5
    return Math.max(0, c - 0.55) / 0.45
}

// where within the tile the crest line lies (6..26 px): per-tile jitter keeps
// neighbouring tiles from painting their crests in lockstep.
export function crestLane(tx, ty, seed = 0) {
    return 6 + hash2(tx, ty, seed ^ 0x5e3) * 20
}

// foam strength for a sea tile: open ocean never foams; shore foam is always
// there and SWELLS (0.35..1) as each crest passes.
export function foam(tx, ty, coast, t, seed = 0) {
    if (!coast) return 0

    const j = hash2(tx, ty, seed | 1)
    return 0.35 + 0.65 * crest(tx, ty, t) * (0.55 + 0.45 * j)
}

// which tile edges have land: 'n','s','e','w' (same wrap-free sampling the
// renderer uses for its coast sparkles).
export function landSides(tx, ty, world) {
    const out = []
    if (!isSea(world.get(tx, ty - 1))) out.push('n')
    if (!isSea(world.get(tx, ty + 1))) out.push('s')
    if (!isSea(world.get(tx - 1, ty))) out.push('w')
    if (!isSea(world.get(tx + 1, ty))) out.push('e')
    return out
}

// foam speckles hugging one land edge, tile-local px. The foam line is not a
// solid stroke: it breaks into blobs of seeded size whose density tracks the
// swell strength (ocean.html #462: crest foam reads as painted blobs).
export function foamPatches(tx, ty, side, t, seed = 0, strength = 1) {
    if (strength <= 0) return []
    const s2 = side.charCodeAt(0)
    const out = []
    const n = 4 + Math.floor(hash2(tx, ty, seed ^ 0x7d) * 5)
    const swell = 0.5 + 0.5 * strength
    for (let i = 0; i < n; i++) {
        const r1 = hash2(tx * 7 + i, ty * 13 + i, seed ^ s2)
        const r2 = hash2(ty * 17 + i, tx * 3 + i, seed ^ (s2 + 0xab))
        let x, y
        if (side === 'n') { x = 2 + r1 * 28; y = r2 * 12 }
        else if (side === 's') { x = 2 + r1 * 28; y = 20 + r2 * 12 }
        else if (side === 'w') { x = r2 * 12; y = 2 + r1 * 28 }
        else { x = 20 + r2 * 12; y = 2 + r1 * 28 }
        out.push({ x, y, sz: 1.4 + r1 * 2.2 * swell, a: Math.min(1, strength * (0.45 + 0.5 * r2)) })
    }
    return out
}
