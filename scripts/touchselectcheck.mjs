// touchselectcheck — #606: press-and-drag on the pad / canvas must NOT turn into
// text selection on iPad / iPhone (and the input must still register).
//
// #2057 grows the second root cause out: on iPhone the DOCUMENT itself panned
// (h-screen content taller than Safari's small viewport) and zoom was live, so
// a drag anywhere the pads did not cover scrolled the page and touchcancelled
// the floating stick mid-push — the stick vanished. The gates now prove the
// shared-layer law on the real page:
//   LAW   viewport meta pins zoom; html/body pinned shut (overflow hidden,
//         overscroll-behavior none, touch-action manipulation); canvas
//         touch-action none — pan/zoom/selection cannot start on the surface.
//   DRAG  real touch events (CDP Input.dispatchTouchEvent, iPhone + iPad
//         profiles): a stick drag drives directions with scrollY pinned at 0
//         and no selection; a drag on the canvas moves nothing.
//   SURVIVE the viewport MOVES mid-push (resize while the finger is down):
//         the stick re-publishes its direction and the knob stays mounted.
//
// Root cause (#606): React registers onTouch* as passive listeners, so the pad's
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
    const cs = (el) => {
      const s = getComputedStyle(el)
      return {
        us: s.webkitUserSelect || s.userSelect,
        ta: s.touchAction,
        obx: s.overscrollBehaviorX,
        oby: s.overscrollBehaviorY,
        ov: s.overflow,
      }
    }
    const zones = [...document.querySelectorAll('[data-vc] *')].map((el) => cs(el))
    const canvas = document.querySelector('canvas')
    return {
      meta: document.querySelector('meta[name="viewport"]')?.content || '',
      body: cs(document.body),
      html: cs(document.documentElement),
      root: cs(document.getElementById('root') || document.body),
      canvas: canvas ? cs(canvas) : null,
      zones,
    }
  })
  const none = (v) => v === 'none'
  const hidden = (v) => v === 'hidden' || v === 'clip'
  r.check(`${tag}: body user-select:none`, none(css.body.us), css.body.us)
  r.check(`${tag}: html user-select:none`, none(css.html.us), css.html.us)
  r.check(`${tag}: #root user-select:none`, none(css.root.us), css.root.us)
  if (css.canvas) r.check(`${tag}: canvas user-select:none`, none(css.canvas.us), css.canvas.us)
  r.check(`${tag}: pad surfaces resolve non-selectable`, css.zones.length > 0 && css.zones.every((z) => none(z.us)), `${css.zones.length} nodes`)

  // 1b. #2057 — the pan/zoom law: the document itself must be pinned shut and
  //     the canvas must never yield a gesture, or an uncovered drag pans the
  //     page (Safari collapses toolbars and touchcancels the stick mid-push).
  const zoomPinned = /user-scalable\s*=\s*no/.test(css.meta) && /maximum-scale\s*=\s*1(\.0+)?\b/.test(css.meta)
  r.check(`${tag}: viewport meta pins zoom`, zoomPinned, css.meta)
  for (const [who, c] of [['html', css.html], ['body', css.body]]) {
    r.check(`${tag}: ${who} overflow hidden (no document pan)`, hidden(c.ov), c.ov)
    r.check(`${tag}: ${who} overscroll-behavior none (no rubber-band)`, none(c.obx) && none(c.oby), `${c.obx}/${c.oby}`)
    r.check(`${tag}: ${who} touch-action kills double-tap zoom`, c.ta === 'manipulation' || none(c.ta), c.ta)
  }
  if (css.canvas) r.check(`${tag}: canvas touch-action:none (surface never yields a gesture)`, none(css.canvas.ta), css.canvas.ta)
  const docTaller = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  r.check(`${tag}: document cannot scroll (scrollHeight <= clientHeight)`, docTaller <= 1, `+${docTaller}px`)

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

