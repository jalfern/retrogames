// bdteachpad.mjs — #2759 gate: was the A button really unhittable while the
// first-vent teach panel is due? NO — the filed claim does not reproduce, and
// the cooptakes stalls had a different cause. Phone scale (390x780, touch),
// pointer-only start (trusted keyboard hides the pad — that alone breaks taps).
//
// Three discriminating probes (all must pass; exits non-zero on any FAIL):
//  1) park a live VENT step (panel due) at phone scale and hit-test
//     document.elementFromPoint over the center of [data-vc="a"] — the
//     teach panel is CANVAS paint (drawVentPanel), the pad row is fixed z-50,
//     so the panel cannot intercept pointer events by construction.
//  2) page.keyboard.press('Space') then immediately page.tap('[data-vc=a]') —
//     the stall is the LAW (VirtualControls hides the pad on trusted keydown,
//     step-5 feel rule #290): this tap MUST time out. It is what starved the
//     cooptakes runs (their loop pressed Space before every tap).
//  3) a bare touchscreen tap re-shows the pad (touchstart → show) and the
//     selector tap lands fast — cooptakes' wake-then-tap (#2759).
//
// npm: node scripts/bdteachpad.mjs   (DEV_PORT, default 5173)
import { launch } from './lib/harness.mjs'

const PORT = process.env.DEV_PORT || 5173
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, cond, why = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${why ? ' — ' + why : ''}`); return cond }

const browser = await launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
const page = await context.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(`http://localhost:${PORT}/retrogames/bomb-defuse`, { waitUntil: 'load', timeout: 20000 })
await page.waitForFunction('!!window.__bdTest', null, { timeout: 30000 })
await sleep(1000)

// pointer-only start: wake attract, confirm select, decline consent
await page.tap('canvas', { position: { x: 100, y: 100 } }).catch(() => {})
await sleep(300)
await page.tap('canvas', { position: { x: 100, y: 100 } }).catch(() => {})
await sleep(400)
if (await page.evaluate(() => !!document.querySelector('[data-auto-record-gate]'))) {
    await page.tap('#consent-no', { timeout: 3000 }).catch(async () => { await page.keyboard.press('Escape') })
}
await sleep(600)
ok('play screen reached (pointer-only)', (await page.evaluate(() => window.__bdTest.screen())) === 'play')

const hitA = () => page.evaluate(() => {
    const el = document.querySelector('[data-vc="a"]')
    if (!el) return { present: false }
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { present: true, panel: !!(window.__bdTest.panel && window.__bdTest.panel()), hitIsA: !!hit && (hit === el || el.contains(hit)) }
})

// 1) walk to a live VENT step (panel due) and hit-test. #2759 lesson: step()
// is ONE tick and solvePads only fires presses on scheduled stepT ticks, so a
// solve(1)-per-evaluate walk needs tick-scale budget (the old 900-loop won the
// game). Kind is checked on BOTH sides of each solve, and the sim PARKS at the
// first VENT (never solve past it); then wait a paint (the panel is view state
// — hud.panel lands on the driver tick) and hit-test.
let parked = null
const seen = []
const kindNow = () => page.evaluate(() => {
    const p = window.__bdTest.probeStep()
    return p ? p.kind : 'DONE' // VENT = 2 (engine.js)
})
for (let i = 0; i < 1500 && !parked; i++) {
    const a = await kindNow()
    seen.push(a)
    if (a === 2) { parked = true; break }
    if (a === 'DONE') break
    await page.evaluate(() => window.__bdTest.solve(1))
    const b = await kindNow()
    seen.push(b)
    if (b === 2) { parked = true; break }
    if (b === 'DONE') break
}
if (parked) {
    await sleep(150) // one driver tick for hud.panel to reflect the parked vent step
    const h = await hitA()
    ok('panel due + A button resolves to itself (no DOM overlay)', h.present && h.panel && h.hitIsA, JSON.stringify(h))
} else {
    const hist = seen.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})
    const dbg = await page.evaluate(() => {
        const p = window.__bdTest.probeStep()
        return { screen: window.__bdTest.screen(), step: p && p.step, bomb: p && p.bomb, ventTaught: window.__bdTest.ventTaught(), panelGone: window.__bdTest.panelGone(), panel: !!window.__bdTest.panel() }
    }).catch((e) => ({ err: String(e) }))
    ok('reached a live teach-panel window', false, `walk never reached a VENT step — kinds seen ${JSON.stringify(hist)} state ${JSON.stringify(dbg)}`)
}

// 2) keyboard-then-tap (the OLD cooptakes order): the stall is the LAW —
// VirtualControls hides the pad on trusted keydown (step-5 feel rule, #290),
// so the element is gone and the tap must time out. Green = the feel rule
// holds; red = hide-on-keyboard changed and #2759's harness law needs revisiting.
await page.keyboard.press('Space').catch(() => {})
const t2 = Date.now()
const r2 = await page.tap('[data-vc="a"]', { timeout: 4000 }).then(() => 'ok').catch(() => 'timeout')
ok('hide-on-keyboard holds: tap right after a trusted keydown stalls (expected)', r2 === 'timeout', `${r2} in ${Date.now() - t2}ms — if ok, VirtualControls no longer hides on keydown (#290) and cooptakes' wake step is dead weight`)

// 3) touch wakes the pad; tap-first passes. NOTE: viewport coords via
// touchscreen.tap — page.tap(selector,{position}) is ELEMENT-relative and lands
// off-screen below a phone-scaled canvas (false timeout).
await page.touchscreen.tap(195, 700).catch(() => {})
await sleep(150)
const t3 = Date.now()
const r3 = await page.tap('[data-vc="a"]', { timeout: 4000 }).then(() => 'ok').catch(() => 'timeout')
ok('a bare touch re-shows the pad and the tap lands (<1 s)', r3 === 'ok', `${r3} in ${Date.now() - t3}ms — this is cooptakes' wake-then-tap (#2759)`)

console.log(results.join('\n'))
console.log('pageerrors:', errs.length ? errs.slice(0, 3) : 'none')
await context.close()
await browser.close()
process.exit(results.some((l) => l.startsWith('FAIL')) || errs.length ? 1 : 0)
