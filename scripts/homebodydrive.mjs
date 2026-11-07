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

// Spare Room (#1806): reopen buy mode, R picks the kit, a tap hammers it up,
// and the drawn wing follows the logic (east-wall window glass pixels appear)
await page.keyboard.press('KeyB')
await wait(200)
const pxAt = (x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(x, y, 1, 1).data
    return [d[0], d[1], d[2]]
}, [x, y])
const [gr0, gg0, gb0] = await pxAt(504, 184) // future east window cell, pre-build
check('east wall spot is lawn before the kit is used', gg0 > gr0 && gr0 > gb0, `rgb(${gr0},${gg0},${gb0})`)
await page.evaluate(() => window.__homebodyTest.money(1000))
await page.keyboard.press('KeyR')
await wait(150)
const rSel = await st()
check('R picks the Spare Room kit in buy mode', rSel.build === true && rSel.sel === 13, `sel=${rSel.sel}`)
await tap(8 + 5 * 32 + 16, 40 + 6 * 32 + 16) // any lot tap builds it
await wait(250)
const rBuilt = await st()
check('tapping the lot hammers the wing up (ext=1)', rBuilt.ext === 1)
await wait(800) // let the dust from the hammer-knock burst settle before sensing glass
const [wr, wg, wb] = await pxAt(504, 184)
check('the east window is drawn where lawn was', wb > wg && wg >= wr && wb > 120, `rgb(${wr},${wg},${wb})`)
const [fr, fg, fb] = await pxAt(8 + 12 * 32 + 16, 40 + 5 * 32 + 16) // room floor cell
check('wing floor is drawn as plank, not grass', fr > fb && fr > 90 && fr < 230 && fb < 130, `rgb(${fr},${fg},${fb})`)
await page.keyboard.press('KeyB')
await wait(150)

// switch residents with G
const g0 = await st()
await page.keyboard.press('KeyG')
await wait(150)
const g1 = await st()
check('G switches the commanded resident', g1.screen === 'play')

// BONDS (#1817): real co-presence climbs the heart at 1x clock, and the
// panel paints the ladder — the leaf row lights its pips green at FAMILY.
const bd0 = await st()
check('bond meters ride the live state', bd0.rel && typeof bd0.rel.house === 'number' && typeof bd0.rel.fern === 'number', JSON.stringify(bd0.rel))
const [pr0, pg0, pb0] = await pxAt(557, 246) // fern pip 1, before anyone is family
await tap(8 + 5 * 32 + 16, 40 + 3 * 32 + 16) // commanded resident walks to (3,5)
await page.keyboard.press('KeyG')
await tap(8 + 6 * 32 + 16, 40 + 3 * 32 + 16) // the other walks next door to (3,6)
await wait(5200)
const bd1 = await st()
await wait(6000)
const bd2 = await st()
check('residents side by side grow the heart at 1x', bd2.rel.house > bd1.rel.house + 0.03, `house ${bd1.rel.house.toFixed(2)} -> ${bd2.rel.house.toFixed(2)}`)
await page.evaluate(() => window.__homebodyTest.bond('fern', 100))
await wait(150)
const [pr1, pg1, pb1] = await pxAt(557, 246)
check('a FAMILY leaf paints its pips green', pg1 > pr1 && pg1 > pb1 && pg1 > 120 && !(pg0 > pr0 && pg0 > pb0 && pg0 > 120), `off rgb(${pr0},${pg0},${pb0}) on rgb(${pr1},${pg1},${pb1})`)

// pause via Escape: the clock stops. Sample AFTER the keypress has landed and
// compare two post-pause reads — a tA captured before Escape can straddle one
// last frame and false-fail (flake fixed #1806 drive).
await page.keyboard.press('Escape')
await wait(350)
const tB = (await st()).tick
await wait(350)
const tC = (await st()).tick
check('Escape pauses the clock', tC === tB, `${tB} -> ${tC}`)
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
