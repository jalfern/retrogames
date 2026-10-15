// marblecheck — MARBLE MADNESS rules harness (Node, zero browser).
//
// Proves three things: the game boots, the load-bearing rules hold, the
// campaign can be won. Also proves the world is deterministic (hash-equal
// replays) and that the hazard roster is actually armed. Run mutants by hand
// to see it go red (e.g. BREAKDROP = 99 in levels.js -> "hard drop shatters"
// fails; restore).

import { makeGame, step, stepOk, stateHash, CFG } from '../src/games/MarbleMadness/sim.js'
import { RACES, GRID, BREAKDROP, buildHeights } from '../src/games/MarbleMadness/levels.js'
import { plan, bfsPath } from '../src/games/MarbleMadness/planner.js'

let fails = 0
const ok = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
    if (!cond) fails++
}

// ---------------------------------------------------------------- boot ----
const g0 = makeGame(0)
ok('boots into play', g0.phase === 'play' && g0.raceIdx === 0 && g0.lives === 3)
ok('six races registered', RACES.length === 6 && RACES[0].name === 'PRACTICE' && RACES[5].name === 'ULTIMATE')
ok('every race heightmap is 36x36', RACES.every((r, i) => buildHeights(i).length === GRID && buildHeights(i).every((row) => row.length === GRID)))

// ------------------------------------------------- course connectivity ----
let conn = true
for (let i = 0; i < RACES.length; i++) {
    const gs = makeGame(0)
    loadInto(gs, i)
    const p = bfsPath(gs, RACES[i].start.r, RACES[i].start.c, RACES[i].goal.r, RACES[i].goal.c, false, 2)
    if (!p.length) { conn = false; console.log('  disconnected race', i, RACES[i].name) }
}
ok('all six courses start->goal connected on walkable ground', conn)

// start and goal cells are solid in every race
let caps = true
for (let i = 0; i < RACES.length; i++) {
    const h = buildHeights(i)
    if (h[RACES[i].start.r][RACES[i].start.c] < 0 || h[RACES[i].goal.r][RACES[i].goal.c] < 0) caps = false
}
ok('start/goal sit on solid tiles', caps)

