// missilecmdcheck — MISSILE COMMAND in plain Node.
//
// Batch 15 (#1473) pinned the seeded spawn dice. Batch 29 (#1637) lifted the
// whole tick into sim.js and added the PROVEN route the WATCH seat drives, so
// this gate now grades three things:
//   1. the raid replays byte-equal from the seed (whole ticks, not just dice),
//   2. the gunner wins where the machine only ever survived by luck:
//      every seed in the sweep clears waves 1..5 with ALL SIX CITIES and all
//      three silos standing, spending near one ABM per warhead,
//   3. the seat wiring is real (sfx hooks, registry line, sim-clock wave break).
// `--mutant` re-plants load-bearing breakage; every mutant MUST turn red.
//
//   npm run missilecmdcheck
//   npm run missilecmdcheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
    chooseEnemySpawn, makeRun, tickMc, gunnerStep, citiesAlive, fireAt,
    SCREEN_WIDTH, SAFE_Y, WAVE_BREAK_TICKS, PROVEN_WAVES,
} from '../src/games/MissileCommand/sim.js'
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

// ------------------------------------------------- whole-raid determinism --------
console.log('whole-tick sim: byte-equal replay from the seed (b29 lift)')
const trace = (seed, ticks) => {
    const gs = makeRun(seed)
    let h = 2166136261
    const mix = (n) => { h ^= Math.round(n * 1000) + 0x7fffffff; h = Math.imul(h, 16777619) }
    for (let i = 0; i < ticks && !gs.over; i++) {
        const cmd = gunnerStep(gs)
        tickMc(gs, cmd)
        mix(gs.tick); mix(gs.score); mix(gs.wave)
        mix(gs.warheads.length); mix(gs.abms.length); mix(gs.blasts.length)
        mix(gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0))
        mix(citiesAlive(gs))
        for (const m of gs.warheads) { mix(m.x); mix(m.y) }
        for (const b of gs.blasts) { mix(b.x); mix(b.y); mix(b.radius) }
    }
    return h >>> 0
}
{
    ok(trace(4242, 8000) === trace(4242, 8000), 'identical trace hash on replay of one seeded raid (8000 ticks)')
    ok(trace(4242, 8000) !== trace(4243, 8000), 'different seed → different whole-raid trace')
    const gs = makeRun(7)
    ok(gs.cities.length === 6 && gs.silos.every((s) => s.ammo === 10) && gs.wave === 1 && gs.score === 0,
        'makeRun rebuilds the whole board (6 cities, 3×10 ammo, wave 1, score 0)')
}

// ------------------------------------------------------- the proof sweep ---------
console.log('the gunner: waves 1..5 clean across the seeded sweep (the WATCH route)')
{
    const SEEDS = 24
    let clean = 0, shotsPer = 0, minCities = 6, minSilos = 3
    const lost = []
    for (let s = 1; s <= SEEDS; s++) {
        const seed = s * 7919 + 3
        const gs = makeRun(seed)
        let shots = 0, guard = 0
        while (gs.wave <= PROVEN_WAVES && !gs.over && guard++ < 40000) {
            const cmd = gunnerStep(gs)
            tickMc(gs, cmd)
            shots += gs.events.filter((e) => e === 'pew').length
        }
        const c = citiesAlive(gs), si = gs.silos.filter((x) => x.alive).length
        minCities = Math.min(minCities, c); minSilos = Math.min(minSilos, si)
        if (!gs.over && gs.wave > PROVEN_WAVES && c === 6 && si === 3) clean++
        else lost.push(`${seed}@w${gs.wave}c${c}s${si}`)
        shotsPer += shots
    }
    ok(clean === SEEDS, `every seed clears waves 1..${PROVEN_WAVES} with 6 cities AND 3 silos`,
        clean === SEEDS ? '' : `lost: ${lost.join(' ')}`)
    const warheads = Array.from({ length: PROVEN_WAVES }, (_, i) => 10 + (i + 1) * 2).reduce((a, b) => a + b, 0)
    const avg = shotsPer / SEEDS
    ok(avg <= warheads * 1.15, `economy holds: ${avg.toFixed(1)} shots avg vs ${warheads} warheads (spray is a rule break)`)
    ok(avg >= warheads * 0.5, `the gunner actually shoots: ${avg.toFixed(1)} avg is not a lucky idle sky`)
    ok(minCities === 6 && minSilos === 3, 'no sweep seed lost so much as a silo', `worst ${minCities}/6 cities, ${minSilos}/3 silos`)
}

