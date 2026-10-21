import { spawn } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright-core')) } catch { console.error('no pw'); process.exit(1) }

const file = process.argv[3] ? resolve(process.argv[3]) : resolve(ROOT, 'public/demos/ocean.html')
const url = 'file://' + file
const PORT = 9391

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--user-data-dir=/tmp/forge/probe704-profile', 'about:blank',
], { stdio: 'ignore' })

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
        case 4: { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break }
        default: r = v
      }
      out[y * stride + x] = r & 255
    }
  }
  return { w, h, bpp, px: out }
}

// local-background lifting: a coarse box blur (downsample F, upscale) of the blue
// channel, then lift = B - blurB. Removes the smooth moon glow, isolates stars + MW.
function localLift(img, F = 6) {
  const { w, h, px, bpp } = img
  const cw = Math.floor(w / F), ch = Math.floor(h / F)
  const coarse = new Float32Array(cw * ch)
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let s = 0, n = 0
    for (let y = cy * F; y < (cy + 1) * F; y++) for (let x = cx * F; x < (cx + 1) * F; x++) { s += px[(y * w + x) * bpp + 2]; n++ }
    coarse[cy * cw + cx] = s / n
  }
  const blur = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) blur[y * w + x] = coarse[Math.floor(y / F) * cw + Math.floor(x / F)]
  const lift = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lift[i] = px[i * bpp + 2] - blur[i]
  return lift
}
// connected components (4-conn) of lift > thr over region rows [y0,y1); return areas
function components(img, lift, y0, y1, thr) {
  const { w } = img
  const seen = new Uint8Array(w * (y1 - y0))
  const areas = []
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const idx = (y - y0) * w + x
    if (seen[idx] || lift[y * w + x] < thr) continue
    // flood fill
    const stack = [idx]
    seen[idx] = 1
    let comp = 0
    while (stack.length) {
      const cur = stack.pop()
      const cx = cur % w, cy = y0 + Math.floor(cur / w)
      comp++
      const nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < y0 || ny >= y1 || nx >= w) continue
        const ni = (ny - y0) * w + nx
        if (!seen[ni] && lift[ny * w + nx] >= thr) { seen[ni] = 1; stack.push(ni) }
      }
    }
    areas.push(comp)
  }
  return areas
}
function analyze(img, fLo, fHi, F = 10) {
  const { h, w } = img
  const y0 = Math.floor(h * fLo), y1 = Math.floor(h * fHi)
  const lift = localLift(img, F)
  // per-column max lift in the region
  const colMax = new Array(w).fill(0)
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const l = lift[y * w + x]; if (l > colMax[x]) colMax[x] = l }
  const rep = {}
  for (const T of [3, 4, 6, 8]) {
    let cov = 0, maxRun = 0, run = 0
    for (let x = 0; x < w; x++) {
      if (colMax[x] > T) { cov++; run++; if (run > maxRun) maxRun = run } else run = 0
    }
    rep['T' + T] = { covFrac: +(cov / w).toFixed(2), maxRun }
  }
  // faint star count: local brightening above a higher lift, whole sky (excludes smooth moon via blur)
  let faint = 0
  const ys0 = Math.floor(h * 0.30), ys1 = Math.floor(h * 0.86)
  for (let y = ys0; y < ys1; y++) for (let x = 0; x < w; x++) if (lift[y * w + x] > 12) faint++
  return { ...rep, faint }
}



let browser
for (let i = 0; i < 40 && !browser; i++) {
  await new Promise(r => setTimeout(r, 500))
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { }
}
if (!browser) { chrome.kill(); console.error('no chrome'); process.exit(1) }

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.75 })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('WGSL'))) errs.push(m.text().split('\n')[0]) })
await page.goto(url, { waitUntil: 'load' })
try { await page.waitForFunction(() => window.__oceanTest && window.__oceanTest.ready, null, { timeout: 20000 }) } catch { console.error('no ready'); }
await page.waitForTimeout(2500)
const stars = await page.evaluate(() => window.__oceanTest.stars())
await page.evaluate(() => { window.__oceanTest.setTod(0); window.__oceanTest.setCloud(0); window.__oceanTest.setStorm(0) })
const PITCH = process.argv[2] ? parseFloat(process.argv[2]) : 0.35
await page.evaluate((p) => window.__oceanTest.setPose({ pos: [0, 3.1, -14], yaw: 0, pitch: p }), PITCH)
await page.waitForTimeout(1300)
const png = await page.screenshot()
writeFileSync(process.argv[4] || '/tmp/phone-night.png', png)
const img = decodePng(png)
const cfg = await page.evaluate(() => { const s = window.__oceanTest.stars(); return { starMinCss: s.starMinCss, starMaxCss: s.starMaxCss, mwSizeCss: s.mwSizeCss, mwGain: s.mwGain, dprCap: s.dprCap } })
const band = analyze(img, 0.5, 0.82)
console.log('cfg:', JSON.stringify(cfg))
console.log('img', img.w, 'x', img.h, 'BAND cols:', JSON.stringify(band), 'faintPx', band.faint)
console.log('errs:', errs.slice(0, 3))
await browser.close().catch(() => { }); chrome.kill()
