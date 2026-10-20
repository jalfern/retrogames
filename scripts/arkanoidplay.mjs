// arkanoidplay — ARKANOID in Chrome driven by REAL key events only: the
// attract demo moves, a key starts the round, real arrows slide the paddle
// under the falling ball, SPACE launches, the drawn ball sits on the sim's
// coordinates (pixel read inside ONE evaluate with the probe), and ESC
// pauses. Advisory verify tier — the deterministic gate is arkanoidcheck in
// `static`.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.ARKANOID_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/arkanoid`
const r = new Report('arkanoidplay')
const HARD = setTimeout(() => { console.error('arkanoidplay: hard deadline — page wedged'); process.exit(1) }, 180000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__arkTest' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const probe = () => page.evaluate(() => window.__arkTest.probe())
const settle = async (pred, ms = 4000) => {
    let best = null
    for (let t = 0; t < ms; t += 25) { best = await probe(); if (pred(best)) return best; await page.waitForTimeout(25) }
    return best
}
const simWait = async (ticks, budget = 8000) => {
    const t0 = (await probe()).tick
    return settle((p) => p.tick >= t0 + ticks, budget)
}

{
    const a = await probe()
    r.check('attract mode is showing', a.screen === 'attract', a.screen)
    await simWait(90)
    const b = await probe()
    r.check('the attract demo is ALIVE (ticks advance, hash moves)', b.tick > a.tick && b.hash !== a.hash, `${a.hash} -> ${b.hash}`)
}

await page.keyboard.press('Enter')
let p = await settle((q) => q.screen === 'play')
r.check('any key starts the round', p.screen === 'play', p.screen)
r.check('a ball rides the paddle at start', !!p.ball && p.ball.stuck, JSON.stringify(p.ball))

await page.keyboard.press('Space')
p = await settle((q) => q.ball && !q.ball.stuck && q.ball.vy < 0)
r.check('SPACE launches the ball upward', !!p.ball && !p.ball.stuck && p.ball.vy < 0, JSON.stringify(p.ball))

await page.keyboard.down('ArrowRight')
const before = await probe()
p = await settle((q) => q.paddle > before.paddle + 12)
await page.keyboard.up('ArrowRight')
r.check('a real RIGHT arrow slides the paddle right', p.paddle > before.paddle + 12, `${before.paddle} -> ${p.paddle}`)

// ball pixel vs sim coordinates, in ONE evaluate (no stale coordinates)
{
    let lit = false, at = null
    for (let t = 0; t < 6000 && !lit; t += 50) {
        const got = await page.evaluate(() => {
            const c = document.querySelector('canvas[data-arkanoid-stage]')
            const st = window.__arkTest.probe()
            if (!st.ball) return null
            const sc = c.width / 256
            const px = Math.round(st.ball.x * sc), py = Math.round(st.ball.y * sc)
            const g = c.getContext('2d')
            const d = g.getImageData(Math.max(0, px - 4), Math.max(0, py - 4), 9, 9).data
            let maxL = 0
            for (let i = 0; i < d.length; i += 4) maxL = Math.max(maxL, d[i] + d[i + 1] + d[i + 2])
            return { maxL, px, py, x: st.ball.x, y: st.ball.y }
        })
        if (got) { lit = got.maxL > 360; at = got }
    }
    r.check('the DRAWN ball is light where the SIM says it is', lit, JSON.stringify(at))
}

{
    const a = await probe()
    await simWait(30)
    const b = await probe()
    r.check('the sim advances in WORLD ticks (60/s)', Math.abs((b.tick - a.tick) - 30) <= 12, `${b.tick - a.tick} ticks`)
}

await page.keyboard.press('Escape')
await page.waitForTimeout(150)
const paused = await page.evaluate(() => !!document.body.textContent.match(/RESUME|resume/))
r.check('? / ESC opens the pause overlay', paused)

r.check('no page errors', errors.length === 0, errors.join(' | '))
clearTimeout(HARD)
await r.exit(browser)
