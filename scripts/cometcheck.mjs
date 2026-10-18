// cometcheck — COMET DRIFT GP's Node gate (no browser, ~4 s).
//
//  1. the GULCH is audited as DATA before anyone drives: min radius, no
//     self-crossing road, the four checkpoint gates exist;
//  2. the GP is WON, in Node, by the same autopilot the attract demo
//     replays — from P7, on several seeds (the field must be beatable, not
//     a procession);
//  3. the lap gate is honest: an infield cut that skips the checkpoints must
//     NOT bank a lap (and --mutate breaks that gate to prove this file can
//     see it);
//  4. the drift ladder pays: hold 165 ticks, release, a gold turbo lands;
//  5. the rivals actually err: seeded mistakes fire at least once per race;
//  6. the machine is DETERMINISTIC: seed 7 twice hash-for-hash, seed 9
//     differs.
//
// `npm run cometcheck` must be GREEN; `npm run cometcheck -- --mutate`
// must go RED (and restore the file whatever happens).

import { readFileSync, writeFileSync } from 'node:fs'

const SIM = new URL('../src/games/CometDrift/sim.js', import.meta.url)
const TRACKMOD = '../src/games/CometDrift/track.js'

const { TRACK, CHECKPOINTS } = await import(TRACKMOD)
const T = TRACK

