// BRITANNIA village (#2494): cottages with substance. The plaza of every
// moongate town hosts seeded cottages (#1352) — until now they were ghosts the
// pilgrim walked through. This module decides which plaza tiles stand a cottage
// AND that no cottage may strand a pilgrim: the ring of walkable ground around
// every gate is guaranteed by a deterministic repair descent (drop the lowest
// seeded cottage, re-verify, repeat) — same gates + same land => the same
// village, byte for byte, in Node and in the panel (britanniacheck pins it).
//
// The law, in order:
//  * site: built-up ground within the plaza skirt — town score >= 0.5 (the
//    same decay towns.js computes), level (FLAT: grass/heath/plains), never
//    sea, never a gate tile, never a shrine sanctum (#1876 owns that stone);
//  * seed: the established hasCottage hash (#1352) — every cottage that drew
//    smoke before still stands, and the village simply reaches further out;
//  * keep: from every gate's tile, at least FOUR of its eight ring neighbours
//    must stay reachable through free town ground — cottages close a pocket
//    nowhere; the descent is deterministic (lowest seed hash first), so the
//    repaired village is a law, not a coincidence of this map.
//
// Doors stay shut: the bundle carries the original's town maps (BRITAIN.ULT,
// TRINSIC.ULT… probed 40x32 tiles), but naming their terrain IDs needs the
// AVATAR.EXE terrain table — enterable buildings are stage 2 by the README's
// own staging (#1128), and this stage makes the town READ and BLOCK as built.

import { MAPW, isSea } from './britmap.js'
import { hash2 } from './tiles.js'
import { townScore, TOWN_R, FLAT } from './towns.js'

const CHEB = (ax, ay, bx, by) => {
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by)
    return Math.max(Math.min(dx, MAPW - dx), Math.min(dy, MAPW - dy))
}
const wrap = (v) => ((v % MAPW) + MAPW) % MAPW

export const PLAZA_MIN_TS = 0.5 // the skirt a cottage may stand on
export const KEEP_RING = 4 // ring neighbours that must stay reachable per gate

// the seeded cottage law — pure, per tile, the #1352 hash kept verbatim so
// every cottage that ever drew hearth smoke still stands at the same tile.
export const cottageSeed = (tx, ty) => (((tx * 73856093) ^ (ty * 19349663)) >>> 8) % 100

// candidates for one gate's town, in a deterministic order (ring 1 then ring 2,
// y-major). A tile belongs to the FIRST gate that claims it (gates are >= 22
// apart and the skirt reaches 2, so claims never overlap).
function candidates(gi, gate, gates, terrainAt, gateTiles, sanctums) {
    const out = []
    for (const d of [1, 2]) {
        for (let dy = -d; dy <= d; dy++) {
            for (let dx = -d; dx <= d; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
                const x = wrap(gate.x + dx), y = wrap(gate.y + dy)
                if (gateTiles.has(x + ',' + y)) continue
                if (sanctums.has(x + ',' + y)) continue
                const v = terrainAt(x, y)
                if (isSea(v) || !FLAT.has(v)) continue
                if (townScore(x, y, gates, terrainAt) < PLAZA_MIN_TS) continue
                if (cottageSeed(x, y) >= 40) continue // the established <40% law
                out.push({ x, y, gi, seed: cottageSeed(x, y) })
            }
        }
    }
    return out
}

// free town ground for the reachability descent: any land the foot takes
// (walk rules: sea refuses, sanctum and cottage refuse — forest, marsh, hill
// are slow ground but ground), inside the town field. "Inside town" is the
// towns.js field (Chebyshev <= TOWN_R of a gate), NOT the score sign: the
// score decays 1->small (an edge tile reads 0.4, still town) — the descent
// must not strand a gate on tiles the game itself calls town.
const freeTown = (x, y, terrainAt, gates, blocked, sanctums) => {
    const v = terrainAt(x, y)
    if (isSea(v)) return false
    if (blocked.has(x + ',' + y) || sanctums.has(x + ',' + y)) return false
    return gates.some((g) => CHEB(x, y, g.x, g.y) <= TOWN_R)
}

