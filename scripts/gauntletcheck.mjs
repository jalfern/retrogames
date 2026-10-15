// gauntletcheck — GAUNTLET in plain Node, no browser.
//   geometry  : every prop, door, key and the stairs sit where they can be
//               reached; the exit pocket needs a key (unreachable without one);
//               keys >= locks on every level.
//   rules     : slam door opens on push, SLAMS behind and can be battered
//               open; locked door eats a key and refuses without one; food
//               heals, the drain ticks; potion clears roamers but NOT Death
//               and pays the cleared monsters; a smashed generator stops
//               spawning; Death spawns on the timer and drains; stairs clear
//               the level and the fourth clear ends the quest.
//   ledger    : final score == sum of scored events, pilot run included.
//   pilot     : seeds 0-3 clear all four mazes; 2/3 do it deathless;
//   slack     : the quest is re-won with one fewer food AND one fewer potion
//               per maze.
//   determinism : same seed twice -> identical digest.
// `-- --mutate` re-plants four fixed bugs in child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { LEVELS, W, H, MONSTERS } = await import('../src/games/Gauntlet/levels.js')

async function fresh() {
    const sim = await import(`../src/games/Gauntlet/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/Gauntlet/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan, decide: planner.decide }
}
const S = await fresh()
const { makeGame, step, stateHash } = S

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
const bfs = (lv, sr, sc, throughLocks) => {
    const seen = new Set()
    const q = [[sr, sc]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = r * W + c
        if (seen.has(k)) continue
        const ch = lv.grid[r][c]
        if (ch === '#' || (ch === 'L' && !throughLocks)) continue
        seen.add(k)
        q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
    return seen
}
for (const lv of LEVELS) {
    const sNoLock = bfs(lv, Math.floor(lv.start.y), Math.floor(lv.start.x), false)
    const sAll = bfs(lv, Math.floor(lv.start.y), Math.floor(lv.start.x), true)
    const [ex, ey] = lv.exit
    ok(!sNoLock.has(ey * W + ex), `L${lv.idx + 1}: stairs are key-locked`)
    ok(sAll.has(ey * W + ex), `L${lv.idx + 1}: stairs reachable with a key`)
    const keys = lv.props.filter((p) => p[0] === 'key')
    const locks = lv.doors.filter((d) => d.lock).length
    ok(keys.length >= locks, `L${lv.idx + 1}: keys (${keys.length}) cover the locks (${locks})`)
    let keyReach = 0
    for (const [t, x, y] of lv.props) {
        const r = Math.floor(y), c = Math.floor(x)
        if (lv.grid[r][c] === '#') { ok(false, `L${lv.idx + 1}: ${t} sits in a wall`, `${c},${r}`); continue }
        if (t === 'key' && sNoLock.has(r * W + c)) keyReach++
        if (!sAll.has(r * W + c)) ok(false, `L${lv.idx + 1}: ${t} unreachable`, `${c},${r}`)
    }
    ok(keyReach >= locks, `L${lv.idx + 1}: ${keyReach} keys sit outside the locks`)
}

// ------------------------------------------------------------------ rules ----
console.log('rules')
// drain + food
{
    const gs = makeGame(0, 'warrior')
    const hp0 = gs.hero.hp
    for (let i = 0; i < 48; i++) { step(gs, {}); gs.events.length = 0 }
    ok(hp0 - gs.hero.hp >= 2, 'health drains on the clock')
    gs.hero.hp = 60
    const food = gs.items.find((it) => it.t === 'food')
    gs.hero.x = food.x; gs.hero.y = food.y
    step(gs, {})
    ok(gs.hero.hp > 60, 'food restores health')
}
// slam door: push open, slam behind, batter open
{
    const gs = makeGame(0, 'warrior')
    const d = gs.doors.find((x) => !x.locked)
    gs.hero.x = d.x + 1.5; gs.hero.y = d.y + 0.5
    gs.hero.a = Math.PI
    let opened = false
    for (let i = 0; i < 60 && !opened; i++) { step(gs, { fwd: true }); opened = d.open; gs.events.length = 0 }
    ok(opened, 'a slam door opens when you push through')
    for (let i = 0; i < 40 && Math.floor(gs.hero.x) === d.x; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    let slammed = false
    for (let i = 0; i < 120 && !slammed; i++) { step(gs, {}); slammed = !d.open && d.closeT < 0 && !d.broken; gs.events.length = 0 }
    ok(slammed, 'the slam door crashes shut behind you')
    gs.hero.x = d.x + 1.0; gs.hero.y = d.y + 0.5; gs.hero.a = Math.PI
    for (let i = 0; i < 80 && !d.broken; i++) { step(gs, { sword: i % 20 === 0 }); gs.events.length = 0 }
    ok(d.broken, 'a closed slam door can be battered open')
}
// locked door eats a key / refuses without
{
    const gs = makeGame(0, 'warrior')
    const d = gs.doors.find((x) => x.locked)
    gs.hero.x = d.x + 1.5; gs.hero.y = d.y + 0.5; gs.hero.a = Math.PI
    gs.keys = 0
    for (let i = 0; i < 40; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    ok(!d.open && !d.broken, 'a locked door refuses without a key')
    gs.keys = 1
    const before = gs.keys
    for (let i = 0; i < 60 && !d.open; i++) { step(gs, { fwd: true }); gs.events.length = 0 }
    ok(d.open && gs.keys === before - 1, 'a locked door eats exactly one key')
}
// generator: spawns while alive, silent when smashed
{
    const gs = makeGame(0, 'warrior')
    const g = gs.gens[0]
    gs.hero.x = g.x; gs.hero.y = g.y + 2
    gs.monsters = [] // the cap gates spawning; empty the hall to watch the spout
    let spawned = 0
    for (let i = 0; i < 400; i++) { spawned += gs.events.filter((e) => e.type === 'spawn').length; step(gs, {}); spawned += gs.events.filter((e) => e.type === 'spawn').length; gs.events.length = 0 }
    ok(spawned > 0, 'generators pulse monsters while alive')
    gs.hero.x = g.x + 1.2; gs.hero.y = g.y + 0.5; gs.hero.a = Math.PI
    gs.monsters = []
    for (let i = 0; i < 100 && g.alive; i++) { step(gs, { sword: i % 10 === 0 }); gs.events.length = 0 }
    ok(!g.alive, 'the generator itself can be smashed')
    gs.monsters = []
    let after = 0
    for (let i = 0; i < 600; i++) { step(gs, {}); after += gs.events.filter((e) => e.type === 'spawn').length; gs.events.length = 0 }
    ok(after === 0, 'a smashed generator never spawns again')
}
// potion clears roamers but NOT Death
{
    const gs = makeGame(0, 'warrior')
    gs.hero.hp = 20
    gs.monsters.push({ id: 9001, kind: 'death', x: gs.hero.x + 8, y: gs.hero.y, hp: MONSTERS.death.hp, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 })
    const roam0 = gs.monsters.filter((m) => m.kind !== 'death').length
    gs.deathSpawned = true
    const pot = gs.items.find((it) => it.t === 'potion')
    const score0 = gs.score
    gs.hero.x = pot.x; gs.hero.y = pot.y
    step(gs, {})
    ok(gs.monsters.filter((m) => m.kind !== 'death').length === 0 && roam0 > 0, 'a potion clears every roamer')
    ok(gs.monsters.some((m) => m.kind === 'death'), 'potion does NOT touch Death')
    ok(gs.score - score0 >= roam0 * 400, 'potion clears still pay the monsters', `+${gs.score - score0}`)
}
// Death spawns on the timer and drains
{
    const gs = makeGame(0, 'warrior')
    gs.monsters = []
    gs.gens.forEach((x) => { x.alive = false })
    gs.hero.hp = 1e9
    let t = 0
    while (!gs.deathSpawned && t++ < LEVELS[0].deathAt + 50 && !gs.end) step(gs, {}), gs.events.length = 0
    ok(gs.deathSpawned && gs.monsters.some((m) => m.kind === 'death'), 'Death walks the maze when the timer runs out')
    const death = gs.monsters.find((m) => m.kind === 'death')
    gs.hero.hp = 170
    let drained = false
    for (let i = 0; i < 80 && !drained; i++) {
        death.x = gs.hero.x + 0.3; death.y = gs.hero.y
        step(gs, {})
        drained = gs.hero.hp < 170 - 2
        gs.events.length = 0
    }
    ok(drained, 'Death drains health point by point')
}
// stairs clear the level, fourth ends the quest
{
    const gs = makeGame(0, 'warrior')
    const [ex, ey] = LEVELS[0].exit
    gs.keys = 5
    gs.hero.x = ex + 0.5; gs.hero.y = ey + 0.5
    gs.monsters = []
    let cleared = false
    for (let i = 0; i < 40 && !cleared; i++) { cleared = gs.level === 1; step(gs, { fwd: true }); gs.events.length = 0 }
    ok(cleared, 'the stairs lead to the next maze')
    gs.level = 3
    gs.levelData = LEVELS[3]
    gs.hero.x = LEVELS[3].exit[0] + 0.5; gs.hero.y = LEVELS[3].exit[1] + 0.5
    gs.keys = 5
    gs.monsters = []
    let won = false
    for (let i = 0; i < 40 && !won; i++) { step(gs, { fwd: true }); won = gs.end === 'win'; gs.events.length = 0 }
    ok(won, 'the fourth staircase ends the quest')
}
// sword cannot kill through stone
{
    const gs = makeGame(0, 'warrior')
    gs.monsters = [{ id: 9101, kind: 'grunt', x: gs.hero.x + 1.2, y: gs.hero.y - 3.6, hp: 3, atkT: 9999, castT: 9999, path: [], repathT: 0, drainT: 0 }]
    gs.hero.a = Math.atan2(-3.6, 1.2)
    const m0 = gs.monsters.length
    for (let i = 0; i < 40; i++) { step(gs, { sword: i % 20 === 0 }); gs.events.length = 0 }
    ok(gs.monsters.length === m0, 'a sword through a pillar hits nothing')
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
for (const seed of [0, 1, 2, 3]) {
    const r = S.plan(seed)
    ok(r.won, `pilot clears all four mazes (seed ${seed})`, `deaths=${r.deaths} level=${r.gs.level}`)
}
{
    const a = S.plan(2), b = S.plan(3)
    ok(a.deaths === 0 || b.deaths === 0, 'seeds 2/3 prove a deathless clear', `deaths ${a.deaths}/${b.deaths}`)
}
console.log('slack')
{
    const r = S.plan(2, { slack: true })
    ok(r.won, 'the quest is still won with one fewer food AND potion per maze', `deaths=${r.deaths}`)
}

// ---------------------------------------------------------------- ledger ----
console.log('ledger')
{
    const r = S.plan(2)
    const gs = makeGame(2, 'warrior')
    let ledger = 0, up = 20000
    for (const inp of r.script) {
        step(gs, inp)
        for (const ev of gs.events) {
            if (ev.type === 'score') {
                ledger += ev.pts
                if (ledger >= up) { up += 20000 }
            }
        }
        gs.events.length = 0
    }
    ok(ledger === r.gs.score, 'final score equals the sum of scored events', `${ledger} vs ${r.gs.score}`)
}

// ---------------------------------------------------------- determinism ----
console.log('determinism')
{
    const a = S.plan(0), b = S.plan(0)
    ok(a.hash === b.hash, 'same seed replays identically', `${a.hash} vs ${b.hash}`)
}

// ------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const SIM = 'src/games/Gauntlet/sim.js'
    const MUTANTS = [
        ['slam doors never close', 'd.closeT = CFG.slamClose', 'd.closeT = -2'],
        ['locked doors open without keys', 'if (gs.keys >= CFG.lockForce)', 'if (gs.keys >= 0 && !gs.keys)'],
        ['potion kills Death too', 'gs.monsters = gs.monsters.filter((m) => MONSTERS[m.kind].drain)', 'gs.monsters = []'],
        ['generators respawn when smashed', 'if (!g.alive) continue\n        g.t--', 'g.t--'],
        ['health never drains', 'if (gs.tick % CFG.drainEvery === 0)', 'if (gs.tick % 1000000 === 0)'],
    ]
    const orig = readFileSync(SIM, 'utf8')
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(SIM, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/gauntletcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
    }
    writeFileSync(SIM, orig)
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)
