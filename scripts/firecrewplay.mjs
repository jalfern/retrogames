// FIRE CREW drive — real Chrome, real key events (#1254 step 6). Starts the
// game, plays with actual keydown/keyup, proves start→play→restart works with
// zero page errors, and that the drawn frame changes when the logical state
// changes (and stays put when it doesn't).
import { launch } from './lib/harness.mjs'

const PORT = process.env.DEV_PORT || 5173
const BASE = `http://localhost:${PORT}/retrogames/fire-crew`
let fails = 0
const ok = (c, name, d = '') => { if (c) console.log(`  ok   ${name}`); else { fails++; console.log(`  FAIL ${name}${d ? ` — ${d}` : ''}`) } }

const browser = await launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game && window.__game.meta.id === 'fire-crew', { timeout: 25000 })
ok(true, 'boot: __game exposed, no wait timeout')

const press = async (code, ms = 120) => { await page.keyboard.down(code); await new Promise((r) => setTimeout(r, ms)); await page.keyboard.up(code) }
const screen = () => page.evaluate(() => window.__firecrewTest.screen())

ok(await screen() === 'attract', 'starts in attract')

// tap to select crew, then SPACE to go
await page.mouse.click(400, 300)
await new Promise((r) => setTimeout(r, 150))
ok(await screen() === 'select', 'tap moves attract -> select')
await press('Space', 150)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', 'SPACE launches the shift')

// real keys move the hose: hold ArrowRight, watch x increase via the hook
const before = await page.evaluate(() => window.__firecrewTest.state().tick)
await page.keyboard.down('ArrowRight')
await new Promise((r) => setTimeout(r, 600))
await page.keyboard.up('ArrowRight')
const afterMove = await page.evaluate(() => window.__firecrewTest.state().tick)
ok(afterMove > before, 'real keys advance the sim through the rAF loop', `${before} -> ${afterMove}`)

// drawn pixels respond: canvas digest changes while playing, freezes when paused
const digest = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let h = 0
    for (let i = 0; i < d.length; i += 401) h = (h + d[i] * (i % 31 + 1)) | 0
    return h >>> 0
})
const d1 = await digest()
await new Promise((r) => setTimeout(r, 500))
const d2 = await digest()
ok(d1 !== d2, 'the scene animates while playing (fire/torch motion)')

// '?' pauses; the frame freezes across the same window
await press('Backquote')
await new Promise((r) => setTimeout(r, 120))
const p1 = await digest()
await new Promise((r) => setTimeout(r, 450))
const p2 = await digest()
ok(p1 === p2, 'pause freezes the drawn world')
await press('Backquote')

// sprite matches logic: drive via the contract; the drawn frame must change
// with the sim even though the rAF loop is locked while the contract holds it
// (#1415-era nightly fix): the baseline tick must be read in the SAME JS task
// as the locking step()s. A separate page.evaluate left the rAF loop open for
// the screenshot digest between them, and CI's software renderer slipped one
// extra tickSim frame in (the 100 -> 131 nightly fail). The lock persists
// until release(), so reading tickAfter after the batch stays clean.
const dA = await digest()
const tickBefore = await page.evaluate(() => {
    const t0 = window.__game.state().tick
    for (let i = 0; i < 30; i++) window.__game.step({ right: true })
    return t0
})
await new Promise((r) => setTimeout(r, 150)) // let the rAF draw land after the contract steps
const dB = await digest()
const tickAfter = await page.evaluate(() => window.__game.state().tick)
ok(tickAfter === tickBefore + 30, 'contract step advances exactly one per call', `${tickBefore} -> ${tickAfter}`)
ok(dA !== dB, 'drawn frame follows the logical step')
await page.evaluate(() => window.__game.release())

