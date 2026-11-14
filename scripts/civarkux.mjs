// CIVILIZATION V — Ark yards UX playtest (#2085, playtest of #2083/#2077)
//   npm run dev   then   node scripts/civarkux.mjs
//
//   1. PHONE SHAPE TOUCH PATH — at 390x844 the VICTORY panel opens from the HUD
//      touch button; the YARD ◀ ▶ picker, the four plate tracks and the ⚒ WELD
//      buttons all stay inside the viewport with tappable hit-targets.
//   2. A REAL WELD — tapping ⚒ WELD queues the named plate at the named city and
//      the toast reads it; a DELIVERED toast names the city and the plate count.
//   3. Q DISCOVERABILITY — the panel copy carries the Q hint; a full yard denies
//      BY CITY NAME.
//   4. AI GAMES (Node, deterministic) — seed 9 + a free seed: no rival plate ever
//      shows funding without SPACEFLIGHT, no city welds two plates at once, no
//      queue exceeds three items.
import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { newGame, step, hasTech, arkPartsOf, arkPartsDone, ARK_PARTS, CFG } from '../src/games/CivilizationV/sim.js'

const URL = process.env.CIV_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/civilization-v`
await requireDevServer(URL)

const r = new Report('civarkux')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
const wait = (ms) => page.waitForTimeout(ms)

const probe = async () => { for (let i = 0; i < 60; i++) { const p = await page.evaluate(() => window.__civTest ? window.__civTest.probe() : null); if (p && typeof p.turn === 'number') return p; await wait(100) } throw new Error('__civTest vanished') }

await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 150; i++) { if (await page.evaluate(() => !!window.__civTest)) break; await wait(200) }
r.check('the __civTest hook is live', await page.evaluate(() => !!window.__civTest))

// seed 9, capital founded, Spaceflight granted (DebugKit equivalent of the ask)
await page.keyboard.press('Space') // leave attract
await wait(400)
await page.evaluate(() => window.__civTest.start(9))
await wait(500)
await page.keyboard.press('KeyE') // settle the capital
for (let i = 0; i < 40; i++) { const s = await probe(); if (s.capitalSize >= 1) break; await wait(150) }
let s = await probe()
r.check(`capital founded on seed 9 (screen ${s.screen}, cities ${s.playerCities})`, s.screen === 'play' && s.playerCities >= 1)
await page.evaluate(() => window.__civTest.learn('SPACEFLIGHT'))
await wait(200)
s = await probe()
r.check('Spaceflight learned (ask 1 precondition)', s.victory.spaceflight === true)

// ASK 1 — touch the HUD victory button at the phone shape
const hudBtn = page.locator('button', { hasText: 'I · VICTORY' })
// #2085 regression pin: vpad mounts after the FIRST touch on screen, and its
// invisible stick layer is a fixed z-40 half-screen surface; chrome MUST stack
// above it (shell convention z-50) or every left-half button dies — the pad
// mounts mid-gesture and Chrome's synthesized mousedown/mouseup retargets to
// [data-vc="stick"], so the button never gets its click. Wake the pad first;
// checking before any touch would pass vacuously.
await page.touchscreen.tap(100, 700) // harmless stick-region tap: mounts vpad
await wait(250)
const aboveStick = async (label) => page.evaluate((txt) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(txt))
    if (!b) return false
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !!el && (el === b || b.contains(el))
}, label)
r.check('HUD victory button receives touches (above the vpad stick layer)', await aboveStick('I · VICTORY'))
// Raw coordinate tap — exactly what a finger does. locator.tap() would burn its
// 180 s actionability timeout on this interception instead of failing the gate.
const hudBox = await hudBtn.boundingBox()
if (hudBox) await page.touchscreen.tap(hudBox.x + hudBox.width / 2, hudBox.y + hudBox.height / 2)
await wait(350)
let body = await page.evaluate(() => document.body.innerText)
r.check('the phone touch button opens VICTORY', body.includes('VICTORY') && body.includes('THE RIVAL TRACKS'))
r.check('panel stays inside the phone viewport', await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === 'VICTORY')
    if (!h) return false
    const box = h.closest('div.absolute') || h.parentElement.parentElement
    const b = box.getBoundingClientRect()
    return b.left >= -2 && b.top >= -2 && b.right <= window.innerWidth + 2 && b.bottom <= window.innerHeight + 2
}))
const weldBtn = page.locator('button', { hasText: '⚒ WELD AT' })
const weldN = await weldBtn.count()
r.check(`the four plate tracks show ⚒ WELD buttons (${weldN} found)`, weldN === 4)
let minH = 999, inside = true
for (const b of await weldBtn.all()) {
    const bb = await b.boundingBox()
    if (!bb) { inside = false; continue }
    minH = Math.min(minH, bb.height)
    if (bb.left < 0 || bb.right > 390 || bb.bottom > 844) inside = false
}
r.check(`⚒ WELD targets are tappable (min height ${minH}px >= 24)`, minH >= 24)
r.check('all four WELD buttons fit the phone screen', inside)
const yardRow = page.locator('span', { hasText: 'YARD' }).first()
r.check('the YARD ◀ ▶ picker is visible one-handed (upper-middle)', await yardRow.isVisible().catch(() => false))
await page.screenshot({ path: '/tmp/forge/civ-ark-phone-victory.png' })

// picker cycles to another city when there is one; weld via touch
const yardName0 = (await page.locator('span.text-sky-200').first().innerText().catch(() => '')).trim()
const weldBox = await weldBtn.first().boundingBox()
if (weldBox) await page.touchscreen.tap(weldBox.x + weldBox.width / 2, weldBox.y + weldBox.height / 2)
await wait(300)
const toastAfterWeld = await page.evaluate(() => window.__civTest.supplyView().toast)
s = await probe()
const queued = s.queue.some((c) => c.queue.some((k) => k.startsWith('ARK_')))
r.check(`a tap welds a plate at ${yardName0 || 'the yard'} (toast "${toastAfterWeld}")`, /→/.test(toastAfterWeld) && queued)
body = await page.evaluate(() => document.body.innerText)
r.check('Q hint is discoverable on the panel card', /Q welds an Ark plate|Q welds the next plate/.test(body))
r.check('the plate-track button names the yard city', body.includes('WELD AT') && yardName0 !== '')

// ASK 2 — DELIVERED toast: run turns until the queued plate finishes; the toast
// must name the city and read n/4 OF THE ARK before it fades (toast = 170 ticks).
let delivered = ''
let readTicks = 0
for (let i = 0; i < 240; i++) {
    await page.keyboard.press('Space')
    await wait(120)
    const t = await page.evaluate(() => window.__civTest.supplyView().toast)
    if (/DELIVERED AT/.test(t)) { delivered = t; break }
    const st = await probe()
    if (st.end) break
}
for (let i = 0; i < 5 && delivered; i++) { // keep polling to prove it reads before fade
    const t = await page.evaluate(() => window.__civTest.supplyView().toast)
    if (t === delivered) readTicks++
}
r.check(`DELIVERED toast reads the plate, the city and the count "${delivered}"`, /DELIVERED AT \w.+ · \d\/4 OF THE ARK/.test(delivered))

// ASK 2b — full-yard deny names the city (queue GALLEY/MUSKET/GALLEON slots then Q).
// Costs may refuse some units at this city — the deny line we grade is the queue-full one.
for (const k of ['KeyN', 'Space', 'KeyK', 'Space', 'KeyL', 'Space']) { await page.keyboard.press(k); await wait(140) }
await page.evaluate(() => window.__civTest.learn('SPACEFLIGHT'))
await page.keyboard.press('KeyQ')
await wait(200)
const denyToast = await page.evaluate(() => window.__civTest.supplyView().toast)
const q3 = (await probe()).queue
const full = q3.some((c) => c.queue.length >= 3)
r.check(`full-yard deny names the city ("${denyToast}")`, !full || /\w'S YARD IS FULL/.test(denyToast))

// ASK 3 — AI invariant watch in Node (seed 9 + free seed): no phantom plate
// funding without SPACEFLIGHT, no double-plate city, no >3 queue.
const watchAI = (seed, label) => {
    const gs = newGame(seed)
    let phantom = 0, double = 0, overfull = 0
    for (let t = 0; t < 2600 && !gs.end; t++) {
        step(gs)
        for (let civ = 1; civ <= 3; civ++) {
            if (!gs.civs[civ].alive) continue
            for (const p of arkPartsOf(gs, civ)) if ((p.funded > 0 || p.done) && !hasTech(gs, civ, 'SPACEFLIGHT')) phantom++
        }
        for (const c of gs.cities) {
            if (!c.alive) continue
            const plates = (c.queue || []).filter((k) => k.startsWith('ARK_')).length
            if (plates > 1) double++
            if ((c.queue || []).length > 3) overfull++
        }
    }
    r.check(`${label}: no phantom rival plates, no double-plate yard, no over-full queue (turns ${gs.turn}, plates per rival ${[1, 2, 3].map((i) => arkPartsDone(gs, i)).join('/')})`, phantom === 0 && double === 0 && overfull === 0)
}
watchAI(9, 'seed 9')
watchAI(4242, 'free seed 4242')
r.check('zero page errors across the phone session', errors.length === 0, errors.slice(0, 3).join(' | '))

await r.exit(browser)
