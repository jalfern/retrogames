// lanternrivercheck — self-verifying harness for public/demos/lanternriver.html (#3646).
//
// Proves the lantern river:
//   1. BOOTS  — ready hook, rAF advancing, zero page errors (both layouts).
//   2. RULES  — pixels: dark indigo sky top-center, warm cream moon, lit warm
//               town windows on the far bank, dark navy river below.
//   3. INTERACT — tap in the river launches a lantern (hook state); two taps
//               give two lanterns; the launched lantern projects a warm
//               reflection on the water; reset re-empties the river.
//   4. LAW    — self-contained single file; not registered in games.js.
//
// Proven-fail mutant (intended, not runnable here): drop the launch call in
// onUp -> "tap launches a lantern" + warm-reflection gate go red.

import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
import { inflateSync, deflateSync } from 'node:zlib'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
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
const file = resolve(ROOT, opt('--file', 'public/demos/lanternriver.html'))
const shots = opt('--shots', null)

const PORT = opt('--port', '9383')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VIEW = { width: 960, height: 600 }
const PORT_VIEW = { width: 420, height: 780 }

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
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0]
}
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 9
}

const isWarm = (r, g, b) => r > 215 && g > 140 && g < 215 && b < 150
const isMoon = (r, g, b) => r > 215 && g > 190 && b > 150
const isDarkSky = (r, g, b) => r < 42 && g < 45 && b > 25 && b < 70
const isDarkRiver = (r, g, b) => r < 60 && b > r + 12 && g < 70

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  ok('exposes __lanternTest DEV hook', /__lanternTest/.test(src))
  ok('no network assets', !/fetch\(|XMLHttpRequest|new Image\(|new Audio\(/.test(src))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law)', !/lanternriver/i.test(reg))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/${process.env.DEV_PORT || 5173}/lanternrivercheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/${process.env.DEV_PORT || 5173}/lanternrivercheck-profile`)
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
    await page.goto('file://' + file + '?feedback=1', { waitUntil: 'load' })

    let ready = true
    try { await page.waitForFunction(() => window.__lanternTest && window.__lanternTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots (desktop): hook ready, zero page errors', ready && errs.length === 0, errs[0])

    // portrait layout must boot clean too
    const pctx = await browser.newContext({ viewport: PORT_VIEW, deviceScaleFactor: 1 })
    const ppage = await pctx.newPage()
    const perr = []
    ppage.on('pageerror', e => perr.push('pageerror: ' + e.message))
    ppage.on('console', m => { if (m.type() === 'error') perr.push('console: ' + m.text().split('\n')[0]) })
    await ppage.goto('file://' + file + '?feedback=1', { waitUntil: 'load' })
    let pReady = true
    try { await ppage.waitForFunction(() => window.__lanternTest && window.__lanternTest.ready, null, { timeout: 20000 }) }
    catch { pReady = false }
    ok('boots (phone portrait): ready, zero page errors', pReady && perr.length === 0, perr[0])
    await pctx.close()

    if (ready) {
      await page.waitForTimeout(2000)
      const frames1 = await page.evaluate(() => window.__lanternTest.frames)
      await page.waitForTimeout(900)
      const frames2 = await page.evaluate(() => window.__lanternTest.frames)
      const fps = (frames2 - frames1) / 0.9
      ok('rAF advancing (frames advance)', frames2 > frames1 + 4, `${frames1} → ${frames2} (~${fps.toFixed(0)} fps)`)

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h
      const hy = H * 0.40
      // 1. dusk sky: dark indigo top-center
      const sky = meanRGB(img, Math.round(W * 0.40), Math.round(H * 0.04), Math.round(W * 0.60), Math.round(H * 0.14))
      ok('sky reads dark indigo at top', isDarkSky(sky[0], sky[1], sky[2]), `rgb(${sky.map(v => v.toFixed(0)).join(',')})`)
      // 2. moon: bright cream at its center
      const moon = meanRGB(img, Math.round(W * 0.70) - 16, Math.round(H * 0.155) - 14, Math.round(W * 0.70) + 16, Math.round(H * 0.155) + 14)
      ok('moon reads bright cream', isMoon(moon[0], moon[1], moon[2]), `rgb(${moon.map(v => v.toFixed(0)).join(',')})`)
      // 3. town: warm lit windows on the far bank
      const lit = countIn(img, Math.round(W * 0.15), Math.round(hy - 100), Math.round(W * 0.85), Math.round(hy - 12), isWarm)
      ok('town windows read warm + lit', lit > 20, `${lit} warm px`)
      // 4. river: dark mid-navy below the town
      const river = meanRGB(img, Math.round(W * 0.45), Math.round(H * 0.60), Math.round(W * 0.55), Math.round(H * 0.68))
      ok('river reads dark navy below the town', isDarkRiver(river[0], river[1], river[2]), `rgb(${river.map(v => v.toFixed(0)).join(',')})`)

      // interaction: tap in the river launches a lantern (hook state)
      const tapX = Math.round(W * 0.50), tapY = Math.round(H * 0.72)
      const before = await page.evaluate(() => window.__lanternTest.state().lanterns)
      await page.mouse.move(tapX, tapY)
      await page.mouse.down()
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(80)
      const after = await page.evaluate(() => window.__lanternTest.state().lanterns)
      ok('tap launches a lantern (hook state)', after > before, `lanterns ${before} → ${after}`)

      // two taps => at least two lanterns
      await page.mouse.move(Math.round(W * 0.35), Math.round(H * 0.80))
      await page.mouse.down(); await page.mouse.up()
      const two = await page.evaluate(() => window.__lanternTest.state().lanterns)
      ok('second tap launches a second lantern', two >= 2, `lanterns=${two}`)

      // warm reflection on the water below the first tap (give the lantern a beat)
      await page.waitForTimeout(700)
      const tapImg = decodePng(await page.screenshot())
      const ref = countIn(tapImg, Math.round(W * 0.42), Math.round(H * 0.70), Math.round(W * 0.58), Math.round(H * 0.92), isWarm)
      ok('lantern projects a warm reflection on the water', ref > 12, `${ref} warm px`)

      // reset re-empties the river
      await page.evaluate(() => window.__lanternTest.reset())
      const reset = await page.evaluate(() => window.__lanternTest.state().lanterns)
      ok('reset re-empties the river', reset === 0, `lanterns=${reset}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        const { writeFileSync } = await import('node:fs')
        writeFileSync(resolve(shots, 'lanternriver.png'), encodePng(img.w, img.h, img.px))
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
    console.log(failures.length === 0 ? `ALL ${results.length} CHECKS PASS (lanternriver.html)` : `${failures.length} FAILING CHECKS (lanternriver.html)`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
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

main().catch(e => { console.error(e); process.exit(2) })
