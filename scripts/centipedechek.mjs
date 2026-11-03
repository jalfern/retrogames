// centipedechek — CENTIPEDE (#1473 seedpin batch 16) in plain Node.
// Pre-port: `state.score` was dead, one touch hard-reset everything, cut
// bodies never grew heads, and the mushroom field scattered off Math.random.
// This gate pins what is true now: the field replays from one seed
// (?seed=N), the arcade point table (head 100 / body 10 / mushroom 1) holds,
// the cut-head rule fires, the lives loop reaches an honest GAME OVER, and
// every human start re-pins the seed. `--mutant` re-plants pre-port bugs;
// every mutant MUST turn something red.
//
//   npm run centipedechek
//   npm run centipedechek -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { mushroomField, scoreForSegment, MUSHROOM_POINTS, CELL_SIZE, START_LIVES } from '../src/games/Centipede/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------ determinism ----
console.log('seeded field: the mushroom garden replays')
{
    const field = (sd) => mushroomField(seedRng(sd), 480, 640)
        .map((m) => `${m.x}|${m.y}|${m.health}`).join(';')
    ok(field(4242) === field(4242), 'same seed → identical 40-mushroom field')
    ok(field(4242) !== field(4243), 'different seed → different field')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        for (const m of mushroomField(seedRng(s * 7919), 480, 640)) {
            if (m.x % CELL_SIZE !== 0) bad++
            if (!(m.x >= 0 && m.x < 480)) bad++
            if (!(m.y >= 50 && m.y < 640)) bad++ // keeps the spawn band clear
            if (m.health !== 3) bad++
        }
    }
    ok(bad === 0, 'field sits on the grid, below the spawn band, full health (12 seeds)', `${bad}`)
    ok(mushroomField(seedRng(1), 64, 96).length === 40, 'field size is the port baseline (40)')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
}

// --------------------------------------------------------- arcade scoring ----
console.log('1981 scoring law')
{
    ok(scoreForSegment(true) === 100, 'head shot pays 100')
    ok(scoreForSegment(false) === 10, 'body shot pays 10')
    ok(MUSHROOM_POINTS === 1, 'destroyed mushroom pays 1')
    ok(START_LIVES === 3, 'the machine starts you with 3 lives')
}

// ------------------------------------------------------- component wiring ----
console.log('component wiring: pin, lives, head rule, terminal')
{
    const src = readFileSync('src/games/Centipede/index.jsx', 'utf8')
    ok(!/Math\.random\(\*|Math\.random\(\) \* \(state\.height/.test(src),
        'the mushroom scatter left Math.random')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,120}?done: over, seed: seed, lives/.test(src),
        'production report carries seed + terminal + lives')
    ok(/state: \(\) => \(\{[\s\S]{0,160}?done: over, seed: seed, lives/.test(src),
        'QA contract state carries seed + terminal + lives too')
    ok(/state\.score \+= scoreForSegment\(seg\.head\)/.test(src), 'segment kills score through the arcade table')
    ok(/state\.score \+= MUSHROOM_POINTS/.test(src), 'mushroom destroys score 1')
    ok(/state\.centipedes\[hitSeg\]\.head = true/.test(src),
        'the segment behind a cut becomes a new head (arcade chain rule)')
    ok(/lives--/.test(src) && /lives <= 0[\s\S]*?over = true/.test(src), 'touch takes a life; zero ends the run')
    ok(/if \(playerAlive\(\) && tickN >= invulnUntil/.test(src), 'centipede-vs-player honors the respawn grace')
    ok(/!playerAlive\(\) && tickN >= respawnAt/.test(src), 'the zapper returns after the death pause')
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr && /state\.score = 0/.test(sr[0]) && /lives = START_LIVES/.test(sr[0]),
        'startRun resets score and lives (pre-batch the score was DEAD code)')
    ok(/if \(over \|\| isAttractMode\) \{ startRun\(\); return \}/.test(src), 'any key starts/restarts the run')
    ok(/handleCanvasTap/.test(src), 'phones can tap the field to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'centipede'/.test(src), 'QA contract exposeGame wired')
    ok(!/state\.player\.dead/.test(src), 'the dead-flag hard-reset is gone (lives loop replaced it)')
    ok(/GAME OVER/.test(src) && /FINAL SCORE/.test(src), 'the terminal says GAME OVER and keeps the score visible')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Centipede/index.jsx'
    const S = 'src/games/Centipede/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: tickN, score: state.score, done: over, seed: seed, lives,`,
            `tick: tickN, score: state.score, done: over, lives,`],
        ['field scatters off Math.random again', S,
            `x: Math.floor(rand() * cols) * CELL_SIZE,`,
            `x: Math.floor(Math.random() * cols) * CELL_SIZE,`],
        ['head shots pay body price (table corrupted)', S,
            `isHead ? 100 : 10`,
            `isHead ? 5 : 10`],
        ['cut bodies never grow heads', I,
            `if (state.centipedes[hitSeg]) state.centipedes[hitSeg].head = true`,
            ``],
        ['the touch is harmless (no lives loop)', I,
            `lives--
            if (lives <= 0) {`,
            `if (lives <= -99) {`],
        ['restart keeps the score', I,
            `            state.score = 0
            lives = START_LIVES`,
            `            lives = START_LIVES`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/centipedechek.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
