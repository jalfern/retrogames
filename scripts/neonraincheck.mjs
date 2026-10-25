// neonraincheck — self-verifying harness for public/demos/neonrain.html (#1042).
//
// Proves the neon-rain city demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, HDR target, zero page errors.
//   2. RULES  — sensed from pixels + the deterministic JS mirrors:
//     · night scene: dark overall, but lit windows and neon dominate the skyline
//     · magenta light-pollution along the horizon (fogGain-driven)
//     · wet street mirrors city light (grazing ground brighter than sky above)
//     · rain streaks move between frames
//     · the camera drifts down the boulevard without any input (camZ grows)
//     · setSpeed(0) freezes the world, setSpeed(1) resumes it
//     · every north-south car moves along its lane's direction (sign of dz)
//     · gusts: rain and fog gains vary across their cycles
//     · puddles: the wet mask varies spatially and spans [0.3, 1.0]
//     · steam vents exist near the camera
//     · the camera pose moves the world
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); carries its credits config.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Usage: node scripts/neonraincheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 120]
// Proven-fail mutant: force the mirror off unconditionally (`(1.0 - uNoMirror)`
// -> `0.0`) -> the load-bearing gate goes red (Δcentre ~ 0, both renders equal).
// Freezing the car streams (`spd: 0` in LANES_NS) -> the lane-direction gate
// goes red (0/28 cars advance along their lane).

