// pacwatchdrive (#3679) — real Chrome: does the attract autopilot survive the
// #3661 speed ladder? Its panic horizon predates the ×1.2 late-stage ghosts.
// The ride: a seeded attract board, 60 s at stage 0 (the baseline the horizon
// was tuned for), then the DebugKit ladders the same board to stage 3 / round 14
// and it rides another 60 s. Deaths per minute are counted from the probe's
// lives line (a 3-lives refill after game-over counts as one life lost).
// Advisory under #737 — the numbers below are the gate: the late-stage ride may
// not bleed faster than the stage-0 baseline plus one life per minute.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/pacman`
const rep = new Report('pacwatchdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=7`, hook: '__pacTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = () => page.evaluate(() => window.__pacTest.probe())

// ride one window; returns { deaths, min } counted from the probe's cumulative
// captures — exact across game-overs, immune to 500 ms sampling gaps.
async function ride(seconds) {
    const a = await probe()
    let deaths = 0
    let prev = a
    const samples = Math.round(seconds * 2)
    for (let i = 0; i < samples; i++) {
        await sleep(500)
        const s = await probe()
        if (!s) continue
        if (s.deaths > prev.deaths) deaths += s.deaths - prev.deaths // cumulative counter, monotone
        prev = s
    }
    const worldMin = (prev.tick - a.tick) / 60 / 60 // ticks / 60fps / 60s
    return { deaths, min: Math.max(worldMin, 0.001) }
}

// 1 — stage-0 baseline (horizon was tuned for this)
let s = await probe()
rep.check('attract autopilot is driving (stage 0)', !!s && s.stage === 0 && typeof s.deaths === 'number',
    JSON.stringify({ round: s?.round, stage: s?.stage, deaths: s?.deaths }))
const base = await ride(60)
console.log(`stage-0 ride: ${base.deaths} deaths / ${base.min.toFixed(2)} min`)

// 2 — the ladder: score pushes ghosts to ×1.2, round 14 kills the energizer
await page.evaluate(() => window.__dbg.act('Score → 5000'))
await page.evaluate(() => window.__dbg.act('Round → 14'))
await sleep(300)
s = await probe()
rep.check('ladder cheat lands (stage 3, round ≥14)', s.stage === 3 && s.round >= 14,
    JSON.stringify({ stage: s.stage, round: s.round }))
const late = await ride(60)
console.log(`late-stage ride: ${late.deaths} deaths / ${late.min.toFixed(2)} min`)

// gate: absolute bound — the pre-fix board bled 10.3/min; the scaled horizon
// rides ~1/min. Cross-window comparison is luck of the seeded stream (the
// browser eats a different rand path per run), so the drive carries the honest
// ceiling; the per-seed matched-dice proof lives in pacmancheck §watch.
const lateRate = late.deaths / late.min
rep.check('autopilot holds the late-stage ride to ≤4 captures/min (#3679)',
    lateRate <= 4,
    `late ${lateRate.toFixed(2)}/min (base ${base.deaths}/${base.min.toFixed(2)} min)`)
rep.check('zero page errors through the ride', errors === 0, `${errors}`)

await rep.exit(browser)
