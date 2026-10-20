// qbertdive — Q*BERT driven by REAL key events in a real browser: the drawn
// bird must be where the sim says it is, a real arrow-pair hop flips a real
// cube, the snake eats you, three honest falls end the run and Enter restarts
// clean. Every wait is in WORLD ticks (q.tick), never wall time (the
// heistclock law), and probe+pixel-read happen inside ONE evaluate so a CDP
// roundtrip cannot audit yesterday's coordinates. Advisory verify tier, like
// joustdive — the deterministic gate is qbertcheck in `static`.

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.QBERT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/qbert`

const r = new Report('qbertdive')
const HARD_DEADLINE = setTimeout(() => { console.error('qbertdive: hard deadline hit — the page wedged'); process.exit(1) }, 180000)
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__qbertTest' })

const probe = () => page.evaluate(() => window.__qbertTest.probe())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const settle = async (pred, ms = 3000) => {
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
    r.check('the attract demo is ALIVE (world ticks, hash moves, cubes flip)', b.tick > a.tick && b.hash !== a.hash, `${a.hash} -> ${b.hash}`)
}

// ------------------------------------------------------------ start + hop ----
await page.keyboard.press('KeyQ')
let q = await settle((p) => p.screen === 'play')
r.check('any key starts the round', q.screen === 'play', q.screen)
{
    // at the apex the up-diagonals are reserved for the disc attempt — the
    // way off the top is DOWN+LEFT (fidelity, not a driver bug)
    const before = await probe()
    await page.keyboard.down('ArrowDown')
    await page.keyboard.down('ArrowLeft')
    q = await settle((p) => p.hop || (p.r !== before.r || p.c !== before.c), 2000)
    const hopped = q.hop || q.r !== before.r
    await page.keyboard.up('ArrowLeft')
    await page.keyboard.up('ArrowDown')
    r.check('a real DOWN+LEFT key pair launches a diagonal hop', hopped, `@${before.r},${before.c} -> @${q.r},${q.c}`)
    q = await settle((p) => !p.hop, 2000)
    r.check('the hop lands on (1,0) and flips it green', q.r === 1 && q.c === 0 && q.cubes[1] === '1' && q.flips === before.flips + 1, `@${q.r},${q.c} flips=${q.flips}`)
}

// ------------------------------------------------ the drawn bird is lit ----
{
    const litNow = () => page.evaluate(() => {
        const q = window.__qbertTest.probe()
        const cv = document.querySelector('canvas[data-qbert-stage]')
        const g = cv.getContext('2d')
        const d = g.getImageData(Math.max(0, q.px - 9), Math.max(0, q.py - 16), 18, 22).data
        let lit = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 240) lit++
        return { lit, px: q.px, py: q.py }
    })
    let best = { lit: -1 }
    for (let i = 0; i < 12; i++) {
        const s1 = await litNow()
        if (s1.lit > best.lit) best = s1
        if (best.lit > 24) break
        await page.waitForTimeout(100)
    }
    r.check('pixels are lit where the sim says Q*BERT is', best.lit > 24, `${best.lit} lit px at ${best.px},${best.py}`)
}

// ---------------------------------------------------- snake eats, falls, over ----
{
    const lives0 = q.lives
    await page.evaluate(() => window.__qbertTest.placeSnake(3, 1))
    q = await settle((p) => p.dying > 0 || p.lives < lives0, 6000)
    r.check('a dropped Coily hunts down and eats the standing bird (real death, not scripted)', q.dying > 0 || q.lives < lives0, `lives ${lives0} -> ${q.lives} dying=${q.dying}`)
    const balloon = await settle((p) => p.balloon === '@!#?@!' && p.dying > 0, 2000)
    r.check('the @!#?@! balloon rides the death', balloon.balloon === '@!#?@!', String(balloon.balloon))
    await page.evaluate(() => window.__qbertTest.calm())
    await simWait(90)
    q = await probe()
    r.check('after the death the bird sits at the apex with one life spent', q.r === 0 && q.c === 0 && q.lives === lives0 - 1, `@${q.r},${q.c} lives=${q.lives}`)
}
{
    // 2P: P1's remaining lives burn on honest falls; the LAST one hands the
    // turn to P2 (fresh at the apex, P2's own 3 lives) rather than ending the
    // run — only when BOTH players are out does it go to GAME OVER.
    const lives0 = q.lives    // P1's remaining lives (2, after the snake death)
    for (let i = 0; i < lives0; i++) {
        await settle((p) => p.dying === 0 && p.screen === 'play', 3000)
        await page.evaluate(() => window.__qbertTest.place(5, 5))
        await page.keyboard.down('ArrowDown')
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(120)
        await page.keyboard.up('ArrowRight')
        await page.keyboard.up('ArrowDown')
        await settle((p) => p.dying === 0 && p.screen === 'play', 4000)
    }
    q = await settle((p) => p.active === 1 && p.r === 0 && p.c === 0, 3000)
    r.check('P1 out of lives hands the turn to P2 (active=1, fresh at the apex, P2 at 3 lives)',
        q.active === 1 && q.r === 0 && q.c === 0 && q.lives === 3,
        JSON.stringify({ a: q.active, r: q.r, c: q.c, lives: q.lives }))
    const p2lives = q.lives
    for (let i = 0; i < p2lives; i++) {
        await settle((p) => p.dying === 0 && p.screen === 'play', 3000)
        await page.evaluate(() => window.__qbertTest.place(5, 5))
        await page.keyboard.down('ArrowDown')
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(120)
        await page.keyboard.up('ArrowRight')
        await page.keyboard.up('ArrowDown')
        await settle((p) => p.dying === 0 || p.screen === 'over', 4000)
    }
    q = await settle((p) => p.screen === 'over', 4000)
    r.check('GAME OVER only once BOTH players are out of lives', q.screen === 'over', q.screen)
}
await page.waitForTimeout(1000)
await page.keyboard.press('Enter')
q = await settle((p) => p.screen === 'play', 3000)
r.check('Enter restarts clean (P1 active, scores zeroed, round 1, both back to 3 lives)',
    q.screen === 'play' && q.active === 0 && q.score === 0 && q.level === 1 && q.lives === 3 && q.players[1].score === 0 && q.players[1].lives === 3,
    JSON.stringify({ s: q.screen, a: q.active, sc: q.score, l: q.lives, p2: q.players[1] }))

// ------------------------------------------------------------- disc ride ----
{
    await page.evaluate(() => window.__qbertTest.placeDisc(128))
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('ArrowLeft')
    q = await settle((p) => p.ride, 1500)
    await page.keyboard.up('ArrowLeft')
    await page.keyboard.up('ArrowUp')
    r.check('the apex up-hop boards the disc the moment it crosses', !!q.ride, `ride=${q.ride}`)
    q = await settle((p) => !p.ride && !p.hop, 3000)
    // the drop's contract is "back on a valid cube" — the original lands a
    // random row across the whole pyramid, and landing on a snake is a
    // legitimate death, so only the on-board invariant is asserted here.
    const ROWLEN = [1, 2, 3, 4, 5, 6, 4, 3]
    r.check('the disc delivers the bird back onto the pyramid (a valid cube)', q.r >= 0 && q.r < ROWLEN.length && q.c >= 0 && q.c < ROWLEN[q.r], `landed @${q.r},${q.c}`)
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.join(' | '))
r.exit(browser)
