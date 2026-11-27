// pacprogressiondrive (#3661) — real Chrome, real keys: the arcade-progression
// ladder on the live page. pacmancheck owns the rule tables; this proves the
// browser half, the mcsaucerdrive way: a human start sits the ladder at
// round 1/stage 0, real steering eats real dots, the HUD paints the round's
// fruit (round 1 = cherry red, NO blue), the DebugKit ladder rides the live
// board (Next round ×4 paints the blue galaxian icon — the same drawFruit the
// drop sprite uses; Score → 5000 pushes the probe to stage 3; Round → 14
// paints the gold key), a forced game over + a real key restarts the climb,
// and zero page errors through the whole run. Advisory under #737; the Node
// gate carries the rules.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/pacman`
const rep = new Report('pacprogressiondrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=7`, hook: '__pacTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = () => page.evaluate(() => window.__pacTest.probe())

// scan a box around the HUD round-icon (canvas screen-space coords mirrored
// from index.jsx: hudLeft/hudBottom in CSS px) for colour families
const iconCols = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const viewWidth = rect.width, viewHeight = rect.height
    const mapWidth = 28 * 16, mapHeight = 31 * 16
    const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.95
    const hudLeft = (viewWidth - mapWidth * scale) / 2
    const hudY = (viewHeight - mapHeight * scale) / 2
    const px = Math.round((hudLeft + 78) * dpr)
    const py = Math.round((hudY + mapHeight * scale + 14) * dpr)
    const R = Math.round(9 * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    const seen = { red: 0, blue: 0, gold: 0 }
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (r > 180 && g < 90 && b < 90) seen.red++            // cherry/strawberry
        else if (b > 150 && r < 130) seen.blue++                // galaxian wings
        else if (r > 180 && g > 140 && b < 130) seen.gold++     // bell / key
    }
    return seen
})

// 1 — human start: the ladder sits at its floor
await page.keyboard.press('ArrowLeft')
await sleep(300)
let s = await probe()
rep.check('human start: round 1, stage 0, live board',
    !!s && s.round === 1 && s.stage === 0 && !s.done, JSON.stringify({ round: s?.round, stage: s?.stage }))
rep.check('stage-1 baseline speed on the live sim', s.pac.speed === 0.15 && s.tick > 0, `${s.pac.speed}`)

// 2 — real steering eats real dots
const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']
for (let i = 0; i < 40 && (await probe()).score === 0; i++) {
    await page.keyboard.press(keys[i % 4])
    await sleep(220)
}
s = await probe()
rep.check('real key steering eats pellets', s.score > 0, `score ${s.score}`)

// 3 — round 1 paints the cherry on the HUD, and NO blue family near it
let cols = await iconCols()
rep.check('HUD icon round 1: cherry red, no blue (negative)',
    cols.red >= 20 && cols.blue === 0, JSON.stringify(cols))

// 4 — Next round ×4: galaxian blue appears where the icon sits (probe says
//     round 5; blue pixels can only be the new art)
for (let i = 0; i < 4; i++) await page.evaluate(() => window.__dbg.act('Next round'))
await sleep(250)
s = await probe()
rep.check('Next round ×4 rides the live counter', s.round === 5, `round ${s.round}`)
cols = await iconCols()
rep.check('HUD icon round 5: galaxian blue paint', cols.blue >= 15, JSON.stringify(cols))

// 5 — the score stage reaches the live probe
await page.evaluate(() => window.__dbg.act('Score → 5000'))
await sleep(120)
s = await probe()
rep.check('Score → 5000 pushes the live board to stage 4 (index 3)',
    s.stage === 3 && s.score >= 5000, JSON.stringify({ stage: s.stage, score: s.score }))

// 6 — Round → 14: the key paints gold on the HUD, no blue left
await page.evaluate(() => window.__dbg.act('Round → 14'))
await sleep(250)
s = await probe()
rep.check('Round → 14 on the live counter', s.round === 14, `round ${s.round}`)
cols = await iconCols()
rep.check('HUD icon round 14: gold key paint (blue gone)', cols.gold >= 15 && cols.blue === 0, JSON.stringify(cols))

// 7 — game over + a real key restarts the climb from the floor
await page.evaluate(() => window.__dbg.act('Force game over'))
await sleep(150)
s = await probe()
rep.check('force game over reaches the report', s.done === true, `done=${s.done}`)
await page.keyboard.press('ArrowUp')
await sleep(300)
s = await probe()
rep.check('a key after game over restarts at round 1 / stage 0',
    s.round === 1 && s.stage === 0 && !s.done && s.score < 700, JSON.stringify({ round: s.round, stage: s.stage, score: s.score }))

// 8 — the whole run in a clean browser
rep.check('zero page errors through the ladder', errors === 0, `${errors}`)

await rep.exit(browser)
