// oceancheck — self-verifying harness for public/demos/ocean.html (#451, storm slider #458).
//
// Proves three things about the WebGPU sunset-ocean demo:
//   1. BOOTS  — WebGPU adapter + device acquired, zero console/validation errors.
//   2. RULES  — the FFT height field is non-flat AND time-varying (GPU readback);
//               the horizon is stable (sky does not move with the waves).
//   3. WINS   — the drawn frame is pixel-diverse, contains a bright sun and a
//               glitter path, and reacts to camera poses (moving camera → new frame).
//   4. STORM  — the round-two slider (#458): setStorm(1) grows wave energy >8×,
//               multiplies cool-white foam pixels, darkens the sky, reads STORM in
//               the UI, and is reversible back to calm.
//   5. SKY    — the round-three sliders (#456): time of day (night darkens hard
//               and shows stars/moon; day does not), clouds (overcast flattens the
//               sun disc), and the storm-at-night combination.
//   6. NIGHT  — the real-sky pass (#520): the Yale Bright Star Catalogue is embedded
//               (Sirius/Polaris/Big Dipper/Orion all present at correct J2000 coords),
//               the celestial pole sits at the latitude altitude due north, the Big
//               Dipper is up at night, and the sky rotates with the time-of-day slider.
//
// Chrome is launched DIRECTLY (not via playwright's default args): playwright's
// stock switches hide `navigator.gpu`; headless Chrome 155 exposes a real
// Apple/metal-3 adapter when run with --enable-unsafe-swiftshader. Pages must be
// served from a secure context (file:// or http://localhost) — about:blank hides
// the GPU. See STATE/issues: probed 2026-10-18.
//
// Usage:
//   node scripts/oceancheck.mjs [--file <path>] [--json] [--shots <dir>]
// --shots writes calm.png / storm.png (full-storm pose) into <dir>.
// Exit 0 = all green. Proven-fail mutants:
//   a) freeze `t` (replace `t += dt` with `t += 0`) → "waves move in time" red.
//   b) pin `storm = 0` in setStorm → all four STORM assertions go red.
//   c) set GUST_AMP = 0 (#462 item 3 gusts) → both storm-breath gates red,
//      "calm stays glassy" stays green (it is the sea-state half of the proof).

import { spawn } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright-core')) } catch {
  console.error('playwright-core is not installed. Run `npm install` first.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const asJson = args.includes('--json')
const file = resolve(ROOT, opt('--file', 'public/demos/ocean.html'))
const shots = opt('--shots', null)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9377')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const results = []
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

// --- minimal PNG decode (8-bit RGBA, non-interlaced) ---
function decodePng(buf) {
  let p = 8, w = 0, h = 0, colorType = 6, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); colorType = buf[p + 17] }
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len))
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const ft = raw[rp++]
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0
      let r
      switch (ft) {
        case 0: r = v; break
        case 1: r = v + a; break
        case 2: r = v + b; break
        case 3: r = v + ((a + b) >> 1); break
        case 4: {
          const pp = a + b - c
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: r = v
      }
      out[y * stride + x] = r & 255
    }
  }
  return { w, h, bpp, px: out }
}
function analyze(img, yFrom, yTo) {
  const { w, h, px } = img
  const uniq = new Set()
  let bright = 0, sum = 0, n = 0, lastR = -1, changes = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * img.bpp
      const R = px[i], G = px[i + 1], B = px[i + 2]
      uniq.add((R >> 3 << 10) | (G >> 3 << 5) | (B >> 3))
      const l = (R + G + B) / 3
      sum += l; n++
      if (R > 235 && G > 220 && B > 190) bright++
      if (lastR >= 0 && Math.abs(R - lastR) > 6) changes++
      lastR = R
    }
  }
  return { uniq: uniq.size, mean: sum / n, bright, changes }
}

function foamPix(img, yFrom, yTo) {
  let n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      const R = img.px[i], G = img.px[i + 1], B = img.px[i + 2]
      if (R > 160 && G > 160 && B > 160 && R - B <= 8) n++
    }
  }
  return n
}

