// BRITANNIA shrines (#1876): in the original (Ultima IV, Origin 1985) the eight
// moongates connect the eight SHRINES OF THE VIRTUES, and each shrine keeps the
// stone Avatar who attained that virtue. The gates have borne their virtue-moon
// names since #1135 — this module makes the destination itself live up to the
// name: one consecrated plot per gate, a chapel of stone the pilgrim walks
// around. Pure + deterministic: same gates + same terrain => the same eight
// plots, byte for byte, every run and every recompute (britanniacheck proves
// the parity between what Node plots and what the panel carries).

import { MAPW, isSea } from './britmap.js'
import { moonName } from './moons.js'
import { hash2 } from './tiles.js'
import { FLAT } from './towns.js'

// The sanctum sits exactly two tiles from its gate — a stone stone's throw,
// and by construction never on the gate's approach ring (|d| = 2 > the ±1
// reach of the gate's walk detection), so a chapel can never strand a pilgrim.
export const SHRINE_DIST = 2

// The eight statue-keepers of Ultima IV's virtue shrines, aligned to MOONS
// (moons.js) index for index: the menu's moon and the shrine's keeper always
// name the same virtue. Canonical pairings — Humility/Dracmato, Honesty/Ires,
// Compassion/Emoj, Valor/Dactio, Spirituality/Naergius, Justice/Agdash,
// Sacrifice/Gordam, Honor/Andros.
export const AVATARS = [
    'Dracmato', // Humility
    'Ires',     // Honesty
    'Emoj',     // Compassion
    'Dactio',   // Valor
    'Naergius', // Spirituality
    'Agdash',   // Justice
    'Gordam',   // Sacrifice
    'Andros',   // Honor
]

export const shrineTitle = (i) => `Shrine of ${moonName(i)}`

// cardinals only: the chapel stands square to its gate, so the door can face
// the gate head-on and the roof line stays honest at 32px.
export const SHRINE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]

// One plot: the seeded cardinals of a gate, tried in hash order; the first
// tile that is built-up ground (grass/heath/plains — the same FLAT law the
// town courtyards obey, so a chapel never rises on sea, cliff, hill, forest,
// marsh or another star's POI) and unclaimed by an earlier shrine wins.
// Null (no plot) is possible on a foreign map; the caller skips that chapel.
export function shrineSpot(i, gate, terrainAt, taken = []) {
    const order = SHRINE_DIRS
        .map(([dx, dy]) => ({ dx, dy, k: hash2(gate.x + dx * 131, gate.y + dy * 131, i + 3) }))
        .sort((a, b) => b.k - a.k)
    for (const { dx, dy } of order) {
        const x = ((gate.x + dx * SHRINE_DIST) % MAPW + MAPW) % MAPW
        const y = ((gate.y + dy * SHRINE_DIST) % MAPW + MAPW) % MAPW
        const v = terrainAt(x, y)
        if (isSea(v) || !FLAT.has(v)) continue
        if (taken.some((t) => t.x === x && t.y === y)) continue
        return { x, y, dx, dy }
    }
    return null
}

// All plots, in gate order (the pilgrimage order). Earlier gates claim first,
// so the sweep is deterministic without any look-ahead.
export function plotShrines(gates, terrainAt) {
    const out = [], taken = []
    for (let i = 0; i < gates.length; i++) {
        const s = shrineSpot(i, gates[i], terrainAt, taken)
        out.push(s)
        if (s) taken.push(s)
    }
    return out
}
