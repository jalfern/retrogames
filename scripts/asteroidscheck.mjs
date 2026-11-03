// asteroidscheck — ASTEROIDS (#1473 seedpin batch 16) in plain Node.
// The Feb port had no score, no lives, no terminal (the ship could not die)
// and dice off Math.random. This gate pins what is true now: every shape and
// velocity comes from ONE seeded stream (?seed=N replays the field), the
// arcade scoring table 20/50/100 with the 520-point big-rock total holds,
// the run reaches an honest terminal at 0 lives, and every human start
// rebuilds the board honoring ?seed=N. `--mutant` re-plants pre-port bugs;
// every mutant MUST turn something red.
//
//   npm run asteroidscheck
//   npm run asteroidscheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { makeAsteroid, spawnWave, scoreForSize, livesForScore, START_LIVES } from '../src/games/Asteroids/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------ determinism ----
console.log('seeded field: shape, velocity, position replay')
{
    const field = (sd, n) => {
        const rand = seedRng(sd)
        const out = []
        for (let i = 0; i < n; i++) {
            const a = makeAsteroid(rand, null, null, 40, 600, 800)
            out.push(`${a.x.toFixed(6)}|${a.y.toFixed(6)}|${a.vx.toFixed(6)}|${a.vy.toFixed(6)}|${a.vertices.length}|${a.vertices[0].x.toFixed(6)}`)
        }
        return out.join(';')
    }
    ok(field(4242, 150) === field(4242, 150), 'same seed → identical 150-rock field script')
    ok(field(4242, 150) !== field(4243, 150), 'different seed → different field script')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const rand = seedRng(s * 7919)
        for (let i = 0; i < 200; i++) {
            const a = makeAsteroid(rand, null, null, 40, 600, 800)
            if (!(a.x >= 0 && a.x < 600)) bad++
            if (!(a.y >= 0 && a.y < 800)) bad++
            if (!(Math.abs(a.vx) <= 1 && Math.abs(a.vy) <= 1)) bad++
            if (!(a.vertices.length >= 8 && a.vertices.length <= 11)) bad++
        }
    }
    ok(bad === 0, 'seeded rocks land in range with 8-11 silhouette points (12 seeds × 200)', `${bad}`)
    const w = spawnWave(seedRng(99), 1, 600, 800)
    ok(w.length === 6, 'wave 1 opens with the port baseline of 6 rocks', `${w.length}`)
    ok(spawnWave(seedRng(99), 10, 600, 800).length === 11, 'late waves cap at 11 rocks')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
}

// --------------------------------------------------------- arcade scoring ----
console.log('1979 scoring law')
{
    ok(scoreForSize(40) === 20 && scoreForSize(20) === 50 && scoreForSize(10) === 100,
        'rock table: large 20 / medium 50 / small 100')
    // Destroying one large rock fully: 20 + 2×50 + 4×100 = 520 (the arcade total).
    const total = scoreForSize(40) + 2 * scoreForSize(20) + 4 * scoreForSize(10)
    ok(total === 520, 'one big-rock chain scores the known arcade total 520', `${total}`)
    ok(livesForScore(0) === 0 && livesForScore(9999) === 0 && livesForScore(10000) === 1 && livesForScore(25000) === 2,
        'bonus life every 10,000 points')
    ok(START_LIVES === 3, 'the machine starts you with 3 lives')
}

// ------------------------------------------------------- component wiring ----
console.log('component wiring: pin, terminal, restart, HUD')
{
    const src = readFileSync('src/games/Asteroids/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,120}?done: over, seed: seed, lives, wave/.test(src),
        'production report carries seed + terminal + lives + wave')
    ok(/state: \(\) => \(\{[\s\S]{0,160}?tick: tickN, score, done: over, seed: seed, lives, wave/.test(src),
        'QA contract state carries seed + terminal + lives + wave too')
    ok(/score \+= scoreForSize\(a\.size\)/.test(src), 'bullet kills score through the arcade table')
    ok(/lives--/.test(src) && /lives <= 0[\s\S]*?over = true/.test(src), 'ship death decrements lives; zero ends the run')
    ok(/if \(shipAlive\(\) && tickN >= invulnUntil && !state\.isAttractMode\)/.test(src),
        'rock-vs-ship collision honors the respawn grace')
    ok(/if \(!shipAlive\(\) && tickN >= respawnAt\)/.test(src), 'dark respawn returns the ship after the delay')
    ok(/state\.asteroids\.length === 0[\s\S]{0,120}wave\+\+/.test(src), 'a cleared field rolls the next wave')
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr && /score = 0/.test(sr[0]) && /lives = START_LIVES/.test(sr[0]) && /wave = 1/.test(sr[0]),
        'startRun resets score, lives and wave')
    ok(/if \(over \|\| state\.isAttractMode\) \{ startRun\(\); return \}/.test(src), 'any key starts/restarts the run')
    ok(/handleCanvasTap/.test(src), 'phones can tap the field to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'asteroids'/.test(src), 'QA contract exposeGame wired')
    ok(/GAME OVER/.test(src) && /FINAL SCORE/.test(src), 'the terminal says GAME OVER and keeps the score visible')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Asteroids/index.jsx'
    const S = 'src/games/Asteroids/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: tickN, score, done: over, seed: seed, lives, wave,`,
            `tick: tickN, score, done: over, lives, wave,`],
        ['rock shapes leave the stream', S,
            `const r = size * (0.8 + rand() * 0.4)`,
            `const r = size * (0.8 + Math.random() * 0.4)`],
        ['medium rocks score like large (table corrupted)', S,
            `size >= 30 ? 20 : size >= 20 ? 50 : 100`,
            `size >= 30 ? 20 : size >= 20 ? 20 : 100`],
        ['the ship cannot die (pre-port terminal theft)', I,
            `if (shipAlive() && tickN >= invulnUntil && !state.isAttractMode) {`,
            `if (false && shipAlive() && tickN >= invulnUntil && !state.isAttractMode) {`],
        ['restart keeps the score', I,
            `            score = 0
            lives = START_LIVES`,
            `            lives = START_LIVES`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/asteroidscheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
