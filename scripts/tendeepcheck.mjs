// TEN-DEEP — the Node gate. No browser, no dev server. This file is the
// reason the attract demo is a PROVEN campaign and not theatre, and the
// reason the maze cannot be a lie: the generator never referees its own
// work — tendeepcheck re-proves reachability with its own BFS.
//
//   npm run tendeepcheck             # audit + pins + proven run + slack + determinism
//   npm run tendeepcheck -- --mutate # re-break the load-bearing rules; every
//                                # mutant MUST turn something red
//
// Sections: no-random · FLOOR AUDIT (independent BFS) · ENGINE PINS
// (dmg floor, overkill ledger, dead-dont-act, round ledger exactness,
// potion/spring/levelup/flee/throne/stairs contracts) · THE PROVEN CAMPAIGN
// (what the attract demo replays live) · SLACK RULE (one fewer consumed
// potion, one fewer consumed spring, both, and a full spring-strip) ·
// DETERMINISM.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CFG, makeRun, step, stateHash, SIZE, xpNext, purse, canBuy, servicePrice, createPriceFor, isVacant, BUILDINGS, SERVICES, SPELLS, CLASSES, ALIGN_ORDER, canCast, DX as DXC, DY as DYC } from '../src/games/TenDeep/sim.js'
import { RACES, ALIGNMENTS, compose, classOk, rollCandidates } from '../src/games/TenDeep/people.js'
import { genFloor, FLOORS, MOBS } from '../src/games/TenDeep/dungeon.js'
import { solveRun } from '../src/games/TenDeep/solver.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const drain = (g) => { const e = g.events.splice(0); return e }
const run = (g, cmd, n = 1) => {
    const ev = []
    for (let i = 0; i < n && !g.end; i++) { step(g, cmd); for (const e of drain(g)) ev.push(e) }
    return ev
}
const partyHp = (g) => g.party.reduce((n, h) => n + h.hp, 0)
const mobHp = (g) => (g.combat ? g.combat.mobs.reduce((n, m) => n + m.hp, 0) : 0)

