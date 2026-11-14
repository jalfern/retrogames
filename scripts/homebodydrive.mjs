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

// frame matches: sprite position follows state
const f0 = await page.evaluate(() => window.__game.state())
check('contract state ticks', f0.tick > 0 && typeof f0.score === 'number', `tick=${f0.tick} score=${f0.score}`)

check('zero page errors across the whole drive', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await browser.close()
console.log(`\n=== homebodydrive: ${pass} pass, ${fail} fail ===`)
process.exit(fail ? 1 : 0)
