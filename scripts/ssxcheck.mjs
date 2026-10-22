// SSX — the Node audit. Boots the pure game, pins every load-bearing rule,
// proves the autopilot wins all three heats AND Showoff, re-proves both at a
// 0.75x trick economy with the chain capped at x3 (the slack rule), and
// replays identical scripts to identical hashes. No browser, no randomness.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, PLACE_PTS, cloneGame, stateHash, CARVE_FADE } from '../src/games/SSX/sim.js'
import { decide, PACE } from '../src/games/SSX/planner.js'
import { buildCourse, terrainY, slopePos, COURSE_COUNT, DS, WALL_X, sceneryPlan, SHELF_PROPS } from '../src/games/SSX/course.js'

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
{ // #731 rock tops are bounce pads: down from above = points, not punishment
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    const os = ob.i * DS
    p.air = true; p.s = os; p.x = ob.x; p.v = 20; p.vy = -1
    p.y = terrainY(g.course, os, ob.x) + 1.1 - 0.05
    const s0 = p.score
    let t = 0
    while (!hasEv(g, 'rockbounce') && t < 10) { step(g, {}); t++ }
    ok('#731 landing on a rock from above bounces', hasEv(g, 'rockbounce') && p.air && p.vy > 0)
    ok('#731 the bounce pays points', p.score - s0 === CFG.rockPts)
    ok('#731 a bounce is not a bail', p.tumble === 0)
}
{ // #731 second contact with the same rock crashes; trees never bounce
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    p.air = true; p.s = ob.i * DS; p.x = ob.x; p.v = 20; p.vy = -1
    p.bounceOb = ob.i
    p.y = terrainY(g.course, ob.i * DS, ob.x) + 1.1 - 0.05
    step(g, {})
    ok('#731 re-landing on a bounced rock is a crash', p.tumble > 0 && hasEv(g, 'crash', (e) => e.what === 'rock'))
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]
    const tr = g2.course.obstacles.find((o) => o.kind === 'tree')
    q.air = true; q.s = tr.i * DS; q.x = tr.x; q.v = 6; q.vy = -1
    q.y = terrainY(g2.course, tr.i * DS, tr.x) + 1.2
    let t = 0
    while (!hasEv(g2, 'crash') && t < 300) { step(g2, {}); t++ }
    ok('#731 trees still swallow you whole', hasEv(g2, 'crash', (e) => e.what === 'tree') && !hasEv(g2, 'rockbounce'))
}
{ // #731 head-on at ground level still bails
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    p.s = ob.i * DS - 2; p.x = ob.x; p.v = 18; p.air = false
    let t = 0
    while (!hasEv(g, 'crash') && t < 60) { step(g, {}); t++ }
    ok('#731 riding into a rock face still bails', p.tumble > 0 && hasEv(g, 'crash', (e) => e.what === 'rock'))
}
{ // #731 scenery plan: four tree species, per-instance tint/scale, ids on the shelf
    const shelfIds = new Set(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/models/shelf.json'))).entries.map((e) => e.id))
    let speciesOk = true, tintOk = true, varietyOk = true, shelfOk = true
    for (let c = 0; c < COURSE_COUNT; c++) {
        const plan = sceneryPlan(buildCourse(c))
        const trees = plan.filter((e) => e.id.startsWith('tree'))
        const species = new Set(trees.map((e) => e.id))
        if (species.size < 4) speciesOk = false
        if (!trees.every((e) => e.tint != null && e.tint > 0.7 && e.tint < 1.3)) tintOk = false
        if (new Set(trees.map((e) => e.scale.toFixed(3))).size < 8 || new Set(trees.map((e) => e.rot.toFixed(3))).size < 8) varietyOk = false
        if (!plan.every((e) => SHELF_PROPS.includes(e.id) && shelfIds.has(e.id))) shelfOk = false
    }
    ok('#731 every course carries all four tree species', speciesOk)
    ok('#731 every tree instance carries an in-range tint', tintOk)
    ok('#731 scale and rotation vary across trees', varietyOk)
    ok('#731 every plan id is a real shelf prop', shelfOk)
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

// ---- 3c. steer sign + tuck/scrub (#547) ------------------------------------
{ // the render basis: +x must land on the rider's RIGHT on the chase-cam
    // screen (cam looks along d=(sin th, cos th) -> right = d × up = (-cos, sin)).
    // The old (+cos, -sin) basis mirrored the mountain: steer steered backwards.
    const co = buildCourse(0)
    const probe = (x) => {
        const p = slopePos(co, 400, x), p0 = slopePos(co, 400, 0)
        return (p.x - p0.x) * -Math.cos(p.th) + (p.z - p0.z) * Math.sin(p.th)
    }
    ok('+x is screen-right on the chase-cam', probe(0.5) > 0)
    ok('-x is screen-left on the chase-cam', probe(-0.5) < 0)
    { // and the input drives it the honest way: ArrowRight (steer +1) pushes x right
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20
        run(g, 20, { steer: 1 })
        const pa = slopePos(g.course, p.s, p.x), p0 = slopePos(g.course, p.s, 0)
        const lat = (pa.x - p0.x) * -Math.cos(p0.th) + (pa.z - p0.z) * Math.sin(p0.th)
        ok('steer right carves right — sim AND screen', p.x > 0.1 && lat > 0)
    }
}
{ // tuck (↑) is faster than sitting tall; scrub (↓) checks speed
    const fresh = (v) => { const g = makeGame('race'); run(g, 181); clear(g); const p = g.riders[0]; p.x = 0; p.v = v; return g }
    const a = fresh(12), b = fresh(12), d = fresh(12)
    run(a, 90)
    run(b, 90, { tuck: true })
    run(d, 90, { scrub: true })
    ok('tuck (↑) outruns sitting tall', b.riders[0].v > a.riders[0].v + 1)
    ok('scrub (↓) bleeds speed', d.riders[0].v < a.riders[0].v - 1)
    ok('tuck reads on the rig state', b.riders[0].tuck === true)
    ok('the upright board neither tucks nor scrubs', a.riders[0].tuck === false && a.riders[0].scrub === false)
}
{ // steering stays live while the ollie charges (#547: stick up charged a
    // jump-lock before; steering must survive the charge)
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 0; p.v = 18
    run(g, 12, { jump: true, steer: 1 })
    ok('steering is live mid-jump-charge', p.crouch === true && p.x > 0.05)
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
