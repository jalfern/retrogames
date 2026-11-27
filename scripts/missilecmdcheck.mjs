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
//
// #3629 added the cruise saucers section: the wave-6 gate proven byte-exact
// against the pre-saucer sim (pinned traces), plus entry/launch/kill/hold.

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
    chooseEnemySpawn, makeRun, tickMc, gunnerStep, citiesAlive, fireAt, fireBattery, startWave, winner,
    SCREEN_WIDTH, SAFE_Y, WAVE_BREAK_TICKS, PROVEN_WAVES, attractFerry, ATTRACT_FERRY_EVERY,
    attractSmart, ATTRACT_SMART_EVERY,
    SAUCER_FIRST_WAVE, SAUCER_SCORE,
    SMART_FIRST_WAVE, SMART_SCORE, CENTER_SILO_X, CENTER_ABM_SPEED, ABM_SPEED,
    clusterMode, addScore, CITY_EVERY, REVIVE_FX_TICKS,
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

// ------------------------------------------------------- cruise saucers --------
// #3629 — the wave-6 ferry. Two jobs: prove the gate (waves 1..5 stay
// byte-identical to the pre-saucer sim — constants recorded from the OLD
// code, see git history of this PR) and prove the mechanic (entry, launches,
// the 125-point kill, and the wave-clear hold).
console.log('saucers (#3629): the wave gate holds byte-exact')
{
    const t5 = (seed) => {
        const gs = makeRun(seed)
        let h = 2166136261
        const mix = (n) => { h ^= Math.round(n * 1000) + 0x7fffffff; h = Math.imul(h, 16777619) }
        let guard = 0
        while (gs.wave <= PROVEN_WAVES && !gs.over && guard++ < 40000) {
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
    const PINNED = { 7922: 1284933163, 15841: 2147471376, 31660: 1756787345 }
    let drift = 0
    for (const [seed, want] of Object.entries(PINNED)) {
        const got = t5(Number(seed))
        if (got !== want) { drift++; console.log(`  drift seed ${seed}: ${got} != ${want}`) }
    }
    ok(drift === 0, 'waves 1..5 traces pin byte-identical to the pre-saucer sim (3 seeds)', `${drift} drifted`)
    ok(SAUCER_FIRST_WAVE === 6, 'the ferry gate sits at wave 6 (Atari 1981 manual §6)', `${SAUCER_FIRST_WAVE}`)
    // structural: nothing saucer-shaped exists below the gate, on every wave
    let early = 0
    for (let s = 1; s <= 8; s++) {
        const gs = makeRun(s * 7919 + 3)
        let guard = 0
        while (gs.wave < SAUCER_FIRST_WAVE && !gs.over && guard++ < 40000) {
            tickMc(gs, gunnerStep(gs))
            if (gs.saucers.length > 0 || gs.saucersLeftInWave > 0) early++
        }
    }
    ok(early === 0, 'no saucer lives or is owed below the gate (8 seeds)', `${early}`)
}

console.log('saucers (#3629): entry, launches, the 125 kill, the wave hold')
{
    ok(SAUCER_SCORE === 125, 'an enemy cruise missile scores 125 (manual Table 1)', `${SAUCER_SCORE}`)
    // guaranteed entry at the gate, and it launches real warheads
    let entered = 0, launched = 0
    for (let s = 1; s <= 12; s++) {
        const gs = makeRun(s * 7919 + 3)
        let guard = 0, sawEntry = 0, sawFire = 0
        while (gs.wave <= SAUCER_FIRST_WAVE && !gs.over && guard++ < 40000) {
            tickMc(gs, gunnerStep(gs))
            if (gs.events.includes('saucer')) sawEntry++
            if (gs.events.includes('cruisefire')) sawFire++
        }
        if (sawEntry > 0) entered++
        launched += sawFire
    }
    ok(entered === 12, 'every seed sees its wave-6 ferry cross (12/12)', `${entered}/12`)
    ok(launched >= 12, `ferries fight back: ${launched} cruise launches across 12 raids (not a free target)`)
    // deterministic replay at the gate
    const t6 = (seed) => {
        const gs = makeRun(seed)
        let h = 2166136261
        const mix = (n) => { h ^= Math.round(n * 1000) + 0x7fffffff; h = Math.imul(h, 16777619) }
        let guard = 0
        while (gs.wave <= SAUCER_FIRST_WAVE && !gs.over && guard++ < 40000) {
            tickMc(gs, gunnerStep(gs))
            mix(gs.tick); mix(gs.score); mix(gs.warheads.length); mix(gs.saucers.length)
            for (const m of gs.warheads) { mix(m.x); mix(m.y) }
            for (const m of gs.saucers) { mix(m.x); mix(m.y) }
        }
        return h >>> 0
    }
    ok(t6(4242) === t6(4242), 'wave-6 raid replays byte-equal from the seed')
    ok(t6(4242) !== t6(4243), 'different seed → different ferry run')
    // kill: blast meets hull envelope → gone, +125, wreck fireball next life
    const gs = makeRun(77)
    gs.wave = SAUCER_FIRST_WAVE
    gs.saucers = [{ id: 1, x: 400, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 }]
    gs.blasts = [{ x: 400, y: 160, radius: 5, growing: true, color: '#fff' }]
    const s0 = gs.score
    tickMc(gs, null)
    ok(gs.saucers.length === 0 && gs.score - s0 === SAUCER_SCORE, 'a fireball that touches the hull burns it for 125')
    ok(gs.blasts.some((b) => b.x === 400 && b.y === 160), 'the kill leaves its own wreck fireball')
    // the wave cannot clear while a ferry is owed, and does once it has crossed
    const g2 = makeRun(78)
    g2.wave = SAUCER_FIRST_WAVE
    startWave(g2)
    g2.spawning = false
    g2.missilesLeftInWave = 0
    g2.warheads = []; g2.blasts = []
    let clearTooEarly = 0, guard = 0
    while (g2.state === 'playing' && guard++ < 3000) {
        tickMc(g2, null)
        if (g2.state === 'playing' && g2.saucersLeftInWave > 0) clearTooEarly++ // still owed, still holding
    }
    ok(g2.state === 'waveEnd' && g2.wave === SAUCER_FIRST_WAVE + 1, 'the wave holds until the owed ferry enters and exits', `${g2.state}/w${g2.wave}`)
    ok(clearTooEarly > 0, 'a wave with a ferry still owed never reads clear', `${clearTooEarly}`)
    // gunner doctrine: never gambles on the ferry while a warhead is uncovered
    const g3 = makeRun(79)
    g3.wave = SAUCER_FIRST_WAVE
    startWave(g3)
    g3.saucers = [{ id: 1, x: SCREEN_WIDTH / 2, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 }]
    g3.warheads = [{ id: 9, x: 100, y: 80, startX: 100, startY: 0, targetX: 120, targetY: 550, speed: 1.1, color: '#f00', coverUntil: 0 }]
    const shot = gunnerStep(g3)
    ok(shot && shot.wid === 9, 'cities before bonus: the uncovered warhead owns the shot, not the ferry', `wid ${shot && shot.wid}`)
    g3.warheads = []
    g3.saucers = [{ id: 2, x: 20, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 }]
    ok(gunnerStep(g3) === null, 'no edge-pop: the gunner ignores a ferry still at the rim')
    g3.saucers = [{ id: 3, x: SCREEN_WIDTH / 2, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 }]
    const bonus = gunnerStep(g3)
    ok(bonus && bonus.wid === 3, 'with the sky clean, the gunner takes the mid-board bonus shot', `wid ${bonus && bonus.wid}`)
    ok(bonus && bonus.boom > g3.tick && bonus.aimY === 160, 'the bonus shot leads the ferry with its own detonation tick')
}

// --------------------------------------------- #3638 deep doctrine (A/B) ---------
// The watch's ferry opportunism, measured rather than asserted: run every
// seed twice at waves 6–10 — bonus on, bonus off — and pin what the arcade
// expert's habit is allowed to feel like: it never costs a city, it pays when
// the wave can afford it (waves 6–8 pay all seeds; at the 9–10 ammo horizon,
// 30 shells against ~34 warheads once the ferries shoot back, the reserve
// rule lets the 125 go rather than gamble a city), and nothing stalls.
console.log('saucers (#3638): deep doctrine waves 6..10, bonus on vs off')
{
    const run = (seed, wave, noBonus) => {
        const gs = makeRun(seed)
        gs.wave = wave
        startWave(gs, { noSmart: true }) // #3630 isolation: ferry doctrine graded bit-exact against the pre-smart sim (arrivals AND their die)
        let guard = 0
        while (gs.wave <= wave && !gs.over && guard++ < 40000) tickMc(gs, gunnerStep(gs, { noBonus }))
        return { over: gs.over, wave: gs.wave, cities: citiesAlive(gs), score: gs.score }
    }
    let stalls = 0, cityCost = 0, unpaid = 0, paid = 0
    for (let s = 1; s <= 12; s++) {
        const seed = s * 7919 + 3
        for (const w of [6, 7, 8, 9, 10]) {
            const a = run(seed, w, false), b = run(seed, w, true)
            if (a.over || a.wave !== w + 1) { stalls++; console.log(`  stall seed ${seed} w${w}`) }
            if (a.cities < b.cities) { cityCost++; console.log(`  city-cost seed ${seed} w${w}: ${a.cities} vs ${b.cities}`) }
            if (a.score < b.score) { cityCost++; console.log(`  score-down seed ${seed} w${w}`) }
            if (w <= 8) { if (a.score > b.score) paid++; else { unpaid++; console.log(`  unpaid seed ${seed} w${w}`) } }
        }
    }
    ok(stalls === 0, 'every seed clears waves 6..10 with the ferry seat aboard (60 raids)', `${stalls}`)
    ok(cityCost === 0, 'the reserve rule: the bonus never costs a city (or a point) vs no-bonus', `${cityCost}`)
    ok(paid === 36 && unpaid === 0, 'waves 6..8: every seed is paid for its ferries (36/36)', `${paid}/36`)
    // reserve rule units: a thin magazine holds fire; a truly spare one takes it
    const g = makeRun(7)
    g.wave = 9
    startWave(g)
    g.spawning = false
    g.missilesLeftInWave = 20
    g.saucersLeftInWave = 0
    g.saucers = [
        { id: 1, x: 400, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 },
        { id: 2, x: 100, y: 180, dir: 1, speed: 2, fireTimer: 9999, frame: 0 },
    ]
    g.silos.forEach((s) => { s.ammo = 8 }) // 24 shells vs debt 20 spawns + the OTHER ferry's ~6 crossing
    ok(gunnerStep(g) === null, 'reserve rule: 20 warheads yet to spawn + a shooting ferry outrank the 125', `${gunnerStep(g)}`)
    g.silos.forEach((s) => { s.ammo = 30 })
    ok(gunnerStep(g) !== null, 'reserve rule: real surplus still buys the 125', 'held fire')
}

// ------------------------------------------------ #3638 juice + attract ad -----
console.log('saucers (#3638): kill juice, and the attract ferry scripted by tick')
{
    // a kill sparks flash + debris, and neither gates the wave clear
    const gs = makeRun(77)
    gs.wave = SAUCER_FIRST_WAVE
    gs.saucers = [{ id: 1, x: 400, y: 160, dir: 1, speed: 2, fireTimer: 9999, frame: 0 }]
    gs.blasts = [{ x: 400, y: 160, radius: 5, growing: true, color: '#fff' }]
    tickMc(gs, null)
    ok(gs.debris.length === 6 && gs.flash, 'a burned ferry bursts into flash + debris', `${gs.debris.length}/${gs.flash ? 'flash' : 'none'}`)
    gs.spawning = false
    gs.missilesLeftInWave = 0
    gs.warheads = []
    let guard = 0
    while (gs.state === 'playing' && guard++ < 300) tickMc(gs, null)
    ok(gs.state === 'waveEnd' && gs.wave === SAUCER_FIRST_WAVE + 1 && gs.debris.length === 0 && !gs.flash,
        'debris flies while the wave clears — cosmetic, never the clear-law', `${gs.state}/w${gs.wave} d${gs.debris.length}`)
    // below the gate the juice never exists (dice stay out of waves 1..5)
    let earlyJuice = 0
    for (let s = 1; s <= 8; s++) {
        const g2 = makeRun(s * 7919 + 3)
        let g3 = 0
        while (g2.wave < SAUCER_FIRST_WAVE && !g2.over && g3++ < 40000) tickMc(g2, gunnerStep(g2))
        if (g2.debris.length > 0 || g2.flash) earlyJuice++
    }
    ok(earlyJuice === 0, 'no flash or debris below the gate (8 seeds)', `${earlyJuice}`)
    // attract ad: two different seeds must see the SAME scripted sightings —
    // that is the proof attractFerry consults no dice (the determinism story
    // the polish ask asked us to weigh; the ad pays into it for free).
    const sighting = (seed) => {
        const g = makeRun(seed)
        let n = 0
        while (g.tick < 721 && n++ < 800) { tickMc(g, null); attractFerry(g) }
        return g.saucers.map((s) => `${Math.round(s.x)},${s.y},${s.dir}`).join('|')
    }
    const g = makeRun(5)
    let ticks = 0
    let firstAt = 0
    while (!firstAt && ticks++ < 4000) { tickMc(g, null); attractFerry(g); if (g.saucers.length > 0) firstAt = g.tick }
    ok(firstAt === ATTRACT_FERRY_EVERY, 'attract ferry crosses at a scripted tick (no dice)', `tick ${firstAt}`)
    ok(sighting(5) === sighting(99999), 'identical sightings whatever the seed — attract is scripted, not seeded')
    let n2 = 0
    const g2 = makeRun(5)
    let second = null
    // ferry #1 exits ~tick 751; the tick-720 slot waits for the sky, the
    // tick-1080 slot spawns sighting #2 (side/altitude alternate)
    while (n2++ < 1150 && !second) {
        tickMc(g2, null); attractFerry(g2)
        if (g2.attractFerries === 2) second = { y: g2.saucers[g2.saucers.length - 1].y, dir: g2.saucers[g2.saucers.length - 1].dir }
    }
    ok(second && second.y === 156 && second.dir === -1, 'the second sighting alternates side and altitude (advertising, not a loop frozen on one frame)', JSON.stringify(second))
}

// ---------------------------------------------------------- smart bombs --------
// #3630 — the evasive warhead and its arcade counter. Wikipedia (verbatim):
// "The missiles of the center battery fly to their targets at much greater
// speed than those fired from the other two; only these missiles can
// effectively destroy a smart bomb at a distance." Manual §6: they "detect and
// evade your ABM explosions"; §7 hint 3: aimed directly on them "the enemy
// cannot detect your ABMs". The gate at wave 7 keeps the waves 1..6 RNG and
// every saucer pin byte-identical.
console.log('smart bombs (#3630): the wave gate holds, the batteries split by speed')
{
    ok(SMART_FIRST_WAVE === 7, 'the smart-bomb gate sits one wave behind the ferry (§6 "after the 6th wave")', `${SMART_FIRST_WAVE}`)
    ok(CENTER_ABM_SPEED === 28, 'the center battery flies much greater speed (28 vs 15)', `${CENTER_ABM_SPEED}`)
    // the speed split is live-fire, per battery, and only from the gate
    const g1 = makeRun(4001); tickMc(g1, { aimX: 400, aimY: 300 })
    ok(g1.abms.length === 1 && g1.abms[0].speed === 15, 'below the gate the center battery still flies 15 (byte-parity preserved)')
    const g2 = makeRun(4002); g2.wave = SMART_FIRST_WAVE; startWave(g2)
    tickMc(g2, { aimX: 400, aimY: 300 })
    tickMc(g2, { aimX: 120, aimY: 300 })
    ok(g2.abms[0].speed === CENTER_ABM_SPEED && g2.abms[0].center === true,
        'from the gate, a center click launches the fast ABM', `speed ${g2.abms[0].speed}`)
    ok(g2.abms[1].speed === 15 && g2.abms[1].center === false,
        'outer batteries keep the slow ABM — only the center is the counter')
    // structural: nothing smart lives or is owed below the gate, on every wave
    let early = 0
    for (let s = 1; s <= 8; s++) {
        const gs = makeRun(s * 7919 + 3)
        let guard = 0
        while (gs.wave < SMART_FIRST_WAVE && !gs.over && guard++ < 40000) {
            tickMc(gs, gunnerStep(gs))
            if (gs.warheads.some((m) => m.smart) || gs.smartLeftInWave > 0) early++
        }
    }
    ok(early === 0, 'no smart bomb lives or is owed below the gate (8 seeds)', `${early}`)
}

console.log('smart bombs (#3630): entry, evade, the center-only kill, the wave hold')
{
    // guaranteed entry at the gate on every seed, aimed at live structures
    const STRUCT_X = [120, 200, 280, 520, 600, 680, 40, 400, 760]
    let entered = 0, onTarget = 0, total = 0
    for (let s = 1; s <= 12; s++) {
        const gs = makeRun(s * 7919 + 3)
        let guard = 0, saw = 0
        while (gs.wave <= SMART_FIRST_WAVE && !gs.over && guard++ < 40000) {
            const before = gs.warheads.length
            tickMc(gs, gunnerStep(gs))
            if (gs.events.includes('smart')) {
                saw++
                const m = gs.warheads.slice(before).find((w) => w.smart) || gs.warheads.find((w) => w.smart)
                total++
                if (m && STRUCT_X.includes(m.targetX)) onTarget++
            }
        }
        if (saw > 0) entered++
    }
    ok(entered === 12, 'every seed sees a smart bomb in its wave-7 raid (12/12)', `${entered}/12`)
    ok(onTarget === total, `smart bombs aim at live structures (${onTarget}/${total})`)
    // deterministic replay across the gate
    const t7 = (seed) => {
        const gs = makeRun(seed)
        let h = 2166136261
        const mix = (n) => { h ^= Math.round(n * 1000) + 0x7fffffff; h = Math.imul(h, 16777619) }
        let guard = 0
        while (gs.wave <= SMART_FIRST_WAVE && !gs.over && guard++ < 40000) {
            tickMc(gs, gunnerStep(gs))
            mix(gs.tick); mix(gs.score); mix(gs.warheads.length); mix(gs.abms.length)
            for (const m of gs.warheads) { mix(m.x); mix(m.y); mix(m.smart ? 1 : 0); mix(m.evTicks) }
            for (const a of gs.abms) { mix(a.speed); mix(a.blind ? 1 : 0); mix(a.center ? 1 : 0) }
        }
        return h >>> 0
    }
    ok(t7(9090) === t7(9090), 'the wave-7 raid replays byte-equal from the seed')
    ok(t7(9090) !== t7(9091), 'different seed → different smart-bomb raid')
    // hard counter-rule: an outer-battery fireball passes through a smart bomb
    const mk = (seed) => {
        const g = makeRun(seed)
        g.wave = SMART_FIRST_WAVE; startWave(g)
        g.spawning = false; g.missilesLeftInWave = 0; g.warheads = []; g.blasts = []; g.abms = []
        g.saucersLeftInWave = 0; g.saucers = []
        return g
    }
    const bomb = (id, x, y, tx) => ({ id, x, y, startX: x, startY: 0, targetX: tx, targetY: 550,
        speed: 1.6, coverUntil: 0, smart: true, evTicks: 0, evadeX: 0, evadeY: 0, trail: [] })
    const g3 = mk(77)
    g3.warheads = [bomb(1, 300, 300, 280)]
    g3.blasts = [{ x: 300, y: 300, radius: 10, growing: true, center: false, color: '#fff' }]
    const s0 = g3.score
    tickMc(g3, null)
    ok(g3.warheads.length === 1 && g3.score === s0, 'an outer-battery fireball cannot kill a smart bomb (arcade counter-rule)')
    const g4 = mk(78)
    g4.warheads = [bomb(1, 300, 300, 280)]
    g4.blasts = [{ x: 300, y: 300, radius: 10, growing: true, center: true, color: '#fff' }]
    const s1 = g4.score
    tickMc(g4, null)
    ok(g4.warheads.length === 0 && g4.score - s1 === SMART_SCORE && g4.events.includes('smartkill'),
        `a center-battery fireball kills it for ${SMART_SCORE} (arcade ICBM-class tax)`)
    ok(g4.blasts.some((b) => b.center), 'the kill leaves its own wreck fireball')
    // §6 detect & evade: an incoming, seen ABM pushes the bomb off its line
    const g5 = mk(79)
    g5.warheads = [bomb(1, 400, 300, 400)]
    g5.silos[1].ammo = 10
    fireAt(g5, 440, 300) // seen (40 px off the core) and its path crosses the bomb's — the bomb must read it coming
    const straight = { x: 400, y: 300 + 1.6 }
    let drift = 0
    for (let i = 0; i < 12 && g5.abms.length; i++) {
        tickMc(g5, null)
        const m = g5.warheads[0]
        if (m) drift = Math.max(drift, Math.abs(m.x - straight.x))
        g5.abms.forEach((a) => { if (a.dead) return })
    }
    ok(drift > 4, `a seen ABM bends the smart bomb off its line (${Math.round(drift)} px lateral)`)
    // §7 hint 3: aimed directly on it, the enemy cannot detect the shot
    const g6 = mk(80)
    g6.warheads = [bomb(1, 400, 300, 400)]
    fireAt(g6, 400, 310) // ~10 px off the core → blind
    ok(g6.abms[0] && g6.abms[0].blind === true, 'a crosshair ON the bomb is a blind shot (manual §7 hint 3)')
    let guard6 = 0
    while (guard6++ < 40 && g6.warheads.length > 0) tickMc(g6, null)
    ok(g6.warheads.length === 0, 'the blind shot kills — evasion never registers it')
    const g7 = mk(81)
    g7.warheads = [bomb(1, 400, 300, 400)]
    fireAt(g7, 470, 300) // 70 px off → seen
    ok(g7.abms[0] && g7.abms[0].blind === false, 'a shot 70 px off is detected')
    // the wave cannot clear while a smart bomb is owed or falling
    const g8 = mk(82)
    g8.smartLeftInWave = 1
    g8.smartTimer = 30
    let clearTooEarly = 0, guard8 = 0
    while (g8.state === 'playing' && guard8++ < 3000) {
        tickMc(g8, null)
        if (g8.state === 'playing' && (g8.smartLeftInWave > 0 || g8.warheads.some((m) => m.smart))) clearTooEarly++
    }
    ok(g8.state === 'waveEnd' && g8.wave === SMART_FIRST_WAVE + 1,
        'the wave holds until the owed smart bomb falls, then clears', `${g8.state}/w${g8.wave}`)
    ok(clearTooEarly > 0, 'a wave with a smart bomb still owed never reads clear', `${clearTooEarly}`)
}

console.log('smart bombs (#3630): the watch fights back with the center battery')
{
    // one falling smart bomb over the board: the watch answers with the ONLY
    // battery that can kill it and keeps every city. Cross-sector counts too —
    // the arcade's three buttons let the center reach any part of the sky.
    const scenario = (bx, by, tx, seed) => {
        const g = makeRun(seed)
        g.wave = SMART_FIRST_WAVE; startWave(g)
        g.spawning = false; g.missilesLeftInWave = 0; g.warheads = []; g.blasts = []; g.abms = []
        g.saucersLeftInWave = 0; g.saucers = []
        g.warheads = [({ id: 1, x: bx, y: by, startX: bx, startY: 0, targetX: tx, targetY: 550,
            speed: 1.7, coverUntil: 0, smart: true, evTicks: 0, evadeX: 0, evadeY: 0, trail: [] })]
        let guard = 0, shots = 0, killed = false, everCenterOrigin = false
        while (guard++ < 700 && !g.over) {
            const cmd = gunnerStep(g)
            if (cmd && cmd.silo != null) { shots++; everCenterOrigin = g.silos[cmd.silo].x === CENTER_SILO_X }
            tickMc(g, cmd)
            if (g.events.includes('smartkill')) { killed = true; break }
        }
        return { killed, shots, cities: citiesAlive(g), everCenterOrigin }
    }
    const c = scenario(400, 140, 400, 1234)
    ok(c.killed && c.cities === 6, 'watch kills a center-sector smart bomb with the cities untouched', `killed ${c.killed}, cities ${c.cities}, ${c.shots} shots`)
    ok(c.everCenterOrigin && c.shots <= 5, 'the answer comes from the center battery, without spraying', `${c.shots} shots`)
    const l = scenario(200, 120, 120, 2345)
    ok(l.killed && l.cities === 6, 'a smart bomb over the OUTER sector still dies — center battery reaches cross-sector (3-button law)', `killed ${l.killed}, cities ${l.cities}, ${l.shots} shots`)
    // doctrine: an uncovered warhead outranks the exotic
    const g = makeRun(3456)
    g.wave = SMART_FIRST_WAVE; startWave(g)
    g.spawning = false; g.missilesLeftInWave = 0; g.warheads = []; g.blasts = []; g.abms = []
    g.saucersLeftInWave = 0; g.saucers = []
    g.warheads = [
        { id: 9, x: 100, y: 80, startX: 100, startY: 0, targetX: 120, targetY: 550, speed: 1.1, color: '#f00', coverUntil: 0 },
        { id: 8, x: 400, y: 140, startX: 400, startY: 0, targetX: 400, targetY: 550, speed: 1.7, coverUntil: 0, smart: true, evTicks: 0, evadeX: 0, evadeY: 0, trail: [] },
    ]
    const shot = gunnerStep(g)
    ok(shot && shot.wid === 9, 'cities before exotics: the uncovered ICBM owns the shot ahead of the smart bomb', `wid ${shot && shot.wid}`)
}

// --------------------------------- #3698 fairness read: immunity shimmer + ad ----
// QA #3698 items 2–3: the outer-immunity pass must READ as a rule (a cyan
// shimmer marks the moment an outer fireball goes harmlessly through a smart
// bomb), and the attract screen must advertise the wave-7 threat the way it
// advertises the ferry — scripted by tick, never dice. Both are cosmetic by
// contract: no dice, no events, no score, no movement, so the byte pins stay
// exactly where #3630 left them.
console.log('fairness read (#3698): the immune pass shimmers; the ad flies a scripted smart bomb')
{
    const gs = makeRun(77)
    gs.wave = SMART_FIRST_WAVE; startWave(gs)
    gs.smartLeftInWave = 0
    gs.spawning = false; gs.missilesLeftInWave = 0; gs.saucersLeftInWave = 0 // quiet the ladder: only the scenario rolls
    gs.warheads = [{ id: 5, x: 120, y: 200, startX: 120, startY: 0, targetX: 120, targetY: 550, speed: 0.001, color: '#f00', coverUntil: 0, smart: true, evTicks: 0, evadeX: 0, evadeY: 0, trail: [] }]
    gs.blasts = [{ x: 120, y: 200, radius: 1, growing: true, center: false, color: '#fff' }]
    let dice = 0 // spy on the dice: the immune-pass ticks must consume none
    const rand0 = gs.rand
    gs.rand = () => { dice++; return rand0() }
    tickMc(gs, null)
    ok(gs.resist.length === 1 && gs.warheads.some((m) => !m.dead),
        'an outer fireball through the core marks a shimmer and the bomb survives', `resist ${gs.resist.length}`)
    tickMc(gs, null)
    ok(gs.resist.length === 1, 'one shimmer per blast-bomb pair — the mark never strobes', `${gs.resist.length}`)
    ok(dice === 0, 'the immune pass consults no dice (the byte pins stay honest)', `${dice} rolls`)
    gs.warheads[0].x = 120; gs.warheads[0].y = 200 // undo the evade drift before the kill tick
    gs.blasts = [{ x: 120, y: 200, radius: 1, growing: true, center: true, color: '#fff' }]
    tickMc(gs, null)
    ok(gs.warheads.length === 0 && gs.resist.length === 1,
        'a center blast KILLS — and a kill never shimmers (cyan = immunity, fire burns its own language)', `resist ${gs.resist.length}`)
    for (let i = 0; i < 12; i++) tickMc(gs, null)
    ok(gs.resist.length === 0, 'shimmers decay — cosmetic, never gates anything', `${gs.resist.length}`)
    // below the gate nothing can shimmer: no smart exists, so no contact exists
    const g1 = makeRun(4242)
    let t1 = 0
    while (g1.wave < SMART_FIRST_WAVE && !g1.over && t1++ < 40000) tickMc(g1, gunnerStep(g1))
    ok(g1.resist.length === 0, 'no shimmers before the wave-7 gate (7 seeds ride: one seeded raid shown, gate law makes the rest impossible)', `${g1.resist.length}`)
    // attract ad: scripted by tick like the ferry — first sighting lands exactly
    // on the offset slot, whatever the seed, and sightings alternate sides.
    let g2 = makeRun(5)
    let firstSmartAt = 0
    let n2 = 0
    while (!firstSmartAt && n2++ < 600) { tickMc(g2, null); attractSmart(g2); if (g2.warheads.some((m) => m.attract)) firstSmartAt = g2.tick }
    ok(firstSmartAt === ATTRACT_SMART_EVERY / 2, 'the attract smart bomb crosses at a scripted tick (no dice)', `tick ${firstSmartAt}`)
    const firstSighting = (seed) => {
        const g = makeRun(seed)
        let n = 0
        while (g.tick < 275 && n++ < 400) { tickMc(g, null); attractSmart(g) }
        return g.warheads.filter((m) => m.attract).map((m) => `${Math.round(m.x)},${m.targetX}`).join('|')
    }
    ok(firstSighting(5) === firstSighting(99999) && firstSighting(5) !== '',
        'identical first sightings whatever the seed — the ad is scripted, not seeded', firstSighting(5))
    let g3 = makeRun(9)
    let second = null
    n2 = 0
    // sighting #1 (tick 270) falls ~tick 630; the tick-810 slot spawns #2 —
    // mirrored side, the ad alternating like the ferry's does
    while (n2++ < 830 && !second) { tickMc(g3, null); attractSmart(g3); if (g3.attractSmarts === 2) second = { sx: Math.round(g3.warheads[g3.warheads.length - 1].startX) } }
    ok(second && second.sx === 600, 'the second sighting crosses the other side of the board (advertising, not one frozen frame)', JSON.stringify(second))
    // the ad never lies: a sighting IS a smart bomb — same flag, same physics
    const g4 = makeRun(5)
    n2 = 0
    let isSmart = false
    while (n2++ < 300 && !isSmart) { tickMc(g4, null); attractSmart(g4); isSmart = g4.warheads.some((m) => m.attract && m.smart) }
    ok(isSmart, 'the advertised craft is a real smart bomb (smart flag, evade physics, the real tell paints it)')
    // and the ad never breaks the game: an attract bomb must not hold a wave
    ok(ATTRACT_SMART_EVERY % ATTRACT_FERRY_EVERY !== 0 && (ATTRACT_SMART_EVERY / 2) % ATTRACT_FERRY_EVERY !== 0,
        'the smart offset never lands on the ferry grid — one advertised feature at a time', `${ATTRACT_SMART_EVERY}/2 vs ${ATTRACT_FERRY_EVERY}`)
}

// ------------------------------------------------- #3695: three-button law ----
// The arcade's control law, exposed to the player (README gap 1). Wikipedia
// §Gameplay (verbatim): the player moves the crosshair by trackball "and
// pressing one of three buttons to launch a counter-missile from the
// appropriate battery" — the BUTTON names the launcher; where the aim sits is
// the click law's business, not the button's. The sim has served the watch
// this way since #3630 (`cmd.silo`); fireBattery is the human door. These
// pins grade the sim half; the shell wiring (keys 1/2/3, the phone FAST pad)
// rides in the wiring section, and mcbatterydrive proves it in real Chrome.
console.log('three-button law (#3695): fireBattery names its battery from any sector')
{
    // key 2 aimed deep in the LEFT sector: the click law would answer silo 0
    // (|40−120| beats |400−120|) — the named battery must win instead.
    const g = makeRun(4001)
    ok(fireBattery(g, 1, 120, 300) === true, 'key 2 answers on a live board')
    ok(g.abms.length === 1 && Math.round(g.abms[0].startX) === CENTER_SILO_X,
        'the CENTER battery launches from x=400 aimed deep in the LEFT sector',
        g.abms.length ? `startX ${g.abms[0].startX}` : 'no ABM')
    ok(g.silos[0].ammo === 10 && g.silos[1].ammo === 9,
        'only the named battery spends (left stays 10, center drops to 9)',
        `${g.silos[0].ammo}/${g.silos[1].ammo}`)
    // keys 1 and 3 name their own batteries, from a center aim
    const g2 = makeRun(4002)
    fireBattery(g2, 0, 400, 200); fireBattery(g2, 2, 400, 200)
    ok(g2.abms.length === 2 && Math.round(g2.abms[0].startX) === 40 && Math.round(g2.abms[1].startX) === 760,
        'keys 1 and 3 launch from their own batteries (40 / 760), not the nearest',
        g2.abms.map((a) => Math.round(a.startX)).join(','))
    // the speed law rides the battery and the wave, not the key (§6)
    ok(g2.abms.every((a) => a.speed === ABM_SPEED && a.center === false),
        'below the gate every battery flies the standard ABM — the fast law stays the wave\'s')
    const g3 = makeRun(4003); g3.wave = SMART_FIRST_WAVE; startWave(g3)
    fireBattery(g3, 1, 120, 300); fireBattery(g3, 0, 400, 300)
    ok(g3.abms[0] && g3.abms[0].speed === CENTER_ABM_SPEED && g3.abms[0].center === true,
        'from the gate the named CENTER battery flies 28 with the smart-kill flag, from ANY sector',
        g3.abms[0] ? `${g3.abms[0].speed} center=${g3.abms[0].center}` : 'no ABM')
    ok(g3.abms[1] && g3.abms[1].speed === ABM_SPEED,
        'the outer battery stays 15 at the gate — key 2 IS the fast call',
        g3.abms[1] ? `${g3.abms[1].speed}` : 'no ABM')
    // manual §7 hint 3 rides this door too: aim ON the bomb and it never sees it
    const g3b = makeRun(4004); g3b.wave = SMART_FIRST_WAVE; startWave(g3b)
    g3b.warheads = [{ id: 9, x: 400, y: 300, startX: 400, startY: 0, targetX: 400, targetY: 550,
        speed: 1.7, color: '#f00', coverUntil: 0, smart: true, evTicks: 0, evadeX: 0, evadeY: 0, trail: [] }]
    fireBattery(g3b, 1, 400, 310)
    ok(g3b.abms[0] && g3b.abms[0].blind === true, 'a battery-keyed shot ON the bomb is blind (manual §7 hint 3)')
    // duds, not reroutes: fireFrom keeps its gates behind the new door
    const g4 = makeRun(4005); g4.silos[1].alive = false
    ok(fireBattery(g4, 1, 400, 300) === false && g4.abms.length === 0,
        'a DEAD battery named by its key is a dud — the shot never reroutes to a neighbour')
    const g5 = makeRun(4006); g5.silos[1].ammo = 0
    ok(fireBattery(g5, 1, 400, 300) === false && g5.abms.length === 0,
        'an EMPTY battery is a dud — no free shot borrowed from the click law')
    ok(fireBattery(g5, 7, 400, 300) === false, 'an index off the board is refused')
    g5.state = 'gameOver'
    ok(fireBattery(g5, 0, 400, 300) === false, 'no battery fires outside play')
    // the mouse keeps its law untouched: nearest battery, byte for byte
    const g6 = makeRun(4007)
    fireAt(g6, 120, 300)
    ok(g6.abms.length === 1 && Math.round(g6.abms[0].startX) === 40,
        'a mouse click still takes the NEAREST battery (left-sector aim → left silo) — old law intact',
        g6.abms.length ? `startX ${g6.abms[0].startX}` : 'no ABM')
    // the hot-seat duty guard is the shell's; the sim stays seat-agnostic:
    // a named battery fires identically whichever seat owns the board.
    const g7 = makeRun(4008, { twoPlayer: true })
    ok(fireBattery(g7, 2, 500, 200) === true && Math.round(g7.abms[0].startX) === 760 && g7.turn === 1,
        'hot-seat: the sim fires the named battery; the seat guard lives in the shell (key never reaches it off-duty)')
}

// ------------------------------------------- #3630 slice 2: 2P alternating seats ----
// Manual §6 (games 18–34): players alternate one wave at a time, both scores
// display, cities and silos are SHARED — a burn on your wave costs your partner
// too — the between-wave bonus pays whoever played the wave, and THE END lands
// when the last city falls, higher book wins. Solo touches none of this: the
// flip consumes no dice and gs.score stays player 1's ledger (both halves are
// pinned below — the seat law AND the byte parity around it).
console.log('2P alternating (#3630 slice 2): flip, ledgers, shared board')
{
    ok(makeRun(4242).twoP === false && makeRun(4242).turn === 1 && makeRun(4242).score2 === 0,
        'solo keeps its shape: no second ledger, P1 owns the board')

    // Empty the sky inside the live clear law and the wave closes this tick.
    const emptySky = (g) => {
        g.missilesLeftInWave = 0; g.spawning = false
        g.warheads.length = 0; g.blasts.length = 0; g.abms.length = 0
        g.saucers.length = 0; g.saucersLeftInWave = 0; g.smartLeftInWave = 0
        tickMc(g, null)
    }

    const solo2 = makeRun(4242)
    emptySky(solo2)
    ok(solo2.turn === 1 && solo2.score2 === 0 && !solo2.events.includes('turn'),
        'the flip is twoP-gated: a solo wave closes without a hand-off')

    const g = makeRun(4242, { twoPlayer: true })
    ok(g.twoP === true && g.turn === 1 && g.p2cpu === true,
        'a 2P run opens with P1 on wave 1 and the CPU holding seat 2')
    const turnsAfter = []
    const wavesAfter = []
    let resumed = 0
    for (let w = 0; w < 4; w++) {
        emptySky(g)
        turnsAfter.push(g.turn)
        wavesAfter.push(g.wave)
        let guard = 0
        while (g.state === 'waveEnd' && guard++ < WAVE_BREAK_TICKS + 5) tickMc(g, null)
        if (g.state === 'playing' && g.wave === wavesAfter[w]) resumed++
    }
    ok(JSON.stringify(turnsAfter) === JSON.stringify([2, 1, 2, 1]),
        'the board alternates every wave — P2 takes 2 and 4, P1 hands over after 1 and 3',
        JSON.stringify(turnsAfter))
    ok(JSON.stringify(wavesAfter) === JSON.stringify([2, 3, 4, 5]),
        'the hand-off rides real wave clears', JSON.stringify(wavesAfter))
    ok(resumed === 4, 'each hand-off resumes after the sim-clock break', `${resumed}/4`)

    // Ledgers: the bonus pays the seat that played; the shared board carries
    // its damage across the hand-off — the strategy core of the mode.
    const g2 = makeRun(555, { twoPlayer: true })
    emptySky(g2)
    ok(g2.score === 2100 && g2.score2 === 0,
        'the wave-1 bonus pays P1: 600 cities + 1500 spare shells', `${g2.score}/${g2.score2}`)
    let guard2 = 0 // bounded: the wave-break mutant must leave this loop, not hang it
    while (g2.state === 'waveEnd' && guard2++ < WAVE_BREAK_TICKS + 10) tickMc(g2, null)
    g2.cities[0].alive = false // P2 inherits the hole P1's wave left standing over
    emptySky(g2)
    ok(g2.score === 2100 && g2.score2 === 2000,
        'the wave-2 bonus pays P2 — and pays it SHORT, because the board is shared',
        `${g2.score}/${g2.score2}`)

    // Kills credit the live seat, warhead and ferry alike.
    const g3 = makeRun(556, { twoPlayer: true })
    g3.turn = 2
    g3.warheads = [{ id: 1, x: 400, y: 300, startX: 400, startY: 0, targetX: 400, targetY: 550, speed: 1.7, color: '#f00', coverUntil: 0 }]
    g3.blasts = [{ x: 400, y: 300, radius: 10, growing: true, center: false, color: '#fff' }]
    let guard3 = 0
    while (g3.warheads.length && guard3++ < 60) tickMc(g3, null)
    ok(g3.score === 0 && g3.score2 === 25, 'a 25 on P2\'s wave lands in score2', `${g3.score}/${g3.score2}`)
    g3.saucers = [{ id: 2, x: 400, y: 150, dir: 1, speed: 2, fireTimer: 9999, frame: 0, coverUntil: 0 }]
    g3.blasts.push({ x: 400, y: 150, radius: 10, growing: true, center: false, color: '#fff' })
    guard3 = 0
    while (g3.saucers.length && guard3++ < 60) tickMc(g3, null)
    ok(g3.score === 0 && g3.score2 === 25 + SAUCER_SCORE,
        'the ferry\'s 125 pays the live seat too', `${g3.score}/${g3.score2}`)

    const wg = makeRun(9)
    wg.score = 100
    ok(winner(wg) === 1 && (wg.score2 = 100) && winner(wg) === 0 && (wg.score2 = 101) && winner(wg) === 2,
        'winner reads the bigger book, equal books are a draw')

    // Dice parity around the mode: one seed rolls the SAME warheads whether or
    // not a partner exists — the hot-seat changes seats, not the sky.
    const seqTrace = (seed, twoPlayer) => {
        const t = makeRun(seed, { twoPlayer })
        let h = ''
        let guard = 0
        while (guard++ < 5000 && !t.over) {
            tickMc(t, gunnerStep(t))
            h += `${t.wave}|${t.warheads.length}|${t.saucers.length}|${t.smartLeftInWave}|${t.cities.filter((c) => c.alive).length};`
        }
        return h
    }
    const t1 = seqTrace(4242, false)
    const t2 = seqTrace(4242, true)
    ok(t1 === t2 && t1.length > 1000,
        'solo and 2P trace byte-equal on one seed (5000 ticks, gunner aboard)',
        `${t1.length}/${t2.length}`)

    // The CPU seat is the certified gunner: P2's waves defend the shared board
    // with zero city damage on every seed, exactly what the sweep proves solo.
    let worstCities = 6
    let reachedP2 = 0
    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
        const cg = makeRun(seed, { twoPlayer: true })
        emptySky(cg) // P1 closes wave 1 untouched; the board hands over
        if (cg.turn !== 2) continue
        reachedP2++
        let guard = 0
        while (cg.state === 'waveEnd' && guard++ < WAVE_BREAK_TICKS + 5) tickMc(cg, null)
        guard = 0
        while (cg.state === 'playing' && guard++ < 6000) tickMc(cg, gunnerStep(cg))
        worstCities = Math.min(worstCities, citiesAlive(cg))
    }
    ok(reachedP2 === 8, 'every seed reaches the P2 wave through a real hand-off', `${reachedP2}/8`)
    ok(worstCities === 6, 'the CPU seat holds the shared board: 8 seeds, zero cities lost on P2\'s wave', `${worstCities}/6`)
}

// ---------------------------- #3760 p2 batteries (three-button law, seat 2) ----
// Seat 2 got its own Z/X/C named buttons (README engine note). The sim stays
// seat-agnostic — the named door (fireBattery, #3695) answers identically on
// either seat's wave, magazines are shared-board state, and kills still pay the
// seat in play. The NEW law lives in the shell's duty guard, so what this
// section grades is the physics the shell is allowed to reach; the guard and
// the keys are graded in the wiring pins and proven by mcp2battdrive.
console.log('p2 batteries (#3760): named-battery law rides seat 2\'s wave unchanged')
{
    const g = makeRun(7601, { twoPlayer: true })
    g.missilesLeftInWave = 0; g.spawning = false
    g.warheads.length = 0; g.blasts.length = 0; g.abms.length = 0
    g.saucers.length = 0; g.saucersLeftInWave = 0; g.smartLeftInWave = 0
    tickMc(g, null)
    let guard = 0
    while (g.state === 'waveEnd' && guard++ < WAVE_BREAK_TICKS + 5) tickMc(g, null)
    ok(g.turn === 2 && g.state === 'playing', 'seat 2 takes the board through a real hand-off', `${g.turn}/${g.state}`)
    fireBattery(g, 2, 500, 200); fireBattery(g, 0, 500, 200)
    ok(g.abms.length === 2 && Math.round(g.abms[0].startX) === 760 && Math.round(g.abms[1].startX) === 40
        && g.silos[2].ammo === 9 && g.silos[0].ammo === 9 && g.silos[1].ammo === 10,
        'named batteries launch from their own silos and spend only their own magazines on P2\'s wave',
        `${g.abms.map((a) => Math.round(a.startX)).join(',')} ammo ${g.silos.map((s) => s.ammo).join('/')}`)
    // a battery-named kill pays the live seat — addScore is seat law, not door law
    g.abms.length = 0
    g.warheads = [{ id: 1, x: 400, y: 300, startX: 400, startY: 0, targetX: 400, targetY: 550, speed: 1.7, color: '#f00', coverUntil: 0 }]
    g.blasts = [{ x: 400, y: 300, radius: 10, growing: true, center: false, color: '#fff' }]
    guard = 0
    while (g.warheads.length && guard++ < 60) tickMc(g, null)
    ok(g.score === 2100 && g.score2 === 25,
        'a named-battery kill on seat 2\'s wave lands in score2', `${g.score}/${g.score2}`)
    const g2 = makeRun(7602, { twoPlayer: true })
    tickMc(g2, null)
    ok(g2.abms.length === 0, 'no phantom shots from the latch\'s side — the sim fires only what the shell forwards')
}

// -------------------------------------- #3711 deep-wave doctrine (knots + silo-first) ----
// Measured magazine law: from wave ~9 the raid fields more warheads than the
// 30 shells the batteries refill with. The gunner gained two gated habits:
//  - KNOT: when the blast envelope provably sweeps a second open warhead,
//    spend one shell at the crossing point — a shell saved is a city owed.
//  - SILO-FIRST: under deficit, silo streams are answered before city streams,
//    because a dead silo forfeits the shells still loaded in it (~10) exactly
//    when the wave outgrows the magazine.
// Both engage only on the measured deficit (clusterMode); waves 1..5 pins and
// the 60-raid deep claims ran green untouched. The section also pins what was
// TESTED AND REJECTED: "sacrifice one city and let its stream through" costs
// cities at waves 8-12 (dead structures retarget the spawn dice — nothing
// absorbs leaks), so deep waves stay volume losses; the ceiling is honest.
console.log('deep doctrine (#3711): knot economy and silo-first under deficit')
{
    // The gate: no wave the magazine can pay declares a deficit.
    let falseDeficit = 0
    for (let s = 1; s <= 8; s++) {
        const gs = makeRun(s * 7919 + 3)
        for (let w = 1; w <= 7; w++) {
            gs.wave = w; startWave(gs, { noSmart: true })
            if (clusterMode(gs)) falseDeficit++
        }
    }
    ok(falseDeficit === 0, 'waves 1..7: no false deficit — the cheap waves keep the plain doctrine', `${falseDeficit}`)
    let trueDeficit = 0
    for (const w of [9, 10, 11, 12]) {
        const gs = makeRun(7922); gs.wave = w; startWave(gs)
        if (clusterMode(gs)) trueDeficit++
    }
    ok(trueDeficit === 4, 'waves 9..12: the deficit is declared (28-32+ warheads vs 30 shells)', `${trueDeficit}/4`)

    // Knot unit: two warheads on truly crossing lines, timed to meet at one
    // point inside a single ring. Construction meets at (402, 328); the shell
    // detonates there as they arrive together — two kills, one shell.
    {
        const gs = makeRun(7)
        gs.wave = 9
        startWave(gs, { noSmart: true })
        gs.spawning = false
        gs.missilesLeftInWave = 2 // demand 4 vs ammo 3 — declared deficit, sky manual
        gs.saucersLeftInWave = 0; gs.saucers = []
        gs.warheads.length = 0
        gs.silos.forEach((s) => { s.ammo = 1 })
        gs.warheads.push(
            { id: 91, x: 300, y: 200, startX: 300, startY: 0, targetX: 500, targetY: 450, speed: 1, color: '#f00', coverUntil: 0 },
            { id: 92, x: 500, y: 196.86, startX: 500, startY: 0, targetX: 320, targetY: 450, speed: 1, color: '#f00', coverUntil: 0 },
        )
        let shells = 0, guard = 0, prevAmmo = gs.silos.reduce((a, s) => a + s.ammo, 0)
        let tell = null, mk = 0 // #3707: the HUD tell data + the crowd-kill bill
        while (guard++ < 260 && gs.warheads.some((m) => m.id === 91 || m.id === 92)) {
            const cmd = gunnerStep(gs)
            if (!tell) {
                const h = gs.warheads.find((m) => m.held === true && Number.isFinite(m.knotX))
                if (h) tell = { x: h.knotX, y: h.knotY }
            }
            tickMc(gs, cmd)
            mk += gs.events.filter((e) => e === 'multikill').length
            const ammo = gs.silos.reduce((a, s) => a + s.ammo, 0)
            if (ammo < prevAmmo) shells += prevAmmo - ammo
            prevAmmo = ammo
        }
        const survivors = gs.warheads.filter((m) => m.id === 91 || m.id === 92).length
        ok(shells === 1 && survivors === 0, 'KNOT: one shell downs two crossing warheads (predicted AND actual)', `shells ${shells}, survivors ${survivors}`)
        // #3707 teach-the-knot delta: the hold must be visible (knotX/knotY =
        // the meet point (402,328) while held) and the double kill audible
        // (one 'multikill' beyond the ring's first).
        ok(tell !== null && Math.abs(tell.x - 402) <= 4 && Math.abs(tell.y - 328) <= 4,
            'KNOT TELL (#3707): the hold records its meet point for the HUD pulse', tell ? `${tell.x.toFixed(0)},${tell.y.toFixed(0)}` : 'no tell ever set')
        ok(mk === 1, 'KNOT TELL (#3707): two warheads, one ring — the crowd kill bills exactly one stacked note', `${mk}`)
    }

    // Silo-first unit: under deficit a higher city warhead yields to the
    // silo stream — the magazine is defended before the score.
    {
        const gs = makeRun(7)
        gs.wave = 9
        startWave(gs, { noSmart: true })
        gs.spawning = false
        gs.missilesLeftInWave = 2
        gs.saucersLeftInWave = 0; gs.saucers = []
        gs.warheads.length = 0
        gs.silos.forEach((s) => { s.ammo = 1 })
        gs.warheads.push(
            { id: 93, x: 150, y: 300, startX: 150, startY: 0, targetX: 200, targetY: 550, speed: 1.5, color: '#f00', coverUntil: 0 },
            { id: 94, x: 60, y: 280, startX: 60, startY: 0, targetX: 40, targetY: 530, speed: 1.5, color: '#f00', coverUntil: 0 },
        )
        const shot = gunnerStep(gs)
        ok(shot && shot.wid === 94, 'SILO-FIRST: under deficit the silo stream outranks the lower city stream', `wid ${shot && shot.wid}`)
    }

    // #3707 crowd-kill audio, negative half: a ring that downs ONE warhead must
    // push no 'multikill' — the single-kill voice stays the baseline; only a
    // second kill in the same blast's life stacks a note.
    {
        const gs = makeRun(11)
        gs.wave = 9
        startWave(gs, { noSmart: true })
        gs.spawning = false
        gs.missilesLeftInWave = 99 // keep the wave alive; only our two pilots die
        gs.saucersLeftInWave = 0; gs.saucers = []
        gs.warheads.length = 0
        gs.abms.length = 0; gs.blasts.length = 0
        gs.warheads.push(
            { id: 95, x: 400, y: 240, startX: 400, startY: 0, targetX: 400, targetY: 450, speed: 1, color: '#f00', coverUntil: 0 },
        )
        let mk = 0, died = false, guard = 0
        while (guard++ < 400 && !died) {
            tickMc(gs, null)
            // grow a manual ring over the lone warhead: one kill, no stack.
            if (guard === 2) gs.blasts.push({ x: 400, y: 240, radius: 1, growing: true, center: false, color: '#fff' })
            died = gs.warheads.every((m) => m.id !== 95 || m.dead)
            mk += gs.events.filter((e) => e === 'multikill').length
        }
        ok(died && mk === 0, 'crowd-kill silence (#3707): a ring that takes ONE warhead bills no stacked note', `mk ${mk}`)
    }

    // Deep A/B: 12 seeds x waves 9-11, doctrine on vs off. Honest claims: the
    // habits never lose a raid the old doctrine survived, never spend more
    // shells, and never net fewer cities across the set. (Wave 12+ is excluded
    // deliberately: games legitimately END there under BOTH doctrines — the
    // measured ceiling is volume, see README #3711.)
    {
        const run = (seed, wave, noCluster) => {
            const gs = makeRun(seed)
            gs.wave = wave
            startWave(gs)
            let guard = 0, shells = 0, prev = 30
            while (gs.wave <= wave && !gs.over && guard++ < 40000) {
                tickMc(gs, gunnerStep(gs, { noCluster }))
                const ammo = gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0)
                if (ammo < prev) shells += prev - ammo
                prev = ammo
            }
            return { over: gs.over, cities: citiesAlive(gs), shells }
        }
        let lostRaids = 0, cityDelta = 0, shellDelta = 0, raids = 0
        for (let s = 1; s <= 12; s++) {
            const seed = s * 7919 + 3
            for (const w of [9, 10, 11]) {
                const on = run(seed, w, false), off = run(seed, w, true)
                raids++
                if (on.over && !off.over) { lostRaids++; console.log(`  lost seed ${seed} w${w} (old survived)`) }
                cityDelta += on.cities - off.cities
                shellDelta += off.shells - on.shells
            }
        }
        ok(raids === 36 && lostRaids === 0, 'deep A/B: 36 raids waves 9-11 — never loses a raid the plain doctrine survived', `${lostRaids}`)
        ok(cityDelta >= 0, `deep A/B: cities never net worse (delta ${cityDelta} across 36 raids)`, `${cityDelta}`)
        ok(shellDelta >= 0, `deep A/B: shells never spent faster (saved ${shellDelta} across 36 raids)`, `${shellDelta}`)
    }
}

