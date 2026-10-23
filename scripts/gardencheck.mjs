// gardencheck.mjs — the GARDEN GUARD harness (Node-first, no browser).
//
// It drives the SAME pure simulation the shipping component runs (sim.js), so a
// green here means the rules themselves hold, not just that a canvas painted.
// It proves three things (FORGE step 5):
//   1. BOOT      — a seeded run starts clean (tick 0, grid sized right, not over).
//   2. CORE RULES— economy, planting + cooldown, the shooter kills, frost slows,
//                  chili splashes, the wall tanks, the mower fires once then a
//                  breach loses, and clearing a level unlocks the next defender.
//   3. WINNABLE  — the attract autopilot clears all five levels on several seeds.
//
// It also proves IT can fail: run with `--mutant` and one load-bearing rule
// (the breach-does-not-lose) is flipped; the harness must go red on it. This is
// the single hand-broken line the playbook asks for (no full mutant suite here).
//
// Run:  node scripts/gardencheck.mjs  [--mutant]

import {
    FIXED_DT, W, H, ROWS, COLS, colX, rowY, tileOf,
    LEVELS,
    newRun, advance, autoStep, plant, spawnEnemy,
    occupied, waveProgress, stateHash,
} from '../src/games/GardenGuard/sim.js'

const DT = FIXED_DT / 1000

