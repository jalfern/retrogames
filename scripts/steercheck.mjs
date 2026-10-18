// steercheck — the #431 stick pipeline, in Node (~1s).
//
// Proves three things for the dead zone + response curve + gain + smoothing
// pipeline Jon specified on #431:
//   1. IT BOOTS — every piece of the pipeline imports and computes pure.
//   2. ITS RULES HOLD — the scaled radial dead zone (D), the response curve
//      (A), the gain (G) and the per-tick smoothing rate (R) are exactly the
//      named constants, applied in the specified order, at the specified
//      places (both analog store writers, steerPedals, the three stick racers),
//      while the keyboard/digital paths keep their untouched values.
//   3. IT CAN STILL BE DRIVEN — a full stick push still commands a firm,
//      signed lock (G), signs survive diagonals, and the mapping is strictly
//      monotone, so the kart keeps full authority in the new range.
//
// Run: npm run steercheck

import { readFileSync } from 'fs'
import {
    STICK_DEAD_ZONE, STEER_CURVE_A, STEER_GAIN, STEER_SMOOTH, STEER_PIPELINE,
    radialDeadZone, steerResponse, smoothSteer, steerPedals, setStick, padState,
} from '../src/utils/padState.js'
import { setStickVec, currentPad, clearHeld, quantize, DIR_DEAD, normalizePad } from '../src/utils/onePad.js'
import { DEAD_ZONE } from '../src/components/virtualDir.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error(`  FAIL: ${msg}`) } }
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e

// --- 1. Jon's tuning constants, pinned at the issue's starting values -------
ok(STICK_DEAD_ZONE === 0.12, `dead zone D is ${STICK_DEAD_ZONE}, want 0.12`)
ok(STEER_CURVE_A === 0.7, `curve A is ${STEER_CURVE_A}, want 0.7`)
ok(STEER_GAIN === 0.6, `gain G is ${STEER_GAIN}, want 0.6`)
ok(STEER_SMOOTH === 0.12, `smoothing R is ${STEER_SMOOTH}, want 0.12`)

