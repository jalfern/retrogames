// SSX — the Node audit. Boots the pure game, pins every load-bearing rule,
// proves the autopilot wins all three heats AND Showoff, re-proves both at a
// 0.75x trick economy with the chain capped at x3 (the slack rule), and
// replays identical scripts to identical hashes. No browser, no randomness.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, PLACE_PTS, cloneGame, stateHash, CARVE_FADE } from '../src/games/SSX/sim.js'
import { decide, PACE } from '../src/games/SSX/planner.js'
import { buildCourse, terrainY, COURSE_COUNT, DS, WALL_X } from '../src/games/SSX/course.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

const run = (g, ticks, inp = {}) => { for (let i = 0; i < ticks; i++) step(g, inp) }
const autopilot = (g, maxT = 400000) => {
    let t = 0
    while (!g.end && t < maxT) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ }
    return g
}
const hasEv = (g, type, pred = () => true) => g.events.some((e) => e.type === type && pred(e))
const clear = (g) => g.events.splice(0)

// ---- 1. boots ---------------------------------------------------------------
{
    const g = makeGame('race')
    ok('boots: race game exists with 6 riders', g.riders.length === 6)
    ok('boots: starts on countdown', g.phase === 'count' && g.count === 180)
    run(g, 181)
    ok('boots: countdown releases to run', g.phase === 'run')
    const s = makeGame('showoff')
    ok('boots: showoff timer', Math.round(s.showoffLeft) === CFG.showoffTime)
    ok('boots: three courses exist', COURSE_COUNT === 3)
}

// ---- 2. course integrity ----------------------------------------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    ok(`course ${co.name}: long enough`, co.N > 150)
    let mono = true
    for (let i = 1; i < co.N; i++) if (co.segs[i].y > co.segs[i - 1].y + 1e-9) mono = false
    ok(`course ${co.name}: whole mountain falls downhill`, mono)
    ok(`course ${co.name}: drop is real`, co.segs[0].y - co.segs[co.N - 1].y > 8)
    ok(`course ${co.name}: features on the map`, co.kickers.length >= 3 && (c === 2 ? co.pipes.length === 2 : co.obstacles.length >= 8))
    const inside = co.kickers.every((k) => k.i0 > 4 && k.i1 < co.N - 2) &&
        co.rails.every((r) => r.i0 > 4 && r.i1 < co.N - 2) &&
        co.obstacles.every((o) => o.i > 4 && o.i < co.N - 2)
    ok(`course ${co.name}: features within bounds`, inside)
    ok(`course ${co.name}: deterministic build`, JSON.stringify(buildCourse(c)) === JSON.stringify(co))
}

// ---- 3. rule pins -----------------------------------------------------------
{ // gravity feeds the hill, carving takes it back
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    p.x = 0; p.v = 10
    const v0 = p.v
    run(g, 60)
    ok('gravity accelerates downhill', p.v > v0 + 1)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]; q.x = 0; q.v = 20
    const before = q.v
    run(g2, 60, { steer: 1 })
    ok('hard carving bleeds speed', q.v < before + 4.5)
}
{ // powder: off-piste sucks the speed out toward 14 m/s
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 1.25; p.v = 24
    run(g, 60)
    ok('powder drag caps off-piste speed', p.v < 20)
}
{ // wall: hard edge of the valley crashes you
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = WALL_X - 0.03; p.v = 18
    run(g, 8, { steer: 1 })
    ok('the rock wall bails you', p.tumble > 0 && hasEv(g, 'crash'))
}
{ // clean landing banks the trick; a half-finished flip eats it
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    p.air = true; p.y = terrainY(g.course, p.s, p.x) + 6; p.vy = 2; p.spin = 540; p.grab = 1
    let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
    ok('spin+grab banks on landing', hasEv(g, 'land', (e) => /540/.test(e.name || '')) && p.score > 0)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]
    q.air = true; q.y = terrainY(g2.course, q.s, q.x) + 6; q.vy = 2; q.flip = 200
    t = 0; while (q.air && t < 300) { step(g2, {}); t++ }
    ok('a half-done flip is a bail', q.tumble > 0 && hasEv(g2, 'crash'))
}
{ // chains multiply; bails reset to x1
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const bankOnce = () => {
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360; p.flip = 0; p.grab = 0
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
    }
    bankOnce(); clear(g)
    bankOnce()
    const e = g.events.find((ev) => ev.type === 'land')
    ok('second clean trick pays x2', e && e.mult === 2)
    p.tumble = 1; p.chain = 0
}
{ // OVER: full meter at takeoff doubles the ledger
    const base = (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.meter = 50
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
        return g.events.find((e) => e.type === 'land').pts
    })()
    const over = (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.meter = 100
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360; p.over = true
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
        const e = g.events.find((ev) => ev.type === 'land')
        ok('OVER is announced in the name', /OVER/.test(e.name))
        return e.pts
    })()
    ok('OVER doubles the pay', over === base * 2)
}
{ // boost: spends meter, lifts the ceiling to 38 (pace 1)
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.meter = 60; p.x = 0; p.v = 28
    run(g, 120, { boost: true })
    ok('boost drains the meter', p.meter < 60 - 20)
    ok('boost raises the ceiling', p.v > CFG.top + 2 && p.v <= CFG.boostTop + 0.01)
}
{ // crash penalty: speed, meter and chain all dump
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.v = 26; p.meter = 80; p.chain = 2
    p.x = WALL_X - 0.03
    run(g, 8, { steer: 1 })
    ok('crash dumps speed', p.v < 20)
    ok('crash dumps half the meter', Math.abs(p.meter - 40) < 1)
    ok('crash resets the chain', p.chain === 0)
}
{ // rails: grind pays trickle points and ignores spins
    const g = makeGame('race', 0)
    g.phase = 'run'; g.count = 0
    const p = g.riders[0]
    const rl = g.course.rails[0]
    p.s = rl.i0 * DS + 2; p.x = rl.x; p.v = 20
    clear(g)
    run(g, 45, { steer: 1 })
    ok('grind trickles points', hasEv(g, 'grind', (e) => e.pts > 0) || p.score > 0)
    ok('grind pins the line', p.grind !== null && Math.abs(p.x - rl.x) < 0.05)
}
{ // finish: places count and standings book correctly
    const g = makeGame('race'); run(g, 181); clear(g)
    const finishS = g.course.finish * DS
    g.riders[1].s = finishS + 1
    step(g, {})
    ok('CPU crossing first books 10 pts', g.standings[1] === PLACE_PTS[0])
    p: {
        const p = g.riders[0]; p.s = finishS + 1
        step(g, {})
        ok('player crossing second books 7 pts', g.standings[0] === PLACE_PTS[1] && p.place === 2)
        ok('heat ends when the player finishes', g.phase === 'heatEnd')
    }
}
{ // heat progression: a win walks all three courses
    const g = autopilot(makeGame('race'))
    ok('race wins end after three heats', g.end === 'win' && g.heat === COURSE_COUNT - 1 && g.place === 1)
    ok('winner books every heat', g.standings[0] === PLACE_PTS[0] * COURSE_COUNT)
}

