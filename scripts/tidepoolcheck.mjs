// tidepoolcheck — self-verifying harness for public/demos/tidepool.html (#3645).
//
// Proves the tide pool:
//   1. BOOTS  — ready hook, rAF advancing, zero page errors.
//   2. RULES  — pixels: dark rim corners, warm sandy pool interior, caustic
//               highlights crawling over the sand, sand/rim/contrast.
//   3. INTERACT — tap drops a ripple that starts creatures; hold shadow pins a
//               dark center disk; wave hook opens the wave state; reset re-seeds.
//   4. LAW    — self-contained single file; not registered in games.js.
//
// Deterministic levers: DEV.setShadow / DEV.startWave / DEV.releaseShadow.
// Proven-fail mutant (intentional, not runnable here): disable the caustics
// layer (`return` in drawCaustics) -> caustic-presence gate goes red.

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
const file = resolve(ROOT, opt('--file', 'public/demos/tidepool.html'))
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
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return [r / n, g / n, b / n]
}
function countIn(img, x0, y0, x1, y1, pred) {
  let n = 0
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const [r, g, b] = px(img, x, y)
    if (pred(r, g, b)) n++
  }
  return n * 9
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
const causticBright = (r, g, b) => r > 192 && g > 185 && b > 160 && g > b + 8
const sandy = (r, g, b) => r > 145 && g > 125 && b >= 80 && r > b + 25
const anemonePink = (r, g, b) => r > 200 && g > 110 && g < 210 && b > 130 && b < 220 && r > g + 10
const starfishOrange = (r, g, b) => r > 190 && g > 90 && g < 180 && b < 110 && r > b + 60

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  ok('exposes __tidepoolTest DEV hook', /__tidepoolTest/.test(src))
  ok('no network assets', !/fetch\(|XMLHttpRequest|new Image\(|new Audio\(/.test(src))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law)', !/tidepool/i.test(reg))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/${process.env.DEV_PORT || 5173}/tidepoolcheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/${process.env.DEV_PORT || 5173}/tidepoolcheck-profile`)
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
    try { await page.waitForFunction(() => window.__tidepoolTest && window.__tidepoolTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: hook ready, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2000)
      const frames1 = await page.evaluate(() => window.__tidepoolTest.frames)
      await page.waitForTimeout(900)
      const frames2 = await page.evaluate(() => window.__tidepoolTest.frames)
      const fps = (frames2 - frames1) / 0.9
      ok('rAF advancing (frames advance)', frames2 > frames1 + 4, `${frames1} → ${frames2} (~${fps.toFixed(0)} fps)`)

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h
      // 1. rim: corners dark rock
      const corner = meanRGB(img, 0, 0, Math.round(W * 0.08), Math.round(H * 0.08))
      ok('rim: corner rock reads dark', corner[0] < 85 && corner[0] < 110, `corner rgb(${corner.map(v => v.toFixed(0)).join(',')})`)
      // 2. sand interior: warm, light, not dark
      const center = meanRGB(img, Math.round(W * 0.28), Math.round(H * 0.32), Math.round(W * 0.72), Math.round(H * 0.68))
      ok('pool reads warm sand under water', center[0] > 150 && center[0] > center[2] + 35,
        `center rgb(${center.map(v => v.toFixed(0)).join(',')})`)
      // caustic light: a meaningful count of bright pixels over the pool
      const caustics = countIn(img, Math.round(W * 0.2), Math.round(H * 0.18), Math.round(W * 0.8), Math.round(H * 0.82), causticBright)
      ok('caustic light visible over the sand', caustics > 60, `${caustics} bright px`)
      // creature life: anemones/starfish blooms somewhere in the pool
      const pink = countIn(img, 0, Math.round(H * 0.12), W, Math.round(H * 0.88), anemonePink)
      ok('anemones bloom with pink tips', pink > 8, `${pink} pink px`)
      const orange = countIn(img, 0, Math.round(H * 0.12), W, Math.round(H * 0.88), starfishOrange)
      ok('starfish/orange anemone present', orange > 20, `${orange} warm-orange px`)

      // ripple: pointer down drops a ripple and startles
      const ripplesBefore = await page.evaluate(() => window.__tidepoolTest.state().ripples)
      await page.mouse.move(W * 0.5, H * 0.72)
      await page.mouse.down()
      await page.waitForTimeout(160)
      const state1 = await page.evaluate(() => window.__tidepoolTest.state())
      ok('tap drops a ripple (hook state)', state1.ripples > ripplesBefore, `ripples ${ripplesBefore} → ${state1.ripples}`)
      await page.mouse.up()
      await page.waitForTimeout(200)

      // hold shadow: pin it, darkening disk at the pinned point
      const baseline = meanRGB(img, Math.round(W * 0.38), Math.round(H * 0.40), Math.round(W * 0.62), Math.round(H * 0.62))
      await page.mouse.move(480, 330)
      await page.mouse.down()
      await page.waitForTimeout(450)
      await page.evaluate(() => window.__tidepoolTest.setShadow(480, 330, 1.0))
      await page.waitForTimeout(200)
      const shadowImg = decodePng(await page.screenshot())
      await page.mouse.up()
      await page.evaluate(() => window.__tidepoolTest.releaseShadow())
      const shade = meanRGB(shadowImg, Math.round(W * 0.38), Math.round(H * 0.40), Math.round(W * 0.62), Math.round(H * 0.62))
      ok('hold shadow darkens the pin disk', shade[0] < baseline[0] - 8 && shade[2] < baseline[2] - 8,
        `disk R ${baseline[0].toFixed(0)} → ${shade[0].toFixed(0)}`)

      // wave: the hook opens the wave state
      await page.evaluate(() => window.__tidepoolTest.startWave())
      await page.waitForTimeout(120)
      const wState = await page.evaluate(() => window.__tidepoolTest.state().wave.active)
      ok('wave hook starts the wave state', wState === true)
      await page.waitForTimeout(500)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'pool.png'), encodePng(img.w, img.h, img.px))
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
    console.log(failures.length === 0 ? `ALL ${results.length} CHECKS PASS (tidepool.html)` : `${failures.length} FAILING CHECKS (tidepool.html)`)
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
