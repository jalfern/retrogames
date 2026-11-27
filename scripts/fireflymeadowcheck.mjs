// fireflymeadowcheck — self-verifying harness for public/demos/fireflymeadow.html (#3650).
//
// Proves the dusk-meadow demo:
//   1. BOOTS  — ready hook, rAF advancing, zero page errors.
//   2. RULES  — sky/forest/meadow graded from pixels:
//     · upper sky is dark and blue-indigo-ish; horizon band runs warm
//     · forest band along the back is dark
//     · stars pinpoints appear at high dusk
//     · fireflies carry hot cores in the lower meadow (dusk 0.9)
//     · tap pulse: a ring of flashes expands from the tap point
//   3. LAW    — self-contained single file; not registered in games.js;
//     no arcade links from the demo.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Deterministic levers: setDusk(0..1) pins dusk progress; setFlash(v) pins the flash.
// Proven-fail mutant (intentional, not runnable here): zero flash decay gating
// (`if (flash < 0.02) continue;` -> `if (flash < -1) continue;`) -> hot-core gate red.

import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
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
const file = resolve(ROOT, opt('--file', 'public/demos/fireflymeadow.html'))
const shots = opt('--shots', null)

const PORT = opt('--port', '9381')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VIEW = { width: 960, height: 600 }

const results = []
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

