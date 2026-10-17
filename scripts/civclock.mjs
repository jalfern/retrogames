// CIVILIZATION V — what does a frame cost when the board is full?
//
//   node scripts/civclock.mjs [--throttle 1,4,8] [--turns 30] [--min 0.9]
//
// #375 item 5: the late game (musket lines, six wonders, galleons) is the worst
// the renderer ever sees, and a phone is not this laptop. This script builds that
// board on the DEV hook (`__civTest.clock`: autopilot to t30 with the crowns
// disarmed the way §33 disarms them in Node), then measures per CPU throttle
// rate, on the full pipeline and on `?lite=1`:
//
//   fps        frames Chrome actually presented
//   loop       the number that matters: how much of real time the fixed-timestep
//              world kept. The catch-up cap (16 steps) keeps it at 1.00 down to
//              ~4 fps; below that the machine cannot present the world and the
//              loop is not blamed for the machine (the frame-floor lesson).
//   p50/p95    the actual frame deltas, in ms — "budget the frame" in numbers.
//
// One honest caveat, learned the expensive way while writing this: headless Chrome
// on macOS presents at roughly 13-20 fps for ANY page — a bare three.js canvas
// that only clears the screen measures ~13 fps here. So this script never claims
// the game "runs at X fps" as a property of the game; it gates on the loop ratio
// (a property of the game: can the sim keep real time on the frames it gets?)
// and prints the rest for whoever is tuning the pipeline.

import { openGame, launch, requireDevServer, opt, throttleCPU } from './lib/harness.mjs'

const URL = opt(process.argv, '--url', process.env.CIV_URL || 'http://localhost:5173/retrogames/civilization-v')
const RATES = String(opt(process.argv, '--throttle', '1,4,8')).split(',').map(Number)
const MIN = +opt(process.argv, '--min', 0.9)
const TURNS = +opt(process.argv, '--turns', 30)
const WINDOW_MS = 2500
const STEP_CAP = 16   // must match the shell's catch-up cap; the floor is 60/STEP_CAP fps

async function openScene(browser, { lite, rate }) {
    const url = URL + (lite ? (URL.includes('?') ? '&' : '?') + 'lite=1' : '')
    const page = await openGame(browser, { url, hook: '__civTest', viewport: { width: 640, height: 426 } })
    if (rate > 1) await throttleCPU(page, rate)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const scene = await page.evaluate((turns) => window.__civTest.clock(turns), TURNS)
    await page.waitForTimeout(1200)   // let the scene-build backlog drain before counting
    return { page, scene }
}

const measure = (page) => page.evaluate(({ windowMs }) => new Promise((res) => {
    const frames = []
    let last = performance.now()
    const p0 = window.__civTest.probe()
    const tick0 = p0.tick
    const w0 = performance.now()
    let n = 0
    ;(function raf(ts) {
        frames.push(ts - last); last = ts
        if (++n % 20 === 0) window.__civTest.turn()   // keep the world moving like a player
        if (ts - w0 < windowMs) requestAnimationFrame(raf)
        else {
            const w = performance.now()
            const p = window.__civTest.probe()
            const sorted = frames.slice(1).sort((a, b) => a - b)
            const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0
            res({ fps: frames.length / (w - w0) * 1000, ratio: (p.tick - tick0) / ((w - w0) / 1000 * 60),
                p50: pct(0.5), p95: pct(0.95), turn: p.turn, end: p.end })
        }
    })(performance.now())
}), { windowMs: WINDOW_MS })

await requireDevServer(URL)
const browser = await launch()
let bad = 0

for (const rate of RATES) {
    console.log(`\n  cpu ${rate}x  (late board, 640x426, step-cap ${STEP_CAP} → time-keeping floor ~${(60 / STEP_CAP).toFixed(1)} fps)`)
    for (const lite of [false, true]) {
        const { page, scene } = await openScene(browser, { lite, rate })
        const m = await measure(page)
        const floor = m.fps < 60 / STEP_CAP
        let verdict = ''
        if (rate === 1 && m.ratio < MIN) { bad++; verdict = `  — BELOW ${MIN}x at full speed` }
        console.log(`    ${lite ? 'lite' : 'full'}  ${m.fps.toFixed(1).padStart(5)} fps · loop ${m.ratio.toFixed(2)}x · p50 ${m.p50.toFixed(1)}ms p95 ${m.p95.toFixed(1)}ms`
            + `  turn ${m.turn}${m.end ? ` (${m.end})` : ''}${floor ? ' · under the presentation floor, loop not blamed' : ''}${verdict}`)
        if (rate === RATES[0]) console.log(`      scene: turn ${scene.turn} · ${scene.muskets} muskets · ${scene.galleons} galleon · ${scene.wonders} wonders · ${scene.cities} cities · ${scene.units} units${scene.end ? ` · ENDED ${scene.end}` : ''}`)
        await page.close()
    }
}

await browser.close()
console.log(bad ? `\nFAIL — ${bad} budget breach (see lines above)` : '\nOK')
process.exit(bad ? 1 : 0)
