// drive PINBALL end to end in headless Chrome: real key/tap events for start,
// plunger, pause, restart; rung-3 rigs fire the orbit wrap and the magnet for
// real, in the browser. HUD ≡ state via the DEV hook; pixels prove the strip
// and the playfield draw. Advisory lane tool (#3199 rung 3).
import { openGame, launch } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const browser = await launch()
const out = []
const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
    const page = await openGame(browser, { url: `${BASE}/pinball?lite=1`, hook: '__pinballTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    ok('boots clean', errors.length === 0, errors.join(';'))

    // real key: Space starts the game out of attract
    await page.keyboard.press('Space')
    await wait(400)
    const started = await page.evaluate(() => window.__pinballTest.state())
    ok('SPACE starts the game', started.screen === 'play' && !started.done, `screen=${started.screen}`)

    // real key: hold Space = plunger charge, release = launch
    await page.keyboard.down('Space')
    await wait(700)
    const held = await page.evaluate(() => window.__pinballTest.state())
    await page.keyboard.up('Space')
    await wait(300)
    const launched = await page.evaluate(() => window.__pinballTest.state())
    ok('hold-and-release Space fires the plunger', held.power > 0.1 && launched.launched && launched.tick > started.tick,
        `power=${held.power.toFixed(2)} launched=${launched.launched}`)

    // the plunger ball reaches the dome side (real Chrome physics, not Node)
    await wait(900)
    const flying = await page.evaluate(() => window.__pinballTest.state())
    ok('the launched ball is live on the playfield', flying.score > 0 || flying.by < 500, `score=${flying.score}`)

    // rung 3 rig: feed the climbing rail — the wrap pays ORBIT in the browser
    await page.evaluate(() => window.__pinballTest.orbitFeed())
    let st = null
    for (let i = 0; i < 40; i++) { await wait(100); st = await page.evaluate(() => window.__pinballTest.state()); if (st.orbits >= 1) break }
    ok('ORBIT: the wrap completes live in Chrome', !!st && st.orbits >= 1, `orbits=${st && st.orbits}`)
    ok('the wrap announces itself on the sim-owned DMD state', !!st && st.dmd.text === 'ORBIT! +100', st && st.dmd.text)

    // rung 3 rig: the magnet grabs a drifting ball and holds it
    await page.evaluate(() => window.__pinballTest.magDrop())
    let mag = null
    for (let i = 0; i < 30; i++) { await wait(100); mag = await page.evaluate(() => window.__pinballTest.state()); if (mag.magHold > 0) break }
    ok('MAGNET: grabs and holds live (magHold > 0)', !!mag && mag.magHold > 0, `hold=${mag && mag.magHold}`)
    const held0 = await page.evaluate(() => window.__pinballTest.state())
    await wait(500)
    const held1 = await page.evaluate(() => window.__pinballTest.state())
    ok('the world clock keeps running during the hold', held1.tick > held0.tick, `${held0.tick}→${held1.tick}`)

    // pixels: the playfield draws, and the DMD strip region lights up after an event
    const px = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const g = c.getContext('2d')
        const field = g.getImageData(60, 140, 240, 320).data
        let litField = 0
        for (let i = 0; i < field.length; i += 4) if (field[i] + field[i + 1] + field[i + 2] > 150) litField++
        const strip = g.getImageData(112, 246, 136, 24).data
        let litStrip = 0
        for (let i = 0; i < strip.length; i += 4) if (strip[i] > 120 && strip[i + 1] > 70 && strip[i + 2] < 120) litStrip++
        return { litField, litStrip }
    })
    ok('the playfield renders content (not a blank canvas)', px.litField > 500, `lit=${px.litField}`)
    ok('the DMD strip shows lit dots after the announce', px.litStrip > 12, `lit=${px.litStrip}`)

    // ? pauses and resumes the sim
    await page.keyboard.press('Shift+Slash')
    await wait(250)
    const p1 = await page.evaluate(() => window.__pinballTest.state().tick)
    await wait(600)
    const p2 = await page.evaluate(() => window.__pinballTest.state().tick)
    await page.keyboard.press('Shift+Slash')
    await wait(600)
    const p3 = await page.evaluate(() => window.__pinballTest.state().tick)
    ok('? pauses and resumes the sim', p2 === p1 && p3 > p2, `${p1}/${p2}/${p3}`)

    // die and restart: fast-forward drains via the DEV step rig, real key restarts
    await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__pinballTest.step(400) })
    await wait(400)
    const over = await page.evaluate(() => window.__pinballTest.state())
    ok('the game ends after the balls run out', over.done && over.screen === 'over', `screen=${over.screen}`)
    await page.keyboard.press('Space')
    await wait(400)
    const restart = await page.evaluate(() => window.__pinballTest.state())
    ok('SPACE restarts after game over', !restart.done && restart.balls === 3 && restart.screen === 'play', `screen=${restart.screen}`)

    ok('zero page errors through the whole drive', errors.length === 0, errors.join(';'))
} finally {
    await browser.close()
}
console.log(out.join('\n'))
const fails = out.filter((l) => l.startsWith('FAIL'))
console.log(`pinballplay: ${out.length - fails.length}/${out.length} checks passed${fails.length ? '  — ' + fails.length + ' FAILED' : '  — OK'}`)
process.exit(fails.length ? 1 : 0)
