// missilecmdcheck — MISSILE COMMAND (#1473 seedpin batch 15) in plain Node.
// The pre-port engine rolled its dice straight off Math.random and had NO
// restart path at all — a dead GAME OVER screen. This gate pins what is true
// now: every warhead's target, trail entry and start come from ONE seeded
// stream (?seed=N replays the raid), the seeded dice stay in range, the run
// reaches an honest terminal, and every human start (key, click, tap) rebuilds
// the whole board with a fresh seed. `--mutant` re-plants the pre-port
// behaviours in the real files; every mutant MUST turn something red.
//
//   npm run missilecmdcheck
//   npm run missilecmdcheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { chooseEnemySpawn, SCREEN_WIDTH } from '../src/games/MissileCommand/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// stand-in structures with the component's x positions (cities 120..680,
// silos 40..760); alive flag matches the engine's filter.
const board = () => ([
    { x: 120, alive: true }, { x: 200, alive: true }, { x: 280, alive: true },
    { x: 520, alive: true }, { x: 600, alive: true }, { x: 680, alive: true },
    { x: 40, alive: true }, { x: 400, alive: true }, { x: 760, alive: true },
])

// ---------------------------------------------------------------- determinism ----
console.log('spawn stream: seeded raids replay')
{
    const raid = (seed, n) => {
        const rand = seedRng(seed)
        const targets = board()
        const out = []
        for (let i = 0; i < n; i++) {
            const live = targets.filter(t => t.alive)
            if (live.length === 0) break
            const pick = chooseEnemySpawn(rand, live)
            // the component's own terminal model: a hit takes its target out
            pick.target.alive = false
            out.push(`${pick.target.x}|${pick.x.toFixed(6)}|${pick.startX.toFixed(6)}`)
        }
        return out.join(';')
    }
    const a = raid(4242, 500)
    ok(a === raid(4242, 500), 'same seed → identical 500-spawn raid script')
    ok(a !== raid(4243, 500), 'different seed → different raid script')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const rand = seedRng(s * 7919)
        const targets = board()
        for (let i = 0; i < 200; i++) {
            const live = targets.filter(t => t.alive)
            if (live.length === 0) break
            const pick = chooseEnemySpawn(rand, live)
            if (!(pick.x >= 0 && pick.x < SCREEN_WIDTH)) bad++
            if (!(pick.startX >= 0 && pick.startX < SCREEN_WIDTH)) bad++
            if (!targets.includes(pick.target)) bad++
            pick.target.alive = false
        }
    }
    ok(bad === 0, 'targets on the board and entry points in sky range (12 seeds × 200)', `${bad}`)
    const finite = raid(1, board().length)
    ok(finite.split(';').length === 9, 'a full raid terminates when every structure is gone')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
}

// -------------------------------------------------------------------- the law ----
console.log('component wiring: pin, report, restart')
{
    const src = readFileSync('src/games/MissileCommand/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the seeded stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/seed: seed/.test(src), 'production report carries the seed')
    ok(/done: gameState === 'gameOver'/.test(src), 'the report terminal is the real game over')
    // pre-port this function did not exist: the GAME OVER screen was dead.
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr, 'startRun exists (tap/key restart)')
    if (sr) {
        const body = sr[0]
        ok(/cities\.forEach\(c => \{ c\.alive = true \}\)/.test(body), 'restart rebuilds the six cities')
        ok(/s\.alive = true; s\.ammo = 10/.test(body), 'restart rebuilds silos and ammo')
        ok(/score = 0/.test(body) && /wave = 1/.test(body), 'restart clears score and rewinds to wave 1')
        ok(/gameOver = false/.test(body) && /isAttractMode = false/.test(body), 'restart leaves attract and the dead board')
    }
    ok(/handleCanvasTap/.test(src), 'phones can tap the board to start/restart')
}

if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/MissileCommand/index.jsx'
    const S = 'src/games/MissileCommand/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `done: gameState === 'gameOver', seed: seed, wave: wave,`,
            `done: gameState === 'gameOver', wave: wave,`],
        ['warhead targets leave the stream', S,
            `const target = targets[Math.floor(rand() * targets.length)]`,
            `const target = targets[Math.floor(Math.random() * targets.length)]`],
        ['restart forgets the silos', I,
            `silos.forEach(s => { s.alive = true; s.ammo = 10 })`,
            `silos.forEach(s => { s.ammo = 10 })`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/missilecmdcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
