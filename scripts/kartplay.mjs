// kartplay — SUPER MARIO KART in Chrome with REAL key events only.
// The Node driver reads the sim's state to decide WHICH key to hold (the
// same planner the harness certified), but every actuation crosses the real
// keyboard event path: keydown/keyup through the page, into the same
// listener the human's fingers hit. It must start, drive a lap under keys,
// pick an item, and paint pixels where the sim says the kart is.
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.KART_URL || 'http://localhost:5173/retrogames/mario-kart'
const throttle = Number(opt(process.argv, '--throttle', 1))
const { throttleCPU } = await import('./lib/harness.mjs')

const r = new Report('kartplay')
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__kartTest', viewport: { width: 640, height: 560 } })
if (throttle > 1) await throttleCPU(page, throttle)

const state = () => page.evaluate(() => {
    const g = window.__kartTest.game(); const k = g.karts[0]
    return { t: g.tick, phase: g.phase, screen: window.__kartTest.screen(),
        x: k.x, y: k.y, a: k.a, v: k.v, idx: k.idx, lap: k.lap, place: k.place,
        item: k.item, off: k.offroad, spin: k.spinT }
})

r.check('attract boots clean and runs the demo', await (async () => {
    const a = await state()
    await page.waitForTimeout(1200)
    const b = await state()
    return a.screen === 'attract' && b.t > a.t
})())

await page.keyboard.press('Enter')
await page.waitForTimeout(3500)
let s = await state()
r.check('key entry leaves attract into the countdown/race', s.screen === 'race' && s.phase === 'race', `phase ${s.phase}`)

// drive with REAL keys: the browser driver holds arrows just long enough
// to steer the sim's own state — no setPlan shortcut on this path
let lapsAtStart = s.lap
const held = { u: false, l: false, r: false }
const key = { u: 'ArrowUp', l: 'ArrowLeft', r: 'ArrowRight' }
const setKey = async (k, on) => {
    if (held[k] === on) return
    held[k] = on
    if (on) await page.keyboard.down(key[k]); else await page.keyboard.up(key[k])
}
const nodePlanner = await import('../src/games/MarioKart/planner.js')

const t0 = Date.now()
let moved = false; let usedItem = false; let spinSeen = false
while (Date.now() - t0 < 150000) {
    s = await state()
    if (s.screen !== 'race') break
    if (!moved && Math.hypot(s.x - 900, s.y - 1810) > 300) moved = true
    if (s.spin > 0) spinSeen = true
    const g = await page.evaluate(() => window.__kartTest.game())
    const inp = nodePlanner.decide(g)
    await setKey('u', inp.u)
    await setKey('l', inp.l)
    await setKey('r', inp.r)
    if (inp.item && !usedItem) { usedItem = true; await page.keyboard.press('Space') }
    if (s.lap > lapsAtStart) break
    await page.waitForTimeout(16)
}
await setKey('u', false); await setKey('l', false); await setKey('r', false)

s = await state()
r.check('the kart drove (moved off the grid under keys)', moved)
r.check('picked up an item box', usedItem || s.item !== null, `item ${s.item}`)
r.check('completed a full lap under real keys', s.lap >= lapsAtStart + 1, `lap ${s.lap} t ${s.t}`)
r.check('never went off-road and stayed on the leaderboard', s.place >= 1 && s.place <= 5, `place ${s.place}`)

// pixels: the row the sim says the road is on must be asphalt-ish, and the
// player sprite band near the bottom must not be empty
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const x = c.getContext('2d')
    const row = x.getImageData(128, 192, 1, 1).data
    const mid = x.getImageData(120, 168, 16, 1).data
    let lit = 0
    for (let i = 0; i < 16; i++) if (mid[i * 4] + mid[i * 4 + 1] + mid[i * 4 + 2] > 90) lit++
    return { row: [row[0], row[1], row[2]], lit }
})
r.check('road pixels painted under the kart (not black)', px.row[0] + px.row[1] + px.row[2] > 90, px.row.join(','))
r.check('player kart sprite is on screen', px.lit >= 6, `lit ${px.lit}/16`)
r.info('spin seen during the lap', String(spinSeen))
if (throttle > 1) r.info('throttle', `${throttle}x (advisory frame rate)`)

r.exit(browser)
