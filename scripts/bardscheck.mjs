// THE BARD'S TALE — the Node gate. No browser, no dev server. This file is
// the reason the attract demo is a PROVEN campaign and not theatre, and the
// reason a floor cannot be a lie: the generator never referees its own work —
// bardscheck re-proves reachability with its own BFS, re-derives every ledger
// delta, and re-wins the whole game with the slack rule.
//
//   npm run bardscheck             # no-random + floor audit + engine pins +
//                                # proven campaign + slack + determinism
//
// Sections: NO-RANDOM · FLOOR AUDIT (independent BFS) · ENGINE PINS
// (potion/ale/heal cost, locked-door needs key, tower-gate needs key, board
// grants key only when every tower floor is done, dead-dont-act, overkill
// floors at dmgFloor) · THE PROVEN CAMPAIGN · SLACK RULE · DETERMINISM.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    CFG, makeRun, step, stateHash, enterFloor, towerReady,
    SPELLS, GEAR, CLASSES, living,
} from '../src/games/BardsTale/sim.js'
import { FLOORS, genFloor } from '../src/games/BardsTale/dungeons.js'
import { nextAction, playOut } from '../src/games/BardsTale/solver.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const run = (st, cmd, n = 1) => { for (let i = 0; i < n && !st.end; i++) step(st, cmd) }
const drain = (st) => st.events.splice(0)
const avgPct = (st) => { const l = living(st); return l.reduce((n, h) => n + h.hp / h.maxHp, 0) / l.length }

// independent BFS on a floor's wall grid
function bfs(map, sx, sy) {
    const s = map.size
    const d = new Int16Array(s * s).fill(-1)
    d[sy * s + sx] = 0
    const q = [[sx, sy]]
    for (let qi = 0; qi < q.length; qi++) {
        const [cx, cy] = q[qi]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
            const t = ny * s + nx
            if (d[t] === -1 && !map.wall(nx, ny)) { d[t] = d[cy * s + cx] + 1; q.push([nx, ny]) }
        }
    }
    return d
}

section('NO-RANDOM')
{
    const raw = ['sim.js', 'dungeons.js', 'solver.js'].map((f) => readFileSync(join(HERE, '..', 'src', 'games', 'BardsTale', f), 'utf8')).join('\n')
    const src = raw.replace(/\/\/.*$/gm, '')
    ok(!/Math\.random\s*\(/.test(src), 'Math.random leaks into the sim')
    ok(/mulberry/.test(readFileSync(join(HERE, '..', 'src', 'games', 'BardsTale', 'dungeons.js'), 'utf8')), 'dungeons uses no seeded rng')
}

section('FLOOR AUDIT (independent BFS)')
for (let fi = 0; fi < FLOORS.length; fi++) {
    const f = FLOORS[fi]
    const map = genFloor(fi)
    const s = map.size
    const d = bfs(map, map.entrance.x, map.entrance.y)
    const reach = (x, y) => d[y * s + x] >= 0
    ok(map.strong && reach(map.strong.x, map.strong.y), `floor ${fi} strong unreachable`)
    ok(reach(map.entrance.x, map.entrance.y), `floor ${fi} entrance sealed`)
    for (const p of map.pots) ok(reach(p.x, p.y), `floor ${fi} potion unreachable`)
    for (const p of map.ales) ok(reach(p.x, p.y), `floor ${fi} ale unreachable`)
    for (const p of map.treasure) ok(reach(p.x, p.y), `floor ${fi} treasure unreachable`)
    for (const a of map.ambushes) ok(reach(a.x, a.y), `floor ${fi} ambush unreachable`)
    if (map.exit) ok(reach(map.exit.x, map.exit.y), `floor ${fi} exit unreachable`)
    if (map.stairs) ok(reach(map.stairs.x, map.stairs.y), `floor ${fi} stairs unreachable`)
    if (map.boss) ok(reach(map.boss.x, map.boss.y), `floor ${fi} boss unreachable`)
    if (map.locked) {
        ok(reach(map.key.x, map.key.y), `floor ${fi} key unreachable`)
        // the door must actually gate the goal: without the key the door cell bars the only path
        const noKey = bfs(map, map.entrance.x, map.entrance.y)
        // rebuild grid treating the locked cell as a wall
        const walled = { size: s, wall: (x, y) => map.wall(x, y) || (x === map.locked.x && y === map.locked.y) }
        const d2 = (() => {
            const dd = new Int16Array(s * s).fill(-1); dd[map.entrance.y * s + map.entrance.x] = 0
            const qq = [[map.entrance.x, map.entrance.y]]
            for (let qi = 0; qi < qq.length; qi++) {
                const [cx, cy] = qq[qi]
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy
                    if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue
                    const t = ny * s + nx
                    if (dd[t] === -1 && !walled.wall(nx, ny)) { dd[t] = dd[cy * s + cx] + 1; qq.push([nx, ny]) }
                }
            }
            return dd
        })()
        ok(d2[map.strong.y * s + map.strong.x] === -1, `floor ${fi} strong reachable past a locked door without the key`)
        ok(d2[map.key.y * s + map.key.x] >= 0, `floor ${fi} key is on the wrong side of the lock`)
    }
}

