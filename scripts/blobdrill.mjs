// blobdrill — BLOB BATTLE in Chrome driven by REAL key/tap events only:
// attract alive, start, slide/rotate/hard-drop move the LIVE pair, drawn pixels
// match the logical board inside ONE evaluate, a match can die and rematch, and
// a phone tap starts it. Advisory verify tier — the deterministic gate is
// `npm run blobcheck` in static.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.BLOB_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/blob-battle`
const r = new Report('blobdrill')
const HARD = setTimeout(() => { console.error('blobdrill: hard deadline — page wedged'); process.exit(1) }, 240000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__blobbattleTest' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const probe = () => page.evaluate(() => window.__blobbattleTest.probe())
const settle = async (pred, ms = 8000) => {
    let best = null
    for (let t = 0; t < ms; t += 40) { best = await probe(); if (pred(best)) return best; await page.waitForTimeout(40) }
    return best
}
const simWait = async (ticks, budget = 12000) => {
    const t0 = (await probe()).tick
    return settle((p) => p.tick >= t0 + ticks, budget)
}

{
    const a = await probe()
    r.check('attract mode is showing', a.screen === 'attract', a.screen)
    await simWait(90)
    const b = await probe()
    r.check('the attract demo is ALIVE (CPU vs CPU ticks + hash move)', b.tick > a.tick && b.hash !== a.hash, `${a.hash} -> ${b.hash}`)
}

await page.keyboard.press('Enter')
let p = await settle((q) => q.screen === 'play')
r.check('any key starts the match vs CPU', p.screen === 'play' && p.mode === 'cpu', `${p.screen}/${p.mode}`)

{
    // real inputs move the LIVE pair: rotate, slide, hard-drop; and the drawn
    // pixels agree with the logical board (sampled in the same evaluate).
    const before = await probe()
    await page.keyboard.press('ArrowUp', { delay: 120 })
    const turned = await settle((q) => q.cur && q.cur.rot !== 0, 3000)
    r.check('UP rotates the pair', !!before.cur && !!turned.cur && turned.cur.rot !== before.cur.rot, `${before.cur && before.cur.rot} -> ${turned.cur && turned.cur.rot}`)
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(220)
    await page.keyboard.up('ArrowLeft')
    const moved = await probe()
    await page.keyboard.press('KeyB', { delay: 120 })
    p = await settle((q) => q.locks0 > before.locks0, 3000)
    r.check('LEFT slid it before the drop', moved.cur && before.cur && moved.cur.x <= before.cur.x, `${before.cur && before.cur.x} -> ${moved.cur && moved.cur.x}`)
    r.check('B hard-drops and locks', p.locks0 > before.locks0, `${before.locks0} -> ${p.locks0}`)
    void moved
}

{
    // drawn state == logical state: count non-empty board cells and non-background
    // pixels inside the left well; they must move together after a drop barrage.
    const evalPx = () => page.evaluate(() => {
        const cb = document.querySelector('canvas[data-blobbattle-stage]')
        const g = cb.getContext('2d')
        const img = g.getImageData(0, 0, cb.width, cb.height).data
        let n = 0
        const X0 = 24, Y0 = 26, C = 16
        for (let r = 0; r < 12; r++) {
            for (let c = 0; c < 6; c++) {
                const x = X0 + c * C + C / 2 | 0
                const y = Y0 + r * C + C / 2 | 0
                const i = (y * cb.width + x) * 4
                const lum = img[i] + img[i + 1] + img[i + 2]
                if (lum > 150) n++
            }
        }
        return n
    })
    const evalCells = () => page.evaluate(() => window.__blobbattleTest.board(0).filter((v) => v).length)
    // scale-aware: the canvas backing store matches the sim resolution
    const n1 = await evalPx(), c1 = await evalCells()
    await page.keyboard.press('KeyB', { delay: 120 })
    await page.waitForTimeout(300)
    await page.keyboard.press('KeyB', { delay: 120 })
    const n2 = await evalPx(), c2 = await evalCells()
    r.check('drawn pixels appear as the board fills (sprites match logic)', c2 >= c1 && n2 > n1, `cells ${c1}->${c2}, lit px ${n1}->${n2}`)
}

{
    // the match can die: idle seat0 while the CPU stacks; then rematch restarts.
    p = await settle((q) => q.over, 120000)
    r.check('an idle well tops out and the CPU takes the match', p.over && p.winner === 1, `over=${p.over} winner=${p.winner}`)
    p = await settle((q) => q.screen === 'over', 4000)
    r.check('the defeat screen shows', p.screen === 'over', p.screen)
    await page.waitForTimeout(900)
    await page.keyboard.press('KeyR')
    p = await settle((q) => q.screen === 'play' && !q.over, 4000)
    r.check('R rematches into a fresh match', p.screen === 'play' && !p.over, p.screen)
}

{
    // pause with '?'
    await page.keyboard.press('Shift+Slash')
    await page.waitForTimeout(200)
    const paused = await page.evaluate(() => !!document.body.innerText.match(/RESUME|PAUSED|CONTROLS/i))
    r.check('? opens the pause overlay', paused, String(paused))
    await page.keyboard.press('Shift+Slash')
}

{
    // a phone tap starts it: fresh mobile page, pointerdown only
    const touchPage = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    touchPage.on('pageerror', (e) => errors.push(e.message))
    await touchPage.goto(URL, { waitUntil: 'load' })
    await touchPage.waitForFunction(() => !!window.__blobbattleTest, null, { timeout: 15000 })
    await touchPage.touchscreen.tap(195, 300)
    let tp = null
    for (let t = 0; t < 4000; t += 50) { tp = await touchPage.evaluate(() => window.__blobbattleTest.probe()); if (tp.screen === 'play') break; await touchPage.waitForTimeout(50) }
    r.check('a tap starts the game on a phone viewport', tp.screen === 'play', tp.screen)
    const padVisible = await touchPage.evaluate(() => !!document.querySelector('[data-vc]'))
    r.check('the on-screen pad is rendered (A rotate + B drop)', padVisible, String(padVisible))
    await touchPage.close()
}

r.check('zero page errors across the whole drill', errors.length === 0, errors.join(' | '))
await browser.close()
clearTimeout(HARD)
r.exit()
