// mystviewcheck — MYST is navigation by sight, so the views ARE the game:
// frame every node's camera and prove it sits outside all solids, that no
// single surface fills >=80% of the frame (the "whole screen is a flat grey
// rock" bug, #407), and that the caption's landmark is in view. Drives the
// DEV-only __mystTest.views() probe in system Chrome.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.MYST_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/myst`
const browser = await launch({ headless: true })
const r = new Report('mystviewcheck')
const page = await openGame(browser, { url: URL, hook: '__mystTest', start: false, viewport: { width: 960, height: 540 } })

const v = await page.evaluate(() => window.__mystTest.views())
r.check('every node framed', v && Object.keys(v).length === 28, `${Object.keys(v || {}).length}/28`)
let worst = 0
for (const [id, s] of Object.entries(v || {})) {
  r.check(`${id}: camera outside all solids`, !s.buried, s.buriedMesh || '')
  r.check(`${id}: no surface fills the frame`, s.maxFrac < 0.8, `dominant ${s.dominant || '-'} at ${Math.round(s.maxFrac * 100)}%`)
  r.check(`${id}: caption landmark in view`, s.landmarkSeen, `expect [${s.expect}]`)
  worst = Math.max(worst, s.maxFrac)
}
r.info('worst single-surface share', `${Math.round(worst * 100)}% — gate is 80%`)
r.exit(browser)
