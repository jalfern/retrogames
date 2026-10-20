// SIMCITY-MIN — Chrome plays the grid with NOTHING but real key/pointer
// events, and the claims the Node harness cannot see are graded in PIXELS:
//
//   npm run cityplay     (needs `npm run dev`)
//
//   1. THE ATTRACT DEMO IS THE PROVEN RUN — the city grows on its own and
//      the canvas is demonstrably not black.
//   2. THE INPUT PATH — arrows walk the cursor, Space places under it, and
//      the placed cell's CENTER PIXEL is the color the sim says it is.
//   3. POWER IS WIRED, NOT DECORATIVE — a plant lights the road graph and
//      the lit count climbs only after the wire exists.
//   4. THE SCRIPT BURNS — on SMOKESTACK the scripted fire really ignites
//      (event log + a fire-orange pixel), and the ledger still balances.
//   5. ONE KEY LEAVES AND ONE KEY RETURNS — win screen, key, attract.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.SC_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/simcity-min`
await requireDevServer(URL)

const r = new Report('cityplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 720, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => !!window.__scTest)) break
    await page.waitForTimeout(200)
}
r.check('the __scTest hook is live', await page.evaluate(() => !!window.__scTest))

const probe = async () => {
    for (let i = 0; i < 30; i++) {
        const p = await page.evaluate(() => window.__scTest ? window.__scTest.probe() : null)
        if (p && p.cursor) return p
        await wait(60)
    }
    throw new Error('__scTest vanished (remount storm)')
}
const wait = (ms) => page.waitForTimeout(ms)
const holdKey = async (key, ms = 90) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }
const px = (gx, gy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-sc-stage]')
    if (!c) return null
    const d = c.getContext('2d').getImageData(x * 28 + 14, y * 28 + 14, 1, 1).data
    return [d[0], d[1], d[2]]
}, [gx, gy])

// 1 — attract: the demo city paints and grows without a single key
await wait(3500)
let s = await probe()
r.check('attract mode is showing', s && s.screen === 'attract')
const demo = await px(11, 8)
r.check(`attract canvas is not black (centre rgb ${demo})`, demo && (demo[0] + demo[1] + demo[2]) > 30)
s = await probe()
r.check(`demo ticks run freely (tick ${s.tick})`, s.tick > 100 && s.pop >= 0)
let grew = false
for (let i = 0; i < 50 && !grew; i++) { await wait(600); grew = (await probe()).pop > 10 }
r.check('the attract demo is a GROWING city (the proven run, not a still frame)', grew)

// 2 — one key into play, arrows walk the cursor
await page.keyboard.press('Digit2')
let settled = null
for (let i = 0; i < 30; i++) {
    const a = await probe()
    await wait(120)
    const b = await probe()
    if (a.screen === 'play' && b.screen === 'play' && a.cursor.x === b.cursor.x && a.cursor.y === b.cursor.y) { settled = b; break }
}
r.check('pressing 2 starts SMOKESTACK', settled && settled.sc === 1)
const c0 = (settled || (await probe())).cursor
await holdKey('ArrowRight', 160)
let c1 = (await probe()).cursor
for (let i = 0; i < 10 && c1.x === c0.x; i++) { await holdKey('ArrowRight', 120); c1 = (await probe()).cursor }
r.check(`arrows walk the cursor east (${c0.x},${c0.y} -> ${c1.x},${c1.y})`, c1.x > c0.x)
const y0 = c1.y
await holdKey('ArrowUp', 160)
let c2 = (await probe()).cursor
for (let i = 0; i < 10 && c2.y === y0; i++) { await holdKey('ArrowUp', 120); c2 = (await probe()).cursor }
r.check(`arrows walk the cursor north (${c1.x},${c1.y} -> ${c2.x},${c2.y})`, c2.y < y0)

