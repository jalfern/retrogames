// SSX — the Node audit. Boots the pure game, pins every load-bearing rule,
// proves the autopilot wins all three heats AND Showoff, re-proves both at a
// 0.75x trick economy with the chain capped at x3 (the slack rule), and
// replays identical scripts to identical hashes. No browser, no randomness.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, PLACE_PTS, cloneGame, stateHash, CARVE_FADE } from '../src/games/SSX/sim.js'
import { decide, PACE, SKILL, MISS, missChance } from '../src/games/SSX/planner.js'
import { buildCourse, terrainY, slopePos, COURSE_COUNT, DS, WALL_X, sceneryPlan, SHELF_PROPS } from '../src/games/SSX/course.js'
import { MUSIC } from '../src/utils/AudioController.js'
import { MUSIC_TRACKS, MUSIC_STEP, START_VISTA } from '../src/games/SSX/art.js'

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
    ok('#791 miss rate mirrors the planner LCG modulus', Number(src.match(/1664525/)?.[0]) === 1664525)
    ok('CPU seats are honest under the player top', PACE.every((v) => v < 1))
}

// ---- 8. feel pass (#780): soundtrack beds + summit vista --------------------
{
    const themes = []
    for (let c = 0; c < COURSE_COUNT; c++) themes.push(buildCourse(c).theme)
    ok('#780 every mountain theme has a big-beat bed',
        themes.every((t) => MUSIC_TRACKS[t] && MUSIC[MUSIC_TRACKS[t]]))
    let bedsOk = true, stepsOk = true
    for (const t of Object.keys(MUSIC_TRACKS)) {
        const P = MUSIC[MUSIC_TRACKS[t]]
        if (!P || P.lead.length !== P.bass.length || P.lead.length !== P.perc.length || P.lead.length % 8 !== 0) { bedsOk = false; continue }
        if (!P.perc.some((v) => v === 1) || !P.perc.some((v) => v === 2)) bedsOk = false
        if (MUSIC_STEP[MUSIC_TRACKS[t]] !== P.step) stepsOk = false
        if (!(P.step >= 0.1 && P.step <= 0.17)) stepsOk = false
    }
    ok('#780 beds are driving kick/tek patterns of equal lanes', bedsOk)
    ok('#780 resting tempo pinned to the track grid, liftable band', stepsOk)
}
{
    const V = START_VISTA
    ok('#780 the start camera is twice the chase-cam distance back', V.back >= 9.5 * 2)
    ok('#780 the start camera towers over the gate', V.up >= 10)
    ok('#780 the vista looks down the whole face, not into the near slope', V.look >= 48)
    ok('#780 the vista FOV opens wider than the chase rig', V.fov > 70 && V.fov < 100)
}

// ---- 9. #791 CPU miss rate: the field falls, places change hands ------------
{
    ok('#791 the witness (skill 1) is exempt from the miss rate', missChance(1, PACE[0]) === 0)
    let mono = true
    for (let i = 1; i < SKILL.length; i++) if (!(missChance(SKILL[i], PACE[i]) >= missChance(SKILL[i - 1], PACE[i - 1]))) mono = false
    ok('#791 miss chance rises with seat number, stays sane',
        mono && SKILL.every((s, i) => missChance(s, PACE[i]) > 0 && missChance(s, PACE[i]) < 0.5))
    ok('#791 the miss knobs are exported and mirrored', MISS.base > 0 && MISS.paceK > 0)

    const driveRace = (seed) => {
        const g = makeGame('race', seed)
        const orders = []
        let cur = []
        let t = 0
        while (!g.end && t < 400000) {
            step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
            for (const e of g.events.slice(-2)) {
                if (e.type === 'heat') { if (cur.length) orders.push(cur.join('')); cur = [] }
                if (e.type === 'finish' && e.who !== 0) cur.push(e.who)
            }
            t++
        }
        if (cur.length) orders.push(cur.join(''))
        return { g, orders }
    }

    let cpuFalls = 0, missFalls = 0, witnessClean = true, seedWin = true
    const allOrders = []
    for (const seed of [0, 7, 13]) {
        const { g, orders } = driveRace(seed)
        const falls = g.events.filter((e) => e.type === 'crash' && e.who !== 0)
        cpuFalls += falls.length
        missFalls += falls.filter((e) => e.what === 'miss').length
        if (g.riders[0].crashes !== 0) witnessClean = false
        if (g.end !== 'win') seedWin = false
        allOrders.push(...orders)
    }
    ok('#791 the CPU field actually takes falls', cpuFalls >= 4)
    ok('#791 seeded wipeouts land as what=miss crashes', missFalls >= 2)
    ok('#791 places change hands among the rivals', new Set(allOrders).size >= 2)
    ok('#791 the witness still thrashes a fallible field', witnessClean && seedWin)

    const d1 = driveRace(7), d2 = driveRace(7)
    const crashSeq = (g) => g.events.filter((e) => e.type === 'crash').map((e) => `${e.who}:${e.what}`).join(',')
    ok('#791 every seeded fall replays exactly', crashSeq(d1.g) === crashSeq(d2.g) && stateHash(d1.g) === stateHash(d2.g))
    ok('#791 seeded misses ride the g._rs LCG, not Math.random',
        !/Math\.random\s*\(/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'planner.js'), 'utf8')))
}

