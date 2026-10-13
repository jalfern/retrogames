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

// the pad must be OFF the canvas during attract — its buttons used to sit
// right on the title band at phone scale — and a real tap on the bare
// canvas is the phone player's only way in
const padBtns = () => page.evaluate(() => document.querySelectorAll('.fixed.bottom-8 button').length)
r.check('attract: touchpad withdrawn from the canvas', (await padBtns()) === 0)

const cbox = await (await page.$('canvas')).boundingBox()
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(3500)
let s = await state()
r.check('a real TAP starts the race (no keyboard touched)', s.screen === 'race', `screen ${s.screen} phase ${s.phase}`)
r.check('race: touchpad present for the drive', (await padBtns()) > 0)
r.info('phase at first poll', s.phase)

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
const { TRACK } = await import('../src/games/MarioKart/track.js')

const t0 = Date.now()
let moved = false; let usedItem = false; let spinSeen = false; let seenPickup = false
while (Date.now() - t0 < 150000) {
    s = await state()
    if (s.screen !== 'race') break
    if (!moved && Math.hypot(s.x - 900, s.y - 1810) > 300) moved = true
    if (s.spin > 0) spinSeen = true
    const g = await page.evaluate(() => window.__kartTest.game())
    const log = await page.evaluate(() => (window.__kartLog || []).filter((ev) => ev.e === 'pickup' && ev.who === 'PLAYER'))
    if (log.length) seenPickup = true
    const inp = nodePlanner.decide(g)
    if (s.item === null) {
        const ahead = g.boxes.filter((b) => b && ((b.idx - s.idx + TRACK.N) % TRACK.N) < 400)
            .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0]
        if (ahead) {
            let da = Math.atan2(ahead.y - s.y, ahead.x - s.x) - s.a
            while (da > Math.PI) da -= 2 * Math.PI
            while (da < -Math.PI) da += 2 * Math.PI
            if (da > 0.02) inp.r = true
            if (da < -0.02) inp.l = true
        }
    }
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
r.check('picked up an item box', seenPickup, `item ${s.item}`)
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

const best = await page.evaluate(() => ({
    hook: window.__kartTest.best(),
    stored: Number(localStorage.getItem('arcade.kart.bestLap')) || 0,
}))
r.check('a lap banks a persisted best lap', best.hook > 0 && best.stored === best.hook, `best ${best.hook} stored ${best.stored}`)

// the end screen must withdraw the pad too, and a tap returns to attract
await page.evaluate(() => { window.__kartTest.game().end = 'lose'; window.__kartTest.game().karts[0].place = 4 })
await page.waitForTimeout(400)
r.check('end screen withdraws the pad', (await padBtns()) === 0, `pad ${(await padBtns())}`)
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(250)
r.check('tap on the end screen returns to attract', (await state()).screen === 'attract')
if (throttle > 1) r.info('throttle', `${throttle}x (advisory frame rate)`)

r.exit(browser)