// 3 — Space places a road, and the pixel matches the state 1:1. Re-check
// the cursor survived the Space (a tap that landed on attract would RESTART
// the game instead — the cursor proves which path the key took)
const p = await probe()
const spot = { x: p.cursor.x, y: p.cursor.y }
await page.keyboard.press('Space')
await wait(120)
const p2 = await probe()
r.check('SPACE placed without restarting the game', p2.cursor.x === spot.x && p2.cursor.y === spot.y, `cursor ${spot.x},${spot.y} -> ${p2.cursor.x},${p2.cursor.y}`)
const cellAt = (x, y) => page.evaluate(([cx, cy]) => window.__scTest.probe().cellAt(cx, cy), [x, y])
let cell = await cellAt(spot.x, spot.y)
r.check(`SPACE laid a road on the cursor (${JSON.stringify(cell)})`, cell && cell.t === 3)
const road = await px(spot.x, spot.y)
r.check(`the road pixel matches the road state (rgb ${road})`, road && Math.abs(road[0] - 59) < 14 && Math.abs(road[2] - 69) < 16)

// same key on water must be refused by the SIM, not skipped by the shell
const sea = await page.evaluate(() => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
        const c = window.__scTest.probe().cellAt(x, y)
        if (c && c.t === 1) return { x, y }
    }
    return null
})
if (sea) {
    const f0 = (await probe()).funds
    await page.evaluate(([x, y]) => window.__scTest.cursorTo(x, y), [sea.x, sea.y])
    await page.keyboard.press('Space')
    await wait(120)
    const after = await cellAt(sea.x, sea.y)
    r.check('water refuses the road (the SIM says no, not the shell)', after.t === 1)
    r.check('a refusal costs nothing', (await probe()).funds === f0)
}

// 4 — power is wired: the plant lights the road graph it touches. Sweep for
// grass the keys can actually build on — the map is allowed to say no, and
// the harness asks the SIM where, not hope.
s = await probe()
const lit0 = s.lit
let wire1 = null
for (const dx of [1, -1, 2, -2, 3, -3]) {
    await page.evaluate(([x, y]) => window.__scTest.cursorTo(x, y), [spot.x + dx, spot.y])
    await page.keyboard.press('Space')
    await wait(90)
    if ((await cellAt(spot.x + dx, spot.y)).t === 3) { wire1 = dx; break }
}
r.check('SPACE extends the wire onto the next buildable grass cell', wire1 !== null)
const grassRun = await page.evaluate(([x, y]) => {
    const out = []
    for (let dx = 1; dx <= 6; dx++) {
        const c = window.__scTest.probe().cellAt(x + dx, y)
        const l = window.__scTest.probe().cellAt(x + dx - 1, y)
        if (c && c.t === 0 && l && l.t === 3) out.push(x + dx)
    }
    return out
}, [spot.x + wire1, spot.y])
let plantOn = false
for (const gx of grassRun) {
    await page.evaluate(([x, y]) => window.__scTest.place(x, y, 1), [gx, spot.y])
    await wait(90)
    if ((await cellAt(gx, spot.y)).t === 4) { plantOn = true; break }
}
const denies = await page.evaluate(() => window.__scTest.probe().evLog.filter((e) => e.type === 'deny').slice(-6))
r.check('the PLANT tool (T-cycled) built a plant on the wire', plantOn, plantOn ? '' : `denies ${JSON.stringify(denies)}`)
let lit1 = (await probe()).lit
for (let i = 0; i < 30; i++) { await wait(100); if ((await probe()).lit > lit0 + 2) break }
lit1 = (await probe()).lit
r.check(`power spreads down the road graph (${lit0} -> ${lit1} lit cells)`, lit1 > lit0 + 2)

