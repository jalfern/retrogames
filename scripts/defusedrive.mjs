// defusedrive.mjs — real-key browser drive for BOMB DEFUSE (#1800).
// Boots the page, starts it with genuine key events, verifies the drawn
// canvas is real pixels, drives the sim to a win through the DEV hook, and
// restarts from the over screen. Kept SHORT: full Chrome can't boot on the
// launchd-kicked box (#1622) and long live captures kill headless-shell.
//
// npm run defusedrive   (needs `npm run dev` on $DEV_PORT, default 5173)
import { launchChrome } from './lib/chromeboot.mjs'
import { Report } from './lib/harness.mjs'

const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/bomb-defuse`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const r = new Report('defusedrive')
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|ERR_NAME_NOT_RESOLVED/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__bdTest', null, { timeout: 30000 })
r.check('boots: __bdTest present', errs.length === 0, errs.join(' | '))
r.check('attract shows', (await page.evaluate(() => window.__bdTest.screen())) === 'attract')

await page.keyboard.press('Space')
await sleep(300)
r.check('Space opens the crew-size select', (await page.evaluate(() => window.__bdTest.screen())) === 'select')
await page.screenshot({ path: '/tmp/forge/bd-select.png' })
await page.keyboard.press('Space')
// consent gate: on a virgin origin askConsent goes up before seed-birth —
// Escape declines ("play on"); either answer lands the run.
await sleep(600)
if (await page.evaluate(() => !!document.querySelector('[data-auto-record-gate]'))) await page.keyboard.press('Escape')
await sleep(900)
r.check('Space starts a run (play, integer seed)', await page.evaluate(() => {
    const s = window.__bdTest.state()
    return window.__bdTest.screen() === 'play' && !!s && Number.isInteger(s.seed)
}))

// real-key SYNC clear: the solo partner leads the key turn at stepT>=20;
// join with genuine Space presses until the step advances.
let syncCleared = false
for (let i = 0; i < 40 && !syncCleared; i++) {
    await page.keyboard.press('Space')
    await sleep(220)
    syncCleared = await page.evaluate(() => {
        const s = window.__bdTest.state()
        return !!s && (s.step > 0 || s.bomb > 0)
    })
}
r.check('Space joins the partner key turn -> step clears', syncCleared)
await page.screenshot({ path: '/tmp/forge/bd-play.png' })

const px = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++
    return lit
})
r.check('canvas draws real content (not black)', px > 4000, `${px} lit samples`)

const win = await page.evaluate(() => {
    const s = window.__bdTest.solve(9000)
    return s && s.done && s.won
})
r.check('solver-driven run reaches WON', !!win)
await sleep(150)
r.check('over screen shows', (await page.evaluate(() => window.__bdTest.screen())) === 'over')
await page.screenshot({ path: '/tmp/forge/bd-win.png' })
await sleep(750)
await page.keyboard.press('KeyX')
await sleep(1200)
r.check('any key restarts (play again)', (await page.evaluate(() => window.__bdTest.screen())) === 'play')

// #1812 item 2 — the press-tick law in the REAL view stack, stepped tick-exact
// (wall-clock rAF sampling is too coarse on software-rendered Chrome — the
// first observed frame can land after the spring; sim ticks are the law here).
// The solo partner leads seat 1's truth at stepT≈48; step to it one tick at a
// time and read pose atomically beside the truth.
const probe = await page.evaluate(() => {
    const T = window.__bdTest
    let on = -1
    for (let t = 0; t < 400; t++) { T.step(1); if (T.keyOn()[1]) { on = t; break } }
    if (on < 0) return null
    const pAt = T.keyPoses()[1] // truth's own tick — the pump already ran it once
    T.step(3); const pMid = T.keyPoses()[1] // a few ticks in: still inside the lag/spring
    T.step(25); const pHome = T.keyPoses()[1]
    return { on, pAt, pMid, pHome, truth: T.keyOn()[1] }
})
r.check('press tick: seat-1 truth ON while the barrel is still at rest (lag reads before motion)',
    probe !== null && probe.pAt < 0.25, probe ? `p@press=${probe.pAt.toFixed(3)} (STAGGER hold)` : 'partner never led')
r.check('mid-swing frame exists then the barrel homes (|pose−1|<=0.06) under the held truth',
    probe !== null && probe.pMid > 0.05 && probe.pMid < 0.6 && Math.abs(probe.pHome - 1) <= 0.06 && probe.truth === true,
    probe ? `mid=${probe.pMid.toFixed(3)} home=${probe.pHome.toFixed(3)} truth=${probe.truth}` : 'no span')

r.check('zero page errors across the drive', errs.length === 0, errs.join(' | '))

await r.exit(browser)