// star pixels + their vertical/horizontal span in a sky band (#607: a thin band
// means the catalog is too sparse and the sky reads as a line, not a dome)
function starSpread(img, yFrom, yTo) {
  let sum = 0, n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      sum += img.px[(y * img.w + x) * img.bpp]
      n++
    }
  }
  let count = 0, yLo = 1e9, yHi = -1, xLo = 1e9, xHi = -1
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      if (img.px[i + 2] > sum / n + 25 && img.px[i + 2] > img.px[i] + 8 && img.px[i + 2] > 70) {
        count++
        if (y < yLo) yLo = y
        if (y > yHi) yHi = y
        if (x < xLo) xLo = x
        if (x > xHi) xHi = x
      }
    }
  }
  return { count, ySpan: yHi - yLo, xSpan: xHi - xLo }
}
function starPix(img, yFrom, yTo) {
  let sum = 0, n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      sum += img.px[(y * img.w + x) * img.bpp]
      n++
    }
  }
  const thr = Math.max(165, sum / n + 90)
  let stars = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      if (img.px[i] > thr && img.px[i + 1] > thr - 10 && img.px[i + 2] > thr + 15) stars++
    }
  }
  return stars
}

// #608: glitter on the sea — whiter-than-band pixels below the horizon. Night water
// is blue-dominant (B >> R); a star glint lifts R toward B, so the strict trio
// (R excess, absolute floor, B excess, near-white) isolates point sparkles from the
// diffuse moon-lit swell. Sampled on the FLANKS (away from the moon's centre column)
// so pre-existing moon glitter cannot satisfy it: mutant (no reflection draw) reads 0
// px on both flanks; the wired pass reads ~7-13 px per flank.
function seaGlint(img, x0, x1) {
  const y0 = Math.floor(img.h * 0.54), y1 = Math.floor(img.h * 0.78)
  let sr = 0, sb = 0, n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.bpp
      sr += img.px[i]; sb += img.px[i + 2]; n++
    }
  }
  const mr = sr / n, mb = sb / n
  let count = 0, xLo = 1e9, xHi = -1
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.bpp
      if (img.px[i] > mr + 30 && img.px[i] > 75 && img.px[i + 2] > mb + 8 && img.px[i] > img.px[i + 2] - 45) {
        count++
        if (x < xLo) xLo = x
        if (x > xHi) xHi = x
      }
    }
  }
  return { count, xSpan: xHi > xLo ? xHi - xLo : 0 }
}