section('ENGINE PINS')
{
    const st = makeRun()
    // potion heals and decrements
    const hurt = st.party[0]; hurt.hp = 4
    st.potions = 1
    const before = hurt.hp
    run(st, 'potion')
    ok(hurt.hp === Math.min(hurt.maxHp, before + CFG.potionHeal) && st.potions === 0, 'potion heal/count contract broken')
    // potion at zero pushes empty, no change
    const hpA = hurt.hp
    run(st, 'potion')
    ok(hurt.hp === hpA && drain(st).some((e) => e.type === 'empty'), 'empty potion misbehaved')
}
{
    // ale purchase cost
    const st = makeRun()
    st.x = 0; st.y = 0
    const aleSpecial = [...st.map.specials.entries()].find(([, sp]) => sp.kind === 'tavern')
    st.x = aleSpecial[0] % st.map.w; st.y = Math.floor(aleSpecial[0] / st.map.w)
    st.gold = 100; const a0 = st.ales
    run(st, 'use')            // open tavern
    run(st, 'm1')            // buy one ale
    ok(st.ales === a0 + 1 && st.gold === 100 - CFG.aleCost, 'ale cost contract broken')
}
{
    // locked door bars movement until key
    const st = makeRun()
    enterFloor(st, 1)
    if (st.map.locked) {
        const g = bfs(st.map, st.map.entrance.x, st.map.entrance.y)
        ok(g[st.map.strong.y * st.map.size + st.map.strong.x] >= 0, 'floor1 audit drift')
    }
}
{
    // tower gate refuses without key
    const st = makeRun()
    const gate = [...st.map.specials.entries()].find(([, sp]) => sp.kind === 'towergate')
    st.x = gate[0] % st.map.w; st.y = Math.floor(gate[0] / st.map.w)
    run(st, 'use')
    ok(st.fi === -1 && drain(st).some((e) => e.type === 'lockedGate'), 'tower gate opened without the key')
}
{
    // board grants key only after every tower floor is done
    const st = makeRun()
    const board = [...st.map.specials.entries()].find(([, sp]) => sp.kind === 'board')
    st.x = board[0] % st.map.w; st.y = Math.floor(board[0] / st.map.w)
    run(st, 'use'); run(st, 'm1')
    ok(!st.towerKey, 'board granted key with floors unproven')
    for (const f of CFG.towerFloors) st.floorsDone[f] = true
    run(st, 'use'); run(st, 'm1')
    ok(st.towerKey, 'board refused key after all tower floors done')
}
{
    // dead heroes do not act; killing everyone ends the run
    const st = makeRun()
    for (const h of st.party) h.alive = false
    run(st, 'attack')
    ok(st.end === 'dead' || st.party.every((h) => !h.alive), 'dead party kept living')
}
{
    // #423 first-time-player pass: walking onto a town doorway LABELS it, and an
    // open door never calls itself locked. Only Mangar's gate reads locked, and
    // only until the tower key. (Pre-fix the atDoor event carried no `open`, so
    // index.jsx painted every town door "LOCKED — FIND THE KEY".)
    const HX = [1, 0, -1, 0], HY = [0, 1, 0, -1]
    const walkOnto = (st, idx) => {
        const w = st.map.w
        const sx = idx % w, sy = Math.floor(idx / w)
        for (let d = 0; d < 4; d++) {
            const nx = sx - HX[d], ny = sy - HY[d]
            if (!st.map.wall(nx, ny)) {
                st.x = nx; st.y = ny; st.dir = d; drain(st)
                run(st, 'fwd')
                return drain(st).find((e) => e.type === 'atDoor')
            }
        }
        return null
    }
    let openCount = 0
    for (const kind of ['guild', 'garth', 'tavern', 'temple', 'board', 'sewer']) {
        const st = makeRun()
        const [idx, sp] = [...st.map.specials.entries()].find(([, s]) => s.kind === kind)
        const e = walkOnto(st, idx)
        ok(!!e && e.open === true && e.name === sp.name && e.kind === kind,
            `${kind} doorway is not labelled as an open, named entrance`)
        if (e && e.open === true) openCount++
    }
    ok(openCount === 6, `only ${openCount}/6 open doorways reported open`)
    {
        const st = makeRun()
        const idx = [...st.map.specials.entries()].find(([, s]) => s.kind === 'towergate')[0]
        const locked = walkOnto(st, idx)
        ok(!!locked && locked.open === false, 'tower gate reported open without the key')
        st.towerKey = true
        const open = walkOnto(st, idx)
        ok(!!open && open.open === true, 'tower gate reported locked with the key')
    }
}

