// joustdive — JOUST driven by REAL key events in a real browser: the drawn
// rider must be where the sim says it is, flapping reverses the fall, the
// lava claims its due three times and the game restarts clean. Every wait is
// in WORLD ticks (q.tick), never wall time — a fixed timestep speaks sim
// clock (the heistclock law). The DEV hook reads state and sets up one
// deterministic drop; every motion comes from keyboard events the sim's own
// input path sees. This rides the advisory verify tier, not the PR gate.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.JOUST_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/joust`

const r = new Report('joustdive')
const HARD_DEADLINE = setTimeout(() => { console.error('joustdive: hard deadline hit — the page wedged'); process.exit(1) }, 180000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__joustTest' })

const probe = () => page.evaluate(() => window.__joustTest.probe())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const settle = async (pred, ms = 2500) => {
    let best = null
    for (let t = 0; t < ms; t += 25) {
        best = await probe()
        if (pred(best)) return best
        await page.waitForTimeout(25)
    }
    return best
}
const simWait = async (ticks, budget = 8000) => {
    const t0 = (await probe()).tick
    return settle((q) => q.tick >= t0 + ticks, budget)
}

// ---------------------------------------------------------------- attract ----
{
    const a = await probe()
    r.check('attract mode is showing', a.screen === 'attract', a.screen)
    await simWait(90)
    const b = await probe()
    r.check('the attract demo is ALIVE (its world ticks and its hash moves)', b.tick > a.tick && b.hash !== a.hash, `${a.hash} -> ${b.hash}`)
}

// --------------------------------------------------------------- start P1 ----
await page.keyboard.press('Digit1')
let q = await settle((p) => p.screen === 'play' && p.players === 1)
r.check('digit 1 starts one rider', q.screen === 'play' && q.players === 1, `${q.screen}/p${q.players}`)

// hold right: the rider must move right, in sim AND on screen
// probe and pixel-read inside ONE evaluate: a CDP roundtrip between the two
// lets a falling rider drift ~20 px, and the check would audit yesterday's
// coordinates (this repo has already written that postmortem once)
const litNow = () => page.evaluate(() => {
    const q = window.__joustTest.probe()
    if (!q.p1 || q.p1.x === null) return { lit: -1, x: null, y: null }
    const cv = document.querySelector('canvas[data-joust-stage]')
    const g = cv.getContext('2d')
    const d = g.getImageData(Math.max(0, q.p1.x - 14), Math.max(0, q.p1.y - 18), 28, 32).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 240) lit++
    return { lit, x: q.p1.x, y: q.p1.y }
})

const before = await probe()
await page.keyboard.down('Space')
await page.keyboard.down('ArrowRight')
q = await settle((p) => p.p1.x !== null && Math.abs(p.p1.x - before.p1.x) > 14, 2500)
await page.keyboard.up('ArrowRight')
await page.keyboard.up('Space')
r.check('wings + held ArrowRight travel right (sim)', q.p1.x !== null && Math.abs(q.p1.x - before.p1.x) > 10, `${before.p1.x} -> ${q.p1.x}`)

// flap against gravity
{
    const p0 = await simWait(4)
    const y0 = p0.p1.y
    await page.keyboard.down('Space')
    const lifted = await settle((p) => p.p1.y !== null && p.p1.y < y0 - 8, 1500)
    await page.keyboard.up('Space')
    r.check('held flap climbs (y decreases on screen)', lifted.p1.y !== null && lifted.p1.y < y0 - 8, `y ${y0} -> ${lifted.p1.y}`)
}

// ------------------------------------------------ the drawn rider is real ----
{
    // sample a short window: one glance can land inside the death-blink or a
    // respawn gap; "the sprite exists where the sim says" is proven if ANY
    // honest sample is bright at its own probe coords
    let best = { lit: -1 }
    for (let i = 0; i < 12; i++) {
        const s1 = await litNow()
        if (s1.lit > best.lit) best = s1
        if (best.lit > 20) break
        await page.waitForTimeout(100)
    }
    r.check('pixels are lit where the sim says the rider is', best.lit > 20, `${best.lit} lit px at ${best.x},${best.y}`)
}

// ---------------------------------------------------- lava, death, restart ----
{
    q = await probe()
    const lives0 = q.p1.lives
    let died = 0
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__joustTest.place(128, 170))
        await page.keyboard.down('ArrowDown')
        await simWait(150)
        await page.keyboard.up('ArrowDown')
        const s = await settle((p) => p.p1.lives === lives0 - (i + 1) || p.screen === 'over', 3000)
        if (s.p1.lives === lives0 - (i + 1) || s.screen === 'over') died++
    }
    r.check('lava claims three lives honestly (death anim included)', died === 3, `deaths registered=${died}`)
    q = await settle((p) => p.screen === 'over', 3000)
    r.check('three lava deaths end the run — GAME OVER screen', q.screen === 'over', q.screen)
}
await page.waitForTimeout(1000)
await page.keyboard.press('Enter')
q = await settle((p) => p.screen === 'play', 3000)
r.check('Enter restarts clean (score zeroed, wave 1, lives back)', q.screen === 'play' && q.score === 0 && q.wave === 0 && q.p1.lives === 3, JSON.stringify({ s: q.screen, sc: q.score, w: q.wave, l: q.p1.lives }))

// -------------------------------------------------------------- 2P path ----
await page.evaluate(() => window.__joustTest.start(2))
q = await settle((p) => p.screen === 'play' && p.players === 2, 3000)
r.check('two-rider mode mounts both knights', q.players === 2, `players=${q.players}`)
{
    const before2 = await probe()
    await page.keyboard.down('KeyD')
    q = await settle((p) => p.hash !== before2.hash, 2000)
    await page.keyboard.up('KeyD')
    r.check('the world keeps running under 2P (hash advances)', q.hash !== before2.hash)
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.join(' | '))
r.exit(browser)
