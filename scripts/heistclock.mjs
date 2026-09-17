// RACCOON HEIST — how fast does the world actually run?
//
//   node scripts/heistclock.mjs [--throttle 8] [--steps 6]
//
// Prints, per CPU throttle rate, the frame rate Chrome gave the page and how much *world
// time* the fixed-timestep loop managed to keep. That second number is the one that matters
// and the one nobody could see: a loop that may simulate 83 ms per frame runs at half speed
// at 12 fps and a third at 4 fps, so the guards stroll, the torch timer stretches and the
// job clock lies — and `heistplay`, asleep on `setTimeout`, reports ten red checks that
// blame the game for what was the machine. This existed because CI was red and this laptop
// was green, and the only way to settle it was to measure the clock instead of arguing.
//
// Exits non-zero if the sim falls below `--min` (default 0.9x) at throttle 1, i.e. if the
// game can no longer keep real time on this machine at full speed.

import { openGame, launch, requireDevServer, opt, throttleCPU } from './lib/harness.mjs'

const URL = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist')
const RATES = String(opt(process.argv, '--throttle', '1,4,8,16')).split(',').map(Number)
const MIN = +opt(process.argv, '--min', 0.9)

await requireDevServer(URL)
const browser = await launch()
let bad = 0

for (const rate of RATES) {
    // A fresh page per rate. Reloading one page and re-throttling it produced a page that
    // reported 111 fps with the sim frozen, which is a broken measurement wearing a
    // broken machine's clothes, and the whole point of this tool is to be trusted.
    const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: { width: 900, height: 600 } })
    if (rate > 1) await throttleCPU(page, rate)
    await page.evaluate(() => {
        window.__frames = 0
        ;(function tick() { window.__frames++; requestAnimationFrame(tick) })()
    })
    // Into play: menus simulate nothing, so a clock measured on the brief screen measures
    // the menu, which is not the question.
    await page.evaluate(() => window.__heistTest.press())
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__heistTest.press())
    await page.waitForTimeout(700)

    const grab = () => page.evaluate(() => {
        const t = window.__heistTest
        return {
            // `st.t` is loop time: it advances on every simulated tick, in menus and
            // freeze frames included. `st.elapsed` is the *job* clock and stops the moment
            // play stops — measuring it while the sim sits on a results card reports 0.00x
            // and looks like a broken clock when it is a broken sample.
            t: t.engine().st.t,
            elapsed: t.engine().st.elapsed ?? t.state().sim.elapsed,
            phase: t.engine().st.phase,
            w: performance.now() / 1000,
            f: window.__frames,
        }
    })
    const a = await grab()
    await page.waitForTimeout(1600)
    const b = await grab()

    const dw = b.w - a.w
    const sim = (b.t - a.t) / dw
    const fps = (b.f - a.f) / dw
    const playing = a.phase === 'play' && b.phase === 'play'
    const job = playing ? (b.elapsed - a.elapsed) / dw : NaN
    // The machine-independent claim: while the frame rate is above the floor the loop owes
    // you real time. Below the floor the machine simply cannot draw the level 4 times a
    // second, and reporting that as a failed check would only teach people to ignore it.
    const ok = fps >= 4 ? sim >= MIN : true
    if (fps >= 4 && !ok) bad++
    console.log(`  ${sim.toFixed(2)}x loop ${playing ? `${job.toFixed(2)}x job` : '  (not playing)'} @ ${String(Math.round(fps)).padStart(3)} fps`
        + `  cpu ${rate}x, ${dw.toFixed(1)} s${ok ? '' : `  — BELOW ${MIN}x above the 4 fps floor`}`)
    if (fps < 4) console.log(`      ..  ${Math.round(fps)} fps is under the 4 fps floor; the loop cannot be asked to keep time here`)
    await page.close()
}

await browser.close()
console.log(bad ? `\nFAIL — the world cannot keep real time at full speed on this machine` : '\nOK')
process.exit(bad ? 1 : 0)
