// defenderplay — DEFENDER in Chrome driven by REAL key events only (#3443):
// the attract demo moves, a key starts the run, the smart bomb fires on a real
// Shift press (stock drops, the screen washes white in PIXELS, held ≠ stream),
// the HUD stock matches the sim, the WATCH seat never reaches for the bomb,
// and the crash law (#3445 INVERTED — grace burns honestly, so the second
// death lands too; pre-fix this drive pinned the immortality by name).
// Advisory verify tier — the deterministic gate is defendercheck in `static`.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.DEFENDER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/defender`
const r = new Report('defenderplay')
const HARD = setTimeout(() => { console.error('defenderplay: hard deadline — page wedged'); process.exit(1) }, 240000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__defenderTest' })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const probe = () => page.evaluate(() => window.__defenderTest.probe())
const settle = async (pred, ms = 5000) => {
    let best = null
    for (let t = 0; t < ms; t += 25) { best = await probe(); if (pred(best)) return best; await page.waitForTimeout(25) }
    return best
}
const simWait = async (ticks, budget = 8000) => {
    const t0 = (await probe()).tick
    return settle((p) => p.tick >= t0 + ticks, budget)
}
// average lightness of the canvas centre band (the flash washes the world, not
// the black scanner strip on top)
const brightness = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, Math.floor(c.height * 0.3), c.width, Math.floor(c.height * 0.4)).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 16) { sum += d[i] + d[i + 1] + d[i + 2]; n += 3 }
    return sum / n
})

{
    const a = await probe()
    r.check('attract mode is showing', a.screen === 'attract', a.screen)
    const b = await simWait(90)
    r.check('the attract demo is ALIVE (ticks advance)', b.tick > a.tick, `${a.tick} -> ${b.tick}`)
    r.check('stock readouts exist and start full', a.bombs === 3, `bombs=${a.bombs}`)
}

await page.keyboard.press('Enter')
let p = await settle((q) => q.screen === 'play')
r.check('any key starts the run', p.screen === 'play', p.screen)

// contract: the QA pad declares the bomb verb
const meta = await page.evaluate(() => (window.__game && window.__game.meta ? window.__game.meta.buttons : null))
r.check('the QA contract declares b (bots/replays can press the bomb)', !!meta && meta.includes('b'), JSON.stringify(meta))

// one real Shift press: stock drops and the screen washes white (pixels).
// A zero-delay press lands between rAF ticks and is never seen — hold it long
// enough for the loop to sample the pad, like a thumb would.
{
    const before = await probe()
    r.check('a fresh run carries 3 bombs', before.bombs === 3, `${before.bombs}`)
    await simWait(4)
    const calm = await brightness()
    await page.keyboard.down('Shift')
    await page.waitForTimeout(150)
    await page.keyboard.up('Shift')
    let flashSeen = false, flashPix = calm
    for (let t = 0; t < 500; t += 25) {
        flashPix = Math.max(flashPix, await brightness())
        if (flashPix > calm + 40) flashSeen = true
    }
    p = await settle((q) => q.bombs === before.bombs - 1)
    r.check('a REAL Shift press spends exactly one bomb', p.bombs === before.bombs - 1, `${before.bombs} -> ${p.bombs}`)
    r.check('the blast washes the canvas white in pixels', flashSeen, `calm=${calm.toFixed(1)} flash=${flashPix.toFixed(1)}`)
}

