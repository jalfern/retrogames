// RALLY CHECK — the RALLY CO-DRIVER harness (#1251). Pure Node: the sim is
// the whole game's truth, so every rule is pinned here without a browser.
//
//   1. the stage is real   — seeded ribbons with >= 10 corners, and crests
//                            that genuinely hide the next corner (honesty)
//   2. the co-driver is honest — the CPU calls each corner once, in order,
//                            with the true dir/sev; late and missed calls
//                            are graded by the ledger
//   3. the note grammar    — the pad edges and the spoken path
//   4. it is deterministic — same seed, same pads → same digest
//   5. it can be won       — the CPU pair (autopilot + co-driver) finishes
//                            two laps on several seeds
//
// Run: npm run rallycheck   (no dev server needed)

import {
    createSim, tickSim, state, stateHash, cpuDriverPad, cpuCoDriverPad,
    visibleAhead, distAhead, gearOf, slopeAt,
    STAGE_L, FOG_RANGE, VMAX, OFF_CAP, LATE_WINDOW,
} from '../src/games/RallyCoDriver/sim.js'
import { makeStage, kappaAt } from '../src/games/RallyCoDriver/stage.js'
import { parseCoCall, coCallFromPad, decideCoCall, applyCallEvent, leadDist } from '../src/games/RallyCoDriver/calls.js'

const SEEDS = [1, 7, 11, 23, 42]

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---- 1. the stage is real -------------------------------------------------
console.log('stage:')
for (const seed of SEEDS) {
    const st = makeStage(seed)
    const n = st.corners.length
    ok(`seed ${seed}: >= 10 corners`, n >= 10, `got ${n}`)
    ok(`seed ${seed}: corners in range with real dir/sev`,
        st.corners.every((c) => c.s >= 0 && c.s < st.L && (c.dir === -1 || c.dir === 1) && c.sev >= 1 && c.sev <= 3))
    // honesty: at least one corner sits behind a crest that eats the sightline
    // to the NEXT corner (visibleAhead from the crest < road distance ahead)
    let hidden = 0
    for (let i = 0; i < n; i++) {
        const vis = visibleAhead(st, st.corners[i].s)
        const toNext = distAhead(st, st.corners[i].s, st.corners[(i + 1) % n].s)
        if (vis < toNext) hidden++
    }
    ok(`seed ${seed}: a crest hides the next corner`, hidden >= 1, `${hidden}/${n} hidden`)
    // the elevation must do its job: on some sample the fog is eaten by a hill
    let crestEaten = 0
    for (let i = 0; i < st.N; i += 37) {
        if (visibleAhead(st, i * st.ds) < FOG_RANGE - 10) crestEaten++
    }
    ok(`seed ${seed}: hills eat the fog`, crestEaten > 0, `${crestEaten} samples`)
}
{
    // curvature is the source of the notes: a sev-3 corner is sharper than sev-1
    const st = makeStage(7)
    const by = (sev) => st.corners.filter((c) => c.sev === sev).map((c) => Math.abs(kappaAt(st, c.s)))
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
    const m1 = by(1), m3 = by(3)
    ok('severity orders curvature', m3.length > 0 && m1.length > 0 && mean(m3) > mean(m1),
        `sev3 ${mean(m3).toFixed(5)} > sev1 ${mean(m1).toFixed(5)}`)
}

// ---- 2. the co-driver is honest -------------------------------------------
console.log('co-driver:')
{
    const g = createSim(7, 2)
    const n = g.stage.corners.length
    let noise = 0, cardsSeen = 0, cardLies = 0
    for (let t = 0; t < 20000 && g.lapsDone < 1; t++) {
        const n0 = g.events.length
        tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
        for (const e of g.events.slice(n0)) if (e.kind === 'noisecall') noise++
        for (const n of g.card) {
            if (n.atS == null) continue
            cardsSeen++
            const c = g.stage.corners.find((c) => c.s === n.atS)
            if (!c || c.dir !== n.dir || c.sev !== n.sev) cardLies++
        }
    }
    ok('CPU co-driver: no noise calls', noise === 0, `${noise}`)
    const st = state(g)
    ok('CPU co-driver: every lap-1 corner got a call', st.stats.called >= n - 1, `called=${st.stats.called} corners=${n}`)
    ok('CPU co-driver: nothing missed while driving', st.stats.missed === 0, `missed=${st.stats.missed}`)
    ok('CPU co-driver: ledger adds up', st.stats.correct + st.stats.late + st.stats.missed <= st.stats.called)
    ok('pace card never lies about a corner', cardsSeen > 0 && cardLies === 0, `${cardLies}/${cardsSeen}`)
}
{
    // late: a call made inside LATE_WINDOW of the corner is graded late
    const g = createSim(7, 2)
    const c = g.stage.corners.find((c) => c.s > 300)
    g.car.s = (c.s - (LATE_WINDOW - 2) + STAGE_L) % STAGE_L
    g.car.prevS = g.car.s
    g.car.v = 1
    applyCallEvent(g, { dir: c.dir, sev: c.sev }, 'human')
    for (let t = 0; t < 300 && g.stats.late === 0 && !g.done; t++) {
        tickSim(g, [cpuDriverPad(g), {}]) // {} = silent co seat
    }
    ok('late call inside the window is graded late', g.stats.late === 1, `late=${g.stats.late} correct=${g.stats.correct}`)
}
{
    // missed: a silent co-driver (seat off) loses every corner it doesn't call
    const g = createSim(7, 1)
    for (let t = 0; t < 2000 && g.stats.missed === 0 && !g.done; t++) tickSim(g, [cpuDriverPad(g)])
    ok('silent co-driver: passed corners are graded missed', g.stats.missed >= 1, `missed=${g.stats.missed}`)
}
{
    // decideCoCall: honest by construction — the next corner only, at its lead
    const g = createSim(7, 2)
    const c = g.stage.corners[0]
    ok('CPU co-driver: silent outside the lead',
        decideCoCall(g) === null || distAhead(g.stage, 0, c.s) <= leadDist(c.sev))
    g.car.s = (c.s - leadDist(c.sev) + 1 + STAGE_L) % STAGE_L
    const call = decideCoCall(g)
    ok('CPU co-driver: calls the true next corner at its lead',
        !!call && call.dir === c.dir && call.sev === c.sev, JSON.stringify(call))
}

