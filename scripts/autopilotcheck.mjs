// Autopilot regression (option 3): the rule-based CPU must clear 1-1 outright.
//
// Promoted from the throwaway driver that iteration 12 left in scripts/.shots/.
// The autopilot is deterministic, so "did it reach the castle?" is a real gate —
// if a level/AI change drops it below a clean win, this exits non-zero.
//
// It also measures piranha-plant crossings, because "clears 1-1" is only
// interesting if the level still contains its hazards. Mario's feet must clear
// each plant's head while inside its hitbox column; a plant that is conveniently
// retracted every time is a silent way for this check to stop meaning anything,
// so we assert that at least one plant was actually encountered fully emerged.
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
const POLL = 40                                 // fine enough to catch a jump apex

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
const r = new Report('autopilotcheck')

await page.evaluate(() => window.__marioTest.autoplay())
r.info('started autopilot')

const t0 = Date.now()
let s = await page.evaluate(() => window.__marioTest.getState())
let maxCol = s.col, deaths = 0, lastLives = s.lives, outcome = 'timeout'
const crossings = new Map()          // pipe x -> { minVert, atOut, atSlack }
let facedEmerged = 0

while ((Date.now() - t0) / 1000 < maxWait) {
    await page.waitForTimeout(POLL)
    const snap = await page.evaluate(() => ({
        st: window.__marioTest.getState(),
        pl: window.__marioTest.plants ? window.__marioTest.plants() : [],
    }))
    s = snap.st
    maxCol = Math.max(maxCol, s.col)
    if (s.lives < lastLives) { deaths += lastLives - s.lives; r.info('lost a life', `at col ${maxCol}`) }
    lastLives = s.lives

    for (const p of snap.pl) {
        if (Math.abs(p.col - s.col) < 9 && p.out > 0.9) facedEmerged++
        if (p.h === 0) continue
        const xSlack = Math.min(s.x + 12 - p.x, p.x + p.w - s.x)     // depth inside the box
        if (xSlack <= 0) continue
        const vert = p.y - (s.y + s.h)                                 // feet above head
        const cur = crossings.get(p.col)
        if (!cur || vert < cur.minVert) crossings.set(p.col, { minVert: vert, atOut: p.out, atSlack: xSlack })
    }

    if (s.state === 'win') { outcome = 'win'; break }
    if (s.state === 'gameover') { outcome = 'gameover'; break }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`  ..    final state=${s.state} mode=${s.mode} col=${s.col} maxCol=${maxCol} lives=${s.lives} score=${s.score} power=${s.power} in ${secs}s`)

r.check('autopilot mode engaged', s.mode === 'autopilot' || outcome !== 'timeout', `mode=${s.mode}`)
r.check('reached the flagpole (col >= 170)', maxCol >= 170, `maxCol=${maxCol}`)
r.check('cleared the level (WORLD 1-1 CLEAR)', outcome === 'win', `outcome=${outcome}`)
r.check('no deaths', deaths === 0, `deaths=${deaths}`)

// piranha plants
const crossed = [...crossings.entries()].sort((a, b) => a[0] - b[0])
r.check('actually faced a fully-emerged plant', facedEmerged > 0,
    `${facedEmerged} frames within 9 cols of a plant at full extension`)
for (const [col, c] of crossed) {
    r.check(`cleared the plant at col ${col}`, c.minVert > 0,
        `feet ${c.minVert}px above its head (out=${c.atOut.toFixed(2)}, xSlack=${c.atSlack}px)`)
}
if (!crossed.length) r.check('crossed at least one plant', false, 'no plant overlap recorded — plants missing from 1-1?')

await page.screenshot({ path: 'scripts/.shots/autopilot-end.png' }).catch(() => {})
r.exit(browser)
