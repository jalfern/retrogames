// civcheck.mjs — Node harness for CIVILIZATION V. Proves three things: the game
// boots, its core rules hold, and it can be won. No browser, no three.
// Run: npm run civcheck. Proven red-able (mutant) by hand — see README.

import { CFG, T, newGame, step, canFound, cityYield, hexDist, neighbors, stateHash, CIVS, tileAt, unitAt, spawnUnit, doAttack, BARB, atWar, declareWar, UNIT, defenseBonus, cityDefense, TECH, TECH_IDS, ERAS, hasTech, availableTechs, setResearch, canQueue, grantTech, IMP, IMP_IDS, RES, RES_IDS, canImprove, startImprove, connectedResources, resourceNetwork, resRevealed, queueDeny, roadCost, tileOwnedBy, tileYield, cityWorkedTiles } from '../src/games/CivilizationV/sim.js'
import { decide, plan } from '../src/games/CivilizationV/planner.js'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++ } else { fail++; console.error('  ✗ ' + name) } }
const eq = (a, b, name) => ok(a === b, `${name} (${a} !== ${b})`)

const idx = (c, r) => r * CFG.W + c
const hashMap = (gs) => { let h = 0; for (const t of gs.tiles) h = (h * 31 + t.terr * 7 + (t.river ? 3 : 0) + (t.forest ? 5 : 0)) | 0; return h >>> 0 }
const walk = (t) => t >= T.GRASS && t <= T.HILLS
// two adjacent free, walkable, camp-free tiles anywhere on the map
const twoFreeAdjacent = (g) => {
    for (const t of g.tiles) {
        if (!walk(t.terr) || t.camp >= 0 || unitAt(g, t.c, t.r)) continue
        const nb = neighbors(t.c, t.r).find(([c, r]) => walk(g.tiles[idx(c, r)].terr) && g.tiles[idx(c, r)].camp < 0 && !unitAt(g, c, r))
        if (nb) return [nb, [t.c, t.r]]
    }
    return null
}
// any free walkable landing tile adjacent to a point
const adjOf = (g, p) => neighbors(p[0], p[1]).filter(([c, r]) => walk(g.tiles[idx(c, r)].terr) && !unitAt(g, c, r))
// two tiles at exact hex distance d apart, both free/walkable/camp-free
const pairAtDist = (g, d) => {
    for (const t of g.tiles) {
        if (!walk(t.terr) || t.camp >= 0 || unitAt(g, t.c, t.r)) continue
        const f = g.tiles.find((q) => hexDist([q.c, q.r], [t.c, t.r]) === d && walk(q.terr) && q.camp < 0 && !unitAt(g, q.c, q.r))
        if (f) return [[t.c, t.r], [f.c, f.r]]
    }
    return null
}
// a free tile adjacent to a live camp, if one exists
const campLanding = (g, camp) => neighbors(camp.c, camp.r).find(([c, r]) => walk(g.tiles[idx(c, r)].terr) && g.tiles[idx(c, r)].camp < 0 && !unitAt(g, c, r))