export const ringTiles = (gate) => {
    const out = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        out.push([wrap(gate.x + dx), wrap(gate.y + dy)])
    }
    return out
}

// BFS from the gate tile over free town ground; returns the reachable set.
function reachable(gate, terrainAt, gates, blocked, sanctums) {
    const start = gate.x + ',' + gate.y
    const seen = new Set([start])
    const q = [[gate.x, gate.y]]
    while (q.length) {
        const [x, y] = q.shift()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = wrap(x + dx), ny = wrap(y + dy)
            const k = nx + ',' + ny
            if (seen.has(k)) continue
            if (nx === gate.x && ny === gate.y) continue
            if (!freeTown(nx, ny, terrainAt, gates, blocked, sanctums)) continue
            seen.add(k); q.push([nx, ny])
        }
    }
    return seen
}

// one gate's village, repaired: place every candidate, keep dropping the
// LOWEST-seeded cottage until KEEP_RING ring neighbours of the gate are
// reachable through free town ground. Deterministic descent -> deterministic
// village, on this map and on any foreign one.
function villageFor(gi, gate, terrainAt, gates, gateTiles, sanctums) {
    const cands = candidates(gi, gate, gates, terrainAt, gateTiles, sanctums)
    let keep = [...cands]
    for (;;) {
        const blocked = new Set(keep.map((c) => c.x + ',' + c.y))
        const reach = reachable(gate, terrainAt, gates, blocked, sanctums)
        const open = ringTiles(gate).filter(([x, y]) => reach.has(x + ',' + y)).length
        if (open >= KEEP_RING || !keep.length) return keep
        let worst = 0
        for (let i = 1; i < keep.length; i++) if (keep[i].seed < keep[worst].seed) worst = i
        keep.splice(worst, 1)
    }
}

// the whole settlement list: every gate's village, gate order, and a tile ->
// gate-index map for the walk refusal (the shrineBlock shape, #1876).
export function plotVillage(gates, terrainAt, shrines = []) {
    const gateTiles = new Set(gates.map((g) => g.x + ',' + g.y))
    const sanctums = new Set(shrines.filter(Boolean).map((s) => s.x + ',' + s.y))
    const out = []
    gates.forEach((gate, gi) => { out.push(...villageFor(gi, gate, terrainAt, gates, gateTiles, sanctums)) })
    return out
}

export const villageBlockMap = (village) => new Map(village.map((c) => [c.x + ',' + c.y, c.gi]))

// #2499 item 1: doors face the plaza. The gate side of each cottage carries
// its door glyph, so the eye reads housefronts turned toward the square and
// the timber knock lands on a cottage whose front the pilgrim can see. The
// law is pure and deterministic: same cottage + gate => same face. The
// dominant axis wins; ties (diagonal cottages) turn east/west, so the front
// faces the plaza's cross rather than hiding under the eave.
export const doorFace = (c, gate) => {
    const d = (a, b) => { let v = a - b; if (v > MAPW / 2) v -= MAPW; if (v < -MAPW / 2) v += MAPW; return v }
    const dx = d(gate.x, c.x), dy = d(gate.y, c.y)
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w'
    return dy >= 0 ? 's' : 'n'
}

// the panel's view — [x, y, gi] per cottage, the shrines-array shape so
// britanniacheck can diff node plots against the live panel.
export const villageTriples = (village) => village.map((c) => [c.x, c.y, c.gi])

// hash of the village for cross-runtime parity (the plot is pure, so this is
// cheap insurance against accidental state creeping in)
export const villageHash = (village) => village.reduce((h, c) => (hash2(h, c.x * 31 + c.y, c.gi + 1) * 1000003) >>> 10, village.length)
