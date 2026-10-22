// campfirecheck — self-verifying harness for public/demos/campfire.html (#670).
//
// Proves the volumetric night-fire demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, zero page errors.
//   2. RULES  — the fire behaves like fire, sensed from pixels only:
//     · a big warm flame body sits at screen centre
//     · its core runs white-hot (r,g,b all high near the axis)
//     · the flame flickers (warm-area varies frame to frame, never goes out)
//     · the fire lights the ground around it (warm-lit band under the pit)
//     · the world beyond the ring falls to darkness (top corners stay dark)
//     · embers glow outside the flame silhouette and move
//     · the sky is dark but carries star pinpoints
//     · the camera pose moves the world
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); no arcade links from the demo.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Usage: node scripts/campfirecheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 45]
// Proven-fail mutant: zero the volume emission (`emis += T * e * dt` ->
// `emis += vec3(0.0)`) -> flame-body, white-core and flicker checks go red.
// Mutant 2 (#695 item 3): revert ember seed layout to per-seed
// (`i * 7.31 + SEED`) -> burst gate red two ways: floor(s*4) grouping gave
// cluster=1 (no bursts), floor(s/100) on the old layout gave cluster=14
// (whole-field pulse) — the two-sided window catches both.

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
const file = resolve(ROOT, opt('--file', 'public/demos/campfire.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 45)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9379')
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

const px = (img, x, y) => { const i = (y * img.w + x) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]] }
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 4 // undo stride-2 sampling
}

function meanRGB(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return [r / n, g / n, b / n]
}
const warm = (r, g, b) => r > 150 && r - b > 60
const hotCore = (r, g, b) => r > 225 && g > 165 && b > 90
const dimStar = (r, g, b) => r > 90 && b > 90 && g > 70

