// starrynightcheck — self-verifying harness for public/demos/starry-night.html (#3076).
//
// Proves the painted-style Starry Night demo:
//   1. BOOTS  — WebGL2, hook ready, rAF advancing, zero page errors.
//   2. RENDERS — non-black sky, warm lit windows, crescent moon bright, painted sky bands.
//   3. CAMERA — setPose changes the world.
//   4. LAW    — self-contained single file; NOT registered in games.js; carries credits config.
//
// Usage: node scripts/starrynightcheck.mjs [--file <path>] [--json] [--max-ms 120]
import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
import { inflateSync } from 'node:zlib'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { relayNoise } from './lib/harness.mjs'

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
const file = resolve(ROOT, opt('--file', 'public/demos/starry-night.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 120)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9379')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const results = []
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

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
const px = (img, x, y) => { const i = (y * img.w + x) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]] }
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 4
}
function meanLum(img, x0, y0, x1, y1) {
  let s = 0, n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(img, x, y); s += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; n++
  }
  return s / n
}

const litWindow = (r, g, b) => r > 150 && g > 110 && b < 190 && r > b + 20

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"][^'"]*starry-night/i.test(reg))
  ok('exposes __starryTest DEV hook', /__starryTest/.test(src))
  ok('carries a DEMO_CREDITS config (name/issues/assist)',
    /DEMO_CREDITS[\s\S]*name:\s*'STARRY NIGHT'/.test(src) && /assist:\s*'solo'/.test(src))
  ok('guest builder in credits config', /builder:\s*\{ tag:\s*'INKLING'/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="starry-night"/.test(idx) && /el:\s*'starry-night'/.test(idx))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/p${process.env.DEV_PORT || 5173}/starrynightcheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/p${process.env.DEV_PORT || 5173}/starrynightcheck-profile`)
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
    page.on('console', m => {
      if (m.type() !== 'error') return
      const txt = m.text().split('\n')[0]
      if (relayNoise(txt)) return
      if (/Failed to load resource: net::ERR_FAILED/i.test(txt)) return
      errs.push('console: ' + txt)
    })
    await page.goto(url, { waitUntil: 'load' })

    let ready = true
    try { await page.waitForFunction(() => window.__starryTest && window.__starryTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      ok('frames advancing at rAF', await page.evaluate(() => window.__starryTest.frames > 15))

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h
      const skyLum = meanLum(img, Math.round(W * 0.05), Math.round(H * 0.05), Math.round(W * 0.95), Math.round(H * 0.45))
      ok('sky renders (non-black sky band)', skyLum > 12, `sky lum=${skyLum.toFixed(0)}`)
      const win = countIn(img, Math.round(W * 0.05), Math.round(H * 0.4), Math.round(W * 0.95), Math.round(H * 0.7), litWindow)
      ok('warm lit windows above the street', win > 50, `${win} warm px`)
      const moon = countIn(img, Math.round(W * 0.55), Math.round(H * 0.0), Math.round(W * 0.95), Math.round(H * 0.3), (r, g, b) => r > 220 && g > 200 && b > 150)
      ok('crescent moon glows in the sky', moon > 40, `${moon} moon px`)
      const groundLum = meanLum(img, Math.round(W * 0.1), Math.round(H * 0.65), Math.round(W * 0.95), Math.round(H * 0.9))
      ok('ground fills the lower frame', groundLum > 6, `ground lum=${groundLum.toFixed(0)}`)

      const fx = await page.evaluate(() => window.__starryTest.state())
      ok('hook exposes pose state', fx && typeof fx.yaw === 'number' && typeof fx.t === 'number')

      await page.evaluate(() => window.__starryTest.setPose({ yaw: 0.28, pitch: 0.1 }))
      await page.waitForTimeout(500)
      const imgB = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgB.h; y += 3) for (let x = 0; x < imgB.w; x += 3) {
        const p = px(imgB, x, y), q = px(img, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('setPose changes the world', d / n > 2, `mean|Δ|=${(d / n).toFixed(1)}`)

      await page.evaluate(() => window.__starryTest.setPose({ yaw: 0, pitch: 0 }))
      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'orbit.png'), await page.screenshot())
      }

      const renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2')
        if (!g) return 'none'
        const dbg = g.getExtension('WEBGL_debug_renderer_info')
        return dbg ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked'
      })
      const soft = /swiftshader|llvmpipe|software/i.test(renderer)
      const budget = soft ? +opt('--max-ms-sw', 260) : maxMs
      await page.setViewportSize({ width: 1600, height: 1000 })
      await page.waitForTimeout(1500)
      const perf0 = await page.evaluate(() => window.__starryTest.frames)
      await page.waitForTimeout(1200)
      const perf1 = await page.evaluate(() => window.__starryTest.frames)
      const msPerFrame = 1200 / Math.max(1, perf1 - perf0)
      ok(`frame time under ${budget} ms (${soft ? 'software raster' : 'hardware'})`, msPerFrame <= budget,
        `avg=${msPerFrame.toFixed(1)}ms over ${perf1 - perf0} frames`)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(800)
      const portrait = await page.evaluate(() => {
        const hud = document.getElementById('hud')
        return { ow: document.documentElement.scrollWidth > window.innerWidth + 1, hudF: parseFloat(getComputedStyle(hud).fontSize) }
      })
      ok('390px portrait: no overflow, HUD scales down',
        !portrait.ow && portrait.hudF <= 11,
        `overflow=${portrait.ow} hud=${portrait.hudF}px`)
    }

    ok('zero page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
  } finally {
    cleanup()
  }

  if (asJson) console.log(JSON.stringify(results, null, 1))
  const failed = results.filter(r => !r.pass)
  if (!asJson) console.log(`\n${results.length - failed.length}/${results.length} green`)
  process.exit(failed.length ? 1 : 0)
}

main()
