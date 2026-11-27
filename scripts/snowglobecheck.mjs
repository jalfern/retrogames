// snowglobecheck — self-verifying harness for public/demos/snowglobe.html (#3648).
//
// Proves the snow-globe demo:
//   1. LAW   — self-contained single file; no network assets; not registered in games.js.
//   2. BOOT  — hook ready, rAF advancing, zero page errors.
//   3. SKY   — dusk sweep: sky region runs warm at low dusk, dark blue-violet at high dusk.
//   4. LIGHT — windows light up one by one as dusk falls (hook gates, deterministic).
//   5. SHAKE — a shake impulse produces a swirl current that decays to rest.
//   6. SNOW  — snowflakes present in the upper globe region.
//
// Deterministic levers: setDusk(0..1) pins dusk; clearDusk() restores the ambient dusk.

import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
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
const file = resolve(ROOT, opt('--file', 'public/demos/snowglobe.html'))
const PORT = opt('--port', '9383')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VIEW = { width: 960, height: 600 }

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
function meanRGB(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return [r / n, g / n, b / n]
}
function count(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 4
}

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  ok('exposes __snowglobeTest DEV hook', /__snowglobeTest/.test(src))
  ok('no network assets', !/fetch\(|XMLHttpRequest|new Image\(|new Audio\(/.test(src))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law)', !/snowglobe/i.test(reg))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/${process.env.DEV_PORT || 5173}/snowglobecheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/${process.env.DEV_PORT || 5173}/snowglobecheck-profile`)
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { chrome.kill(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }

  let ctx = null
  try {
    ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errs = []
    // feedback.js (#1262) probes the relay at load; from a file:// origin that
    // CORS rejection is benign noise, not a demo fault — same filter as
    // campfirecheck/emberwoodcheck.
    const relayNoise = (t, loc) => t.includes('retrogames.jalfern.workers.dev') ||
      (loc && String(loc.url || '').startsWith('https://retrogames.jalfern.workers.dev/'))
    page.on('pageerror', e => { if (!relayNoise(e.message)) errs.push('pageerror: ' + e.message) })
    page.on('console', m => {
      if (m.type() === 'error' && !relayNoise(m.text(), m.location()) && !/favicon/i.test(m.text())) errs.push('console: ' + m.text().split('\n')[0])
    })
    await page.goto('file://' + file, { waitUntil: 'load' })

    let ready = true
    try { await page.waitForFunction(() => window.__snowglobeTest && window.__snowglobeTest.ready(), null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: hook ready, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2000)
      const frames1 = await page.evaluate(() => window.__snowglobeTest.frames())
      await page.waitForTimeout(1000)
      const frames2 = await page.evaluate(() => window.__snowglobeTest.frames())
      ok('rAF advancing (frames advance)', frames2 > frames1 + 6, `${frames1} → ${frames2}`)

      // --- dusk sweep on the sky region ---
      await page.evaluate(() => window.__snowglobeTest.setDusk(0.05))
      await page.waitForTimeout(400)
      const warm = decodePng(await page.screenshot())
      const warmMean = meanRGB(warm, Math.round(VIEW.width * 0.42), Math.round(VIEW.height * 0.22), Math.round(VIEW.width * 0.58), Math.round(VIEW.height * 0.27))
      const warmWindows = await page.evaluate(() => window.__snowglobeTest.windowsLit())

      await page.evaluate(() => window.__snowglobeTest.setDusk(0.92))
      await page.waitForTimeout(400)
      const dark = decodePng(await page.screenshot())
      const darkMean = meanRGB(dark, Math.round(VIEW.width * 0.42), Math.round(VIEW.height * 0.22), Math.round(VIEW.width * 0.58), Math.round(VIEW.height * 0.27))
      const darkWindows = await page.evaluate(() => window.__snowglobeTest.windowsLit())
      ok('dusk sweep: warm sky at dusk 0.05, dark blue at 0.92',
        warmMean[0] > 110 && darkMean[0] < 80 && warmMean[0] - darkMean[0] >= 40,
        `R ${warmMean[0].toFixed(0)} → ${darkMean[0].toFixed(0)}`)
      ok('windows light up as dusk falls',
        warmWindows === 0 && darkWindows > 0,
        `lit ${warmWindows} → ${darkWindows}`)

      // --- shake: swirl current bumps then decays ---
      await page.evaluate(() => window.__snowglobeTest.reset())
      await page.waitForTimeout(180)
      await page.evaluate(() => window.__snowglobeTest.shake(1.15))
      let peak = 0
      for (const wait of [0, 120, 260]) {
        if (wait > 0) await page.waitForTimeout(wait === 120 ? 120 : 140)
        const s = await page.evaluate(() => window.__snowglobeTest.swirl())
        if (s > peak) peak = s
      }
      await page.waitForTimeout(1300)
      const rest = await page.evaluate(() => window.__snowglobeTest.swirl())
      ok('shake impulse: swirl current appears and decays', peak > 0.05 && rest < peak * 0.7,
        `peak=${peak.toFixed(2)} rest=${rest.toFixed(2)}`)

      // --- snowflakes drift: pixels in the upper globe region move between frames ---
      await page.evaluate(() => window.__snowglobeTest.clearDusk())
      await page.waitForTimeout(900)
      const snowA = decodePng(await page.screenshot())
      await page.waitForTimeout(700)
      const snowB = decodePng(await page.screenshot())
      let moved = 0
      for (let y = Math.round(VIEW.height * 0.09); y < Math.round(VIEW.height * 0.24); y += 1)
        for (let x = Math.round(VIEW.width * 0.30); x < Math.round(VIEW.width * 0.70); x += 1) {
          const a = px(snowA, x, y), b = px(snowB, x, y)
          if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 40) moved++
        }
      ok('snowflakes drift in the upper globe (pixels move)', moved >= 12, `${moved} px changed`)
    }
  } finally {
    if (ctx) { try { await ctx.close() } catch {} }
    try { await browser.close() } catch {}
    try { await cleanup() } catch {}
  }

  const failures = results.filter(r => !r.pass)
  console.log('')
  if (asJson) {
    console.log(JSON.stringify({ ok: failures.length === 0, results }, null, 2))
  } else {
    console.log(failures.length === 0 ? `ALL ${results.length} CHECKS PASS (${file.split('/').pop()})` : `${failures.length} FAILING CHECKS (${file.split('/').pop()})`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
