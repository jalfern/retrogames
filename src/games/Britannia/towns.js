// BRITANNIA — built-up ground (#1135 town-tint). All eight virtue gates
// stand at the edge of a settlement — in the original every gate is the
// pilgrim's landfall for a town — so until the walls arrive in stage 2 the
// land around each detected gate reads inhabited: flat ground, trodden and
// trodden-flat, cottage-grey. The gates are detected from WORLD.MAP at
// runtime (#1128), so these courtyards ride the real map — nothing is
// transcribed, and the score is pure + deterministic.

export const TOWN_R = 4           // tiles from the gate that read built-up
export const FLAT = new Set([1, 6, 7])  // grass, heath, plains — level town sites

// 0 on sea, cliffs, hills, forest, marsh, sand and POI tiles — towns are
// founded on level ground, never on a peak or a star. Otherwise the score
// decays 1 -> small from the gate outward, the plaza being strongest.
export function townScore(tx, ty, gates, terrainAt) {
    const v = terrainAt(tx, ty)
    if (v === 0 || !FLAT.has(v)) return 0
    let best = 0
    for (const g of gates) {
        const d = Math.max(Math.abs(tx - g.x), Math.abs(ty - g.y))
        if (d > TOWN_R) continue
        const s = 1 - d / (TOWN_R + 1)
        if (s > best) best = s
    }
    return best
}

// #1352: the town toast promises "cottages and smoke" — a seeded slice of the
// strongest built-up tiles hosts a cottage so the promise is kept on screen.
// Pure and deterministic: same tile, same verdict, every frame and every run.
export const hasCottage = (tx, ty) => (((tx * 73856093) ^ (ty * 19349663)) >>> 8) % 100 < 40
