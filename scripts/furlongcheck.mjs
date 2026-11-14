// furlongcheck — self-verifying harness for public/demos/furlong.html (FURLONG,
// #2182: a golden-hour thoroughbred at a true four-beat rotary gallop, rendered
// by a hand-written raw-WebGL2 engine — no libraries, CPU skinning).
//
// Proves four things:
//   1. BOOTS  — DEV hook ready, rAF advancing, zero page errors, and the scene
//               actually paints (golden-hour sky over green plain).
//   2. RULES  — the gallop laws hold from the gait law itself:
//               footfall order LH·RH·LF·RF (rotary, not a fast walk),
//               a suspension phase with every hoof airborne,
//               stance hooves NEVER slide (ground-frame slip = 0 m — the planted
//               hoof is pinned to its touchdown anchor),
//               the seam is exact: key points at t and t+8T agree to float noise,
//               stance hooves sit on the ground; swing hooves clear it.
//   3. PIXELS — chestnut coat, dark hooves and mane/tail on canvas; the sun
//               glint sits at the horizon; the body occupies the screen centre
//               where the camera aims it; still renders at phone size.
//   + DEMO LAW — self-contained page, not registered in games.js, credits card
//               and index entry present.
//
// Proven-fail mutants (run by hand 2026-11-13, then restored):
// 1. solveLeg tip-pin `p[p.length-1]=target.slice()` deleted — the planted hoof
//    rides with the body instead of locking to the ground: the slip gate goes
//    RED (~230 mm); everything else green.
// 2. LEGS LF/RF td 0.48/0.58 -> 0.20/0.30 (fore pair lands with the hind
//    pair): the footfall-order gate goes RED (saw LHLHRHFLRF-ish pace) —
//    27/28.
//
// Usage: node scripts/furlongcheck.mjs [--shots <dir>]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/furlong'))
mkdirSync(shots, { recursive: true })

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'furlong.html'
const NOCACHE = '?_ts=' + Date.now()   // vite serves public/ strongly cached (gotcha #cachecheck)
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

await page.goto(URL_DEMO + '?lite=1' + NOCACHE, { waitUntil: 'load' })
await page.waitForFunction(() => window.__furlongTest && window.__furlongTest.ready, null, { timeout: 20000 })

/* ---------------- 1. BOOTS ---------------- */
ok('DEV hook exists', true)
const f1 = await page.evaluate(() => window.__furlongTest.frames)
const grown = await page.waitForFunction('window.__furlongTest.frames > ' + (f1 + 20), null, { timeout: 8000 }).then(() => true).catch(() => false)
ok('the sim is live on load (rAF advancing)', grown, 'frames ' + f1 + ' -> ' + await page.evaluate(() => window.__furlongTest.frames))
ok('zero page errors while booting', pageErrors === 0, pageErrors + ' errors')

const lit = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o } = GRAB()
  let n = 0
  for (let i = 0; i < o.length; i += 12) if (o[i] + o[i + 1] + o[i + 2] > 240) n++
  return n
})
ok('the scene paints (lit samples across the canvas)', lit > 5000, lit + ' lit px')
const skyTop = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o, w } = GRAB()
  const i = (2 * w + 2) * 4
  return [o[i], o[i + 1], o[i + 2]]
})
const skyHz = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o, w, h } = GRAB()
  const i = (Math.round(h * 0.34) * w + Math.round(w * 0.4)) * 4
  return [o[i], o[i + 1], o[i + 2]]
})
ok('golden-hour sky: cool crown over a warm horizon band', skyHz[0] - skyHz[2] > 70 && (skyHz[0] - skyHz[2]) - (skyTop[0] - skyTop[2]) > 40, 'top ' + skyTop + ' horizon ' + skyHz)
const ground = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o, w, h } = GRAB()
  let green = 0, tot = 0
  for (let y = Math.round(h * 0.8); y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4; tot++
    if (o[i + 1] > 70 && o[i + 1] >= o[i + 2] + 12) green++
  }
  return { green, tot, ratio: green / tot }
})
ok('plain fills the foreground (majority grass-toned)', ground.ratio > 0.55, JSON.stringify(ground))

