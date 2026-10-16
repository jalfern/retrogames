// CIVILIZATION V — the autopilot. This same reactive brain drives the attract
// demo (live in the shell) and is the witness scripts/civcheck.mjs replays to
// prove Stage 1 is winnable and deterministic. No Math.random; every choice is
// a function of the state, so re-running from the same seed reproduces a
// hash-for-hash identical game.
//
// Stage-1 player policy: walk the settler to the richest nearby hex, found the
// capital, then press END TURN each turn and let the capital grow on food
// surplus until it reaches size 4 (the Stage-1 milestone).

import { CFG, T, canFound, cityYield, neighbors, hexDist, newGame, step, tileAt } from './sim.js'

const inMap = (c, r) => c >= 0 && r >= 0 && c < CFG.W && r < CFG.H
const idx = (c, r) => r * CFG.W + c
const SITE = (tl) => (tl.terr === T.GRASS ? 3 : tl.terr === T.PLAINS ? 2 : 0)
    + (tl.river ? 2 : 0) + (tl.forest ? 1 : 0) + (tl.terr === T.HILLS ? 1 : 0)

function bestSiteNeighbor(gs, civ, c, r) {
    let best = null, bs = -1e9
    for (const [nc, nr] of neighbors(c, r)) {
        const tl = tileAt(gs, nc, nr)
        if (!tl || tl.terr < T.GRASS || tl.terr > T.HILLS) continue
        if (gs.units.some((u) => u.alive && u.c === nc && u.r === nr)) continue
        // avoid founding too near existing cities (spacing) while scouting outward
        let s = SITE(tl)
        for (const ct of gs.cities) if (ct.alive && hexDist([ct.c, ct.r], [nc, nr]) < CFG.minCitySpacing) s -= 5
        s += neighbors(nc, nr).filter(([x, y]) => tileAt(gs, x, y)?.terr === T.GRASS).length * 1.2
        if (s > bs) { bs = s; best = [nc, nr] }
    }
    return best
}

export function decide(gs) {
    if (gs.end || gs.phase !== 'player') return {}
    if (gs.units.some((u) => u.civ === 0 && u.alive && u.path && u.path.length)) return {}
    const cap = gs.cities.find((c) => c.civ === 0 && c.alive && c.capital)
    const s = gs.units.find((u) => u.civ === 0 && u.alive && u.kind === 'SETTLER')
    if (!cap && s) {
        if (canFound(gs, 0, s.c, s.r, s) === true) return { select: s.id, found: true }
        if (s.moves > 0) { const t = bestSiteNeighbor(gs, 0, s.c, s.r); if (t) return { select: s.id, move: t } }
    }
    return { endTurn: true }
}

export function plan(scenario = 0, seed = 1) {
    const gs = newGame(seed, scenario)
    let guard = 0
    while (!gs.end && guard++ < 40000) step(gs, decide(gs))
    const cap = gs.cities[gs.capitalOf[0]]
    return {
        ok: gs.end === 'win',
        end: gs.end,
        turns: gs.turn,
        capitalSize: cap ? cap.size : 0,
        why: gs.endWhy,
        hash: (gs.turn * 2654435761 ^ gs.units.length * 40503 ^ (cap ? cap.size * 2246822519 : 0)) >>> 0,
        cities: gs.cities.filter((c) => c.alive).length,
    }
}
