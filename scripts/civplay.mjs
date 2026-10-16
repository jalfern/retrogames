// CIVILIZATION V — Chrome drives the founding with real key/pointer events, and
// grades the claims the Node harness cannot see:
//
//   npm run civplay     (needs `npm run dev`)
//
//   1. THE ATTRACT IS A FOUNDING — the tilted hex world paints (not black) and
//      rival capitals rise on their own (the autopilot, live).
//   2. THE INPUT PATH — a key starts the run; E settles your capital (the
//      sim's capitalSize ticks 0 -> 1) and a real Space ends a turn.
//   3. THE WORLD RESPONDS — the capital grows on end turns; the canvas keeps
//      rendering (never black) the whole time, zero page errors.
//   4. THE WIN SCREEN AND RETURN — the autopilot reaches the milestone and one
//      key rides back to attract.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.CIV_URL || 'http://localhost:5173/retrogames/civilization-v'
await requireDevServer(URL)

const r = new Report('civplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const wait = (ms) => page.waitForTimeout(ms)
await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!window.__civTest)) break; await wait(200) }
r.check('the __civTest hook is live', await page.evaluate(() => !!window.__civTest))

const probe = async () => { for (let i = 0; i < 40; i++) { const p = await page.evaluate(() => window.__civTest ? window.__civTest.probe() : null); if (p && typeof p.turn === 'number') return p; await wait(60) } throw new Error('__civTest vanished') }
const centerPx = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return null
    const px = new Uint8Array(4)
    gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height * 0.35), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return [px[0], px[1], px[2]]
})
const brightScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return null
    let best = [0, 0, 0]
    const px = new Uint8Array(4)
    for (let fy = 0.2; fy <= 0.85; fy += 0.15) for (let fx = 0.2; fx <= 0.8; fx += 0.12) {
        gl.readPixels(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        if (px[0] + px[1] + px[2] > best[0] + best[1] + best[2]) best = [px[0], px[1], px[2]]
    }
    return best
})

// 1 — attract renders and the AI is founding on its own
await wait(3500)
let s = await probe()
r.check('attract mode is showing', s && s.screen === 'attract')
const c1 = await centerPx()
r.check(`attract canvas is not black (centre rgb ${c1})`, c1 && (c1[0] + c1[1] + c1[2]) > 24)
let aiFound = false
for (let i = 0; i < 40 && !aiFound; i++) { await wait(700); aiFound = (await probe()).totalCities > 1 }
r.check('the attract world is a CIVILISING map (capitals rise unprompted)', aiFound)

// 2 — a key starts play; E settles your capital (state: capitalSize 0 -> 1)
await page.keyboard.press('Enter')
await wait(500)
s = await probe()
r.check('a key starts the game', s && s.screen === 'play')
r.check('you begin with a settler selected and no city', s.capitalSize === 0 && s.units0.some((u) => u.kind === 'SETTLER'))
await page.keyboard.press('KeyE')
await wait(300)
s = await probe()
r.check(`E settles your capital (capitalSize ${s.capitalSize}, playerCities ${s.playerCities})`, s.capitalSize >= 1 && s.playerCities >= 1)

// 3 — real Space ends turns; the capital grows; canvas stays lit
const turn0 = s.turn
await page.keyboard.press('Space')
await wait(250)
r.check(`Space ends a turn (turn ${turn0} -> ${(await probe()).turn})`, (await probe()).turn > turn0)
let grew = false
for (let i = 0; i < 24 && !grew; i++) { await page.keyboard.press('Space'); await wait(160); const p = await probe(); if (p.capitalSize >= 2) { grew = true; break } if (p.end) break }
r.check(`the capital grows on end turns (size ${(await probe()).capitalSize})`, grew)
const mid = await brightScan()
r.check(`the world is still rendering mid-game (brightest sample rgb ${mid})`, mid && (mid[0] + mid[1] + mid[2]) > 40)

// 4 — drive the same autopilot to the milestone on THIS run, then the end screen
let won = null
for (let i = 0; i < 12; i++) { won = await page.evaluate(() => window.__civTest.auto(40)); if (won.end) break }
r.check(`the autopilot wins THIS run (end=${won.end} size=${won.size} turn=${won.turns})`, won.end === 'win' && won.size >= 4)
await wait(1300)
s = await probe()
r.check('the end screen shows (screen=over)', s && s.screen === 'over')
await wait(500)
await page.keyboard.press('Space')
await wait(400)
r.check('one key returns to attract', (await probe()).screen === 'attract')

const clean = errors.filter((e) => !/favicon|Download the React DevTools|WebGL|GPU stall|Automatic fallback|SwiftShader/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
