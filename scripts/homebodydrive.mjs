// homebodydrive.mjs — drive HOMEBODY in headless Chrome with real key/tap events.
// start, play, command, die, restart; drawn frame must follow logical state.
import { launch, requireDevServer, openGame } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/homebody`
const CMD_WAIT = 8150   // #2131: CMD_CD (8 s) plus slack — the command cooldown on the real clock
let pass = 0, fail = 0
const check = (n, c, info = '') => { if (c) { pass++; console.log('  ok  ', n, info) } else { fail++; console.log('  FAIL', n, info) } }

await requireDevServer(BASE)
const browser = await launch()
const errors = []
// headless Chrome has no audio device — the AudioContext renderer error is
// environment noise, filtered identically in cottage-drive/britanniadrive/
// lodeplay/papersplay (established doctrine; the sounds themselves are gated
// by the node harness).
const deviceNoise = (s) => /AudioContext encountered an error from the audio device/i.test(String(s || ''))
const page = await openGame(browser, { url: BASE, hook: '__homebodyTest', start: false, wait: 900 })
page.on('pageerror', (e) => { if (!deviceNoise(e)) errors.push(String(e)) })
page.on('console', (m) => { if (m.type() === 'error' && !deviceNoise(m.text())) errors.push(m.text()) })

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

// tap helper: canvas-rect-space clicks shared by every tap gate below. The
// rect is read fresh per click — the canvas settles its CSS box a beat after
// first play, and a rect captured too early skews every click in the run.
const tap = async (x, y) => {
    const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { left: b.left, top: b.top, w: b.width, h: b.height } })
    const px = r.left + (x / 640) * r.w, py = r.top + (y / 480) * r.h
    await page.mouse.click(px, py)
}

// #2244 meal bells live — first, while the residents are fresh (mood 2: full
// walking speed) and the window is whole. Later in the day a paper-commute on
// a hunger-mulled mood outruns the 2.5 h plate and the honest cold-refusal
// eats the drive; served at breakfast the whole table law fits the window.
// A bell rings, a steaming plate lands beside the starter kitchen (real
// pixels), both residents are commanded, and the shared table pays hearts.
{
    await page.evaluate(() => window.__homebodyTest.ringMeal())
    let m = null
    for (let i = 0; i < 60 && !(m = (await st()).meal); i++) await wait(250)
    check('#2244 a bell rings and a plate lies beside the kitchen', !!m, JSON.stringify(m))
    const creamOnce = async () => page.evaluate(([r, c]) => {
        const cvs = document.querySelector('canvas')
        const d = cvs.getContext('2d').getImageData(8 + c * 32 + 4, 40 + r * 32 + 12, 24, 16).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i + 1] > 200 && d[i + 2] > 150 && d[i + 2] < 235) n++   // blend-tolerant: the dish against a resident's denim reads gold-cream, pure #efe9d8 only meets the eye unoccluded
        return n
    }, [m.r, m.c])
    // a resident idling on the tile below hides the dish behind their head —
    // poll: the plate must become visible, not be visible on one lucky frame
    let creamPx = 0
    for (let i = 0; i < 12 && !(creamPx = await creamOnce()); i++) await wait(250)
    check('#2244 the steaming plate is painted on the lot', creamPx >= 10, `cream px ${creamPx}`)
    // Order dinner for the whole household in parallel: the plate keeps a
    // 2.5 h window (~12.5 s) and Otto's commute from the bedroom eats half of
    // it — so tap, switch, tap again, and let both walks run together against
    // the same clock.
    const hBefore = await page.evaluate(() => window.__homebodyTest.hearts())
    await tap(8 + m.c * 32 + 16, 40 + m.r * 32 + 16)
    await page.keyboard.press('KeyG'); await wait(120)
    await tap(8 + m.c * 32 + 16, 40 + m.r * 32 + 16)
    let eaten = 0
    for (let i = 0; i < 400 && !(eaten = (await st()).mealEaten); i++) await wait(60)
    check('#2244 tap orders dinner — a resident eats and stamps the plate', eaten >= 1 && (await st()).people.some((p) => p.mealTaken > 0), `eaten ${eaten}`)
    let cleared = false
    for (let i = 0; i < 400 && !(cleared = !(await st()).meal); i++) await wait(60)
    const hAfter = await page.evaluate(() => window.__homebodyTest.hearts())
    check('#2244 the whole household ate the same plate — hearts paid, the table resets',
        cleared && hAfter > hBefore, `hearts ${hBefore} -> ${hAfter}`)
    // settle: nobody carries a half-eaten hour into the gates below
    for (let i = 0; i < 200 && (await st()).meal; i++) await wait(60)
}

// tap the fridge tile (col 9,row 2) -> resident paths there
// #2470: the queue law keeps a resident's errands; these gates measure a FRESH
// single tap, so the scenario lists are wiped at the boundary first.
await page.evaluate(() => window.__homebodyTest.clearQueues())
const before = await st()
await tap(8 + 9 * 32 + 16, 40 + 2 * 32 + 16) // fridge centre
await wait(150)
const mid = await st()
check('tap registers in play without error', mid.screen === 'play' && errors.length === 0)
// let them walk + eat
let ate = false
for (let i = 0; i < 40 && !ate; i++) { await wait(250); const s = await st(); ate = s.people.some((p) => p.needs.hunger > 0.75) }
check('ordered resident eats the fridge', ate)

// #2238 paper route: the daily lands on the step all by itself (the clock
// scheduled it, nobody ordered it), and one tap sends a resident down to read.
let pp = await st()
for (let i = 0; i < 48 && !pp.paper; i++) { await wait(250); pp = await st() }
check('#2238 the daily lands on the step, hour-scheduled and stamped',
    !!pp.paper && pp.paper.r === 10 && pp.paper.c === 5 && pp.paperDay === pp.day, pp.paper ? `${pp.paper.r},${pp.paper.c} d${pp.paperDay} @${pp.hour}h` : 'never')
const funBefore = Math.max(...pp.people.map((p) => p.needs.fun))
const contBefore = pp.content
await page.evaluate(() => window.__homebodyTest.clearQueues())   // #2470: fresh single tap — the fridge errand upstream must not sit in front of the paper
await tap(8 + 5 * 32 + 16, 40 + 10 * 32 + 16)   // the paper tile
let pr = pp
for (let i = 0; i < 60 && pr.paper; i++) { await wait(250); pr = await st() }
// the read's reward is contentment (monotonic); FUN after a half-lot commute is
// decay soup — the node gate measures the read seated, the drive measures the law.
check('#2238 tapping the paper walks a resident down; the read folds it away and pays',
    !pr.paper && pr.content > contBefore && Math.max(...pr.people.map((p) => p.needs.fun)) > funBefore - 0.45, `content ${contBefore}->${pr.content}, fun ${funBefore.toFixed(2)} -> ${Math.max(...pr.people.map((p) => p.needs.fun)).toFixed(2)}`)   // bound widened 0.2->0.45 for #2244: the meal bells add a commute upstream, so more decay soup rides on the fun line; the law is the content payment


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

// #2689 WINGS: kit two raises the garden — ghost first (hover paints the
// future cottage's door tick green), then the tap, then drawn planks and glass.
await page.evaluate(() => window.__homebodyTest.money(1000))
await page.keyboard.press('KeyB')
await wait(150)
await page.keyboard.press('KeyR')
await wait(150)
await page.mouse.move(8 + 2 * 32 + 16, 40 + 9 * 32 + 16)   // hover the future garden — no click
await wait(120)
const [gtr, gtg, gtb] = await pxAt(88, 312)   // the ghost's door tick at (8,2)
check('#2689 kit two ghosts the garden — green door tick over the back lawn', gtg > 150 && gtg > gtr + 40 && gtg > gtb + 40, `rgb(${gtr},${gtg},${gtb})`)
await tap(8 + 2 * 32 + 16, 40 + 9 * 32 + 16)
await wait(250)
const w2 = await st()
check('#2689 the second kit raises the garden room', w2.ext === 2 && JSON.stringify(w2.wings) === JSON.stringify(['east2', 'garden']), JSON.stringify(w2.wings))
await wait(800)
const [gfr, gfg, gfb] = await pxAt(8 + 1 * 32 + 16, 40 + 10 * 32 + 20)   // garden plank cell, clear of the gold move-in burst and the residents
check('#2689 the garden floor is drawn as plank where lawn was', gfr > gfb && gfr > 90 && gfr < 230 && gfb < 130, `rgb(${gfr},${gfg},${gfb})`)
const [gwr, gwg, gwb] = await pxAt(8 + 4 * 32 + 9, 40 + 10 * 32 + 13)   // garden lower east window glass — below the glint, clear of mullions, off the walk-in route
check('#2689 the garden wears its east window', gwb > gwg && gwb > 120, `rgb(${gwr},${gwg},${gwb})`)
const moneyBefore = (await st()).money
await tap(8 + 2 * 32 + 16, 40 + 9 * 32 + 16)   // a third kit — the lot is full
await wait(250)
const w3 = await st()
check('#2689 a third kit refuses — two rooms is the lot (no money spent)', w3.ext === 2 && w3.money === moneyBefore)
await page.keyboard.press('KeyB')
await wait(150)

// #2689 choose the row: fresh lot, point high on the east lawn, the wing
// takes the top row — the ghost tick rides the cursor before the hammer.
await page.evaluate(() => window.__game.reset())
await wait(300)
await page.keyboard.press('Space')
await wait(400)
await page.evaluate(() => window.__homebodyTest.money(1000))
await page.keyboard.press('KeyB')
await wait(150)
await page.keyboard.press('KeyR')
await wait(150)
await page.keyboard.down('ArrowRight'); await wait(220); await page.keyboard.up('ArrowRight')   // walk the ghost east onto the lawn column (arrows drive the build cursor)
await page.keyboard.down('ArrowRight'); await wait(220); await page.keyboard.up('ArrowRight')
await page.keyboard.down('ArrowRight'); await wait(220); await page.keyboard.up('ArrowRight')
for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']) { await page.keyboard.down(k); await wait(140); await page.keyboard.up(k); await wait(60) }
const [otr, otg, otb] = await pxAt(8 + 11 * 32 + 16, 40 + 2 * 32 + 16)   // ghost door tick at (2,11)
check('#2689 pointing high moves the ghost too — green tick at the top-row door', otg > 150 && otg > otr + 40 && otg > otb + 40, `rgb(${otr},${otg},${otb})`)
await tap(8 + 13 * 32 + 16, 40 + 1 * 32 + 16)
await wait(250)
const wH = await st()
check('#2689 the hammer lands where you pointed — wing stands at the top row', wH.ext === 1 && JSON.stringify(wH.wings) === JSON.stringify(['east0']), JSON.stringify(wH.wings))
await wait(800)
const [hwr, hwg, hwb] = await pxAt(8 + 15 * 32 + 9, 40 + 2 * 32 + 18)   // top-row east window at (2,15) — below the glint and the mullions
check('#2689 the chosen wing glows its own windows where lawn was', hwb > hwg && hwb > 120, `rgb(${hwr},${hwg},${hwb})`)
const mH = wH.money
await tap(8 + 2 * 32 + 16, 40 + 9 * 32 + 16)   // garden still fits after a top-row wing
await wait(250)
const wH2 = await st()
check('#2689 garden stands after the chosen row too — two rooms, both paid', wH2.ext === 2 && wH2.money === mH - 90 && JSON.stringify(wH2.wings) === JSON.stringify(['east0', 'garden']), JSON.stringify(wH2.wings))   // #2721: the cottage pays its own §90 (8 planks, a door through a standing wall), not the placeholder §300
await page.keyboard.press('KeyB')
await wait(150)

// #2695 PURPOSE: the garden ripens on the live lot. Park the clock at dawn,
// crank FAST, and the herb ledger must grow on the probe while the sun is up
// — the east room never tends, and the ledger reads before and after.
const pu0 = await st()
check('#2695 fresh rooms open with clean ledgers',
    (pu0.purpose || []).length === 2 && pu0.purpose.every((p) => Number(p.split(':')[1]) === 0 && Number(p.split(':')[2]) === 0), JSON.stringify(pu0.purpose))
const h0 = pu0.hour
await page.evaluate(() => window.__homebodyTest.hour(8))
await page.keyboard.press('Digit3')   // FAST — the harvest must land in seconds, not minutes
let pu1 = pu0
for (let i = 0; i < 60; i++) {
    pu1 = await st()
    if ((pu1.purpose || []).some((p) => p.startsWith('garden:') && Number(p.split(':')[1]) >= 1)) break
    await wait(250)
}
check('#2695 the garden ripens with the sun — the live ledger grows',
    (pu1.purpose || []).some((p) => p.startsWith('garden:') && Number(p.split(':')[1]) >= 1)
    && (pu1.purpose || []).every((p) => p.split(':')[0] === 'garden' || Number(p.split(':')[1]) === 0), JSON.stringify(pu1.purpose))
await page.keyboard.press('Digit2')   // back to NORMAL for the legs that follow
await page.evaluate((h) => window.__homebodyTest.hour(h), h0)   // scenario-clock rewind (#2672 idiom) — later legs meet the clock they expect
await wait(120)

// switch residents with G
const g0 = await st()
await page.keyboard.press('KeyG')
await wait(150)
const g1 = await st()
check('G switches the commanded resident', g1.screen === 'play')

// BONDS (#1817): real co-presence climbs the heart at 1x clock, and the
// panel paints the ladder — the leaf row lights its pips green at FAMILY.
// park first: tempers neutral and the spat clock re-armed, so the pair's
// only barbs downstream are the ones the gates rig themselves.
await page.evaluate(() => window.__homebodyTest.park())
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
await page.evaluate(() => { window.__homebodyTest.park(); window.__homebodyTest.bond('house', 0) })   // clean tempers, positions AND baseline shade: the calm scan, the crack and the puff all sample the known pair the panel colour gates were calibrated at (the meal bond paid +2 upstream; this gate re-bonds to 50 anyway)
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
const calm0 = await heartScan()
await page.evaluate(() => { window.__homebodyTest.bond('house', 50); window.__homebodyTest.foul() })
await wait(1300)
const sp = await st()
// the crack blooms over ~2 s — one late sample straddles the transition, so
// judge the tell across frames and take its fullest ash. #2076's puff lives
// only spatFx (2.4 s), so it is sampled in the same window.
const hurtSamples = [], toldSamples = []
for (let i = 0; i < 8; i++) { hurtSamples.push(await heartScan()); toldSamples.push(await tellScan()); await wait(300) }
const hurt = hurtSamples.reduce((m, x) => (x.ash > m.ash ? x : m))
const told = toldSamples.reduce((m, x) => (x.puff > m.puff ? x : m))
check('#2070 a real live spat docks the heart eight', sp.spats === 1 && sp.grudge === 1 && Math.abs(sp.rel.house - 42) < 0.3, JSON.stringify({ spats: sp.spats, grudge: sp.grudge, house: Math.round(sp.rel.house * 10) / 10 }))
// deltas, not absolutes: the panel carries a persistent ember pixel set (the
// resident name dot shares the heart's colour) — what must move is the heart.
check('#2070 the panel heart runs ash-dark on the grudge', hurt.ash - calm0.ash > 8 && calm0.ember - hurt.ember > 15, `calm ember ${calm0.ember} ash ${calm0.ash} -> hurt ember ${hurt.ember} ash ${hurt.ash}`)
check('#2076 the storm puff rides over the pair at the crack', told.spats === 1 && told.grudge === 1 && told.spatFx > 0 && told.puff >= 10, `puff px ${told.puff}, spatFx ${told.spatFx}`)

// #2076 live tells: a storm puff (blue-grey #66707f, drawn nowhere else on
// the lot) rides over the pair at the crack, fades on the clock while the
// cold war stands, and the make-up pays PINK hearts over them — not the
// generic panel sparkle. Sprite bands are scanned around the live pixel
// positions so wandering between reads cannot false-fail. (tellScan lives up
// with the panel scans — #2244 samples both tells inside one spat window.)
await wait(1600)
const faded = await st()
check('#2076 the tell fades while the cold war stands', faded.spatFx === 0 && faded.grudge === 1, `spatFx=${faded.spatFx} grudge=${faded.grudge}`)
await page.evaluate(() => { window.__homebodyTest.park(); window.__homebodyTest.thaw() })   // #2131: re-park — idle wander between foul and thaw must not carry the pair out of reach
let paid = { hearts: 0, pink: 0 }
for (let i = 0; i < 25 && !(paid.hearts > 0 && paid.pink >= 3); i++) { paid = await tellScan(); await wait(80) }
check('#2076 the make-up pays heart particles', paid.hearts > 0, `hearts ${paid.hearts}`)
check('#2076 hearts draw pink over the pair', paid.pink >= 3, `pink px ${paid.pink}`)
await wait(1300)
const mk = await st()
const healed = await heartScan()
check('#2070 the live thaw makes up and clears the grudge', mk.grudge === 0 && mk.rel.house > sp.rel.house + 6 - 0.1, JSON.stringify({ before: Math.round(sp.rel.house * 10) / 10, after: Math.round(mk.rel.house * 10) / 10 }))
check('#2070 the ember heart returns with the thaw', healed.ember - hurt.ember > 15 && hurt.ash - healed.ash > 8, `hurt ember ${hurt.ember} ash ${hurt.ash} -> healed ember ${healed.ember} ash ${healed.ash}`)

// #2131 player-ordered romance on real keys — the pair still stands side by
// side at the parked cells (the thaw lifted tempers, not positions). A real X
// press cuts and starts the cold war; after the cooldown, a real C press at
// FAMILY deepens into affection with its own chord + hearts pixels.
const cd0 = await st()
await page.evaluate(() => window.__homebodyTest.park())
const ready = await st()
await page.keyboard.press('KeyX')
await wait(250)
const cut = await st()
check('#2131 a real X press cuts the heart and sets the grudge',
    cut.grudge === 1 && Math.abs(cut.rel.house - (cd0.rel.house - 4)) < 0.5 && cut.courtKind === 'house',
    JSON.stringify({ before: Math.round(cd0.rel.house * 10) / 10, after: Math.round(cut.rel.house * 10) / 10, grudge: cut.grudge, readyCd: ready.cmdCd, readyKind: ready.courtKind, cutCd: cut.cmdCd, cutKind: cut.courtKind }))
await wait(CMD_WAIT)
// pair may have idled apart during the cooldown — foul re-parks them side by side
await page.evaluate(() => window.__homebodyTest.park())
await page.evaluate(() => window.__homebodyTest.bond('house', 60))
await page.keyboard.press('KeyC')
await wait(250)
const deep = await st()
check('#2131 a real C press at FAMILY deepens into affection (double pay)',
    deep.cooDeep && Math.abs(deep.rel.house - (60 + 6)) < 1.2 && deep.cmdCd > 0,
    JSON.stringify({ house: Math.round(deep.rel.house * 10) / 10, cmdCd: deep.cmdCd }))
const paid2 = await tellScan()
check('#2131 affection pays pink over the pair (hearts, not panel sparkle)', paid2.pink >= 3, `pink px ${paid2.pink}`)

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

// #2131 doctrine on the fresh lot: the pair starts apart, so a Space press must
// stay the OLD nothing — the compliment only rides when someone is in reach.
await page.keyboard.press('Space')
await wait(300)
const doctr = await st()
check('#2131 far apart, Space stays the old empty press — no meter, no cooldown',
    doctr.rel.house === 0 && doctr.cmdCd === 0 && doctr.courtKind === null, JSON.stringify({ rel: doctr.rel.house, cmdCd: doctr.cmdCd, kind: doctr.courtKind }))

// #2143 live: Ivy rings, walks in wearing plum, and from FRIENDS up her visit
// carries the basket — pixels first, then the panel's flower row lights for her.
await page.evaluate(() => window.__homebodyTest.ringIvy())
let iv = null
for (let i = 0; i < 40 && !iv; i++) { await wait(250); iv = (await st()).ivy }
check('#2143 Ivy arrives on the live lot', !!iv && iv.name === 'Ivy', JSON.stringify(iv))
await wait(2600)   // let her walk in from the gate
const ivp = (await st()).ivy
const plum = await page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(Math.max(0, x - 12), Math.max(0, y - 16), 24, 28).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xa3) < 28 && Math.abs(d[i + 1] - 0x57) < 28 && Math.abs(d[i + 2] - 0x9b) < 28) n++
    return n
}, [ivp.x, ivp.y])
check('#2143 the drawn sprite is Ivy-plum — nobody else wears it', plum >= 12, `plum px ${plum}`)
await page.evaluate(() => { window.__homebodyTest.bond('ivy', 30); window.__homebodyTest.ivyHome() })
for (let i = 0; i < 60; i++) { await wait(200); if (!(await st()).ivy) break }   // gone through the gate — schedule re-arms
await page.evaluate(() => window.__homebodyTest.ringIvy())                          // ring it back on the new tier
let gift = false
for (let i = 0; i < 80 && !gift; i++) { await wait(250); const p = await st(); gift = !!(p.ivy && p.ivy.gift) }
check('#2143 the FRIENDS-tier return carries the market basket', gift, JSON.stringify((await st()).ivy))
const iv2 = (await st()).ivy
const tan = await page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(Math.max(0, x - 4), Math.max(0, y - 6), 20, 18).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xc9) < 30 && Math.abs(d[i + 1] - 0x99) < 30 && Math.abs(d[i + 2] - 0x5c) < 30) n++
    return n
}, [iv2.x + 8, iv2.y + 4])
check('#2143 the basket is painted at her side', tan >= 8, `tan px ${tan}`)
await page.evaluate(() => window.__homebodyTest.bond('ivy', 60))
await wait(250)
const [vr, vg, vb] = await pxAt(557, 260)   // flower row, first pip — FAMILY now
check('#2143 the panel runs a third BONDS row and paints Ivy pips plum', vr > vg + 24 && vb > vg + 24 && vr > 110, `rgb(${vr},${vg},${vb})`)

// #2222 catalog shelves: [ ] flip, tap a shelf name, digits pick within the shelf
const stWait = async (pred, cap = 60) => {   // poll instead of fixed sleeps — CI Chrome lags
    let s = await st()
    for (let i = 0; i < cap && !pred(s); i++) { await wait(50); s = await st() }
    return s
}
let sv = await st()
if (!sv.build) { await page.keyboard.press('KeyB'); sv = await stWait((x) => x.build) }
check('#2222 buy mode opens on the HOME shelf', sv.build === true && sv.tab === 0, `tab=${sv.tab}`)
await page.keyboard.press('BracketRight')
let sh = await stWait((x) => x.tab === 1)
check('#2222 ] flips to FUN and the selection rides the shelf', sh.tab === 1 && sh.sel === 4, `tab=${sh.tab} sel=${sh.sel}`)
await page.keyboard.press('Digit2')
sh = await stWait((x) => x.sel === 5)
check('#2222 digit 2 picks within the open shelf (radio)', sh.sel === 5, `sel=${sh.sel}`)
await page.keyboard.press('BracketLeft')
sh = await stWait((x) => x.tab === 0)
check('#2222 [ flips back to HOME', sh.tab === 0, `tab=${sh.tab}`)
// tap the SPECIAL tab (4th of 4 across the tray), then verify logic + pixels
await tap(6 + 3 * 129 + 62, 480 - 56 + 8)
sh = await stWait((x) => x.tab === 3)
check('#2222 tapping the SPECIAL tab opens it on its first card', sh.tab === 3 && sh.sel === 13, `tab=${sh.tab} sel=${sh.sel}`)
// the pointer handler mutates gs synchronously — let the loop paint the new shelf first
await wait(150)
const goldIn = (x0, x1) => page.evaluate(([x0, x1]) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(x0, 426, x1 - x0, 13).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 180 && d[i + 1] < 236 && d[i + 2] < 110) n++
    return n
}, [x0, x1])
const goldSpecial = await goldIn(6 + 3 * 129, 6 + 3 * 129 + 125)
const goldHome = await goldIn(6, 6 + 125)
check('#2222 the open tab is painted gold and the closed one is not', goldSpecial >= 10 && goldHome < 10, `special=${goldSpecial} home=${goldHome}`)
await page.keyboard.press('KeyB'); await wait(150)

// #2227 speed dial: keys set gears, pause freezes the world clock, `,` `.`
// cycle and wrap, the panel pips answer taps — and buy-mode digits keep their
// #2222 card law while the dial still turns under a finger.
let sd = await st()
if (sd.build) { await page.keyboard.press('KeyB'); sd = await stWait((x) => !x.build) }
check('#2227 a fresh street starts at NORMAL', sd.speed === 1, `speed=${sd.speed}`)
await page.keyboard.press('Digit3')
sd = await stWait((x) => x.speed === 2)
check('#2227 digit 3 outside buy sets FAST', sd.speed === 2 && sd.speedName === 'FAST', `speed=${sd.speed}`)
const hk0 = (await st()).hour
await wait(500)
const hk1 = (await st()).hour
check('#2227 FAST hurries the clock', hk1 > hk0, `hour ${hk0} -> ${hk1}`)
await page.keyboard.press('Digit1')
sd = await stWait((x) => x.speed === 0)
const hkP = (await st()).hour
await wait(500)
const hkQ = (await st()).hour
check('#2227 digit 1 pauses — the clock stands still', sd.speed === 0 && hkQ === hkP, `hour ${hkP} -> ${hkQ}`)
// drawn dial follows logic: the pause pip glows gold, the fast pip does not
const dialGold = (x0, x1) => page.evaluate(([x0, x1]) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(x0, 480 - 124, x1 - x0, 14).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 180 && d[i + 1] < 236 && d[i + 2] < 110) n++
    return n
}, [x0, x1])
const goldPause = await dialGold(540, 559)
const goldFast = await dialGold(586, 605)
check('#2227 the chosen pip is painted gold and its neighbour is not', goldPause >= 12 && goldFast < 12, `pause=${goldPause} fast=${goldFast}`)
await page.keyboard.press('Period')
sd = await stWait((x) => x.speed === 1)
check('#2227 . cycles up from PAUSED and the world walks again', sd.speed === 1, `speed=${sd.speed}`)
await page.keyboard.press('Comma')
sd = await stWait((x) => x.speed === 0)
await page.keyboard.press('Comma')
sd = await stWait((x) => x.speed === 3)
check('#2227 , wraps PAUSED into FASTEST', sd.speed === 3, `speed=${sd.speed}`)
await tap(572, 363)   // the NORMAL pip, second cell of the panel dial
sd = await stWait((x) => x.speed === 1)
check('#2227 a tap on the panel dial turns it — the pad route', sd.speed === 1, `speed=${sd.speed}`)
// buy mode: digits keep the shelf law; the dial still answers taps while paused
await page.keyboard.press('KeyB')
sd = await stWait((x) => x.build)
await tap(549, 363)   // tap PAUSE (first pip) — digits are cards here, the dial takes taps
sd = await stWait((x) => x.speed === 0)
await page.keyboard.press('Digit2')
await wait(150)
sd = await st()
check('#2227 paused + buying: digit 2 never turns the dial', sd.speed === 0 && sd.build, `speed=${sd.speed}`)
await tap(595, 363)   // FAST pip — the tap route turns the gear even while paused
sd = await stWait((x) => x.speed === 2)
check('#2227 paused + buying, the dial tap still answers', sd.speed === 2 && sd.build, `speed=${sd.speed}`)
let sLand = sd
for (let i = 0; i < 40 && sLand.sel === 13; i++) { await wait(50); sLand = await st() }
check('#2227 the paused digit lands the moment the world walks — the card law queued, not lost', sLand.sel === 14, `sel=${sLand.sel}`)
// buy mode keeps its own time-out (#1806 law: advance() stands still at the
// counter, the original's build/buy pause). The dial's law behind the counter
// is that it still ANSWERS and its state survives the visit.
await wait(500)
const hkR = (await st()).hour
await wait(500)
check('#2227 buy mode keeps its time-out — the clock waits at the counter, gear held', (await st()).hour === hkR && (await st()).speed === 2, `hour ${hkR}`)
await page.keyboard.press('KeyB')
await wait(150)
await page.keyboard.press('Digit2')
sd = await stWait((x) => x.speed === 1)
check('#2227 the drive leaves the house at NORMAL', sd.speed === 1)

// #2240 — the basket lands with real pixels, then the BONDS panel reads at
// phone scale. First: FAMILY-tier Ivy is rung in; her gift gets SET DOWN on
// the kitchen floor (weave + greens + tomato, honey rides the top tier).
{
    await page.evaluate(() => { window.__homebodyTest.ivyFamily(); window.__homebodyTest.ringIvy() })
    let landed = false
    for (let i = 0; i < 120 && !landed; i++) { landed = (await st()).giftFx > 0; if (!landed) await wait(250) }
    const gp = landed ? await page.evaluate(() => window.__homebodyTest.giftPix()) : null
    check('#2240 the gift basket lands on the kitchen floor — weave, greens, tomato and FAMILY honey all paint',
        !!gp && gp.weave > 20 && gp.greens > 0 && gp.tomato > 0 && gp.honey > 0, JSON.stringify(gp))
    check('#2240 the set-down times itself (5 s of real clock)', !!gp && gp.t > 0 && gp.t <= 5, gp ? `t=${gp.t}` : 'no landing')
    // #2752: furnish a wing through the drive hook before the phone-scale
    // sampling — a Bookshelf on the standing wing's floorboards puts a study
    // badge on the doorstep, and the loop below keeps the #2743 `badges`
    // probe, which until now had nothing to look at at phone size.
    const wtOk = await page.evaluate(() => window.__homebodyTest.wingToy())
    const wtProbe = await st()
    check('#2752 the rig stands its Bookshelf on the wing floor — the derivation names the room before the scale-down',
        !!wtOk && wtOk.kind === 'study' && wtProbe.purpose.some((p) => p.includes('study')), JSON.stringify({ wtOk, purpose: wtProbe.purpose }))
    // Phone scale: resample at the CSS box the compositor shows on a 390-px
    // viewport and prove the panel survives the blur — glyph + label ink on
    // every row, three separated label bands, and the FAMILY gold pulse.
    const vp = page.viewportSize()
    await page.setViewportSize({ width: 390, height: 844 })
    await wait(600)
    // The gold tile pulses its alpha — sample across phases and keep the best
    // counts, so the leg asks "does the ink ever read" not "did one frame win
    // the lottery" (same lesson the dial-gold flake teaches).
    let bp = null
    for (let i = 0; i < 10; i++) {
        const b = await page.evaluate(() => window.__homebodyTest.bondsPix())
        if (b) bp = !bp ? b : {
            k: b.k,
            bands: Math.max(bp.bands, b.bands),
            rows: b.rows.map((r, j) => {
                const p = bp.rows[j] || r
                return { ...r, glyph: Math.max(r.glyph, p.glyph), labelInk: Math.max(r.labelInk, p.labelInk), pips: Math.max(r.pips, p.pips), gold: Math.max(r.gold, p.gold) }
            }),
            badges: (b.badges || []).map((x, j) => {   // #2752: the door badges ride the same phase-max merge (the glyph is static, the fill pulses with plays)
                const p = (bp.badges || [])[j] || x
                return { ...x, glyph: Math.max(x.glyph, p.glyph), rampTrack: Math.max(x.rampTrack, p.rampTrack), rampFill: Math.max(x.rampFill, p.rampFill) }
            }),
        }
        if (bp && bp.rows.every((r) => r.glyph > 0 && r.labelInk > 0) && bp.rows.some((r) => r.gold > 0)
            && (bp.badges || []).every((x) => x.glyph > 0 && x.rampTrack > 0)) break   // #2752: keep sampling till the badge ink reads too
        await wait(120)
    }
    await page.setViewportSize(vp)
    await wait(300)
    check('#2240 BONDS at phone scale — glyph and label ink survive the resample on every row',
        !!bp && bp.k < 0.65 && bp.rows.length === 4 && bp.rows.every((r) => r.glyph > 0 && r.labelInk > 0),
        JSON.stringify(bp && { k: bp.k, rows: bp.rows.map((r) => `${r.label}:${r.glyph}/${r.labelInk}/${r.pips}`) }))
    check('#2240 the bond rows (now four, #2588 included) stay separated at phone size, and the FAMILY pulse keeps its gold',
        !!bp && bp.bands >= 3 && bp.rows.some((r) => r.key !== 'kid' && r.gold > 0),
        JSON.stringify(bp && { bands: bp.bands, gold: bp.rows.map((r) => r.gold) }))
    check('#2752 the phone-scale probe carries the door badge — the named room rides the resample',
        !!bp && Array.isArray(bp.badges) && bp.badges.length === 1 && bp.badges[0].kind === 'study',
        JSON.stringify(bp && bp.badges))
    check('#2752 badge ink survives the 390-px blur — the book glyph and the dark ramp track both read at phone size',
        !!bp && (bp.badges || []).length === 1 && bp.badges.every((x) => x.glyph > 0 && x.rampTrack > 0),
        JSON.stringify(bp && bp.badges && bp.badges.map((x) => `${x.kind}:${x.glyph}/${x.rampTrack}`)))
}

// frame matches: sprite position follows state
const f0 = await page.evaluate(() => window.__game.state())
check('contract state ticks', f0.tick > 0 && typeof f0.score === 'number', `tick=${f0.tick} score=${f0.score}`)

// #2240 attract sells Ivy — last, after a reload, so waiting on her never
// delays the morning windows above. Whatever her schedule rolled, the demo run
// shows the second neighbour on the lot (her own clock, or the noon rescue
// when the roll strands her behind 19:00), and the ring has fired once.
{
    await page.reload({ waitUntil: 'load' })
    await wait(1200)
    let seen = 0, rung = 0, hour = 0
    for (let i = 0; i < 360 && !(seen && rung); i++) {
        const a = await page.evaluate(() => (window.__homebodyTest ? window.__homebodyTest.attractIvy() : null))
        if (a) { seen = a.ivy ? 1 : 0; rung = a.demoIvy || 0; hour = a.hour }
        await wait(250)
    }
    check('#2240 attract shows Ivy on the lot and rings her once', !!seen && rung === 1, `ivy=${seen} demoIvy=${rung} hour=${hour}`)
}

// #2599 handoff 2 + item 1 live: the cold pair murmurs, and the plate wears
// the pair. Rig the guests seated apart and cold, murmur clock at 1.6 s; the
// sour beat then fires on its armed clock and the split-rim bubble (Fern-green
// left half, Ivy-plum right) paints ABOVE their heads — the dresses wear the
// same hues, but the sample band sits clear of the sprites, where only a pair
// plate ever paints (resident chatter is cream-and-brown, and both hues at
// once sit nowhere else up there).
{
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(500) }
    const pairScan = () => page.evaluate(() => {
        const c = document.querySelector('canvas'), g = c.getContext('2d', { willReadFrequently: true })
        const d = g.getImageData(94, 76, 224, 40).data
        let green = 0, plum = 0
        for (let i = 0; i < d.length; i += 4) {
            const [r, gg, b] = [d[i], d[i + 1], d[i + 2]]
            if (r > 55 && r < 115 && gg > 145 && gg < 205 && b > 70 && b < 125 && gg > b && gg > r) green++
            if (r > 135 && r < 195 && gg > 60 && gg < 115 && b > 125 && b < 185 && r > gg && b > gg) plum++
        }
        return { green, plum }
    })
    await page.evaluate(() => window.__homebodyTest.pairCold(1.6))
    await wait(700)
    const quiet = await pairScan()
    const samples = []
    for (let i = 0; i < 10; i++) { samples.push(await pairScan()); await wait(300) }
    const best = samples.reduce((m, x) => (x.green + x.plum > m.green + m.plum ? x : m))
    check('#2599 the cold pair murmurs live — the sour beat paints a pair-hued plate above them',
        quiet.green + quiet.plum < 6 && best.green >= 5 && best.plum >= 5, `quiet=${quiet.green}/${quiet.plum} best=${best.green}/${best.plum}`)
}

// #2474 items 2+4 live: the queue chips LEARN their names and MOVE with a beat.
// Route: tap the fridge (issues a walk), tap it again while busy (the errand
// appends as a chip). Then the mouse over the chip reads its name (blue label
// pixels paint under the row), and a tap on the chip cancels it — the row arms
// its collapse beat (probe.collapse goes live for the fade).
{
    const LOTX = 8, LOTY = 40, TL = 32
    const panelX = 528, qx0 = panelX + 26, qy0 = LOTY + 94, cw = 19, gap = 3
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(400) }   // the Ivy attract leg left us on the marquee
    const ss = await st()
    const fr = ss.items.find((it) => it.id === 'fridge')
    const frx = LOTX + fr.c * TL + TL / 2, fry = LOTY + fr.r * TL + TL / 2
    const canvasPt = async (x, y) => {
        const b = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height } })
        return [b.l + (x / 640) * b.w, b.t + (y / 480) * b.h]
    }
    await tap(frx, fry)   // issue the walk
    await wait(120)
    await tap(frx, fry)   // busy tap — the errand joins the list
    let qn = 0
    for (let i = 0; i < 40 && !(qn = ((await st()).queues || [])[0]?.length); i++) await wait(50)
    check('#2474 a busy tap joins the list (a chip sits in the row)', qn >= 1, `queue=${qn}`)
    // The chip's x depends on whether a NOW cell leads (errand in flight): head
    // slot qx0, or shifted right one cell after the NOW tell. Hover the shifted
    // slot first, fall back to the head slot.
    const chipCxShifted = qx0 + (cw + gap) + cw / 2
    const chipCxHead = qx0 + cw / 2
    const chipCy = qy0 + 7
    let hoverName = null
    for (let i = 0; i < 24 && !hoverName; i++) {
        const [hx, hy] = await canvasPt(chipCxShifted, chipCy)
        await page.mouse.move(hx, hy)
        hoverName = (await st()).hoverName
        if (!hoverName) { const [ax, ay] = await canvasPt(chipCxHead, chipCy); await page.mouse.move(ax, ay); hoverName = (await st()).hoverName }
        await wait(50)
    }
    check('#2474 item 2 hover reads the chip its name', hoverName === 'FRIDGE' || hoverName === 'PORCELAIN THRONE' || hoverName === 'WALK', JSON.stringify(hoverName))
    const ink = await page.evaluate(([x0, y0]) => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(x0, y0, 80, 9).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i] < 190 && d[i + 1] > 150 && d[i + 1] < 205 && d[i + 2] > 190) n++   // #8fa2c8 label text
        return n
    }, [qx0, qy0 + 15])
    check('#2474 item 2 the name paints under the row', ink >= 6, `label ink ${ink}`)
    const [ox, oy] = await canvasPt(panelX + 2, LOTY + 4)   // panel header, off any chip
    await page.mouse.move(ox, oy)
    let cleared = false
    for (let i = 0; i < 20 && !cleared; i++) { cleared = !(await st()).hoverName; await wait(50) }
    check('#2474 item 2 the name clears when the pointer leaves', cleared)
    // cancel THAT pending chip by tapping it while the NOW errand still runs
    // (so the chip persists across a frame boundary) — the row arms its collapse beat.
    const piC = (await st()).active
    let armed = false
    for (const cx of [chipCxShifted, chipCxHead]) {
        if (!(await st()).queues[piC]?.length) break
        const [cxp, cyp] = await canvasPt(cx, chipCy)
        await page.mouse.click(cxp, cyp)
        for (let i = 0; i < 20 && !armed; i++) { armed = ((await st()).collapse || []).some((v) => v > 0); await wait(30) }
        if (armed) break
    }
    check('#2474 item 4 cancelling a chip arms the row-collapse beat', armed && (await st()).queues[piC].length === 0, `collapse=${JSON.stringify((await st()).collapse)}`)
}

// #2532 — Miso's even-night prowl live: no cat refuses in words, a real adoption
// puts Miso on the lot, the rig opens the flap, and the drive SEES the walk —
// the banner names it, the sprite's own cell changes, amber night-eyes ride the
// head — and the night ends with her home, stamped, one visit on the serial.
{
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(400) }
    const noCat = await page.evaluate(() => window.__homebodyTest.ringProwl())
    check('#2532 no cat, no call — the rig refuses in words on a catless lot',
        /no cat/.test(String(noCat)) && (await st()).prowl === null, String(noCat))
    await page.evaluate(() => { window.__homebodyTest.money(1000); window.__homebodyTest.adopt() })
    const ad = await st()
    check('#2532 the counter sells Miso to the lot', !!ad.pet && ad.pet.name === 'Miso', JSON.stringify(ad.pet && ad.pet.name))
    const ledger0 = ad.prowlLedger
    await page.evaluate(() => window.__homebodyTest.ringProwl())
    let pw = null
    for (let i = 0; i < 80 && !(pw = (await st()).prowl); i++) await wait(50)
    check('#2532 the flap opens — the drive reads the cat out on the lot', !!pw && pw.state === 'out', JSON.stringify(pw))
    // the banner: cream glyphs (cream #ffe9a8 lives nowhere else on screen) on the
    // front-lawn card, y≈348
    const bannerInk = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(150, 334, 340, 30).data
        let ink = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 215 && d[i + 2] > 140 && d[i + 2] < 232) ink++
        return ink
    })
    // night-eyes: amber #ffb347 around the sprite head — the golds on the lot
    // (#ffd24a, g=210) sit above the window, the tabby (#d98e4a) below r=240
    const eyesScan = async () => {
        const p = (await st()).pet
        if (!p) return 0
        return page.evaluate(([x, y]) => {
            const c = document.querySelector('canvas')
            const d = c.getContext('2d').getImageData(Math.max(0, x - 12), Math.max(0, y - 18), 24, 12).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 160 && d[i + 1] < 200 && d[i + 2] < 110) n++
            return n
        }, [p.x, p.y])
    }
    let outInk = 0, moved = false
    const cell0 = [ad.pet.r, ad.pet.c]
    for (let i = 0; i < 40 && (!moved || !outInk); i++) {
        outInk = Math.max(outInk, await bannerInk())
        const s = await st()
        if (s.pet && (s.pet.r !== cell0[0] || s.pet.c !== cell0[1])) moved = true
        await wait(60)
    }
    check('#2532 the walk-out banner paints cream over the lawn', outInk >= 20, `ink ${outInk}`)
    check('#2532 the sprite walks where the logic says — her cell changes on the lot', moved, `from d(${cell0})`)
    let amber = 0
    for (let i = 0; i < 12 && !(amber = await eyesScan()); i++) await wait(80)
    check('#2532 night-eyes — amber glints paint while she works the lot', amber >= 4, `amber px ${amber}`)
    // the whole errand home: dial FASTEST and wait out both legs (or midnight)
    await page.keyboard.press('Digit4')
    let home = null, homeInk = 0
    for (let i = 0; i < 400 && !home; i++) {
        const s = await st()
        if (!s.prowl) { homeInk = Math.max(homeInk, await bannerInk()); if ((s.prowlLedger || {}).serial >= ledger0.serial + 1) home = s }
        await wait(100)
    }
    check('#2532 the night ends — home, stamped, one visit on the serial',
        !!home && home.prowl === null && home.prowlLedger.night === home.day && home.prowlLedger.serial === ledger0.serial + 1,
        JSON.stringify(home && home.prowlLedger))
    check('#2532 the home banner paints too — the lift-home is voiced on screen', homeInk >= 20, `ink ${homeInk}`)
    await page.keyboard.press('Digit2')
    await stWait((x) => x.speed === 1)
}

// #2508 item 1 — the ice-cream truck rolls, it no longer teleports. Read the
// view state machine live: off → in (x climbs from off-screen west) → parked at
// the cone → out (x climbs east) → off. Pixels prove the body too: the street
// strip below the fence gains a pastel-mint census while the truck crosses it
// and gives it back after the drive-off (relative to its own baseline — the
// strip's own night tint may shift, so only the truck's own pixels make it move).
{
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(400) }
    const t0s = await st()
    check('#2508 no truck on the street before the jingle', t0s.truckView.phase === 'off' && t0s.cone === null, JSON.stringify(t0s.truckView))
    const mintBand = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(220, 434, 200, 44).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) {
            const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
            if (d[i + 3] > 200 && r < 200 && g > 140 && b > 140 && b > r + 30 && g > r + 20) n++   // pastel mint family, tint-tolerant
        }
        return n
    })
    const mint0 = await mintBand()
    await page.evaluate(() => { window.__homebodyTest.money(500); window.__homebodyTest.ringTruck() })
    let seenIn = false, parkedView = null
    const xsIn = []
    for (let i = 0; i < 80 && !parkedView; i++) {
        const s = await st()
        const tv = s.truckView
        if (tv.phase === 'in') { seenIn = true; xsIn.push(tv.x) }
        if (tv.phase === 'parked') parkedView = { ...tv, c: s.cone && s.cone.c }
        await wait(40)
    }
    check('#2508 the truck rolls IN — phase in before parked, x climbing from off-screen west',
        seenIn && !!parkedView && xsIn.length >= 2 && xsIn[xsIn.length - 1] > xsIn[0] + 30 && xsIn[0] < 0,
        JSON.stringify({ seenIn, first: xsIn[0], last: xsIn[xsIn.length - 1], parked: parkedView && parkedView.x }))
    check('#2508 it parks where the cone stands (~92 px past the west edge, the window by the gate)',
        !!parkedView && Math.abs(parkedView.x - (8 + (parkedView.c || 4) * 32 - 44)) <= 2, JSON.stringify(parkedView))
    // end the stop: order the cone (a sale should land; honest window-close is
    // equally a drive-off — which one ends it is recorded, the law is the roll).
    const cn = (await st()).cone
    if (cn) await tap(8 + cn.c * 32 + 16, 40 + cn.r * 32 + 16)
    let gone = null, xsOut = [], mintPeak = mint0
    for (let i = 0; i < 400 && !gone; i++) {
        const s = await st()
        if (!s.cone) {
            if (s.truckView.phase === 'out') xsOut.push(s.truckView.x)
            mintPeak = Math.max(mintPeak, await mintBand())
            if (s.truckView.phase === 'off') gone = s
        }
        await wait(50)
    }
    check('#2508 the cone left (sold or window) and the truck drove OFF east instead of vanishing',
        !!gone && xsOut.length >= 2 && xsOut[xsOut.length - 1] > xsOut[0] + 60,
        JSON.stringify({ sold: (await st()).treats, xsOut: [xsOut[0], xsOut[xsOut.length - 1]] }))
    check('#2508 the mint body paints on the street while it crosses, and the strip is empty again after',
        mintPeak - mint0 >= 30 && (await mintBand()) < mint0 + 8, `mint base ${mint0} peak ${mintPeak} after ${await mintBand()}`)
}

// #2508 item 2 — the call VARIES. Headless Chrome hears nothing, so the ending
// bar each pass rang is probe-visible: truckView.jingle. Two consecutive passes
// must ring different bars; the parity law (iceSerial) is pinned in peoplecheck,
// including the swell (far < near, every note routed through iceVol).
{
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(400) }
    const ringRead = async () => {
        const before = (await st()).iceSerial
        await page.evaluate(() => { window.__homebodyTest.money(500); window.__homebodyTest.ringTruck() })
        for (let i = 0; i < 100; i++) {
            const s = await st()
            if (s.iceSerial > before && s.truckView.jingle) return { serial: s.iceSerial, jingle: s.truckView.jingle }
            await wait(40)
        }
        return { serial: null, jingle: null }
    }
    const r1 = await ringRead()
    const r2 = await ringRead()
    check('#2508 item 2 — two consecutive passes ring different ending bars (the call varies)',
        !!r1.jingle && !!r2.jingle && r1.jingle !== r2.jingle, JSON.stringify({ first: r1, second: r2 }))
    check('#2508 item 2 — the bar rides iceSerial parity deterministically ((serial+1) even → A)',
        !!r1.jingle && r1.jingle === ((r1.serial + 1) % 2 === 0 ? 'A' : 'B')
        && !!r2.jingle && r2.jingle === ((r2.serial + 1) % 2 === 0 ? 'A' : 'B'),
        JSON.stringify({ first: r1, second: r2 }))
}

// #2508 item 5 — the curb gets a CROWD. While the truck parks, one or two
// neighbourhood kids paint at the counter (draw-only — the sim's cone law is
// untouched: no tap here, the stop ends on its own or through Pip's own buy).
// The view machine is probe-visible on truckView.crowd: off → gather (armed
// at the park; size arithmetic off the day, the icePassHour doctrine) → flee
// (the truck leaves east, the kids jog west) → off. Pixels prove the bodies:
// a warm skin-family census in the band in front of the counter rises only
// while the crowd stands — no truck colour is in that family.
{
    if ((await st()).screen !== 'play') { await page.keyboard.press('Space'); await wait(400) }
    const s0 = await st()
    check('#2508 item 5 no crowd at the curb before the jingle',
        s0.truckView.crowd.phase === 'off' && s0.truckView.crowd.n === 0, JSON.stringify(s0.truckView.crowd))
    const skinBand = (px) => page.evaluate((bx) => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(bx + 10, 434 + 16, 42, 16).data   // the front of the counter, the truck's own lane (item 1's band)
        let n = 0
        for (let i = 0; i < d.length; i += 4) {
            const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
            if (d[i + 3] > 200 && r > 150 && r > b + 25 && g > b + 15 && r >= g) n++   // tan skin family
        }
        return n
    }, px)
    const base = await skinBand(92)
    await page.evaluate(() => { window.__homebodyTest.money(500); window.__homebodyTest.ringTruck() })
    let crowd = null, daySeen = null
    for (let i = 0; i < 100 && !crowd; i++) {
        const s = await st()
        if (s.truckView.phase === 'parked' && s.truckView.crowd.phase === 'gather') { crowd = { ...s.truckView.crowd }; daySeen = s.day; break }
        await wait(40)
    }
    check('#2508 item 5 the crowd gathers when the wheels stop — phase gather, size off the day (1 + day%2)',
        !!crowd && crowd.n === 1 + (daySeen % 2) && crowd.n >= 1 && crowd.n <= 2, JSON.stringify({ crowd, day: daySeen }))
    let skinPeak = base
    for (let i = 0; i < 20; i++) { skinPeak = Math.max(skinPeak, await skinBand(92)); await wait(50) }
    check('#2508 item 5 the kids paint at the counter — the warm census in front of the window rises',
        skinPeak - base >= 10, `skin base ${base} peak ${skinPeak}`)
    let sawFlee = false, crowdOff = null
    for (let i = 0; i < 500 && !crowdOff; i++) {
        const s = await st()
        if (s.truckView.crowd.phase === 'flee') sawFlee = true
        if (s.truckView.crowd.phase === 'off' && s.truckView.phase === 'off') crowdOff = s
        await wait(50)
    }
    check('#2508 item 5 the stop ends (close or Pip\'s own buy) and the crowd jogs home — flee, then off',
        sawFlee && !!crowdOff && crowdOff.truckView.crowd.n === 0, JSON.stringify({ sawFlee, coneLeft: !(crowdOff && crowdOff.cone) }))
    check('#2508 item 5 the curb is empty again after the dash',
        (await skinBand(92)) <= base + 4, `skin after ${await skinBand(92)} base ${base}`)
    // determinism: not an rng draw — a re-ring seats the size the day's parity
    // says (same day, same n; the formula pin covers a midnight crossing).
    const dayNow = (await st()).day
    await page.evaluate(() => { window.__homebodyTest.ringTruck() })
    let crowd2 = null
    for (let i = 0; i < 100 && !crowd2; i++) {
        const s = await st()
        if (s.truckView.phase === 'parked' && s.truckView.crowd.phase === 'gather') { crowd2 = { ...s.truckView.crowd, day: s.day }; break }
        await wait(40)
    }
    check('#2508 item 5 the size is arithmetic, not chance — a re-ring seats the day\'s own n',
        !!crowd2 && crowd2.n === 1 + (crowd2.day % 2) && (crowd2.day !== dayNow || crowd2.n === crowd.n),
        JSON.stringify({ first: { ...crowd, day: daySeen }, second: crowd2 }))
    // let this second stop run out too, so the next section sees a clean street
    for (let i = 0; i < 500 && (await st()).truckView.phase !== 'off'; i++) await wait(50)
}

// -------------------------------------- MEDIATE (#2672): the kid broke it up ---
{
    // #2674: the drive's late legs run thin-tanked at speed — the household can
    // collapse on the way here, and done freezes advance() at its top (sim.js):
    // hooks still mutate, the loop still paints, but NO law evaluates. Restart to
    // a fresh lot when the run ended before this leg; the rig below is fully
    // self-contained (money/hour/pair/adopt), so day-1 state changes nothing it
    // tests and the law rides a live sim again.
    let pre = await st()
    for (let i = 0; i < 40 && pre.done; i++) { await page.keyboard.press('KeyR'); await wait(250); pre = await st() }
    check('#2674 the leg rides a live lot — a drive-end collapse is cleared, not sensed blind',
        !pre.done && pre.screen === 'play', JSON.stringify({ done: pre.done, screen: pre.screen }))
    // Rewind the clock first — this leg rides at the END of a long drive whose
    // late legs deliberately run at night, and hour>19 sends the pair home
    // (absence would thaw the war before any mediator could act). Then: rig the
    // pair cold, adopt the cat, seat her between them — the live law cracks the
    // war on the spot; with the cat away a fresh rig-set war stays cold.
    await page.evaluate(() => { window.__homebodyTest.money(1000); window.__homebodyTest.hour(8); window.__homebodyTest.pairCold(999); window.__homebodyTest.adopt() })
    let catHome = null
    for (let i = 0; i < 150 && !catHome; i++) { const s = await st(); if (s.pet) catHome = s.pet; else await wait(50) }
    check('#2672 the cat is home while the pair is cold', !!catHome && catHome.needs !== undefined, JSON.stringify(catHome && { state: catHome.state }) + ' cells=' + JSON.stringify(await page.evaluate(() => window.__homebodyTest.medCells())))
    await page.evaluate(() => window.__homebodyTest.standMed('pet', 2, 6))
    let med = null
    for (let i = 0; i < 60 && !med; i++) { await page.evaluate(() => window.__homebodyTest.standMed('pet', 2, 6)); const s = await st(); if (s.neiMediated === 1) { med = s; break } await wait(50) }
    check('#2672 the cat between them cracks the cold war — flag set, war over',
        !!med && med.neiGrudge === 0 && med.neiMediated === 1, JSON.stringify(med && { g: med.neiGrudge, m: med.neiMending, md: med.neiMediated }) + ' cells=' + JSON.stringify(await page.evaluate(() => window.__homebodyTest.medCells())))   // mending may already have paid its reunion by the poll — mediation itself is the proof
    let lv = 0
    for (let i = 0; i < 10 && lv < 6; i++) { lv = await page.evaluate(() => window.__homebodyTest.leaves()); if (lv < 6) await wait(40) }
    check('#2672 the mediation sparkles the pair leaf on the live canvas', lv >= 6, `leaves=${lv}`)
    await page.evaluate(() => { window.__homebodyTest.pairCold(0); window.__homebodyTest.standMed('pet', 12, 10) })   // fresh cold war, mediator parked far out
    await wait(900)
    const cold = await st()
    check('#2672 with the mediator far away a cold war just stands',
        cold.neiGrudge === 1 && cold.neiMediated === 0, JSON.stringify({ g: cold.neiGrudge, md: cold.neiMediated }))
    await page.evaluate(() => window.__homebodyTest.standMed('pet', 2, 6))
    let med2 = null
    for (let i = 0; i < 60 && !med2; i++) { const s = await st(); if (s.neiMediated === 1) { med2 = s; break } await wait(50) }
    check('#2672 the cat back between them cracks it again — presence drives the law',
        !!med2 && med2.neiGrudge === 0 && med2.neiMediated === 1, JSON.stringify(med2 && { g: med2.neiGrudge, md: med2.neiMediated }) + ' cells=' + JSON.stringify(await page.evaluate(() => window.__homebodyTest.medCells())))
}

// -------------------------------------- GO-SAY (#2683): the far tap walks the word over ---
{
    let pre = await st()
    for (let i = 0; i < 40 && pre.done; i++) { await page.keyboard.press('KeyR'); await wait(250); pre = await st() }
    const rig = await page.evaluate(() => window.__homebodyTest.promiseFar())
    await wait(120)
    await tap(rig.vx, rig.vy)   // a REAL pointer click on Fern across the lot
    let armed = null
    for (let i = 0; i < 40 && !armed; i++) { const s = await st(); if (s.goSay) armed = s.goSay; else await wait(50) }
    check('#2683 the far tap promises it on the live street — the errand is Otto->fern',
        armed === 'Otto->fern', JSON.stringify(armed))
    let ringGold = 0
    for (let i = 0; i < 30 && !(ringGold >= 8); i++) {
        await page.evaluate(() => window.__homebodyTest.parkFar())
        ringGold = await page.evaluate(([vx, vy]) => {
            const c = document.querySelector('canvas')
            const d = c.getContext('2d').getImageData(Math.round(vx - 17), Math.round(vy + 2), 34, 15).data
            let n = 0
            for (let j = 0; j < d.length; j += 4) if (d[j] > 140 && d[j] - d[j + 2] > 90 && d[j + 1] - d[j + 2] > 60) n++
            return n
        }, [rig.vx, rig.vy])
        await wait(50)
    }
    check('#2683 the promised ear wears the travelling gold while the walk runs', ringGold >= 8, `gold=${ringGold}`)
    let fired = null
    for (let i = 0; i < 240 && !fired; i++) {
        await page.evaluate(() => window.__homebodyTest.parkFar())
        const s = await st()
        if (!s.goSay && s.rel.fern > 0) fired = s
        await wait(50)
    }
    check('#2683 arrival lands the coo on canvas — bond paid, promise settled into the pick',
        !!fired && fired.rel.fern > 0 && fired.courtPick === 'fern',
        JSON.stringify(fired && { rel: Math.round(fired.rel.fern * 100) / 100, pick: fired.courtPick }))
}

check('zero page errors across the whole drive', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await browser.close()
console.log(`\n=== homebodydrive: ${pass} pass, ${fail} fail ===`)
process.exit(fail ? 1 : 0)
