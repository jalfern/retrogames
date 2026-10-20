// shorecheck — self-verifying harness for public/demos/shore.html (#521).
//
// Proves three things about the WebGPU golden-hour beach demo:
//   1. BOOTS  — WebGPU adapter + device acquired, zero console/WGSL errors,
//               rAF advancing.
//   2. RULES  — the shore physics the issue specifies, cross-checked between
//               the CPU swash lanes and the GPU readback (probeNow pairs a
//               compute-probe copy with the lane snapshot of the same frame):
//                 · swash oscillates (waterline runs up and back)
//                 · uprush is faster than backwash (skewed oscillator)
//                 · wet-limit lags the waterline (wet sand dries slowly)
//                 · GPU depth > 0 where the sea is, ~0 above the wet line,
//                   thin sheet behind the advancing waterline
//                 · depth field varies in time; breaker foam exists
//   3. WINS   — golden-hour look: warm sky, foam pixels, warm sand, and a
//               camera that changes the world.
//
// Chrome is launched DIRECTLY with --enable-unsafe-swiftshader (playwright's
// stock switches hide navigator.gpu; same recipe as oceancheck).
//
// Usage:
//   node scripts/shorecheck.mjs [--file <path>] [--json] [--shots <dir>] [--strip]
// --shots writes view-a.png / view-b.png; --strip adds strip.png (nine frames
// of one incoming wave) and waveframes/f0..f8.png. Exit 0 = all green.
// Proven-fail mutant: pin `nx = xsCurve(laneZ[i])` in simStep → swash
// oscillation, asymmetry, sheet-behind-line and foam-edge checks go red.

import { spawn } from 'node:child_process'
import { inflateSync, deflateSync } from 'node:zlib'
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
const file = resolve(ROOT, opt('--file', 'public/demos/shore.html'))
const shots = opt('--shots', null)
const wantStrip = args.includes('--strip')
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9378')
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

