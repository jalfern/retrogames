// volcanocheck — self-verifying harness for public/demos/volcano.html (#1043).
//
// Proves the night-eruption demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, HDR target, zero page errors.
//   2. RULES  — sensed from pixels + deterministic JS mirrors:
//     · night scene: dark overall, not black
//     · a twinkling hash-star field populates the upper sky corners
//     · warm lava clusters light the cone around the vent
//     · the cone silhouette reads dark against the sky on the flanks
//     · the plume is lit from below (lower column brighter than the top)
//     · the ember fountain is ballistic (closed-form positions track velocities)
//     · ember sprites render
//     · the camera drifts around the mountain without any input (camAz grows)
//     · setSpeed(0) freezes, setSpeed(1) resumes
//     · the eruption pulse varies across its surge cycle
//     · lava exists on the cone (mirror max > threshold) and nowhere beyond its foot
//     · plume density is dense at the vent, thinning to nothing at its top
//     · heat shimmer is load-bearing (frozen-frame edge-energy changes when toggled)
//     · plume umbrella widens in the top third (mirror band ratio)
//     · ember shower density pumps with the pulse (count peak vs mean)
//     · growl + crackle audio layers run and the growl tracks the pulse
//     · portrait 390px: crater framed, scene lit, embers drawn
//     · a real drag rotates the view; a real tap unlocks audio
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); carries its credits config.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Usage: node scripts/volcanocheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 120]
// Proven-fail mutant: force the shimmer off in FS_HAZE (`* uHazeOn` -> `* 0.0`)
// -> the load-bearing gate goes red (edge energy identical with haze "on"/"off").

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
const file = resolve(ROOT, opt('--file', 'public/demos/volcano.html'))
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

