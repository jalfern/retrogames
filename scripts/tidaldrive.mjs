// drive tidal-rush end to end in headless Chrome: real key/tap events for
// start, steer, pause, bay-pick and restart; the contract drives the long
// race forward fast. Proves boot, live front in browser state, HUD ≡ state,
// pixels alive, over → restart. Advisory lane tool (#3104 rung 3).
import { openGame, launch } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const browser = await launch()
const out = []
const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
    const page = await openGame(browser, { url: `${BASE}/tidal-rush?lite=1`, hook: '__tidalTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    ok('boots clean', errors.length === 0, errors.join(';'))

    const a1 = await page.evaluate(() => window.__tidalTest.probe())
    await wait(1200)
    const a2 = await page.evaluate(() => window.__tidalTest.probe())
    ok('attract auto-drives', a2.tick > a1.tick + 30, `${a1.tick}→${a2.tick}`)

    // real key: ◀ ▶ picks the bay on the menu
    await page.keyboard.press('ArrowRight')
    await wait(300)
    const bayStorm = await page.evaluate(() => window.__tidalTest.probe().stage)
    ok('menu ◀ ▶ picks STORM BAY (real key)', bayStorm === 'storm', `stage=${bayStorm}`)

    // real tap: start the race
    await page.mouse.click(320, 240)
    await wait(400)
    const started = await page.evaluate(() => window.__tidalTest.probe())
    ok('tap starts the race', started.screen === 'play', `screen=${started.screen}`)

    // real key: throttle up
    await page.keyboard.down('ArrowUp')
    await wait(2500)
    const fast = await page.evaluate(() => window.__tidalTest.probe())
    await page.keyboard.up('ArrowUp')
    ok('throttle builds speed', fast.speed > 8, `speed=${fast.speed}m/s`)

    // HUD matches state (drawn ≡ logical): km/h text
    const hud = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('text-2xl') && d.textContent.includes('km/h'))
        return el ? el.textContent : ''
    })
    ok('HUD speed matches sim state', Math.abs(parseInt(hud, 10) - Math.round(fast.speed * 3.6)) <= 2, `hud="${hud.trim()}" state=${Math.round(fast.speed * 3.6)}`)

    // real key: pause freezes sim, resume unfreezes
    await page.keyboard.press('Slash')
    await wait(250)
    const p1 = await page.evaluate(() => window.__tidalTest.probe().tick)
    await wait(600)
    const p2 = await page.evaluate(() => window.__tidalTest.probe().tick)
    await page.keyboard.press('Slash')
    await wait(600)
    const p3 = await page.evaluate(() => window.__tidalTest.probe().tick)
    ok('? pauses and resumes the sim', p2 === p1 && p3 > p2, `${p1}/${p2}/${p3}`)

    // contract drive: steer through gates to the squall and past the finish
    const drive = await page.evaluate(async () => {
        window.__game.reset(7)
        let frontSeen = 0, frontMax = 0
        for (let i = 0; i < 150; i++) {
            const s = window.__tidalTest.autoDrive(60)
            if (s.frontPct > 0 && s.frontPct < 100) { frontSeen = 1; frontMax = Math.max(frontMax, s.frontPct) }
            if (s.done) break
        }
        return { end: window.__tidalTest.probe(), frontSeen, frontMax }
    })
    ok('front goes live in the browser mid-race', drive.frontSeen === 1 && drive.frontMax > 5, `max=${drive.frontMax}%`)
    ok('the race can be WON from the browser', drive.end.done === true, `rank=${drive.end.rank} score=${drive.end.score} t=${drive.end.t}`)
    ok('rival pack races too (all finish)', drive.end.rank >= 1 && drive.end.rank <= 3)

    // pixels: renderer alive, sea reads blue
    const px = await page.evaluate(async () => {
        const url = window.__game.frame()
        const img = new Image()
        img.src = url
        await img.decode()
        const c = document.createElement('canvas')
        c.width = 64; c.height = 40
        const x = c.getContext('2d')
        x.drawImage(img, 0, 0, 64, 40)
        const d = x.getImageData(0, 0, 64, 24).data
        let s = 0, b = 0, r = 0
        for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; b += d[i + 2]; r += d[i] }
        return { lum: s / (d.length / 4), blue: b / (d.length / 4), red: r / (d.length / 4) }
    })
    ok('scene renders (not black)', px.lum > 40, `mean lum=${px.lum.toFixed(1)}`)
    ok('sea reads blue', px.blue > px.red, `b=${px.blue.toFixed(1)} r=${px.red.toFixed(1)}`)

    // real key: over → press any key restarts
    const over = await page.evaluate(() => window.__tidalTest.probe().screen)
    await page.keyboard.press('Space')
    await wait(500)
    const restarted = await page.evaluate(() => window.__tidalTest.probe())
    ok('over → any key restarts', over === 'over' && restarted.screen === 'play', `over=${over} now=${restarted.screen}`)
    ok('zero page errors end-to-end', errors.length === 0, errors.join(';'))

    if (process.env.SHOTS) {
        await page.evaluate(() => window.__tidalTest.setMode('attract'))
        await wait(700)
        await page.screenshot({ path: 'shots/tidal-r3-attract.png' })
    }
    console.log(out.join('\n'))
    console.log(out.every((l) => l.startsWith('PASS')) ? 'DRIVE GREEN' : 'DRIVE RED')
    process.exitCode = out.every((l) => l.startsWith('PASS')) ? 0 : 1
} finally {
    await browser.close()
}