async function sampleMax(page, n, count) {
  let best = 0
  for (let i = 0; i < n; i++) {
    if (i) await page.waitForTimeout(400)
    best = Math.max(best, count(decodePng(await page.screenshot())))
  }
  return best
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/oceancheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { chrome.kill(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }

  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push('pageerror: ' + e.message))
    page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('WGSL'))) errs.push('console: ' + m.text().split('\n')[0]) })

    await page.goto(url, { waitUntil: 'load' })

    // 1. boots
    let ready = true
    try { await page.waitForFunction(() => window.__oceanTest && window.__oceanTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGPU + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      const gpuOk = await page.evaluate(() => !!window.__oceanTest && window.__oceanTest.frames > 10)
      ok('frames advancing at rAF', gpuOk)

      // 2. rules: height field non-flat and time-varying
      const spec = await page.evaluate(async () => (await window.__oceanTest.probe()).spec)
      ok('spectral fill non-zero', spec.var > 1e-9, `var=${spec.var} max=${spec.maxAbs}`)

      const s1 = await page.evaluate(() => window.__oceanTest.stats())
      await page.waitForTimeout(2500)
      const s2 = await page.evaluate(() => window.__oceanTest.stats())
      ok('FFT height field non-flat', s2.variance > 1e-3, `variance=${s2.variance.toExponential(2)}`)
      ok('waves move in time', Math.abs(s2.mean - s1.mean) > 1e-3 || Math.abs(s2.variance - s1.variance) / (s1.variance || 1) > 0.05,
        `mean ${s1.mean.toFixed(4)} → ${s2.mean.toFixed(4)}`)

      // horizon stability: sky at top of frame is bright and smooth
      await page.evaluate(() => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: -0.05 }))
      await page.waitForTimeout(1200)
      const buf = await page.screenshot()
      const img = decodePng(buf)
      const sky = analyze(img, 0, Math.floor(img.h * 0.25))
      const mid = analyze(img, Math.floor(img.h * 0.28), Math.floor(img.h * 0.52))
      const sea = analyze(img, Math.floor(img.h * 0.55), img.h)
      ok('sky band bright and calm', sky.mean > 120 && sky.changes < img.w * (img.h * 0.25) * 0.25, `mean=${sky.mean.toFixed(0)}`)
      ok('sun disc present (bright pixels near sun row)', mid.bright > 200, `bright=${mid.bright}`)

      // 3. wins: diverse frame + glitter in front of sun + camera reacts
      ok('frame pixel-diverse', img.h > 0 && (sky.uniq + sea.uniq) > 400, `uniq sky=${sky.uniq} sea=${sea.uniq}`)
      ok('sea textured (crest/trough variance on screen)', sea.uniq > 350 && sea.changes > img.w * 8, `uniq=${sea.uniq}`)

      const frameMid = await page.screenshot()
      await page.evaluate(() => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: Math.PI / 2, pitch: -0.05 }))
      await page.waitForTimeout(1200)
      const side = await page.screenshot()
      const a = decodePng(frameMid), b = decodePng(side)
      let d = 0
      for (let i = 0; i < a.px.length; i += 64) d += Math.abs(a.px[i] - b.px[i])
      ok('camera pose changes the world', d / (a.px.length / 64) > 8, `mean|Δ|=${(d / (a.px.length / 64)).toFixed(1)}`)

      // 4. STORM (#458): the slider grows the sea, whips up foam, darkens the sky — reversibly
      const hasSlider = await page.evaluate(() => !!document.getElementById('storm'))
      ok('storm slider present', hasSlider)
      // round-two #462 item 6: the slider EASES toward its set point over ~1s (no hard
      // cut). Frame-accurate: sample `storm` on every rAF after setStorm(1). A hard cut
      // reads storm≈1 on the very first frame; the ease stays near 0, then climbs to ~1.
      await page.evaluate(() => window.__oceanTest.setStorm(0))
      await page.waitForTimeout(1400)
      const ease = await page.evaluate((n) => new Promise((res) => {
        const out = []
        window.__oceanTest.setStorm(1)
        let i = 0
        const step = () => { out.push(window.__oceanTest.storm); if (++i < n) requestAnimationFrame(step); else res(out) }
        requestAnimationFrame(step)
      }), 80)
      ok('storm eases toward set point (~1s, no hard cut)',
        ease.length > 1 && ease[0] < 0.5 && ease[ease.length - 1] > 0.82
          && ease.every((v, i) => i === 0 || v >= ease[i - 1] - 1e-6),
        `first=${ease[0].toFixed(3)} -> last=${ease[ease.length - 1].toFixed(3)} over ${ease.length} frames`)
      await page.evaluate(() => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: -0.05 }))
      await page.evaluate(() => window.__oceanTest.setStorm(0))
      await page.waitForTimeout(1500)
      const c1 = await page.evaluate(() => window.__oceanTest.stats())
      const calmBuf = await page.screenshot()
      const calmImg = decodePng(calmBuf)
      const calmSkyTop = analyze(calmImg, 0, Math.floor(calmImg.h * 0.25))
      const calmFoam = foamPix(calmImg, Math.floor(calmImg.h * 0.55), calmImg.h)

      await page.evaluate(() => window.__oceanTest.setStorm(1))
      await page.waitForTimeout(1500)
      const vStorm = await page.evaluate(() => window.__oceanTest.stats())
      ok('storm grows wave energy >8x', vStorm.variance > c1.variance * 8, `var ${c1.variance.toExponential(2)} → ${vStorm.variance.toFixed(3)}`)
      const stormBuf = await page.screenshot()
      const stormImg = decodePng(stormBuf)
      const stormSkyTop = analyze(stormImg, 0, Math.floor(stormImg.h * 0.25))
      const stormFoam = Math.max(foamPix(stormImg, Math.floor(stormImg.h * 0.55), stormImg.h),
        await sampleMax(page, 2, img => foamPix(img, Math.floor(img.h * 0.55), img.h)))
      ok('storm darkens the sky', stormSkyTop.mean < calmSkyTop.mean * 0.82, `sky mean ${calmSkyTop.mean.toFixed(0)} → ${stormSkyTop.mean.toFixed(0)}`)
      // Foam is phase-flaky (frame-count-driven chop phase moves whitecaps between
      // frames — single shots ranged 800-5000 px on identical builds), so the check
      // takes the max of 3 samples; envelope measures ~4300-5300 px on storm, ~0 calm.
      ok('storm whitecaps obvious', stormFoam > calmFoam * 4 && stormFoam > 1200, `foam px ${calmFoam} → ${stormFoam}`)
      const ui = await page.evaluate(() => ({ sea: document.getElementById('seaLbl').textContent, wind: document.getElementById('windLbl').textContent }))
      ok('UI reads STORM at full slider', ui.sea === 'STORM', `${ui.sea} · ${ui.wind}`)

      // Spike/fold regression lives in scripts/oceanfold.mjs (deterministic
      // Jacobian check on the real shader params) — a pixel detector here could
      // not separate fog/foam variance from folds: both old and fixed scored ~90px.

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'calm.png'), calmBuf)
        writeFileSync(resolve(shots, 'storm.png'), stormBuf)
      }

      await page.evaluate(() => window.__oceanTest.setStorm(0))
      await page.waitForTimeout(1500)
      const c2 = await page.evaluate(() => window.__oceanTest.stats())
      ok('slider reversible to calm', c2.variance < vStorm.variance * 0.5 && c2.variance > 1e-4, `var ${vStorm.variance.toFixed(3)} → ${c2.variance.toFixed(3)}`)

      // #462 item 4 — camera coupling: the eye bobs/rolls with the local oct-0 swell
      // at camPos. A fixed pose (setPose -> cam.touched stops the auto-advance) makes
      // the time-evolving sea the only thing moving the eye. Storm throws the eye, calm
      // stills it (the coupling scales with the rendered sea state), and pitch/roll track
      // the patch slope, not just the vertical bob.
      const swellSample = (n) => page.evaluate((frames) => new Promise((res) => {
        const hs = [], ps = [], rs = []
        let i = 0
        const step = () => { const s = window.__oceanTest.swell(); hs.push(s.h); ps.push(s.pitch); rs.push(s.roll); if (++i < frames) requestAnimationFrame(step); else res({ hs, ps, rs }) }
        requestAnimationFrame(step)
      }), n)
      const p2p = (a) => Math.max(...a) - Math.min(...a)
      await page.evaluate(() => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: -0.05 }))
      await page.evaluate(() => window.__oceanTest.setStorm(1))
      await page.waitForTimeout(1600)
      const swStorm = await swellSample(240)
      const stormH = p2p(swStorm.hs)
      const stormSlope = Math.max(p2p(swStorm.ps), p2p(swStorm.rs))
      await page.evaluate(() => window.__oceanTest.setStorm(0))
      await page.waitForTimeout(1600)
      const swCalm = await swellSample(150)
      const calmH = p2p(swCalm.hs)
      ok('camera bobs with the local swell (storm)', stormH > 0.15, `swell.h peak-to-peak ${stormH.toFixed(3)} m over 240 frames`)
      ok('calm sea stills the eye (coupling scales with sea state)', calmH < 0.5 * stormH, `calm ${calmH.toFixed(3)} vs storm ${stormH.toFixed(3)} m`)
      ok('pitch/roll track the patch slope (storm)', stormSlope > 0.01, `max slope peak-to-peak ${stormSlope.toFixed(4)} rad`)

      // #462 item 3 — gusts: at a PINNED storm set point the sea must breathe. The
      // gust signal (carrier+fbm, scaled by sea state) swings ≥0.12 peak-to-peak in
      // any 10 s window (worst phase simulates to 0.20); the height-field variance
      // (∝ gf²) must track it (worst sim rho 0.85 with 12% wave noise); and at
      // storm=0 the gust must be identically zero — the breathing scales with sea
      // state. Gate stays honest while `storm` itself sits pinned at 1.
      await page.evaluate(() => { window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: -0.05 }); window.__oceanTest.setStorm(1) })
      // wait until the ease is actually pinned (world seconds on software GL run
      // slower than real time — a fixed sleep could sample storm < 0.95)
      try { await page.waitForFunction(() => window.__oceanTest.storm === 1, null, { timeout: 8000 }) } catch { /* reported by the gate below */ }
      const gSig = [], hVar = [], gStorm = []
      for (let i = 0; i < 16; i++) {
        const r = await page.evaluate(async () => ({ g: window.__oceanTest.gust().raw, s: window.__oceanTest.storm, v: await window.__oceanTest.gustVar() }))
        gSig.push(r.g); hVar.push(r.v); gStorm.push(r.s)
        await page.waitForTimeout(600)
      }
      const gustP2P = Math.max(...gSig) - Math.min(...gSig)
      const pearson = (a, b) => {
        const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length
        let n = 0, da = 0, db = 0
        for (let i = 0; i < a.length; i++) { const xa = a[i] - ma, xb = b[i] - mb; n += xa * xb; da += xa * xa; db += xb * xb }
        return n / Math.sqrt(da * db || 1)
      }
      const rhoVG = pearson(hVar, gSig)
      ok('storm breathes: gust swings at a pinned set point',
        gStorm.every(s => s > 0.95) && gustP2P > 0.12,
        `gust ${Math.min(...gSig).toFixed(3)}..${Math.max(...gSig).toFixed(3)} (p2p ${gustP2P.toFixed(3)}) over 10 s at storm=${gStorm[gStorm.length - 1].toFixed(3)}`)
      ok('gust grows the height field (variance tracks gust)', rhoVG > 0.5, `rho(height var, gust) = ${rhoVG.toFixed(2)}`)
      await page.evaluate(() => window.__oceanTest.setStorm(0))
      try { await page.waitForFunction(() => window.__oceanTest.storm === 0, null, { timeout: 15000 }) } catch { /* reported by the gate below */ }
      const gCalm = await page.evaluate(() => new Promise(res => {
        const a = [], ss = []
        let i = 0
        const step = () => { const x = window.__oceanTest.gust(); a.push(x.raw); ss.push(window.__oceanTest.storm); if (++i < 8) requestAnimationFrame(step); else res({ a, ss }) }
        requestAnimationFrame(step)
      }))
      ok('calm stays glassy: gust identically zero at storm=0',
        gCalm.ss.every(v => v === 0) && gCalm.a.every(gv => gv === 0),
        `${gCalm.a.length} frames at storm=${gCalm.ss[gCalm.ss.length - 1]}, max |gust| ${Math.max(...gCalm.a.map(Math.abs))}`)

      // time-of-day + clouds sliders (#456)
      const sliders = await page.evaluate(() => ({
        tod: !!document.getElementById('tod'), cloud: !!document.getElementById('cloud'),
        shoot: !!document.getElementById('shoot'), shootDefault: +(document.getElementById('shoot') || {}).value,
      }))
      ok('time + clouds sliders present', sliders.tod && sliders.cloud)
      ok('#609 meteor slider present and default OFF', sliders.shoot && sliders.shootDefault === 0, `present=${sliders.shoot} default=${sliders.shootDefault}`)

      await page.evaluate(() => window.__oceanTest.setTod(0))
      await page.waitForTimeout(900)
      const nightImg = decodePng(await page.screenshot())
      const nightTop = analyze(nightImg, 0, Math.floor(nightImg.h * 0.25))
      const nightStars = Math.max(starPix(nightImg, 0, Math.floor(nightImg.h * 0.4)),
        await sampleMax(page, 2, img => starPix(img, 0, Math.floor(img.h * 0.4))))
      await page.evaluate(() => window.__oceanTest.setTod(0.66))
      await page.waitForTimeout(900)
      const dayImg = decodePng(await page.screenshot())
      const dayTop = analyze(dayImg, 0, Math.floor(dayImg.h * 0.25))
      const dayStars = starPix(dayImg, 0, Math.floor(dayImg.h * 0.4))
      ok('night darkens the sky hard', nightTop.mean < dayTop.mean * 0.5, `sky mean day=${dayTop.mean.toFixed(0)} night=${nightTop.mean.toFixed(0)}`)
      ok('night shows stars/moon, day does not', nightStars > 60 && dayStars < 10, `stars night=${nightStars} day=${dayStars}`)
      const dayRefl = await page.evaluate(() => window.__oceanTest.stars().reflect)
      ok('day: star reflections disarmed', dayRefl === 0, `reflect=${dayRefl}`)

      await page.evaluate(() => { window.__oceanTest.setTod(1); window.__oceanTest.setCloud(0) })
      await page.waitForTimeout(700)
      const clearSun = analyze(decodePng(await page.screenshot()), Math.floor(540 * 0.28), Math.floor(540 * 0.52)).bright
      await page.evaluate(() => window.__oceanTest.setCloud(1))
      await page.waitForTimeout(900)
      const ovcSun = analyze(decodePng(await page.screenshot()), Math.floor(540 * 0.28), Math.floor(540 * 0.52)).bright
      ok('overcast flattens the sun', ovcSun < clearSun * 0.5, `bright-clear=${clearSun} bright-overcast=${ovcSun}`)

      await page.evaluate(() => { window.__oceanTest.setTod(0); window.__oceanTest.setCloud(0.5); window.__oceanTest.setStorm(1) })
      await page.waitForTimeout(1800)
      const nsVar = await page.evaluate(() => window.__oceanTest.stats())
      const nsUi = await page.evaluate(() => ({
        t: document.getElementById('todLbl').textContent,
        c: document.getElementById('cloudLbl').textContent,
        s: document.getElementById('seaLbl').textContent,
      }))
      ok('storm-at-night combines (NIGHT · BROKEN · STORM, live water)',
        nsVar.variance > 1 && nsUi.t === 'NIGHT' && nsUi.c === 'BROKEN' && nsUi.s === 'STORM',
        `${nsUi.t}/${nsUi.c}/${nsUi.s} var=${nsVar.variance.toFixed(3)}`)
      await page.evaluate(() => { window.__oceanTest.setStorm(0); window.__oceanTest.setTod(1); window.__oceanTest.setCloud(0) })
      await page.waitForTimeout(1200)

      // 6. NIGHT (#520): a real Yale BSC night sky — real catalog, real celestial math
      await page.evaluate(() => { window.__oceanTest.setTod(0); window.__oceanTest.setCloud(0); window.__oceanTest.setStorm(0) })
      await page.waitForTimeout(900)
      const sk = await page.evaluate(() => window.__oceanTest.stars())
      ok('night: ~2900 Yale BSC stars embedded (to mag 5.5, #607)', sk.count >= 2500 && sk.count <= 3000, `count=${sk.count} mw=${sk.mwCount} lat=${sk.lat}`)
      ok('night: faint Milky Way band embedded', sk.mwCount >= 200, `mw=${sk.mwCount}`)
      ok('night: brightest star is Sirius (mag -1.46)', sk.named.sirius && Math.abs(sk.named.sirius.mag + 1.46) < 0.05, sk.named.sirius ? `mag=${sk.named.sirius.mag}` : 'missing')
      ok('night: Polaris at the N pole (dec ~89.3)', sk.named.polaris && Math.abs(sk.named.polaris.dec - 89.26) < 0.6, sk.named.polaris ? `dec=${sk.named.polaris.dec}` : 'missing')
      const dipAll = Object.values(sk.named.dipper).filter(Boolean).length
      const dipUp = Object.values(sk.named.dipper).filter(s => s && s.above).length
      ok('night: Big Dipper — all 7 stars present', dipAll === 7, `${dipAll}/7 in catalog`)
      ok('night: Big Dipper up at NIGHT (circumpolar body)', dipUp >= 6, `${dipUp}/7 above horizon`)
      ok('night: Orion — all 7 stars present', Object.values(sk.named.orion).filter(Boolean).length === 7, '')
      ok('night: celestial pole at the latitude altitude', Math.abs(sk.named.polaris.alt - sk.lat) < 3.0, `Polaris alt=${sk.named.polaris.alt} vs lat=${sk.lat}`)
      const pAz = sk.named.polaris.az
      ok('night: pole is due north (Polaris azimuth ~0/360)', pAz < 12 || pAz > 348, `Polaris az=${pAz}`)
      ok('night: star billboards actually drawing', sk.uploaded > 100, `uploaded=${sk.uploaded} night=${sk.night}`)
      // #607: the stars must FILL the sky, not sit in a thin band across it.
      let bestSpread = { count: 0, ySpan: 0, xSpan: 0 }
      for (let i = 0; i < 3; i++) {
        const sp = starSpread(decodePng(await page.screenshot()), 0, Math.floor(540 * 0.44))
        if (sp.count > bestSpread.count) bestSpread = sp
        await page.waitForTimeout(350)
      }
      ok('night: stars fill the sky (not a line)', bestSpread.count >= 8000 && bestSpread.ySpan >= 140 && bestSpread.xSpan >= 500,
        `count=${bestSpread.count} ySpan=${bestSpread.ySpan} xSpan=${bestSpread.xSpan}`)
      // #608: the same sky mirrors into the sea — armed strength + glitter on both
      // flanks of the moon column (best of 3 frames; reflections scintillate).
      const reflK = (await page.evaluate(() => window.__oceanTest.stars())).reflect
      ok('night: star reflections armed on the sea (#608)', reflK > 0.2, `reflect=${reflK}`)
      let glL = { count: 0, xSpan: 0 }, glR = { count: 0, xSpan: 0 }
      for (let i = 0; i < 3; i++) {
        const img = decodePng(await page.screenshot())
        const l = seaGlint(img, 40, 320), r = seaGlint(img, 640, 920)
        if (l.count > glL.count) glL = l
        if (r.count > glR.count) glR = r
        await page.waitForTimeout(350)
      }
      ok('night: stars glitter on the sea away from the moon (#608)',
        glL.count >= 3 && glL.xSpan >= 60 && glR.count >= 3 && glR.xSpan >= 60,
        `L ${glL.count}px/${glL.xSpan} R ${glR.count}px/${glR.xSpan}`)
      const azA = (await page.evaluate(() => window.__oceanTest.stars())).named.arcturus.az
      await page.evaluate(() => window.__oceanTest.setTod(0.3))
      await page.waitForTimeout(700)
      const azB = (await page.evaluate(() => window.__oceanTest.stars())).named.arcturus.az
      let dAz = Math.abs(azB - azA); if (dAz > 180) dAz = 360 - dAz
      ok('night: sky rotates with the time slider', dAz > 20, `Arcturus az ${azA} → ${azB} (Δ=${dAz.toFixed(0)}°)`)
      await page.evaluate(() => window.__oceanTest.setTod(0))
      await page.waitForTimeout(500)

      // 6b. #609 METEORS — the shooting-star slider. OFF must leave the night sky
      //     byte-identical to pre-#609 (no trail instances appended); ON at night puts
      //     at least one streak on screen, the count scales with the slider, and the
      //     streaks add bright sky pixels. Mutant: pin want=0 in emitMeteors → the
      //     three behaviour gates below go red.
      await page.evaluate(() => window.__oceanTest.setShoot(0))
      await page.waitForTimeout(500)
      const mOff = await page.evaluate(() => window.__oceanTest.meteors())
      ok('#609 meteors OFF: none active, sky byte-identical to pre-#609',
        mOff.active === 0 && mOff.trailInstances === 0 && mOff.uploaded === mOff.statics, JSON.stringify(mOff))
      const mSkyOff = await sampleMax(page, 3, img => starPix(img, 0, Math.floor(540 * 0.42)))
      await page.evaluate(() => window.__oceanTest.setShoot(1))
      await page.waitForTimeout(900)
      const mOn = await page.evaluate(() => window.__oceanTest.meteors())
      ok('#609 meteors ON at rate 1: streaks present + trail instances',
        mOn.rate >= 0.9 && mOn.active >= 1 && mOn.trailInstances > 0, `active=${mOn.active} trailInstances=${mOn.trailInstances} rate=${mOn.rate}`)
      const mSkyOn = await sampleMax(page, 3, img => starPix(img, 0, Math.floor(540 * 0.42)))
      ok('#609 meteors add bright sky pixels at night', mSkyOn > mSkyOff + 8, `off=${mSkyOff} on=${mSkyOn}`)
      await page.evaluate(() => window.__oceanTest.setShoot(0.12))
      await page.waitForTimeout(900)
      const mLow = await page.evaluate(() => window.__oceanTest.meteors())
      await page.evaluate(() => window.__oceanTest.setShoot(1))
      await page.waitForTimeout(900)
      const mHigh = await page.evaluate(() => window.__oceanTest.meteors())
      ok('#609 meteor count scales with the slider', mHigh.active >= mLow.active && mHigh.trailInstances > mLow.trailInstances, `low=${mLow.active} high=${mHigh.active}`)
      await page.evaluate(() => window.__oceanTest.setShoot(0))
      await page.waitForTimeout(300)
      if (shots) {
        // frame the Big Dipper high in the north (yaw=+Z=north, pitched up ~64°)
        await page.evaluate(() => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: Math.PI / 2, pitch: 1.12 }))
        await page.waitForTimeout(700)
        writeFileSync(resolve(shots, 'night-dipper.png'), await page.screenshot())
      }

      // 7. PHONE (#704): the night sky must read as a full field on a DPR>1 phone in
      //    portrait. Star sizes are CSS-px scaled by the render DPR (a 1.1-canvas-px
      //    faint star is sub-pixel on a DPR-1.75 phone); the Milky Way is a field of
      //    large, very dim, overlapping soft billboards — a continuous glow, never dots.
      const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.75 })
      const phonePage = await phoneCtx.newPage()
      const phoneErrs = []
      phonePage.on('pageerror', e => phoneErrs.push(e.message))
      phonePage.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('WGSL'))) phoneErrs.push(m.text().split('\n')[0]) })
      await phonePage.goto(url, { waitUntil: 'load' })
      let phoneReady = true
      try { await phonePage.waitForFunction(() => window.__oceanTest && window.__oceanTest.ready, null, { timeout: 20000 }) } catch { phoneReady = false }
      ok('phone: boots (390×844 DPR 1.75)', phoneReady && phoneErrs.length === 0, phoneErrs[0])
      if (phoneReady) {
        await phonePage.waitForTimeout(3000)
        await phonePage.evaluate(() => { window.__oceanTest.setTod(0); window.__oceanTest.setCloud(0); window.__oceanTest.setStorm(0) })
        await phonePage.waitForTimeout(1000)
        const pcfg = await phonePage.evaluate(() => { const s = window.__oceanTest.stars(); return { starMinCss: s.starMinCss, starMaxCss: s.starMaxCss, mwSizeCss: s.mwSizeCss, mwGain: s.mwGain, dprCap: s.dprCap, uploaded: s.uploaded } })
        ok('phone: DPR scaling active (star CSS-px × dpr)', pcfg.dprCap > 1.2, `dprCap=${pcfg.dprCap} starMin=${pcfg.starMinCss} starMax=${pcfg.starMaxCss}`)
        ok('phone: faint star end lifts above sub-pixel (min CSS ≥ 1.5)', pcfg.starMinCss >= 1.5, `starMinCss=${pcfg.starMinCss}`)
        ok('phone: Milky Way is a soft glow (gain < 0.3, blob ≫ star)', pcfg.mwGain < 0.3 && pcfg.mwSizeCss > pcfg.starMaxCss, `mwGain=${pcfg.mwGain} mwSize=${pcfg.mwSizeCss} starMax=${pcfg.starMaxCss}`)
        // stars fill the portrait sky width (not a horizontal strip): sample the sky
        // band (top 55% of the portrait frame) and check the blue-channel local lift
        // spans >80% of the width at a moderate threshold
        await phonePage.evaluate(() => { window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: 0.3 }) })
        await phonePage.waitForTimeout(1200)
        const phoneImg = decodePng(await phonePage.screenshot())
        const { w, h, px, bpp } = phoneImg
        const y0 = Math.floor(h * 0.08), y1 = Math.floor(h * 0.52)
        // local background: 8×8 coarse box blur of the blue channel
        const F = 8, cw = Math.floor(w / F), ch = Math.floor((y1 - y0) / F)
        const coarse = new Float32Array(cw * ch)
        for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
          let s = 0, n = 0
          for (let y = y0 + cy * F; y < y0 + (cy + 1) * F; y++) for (let x = cx * F; x < (cx + 1) * F; x++) { s += px[(y * w + x) * bpp + 2]; n++ }
          coarse[cy * cw + cx] = s / n
        }
        const colMax = new Float32Array(w)
        for (let y = y0; y < y1; y++) {
          const row = Math.floor((y - y0) / F)
          for (let x = 0; x < w; x++) {
            const cx = Math.min(Math.floor(x / F), cw - 1)
            const lift = px[(y * w + x) * bpp + 2] - coarse[row * cw + cx]
            if (lift > colMax[x]) colMax[x] = lift
          }
        }
        const THR = 4
        let covered = 0
        for (let x = 0; x < w; x++) if (colMax[x] > THR) covered++
        const covFrac = covered / w
        ok('phone: star field fills the portrait sky width (not a strip)', covFrac > 0.8 && pcfg.uploaded > 100,
          `covFrac=${covFrac.toFixed(2)} covered=${covered}/${w} uploaded=${pcfg.uploaded}`)
      }
      await phoneCtx.close()
    }

    // page must stay clean overall (validation errors land in console)
    const gpuErrs = errs.filter(e => !e.includes('favicon'))
    ok('zero page/validation errors', gpuErrs.length === 0, gpuErrs.slice(0, 2).join(' | '))
  } finally {
    await browser.close().catch(() => {})
    chrome.kill()
  }

  const failures = results.filter(r => !r.pass)
  if (asJson) console.log(JSON.stringify({ pass: failures.length === 0, results }, null, 2))
  else console.log(failures.length === 0 ? '\noceancheck: ALL GREEN' : `\noceancheck: ${failures.length} FAILURE(S)`)
  process.exit(failures.length === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