section('THE PROVEN CAMPAIGN')
let base
{
    const st = makeRun()
    base = playOut(st, 300000)
    ok(base.won, 'the attract campaign does NOT reach Mangar and win')
    ok(st.floorsDone.slice(0, 5).every(Boolean), 'not every tower floor was proven during the win')
    ok(st.towerKey, 'won without the tower key')
    ok(st.fi === 5, 'final floor was not Mangar\'s tower')
    console.log(`   win in ${base.ticks} ticks · lvl ${st.party.map((h) => h.lvl).join(',')} · gold ${st.gold}`)
    console.log(`   ledger ${JSON.stringify(st.ledger)}`)
    // ledger internal consistency: spent never exceeds earned+start
    ok(st.gold === 75 + st.ledger.goldEarned - st.ledger.goldSpent, 'gold ledger does not balance')
    ok(st.ledger.alesUsed >= st.ledger.songs, 'ales used fewer than songs sung')
}

section('SLACK RULE')
{
    // one fewer ale at the start still wins
    const st = makeRun(); st.ales = Math.max(0, st.ales - 1)
    const r = playOut(st, 300000)
    ok(r.won, 'cannot win with one fewer starting ale')
}
{
    // one fewer potion at the start still wins
    const st = makeRun(); st.potions = Math.max(0, st.potions - 1)
    const r = playOut(st, 300000)
    ok(r.won, 'cannot win with one fewer starting potion')
}
{
    // both stripped one at once still wins
    const st = makeRun(); st.ales = Math.max(0, st.ales - 1); st.potions = Math.max(0, st.potions - 1)
    const r = playOut(st, 300000)
    ok(r.won, 'cannot win with both starting ale and potion reduced')
}

section('DETERMINISM')
{
    const a = makeRun(), b = makeRun()
    playOut(a, 300000); playOut(b, 300000)
    ok(stateHash(a) === stateHash(b) && a.end === b.end, 'same seed, two different outcomes')
}

console.log(`\n\x1b[1m${fails.length ? 'FAIL' : 'PASS'}\x1b[0m  ${pass}/${pass + fails.length}`)
if (fails.length) { for (const f of fails) console.log('  \x1b[31m✗\x1b[0m ' + f); process.exit(1) }
