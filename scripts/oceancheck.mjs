// oceancheck — self-verifying harness for public/demos/ocean.html (#451).
//
// Proves three things about the WebGPU sunset-ocean demo:
//   1. BOOTS  — WebGPU adapter + device acquired, zero console/validation errors.
//   2. RULES  — the FFT height field is non-flat AND time-varying (GPU readback);
//               the horizon is stable (sky does not move with the waves).
//   3. WINS   — the drawn frame is pixel-diverse, contains a bright sun and a
//               glitter path, and reacts to camera poses (moving camera → new frame).
//
// Chrome is launched DIRECTLY (not via playwright's default args): playwright's
// stock switches hide `navigator.gpu`; headless Chrome 155 exposes a real
// Apple/metal-3 adapter when run with --enable-unsafe-swiftshader. Pages must be
// served from a secure context (file:// or http://localhost) — about:blank hides
// the GPU. See STATE/issues: probed 2026-10-18.
//
// Usage:
//   node scripts/oceancheck.mjs [--file <path>] [--json]
// Exit 0 = all green. Proven-fail mutant: set `t` frozen (replace `t += dt`
// with `t += 0`) → "time-varying" assertion goes red.

import { spawn } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
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
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })

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