async function main() {
  // ---- static law checks (no browser) ----
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/campfire/i.test(reg))
  ok('exposes __campfireTest DEV hook', /__campfireTest/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/campfirecheck-profile`, 'about:blank',
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

    let ready = true
    try { await page.waitForFunction(() => window.__campfireTest && window.__campfireTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__campfireTest.frames > 15))
      const hdr = await page.evaluate(() => window.__campfireTest.hdr)
      ok('HDR float render target active', hdr)

      // geometry: camera looks at the fire; flame body sits near screen centre,
      // horizon ~45% down, ground occupies the lower half.
      await page.evaluate(() => window.__campfireTest.setPose({ yaw: 0.14, pitch: -0.14 }))
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const img = decodePng(bufA)
      const W = img.w, H = img.h
      const cx = Math.round(W * 0.5)
      const flame = { x0: Math.round(cx - W * 0.09), x1: Math.round(cx + W * 0.09), y0: Math.round(H * 0.30), y1: Math.round(H * 0.72) }

      const flameWarm = countIn(img, flame.x0, flame.y0, flame.x1, flame.y1, warm)
      ok('flame body present (warm column at centre)', flameWarm > 6000, `${flameWarm} warm px in flame box`)
      const coreBox = { x0: cx - 40, x1: cx + 40, y0: Math.round(H * 0.55), y1: Math.round(H * 0.68) }
      const coreHot = countIn(img, coreBox.x0, coreBox.y0, coreBox.x1, coreBox.y1, hotCore)
      ok('core runs white-hot near the coal bed', coreHot > 300, `${coreHot} hot-core px`)

      // flicker: warm-area in the flame box varies over ~2.4 s but never dies
      const samples = []
      for (let i = 0; i < 12; i++) {
        const b = decodePng(await page.screenshot())
        samples.push(countIn(b, flame.x0, flame.y0, flame.x1, flame.y1, warm))
        await page.waitForTimeout(200)
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      const sd = Math.sqrt(samples.reduce((a, s) => a + (s - mean) * (s - mean), 0) / samples.length)
      ok('flame flickers (warm area varies 2.4 s)', sd / mean > 0.05 && Math.min(...samples) > 1500,
        `mean=${mean.toFixed(0)} sd=${sd.toFixed(0)} min=${Math.min(...samples)}`)

      // cast light: ground band around the pit is warm-lit...
      const litWarm = (r, g, b) => r > 70 && r - b > 25
      const groundWarm = countIn(img, Math.round(W * 0.15), Math.round(H * 0.60), Math.round(W * 0.85), Math.round(H * 0.92), litWarm)
      ok('fire lights the ground around the pit', groundWarm > 15000, `${groundWarm} warm-lit ground px`)
      // ...and the far world stays dark
      const cornerL = meanRGB(img, 0, Math.round(H * 0.05), Math.round(W * 0.12), Math.round(H * 0.30))
      const cornerR = meanRGB(img, Math.round(W * 0.88), Math.round(H * 0.05), W, Math.round(H * 0.30))
      const darkOk = cornerL[0] < 42 && cornerR[0] < 42
      ok('world beyond the ring falls to darkness', darkOk,
        `corners R=${cornerL[0].toFixed(0)}/${cornerR[0].toFixed(0)}`)

      // sky dark + star pinpoints
      const skyMean = meanRGB(img, Math.round(W * 0.2), 0, Math.round(W * 0.8), Math.round(H * 0.18))
      const stars = countIn(img, Math.round(W * 0.1), 0, Math.round(W * 0.9), Math.round(H * 0.22), dimStar)
      ok('night sky is dark', (skyMean[0] + skyMean[1] + skyMean[2]) / 3 < 40, `sky mean=${((skyMean[0] + skyMean[1] + skyMean[2]) / 3).toFixed(0)}`)
      ok('starfield visible in the sky', stars > 12, `${stars} star px`)

      // embers: warm specks outside the flame box, between horizon and flame tips
      const emberBox = { x0: Math.round(W * 0.12), x1: Math.round(W * 0.88), y0: Math.round(H * 0.22), y1: Math.round(H * 0.72) }
      const isEmber = (r, g, b) => r > 150 && r - b > 70 && g < 225
      const centA = [], centB = []
      const scanEmber = (im, cents) => {
        let acc = 0
        for (let y = emberBox.y0; y < emberBox.y1; y += 2) for (let x = emberBox.x0; x < emberBox.x1; x += 2) {
          if (x > cx - W * 0.05 && x < cx + W * 0.05) continue
          const [r, g, b] = px(im, x, y)
          if (isEmber(r, g, b)) { acc++; cents.push([x, y]) }
        }
        return acc
      }
      const eA = scanEmber(img, centA)
      await page.waitForTimeout(1500)
      const imgB = decodePng(await page.screenshot())
      const eB = scanEmber(imgB, centB)
      ok('embers glow outside the flame silhouette', eA > 8 && eB > 8, `${eA} / ${eB} ember px`)
      const drift = centA.length && centB.length
        ? Math.hypot(
          centA.reduce((a, c) => a + c[0], 0) / centA.length - centB.reduce((a, c) => a + c[0], 0) / centB.length,
          centA.reduce((a, c) => a + c[1], 0) / centA.length - centB.reduce((a, c) => a + c[1], 0) / centB.length)
        : 0
      ok('ember field moves (rising/twinkling)', drift > 1.5 || eA !== eB, `centroid drift=${drift.toFixed(1)}px, count ${eA}->${eB}`)

      // #695 item 3: sparks erupt in sap-pop bursts (shared group schedule)
      // and fall ballistically late in life. Two-sided: >=4 proves bursts,
      // <=6 proves they are pops, not the whole field pulsing in unison.
      const spark = await page.evaluate(() => window.__campfireTest.sparkStats())
      ok('sparks burst in clusters with ballistic fall',
        spark.cluster >= 4 && spark.cluster <= 6 && spark.groups * 6 >= spark.nem && spark.lateVy < 0,
        `cluster=${spark.cluster} groups=${spark.groups}/${Math.ceil(spark.nem / 4)} nem=${spark.nem} lateVy=${spark.lateVy}`)

      // camera moves the world
      await page.evaluate(() => window.__campfireTest.setPose({ yaw: 1.15, pitch: -0.10 }))
      await page.waitForTimeout(1200)
      const bufC = await page.screenshot()
      const imgC = decodePng(bufC)
      let d = 0, n = 0
      for (let y = 0; y < imgC.h; y += 3) for (let x = 0; x < imgC.w; x += 3) {
        const p = px(imgC, x, y), q = px(imgB, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose changes the world', d / n > 4, `mean|Δ|=${(d / n).toFixed(1)}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'front.png'), bufA)
        writeFileSync(resolve(shots, 'orbit.png'), bufC)
      }

      // speed: hardware budget; SwiftShader gets its own (like shorecheck).
      const renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2')
        if (!g) return 'none'
        const dbg = g.getExtension('WEBGL_debug_renderer_info')
        return dbg ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked'
      })
      const soft = /swiftshader|llvmpipe|software/i.test(renderer)
      const budget = soft ? +opt('--max-ms-sw', 160) : maxMs
      await page.setViewportSize({ width: 1600, height: 1000 })
      await page.waitForTimeout(1500)
      await page.evaluate(() => window.__campfireTest.resetPerf())
      let perf = await page.evaluate(() => window.__campfireTest.perf())
      for (let i = 0; i < 24 && perf.n < 45; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__campfireTest.perf())
        if (perf.n >= 25 && perf.avg > budget) break
      }
      ok(`frame time under ${budget} ms at 1600x1000 (${soft ? 'software raster' : 'hardware'})`,
        perf.n >= 45 && perf.avg <= budget, `avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)
    }

    ok('zero page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
  } finally {
    chrome.kill()
  }

  if (asJson) console.log(JSON.stringify(results, null, 1))
  const failed = results.filter(r => !r.pass)
  if (!asJson) console.log(`\n${results.length - failed.length}/${results.length} green`)
  process.exit(failed.length ? 1 : 0)
}

main()
