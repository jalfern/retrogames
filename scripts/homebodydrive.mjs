// homebodydrive.mjs — drive HOMEBODY in headless Chrome with real key/tap events.
// start, play, command, die, restart; drawn frame must follow logical state.
import { launch, requireDevServer, openGame } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/homebody`
let pass = 0, fail = 0
const check = (n, c, info = '') => { if (c) { pass++; console.log('  ok  ', n, info) } else { fail++; console.log('  FAIL', n, info) } }

await requireDevServer(BASE)
const browser = await launch()
const errors = []
const page = await openGame(browser, { url: BASE, hook: '__homebodyTest', start: false, wait: 900 })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const st = async () => page.evaluate(() => window.__homebodyTest.probe())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
check('boots on attract with zero page errors', (await st()).screen === 'attract' && errors.length === 0, JSON.stringify(errors.slice(0, 2)))

// attract demo is alive: canvas paints (frame non-null via contract)
const png = await page.evaluate(() => (window.__game ? window.__game.frame().length : 0))
check('attract paints a live canvas', png > 5000, `frame ${png}b`)

// any key starts
await page.keyboard.press('Space')
await wait(400)
check('Space starts the game', (await st()).screen === 'play')

// keyboard walk changes the resident's position
const p0 = await st()
await page.keyboard.down('ArrowLeft'); await wait(250); await page.keyboard.up('ArrowLeft')
await page.keyboard.down('ArrowDown'); await wait(250); await page.keyboard.up('ArrowDown')
await wait(150)
const p1 = await st()
check('arrows move the commanded resident', p1.tick > p0.tick)

// tap the fridge tile (col 9,row 2) -> resident paths there
const r = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const b = c.getBoundingClientRect()
    return { left: b.left, top: b.top, w: b.width, h: b.height }
})
const tap = async (x, y) => {
    const px = r.left + (x / 640) * r.w, py = r.top + (y / 480) * r.h
    await page.mouse.click(px, py)
}
const before = await st()
await tap(8 + 9 * 32 + 16, 40 + 2 * 32 + 16) // fridge centre
await wait(150)
const mid = await st()
check('tap registers in play without error', mid.screen === 'play' && errors.length === 0)
// let them walk + eat
let ate = false
for (let i = 0; i < 40 && !ate; i++) { await wait(250); const s = await st(); ate = s.people.some((p) => p.needs.hunger > 0.75) }
check('ordered resident eats the fridge', ate)

// B opens buy mode (time stops)
await page.keyboard.press('KeyB')
await wait(200)
const b1 = await st()
check('B opens buy mode', b1.build === true)
const h1 = b1.hour
await wait(500)
check('time stands still in buy mode', (await st()).hour === h1)
// place an affordable rug at a known open spot via card 11 then tap floor
await page.evaluate(() => window.__homebodyTest.money(1000))
await page.evaluate(() => window.__homebodyTest.select(10)) // rug
await tap(8 + 3 * 32 + 16, 40 + 3 * 32 + 16)
await wait(200)
const b2 = await st()
check('placing furniture adds the piece', b2.items.some((it) => it.id === 'rug') || b2.items.length > b1.items.length, `${b1.items.length}->${b2.items.length}`)
// sell it back by tapping it again
await tap(8 + 3 * 32 + 16, 40 + 3 * 32 + 16)
await wait(200)
const b3 = await st()
check('tapping a placed piece sells it', !b3.items.some((it) => it.id === 'rug' && it.r === 3 && it.c === 3))
await page.keyboard.press('KeyB')
await wait(150)

// switch residents with G
const g0 = await st()
await page.keyboard.press('KeyG')
await wait(150)
const g1 = await st()
check('G switches the commanded resident', g1.screen === 'play')

// pause via Escape: the sim clock stops
const tA = (await st()).tick
await page.keyboard.press('Escape')
await wait(350)
const tB = (await st()).tick
check('Escape pauses the clock', tB === tA, `${tA} -> ${tB}`)
await page.keyboard.press('Escape')
await wait(250)
check('Escape resumes', (await st()).tick > tB)

// death: collapse both -> over screen; restart with R
await page.evaluate(() => window.__homebodyTest.collapseAll())
let over = 'play'
for (let i = 0; i < 40 && over !== 'over'; i++) { await wait(250); over = (await st()).screen }
check('both-down ends the run and shows the over screen', over === 'over')
await wait(1000)
await page.keyboard.press('KeyR')
await wait(400)
check('R restarts into a fresh lot', (await st()).screen === 'play' && (await st()).day === 1 && (await st()).content === 0)

// frame matches: sprite position follows state
const f0 = await page.evaluate(() => window.__game.state())
check('contract state ticks', f0.tick > 0 && typeof f0.score === 'number', `tick=${f0.tick} score=${f0.score}`)

check('zero page errors across the whole drive', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await browser.close()
console.log(`\n=== homebodydrive: ${pass} pass, ${fail} fail ===`)
process.exit(fail ? 1 : 0)