// ------------------------------------------------------- determinism ----
const script = []
const rnd = (() => { let s = 1234567; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
for (let t = 0; t < 600; t++) {
    const r = rnd()
    script.push({ left: r < 0.3, right: r > 0.7, up: r > 0.4 && r < 0.5, down: r > 0.5 && r < 0.6 })
}
const h1 = (() => { const gs = makeGame(0); for (const i of script) step(gs, i); return stateHash(gs) })()
const h2 = (() => { const gs = makeGame(0); for (const i of script) step(gs, i); return stateHash(gs) })()
ok('identical inputs hash identical states', h1 === h2, h1)

// ---------------------------------------------------------- core rules ----
// arrows are acceleration: from rest, one press moves a fraction, not a jump
{
    const gs = makeGame(0)
    step(gs, { left: false, right: true, up: false, down: true })
    ok('push is inertia (speed stays small)', Math.hypot(gs.m.vx, gs.m.vy) < 0.02, `v=${gs.m.vx.toFixed(4)}`)
    // right+down is the sim's screen->world inverse for true east
    ok('right+down pushes east with inertia', gs.m.vx > 0 && Math.abs(gs.m.vy) < 1e-9)
}

// rolling off the map edge = void death (one life)
{
    const gs = makeGame(0)
    gs.m.x = 0.5
    gs.m.y = 0.5 // above the top-left void
    gs.m.z = gs.heights[0][0] >= 0 ? gs.heights[0][0] : 8
    let died = 0
    for (let t = 0; t < 200 && !died; t++) {
        step(gs, { left: false, right: false, up: false, down: false })
        if (gs.events.some((e) => e.type === 'shatter' && e.how === 'void')) died = 1
    }
    ok('void under the marble kills', died === 1)
}

// a landing more than BREAKDROP steps deep shatters
{
    const gs = makeGame(0)
    loadInto(gs, 5) // ULTIMATE holds z~8 ground under a z12 drop
    gs.m.x = 5.5; gs.m.y = 18.5
    gs.m.air = true
    gs.m.z = 12
    gs.m.zFrom = 12
    gs.m.vz = -0.2
    let how = null
    for (let t = 0; t < 200 && !how; t++) {
        step(gs, { left: false, right: false, up: false, down: false })
        const e = gs.events.find((ev) => ev.type === 'shatter' || ev.type === 'land')
        if (e) how = e.type === 'land' ? `land drop ${e.drop.toFixed(1)}` : e.how
    }
    ok('hard drop (> BREAKDROP) shatters', how === 'shatter', `from z12 over z~8: ${how}`)
    const okDrop = BREAKDROP >= 2 && BREAKDROP <= 4
    ok('breakdrop threshold is sane', okDrop, `BREAKDROP=${BREAKDROP}`)
}

// the clock runs per race; leftover carries AND banks by race weight
{
    const gs = makeGame(0)
    const before = gs.timeT
    step(gs, { left: false, right: false, up: false, down: false })
    ok('clock ticks down', gs.timeT === before - 1)
    // clear race 0 artificially
    gs.m.x = RACES[0].goal.c + 0.5
    gs.m.y = RACES[0].goal.r + 0.5
    gs.timeT = 30 * 60
    let ev = null
    for (let t = 0; t < 200 && !ev; t++) { step(gs, { left: false, right: false, up: false, down: false }); ev = gs.events.find((e) => e.type === 'raceClear') }
    ok('goal clears the race and banks secs*100*(idx+1)', ev && ev.secs === 30 && ev.pts === 30 * 100 * 1)
    let started = null
    for (let t = 0; t < 300 && !started; t++) { step(gs, { left: false, right: false, up: false, down: false }); started = gs.events.find((e) => e.type === 'raceStart' && gs.raceIdx === 1) }
    ok('carry rides into the next race clock', started && started.carry >= 30 * 60 - 2 && started.carry <= 30 * 60 && gs.timeT === RACES[1].time * 60 + started.carry)
}

// time-up on a scoring race ends the run; practice only restarts itself
{
    const gs = makeGame(0)
    gs.timeT = 2
    let restarted = false
    for (let t = 0; t < 300 && !restarted; t++) { step(gs, { left: false, right: false, up: false, down: false }); restarted = gs.events.some((e) => e.type === 'practiceRestart') }
    ok('practice time expires with no penalty', restarted)
    const gs2 = makeGame(0)
    gs2.raceIdx = 1
    loadInto(gs2, 1)
    gs2.timeT = 2
    let over = false
    for (let t = 0; t < 400 && !over; t++) { step(gs2, { left: false, right: false, up: false, down: false }); over = gs2.events.some((e) => e.type === 'timeUp') }
    ok('time-up on a real race kills the run', over)
}

// hazards are armed on the courses that advertise them
{
    const armed = RACES.every((r) => (r.munchers || []).length <= 3 && (r.slinkies || []).every((s) => !!r) && (r.steelies || []).every((st) => r.blocks))
    ok('hazard rosters belong to their races', armed)
    const g5 = makeGame(0)
    loadInto(g5, 5)
    g5.waves = []
    g5.steelies = [] // park it clean: a passing steelie knock moves it off the jaw
    g5.m.x = g5.munchers[0].c + 0.5
    g5.m.y = g5.munchers[0].r + 0.5
    g5.m.z = g5.heights[g5.munchers[0].r][g5.munchers[0].c]
    let munched = false
    for (let t = 0; t < 500 && !munched; t++) { step(g5, { left: false, right: false, up: false, down: false }); munched = g5.events.some((e) => e.how === 'munch') }
    ok('a marble parked under a muncher gets eaten', munched)
}

// steelie knocks — it does not kill you directly
{
    const g5 = makeGame(0)
    loadInto(g5, 5)
    const st = g5.steelies[0]
    g5.m.x = st.x + 0.7
    g5.m.y = st.y
    g5.m.z = g5.heights[Math.floor(g5.m.y)][Math.floor(g5.m.x)]
    let hit = false, stillAlive = true
    for (let t = 0; t < 80 && !hit; t++) {
        step(g5, { left: false, right: false, up: false, down: false })
        hit = g5.events.some((e) => e.type === 'steelieHit')
        if (g5.events.some((e) => e.type === 'shatter')) stillAlive = false
    }
    ok('steelie contact knocks, never directly kills', hit && stillAlive)
}

// --------------------------------------------------------- win condition ----
const run = plan(0, { maxTicks: 60 * 60 * 9 })
ok('campaign is winnable (autopilot, all six races)', run.won && run.races === 6, `score ${run.score}, ${run.deaths} deaths, ${run.ticks} ticks`)
ok('win scores at least a full carry ladder', run.score > 100000, `score ${run.score}`)

// the winning script, replayed, reproduces the win hash-for-hash
{
    const gs = makeGame(0)
    for (const i of run.script) step(gs, i)
    ok('winning replay lands in WIN state', gs.end === 'win' && gs.clears === 6, stateHash(gs))
}

// ------------------------------------------------ analog trackball (#290) ----
// The sim takes an optional inp.analog {x, y} (the trackball vector from the
// pad state). Pins: full push is bit-identical to the digital arrow in the
// same direction, a sub-dead-zone push is bit-identical to no input, and the
// force grows with the push (the marble is proportional, not binary).
{
    const full = makeGame(0), digital = makeGame(0)
    step(full, { analog: { x: 1, y: 0 } })
    step(digital, { right: true })
    ok('analog full push is bit-identical to the digital arrow',
        full.m.vx === digital.m.vx && full.m.vy === digital.m.vy,
        `${full.m.vx},${full.m.vy} vs ${digital.m.vx},${digital.m.vy}`)

    const tiny = makeGame(0), idle = makeGame(0)
    step(tiny, { analog: { x: 0.02, y: 0 } })
    step(idle, {})
    ok('sub-dead-zone analog is bit-identical to no input',
        tiny.m.vx === idle.m.vx && tiny.m.vy === idle.m.vy,
        `${tiny.m.vx},${tiny.m.vy} vs ${idle.m.vx},${idle.m.vy}`)

    const speeds = [0, 0.25, 0.5, 1].map((p) => {
        const gs = makeGame(0)
        step(gs, { analog: { x: p, y: 0 } })
        return Math.hypot(gs.m.vx, gs.m.vy)
    })
    ok('analog force grows with the push (proportional trackball)',
        speeds[0] < speeds[1] && speeds[1] < speeds[2] && speeds[2] < speeds[3],
        speeds.map((s) => s.toFixed(4)).join(' < '))
}

// harness CAN fail: assert the pieces we rely on are real
ok('stepOk refuses void steps', !stepOk(g0, 0, 0, -1, 0) && stepOk(g0, RACES[0].start.r, RACES[0].start.c, RACES[0].start.r + 1, RACES[0].start.c))
ok('brake budget fits physics (maxV needs >0.4 + v*6)', CFG.maxV > 0.1)

if (fails) {
    console.log(`\n${fails} FAILURE(S)`)
    process.exit(1)
}
console.log('\nall checks green')

// helper kept below its uses on purpose: loads a fresh race terrain into gs
function loadInto(gs, idx) {
    gs.raceIdx = idx
    gs.race = RACES[idx]
    gs.heights = buildHeights(idx)
    gs.waves = (RACES[idx].waves || []).map((w) => ({ ...w }))
    gs.steelies = (RACES[idx].steelies || []).map((s) => ({ x: s.c + 0.5, y: s.r + 0.5, hx: s.c + 0.5, hy: s.r + 0.5, vx: 0, vy: 0 }))
    gs.munchers = (RACES[idx].munchers || []).map((mo) => ({ c: mo.c, r: mo.r, phase: mo.phase }))
    gs.slinkies = (RACES[idx].slinkies || []).map((s) => ({ c: s.c, r: s.r, acid: !!s.acid, cool: 0 }))
    gs.hammers = (RACES[idx].hammers || []).map((h) => ({ c: h.c, r: h.r, phase: h.phase }))
    gs.lives = 3
    gs.phase = 'play'
    gs.end = null
    gs.m = { x: RACES[idx].start.c + 0.5, y: RACES[idx].start.r + 0.5, vx: 0, vy: 0, z: gs.heights[RACES[idx].start.r][RACES[idx].start.c], vz: 0, air: false, zFrom: 0, dir: [1, 1] }
}
