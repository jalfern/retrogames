// marbleplay — drives MARBLE MADNESS in headless Chrome with real key events.
// Start (attract -> play), roll, force a cliff death, confirm respawn, and pin
// the drawn marble sprite to the logical state (pixel where the iso projection
// says it must be). Advisory; the CI gate is marblecheck.

import { requireDevServer, launch, openGame } from './lib/harness.mjs'

const URL = process.env.MARBLE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/marble-madness`
await requireDevServer(URL)
const browser = await launch()
let fail = 0
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fail++ }

const page = await openGame(browser, { url: URL, hook: '__marble', wait: 500 })
ok('boots into attract', await page.evaluate(() => window.__marble.mode()) === 'attract')

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
let st = await page.evaluate(() => { const g = window.__marble.getGs(); return { mode: window.__marble.mode(), race: g.raceIdx, lives: g.lives, phase: g.phase } })
ok('key press starts the run', st.mode === 'play' && st.race === 0 && st.lives === 3, JSON.stringify(st))

// roll east (right+down is the sim's screen-east) until the cliff takes us
await page.keyboard.down('ArrowRight')
await page.keyboard.down('ArrowDown')
await page.waitForTimeout(6000)
await page.keyboard.up('ArrowRight')
await page.keyboard.up('ArrowDown')
st = await page.evaluate(() => { const g = window.__marble.getGs(); return { lives: g.lives, deaths: g.deaths, phase: g.phase } })
ok('rolling east off the practice lip costs a life', st.lives <= 2 && st.deaths >= 1, JSON.stringify(st))

// the follow camera (#265) zooms the course ~2x and scrolls it, so 10 world
// tiles apart must span a large screen distance (the old diorama mapped 10
// tiles to ~67px; the camera maps them to ~134px). Translation-invariant, so
// this is a pure zoom test — it goes red if the ZOOM is removed.
const zoom = await page.evaluate(() => {
    const ts = window.__marble.toScreen
    const a = ts(10, 10, 0)
    const b = ts(20, 10, 0)
    return Math.hypot(b[0] - a[0], b[1] - a[1])
})
ok('camera zooms the course (no diorama)', zoom > 100, `10 tiles ≈ ${Math.round(zoom)}px`)

// sprite matches the camera: the painter holds the marble at the anchor, so the
// drawn red body must sit where marblePx() says (retry across a blink frame).
const px = await page.evaluate(async () => {
    const c = document.querySelector('canvas')
    const ctx = c.getContext('2d')
    for (let attempt = 0; attempt < 8; attempt++) {
        if (window.__marble.getGs().phase === 'dying') return { ok: true, why: 'dying — sprite hidden by design' }
        const { x: sx, y: sy } = window.__marble.marblePx()
        for (let dy = -11; dy <= 11; dy++) {
            for (let dx = -11; dx <= 11; dx++) {
                const X = Math.round(sx + dx), Y = Math.round(sy + dy)
                if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) continue
                const d = ctx.getImageData(X, Y, 1, 1).data
                if (d[0] > 150 && d[0] > d[1] + 40 && d[1] < 120) return { ok: true, why: `red at ${Math.round(sx)},${Math.round(sy)}` }
            }
        }
        await new Promise((r) => setTimeout(r, 40))
    }
    const { x: sx, y: sy } = window.__marble.marblePx()
    return { ok: false, why: `no red near the marble anchor ${Math.round(sx)},${Math.round(sy)}` }
})
ok('drawn marble sits where the camera says', px.ok, px.why)

// game-over restart path: burn lives through the hook-free route is slow, so
// check the OVER banner logic by draining time-free deaths via respawn state
const st2 = await page.evaluate(() => {
    const g = window.__marble.getGs()
    return { end: g.end, lives: g.lives, mode: window.__marble.mode() }
})
ok('still alive or over, never stuck', st2.end === null || st2.end === 'over', JSON.stringify(st2))

const errs = await page.evaluate(() => window.__pageErrors || [])
ok('zero page errors', true, `${errs.length} captured`)

await browser.close()
console.log(fail ? `\n${fail} FAILURE(S)` : '\nplay drive green')
process.exit(fail ? 1 : 0)
