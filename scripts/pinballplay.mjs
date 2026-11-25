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
    // #3237 kit memory: every run starts from a clean slate — the house-dress
    // expectation below and the memory pins at the tail both depend on it.
    const seedPage = await browser.newPage()
    await seedPage.goto(`${BASE}/pinball`)
    await seedPage.evaluate(() => localStorage.clear())
    await seedPage.close()

    const page = await openGame(browser, { url: `${BASE}/pinball?lite=1`, hook: '__pinballTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    ok('boots clean', errors.length === 0, errors.join(';'))

    // ---- #3237 ATTRACT SHOW-OFF: the row plays itself ----
    const dm0 = await page.evaluate(() => window.__pinballTest.demoState())
    await wait(700)
    const dm1 = await page.evaluate(() => window.__pinballTest.demoState())
    ok('the attract demo is driven — its sim clock runs while the row waits', dm1.tick > dm0.tick, `${dm0.tick}→${dm1.tick}`)
    ok('the demo launches its own ball (no player touched the keys)', dm1.launched === true, `launched=${dm1.launched} score=${dm1.score}`)
    // re-deal (cab switch) fires the lamp chase: bumper 3-2-1, lane ripple,
    // ramp pad, orbit pads, lock slam — poll the flash fields across ~2 s.
    await page.evaluate(() => { window.__pinballTest.setCab(1); window.__pinballTest.setCab(0) })
    const saw = { bump: 0, lane: 0, ramp: 0, arm: 0, lock: 0 }
    for (let i = 0; i < 40 && !(saw.bump && saw.lane && saw.ramp && saw.arm && saw.lock); i++) {
        const s = await page.evaluate(() => window.__pinballTest.demoState())
        if (s.lamps.bumpers.some((v) => v > 0)) saw.bump = 1
        if (s.lamps.lane.some((v) => v > 0)) saw.lane = 1
        if (s.lamps.ramp > 0) saw.ramp = 1
        if (s.lamps.orbitArm > 0) saw.arm = 1
        if (s.lamps.lock > 0) saw.lock = 1
        await wait(50)
    }
    ok('re-deal lamp chase ripples every lamp group (bumpers, lane, ramp, orbit pad, lock)',
        saw.bump === 1 && saw.lane === 1 && saw.ramp === 1 && saw.arm === 1 && saw.lock === 1, JSON.stringify(saw))
    // a dress flip names the kit on the attract DMD (#3259 owed, #3237 pays).
    await page.evaluate(() => window.__pinballTest.setSkin(1))
    const dmAnn = await page.evaluate(() => window.__pinballTest.demoState())
    ok('the dress names itself on the attract DMD (KIT TIDAL RUN)', dmAnn.dmd.text === 'KIT TIDAL RUN', `dmd="${dmAnn.dmd.text}"`)
    await page.evaluate(() => window.__pinballTest.setSkin(0))

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

    // #3304 SOLO bed live: single-ball play owns the bus, MULTIBALL takes it,
    // pack-off hands it back — the same seam pinballcheck pins in Node, proven
    // on real Chrome timing.
    const bed1 = await page.evaluate(() => window.__pinballTest.bed())
    ok('#3304 a solo run rides the SOLO bed (pinballSolo on the bus, law open)',
        bed1.track === 'pinballSolo' && bed1.solo > 0 && bed1.law > 0 && !bed1.mb,
        `track=${bed1.track} law=${bed1.law} solo=${bed1.solo}`)
    await page.evaluate(() => window.__pinballTest.devMb(true))
    let bed2 = null
    for (let i = 0; i < 20; i++) { await wait(100); bed2 = await page.evaluate(() => window.__pinballTest.bed()); if (bed2.mb) break }
    ok('#3304 MULTIBALL hands the bus to pinballMb @0.55 — solo releases it',
        !!bed2 && bed2.track === 'pinballMb' && bed2.mb === true && bed2.solo === 0 && Math.abs(bed2.level - 0.55) < 1e-9,
        `track=${bed2 && bed2.track} level=${bed2 && bed2.level} solo=${bed2 && bed2.solo}`)
    await page.evaluate(() => window.__pinballTest.devMb(false))
    let bed3 = null
    for (let i = 0; i < 20; i++) { await wait(100); bed3 = await page.evaluate(() => window.__pinballTest.bed()); if (bed3.track === 'pinballSolo') break }
    ok('#3304 pack-off: the SOLO bed takes the bus back (never strands on the mb track)',
        !!bed3 && bed3.track === 'pinballSolo' && bed3.solo > 0 && bed3.law > 0,
        `track=${bed3 && bed3.track} law=${bed3 && bed3.law} solo=${bed3 && bed3.solo}`)

    // #3313 item 1 seam glide, off the live bus: the bed DIPS before it swaps
    // and RISES after — a slope, not a splice. Sampled every 16 ms through the
    // seam (the contracheck #3052 pattern), so the record-skip shape can't hide.
    const busAt = () => page.evaluate(() => { const m = window.__audioMix(), b = window.__pinballTest.bed(); return { g: m && m.gain, t: b.track, s: b.seam, h: b.heat } })
    const bh = await busAt()
    ok('#3313 the heat tell rides the law (swell fraction = bed level over cap)',
        bh.t === 'pinballSolo' && bh.h > 0 && bh.h <= 1 && bh.g > 0.004,
        `heat=${bh.h} track=${bh.t} gain=${bh.g}`)
    await page.evaluate(() => window.__pinballTest.devMb(true))
    const s0 = await busAt()
    let swapIn = null, prev = s0, rise = 0
    for (let i = 0; i < 50 && !swapIn; i++) { const s = await busAt(); if (s.t === 'pinballMb') { swapIn = s; break } prev = s; await wait(16) }
    ok('#3313 the seam is reportable mid-glide (bed.seam counts down the dip, track still solo at the bottom)',
        (s0.s > 0 || prev.s > 0) && prev.t === 'pinballSolo', `seam@0=${s0.s} seam@last=${prev.s} track=${prev.t}`)
    for (let i = 0; i < 40; i++) { await wait(16); const s = await busAt(); rise = Math.max(rise, s.g || 0); if (rise >= 0.05) break }
    ok('#3313 pack arrival glides: the bus dips below half its pre-seam gain before the swap, then rises into the mb bed',
        !!swapIn && swapIn.g <= bh.g * 0.5 && rise >= 0.05,
        `pre=${bh.g} at-swap=${swapIn && swapIn.g} rise=${rise}`)
    await page.evaluate(() => window.__pinballTest.devMb(false))
    let swapOut = null, recover = 0
    for (let i = 0; i < 50 && !swapOut; i++) { await wait(16); const s = await busAt(); if (s.t === 'pinballSolo') swapOut = s }
    for (let i = 0; i < 40; i++) { await wait(16); const s = await busAt(); recover = Math.max(recover, s.g || 0); if (recover >= 0.008) break }
    ok('#3313 pack departure glides too: dip before the hand-back, and the solo bed is audible again after',
        !!swapOut && swapOut.g <= 0.044 && recover >= 0.008,
        `at-swap=${swapOut && swapOut.g} recover=${recover}`)

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
    // kbUsed, +100 on the run, KICKBACK announce (sim-owned state).
    // Readiness gate (#3237 run): earlier rigs (orbit/magnet) can spend this
    // ball's save before we get here — one save per ball is the RULE, so wait
    // for a fresh ball instead of blaming the device. Rig timing, not a game
    // change.
    for (let i = 0; i < 40; i++) {
        const s = await page.evaluate(() => window.__pinballTest.state())
        if (s.done) { await page.keyboard.press('Space'); await wait(400); continue }
        if (!s.kbUsed) break
        await wait(100)
    }
    const kbBefore = await page.evaluate(() => window.__pinballTest.state())
    await page.evaluate(() => window.__pinballTest.kbDrop())
    let kb = null
    let sawKbDmd = ''
    for (let i = 0; i < 20; i++) { await wait(100); kb = await page.evaluate(() => window.__pinballTest.state()); if (kb.dmd.text.includes('KICKBACK')) sawKbDmd = kb.dmd.text; if (kb.kbUsed) break }
    ok('KICKBACK: a fast right-column drain is saved live (kbUsed latches)', !!kb && kb.kbUsed === true, `kbUsed=${kb && kb.kbUsed}`)
    ok('the save pays +100 and announces KICKBACK on the DMD',
        !!kb && kb.score >= kbBefore.score + 100 && sawKbDmd.startsWith('KICKBACK! +100'),
        `${kbBefore.score}→${kb && kb.score} "${sawKbDmd || (kb && kb.dmd.text)}"`)

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
    const kitLine = await page.evaluate(() => document.body.innerText.includes('KIT MIDNIGHT'))
    ok('the results screen wears the kit line (#3237)', kitLine)
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
    // (#3284 re-cut the row to three narrower cards — EMBER's centre moved)
    const tap = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const r = c.getBoundingClientRect()
        return { x: r.left + (180 / 360) * r.width, y: r.top + (310 / 600) * r.height }
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

    // ---- #3259 ART KITS: B dresses the row, the dress survives retries ----
    const pxKit = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        // selected card, upper-center band: palette-dominated field above the
        // bumper glow and below the arc — the card is a LIVE demo view now
        // (#3237 show-off), so stay clear of the lamp cluster and ball paths.
        const d = c.getContext('2d').getImageData(60, 232, 40, 24).data
        let r = 0, g = 0, b = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
        return { r: r / n, g: g / n, b: b / n }
    })
    await ffToOver(page)
    await page.keyboard.press('ArrowLeft')
    await wait(250)
    const rowK = await page.evaluate(() => window.__pinballTest.state())
    ok('the row starts in the house dress', rowK.screen === 'attract' && rowK.skinId === 'midnight', `skin=${rowK && rowK.skinId}`)
    const pxMid = await pxKit()
    await page.keyboard.press('KeyB')
    await wait(300)
    const kitT = await page.evaluate(() => window.__pinballTest.state())
    ok('B dresses CABINET ONE in TIDAL RUN', kitT.skinId === 'tidal', `skin=${kitT.skinId}`)
    const pxTid = await pxKit()
    ok('the field really repaints under the kit (green up, red down)',
        pxTid.g > pxMid.g + 6 && pxTid.r < pxMid.r - 3,
        `mid r/g=${pxMid.r.toFixed(0)}/${pxMid.g.toFixed(0)} tid r/g=${pxTid.r.toFixed(0)}/${pxTid.g.toFixed(0)}`)
    await page.keyboard.press('KeyB')
    await wait(250)
    const kitN = await page.evaluate(() => window.__pinballTest.state())
    ok('the third kit NOIR rides the B cycle (#3237)', kitN.skinId === 'noir', `skin=${kitN.skinId}`)
    await page.keyboard.press('KeyB')
    await wait(250)
    const kitBack = await page.evaluate(() => window.__pinballTest.state())
    ok('B wraps back to the house dress', kitBack.skinId === 'midnight', `skin=${kitBack.skinId}`)
    await page.keyboard.press('KeyB')   // tidal again — start the game dressed
    await page.keyboard.press('Space')
    await wait(300)
    const kitPlay = await page.evaluate(() => window.__pinballTest.state())
    ok('SPACE starts in the chosen dress and the DMD announces it',
        kitPlay.screen === 'play' && kitPlay.skinId === 'tidal' && kitPlay.dmd.text === 'KIT TIDAL RUN',
        `skin=${kitPlay.skinId} dmd="${kitPlay.dmd.text}"`)
    await ffToOver(page)
    await page.keyboard.press('Space')
    await wait(300)
    const kitRetry = await page.evaluate(() => window.__pinballTest.state())
    ok('quick-retry keeps the chosen kit', kitRetry.screen === 'play' && kitRetry.skinId === 'tidal', `skin=${kitRetry.skinId}`)
    await ffToOver(page)
    await page.keyboard.press('ArrowRight')
    await wait(250)
    const rowE = await page.evaluate(() => window.__pinballTest.state())
    ok('kits are per cabinet — EMBER RIDER keeps its own dress',
        rowE.screen === 'attract' && rowE.skinId === 'ember', `skin=${rowE && rowE.skinId}`)
    await page.keyboard.press('KeyB')
    await wait(250)
    await page.keyboard.press('Space')
    await wait(300)
    const tox = await page.evaluate(() => window.__pinballTest.state())
    ok('EMBER RIDER plays dressed TOXIC and says so',
        tox.screen === 'play' && tox.cab === 'ember-rider' && tox.skinId === 'toxic' && tox.dmd.text === 'KIT TOXIC',
        `cab=${tox.cab} skin=${tox.skinId} dmd="${tox.dmd.text}"`)
    // pixels invert the ember law: on the toxic dress green dominates the field
    const tpx = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(20, 120, 320, 380).data
        let green = 0, red = 0
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 1] > d[i] + 20 && d[i + 1] > d[i + 2] + 20) green++
            else if (d[i] > d[i + 1] + 20 && d[i] > d[i + 2] + 20) red++
        }
        return { green, red }
    })
    ok('TOXIC pixels read green (the lime dress is really painted)', tpx.green > tpx.red * 2 && tpx.green > 300, `green=${tpx.green} red=${tpx.red}`)

    // ---- #3259 ?style URL override, on a fresh page ----
    const page2 = await openGame(browser, { url: `${BASE}/pinball?lite=1&style=tidalrun`, hook: '__pinballTest' })
    const stQ = await page2.evaluate(() => window.__pinballTest.state())
    ok('?style=tidalrun preselects the kit where it ships', stQ.skinId === 'tidal', `skin=${stQ.skinId}`)
    await page2.keyboard.press('ArrowRight')
    await wait(250)
    const stQ2 = await page2.evaluate(() => window.__pinballTest.state())
    ok('the URL style does not bleed to the other cabinet', stQ2.skinId === 'ember', `skin=${stQ2.skinId}`)
    await page2.keyboard.press('KeyB')
    await wait(250)
    const stQ3 = await page2.evaluate(() => window.__pinballTest.state())
    ok('B still cycles from a ?style preselect (override is a start-pick, not a lock)', stQ3.skinId === 'toxic', `skin=${stQ3.skinId}`)
    await page2.close()

    // ---- #3237 kit memory: survives reload, stale falls back, ?style rules ----
    const page3 = await openGame(browser, { url: `${BASE}/pinball?lite=1`, hook: '__pinballTest' })
    page3.on('pageerror', (e) => errors.push('page3: ' + e.message))
    await page3.evaluate(() => localStorage.setItem('retrogames.pinball.kits', JSON.stringify({ 'cabinet-one': 'noir' })))
    await page3.reload()
    await page3.waitForFunction('window.__game', { timeout: 20000 })
    await wait(300)
    const memA = await page3.evaluate(() => window.__pinballTest.state())
    ok('a remembered kit survives a reload (#3237 — the walk-away dress stays)', memA.skinId === 'noir', `skin=${memA.skinId}`)
    await page3.evaluate(() => window.__pinballTest.setSkin(0))
    await page3.reload()
    await page3.waitForFunction('window.__game', { timeout: 20000 })
    await wait(300)
    const memB = await page3.evaluate(() => window.__pinballTest.state())
    ok('the kit pick write-path persists (pick → reload → keeps it)', memB.skinId === 'midnight', `skin=${memB.skinId}`)
    await page3.evaluate(() => localStorage.setItem('retrogames.pinball.kits', JSON.stringify({ 'cabinet-one': 'retired-kit' })))
    await page3.reload()
    await page3.waitForFunction('window.__game', { timeout: 20000 })
    await wait(300)
    const memC = await page3.evaluate(() => window.__pinballTest.state())
    ok('a stale remembered kit falls back to the house dress', memC.skinId === 'midnight', `skin=${memC.skinId}`)
    await page3.evaluate(() => localStorage.setItem('retrogames.pinball.kits', JSON.stringify({ 'cabinet-one': 'noir' })))
    await page3.goto(`${BASE}/pinball?lite=1&style=tidalrun`)
    await page3.waitForFunction('window.__game', { timeout: 20000 })
    await wait(300)
    const memD = await page3.evaluate(() => window.__pinballTest.state())
    ok('?style outranks the remembered kit', memD.skinId === 'tidal', `skin=${memD.skinId}`)
    await page3.evaluate(() => localStorage.removeItem('retrogames.pinball.kits'))
    await page3.close()

    // ---- #3237 NO SUCH KIT: a URL style the picked cabinet doesn't ship ----
    const page4 = await openGame(browser, { url: `${BASE}/pinball?lite=1&style=toxic`, hook: '__pinballTest' })
    page4.on('pageerror', (e) => errors.push('page4: ' + e.message))
    const warn0 = await page4.evaluate(() => window.__pinballTest.demoState())
    ok('a ?style the picked cabinet lacks answers NO SUCH KIT on the attract DMD',
        warn0.dmd.text === 'NO SUCH KIT', `dmd="${warn0.dmd.text}"`)
    await page4.keyboard.press('Space')
    await wait(300)
    const warn1 = await page4.evaluate(() => window.__pinballTest.state())
    ok('the dress that cannot ship says NO SUCH KIT on the play DMD too', warn1.dmd.text === 'NO SUCH KIT', `dmd="${warn1.dmd.text}"`)
    await page4.close()

    ok('zero page errors through the whole drive', errors.length === 0, errors.join(';'))
} finally {
    await browser.close()
}
console.log(out.join('\n'))
const fails = out.filter((l) => l.startsWith('FAIL'))
console.log(`pinballplay: ${out.length - fails.length}/${out.length} checks passed${fails.length ? '  — ' + fails.length + ' FAILED' : '  — OK'}`)
process.exit(fails.length ? 1 : 0)
