// watchsoakcheck — #1653 part 3: the batch-2 WATCH soak, WITHOUT a browser.
//
// The nine batch-2 pilots in watchcheck.mjs each prove their seat for a few
// seconds inside Chrome — and #1622 has kept Chrome dead on this studio host
// (no engine runs JS at all), so those soaks never ran green anywhere. This
// script asks the same questions at the seam the seats are actually wired:
// each game's own brain module driving its own sim, tick by tick, exactly as
// the component's watching branch does (the source-pins section below proves
// the soak cannot quietly drift off the shipped wiring). Every predicate the
// browser pilots assert gets one real long soak here — full runs to the win
// where the brain reaches one, across every seed the sim actually varies —
// plus determinism (same seed, same hash) and the #1658 bail-budget tie-in
// for Ice Climber. Seeds that do NOT vary the sim (fixed courses) are said
// out loud rather than banked as fake diversity.
import { Report } from './lib/harness.mjs'
import { readFileSync } from 'node:fs'

import { makeGame as orMake, step as orStep, stateHash as orHash } from '../src/games/OutRun/sim.js'
import { decideTick as orDecide } from '../src/games/OutRun/planner.js'
import { makeGame as llMake, step as llStep, stateHash as llHash } from '../src/games/LunarLander/sim.js'
import { decide as llDecide } from '../src/games/LunarLander/planner.js'
import { newRun as opNew, step as opStep, stateHash as opHash } from '../src/games/Outpost/sim.js'
import { decide as opDecide } from '../src/games/Outpost/planner.js'
import { makeGame as poMake, step as poStep, stateHash as poHash } from '../src/games/Polarity/sim.js'
import { policy as poPolicy } from '../src/games/Polarity/planner.js'
import { makeGame as mbMake, step as mbStep, stateHash as mbHash } from '../src/games/MissileBattle/sim.js'
import { decide as mbDecide } from '../src/games/MissileBattle/planner.js'
import { makeGame as stMake, step as stStep, stateHash as stHash } from '../src/games/SmashTV/sim.js'
import { decidePad as stDecidePad, padToInp as stPadToInp } from '../src/games/SmashTV/planner.js'
import { makeGame as mkMake, step as mkStep, stateHash as mkHash } from '../src/games/MarioKart/sim.js'
import { decide as mkDecide } from '../src/games/MarioKart/planner.js'
import { solveGame as pbSolve } from '../src/games/Paperboy/planner.js'
import { makeGame as icMake, stateHash as icHash } from '../src/games/IceClimber/sim.js'
import { plan as icPlan, BAIL_PER_MOUNTAIN } from '../src/games/IceClimber/planner.js'
import { buildLevel as icBuild } from '../src/games/IceClimber/levels.js'

const rep = new Report('WATCH batch-2 soak (#1653 p3, browser-free)')

// ---------------------------------------------------------------- OutRun ----
// the committed-lane policy; the component keeps lane memory in a ref.
// NB g.position is STAGE-LOCAL (it resets at fork stage boundaries, ~tick
// 1000 on stage 1) — an advance-window that crosses a boundary compares
// apples to reset-odds. Keep the pilot window inside stage 1.
function outrun(seed) {
    const g = orMake(seed)
    let lane = 1
    let a = null, b = null
    for (let t = 0; t < 120000 && !g.end; t++) {
        const d = orDecide(g, lane)
        lane = d.lane
        orStep(g, { steer: d.steer, gas: d.gas, brake: d.brake, gear: d.gear })
        if (t === 99) a = { pos: g.position, crashes: g.crashes }
        if (t === 399) b = { pos: g.position, crashes: g.crashes }
    }
    return { won: g.win, stages: g.stagesDone, crashes: g.crashes, tick: g.tick, hash: orHash(g), a, b }
}
rep.section && rep.section('outrun')
for (const seed of [0, 1, 2]) {
    const r = outrun(seed)
    rep.check(`outrun seed ${seed}: pilot window advances (pos +100, crashes held)`,
        r.b.pos > r.a.pos + 100 && r.b.crashes === r.a.crashes,
        `pos ${r.a.pos.toFixed(0)} -> ${r.b.pos.toFixed(0)}, crashes ${r.crashes}`)
    rep.check(`outrun seed ${seed}: the 5 stages finish clean`, r.won && r.stages === 5 && r.crashes === 0,
        `tick ${r.tick}, stages ${r.stages}, crashes ${r.crashes}`)
}
rep.info('outpost note', 'OutRun road/traffic is seed-invariant — seeds 0-2 ride the same road; the sim varies no state here')
{
    const r1 = outrun(0), r2 = outrun(0)
    rep.check('outrun: same seed, same trajectory (determinism)', r1.hash === r2.hash && r1.tick === r2.tick,
        `${r1.hash}@${r1.tick}`)
    rep.check('outrun: seat survives 6000 ticks untouched (soak length)', r1.tick >= 6000 && r1.won,
        `full GP in ${r1.tick} ticks, zero crashes`)
}