// #2057 — Gauntlet legs: REAL touch (CDP Input.dispatchTouchEvent, the only way
// headless Chromium delivers genuine touchstart/move/end with touch-action
// enforced) on the game Jon reported. Proves: tap-with-finger starts through
// attract+select; a stick drag drives arrows with the document pinned at
// scrollY 0 and no selection; a canvas drag moves nothing; and a viewport
// RESIZE mid-push does not kill the stick — direction re-publishes and the
// knob stays mounted (the iPhone complaint was the stick vanishing).
async function gauntletLeg(browser, engine, dev, r) {
  const tag = `${engine}/${dev.name}`
  if (engine !== 'chromium') {
    r.skip(`${tag}: gauntlet touch-drag legs`, 'needs Chromium CDP touch')
    return
  }
  const page = await browser.newPage({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dsf, hasTouch: true, isMobile: true })
  page.setDefaultTimeout(30000)
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  await page.goto(`${BASE}/gauntlet`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })

  // Recorder: every synthesized key the pad fires + scroll attempts + cancels.
  await page.evaluate(() => {
    window.__log = { down: [], up: [], cancels: 0, scrolls: 0 }
    addEventListener('keydown', (e) => window.__log.down.push(e.code))
    addEventListener('keyup', (e) => window.__log.up.push(e.code))
    addEventListener('touchcancel', () => { window.__log.cancels++ }, true)
    addEventListener('scroll', () => { window.__log.scrolls++ }, true)
  })
  const log = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__log)))
  const clearLog = () => page.evaluate(() => { window.__log.down = []; window.__log.up = []; window.__log.cancels = 0 })

  // Finger-tap into play: attract -> select, then hero 0's card centre.
  // Canvas is 320x240 game units; hero 0 card centre = (52, 147) (select.js).
  await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r0 = c.getBoundingClientRect()
    window.__heroTap = { x: r0.left + (52 / 320) * r0.width, y: r0.top + (147 / 240) * r0.height }
    window.__mid = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 }
  })
  const mid = await page.evaluate(() => window.__mid)
  await touch('touchStart', [mid]); await touch('touchEnd', [])
  const hero = await page.evaluate(() => window.__heroTap)
  await touch('touchStart', [{ ...hero, id: 3 }]); await touch('touchEnd', [{ ...hero, id: 3 }])
  // First run on a fresh phone raises the auto-record consent gate (what Jon's
  // recorded session actually answered). The harness declines it with a real
  // finger tap — the gate is chrome above the pad, and declining keeps the
  // leg free of recording side-effects.
  await page.waitForTimeout(250)
  if (await page.evaluate(() => !!document.querySelector('[data-auto-record-gate]'))) {
    const no = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-consent-gate] button, [data-consent-gate] [role="button"]')]
        .find((el) => /NO THANKS/i.test(el.textContent || ''))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    r.check(`${tag}: consent gate rises on first start`, !!no, no ? 'found NO THANKS' : 'gate open but no button')
    if (no) { await touch('touchStart', [{ ...no, id: 4 }]); await touch('touchEnd', [{ ...no, id: 4 }]) }
  }
  const padUp = await page.waitForSelector('[data-vc="stick"]', { timeout: 5000 }).then(() => true).catch(() => false)
  r.check(`${tag}: finger taps start attract+select into play`, padUp, 'waiting [data-vc=stick]')
  if (!padUp) { await page.close(); return }

  const interactive = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-vc="stick"], [data-vc="actzone"], [data-vc="dpad"], [data-vc="fixedstick"], [data-vc="dpadgate"]')]
    return els.map((el) => ({ k: el.dataset.vc, ta: getComputedStyle(el).touchAction }))
  })
  r.check(`${tag}: every interactive pad zone is touch-action:none`,
    interactive.length > 0 && interactive.every((z) => z.ta === 'none'),
    interactive.map((z) => `${z.k}:${z.ta}`).join(' '))

  // --- stick drag: real touch, direction flows, document stays pinned ---
  const knobMounted = () => page.evaluate(() => {
    const z = document.querySelector('[data-vc="stick"]')
    return !!z && z.children.length >= 1 && !!z.querySelector('div')
  })
  const sx = Math.round(dev.width * 0.25)
  const sy = Math.round(dev.height * 0.55)
  await clearLog()
  await touch('touchStart', [{ x: sx, y: sy, id: 1 }])
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: sx - i * 14, y: sy, id: 1 }])
  await page.waitForTimeout(120)
  let l = await log()
  const scrollMid1 = await page.evaluate(() => window.scrollY)
  const knob1 = await knobMounted()
  r.check(`${tag}: touch stick drag drives ArrowLeft`, l.down.includes('ArrowLeft'), l.down.join(','))
  r.check(`${tag}: no touchcancel during stick drag`, l.cancels === 0, `cancels=${l.cancels}`)
  r.check(`${tag}: stick knob mounted mid-drag`, knob1)
  r.check(`${tag}: document scrollY pinned at 0 through stick drag`, scrollMid1 === 0 && l.scrolls === 0, `scrollY=${scrollMid1} scrolls=${l.scrolls}`)

  // --- SURVIVE: viewport moves WHILE the push is held ---
  // iOS steals (touchcancel) or shifts (resize/keyboard) the viewport mid-push.
  // Survival = the push is never silently dropped and the pad still ANSWERS.
  // The synthesizer only signals CHANGES, so continuity = ArrowLeft was not
  // released across the shift (no keyup, no cancel, knob mounted), and liveness
  // = a NEW direction arrives when the finger moves on after the shift.
  await clearLog()
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height - 150, deviceScaleFactor: dev.dsf, mobile: true })
  await page.waitForTimeout(200)
  const knobAfterResize = await knobMounted()
  const across = await log()
  r.check(`${tag}: stick SURVIVES viewport move mid-push (knob stays)`, knobAfterResize)
  r.check(`${tag}: push is never silently dropped across viewport move`,
    !across.up.includes('ArrowLeft') && across.cancels === 0,
    JSON.stringify(across))
  await touch('touchMove', [{ x: sx - 90, y: sy + 40, id: 1 }])
  await page.waitForTimeout(150)
  const lc = await log()
  r.check(`${tag}: pad still answers moves after the viewport shifted`, lc.down.includes('ArrowDown'), lc.down.join(','))
  r.check(`${tag}: no touchcancel across viewport move`, lc.cancels === 0, `cancels=${lc.cancels}`)
  await touch('touchEnd', [{ x: sx - 90, y: sy + 40, id: 1 }])
  await page.waitForTimeout(120)
  l = await log()
  r.check(`${tag}: clean release after survival (ArrowLeft keyup)`, l.up.includes('ArrowLeft'), l.up.join(','))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dsf, mobile: true })
  await page.waitForTimeout(120)

  // --- canvas drag on the uncovered right half moves nothing ---
  await clearLog()
  const cx = Math.round(dev.width * 0.8)
  await touch('touchStart', [{ x: cx, y: Math.round(dev.height * 0.3), id: 2 }])
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: cx, y: Math.round(dev.height * 0.3) + i * 24, id: 2 }])
  await touch('touchEnd', [])
  await page.waitForTimeout(120)
  l = await log()
  const scrollCanvas = await page.evaluate(() => ({ y: window.scrollY, sel: window.getSelection().toString() }))
  r.check(`${tag}: canvas drag scrolls nothing`, scrollCanvas.y === 0 && l.scrolls === 0, `scrollY=${scrollCanvas.y} scrolls=${l.scrolls}`)
  r.check(`${tag}: canvas drag selects nothing`, scrollCanvas.sel === '', JSON.stringify(scrollCanvas.sel.slice(0, 40)))

  mkdirSync(OUT, { recursive: true })
  const shot = `${OUT}touchselect-gauntlet-${dev.name}.png`
  await page.screenshot({ path: shot })
  r.info(`${tag}: gauntlet screenshot`, shot)
  await page.close()
}

const { browser, engine } = await pickEngine()
if (engine !== 'webkit') console.log('  NOTE  WebKit unavailable — using Chromium device emulation')
const r = new Report('touchselectcheck')
r.info('engine', engine)
for (const dev of DEVICES) {
  await probeDevice(browser, engine, dev, r)
  await gauntletLeg(browser, engine, dev, r)
}
await r.exit(browser)