// ---- 3b. carved tracks ----------------------------------------------------
{ // the slope remembers your line for ~5 s, nothing when straight or airborne
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 0; p.v = 20
    run(g, 40, { steer: 1 })
    ok('hard carving leaves grooves', p.carves.length >= 30)
    const nAir = p.carves.length
    p.air = true; p.y = terrainY(g.course, p.s, p.x) + 4; p.vy = 0
    run(g, 20, { steer: 1 })
    ok('airborne boards carve nothing', p.carves.length === nAir)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]; q.x = 0; q.v = 20
    run(g2, 40, { steer: 1 })
    ok('carving marks accumulate', q.carves.length > 0)
    run(g2, CARVE_FADE + 5)
    ok('carved tracks fade within ~5 s', q.carves.length === 0)
    const g3 = makeGame('race'); run(g3, 181); clear(g3)
    run(g3, 40)
    ok('straight riding leaves no grooves', g3.riders[0].carves.length === 0)
}

// ---- 4. win proofs -----------------------------------------------------------
{
    const g = autopilot(makeGame('race'))
    ok('PROVEN: the autopilot is MOUNTAIN CHAMPION', g.end === 'win')
    const p = g.riders[0]
    ok('the champion actually thrashed the field', p.tricksLanded > 0 && p.crashes === 0)
    const so = autopilot(makeGame('showoff'))
    ok('PROVEN: showoff clears the house target', so.end === 'win' && so.riders[0].score >= CFG.showoffTarget)
}

// ---- 5. slack rule -----------------------------------------------------------
{ // one fewer of every supply the winning script consumes
    const gain = CFG.boostGain, cap = CFG.comboCap
    CFG.slack = true; CFG.boostGain = gain * 0.75; CFG.comboCap = 3
    try {
        const g = autopilot(makeGame('race'))
        ok('SLACK: race still wins at 0.75x trick economy, chain cap x3', g.end === 'win')
        const so = autopilot(makeGame('showoff'))
        ok('SLACK: showoff still clears', so.end === 'win')
    } finally { CFG.slack = false; CFG.boostGain = gain; CFG.comboCap = cap }
}

// ---- 6. determinism ----------------------------------------------------------
{
    const a = makeGame('race'), b = makeGame('race')
    const script = []
    for (let i = 0; i < 4000; i++) script.push(i % 500 < 20 ? { steer: 1, boost: i % 7 === 0 } : {})
    let ha = [], hb = []
    for (let i = 0; i < script.length; i++) {
        step(a, script[i]); step(b, script[i])
        if (i % 500 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)) }
    }
    ok('replay is hash-for-hash identical', ha.join(',') === hb.join(','))
    const g = cloneGame(a)
    ok('cloneGame snapshots without aliasing', stateHash(g) === stateHash(a) && g !== a)
    // no Math.random anywhere in the deterministic spine
    const here = dirname(fileURLToPath(import.meta.url))
    const spine = ['course.js', 'sim.js', 'planner.js'].map((f) => readFileSync(join(here, '..', 'src', 'games', 'SSX', f), 'utf8'))
    ok('no Math.random in course/sim/planner', spine.every((src) => !/Math\.random\s*\(/.test(src)))
}

// ---- 7. planner/CFG agreement -----------------------------------------------
{
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'planner.js'), 'utf8')
    const grab = (k) => Number(src.match(new RegExp(`${k}: ([0-9.]+)`))?.[1])
    ok('planner mirrors CFG.G', grab('G') === CFG.G)
    ok('planner mirrors CFG.STEER', grab('STEER') === CFG.STEER)
    ok('planner mirrors CFG.CENT', grab('CENT') === CFG.CENT)
    ok('planner mirrors CFG.flipRate', grab('flipRate') === CFG.flipRate)
    ok('CPU seats are honest under the player top', PACE.every((v) => v < 1))
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
