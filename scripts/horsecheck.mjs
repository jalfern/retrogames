// horsecheck — self-verifying harness for public/demos/horse.html (STRIDELINE,
// #2147: a procedural low-poly thoroughbred at a seamless rotary gallop,
// rendered by a hand-written perspective painter on Canvas 2D — no libraries).
//
// Proves three things:
//   1. BOOTS  — DEV hook ready, rAF advancing, zero page errors, the scene
//               actually paints (cool dusk sky over warm steppe).
//   2. RULES  — the gallop laws hold from the gait law itself:
//               footfall order LF·RF·LH·RH (rotary, not a fast walk),
//               a suspension phase with every hoof airborne,
//               stance hooves NEVER slide (ground-frame slip < 1 mm — the
//               headline promise of the brief),
//               stance hooves sit on the ground and swing hooves clear it,
//               the seam is exact: stateAt(0) ≡ stateAt(1) to float noise,
//               and the declared loop (8 strides = 48 m) is the real period.
//   3. PIXELS — chestnut body, dark hooves, pale mane on canvas; the drawn
//               sprite matches the logical state (project the barrel centre,
//               find body colour there); the cast shadow darkens the ground;
//               dust appears just after a hooffall; mesas sit on the horizon.
//   + DEMO LAW — self-contained page, not registered in games.js, credits
//               card and index entry present.
//
// Proven-fail mutant (run by hand): in horse.html hoofBody, change the stance
// slide `leg.xLand - STRIDE * u` to `leg.xLand - STRIDE * u * 0.7` — the hoof
// rides with the body instead of locking to the ground: every slip gate goes
// RED (≈180–540 mm per stance) while boots/rules-order/seam stay green.
// Second mutant: move the LF contact `c: 0.00` of the fore pair after the hind
// pair (`c: 0.60`) — the footfall-order gate goes RED: a gallop that lands the
// hind pair first is a different gait. Demonstrated 2026-11-12, then restored.
//
// Usage: node scripts/horsecheck.mjs [--shots <dir>] [--json]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/horse'))
mkdirSync(shots, { recursive: true })

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'horse.html'
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

await page.goto(URL_DEMO + '?lite=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__horseTest && window.__horseTest.ready, null, { timeout: 15000 })

/* ---------------- 1. BOOTS ---------------- */
ok('DEV hook exists', true)
const f1 = await page.evaluate(() => window.__horseTest.frames())
const grown = await page.waitForFunction('window.__horseTest.frames() > ' + (f1 + 20), null, { timeout: 8000 }).then(() => true).catch(() => false)
ok('the sim is live on load (rAF advancing)', grown, 'frames ' + f1 + ' -> ' + await page.evaluate(() => window.__horseTest.frames()))
ok('zero page errors while booting', pageErrors === 0, pageErrors + ' errors')

const lit = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r + g + b > 240, 3))
ok('the scene paints (lit samples across the canvas)', lit > 5000, lit + ' lit px')
const skyTop = await page.evaluate(() => window.__horseTest.pixel(590, 40))
const skyHz = await page.evaluate(() => window.__horseTest.pixel(300, Math.round(0.30 * 780)))
ok('dusk sky: cool crown over a warm horizon band', skyTop[2] > skyTop[0] && skyHz[0] > skyHz[2] + 40, 'top ' + skyTop + ' horizon ' + skyHz)
const gnd = await page.evaluate(() => {
  const cv = document.querySelector('canvas#c')
  const img = cv.getContext('2d').getImageData(0, Math.round(cv.height * 0.82), cv.width, Math.round(cv.height * 0.16)).data
  let warm = 0, tot = 0
  for (let i = 0; i < img.length; i += 8) { tot++; if (img[i] > 110 && img[i] > img[i + 2]) warm++ }
  return { warm, tot, ratio: warm / tot }
})
ok('steppe ground fills the foreground (majority warm)', gnd.ratio > 0.55, JSON.stringify(gnd))

/* ---------------- 2. RULES (gait law) ---------------- */
await page.evaluate(() => { const t = window.__horseTest; t.resume(); t.reset(); })
await page.waitForFunction(() => window.__horseTest.gait().order.length === 8, null, { timeout: 6000 })
const gait = await page.evaluate(() => window.__horseTest.gait())
ok('rotary footfall order LF·RF·LH·RH (a true gallop)', gait.order === 'LFRFLHRH', 'saw ' + (gait.order || 'nothing'))
ok('a suspension phase exists (all four hooves airborne)', gait.suspFrac > 0.2, (gait.suspFrac * 100).toFixed(0) + '% of the stride')

