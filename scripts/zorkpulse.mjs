// ZORK — "is the agent slow, or is it stuck?" probe.
//
//   npm run dev                      # in another terminal
//   npm run zorkpulse [-- --throttle 16]
//
// `zorkuicheck` gates the Zork AI; this file *diagnoses* it, and it is the reason
// the double-driver bug (two `tick()` chains — `AgentLoop`'s own timer plus a
// `while (running) await tick()` in the page) got found instead of filed as
// "the CI box is flaky".
//
// Every line is one second of wall time, printed from the loop's own counters:
//
//   x      exchanges the sensor has closed (the agent's real clock)
//   frz    seconds since `x` last moved — the difference between slow and stuck
//   en     is the machine at the prompt (a `true` here with `frz` climbing means
//          the *actuator* is waiting on nothing, which is a bug, not a lag)
//   steps  ticks the loop has run, and `act`/`fail` how many produced a command
//   med    the last command→prompt round trip: the box's own rhythm, in ms
//
// `--throttle N` runs it on a deliberately starved page (the same CDP knob
// `heistplay` uses), which is how "green on my laptop, red on CI" gets turned
// into a reproducible statement instead of an argument. Under it, watch `med`
// grow and `frz` stay at zero: that is a slow machine behaving correctly. `frz`
// growing with `en=Y` is the bug.
//
// Not a gate. `zorkuicheck` is the gate; this is what you run when it is red.

import { launch, requireDevServer, opt, throttleCPU } from './lib/harness.mjs'

const URL = opt(process.argv.slice(2), '--url', 'http://localhost:5173/retrogames/zork')
const SECONDS = +opt(process.argv.slice(2), '--seconds', 60)
const THROTTLE = +opt(process.argv.slice(2), '--throttle', 0)

await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
page.on('pageerror', (e) => console.log('PAGEERR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR', m.text()) })
if (THROTTLE) await throttleCPU(page, THROTTLE)

await page.goto(URL, { waitUntil: 'load', timeout: 120000 })
await page.waitForFunction(() => !!window.__zorkTest?.ready?.(), null, { timeout: 120000 })
await page.waitForFunction(() => window.__zorkTest.state().inputEnabled, null, { timeout: 120000 })
// The click, like the check: this is the affordance a visitor uses.
const label = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /play|ai|▶/i.test(x.textContent || ''))
  if (!b) return null
  b.click()
  return (b.textContent || '').trim()
})
console.log(`\nclicked ${JSON.stringify(label)} — one line per second of wall time`)

let prev = -1, frozen = 0
for (let i = 0; i < SECONDS; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  const s = await page.evaluate(() => {
    const st = window.__zorkTest.state(), a = window.__zorkTest.aiStatus() || {}, act = window.__zorkTest.aiActuator() || {}
    return {
      x: st.exchanges, en: st.inputEnabled, hidden: document.hidden,
      run: window.__zorkTest.aiRunning(), steps: a.steps, acts: a.actions, fails: a.failures,
      idle: a.idle, stale: a.stale, reason: a.reason || '', med: act.medianMs, timeouts: act.timeouts,
      room: st.room,
    }
  })
  if (s.x === prev) frozen++; else frozen = 0
  prev = s.x
  const bad = frozen >= 3 || s.timeouts > 0
  console.log(`${bad ? '*' : ' '}${String(i + 1).padStart(3)}s x=${String(s.x).padStart(3)} frz=${String(frozen).padStart(2)} en=${s.en ? 'Y' : 'n'} hidden=${s.hidden ? 'Y' : 'n'}`
    + ` run=${s.run ? 'Y' : 'n'} steps=${String(s.steps).padStart(3)} act=${String(s.acts).padStart(3)}`
    + ` fail=${String(s.fails).padStart(2)} idle=${String(s.idle).padStart(2)} stale=${String(s.stale).padStart(2)}`
    + ` med=${String(s.med ?? '-').padStart(5)}ms to=${String(s.timeouts).padStart(2)} ${s.reason || ''}`)
  if (!s.run) { console.log(`  loop stopped: "${s.reason}" at ${s.room}`); break }
}
await browser.close()
