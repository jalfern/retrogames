// touchselectcheck — #606: press-and-drag on the pad / canvas must NOT turn into
// text selection on iPad / iPhone (and the input must still register).
//
// Root cause: React registers onTouch* as passive listeners, so the pad's
// `e.preventDefault()` is a no-op, and the game pages had no page-wide
// `user-select: none` / `-webkit-touch-callout: none` — only the buttons were
// `select-none`. On iOS Safari a drag therefore started a selection / callout.
//
// The gate proves the fix in Playwright WebKit (the engine that reproduces iOS
// behaviour) with iPad + iPhone profiles, and falls back to Chromium device
// emulation when WebKit is not installed. Three ways it can fail:
//   1. computed CSS: body/root/canvas/[data-vc] resolve to user-select:none and
//      -webkit-touch-callout:none (inheritance from the #606 index.css rules).
//   2. behaviour: the whole body's selectable content is empty (before the fix
//      the footer + game label are selectable → non-empty → red).
//   3. feel: a touch press-and-drag on the pad still dispatches a direction key.
//
// Screenshots of both devices land under qa-art/touchselect-*.png.

import { mkdirSync } from 'node:fs'
import { launch } from './lib/harness.mjs'
import { Report } from './lib/harness.mjs'

const DEV_PORT = process.env.DEV_PORT || '5173'
const BASE = process.env.TOUCHSELECT_URL || `http://localhost:${DEV_PORT}/retrogames`
const GAME = `${BASE}/mario`
const OUT = new URL('../qa-art/', import.meta.url).pathname

const DEVICES = [
  { name: 'iPad-Pro-11', width: 834, height: 1194, dsf: 2 },
  { name: 'iPhone-12', width: 390, height: 844, dsf: 3 },
]

let webkit
try {
  ;({ webkit } = await import('playwright-core'))
  await webkit.launch({ headless: true })   // probe availability, then reuse below
} catch {
  webkit = null
}

async function pickEngine() {
  if (webkit) {
    try { return { browser: await webkit.launch({ headless: true }), engine: 'webkit' } } catch { /* fall through */ }
  }
  const chromium = (await import('playwright-core')).chromium
  return { browser: await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }), engine: 'chromium' }
}

// One device: open the game, assert the CSS + behaviour, capture a screenshot.
async function probeDevice(browser, engine, dev, r) {
  const page = await browser.newPage({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dsf, hasTouch: true, isMobile: true })
  page.setDefaultTimeout(30000)
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.goto(GAME, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__marioTest, null, { timeout: 15000 })
  // Leave attract so the title renders its VirtualControls pad.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)

  const tag = `${engine}/${dev.name}`

  // 1. computed CSS — the root-cause fix must reach every surface a thumb drags on.
  const css = await page.evaluate(() => {
    const cs = (el) => { const s = getComputedStyle(el); return { us: s.webkitUserSelect || s.userSelect } }
    const zones = [...document.querySelectorAll('[data-vc] *')].map((el) => cs(el))
    const canvas = document.querySelector('canvas')
    return {
      body: cs(document.body),
      html: cs(document.documentElement),
      root: cs(document.getElementById('root') || document.body),
      canvas: canvas ? cs(canvas) : null,
      zones,
    }
  })
  const none = (v) => v === 'none'
  r.check(`${tag}: body user-select:none`, none(css.body.us), css.body.us)
  r.check(`${tag}: html user-select:none`, none(css.html.us), css.html.us)
  r.check(`${tag}: #root user-select:none`, none(css.root.us), css.root.us)
  if (css.canvas) r.check(`${tag}: canvas user-select:none`, none(css.canvas.us), css.canvas.us)
  r.check(`${tag}: pad surfaces resolve non-selectable`, css.zones.length > 0 && css.zones.every((z) => none(z.us)), `${css.zones.length} nodes`)

  // 2. behaviour — everything a thumb could select across the body must be empty.
  const selected = await page.evaluate(() => {
    const sel = window.getSelection()
    sel.selectAllChildren(document.body)
    const t = sel.toString()
    sel.removeAllRanges()
    return t
  })
  r.check(`${tag}: body has no selectable text`, selected === '', JSON.stringify(selected.slice(0, 40)))

  // 3. feel — a press-and-drag on the pad still dispatches a direction key,
  //    and leaves nothing selected. (WebKit forbids `new Touch()`; the pad's
  //    mouse path is the same direction logic, so drive the drag with the mouse.)
  const stickBox = await page.evaluate(() => {
    const el = document.querySelector('[data-vc="stick"]') || document.querySelector('[data-vc="dpad"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (stickBox) {
    await page.evaluate(() => {
      window.__seenCodes = []
      window.addEventListener('keydown', (e) => window.__seenCodes.push(e.code))
    })
    await page.mouse.move(stickBox.x, stickBox.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(stickBox.x - i * 12, stickBox.y)
    await page.waitForTimeout(80)
    await page.mouse.up()
    await page.waitForTimeout(80)
    const seen = await page.evaluate(() => ({ codes: window.__seenCodes, selAfter: window.getSelection().toString() }))
    const dir = seen.codes.some((c) => c.startsWith('Arrow'))
    r.check(`${tag}: pad drag registers a direction`, dir, seen.codes.join(','))
    r.check(`${tag}: pad drag left no selection`, seen.selAfter === '', JSON.stringify(seen.selAfter))
  } else {
    r.skip(`${tag}: pad drag registers a direction`, 'no [data-vc] pad on the page')
  }

  mkdirSync(OUT, { recursive: true })
  const shot = `${OUT}touchselect-${dev.name}.png`
  await page.screenshot({ path: shot })
  r.info(`${tag}: screenshot`, shot)

  await page.close()
}

const { browser, engine } = await pickEngine()
if (engine !== 'webkit') console.log('  NOTE  WebKit unavailable — using Chromium device emulation')
const r = new Report('touchselectcheck')
r.info('engine', engine)
for (const dev of DEVICES) await probeDevice(browser, engine, dev, r)
await r.exit(browser)