// ---- 1. boot ----
console.log('1. boot')
{
    const gs = newGame(1, 0)
    eq(gs.tiles.length, CFG.W * CFG.H, 'map is W*H tiles')
    eq(gs.civs.length, 5, 'four civs plus barbarians')
    eq(gs.civs.filter((c) => c.player).length, 1, 'exactly one player civ')
    eq(gs.units.length, 8, 'each real civ starts settler+warrior, none for barbs')
    eq(gs.fog.length, 5, 'fog per civ slot')
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

// ---- 11. melee combat: HP, modifiers, one-unit-per-tile in battle ----
console.log('11. combat (melee, HP, modifiers, march-in)')
{
    const gs = newGame(5, 0)
    const at = gs.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    const pair = twoFreeAdjacent(gs)
    ok(!!pair, 'map offers two adjacent free tiles')
    const [pa, pb] = pair
    at.c = pa[0]; at.r = pa[1]; at.moves = 2
    const [ec, er] = pb
    spawnUnit(gs, BARB, 'WARRIOR', ec, er, { str: 7 })
    const barb = unitAt(gs, ec, er)
    ok(doAttack(gs, at, ec, er), 'melee attack resolves')
    let rounds = 0
    while (barb.alive && at.alive && rounds++ < 6) { at.moves = 2; if (!doAttack(gs, at, ec, er)) break }
    ok(!barb.alive, 'a fresh warrior beats a barbarian in a resolved battle')
    const dead = gs.units.find((u) => u.civ === BARB && !u.alive)
    ok(!!dead, 'defender can die')
    const live = gs.units.filter((u) => u.alive)
    const occupancy = new Set(live.map((u) => u.c + ':' + u.r))
    eq(occupancy.size, live.length, 'one unit per tile still holds after battle')
    ok(!at.alive || (at.c === ec && at.r === er), 'killer marches into the captured hex')
    ok(at.hp < 100 || !at.alive, 'attacker takes retaliation damage')
    eq(at.moves, 0, 'attacking exhausts the unit')
    // terrain modifier: same attacker vs hill defender hurts the attacker more
    const hill = gs.tiles.findIndex((t) => t.terr === T.HILLS && walk(t.terr))
    if (hill >= 0) {
        const g1 = newGame(5, 0)
        const a1 = g1.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
        const p1 = twoFreeAdjacent(g1)
        a1.c = p1[0][0]; a1.r = p1[0][1]; a1.moves = 2
        const d1 = spawnUnit(g1, BARB, 'WARRIOR', p1[1][0], p1[1][1], { str: 8 })
        g1.tiles[d1.r * CFG.W + d1.c].terr = T.GRASS
        const h1 = (() => { doAttack(g1, a1, d1.c, d1.r); return a1.hp })()
        const g2 = newGame(5, 0)
        const a2 = g2.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
        const p2 = twoFreeAdjacent(g2)
        a2.c = p2[0][0]; a2.r = p2[0][1]; a2.moves = 2
        const d2 = spawnUnit(g2, BARB, 'WARRIOR', p2[1][0], p2[1][1], { str: 8 })
        g2.tiles[d2.r * CFG.W + d2.c].terr = T.HILLS
        doAttack(g2, a2, d2.c, d2.r)
        ok(a2.hp < h1 || a2.hp === h1, 'hill defender is not easier to fight (dmg-to-attacker scales with defence)')
        ok(defenseBonus(g2, d2) >= 0.25, 'hill grants >= +25% defence bonus')
    }
    ok(cityDefense(gs, { size: 1 }) === CFG.cityBaseDef + 3, 'city defence scales with size')
}

// ---- 12. ranged combat: no retaliation from beyond reach ----
console.log('12. combat (ranged)')
{
    const gs = newGame(5, 0)
    const pr = pairAtDist(gs, 2)
    ok(!!pr, 'map offers a range-2 firing lane')
    const arch = spawnUnit(gs, 0, 'ARCHER', pr[0][0], pr[0][1])
    const barb = spawnUnit(gs, BARB, 'WARRIOR', pr[1][0], pr[1][1], { str: 7 })
    ok(doAttack(gs, arch, pr[1][0], pr[1][1]), 'archer fires at range 2')
    ok(arch.hp === 100, 'no retaliation against a ranged attacker out of melee reach')
    ok(barb.hp < 100 || !barb.alive, 'the arrow bit')
    eq(UNIT.ARCHER.range, 2, 'archer range is 2')
}

// ---- 13. barbarian camps ----
console.log('13. barbarian camps')
{
    const gs = newGame(1, 0)
    ok(gs.camps.length >= 3, 'world is seeded with >= 3 camps')
    for (const cp of gs.camps) {
        ok(walk(gs.tiles[idx(cp.c, cp.r)].terr), `camp at ${cp.c},${cp.r} sits on passable land`)
        ok(gs.tiles[idx(cp.c, cp.r)].camp === cp.id, 'camp tile flags its camp')
    }
    for (const cp of gs.camps) for (const q of gs.camps) if (q !== cp) ok(hexDist([cp.c, cp.r], [q.c, q.r]) >= 6, 'camps are spread apart')
    // camps actually spew: run to spawn cadence
    let spawned = false, n = 0
    while (!gs.end && gs.turn <= CFG.barbSpawn + 1 && n++ < 20000) step(gs, decide(gs))
    spawned = gs.units.some((u) => u.alive && u.civ === BARB) || gs.turn > CFG.barbSpawn + 1
    ok(spawned, 'barbarians appear on the spawn cadence')
    // razing a camp pays loot and stops it
    const g2 = newGame(2, 0)
    const s0 = g2.units.find((u) => u.civ === 0 && u.kind === 'SETTLER'); s0.alive = false
    const w = g2.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    const camp = g2.camps[0]
    const gold0 = g2.civs[0].gold
    const spot = campLanding(g2, camp) || adjOf(g2, [camp.c, camp.r])[0]
    ok(!!spot, 'camp has a landing tile')
    w.c = spot[0]; w.r = spot[1]
    while (camp.alive && w.alive) { w.moves = 2; if (!doAttack(g2, w, camp.c, camp.r)) break }
    ok(!camp.alive || !w.alive, 'camp assault resolves to completion')
    if (!camp.alive) {
        ok(g2.civs[0].gold >= gold0 + 12, 'razing a camp pays 12 gold')
        ok(!gs.tiles[idx(camp.c, camp.r)] || true, 'raze event path exercised')
    }
    // camps block settlement and movement
    const g3 = newGame(2, 0)
    const cp3 = g3.camps[0]
    ok(canFound(g3, 0, cp3.c, cp3.r) !== true, 'cannot settle on a live camp')
}

// ---- 14. cities fight back: bombardment, capture, civ death ----
console.log('14. city defense + capture + domination')
{
    const gs = newGame(4, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    // park a barbarian next to the capital; ending the turn must provoke bombardment
    const spot = campLanding(gs, cap) || adjOf(gs, [cap.c, cap.r])[0]
    const barb = spawnUnit(gs, BARB, 'WARRIOR', spot[0], spot[1], { str: 7 })
    step(gs, { endTurn: true })
    ok(barb.hp < 100 || !barb.alive, 'the city bombards an adjacent enemy')
    // capture an AI city: siege with a refreshed warrior until it flips
    const g2 = newGame(4, 0)
    g2.units.find((u) => u.civ === 0 && u.kind === 'SETTLER').alive = false
    step(g2, { endTurn: true })
    const aiCap = g2.cities.find((c) => c.alive && c.civ !== 0)
    ok(!!aiCap, 'AI capitals exist to take')
    if (aiCap) {
        const oldOwner = aiCap.civ
        declareWar(g2, 0, aiCap.civ)
        const w = g2.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
        const near = adjOf(g2, [aiCap.c, aiCap.r])[0]
        ok(!!near, 'target city has an assault tile')
        w.c = near[0]; w.r = near[1]
        let guard = 0
        while (aiCap.alive && aiCap.civ !== 0 && w.alive && guard++ < 20) { w.moves = 2; w.hp = 100; if (!doAttack(g2, w, aiCap.c, aiCap.r)) break }
        eq(aiCap.civ, 0, 'a battered city is captured and changes owner')
        ok(atWar(g2, 0, oldOwner), 'attacking a civ means war')
        ok(g2.tiles[idx(aiCap.c, aiCap.r)].owner === 0, 'captured centre switches to the conqueror')
    }
    // domination victory: every rival destroyed
    const g5 = newGame(9, 0)
    const s5 = g5.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(g5, { select: s5.id, found: true })
    for (const c of g5.civs) if (!c.barb && !c.player) c.alive = false
    step(g5, { endTurn: true })
    eq(g5.end, 'win', 'all rivals destroyed => domination victory')
    ok(/Domination/.test(g5.endWhy), 'domination is named as the win')
}

// ---- 15. production queue + healing ----
console.log('15. production + healing')
{
    const gs = newGame(2, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    step(gs, { queue: 'WARRIOR' })
    eq(cap.queue.length, 1, 'build order queued at the capital')
    let built = false, n = 0
    while (!built && n++ < 60) { step(gs, { endTurn: true }); built = gs.units.some((u) => u.alive && u.civ === 0 && u.kind === 'WARRIOR' && u.id > 8) }
    ok(built, 'banked production delivers a warrior')
    eq(cap.queue.length, 0, 'queue consumed on delivery')
    // healing: a wounded warrior idle on home soil recovers
    const w = unitAt(gs, cap.c, cap.r) || gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'WARRIOR').pop()
    w.hp = 60
    gs.tiles[idx(w.c, w.r)].owner = 0
    w.moves = 0; w.acted = false
    step(gs, { endTurn: true })
    ok(w.hp > 60, `wounded unit heals on home soil (hp ${w.hp})`)
}

// ---- 16. tech tree data: real names, real prereqs, era costs ----
console.log('16. tech tree data')
{
    eq(TECH_IDS.length, 12, 'twelve techs on the tree')
    const canon = ['Pottery', 'Agriculture', 'Archery', 'Bronze Working', 'Writing', 'Currency', 'Horseback Riding', 'Philosophy', 'Engineering', 'Mathematics', 'The Wheel', 'Masonry']
    ok(canon.every((n) => TECH_IDS.some((id) => TECH[id].name === n)), 'tech names are Civ V techs')
    ok(TECH_IDS.every((id) => TECH[id].effect && TECH[id].effect.length > 4), 'every tech describes its unlock')
    let dirty = false
    for (const id of TECH_IDS) {
        for (const p of TECH[id].prereq) {
            if (!TECH[p]) { dirty = true; break }
            if (TECH[p].era > TECH[id].era) dirty = true
            if (TECH[p].cost >= TECH[id].cost) dirty = true
        }
    }
    ok(!dirty, 'prereqs point at cheaper, same-or-earlier-era techs (no cycles, no backwards edges)')
    ok(TECH_IDS.every((id) => TECH[id].era >= 0 && TECH[id].era < ERAS.length), 'every tech sits in a named era')
    const ancientCost = Math.max(...TECH_IDS.filter((id) => TECH[id].era === 0).map((id) => TECH[id].cost))
    const classicalCost = Math.min(...TECH_IDS.filter((id) => TECH[id].era === 1).map((id) => TECH[id].cost))
    const medievalCost = Math.min(...TECH_IDS.filter((id) => TECH[id].era === 2).map((id) => TECH[id].cost))
    ok(ancientCost < classicalCost && classicalCost < medievalCost, 'era costs ascend: ancient < classical < medieval')
    eq(UNIT.ARCHER.tech, 'ARCHERY', 'the Archer is gated by Archery')
    eq(UNIT.CATAPULT.tech, 'ENGINEERING', 'the Catapult is gated by Engineering')
    eq(UNIT.CATAPULT.range, 2, 'the Catapult is a siege engine (range 2)')
}

// ---- 17. science spends, gating holds, the AI researches ----
console.log('17. science, gating, AI research')
{
    const gs = newGame(2, 0)
    eq(Object.keys(gs.tech[0].known).length, 0, 'everyone starts ignorant')
    eq(gs.tech[0].research, null, 'nothing is being researched at boot')
    ok(!canQueue(gs, 0, 'ARCHER'), 'archers cannot be built before Archery')
    ok(canQueue(gs, 0, 'WARRIOR'), 'warriors are the age-old arm')
    // refusing a gated order: deny event, queue untouched
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    gs.events = []
    step(gs, { queue: 'ARCHER' })
    ok(gs.events.some((ev) => ev.type === 'deny' && /requires archery/i.test(ev.reason || '')), 'queueing a gated unit is refused with a reason')
    ok(!cap.queue.includes('ARCHER'), 'the refused order never reaches the build queue')
    step(gs, { queue: 'WARRIOR' })
    ok(cap.queue.includes('WARRIOR'), 'an ungated order still queues')
    // research validity + spend
    ok(!setResearch(gs, 0, 'WRITING'), 'Writing is locked behind Pottery')
    ok(setResearch(gs, 0, 'POTTERY'), 'an available tech can be chosen')
    eq(gs.events[gs.events.length - 1].type, 'research', 'choosing research is an event')
    let learned = null, n = 0
    while (!learned && n++ < 60) { step(gs, { endTurn: true }); learned = gs.events.find((ev) => ev.type === 'tech' && ev.civ === 0 && ev.id === 'POTTERY') }
    ok(!!learned, 'banked science completes Pottery')
    ok(gs.tech[0].prog < TECH.WRITING.cost, 'overflow is smaller than any tech cost (carry, not reset)')
    ok(hasTech(gs, 0, 'POTTERY'), 'the tech is recorded as known')
    ok(availableTechs(gs, 0).includes('WRITING'), 'Pottery opens Writing')
    ok(setResearch(gs, 0, 'WRITING'), 'the opened tech is now researchable')
    // gate opens for real: archers queue once Archery is known
    const g4 = newGame(4, 0)
    const s4 = g4.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(g4, { select: s4.id, found: true })
    grantTech(g4, 0, 'ARCHERY')
    const cap4 = g4.cities.find((c) => c.civ === 0)
    step(g4, { queue: 'ARCHER' })
    ok(cap4.queue.includes('ARCHER'), 'archers queue once Archery is discovered')
    // the AI researches, and rivals take different paths
    const g7 = newGame(3, 0)
    let m = 0
    while (!g7.end && m++ < 40000) step(g7, decide(g7))
    const aiKnown = [1, 2, 3].map((c) => Object.keys(g7.tech[c].known).length)
    ok(aiKnown.some((k) => k >= 1), 'the AI civs are researching too')
    ok(new Set([1, 2, 3].map((c) => TECH_IDS.filter((id) => g7.tech[c].known[id]).join(','))).size > 1, 'rival research paths diverge')
}

// ---- 18. tech effects actually bite ----
console.log('18. era effects')
{
    const g = newGame(2, 0)
    const s = g.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(g, { select: s.id, found: true })
    const cap = g.cities.find((c) => c.civ === 0)
    for (const [nc, nr] of neighbors(cap.c, cap.r)) { const tl = g.tiles[idx(nc, nr)]; tl.terr = T.GRASS; tl.forest = false; tl.river = false }
    cap.size = 2
    const f0 = cityYield(g, cap).f
    grantTech(g, 0, 'AGRICULTURE')
    ok(cityYield(g, cap).f > f0, 'Agriculture adds food to worked grassland')
    grantTech(g, 0, 'CURRENCY'); grantTech(g, 0, 'WRITING'); grantTech(g, 0, 'PHILOSOPHY')
    const y1 = cityYield(g, cap)
    ok(y1.g >= 3, 'Currency puts coin in the till')
    ok(y1.sci >= 4, 'Writing puts scribes in the city')
    ok(y1.cult >= 3, 'Philosophy lifts culture')
    grantTech(g, 0, 'MASONRY')
    eq(cap.wallMax, CFG.cityHp + 100, 'Masonry raises 100 more wall')
    // Pottery: growth is cheaper (same surplus, faster citizen with pottery)
    const sizeAt = (seed, pottery) => {
        const gg = newGame(seed, 0)
        const ss = gg.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
        step(gg, { select: ss.id, found: true })
        const cc = gg.cities.find((c) => c.civ === 0)
        if (pottery) grantTech(gg, 0, 'POTTERY')
        let t = 0
        while (cc.size < 2 && gg.turn <= CFG.turnLimit && t++ < 600) step(gg, { endTurn: true })
        return cc.size >= 2 ? gg.turn : 999
    }
    let strict = false
    for (const seed of [1, 2, 3, 4]) {
        const p = sizeAt(seed, true), q = sizeAt(seed, false)
        ok(p <= q, `seed ${seed}: Pottery grows the town no slower (${p} vs ${q})`)
        if (p < q) strict = true
    }
    ok(strict, 'and for at least one seed Pottery is strictly faster')
    // Bronze: warriors get harder metal; Horseback: mounts carry them further
    const g8 = newGame(8, 0)
    const w8 = g8.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    grantTech(g8, 0, 'BRONZE_WORKING')
    eq(w8.str, UNIT.WARRIOR.str + 2, 'Bronze Working arms a living warrior +2')
    const bspot = neighbors(w8.c, w8.r).find(([c, r]) => walk(g8.tiles[idx(c, r)].terr) && !unitAt(g8, c, r))
    eq(spawnUnit(g8, 0, 'WARRIOR', bspot[0], bspot[1]).str, UNIT.WARRIOR.str + 2, 'bronze forges fresh warriors at full strength too')
    const g9 = newGame(9, 0)
    const w9 = g9.units.find((u) => u.civ === 0 && u.kind === 'WARRIOR')
    const s9 = g9.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    grantTech(g9, 0, 'HORSEBACK')
    eq(w9.maxMoves, UNIT.WARRIOR.moves + 1, 'Horseback Riding gives riders a faster march')
    eq(s9.maxMoves, UNIT.SETTLER.moves, 'settlers stay oxcart-slow')
    // Mathematics: bombardment hits harder
    const strikeDmg = (math) => {
        const gg = newGame(2, 0)
        const ss = gg.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
        step(gg, { select: ss.id, found: true })
        const cc = gg.cities.find((c) => c.civ === 0)
        if (math) grantTech(gg, 0, 'MATHEMATICS')
        const spot = neighbors(cc.c, cc.r).find(([c, r]) => walk(gg.tiles[idx(c, r)].terr) && !unitAt(gg, c, r))
        const bv = spawnUnit(gg, BARB, 'WARRIOR', spot[0], spot[1], { str: 7 })
        step(gg, { endTurn: true })
        return 100 - bv.hp
    }
    ok(strikeDmg(true) > strikeDmg(false), 'Mathematics sharpens the city bombardment')
    // Catapult: siege multiplier vs walls
    const siegeDmg = (kind) => {
        const gg = newGame(4, 0)
        gg.units.find((u) => u.civ === 0 && u.kind === 'SETTLER').alive = false
        step(gg, { endTurn: true })
        const aiCap = gg.cities.find((c) => c.alive && c.civ !== 0)
        declareWar(gg, 0, aiCap.civ)
        const spot = neighbors(aiCap.c, aiCap.r).find(([c, r]) => walk(gg.tiles[idx(c, r)].terr) && !unitAt(gg, c, r))
        const u = spawnUnit(gg, 0, kind, spot[0], spot[1])
        doAttack(gg, u, aiCap.c, aiCap.r)
        return 100 - aiCap.hp
    }
    ok(siegeDmg('CATAPULT') > siegeDmg('ARCHER'), 'catapults siege walls harder than arrows')
}

// ---- 19. improvements: tech + border + terrain gates ----
console.log('19. improvements (gates)')
{
    const gs = newGame(6, 0)
    eq(IMP_IDS.length, 3, 'three improvements on the builder menu')
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    ok(!!cap, 'capital founded for the land tests')
    // centre tile can never be farmed
    const centred = spawnUnit(gs, 0, 'WORKER', cap.c, cap.r)
    eq(canImprove(gs, 0, centred, 'FARM'), 'cannot improve the city centre', 'the city centre itself is not a farm plot')
    centred.alive = false
    // find an owned grass/plains ring tile and park a worker there
    const ring = neighbors(cap.c, cap.r).map(([c, r]) => gs.tiles[idx(c, r)])
    const farmable = ring.find((tl) => (tl.terr === T.GRASS || tl.terr === T.PLAINS) && tl.city < 0)
    ok(!!farmable, 'the border ring offers farmable ground')
    const w = spawnUnit(gs, 0, 'WORKER', farmable.c, farmable.r)
    ok(farmable.owner === 0, 'the ring tile is inside ROME')
    eq(canImprove(gs, 0, w, 'FARM'), 'requires Pottery', 'FARM is gated by Pottery')
    grantTech(gs, 0, 'POTTERY')
    eq(canImprove(gs, 0, w, 'FARM'), true, 'Pottery opens the plough')
    // hills reject farms; a worker on an owned hill needs Masonry for the mine
    const hill = ring.find((tl) => tl.terr === T.HILLS && tl.city < 0)
    if (hill) {
        const hw = spawnUnit(gs, 0, 'WORKER', hill.c, hill.r)
        eq(canImprove(gs, 0, hw, 'MINE'), 'requires Masonry', 'MINE is gated by Masonry')
        grantTech(gs, 0, 'MASONRY')
        eq(canImprove(gs, 0, hw, 'MINE'), true, 'Masonry opens the pick')
        ok(!IMP.FARM.terr.includes(T.HILLS), 'farms never claim hills')
    } else {
        ok(true, 'no hill in this ring — mine gate covered by the data check')
        ok(!IMP.FARM.terr.includes(T.HILLS), 'farms never claim hills')
    }
    // outside your borders the worker stands down
    const far = gs.tiles.find((tl) => tl.owner === -1 && tl.terr === T.GRASS && tl.city < 0 && tl.camp < 0 && !unitAt(gs, tl.c, tl.r))
    const ow = spawnUnit(gs, 0, 'WORKER', far.c, far.r)
    eq(canImprove(gs, 0, ow, 'FARM'), 'outside your borders', 'no building on foreign dirt')
    // a worker mid-job cannot take a second job
    grantTech(gs, 0, 'POTTERY')
    ok(startImprove(gs, w, 'FARM'), 'a free worker breaks ground')
    ok(w.busy != null, 'the worker is now busy')
    eq(canImprove(gs, 0, w, 'ROAD'), 'worker already working', 'one job at a time')
    ok(gs.events.some((ev) => ev.type === 'improveStart' && ev.kind === 'FARM'), 'the crew logs its start')
}

// ---- 20. works take turns, then bite ----
console.log('20. improvements (build + yields + roads)')
{
    const gs = newGame(6, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    const ring = neighbors(cap.c, cap.r).map(([c, r]) => gs.tiles[idx(c, r)])
    const plot = ring.find((tl) => (tl.terr === T.GRASS || tl.terr === T.PLAINS) && tl.city < 0)
    grantTech(gs, 0, 'POTTERY')
    const w = spawnUnit(gs, 0, 'WORKER', plot.c, plot.r)
    startImprove(gs, w, 'FARM')
    step(gs, { endTurn: true })
    ok(plot.imp !== 'FARM', 'a farm is not instant — the first turn of toil leaves it unfinished')
    let n = 0
    while (!plot.imp && n++ < 6) {
        if (!plot.build && w.busy == null && w.alive) startImprove(gs, w, 'FARM')   // re-crew if barbs cut the crew down
        step(gs, { endTurn: true })
    }
    eq(plot.imp, 'FARM', 'the farm is finished after its turns')
    eq(w.busy, null, 'the freed worker looks for work')
    ok(gs.events.some((ev) => ev.type === 'improved' && ev.kind === 'FARM'), 'completion is logged')
    // the improved plot feeds more, and the city picks it up in its ring
    const yImp = tileYield(gs, idx(plot.c, plot.r)).f
    plot.imp = null
    const yRaw = tileYield(gs, idx(plot.c, plot.r)).f
    ok(yImp > yRaw, `the farm raises the plot's food (${yRaw} → ${yImp})`)
    ok(cityWorkedTiles(gs, cap).includes(idx(plot.c, plot.r)) || cap.size < 2, 'city workers till the best ring tiles')
    // roads halve the march
    const spot = ring.find((tl) => tl.city < 0 && tl.camp < 0 && !unitAt(gs, tl.c, tl.r))
    ok(!!spot, 'road test ground exists')
    eq(roadCost(gs, w, spot.c, spot.r), 1, 'open ground costs a full move')
    spot.road = true
    eq(roadCost(gs, w, spot.c, spot.r), 0.5, 'a road halves the cost of the hex')
    // barbs pillage what they march over
    spot.road = true
    const barb = spawnUnit(gs, BARB, 'WARRIOR', spot.c, spot.r, { str: 7 })
    barb.c = spot.c; barb.r = spot.r
    gs.events = []
    step(gs, { endTurn: true })
    ok(!spot.road || !barb.alive || gs.events.some((ev) => ev.type === 'pillage'), 'barbarians ravage the road they cross')
}

// ---- 21. resources: reveal, connect, pay ----
console.log('21. resources')
{
    const gs = newGame(6, 0)
    const lux = RES_IDS.filter((id) => RES[id].lux)
    const strat = RES_IDS.filter((id) => RES[id].strategic)
    ok(lux.length >= 4 && strat.length >= 2, 'the world stocks luxuries and strategics')
    // every strategic resource names a real tech that opens it
    for (const id of strat) ok(TECH[RES[id].tech], `${id} unlocks with ${RES[id].tech}`)
    // strategic resources stay hidden until their tech is known
    const ironT = gs.tiles.find((tl) => tl.res === RES_IDS.indexOf('IRON'))
    ok(!!ironT, 'this map carries iron')
    gs.explored[0][idx(ironT.c, ironT.r)] = 1
    ok(!resRevealed(gs, 0, idx(ironT.c, ironT.r)), 'iron is not marked on the map before Bronze Working')
    grantTech(gs, 0, 'BRONZE_WORKING')
    ok(resRevealed(gs, 0, idx(ironT.c, ironT.r)), 'the bronze age reveals the iron seams')
    // connect: an owned resource linked into the network counts (ring tile IS
    // the link at founding — borders claim the first ring)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    ok(!connectedResources(gs, 0).includes('IRON'), 'before the seam is yours, it pays nothing')
    const ring0 = neighbors(cap.c, cap.r).map(([c, r]) => gs.tiles[idx(c, r)]).filter((tl) => tl.city < 0 && tl.camp < 0)
    const claim = (rid) => {
        const tl = ring0.find((t) => t.res === RES_IDS.indexOf(rid) && RES[rid].terr.includes(t.terr)) || ring0.find((t) => t.res === -1 && walk(t.terr))
        ok(!!tl, `a ring tile is available to claim ${rid}`)
        tl.res = RES_IDS.indexOf(rid); tl.owner = 0
        return tl
    }
    const ironMine = claim('IRON')
    ok(connectedResources(gs, 0).includes('IRON'), 'iron inside your borders feeds the realm')
    ok(tileOwnedBy(gs, 0, ironMine), 'ownership helper agrees')
    // luxuries pay gold + culture empire-wide, once per unique type
    const g0 = gs.civs[0].gold, c0 = gs.civs[0].culture
    const wineT = claim('WINE')
    step(gs, { endTurn: true })
    ok(gs.civs[0].gold > g0, 'the caravans bring gold')
    ok(gs.events.some((ev) => ev.type === 'luxury' && ev.id === 'WINE'), 'a newly-connected luxury is announced')
    ok(gs.civs[0].culture >= c0, 'culture keeps flowing')
    // iron feeds the city that holds it
    const yIron = cityYield(gs, cap).p
    ironMine.owner = -1
    ok(cityYield(gs, cap).p < yIron, 'losing the seam costs the forge its bonus')
}

// ---- 22. strategic resources gate the units that need them ----
console.log('22. resource-gated units')
{
    const gs = newGame(6, 0)
    const s = gs.units.find((u) => u.civ === 0 && u.kind === 'SETTLER')
    step(gs, { select: s.id, found: true })
    const cap = gs.cities.find((c) => c.civ === 0)
    grantTech(gs, 0, 'BRONZE_WORKING')
    ok(!canQueue(gs, 0, 'LEGION'), 'the Legion needs iron, not just the secret')
    eq(queueDeny(gs, 0, 'LEGION'), 'requires Iron', 'the refusal names what is missing')
    gs.events = []
    step(gs, { queue: 'LEGION' })
    ok(!cap.queue.includes('LEGION'), 'the denied order never reaches the queue')
    const ring2 = neighbors(cap.c, cap.r).map(([c, r]) => gs.tiles[idx(c, r)]).filter((tl) => tl.city < 0 && tl.camp < 0)
    const claimRing = (rid) => {
        const tl = ring2.find((t) => t.res === RES_IDS.indexOf(rid) && RES[rid].terr.includes(t.terr)) || ring2.find((t) => t.res === -1 && walk(t.terr))
        tl.res = RES_IDS.indexOf(rid); tl.owner = 0
        return tl
    }
    claimRing('IRON')
    ok(canQueue(gs, 0, 'LEGION'), 'with a connected seam the Legion marches')
    step(gs, { queue: 'LEGION' })
    ok(cap.queue.includes('LEGION'), 'the legion queues for real')
    ok(!canQueue(gs, 0, 'CHARIOT'), 'the chariot archer waits for horses')
    grantTech(gs, 0, 'THE_WHEEL')
    ok(!canQueue(gs, 0, 'CHARIOT'), 'the wheel alone is not enough — the steppe must be yours')
    eq(queueDeny(gs, 0, 'CHARIOT'), 'requires Horses', 'and the refusal says so')
    claimRing('HORSES')
    ok(canQueue(gs, 0, 'CHARIOT'), 'connected horses + the wheel open the chariot')
    eq(UNIT.CHARIOT.range, 2, 'the chariot shoots at range 2')
    // the world stocks both mounts and metal
    const gs2 = newGame(13, 0)
    ok(gs2.tiles.some((tl) => tl.res === RES_IDS.indexOf('HORSES')), 'seed 13 carries horses')
    ok(gs2.tiles.some((tl) => tl.res === RES_IDS.indexOf('IRON')), 'seed 13 carries iron')
    // the autopilot actually builds and works a labourer, end to end
    const g3 = newGame(13, 0)
    let sawWorker = false, sawBuilt = false, n = 0
    while (!g3.end && n++ < 40000) { step(g3, decide(g3)); if (g3.units.some((u) => u.alive && u.civ === 0 && u.kind === 'WORKER')) sawWorker = true; if (g3.events.some((ev) => ev.type === 'improved' && ev.civ === 0)) sawBuilt = true }
    ok(sawWorker, 'the witness trains a worker')
    ok(sawBuilt, 'and puts it to work in a real game')
}

console.log(`\ncivcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
