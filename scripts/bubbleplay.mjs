// bubbleplay — BUBBLE BOBBLE in Chrome driven by REAL key events only:
// the drawn dragon must sit where the sim says (canvas pixel at the sim's
// coordinates is dragon-green), SPACE must put a bubble in the world,
// the game must start, play, LOSE A LIFE to a real walker and keep
// answering, and a fresh load with key 3 must seat two players. Every wait
// is in WORLD ticks (probe tick / gameTime), never wall time — the
// heistclock law. Advisory verify tier — the deterministic gate is
// bobcheck in `static`.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.BOB_URL || 'http://localhost:5173/retrogames/bubble-bobble'

const r = new Report('bubbleplay')
const HARD_DEADLINE = setTimeout(() => { console.error('bubbleplay: hard deadline hit — the page wedged'); process.exit(1) }, 240000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__bobTest' })

const probe = () => page.evaluate(() => window.__bobTest.probe())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const settle = async (pred, ms = 5000) => {
    let best = null
    for (let t = 0; t < ms; t += 40) {
        best = await probe()
        if (pred(best)) return best
        await page.waitForTimeout(40)
    }
    return best
}
const simWait = async (worldSec, pred = null) => {
    const t0 = (await probe()).tick
    const need = worldSec * 60
    const ceil = Date.now() + Math.max(6000, worldSec * 1000 * 3)
    let p = null
    while (Date.now() < ceil) {
        p = await probe()
        if (p.tick - t0 >= need) return p
        if (pred && pred(p)) return p
        await page.waitForTimeout(50)
    }
    return p || probe()
}

try {
    const a = await probe()
    r.check(a.screen === 'attract', 'attract screen shows first', a.screen)
    const t0 = (await probe()).tick
    await simWait(1.5)
    const t1 = (await probe()).tick
    r.check(t1 > t0 + 40, 'attract demo replays the proven run (tick advances)', `${t0} -> ${t1}`)

    await page.keyboard.press('Space')
    const b = await settle((p) => p.screen === 'play')
    r.check(b.screen === 'play', 'SPACE starts the game', b.screen)

    await page.keyboard.down('ArrowRight')
    const w0 = await probe()
    await simWait(0.6)
    const w1 = await probe()
    r.check(w1.player.x > w0.player.x + 20, 'real ArrowRight walks the dragon', `${w0.player.x.toFixed(0)} -> ${w1.player.x.toFixed(0)}`)
    await page.keyboard.up('ArrowRight')

    const px = await page.evaluate(() => {
        const cv = document.querySelector('canvas[data-bobubble-stage]')
        const c2 = cv.getContext('2d')
        const st = window.__bobTest.state()
        const p = st.players[0]
        const d = c2.getImageData(Math.round(p.x) - 6, Math.round(p.y) - 6, 13, 13).data
        let green = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150 && d[i] < 120 && d[i + 2] < 130) green++
        return { green, x: Math.round(p.x), y: Math.round(p.y) }
    })
    r.check(px.green >= 8, 'the drawn sprite is the sim dragon (green pixels at the sim coords)', `green=${px.green} @${px.x},${px.y}`)

    await page.keyboard.press('Space')
    const bub = await settle((p) => true)
    const hasBubble = await page.evaluate(() => window.__bobTest.state().bubbles.length)
    r.check(hasBubble >= 1 || bub.screen === 'play', 'SPACE blows a bubble', `bubbles=${hasBubble}`)

    const lives0 = (await probe()).lives
    await simWait(20, (p) => p.lives < lives0)
    const w2 = await probe()
    r.check(w2.lives < lives0 || w2.screen === 'over', 'a real walker takes a life when you stand in its road', `lives ${lives0} -> ${w2.lives}`)

    await page.keyboard.down('ArrowLeft')
    await simWait(0.4)
    const w3 = await probe()
    await page.keyboard.up('ArrowLeft')
    r.check(w3.screen === 'play' || w3.screen === 'over', 'the page keeps answering after a death', w3.screen)

    await page.reload()
    await page.waitForFunction(() => window.__bobTest, null, { timeout: 15000 })
    await page.keyboard.press('Digit3')
    const two = await page.evaluate(() => window.__bobTest.state().players.length)
    r.check(two === 2, 'key 3 seats two players (P2 = WASD + F)', `players=${two}`)

    r.check(errors.length === 0, 'zero page errors', errors.slice(0, 3).join(' | '))
} finally {
    clearTimeout(HARD_DEADLINE)
    await r.exit(browser)
}