// autopilot finishes a whole shift, then a real key restarts
const end = await page.evaluate(async () => {
    const r = window.__firecrewTest.resolveAll()
    return r
})
ok(end && end.done === true, 'a full seeded shift reaches its end', `rescued ${end && end.rescued}/6 tick ${end && end.tick}`)
await new Promise((r) => setTimeout(r, 900))
ok(await screen() === 'over', 'the over card shows')
await press('KeyX', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'attract', 'any key returns to attract')
await press('Space', 120)
await new Promise((r) => setTimeout(r, 150))
await press('Space', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', 'restart works — the shift runs again')

// #1744 — wind audio cues on real rAF ticks: a forced breeze lays the bed,
// a gale on an extended ladder adds the load-creak, calm silences both.
const nap = (ms) => new Promise((r) => setTimeout(r, ms))
let spy = await page.evaluate(() => window.__firecrewTest.windForce(1, 0))
ok(spy && spy.gust === 1 && !spy.done, 'windForce lays a breeze on a live shift', JSON.stringify(spy))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.bed.vol > 0 && !spy.done, 'a breeze fires the low bed inside a second', JSON.stringify(spy.bed))
await page.evaluate(() => window.__firecrewTest.windForce(2, 0.95))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.creak && spy.creakFired && spy.creakFired.vol >= spy.creak.vol * 0.99,
    'a gale on an extended ladder howls and creaks', JSON.stringify(spy))
await page.evaluate(() => window.__firecrewTest.windForce(0, 0.95))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed === null && spy.creakFired === null && !spy.done,
    'calm silences the bed and the creak', JSON.stringify(spy))

// #1749 — the compass leans the bed on real ticks: a cross-wind gale fires
// the octave shadow, an east gale lifts the bed without the shadow
await page.evaluate(() => window.__firecrewTest.windForce(2, 0, 1))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.bed.second && spy.bed.second.freq === spy.bed.freq / 2 && spy.voice.freq === spy.bed.freq,
    'a cross-wind gale fires the octave-low shadow burst', JSON.stringify(spy.bed))
await page.evaluate(() => window.__firecrewTest.windForce(2, 0, 0))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && !spy.bed.second && spy.voice.freq > 380 && spy.dir === 0,
    'an east gale lifts the bed, no shadow', JSON.stringify(spy.bed))
// the vane pre-whistle: set the shift 60 ticks out on a calm live shift; the
// rising figure must fire and land high-urgency before the wind turns
await page.evaluate(() => window.__firecrewTest.windForce(0, 0, -1))
await page.evaluate(() => window.__firecrewTest.windNext(60))
await nap(2000)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.whistleFired && spy.whistleFired.f0 === 240 && spy.whistleFired.f1 >= 500 && spy.whistleFired.f1 <= 760,
    'the pre-whistle fires and climbs before the shift lands', JSON.stringify(spy.whistleFired))

// #2029 — watch-seat polish, live in Chrome.
// (a) phone viewports: the WATCH pill must not crowd the canvas/HUD column;
// (b) seated B: releases AND flares the same press (the pinned ruling);
// (c) losing route: ember edges light on the proven losing seed before expiry;
// (d) 2P select + a real pill tap: only seat 1 seats, partners stay human;
// (e) the seated radio hint is on screen while the sheet is flipped.
const pillAndHud = async () => page.evaluate(() => {
    const pill = document.querySelector('[data-watch-toggle]')
    const cvs = document.querySelector('canvas')
    if (!pill || !cvs) return null
    const p = pill.getBoundingClientRect()
    const c = cvs.getBoundingClientRect()
    const hud = { x: c.left, y: c.top, w: c.width, h: c.height * 0.2 } // HUD column = top fifth of the scene
    const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0
    return { overlap: hit(p, hud), pills: p, canvas: c }
})
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp)
    await new Promise((r) => setTimeout(r, 250))
    const m = await pillAndHud()
    ok(m && !m.overlap, `phone ${vp.width}x${vp.height}: the WATCH pill clears the HUD column`, m ? JSON.stringify({ pill: m.pills, canvas: m.canvas }) : 'no pill/canvas')
}
await page.setViewportSize({ width: 1280, height: 800 })

