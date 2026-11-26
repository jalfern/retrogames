// defenderplay — DEFENDER in Chrome driven by REAL key events only (#3443):
// the attract demo moves, a key starts the run, the smart bomb fires on a real
// Shift press (stock drops, the screen washes white in PIXELS, held ≠ stream),
// the HUD stock matches the sim, the WATCH seat never reaches for the bomb,
// and the crash law is pinned on both sides — first death lands, and the
// second one does NOT (#3445: grace freezes; the fix must invert that pin).
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
    const before = (await probe()).bombs
    await page.keyboard.down('Shift')
    await page.waitForTimeout(500)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(120)
    const after = (await probe()).bombs
    r.check('HELD Shift spends one bomb, not a stream', after === before - 1, `${before} -> ${after}`)
    await page.keyboard.down('Shift')
    await page.waitForTimeout(150)
    await page.keyboard.up('Shift')
    await settle((q) => q.bombs === after - 1)
    const again = (await probe()).bombs
    r.check('release + press fires again', again === after - 1, `${after} -> ${again}`)
}

// the WATCH seat refuses the bomb — the witness stays honest on real Chrome too
{
    const isWatching = () => page.evaluate(() => window.__defenderTest.watching())
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

// crash law. KNOWN #3445: the respawn grace never burns below 120, so the
// first crash makes the pilot immortal and GAME OVER is unreachable on today's
// build. These pins assert BOTH sides — the crash works, and the second death
// does NOT — so when QA fixes #3445 this drive goes red LOUDLY and the pins
// invert on purpose, never silently.
{
    await page.keyboard.down('ArrowDown')
    const dead = await settle((q) => q.lives < 3, 10000)
    r.check('the pilot can genuinely crash — the first death lands', dead.lives === 2, `lives=${dead.lives}`)
    let secondDeath = false
    for (let t = 0; t < 12000; t += 250) { const q = await probe(); if (q.lives < 2 || q.screen === 'over') { secondDeath = true; break } }
    await page.keyboard.up('ArrowDown')
    r.check('#3445 pinned: no second death — grace freezes, GAME OVER unreachable on this build', !secondDeath, 'the fix for #3445 must INVERT this pin')
    const after = await probe()
    r.check('a crashed run still plays on (world keeps turning)', after.screen === 'play', JSON.stringify({ screen: after.screen, bombs: after.bombs, humans: after.humans }))
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.join(' | '))

clearTimeout(HARD)
await r.exit(browser)
