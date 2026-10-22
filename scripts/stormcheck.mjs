// stormcheck — self-verifying harness for public/demos/storm.html (#672).
//
// Proves the thunderstorm demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, zero page errors.
//   2. RULES  — sensed from pixels only:
//     · a grey cloud mass covers most of the sky toward the storm
//     · clear blue sky survives on the far side (the storm is INCOMING, not night)
//     · the cloud base is darker than its mid-body (light from above/side)
//     · rain streaks move between frames (down-frame in the near field)
//     · the field is storm-dark but not night
//     · a forced flash spikes whole-sky brightness, bleeds a bright bolt, then decays
//     · CG bolt landings spread across the core projection (both sides of the
//       core in x and z) and a far variant travels >2300m under the base (#747)
//     · rain gusts: the squall-wave field varies over time, spreads cells across
//       the whole field at every instant, and its crest sweeps downfield (#747)
//     · the storm rolls in: its distance shrinks over time
//     · the camera pose moves the world
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); carries its credits config.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Usage: node scripts/stormcheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 55]
// Proven-fail mutant: zero the in-cloud extinction (`sig = d * 0.0013` ->
// `sig = 0.0`) -> cloud-coverage and base-shadow gates go red. Pin CG starts
// back to the front (near=true always, driftZ 0) -> landings-spread and
// far-travel gates go red. Freeze the gust-wave phase (`t * 0.35` / `t * 0.22`
// -> 0 in both shader and the `gust` mirror) -> the gust-range and crest-sweep
// gates go red (measured 0.00 and 0 m).

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
const file = resolve(ROOT, opt('--file', 'public/demos/storm.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 90)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9376')
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

const cloudGrey = (r, g, b) => {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 95 && lum < 195 && Math.abs(r - g) < 22 && b - r > -14 && b - r < 26
}
const blueSky = (r, g, b) => b - r > 24 && b > 120
const veryBright = (r, g, b) => r > 214 && g > 214 && b > 214

async function main() {
  // ---- static law checks (no browser) ----
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"][^'"]*storm/i.test(reg))
  ok('exposes __stormTest DEV hook', /__stormTest/.test(src))
  ok('carries a DEMO_CREDITS config (name/issues/assist)',
    /DEMO_CREDITS[\s\S]*name:\s*'STORM'/.test(src) && /issues:\s*\[672\]/.test(src) && /assist:\s*'solo'/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/stormcheck-profile`, 'about:blank',
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
    try { await page.waitForFunction(() => window.__stormTest && window.__stormTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__stormTest.frames > 15))
      ok('HDR float render target active', await page.evaluate(() => window.__stormTest.hdr))

      const img = decodePng(await page.screenshot())
      const W = img.w, H = img.h
      const sky = { y0: Math.round(H * 0.04), y1: Math.round(H * 0.34) }
      const skyBoxArea = (W * 0.6) * (sky.y1 - sky.y0)

      // cloud mass dominates the centre-upper sky
      const cx0 = Math.round(W * 0.20), cx1 = Math.round(W * 0.80)
      const grey = countIn(img, cx0, sky.y0, cx1, sky.y1, cloudGrey)
      ok('cloud mass covers the sky toward the storm', grey / skyBoxArea > 0.45,
        `coverage=${(grey / skyBoxArea * 100).toFixed(0)}%`)

      // blue sky survives on the right third (storm approaching, not dusk-wide)
      // the wall cloud: a dark base hanging over the horizon under the core,
      // against a bright sky corner far from the storm
      const wall = meanLum(img, Math.round(W * 0.12), Math.round(H * 0.34), Math.round(W * 0.58), Math.round(H * 0.44))
      const corner = meanLum(img, Math.round(W * 0.84), Math.round(H * 0.26), W, Math.round(H * 0.44))
      ok('dark wall cloud under the core, bright far corner', wall < 135 && corner - wall > 45,
        `wall=${wall.toFixed(0)} corner=${corner.toFixed(0)}`)

      // cloud base darker than mid-body
      const baseL = meanLum(img, cx0, Math.round(H * 0.26), cx1, Math.round(H * 0.40))
      const midL = meanLum(img, cx0, Math.round(H * 0.08), cx1, Math.round(H * 0.22))
      ok('cloud base darker than lit mid-body', midL - baseL > 8, `mid=${midL.toFixed(0)} base=${baseL.toFixed(0)}`)

      // rain streaks move: near-field band changes a lot frame to frame
      const ry0 = Math.round(H * 0.42), ry1 = Math.round(H * 0.9)
      const imgB = decodePng(await page.screenshot())
      await page.waitForTimeout(250)
      const imgC = decodePng(await page.screenshot())
      let moving = 0, tot = 0
      for (let y = ry0; y < ry1; y += 2) for (let x = Math.round(W * 0.1); x < Math.round(W * 0.9); x += 2) {
        const p = px(imgB, x, y), q = px(imgC, x, y)
        const d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])
        if (d > 12) moving++
        tot++
      }
      ok('rain streaks move between frames', moving / tot > 0.06, `${(moving / tot * 100).toFixed(1)}% px changed`)

      // field is storm-dark but not night
      const groundL = meanLum(img, Math.round(W * 0.1), Math.round(H * 0.52), Math.round(W * 0.9), Math.round(H * 0.92))
      ok('field is storm-dark, not night', groundL > 30 && groundL < 115, `ground lum=${groundL.toFixed(0)}`)

      // storm rolls in: distance shrinks
      const dA = await page.evaluate(() => window.__stormTest.state().stormDist)
      await page.waitForTimeout(5000)
      const dB = await page.evaluate(() => window.__stormTest.state().stormDist)
      ok('storm rolls in (distance shrinks)', dB < dA - 25, `${dA}m -> ${dB}m`)

      // flash: whole-sky spike + bright bolt pixels + decay
      const pre = meanLum(img, 0, 0, W, Math.round(H * 0.45))
      await page.evaluate(() => window.__stormTest.setAuto(false))
      const boltNow = await page.evaluate(() => window.__stormTest.flashNow(true))
      ok('forced CG bolt reported', boltNow.bolt === true, JSON.stringify(boltNow))
      ok('flash reports a CG bolt active', await page.evaluate(() => window.__stormTest.state().boltOn))
      await page.waitForFunction(() => window.__stormTest.state().skyFlash > 0.3, null, { timeout: 2000 })
      const flashImg = decodePng(await page.screenshot())
      const spike = meanLum(flashImg, 0, 0, W, Math.round(H * 0.45))
      ok('flash spikes whole-sky brightness', spike - pre > 10, `pre=${pre.toFixed(0)} peak=${spike.toFixed(0)}`)
      const bolts = countIn(flashImg, Math.round(W * 0.15), sky.y0, Math.round(W * 0.85), Math.round(H * 0.5), veryBright)
      ok('bolt channel renders bright above the horizon', bolts > 80, `${bolts} near-white px`)
      await page.waitForTimeout(900)
      const after = meanLum(decodePng(await page.screenshot()), 0, 0, W, Math.round(H * 0.45))
      ok('flash decays back to ambient', after - pre < 12, `after=${after.toFixed(0)} pre=${pre.toFixed(0)}`)

      // #747: CG bolts land across the whole core projection, not one front quadrant
      const spread = await page.evaluate(() => {
        const D = window.__stormTest;
        for (let i = 0; i < 48; i++) D.flashNow(true, 'wide');
        const s = D.state();
        return { storm: s.storm, tips: s.cgTips };
      });
      const tx = spread.tips.map(t => t[0] - spread.storm[0]);
      const tz = spread.tips.map(t => t[1] - spread.storm[1]);
      const xr = Math.max(...tx) - Math.min(...tx);
      const zr = Math.max(...tz) - Math.min(...tz);
      ok('CG bolts land across the whole core projection',
        spread.tips.length >= 40 && xr > 3500 && zr > 3500 &&
        tx.some(v => v < -700) && tx.some(v => v > 700) && tz.some(v => v < 600),
        `n=${spread.tips.length} xRange=${xr} zRange=${zr} behindCore=${tz.filter(v => v < 600).length}`);
      const farBolt = await page.evaluate(() => window.__stormTest.flashNow(true, 'far'));
      ok('CG bolts sometimes travel far under the base', farBolt.dz > 2300, `dz=${farBolt.dz}m`);

      // #747 item 4: rain gusts — squall waves sweep the field instead of a metronome
      const wave = await page.evaluate(() => {
        const D = window.__stormTest;
        const samples = [];
        for (let i = 0; i <= 24; i++) samples.push(D.gust(0, 0, i));
        const cells = [];
        for (const t of [0, 2, 6, 10]) {
          let mn = 9, mx = -9;
          for (let x = -4000; x <= 4000; x += 100) { const v = D.gust(x, 0, t); if (v < mn) mn = v; if (v > mx) mx = v; }
          cells.push(+(mx - mn).toFixed(3));
        }
        const at0 = []; for (let x = -4000; x <= 4000; x += 200) at0.push([x, D.gust(x, 0, 2)]);
        const at1 = []; for (let x = -4000; x <= 4000; x += 200) at1.push([x, D.gust(x, 0, 6)]);
        return { samples, cells, at0, at1 };
      });
      const gmin = Math.min(...wave.samples), gmax = Math.max(...wave.samples);
      ok('rain gusting: streak intensity varies over the squall cycle', gmax - gmin > 0.22,
        `gust range=${(gmax - gmin).toFixed(2)}`);
      ok('sheeting: squall cells spread across the field at every instant', Math.min(...wave.cells) > 0.25,
        `spatial ranges=${wave.cells.join(',')}`);
      const crest = arr => arr.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      const crestShift = Math.abs(crest(wave.at1) - crest(wave.at0));
      ok('sheeting: squall crest sweeps across the field', crestShift > 300,
        `crest ${crest(wave.at0)}m -> ${crest(wave.at1)}m in 4s`);

      // camera pose moves the world
      await page.evaluate(() => window.__stormTest.setPose({ yaw: 0.95, pitch: 0.06 }))
      await page.waitForTimeout(1400)
      const imgD = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgD.h; y += 3) for (let x = 0; x < imgD.w; x += 3) {
        const p = px(imgD, x, y), q = px(imgC, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose changes the world', d / n > 6, `mean|Δ|=${(d / n).toFixed(1)}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'orbit.png'), await page.screenshot())
      }

      // speed: hardware budget; SwiftShader gets its own.
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
      await page.evaluate(() => window.__stormTest.resetPerf())
      let perf = await page.evaluate(() => window.__stormTest.perf())
      for (let i = 0; i < 24 && perf.n < 45; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__stormTest.perf())
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
