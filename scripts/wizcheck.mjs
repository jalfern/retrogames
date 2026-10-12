// WIZARDRY — the Node gate. No browser, no dev server. This file is the
// reason the attract demo is a PROVEN campaign and not theatre, and the
// reason the maze cannot be a lie: the generator never referees its own
// work — wizcheck re-proves reachability with its own BFS.
//
//   npm run wizcheck             # audit + pins + proven run + slack + determinism
//   npm run wizcheck -- --mutate # re-break the load-bearing rules; every
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
import { CFG, makeRun, step, stateHash, SIZE, xpNext } from '../src/games/Wizardry/sim.js'
import { genFloor, FLOORS, MOBS } from '../src/games/Wizardry/dungeon.js'
import { solveRun } from '../src/games/Wizardry/solver.js'

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
for (const f of ['sim.js', 'dungeon.js', 'solver.js']) {
    const raw = readFileSync(join(HERE, '../src/games/Wizardry', f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — the dungeon may never be luck`)
}
const realRandom = Math.random
Math.random = () => { throw new Error('Math.random called during gen/solve') }
let froze = false
try {
    for (let i = 0; i < 3; i++) genFloor(i)
    const g = makeRun()
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
    // 8. FLEE: costs the rear guard, returns to the map; the Lich refuses.
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
        g.combat = { boss: true, round: 0, mobs: [{ id: 0, key: 'LICH', name: 'THE LICH', art: 'lich', hp: 99, maxHp: 99, atk: 1, def: 0, spd: 1, xp: 0 }] }
        const ev2 = run(g, 'flee')
        ok(ev2.some((e) => e.type === 'noback') && g.mode === 'combat', 'the Lich let the party run')
    }
    // 9. STAIRS AND THRONE: use descends, the throne wakes the campaign's end.
    {
        const g = makeRun()
        const s = g.map.stairs
        g.x = s.x; g.y = s.y
        const ev = run(g, 'use')
        ok(ev.some((e) => e.type === 'descend' && g.floor === 1), `stairs did not descend: floor=${g.floor}`)
        const g3 = makeRun()
        const th = genFloor(2).throne
        g3.map = genFloor(2)
        const dirs = [[1, 0, 2], [-1, 0, 0], [0, 1, 3], [0, -1, 1]]
        const near = dirs.find(([dx, dy]) => !g3.map.wall(th.x + dx, th.y + dy))
        ok(!!near, 'the throne has no open neighbour — unwinnable geometry')
        g3.x = th.x + near[0]; g3.y = th.y + near[1]; g3.dir = near[2]
        run(g3, 'fwd')
        ok(g3.mode === 'combat' && g3.combat && g3.combat.boss, 'stepping up to the throne did not start the Lich fight')
    }
    // 10. MOVEMENT: back is the reverse, walls refuse, fire/heal cost MP honestly.
    {
        const g = makeRun()
        const b = { x: g.x, y: g.y }
        run(g, 'fwd')
        ok(g.x !== b.x || g.y !== b.y, 'fwd from the entrance refused (the entrance corridor must open somewhere)')
        run(g, 'back')
        ok(g.x === b.x && g.y === b.y, `back did not reverse fwd: (${g.x},${g.y}) want (${b.x},${b.y})`)
        const caster = [...g.party].sort((a, b2) => b2.mp - a.mp)[0]
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Volunteer', art: 'rat', hp: 999, maxHp: 999, atk: 1, def: 99, spd: 1, xp: 0 }] }
        const mpB = caster.mp
        run(g, 'fire')
        ok(caster.mp === mpB - CFG.fireCost, `FIREBOLT cost ${mpB - caster.mp}, want ${CFG.fireCost}`)
        const hurt = g.party.find((p) => p.name === 'BORAM')
        hurt.hp = 5
        const mpTot = g.party.reduce((n, p) => n + p.mp, 0)
        const before = g.party.map((p) => p.hp)
        run(g, 'heal')
        ok(g.party.reduce((n, p) => n + p.mp, 0) === mpTot - CFG.healCost, `heal did not spend exactly ${CFG.healCost} MP in total`)
        ok(g.party.some((p, i) => p.hp > before[i]), 'heal did not mend anyone — the mob merely bit while nobody healed')
    }
}

// ------------------------------------------------------------------- the proven run ----
section('THE PROVEN CAMPAIGN (the attract demo replays this solver live)')
let proven = null
{
    const t0 = Date.now()
    proven = solveRun()
    ok(proven.won, `the autopilot did NOT kill the Lich: end=${proven.end}`)
    ok(proven.ticks < 60000, `the proof ran out the tick clock (${proven.ticks})`)
    ok(proven.ledger.potionsUsed >= 3, `the proof burned only ${proven.ledger.potionsUsed} potions — supplies are decoration if the campaign does not need them`)
    ok(proven.ledger.springsUsed >= 1, 'the proof never drank from a spring — MP must be a real resource')
    ok(proven.ledger.casts >= 10, `only ${proven.ledger.casts} casts — magic is decoration if the proof barely uses it`)
    ok(proven.party.some((p) => p.alive), 'the campaign was won by corpses')
    ok(proven.party.some((p) => p.lvl > 1), 'nobody levelled across three floors — XP is a decoration')
    console.log(`  ..    ${proven.ticks} commands, dealt ${proven.ledger.dealt} taken ${proven.ledger.taken}, ${proven.ledger.potionsUsed} potions, ${proven.ledger.springsUsed} springs, ${proven.ledger.casts} casts, ${Date.now() - t0} ms`)
}

// ------------------------------------------------------------------- the slack rule ----
section('SLACK RULE — one fewer of every supply the proof consumed, and no springs at all')
{
    const lastPot = proven.ledger.potTiles[proven.ledger.potTiles.length - 1]
    const lastSpring = proven.ledger.springTiles[proven.ledger.springTiles.length - 1]
    ok(!!lastPot && !!lastSpring, `the proof recorded no supply tiles (pots=${proven.ledger.potTiles.length} springs=${proven.ledger.springTiles.length}) — slack cannot even be phrased`)
    if (!lastPot || !lastSpring) {
        console.log('\nwizcheck: SLACK UNPHRASABLE — the campaign consumed nothing; every supply check below is meaningless')
        fails.push('slack: no consumed supplies to remove')
        console.log(`\nwizcheck: ${pass}/${pass + fails.length} checks passed — ${fails.length} FAILED`)
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

    // 5. fleeing becomes free — the retreat contract dies
    mut('fleeCost 6 -> 0 (a free walk away)', { fleeCost: 0 }, () => {
        const g = makeRun()
        g.mode = 'combat'
        g.combat = { boss: false, round: 0, mobs: [{ id: 0, key: 'RAT', name: 'Rear-Scout Rat', art: 'rat', hp: 999, maxHp: 999, atk: 1, def: 99, spd: 1, xp: 0 }] }
        const ev = run(g, 'flee')
        const fh = ev.find((e) => e.type === 'fleeHit')
        return !!fh && fh.d === CFG.fleeCost && fh.d > 0
    })
}

console.log(`\nwizcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