// ---- 3. the note grammar ----------------------------------------------------
console.log('grammar:')
{
    const P = (t, want) => {
        const got = parseCoCall(t)
        ok(`parse ${JSON.stringify(t)}`, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`)
    }
    P('left two', { dir: -1, sev: 2 })
    P('right three', { dir: 1, sev: 3 })
    P('straight on', { dir: 0, sev: 1 })
    P('hard left', { dir: -1, sev: 3 })
    P('snap right', { dir: 1, sev: 3 })
    P('two', null)          // a number with no side is noise
    P('hello', null)
    P('', null)
    // the pad edge: a note is a moment, not a hold
    ok('pad edge: left tap → left 1', JSON.stringify(coCallFromPad({}, { left: true })) === JSON.stringify({ dir: -1, sev: 1 }))
    ok('pad edge: right+b → right 3', JSON.stringify(coCallFromPad({}, { right: true, b: true })) === JSON.stringify({ dir: 1, sev: 3 }))
    ok('pad edge: holding up twice → one note', coCallFromPad({ up: true }, { up: true }) === null)
}

// ---- 4. determinism ----------------------------------------------------------
console.log('determinism:')
{
    const run = (seed, ticks) => {
        const g = createSim(seed, 2)
        for (let t = 0; t < ticks && !g.done; t++) tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
        return { h: stateHash(g), j: JSON.stringify(state(g)) }
    }
    const a = run(7, 300), b = run(7, 300), c = run(9, 300)
    ok('same seed, same pads → same digest', a.h === b.h, `${a.h} vs ${b.h}`)
    ok('same seed, same pads → same state', a.j === b.j)
    ok('different seed → different state', a.j !== c.j)
}

// ---- physics: the off-track penalty is real ---------------------------------
console.log('physics:')
{
    const g = createSim(7, 2)
    g.car.lat = 40 // thrown onto the gravel
    g.car.v = VMAX
    for (let t = 0; t < 60 && g.car.v > OFF_CAP + 0.01; t++) tickSim(g, [{}, {}])
    ok('gravel caps the speed', g.car.v <= OFF_CAP + 0.01, `v=${g.car.v.toFixed(3)}`)
    ok('off-track is reported', g.car.off === true)
}

// ---- 5. it can be won ----------------------------------------------------------
console.log('win:')
for (const seed of [7, 11, 23, 42]) {
    const g = createSim(seed, 2)
    let t = 0
    while (!g.done && t < 20000) {
        tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
        t++
    }
    const st = state(g)
    ok(`seed ${seed}: CPU pair finishes two laps`, g.done && g.win && st.laps === st.LAPS,
        `done=${g.done} laps=${st.laps} t=${t} stats=${JSON.stringify(st.stats)}`)
}

// ---- 6. feel signals (#1365 polish) — gears, crests, lap splits ------------
console.log('feel:')
{
    // stepped-RPM: several distinct gears over the range, monotonic in v
    // (a single continuous sweep would collapse to one gear / jitter)
    const gears = new Set()
    let mono = true
    for (let v = 0; v <= VMAX; v += 0.05) {
        const { gear, frac } = gearOf(v)
        gears.add(gear)
        if (gear < gearOf(Math.max(0, v - 0.05)).gear || frac < 0 || frac > 1) mono = false
    }
    ok('engine: stepped gears cover the range', gears.size >= 4, `${gears.size} gears`)
    ok('engine: gear never drops while speeding up, frac in [0,1]', mono)
}
for (const seed of SEEDS) {
    // every seed must have a crest the landing thud can fire on: the slope
    // falls from climb to drop across a 48-unit window (the shell keys the
    // sound off exactly this, armed once per crest)
    const st = makeStage(seed)
    let crests = 0, armed = true
    for (let i = 0; i < 3600; i++) {
        const s = (i / 3600) * STAGE_L
        const over = slopeAt(st, s - 48) > 0.015 && slopeAt(st, s) < -0.015
        if (over && armed) { crests++; armed = false }
        if (!over) armed = true
    }
    ok(`seed ${seed}: crests to land on`, crests >= 1, `${crests}`)
}
for (const seed of [7, 11, 23, 42]) {
    // lap-line banner data: splits recorded per lap, summing to the clock
    const g = createSim(seed, 2)
    let t = 0
    while (!g.done && t < 20000) { tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)]); t++ }
    const st = state(g)
    ok(`seed ${seed}: lap splits recorded and sum to the stage time`,
        st.splits.length === st.LAPS && st.splits.every((x) => x > 1000) &&
        Math.abs(st.splits.reduce((a, b) => a + b, 0) - st.score) <= 40,
        `splits=${JSON.stringify(st.splits)} score=${st.score}`)
}

console.log(`\nrallycheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
