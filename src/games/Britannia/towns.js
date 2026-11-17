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

// #2499 item 4: the footstep voice of built-up ground. The original changed
// the foot's tone on town stone; ours muttered grass everywhere. The open-road
// voice stays bit-identical (the #1135 foot keeps its stride); on trodden
// ground (ts > 0 — the very threshold the town toast and tint read) the step
// becomes a hard, short, higher tick. Pure: ts picks the voice, tick the tone.
export const stepVoice = (ts, tick) => ts > 0
    ? { f: 240 + (tick % 3) * 22, d: 0.025, type: 'square', g: 0.05 }
    : { f: 90 + (tick % 3) * 14, d: 0.03, type: 'triangle', g: 0.06 }