// (b) + (e): seat on a fresh shift, check the radio hint, then take the hose
// back with B — one press, released AND flaring.
await page.evaluate(() => window.__firecrewTest.start(77, 1))
await new Promise((r) => setTimeout(r, 200))
await press('KeyY', 120)
await new Promise((r) => setTimeout(r, 300))
const seated = await page.evaluate(() => window.__firecrewTest.probe())
ok(seated && seated.cpuSeat === true, 'B-leg: Y seats the watcher', JSON.stringify(seated))
const radioHintShown = await page.evaluate(() => document.body.innerText.includes('V RADIO — SHOUTS STILL STEER THE CREW'))
ok(radioHintShown, 'the seated radio hint is on screen (#2029)')
const beforeB = await page.evaluate(() => { const p = window.__firecrewTest.probe(); return { flares: p.flares, battery: p.battery } })
await press('KeyB', 120)
await new Promise((r) => setTimeout(r, 250))
const afterB = await page.evaluate(() => window.__firecrewTest.probe())
ok(afterB && afterB.cpuSeat === false, 'seated B releases the seat (takeover rule intact)')
ok(afterB && afterB.flares > beforeB.flares && afterB.battery <= beforeB.battery - 30,
    'the same press flares — B releases AND flares (#2029 ruling)', JSON.stringify({ beforeB, afterB }))

// (c) losing route: seed 1 loses at the clock; the ember tell must be drawn
// by tick 6601 — sample the left edge before and after the tell.
await page.evaluate(() => window.__firecrewTest.start(1, 1))
await new Promise((r) => setTimeout(r, 200))
await press('KeyY', 120) // seated: ride the proven (losing here) route
const edge = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(1, Math.floor(c.height / 2), 1, 1).data
    return { r: d[0], g: d[1], b: d[2] }
})
const calmEdge = await edge()
const lateTick = await page.evaluate(() => {
    let t = 0
    while (t++ < 6650) window.__game.step({})
    return window.__firecrewTest.probe().tick
})
await new Promise((r) => setTimeout(r, 200))
const lateEdge = await edge()
ok(lateTick > 6601, 'seed 1 rides past the tell threshold while seated', String(lateTick))
ok(lateEdge.r - lateEdge.b > calmEdge.r - calmEdge.b + 20,
    'the losing-route ember edge is drawn (red gain at the screen edge)', JSON.stringify({ calmEdge, lateEdge }))
await page.evaluate(() => window.__game.release())

// (d) 2P on the picker + a real pill tap: seat 1 seats, the partner stays.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game && window.__game.meta.id === 'fire-crew', { timeout: 25000 })
await press('Space', 120)
await new Promise((r) => setTimeout(r, 200))
ok(await screen() === 'select', '2P-leg: Space reaches the picker')
const pickerCopy = await page.evaluate(() => document.body.innerText)
ok(/WATCH \(Y OR PILL\) STEPS ASIDE/.test(pickerCopy) && /PARTNERS STAY HUMAN/.test(pickerCopy),
    'picker copy names the HOSE seat for the watcher and partners as staying human')
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('2P'))
    b.click()
})
await press('Space', 150)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', '2P-leg: SPACE launches the two-crew shift')
await page.click('[data-watch-toggle]') // a real tap on the pill
await new Promise((r) => setTimeout(r, 250))
const twoP = await page.evaluate(() => window.__firecrewTest.probe())
ok(twoP && JSON.stringify(twoP.sources) === JSON.stringify(['cpu', 'human', 'cpu']),
    'the pill seats only seat 1 — the human partner stays human (#2029)', JSON.stringify(twoP && twoP.sources))

ok(errors.length === 0, 'zero page errors across the whole drive', errors.slice(0, 3).join(' | '))
console.log(`\n${fails ? 'FAILED' : 'DRIVE GREEN'} — ${fails ? fails + ' failures' : 'start, play, pause, contract, die, restart'}`)
await browser.close()
process.exit(fails ? 1 : 0)
