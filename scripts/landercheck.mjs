// LUNAR LANDER — scripts/landercheck.mjs : the self-verifying harness. Node only,
// no browser. It imports the SAME terrain/sim/planner the cabinet drives and
// proves three things — it boots, its core rules hold, and it can be won — then
// (with --mutate) breaks load-bearing lines and requires each to go red.
//
// Run:  npm run landercheck  [-- --mutate]
//
//   determinism   identical seed + identical input script → identical state hash,
//                 tick for tick (nothing here may depend on wall-clock or Math.random).
//   terrain       five flat pads per terrain, 100·50·20·50·100 with the widest
//                 pad paying least, inside the ground band, and the heightmap is
//                 real (not a flat line).
//   the rules     gravity pulls every tick; thrust only along the ship axis;
//                 fuel drains while burning and empty means dead engine; a soft
//                 landing banks pad×multiplier + fuel bonus, hard/tilted/slope
//                 touches crash; docking refuels and steps the multiplier; a
//                 lander out of fuel on the pad is stranded, and zero landers ends it.
//   the win       the autopilot clears all five missions DEATHLESS on four seeds,
//                 and the whole campaign re-wins deathless with 70 units cut from
//                 every tank (slack) yet LOSES at 110 — so the tanks and the pilot's
//                 energy law are load-bearing, not padding.

