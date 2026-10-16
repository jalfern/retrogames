// civcheck.mjs — Node harness for CIVILIZATION V Stage 1. Proves three things:
// the game boots, its core rules hold, and it can be won. No browser, no three.
// Run: npm run civcheck. Proven red-able (mutant) by hand — see README.

import { CFG, T, newGame, step, canFound, cityYield, hexDist, neighbors, stateHash, CIVS, tileAt } from '../src/games/CivilizationV/sim.js'
import { decide, plan } from '../src/games/CivilizationV/planner.js'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++ } else { fail++; console.error('  ✗ ' + name) } }
const eq = (a, b, name) => ok(a === b, `${name} (${a} !== ${b})`)

const idx = (c, r) => r * CFG.W + c
const hashMap = (gs) => { let h = 0; for (const t of gs.tiles) h = (h * 31 + t.terr * 7 + (t.river ? 3 : 0) + (t.forest ? 5 : 0)) | 0; return h >>> 0 }
const walk = (t) => t >= T.GRASS && t <= T.HILLS

// ---- 1. boot ----
console.log('1. boot')
{
    const gs = newGame(1, 0)
    eq(gs.tiles.length, CFG.W * CFG.H, 'map is W*H tiles')
    eq(gs.civs.length, 4, 'four civs')
    eq(gs.civs.filter((c) => c.player).length, 1, 'exactly one player civ')
    eq(gs.units.length, 8, 'each civ starts settler+warrior')
    eq(gs.fog.length, 4, 'fog per civ')
    eq(gs.phase, 'player', 'starts on player turn')
    ok(gs.turn === 1, 'turn begins at 1')
}

// ---- 2. determinism ----
console.log('2. determinism (same seed => same world, hash-for-hash)')
{
    const a = newGame(7, 0), b = newGame(7, 0)
    eq(hashMap(a), hashMap(b), 'terrain identical across runs')
    eq(stateHash(a), stateHash(b), 'state hash identical across runs')
    const g = newGame(1, 0), g2 = newGame(1, 0)
    let n1 = 0
    while (!g.end && n1 < 40000) { step(g, decide(g)); n1++ }
    let n2 = 0
    while (!g2.end && n2 < 40000) { step(g2, decide(g2)); n2++ }
    eq(stateHash(g), stateHash(g2), 'same-seed game replays identical (autopilot deterministic)')
    eq(g.turn, g2.turn, 'same-seed game ends same turn')
}

// ---- 3. terrain is a real continent (not all ocean, capitals on land) ----
console.log('3. terrain + capital sites')
{
    let land = 0, ocean = 0
    const gs = newGame(1, 0)
    for (const t of gs.tiles) { if (walk(t.terr)) land++; if (t.terr === T.OCEAN) ocean++ }
    ok(land > CFG.W * CFG.H * 0.25, 'continent has substantial land (>25%)')
    ok(ocean > 0, 'and ocean surrounds it')
    for (const u of gs.units) { const tl = tileAt(gs, u.c, u.r); ok(walk(tl.terr), `unit ${u.kind} c${u.civ} starts on walkable land (terr ${tl.terr})`) }
}

// ---- 4. fog of war ----
console.log('4. fog of war')
{
    const gs = newGame(1, 0)
    let unseen = 0
    for (let i = 0; i < gs.explored[0].length; i++) if (!gs.explored[0][i]) unseen++
    ok(unseen > 500, 'most of the map starts unseen')
    ok(gs.explored[0][idx(gs.units[0].c, gs.units[0].r)] === 1, 'own settler tile is explored')
    ok(gs.visible[0][idx(gs.units[0].c, gs.units[0].r)] === 2, 'own settler tile is currently visible')
    // move the warrior out and watch fog lift
    const w = gs.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    const before = gs.explored[0].reduce((a, v) => a + v, 0)
    for (let k = 0; k < 40; k++) step(gs, { select: w.id, move: [w.c + 1, w.r] })
    const after = gs.explored[0].reduce((a, v) => a + v, 0)
    ok(after > before, 'exploring increases the known map')
}

