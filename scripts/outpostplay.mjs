// OUTPOST — Chrome plays the depths with NOTHING but real key/pointer
// events for the input path, and the claims the Node harness cannot see
// are graded in PIXELS:
//
//   npm run outpostplay     (needs `npm run dev`)
//
//   1. THE ATTRACT DEMO MOVES — dwarves walk on their own and the canvas
//      is demonstrably not black.
//   2. THE INPUT PATH — arrows walk the cursor, Space posts a DIG on a
//      rock, and the rock CELL'S PIXEL becomes the floor the sim says.
//   3. A REAL DWARVE Digs it — the pick arrives, the cell changes state,
//      the pixel follows, and the queue drains.
//   4. THE SIM SAYS NO — rally on bare floor is refused by the engine.
//   5. THE LEDGER TELLS THE TRUTH IN THE PAGE — eaten/harvested/food
//      balance while a driven colony works; a carrying dwarf paints gold.
//   6. ONE KEY LEAVES AND ONE KEY RETURNS — win screen, key, attract.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.OP_URL || 'http://localhost:5173/retrogames/outpost'
await requireDevServer(URL)

const r = new Report('outpostplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 720, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => !!window.__opTest)) break
    await page.waitForTimeout(200)
}
r.check('the __opTest hook is live', await page.evaluate(() => !!window.__opTest))

const probe = async () => {
    for (let i = 0; i < 30; i++) {
        const p = await page.evaluate(() => window.__opTest ? window.__opTest.probe() : null)
        if (p && p.dwarves) return p
        await wait(60)
    }
    throw new Error('__opTest vanished (remount storm)')
}
const wait = (ms) => page.waitForTimeout(ms)
const holdKey = async (key, ms = 120) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }
// classify the INNER window of a cell (inside the cursor stroke and tool
// label): '#' rock pixels are cool-grey, '.' floor is a single warm dot on
// black, dig markers and carrying dwarves are warm/gold. Single-pixel
// sampling hit glyph baselines and the cursor stroke — a window does not.
const cellPix = (gx, gy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-op-stage]')
    if (!c) return null
    const d = c.getContext('2d').getImageData(x * 15 + 3, y * 22 + 3, 9, 16).data
    let cool = 0, warm = 0, gold = 0
    for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
        if (b > r + 8) cool++
        else if (r >= g + 6 && r > b + 10) warm++
        if (r > 190 && g > 140 && b < 130) gold++
    }
    return { cool, warm, gold }
}, [gx, gy])

// 1 — attract: the demo colony walks without a single key
await wait(3500)
let s = await probe()
r.check('attract mode is showing', s && s.screen === 'attract')
const demo = await cellPix(17, 10)
r.check(`attract canvas is not black (cell paints ${JSON.stringify(demo)})`, demo && demo.cool + demo.warm + demo.gold > 3)
const pos0 = (await probe()).dwarves.map((d) => `${d.x},${d.y}`).join(';')
await wait(2500)
const pos1 = (await probe()).dwarves.map((d) => `${d.x},${d.y}`).join(';')
r.check('attract dwarves WALK (the proven run, not a still frame)', pos0 !== pos1, `${pos0} -> ${pos1}`)

// 2 — one key into play; arrows walk the cursor
await page.keyboard.press('Digit2')
let settled = null
for (let i = 0; i < 30; i++) {
    const a = await probe()
    await wait(120)
    const b = await probe()
    if (a.screen === 'play' && b.screen === 'play') { settled = b; break }
}
r.check('pressing 2 starts the outpost (seed 1)', settled && settled.screen === 'play' && settled.seed === 1)
const c0 = (settled || (await probe())).cursor
await holdKey('ArrowRight', 200)
let c1 = (await probe()).cursor
for (let i = 0; i < 12 && c1.x === c0.x; i++) { await holdKey('ArrowRight', 140); c1 = (await probe()).cursor }
r.check(`arrows walk the cursor east (${c0.x},${c0.y} -> ${c1.x},${c1.y})`, c1.x > c0.x)

// 3 — Space on a REAL rock posts a dig job, and that rock must be adjacent
// to open floor (the sim rejects sealed rock — ask it where it can dig),
// and close to spawn (the dwarf must reach it before the harness times out)
const spot = await page.evaluate(() => {
    const p = window.__opTest.probe()
    const occ = new Set(p.dwarves.filter((d) => d.alive).map((d) => `${d.x},${d.y}`))
    let best = null, bestD = 99
    for (let y = 1; y < 19; y++) for (let x = 1; x < 35; x++) {
        if (occ.has(`${x},${y}`)) continue
        const c = p.cellAt(x, y)
        if (c.t !== 0) continue
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = p.cellAt(x + dx, y + dy); return n && n.t !== 0 })
        if (!open) continue
        const d = Math.abs(x - p.spawn[0]) + Math.abs(y - p.spawn[1])
        if (d < bestD) { bestD = d; best = { x, y } }
    }
    return best && bestD <= 10 ? best : null
})
r.check('the map offers a diggable rock within 10 steps of spawn', !!spot)
let c = (await probe()).cursor
let guard = 0
while (spot && (c.x !== spot.x || c.y !== spot.y) && guard++ < 80) {
    if (c.x < spot.x) await holdKey('ArrowRight', 60)
    else if (c.x > spot.x) await holdKey('ArrowLeft', 60)
    else if (c.y < spot.y) await holdKey('ArrowDown', 60)
    else await holdKey('ArrowUp', 60)
    c = (await probe()).cursor
}
r.check(`cursor walked to the rock ${JSON.stringify(spot)}`, c.x === spot.x && c.y === spot.y)
const pxRock = await cellPix(spot.x, spot.y)
r.check(`the rock cell paints cool rock pixels ${JSON.stringify(pxRock)}`, pxRock && pxRock.cool >= 6 && pxRock.warm === 0)
await page.keyboard.press('Space')
await wait(150)
const afterTap = await probe()
r.check('SPACE posted a DIG job on the cursor', afterTap.jobs.some((j) => j.kind === 'dig' && j.x === spot.x && j.y === spot.y))
const pxMark = await cellPix(spot.x, spot.y)
r.check(`the DIG marker paints warm on the rock ${JSON.stringify(pxMark)}`, pxMark.warm >= 3)
r.check('the rock is STILL rock on designation (the dwarf must walk there first)',
    await page.evaluate(([x, y]) => window.__opTest.probe().cellAt(x, y).t === 0, [spot.x, spot.y]))