// ------------------------------------------------------------ LunarLander ----
function lander(seed) {
    const g = llMake(seed)
    const fuel0 = g.fuel
    let a = null
    for (let t = 0; t < 36000 && !g.end; t++) {
        llStep(g, llDecide(g))
        if (!a && g.tick >= 300) a = { fuel: g.fuel, tick: g.tick }   // g.tick idles during the mission intro — wait on the sim clock
    }
    return { won: g.win, crashes: g.crashes, cycles: g.cycle, tick: g.tick, hash: llHash(g), fuel0, a }
}
rep.section && rep.section('lunar-lander')
for (const seed of [0, 1, 2, 3]) {
    const r = lander(seed)
    rep.check(`lander seed ${seed}: fuel burns under the pilot (prover-only throttle)`,
        r.a.tick >= 300 && r.a.fuel < r.fuel0, `fuel ${r.fuel0} -> ${r.a.fuel.toFixed(1)} @tick ${r.a.tick}`)
    rep.check(`lander seed ${seed}: the 5-mission chain is landed clean`, r.won && r.cycles === 5 && r.crashes === 0,
        `tick ${r.tick}, score-par ${r.cycles}/5`)
}
{
    const r1 = lander(0), r2 = lander(0)
    rep.check('lander: same seed, same trajectory (determinism)', r1.hash === r2.hash && r1.tick === r2.tick, `${r1.hash}@${r1.tick}`)
    rep.check('lander: seeds actually vary the sim (diversity, not one run counted four times)',
        lander(1).hash !== r1.hash && lander(2).hash !== lander(3).hash && lander(1).hash !== lander(2).hash)
    rep.check('lander: chain survives 6000 ticks (soak length)', r1.tick >= 6000 && r1.won, `chain closed at tick ${r1.tick}`)
}

// ---------------------------------------------------------------- Outpost ----
function outpost(seed) {
    const gs = opNew(seed)
    let a = null
    for (let t = 0; t < 60000 && !gs.end; t++) {
        opStep(gs, opDecide(gs))
        if (t === 899) a = { dug: gs.dug, ore: gs.minedOre, farm: gs.harvested }
    }
    return { end: gs.end, why: gs.endWhy, tick: gs.tick, dug: gs.dug, farm: gs.harvested, hash: opHash(gs), a }
}
rep.section && rep.section('outpost')
for (const seed of [0, 1, 2]) {
    const r = outpost(seed)
    rep.check(`outpost seed ${seed}: jobs grow early (dug/ore/farm predicate)`,
        r.a.dug + r.a.ore + r.a.farm > 0, `dug ${r.a.dug}, ore ${r.a.ore}, farm ${r.a.farm} @tick 900`)
    rep.check(`outpost seed ${seed}: the colony wins the beacon`, r.end === 'win' && r.why === '4 dwarves at the beacon',
        `tick ${r.tick}, dug ${r.dug}, harvested ${r.farm}`)
}
{
    const r1 = outpost(0), r2 = outpost(0)
    rep.check('outpost: same seed, same trajectory (determinism)', r1.hash === r2.hash && r1.tick === r2.tick, `tick ${r1.tick}`)
    rep.check('outpost: seeds vary the colony (diversity)',
        outpost(1).hash !== r1.hash && outpost(2).hash !== outpost(1).hash)
    rep.check('outpost: colony runs 2000+ ticks without a stall (soak length)', r1.tick >= 2000 && r1.end === 'win',
        `win at tick ${r1.tick}`)
}

// --------------------------------------------------------------- Polarity ----
function polarity() {
    const g = poMake(0)
    const st = { dodge: 0 }
    let a = null
    for (let t = 0; t < 20000 && !g.end; t++) {
        poStep(g, poPolicy(g, {}, st))
        if (t === 299) a = { score: g.score, x: g.player.x }
    }
    return { end: g.end, tick: g.tick, score: g.score, lives: g.lives, wave: g.wave, hash: poHash(g), a }
}
rep.section && rep.section('polarity')
{
    const r = polarity()
    rep.check('polarity: score banks early (kills, not drift)', r.a.score > 0, `score ${r.a.score} @tick 300`)
    rep.check('polarity: the three waves are cleared', r.end === 'win' && r.wave === 2 && r.tick <= 6000,
        `tick ${r.tick}, lives ${r.lives}`)
    const r2 = polarity()
    rep.check('polarity: same launch, same trajectory (determinism)', r.hash === r2.hash && r.tick === r2.tick, `${r.hash}@${r.tick}`)
    rep.info('note', 'Polarity waves are a fixed script — no seed varies them; determinism holds it honest instead')
    rep.check('polarity: route runs 4000+ ticks without a stall (soak length)', r.tick >= 4000 && r.end === 'win',
        `win at tick ${r.tick}`)
}

