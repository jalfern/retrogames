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
import { makeAsteroid, spawnWave, scoreForSize, livesForScore, START_LIVES, makeRun, tickAsteroids, watchStep, stateHash } from '../src/games/Asteroids/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

const SIM = readFileSync('src/games/Asteroids/sim.js', 'utf8')

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
        /gs = makeRun\(seed, \{ width: gs\.width, height: gs\.height \}\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,160}?done: gs\.over, seed: gs\.seed, lives: gs\.lives, wave: gs\.wave/.test(src),
        'production report carries seed + terminal + lives + wave')
    ok(/state: \(\) => \(\{[\s\S]{0,200}?tick: gs\.tickN, score: gs\.score, done: gs\.over, seed: gs\.seed/.test(src),
        'QA contract state carries seed + terminal + lives + wave too')
    ok(/hash: stateHash\(gs\)/.test(src), 'QA contract state carries the physics hash')
    ok(/score \+= scoreForSize\(a\.size\)/.test(SIM), 'bullet kills score through the arcade table')
    ok(/gs\.lives--/.test(SIM) && /gs\.lives <= 0[\s\S]*?gs\.over = true/.test(SIM), 'ship death decrements lives; zero ends the run')
    ok(/if \(shipAlive\(gs\) && gs\.tickN >= gs\.invulnUntil && !gs\.attract\)/.test(SIM),
        'rock-vs-ship collision honors the respawn grace')
    ok(/if \(!shipAlive\(gs\) && gs\.tickN >= gs\.respawnAt\)/.test(SIM), 'dark respawn returns the ship after the delay')
    ok(/gs\.asteroids\.length === 0[\s\S]{0,120}gs\.wave\+\+/.test(SIM), 'a cleared field rolls the next wave')
    ok(/score: 0,[\s\S]*?lives: START_LIVES,[\s\S]*?wave: 1,/.test(SIM),
        'makeRun opens every run at zero score, full lives, wave one (startRun + reset share it)')
    ok(/if \(overStarts\(\)\) \{ startRun\(\); return \}/.test(src), 'any key starts/restarts the run')
    ok(/handleCanvasTap/.test(src), 'phones can tap the field to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'asteroids'/.test(src), 'QA contract exposeGame wired')
    ok(/GAME OVER/.test(src) && /FINAL SCORE/.test(src), 'the terminal says GAME OVER and keeps the score visible')
    // #1637 b26 — the seat: shared chrome, blips, takeover, never-linger.
    ok(/if \(isWatchKey\(e\)\)/.test(src) && /isTakeoverKey\(e\)/.test(src), 'Y toggles; driving keys take over')
    ok(src.includes('playWatchStart') && src.includes('playWatchStop') && src.includes('watchSfx: watchSfxLog'),
        'seat blips logged through the shared watch chrome')
    ok(/gs\.watching = false \/\/ watch never lingers/.test(src), 'contract reset releases the seat')
    const RUN0 = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!RUN0 && /watching = false/.test(RUN0[0]), 'watch never lingers into a fresh human run')
    ok(/if \(ev\.over && !gs\.attract && gs\.watching\) release\(false\)/.test(src),
        'the terminal releases the watcher (silent, racer rule)')
    ok(/<AttractWatchButton/.test(src) && src.includes('WATCH_ATTRACT_HINT'), 'attract carries the shared WATCH hint')
    ok(/const input = gs\.attract \|\| gs\.watching \? null : heldInput\(\)/.test(src),
        'the watcher owns the wheel — held keys never mute the driver')
}

// --------------------------------------------------- WATCH driver sweep ----
// #1637 b26 — the seat is this sweep: watchStep replayed over the game's OWN
// lifted physics, 40 seeds × 120 s. The floors below are what the hunter
// actually does; if a change drops one, the driver got worse and this is red.
// (40/40 seeds replay byte-equal — samples cover the dice, split chain and
// every bullet in flight.)
console.log('WATCH driver sweep: 40 seeds x 120 s of seated play on the shipped physics')
{
    // ASTEROID_SWEEP=fast trims the fleet for the --mutant child runs (same
    // law, same floors scaled — the plain run stays at the full 40 × 120 s).
    const FAST = process.env.ASTEROID_SWEEP === 'fast'
    const SEEDS = FAST ? 12 : 40
    const TICKS = FAST ? 3600 : 7200
    const run = (seed) => {
        const gs = makeRun(seed, { width: 600, height: 800 })
        gs.attract = false
        gs.watching = true
        const samples = []
        let deaths = 0
        for (let i = 0; i < TICKS; i++) {
            const ev = tickAsteroids(gs, null)
            if (ev.died) deaths++
            if (i % 1200 === 0) samples.push(stateHash(gs))
            if (gs.over) break
        }
        return { gs, samples, deaths }
    }
    let det = 0, zeroDeath = 0, wavesBanked = 0, survivedAll = 0
    let minScore = Infinity, total = 0
    const red = []
    for (let s = 1; s <= SEEDS; s++) {
        const seed = s * 7919 + 13
        const a = run(seed)
        const b = run(seed)
        if (JSON.stringify(a.samples) === JSON.stringify(b.samples)) det++
        if (a.deaths === 0) zeroDeath++
        if (!a.gs.over) survivedAll++
        if (a.gs.wave >= 2) wavesBanked++
        if (a.gs.score < minScore) minScore = a.gs.score
        total += a.gs.score
        if (a.gs.score < (FAST ? 2500 : 6000) || a.gs.over) red.push(`${seed}:${a.gs.score}${a.gs.over ? 'OVER' : ''}`)
    }
    ok(det === SEEDS, `${SEEDS}/${SEEDS} seeds replay byte-equal (hash sampled every 1200 ticks)`, red.join(' '))
    ok(survivedAll === SEEDS, 'every seed finishes the watch — the hunter does not game over')
    ok(zeroDeath >= (FAST ? 9 : 34), `zero-death runs on ${FAST ? 9 : 34}+ seeds`, `${zeroDeath}/${SEEDS}`)
    ok(wavesBanked >= (FAST ? SEEDS - 1 : SEEDS), 'every seed banks at least one full wave', `${wavesBanked}/${SEEDS}`)
    ok(minScore >= (FAST ? 2500 : 6000), `worst seed still scores ${FAST ? 2500 : 6000}+ under the watch`, `${minScore}`)
    ok(total >= (FAST ? SEEDS * 2500 : 300000), 'the fleet banks its combined floor (score is real progress, not coasting)', `${total}`)
}

// ------------------------------------------------------------ seat rules ----
console.log('seat semantics: driver in, driver out, honest waits')
{
    // Seated: no human input lands, yet the hunter plays.
    const gs = makeRun(31337, { width: 600, height: 800 })
    gs.attract = false
    gs.watching = true
    let shots = 0
    for (let i = 0; i < 900; i++) if (tickAsteroids(gs, null).shot) shots++
    ok(shots > 0 && gs.tickN === 900, 'seated: null input still fires the driver (reactive, not scripted)', `shots=${shots}`)

    // Unseated: null input is the human coasting — the driver must stay silent.
    const coast = makeRun(31337, { width: 600, height: 800 })
    coast.attract = false
    coast.watching = false
    let coastShots = 0
    for (let i = 0; i < 900; i++) if (tickAsteroids(coast, null).shot) coastShots++
    ok(coastShots === 0, 'unseated: null input is nobody driving — zero shots')

    // Honest waits: watchStep declines on attract, terminal, and the dark gap.
    const att = makeRun(5, { attract: true })
    ok(watchStep(att) === null, 'watchStep waits on the attract demo')
    att.attract = false
    att.over = true
    ok(watchStep(att) === null, 'watchStep waits at the terminal')
    att.over = false
    att.respawnAt = att.tickN + 40
    ok(watchStep(att) === null, 'watchStep waits through the dark respawn gap')

    // The driver draws no dice — the engine rolls only the seeded stream.
    ok(!/\bMath\.random\b/.test(SIM), 'the planner draws no dice (b25 law)', '')
    ok(/export function tickAsteroids\(gs, input = null\)/.test(SIM), 'the whole tick-rule set lives in the sim (tickAsteroids)')
    ok(/gs\.watching \? watchStep\(gs\) : null/.test(SIM), 'the seat drives the sim through watchStep, not a bench script')
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
            `exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives, wave: gs.wave,`,
            `exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, lives: gs.lives, wave: gs.wave,`],
        ['rock shapes leave the stream', S,
            `const r = size * (0.8 + rand() * 0.4)`,
            `const r = size * (0.8 + Math.random() * 0.4)`],
        ['medium rocks score like large (table corrupted)', S,
            `size >= 30 ? 20 : size >= 20 ? 50 : 100`,
            `size >= 30 ? 20 : size >= 20 ? 20 : 100`],
        ['the ship cannot die (pre-port terminal theft)', S,
            `if (shipAlive(gs) && gs.tickN >= gs.invulnUntil && !gs.attract) {`,
            `if (false && shipAlive(gs) && gs.tickN >= gs.invulnUntil && !gs.attract) {`],
        ['restart keeps the score', S,
            `        tickN: 0,
        score: 0,`,
            `        tickN: 0,
        score: seed % 97,`],
        // b26 driver mutants — the seat itself.
        ['the driver is muted (watch coasts forever)', S,
            `input || (gs.watching ? watchStep(gs) : null)`,
            `input || null`],
        ['watch lingers into a fresh run (startRun keeps the seat)', I,
            `            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands`,
            `            setAttractUi(false)`],
        ['held keys mute the driver (seat flag dropped from the gate)', I,
            `const input = gs.attract || gs.watching ? null : heldInput()`,
            `const input = gs.attract ? null : heldInput()`],
        ['terminal releases the watcher with a blip (racer rule broken)', I,
            `if (ev.over && !gs.attract && gs.watching) release(false)`,
            `if (ev.over && !gs.attract && gs.watching) release(true)`],
        ['rollout dodges too late (threat window collapsed to two ticks)', S,
            `if (ttc < 45 && ttc < tThreat)`,
            `if (ttc < 2 && ttc < tThreat)`],
        ['the driver\'s eye forgets the wrap (phantom distances at the seam)', S,
            `    while (d > span / 2) d -= span
    while (d < -span / 2) d += span`,
            `    while (d > span * 4) d -= span
    while (d < -span * 4) d += span`],
        ['the hold collapses to one tick (ties never turn the ship)', S,
            `const HOLD = 10`,
            `const HOLD = 1`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/asteroidscheck.mjs'], { encoding: 'utf8', env: { ...process.env, ASTEROID_SWEEP: 'fast' } })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