// ---- 5. one unit per tile + founding rules ----
console.log('5. one unit per tile, spacing, founding')
{
    const gs = newGame(1, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    const w = gs.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    // cannot occupy another unit's tile
    ok(!step(gs, { select: w.id, move: [s.c, s.r] }) && gs.units.some((u) => u.alive && u.c === s.c && u.r === s.r && u.id === s.id), 'two units never share a tile')
    eq(canFound(gs, 0, s.c, s.r, s), true, 'settler can found on its own fertile tile')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    ok(!!cap, 'capital founded')
    eq(cap.capital, true, 'first city is the capital')
    eq(cap.size, 1, 'city starts at size 1')
    eq(gs.tiles[idx(cap.c, cap.r)].owner, 0, 'capital claims its centre in ROME')
    ok(!gs.units.some((u) => u.alive && u.kind === 'SETTLER' && u.civ === 0), 'settler consumed by founding')
    eq(canFound(gs, 0, cap.c, cap.r), 'already a city', 'cannot re-settle a city tile')
    const near = neighbors(cap.c, cap.r)[0]
    ok(canFound(gs, 0, near[0], near[1]) !== true, 'spacing: cannot settle adjacent to a city')
}

// ---- 6. cities work a ring and grow on surplus ----
console.log('6. yields + growth')
{
    const gs = newGame(1, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    const y = cityYield(gs, cap)
    ok(y.f >= 3, `capital yields food (${y.f})`)
    ok(y.p >= 2 && y.g >= 1 && y.sci >= 1 && y.cult >= 1, 'capital yields prod/gold/sci/culture')
    // drive the sim; the capital must grow (auto-economy on end turns)
    let grew = false, n = 0
    const start = cap.size
    while (!gs.end && n < 40000) { step(gs, decide(gs)); n++; if (cap.size > start) { grew = true; break } }
    ok(grew, 'capital grows from food surplus')
}

// ---- 7. borders spread in the owner's colour ----
console.log('7. borders')
{
    const gs = newGame(1, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    step(gs, decide(gs))
    let owned = 0
    for (const t of gs.tiles) if (t.owner === 0) owned++
    ok(owned >= 1, 'rome owns tiles after founding and a turn')
}

// ---- 8. WINNABLE by the autopilot (the same brain the attract demo uses) ----
console.log('8. winnable (autopilot reaches the Stage-1 milestone)')
{
    const scenarios = [0, 1, 3]
    let won = 0
    for (const sc of scenarios) { const r = plan(sc, 13); if (r.ok && r.capitalSize >= CFG.capitalSizeToWin) won++; console.log(`  scenario ${sc}: ${r.ok ? 'WIN' : 'loss'} cap=${r.capitalSize} turn=${r.turns}`) }
    ok(won >= 2, `autopilot wins on the majority of shipped scenarios (${won}/${scenarios.length})`)
}

// ---- 9. LOSS branch is reachable (turn limit) ----
console.log('9. loss branch (turn limit)')
{
    const saved = CFG.capitalSizeToWin
    CFG.capitalSizeToWin = 99
    const r = plan(0, 1)
    eq(r.end, 'lose', 'unreachable goal => the turn-limit loss fires')
    eq(r.turns, CFG.turnLimit + 1, 'loss at turn limit + 1')
    CFG.capitalSizeToWin = saved
}

// ---- 10. slack analogue: the win survives a slightly worse capital site ----
console.log('10. slack (a worse-capital run still reaches the milestone)')
{
    // downgrade the capital site's best food neighbour, then re-run: must still win
    let survived = false
    for (const sc of [0, 1, 3]) {
        // run once to locate the capital, then re-run with one grass ring demoted
        const p = plan(sc, 13)
        if (!p.ok) continue
        const gs = newGame(13, sc)
        // find the best grass ring tile around the player capital after founding
        let built = 0
        while (!gs.cities.some((c) => c.civ === 0) && built < 40000) { step(gs, decide(gs)); built++ }
        const cap = gs.cities.find((c) => c.civ === 0)
        if (cap) { const ring = neighbors(cap.c, cap.r); for (const [nc, nr] of ring) { if (gs.tiles[idx(nc, nr)].terr === T.GRASS) { gs.tiles[idx(nc, nr)].terr = T.PLAINS; break } } }
        let n = 0
        while (!gs.end && n < 40000) { step(gs, decide(gs)); n++ }
        if (gs.end === 'win') { survived = true; break }
    }
    ok(survived, 'still winnable with one grass ring demoted to plains')
}

console.log(`\ncivcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