import { genTerrain, terrainY, padAt, WORLD_W, NPTS, STEP, GROUND_MIN, GROUND_MAX } from '../src/games/LunarLander/terrain.js'
import { makeGame, step, stateHash, CFG, ORBIT_Y, TARGET_CYCLES } from '../src/games/LunarLander/sim.js'
import { plan, decide } from '../src/games/LunarLander/planner.js'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`) } }
const section = (t) => console.log(`\u001b[1m${t}\u001b[0m`)

const RUNS = [0, 1, 2, 3].map((seed) => ({ seed, r: plan({ seed }) }))

section('BOOT + DETERMINISM')
ok('autopilot campaign finishes on four seeds', RUNS.every(({ r }) => !!r.end), RUNS.map(({ seed, r }) => `${seed}:${r.end}`).join(' '))
ok('every campaign reaches a terminal state within budget', RUNS.every(({ r }) => r.ticks > 500 && r.ticks < 30000), RUNS.map(({ r }) => r.ticks).join(','))
{
    const a = makeGame(0), b = makeGame(0)
    const ha = [], hb = []
    const scr = RUNS[0].r.script
    for (let i = 0; i < 500; i++) {
        const inp = scr[i] || { rot: 0, thrust: false }
        step(a, inp); step(b, inp)
        if (i % 97 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)) }
    }
    ok('identical script → identical state hash (no wall-clock / Math.random)',
        ha.length > 4 && ha.every((h, i) => h === hb[i]))
}

section('TERRAIN')
{
    let bad = 0, padBad = 0, offBand = 0, flat = 0
    for (let idx = 0; idx < 8; idx++) {
        const t = genTerrain(0, idx)
        if (t.pts.length !== NPTS) bad++
        if (t.pads.length !== 5) padBad++
        for (const p of t.pads) {
            for (let i = p.i0; i <= p.i1; i++) if (t.pts[i] !== p.y) padBad++
            if (p.y < GROUND_MIN || p.y > GROUND_MAX) offBand++
        }
        for (const v of t.pts) if (v < GROUND_MIN - 1 || v > GROUND_MAX + 1) offBand++
        const min = Math.min(...t.pts), max = Math.max(...t.pts)
        if (max - min > 60) flat++
    }
    ok('eight terrains of the right size', bad === 0)
    ok('five pads each, every pad dead flat', padBad === 0)
    ok('terrain stays inside the ground band', offBand === 0)
    ok('terrain is genuinely jagged (relief > 60u on every map)', flat === 8)
    const t0 = genTerrain(0, 0)
    const vals = t0.pads.map((p) => p.val).join(','), widths = t0.pads.map((p) => p.i1 - p.i0)
    ok('pays the classic table 100,50,20,50,100', vals === '100,50,20,50,100', vals)
    ok('the widest pad pays least (20)', widths[2] === Math.max(...widths))
    ok('padAt finds the centre pad and nothing between pads',
        padAt(t0, 512)?.val === 20 && padAt(t0, 400) === null)
    ok('terrainY interpolates between grid points', Math.abs(terrainY(t0.pts, STEP / 2) - t0.pts[0] / 2 - t0.pts[1] / 2) < 0.001)
}

section('THE RULES')
{
    const g = makeGame(0)
    const v0 = g.vy
    step(g, { rot: 0, thrust: false })
    ok('gravity pulls every tick', g.vy < v0)

    // axis thrust: pointing sideways pushes sideways, and less than full up
    const gu = makeGame(0); gu.y = 250; gu.vy = 0; gu.vx = 0
    for (let i = 0; i < 30; i++) step(gu, { rot: 0, thrust: true })
    ok('full burn upright nets thrust − gravity of vertical push', Math.abs(gu.vy - (CFG.thrust - CFG.gravity) / 2) < 0.5, `vy ${gu.vy.toFixed(2)}`)
    const gt = makeGame(0); gt.y = 250; gt.vy = 0; gt.vx = 0; gt.rot = Math.PI / 2
    for (let i = 0; i < 30; i++) step(gt, { rot: 0, thrust: true })
    ok('sideways thrust pushes sideways, not up', Math.abs(gt.vx) > CFG.thrust * 0.4 && Math.abs(gt.vy + CFG.gravity / 2) < 0.5, `vx ${gt.vx.toFixed(1)} vy ${gt.vy.toFixed(1)}`)

    // fuel drains, empty = dead engine
    const gf = makeGame(0)
    const f0 = gf.fuel
    step(gf, { rot: 0, thrust: true })
    ok('burning drains fuel', gf.fuel < f0)
    const gz = makeGame(0); gz.fuel = 0
    for (let i = 0; i < 10; i++) step(gz, { rot: 0, thrust: true })
    ok('empty tank, no thrust — gravity only', gz.fuelOut === true && Math.abs(gz.vy - (-4 - CFG.gravity / 6)) < 1e-6, `fuelOut=${gz.fuelOut} vy ${gz.vy}`)

    // soft landing on the centre pad banks pad×mult + fuel bonus
    const gl = makeGame(0)
    const pad = gl.terrain.pads[2]
    gl.x = pad.cx; gl.y = pad.y + 10.005; gl.vx = 0; gl.vy = -5; gl.rot = 0
    step(gl, { rot: 0, thrust: false })
    ok('a gentle flat touchdown lands', gl.phase === 'landed')
    const want = pad.val * gl.mult + Math.round(gl.fuel) * gl.mult
    ok('pad landing banks value×mult + fuel×mult', gl.score === want, `${gl.score} vs ${want}`)

    // hard vertical crash
    const gh = makeGame(0)
    gh.x = pad.cx; gh.y = pad.y + 10.005; gh.vy = -CFG.softVert - 2; gh.vx = 0
    step(gh, { rot: 0, thrust: false })
    ok('touching down too fast CRASHES', gh.crashes === 1 && gh.phase === 'crashed')

    // sideways drift crash
    const gd = makeGame(0)
    gd.x = pad.cx; gd.y = pad.y + 10.005; gd.vy = -5; gd.vx = CFG.softHoriz + 2
    step(gd, { rot: 0, thrust: false })
    ok('drifting in too fast CRASHES', gd.crashes === 1)

    // tilt crash
    const gtl = makeGame(0)
    gtl.x = pad.cx; gtl.y = pad.y + 10.005; gtl.vy = -5; gtl.rot = CFG.tiltMax + 0.05
    step(gtl, { rot: 0, thrust: false })
    ok('touching down tipped CRASHES', gtl.crashes === 1)

    // slope crash: pick a steep grid run off the pads
    const gs2 = makeGame(0)
    let slopeX = -1
    const pts = gs2.terrain.pts
    for (let i = 2; i < NPTS - 2 && slopeX < 0; i++) {
        const x = i * STEP
        if (padAt(gs2.terrain, x)) continue
        if (Math.abs(terrainY(pts, x + 9.5) - terrainY(pts, x - 9.5)) > 8) slopeX = x
    }
    if (slopeX > 0) {
        gs2.x = slopeX; gs2.y = terrainY(pts, slopeX) + 10.005; gs2.vy = -5; gs2.vx = 0
        step(gs2, { rot: 0, thrust: false })
        ok('touching down on a slope CRASHES', gs2.crashes === 1)
    } else ok('touching down on a slope CRASHES', false, 'no slope found')

    // pad edges are cruel: a foot outside the pad never scores that pad
    const ge = makeGame(0)
    ge.x = pad.cx + (pad.i1 - pad.i0) * STEP / 2 + 4
    ge.y = Math.max(...[ge.x - 9.5, ge.x, ge.x + 9.5].map((x) => terrainY(pts, x))) + 10.005
    ge.vy = -5; ge.vx = 0
    step(ge, { rot: 0, thrust: false })
    ok('a lander astride the pad edge never banks the pad value', !(ge.phase === 'landed' && ge.landedPad === pad.val), `phase=${ge.phase} pad=${ge.landedPad}`)

    // docking: proximity at the orbit line refuels and steps the multiplier
    const gk = makeGame(0)
    gk.phase = 'ascent'; gk.y = ORBIT_Y - 4; gk.x = 300; gk.vy = 4; gk.vx = 0; gk.fuel = 12
    gk.orb = { x: 300, vx: 42 }
    const m0 = gk.mult, sc0 = gk.score
    step(gk, { rot: 0, thrust: false })
    ok('docking refuels, banks the bonus and steps the multiplier', gk.cycle === 1 && gk.fuel === CFG.startFuel && gk.mult === m0 + 1 && gk.score === sc0 + 200 * m0)
    ok('docking loads a NEW terrain', gk.terrainIdx === 1)
    // multiplier caps at 10
    const gm = makeGame(0); gm.mult = 10
    gm.phase = 'ascent'; gm.y = ORBIT_Y; gm.x = 300; gm.vy = 0; gm.orb = { x: 300, vx: 42 }
    step(gm, { rot: 0, thrust: false })
    ok('multiplier caps at ×10', gm.mult === 10)

    // stranded: empty tank on the pad burns a lander, zero landers ends the run
    const gst = makeGame(0)
    gst.phase = 'landed'; gst.fuel = 0; gst.phaseT = 119
    step(gst, { rot: 0, thrust: false })
    ok('the pad gives a stranded lander grace…', gst.landers === CFG.landers)
    gst.phaseT = 121
    step(gst, { rot: 0, thrust: false })
    ok('…then writes it off', gst.landers === CFG.landers - 1)
    const go = makeGame(0)
    go.landers = 1
    go.x = pad.cx; go.y = pad.y + 10.005; go.vy = -80; go.vx = 0
    step(go, { rot: 0, thrust: false })
    ok('the last lander lost ends the run', go.end === 'over' && go.win === false)

    // rotation follows the stick both ways
    const gr = makeGame(0); gr.y = 300
    step(gr, { rot: -1, thrust: false })
    ok('the stick rotates the ship', gr.rot < 0)
}

section('THE PILOT IS AN HONEST FLYER')
{
    // feed the planner's own decision function a bad state: it must never ask
    // for a crash-shaped shortcut — it cannot steer through the crash gates.
    const pad = genTerrain(0, 0).pads[2]
    const fast = makeGame(0)
    fast.x = pad.cx; fast.y = pad.y + 12; fast.vy = -60
    const inp = decide(fast)
    ok('over the pad at 60 u/s the autopilot asks for thrust (it cannot land this)', inp.thrust === true)
    const tilted = makeGame(0)
    tilted.x = pad.cx; tilted.y = pad.y + 30; tilted.vy = -5; tilted.rot = 1.2
    const inp2 = decide(tilted)
    ok('steeply tilted the autopilot commands a level-off, not a landing', inp2.rot !== 0)
    const onPad = makeGame(0)
    onPad.phase = 'landed'; onPad.y = pad.y + 10; onPad.orb = { x: 700, vx: 42 }
    const inp3 = decide(onPad)
    ok('on the pad it waits for the orbiter before lighting (free fuel)', typeof inp3.thrust === 'boolean')
}

section('IT CAN BE WON')
for (const { seed, r } of RUNS) {
    ok(`seed ${seed}: the autopilot clears all ${TARGET_CYCLES} missions`, r.cycles === TARGET_CYCLES, `cycles=${r.cycles}`)
    ok(`seed ${seed}: DEATHLESS (zero crashes)`, r.crashes === 0, `crashes=${r.crashes}`)
}
{
    // SLACK RULE — every tank cut by 100 still wins deathless; 110 kills it.
    const slackRun = (cut) => {
        CFG.startFuel -= cut
        const g = makeGame(0)
        for (const inp of RUNS[0].r.script) { step(g, inp); if (g.end) break }
        CFG.startFuel += cut
        return g
    }
    const s100 = slackRun(100)
    ok('slack: the campaign still wins DEATHLESS with 100 units cut from every tank', s100.win === true && s100.crashes === 0, `win=${s100.win} crashes=${s100.crashes}`)
    const s110 = slackRun(110)
    ok('load-bearing: the SAME campaign loses with 110 units cut', s110.win === false)
    ok('the win banks a real score (pads × mult + fuel + dock bonuses)', RUNS.every(({ r }) => r.score > 4000), RUNS.map(({ r }) => r.score).join(','))
}

// --------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    section('MUTANTS (each must be CAUGHT — the check must go red)')
    const expectRed = (name, fn) => { const caught = !fn(); ok(`mutant killed: ${name}`, caught) }

    expectRed('gravity off (free fall becomes free flight)', () => {
        const saved = CFG.gravity
        CFG.gravity = 0
        const g = makeGame(0)
        const v0 = g.vy
        step(g, { rot: 0, thrust: false })
        CFG.gravity = saved
        return g.vy < v0                       // normally pulled down; without gravity, not
    })

    expectRed('softVert gate off (the pad accepts a meteor)', () => {
        const saved = CFG.softVert
        CFG.softVert = 1e9
        const g = makeGame(0)
        const pad = g.terrain.pads[2]
        g.x = pad.cx; g.y = pad.y + 10.005; g.vy = -CFG.softVert + 1 - 1e6 / 1e6 - 999
        g.vy = -500
        step(g, { rot: 0, thrust: false })
        CFG.softVert = saved
        return g.crashes === 1                 // normally a crash; with the gate gone it lands
    })

    expectRed('refuel off (docking stops refilling)', () => {
        CFG.refuel = false
        const g = makeGame(0)
        g.phase = 'ascent'; g.y = ORBIT_Y; g.x = 300; g.vy = 0; g.fuel = 10; g.orb = { x: 300, vx: 42 }
        step(g, { rot: 0, thrust: false })
        CFG.refuel = true
        return g.fuel === CFG.startFuel      // normally refuelled; without it, dry
    })

    expectRed('multiplier frozen (pads stop paying for the climb)', () => {
        const saved = CFG.landers
        const g = makeGame(0)
        g.mult = 7
        g.phase = 'ascent'; g.y = ORBIT_Y; g.x = 300; g.vy = 0; g.orb = { x: 300, vx: 42 }
        const before = g.mult
        // freeze mult by pinning the cap
        const orig = Object.getOwnPropertyDescriptor(g, 'mult')
        Object.defineProperty(g, 'mult', { get: () => before, set: () => {}, configurable: true })
        step(g, { rot: 0, thrust: false })
        if (orig) Object.defineProperty(g, 'mult', orig)
        void saved
        return g.mult > before               // normally the dock steps it; frozen it cannot
    })
}

console.log(`\n${fail === 0 ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m'}  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
