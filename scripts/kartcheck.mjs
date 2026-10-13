// kartcheck — SUPER MARIO KART's Node gate (no browser, ~3 s).
//
// Three contracts, in the order the repo has learned to demand them:
//  1. the CIRCUIT is audited as DATA before anyone drives on it — minimum
//     radius, no self-crossing road, every feature on asphalt;
//  2. the GP is WON, in Node, by the same autopilot the attract demo
//     replays — from last place, and again with every item box deleted
//     (the slack rule), with checkpoints held honest by an explicit
//     infield-cut probe;
//  3. the machine is DETERMINISTIC: the same race twice, hash for hash.
// `--mutate` breaks the checkpoint gate and demands this file go red —
// a check that cannot fail is a check that is not watching.

import { readFileSync, writeFileSync } from 'node:fs'
import { TRACK, BOOSTS, BOXES, CHECKPOINTS, surfaceAt } from '../src/games/MarioKart/track.js'
import { makeGame, step, stateHash, fmtTime } from '../src/games/MarioKart/sim.js'
import { decide } from '../src/games/MarioKart/planner.js'

const R = { fail: 0 }
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`)
    if (!ok) R.fail++
}

const T = TRACK
const WALL = T.WALL_R

console.log('— circuit (data audit) —')
let minR = Infinity; let minI = 0
for (let i = 0; i < T.N; i++) {
    const k = Math.abs(T.pts[i].k)
    if (k > 1e-9 && 1 / k < minR) { minR = 1 / k; minI = i }
}
check('drivable: min radius >= 200 (flat-out at top speed)', minR >= 200, `minR ${minR.toFixed(0)} at s=${T.pts[minI].s.toFixed(0)}`)

const HALF = WALL + 16
let crossings = 0
for (let i = 0; i < T.N; i += 2) {
    for (let j = 0; j < T.N; j += 2) {
        if (i === j) continue
        let arc = Math.abs(T.pts[j].s - T.pts[i].s)
        arc = Math.min(arc, T.len - arc)
        if (arc < 750) continue
        const A = T.pts[i]; const B = T.pts[j]
        if (Math.hypot(A.x - B.x, A.y - B.y) > HALF * 2 + 40) continue
        const ax = Math.cos(A.a + Math.PI / 2); const ay = Math.sin(A.a + Math.PI / 2)
        const bx = Math.cos(B.a + Math.PI / 2); const by = Math.sin(B.a + Math.PI / 2)
        const x1 = A.x - ax * HALF, y1 = A.y - ay * HALF, x2 = A.x + ax * HALF, y2 = A.y + ay * HALF
        const x3 = B.x - bx * HALF, y3 = B.y - by * HALF, x4 = B.x + bx * HALF, y4 = B.y + by * HALF
        const ccw = (px, py, qx, qy, rx, ry) => (rx - px) * (qy - py) - (qx - px) * (ry - py)
        if (ccw(x1, y1, x2, y2, x3, y3) * ccw(x1, y1, x2, y2, x4, y4) < 0 &&
            ccw(x3, y3, x4, y4, x1, y1) * ccw(x3, y3, x4, y4, x2, y2) < 0) crossings++
    }
}
check('road never crosses itself', crossings === 0, `${crossings} crossings`)
check('4 checkpoint gates', CHECKPOINTS.length === 4)

const offBoost = BOOSTS.filter((b) => surfaceAt(b.x, b.y, b.i).surf !== 'road').length
check('every dash panel on asphalt', offBoost === 0)
const offBox = BOXES.filter((b) => surfaceAt(b.x, b.y, -1).surf !== 'road').length
check('every item box on asphalt', offBox === 0)

const race = (opts = {}) => {
    const g = makeGame()
    if (opts.noBoxes) g.boxes = []
    let t = 0
    while (!g.end && t < 60 * 150) { step(g, decide(g)); t++ }
    return { g, t }
}

console.log('— the GP (autopilot, from P5) —')
const { g, t } = race()
const P = g.karts[0]
check('autopilot WINS the 5-lap GP', g.end === 'win' && P.place === 1 && P.lap === 5, `${g.end} place ${P.place} in ${fmtTime(P.finishT)}`)
check('race length sane (50-150 s)', P.finishT > 60 * 50 && P.finishT < 60 * 150, fmtTime(P.finishT))
check('five clean laps recorded', P.lapTimes.length === 5 && P.lapTimes.every((x) => x > 300))

const slack = race({ noBoxes: true })
check('slack: still wins with ZERO item boxes', slack.g.end === 'win' && slack.g.karts[0].place === 1,
    `${slack.g.end} in ${fmtTime(slack.g.karts[0].finishT)}`)

console.log('— rules (proven by state, not prose) —')
{
    const g2 = makeGame()
    g2.phase = 'race'
    const k = g2.karts[1]
    for (let i = 0; i < 40; i++) step(g2, {})
    g2.shells.push({ x: k.x - Math.cos(k.a) * 70, y: k.y - Math.sin(k.a) * 70, a: k.a, v: 13.5, life: 40, from: 'PLAYER' })
    for (let i = 0; i < 10; i++) step(g2, {})
    check('shell spun the kart it hit', k.spinT > 0 || g2.events.some((e) => e.e === 'spin' && e.who === k.name), `spinT ${k.spinT}`)
}
{
    const g2 = makeGame()
    g2.phase = 'race'
    const k = g2.karts[2]
    for (let i = 0; i < 40; i++) step(g2, {})
    const nn = T.nearest(k.x, k.y, k.hint)
    g2.bananas.push({ x: k.x + Math.cos(k.a) * 60, y: k.y + Math.sin(k.a) * 60, from: 'PLAYER' })
    for (let i = 0; i < 20; i++) step(g2, {})
    check('banana spun the kart that touched it', k.spinT > 0 || g2.events.some((e) => e.e === 'spin' && e.who === k.name))
}
{
    const g2 = makeGame()
    g2.phase = 'race'
    const k = g2.karts[0]
    const far = g2.karts.slice(1)
    for (const o of far) { o.x = -5000; o.y = -5000 }   // one kart on the canvas: no grid bumping
    k.boostT = 60
    for (let i = 0; i < 30; i++) step(g2, { u: true })
    check('mushroom-style boost outruns plain throttle', k.v > 6, `v ${k.v.toFixed(2)}`)
    const g3 = makeGame(); g3.phase = 'race'
    for (const o of g3.karts.slice(1)) { o.x = -5000; o.y = -5000 }
    for (let i = 0; i < 30; i++) step(g3, { u: true })
    check('throttle alone cannot exceed it that fast', g3.karts[0].v < g2.karts[0].v - 1,
        `plain ${g3.karts[0].v.toFixed(2)} vs boost ${g2.karts[0].v.toFixed(2)}`)
}
{
    const g2 = makeGame()
    g2.phase = 'race'
    const P5 = g2.karts[0]
    P5.place = 5; P5.item = null; P5.boxes = 0
    const b = g2.boxes[0]; b.taken = 0
    P5.x = b.x; P5.y = b.y; P5.v = 5
    const n = T.nearest(b.x, b.y, -1); P5.idx = n.i; P5.hint = n.i
    step(g2, {})
    check('P5 item table opens with the good stuff', P5.item === 'mushroom', `got ${P5.item}`)
    const g3 = makeGame(); g3.phase = 'race'
    const P1 = g3.karts[0]; P1.place = 1; P1.boxes = 0
    const b3 = g3.boxes[1]; b3.taken = 0
    P1.x = b3.x; P1.y = b3.y; P1.v = 5
    const n3 = T.nearest(b3.x, b3.y, -1); P1.idx = n3.i; P1.hint = n3.i
    step(g3, {})
    check('P1 item table opens with crumbs', P1.item === 'banana', `got ${P1.item}`)
}
{
    // the infield-cut probe: parked behind the line with an empty
    // checkpoint mask, crossing must NOT bank a lap
    const g2 = makeGame()
    g2.phase = 'race'
    const k = g2.karts[0]
    const p = T.pts[T.N - 8]
    k.x = p.x; k.y = p.y; k.a = p.a; k.idx = T.N - 8; k.hint = k.idx; k.lastS = p.s; k.cp = 0; k.lap = 1
    const lapBefore = k.lap
    for (let i = 0; i < 60; i++) step(g2, { u: true })
    check('crossing the line off-checkpoints banks nothing', k.lap === lapBefore || k.cp === 7,
        `lap ${k.lap} cp ${k.cp.toString(2)}`)
}

console.log('— determinism —')
const a = race(); const b = race()
check('same race twice, hash for hash', stateHash(a.g) === stateHash(b.g) && a.g.karts[0].finishT === b.g.karts[0].finishT,
    `${stateHash(a.g)} ${fmtTime(a.g.karts[0].finishT)} vs ${stateHash(b.g)} ${fmtTime(b.g.karts[0].finishT)}`)

if (process.argv.includes('--mutate')) {
    console.log('— mutant: checkpoint gate must NOT be free —')
    const src = readFileSync('src/games/MarioKart/sim.js', 'utf8')
    const ANCHOR = 'if (crossed && k.cp === (1 << CHECKPOINTS.length) - 1) {'
    if (!src.includes(ANCHOR)) { console.error('  FAIL  mutant anchor missing'); R.fail++ }
    else {
        // the mutant runs from a copy in /tmp that imports the real
        // track/planner by absolute path — the tree is NEVER mutated, so a
        // crash cannot leave a mutant on disk (it once did: a rewrite
        // dropped `from`, the import threw, the restore never ran)
        const copy = '/tmp/mut-sim.mjs'
        const rewritten = src.replace(ANCHOR, 'if (crossed && true) {')
            .replace(/from '\.\/track\.js'/g, `from '${process.cwd()}/src/games/MarioKart/track.js'`)
            .replace(/from '\.\/planner\.js'/g, `from '${process.cwd()}/src/games/MarioKart/planner.js'`)
        writeFileSync(copy, rewritten)
        const M = await import(copy)
        // the exact cheat the honest audit refused above: with the gate
        // dead the mutated machine banks the lap — proof the gate is the
        // thing that was stopping it (a mutant the audit cannot distinguish
        // is a check that is not watching)
        const g3 = M.makeGame(); g3.phase = 'race'
        const k = g3.karts[0]
        const pp = T.pts[T.N - 8]
        k.x = pp.x; k.y = pp.y; k.a = pp.a; k.idx = T.N - 8; k.hint = k.idx; k.lastS = pp.s; k.cp = 0; k.lap = 1
        for (let i = 0; i < 60; i++) M.step(g3, { u: true })
        check('mutant flips the cheat probe: gate is load-bearing', k.lap === 2,
            `lap ${k.lap} cp ${k.cp}`)
    }
}

console.log(`\nkartcheck: ${R.fail === 0 ? 'ALL GREEN' : R.fail + ' FAILED'}`)
process.exit(R.fail ? 1 : 0)