const ff = await page.evaluate(() => {
  const out = []
  for (let i = 0; i <= 200; i++) out.push(window.__horseTest.footfall(i / 200))
  return out
})
let air = 0, anyContact = false
for (const s of ff) {
  const n = Object.values(s).filter(v => v.contact).length
  if (n === 0) air++
  if (n > 0) anyContact = true
}
ok('scanned sweep agrees: moments of full suspension mid-stride', air > 10 && anyContact, air + '/201 samples airborne')
const duties = ff[0]
const dutyOk = Object.values(duties).every(v => v.d > 0.05 && v.d < 0.5)
ok('every stance is short and finite (gallop duty 0.05–0.5)', dutyOk, JSON.stringify(Object.fromEntries(Object.entries(duties).map(([k, v]) => [k, v.d]))))

// slip: run ~2 s of real time, then the audit must report plant-grade stillness
await page.waitForFunction(() => window.__horseTest.gait().order.length === 8 && window.__horseTest.frames() > 90, null, { timeout: 12000 })
const slip = await page.evaluate(() => window.__horseTest.slipMax())
const slipOk = Object.values(slip).every(v => v < 1)
ok('stance hooves never slide — ground-frame slip < 1 mm', slipOk, JSON.stringify(slip) + ' mm')

// stance hooves sit grounded; swings clear the ground
const hoovesSeam = await page.evaluate(() => {
  const st = []
  for (let i = 0; i <= 100; i++) st.push(window.__horseTest.stateAt(i / 100))
  return st
})
let stanceLow = true, swingHigh = { LF: 0, RF: 0, LH: 0, RH: 0 }
for (const s of hoovesSeam) {
  for (const n of ['LF', 'RF', 'LH', 'RH']) {
    if (s[n].contact) { if (s[n].y > 0.35 || s[n].y < -0.05) stanceLow = false }
    else swingHigh[n] = Math.max(swingHigh[n], s[n].y)
  }
}
ok('hooves in stance touch down at ground height', stanceLow, JSON.stringify(hoovesSeam[20].LF.y.toFixed(2)))
const swingClear = Object.values(swingHigh).every(v => v > 0.25)
ok('swing hooves clear the ground (≥25 cm arc)', swingClear, JSON.stringify(Object.fromEntries(Object.entries(swingHigh).map(([k, v]) => [k, v.toFixed(2)]))))

const s0 = hoovesSeam[0], s1 = hoovesSeam[100]
function deepClose(a, b) {
  if (typeof a === 'number') return Math.abs(a - b) < 1e-9
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepClose(v, b[i]))
  if (a && typeof a === 'object') return Object.keys(a).every(k => deepClose(a[k], b[k]))
  return a === b
}
ok('seam: state at phase 0 equals phase 1 to float noise', deepClose(s0, s1))
// the stride must also be CONTINUOUS at every touchdown — the swing reaches
// the exact spot the next stance starts (to the micron)
const ffC = await page.evaluate(() => {
  const t = window.__horseTest
  const ff = t.footfall(0)
  const out = {}
  for (const n of Object.keys(ff)) {
    const c = ff[n].c
    out[n] = [t.stateAt(c - 1e-5)[n].x, t.stateAt(c + 1e-5)[n].x]
  }
  return out
})
const contOk = Object.values(ffC).every(v => Math.abs(v[0] - v[1]) < 1e-3)
ok('stride continuity at every touchdown (swing reaches the landing spot)', contOk, JSON.stringify(ffC))
ok('loop law: 8 strides × 6 m = 48 m pattern, speed = stride ÷ period', gait.seam === 48 && gait.loopStrides === 8 && Math.abs(gait.speed - gait.stride / gait.period) < 1e-9)

const dA = await page.evaluate(() => document.getElementById('st-d').textContent)
await page.waitForFunction(v => +document.getElementById('st-d').textContent > +v + 1, dA, { timeout: 8000 })
const dB = await page.evaluate(() => document.getElementById('st-d').textContent)
ok('distance accumulates on the HUD (the world really moves)', +dB > +dA, dA + ' -> ' + dB + ' m')

