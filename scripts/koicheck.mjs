// koicheck — self-verifying harness for public/demos/koi.html (#3603).
//
// Proves the Koi Pond demo:
//   1. BOOTS  — hook ready, rAF advancing, zero page errors.
//   2. RENDERS — non-black pond, 7 variety koi present and drifting.
//   3. TAP    — tap drops a ripple and startles the pond (state flips).
//   4. LAW    — self-contained single file; NOT registered in games.js; carries credits config + index card.
//
// Usage: node scripts/koicheck.mjs [--file <path>] [--json] [--max-ms 120]
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
const file = resolve(ROOT, opt('--file', 'public/demos/koi.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 120)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
// ?feedback=1 forces the FEEDBACK tag on without a live relay (the file:// QA path)
const url = 'file://' + file + '?feedback=1'
const PORT = opt('--port', '9382')
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
function meanLum(img, x0, y0, x1, y1) {
  let s = 0, n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(img, x, y); s += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; n++
  }
  return s / n
}
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 4
}
const waterTeal = (r, g, b) => b > 70 && g > 90 && r < 170 && g > r + 10
const koiRed = (r, g, b) => r > 120 && g < 90 && b < 90

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"][^'"]*koi\.html/i.test(reg))
  ok('exposes __koiTest DEV hook', /__koiTest/.test(src))
  ok('carries a DEMO_CREDITS config (name/assist)',
    /DEMO_CREDITS[\s\S]*name:\s*'KOI POND'/.test(src) && /assist:\s*'solo'/.test(src))
  ok('guest builder in credits config', /builder:\s*\{ tag:\s*'INKLING'/.test(src))
  ok('includes feedback.js', /<script src="feedback\.js"><\/script>/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="koi"/.test(idx) && /el:\s*'koi'/.test(idx))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/p${process.env.DEV_PORT || 5173}/koicheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/p${process.env.DEV_PORT || 5173}/koicheck-profile`)
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { chrome.kill(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }

  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 } })
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
    try { await page.waitForFunction(() => window.__koiTest && window.__koiTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: demo init, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      ok('frames advancing at rAF', await page.evaluate(() => window.__koiTest.frames > 15))

      const koi = await page.evaluate(() => window.__koiTest.koi())
      const names = koi.map(k => k.name)
      ok('7 koi present, one per variety', koi.length === 7 && new Set(names).size === 7, names.join(', '))

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h
      const pondLum = meanLum(img, Math.round(W * 0.2), Math.round(H * 0.35), Math.round(W * 0.8), Math.round(H * 0.75))
      ok('pond renders (non-black design area)', pondLum > 15, `pond lum=${pondLum.toFixed(0)}`)
      const teal = countIn(img, Math.round(W * 0.2), Math.round(H * 0.35), Math.round(W * 0.8), Math.round(H * 0.75), waterTeal)
      ok('painted water surface present', teal > 300, `${teal} teal px`)
      const red = countIn(img, Math.round(W * 0.2), Math.round(H * 0.35), Math.round(W * 0.8), Math.round(H * 0.75), koiRed)
      ok('koi colour (red/orange bodies) present', red > 20, `${red} red px`)

      const startle0 = (await page.evaluate(() => window.__koiTest.koi().filter(k => k.state === 'startle').length))
      await page.evaluate(() => window.__koiTest.tapAt(600, 840))
      await page.waitForTimeout(400)
      const startle1 = await page.evaluate(() => window.__koiTest.koi().filter(k => k.state === 'startle').length)
      ok('tap drops a ripple and startles the pond', startle1 >= 4 && startle1 > startle0, `${startle0} → ${startle1} startle`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'koi.png'), await page.screenshot())
      }

      // 390px phone check: no horizontal overflow, HUD stays on-screen.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(800)
      const portrait = await page.evaluate(() => {
        const hud = document.getElementById('hud')
        const r = hud ? hud.getBoundingClientRect() : null
        return { ow: document.documentElement.scrollWidth > window.innerWidth + 1, hudOk: !!(r && r.top >= 0 && r.bottom <= window.innerHeight) }
      })
      ok('390px portrait: no overflow, HUD on-screen', !portrait.ow && portrait.hudOk, `overflow=${portrait.ow} hud=${portrait.hudOk}`)

      // 390px portrait: the pond fills the frame — a vertical band of painted
      // water must cover most of the screen, not just the middle third.
      const shot = decodePng(await page.screenshot())
      let first = -1, lastRow = -1
      for (let y = 0; y < shot.h; y++) {
        let n = 0, w = 0
        for (let x = 0; x < shot.w; x += 4) {
          const [r, g, b] = px(shot, x, y)
          w++
          if (waterTeal(r, g, b)) n++
        }
        if (w > 0 && n / w > 0.30) { if (first < 0) first = y; lastRow = y }
      }
      const span = first >= 0 ? lastRow - first : 0
      ok('390px portrait: pond fills the frame', span > shot.h * 0.4, `water band ${span}/${shot.h}px (${Math.round(span / shot.h * 100)}%)`)

      // 390px portrait: overlay tags never overlap the bottom-right column stack.
      const stack = await page.evaluate(() => {
        const rects = ['#credits-tag', '#dfeedback-tag']
          .map(sel => document.querySelector(sel))
          .filter(Boolean)
          .map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })
        let overlap = false
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j]
          if (a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) overlap = true
        }
        return { count: rects.length, overlap }
      })
      ok('390px portrait: overlay buttons do not overlap', stack.count >= 2 && !stack.overlap, `tags=${stack.count} overlap=${stack.overlap}`)

      await page.setViewportSize({ width: 1200, height: 1400 })
      await page.waitForTimeout(400)
      const perf1 = await page.evaluate(() => window.__koiTest.frames)
      await page.waitForTimeout(1200)
      const perf2 = await page.evaluate(() => window.__koiTest.frames)
      const msPerFrame = 1200 / Math.max(1, perf2 - perf1)
      ok(`frame time under ${maxMs} ms`, msPerFrame <= maxMs, `avg=${msPerFrame.toFixed(1)}ms over ${perf2 - perf1} frames`)
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
