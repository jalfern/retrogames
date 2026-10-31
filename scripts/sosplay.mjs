// SOS PLAY — drive SHORT ORDER SHOUT with real key events (#1248, step 6).
// Attract -> select -> play with keyboard, walk a cook and confirm the DRAWN
// pixels move with the logical position, fast-forward to a firing, restart,
// all with zero page errors. Screenshots of every screen land in /tmp/forge.

import { chromium } from 'playwright-core'

const URL = process.env.SOS_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/short-order-shout`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const cv0Box = async (pg) => {
    const el = await pg.$('canvas')
    const b = await el.boundingBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
}

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|favicon.ico/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__sosTest', null, { timeout: 15000 })
await sleep(1200)
ok('attract shows', (await page.evaluate(() => window.__sosTest.screen())) === 'attract')
await page.screenshot({ path: '/tmp/forge/sos-attract.png' })

// real key: leave attract -> select
await page.keyboard.press('Space')
await sleep(200)
ok('any key reaches select', (await page.evaluate(() => window.__sosTest.screen())) === 'select')
await page.keyboard.press('ArrowRight') // 2 -> 3 cooks
await page.keyboard.press('ArrowLeft') // back to 2
await page.screenshot({ path: '/tmp/forge/sos-select.png' })
await page.keyboard.press('Space')
await sleep(300)
ok('space starts the shift', (await page.evaluate(() => window.__sosTest.screen())) === 'play')

// walk right with real keys and prove the drawn cook follows the sim
const box = await cv0Box(page)
const posBefore = await page.evaluate(() => window.__sosTest.state().cooks[0])
for (let i = 0; i < 4; i++) { page.keyboard.down('ArrowRight'); await sleep(130); page.keyboard.up('ArrowRight'); await sleep(140) }
const posAfter = await page.evaluate(() => window.__sosTest.state().cooks[0])
const cellClip = (c) => ({
    x: Math.round(box.x + (4 + (c.x - 1)) * box.w / 320),
    y: Math.round(box.y + (48 + (c.y - 1) * 24) * box.h / 224),
    width: Math.round(24 * box.w / 320),
    height: Math.round(30 * box.h / 224),
})
const shotBefore = await page.screenshot({ clip: cellClip(posBefore) })
const shotAfter = await page.screenshot({ clip: cellClip(posAfter) })
ok('real arrows move the cook (logical)', posAfter.x > posBefore.x, `${posBefore.x} -> ${posAfter.x}`)
ok('the drawn cook moved with the sim', !shotBefore.equals(shotAfter))

// real grab: drive to cooler front (1,1), bump to face up, press SPACE
await page.evaluate(() => window.__sosTest.release('right'))
let got = null
for (let i = 0; i < 14 && !got; i++) {
    const c = await page.evaluate(() => window.__sosTest.state().cooks[0])
    if (c.y !== 1) { page.keyboard.down('ArrowUp'); await sleep(120); page.keyboard.up('ArrowUp') }
    else if (c.x !== 1) { page.keyboard.down('ArrowLeft'); await sleep(120); page.keyboard.up('ArrowLeft') }
    else {
        page.keyboard.down('ArrowUp'); await sleep(60); page.keyboard.up('ArrowUp'); await sleep(80) // bump face
        await page.keyboard.press('Space')
        await sleep(120)
        got = await page.evaluate(() => window.__sosTest.state().cooks[0].holding)
    }
    await sleep(60)
}
ok('a real walk-up + SPACE takes an ingredient', !!got, `holding=${got} at ${(await page.evaluate(() => { const c = window.__sosTest.state().cooks[0]; return c.x + ',' + c.y + ' ' + c.face }))}`)
await page.screenshot({ path: '/tmp/forge/sos-play.png' })

// tap-to-start on touch: reload, tap the canvas
await page.reload({ waitUntil: 'load' })
await page.waitForFunction('!!window.__sosTest', null, { timeout: 15000 })
await sleep(800)
const cv = await page.$('canvas')
await cv.click({ position: { x: 120, y: 120 } })
await sleep(200)
const tapScreen = await page.evaluate(() => window.__sosTest.screen())
ok('tap advances the attract screen', tapScreen === 'select', tapScreen)

// fast-forward to a firing through the contract (harness clock), verify over
await page.evaluate(() => {
    window.__game.reset(3, 2)
    window.__game.release()
})
await sleep(300)
await page.evaluate(() => {
    const g = window.__game
    for (let t = 0; t < 4000; t++) g.step([{}, {}])
    return g.state()
})
await sleep(150)
const overState = await page.evaluate(() => ({ screen: window.__sosTest.screen(), st: window.__sosTest.state() }))
ok('idle cooks get fired after 3 expired tickets', overState.screen === 'over' && overState.st.done && !overState.win, `screen=${overState.screen} strikes=${overState.st.strikes}`)
await page.screenshot({ path: '/tmp/forge/sos-over.png' })

// restart with a real key
await sleep(1000)
await page.keyboard.press('Space')
await sleep(200)
ok('space after game over returns to select', (await page.evaluate(() => window.__sosTest.screen())) === 'select')

// pause overlay
await page.keyboard.press('Space') // into play
await sleep(200)
await page.keyboard.press('Escape')
await sleep(200)
ok('escape pauses (overlay mounted)', !!(await page.$('[data-testid="pause-overlay"], .pause-overlay')) || (await page.evaluate(() => /HOW TO PLAY|RESUME|controls/i.test(document.body.innerText))))
await page.keyboard.press('Escape')

ok('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
console.log(`\nsosplay: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