/* ---------------- 2. RULES (gait law) ---------------- */
const info = await page.evaluate(() => window.__furlongTest.info())
ok('declared leg set LH,RH,LF,RF', info.order.join(',') === 'LH,RH,LF,RF', 'saw ' + info.order.join(','))
/* temporal footfall order: record the leg whose stance BEGINS as phase sweeps */
const landOrder = await page.evaluate(() => {
  const out = []
  let prev = window.__furlongTest.groundedAt(0)
  for (let i = 1; i <= 400; i++) {
    const g = window.__furlongTest.groundedAt(0.5 * i / 400)
    for (let k = 0; k < 4; k++) if (!prev[k] && g[k]) out.push(window.__furlongTest.info().order[k])
    prev = g
  }
  return out.join(',')
})
const CYC = 'LH,RH,LF,RF'
const isCyclic = landOrder.length && (CYC + ',' + CYC).includes(landOrder) && landOrder.split(',').length === 4
ok('temporal footfall order LH·RH·LF·RF up to phase origin (a true rotary gallop)', isCyclic, 'landed in order ' + landOrder)
/* rotary, not pace: same-side fore+hind land ~half a stride apart (0.4–0.6 T) */
const gaps = await page.evaluate(() => {
  const tds = window.__furlongTest.info().td, names = window.__furlongTest.info().order
  const at = n => tds[names.indexOf(n)]
  return { lh_lf: Math.abs(at('LF') - at('LH')), lh_rh: Math.abs(at('RH') - at('LH')) }
})
ok('rotary gait: diagonal timing (ipsilateral fore 0.3–0.7 T after hind; lateral pair offset < 0.3 T)',
   gaps.lh_lf > 0.3 && gaps.lh_lf < 0.7 && gaps.lh_rh < 0.3, JSON.stringify(gaps))
const susp = await page.evaluate(() => window.__furlongTest.suspension())
ok('a suspension phase exists (all four hooves airborne)', susp > 0.2 && susp < 0.6, (susp * 100).toFixed(0) + '% of the stride')

const slip = await page.evaluate(() => window.__furlongTest.slip())
ok('stance hooves never slide — ground-frame slip < 1 mm', slip * 1000 < 1, (slip * 1000).toFixed(3) + ' mm')
const seam = await page.evaluate(() => window.__furlongTest.seam())
ok('seam: key points at t and t+8T agree to float noise', seam < 1e-6, seam.toExponential(2) + ' m')

const heights = await page.evaluate(() => {
  const out = { stance: 0, swing: 1e9, min: 1e9, max: -1e9 }
  for (let i = 0; i < 200; i++) {
    const t = 0.5 * (i / 200)
    const fr = framesOf(t)
    const g = window.__furlongTest.groundedAt(t)
    fr.legs.forEach((lg, k) => {
      const y = lg.p[4][1]
      out.min = Math.min(out.min, y); out.max = Math.max(out.max, y)
      if (g[k]) out.stance = Math.max(out.stance, y)
      else out.swing = Math.min(out.swing, y)
    })
  }
  return out
})
ok('stance hooves sit on the ground (tip ≤ 10 cm)', heights.stance <= 0.10, 'worst stance y=' + heights.stance.toFixed(3))
ok('airborne hooves still pass low through the fold (arc ≤ 60 cm)', heights.swing < 0.6, 'lowest swing y=' + heights.swing.toFixed(3))
ok('hooves never sink below the ground plane', heights.min > -0.011, 'min tip y=' + heights.min.toFixed(4))

// the skinning math itself: for every bone, F(t)·inv(F0) must map the bind
// joint onto the runtime chain joint (this is what failed when mat4invert
// dotted rows instead of columns — the whole horse exploded from it)
const rigid = await page.evaluate(() => {
  let worstPos = 0, worstNonRigid = 0
  for (let ph = 0; ph < 8; ph++) {
    const t = 0.5 * ph / 8
    const fr = framesOf(t)
    const spine = [fr.sp.pelvisW, fr.sp.midW, fr.sp.chestW, fr.sp.neck[0], fr.sp.neck[1], fr.sp.neck[2]]
    const bind = [[0, 1.585, 0], [0.42, 1.62, 0], [0.90, 1.58, 0], null, null, null]
    for (let bi = 0; bi < NBONES; bi++) {
      const M = M4.mul(fr.F[bi].m, FR0.F[bi].inv)
      const cols = [[M[0], M[1], M[2]], [M[4], M[5], M[6]], [M[8], M[9], M[10]]].map(c => Math.hypot(...c))
      const det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5])
      worstNonRigid = Math.max(worstNonRigid, Math.abs(det - 1), ...cols.map(c => Math.abs(c - 1)))
      let p0 = null, want = null
      if (bi < 3) { p0 = bind[bi]; want = spine[bi] }
      else if (bi >= 17 || (bi >= 9 && bi <= 16)) {
        let li = -1, sN = 0
        for (let k = 0; k < LEG_BASE.length; k++)
          if (bi >= LEG_BASE[k] && bi < LEG_BASE[k] + 4) { li = k; sN = bi - LEG_BASE[k] }
        if (li >= 0) { p0 = FR0.legs[li].p[sN]; want = fr.legs[li].p[sN] }
      }
      if (p0 && want) {
        const q = M4.xform(M, p0)
        worstPos = Math.max(worstPos, Math.hypot(q[0] - want[0], q[1] - want[1], q[2] - want[2]))
      }
    }
  }
  return { worstPos, worstNonRigid }
})
ok('skinning matrices are rigid (det≈1, unit columns)', rigid.worstNonRigid < 1e-4, rigid.worstNonRigid.toExponential(2))
ok('bone transforms land bind joints on runtime joints (< 1 µm)', rigid.worstPos < 1e-6, rigid.worstPos.toExponential(2) + ' m')

