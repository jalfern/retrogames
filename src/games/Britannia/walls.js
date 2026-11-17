// BRITANNIA town walls (#2516-ladder POLISH stage): the towns become PLACES.
// Gap closed (half of the README's stage-2 line "Town walls/buildings are
// still tile terrain"): every moongate town now stands behind a stone wall
// with ONE gate you walk through. The enterable half stays stage 2 — verified
// 2026-11-17: every *.ULT region file in the bundle is 1280 B, terrain-only,
// and no INSIDE.DAT ships, so the original's building/interior objects are
// not in the repo (don't-guess law). What IS law-honest here: Ultima IV
// (Origin 1985) walls its towns with a gate, and the bundle carries Origin's
// own BRICK.CON ("reserved for the stage-2 cities" — ega.js) for classic mode.
//
// The law, pure + deterministic (same gates + land => same walls, Node == panel):
//  * ring: WALL_R tiles from the gate, Chebyshev — the built-up skirt's own
//    geometry (TOWN_R = 4, so the wall stands at score 0.4 ground);
//  * siting: only on level town ground (FLAT: grass/heath/plains) — sea,
//    cliff, hill, forest, marsh and sand already refuse the foot their own
//    way and boarding law must not move; never on the shrine sanctum (the
//    chapel owns its stone, #1876 — it stands OUTSIDE the wall at distance 2);
//  * gate: exactly one opening per walled town, its side seeded from the
//    gate's coordinates (learnable, stable — the per-town gate table is not in
//    the bundle, so we honour the RULE without faking Origin's rows);
//  * never strands: the plaza must reach the wider land THROUGH the gate;
//  * never costs a road: two outer land tiles connected before the walls
//    stand connected after — an isthmus never dies by masonry. If every side
//    fails, the town honestly goes unwalled rather than break the land.

import { MAPW, isSea } from './britmap.js'
import { FLAT } from './towns.js'
import { hash2 } from './tiles.js'

export const WALL_R = 3

const wrap = (v) => ((v % MAPW) + MAPW) % MAPW

// ring tiles at Chebyshev distance WALL_R from (cx, cy), deterministic order
export const ringTiles = (cx, cy, r = WALL_R) => {
    const out = []
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        out.push([wrap(cx + dx), wrap(cy + dy)])
    }
    return out
}

// deterministic cardinal order per gate: hash rotates the four sides, so the
// eight gate-towns do not all face the same way and each gate's gate is a
// stable property of the world, not of the frame.
const SIDES = [[0, 1], [1, 0], [0, -1], [-1, 0]] // S E N W
export const sideOrder = (gx, gy) => {
    const start = Math.floor(hash2(gx, gy, 11) * 4) % 4
    return SIDES.map((_, i) => SIDES[(start + i) % 4])
}

// BFS over walkable land (all terrain except sea) optionally minus blocked
// tiles, inside Chebyshev window R around (cx, cy). Returns the seen Set.
function landReach(cx, cy, R, terrainAt, blocked) {
    const seen = new Set()
    const q = [[cx, cy]]
    seen.add(cx + ',' + cy)
    while (q.length) {
        const [x, y] = q.shift()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = wrap(x + dx), ny = wrap(y + dy)
            const k = nx + ',' + ny
            if (seen.has(k)) continue
            if (Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) > R) continue
            if (isSea(terrainAt(nx, ny))) continue
            if (blocked && blocked.has(k)) continue
            seen.add(k); q.push([nx, ny])
        }
    }
    return seen
}

// probe tiles: land on the window rim (outside the wall and its town field).
// The road law compares connectivity among these with and without walls.
const rimProbes = (cx, cy, R, terrainAt) =>
    ringTiles(cx, cy, R).filter(([x, y]) => !isSea(terrainAt(x, y)))

function components(probes, cx, cy, R, terrainAt, blocked) {
    const comp = new Map()
    for (const [x, y] of probes) {
        const k = x + ',' + y
        if (comp.has(k)) continue
        const reach = landReach(x, y, R, terrainAt, blocked)
        for (const rk of reach) if (!comp.has(rk)) comp.set(rk, k)
    }
    return comp
}

// try one side as the gate opening. Returns { open, walls } or null when the
// side strands the pilgrim or costs a road.
function trySide(gate, side, wallable, terrainAt) {
    const openX = wrap(gate.x + side[0] * WALL_R), openY = wrap(gate.y + side[1] * WALL_R)
    const openK = openX + ',' + openY
    const open = wallable.find(([x, y]) => x + ',' + y === openK)
    if (!open) return null // that cardinal is not level town ground here
    const walls = new Set(wallable.filter(([x, y]) => x + ',' + y !== openK).map(([x, y]) => x + ',' + y))

    // never strands: from the gate tile, free ground must reach beyond the wall
    const R = WALL_R + 4
    const reach = landReach(gate.x, gate.y, R, terrainAt, walls)
    const outside = [...reach].some((k) => {
        const [x, y] = k.split(',').map(Number)
        return Math.max(Math.abs(x - gate.x), Math.abs(y - gate.y)) > WALL_R
    })
    if (!outside) return null

    // never costs a road: rim connectivity with walls must equal connectivity
    // without them (the walls may close a courtyard, never a country road).
    const probes = rimProbes(gate.x, gate.y, WALL_R + 3, terrainAt)
    const withWalls = components(probes, gate.x, gate.y, WALL_R + 3, terrainAt, walls)
    const before = components(probes, gate.x, gate.y, WALL_R + 3, terrainAt, null)
    for (const a of probes) for (const b of probes) {
        const ka = a + '', kb = b + ''
        if (before.get(ka) === before.get(kb) && withWalls.get(ka) !== withWalls.get(kb)) return null
    }
    return { open, walls }
}

// all towns: gates in order; a town with no survivable side stays unwalled.
export function plotWalls(gates, terrainAt) {
    const walls = []
    const opens = [] // { x, y, gi, dir } per walled town
    gates.forEach((gate, gi) => {
        const wallable = ringTiles(gate.x, gate.y).filter(([x, y]) => FLAT.has(terrainAt(x, y)))
        if (wallable.length < 6) return // too little level ground to wall honestly
        for (const side of sideOrder(gate.x, gate.y)) {
            const hit = trySide(gate, side, wallable, terrainAt)
            if (hit) {
                for (const k of hit.walls) {
                    const [x, y] = k.split(',').map(Number)
                    walls.push({ x, y, gi })
                }
                opens.push({ x: hit.open[0], y: hit.open[1], gi, dir: side[1] > 0 ? 's' : side[1] < 0 ? 'n' : side[0] > 0 ? 'e' : 'w' })
                break
            }
        }
    })
    return { walls, opens }
}

export const wallBlockMap = (walls) => new Map(walls.map((w) => [w.x + ',' + w.y, w.gi]))

// panel shapes for britanniacheck parity (the villageTriples pattern)
export const wallTriples = (walls) => walls.map((w) => [w.x, w.y, w.gi])
export const openTriples = (opens) => opens.map((o) => [o.x, o.y, o.gi])
export const wallHash = (walls) => walls.reduce((h, w) => (hash2(h * 31 + w.x, w.y, w.gi + 1) * 1000003) >>> 10, walls.length)
