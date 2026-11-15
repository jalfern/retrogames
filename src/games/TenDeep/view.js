// TEN-DEEP — what the party can SEE down the corridor. Pure, deterministic,
// no RNG, no browser: the SAME function feeds the WebGL monster billboards,
// the wireframe painter, the harness probe and tendeepcheck. One source of
// truth for "a roaming monster is visible here" keeps the drawn sprite honest
// to the logical state (AGENTS: the view must agree with the sim's own hands).
//
// The original Wizardry (Apple II, 1981) showed roaming groups in the first-
// person view — you sized the pack before you walked into it. The sim still
// keeps ambushes as hidden trigger-tiles (the solver never dodges them, so the
// proofs ride unchanged); this module only answers the presentation question:
// which ambushes are IN THE LIGHT right now — within torch range, in front of
// the facing, and not behind a wall (honest line of sight — nothing through
// stone). A mob you can see, you may now engage or back off, exactly like the
// original.

import { SIZE } from './dungeon.js'

// dir: 0=E 1=S 2=W 3=N — kept in step with sim.js HX/HY; tendeepcheck pins
// the two agree so this module can stay free of a sim dependency (no cycle).
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

// The shared WebGL dungeon renderer ships a built-in monster atlas at these
// material ids (public/demos/dungeon.core.js: 8 rat, 9 skeleton, 10 goblin).
// Each bestiary member maps onto the closest silhouette; the tint is the
// wireframe fallback's ink (and the automap stays clean — Wizardry never drew
// monsters on paper, so neither do we).
export const MOB_MAT = {
    RAT: 8, SNAKE: 10, GOBLIN: 10, SKELET: 9, WRAITH: 9, GHOUL: 10,
    TROLL: 10, MINOTAUR: 10, WYRM: 10, KING: 9,
}
export const MOB_TINT = {
    RAT: '#9a7a52', SNAKE: '#5f9a54', GOBLIN: '#6fae55', SKELET: '#e2dcc8',
    WRAITH: '#c2ccf0', GHOUL: '#a89878', TROLL: '#5a8a60', MINOTAUR: '#a3663f',
    WYRM: '#46899a', KING: '#ecd36a',
}

// How far the torch carries a monster's shape: a pack reveals itself a few
// paces out — enough to react, short of scouting the whole floor.
export const SIGHT = 6

// Honest line of sight between two cell centres: every cell strictly between
// must be open. (The endpoints — the party's own cell and the monster's — are
// not walls, so they never block.) Mirrors dungeon.core.js viewCells so the
// GL sprite and the pure check agree on what "visible" means.
function losClear (wall, x0, y0, x1, y1) {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 4))
    const tx = Math.floor(x1), ty = Math.floor(y1)
    for (let k = 1; k < steps; k++) {
        const t = k / steps
        const sx = Math.floor(x0 + (x1 - x0) * t)
        const sy = Math.floor(y0 + (y1 - y0) * t)
        if ((sx !== tx || sy !== ty) && wall(sx, sy)) return false
    }
    return true
}

// Which ambushes the party currently sees. Takes the live sim state (st.map,
// st.ambushes, st.x/y/dir) so the same call runs in the browser and in the
// Node proof against a real makeRun(). Returns {x, y, mat, tint, count, range}
// nearest-first. Sprung ambushes (removed from st.ambushes) never show.
export function sightedMobs (st) {
    const map = st && st.map
    if (!map) return []
    const fx = DX[st.dir], fy = DY[st.dir]
    const px = st.x + 0.5, py = st.y + 0.5
    const out = []
    for (const a of map.ambushes) {
        if (!st.ambushes.has(a.y * SIZE + a.x)) continue   // already sprung
        const ax = a.x + 0.5, ay = a.y + 0.5
        const dx = ax - px, dy = ay - py
        const range = Math.hypot(dx, dy)
        if (range < 0.5 || range > SIGHT) continue
        if (dx * fx + dy * fy < -0.25) continue             // behind the facing (matches the sprite cull)
        if (!losClear(map.wall, px, py, ax, ay)) continue    // honest — nothing through a wall
        const group = a.group || []
        const lead = group[0] || 'RAT'
        out.push({
            x: a.x, y: a.y,
            mat: MOB_MAT[lead] != null ? MOB_MAT[lead] : 8,
            tint: MOB_TINT[lead] || MOB_TINT.RAT,
            count: group.length || 1,
            range,
        })
    }
    out.sort((p, q) => p.range - q.range)
    return out
}

// The nearest sighted monster ON THE FORWARD AXIS (the wireframe painter can
// only show the straight-ahead column; the probe's `view` walks that same
// column). null when none is visible dead ahead.
export function forwardMonster (st) {
    const map = st && st.map
    if (!map) return null
    const fx = DX[st.dir], fy = DY[st.dir]
    let best = null
    for (const m of sightedMobs(st)) {
        const dx = m.x - st.x, dy = m.y - st.y
        // collinear with the facing axis and in front
        if (dx * fy - dy * fx !== 0) continue
        if (dx * fx + dy * fy <= 0) continue
        if (!best || m.range < best.range) best = m
    }
    return best
}
