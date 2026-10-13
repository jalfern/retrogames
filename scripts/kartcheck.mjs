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

console.log('— the pack (it must be a RACE, not a victory lap) —')
// the launch-bearing bug #197 caught: CPUs aiming 70 degrees sideways at
// standstill, and contact welding karts into queues, made the "pack" lap
// 2x the winner while a green suite said nothing. Pace is the tell.
{
    const lag = g.karts.map((k) => {
        const laps = k.lapTimes.length ? k.lapTimes.reduce((a, x) => a + x, 0) / k.lapTimes.length : 0
        return { name: k.name, done: k.lap, avg: laps / 60 }
    }).filter((x) => x.done > 0)
    const worst = Math.max(...lag.map((x) => x.avg))
    const mostDone = Math.max(...g.karts.map((k) => k.lap))
    check('worst measured lap pace <= 15 s (no walking-in-corners pack)', worst <= 15,
        lag.map((x) => `${x.name}:${x.avg.toFixed(1)}`).join(' '))
    check('at least one rival reaches lap 4 by the flag', mostDone >= 4, `max laps done ${mostDone}`)
    const prog = (k) => k.lap + (k.finished ? 0 : T.pts[k.idx].s / T.len)
    const cut = Math.max(...g.karts.map((k) => prog(g.karts.find((x) => x.place === 1)) - prog(k)))
    check('nobody lapped by 2 laps', cut < 2, `cut ${cut.toFixed(1)}`)
}

console.log('— human thumbs (a crude driver must finish the GP) —')
// centerline chaser, wide deadzone, fearful brakes — roughly a first-time
// human. It must survive five laps with a handful of wall taps: the drift/
// grip tuning is load-bearing for real thumbs, and this is where a future
// steering nerf shows up as RED instead of as a bored player.
{
    const wrap2 = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
    const thumb = (g2, k) => {
        const inp = { u: true, d: false, l: false, r: false, drift: false, item: false }
        if (g2.phase !== 'race' || k.finished) { inp.u = false; return inp }
        const look = 6 + Math.round(k.v * 2.2)
        const t = T.pts[(k.idx + look) % T.N]
        const da = wrap2(Math.atan2(t.y - k.y, t.x - k.x) - k.a)
        if (da < -0.035) inp.l = true
        if (da > 0.035) inp.r = true
        const kmax = T.aheadK((k.idx + look) % T.N, look + 10)
        const vmax = Math.min(9.2, 0.040 / Math.max(kmax, 8e-4))
        if (k.v > vmax * 1.12) { inp.d = true; inp.u = false }
        if (Math.abs(da) > 0.16 && k.v > 5) inp.drift = true
        if (k.item === 'mushroom' && kmax < 0.0012) inp.item = true
        if (k.item === 'shell' || k.item === 'banana') inp.item = true
        return inp
    }
    const g2 = makeGame()
    const P2 = g2.karts[0]
    let taps = 0
    let lastTap = -99
    while (!g2.end && g2.tick < 60 * 200) {
        step(g2, thumb(g2, P2))
        if (g2.events.some((ev) => ev.e === 'bump' && ev.who === 'PLAYER') && g2.tick - lastTap > 15) { taps++; lastTap = g2.tick }
        g2.events.splice(0, g2.events.length)
    }
    check('crude driver finishes all five laps', P2.lap >= 5, `lap ${P2.lap} ${g2.end}`)
    check('crude driver finishes under 100 s', P2.finished && P2.finishT < 60 * 100, P2.finished ? fmtTime(P2.finishT) : 'dnf')
    check('crude driver taps the wall <= 3 times', taps <= 3, `taps ${taps}`)
}

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

        // mutant 2: resurrect the ENTIRE disease #197 shipped with — flat
        // fear for every CPU, contact welding the faster kart to the
        // slower, and the uncapped lateral aim that launched the front row
        // sideways. Each piece alone is system-absorbable in the balanced
        // build (all three were tried solo; the pack ate them) — a mutant
        // that cannot produce red is a report about the test, so this one
        // is the historical machine, where the pack lapped 2x the winner.
        const sim2 = '/tmp/mut-sim-old.mjs'
        const ANCHORS = [
            ['const fear = k.skill * 0.0492', 'const fear = 0.041'],
            [`const dv = Math.abs(a.v - b.v)
                if (a.v > b.v) a.v -= dv * 0.04; else b.v -= dv * 0.04`,
                `const slow = Math.min(a.v, b.v) * 0.5 + Math.max(a.v, b.v) * 0.5
                a.v = Math.min(a.v, slow * 0.96); b.v = Math.min(b.v, slow * 0.96)`],
            ['lat = Math.max(-arc * 0.3, Math.min(arc * 0.3, lat))', 'lat = +lat'],
        ]
        let s2 = src
        for (const [from, to] of ANCHORS) {
            if (!s2.includes(from)) { console.error(`  FAIL  old-disease anchor missing: ${from.slice(0, 40)}…`); R.fail++ }
            s2 = s2.replace(from, to)
        }
        writeFileSync(sim2, s2
            .replace(/from '\.\/track\.js'/g, `from '${process.cwd()}/src/games/MarioKart/track.js'`)
            .replace(/from '\.\/planner\.js'/g, `from '${process.cwd()}/src/games/MarioKart/planner.js'`))
        if (R.fail) process.exit(1)
        const M2 = await import(sim2)
        const g4 = M2.makeGame()
        let n = 0
        while (!g4.end && n < 60 * 200) { M2.step(g4, decide(g4)); n++ }
        const paces = g4.karts.filter((x) => x.lapTimes.length).map((x) => x.lapTimes.reduce((a, y) => a + y, 0) / x.lapTimes.length / 60)
        const worst2 = Math.max(...paces)
        // the disease was caught red-handed in this build by the WIN gate
        // (P5 could not bring the GP home through its own traffic jam);
        // pace is the second witness. Either screaming is enough — a
        // mutant that passes BOTH is a suite that stopped racing.
        check('the old disease is red: P5 win dies or the pack crawls',
            !(g4.end === 'win' && worst2 <= 15),
            `end ${g4.end} place ${g4.karts[0].place} worst pace ${worst2.toFixed(1)}s`)
    }
}

console.log(`\nkartcheck: ${R.fail === 0 ? 'ALL GREEN' : R.fail + ' FAILED'}`)
process.exit(R.fail ? 1 : 0)