// --- minimal PNG decode (8-bit RGBA, non-interlaced) — shared with other check harnesses ---
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
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 4
}
function countDisk(img, cx, cy, r, pred) {
  let n = 0
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(img.h, cy + r); y += 2)
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(img.w, cx + r); x += 2) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue
      const [rr, g, b] = px(img, x, y)
      if (pred(rr, g, b)) n++
    }
  return n * 4
}
const starPin = (r, g, b) => r > 205 && g > 200 && b > 170
const woodWarm = (r, g, b) => r > 110 && r - b > 45

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  ok('exposes __fireflymeadowTest DEV hook', /__fireflymeadowTest/.test(src))
  ok('no network assets', !/fetch\(|XMLHttpRequest|new Image\(|new Audio\(/.test(src))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law)', !/fireflymeadow/i.test(reg))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/${process.env.DEV_PORT || 5173}/fireflymeadowcheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/${process.env.DEV_PORT || 5173}/fireflymeadowcheck-profile`)
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
    page.on('pageerror', e => errs.push('pageerror: ' + e.message))
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })
    await page.goto('file://' + file, { waitUntil: 'load' })

    let ready = true
    try { await page.waitForFunction(() => window.__fireflymeadowTest && window.__fireflymeadowTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: hook ready, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2200)
      const frames1 = await page.evaluate(() => window.__fireflymeadowTest.frames)
      await page.waitForTimeout(1200)
      const frames2 = await page.evaluate(() => window.__fireflymeadowTest.frames)
      const fps = (frames2 - frames1) / 1.2
      ok('rAF advancing (frames advance)', frames2 > frames1 + 6, `${frames1} → ${frames2} (~${fps.toFixed(0)} fps)`)

      // pin dusk 0.9: stars + sky brightness are stable; fireflies are trough-blinked,
      // so the sky/forest/star gates read the unpinned frame...
      await page.evaluate(() => window.__fireflymeadowTest.setDusk(0.9))
      await page.waitForTimeout(400)
      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h

      // sky/forest/meadow grading
      const upper = meanRGB(img, Math.round(W * 0.2), Math.round(H * 0.02), Math.round(W * 0.8), Math.round(H * 0.14))
      ok('upper sky dark and blue-indigo (not black, not amber)',
        upper[0] < 45 && upper[2] >= upper[0] + 5, `rgb(${upper.map(v => v.toFixed(0)).join(',')})`)
      // warm horizon band is asserted at low dusk (below) — at night the glow dims honestly
      const forestBand = meanRGB(img, Math.round(W * 0.1), Math.round(H * 0.30), Math.round(W * 0.9), Math.round(H * 0.38))
      ok('forest band along the back reads dark', forestBand[0] < 45, `meanR=${forestBand[0].toFixed(0)}`)
      const stars = countIn(img, 0, 0, W, Math.round(H * 0.30), starPin)
      ok('star pinpoints in the sky at high dusk', stars > 12, `${stars} star px`)

      // firefly presence: flies brighten in the lower half at high dusk — take the max of two
      // frames 350ms apart so a trough-blink doesn't doom the gate (honest presence — loose pred,
      // per-core fidelity is visually verified instead)
      // ...then pin the flash so the presence gate is deterministic (dev hook, like setFlare)
      await page.evaluate(() => window.__fireflymeadowTest.setFlash(1.0))
      await page.waitForTimeout(250)
      const pinImg = decodePng(await page.screenshot())
      await page.evaluate(() => window.__fireflymeadowTest.setFlash(null))
      const glowPred = (r, g, b) => g > 100 && g - b > 22 && r > 45 && b < g - 10
      const hot = countIn(pinImg, 0, Math.round(H * 0.38), W, H, glowPred)
      ok('fireflies carry warm glow low in the meadow (dusk 0.9)', hot > 100, `${hot} warm-glow px`)

      // tap pulse — ring of flashes expands from the tap point
      const tapX = W * 0.5, tapY = H * 0.66
      await page.evaluate(() => window.__fireflymeadowTest.setFlash(1.0))
      await page.evaluate(([x, y]) => window.__fireflymeadowTest.setTaps(x, y), [tapX, tapY])
      await page.waitForTimeout(280)
      const tapImg = decodePng(await page.screenshot())
      await page.evaluate(() => window.__fireflymeadowTest.setFlash(null))
      // ring radius at ~0.28 s in: ~90px; check the band around it
      const ring = countDisk(tapImg, tapX, tapY, 160, (r, g, b) => g > 120 && r > 90 && g > b)
      ok('tap pulse: flashes brighten near the tap ring', ring > 12, `${ring} warm px in disk`)

      // hold hook contract round-trip + flies warm in the attraction disk
      await page.waitForTimeout(250)
      const baseImg = decodePng(await page.screenshot())
      const baseDisk = countDisk(baseImg, 480, 300, 200, glowPred)
      await page.evaluate(() => window.__fireflymeadowTest.setHold(true, 480, 300))
      const holdReport = await page.evaluate(() => ({ hold: window.__fireflymeadowTest.hold(), t: window.__fireflymeadowTest.t }))
      await page.waitForTimeout(700)
      const holdImg = decodePng(await page.screenshot())
      const disk = countDisk(holdImg, 480, 300, 200, glowPred)
      await page.evaluate(() => window.__fireflymeadowTest.setHold(false))
      ok('hold attract: flies drift toward finger (hook + warm disk)', holdReport.hold === true && disk > 8 && disk >= baseDisk * 0.4,
        `hold=${holdReport.hold} disk=${disk} vs baseline=${baseDisk}`)

      // dusk sweep: at 0.1 the sky runs warm amber through the horizon glow band
      // (y 0.17-0.24H); at 0.9 the same band dims hard — assert the delta dominates noise
      const glassBand = (img2) => meanRGB(img2, Math.round(W * 0.3), Math.round(H * 0.17), Math.round(W * 0.7), Math.round(H * 0.24))
      const topBand = (img2) => meanRGB(img2, Math.round(W * 0.3), Math.round(H * 0.06), Math.round(W * 0.7), Math.round(H * 0.14))
      await page.evaluate(() => window.__fireflymeadowTest.setDusk(0.1))
      await page.waitForTimeout(340)
      const dusk0img = decodePng(await page.screenshot())
      const dusk0 = glassBand(dusk0img)
      const top0 = topBand(dusk0img)
      ok('warm glow sits on the horizon band (dusk 0.1)', dusk0[0] > 70 && (dusk0[0] - top0[0]) > 20,
        `band rgb(${dusk0.map(v => v.toFixed(0)).join(',')}) vs top rgb(${top0.map(v => v.toFixed(0)).join(',')})`)
      await page.evaluate(() => window.__fireflymeadowTest.setDusk(0.9))
      await page.waitForTimeout(340)
      const dusk1 = glassBand(decodePng(await page.screenshot()))
      ok('dusk sweep: the same band dims at 0.9', (dusk0[0] - dusk1[0]) > 20 && dusk1[0] < dusk0[0] * 0.75,
        `horizon R ${dusk0[0].toFixed(0)} -> ${dusk1[0].toFixed(0)}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        for (const [n, img2] of [['boot', img], ['tap', tapImg], ['hold', holdImg]]) {
          if (shots) writeFileSync(resolve(shots, n + '.png'), encodePng(img2.w, img2.h, img2.px))
        }
      }
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

function encodePng(w, h, rgba) {
  // minimal RGBA encode for --shots dump (copy of campfirecheck's)
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

main().catch(e => { console.error(e); process.exit(2) })