// --------------------------------------------------------- MissileBattle ----
function missile() {
    const g = mbMake(0)
    const held = new Map()
    let fired = 0, a = null
    for (let t = 0; t < 40000 && !g.end; t++) {
        const inp = mbDecide(g, held)
        if (inp.fire) fired++
        mbStep(g, inp)
        if (t === 599) a = { fired, cities: g.bases.filter((b) => b.alive).length }
    }
    return { end: g.end, tick: g.tick, fired, cities: g.bases.filter((b) => b.alive).length, score: g.score, hash: mbHash(g), a }
}
rep.section && rep.section('missile-battle')
{
    const r = missile()
    rep.check('missile-battle: firing is prover-only and cities hold early',
        r.a.fired > 0 && r.a.cities === 3, `fired ${r.a.fired}, cities ${r.a.cities} @tick 600`)
    rep.check('missile-battle: every wave cleared, every city alive', r.end === 'win' && r.cities === 3 && r.tick <= 8000,
        `tick ${r.tick}, fired ${r.fired}, score ${r.score}`)
    const r2 = missile()
    rep.check('missile-battle: same launch, same trajectory (determinism)', r.hash === r2.hash && r.tick === r2.tick, `${r.hash}@${r.tick}`)
    rep.check('missile-battle: run lasts 4000+ ticks (soak length)', r.tick >= 4000 && r.end === 'win', `win at tick ${r.tick}`)
}

// ---------------------------------------------------------------- SmashTV ----
function smash(seed) {
    const gs = stMake(seed)
    let a = null
    for (let t = 0; t < 60000 && !gs.end; t++) {
        stStep(gs, stPadToInp(stDecidePad(gs, 0)))
        if (t === 599) a = { score: gs.score }
    }
    return { end: gs.end, tick: gs.tick, score: gs.score, lives: gs.lives, room: gs.room, hash: stHash(gs), a }
}
rep.section && rep.section('smash-tv')
for (const seed of [0, 1, 2]) {
    const r = smash(seed)
    rep.check(`smash-tv seed ${seed}: score banks early`, r.a.score > 0, `score ${r.a.score} @tick 600`)
    rep.check(`smash-tv seed ${seed}: all rooms cleared`, r.end === 'win' && r.room === 8 && r.tick <= 6000,
        `tick ${r.tick}, score ${r.score}, lives ${r.lives}`)
}
{
    const r1 = smash(0), r2 = smash(0)
    rep.check('smash-tv: same seed, same trajectory (determinism)', r1.hash === r2.hash && r1.tick === r2.tick, `${r1.hash}@${r1.tick}`)
    rep.check('smash-tv: seeds vary the show (diversity)', smash(1).hash !== r1.hash && smash(2).hash !== smash(1).hash)
    rep.check('smash-tv: the show runs to the end (soak length, wins may spend lives on bonus rooms)',
        r1.tick >= 2500 && r1.end === 'win', `win at tick ${r1.tick}`)
}

// -------------------------------------------------------------- MarioKart ----
function kart() {
    const g = mkMake()
    let a = null
    for (let t = 0; t < 9000 && !g.end; t++) {
        mkStep(g, mkDecide(g))
        if (t === 299) a = { v: g.karts[0].v, lap: g.karts[0].lap }
    }
    return { end: g.end, tick: g.tick, lap: g.karts[0].lap, place: g.karts[0].place, hash: mkHash(g), a }
}
rep.section && rep.section('mario-kart')
{
    const r = kart()
    rep.check('mario-kart: v > 0.3 while nobody touches the pad (prover-only throttle)',
        r.a.v > 0.3, `v ${r.a.v.toFixed(2)} @tick 300 (the count eats the first beats)`)
    rep.check('mario-kart: 5 laps, P1', r.end === 'win' && r.lap === 5 && r.place === 1 && r.tick <= 4800,
        `tick ${r.tick}, lap ${r.lap}, place ${r.place}`)
    const r2 = kart()
    rep.check('mario-kart: same grid, same trajectory (determinism)', r.hash === r2.hash && r.tick === r2.tick, `${r.hash}@${r.tick}`)
    rep.info('note', 'The GP grid is fixed — no seed varies it; determinism holds it honest instead')
    rep.check('mario-kart: the GP runs 3000+ ticks (soak length)', r.tick >= 3000 && r.end === 'win', `chequered flag at tick ${r.tick}`)
}

