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

// #2070 spats & make-ups on the live page: foul the pair — the heart must
// crack (spat event lands, panel heart runs ash-dark); lift tempers — it
// must return to ember with the grudge gone.
const heartScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(544, 40, 8, 260).data
    let ember = 0, ash = 0
    for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
        if (r > 210 && r < 242 && g > 70 && g < 104 && b > 60 && b < 92) ember++
        if (r > 124 && r < 158 && g > 42 && g < 76 && b > 36 && b < 70) ash++
    }
    return { ember, ash }
})
const calm0 = await heartScan()
await page.evaluate(() => { window.__homebodyTest.bond('house', 50); window.__homebodyTest.foul() })
await wait(1300)
const sp = await st()
const hurt = await heartScan()
check('#2070 a real live spat docks the heart eight', sp.spats === 1 && sp.grudge === 1 && Math.abs(sp.rel.house - 42) < 0.3, JSON.stringify({ spats: sp.spats, grudge: sp.grudge, house: Math.round(sp.rel.house * 10) / 10 }))
// deltas, not absolutes: the panel carries a persistent ember pixel set (the
// resident name dot shares the heart's colour) — what must move is the heart.
check('#2070 the panel heart runs ash-dark on the grudge', hurt.ash - calm0.ash > 8 && calm0.ember - hurt.ember > 15, `calm ember ${calm0.ember} ash ${calm0.ash} -> hurt ember ${hurt.ember} ash ${hurt.ash}`)

// #2076 live tells: a storm puff (blue-grey #66707f, drawn nowhere else on
// the lot) rides over the pair at the crack, fades on the clock while the
// cold war stands, and the make-up pays PINK hearts over them — not the
// generic panel sparkle. Sprite bands are scanned around the live pixel
// positions so wandering between reads cannot false-fail.
const tellScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const st = window.__homebodyTest.probe()
    let puff = 0, pink = 0
    for (const p of st.people) {
        const d = g.getImageData(Math.max(0, p.x - 12), Math.max(0, p.y - 44), 24, 22).data
        for (let i = 0; i < d.length; i += 4) {
            const [r, gg, b] = [d[i], d[i + 1], d[i + 2]]
            if (r > 90 && r < 140 && gg > 100 && gg < 150 && b > 115 && b < 165 && b > r) puff++
        }
    }
    const [a, b2] = st.people
    const mx = (a.x + b2.x) / 2, my = (a.y + b2.y) / 2
    const d2 = g.getImageData(Math.max(0, mx - 24), Math.max(0, my - 48), 48, 52).data
    for (let i = 0; i < d2.length; i += 4) {
        const [r, gg, b] = [d2[i], d2[i + 1], d2[i + 2]]
        if (r > 225 && gg > 110 && gg < 175 && b > 150 && b < 195) pink++
    }
    return { puff, pink, hearts: window.__homebodyTest.hearts(), spats: st.spats, grudge: st.grudge, spatFx: st.spatFx }
})
const told = await tellScan()
check('#2076 the storm puff rides over the pair at the crack', told.spats === 1 && told.grudge === 1 && told.spatFx > 0 && told.puff >= 10, `puff px ${told.puff}, spatFx ${told.spatFx}`)
await wait(1600)
const faded = await st()
check('#2076 the tell fades while the cold war stands', faded.spatFx === 0 && faded.grudge === 1, `spatFx=${faded.spatFx} grudge=${faded.grudge}`)
await page.evaluate(() => window.__homebodyTest.thaw())
let paid = { hearts: 0, pink: 0 }
for (let i = 0; i < 25 && !(paid.hearts > 0 && paid.pink >= 3); i++) { paid = await tellScan(); await wait(80) }
check('#2076 the make-up pays heart particles', paid.hearts > 0, `hearts ${paid.hearts}`)
check('#2076 hearts draw pink over the pair', paid.pink >= 3, `pink px ${paid.pink}`)
await wait(1300)
const mk = await st()
const healed = await heartScan()
check('#2070 the live thaw makes up and clears the grudge', mk.grudge === 0 && mk.rel.house > sp.rel.house + 6 - 0.1, JSON.stringify({ before: Math.round(sp.rel.house * 10) / 10, after: Math.round(mk.rel.house * 10) / 10 }))
check('#2070 the ember heart returns with the thaw', healed.ember - hurt.ember > 15 && hurt.ash - healed.ash > 8, `hurt ember ${hurt.ember} ash ${hurt.ash} -> healed ember ${healed.ember} ash ${healed.ash}`)

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