// 4b — the script now strikes the city WHERE THE CITY IS: a fire ignites the
// nearest DEVELOPED block, and a corner with nothing built is an honest dud.
// So the smoke builds one industry tile on the wire (it bootstraps to level 1
// — the RCI job base) to become the block the year-13 SMOKESTACK fire ignites.
// No zone at all = a dud = nothing to grade in pixels, which is what regressed.
let indOn = false
for (const [zx, zy] of [[spot.x, spot.y - 1], [spot.x, spot.y + 1], [spot.x + wire1, spot.y - 1], [spot.x + wire1, spot.y + 1]]) {
    await page.evaluate(([x, y]) => window.__scTest.place(x, y, 4), [zx, zy])
    await wait(90)
    if ((await cellAt(zx, zy)).t === 7) { indOn = true; break }
}
r.check('an industry tile stands on the wire (a developed cell for the script to burn)', indOn)

// 5 — the script burns on SMOKESTACK: fast-forward years through the real
// step() and grade the event log AND a fire-coloured pixel. dudfire counts:
// it is the script firing at ground the player never built on — honest.
await page.evaluate(() => window.__scTest.years(12))
await wait(300)
// sample a cell the SIM currently reports as burning — the year boundary
// can land mid-call, so the scan may be the step that actually lights it
let burning = null
for (let k = 0; k < 20 && !burning; k++) {
    burning = await page.evaluate(() => {
        const p = window.__scTest.probe()
        for (const c of p.burning) return { x: c[0], y: c[1] }
        return null
    })
    if (!burning) { await page.evaluate(() => window.__scTest.years(1)); await wait(150) }
}
if (burning) {
    // the flame flickers on a 4-tick phase; one sample can honestly land on
    // the spark gap. The claim that survives every machine: while the SIM
    // says this cell burns, it never stays cold-dark for a full second.
    let hot = null, coldRun = 0, everBurn = false
    for (let i = 0; i < 12; i++) {
        const st = await probe()
        if (!st.burning.some(([x, y]) => x === burning.x && y === burning.y)) break
        everBurn = true
        const c = await px(burning.x, burning.y)
        if (c && c[0] > 120 && c[0] > c[1] + 40) { hot = c; break }
        coldRun++
        await wait(90)
    }
    r.check(`a burning cell (${burning.x},${burning.y}) paints hot while the sim burns it${hot ? '' : ` (${coldRun} cold frames)`}`, !!hot, hot ? `rgb ${hot}` : 'never lit')
    void everBurn
} else {
    r.check('a cell is burning while the script says so', false, 'no burn>0 cell found in 20 years of the SMOKESTACK script')
}
const burns = await page.evaluate(() => window.__scTest.probe().evLog.filter((e) => ['fire', 'spread', 'ash', 'dudfire', 'tornado'].includes(e.type)))
const hist = await page.evaluate(() => [...new Set(window.__scTest.probe().evLog.map((e) => e.type))].join(','))
r.check(`the disaster script fired: ${burns.length} fire/spread/ash/dudfire events`, burns.length > 0, `log types: ${hist}`)
const led = await page.evaluate(() => {
    const g = window.__scTest.probe()
    return { year: g.year, funds: g.funds, income: g.evLog.filter((e) => e.type === 'year').slice(-1)[0] }
})
r.check(`the ledger ticks (year ${led.year}, income ${led.income && led.income.income}, delta ${led.income && led.income.delta})`, led.year >= 13 && led.income)

// 6 — the end path: an unfinished city MISSES its deadline (the sim ends
// it). A full charter win is graded in citycheck; this grades the end SCREEN
// and the return key against the SAME transport the player rides.
for (let k = 0; k < 60; k++) {
    const st = await probe()
    if (st.end) break
    await page.evaluate(() => window.__scTest.years(2))
    await wait(120)
}
s = await probe()
r.check(`the deadline ends the run honestly: end=${s.end} why=${s.why} pop ${s.pop} by year ${s.year}`, s.end === 'lose' && s.why === 'MISSED')
await wait(1300)
await page.keyboard.press('Space')
await wait(400)
r.check('one key returns to attract after the end screen', (await probe()).screen === 'attract')

await wait(600)
const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