// --------------------------------------------------------------- Paperboy ----
rep.section && rep.section('paperboy')
{
    const w = pbSolve({})
    const total = w.receipts ? w.receipts.reduce((n, x) => n + x.delivered, 0) : 0
    rep.check('paperboy: the witness route completes', !!w.ok, w.ok ? '' : w.why)
    rep.check('paperboy: every street delivers papers (delivered predicate, per stage)',
        w.ok && w.receipts.every((r) => r.delivered >= 20),
        w.ok ? w.receipts.map((r) => `s${r.si}:${r.delivered}`).join(' ') : '')
    rep.check('paperboy: the whole round delivers 70+ papers (soak scale)', total >= 70, `delivered ${total} across ${w.receipts?.length} streets`)
    const w2 = pbSolve({})
    rep.check('paperboy: witness receipts are reproducible (determinism)',
        JSON.stringify(w.receipts) === JSON.stringify(w2.receipts), `total ${total}`)
}

// ------------------------------------------------------------ IceClimber ----
function ice() {
    const g = icMake(icBuild(0))
    const out = icPlan(g)
    return { ok: out.ok, end: out.end, reason: out.reason, ticks: g.tick, digs: g.climbers.reduce((n, c) => n + c.digs, 0), hash: icHash(g) }
}
rep.section && rep.section('ice-climber')
{
    const r = ice()
    rep.check('ice-climber: the three mountains are planned and won', r.ok && r.end === 'win' && r.reason === null,
        `ticks ${r.ticks}, digs ${r.digs}`)
    rep.check('ice-climber: digs grow on the live board (digs predicate)', r.digs >= 60, `digs ${r.digs}`)
    // #1658 tie-in: the scaled bail must leave real headroom for a legit climb.
    const budget = 3 * BAIL_PER_MOUNTAIN
    rep.check('ice-climber: the win spends < half the scaled bail budget (#1658 headroom)',
        r.ticks * 2 < budget && r.reason === null,
        `${r.ticks} of ${budget} budget (${(budget / r.ticks).toFixed(1)}x headroom, BAIL_PER_MOUNTAIN=${BAIL_PER_MOUNTAIN})`)
    const r2 = ice()
    rep.check('ice-climber: same level, same trajectory (determinism)', r.hash === r2.hash && r.ticks === r2.ticks, `${r.hash}@${r.ticks}`)
    rep.info('note', 'The attract course is fixed (buildLevel(0)) — the seat clones the live board and re-plans; determinism guards the solver')
}

// ------------------------------------------------- source pins (#1638 law) ---
// The soak must drive the SAME call the shipped watching branch makes. If a
// component swaps its brain and forgets this script, the pin goes red.
rep.section && rep.section('source')
const PINS = [
    ['OutRun', 'src/games/OutRun/index.jsx', /watchingRef\.current[\s\S]{0,120}decideTick\(gs, watchLaneRef\.current\)/],
    ['LunarLander', 'src/games/LunarLander/index.jsx', /watchingRef\.current[\s\S]{0,120}decide\(gs\)/],
    ['Outpost', 'src/games/Outpost/index.jsx', /watchingRef\.current[\s\S]{0,80}doSim\(decideTick\(gs\)\)/],
    ['Polarity', 'src/games/Polarity/index.jsx', /watchingRef\.current[\s\S]{0,80}doSim\(policy\(gs, \{\}, watchStRef\.current\)\)/],
    ['MissileBattle', 'src/games/MissileBattle/index.jsx', /watchingRef\.current[\s\S]{0,80}doSim\(decide\(gs, watchHeldRef\.current\)\)/],
    ['SmashTV', 'src/games/SmashTV/index.jsx', /watchingRef\.current \? padToInp\(decidePad\(gs, 0\)\)/],
    ['MarioKart', 'src/games/MarioKart/index.jsx', /st\.plan[\s\S]{0,40}inp = decide\(g\)/],
    ['Paperboy', 'src/games/Paperboy/index.jsx', /provenRun\(\)[\s\S]{0,320}doSim\(run\.script\[idx\]\)/],
    ['IceClimber', 'src/games/IceClimber/index.jsx', /plan\(cloneGame\(gs\)\)/],
]
for (const [name, file, re] of PINS) {
    rep.check(`${name}: watching branch drives the same brain this soak drives`, re.test(readFileSync(file, 'utf8')))
}
// The soak must stay wired into the CI table, or it rots into an orphan script.
{
    const checks = readFileSync('scripts/checks.mjs', 'utf8')
    const pkg = readFileSync('package.json', 'utf8')
    rep.check('checks.mjs: watchsoakcheck is registered in the CI table (#1575)', /watchsoakcheck/.test(checks))
    rep.check('package.json: the npm alias exists', /"watchsoakcheck"/.test(pkg))
}

rep.exit()