/* ---------------- 3. PIXELS ---------------- */
const chest = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 120 && r < 230 && g > 60 && g < 160 && b < 120 && r - b > 45, 2))
ok('chestnut body pixels on canvas', chest > 400, chest + ' px')
const dark = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r < 70 && g < 60 && b < 55, 2))
ok('dark hooves/muzzle pixels present', dark > 12, dark + ' px')
const pale = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 185 && g > 155 && b > 105 && b < 185 && r - b < 85, 2))
ok('flaxen mane/tail pixels present', pale > 25, pale + ' px')
const bodyPt = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.45)
  const y = t.stateAt(0.45).bodyY
  const p = t.project([0, y, 0])
  if (!p) return null
  // warm chestnut mass around where the logical barrel projects
  const S = 14
  let warm = 0, tot = 0
  for (let dy = -S; dy <= S; dy += 3) for (let dx = -S; dx <= S; dx += 3) {
    const c = t.pixel(p[0] + dx, p[1] + dy); tot++
    if (c[0] > 110 && c[0] - c[2] > 30 && c[0] - c[1] > 20) warm++
  }
  return { p, ratio: warm / tot }
})
const bodyMatch = bodyPt && bodyPt.ratio > 0.5
ok('the drawn barrel sits where the logical body projects (sprite ↔ state)', bodyMatch, JSON.stringify(bodyPt))
// and a stance hoof: its logical position must land on a dark hoof pixel
const hoofPt = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.10)
  const st = t.stateAt(0.10)
  const p = t.project([st.RF.x, st.RF.y, -0.20])
  if (!p) return null
  let dark = 0, tot = 0
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const c = t.pixel(p[0] + dx, p[1] + dy); tot++
    if (c[0] < 110 && c[1] < 95 && c[2] < 85) dark++
  }
  return { p, dark, tot }
})
const hoofMatch = hoofPt && hoofPt.dark >= 6
ok('a stance hoof projects onto drawn hoof pixels (sprite ↔ state)', hoofMatch, JSON.stringify(hoofPt))
await page.evaluate(() => window.__horseTest.resume())

// shadow: sample the cast-shadow ellipse centre at a paused phase and compare
// against the same ground point mirrored away from the horse
const shad = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.30)
  const sh = t.project([-0.9, 0.02, 0.55])
  const free = t.project([3.6, 0.02, -2.6])
  if (!sh || !free) return null
  return { a: t.pixel(sh[0], sh[1]), b: t.pixel(free[0], free[1]) }
})
const shOk = shad && (shad.b[0] + shad.b[1] + shad.b[2]) - (shad.a[0] + shad.a[1] + shad.a[2]) > 28
ok('the cast shadow darkens the ground under the horse', shOk, JSON.stringify(shad))
await page.evaluate(() => window.__horseTest.resume())

// dust rides the first hooffall: freeze just after LF lands and count
// brighter-than-ground motes near the contact point, vs the same window
// mirrored to empty ground (the discriminating control)
const dust = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.05)
  const cv = document.querySelector('canvas#c')
  const g = cv.getContext('2d')
  const pred = (r, gg, b) => r > 205 && gg > 185 && b > 145 && b < 195 && r - b > 38 && r - gg > 12
  const count = (cx, cy, S) => {
    const x0 = Math.max(0, Math.round(cx - S)), y0 = Math.max(0, Math.round(cy - S))
    const w = Math.min(cv.width, x0 + 2 * S) - x0, h = Math.min(cv.height, y0 + 2 * S) - y0
    if (w <= 0 || h <= 0) return 0
    const img = g.getImageData(x0, y0, w, h).data
    let n = 0
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (pred(img[i], img[i + 1], img[i + 2])) n++
    }
    return n
  }
  const S = Math.round(56 * devicePixelRatio)
  const p = t.project([0.6, 0.14, 0.22])
  const q = t.project([-3.2, 0.14, -2.5])
  return p && q ? { motes: count(p[0], p[1], S), control: count(q[0], q[1], S) } : null
})
ok('dust puffs fly just after the first hooffall (vs an empty-ground control)', dust && dust.motes >= dust.control + 8, JSON.stringify(dust))
await page.evaluate(() => window.__horseTest.resume())

const mesa = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 150 && r < 230 && r - b > 28 && Math.abs(r - g) < 40 && b > 110, 2))
ok('mesas stand on the far rim', mesa > 150, mesa + ' px')

await page.screenshot({ path: resolve(shots, 'gallop.png') })

/* ---------------- 4. DEMO LAW ---------------- */
const html = readFileSync(resolve('public/demos/horse.html'), 'utf8')
const external = html.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
ok('self-contained: zero external src/href in the page', external.length === 0, external.join(', '))
ok('no libraries: zero import/require in the page', !/\bimport\s|\brequire\(/.test(html))
const reg = readFileSync(resolve('src/config/games.js'), 'utf8')
ok('demos law: NOT registered in the arcade registry', !/STRIDELINE|'\/horse'|demos\/horse/i.test(reg))
ok('credits card present, solo, naming #2147', /name:\s*'STRIDELINE'/.test(html) && /assist:\s*'solo'/.test(html) && /issues:\s*\[2147\]/.test(html))
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
ok('index links the card and DEMO_INDEX carries the facts', /id="horse"/.test(idx) && /el:\s*'horse'/.test(idx))

/* ---------------- phone size ---------------- */
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(700)
const phoneLit = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r + g + b > 240, 3))
ok('phone 390×844: the scene still renders', phoneLit > 2000, phoneLit + ' lit px')
await page.screenshot({ path: resolve(shots, 'phone.png') })
ok('zero page errors across the whole drive', pageErrors === 0, pageErrors + ' errors')

await browser.close()
console.log('\nhorsecheck: ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? ' — ' + fail + ' FAILED' : '  — OK'))
process.exit(fail ? 1 : 0)
