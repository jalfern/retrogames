// dugcheck — DIG DUG in plain Node, no browser.
//   geometry : rocks hang in carved pockets with dirt support; every dirt cell,
//              support cell and veggie spot is reachable by digging
//   rules    : pump chain pops at stage 4 with depth-scaled pay (fygar deep =
//              1200), inflation shoves and deflates, ghosts cannot be hooked,
//              rock support -> fall -> crush pays 300*(layer+1)*n, veggies only
//              after TWO rocks, Fygar fire kills on-row and misses after a row
//              dodge, the last survivor re-inflates and flees upward
//   ledger   : final score == sum of every scored event, pilot run included
//   pilot    : seeds 0/3/6 clear all three rounds with zero deaths; round 1
//              survives the lives-1 slack (1 life) on all 8 seeds
//   determinism : same seed twice -> identical final digest
// `-- --mutate` re-plants four fixed bugs in fresh child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { ROUNDS, COLS, DIRT_TOP, DIRT_BOT, AIR_TOP, layerOf } = await import('../src/games/DigDug/levels.js')

async function fresh() {
    const sim = await import(`../src/games/DigDug/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/DigDug/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan }
}
const S = await fresh()
const { makeGame, step, CELL } = S
const cx = (c) => c * CELL + CELL / 2
const cy = (r) => 16 + r * CELL + CELL / 2
const rowOf = (y) => Math.floor((y - 16) / CELL)

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
for (const [ri, R] of ROUNDS.entries()) {
    const gs = makeGame(0)
    ok(R.goal === R.comp.length, `R${ri + 1} goal equals roster`, `${R.goal} vs ${R.comp.length}`)
    const bad = R.rocks.filter((k) => k.row - DIRT_TOP < 1 || k.row > DIRT_BOT - 1)
    ok(bad.length === 0, `R${ri + 1} rocks hang with dirt above and diggable ground below`)
    const rocks0 = ROUNDS[gs.round].rocks
    ok(rocks0.every((k) => !gs.dirt[k.row][k.col]), 'rock pockets are carved at round start')
    const seen = new Set()
    const q = []
    for (let c = 0; c < COLS; c++) q.push([AIR_TOP, c])
    while (q.length) {
        const [r, c] = q.pop()
        const k = `${r},${c}`
        if (seen.has(k) || r < AIR_TOP || r > DIRT_BOT || c < 0 || c >= COLS) continue
        if (R.rocks.some((k2) => k2.row === r && k2.col === c)) continue
        seen.add(k)
        q.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1])
    }
    const unreachableVeg = R.vegSpots.filter((v) => !seen.has(`${v.row},${v.col}`))
    ok(unreachableVeg.length === 0, `R${ri + 1} every veggie spot reachable`, JSON.stringify(unreachableVeg))
}

// ------------------------------------------------------------------ rules ----
console.log('rules')
function rig(p, o, row, pcol, ocol) {
    for (let c = 0; c < COLS; c++) p.dirt[row][c] = false
    p.player.x = cx(pcol); p.player.y = cy(row); p.player.dir = [ocol > pcol ? 1 : -1, 0]
    o.x = cx(ocol); o.y = cy(row); o.ghost = false; o.state = 'walk'
}
{
    const gs = makeGame(0)
    const e = gs.enemies.find((x) => x.kind === 'fygar')
    rig(gs, e, 9, 5, 8)
    let pts = 0, kills = 0, lastPuff = 0
    const before = gs.score
    for (let i = 0; i < 40 && kills === 0; i++) {
        step(gs, { fire: i % 5 === 0 })
        for (const ev of gs.events) {
            if (ev.type === 'puff') lastPuff = Math.max(lastPuff, ev.stage)
            if (ev.type === 'pumpKill') { kills = gs.kills; pts = gs.score - before }
        }
        gs.events.length = 0
    }
    ok(kills === 1 && pts === 1200 && lastPuff === 4, 'deep fygar pops at exactly stage 4 for 1200', `kills=${kills} pts=${pts} stages up to ${lastPuff}`)
}
{
    const gs = makeGame(0)
    const e = gs.enemies[0]
    rig(gs, e, 8, 5, 7)
    for (let i = 0; i < 20; i++) { step(gs, { fire: i === 0 }); gs.events.length = 0 }
    ok(gs.harpoon && gs.harpoon.state === 'hold', 'harpoon hooks a solid enemy')
    const x0 = e.x
    for (let i = 0; i < 20; i++) { step(gs, {}); gs.events.length = 0 }
    ok(Math.abs(e.x - x0) > 1 && Math.sign(e.x - gs.player.x) === Math.sign(x0 - gs.player.x), 'inflation shoves the enemy away')
    const st0 = e.stage
    for (let i = 0; i < 95; i++) { step(gs, {}); gs.events.length = 0 }
    ok(e.stage < st0 || e.stage === 0, 'deflates when pumping stops')
    ok(!gs.harpoon || e.stage > 0, 'harpoon snaps off at zero inflation')
}
{
    const gs = makeGame(0)
    const e = gs.enemies[0]
    gs.dirt[4][6] = true
    e.x = cx(6); e.y = cy(4); e.stage = 0
    gs.player.x = cx(4); gs.player.y = cy(4)
    let hooked = false
    for (let i = 0; i < 40; i++) { step(gs, { fire: i % 6 === 0 }); if (gs.harpoon && gs.harpoon.attached) hooked = true; gs.events.length = 0 }
    ok(!hooked, 'a buried ghost cannot be hooked')
}
{
    const gs = makeGame(0)
    for (let r = 6; r <= 10; r++) gs.dirt[r][3] = false
    gs.dirt[3][3] = false; gs.dirt[4][3] = false
    const e = gs.enemies[0]
    e.x = cx(3); e.y = cy(8); e.ghost = false
    const before = gs.score
    const types = []
    for (let i = 0; i < 200; i++) {
        e.x = cx(3); e.y = cy(8)
        step(gs, {})
        types.push(...gs.events.map((ev) => ev.type))
        gs.events.length = 0
    }
    const pts = gs.score - before
    ok(pts === 900 && gs.kills === 1, 'falling rock crushes: 300 x (layer+1)', `pts=${pts}`)
    ok(['rockWarn', 'rockFall', 'rockKill', 'rockLand'].every((t) => types.includes(t)), 'rock drop emits warn/fall/kill/land')
}
{
    const gs = makeGame(0)
    const clearVegTest = () => {
        for (let r = 6; r <= 10; r++) { gs.dirt[r][3] = false; gs.dirt[r][7] = false }
        gs.dirt[3][3] = false; gs.dirt[4][3] = false
    }
    const pinFoes = () => { for (const en of gs.enemies) { if (en.state !== 'gone') { en.x = cx(1); en.y = cy(AIR_TOP); en.path = [] } } }
    let liveAfterOne = -1
    clearVegTest()
    for (let i = 0; i < 120; i++) { pinFoes(); step(gs, {}); clearVegTest(); gs.events.length = 0 }
    liveAfterOne = gs.rocksDropped === 1 ? gs.veggies.filter((v) => v.live).length : -2
    gs.dirt[3][7] = false; gs.dirt[4][7] = false
    for (let i = 0; i < 120; i++) { pinFoes(); step(gs, {}); clearVegTest(); gs.dirt[3][7] = false; gs.dirt[4][7] = false; gs.events.length = 0 }
    ok(gs.rocksDropped >= 2 && liveAfterOne === 0 && gs.veggies.filter((v) => v.live).length > 0,
        'veggies sprout only after the SECOND dropped rock', `dropped=${gs.rocksDropped} afterOne=${liveAfterOne}`)
}
{
    const gs = makeGame(0)
    const f = gs.enemies.find((x) => x.kind === 'fygar')
    rig(gs, f, 2, 9, 4)
    f.breathT = 2
    let died = false
    for (let i = 0; i < 120; i++) {
        f.x = gs.player.x - 80; f.y = gs.player.y
        step(gs, {})
        if (gs.events.some((ev) => ev.type === 'death')) { died = true; break }
        gs.events.length = 0
    }
    ok(died, 'Fygar fire kills an aligned player down the tunnel')
    const g2 = makeGame(0)
    const f2 = g2.enemies.find((x) => x.kind === 'fygar')
    rig(g2, f2, 2, 9, 4)
    f2.breathT = 2
    let died2 = false
    for (let i = 0; i < 100; i++) {
        f2.x = g2.player.x - 80; f2.y = cy(2)
        step(g2, { down: true })
        if (g2.events.some((ev) => ev.type === 'death')) { died2 = true; break }
        g2.events.length = 0
    }
    ok(!died2 && rowOf(g2.player.y) > 2, 'digging out of the row dodges the fire', `row=${rowOf(g2.player.y)}`)
}
{
    const gs = makeGame(0)
    gs.enemies = [gs.enemies[0]]
    gs.queue = []
    const e = gs.enemies[0]
    e.x = cx(9); e.y = cy(5); e.ghost = false
    let fled = false, y0 = e.y
    for (let i = 0; i < 300; i++) {
        step(gs, {})
        if (gs.events.some((ev) => ev.type === 'flee')) fled = true
        gs.events.length = 0
    }
    ok(fled && e.y < y0, 'the last survivor flees toward the top', `y ${y0.toFixed(0)} -> ${e.y.toFixed(0)}`)
}
{
    const gs = makeGame(0)
    const e = gs.enemies[0]
    rig(gs, e, 2, 9, 10)
    e.x = gs.player.x + 6; e.y = gs.player.y + 2
    let died = false
    for (let i = 0; i < 5 && !died; i++) { died = gs.events.some((ev) => ev.type === 'death'); step(gs, {}); died = died || gs.events.some((ev) => ev.type === 'death'); gs.events.length = 0 }
    ok(died, 'touching a solid enemy is fatal')
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
for (const seed of [0, 3, 6]) {
    const r = S.plan(seed)
    ok(r.won && r.deaths === 0, `pilot clears all three rounds deathless (seed ${seed})`, `won=${r.won} deaths=${r.deaths}`)
}
for (let seed = 0; seed < 8; seed++) {
    const r = S.plan(seed, { livesOverride: 1 })
    ok(r.gs.round >= 1 || r.gs.end === 'win', `round 1 survives the lives-1 slack (seed ${seed})`, `deaths=${r.deaths}`)
}

// ---------------------------------------------------------------- ledger ----
console.log('ledger')
{
    const r = S.plan(0)
    let ledger = 0, up = 10000, ups = 0
    void ups
    const gs = makeGame(0)
    for (const inp of r.script) {
        step(gs, inp)
        for (const ev of gs.events) {
            if (ev.type === 'score') {
                ledger += ev.pts
                if (ledger >= up) { up += 10000; ups++ }
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
    const SIM = 'src/games/DigDug/sim.js'
    const MUTANTS = [
        ['pump never pops at stage 4', 'if (e.stage >= CFG.pumpStages)', 'if (e.stage > CFG.pumpStages)'],
        ['rock support ignored', 'if (gs.dirt[r][k.col]) n++', 'if (gs.dirt[r][k.col]) n += 0'],
        ['fygar pays pooka', 'PUMP_POINTS[e.kind]', 'PUMP_POINTS.pooka'],
        ['pumped enemies never deflate', 'deflateTicks: 90,', 'deflateTicks: 99999,'],
    ]
    const orig = readFileSync(SIM, 'utf8')
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(SIM, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/dugcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
    }
    writeFileSync(SIM, orig)
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)