// ------------------------------------------------------------ doctrine ---------
console.log('doctrine pins: intercept HIGH, urgent first, cover-then-retry')
{
    // safety math: a blast centered on SAFE_Y is out of every anchor's reach
    ok(SAFE_Y + 40 < 530, 'SAFE_Y keeps the max radius off the silo anchors',
        `SAFE_Y=${SAFE_Y}, silo anchor 530, blast max 40`)
    // the driver's chosen points respect it on a live raid
    const gs = makeRun(31337)
    let low = 0, guard = 0, aimed = 0
    while (gs.wave <= 3 && !gs.over && guard++ < 20000) {
        const cmd = gunnerStep(gs)
        if (cmd) { aimed++; if (cmd.aimY > SAFE_Y) low++ }
        tickMc(gs, cmd)
    }
    ok(aimed > 0 && low === 0, `every aimed intercept sits above the safe line (${aimed} shots, worst breach ${low})`)
    // urgent-first: two warheads, the lower one must own the shot
    const g2 = makeRun(5)
    g2.warheads = [
        { id: 1, x: 100, y: 80, startX: 100, startY: 0, targetX: 120, targetY: 550, speed: 1.1, color: '#f00', coverUntil: 0 },
        { id: 2, x: 700, y: 300, startX: 700, startY: 0, targetX: 680, targetY: 550, speed: 1.1, color: '#f00', coverUntil: 0 },
    ]
    const pick = gunnerStep(g2)
    ok(pick && pick.wid === 2, 'the LOWEST warhead gets the shot first', `picked wid ${pick && pick.wid}`)
    // cover: a covered warhead is not double-tapped
    g2.warheads[1].coverUntil = g2.tick + 10
    const second = gunnerStep(g2)
    ok(second === null || second.wid === 1, 'a warhead with a promised shot waits for its cover',
        `picked ${second && second.wid}`)
    // dry batteries: nothing to spend, the driver holds fire (no crash, no lie)
    const g3 = makeRun(9)
    g3.silos.forEach((s) => { s.ammo = 0 })
    g3.warheads = [{ id: 1, x: 100, y: 40, startX: 100, startY: 0, targetX: 120, targetY: 550, speed: 1.1, color: '#f00', coverUntil: 0 }]
    ok(gunnerStep(g3) === null, 'dry batteries: the gunner holds instead of faking a shot')
    ok(fireAt(g3, 100, 100) === false, 'fireAt respects the empty magazine')
    // wave break runs on the sim clock — no wall clock anywhere near it
    const g4 = makeRun(11)
    g4.missilesLeftInWave = 0
    let w4 = 0
    while (g4.state !== 'waveEnd' && w4++ < 2000) tickMc(g4, null)
    ok(g4.state === 'waveEnd' && g4.waveBreak === WAVE_BREAK_TICKS, 'wave end arms the sim-clock break', `${g4.state}/${g4.waveBreak}`)
    let w5 = 0
    while (g4.state === 'waveEnd' && w5++ < WAVE_BREAK_TICKS + 10) tickMc(g4, null)
    ok(g4.state === 'playing' && g4.wave === 2, `break holds exactly ${WAVE_BREAK_TICKS} ticks then wave 2 fires`)
}

