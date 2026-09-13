// Autopilot regression (option 3): the rule-based CPU must clear 1-1 outright.
//
// Promoted from the throwaway driver that iteration 12 left in scripts/.shots/.
// The autopilot is deterministic, so "did it reach the castle?" is a real gate —
// if a level/AI change drops it below a clean win, this exits non-zero.
//
// Usage:
//   npm run autopilotcheck
//   node scripts/autopilotcheck.mjs [--max-wait 240] [--url <url>]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const maxWait = +opt(args, '--max-wait', 240)   // seconds of wall clock
const POLL = 500

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
const r = new Report('autopilotcheck')

const state = () => page.evaluate(() => window.__marioTest.getState())

await page.evaluate(() => window.__marioTest.autoplay())
r.info('started autopilot')

const t0 = Date.now()
let s = await state()
let maxCol = s.col
let deaths = 0
let lastLives = s.lives
let outcome = 'timeout'

while ((Date.now() - t0) / 1000 < maxWait) {
    await page.waitForTimeout(POLL)
    s = await state()
    maxCol = Math.max(maxCol, s.col)
    if (s.lives < lastLives) { deaths += lastLives - s.lives; r.info('lost a life', `at col ${maxCol}`) }
    lastLives = s.lives
    if (s.state === 'win') { outcome = 'win'; break }
    if (s.state === 'gameover') { outcome = 'gameover'; break }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`  ..    final state=${s.state} mode=${s.mode} col=${s.col} maxCol=${maxCol} lives=${s.lives} score=${s.score} in ${secs}s`)

r.check('autopilot mode engaged', s.mode === 'autopilot' || outcome !== 'timeout', `mode=${s.mode}`)
r.check('reached the flagpole (col >= 170)', maxCol >= 170, `maxCol=${maxCol}`)
r.check('cleared the level (WORLD 1-1 CLEAR)', outcome === 'win', `outcome=${outcome}`)
r.check('no deaths', deaths === 0, `deaths=${deaths}`)

await page.screenshot({ path: 'scripts/.shots/autopilot-end.png' }).catch(() => {})
r.exit(browser)