// ---------------------------------------------------------------- math is banned ----
section('MATH.RANDOM IS A SIM CRIME')
for (const f of ['sim.js', 'dungeon.js', 'solver.js', 'town.js']) {
    const raw = readFileSync(join(HERE, '../src/games/TenDeep', f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — the dungeon may never be luck`)
}
const realRandom = Math.random
Math.random = () => { throw new Error('Math.random called during gen/solve') }
let froze = false
try {
    for (let i = 0; i < FLOORS.length; i++) genFloor(i)
    const g = makeRun()
    step(g, 'down')
    for (let i = 0; i < 300 && !g.end; i++) step(g, 'fwd')
    froze = true
} catch (e) {
    fails.push(`frozen Math.random was hit: ${e.message}`)
}
Math.random = realRandom
ok(froze, 'floor generation and a 300-step walk run with Math.random THROWN at the call site')

// ---------------------------------------------------------------- floor audit ----
section('FLOOR AUDIT — an independent BFS re-proves every seeded maze')
for (let fi = 0; fi < FLOORS.length; fi++) {
    const d = genFloor(fi)
    const openN = d.grid.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)
    // our OWN flood fill from the entrance — the generator's dist is never trusted
    const seen = new Set([d.entrance.y * SIZE + d.entrance.x])
    const q = [[d.entrance.x, d.entrance.y]]
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            const t = ny * SIZE + nx
            if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && d.grid[t] === 0 && !seen.has(t)) { seen.add(t); q.push([nx, ny]) }
        }
    }
    ok(seen.size === openN, `floor ${fi}: ${openN - seen.size} open cell(s) the entrance cannot reach — a sealed maze is a build failure`)
    const goal = d.stairs || d.throne
    ok(seen.has(goal.y * SIZE + goal.x), `floor ${fi}: the ${d.stairs ? 'stairs' : 'throne'} is not reachable`)
    ok(!d.wall(d.entrance.x, d.entrance.y), `floor ${fi}: the entrance is not open`)
    const used = new Set([d.entrance.y * SIZE + d.entrance.x, goal.y * SIZE + goal.x])
    const all = [...d.pots.map((p) => ['pot', p]), ...d.springs.map((p) => ['spring', p]), ...d.ambushes.map((a) => ['ambush', a])]
    for (const [kind, p] of all) {
        ok(!d.wall(p.x, p.y), `floor ${fi}: ${kind} planted inside a wall`)
        ok(seen.has(p.y * SIZE + p.x), `floor ${fi}: ${kind} at (${p.x},${p.y}) is unreachable`)
        ok(!used.has(p.y * SIZE + p.x), `floor ${fi}: ${kind} stacked on another special tile`)
        used.add(p.y * SIZE + p.x)
    }
    ok(d.pots.length === FLOORS[fi].pots && d.springs.length === FLOORS[fi].springs, `floor ${fi}: supply count drifted`)
    for (const a of d.ambushes) {
        ok(Array.isArray(a.group) && a.group.length >= 1 && a.group.every((k) => MOBS[k]), `floor ${fi}: ambush ${a.id} does not name real monsters`)
        ok(!(d.throne && a.x === d.throne.x && a.y === d.throne.y), `floor ${fi}: ambush stacked on the throne`)
    }
    const again = genFloor(fi)
    ok(Buffer.compare(Buffer.from(d.grid), Buffer.from(again.grid)) === 0, `floor ${fi}: the seed does not regenerate identically`)
    console.log(`  ..    floor ${fi}: ${openN} open cells, reach ${seen.size}, goal at (${goal.x},${goal.y}), ${d.pots.length} potions, ${d.springs.length} springs, ${d.ambushes.length} ambushes`)
}

// ------------------------------------------------------------------ engine pins ----
section('ENGINE PINS')
{
    // 1. THE DAMAGE FLOOR: a tin-can mob with def >= atk still bleeds dmgFloor.
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Tin Rat', art: 'rat', hp: 50, maxHp: 50, atk: 1, def: 99, spd: 1, xp: 0 }] }
        run(g, 'attack')
        const dealt = g.ledger.dealt
        ok(dealt >= CFG.dmgFloor, `the damage floor did not bite: dealt=${dealt} (want >= ${CFG.dmgFloor})`)
    }
    // 2. THE OVERKILL CAP: the ledger never books more than the victim had.
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Wounded Rat', art: 'rat', hp: 2, maxHp: 12, atk: 1, def: 0, spd: 1, xp: 0 }] }
        const h = g.party.find((p) => p.name === 'BORAM')
        h.atk = 40
        const ev = run(g, 'attack')
        const round = ev.find((e) => e.type === 'round')
        ok(round && round.dealt[0].d === 2 && g.ledger.dealt === 2, `a 40-damage swing on a 2-hp rat booked ${g.ledger.dealt} (want exactly 2 — overkill must not inflate the ledger)`)
    }
    // 3. DEAD DO NOT ACT: a mob slain before its speed slot never strikes back.
    {
        const g = makeRun()
        g.mode = 'combat'
        // rat spd 6; GWENDA spd 8 acts first and one-shots it (hp 1)
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Doomed Rat', art: 'rat', hp: 1, maxHp: 12, atk: 20, def: 0, spd: 6, xp: 0 }] }
        for (const p of g.party) if (p.name !== 'GWENDA') p.spd = 1
        const ev = run(g, 'attack')
        const round = ev.find((e) => e.type === 'round')
        ok(round && round.taken.length === 0, `the rat struck from the grave: taken=${JSON.stringify(round.taken)}`)
    }
    // 4. THE ROUND LEDGER IS EXACT: party HP lost == round event's tSum,
    //    measured from the STATE, not trusted from the event's own arithmetic.
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'GOBLIN', name: 'Goblin', art: 'goblin', hp: 40, maxHp: 40, atk: 9, def: 3, spd: 4, xp: 0 }] }
        for (const p of g.party) p.xp = 0
        let mobLedger = 0
        for (let t = 0; t < 12 && g.combat; t++) {
            const hpB = partyHp(g), mB = mobHp(g)
            const ev = run(g, 'attack')
            const r = ev.find((e) => e.type === 'round')
            if (r) {
                ok(r.tSum === hpB - partyHp(g), `round ${r.n}: tSum=${r.tSum} but the party lost ${hpB - partyHp(g)} (no heals/potions in this scenario — they must agree to the point)`)
                ok(r.dSum === mB - mobHp(g) || !g.combat, `round ${r.n}: dSum=${r.dSum} but the mob team lost ${mB - mobHp(g)}`)
            }
            mobLedger += mB - mobHp(g)
        }
        ok(g.ledger.dealt === mobLedger, `campaign-wide monster ledger drifted: dealt=${g.ledger.dealt} observed=${mobLedger}`)
    }
    // 5. THE HEAL AND POTION CAPS: HP never exceeds the hero's maximum.
    {
        const g = makeRun()
        g.party[0].hp = 1
        g.potions = 2
        const ev = run(g, 'potion')
        const p = g.party[0]
        ok(p.hp === Math.min(p.maxHp, 1 + CFG.potionHeal), `potion healed to ${p.hp}, want ${Math.min(p.maxHp, 1 + CFG.potionHeal)}`)
        ok(ev.some((e) => e.type === 'potion' && e.got > 0), 'the potion event booked no healing')
        g.party[0].hp = 1
        g.party[0].maxHp = 5
        run(g, 'potion')
        ok(g.party[0].hp === 5 && g.party[0].hp <= g.party[0].maxHp, `overheal escaped the cap: hp=${g.party[0].hp} max=${g.party[0].maxHp}`)
        g.potions = 0
        const ev2 = run(g, 'potion')
        ok(ev2.some((e) => e.type === 'empty'), 'drinking from an empty satchel answered with silence')
    }
    // 6. THE SPRING: restores MP, respects the cap, and is ONE-SHOT.
    {
        const g = makeRun()
        step(g, 'down')
        const s = g.map.springs[0]
        g.x = s.x; g.y = s.y
        for (const p of g.party) p.mp = 0
        const ev = run(g, 'use')
        ok(ev.some((e) => e.type === 'spring'), 'the spring did not answer')
        ok(g.party.every((p) => p.mp === Math.min(p.maxMp, CFG.springMp)), `spring MP wrong: ${g.party.map((p) => p.mp).join(',')}`)
        const ev2 = run(g, 'use')
        ok(ev2.some((e) => e.type === 'nothing' || e.type === 'springFull') && g.springs.size === g.map.springs.length - 1, 'the spring still refilled after it was drunk')
    }
    // 7. THE LEVEL-UP GATE: the level arrives exactly at the threshold.
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'XP Rat', art: 'rat', hp: 1, maxHp: 1, atk: 0, def: 99, spd: 1, xp: xpNext(1) }] }
        const hpB = g.party[0].maxHp
        const ev = run(g, 'attack')
        ok(ev.some((e) => e.type === 'levelup' && e.lvl === 2), 'a kill worth exactly the threshold did not raise a level')
        ok(g.party[0].maxHp === hpB + CFG.lvlHp, 'level-up booked no hp')
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Dust Rat', art: 'rat', hp: 1, maxHp: 1, atk: 0, def: 99, spd: 1, xp: 1 }] }
        g.party.forEach((p) => { p.xp = 0 })
        const ev2 = run(g, 'attack')
        ok(!ev2.some((e) => e.type === 'levelup'), '1 xp past zero levelled a hero — the gate leaks')
    }
    // 8. FLEE: costs the rear guard, returns to the map; the Hollow King refuses.
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Rear-Scout Rat', art: 'rat', hp: 999, maxHp: 999, atk: 1, def: 99, spd: 1, xp: 0 }] }
        const slowest = [...g.party].sort((a, b) => a.spd - b.spd)[0]
        const hpB = slowest.hp
        const ev = run(g, 'flee')
        const fh = ev.find((e) => e.type === 'fleeHit')
        ok(!!fh && fh.d === CFG.fleeCost && slowest.hp === hpB - CFG.fleeCost, `the parting shot misbooked: d=${fh ? fh.d : 'none'} hp=${slowest.hp}`)
        ok(g.mode === 'map' && !g.combat, 'flee did not return the party to the corridor')
        g.mode = 'combat'
        g.combat = { boss: true, round: 0, mobs: [{ id: 0, key: 'KING', name: 'THE HOLLOW KING', art: 'king', hp: 99, maxHp: 99, atk: 1, def: 0, spd: 1, xp: 0 }] }
        const ev2 = run(g, 'flee')
        ok(ev2.some((e) => e.type === 'noback') && g.mode === 'combat', 'the Hollow King let the party run')
    }
    // 9. STAIRS AND THRONE: use descends, the throne wakes the campaign's end.
    {
        const g = makeRun()
        step(g, 'down')
        const s = g.map.stairs
        g.x = s.x; g.y = s.y
        const ev = run(g, 'use')
        ok(ev.some((e) => e.type === 'descend' && g.floor === 1), `stairs did not descend: floor=${g.floor}`)
        const g3 = makeRun()
        step(g3, 'down')
        const th = genFloor(FLOORS.length - 1).throne
        g3.map = genFloor(FLOORS.length - 1)
        const dirs = [[1, 0, 2], [-1, 0, 0], [0, 1, 3], [0, -1, 1]]
        const near = dirs.find(([dx, dy]) => !g3.map.wall(th.x + dx, th.y + dy))
        ok(!!near, 'the throne has no open neighbour — unwinnable geometry')
        g3.x = th.x + near[0]; g3.y = th.y + near[1]; g3.dir = near[2]
        run(g3, 'fwd')
        ok(g3.mode === 'combat' && g3.combat && g3.combat.boss, 'stepping up to the throne did not start the King fight')
    }
    // 10. MOVEMENT: back is the reverse, walls refuse; spells cost MP, and
    //     only a class that has LEARNED the letter may work it.
    {
        const g = makeRun()
        step(g, 'down')
        const b = { x: g.x, y: g.y }
        run(g, 'fwd')
        ok(g.x !== b.x || g.y !== b.y, 'fwd from the entrance refused (the entrance corridor must open somewhere)')
        run(g, 'back')
        ok(g.x === b.x && g.y === b.y, `back did not reverse fwd: (${g.x},${g.y}) want (${b.x},${b.y})`)
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Volunteer', art: 'rat', hp: 999, maxHp: 999, atk: 1, def: 99, spd: 1, xp: 0 }] }
        const mirabel = g.party.find((p) => p.name === 'MIRABEL')
        const mpB = mirabel.mp
        run(g, 'cast firebolt')
        ok(mirabel.mp === mpB - SPELLS.firebolt.cost, `FIREBOLT cost ${mpB - mirabel.mp}, want ${SPELLS.firebolt.cost}`)
        // BORAM the FECHT owns no book: fire is refused before the round burns
        const mpTot0 = g.party.reduce((n, p) => n + p.mp, 0)
        mirabel.mp = 0
        const evNo = run(g, 'cast firebolt')
        ok(evNo.some((e) => e.type === 'noLetter') && g.party.reduce((n, p) => n + p.mp, 0) === mpTot0 - (mpB - SPELLS.firebolt.cost), 'a company with no MP for firebolt cast anyway')
        mirabel.mp = 2
        const hurt = g.party.find((p) => p.name === 'BORAM')
        hurt.hp = 5
        const mpTot = g.party.reduce((n, p) => n + p.mp, 0)
        const before = g.party.map((p) => p.hp)
        run(g, 'cast heal')
        ok(g.party.reduce((n, p) => n + p.mp, 0) === mpTot - SPELLS.heal.cost, `heal did not spend exactly ${SPELLS.heal.cost} MP in total`)
        ok(g.party.some((p, i) => p.hp > before[i]), 'heal did not mend anyone — the mob merely bit while nobody healed')
    }
}

// ------------------------------------------------------------------ THE RIM ----
section('THE RIM — surface-world pins (stage 2 of #1127)')
{
    ok(BUILDINGS.length === 4 && SERVICES.T && SERVICES.V && SERVICES.G && SERVICES.A, 'the RIM must have exactly four houses: tavern, temple, grounds, alchemist')
    // the game OPENS on the surface: the expedition walks down, not spawns in
    {
        const g = makeRun()
        ok(g.mode === 'town' && g.town.b === null, `a fresh run must open at the RIM street, got mode=${g.mode}`)
        ok(purse(g) === 120 && g.ledger.goldIn === 120, `starting purse ${purse(g)} (want 120 = printed gold in the ledger)`)
        run(g, 'down')
        ok(g.mode === 'map' && g.floor === 0, `F at the well must open DEEP 1, got mode=${g.mode} floor=${g.floor}`)
        const dead = makeRun()
        dead.party.forEach(h => { h.alive = false; h.hp = 0 })
        const ev = run(dead, 'down')
        ok(ev.some(e => e.type === 'noBreathers') && dead.mode === 'town', 'a coffin crew was allowed down the well')
    }
    // TAVERN: hire replaces a corpse — and refuses the living
    {
        const g = makeRun()
        step(g, 'enter-T')
        const ev = run(g, 'buy')
        ok(ev.some(e => e.type === 'townNo') && purse(g) === 120 && g.ledger.tx.length === 0, 'the tavern hired a BREATHING hero — post is for the fallen only')
        g.party[3].alive = false; g.party[3].hp = 0
        run(g, 'sel+'); run(g, 'sel+'); run(g, 'sel+')
        const ev2 = run(g, 'buy')
        const h = g.party[3]
        ok(ev2.some(e => e.type === 'hire') && h.alive && h.lvl === 1 && h.hp === h.maxHp, 'the tavern did not replace the fallen with a fresh level-1 roll')
        ok(purse(g) === 80 && g.ledger.goldSpent === CFG.hireCost, `hire misbooked: purse=${purse(g)} spent=${g.ledger.goldSpent}`)
        ok(g.ledger.tx.length === 1 && g.ledger.tx[0].id === 'post' && g.ledger.tx[0].price === CFG.hireCost, 'the hire was not booked into the town ledger')
    }
    // deterministic rolls: same seed, same company; successive hires differ
    {
        const seq = () => {
            const g = makeRun()
            step(g, 'enter-T')
            const names = []
            for (let i = 0; i < 4; i++) {
                g.party[i].alive = false; g.party[i].hp = 0
                g.town.hero = i
                step(g, 'buy')
                names.push(g.party[i].name)
            }
            return names.join('|')
        }
        const a = seq(), b = seq()
        ok(a === b, `recruit rolls drift between identical runs: ${a} vs ${b}`)
        ok(new Set(a.split('|')).size > 1, 'the tavern keeps handing back the same recruit — the roll is stuck')
    }
    // TEMPLE: Mourn at 200×lvl returns the dead at 1 hp; broke refuses and nothing moves
    {
        const g = makeRun()
        g.party.forEach(h => { h.gold += 200; g.ledger.goldIn += 200 })
        g.party[2].alive = false; g.party[2].hp = 0
        const p0 = purse(g)
        step(g, 'enter-V'); run(g, 'sel+'); run(g, 'sel+')
        const price = servicePrice(g, SERVICES.V[0])
        ok(price === CFG.mournCost * 1, `mourn must price at 200 x lvl, got ${price}`)
        run(g, 'buy')
        ok(g.party[2].alive && g.party[2].hp === 1, 'Mourn did not return the dead at the threshold of life (1 hp)')
        ok(purse(g) === p0 - 200, `mourn misbooked: ${p0} -> ${purse(g)}`)
        const poor = makeRun()
        poor.party[0].alive = false; poor.party[0].hp = 0
        step(poor, 'enter-V')
        const ev = run(poor, 'buy')
        ok(ev.some(e => e.type === 'broke') && !poor.party[0].alive && purse(poor) === 120, 'the temple resurrected on credit')
    }
    // TEMPLE: Restore the dead whole / Mend / Refresh
    {
        const g = makeRun()
        g.party.forEach(h => { h.gold += 400; g.ledger.goldIn += 400 })
        g.party[1].alive = false; g.party[1].hp = 0
        step(g, 'enter-V'); run(g, 'svc+'); run(g, 'sel+')
        run(g, 'buy')
        ok(g.party[1].alive && g.party[1].hp === g.party[1].maxHp && g.party[1].mp === g.party[1].maxMp, 'Restore left someone less than whole')
        g.party[4].hp = 3; g.party[4].mp = 0
        g.town.svc = 2; g.town.hero = 4
        run(g, 'buy')
        ok(g.party[4].hp === g.party[4].maxHp, 'Mend did not fill the wounded hero')
        g.town.svc = 3
        run(g, 'buy')
        ok(g.party[4].mp === g.party[4].maxMp, 'Refresh did not return the spent magic')
    }
    // TRAINING GROUNDS: the XP-at-threshold bargain, priced 100 × next level
    {
        const g = makeRun()
        g.party.forEach(h => { h.gold += 200; g.ledger.goldIn += 200 })
        step(g, 'enter-G')
        const ev0 = run(g, 'buy')
        ok(ev0.some(e => e.type === 'townNo') && g.party[0].lvl === 1 && purse(g) === 1320, 'training sold a level to a hero with no XP')
        g.party[0].xp = xpNext(1)
        const hpB = g.party[0].maxHp, p0 = purse(g)
        const ev = run(g, 'buy')
        ok(ev.some(e => e.type === 'levelup' && e.trained && e.lvl === 2), 'training at the threshold did not raise a level')
        ok(g.party[0].maxHp === hpB + CFG.lvlHp && g.party[0].xp === 0, 'training did not spend the XP it was paid in')
        ok(p0 - purse(g) === CFG.trainCost * 2, `training price must be 100 x next level (200), paid ${p0 - purse(g)}`)
    }
    // ALCHEMIST: potions for gold
    {
        const g = makeRun()
        step(g, 'enter-A')
        const p0 = purse(g)
        const ev = run(g, 'buy')
        ok(ev.some(e => e.type === 'buyPotion') && g.potions === 2 && p0 - purse(g) === CFG.potionCost, 'the alchemist did not sell a vial at list')
    }
    // WIPE: bodies to the RIM, half the purse per hero, tax booked
    {
        const g = makeRun()
        run(g, 'down')
        const amb = g.map.ambushes[0]
        g.x = amb.x; g.y = amb.y; g.mode = 'map'
        g.party.forEach(h => { h.gold += 41; g.ledger.goldIn += 41 })
        const per = g.party.map(h => h.gold)
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'TROLL', name: 'Wipe Machine', art: 'troll', hp: 9999, maxHp: 9999, atk: 99, def: 99, spd: 9, xp: 0 }] }
        let t = 0
        while (g.mode === 'combat' && t++ < 40) step(g, 'attack')
        ok(g.mode === 'town' && g.wipe, `a total party kill must carry the bodies to the RIM, got mode=${g.mode}`)
        const wantLost = per.reduce((n, v) => n + Math.floor(v / CFG.wipeTax), 0)
        const evW = g.events.find(e => e.type === 'wipe')
        ok(evW && evW.lost === wantLost, `the dead-body tax misbooked: lost=${evW ? evW.lost : 'none'} want=${wantLost}`)
        ok(g.ledger.goldSpent >= wantLost, 'the tax was not booked into the gold ledger')
    }
    // broke AND fallen: the run truly ends
    {
        const g = makeRun()
        run(g, 'down')
        g.party.forEach(h => { h.gold = 0 })
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'TROLL', name: 'Ruination', art: 'troll', hp: 9999, maxHp: 9999, atk: 99, def: 99, spd: 9, xp: 0 }] }
        let t = 0
        while (g.mode === 'combat' && t++ < 40) step(g, 'attack')
        ok(g.mode === 'over' && g.end === 'dead', `dead with an empty purse must end the run, got ${g.mode}/${g.end}`)
    }
    // strict runs (the proofs) have NO second life
    {
        const g = makeRun({ strict: true })
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'TROLL', name: 'Strict Reaper', art: 'troll', hp: 9999, maxHp: 9999, atk: 99, def: 99, spd: 9, xp: 0 }] }
        let t = 0
        while (g.mode === 'combat' && t++ < 40) step(g, 'attack')
        ok(g.end === 'dead', 'a strict run got the temple bargain — the proof grew a second life')
    }
    // money is conserved through an honest cycle: walk onto an ambush, get
    // wiped, and every coin must still balance between purse and ledger
    {
        const g = makeRun()
        run(g, 'down')
        // BFS on the live map, walked with real commands — no teleporting.
        // Target the FARTHEST ambush; heroes walk it at 3 hp (a player who
        // over-reaches with a broken company pays with bodies, not gold).
        const bfs = (tx, ty) => {
            const prev = new Map([[g.y * SIZE + g.x, null]])
            const q = [[g.x, g.y]]
            while (q.length && !prev.has(ty * SIZE + tx)) {
                const [cx, cy] = q.shift()
                for (let d = 0; d < 4; d++) {
                    const nx = cx + DXC[d], ny = cy + DYC[d]
                    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || g.map.wall(nx, ny) || prev.has(ny * SIZE + nx)) continue
                    prev.set(ny * SIZE + nx, { from: cy * SIZE + cx, d })
                    q.push([nx, ny])
                }
            }
            const k = ty * SIZE + tx
            if (!prev.has(k)) return null
            const out = []
            for (let kk = k; prev.get(kk) !== null; kk = prev.get(kk).from) out.unshift(prev.get(kk).d)
            return out
        }
        let path = null
        for (const a of g.map.ambushes) {
            const pth = bfs(a.x, a.y)
            if (pth && (!path || pth.length > path.length)) path = pth
        }
        ok(!!path, 'no ambush is reachable from the entrance — the RIM economy has no source')
        for (const d of path) {
            if (g.mode === 'town' || g.wipe || g.end) break
            if (g.mode === 'map') for (const h of g.party) if (h.alive) h.hp = Math.min(h.hp, 3)
            if (g.mode !== 'map') continue
            let delta = (d - g.dir + 4) % 4
            while (delta-- > 0) step(g, 'right')
            step(g, 'fwd')
            let t = 0
            while (g.mode === 'combat' && t++ < 40) step(g, 'attack')
        }
        ok(g.mode === 'town' && g.wipe, `the wounded walk did not end in a RIM wipe (${g.mode}/${g.end})`)
        const inLedger = g.ledger.goldIn, spent = g.ledger.goldSpent
        ok(inLedger - spent === purse(g), `coins must live in the purse or in the ledger: in=${inLedger} spent=${spent} purse=${purse(g)}`)
        ok(g.ledger.goldIn > 120 || g.ledger.tx.length > 0, 'the wipe happened before any coin was printed — an empty economy proves nothing')
        step(g, 'enter-T')
        g.town.hero = g.party.findIndex(h => !h.alive)
        ok(g.town.hero >= 0, 'a wipe with no fallen hero? the TPK machine failed')
        if (purse(g) >= CFG.hireCost) {
            run(g, 'buy')
            ok(inLedger - g.ledger.goldSpent === purse(g), 'the hire broke gold conservation')
        }
    }
    // hashes see the purse and the street — determinism covers the surface too
    {
        const a = makeRun(), b = makeRun()
        ok(stateHash(a) === stateHash(b), 'two fresh RIM streets hash differently')
        b.party[0].gold += 1
        ok(stateHash(a) !== stateHash(b), 'stateHash ignores the purse')
        const c = makeRun()
        step(c, 'enter-T')
        ok(stateHash(c) !== stateHash(makeRun()), 'stateHash ignores where you stand in town')
    }
}

section('PEOPLE & SPELLS — races, classes, alignments, spells-by-level (stage 3 of #1127)')
{
    // 1. the table: 5 races / 3 ways / 5 classes; every ladder letter names a
    //    real spell; the DURROW ban is honest and named
    ok(Object.keys(RACES).length === 5 && ALIGN_ORDER.length === 3 && Object.keys(CLASSES).length === 5, 'the people table is not 5/3/5')
    ok(RACES.DURROW.bans && RACES.DURROW.bans.includes('MAGUS'), 'the stoneborn ban on MAGUS vanished — Wizardry keeps its exclusives')
    for (const [cid, c] of Object.entries(CLASSES)) {
        for (const [id, lvl] of Object.entries(c.spells)) {
            ok(!!SPELLS[id], `${cid} ladder names ${id}, which is no spell`)
            ok(Number.isInteger(lvl) && lvl >= 1, `${cid}.${id} unlock level is not a whole level`)
        }
    }
    ok(CLASSES.MAGUS.spells.firebolt === 1 && CLASSES.MAGUS.spells.firestorm === 5, 'the MAGUS ladder drifted (firebolt L1, firestorm L5)')
    ok(Object.keys(CLASSES.FECHT.spells).length === 0 && Object.keys(CLASSES.FOOTPAD.spells).length === 0, 'steel learned a letter — fighters and footpads never cast')

    // 2. spells by LEVEL: the ladder arrives with the level, not free with MP
    {
        const g = makeRun()
        const ms = g.party.find((p) => p.name === 'MIRABEL')
        ok(ms.cls === 'MAGUS' && canCast(ms, 'firebolt') && !canCast(ms, 'firestorm'), 'a level-1 MAGUS does not hold exactly firebolt')
        ms.lvl = 5
        ok(canCast(ms, 'firestorm'), 'firebolt L1 and firestorm L5 did not unlock at the threshold')
        ms.lvl = 1
        ok(!canCast(ms, 'firestorm'), 'firestorm came back down with the level')
    }
    // 3. the class gate at the round table: a FECHT with a full spirit still
    //    owns no book — the command is refused before any round burns
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Auditor', art: 'rat', hp: 99, maxHp: 99, atk: 1, def: 99, spd: 1, xp: 0 }] }
        for (const p of g.party) { if (p.cls !== 'FECHT') p.mp = 0; else p.mp = 99 }
        const ev = run(g, 'cast firebolt')
        ok(ev.some((e) => e.type === 'noLetter') && g.combat.round === 0, 'a wizardless company cast firebolt anyway — the class ladder is a decoration')
    }
    // 4. GUARD: a held shield halves what it eats (floor 1) and the ledger
    //    stays exact against observed HP
    {
        const probeGuard = () => {
            const g = makeRun()
            g.mode = 'combat'
            g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'TROLL', name: 'Club', art: 'troll', hp: 999, maxHp: 999, atk: 13, def: 5, spd: 9, xp: 0 }] }
            g.party.forEach((p) => { p.spd = 1; p.def = 5 })
            const before = g.party.reduce((n, p) => n + p.hp, 0)
            run(g, 'guard')
            const after = g.party.reduce((n, p) => n + p.hp, 0)
            return before - after === 4 && g.ledger.taken === 4   // raw 13-5=8 -> half 4
        }
        ok(probeGuard(), 'the held shield does not halve a troll club 8 -> 4')
    }
    // 5. WARD: blinds the dark for three rounds, and it EXPIRES
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'SKELET', name: 'Blind Blade', art: 'skelet', hp: 999, maxHp: 999, atk: 16, def: 4, spd: 1, xp: 0 }] }
        g.party.forEach((p) => { p.spd = 5; p.def = 4 })
        const ms = g.party.find((p) => p.name === 'MIRABEL')
        ms.lvl = 7   // WARD is a MAGUS L7 letter
        const hp0 = g.party.reduce((n, p) => n + p.hp, 0)
        run(g, 'cast ward')
        const hp1 = g.party.reduce((n, p) => n + p.hp, 0)
        ok(g.ward === 2 && hp0 - hp1 === 6, `ward round should eat half of 12 (=6), took ${hp0 - hp1} (ward=${g.ward})`)
        run(g, 'attack')
        run(g, 'attack')
        const hp3 = g.party.reduce((n, p) => n + p.hp, 0)
        ok(hp1 - hp3 === 6 + 6, `the ward must cover rounds 2-3 at half (${hp1 - hp3})`)
        run(g, 'attack')
        const hp4 = g.party.reduce((n, p) => n + p.hp, 0)
        ok(g.ward === 0 && hp3 - hp4 === 12, `the ward overstayed its welcome (loss ${hp3 - hp4}, want full 12)`)
    }
    // 6. HEEL (subdue): the mob kneels — XP paid, zero overkill booked; the
    //    King cannot be commanded to kneel, and the refusal costs nothing
    {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Turncoat', art: 'rat', hp: 12, maxHp: 12, atk: 6, def: 1, spd: 6, xp: 24 }] }
        const ms = g.party.find((p) => p.name === 'MIRABEL')
        ms.lvl = 9
        const ev = run(g, 'cast heel')
        ok(ev.some((e) => e.type === 'subdue' && e.name === 'Turncoat'), 'the rat refused to kneel')
        const round = ev.find((e) => e.type === 'round')
        ok(round && round.dSum === 11, `a subdued 12-hp rat must book exactly 11 (its remaining HP): ${round ? round.dSum : 'no round'}`)
        ok(g.ledger.taken === 0 && g.mode === 'map' && !g.combat, 'the kneeling rat still struck, or the fight did not end')
        const k = makeRun()
        k.mode = 'combat'
        k.combat = { boss: true, round: 0, mobs: [{ id: 0, key: 'KING', name: 'THE HOLLOW KING', art: 'king', hp: 340, maxHp: 340, atk: 22, def: 8, spd: 6, xp: 5000 }] }
        const kr = k.party.find((p) => p.name === 'MIRABEL')
        kr.lvl = 9
        const mpB = kr.mp
        const evK = run(k, 'cast heel')
        ok(evK.some((e) => e.type === 'noback') && k.mode === 'combat' && kr.mp === mpB, 'the Hollow King knelt, or the refusal charged MP')
    }
    // 7. alignment is a real stat: the paper recomposes when the way shifts
    {
        const body = { name: 'TEST', cls: 'CLERIC', race: 'VASK', aff: 5, hp: 30, mp: 4, atk: 8, def: 4, spd: 5 }
        const oath = compose(body, 'OATH'), ruin = compose(body, 'RUIN')
        ok(oath.def === 5 && ruin.def === 3 && ruin.atk === 10, 'alignment does not move the steel the way the table says')
        const w = compose(body, 'WANDER')
        ok(w.spd === 6 && w.atk === 8, 'WANDER is not the quick foot it claims')
    }
    // 8. THE BENCH: vacancy rules, refusal of the settled, gates, the fee
    {
        const g = makeRun()
        step(g, 'enter-T')
        const list = SERVICES.T
        ok(list.some((s) => s.id === 'create'), 'the tavern has no creation bench')
        g.town.svc = list.findIndex((s) => s.id === 'create')
        const evLive = run(g, 'open')
        ok(evLive.some((e) => e.type === 'townNo') && g.town.cand === null, 'the bench seated a settled hero')
        // post a stranger, then the bench is open for that open slot
        g.party[3].alive = false; g.party[3].hp = 0
        g.town.svc = 0
        run(g, 'sel+'); run(g, 'sel+'); run(g, 'sel+')
        run(g, 'buy')
        ok(g.party[3].fresh && g.party[3].alive, 'POST did not leave a fresh name awaiting its paper')
        ok(isVacant(g, 3) && !isVacant(g, 0), 'vacancy misread — dead/fresh/living must be exact')
        g.town.svc = list.findIndex((s) => s.id === 'create')
        const evOpen = run(g, 'open')
        ok(evOpen.some((e) => e.type === 'townOpenBench') && g.town.cand && g.town.cand.length === 6, 'the bench did not open six papers')
        ok(g.town.cand.every((c) => typeof c.pass === 'boolean'), 'papers left the bench without a gate verdict')
    }
    // 9. the bench is deterministic, and a wizardless company always finds a
    //    MAGUS among the papers
    {
        const bench = (seeded) => {
            const g = makeRun()
            step(g, 'enter-T')
            g.town.svc = SERVICES.T.findIndex((s) => s.id === 'create')
            g.party.forEach((h, i) => { if (i < 5) { h.alive = false; h.hp = 0 } })
            run(g, 'open')
            return g.town.cand.map((c) => `${c.name}/${c.race}/${c.cls}/${c.pass}`).join('|')
        }
        const a = bench(), b = bench()
        ok(a === b, `papers deal differently between identical runs:\n    ${a}\n    ${b}`)
        const six = a.split('|')
        ok(six.length === 6, 'the bench rolled away from six')
        ok(six.some((s) => s.endsWith('/true')), 'every paper failed at once — the bench dealt nothing but refusals')
        // force a magicless company: no survivor knows a letter
        const g = makeRun()
        step(g, 'enter-T')
        g.town.svc = SERVICES.T.findIndex((s) => s.id === 'create')
        g.party.forEach((h) => { h.alive = false; h.hp = 0 })
        g.party[0].alive = true; g.party[0].hp = 20; g.party[0].cls = 'FECHT'
        g.town.hero = 1
        run(g, 'open')
        ok(g.town.cand.some((c) => c.cls === 'MAGUS' && c.pass), 'a wizardless company got no MAGUS among the papers — the bench broke its promise')
    }
    // 10. FAIL stays FAIL; shift recomposes the bill of sale; ACCEPT pays the
    //     flat fee exactly once and books it in the town ledger
    {
        const g = makeRun()
        step(g, 'enter-T')
        g.party[2].alive = false; g.party[2].hp = 0
        g.town.hero = 2
        g.town.svc = SERVICES.T.findIndex((s) => s.id === 'create')
        run(g, 'open')
        g.town.cand = [{ name: 'WANNABE', cls: 'MAGUS', race: 'DURROW', aff: 14, hp: 30, mp: 10, atk: 6, def: 3, spd: 5, pass: false }]
        const p0 = purse(g)
        const ev = run(g, 'accept')
        ok(ev.some((e) => e.type === 'townNo') && g.ledger.tx.length === 0 && purse(g) === p0, 'a stoneborn MAGUS slipped past the gate')
        g.town.cand = [{ name: 'WANNABE', cls: 'FECHT', race: 'VASK', aff: 5, hp: 30, mp: 4, atk: 8, def: 4, spd: 5, pass: true }]
        run(g, 'shift+'); run(g, 'shift+')
        const cand = g.town.cand[0]
        const composed = compose(cand, ALIGN_ORDER[g.town.ali])
        const evA = run(g, 'accept')
        const cr = evA.find((e) => e.type === 'create')
        ok(cr && cr.cls === 'FECHT' && cr.ali === ALIGN_ORDER[2], 'accept did not take the chosen paper and way')
        ok(cr.hp === composed.hp && cr.atk === composed.atk && cr.def === composed.def && cr.spd === composed.spd, 'the hero who stood up differs from the paper — the composition is theatre')
        ok(cr.price === createPriceFor() && purse(g) === p0 - CFG.createCost, `the bench mischarged: ${p0} -> ${purse(g)}`)
        ok(g.ledger.tx.length === 1 && g.ledger.tx[0].id === 'create' && g.town.cand === null, 'the sale was not booked, or the bench stayed open')
        ok(!g.party[2].fresh && g.party[2].lvl === 1 && g.party[2].xp === 0, 'a created hero is not a fresh level-1 soul')
        ok(Object.keys(CLASSES[g.party[2].cls].spells).length === 0, 'a created FECHT stands holding a spellbook')
    }
    // 11. hashes and replays see the people and the bench
    {
        const a = makeRun()
        const b = makeRun()
        b.party[0].race = 'HOB'
        ok(stateHash(a) !== stateHash(b), 'stateHash ignores race')
        b.party[0].race = a.party[0].race
        b.party[0].ali = 'RUIN'
        ok(stateHash(a) !== stateHash(b), 'stateHash ignores alignment')
        b.party[0].ali = a.party[0].ali
        b.party[0].cls = 'CLERIC'
        ok(stateHash(a) !== stateHash(b), 'stateHash ignores class')
        const c = makeRun()
        step(c, 'enter-T')
        c.party[0].alive = false; c.party[0].hp = 0
        c.town.svc = SERVICES.T.findIndex((s) => s.id === 'create')
        run(c, 'open')
        ok(stateHash(c) !== stateHash(makeRun()), 'stateHash ignores the open bench')
        run(c, 'sel+'); run(c, 'shift+')
        ok(stateHash(c) !== stateHash(makeRun()), 'stateHash ignores the bench cursor/way')
    }
    // 12. gold conservation through a full hire-and-create cycle
    {
        const g = makeRun()
        g.party.forEach((h) => { h.gold += 100; g.ledger.goldIn += 100 })
        const in0 = g.ledger.goldIn
        step(g, 'enter-T')
        g.party[1].alive = false; g.party[1].hp = 0
        g.town.hero = 1
        run(g, 'buy')                                  // POST 40
        g.town.svc = SERVICES.T.findIndex((s) => s.id === 'create')
        run(g, 'open'); run(g, 'roll'); run(g, 'accept')   // CREATE 60
        ok(in0 - g.ledger.goldSpent === purse(g), `coins misplaced through hire+create: in=${in0} spent=${g.ledger.goldSpent} purse=${purse(g)}`)
        ok(g.party[1].alive && !g.party[1].fresh, 'the created hero never stood up')
    }
}
let proven = null
{
    const t0 = Date.now()
    proven = solveRun()
    ok(proven.won, `the autopilot did NOT dethrone the Hollow King: end=${proven.end}`)
    ok(proven.ticks < 60000, `the proof ran out the tick clock (${proven.ticks})`)
    ok(proven.ledger.potionsUsed >= 3, `the proof burned only ${proven.ledger.potionsUsed} potions — supplies are decoration if the campaign does not need them`)
    ok(proven.ledger.springsUsed >= 1, 'the proof never drank from a spring — MP must be a real resource')
    ok(proven.ledger.casts >= 10, `only ${proven.ledger.casts} casts — magic is decoration if the proof barely uses it`)
    ok(proven.party.some((p) => p.alive), 'the campaign was won by corpses')
    ok(proven.party.some((p) => p.lvl > 1), 'nobody levelled across ten deeps — XP is a decoration')
    ok(proven.ledger.tx.length === 0, `the proof visited THE RIM (${proven.ledger.tx.length} town services) — the campaign must win on dungeon supplies alone`)
    ok(proven.ledger.goldIn > 120, 'the proof printed no gold — RIM prices were never tested against real income')
    console.log(`  ..    ${proven.ticks} commands, dealt ${proven.ledger.dealt} taken ${proven.ledger.taken}, ${proven.ledger.potionsUsed} potions, ${proven.ledger.springsUsed} springs, ${proven.ledger.casts} casts, ${Date.now() - t0} ms`)
}

// ------------------------------------------------------------------- the slack rule ----
section('SLACK RULE — one fewer of every supply the proof consumed, and no springs at all')
{
    const lastPot = proven.ledger.potTiles[proven.ledger.potTiles.length - 1]
    const lastSpring = proven.ledger.springTiles[proven.ledger.springTiles.length - 1]
    ok(!!lastPot && !!lastSpring, `the proof recorded no supply tiles (pots=${proven.ledger.potTiles.length} springs=${proven.ledger.springTiles.length}) — slack cannot even be phrased`)
    if (!lastPot || !lastSpring) {
        console.log('\ntendeepcheck: SLACK UNPHRASABLE — the campaign consumed nothing; every supply check below is meaningless')
        fails.push('slack: no consumed supplies to remove')
        console.log(`\ntendeepcheck: ${pass}/${pass + fails.length} checks passed — ${fails.length} FAILED`)
        fails.forEach((f) => console.log(`  FAIL  ${f}`))
        process.exit(1)
    }
    const potKey = `${lastPot.floor},${lastPot.x},${lastPot.y}`
    const sprKey = `${lastSpring.floor},${lastSpring.x},${lastSpring.y}`

    const sPot = solveRun({ skipPots: [potKey] })
    ok(sPot.won, `the campaign is UNWINNABLE with the last consumed potion gone (${potKey}): end=${sPot.end}`)
    const sSpr = solveRun({ skipSprings: [sprKey] })
    ok(sSpr.won, `the campaign is UNWINNABLE with the consumed spring gone (${sprKey}): end=${sSpr.end}`)
    const sBoth = solveRun({ skipPots: [potKey], skipSprings: [sprKey] })
    ok(sBoth.won, 'the campaign is UNWINNABLE with both gone')
    console.log(`  ..    -pot(-1): ${sPot.won} · -spring(-1): ${sSpr.won} · both: ${sBoth.won} (${sBoth.ticks} ticks)`)

    const allSprings = []
    for (let fi = 0; fi < FLOORS.length; fi++) for (const p of genFloor(fi).springs) allSprings.push(`${fi},${p.x},${p.y}`)
    const sNoSpr = solveRun({ skipSprings: allSprings })
    ok(sNoSpr.won, `the campaign is UNWINNABLE with EVERY spring deleted (pure potion/MP economy must still close): end=${sNoSpr.end}`)
    console.log(`  ..    no-springs-at-all (${allSprings.length} deleted): ${sNoSpr.won ? 'WINS' : 'loses'} in ${sNoSpr.ticks} ticks`)
}

// ------------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const a = solveRun(), b = solveRun()
    ok(a.hash === b.hash && a.ticks === b.ticks && a.won, `two identical cold campaigns diverged: ${a.hash} vs ${b.hash}`)
    const g1 = makeRun(), g2 = makeRun()
    for (let t = 0; t < 120; t++) { step(g1, a.script[t]); step(g2, a.script[t]) }
    ok(stateHash(g1) === stateHash(g2), 'fresh identical states hash differently')
    g1.x = (g1.x + 1) % SIZE
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores the party position')
    const g3 = makeRun()
    g3.party[0].hp -= 1
    ok(stateHash(g3) !== stateHash(makeRun()), 'stateHash ignores party HP')
    // the recorded script replayed into a fresh run must reproduce the proof
    const g4 = makeRun()
    let t = 0
    while (!g4.end && t < a.script.length) step(g4, a.script[t++])
    ok(g4.end === 'win', `the recorded command stream replayed to ${g4.end}, not win`)
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest probe red')

    const mut = (name, patch, probe) => {
        const base = probe()
        ok(base === true, `mutation harness broken: baseline for '${name}' is not true (${base})`)
        const save = {}
        for (const k of Object.keys(patch)) save[k] = CFG[k]
        Object.assign(CFG, patch)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === true ? 'SURVIVED (BAD)' : 'caught by a probe'}`)
        ok(v !== true, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // 1. the damage floor off — tin-can mobs become immortal and the ledger lies
    mut('dmgFloor 1 -> 0 (steel stops biting)', { dmgFloor: 0 }, () => {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Tin Rat', art: 'rat', hp: 50, maxHp: 50, atk: 1, def: 99, spd: 1, xp: 0 }] }
        run(g, 'attack')
        return g.ledger.dealt >= CFG.dmgFloor && g.ledger.dealt >= 1
    })

    // 2. potions stop healing — the slack ledger becomes fiction
    mut('potionHeal 26 -> 0 (vintage vinegar)', { potionHeal: 0 }, () => {
        const g = makeRun()
        g.party[0].hp = 1
        g.potions = 2
        const ev = run(g, 'potion')
        return g.party[0].hp > 1 && ev.some((e) => e.type === 'potion' && e.got > 0)
    })

    // 3. springs stop restoring MP — the campaign's only renewable fuel is a lie
    mut('springMp 14 -> 0 (a dry spring)', { springMp: 0 }, () => {
        const g = makeRun()
        step(g, 'down')
        const s = g.map.springs[0]
        g.x = s.x; g.y = s.y
        for (const p of g.party) p.mp = 0
        run(g, 'use')
        return g.party.every((p) => p.mp === Math.min(p.maxMp, CFG.springMp)) && g.party.some((p) => p.mp > 0)
    })

    // 4. XP stops arriving — the campaign out-levels the party and loses
    mut('xpBase 130 -> 10^9 (grinding is a myth)', { xpBase: 1e9 }, () => {
        const r = solveRun({})
        return r.won && r.party.some((p) => p.lvl > 1)
    })

    // 5. hires go free — the RIM economy is a giveaway and death has no cost
    mut('hireCost 40 -> 0 (a free corps of hires)', { hireCost: 0 }, () => {
        const g = makeRun()
        g.party[3].alive = false; g.party[3].hp = 0
        step(g, 'enter-T')
        g.town.hero = 3
        run(g, 'buy')
        return purse(g) === 120 - CFG.hireCost && purse(g) < 120
    })

    // 6. fleeing becomes free — the retreat contract dies
    mut('fleeCost 6 -> 0 (a free walk away)', { fleeCost: 0 }, () => {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Rear-Scout Rat', art: 'rat', hp: 999, maxHp: 999, atk: 1, def: 99, spd: 1, xp: 0 }] }
        const ev = run(g, 'flee')
        const fh = ev.find((e) => e.type === 'fleeHit')
        return !!fh && fh.d === CFG.fleeCost && fh.d > 0
    })

    // 7. the shield stops halving — the guard contract dies
    mut('guardDiv 2 -> 1 (a shield made of air)', { guardDiv: 1 }, () => {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'TROLL', name: 'Club', art: 'troll', hp: 999, maxHp: 999, atk: 13, def: 5, spd: 9, xp: 0 }] }
        g.party.forEach((p) => { p.spd = 1; p.def = 5 })
        const b = g.party.reduce((n, p) => n + p.hp, 0)
        run(g, 'guard')
        return b - g.party.reduce((n, p) => n + p.hp, 0) === 4
    })

    // 8. the MAGUS ladder forgets its levels — firestorm for every novice
    {
        const base = (() => { const g = makeRun(); return !canCast(g.party.find((p) => p.name === 'MIRABEL'), 'firestorm') })()
        ok(base === true, 'mutation harness broken: baseline for ladder drift is not true')
        const save = CLASSES.MAGUS.spells.firestorm
        CLASSES.MAGUS.spells.firestorm = 1
        const v = canCast(makeRun().party.find((p) => p.name === 'MIRABEL'), 'firestorm')
        CLASSES.MAGUS.spells.firestorm = save
        console.log(`  mut MAGUS ladder firestorm 5 -> 1 (novice pyromancy): ${v ? 'caught by a probe' : 'SURVIVED (BAD)'}`)
        ok(v, 'ladder drift SURVIVED — spells-by-level became a decoration')
    }
}

console.log(`\ntendeepcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