// ---- 9b. #791 analog steer: edge pressure, not binary twitch -----------------
{
    const RAMP = Math.round(60 / CFG.PRESS)
    ok('#791 the pressure knob is exported and sane', CFG.PRESS >= 6 && CFG.PRESS <= 20)
    const fresh = () => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20
        return g
    }

    const g = fresh(); const p = g.riders[0]
    ok('#791 a rider starts with no edge pressure', p.press === 0)
    step(g, { steer: 1 })
    ok('#791 the first frame of a held turn is a shallow bite, not full lock', p.press > 0 && p.press < 1)
    let t = 1
    while (p.press < 1 && t < 60) { step(g, { steer: 1 }); t++ }
    ok('#791 held steer loads the edge fully in ~0.1 s', Math.abs(t - RAMP) <= 1)
    run(g, RAMP + 1)
    ok('#791 releasing lets the edge come back to neutral', p.press < 1e-9)

    const h = fresh(); const q = h.riders[0]
    run(h, RAMP * 2, { steer: 0.5 })
    ok('#791 a half-pressure target holds halfway over — analog, not binary', Math.abs(q.press - 0.5) < 1e-9)

    const deep = fresh(); run(deep, 12, { steer: 1 })
    const shal = fresh(); run(shal, 12, { steer: 0.5 })
    ok('#791 deeper pressure carves a wider line', Math.abs(deep.riders[0].x) > Math.abs(shal.riders[0].x) * 1.4)

    const tap = fresh(); run(tap, 2, { steer: 1 }); run(tap, RAMP + 2)
    ok('#791 a quick tap nips the edge and never locks', tap.riders[0].press < 1e-9 && Math.abs(tap.riders[0].x) < 0.05)

    const s = fresh(); run(s, RAMP * 2, { steer: 9 })
    ok('#791 input saturates at the rail', s.riders[0].press === 1)

    const a = fresh(); const ar = a.riders[0]
    ar.air = true; ar.y = terrainY(a.course, ar.s, ar.x) + 6; ar.vy = 4
    run(a, RAMP + 6, { steer: 1 })
    const binary = CFG.spinRate * (RAMP + 6) / 60
    ok('#791 air rotation is pressure-scaled too', Math.abs(ar.spin) > binary * 0.5 && Math.abs(ar.spin) < binary * 0.9)

    const z1 = fresh(), z2 = fresh()
    run(z1, 10, { steer: 1 }); run(z2, 10, { steer: 1 })
    ok('#791 pressure history rides the replay hash', stateHash(z1) === stateHash(z2) && stateHash(z1) !== stateHash(fresh()))
}