// -------------------------------------------------------------------- the law ----
console.log('component wiring: pin, report, restart, seat')
{
    const src = readFileSync('src/games/MissileCommand/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the seeded stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/makeRun\(seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)\)/.test(src),
        'startRun regenerates the seed through makeRun and honors ?seed=N')
    // the PRODUCTION report, specifically — not any seed literal (the DEV probe
    // carries one too; a whole-file grep let a dropped report-seed survive).
    const rep = src.match(/exposeFeedbackState\(\(\) => \(\{[\s\S]*?\}\)\)/)
    ok(!!rep && /seed: gs\.seed/.test(rep[0]), 'production report carries the seed')
    ok(!!rep && /done: gs\.state === 'gameOver'/.test(rep[0]), 'the report terminal is the real game over')
    ok(!/setTimeout\(/.test(src), 'no wall clock survives the lift (#1525 — the wave break rides the sim)')
    ok(/attractUiRef\.current && \(e\.code === 'Space' \|\| e\.code === 'Enter'\)/.test(src),
        'attract starts on Space/Enter (and click/tap)')
    ok(/handleCanvasTap/.test(src), 'phones can tap the board to start/restart')
    // the watch spine
    ok(/isWatchKey\(e\)/.test(src) && /isTakeoverKey\(e\)/.test(src), 'Y seats, any driving key takes over')
    ok(/import\.meta\.env\.DEV/.test(src) && /window\.__mcTest/.test(src), '__mcTest is DEV-only')
    ok(/gs\.over && !wasOver\) release\(false\)/.test(src), 'watch never lingers into GAME OVER (silent)')
    ok(/release\(false\) \/\/ watch never lingers/.test(src), 'a fresh raid starts in your hands')
    // the registry advertises the seat (gameHasWatch gates the pill/PauseOverlay)
    const reg = readFileSync('src/config/games.js', 'utf8')
    const mc = reg.match(/path: '\/missilecommand'[\s\S]*?\n    \},/)
    ok(!!mc && /WATCH_HELP/.test(mc[0]), 'the registry carries the WATCH line for /missilecommand')
    ok(!!mc && /never lets the fire touch the ground/.test(mc[0]),
        'the registry line names the doctrine the sweep proves')
}

if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/MissileCommand/index.jsx'
    const S = 'src/games/MissileCommand/sim.js'
    const G = 'src/config/games.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `makeRun(seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))`,
            `makeRun(Math.floor(Math.random() * 1000000))`],
        ['production report drops the seed', I,
            `tick: gs.tick, score: gs.score, done: gs.state === 'gameOver', seed: gs.seed, wave: gs.wave,`,
            `tick: gs.tick, score: gs.score, done: gs.state === 'gameOver', wave: gs.wave,`],
        ['warhead targets leave the stream', S,
            `const target = targets[Math.floor(rand() * targets.length)]`,
            `const target = targets[Math.floor(Math.random() * targets.length)]`],
        ['makeRun forgets the magazine', S,
            `{ x, y: GROUND_Y - 20, ammo: 10, alive: true }`,
            `{ x, y: GROUND_Y - 20, ammo: 1, alive: true }`],
        ['SAFE_Y drops below the silo reach (intercepts start killing cities)', S,
            `export const SAFE_Y = 485`,
            `export const SAFE_Y = 528`],
        ['the gunner chases the highest warhead (urgency inverted)', S,
            `const live = gs.warheads.filter((m) => !m.dead).sort((a, b) => b.y - a.y)`,
            `const live = gs.warheads.filter((m) => !m.dead).sort((a, b) => a.y - b.y)`],
        ['no-lead prediction (aims where the warhead was, not where it will be)', S,
            `const p = stepWarhead(w, j)`,
            `const p = stepWarhead(w, 1)`],
        ['the wave break never expires (wall-clock thinking)', S,
            `gs.waveBreak--`,
            `gs.waveBreak -= 0`],
        ['the registry line is stripped (pill chrome lies about the seat)', G,
            `WATCH_HELP + ' — the sweep-proven gunner meets every warhead high and never lets the fire touch the ground'`,
            `'no watch line here'`],
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