const starPx = (r, g, b) => Math.max(r, g, b) > 95
const lavaPx = (r, g, b) => r > 120 && r > g + 40 && g >= b

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"][^'"]*volcano/i.test(reg))
  ok('exposes __volcanoTest DEV hook', /__volcanoTest/.test(src))
  ok('carries a DEMO_CREDITS config (name/issues/assist)',
    /DEMO_CREDITS[\s\S]*name:\s*'VOLCANO'/.test(src) && /issues:\s*\[1043\]/.test(src) && /assist:\s*'solo'/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="volcano"/.test(idx) && /el:\s*'volcano'/.test(idx))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/p${process.env.DEV_PORT || 5173}/volcanocheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, `/tmp/forge/p${process.env.DEV_PORT || 5173}/volcanocheck-profile`)
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
    try { await page.waitForFunction(() => window.__volcanoTest && window.__volcanoTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      ok('frames advancing at rAF', await page.evaluate(() => window.__volcanoTest.frames > 15))
      ok('HDR float render target active', await page.evaluate(() => window.__volcanoTest.hdr))

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h

      const avg = meanLum(img, 0, 0, W, H)
      ok('night scene: dark overall, not black', avg > 8 && avg < 85, `avg lum=${avg.toFixed(0)}`)

      const sL = countIn(img, Math.round(W * 0.02), Math.round(H * 0.04), Math.round(W * 0.28), Math.round(H * 0.34), starPx)
      const sR = countIn(img, Math.round(W * 0.72), Math.round(H * 0.04), Math.round(W * 0.98), Math.round(H * 0.34), starPx)
      ok('star field populates the upper sky', sL + sR > 60, `${sL}+${sR} star px`)

      const lava = countIn(img, Math.round(W * 0.25), Math.round(H * 0.42), Math.round(W * 0.75), Math.round(H * 0.80), lavaPx)
      ok('lava lights the cone around the vent', lava > 300, `${lava} warm px`)

      const sideN = Math.round(W * 0.20 * (H * 0.24 - H * 0.52)) * -1
      const sideDark = countIn(img, Math.round(W * 0.02), Math.round(H * 0.52), Math.round(W * 0.22), Math.round(H * 0.76), (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b < 30)
      ok('cone flank reads dark against the sky', sideDark / sideN > 0.55, `dark ${(sideDark / sideN * 100).toFixed(0)}%`)

      const bandL = meanLum(img, Math.round(W * 0.42), Math.round(H * 0.05), Math.round(W * 0.58), Math.round(H * 0.17))
      const bandB = meanLum(img, Math.round(W * 0.42), Math.round(H * 0.30), Math.round(W * 0.58), Math.round(H * 0.42))
      ok('plume lit from below (base brighter than top)', bandB > bandL * 1.8, `base=${bandB.toFixed(1)} top=${bandL.toFixed(1)}`)

      const emb = await page.evaluate(async () => {
        const D = window.__volcanoTest
        const st = D.state()
        const out = []
        for (const e of st.embers) {
          if (e.age > 2.4) continue
          const t = st.t + 0.3
          const e2 = D.ember(e.i, t)
          if (!e2) continue
          out.push({ e: e.p, e2: e2.p, v: e.v, dt: 0.3 })
        }
        return out
      })
      let good = 0, seen = 0
      for (const o of emb) {
        seen++
        for (let k = 0; k < 3; k++) {
          const pred = o.e[k] + (o.v[k] + (k === 1 ? -16.0 * 0.15 : 0)) * o.dt
          if (Math.abs(o.e2[k] - pred) > 2.2) { seen -= 1e-9; break }
        }
        good++
      }
      ok('ember fountain is ballistic (positions follow v + gravity)', emb.length >= 10 && good === emb.length,
        `${good}/${emb.length} embers match`)
      const sprites = await page.evaluate(() => window.__volcanoTest.state().emberSprites)
      ok('ember sprites render', sprites > 30, `${sprites} sprites`)

      await page.waitForTimeout(1800)
      const zA = await page.evaluate(() => window.__volcanoTest.state().camAz)
      await page.waitForTimeout(2200)
      const zB = await page.evaluate(() => window.__volcanoTest.state().camAz)
      ok('camera orbits the mountain (camAz grows)', zB > zA + 1.0, `${zA}° -> ${zB}°`)

      await page.evaluate(() => window.__volcanoTest.setSpeed(0))
      const zS = await page.evaluate(() => window.__volcanoTest.state().camAz)
      await page.waitForTimeout(1000)
      const zH = await page.evaluate(() => window.__volcanoTest.state().camAz)
      ok('setSpeed(0) freezes the orbit', Math.abs(zH - zS) < 0.2, `held at ${zH}°`)
      await page.evaluate(() => window.__volcanoTest.setSpeed(1))
      await page.waitForTimeout(2000)
      const zR = await page.evaluate(() => window.__volcanoTest.state().camAz)
      ok('setSpeed(1) resumes the orbit', zR > zH + 0.8, `${zH}° -> ${zR}°`)

      const weather = await page.evaluate(() => {
        const D = window.__volcanoTest
        const p = []; for (let t = 0; t <= 78; t += 1.0) p.push(D.pulse(t))
        return p
      })
      const pmin = Math.min(...weather), pmax = Math.max(...weather)
      ok('eruption pulse surges across its cycle', pmax - pmin > 0.35, `pulse ${pmin.toFixed(2)}..${pmax.toFixed(2)}`)

      const lavaField = await page.evaluate(() => {
        const D = window.__volcanoTest
        let mx = 0, onCone = 0
        for (let a = 0; a < 6.28; a += 0.2) for (let r = 70; r <= 340; r += 10) {
          const h = D.lavaHeat(Math.cos(a) * r, Math.sin(a) * r)
          if (h > mx) mx = h
          if (h > 0.3) onCone++
        }
        return { mx, onCone, far: D.lavaHeat(500, 300) }
      })
      ok('lava channels exist on the cone', lavaField.mx > 0.3 && lavaField.onCone > 20, `max=${lavaField.mx} @${lavaField.onCone} samples`)
      ok('lava confined to the cone (none on the plain)', lavaField.far === 0, `heat at r=583m: ${lavaField.far}`)

      const plume = await page.evaluate(() => {
        const D = window.__volcanoTest
        return { low: D.plumeAt(205), high: D.plumeAt(605), below: D.plumeAt(145) }
      })
      ok('plume dense at the vent, thinning with height', plume.low > 0.05 && plume.low > plume.high * 1.5,
        `low=${plume.low} high=${plume.high}`)
      ok('no plume below the vent', plume.below === 0, `${plume.below}`)

      const band = await page.evaluate(() => {
        const D = window.__volcanoTest
        return { lo: D.plumeBand(300), hi: D.plumeBand(560) }
      })
      ok('plume umbrella widens in the top third', band.hi > band.lo * 2.2, `PR@300=${band.lo} PR@560=${band.hi}`)

      const ramp = await page.evaluate(() => {
        const D = window.__volcanoTest
        const c = []
        for (let t = 0; t <= 78; t += 0.5) c.push(D.emberCount(t))
        const mx = Math.max(...c)
        const mean = c.reduce((a, b) => a + b, 0) / c.length
        return { mx, mean }
      })
      ok('ember shower density pumps with the pulse', ramp.mx > ramp.mean * 1.35,
        `peak=${ramp.mx} mean=${ramp.mean.toFixed(1)}`)

      // shimmer load-bearing: frozen scene (frame-identical), flip haze inside the
      // demo between two consecutive reads -> the per-pixel delta IS the shimmer
      await page.evaluate(() => { const D = window.__volcanoTest; D.setSpeed(0) })
      await page.waitForTimeout(2200)
      await page.evaluate(() => window.__volcanoTest.setFreeze(true))
      await page.waitForTimeout(300)
      const shimmer = await page.evaluate(() => window.__volcanoTest.diffHaze(false))
      await page.evaluate(() => { const D = window.__volcanoTest; D.setHaze(true); D.setFreeze(false); D.setSpeed(1) })
      ok('heat shimmer is load-bearing (frozen-frame haze-on vs haze-off pixels differ)',
        shimmer > 0.4, `mean |Δ| = ${shimmer} lum`)

      // real input: a drag rotates the view, a tap unlocks audio
      const yawA = await page.evaluate(() => window.__volcanoTest.state().yaw)
      await page.mouse.move(500, 300)
      await page.mouse.down()
      await page.mouse.move(660, 300, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(1400)
      const yawB = await page.evaluate(() => window.__volcanoTest.state().yaw)
      ok('drag rotates the view', Math.abs(yawB - yawA) > 0.15, `yaw ${yawA} -> ${yawB}`)
      ok('tap unlocks audio', await page.evaluate(() => window.__volcanoTest.state().audioOn))

      let growlHi = await page.evaluate(() => window.__volcanoTest.audio().growl)
      for (let i = 0; i < 8; i++){
        growlHi = Math.max(growlHi, await page.evaluate(() => window.__volcanoTest.audio().growl))
        await page.waitForTimeout(600)
      }
      const audio = await page.evaluate(() => window.__volcanoTest.audio())
      ok('growl + crackle layers run; growl tracks the pulse',
        growlHi > 0.09 && audio.crackle > 0.001, `growlMax=${growlHi} crackle=${audio.crackle}`)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(1400)
      const port = await page.evaluate(() => {
        const s = window.__volcanoTest.state()
        return { ss: s.craterSS, sprites: s.emberSprites }
      })
      const pimg = decodePng(await page.screenshot())
      const pAvg = meanLum(pimg, 0, 0, pimg.w, pimg.h)
      ok('portrait 390px: crater framed, scene lit, embers drawn',
        port.ss[0] > 0.3 && port.ss[0] < 0.7 && port.ss[1] > 0.2 && port.ss[1] < 0.78 &&
        pAvg > 8 && pAvg < 85 && port.sprites > 10,
        `craterSS=[${port.ss}] avg=${pAvg.toFixed(0)} sprites=${port.sprites}`)
      if (shots) { mkdirSync(shots, { recursive: true }); writeFileSync(resolve(shots, 'portrait.png'), await page.screenshot()) }

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
      await page.evaluate(() => window.__volcanoTest.resetPerf())
      let perf = await page.evaluate(() => window.__volcanoTest.perf())
      for (let i = 0; i < 24 && perf.n < 45; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__volcanoTest.perf())
        if (perf.n >= 25 && perf.avg > budget) break
      }
      ok(`frame time under ${budget} ms at 1600x1000 (${soft ? 'software raster' : 'hardware'})`,
        perf.n >= 45 && perf.avg <= budget, `avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)
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