// held ≠ stream
{
    // #3456 s4 calibration: the ship idles during the earlier legs, and the
    // death window it can wander into suppresses presses (an honest law) —
    // fixed 120 ms waits made this leg a coin-flip on the attract route's
    // start position. Seat the patrol (Shift is not a takeover key, so the
    // stick stays busy flying its own evasions), wait for a healthy pilot,
    // land the edge on a HOLD while settled, and retry if a restock or a
    // death interrupts. A stream still fails identically: held ≠ 1 spent.
    let before = null, after = null
    await page.keyboard.press('y')
    for (let attempt = 0; attempt < 6 && after === null; attempt++) {
        const healthy = await settle((q) => q.screen === 'play' && q.lives > 1 && q.bombs > 0, 8000)
        if (healthy.screen !== 'play' || healthy.bombs < 1) continue
        before = healthy.bombs
        await page.keyboard.down('Shift')
        const consumed = await settle((q) => q.bombs !== before, 4000)
        await page.keyboard.up('Shift')
        if (consumed.bombs === before - 1 || consumed.bombs < before - 1) after = consumed.bombs
        else await page.waitForTimeout(300) // restock mid-leg — try again
    }
    r.check('HELD Shift spends one bomb, not a stream', after === before - 1, `${before} -> ${after}`)
    let again = null
    for (let attempt = 0; attempt < 6 && again === null; attempt++) {
        const healthy = await settle((q) => q.screen === 'play' && q.lives > 1 && q.bombs > 0, 8000)
        if (healthy.screen !== 'play' || healthy.bombs < 1) continue
        await page.keyboard.down('Shift')
        await page.waitForTimeout(150)
        await page.keyboard.up('Shift')
        const q = await settle((x) => x.bombs !== healthy.bombs, 4000)
        if (q.bombs === healthy.bombs - 1) again = q.bombs
        else await page.waitForTimeout(300) // suppressed or restocked mid-leg — try again
    }
    r.check('release + press fires again', again === (after ?? before) - 1, `${after ?? before} -> ${again}`)
}

// the WATCH seat refuses the bomb — the witness stays honest on real Chrome too
{
    const isWatching = () => page.evaluate(() => window.__defenderTest.watching())
    // the bomb legs above may leave the patrol seated — hand the stick back
    // first so this leg really tests the seat key, not a leftover state.
    if (await isWatching()) {
        await page.keyboard.press('y')
        for (let t = 0; t < 2000 && (await isWatching()); t += 50) await page.waitForTimeout(50)
    }
    await page.keyboard.press('y')
    let w = false
    for (let t = 0; t < 5000 && !w; t += 50) { w = await isWatching(); if (!w) await page.waitForTimeout(50) }
    r.check('Y seats the proven patrol', w)
    const before = (await probe()).bombs
    await simWait(180)
    const during = await probe()
    r.check('the patrol never presses the bomb (stock untouched)', during.bombs === before, `${before} -> ${during.bombs}`)
    await page.keyboard.press('ArrowLeft')
    r.check('a driving key takes the stick back from the patrol', !(await isWatching()))
}

// crash law (#3445 INVERTED exactly as promised): the grace burns every tick,
// so a held ArrowDown crashes the pilot AGAIN — second death lands, mortality
// restored. Pre-fix this leg asserted the OPPOSITE (no second death) to pin
// the immortality bug by name; flipping it here is the deliberate inversion,
// not a silent drift.
{
    // Fresh seeded run so the leg's lives ledger is honest (earlier legs are
    // mortal now too) and every budget below counts WORLD ticks.
    await page.evaluate(() => window.__game.reset(7))
    await page.waitForTimeout(200)
    await page.keyboard.down('ArrowDown')
    let first = null
    const tf0 = (await probe()).tick
    for (let i = 0; i < 400; i++) {
        first = await probe()
        if (first.lives < 3 || first.screen === 'over') break
        if (first.tick - tf0 > 400) break
        await page.waitForTimeout(150)
    }
    r.check('the pilot can genuinely crash — the first death lands', first.lives === 2, `lives=${first.lives}`)
    let secondDeath = false
    // The budget is WORLD ticks, not wall ms (AGENTS: harness waits are sim
    // time — this box once ran the world at ~5 tps under multi-lane load and
    // a 24 s wall ceiling watched the pilot respawn mid-blink and called it
    // grace). One honest cycle = freeze 30 + dark 60 + blink 120 + re-dive
    // ~60 ≈ 270 ticks; 700 covers two with margin.
    const t0 = (await probe()).tick
    for (let i = 0; i < 400; i++) {
        const q = await probe()
        if (q.lives < 2 || q.screen === 'over') { secondDeath = true; break }
        if (q.tick - t0 > 700) break
        await page.waitForTimeout(150)
    }
    await page.keyboard.up('ArrowDown')
    r.check('#3445 inverted: the grace burns — a SECOND crash lands, mortality restored', secondDeath, `lives=${(await probe()).lives}`)
    const after = await probe()
    r.check('a crashed run still plays on (world keeps turning)', after.screen === 'play', JSON.stringify({ screen: after.screen, bombs: after.bombs, humans: after.humans }))
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.join(' | '))

clearTimeout(HARD)
await r.exit(browser)
