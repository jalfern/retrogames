// bdteachpad.mjs — #2759 probe: is the A button really unhittable while the
// first-vent teach panel is due? Phone scale (390x780, touch), pointer-only
// start (trusted keyboard hides the pad — that alone breaks taps, see below).
//
// Three discriminating probes:
//  1) reach a live VENT step (panel due) at phone scale and hit-test
//     document.elementFromPoint over the center of [data-vc="a"] — the
//     teach panel is CANVAS paint (drawVentPanel), the pad row is fixed z-50,
//     so the panel cannot intercept pointer events by construction. Verify.
//  2) page.keyboard.press('Space') then immediately page.tap('[data-vc=a]') —
//     VirtualControls hides the pad on trusted keydown (step-5 feel rule), so
//     the element is gone and Playwright times out. This is the candidate the
//     cooptakes 30-s stalls were really caused by (their loop presses Space
//     BEFORE every tap).
//  3) tap FIRST, keyboard after — the same tap that (2) failed must pass.
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

// 1) walk to a live VENT step (panel due) and hit-test
let panelUp = null
for (let i = 0; i < 900; i++) {
    const s = await page.evaluate(() => { window.__bdTest.solve(1); const p = window.__bdTest.probeStep(); return p ? { k: p.kind, panel: !!(window.__bdTest.panel && window.__bdTest.panel()) } : { k: 'DONE' } })
    if (s.panel) { panelUp = s; break }
    if (s.k === 'DONE') break
}
if (panelUp) {
    const h = await hitA()
    ok('panel due + A button resolves to itself (no DOM overlay)', h.present && h.hitIsA, JSON.stringify(h))
} else {
    ok('reached a live teach-panel window', false, 'walk never saw panel=true (walk or solve raced past VENT — next session: drive with real pads, or use a seed pinned by defusecheck toVentFresh)')
}

// 2) keyboard-then-tap (cooptakes' exact order)
await page.keyboard.press('Space').catch(() => {})
const t2 = Date.now()
const r2 = await page.tap('[data-vc="a"]', { timeout: 4000 }).then(() => 'ok').catch(() => 'timeout')
ok('tap right after keyboard press', r2 === 'ok', `${r2} in ${Date.now() - t2}ms — pad hidden by VirtualControls hide-on-keyboard (trusted keydown) if this times out`)

// 3) touch wakes the pad; tap-first passes. NOTE: viewport coords via
// touchscreen.tap — page.tap(selector,{position}) is ELEMENT-relative and lands
// off-screen below a phone-scaled canvas (false timeout).
await page.touchscreen.tap(195, 700).catch(() => {})
await sleep(150)
const t3 = Date.now()
const r3 = await page.tap('[data-vc="a"]', { timeout: 4000 }).then(() => 'ok').catch(() => 'timeout')
ok('tap works once a touch has re-shown the pad', r3 === 'ok', `${r3} in ${Date.now() - t3}ms`)

console.log(results.join('\n'))
console.log('pageerrors:', errs.length ? errs.slice(0, 3) : 'none')
await context.close()
await browser.close()