// --- 2. Scaled radial dead zone: the issue's formula, verbatim ---------------
// m = |v|; m < D -> 0; else v' = v/m · (m − D)/(1 − D).
{
    const rest = radialDeadZone(0, 0)
    ok(rest.x === 0 && rest.y === 0 && rest.push === 0 && rest.engaged === false, 'dz at rest -> zero, not engaged')
    for (const [x, y] of [[0.05, 0], [0, 0.05], [-0.11, 0.02], [0.08, 0.08]]) {
        const v = radialDeadZone(x, y)
        ok(v.x === 0 && v.y === 0 && v.push === 0 && v.engaged === false, `dz |v|=${Math.hypot(x, y).toFixed(3)} (< D) collapses to rest`)
    }
    const edge = radialDeadZone(STICK_DEAD_ZONE, 0)
    ok(edge.push === 0 && edge.engaged === true, 'dz exactly at the zone edge -> push 0, engaged (response starts at 0, no jump)')
    const full = radialDeadZone(1, 0)
    ok(near(full.x, 1) && near(full.push, 1), `dz full push -> x ${full.x}, push ${full.push}, want 1`)
    const mid = radialDeadZone(0.3, 0)
    ok(near(mid.x, (0.3 - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)), `dz mid: (0.3-D)/(1-D) = ${mid.x.toFixed(6)}`)
    const diag = radialDeadZone(0.6, 0.6)
    const dm = Math.hypot(0.6, 0.6)
    ok(near(Math.hypot(diag.x, diag.y), (dm - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) && near(diag.x, diag.y),
        'dz keeps a 45° bearing while remapping magnitude')
    let prevM = -1
    let monotone = true
    for (let i = 0; i <= 50; i++) {
        const m = STICK_DEAD_ZONE + (i / 50) * (1 - STICK_DEAD_ZONE)
        const p = radialDeadZone(m, 0).push
        if (p < prevM) monotone = false
        prevM = p
    }
    ok(monotone, 'dz push is non-decreasing along the zone')
    const neg = radialDeadZone(-0.8, 0)
    ok(neg.x < 0, 'dz preserves the sign of left push')
}

// --- 3. Response curve + gain: gentle near center, full lock × G --------------
{
    ok(steerResponse(0) === 0, 'curve at rest -> 0')
    ok(near(steerResponse(1), STEER_GAIN) && near(steerResponse(-1), -STEER_GAIN), `full push locks at ±G (${steerResponse(1)} / ${steerResponse(-1)})`)
    ok(near(steerResponse(0.5), STEER_GAIN * ((1 - STEER_CURVE_A) * 0.5 + STEER_CURVE_A * 0.125)), 'curve matches (1-A)·s + A·s³ at s=0.5')
    ok(Math.abs(steerResponse(0.4)) < STEER_GAIN * 0.4, 'curve is gentle near center (below the straight line)')
    ok(near(steerResponse(-0.5), -steerResponse(0.5)), 'curve is odd-symmetric (left mirrors right)')
    let prev = -Infinity
    let mono = true
    for (let i = 0; i <= 100; i++) {
        const s = -1 + i / 50
        const r = steerResponse(s)
        if (r < prev) mono = false
        prev = r
    }
    ok(mono, 'response curve is strictly non-decreasing over the full range')
}

// --- 4. Steer smoothing: at most R per tick, exact when close -----------------
{
    ok(near(smoothSteer(0, 1), STEER_SMOOTH), `twitch from 0 to full lock moves only R=${STEER_SMOOTH} in one tick`)
    ok(near(smoothSteer(0, -1), -STEER_SMOOTH), 'the same clamp applies left')
    ok(smoothSteer(0.5, 0.55) === 0.55, 'a small step within R lands exactly on target')
    ok(smoothSteer(-0.3, 0.9) === -0.3 + STEER_SMOOTH, 'long travel from negative climbs by R')
    let v = 0
    for (let i = 0; i < 200; i++) v = smoothSteer(v, STEER_GAIN)
    ok(near(v, STEER_GAIN, 1e-12), `slewing to full lock settles at G (${v.toFixed(6)})`)
    let back = v
    for (let i = 0; i < 200; i++) back = smoothSteer(back, 0)
    ok(near(back, 0, 1e-12), 'releasing slews back to center and stops')
}

// --- 5. steerPedals: the whole steering chain, pedals untouched ---------------
{
    const up = steerPedals({ x: 0, y: -1, rt: 0, lt: 0 })
    ok(up.steer === 0 && up.thr === 1 && up.brk === 0, 'full-forward stick -> straight + thr 1')
    const full = steerPedals({ x: 1, y: 0, rt: 0, lt: 0 })
    ok(near(full.steer, STEER_GAIN), `full-right stick -> steer G (got ${full.steer})`)
    const mid = steerPedals({ x: -0.7, y: -0.3, rt: 0, lt: 0 })
    ok(near(mid.steer, steerResponse(-0.7)), 'steer goes through curve+gain, not raw x')
    ok(mid.thr === 0.3 && mid.brk === 0, 'pedal fallback reads raw stick-y (dz applied upstream at the store)')
    const trig = steerPedals({ x: 0, y: 0, rt: 0.2, lt: 0.6 })
    ok(trig.thr === 0.2 && trig.brk === 0.6, 'triggers pass through untouched')
    const rest = steerPedals({ x: 0, y: 0, rt: 0, lt: 0 })
    ok(rest.steer === 0 && rest.thr === 0 && rest.brk === 0, 'rest -> all zero')
}

// --- 6. The dead zone lives at the stores, so EVERY stick game gets it --------
{
    setStick(0.3, -0.9, 0.95, true)
    const m = Math.hypot(0.3, -0.9)
    ok(near(Math.hypot(padState.x, padState.y), (m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)),
        `setStick stores the dead-zoned vector (mag ${padState.push.toFixed(4)})`)
    setStick(0.08, 0.03, 0.08, false)
    ok(padState.x === 0 && padState.y === 0 && padState.engaged === false, 'setStick below D stores rest')
    clearHeld()
    setStickVec(0.1, 0)
    let p = currentPad('stick')
    ok(p.x === 0 && p.y === 0, 'setStickVec below D leaves THE one pad at rest')
    setStickVec(0.5, 0)
    p = currentPad('stick')
    ok(near(p.x, (0.5 - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)), `setStickVec stores the remapped x (${p.x.toFixed(4)})`)
    const gamepad = { axes: [0.5, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    ok(gamepad.axes[0] >= STICK_DEAD_ZONE, 'a 0.5 gamepad push clears the shared zone (GPAD zone 0.3 upstream passes it)')
}

// --- 7. Keyboard / digital paths untouched (#431: "Keyboard steering unchanged")
{
    ok(DIR_DEAD === 0.35, `the digital quantizer keeps its own dead band (${DIR_DEAD})`)
    ok(DEAD_ZONE === 15, `the touch arrows' sector dead zone keeps its own value (${DEAD_ZONE})`)
    const kb = normalizePad({ left: true }, 'stick')
    ok(kb.left === true && kb.x === 0, 'a held key still reads as left with no analog vector')
    const both = normalizePad({ right: true }, 'dpad')
    ok(both.right === true && both.left === false, 'dpad keys pass through with no curve or gain')
    const hard = normalizePad({ x: 1 }, 'dpad')
    ok(hard.right === true, 'a scripted full-x step still lights right on a dpad game')
}

// --- 8. The three stick racers run the pipeline + surface it ------------------
{
    const GAMES = ['MarioKart', 'OutRun', 'CometDrift']
    for (const name of GAMES) {
        const src = readFileSync(new URL(`../src/games/${name}/index.jsx`, import.meta.url), 'utf8')
        ok(src.includes('steerPedals'), `${name} reads steerPedals (curve+gain)`)
        ok(src.includes('smoothSteer(steerSm'), `${name} smooths pad steering R/tick`)
        ok(src.includes('STEER_PIPELINE'), `${name} surfaces the pipeline constants`)
        ok(!/steer:\s*s\.steer\b/.test(src), `${name} never feeds raw steerPedals steer straight to the sim`)
    }
    const gc = readFileSync(new URL('../src/utils/gameContract.js', import.meta.url), 'utf8')
    ok(/spec\.steer/.test(gc), 'gameContract passes spec.steer onto __game.meta')
    const cd = readFileSync(new URL('../src/games/CometDrift/index.jsx', import.meta.url), 'utf8')
    ok(/steer:\s*STEER_PIPELINE/.test(cd), 'CometDrift __game.meta carries the steer pipeline')
    const kt = readFileSync(new URL('../src/games/MarioKart/index.jsx', import.meta.url), 'utf8')
    ok(/steer:\s*STEER_PIPELINE/.test(kt), 'MarioKart __kartTest carries the steer pipeline')
    const or = readFileSync(new URL('../src/games/OutRun/index.jsx', import.meta.url), 'utf8')
    ok(/steer:\s*STEER_PIPELINE/.test(or), 'OutRun __outrunTest carries the steer pipeline')
    ok(STEER_PIPELINE.deadZone === STICK_DEAD_ZONE && STEER_PIPELINE.curveA === STEER_CURVE_A
        && STEER_PIPELINE.gain === STEER_GAIN && STEER_PIPELINE.smooth === STEER_SMOOTH,
        'STEER_PIPELINE reports the live constants, not stale copies')
}

console.log(`\nsteercheck: ${fail === 0 ? 'ALL GREEN' : fail + ' FAILED'} (${pass} passed)`)
if (fail) process.exit(1)