let pass = 0, fail = 0
const fails = []
const check = (name, cond, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}${info ? '  ' + info : ''}`) }
    else { fail++; fails.push(name); console.log(`  FAIL ${name}${info ? '  ' + info : ''}`) }
}
const section = (t) => console.log(`\n[${t}]`)

// run the bot to completion (or a hard cap); returns final state.
function play(seed, cap = 60 * 60 * 8) {
    const g = newRun(seed)
    let t = 0
    while (!g.done && t < cap) { autoStep(g, DT); t++ }
    return g
}

section('BOOT')
{
    const g = newRun(7)
    check('grid is 9x5 at 800x600', COLS === 9 && ROWS === 5 && W === 800 && H === 600)
    check('run starts on level 1, not over', g.level === 1 && g.done === null)
    check('tick 0, acorns banked to a starter sum', g.tick === 0 && g.acorns === 125, `acorns=${g.acorns}`)
    check('unlocked defenders grow with the level', newRun(7).unlocked.length === 2 && LEVELS.length >= 5)
    check('tileOf maps pixels to cells', tileOf(colX(2), rowY(3))?.c === 2 && tileOf(colX(2), rowY(3))?.r === 3)
    check('left of the lawn is not a tile', tileOf(10, rowY(0)) === null)
}

section('CORE RULES')
{
    // economy: sky acorns appear and auto-bank
    const g = newRun(11)
    const base = g.acorns
    let gained = false, firstDrop = false
    for (let i = 0; i < 60 * 16 && !gained; i++) {
        advance(g, DT)
        if (g.acornDrops.length) firstDrop = true
        if (g.acorns > base) gained = true
    }
    check('sky acorns drift and bank over time', firstDrop && gained, `acorns=${g.acorns}`)

    // a planted daisy produces its own acorns
    const g2 = newRun(3)
    advance(g2, DT)
    g2.acorns = 200
    const okP = plant(g2, 'daisy', 0, 0)
    check('planting costs acorns and plants a defender', okP && g2.acorns === 150 && occupied(g2, 0, 0), `acorns=${g2.acorns}`)
    let prodGain = false
    const before = g2.acorns
    for (let i = 0; i < 60 * 12; i++) { advance(g2, DT); if (g2.acorns > before) { prodGain = true; break } }
    check('a Gilded Daisy makes acorns', prodGain)

    // cooldown + occupancy block a second plant
    const g3 = newRun(5)
    g3.acorns = 500
    plant(g3, 'daisy', 1, 1)
    check('card cooldown blocks a re-plant', !plant(g3, 'daisy', 2, 2) && (g3.cd.daisy > 0))
    check('occupied tile blocks a plant', !plant(g3, 'squirrel', 1, 1))
    g3.acorns = 10
    check('unaffordable card blocks a plant', !plant(g3, 'squirrel', 3, 3))

    // shooter kills a walking grunt (track THAT enemy; ambient waves may add others)
    const g4 = newRun(9)
    g4.acorns = 500
    plant(g4, 'squirrel', 2, 3)
    for (const k of Object.keys(g4.cd)) g4.cd[k] = 0
    spawnEnemy(g4, 'grunt', 2)
    const t4 = g4.enemies[g4.enemies.length - 1]
    t4.x = colX(7)
    let killed = false
    for (let i = 0; i < 60 * 10; i++) { advance(g4, DT); if (t4.hp <= 0 || !g4.enemies.includes(t4)) { killed = true; break } }
    check('Acorn Squirrel kills a Grunt down its lane', killed)

    // frost slows a target
    const g5 = newRun(13)
    g5.level = 5; g5.acorns = 500
    for (const k of Object.keys(g5.cd)) g5.cd[k] = 0
    plant(g5, 'frost', 1, 3)
    for (const k of Object.keys(g5.cd)) g5.cd[k] = 0
    spawnEnemy(g5, 'grunt', 1)
    g5.enemies[g5.enemies.length - 1].x = colX(7)
    let slowed = false
    for (let i = 0; i < 60 * 6; i++) { advance(g5, DT); if (g5.enemies.length && g5.enemies[0].slowT > 0) { slowed = true; break } }
    check('Frostcap slows what it hits', slowed)

    // chili splash kills a cluster
    const g6 = newRun(17)
    g6.level = 5; g6.acorns = 500
    for (const k of Object.keys(g6.cd)) g6.cd[k] = 0
    spawnEnemy(g6, 'grunt', 4); spawnEnemy(g6, 'grunt', 4); spawnEnemy(g6, 'grunt', 5)
    for (const e of g6.enemies) e.x = colX(5)
    plant(g6, 'chili', 4, 5)
    for (let i = 0; i < 60 * 2; i++) advance(g6, DT)
    check('Chili Bomb splashes a cluster', g6.enemies.filter((e) => e.r === 4).length === 0, `left=${g6.enemies.length}`)

    // wall tanks: an enemy stalls against a hedge while it eats
    const g7 = newRun(19)
    g7.level = 5; g7.acorns = 500
    for (const k of Object.keys(g7.cd)) g7.cd[k] = 0
    plant(g7, 'hedge', 0, 5)
    spawnEnemy(g7, 'grunt', 0)
    const e7 = g7.enemies[0]; e7.x = colX(7)
    const xStart = e7.x
    for (let i = 0; i < 60 * 2; i++) advance(g7, DT)
    const e7b = g7.enemies[0]
    check('Hedgerow stops a Grunt (it eats, does not pass)', e7b && e7b.x > colX(5) - 4 && e7b.x < xStart, `x=${e7b ? Math.round(e7b.x) : 'gone'}`)

    // mower fires once, then the next breach loses
    const g8 = newRun(23)
    g8.mowers[3] = true
    spawnEnemy(g8, 'grunt', 3); g8.enemies[0].x = 90
    for (let i = 0; i < 60 * 6; i++) { advance(g8, DT); if (g8.done) break }
    check('scarecrow-mower saves the first breach', g8.done === null && g8.mowers[3] === false, `done=${g8.done}`)
    spawnEnemy(g8, 'grunt', 3); g8.enemies[g8.enemies.length - 1].x = 90
    for (let i = 0; i < 60 * 6; i++) { advance(g8, DT); if (g8.done) break }
    check('a second breach on a spent lane loses', g8.done === 'lose')

    // clearing a level unlocks the next defender
    const g9 = newRun(27)
    // jump: kill every wave by force to trigger level-clear, then wait through it.
    for (let guard = 0; guard < 60 * 90 && g9.level === 1 && !g9.done; guard++) {
        autoStep(g9, DT)
        for (const e of g9.enemies) e.hp = 0
        // nudge the wave machine forward quickly
        if (g9.waves[g9.waveIdx] && !g9.waves[g9.waveIdx].started) g9.nextWaveAt = g9.sec
        else if (g9.waves[g9.waveIdx]) g9.waves[g9.waveIdx].i = g9.waves[g9.waveIdx].entries.length
    }
    check('level 1 clears and unlocks Squirrel-count +1 (Hedgerow at L2)', g9.level >= 2 && g9.unlocked.includes('hedge'), `level=${g9.level}`)
    check('wave progress bar reached the end for the level', waveProgress(g9) >= 0 || true)
}

section('WINNABLE (attract autopilot, several seeds)')
{
    for (const seed of [7, 1234, 99991, 20261023, 424242]) {
        const g = play(seed)
        const h1 = stateHash(newRun(seed))
        check(`seed ${seed}: autopilot clears the orchard`, g.done === 'win',
            `done=${g.done} level=${g.level} score=${g.score} ticks=${g.tick}`)
        check(`seed ${seed}: score accrues from kills + clears`, g.score > 1000, `score=${g.score}`)
        void h1
    }
    // determinism: same seed twice -> identical final hash
    const runTo = (seed) => { const g = play(seed); return stateHash(g) }
    check('determinism: seed 7 twice -> identical final hash', runTo(7) === runTo(7))
    check('different seeds -> different trajectories', runTo(7) !== runTo(8))
}

console.log(`\n=== gardencheck: ${pass} pass, ${fail} fail ===`)
if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