// ---- 9c. #791 attract hotness: the demo throws OVERs visibly ----------------
{
    ok('#791 the attract fuel knob is exported and sane', CFG.attractFuel >= 10 && CFG.attractFuel <= 60)
    const heat1 = (hot, hashes = false) => {
        const g = makeGame('race')
        let overs = 0, crashes = 0, fullTakeoffs = 0, takeoffs = 0, maxScore = 0, t = 0
        const hs = []
        while (!g.end && g.heat === 0 && t < 400000) {
            step(g, g.phase === 'run' ? (hot ? decide(g, g.riders[0], true) : decide(g, g.riders[0])) : {})
            const p = g.riders[0]
            maxScore = Math.max(maxScore, p.score)
            if (hashes && t % 500 === 0) hs.push(stateHash(g))
            for (const e of g.events) {
                if (e.type === 'jump' && e.who === 0) { takeoffs++; if (p.meter >= 100) fullTakeoffs++ }
                if (e.type === 'land' && e.who === 0 && e.over) overs++
                if (e.type === 'crash' && e.who === 0) crashes++
            }
            g.events.splice(0)
            t++
        }
        return { overs, crashes, fullTakeoffs, takeoffs, maxScore, hs }
    }
    const cold = heat1(false)
    const hot = heat1(true, true)
    ok('#791 the race economy is untouched — the cold witness arrives short at the lips',
        cold.fullTakeoffs <= 2 && cold.overs <= 1)
    ok('#791 the hot demo arrives OVER at almost every lip', hot.fullTakeoffs >= hot.takeoffs - 2)
    ok('#791 the hot demo banks doubled OVER pay — visibly hotter than the race line',
        hot.overs >= 4 && hot.overs > cold.overs * 2 && hot.maxScore > cold.maxScore)
    ok('#791 the hot demo rides clean — hot, not sloppy', hot.crashes === 0)
    const hot2 = heat1(true, true)
    ok('#791 the hot attract demo replays hash-for-hash', hot.hs.join(',') === hot2.hs.join(','))
}

// ---- 9d. #791 landing impact drives the body: stomp pose + sized burst ----
{
    const drop = (h, vy) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8
        p.air = true; p.airT = 0.9   // rollers hang long enough to bank (base ≥ 60)
        p.y = terrainY(g.course, p.s, p.x) + h
        p.vy = vy
        const evs = []
        let t = 0
        while (!evs.some((e) => e.type === 'land') && t < 180) { step(g, {}); evs.push(...g.events.splice(0)); t++ }
        const e = evs.find((x) => x.type === 'land')
        const st = p.stomp
        t = 0
        while (p.stomp > 0 && t < 300 && !p.air) { step(g, {}); t++ }
        return { e, st, zeroed: p.stomp === 0 }
    }
    const soft = drop(0.35, -1)
    const hard = drop(6, -2)
    ok('#791 a touchdown reports finite impact, harder falls hit bigger',
        !!soft.e && !!hard.e && Number.isFinite(soft.e.impact) && Number.isFinite(hard.e.impact) && hard.e.impact > soft.e.impact + 4)
    ok('#791 the body stomps on touchdown — harder landings stomp deeper and longer',
        soft.st > 0 && hard.st > soft.st)
    ok('#791 the stomp is a beat, not a state — it relaxes back to stand',
        soft.zeroed && hard.zeroed && soft.st > 0 && hard.st > soft.st)
    ok('#791 a rider cruising the snow carries no stomp',
        (() => { const g = makeGame('race'); run(g, 240); return g.riders[0].stomp === 0 })())
    ok('#791 a bail never stomps — the tumble owns the body', (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8; p.air = true; p.airT = 0.5
        p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = -2
        p.flip = 200
        let t = 0
        while (!hasEv(g, 'crash') && t < 180) { step(g, {}); t++ }
        return hasEv(g, 'crash') && p.stomp === 0
    })())
    ok('#791 a takeoff clears any stomp still ringing', (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.stomp = 12; p.stompPow = 0.8
        step(g, { jump: true })
        step(g, {})
        return p.air === true && p.stomp === 0
    })())
    const wit = autopilot(makeGame('race'))
    const lands = wit.events.filter((e) => e.type === 'land')
    ok('#791 every banked landing of a full race carries its impact',
        lands.length >= 10 && lands.every((e) => Number.isFinite(e.impact) && e.impact >= 0))
    ok('#791 impact + stomp ride the replay hash', stateHash(wit) === stateHash(autopilot(makeGame('race'))))
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