/* ---------------- 3. PIXELS ---------------- */
const px = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o, w, h } = GRAB()
  const count = pred => {
    let n = 0
    for (let i = 0; i < o.length; i += 8) if (pred(o[i], o[i + 1], o[i + 2])) n++
    return n
  }
  /* sun glint: bright warm-white in the horizon band only (HUD text excluded) */
  let glint = 0
  for (let y = Math.round(h * 0.24); y < Math.round(h * 0.6); y += 2)
    for (let x = Math.round(w * 0.2); x < Math.round(w * 0.95); x += 2) {
      const i = (y * w + x) * 4
      if (o[i] > 240 && o[i + 1] > 150 && o[i + 2] > 80 && o[i + 2] < 210 && o[i] - o[i + 2] > 90) glint++
    }
  return {
    coat: count((r, gr, b) => r > 110 && r < 235 && r - gr > 25 && r - b > 60 && gr - b > 10),
    dark: count((r, gr, b) => r < 60 && gr < 50 && b < 45),
    glint,
  }
})
ok('chestnut coat pixels on canvas', px.coat > 3000, px.coat + ' px')
ok('dark hoof/mane/tail pixels present', px.dark > 100, px.dark + ' px')
ok('the low sun glints near the horizon', px.glint > 10, px.glint + ' px')

const centre = await page.evaluate(() => {
  window.__furlongTest.setT(0.5 * 0.55)
  
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)   // flip to CSS coords (WebGL origin bottom-left)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o, w, h } = GRAB()
  let warm = 0
  for (let y = Math.round(h * 0.25); y < Math.round(h * 0.75); y += 2)
    for (let x = Math.round(w * 0.25); x < Math.round(w * 0.75); x += 2) {
      const i = (y * w + x) * 4
      if (o[i] > 110 && o[i] - o[i + 2] > 60 && o[i] - o[i + 1] > 20) warm++
    }
  window.__furlongTest.unpin()
  return warm
})
ok('the horse occupies the screen centre where the camera aims it', centre > 1500, centre + ' warm px in centre box')

/* ---------------- 4. DEMO LAW ---------------- */
const html = readFileSync(resolve('public/demos/furlong.html'), 'utf8')
const external = html.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
ok('self-contained: zero external src/href in the page', external.length === 0, external.join(', '))
ok('no libraries: zero import/require in the page', !/\bimport\s|\brequire\(/.test(html))
const reg = readFileSync(resolve('src/config/games.js'), 'utf8')
ok('demos law: NOT registered in the arcade registry', !/FURLONG|'\/furlong'|demos\/furlong/i.test(reg))
ok('credits card present, solo, naming #2182', /name:\s*'FURLONG'/.test(html) && /assist:\s*'solo'/.test(html) && /issues:\s*\[2182\]/.test(html))
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
ok('index links the card and DEMO_INDEX carries the facts', /id="furlong"/.test(idx) && /el:\s*'furlong'/.test(idx))

/* ---------------- phone size ---------------- */
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(700)
const phoneLit = await page.evaluate(() => {
  const GRAB = () => {
    const cv = document.querySelector('canvas#c')
    const g = cv.getContext('webgl2', { preserveDrawingBuffer: true })
    const w = cv.width, h = cv.height
    const b = new Uint8Array(w * h * 4)
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b)
    const o = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) o.set(b.subarray((h - 1 - y) * w * 4, (h - 1 - y) * w * 4 + w * 4), y * w * 4)
    return { o, w, h }
  }
  const { o } = GRAB()
  let n = 0
  for (let i = 0; i < o.length; i += 12) if (o[i] + o[i + 1] + o[i + 2] > 240) n++
  return n
})
ok('phone 390×844: the scene still renders', phoneLit > 2000, phoneLit + ' lit px')
await page.screenshot({ path: resolve(shots, 'phone.png') })
await page.setViewportSize({ width: 1180, height: 780 })
await page.evaluate(() => window.__furlongTest.setT(0.5 * 0.55))
await page.waitForTimeout(200)
await page.screenshot({ path: resolve(shots, 'gallop.png') })
ok('zero page errors across the whole drive', pageErrors === 0, pageErrors + ' errors')

await browser.close()
console.log('\nfurlongcheck: ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? ' — ' + fail + ' FAILED' : '  — OK'))
process.exit(fail ? 1 : 0)