import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
import { inflateSync } from 'node:zlib'
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
const file = resolve(ROOT, opt('--file', 'public/demos/neonrain.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 120)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9377')
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

const litWindow = (r, g, b) => Math.max(r, g, b) > 150
const magentaHaze = (r, g, b) => r > g + 12 && r > 45 && b > g

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"][^'"]*neonrain/i.test(reg))
  ok('exposes __neonrainTest DEV hook', /__neonrainTest/.test(src))
  ok('carries a DEMO_CREDITS config (name/issues/assist)',
    /DEMO_CREDITS[\s\S]*name:\s*'NEON RAIN'/.test(src) && /issues:\s*\[1042\]/.test(src) && /assist:\s*'solo'/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="neonrain"/.test(idx) && /el:\s*'neonrain'/.test(idx))
  ok('polish wired in shader (#1066: beacons, mullions, ripple rings)',
    /h > 55\.0/.test(src) && /fr\.x - 0\.5/.test(src) && /rr0 - ph/.test(src))
  ok('taillight bar shape in car shader (aS)', /vS > 0\.5/.test(src))
  ok('streak neon-reaction toggleable (uReactK + setReact hook)', /uReactK/.test(src) && /setReact/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/neonraincheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, '/tmp/forge/neonraincheck-profile')
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
    try { await page.waitForFunction(() => window.__neonrainTest && window.__neonrainTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      ok('frames advancing at rAF', await page.evaluate(() => window.__neonrainTest.frames > 15))
      ok('HDR float render target active', await page.evaluate(() => window.__neonrainTest.hdr))

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h

      const avg = meanLum(img, 0, 0, W, H)
      ok('night scene: dark overall, not black', avg > 12 && avg < 90, `avg lum=${avg.toFixed(0)}`)
      const lit = countIn(img, Math.round(W * 0.05), Math.round(H * 0.05), Math.round(W * 0.95), Math.round(H * 0.75), litWindow)
      ok('lit windows and neon dominate the skyline', lit > 400, `${lit} bright px`)
      const hz = countIn(img, Math.round(W * 0.05), Math.round(H * 0.05), Math.round(W * 0.95), Math.round(H * 0.45), magentaHaze)
      const hzArea = (W * 0.9) * (H * 0.4)
      ok('magenta light-pollution along the horizon', hz / hzArea > 0.015, `${(hz / hzArea * 100).toFixed(1)}% of sky`)

      const reflLit = countIn(img, Math.round(W * 0.3), Math.round(H * 0.55), Math.round(W * 0.7), Math.round(H * 0.8), litWindow)
      ok('wet street mirrors city light (reflections on the road)', reflLit > 400, `${reflLit} centre reflected px`)
      const imgB = decodePng(await page.screenshot())
      await page.waitForTimeout(200)
      const imgC = decodePng(await page.screenshot())
      let moving = 0, tot = 0
      for (let y = Math.round(H * 0.1); y < Math.round(H * 0.9); y += 2) for (let x = Math.round(W * 0.1); x < Math.round(W * 0.9); x += 2) {
        const p = px(imgB, x, y), q = px(imgC, x, y)
        const d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])
        if (d > 14) moving++
        tot++
      }
      ok('rain streaks move between frames', moving / tot > 0.05, `${(moving / tot * 100).toFixed(1)}% px changed`)

      const zA = await page.evaluate(() => window.__neonrainTest.state().camZ)
      await page.waitForTimeout(1500)
      const zB = await page.evaluate(() => window.__neonrainTest.state().camZ)
      ok('camera drifts down the boulevard (camZ grows)', zB > zA + 4, `${zA}m -> ${zB}m`)

      await page.evaluate(() => window.__neonrainTest.setSpeed(0))
      const zS = await page.evaluate(() => window.__neonrainTest.state().camZ)
      await page.waitForTimeout(1000)
      const zH = await page.evaluate(() => window.__neonrainTest.state().camZ)
      ok('setSpeed(0) freezes the world', Math.abs(zH - zS) < 0.5, `held at ${zH}m`)
      await page.evaluate(() => window.__neonrainTest.setSpeed(1))
      await page.waitForTimeout(1200)
      const zR = await page.evaluate(() => window.__neonrainTest.state().camZ)
      ok('setSpeed(1) resumes the drift', zR > zH + 4, `${zH}m -> ${zR}m`)

      const traffic = await page.evaluate(async () => {
        const D = window.__neonrainTest
        const a = D.state().cars
        await new Promise(r => setTimeout(r, 500))
        const b = D.state().cars
        return { a, b }
      })
      let good = 0, seen = 0
      for (let i = 0; i < traffic.a.length; i++) {
        const c0 = traffic.a[i], c1 = traffic.b[i]
        let dz = c1.z - c0.z
        if (dz > 310) dz -= 620
        if (dz < -310) dz += 620
        if (Math.abs(dz) < 0.5) continue
        seen++
        if (Math.sign(dz) === Math.sign(c0.dir)) good++
      }
      ok('traffic runs along its lane direction', seen >= 10 && good / seen >= 0.9, `${good}/${seen} cars correct sign`)
      const sprites = await page.evaluate(() => window.__neonrainTest.state().carSprites)
      ok('traffic light-sprites rendered', sprites > 30, `${sprites} sprites`)

      const weather = await page.evaluate(() => {
        const D = window.__neonrainTest
        const g = []; for (let t = 0; t <= 60; t += 1.5) g.push(D.gust(t))
        const wet = []; for (let x = -60; x <= 60; x += 2) wet.push(D.wet(13 + x, 120))
        return { g, wet }
      })
      const gmin = Math.min(...weather.g), gmax = Math.max(...weather.g)
      ok('rain/fog gusting varies over its cycle', gmax - gmin > 0.22, `gust range=${(gmax - gmin).toFixed(2)}`)
      const wmin = Math.min(...weather.wet), wmax = Math.max(...weather.wet)
      ok('puddle mask varies spatially across the street', wmax - wmin > 0.3 && wmin >= 0.29 && wmax <= 1.01,
        `wet ${wmin.toFixed(2)}..${wmax.toFixed(2)}`)
      const steam = await page.evaluate(() => window.__neonrainTest.state().steamCells)
      ok('steam vents exist near the camera', steam >= 1, `${steam} vent cells`)

      const fx = await page.evaluate(() => {
        const D = window.__neonrainTest
        const s = D.state()
        const phase = []; for (let t = 0; t <= 6; t += 0.25) phase.push(D.beaconPhase(t))
        const patter = []; for (let z = 0; z <= 600; z += 5) patter.push(D.metalPatter(13, z))
        return {
          tallCells: s.tallCells, headPairs: s.headPairs, tailBars: s.tailBars,
          react: [D.neonReact(0.05), D.neonReact(1.0)],
          phase, pspan: Math.max(...patter) - Math.min(...patter),
          dop: [D.sirenDoppler(false), D.sirenDoppler(true)],
          ripples: D.rippleCells(13, s.camZ + 20),
        }
      })
      const pspan = Math.max(...fx.phase) - Math.min(...fx.phase)
      ok('tall towers host blinking aviation beacons', fx.tallCells >= 1 && pspan > 0.4,
        `${fx.tallCells} tall cells, blink phase span ${pspan.toFixed(2)}`)
      ok('cars show headlight pairs and taillight bars', fx.headPairs >= 4 && fx.tailBars >= 4,
        `${fx.headPairs} head pairs, ${fx.tailBars} tail bars`)
      ok('rain streaks brighten crossing neon (react gain)', fx.react[1] - fx.react[0] > 1.4,
        `react ${fx.react[0]} -> ${fx.react[1]}`)
      ok('puddle ripple splash cells exist near the street', fx.ripples >= 5, `${fx.ripples} ripple cells`)
      ok('distant siren doppler (approaching higher, receding lower)', fx.dop[0] > 1.05 && fx.dop[1] < 0.95,
        `${fx.dop[0]} / ${fx.dop[1]}`)
      ok('rain-on-metal patter tracks wetness + vents', fx.pspan > 0.008, `patter spread ${fx.pspan.toFixed(3)}`)

      await page.evaluate(() => window.__neonrainTest.setPose({ yaw: 0.9, pitch: 0.12 }))
      await page.waitForTimeout(1400)
      const imgD = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgD.h; y += 3) for (let x = 0; x < imgD.w; x += 3) {
        const p = px(imgD, x, y), q = px(imgC, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose changes the world', d / n > 6, `mean|Δ|=${(d / n).toFixed(1)}`)

      // mirror differential via in-frame readPixels (no compositor): freeze the
      // sim, toggle the mirror, compare the road band's mean luminance.
      await page.evaluate(() => { const D = window.__neonrainTest; D.setPose({ yaw: 0.62, pitch: -0.05 }); D.setSpeed(0) })
      await page.waitForTimeout(2500)
      await page.evaluate(() => window.__neonrainTest.setFreeze(true))
      await page.waitForTimeout(300)
      const lumOn = await page.evaluate(() => window.__neonrainTest.grab())
      await page.evaluate(() => window.__neonrainTest.setMirror(false))
      const lumOff = await page.evaluate(() => window.__neonrainTest.grab())
      await page.evaluate(() => { const D = window.__neonrainTest; D.setMirror(true); D.setFreeze(false); D.setSpeed(1) })
      ok('mirror is load-bearing (frozen-scene mirror-off darkens the road band)',
        lumOn > 20 && lumOn - lumOff > 2, `road lum ${lumOn} -> ${lumOff}`)

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
      await page.evaluate(() => window.__neonrainTest.resetPerf())
      let perf = await page.evaluate(() => window.__neonrainTest.perf())
      for (let i = 0; i < 24 && perf.n < 45; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__neonrainTest.perf())
        if (perf.n >= 25 && perf.avg > budget) break
      }
      ok(`frame time under ${budget} ms at 1600x1000 (${soft ? 'software raster' : 'hardware'})`,
        perf.n >= 45 && perf.avg <= budget, `avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(800)
      const portrait = await page.evaluate(() => {
        const hud = document.getElementById('hud')
        const hint = document.getElementById('audiohint')
        return {
          ow: document.documentElement.scrollWidth > window.innerWidth + 1,
          hudF: parseFloat(getComputedStyle(hud).fontSize),
          hintF: parseFloat(getComputedStyle(hint).fontSize),
        }
      })
      ok('390px portrait: no overflow, HUD/hint scales down',
        !portrait.ow && portrait.hudF <= 10 && portrait.hintF <= 10,
        `overflow=${portrait.ow} hud=${portrait.hudF}px hint=${portrait.hintF}px`)
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