// -------------------------------------------------------------------- the law ----
console.log('component wiring: pin, report, restart, seat')
{
    const src = readFileSync('src/games/MissileCommand/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the seeded stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/makeRun\(seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\), \{ twoPlayer: is2P \}\)/.test(src),
        'startRun regenerates the seed through makeRun and honors ?seed=N (#3630 slice 2: plus the mode flag)')
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
    // #3707 teach-the-knot deltas live in this file — pin their wiring so a
    // refactor cannot silently drop the tell or the crowd-kill voice.
    ok(/ev === 'multikill'/.test(src), '#3707: the stacked crowd-kill note is wired to the event loop')
    ok(/m\.held !== true \|\| !Number\.isFinite\(m\.knotX\)/.test(src), '#3707: the knot hold pulses its meet point on the board')
    ok(/release\(false\) \/\/ watch never lingers/.test(src), 'a fresh raid starts in your hands')
    // #3630 slice 2 — the hot-seat wiring the sim section can't see
    ok(/e\.code === 'Digit2' \|\| e\.code === 'Digit1'/.test(src),
        'mode keys wired: 1 opens solo, 2 opens the hot-seat')
    // #3695 — the three-button law at the shell: keys, seat guard, phone pad
    ok(/if \(e\.code === 'Digit1' \|\| e\.code === 'Digit2' \|\| e\.code === 'Digit3' \|\| e\.code === 'KeyB'\)/.test(src),
        'battery keys 1/2/3 (+ pad FAST) wired into the keydown lane')
    ok(/if \(!attractUiRef\.current && !\(gs\.twoP && gs\.turn === 2\)\) \{/.test(src) &&
        /fireBattery\(gs, battery, gs\.crosshair\.x, gs\.crosshair\.y\)/.test(src),
        'the battery fire carries the same duty guard as Space — never the off-duty seat\'s ammo, never the attract demo')
    ok(/pad: \{ layout: 'stick', reads: \['a', 'b'\], aLabel: 'FIRE', buttons: \[\{ label: 'FAST', code: 'KeyB' \}\] \}/.test(
        readFileSync('src/config/games.js', 'utf8')),
        'phones get the FAST button from the registry pad (B dispatches KeyB)')
    ok(/origins: gs\.abms\.map\(\(a\) => Math\.round\(a\.startX\)\)/.test(src),
        'the probe exposes launch origins — the drive script watches the button law')
    ok(/export function fireBattery\(gs, idx, x, y\)/.test(readFileSync('src/games/MissileCommand/sim.js', 'utf8')),
        'sim exports fireBattery — the named-battery door (three-button law)')
    ok(/gs\.twoP && \(P2_CODES\.includes\(e\.code\)( \|\| e\.code in P2_BATT)?\)/.test(src),
        'seat 2 has its own keyboard lane (WASD aim + F fire, + Z/X/C named batteries #3760)')
    ok(/gs\.p2cpu = false/.test(src), 'a P2 key joins a human into the CPU seat mid-run')
    ok(/if \(gs\.twoP && gs\.turn === 2\) return/.test(src),
        'the mouse never spends the off-duty seat\'s ammo')
    ok(/gs\.twoP && gs\.turn === 2 && gs\.p2cpu \? gunnerStep\(gs\)/.test(src),
        'the CPU seat drives the certified gunner on P2 waves')
    ok(/if \(gs\.twoP\) return/.test(src), 'watch is solo-only — seat 2 belongs to the gunner')
    ok(/if \(keys\.ArrowLeft\) gs\.crosshair\.x = Math\.max/.test(src),
        'P1 arrows aim the crosshair — the pad stick finally has a load')
    ok(/twoP: gs\.twoP, turn: gs\.turn, p1: gs\.score, p2: gs\.score2/.test(src),
        'the production report carries the hot-seat picture')
    // #3753 — bonus-city wiring: the windfall voice and the rise-in tell.
    ok(/ev === 'revive'/.test(src), '#3753: the bonus-city jingle is wired to the event loop')
    ok(/gs\.reviveFx\.find\(\(f\) => f\.x === c\.x\)/.test(src), '#3753: the rise-in tell renders on the living city')
    ok(/PLAYER \$\{w\} WINS/.test(src) && /A DRAW/.test(src),
        'THE END names the hot-seat winner over both books')
    // #3760 — seat 2's three-button triangle at the shell: keys, join, latch, teach
    ok(/const P2_BATT = \{ KeyZ: 0, KeyX: 1, KeyC: 2 \}/.test(src),
        '#3760: seat 2\'s three-button table wired — Z/X/C name LEFT/CENTER/RIGHT')
    ok(/gs\.twoP && \(P2_CODES\.includes\(e\.code\) \|\| e\.code in P2_BATT\)/.test(src),
        '#3760: the battery keys join seat 2\'s lane — a named press claims the seat like WASD/F')
    ok(/if \(gs\.turn === 2 && !gs\.p2cpu && !gs\.over && !attractUiRef\.current\) \{/.test(src) &&
        /else if \(e\.code in P2_BATT\) p2Batt = P2_BATT\[e\.code\]/.test(src),
        '#3760: the latch arms only on the seat\'s own wave against a human seat — off-duty presses join but never latch')
    ok(/if \(p2Batt !== null\) fireBattery\(gs, p2Batt, gs\.crosshair\.x, gs\.crosshair\.y\)/.test(src),
        '#3760: the named shot rides fireBattery — dud gates and the per-battery speed law apply for free')
    ok(/p2Fire = false\n\s*p2Batt = null/.test(src),
        '#3760: edge latch — swallowed off-duty, never queued for the next wave')
    ok(/gs\.twoP && gs\.turn === 2 && !gs\.p2cpu \? 'ZXC'\[i\] : String\(i \+ 1\)/.test(src),
        '#3760: batteries wear the seat on duty — Z/X/C while a human holds seat 2')
    ok(/Z X C — fire LEFT \/ CENTER \/ RIGHT/.test(src),
        '#3760: the join moment teaches seat 2 its buttons')
    const simSrc = readFileSync('src/games/MissileCommand/sim.js', 'utf8')
    ok(/if \(gs\.twoP\) \{\s*gs\.turn = gs\.turn === 1 \? 2 : 1/.test(simSrc),
        'the flip lives in nextWave and is gated by the mode')
    ok(/gs\.cityRand\(\)/.test(simSrc), '#3753: the redraw pick rides gs.cityRand — never gs.rand')
    // the registry advertises the seat (gameHasWatch gates the pill/PauseOverlay)
    const reg = readFileSync('src/config/games.js', 'utf8')
    const mc = reg.match(/path: '\/missilecommand'[\s\S]*?\n    \},/)
    ok(!!mc && /WATCH_HELP/.test(mc[0]), 'the registry carries the WATCH line for /missilecommand')
    ok(!!mc && /never lets the fire touch the ground/.test(mc[0]),
        'the registry line names the doctrine the sweep proves')
    ok(!!mc && /Z\/X\/C name the LEFT\/CENTER\/RIGHT batteries on P2 waves/.test(mc[0]),
        '#3760: the registry teaches seat 2\'s triangle next to the join keys')
}

// #3753 — the arcade's bonus city: every 10,000 points a destroyed city is
// redrawn. Graded four ways: the bank arithmetic, where the redraw lands in
// the bonus order (after the bonus pays, alive for the NEXT wave), what it
// refuses to do (full board banks, no double draw in one break, nothing ever
// redraws below the threshold), and that the pick rides a DEDICATED dice
// stream so every byte pin under 10k replays untouched.
console.log('bonus city (#3753): bank, arcade order, dedicated stream')
{
    // bank arithmetic — nothing moves below the threshold; crossings stack.
    const g = makeRun(777)
    ok(g.revivePending === 0 && g.cityNext === CITY_EVERY, 'fresh run: bank empty, next crossing at 10k')
    addScore(g, CITY_EVERY - 1)
    ok(g.revivePending === 0, '9,999 points bank nothing — the original draws at 10k, not before')
    addScore(g, 1)
    ok(g.revivePending === 1 && g.cityNext === 2 * CITY_EVERY, 'the 10k crossing banks one redraw')
    addScore(g, 2 * CITY_EVERY)
    ok(g.revivePending === 3 && g.cityNext === 4 * CITY_EVERY, 'a big credit banks every crossing it passes')

    // hot-seat: combined books — either partner can earn the town back.
    const h = makeRun(778, { twoPlayer: true })
    h.turn = 2
    addScore(h, CITY_EVERY)
    ok(h.revivePending === 1 && h.score === 0 && h.score2 === CITY_EVERY,
        'P2\'s book earns the bank too — cities are shared')

    // full board: the bank waits for a hole (a crossing on six living cities
    // must not vanish, and must not redraw over a living one).
    const f = makeRun(779)
    addScore(f, CITY_EVERY)
    let ticks = 0
    while (f.state !== 'gameOver' && f.wave === 1 && ticks < 20000) { tickMc(f, gunnerStep(f)); ticks++ }
    ok(f.revivePending === 1, 'six cities standing: the bank waits, it never redraws over the living')

    // redraw lands at the break, alive for the next wave, with one pick, and
    // NEVER pays itself into the bonus that was already counted.
    const r = makeRun(780)
    r.cities[1].alive = false
    r.cities[3].alive = false
    addScore(r, CITY_EVERY)
    let tt = 0
    while (r.state !== 'gameOver' && r.wave === 1 && tt < 20000) { tickMc(r, gunnerStep(r)); tt++ }
    ok(r.state === 'waveEnd' && r.revivePending === 0, 'the wave break spends the bank — one redraw per break')
    ok(r.reviveFx.length === 1 && r.reviveFx[0].t >= REVIVE_FX_TICKS - 1, 'the redraw carries the rise-in tell')
    const aliveAfter = citiesAlive(r)
    ok(aliveAfter === 5, 'the board refills by exactly one — never a double draw', `${aliveAfter}`)
    const holesLeft = r.cities.filter((c) => !c.alive).length
    ok(holesLeft === 1, 'exactly one hole remains standing after the break', `${holesLeft}`)
    const waveAt = r.wave
    while (r.state !== 'gameOver' && r.wave === waveAt && tt < 40000) { tickMc(r, gunnerStep(r)); tt++ }
    ok(citiesAlive(r) >= aliveAfter, 'the redrawn city survives into the next wave (it defended)', `${citiesAlive(r)}`)

    // arcade order, exact: a crafted quiet break (no spawns, no kills) pays
    // 4 living cities + full magazines = 1900 — the redraw must NOT count
    // into the bonus it follows.
    const o = makeRun(786)
    addScore(o, CITY_EVERY)
    o.cities[1].alive = false
    o.cities[3].alive = false
    o.spawning = false; o.missilesLeftInWave = 0
    o.saucersLeftInWave = 0; o.smartLeftInWave = 0
    tickMc(o, null)
    ok(o.wave === 2 && o.score === CITY_EVERY + 1900,
        'the bonus counts only the cities saved — the redraw pays nothing into it', `${o.score}`)
    ok(citiesAlive(o) === 5 && o.revivePending === 0,
        'board refills exactly one at the break', `${citiesAlive(o)}`)

    // below-threshold runs never redraw: a fresh deep loss stays lost.
    const n = makeRun(781)
    n.cities[0].alive = false
    let nt = 0
    while (n.state !== 'gameOver' && n.wave === 1 && nt < 20000) { tickMc(n, gunnerStep(n)); nt++ }
    ok(n.revivePending === 0 && n.reviveFx.length === 0 && citiesAlive(n) <= 5,
        'an unbanked hole stays a hole — no free refill below 10k')

    // dedicated stream: the pick consumes gs.cityRand, NOT gs.rand — the
    // spawn script of an identical raid (same seed, same holes, same
    // commands) must replay roll-for-roll even though the target POOLS
    // diverge after the redraw (the revived city joins the wave-2 pool).
    const traceOf = (seed, holes, banked) => {
        const t = makeRun(seed)
        holes.forEach((i) => { t.cities[i].alive = false })
        if (banked) addScore(t, CITY_EVERY)
        let rolls = 0
        const real = t.rand
        t.rand = () => { rolls++; return real() }
        let k = 0
        while (t.state !== 'gameOver' && t.wave <= 2 && k < 40000) { tickMc(t, gunnerStep(t)); k++ }
        return { k, rolls, cities: citiesAlive(t), wave: t.wave, score: t.score }
    }
    const a = traceOf(783, [1, 4], true)
    const b = traceOf(783, [1, 4], false)
    ok(a.rolls === b.rolls && a.k === b.k,
        'the redraw costs gs.rand no roll — waves 1..2 dice replay roll-for-roll', `${a.rolls} vs ${b.rolls}`)
    ok(a.cities === b.cities + 1, 'the banked run ends wave 2 with exactly one more city', `${a.cities} vs ${b.cities}`)
    ok(a.score > b.score, 'the banked run paid its 10k — the redraw was earned, not free')
    const p1 = traceOf(784, [0], true)
    const p2 = traceOf(784, [0], true)
    ok(JSON.stringify(p1) === JSON.stringify(p2),
        'banked raids replay byte-equal from the seed (cityRand is seeded too)', `${JSON.stringify(p1)} vs ${JSON.stringify(p2)}`)
}

if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/MissileCommand/index.jsx'
    const S = 'src/games/MissileCommand/sim.js'
    const G = 'src/config/games.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `makeRun(seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000), { twoPlayer: is2P })`,
            `makeRun(Math.floor(Math.random() * 1000000), { twoPlayer: is2P })`],
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
            `const live = gs.warheads.filter((m) => !m.dead && !m.smart).sort((a, b) => b.y - a.y)`,
            `const live = gs.warheads.filter((m) => !m.dead && !m.smart).sort((a, b) => a.y - b.y)`],
        ['no-lead prediction (aims where the warhead was, not where it will be)', S,
            `const p = stepWarhead(w, j)`,
            `const p = stepWarhead(w, 1)`],
        ['the wave break never expires (wall-clock thinking)', S,
            `gs.waveBreak--`,
            `gs.waveBreak -= 0`],
        ['the registry line is stripped (pill chrome lies about the seat)', G,
            `WATCH_HELP + ' — the sweep-proven gunner meets every warhead high and never lets the fire touch the ground'`,
            `'no watch line here'`],
        ['the saucer gate opens at wave 1 (the byte-exact floor shatters)', S,
            `if (gs.wave >= SAUCER_FIRST_WAVE) {`,
            `if (gs.wave >= 1) {`],
        ['a burned ferry pays warhead points (125 becomes 25)', S,
            `addScore(gs, SAUCER_SCORE) // #3630 slice 2: the 125 pays the live seat`,
            `addScore(gs, 25) // mutant: the 125 slot shrinks`],
        ['the wave clears regardless of owed ferries (spawned-after-clear ghost)', S,
            `gs.saucers.length === 0 && gs.saucersLeftInWave === 0`,
            `true`],
        ['#3638: the bonus ignores its reserve (A/B cities pay for it)', S,
            `if (!anyLive && saucer && ammoLeft - 1 >= reserve) {`,
            `if (!anyLive && saucer) {`],
        ['#3638: the reserve forgets the ferry fleet (missiles-only debt)', S,
            `const reserve = gs.missilesLeftInWave +
        gs.saucersLeftInWave * Math.max(1, Math.round(crossingTicks / 70)) +
        gs.saucers.reduce((a, s) => a + (s === saucer || s.dead ? 0 : launchLeft(s)), 0)`,
            `const reserve = gs.missilesLeftInWave`],
        ['#3638: the kill flash dies on frame zero', S,
            `gs.flash = { x: s.x, y: s.y, t: 4 }`,
            `gs.flash = { x: s.x, y: s.y, t: 0 }`],
        ['#3638: the kill leaves no debris', S,
            `for (let i = 0; i < 6; i++) {`,
            `for (let i = 0; i < 0; i++) {`],
        ['#3638: the attract ferry rolls dice (determinism story dies)', S,
            `y: 130 + (n % 3) * 26,`,
            `y: SAUCER_Y_MIN + Math.floor(gs.rand() * (SAUCER_Y_MAX - SAUCER_Y_MIN)),`],
        ['the smart-bomb gate opens at wave 1 (byte-parity floor shatters)', S,
            `gs.smartWave = gs.wave >= SMART_FIRST_WAVE && !opts.noSmart`,
            `gs.smartWave = true`],
        ['the center battery keeps the slow speed (arcade counter-rule gone)', S,
            `export const CENTER_ABM_SPEED = 28`,
            `export const CENTER_ABM_SPEED = 15`],
        // #3695 — the three-button law is load-bearing for these checks
        ['a battery key falls back to the click law (the named battery is a lie)', I,
            `fireBattery(gs, battery, gs.crosshair.x, gs.crosshair.y)`,
            `fireAt(gs, gs.crosshair.x, gs.crosshair.y)`],
        ['the named battery spends a neighbour\'s magazine instead', S,
            `export function fireBattery(gs, idx, x, y) {\n    if (gs.state !== 'playing') return false\n    const silo = gs.silos[idx]`,
            `export function fireBattery(gs, idx, x, y) {\n    if (gs.state !== 'playing') return false\n    const silo = gs.silos[0]`],
        ['a dead battery reroutes to the nearest (a dud becomes a free shot)', S,
            `    const silo = gs.silos[idx]\n    if (!silo) return false\n    return fireFrom(gs, silo, x, y, null)`,
            `    const silo = gs.silos[idx]\n    if (!silo) return false\n    return silo.alive && silo.ammo > 0 ? fireFrom(gs, silo, x, y, null) : fireAt(gs, x, y)`],
        ['outer fire kills smart bombs too (the counter-rule is inverted)', S,
            // anchor #3698 drift: the early-return gained the shimmer block and
            // changed shape; the mutant never re-anchored (mutants don't run in
            // CI, so it stayed a local red nobody saw until the #3753 run).
            `if (m.smart && !e.center) {`,
            `if (m.smart && e.center) {`],
        ['smart bombs see nothing (the §6 evade is gone)', S,
            `if (tx !== null) { m.evadeX = tx`,
            `if (false && tx !== null) { m.evadeX = tx`],
        ['hint 3 dropped — an on-bomb aim is still detected', S,
            `Math.hypot(m.x - x, m.y - y) <= SMART_PERFECT_R`,
            `Math.hypot(m.x - x, m.y - y) <= 0`],
        ['the wave clears regardless of owed smart bombs', S,
            `gs.smartLeftInWave === 0) {`,
            `true) {`],
        ['the watch sprays outer ammo at smart bombs (3-button doctrine lost)', S,
            `fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k, silo: centerIdx }`,
            `fired = { aimX: p.x, aimY: p.y, wid: w.id, boom: gs.tick + k, silo: gs.silos.findIndex((s) => s.alive && s.ammo > 0) }`],
        ['#3630 s2: the turn flip dies (the hot-seat plays alone)', S,
            `gs.turn = gs.turn === 1 ? 2 : 1`,
            `gs.turn = 1`],
        ['#3630 s2: P2 waves pay P1 (the seat routing is gone)', S,
            `if (gs.twoP && gs.turn === 2) gs.score2 += n`,
            `if (gs.twoP) gs.score2 += n`],
        ['#3630 s2: credits never reach score2 (the second ledger is dead)', S,
            `if (gs.twoP && gs.turn === 2) gs.score2 += n`,
            `if (false) gs.score2 += n`],
        ['#3630 s2: the hot-seat opens without being asked (solo shape breaks)', S,
            `twoP: opts.twoPlayer === true,`,
            `twoP: true,`],
        ['#3630 s2: the mouse fires on P2\'s wave (off-duty guard gone)', I,
            `if (gs.twoP && gs.turn === 2) return // #3630 slice 2: the mouse`,
            `if (false) return // #3630 slice 2: the mouse`],
        ['#3630 s2: a P2 key never claims the seat (join dead)', I,
            `gs.p2cpu = false`,
            `gs.p2cpu = true`],
        ['#3630 s2: the CPU seat abdicates (P2 waves fly undefended)', I,
            `gs.twoP && gs.turn === 2 && gs.p2cpu ? gunnerStep(gs)`,
            `false ? gunnerStep(gs)`],
        ['#3630 s2: pad arrow-aim dies (the stick idles again)', I,
            `if (keys.ArrowLeft) gs.crosshair.x = Math.max(0, gs.crosshair.x - P2_AIM_SPEED)`,
            `if (false) gs.crosshair.x = Math.max(0, gs.crosshair.x - P2_AIM_SPEED)`],
        ['#3711: the knot never waits (hold disabled — the crossing shot is never taken)', S,
            `if (!fired && cluster && holdX >= 1) {`,
            `if (false) {`],
        ['#3711: the cushion goes (grazing rim-kills get promised and dud the unit)', S,
            `if (Math.hypot(q.x - p.x, q.y - p.y) < blastRadiusAt(t - k) - 2) {`,
            `if (Math.hypot(q.x - p.x, q.y - p.y) < blastRadiusAt(t - k)) {`],
        ['#3711: the knot point never reads as ready (singles only)', S,
            `if (j - k < BLAST_LIFE) {`,
            `if (false) {`],
        ['#3711: silo-first is gone (dead magazines under deficit)', S,
            `if (cluster) live.sort((a, b) => (isSiloTarget(b) ? 1 : 0) - (isSiloTarget(a) ? 1 : 0) || b.y - a.y)`,
            `if (cluster) live.sort((a, b) => b.y - a.y)`],
        ['#3698: the immune pass stops marking (shimmer never fires)', S,
            `gs.resist.push({ x: m.x, y: m.y, t: 10 })`,
            `if (gs.resist) { /* shimmer never marks */ }`],
        ['#3698: the attract smart ad never flies (the wave-7 threat is never taught)', S,
            `if (gs.tick > 0 && gs.tick % ATTRACT_SMART_EVERY === ATTRACT_SMART_EVERY / 2) {`,
            `if (false && gs.tick > 0) {`],
        // #3753 — the bonus-city law
        ['#3753: the bank is deaf (crossings earn nothing)', S,
            `gs.cityNext += CITY_EVERY
        gs.revivePending++`,
            `gs.cityNext += CITY_EVERY`],
        ['#3753: the redraw never fires (the bank spends, the city stays dead)', S,
            `if (holes.length > 0) {`,
            `if (false && holes.length > 0) {`],
        ['#3753: every break refills whether earned or not (free city)', S,
            `if (gs.revivePending > 0) {`,
            `if (true) {`],
        ['#3753: the pick rides gs.rand (every byte pin shatters)', S,
            `holes[Math.floor(gs.cityRand() * holes.length)]`,
            `holes[Math.floor(gs.rand() * holes.length)]`],
        ['#3753: the redraw pays itself into the bonus (arcade order inverted)', S,
            `gs.cities.forEach((c) => { if (c.alive) bonus += 100 })`,
            `if (gs.revivePending > 0) { const hz = gs.cities.filter((c) => !c.alive); if (hz.length > 0) { hz[0].alive = true; gs.revivePending-- } }
    gs.cities.forEach((c) => { if (c.alive) bonus += 100 })`],
        ['#3753: the rise-in tell never draws (the windfall is invisible)', S,
            `gs.reviveFx.push({ x: c.x, t: REVIVE_FX_TICKS })`,
            `/* mutant: no tell */`],
        // #3760 — seat 2's three-button triangle
        ['#3760: seat 2\'s named battery is deaf (the latch never fires)', I,
            `if (p2Batt !== null) fireBattery(gs, p2Batt, gs.crosshair.x, gs.crosshair.y)`,
            `if (false) fireBattery(gs, p2Batt, gs.crosshair.x, gs.crosshair.y)`],
        ['#3760: the named shot keeps firing (edge latch gone — one press drains the magazine)', I,
            `p2Fire = false
                p2Batt = null`,
            `p2Fire = false`],
        ['#3760: Z/X/C never join (the triangle sits inert beside a locked CPU seat)', I,
            `gs.twoP && (P2_CODES.includes(e.code) || e.code in P2_BATT)`,
            `gs.twoP && P2_CODES.includes(e.code)`],
        ['#3760: X names the left battery (the button table lies about center)', I,
            `const P2_BATT = { KeyZ: 0, KeyX: 1, KeyC: 2 }`,
            `const P2_BATT = { KeyZ: 0, KeyX: 0, KeyC: 2 }`],
        ['#3760: the board stays seat-blind (HUD keeps 1/2/3 under a human P2)', I,
            `gs.twoP && gs.turn === 2 && !gs.p2cpu ? 'ZXC'[i] : String(i + 1)`,
            `String(i + 1)`],
        ['#3760: the named shot arms on P1\'s wave (duty guard gone)', I,
            `if (gs.turn === 2 && !gs.p2cpu && !gs.over && !attractUiRef.current) {`,
            `if (!gs.over && !attractUiRef.current) {`],
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
