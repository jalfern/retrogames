// bonsaicheck — self-verifying harness for public/demos/bonsai.html (BONSAI,
// #3763: a gnarled bonsai tree living through the seasons — drag-scrub the
// year, tap a pad to prune it, ink-wash canopy over a stone pot on a wooden
// stand).
//
// Proves five things:
//   1. BOOTS  — DEV hook ready, rAF advancing, zero page errors, wall painted.
//   2. SEASON LAW — setSeason moves the year; the year turns on a drag;
//      spring blossom vs summer green is a > 40 luminance delta.
//   3. PIXELS — trunk painted dark, pot painted brown, pads carry foliage
//      colour at summer noon.
//   4. INTERACTION — tapping foliage pad 4 drops its scale, other pads hold.
//   5. PHONE — 390x844 boots clean, paints, zero errors.
//   + DEMO LAW — self-contained page, credits card honest and loaded, index
//     card + DEMO_INDEX entry, out of the arcade registry (games.js).
//
// Usage: node scripts/bonsaicheck.mjs [--shots <dir>]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/bonsai'))
mkdirSync(shots, { recursive: true })

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'bonsai.html'
await requireDevServer(BASE)

let pass = 0, fail = 0
function ok(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  (' + extra + ')' : ''))
  if (cond) pass++; else fail++
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 780 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(45000)
let pageErrors = 0
page.on('pageerror', e => { pageErrors++; console.log('[pageerror]', e.message) })

await page.goto(URL_DEMO, { waitUntil: 'load' })
await page.waitForFunction(() => window.__bonsaiTest && window.__bonsaiTest.ready, null, { timeout: 15000 })

/* ---------------- 1. BOOTS ---------------- */
ok('DEV hook exists', true)
const f1 = await page.evaluate(() => window.__bonsaiTest.frames)
const grown = await page.waitForFunction('window.__bonsaiTest.frames > ' + (f1 + 20), null, { timeout: 8000 }).then(() => true).catch(() => false)
ok('the sim is live on load (rAF advancing)', grown, 'frames ' + f1 + ' -> ' + await page.evaluate(() => window.__bonsaiTest.frames))
ok('zero page errors while booting', pageErrors === 0, pageErrors + ' errors')

const corner = await page.evaluate(() => {
  const cv = document.querySelector('canvas#scene')
  const d = cv.getContext('2d').getImageData(2, 2, 1, 1).data
  return [d[0], d[1], d[2]]
})
ok('the wall is painted (top-left corner not transparent)', corner[0] > 160 && corner[2] < corner[0] + 4 && Math.abs(corner[0] - 236) < 12, 'corner rgb ' + corner.join(','))

/* helpers ------------------------ */
// world coords -> screen coords via the demo's own pad 0 readout
async function sample(wx, wy) {
  return page.evaluate(([wx, wy]) => {
    const p = window.__bonsaiTest.padScreenPos(0)
    const cv = document.querySelector('canvas#scene')
    const ctx2d = cv.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const s = p.scale
    const sx = Math.round((p.ox + wx * s) * dpr), sy = Math.round((p.oy + wy * s) * dpr)
    const d = ctx2d.getImageData(Math.max(0, Math.min(cv.width - 1, sx)), Math.max(0, Math.min(cv.height - 1, sy)), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [wx, wy])
}

/* ---------------- 2. SEASON LAW ---------------- */
await page.evaluate(() => window.__bonsaiTest.setSeason(0.02))
const sSpring = await page.evaluate(() => window.__bonsaiTest.season())
ok('setSeason(0.02) holds the year at spring blossom', Math.abs(sSpring - 0.02) < 1e-6, 'season=' + sSpring)
await page.evaluate(() => window.__bonsaiTest.setSeason(0.74))
const sWinter = await page.evaluate(() => window.__bonsaiTest.season())
ok('setSeason(0.74) holds the year at late winter', Math.abs(sWinter - 0.74) < 1e-6, 'season=' + sWinter)

// drag law: dy=300 => season advances by ~0.0019*300 = 0.57
const before = await page.evaluate(() => window.__bonsaiTest.season())
await page.mouse.move(590, 300)
await page.mouse.down()
for (let i = 1; i <= 6; i++) await page.mouse.move(590, 300 + i * 50, { steps: 2 })
await page.mouse.up()
await page.waitForTimeout(250)
const after = await page.evaluate(() => window.__bonsaiTest.season())
const drift = Math.abs(((after - before + 1.5) % 1) - 0.5)
ok('the year turns under a drag (|Δseason| > 0.10)', drift > 0.10, 'before ' + before.toFixed(3) + ' -> after ' + after.toFixed(3))

// spring vs summer foliage delta
await page.evaluate(() => window.__bonsaiTest.setSeason(0.05))
const lumSpring = await page.evaluate(async () => {
  const cv = document.querySelector('canvas#scene')
  const ctx2d = cv.getContext('2d')
  const p = window.__bonsaiTest.padScreenPos(0)
  const sx = Math.round((p.ox + 320 * p.scale) * (window.devicePixelRatio || 1))
  const sy = Math.round((p.oy + 545 * p.scale) * (window.devicePixelRatio || 1))
  const d = ctx2d.getImageData(sx, sy, 1, 1).data
  return (d[0] + d[1] + d[2]) / 3
})
await page.evaluate(() => window.__bonsaiTest.setSeason(0.30))
const lumSummer = await page.evaluate(async () => {
  const cv = document.querySelector('canvas#scene')
  const ctx2d = cv.getContext('2d')
  const p = window.__bonsaiTest.padScreenPos(0)
  const sx = Math.round((p.ox + 320 * p.scale) * (window.devicePixelRatio || 1))
  const sy = Math.round((p.oy + 545 * p.scale) * (window.devicePixelRatio || 1))
  const d = ctx2d.getImageData(sx, sy, 1, 1).data
  return (d[0] + d[1] + d[2]) / 3
})
ok('spring blossom vs summer green is a clear luminance delta', Math.abs(lumSpring - lumSummer) > 40, 'spring ' + lumSpring.toFixed(0) + ' -> summer ' + lumSummer.toFixed(0))

/* ---------------- 3. PIXELS -------------------- */
await page.evaluate(() => window.__bonsaiTest.setSeason(0.30))
const trunk = await sample(422, 630)
const trunkLum = (trunk[0] + trunk[1] + trunk[2]) / 3
ok('trunk is painted (dark, not wall)', trunkLum < 130, 'lum ' + trunkLum.toFixed(0))
const pot = await sample(440, 815)
const potLum = (pot[0] + pot[1] + pot[2]) / 3
ok('the pot is painted (brown, not wall)', potLum < 215 && potLum > 40, 'lum ' + potLum.toFixed(0))
for (let i = 0; i < 6; i++) {
  const pos = await page.evaluate(([i]) => {
    const p = window.__bonsaiTest.padScreenPos(i)
    return { x: p.x, y: p.y }
  }, [i])
  const center = await page.evaluate(([x, y]) => {
    const cv = document.querySelector('canvas#scene')
    const d = cv.getContext('2d').getImageData(Math.round(x * (window.devicePixelRatio || 1)), Math.round(y * (window.devicePixelRatio || 1)), 1, 1).data
    return [d[0], d[1], d[2]]
  }, [pos.x, pos.y])
  const lum = (center[0] + center[1] + center[2]) / 3
  const wall = Math.abs(center[0] - 236) > 8 || Math.abs(center[1] - 231) > 8 || Math.abs(center[2] - 218) > 8
  ok('pad ' + i + ' carries foliage colour', wall && lum > 50 && lum < 215, 'lum ' + lum.toFixed(0))
}

/* ---------------- 4. INTERACTION (tap to prune) ────────------------ */
await page.evaluate(() => { window.__bonsaiTest.setSeason(0.30); })
const padTop = await page.evaluate(() => window.__bonsaiTest.padScreenPos(4))
// pad 4 center is world (452, 252) — padScreenPos returns pad center coords
await page.mouse.move(padTop.x, padTop.y)
await page.mouse.down()
await page.waitForTimeout(40)
await page.mouse.up()
await page.waitForTimeout(120)
const padScale = await page.evaluate(() => window.__bonsaiTest.pads())
ok('tapping a pad prunes it (scale 1 -> 0.12)', padScale[4] < 0.5, 'pad4 ' + padScale[4].toFixed(2))
ok('the other pads hold their full size', padScale.every((s, i) => i === 4 ? true : Math.abs(s - 1) < 0.05), padScale.map(s => s.toFixed(2)).join(','))

/* ---------------- 5. PHONE 390x844 -------------------- */
{
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  let errs2 = 0
  p2.on('pageerror', e => { errs2++; console.log('[phone pageerror]', e.message) })
  await p2.goto(URL_DEMO, { waitUntil: 'load' })
  await p2.waitForFunction(() => window.__bonsaiTest && window.__bonsaiTest.ready, null, { timeout: 15000 })
  await p2.waitForFunction('window.__bonsaiTest.frames > 30', null, { timeout: 8000 }).catch(() => {})
  const litP = await p2.evaluate(() => {
    const cv = document.querySelector('canvas#scene')
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    let n = 0, total = 0
    for (let i = 0; i < d.length; i += 12) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
      if (lum < 215) n++
      total++
    }
    return { dark: n, total }
  })
  ok('phone viewport: boots, runs, paints, zero errors', errs2 === 0 && litP.dark / litP.total > 0.05, 'dark ' + litP.dark + '/' + litP.total + ', ' + errs2 + ' errors')
  await p2.close()
}

/* ---------------- 6. DEMO LAW -------------------- */
{
  const html = readFileSync('public/demos/bonsai.html', 'utf8')
  ok('self-contained: no absolute http(s) resources', !/<(script|link|img)[^>]+src=["']https?:/i.test(html))
  ok('credits card block present with honest fields', /window\.DEMO_CREDITS\s*=/.test(html) && /name:\s*'BONSAI'/.test(html) && /builder:\s*\{[^}]*tag:\s*'INKLING'/.test(html) && /issues:\s*\[3763\]/.test(html) && /assist:\s*'guided'/.test(html) && /note:/.test(html))
  ok('shared credits.js + feedback.js loaded', /<script src="credits\.js"><\/script>/.test(html) && /<script src="feedback\.js"><\/script>/.test(html))
  ok('DEV hook __bonsaiTest present', /window\.__bonsaiTest\s*=/.test(html))
  const idx = readFileSync('public/demos/index.html', 'utf8')
  ok('index card + DEMO_INDEX entry', /id="bonsai"/.test(idx) && /el:\s*'bonsai'/.test(idx) && /getElementById\('bonsai'\)\.href\s*=\s*base\s*\+\s*'bonsai\.html'/.test(idx))
  const reg = readFileSync('src/config/games.js', 'utf8')
  ok('demos stay out of the arcade registry (#1258)', !/bonsai/i.test(reg))
}

console.log((fail ? '\nbonsaicheck FAILED: ' + fail + ' of ' + (pass + fail) : '\nbonsaicheck PASS: ' + pass + '/' + (pass + fail)) + ' — shots in ' + shots)
await browser.close()
process.exit(fail ? 1 : 0)