// --- minimal PNG encode (8-bit RGBA, filter 0) ---
function encodePng(w, h, rgba) {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

function analyze(img, yFrom, yTo, pred) {
  let n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      if (pred(img.px[i], img.px[i + 1], img.px[i + 2])) n++
    }
  }
  return n
}
const meanLum = (img, yFrom, yTo) => {
  let s = 0, n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      s += img.px[i] + img.px[i + 1] + img.px[i + 2]; n += 3
    }
  }
  return s / n
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/shorecheck-profile`, 'about:blank',
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
    try { await page.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGPU + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__shoreTest.frames > 10))

      // 2. rules — swash trace over ~13 s (> one 7.4 s swell period)
      const trace = []
      for (let i = 0; i < 90; i++) {
        trace.push(await page.evaluate(() => window.__shoreTest.swashMean()))
        await page.waitForTimeout(150)
      }
      const runs = trace.map(s => s.run)
      const mn = Math.min(...runs), mx = Math.max(...runs)
      const mean = runs.reduce((a, b) => a + b, 0) / runs.length
      const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length)
      ok('swash oscillates (waterline runs up and back)', sd > 0.4 && mx - mn > 1.2, `run ${mn.toFixed(2)}…${mx.toFixed(2)} m sd=${sd.toFixed(2)}`)

      // asymmetry: rise rate vs fall rate of the largest cycle
      const iPk = runs.indexOf(mx)
      let iPrev = iPk
      while (iPrev > 0 && runs[iPrev] > runs[iPrev - 1]) iPrev--
      let iNext = iPk
      while (iNext < runs.length - 1 && runs[iNext] > runs[iNext + 1]) iNext++
      const dtUp = (iPk - iPrev) * 0.15 || 0.15, dtDn = (iNext - iPk) * 0.15 || 0.15
      const vUp = (mx - runs[iPrev]) / dtUp, vDn = (mx - runs[iNext]) / dtDn
      ok('uprush faster than backwash', vUp > vDn * 1.15 && vUp > 0.15, `vUp=${vUp.toFixed(2)} vDn=${vDn.toFixed(2)} m/s`)

      const lagPeak = Math.max(...trace.map(s => s.wetLag))
      ok('wet band lags the waterline (drying memory)', lagPeak > 0.6, `peak lag ${lagPeak.toFixed(2)} m`)

      const ln = await page.evaluate(() => window.__shoreTest.lanes())
      ok('wet-limit never below waterline', ln.wet.every((w, i) => w >= ln.xw[i] - 1e-3))

      // GPU/CPU cross-check on a paired probe frame
      const pr = await page.evaluate(() => window.__shoreTest.probeNow())
      if (!pr || !pr.data) {
        ok('probe readback available', false, 'probeNow() returned null')
      } else {
        const ZU = z => Math.max(0, Math.min(127, Math.round((z + 70) / 140 * 127)))
        const xsC = z => 84 + 9 * Math.sin(z * 0.043 + 1.7) + 3.5 * Math.sin(z * 0.12 + 0.6)
        let sea = 0, seaOk = 0, dry = 0, dryOk = 0, sheet = 0, sheetOk = 0
        let foamCells = 0, foamMax = 0, dSum = 0
        for (let i = 0; i < 32 * 32; i++) {
          const x = pr.data[i * 4], z = pr.data[i * 4 + 1], d = pr.data[i * 4 + 2], f = pr.data[i * 4 + 3]
          dSum += Math.abs(d)
          const l = ZU(z), xw = pr.lanes.xw[l], wl = pr.lanes.wet[l], xs = xsC(z)
          const h = 0.052 * (x - xs) - 0.16 * Math.exp(-Math.pow((x - xs + 9) / 5, 2))
          if (f > 0.4) foamCells++
          if (f > foamMax) foamMax = f
          if (h < -0.05) { sea++; if (d > 0.02) seaOk++ }
          else if (x > wl + 0.8) { dry++; if (d < 0.03) dryOk++ }
          else if (h > 0.05 && x < xw - 0.6) { sheet++; if (d > 0.015) sheetOk++ }
        }
        ok('GPU depth > 0 across the sea cells', seaOk > sea * 0.9, `${seaOk}/${sea}`)
        ok('GPU depth ~0 above the wet line', dryOk > dry * 0.9, `${dryOk}/${dry}`)
        ok('thin sheet behind the waterline', sheet >= 2 && sheetOk === sheet, `${sheetOk}/${sheet}`)
        ok('breaker/uprush foam present on GPU field', foamCells >= 6 && foamMax > 0.6, `cells=${foamCells} max=${foamMax.toFixed(2)}`)

        await page.waitForTimeout(2500)
        const pr2 = await page.evaluate(() => window.__shoreTest.probeNow())
        let dDelta = 0
        if (pr2 && pr2.data) for (let i = 0; i < 32 * 32; i++) dDelta += Math.abs(pr2.data[i * 4 + 2] - pr.data[i * 4 + 2])
        ok('depth field varies in time', dDelta / (32 * 32) > 0.004, `mean|Δd|=${(dDelta / 1024).toFixed(4)}`)
      }

      // 3. wins — golden-hour look + camera reacts
      await page.evaluate(() => window.__shoreTest.setPose({ pos: [48, 3.0, -18], yaw: -0.55, pitch: -0.15 }))
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const imgA = decodePng(bufA)
      const skyWarm = meanLum(imgA, 0, Math.floor(imgA.h * 0.22)) > 110
      const foamPix = analyze(imgA, Math.floor(imgA.h * 0.35), imgA.h, (r, g, b) => r > 200 && g > 200 && b > 190 && r - b <= 30)
      const sandPix = analyze(imgA, Math.floor(imgA.h * 0.18), Math.floor(imgA.h * 0.52), (r, g, b) => r > 150 && r < 250 && r - b > 45 && g - b > 15 && g < r)
      ok('golden-hour sky (warm bright top band)', skyWarm, `mean lum=${meanLum(imgA, 0, Math.floor(imgA.h * 0.22)).toFixed(0)}`)
      ok('foam lines visible', foamPix > 800, `${foamPix} foam px`)
      ok('warm sand visible', sandPix > 4000, `${sandPix} sand px`)

      const ui = await page.evaluate(() => document.getElementById('runLbl').textContent)
      ok('HUD reports live run-up', parseFloat(ui) > 0.3, `runLbl=${ui}m`)

      await page.evaluate(() => window.__shoreTest.setPose({ pos: [48, 3.0, -18], yaw: -1.62, pitch: -0.10 }))
      await page.waitForTimeout(1200)
      const bufB = await page.screenshot()
      const imgB = decodePng(bufB)
      let d = 0
      for (let i = 0; i < Math.min(imgA.px.length, imgB.px.length); i += 64) d += Math.abs(imgA.px[i] - imgB.px[i])
      ok('camera pose changes the world', d / (imgA.px.length / 64) > 8, `mean|Δ|=${(d / (imgA.px.length / 64)).toFixed(1)}`)

      // set-catch UI: watch for a BIG set within the run
      let sawBig = false
      for (let i = 0; i < 60 && !sawBig; i++) {
        if (await page.evaluate(() => document.getElementById('setLbl').textContent) === 'BIG') sawBig = true
        else await page.waitForTimeout(250)
      }
      ok('wave-set label catches a BIG set', sawBig)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'view-a.png'), bufA)
        writeFileSync(resolve(shots, 'view-b.png'), bufB)
      }

      if (wantStrip) {
        const dir = shots || 'docs/shots/shore'
        mkdirSync(resolve(dir, 'waveframes'), { recursive: true })
        // wait for an uprush onset: run crossing 0.55 x recent-max upward
        let prevRun = await page.evaluate(() => window.__shoreTest.swashMean().run)
        for (let i = 0; i < 120; i++) {
          await page.waitForTimeout(120)
          const r = await page.evaluate(() => window.__shoreTest.swashMean().run)
          if (r > 1.0 && r > prevRun + 0.12) break
          prevRun = r
        }
        const frames = [], raws = []
        for (let i = 0; i < 9; i++) {
          const b = await page.screenshot()
          raws.push(b); frames.push(decodePng(b))
          await page.waitForTimeout(550)
        }
        frames.forEach((f, i) => writeFileSync(resolve(dir, 'waveframes', `f${i}.png`), raws[i]))
        const TW = 320, TH = 180
        const grid = Buffer.alloc(TW * 3 * TH * 3 * 4)
        for (let n = 0; n < 9; n++) {
          const f = frames[n], ox = (n % 3) * TW, oy = Math.floor(n / 3) * TH
          for (let y = 0; y < TH; y++) {
            for (let x = 0; x < TW; x++) {
              const si = (Math.floor(y * f.h / TH) * f.w + Math.floor(x * f.w / TW)) * f.bpp
              const di = ((oy + y) * TW * 3 + ox + x) * 4
              grid[di] = f.px[si]; grid[di + 1] = f.px[si + 1]; grid[di + 2] = f.px[si + 2]; grid[di + 3] = 255
            }
          }
        }
        writeFileSync(resolve(dir, 'strip.png'), encodePng(TW * 3, TH * 3, grid))
      }
    }

    ok('zero page/WGSL errors', errs.length === 0, errs.slice(0, 2).join(' | '))
  } finally {
    chrome.kill()
  }

  if (asJson) console.log(JSON.stringify(results, null, 1))
  const failed = results.filter(r => !r.pass)
  if (!asJson) console.log(`\n${results.length - failed.length}/${results.length} green`)
  process.exit(failed.length ? 1 : 0)
}

main()
