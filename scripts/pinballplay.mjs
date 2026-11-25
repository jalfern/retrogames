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
// fast-forward the sim, then poll until the shell has actually drawn the
// game-over screen (a single RAF may lag a heavy synchronous block, and a
// lucky multiball + extra-ball game legitimately outlives one block).
const ffToOver = async (page, rounds = 20) => {
    let s = null
    for (let blk = 0; blk < 6; blk++) {
        await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__pinballTest.step(400) }, rounds)
        for (let i = 0; i < 20; i++) { await wait(100); s = await page.evaluate(() => window.__pinballTest.state()); if (s.done && s.screen === 'over') return s }
        console.log('FF-BLOCK', blk, JSON.stringify({ tick: s.tick, done: s.done, screen: s.screen, ball: s.ball, by: s.by, power: s.power }))
        // stuck-ball rescue lives in the SIM now (BALL SEARCH, sim.js): 20
        // world-seconds of a motionless ball drains it, so blocks converge.
    }
    return s
}
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

    // rung 3 rig: feed the climbing rail — the wrap pays ORBIT in the browser.
    // Re-feed while nothing lands: on a loaded box the RAF runs slower than
    // 60 fps, so a fixed wall-clock window is fewer world ticks; a second
    // feed is another genuine wrap attempt, never a lowered bar.
    await page.evaluate(() => window.__pinballTest.orbitFeed())
    let st = null
    for (let i = 0; i < 80; i++) {
        await wait(100); st = await page.evaluate(() => window.__pinballTest.state())
        if (st.orbits >= 1) break
        if (i % 15 === 14) await page.evaluate(() => window.__pinballTest.orbitFeed())
    }
    ok('ORBIT: the wrap completes live in Chrome', !!st && st.orbits >= 1, `orbits=${st && st.orbits}`)
    ok('the wrap announces itself on the sim-owned DMD state', !!st && st.dmd.text === 'ORBIT! +100', st && st.dmd.text)

    // rung 3 rig: the magnet grabs a drifting ball and holds it
    await page.evaluate(() => window.__pinballTest.magDrop())
    let mag = null
    for (let i = 0; i < 60; i++) { await wait(100); mag = await page.evaluate(() => window.__pinballTest.state()); if (mag.magHold > 0) break }
    ok('MAGNET: grabs and holds live (magHold > 0)', !!mag && mag.magHold > 0, `hold=${mag && mag.magHold}`)
    const held0 = await page.evaluate(() => window.__pinballTest.state())
    await wait(500)
    const held1 = await page.evaluate(() => window.__pinballTest.state())
    ok('the world clock keeps running during the hold', held1.tick > held0.tick, `${held0.tick}→${held1.tick}`)

    // #3250 rig: a fast drop down the right drain column gets SAVED — latched
    // kbUsed, +100 on the run, KICKBACK announce (sim-owned state)
    const kbBefore = await page.evaluate(() => window.__pinballTest.state())
    await page.evaluate(() => window.__pinballTest.kbDrop())
    let kb = null
    for (let i = 0; i < 20; i++) { await wait(100); kb = await page.evaluate(() => window.__pinballTest.state()); if (kb.kbUsed) break }
    ok('KICKBACK: a fast right-column drain is saved live (kbUsed latches)', !!kb && kb.kbUsed === true, `kbUsed=${kb && kb.kbUsed}`)
    ok('the save pays +100 and announces KICKBACK on the DMD',
        !!kb && kb.score >= kbBefore.score + 100 && kb.dmd.text === 'KICKBACK! +100',
        `${kbBefore.score}→${kb && kb.score} "${kb && kb.dmd.text}"`)

    // pixels: the playfield draws, and the DMD strip region lights up after an event
    // (announce fresh first — the idle crawl has blank scroll windows between words,
    // sampling blind was a standing flake)
    await page.evaluate(() => window.__pinballTest.laneDrop())
    let dmdLive = null
    for (let i = 0; i < 30; i++) { await wait(100); dmdLive = await page.evaluate(() => window.__pinballTest.state()); if (dmdLive.dmd.text) break }
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
    const over = await ffToOver(page);
    ok('the game ends after the balls run out', over.done && over.screen === 'over', `screen=${over.screen}`)
    await page.keyboard.press('Space')
    await wait(400)
    const restart = await page.evaluate(() => window.__pinballTest.state())
    ok('SPACE restarts after game over', !restart.done && restart.balls === 3 && restart.screen === 'play', `screen=${restart.screen}`)

    // ================= #3232: CABINET TWO "EMBER RIDER" live legs =================
    // finish the cab-one game, then from GAME OVER an arrow steps to the row…
    const row0 = await ffToOver(page);
    ok('cab one still dies clean before the switch legs', row0.done && row0.screen === 'over' && row0.cab === 'cabinet-one', `screen=${row0.screen} cab=${row0.cab}`)
    await page.keyboard.press('ArrowLeft')
    await wait(300)
    const row = await page.evaluate(() => window.__pinballTest.state())
    ok('arrows at GAME OVER step back to the row of cabinets', row.screen === 'attract', `screen=${row.screen}`)

    // …a real tap on the second card picks AND starts it (phone path, one input)
    const tap = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const r = c.getBoundingClientRect()
        return { x: r.left + (267 / 360) * r.width, y: r.top + (335 / 600) * r.height }
    })
    await page.mouse.click(tap.x, tap.y)
    await wait(400)
    const ember = await page.evaluate(() => window.__pinballTest.state())
    ok('tapping the EMBER RIDER card picks it and starts it in one input',
        ember.screen === 'play' && ember.cab === 'ember-rider', `screen=${ember.screen} cab=${ember.cab}`)

    // left-lane plunger is live (hold + release, real keys)
    await page.keyboard.down('Space')
    await wait(700)
    const emberHeld = await page.evaluate(() => window.__pinballTest.state())
    await page.keyboard.up('Space')
    await wait(300)
    const emberFly = await page.evaluate(() => window.__pinballTest.state())
    ok('ember: hold-and-release Space fires the LEFT-lane plunger',
        emberHeld.power > 0.1 && emberFly.launched, `power=${emberHeld.power.toFixed(2)} launched=${emberFly.launched}`)

    // firelane rig on the left flank: a lane drop rolls down and the tower takes it
    await page.evaluate(() => window.__pinballTest.laneDrop())
    let el = null
    for (let i = 0; i < 40; i++) { await wait(100); el = await page.evaluate(() => window.__pinballTest.state()); if (el.locks >= 1) break }
    ok('ember: a firelane drop rolls the LEFT lane and the tower locks it', !!el && el.locks >= 1, `locks=${el && el.locks}`)

    // magnet rig at (120,350) + orbit wrap on the right rail, paying ember prices
    await page.evaluate(() => window.__pinballTest.magDrop())
    let emag = null
    for (let i = 0; i < 30; i++) { await wait(100); emag = await page.evaluate(() => window.__pinballTest.state()); if (emag.magHold > 0) break }
    ok('ember: the magnet grabs and holds live', !!emag && emag.magHold > 0, `hold=${emag && emag.magHold}`)
    await wait(1500)   // let the hold expire (72 ticks) before the wrap feed
    let eorb = null
    for (let round = 0; round < 3 && !(eorb && eorb.orbits >= 1); round++) {
        await page.evaluate(() => window.__pinballTest.orbitFeed())
        for (let i = 0; i < 40; i++) { await wait(100); eorb = await page.evaluate(() => window.__pinballTest.state()); if (eorb.orbits >= 1) break }
    }
    ok('ember: the mirrored wrap completes live in Chrome', !!eorb && eorb.orbits >= 1, `orbits=${eorb && eorb.orbits}`)
    ok('ember prices show on the strip live ("ORBIT! +150")', !!eorb && eorb.dmd.text === 'ORBIT! +150', eorb && eorb.dmd.text)

    // #3250 rig: ember's mirrored kickback saves its LEFT column for its own price
    const ekbBefore = await page.evaluate(() => window.__pinballTest.state())
    await page.evaluate(() => window.__pinballTest.kbDrop())
    let ekb = null
    for (let i = 0; i < 20; i++) { await wait(100); ekb = await page.evaluate(() => window.__pinballTest.state()); if (ekb.kbUsed) break }
    ok('ember: the mirrored kickback saves its LEFT column live', !!ekb && ekb.kbUsed === true, `kbUsed=${ekb && ekb.kbUsed}`)
    ok('ember kickback pays its own 75 and announces KICKBACK! +75',
        !!ekb && ekb.score >= ekbBefore.score + 75 && ekb.dmd.text === 'KICKBACK! +75',
        `${ekbBefore.score}→${ekb && ekb.score} "${ekb && ekb.dmd.text}"`)

    // pixels: the ember palette rules this field — warm dominates (cab one is blue-dominant)
    const epx = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const g = c.getContext('2d')
        const d = g.getImageData(20, 120, 320, 380).data
        let warm = 0, cold = 0, lit = 0
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] + d[i + 1] + d[i + 2] > 150) lit++
            if (d[i] > d[i + 2] + 24) warm++
            else if (d[i + 2] > d[i] + 24) cold++
        }
        return { warm, cold, lit }
    })
    ok('ember pixels read warm (the oxblood/gold skin is really painted)', epx.warm > epx.cold * 3 && epx.lit > 500, `warm=${epx.warm} cold=${epx.cold} lit=${epx.lit}`)

    // die on ember, then SPACE quick-retries the SAME cabinet (selection persists)
    const eover = await ffToOver(page, 45);
    ok('ember game ends after the balls run out', eover.done && eover.screen === 'over', `screen=${eover.screen}`)
    await page.keyboard.press('Space')
    await wait(400)
    const erestart = await page.evaluate(() => window.__pinballTest.state())
    ok('SPACE quick-retries on the SAME cabinet (ember persists)',
        !erestart.done && erestart.screen === 'play' && erestart.cab === 'ember-rider', `cab=${erestart.cab}`)
    // and the first cabinet is reachable again from the row
    await ffToOver(page);
    await page.keyboard.press('ArrowLeft')
    await wait(250)
    const row2 = await page.evaluate(() => window.__pinballTest.state())
    await page.keyboard.press('Space')
    await wait(400)
    const backOne = await page.evaluate(() => window.__pinballTest.state())
    ok('the row switches back to CABINET ONE and starts it', row2.screen === 'attract' && backOne.cab === 'cabinet-one', `cab=${backOne.cab}`)

    ok('zero page errors through the whole drive', errors.length === 0, errors.join(';'))
} finally {
    await browser.close()
}
console.log(out.join('\n'))
const fails = out.filter((l) => l.startsWith('FAIL'))
console.log(`pinballplay: ${out.length - fails.length}/${out.length} checks passed${fails.length ? '  — ' + fails.length + ' FAILED' : '  — OK'}`)
process.exit(fails.length ? 1 : 0)