// a DWARVE digs it for real: state then pixel (cursor steps away so its
// own label/stroke never sits on the sampled cell)
await holdKey('ArrowUp', 120)
await holdKey('ArrowUp', 120)
let dug = false
for (let i = 0; i < 150 && !dug; i++) {
    await wait(400)
    dug = await page.evaluate(([x, y]) => {
        const p = window.__opTest.probe()
        return p.cellAt(x, y).t !== 0 && p.evLog.some((e) => e.type === 'dig' && e.x === x && e.y === y)
    }, [spot.x, spot.y])
}
r.check('a dwarf walked there and DUG the rock (state)', dug)
const pxFloor = await cellPix(spot.x, spot.y)
r.check(`the dug cell paints FLOOR (a warm dot, no cool rock) ${JSON.stringify(pxFloor)}`, pxFloor.cool <= 1 && pxFloor.warm >= 1, `rock was ${JSON.stringify(pxRock)}`)

// 4 — the SIM says no: rally on bare floor is a refusal, not a silent tap
await page.keyboard.press('KeyT')
await page.keyboard.press('KeyT')
const tProbe = await probe()
r.check('T cycles the tool to RALLY', tProbe.tool === 'rally', tProbe.tool)
await holdKey('ArrowLeft', 60)
await page.keyboard.press('Space')
await wait(150)
const denied = await probe()
r.check('RALLY on bare floor answered NOTSTAIRS (the engine refused)',
    denied.evLog.slice(-4).some((e) => e.type === 'deny' && e.why === 'NOTSTAIRS'))

// 5 — drive the colony in CHUNKS (so the canvas catches a dwarf mid-haul):
// eaten/harvested grow, ledger balances IN THE PAGE, and a carrying dwarf
// paints GOLD on the canvas.
let gold = null
let driven = null
for (let i = 0; i < 260; i++) {
    await page.evaluate(() => { if (!window.__opTest.probe().end) window.__opTest.drive(600) })
    await wait(150)
    if (!gold) {
        gold = await page.evaluate(() => {
            const p = window.__opTest.probe()
            const d = p.dwarves.find((dd) => dd.alive && dd.carryFood > 0)
            if (!d) return null
            const c = document.querySelector('canvas[data-op-stage]')
            if (!c) return null
            const x0 = Math.max(0, d.x * 15 - 15), y0 = Math.max(0, d.y * 22 - 22)
            const im = c.getContext('2d').getImageData(x0, y0, 45, 66).data
            let g = 0
            for (let k = 0; k < im.length; k += 4) {
                if (im[k] > 190 && im[k + 1] > 140 && im[k + 1] < 235 && im[k + 2] < 130) g++
            }
            return g > 4 ? { x: d.x, y: d.y, gold: g } : null
        })
    }
    driven = await probe()
    if (driven.end && gold) break
}
r.check(`the driven colony ate and harvested (eaten ${driven.eaten}, harvested ${driven.harvested})`, driven.eaten > 0 && driven.harvested > driven.eaten)
const bal = driven.food + driven.dwarves.reduce((n, d) => n + (d.alive ? d.carryFood : 0), 0) + driven.eaten + driven.rotten
r.check(`the page ledger balances (depot+carry+eaten+rotten == ${6 + driven.harvested})`,
    Math.abs(bal - (6 + driven.harvested)) < 20, `food ${driven.food} eaten ${driven.eaten} rotten ${driven.rotten} harvest ${driven.harvested}`)
if (gold) {
    r.check(`a carrying dwarf paints gold at ${gold.x},${gold.y} (${gold.gold} gold pixels in his 3x3)`, gold.gold > 4)
} else {
    r.check('a dwarf carries food (gold)', false, 'no carryFood dwarf seen while driven')
}

// 6 — win and return: keep driving until the beacon, one key leaves
let win = driven
for (let i = 0; i < 240 && !(win && win.end); i++) {
    await page.evaluate(() => { if (!window.__opTest.probe().end) window.__opTest.drive(600) })
    await wait(200)
    win = await probe()
}
r.check(`the driven depths end in victory (why: ${win && win.why})`, win && win.end === 'win' && win.depth === 3)
await wait(1300)
await page.keyboard.press('Space')
await wait(400)
r.check('one key returns to attract after the end screen', (await probe()).screen === 'attract')

await wait(600)
const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