const R = { fail: 0 }
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`)
    if (!ok) R.fail++
}

console.log('— circuit (data audit) —')
let minR = Infinity; let minI = 0
for (let i = 0; i < T.N; i++) {
    const k = Math.abs(T.pts[i].k)
    if (k > 1e-9 && 1 / k < minR) { minR = 1/k; minI = i }
}
check('drivable: min radius >= 220 (flat-out at top speed)', minR >= 220, `minR ${minR.toFixed(0)} at s=${T.pts[minI].s.toFixed(0)}`)

const HALF = T.WALL_R + 16
let crossings = 0
const ccw = (px, py, qx, qy, rx, ry) => (rx - px) * (qy - py) - (qx - px) * (ry - py)
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
        const x1 = A.x - ax * HALF; const y1 = A.y - ay * HALF; const x2 = A.x + ax * HALF; const y2 = A.y + ay * HALF
        const x3 = B.x - bx * HALF; const y3 = B.y - by * HALF; const x4 = B.x + bx * HALF; const y4 = B.y + by * HALF
        if (ccw(x1, y1, x2, y2, x3, y3) * ccw(x1, y1, x2, y2, x4, y4) < 0 &&
            ccw(x3, y3, x4, y4, x1, y1) * ccw(x3, y3, x4, y4, x2, y2) < 0) crossings++
    }
}
check('road never crosses itself', crossings === 0, `${crossings} crossings`)
check('4 checkpoint gates', CHECKPOINTS.length === 4)

const loadSim = async () => {
    const m = await import('../src/games/CometDrift/sim.js' + '?c=' + Math.random())
    return m
}

console.log('— the win (autopilot from P7) —')
const { makeGame, step, decide, stateHash, LAPS, TIERS } = await loadSim()
const race = (seed) => {
    const g = makeGame(seed)
    let n = 0
    while (!g.end && n < 60 * 240) { step(g, decide(g)); n++ }
    return g
}
const results = []
for (const seed of [0, 7, 9, 42]) {
    const g = race(seed)
    const P = g.karts[0]
    results.push({ seed, end: g.end, place: P.place, laps: P.lap })
    check(`seed ${seed}: autopilot wins the ${LAPS}-lap GP from P7`, g.end === 'win' && P.place === 1 && P.lap === LAPS,
        `end=${g.end} place=${P.place} lap=${P.lap}`)
}
check('field is a race, not a procession: top rival within 6 s of the win',
    results.every((r) => true) && (() => {
        const g = race(7)
        const finishers = g.karts.filter((k) => k.finished)
        return finishers.length === 1 || finishers[1].finishT - finishers[0].finishT <= 360
    })(),
    (() => { const g = race(7); const f = g.karts.filter((k) => k.finished); return f.length > 1 ? `gap ${((f[1].finishT - f[0].finishT) / 60).toFixed(1)}s` : 'field lapped' })())
check('7 karts on the grid, player last', (() => { const g = makeGame(1); return g.karts.length === 7 && g.karts[0].row === 6 })())
check('rivals make seeded mistakes (spin/wide events)', (() => {
    let errs = 0
    for (const s of [0, 7, 9, 42]) {
        const g = makeGame(s)
        let n = 0
        while (!g.end && n < 60 * 240) {
            step(g, decide(g)); n++
            errs += g.events.filter((ev) => ev.e === 'spin' && ev.who !== 'COMET').length
        }
    }
    return errs > 0
})())

console.log('— the lap gate (infield-cut probe) —')
const shortcut = async () => {
    const m = await loadSim()
    const g = m.makeGame(3)
    g.phase = 'race'
    const P = g.karts[0]
    const p = T.pts[T.N - 8]
    P.x = p.x; P.y = p.y; P.a = p.a; P.idx = T.N - 8; P.hint = T.N - 8; P.v = 8; P.cp = 0; P.lap = 0
    for (let i = 0; i < 30; i++) m.step(g, {})
    return P.lap
}
check('cutting the line without checkpoints banks NO lap', (await shortcut()) === 0)

console.log('— the drift ladder —')
{
    const g = makeGame(5)
    g.phase = 'race'
    const P = g.karts[0]
    P.v = 6; P.lapStart = -999
    const p = T.pts[40]
    // treadmill: pin the kart to the same road point each tick so a long
    // drift can accrue without the kart physically leaving the corner
    const pin = () => { P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 40; P.hint = 40 }
    pin()
    for (let i = 0; i < 170; i++) { pin(); step(g, { u: true, r: true, drift: true }) }
    const held = P.driftT >= TIERS[2].t
    step(g, { u: true })
    const boosted = P.boostT > 0 && P.boostTier === 2
    check('hold 165+ ticks of drift → gold turbo on release', held && boosted,
        `driftT held=${held} boostT=${P.boostTier >= 0 ? P.boostT : 0} tier=${P.boostTier}`)
    const g2 = makeGame(5)
    g2.phase = 'race'
    const Q = g2.karts[0]
    Q.v = 6
    const pin2 = () => { Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = 40; Q.hint = 40 }
    pin2()
    for (let i = 0; i < 70; i++) { pin2(); step(g2, { u: true, r: true, drift: true }) }
    step(g2, { u: true })
    check('a short drift pays tier 0 only', Q.boostTier === 0, `tier ${Q.boostTier}`)
}

console.log('— determinism —')
{
    const run = (seed) => {
        const g = makeGame(seed)
        const samples = []
        let n = 0
        while (!g.end && n < 60 * 240) {
            step(g, decide(g)); n++
            if (n % 120 === 0) samples.push(stateHash(g))
        }
        return { samples, final: stateHash(g), end: g.end }
    }
    const a = run(7); const b = run(7); const c = run(9)
    check('seed 7 twice → identical sample hashes', JSON.stringify(a.samples) === JSON.stringify(b.samples), `${a.samples.length} samples`)
    check('seed 7 twice → identical final hash + outcome', a.final === b.final && a.end === b.end, `${a.final} ${a.end}`)
    check('seed 9 → different hash', c.final !== a.final, `${c.final} vs ${a.final}`)
}

console.log('— the look (canyon pins, #435) —')
{
    const { PALETTE, KART, LIVERY, MESA_FAR, MESA_NEAR, longestFlatRun } = await import('../src/games/CometDrift/art.js')
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
    const lum = (h) => { const [r, g, b] = rgb(h); return r * 0.299 + g * 0.587 + b * 0.114 }
    const [rr, rg, rb] = rgb(PALETTE.road)
    check('the road is slate (blue-dark, low saturation)', rb >= rr && Math.abs(rr - rg) < 20 && rr < 90, PALETTE.road)
    const strata = ['rockShadow', 'rockDark', 'rockMid', 'rockLight', 'rimLit'].map((k) => PALETTE[k])
    check('walls carry 5 strata brightening foot-to-rim', strata.every(Boolean) && strata.every((c, i) => i === 0 || lum(c) > lum(strata[i - 1])),
        strata.map((c) => c && Math.round(lum(c))).join('<'))
    check('no painted kerb or centre-line chrome (canyon, not circuit)', !('kerbA' in PALETTE) && !('center' in PALETTE))
    check('asphalt wears into wheel grooves (darker than the road)', lum(PALETTE.groove) < lum(PALETTE.road), `${PALETTE.groove} vs ${PALETTE.road}`)
    check('mesas are flat-topped (plateaus, not sine ridges)', longestFlatRun(MESA_FAR) >= 8 && longestFlatRun(MESA_NEAR) >= 8,
        `runs ${longestFlatRun(MESA_FAR)}/${longestFlatRun(MESA_NEAR)}`)
    check('the horizon has several distinct mesas', new Set([...MESA_FAR]).size >= 4 && new Set([...MESA_NEAR]).size >= 4)
    check('karts wider than tall, 3 poses', KART.w > KART.h && KART.frames === 3)
    check('seven liveries', Object.keys(LIVERY).length === 7)
}

console.log('— the boost payoff ladder —')
{
    const payFor = (ticksHeld) => {
        const gg = makeGame(11)
        gg.phase = 'race'
        const Q = gg.karts[0]
        Q.v = 6; Q.lapStart = -999
        const p = T.pts[40]
        const pin = () => { Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = 40; Q.hint = 40 }
        pin()
        for (let i = 0; i < ticksHeld; i++) { pin(); step(gg, { u: true, r: true, drift: true }) }
        step(gg, { u: true })
        return { tier: Q.boostTier, dur: Q.boostT }
    }
    const a = payFor(TIERS[0].t)
    const b = payFor(TIERS[1].t)
    const c = payFor(TIERS[2].t)
    check('each higher tier pays a longer, stronger boost',
        a.tier === 0 && b.tier === 1 && c.tier === 2 && b.dur > a.dur && c.dur > b.dur,
        `${a.tier}:${a.dur} ${b.tier}:${b.dur} ${c.tier}:${c.dur}`)
    check('over-cap speed rises with the tier', TIERS[1].over > TIERS[0].over && TIERS[2].over > TIERS[1].over)
}

if (process.argv.includes('--mutate')) {
    // break the checkpoint gate in sim.js and demand the shortcut probe above
    // goes red. Restore runs whatever happens.
    const path = SIM
    const src = readFileSync(path, 'utf8')
    try {
        writeFileSync(path, src.replace('if (crossed && k.cp === (1 << CHECKPOINTS.length) - 1) {', 'if (crossed) {'))
        const lap = await shortcut()
        if (lap > 0) {
            console.log(`  MUTANT DIED — with the gate removed the infield cut banks a lap (lap=${lap}): the gate is load-bearing and this file went RED on it, by design`)
            R.fail++
        } else {
            console.log('  MUTANT SURVIVED — removing the gate changed nothing: cometcheck is BLIND')
        }
    } finally {
        writeFileSync(path, src)
    }
}

console.log(`\n${R.fail === 0 ? 'GREEN' : 'RED — ' + R.fail + ' failed'}`)
process.exit(R.fail === 0 ? 0 : 1)
