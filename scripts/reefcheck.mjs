// reefcheck — self-verifying harness for public/demos/reef.html (#1050 GPU rebuild).
//
// Proves the raymarched coral-reef drift demo:
//   1. BOOTS  — WebGL2 context, DEV hook ready, rAF advancing, zero page errors.
//   2. RULES  — sensed from pixels + state:
//     · the water column brightens toward the surface; red drains with distance
//       (per-channel absorption: r/g ratio collapses down-column)
//     · god rays slant down from the surface and shimmer
//     · caustics light the sand floor and MOVE between frames
//     · warm living coral colour sits across the reef bands
//     · boids school: n fish, Vicsek order > 0.85, >= 3 species
//     · the raymarched scene reacts to camera pose; sim never freezes
//     · adaptive ladder exists (GPU-fence busy drives steps, then pixels)
//   3. LAW    — self-contained single file; NOT registered in games.js;
//               exposes __reefTest; short caption so credits.js can keep it
//               clear of the BUILT BY tag (#1078); credits block present.
//   4. PHONE  — boots clean at 390x844 lite; tap-drag steers; sharp at dpr2.
//   5. SPEED  — GPU fence busy time (real draw cost) under budget, software-GL
//               calibration decides the bar (CI Chrome is software-rendered).
//
// Usage: node scripts/reefcheck.mjs [--file <path>] [--shots <dir>] [--json]
// Proven-fail mutant: zero the caustic field (caust() -> return 0.0) -> the
// lit-sand, caustics-move and ray-shimmer gates go red.

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
const file = resolve(ROOT, opt('--file', 'public/demos/reef.html'))
const shots = opt('--shots', null)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9385')
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
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b

function meanRGB(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return [r / n, g / n, b / n]
}

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"]\/[^'"]*reef|label:\s*['"]Coral Reef/i.test(reg))
  ok('exposes __reefTest DEV hook', /__reefTest/.test(src))
  ok('GPU rebuild: WebGL2 context, not Canvas 2D (#1050)',
    /getContext\('webgl2'/.test(src) && !/getContext\('2d'/.test(src))
  ok('raymarch SDF scene: terrain heightfield + coral structures',
    /float terrain\(vec2/.test(src) && /vec2 structure\(/.test(src) && /sdCap\(/.test(src) && /smin\(/.test(src))
  ok('water drains colour with distance (per-channel Beer-Lambert)',
    /const vec3 SIGMA = vec3\(0\.0\d+, 0\.0\d+, 0\.0\d+\)/.test(src) && /exp\(SIGMA \* fogd\)/.test(src))
  ok('caustics: animated field modulating the sun term', /float caust\(vec2 p, float t\)/.test(src) && /caust\(sp, uTime\)/.test(src))
  ok('god rays: volumetric march along the ray', /float rays = 0\.0;/.test(src) && /rays \+=/.test(src) && /rays \*=/.test(src))
  ok('tileable period-128 drift world (endless, seamless loop)', /const WORLD_L = 128/.test(src) && /mod\(i \+ vec2\(0\.0\), vec2\(per\)\)/.test(src))
  ok('school runs boids rules (separation + alignment + cohesion)',
    /SEPR/.test(src) && /ALGN/.test(src) && /COH/.test(src) && /fishOrder/.test(src))
  ok('fish vary by species and wheel around a drifting heading',
    /species/.test(src) && /const wheel =|wheel \+=/.test(src))
  ok('adaptive quality ladder (fence busy -> steps -> pixels)',
    /clientWaitSync/.test(src) && /dropSteps/.test(src) && /qCap/.test(src))
  const hudLine = (src.match(/<div id="hud">(.*?)<\/div>/) || [, ''])[1]
  ok('caption is short — stays clear of the BUILT BY tag (#1078)',
    hudLine.length > 0 && hudLine.length < 90, `${hudLine.length} chars`)
  ok('credits card block present (#674)', /window\.DEMO_CREDITS\s*=/.test(src) && /<script src="credits\.js">/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/reefcheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, '/tmp/forge/reefcheck-profile')
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
    try { await page.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 25000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(3000)
      ok('frames advancing at rAF', await page.evaluate(() => window.__reefTest.frames > 15))
      ok('school is alive and flocking (order > 0.85)', await page.evaluate(() => {
        const f = window.__reefTest.fish()
        return f.n >= 24 && f.order > 0.85
      }), JSON.stringify(await page.evaluate(() => window.__reefTest.fish())))
      ok('reef is populated (coral census of all kinds)', await page.evaluate(() => {
        const c = window.__reefTest.corals()
        return c.n >= 16 && c.kinds >= 4
      }), JSON.stringify(await page.evaluate(() => window.__reefTest.corals())))

      await page.evaluate(() => window.__reefTest.setPose({ look: 0, y: 0 }))
      await page.waitForTimeout(1500)
      const bufA = await page.screenshot()
      const img = decodePng(bufA)
      const W = img.w, H = img.h

      const topBand = meanRGB(img, Math.round(W * 0.15), Math.round(H * 0.08), Math.round(W * 0.85), Math.round(H * 0.22))
      const botBand = meanRGB(img, Math.round(W * 0.15), Math.round(H * 0.86), Math.round(W * 0.85), Math.round(H * 0.97))
      ok('water brightens toward the surface (luma top > bottom)',
        luma(topBand) > luma(botBand) + 20, `top=${luma(topBand).toFixed(0)} bottom=${luma(botBand).toFixed(0)}`)
      const rgTop = topBand[0] / topBand[1], rgBot = botBand[0] / botBand[1]
      ok('red absorbed with distance (r/g ratio collapses down-column)',
        rgTop > rgBot * 1.2 && rgBot < 0.7, `r/g top=${rgTop.toFixed(2)} bottom=${rgBot.toFixed(2)}`)
      ok('column reads blue-green (b > r everywhere)',
        topBand[2] > topBand[0] + 10 && botBand[2] > botBand[0] + 10,
        `top rgb=${topBand.map(v => v.toFixed(0)).join(',')} bottom rgb=${botBand.map(v => v.toFixed(0)).join(',')}`)

      let rays = 0, rayCols = new Set()
      for (let x = 4; x < W - 18; x += 2) {
        let hits = 0
        for (let y = Math.round(H * 0.06); y < Math.round(H * 0.66); y += 3) {
          const l = luma(px(img, x, y))
          const lL = luma(px(img, Math.max(0, x - 14), y)), lR = luma(px(img, Math.min(W - 1, x + 14), y))
          if (l > lL + 4 && l > lR + 4 && l > 55) hits++
        }
        if (hits >= 4) { rays += hits; rayCols.add(Math.floor(x / 96)) }
      }
      ok('god rays slant down from the surface', rays > 800 && rayCols.size >= 3, `${rays} ray px across ${rayCols.size}/10 sections`)

      const floorY0 = Math.round(H * 0.80), floorY1 = Math.round(H * 0.97)
      let lit = 0, litCols = new Set()
      for (let x = 4; x < W - 4; x += 2) {
        for (let y = floorY0; y < floorY1; y += 2) {
          const [r, g, b] = px(img, x, y)
          if (g > 95 && b > 80 && luma([r, g, b]) > 80) { lit++; litCols.add(Math.floor(x / 96)) }
        }
      }
      ok('caustics light the sand floor', lit > 400 && litCols.size >= 4, `${lit} lit sand px across ${litCols.size}/10 sections`)

      await page.waitForTimeout(700)
      const img2 = decodePng(await page.screenshot())
      let diff = 0, dn = 0
      for (let y = floorY0; y < floorY1; y += 2) for (let x = 4; x < W - 4; x += 2) {
        diff += Math.abs(luma(px(img, x, y)) - luma(px(img2, x, y))); dn++
      }
      const floorMotion = diff / dn
      ok('caustics ripple — the sand field moves between frames', floorMotion > 1.0, `mean|Δ|=${floorMotion.toFixed(2)} on floor band`)

      let coral = 0, coralCols = new Set()
      for (let x = 4; x < W - 4; x += 2) {
        for (let y = Math.round(H * 0.52); y < Math.round(H * 0.95); y += 2) {
          const [r, g, b] = px(img, x, y)
          if (r - b > 10 && r - g > 22 && r > 60 && luma([r, g, b]) < 215) { coral++; coralCols.add(Math.floor(x / 96)) }
        }
      }
      ok('warm living coral colour across the reef bands', coral > 80 && coralCols.size >= 3,
        `${coral} warm coral px across ${coralCols.size}/10 sections`)

      let rayShim = 0, rn = 0
      for (let y = Math.round(H * 0.10); y < Math.round(H * 0.50); y += 3) for (let x = 4; x < W - 4; x += 2) {
        rayShim += Math.abs(luma(px(img, x, y)) - luma(px(img2, x, y))); rn++
      }
      ok('god rays shimmer between frames', rayShim / rn > 0.4, `mean|Δ|=${(rayShim / rn).toFixed(2)} in ray band`)

      await page.evaluate(() => window.__reefTest.setPose({ look: 0, y: 0 }))
      await page.waitForTimeout(4500)
      const yA = await page.evaluate(() => window.__reefTest.pose().y)
      await page.waitForTimeout(4000)
      const yB = await page.evaluate(() => window.__reefTest.pose().y)
      ok('idle camera bobs vertically without input', Math.abs(yB - yA) > 0.3, `y ${yA.toFixed(1)} -> ${yB.toFixed(1)}`)
      await page.evaluate(() => window.__reefTest.setPose({ look: 260, y: 40 }))

      await page.waitForTimeout(1800)
      const imgB = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgB.h; y += 3) for (let x = 0; x < imgB.w; x += 3) {
        const p = px(imgB, x, y), q = px(img, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose moves the world', d / n > 4, `mean|Δ|=${(d / n).toFixed(1)}`)

      const fBefore = await page.evaluate(() => window.__reefTest.frames)
      await page.waitForTimeout(1500)
      const fAfter = await page.evaluate(() => window.__reefTest.frames)
      ok('sim never freezes', fAfter > fBefore + 8, `${fBefore} -> ${fAfter}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'front.png'), bufA)
        writeFileSync(resolve(shots, 'look.png'), await page.screenshot())
      }

      const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      const phone = await pctx.newPage()
      const errsP = []
      phone.on('pageerror', e => errsP.push('pageerror: ' + e.message))
      phone.on('console', m => { if (m.type() === 'error') errsP.push('console: ' + m.text().split('\n')[0]) })
      await phone.goto(url + '?lite=1', { waitUntil: 'load' })
      let phoneReady = true
      try { await phone.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 25000 }) }
      catch { phoneReady = false }
      ok('phone 390x844 boots clean (lite)', phoneReady && errsP.length === 0, errsP[0])
      await phone.evaluate(() => {
        const c = document.getElementById('c')
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 400, bubbles: true }))
        c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 430, bubbles: true }))
      })
      await phone.waitForTimeout(600)
      ok('phone tap-drag steers the look', await phone.evaluate(() => Math.abs(window.__reefTest.pose().look) > 40))
      ok('phone caption clears the BUILT BY tag at 390px (#1078)', await phone.evaluate(() => {
        const hud = document.getElementById('hud'), tag = document.getElementById('credits-tag')
        if (!hud || !tag) return false
        const hr = hud.getBoundingClientRect(), tr = tag.getBoundingClientRect()
        const crossY = hr.top < tr.bottom && hr.bottom > tr.top
        return !(crossY && hr.right > tr.left - 4)
      }))
      await pctx.close()

      const ctxR = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 })
      const pageR = await ctxR.newPage()
      await pageR.goto(url, { waitUntil: 'load' })
      let rsReady = true
      try { await pageR.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 25000 }) }
      catch { rsReady = false }
      const rs = rsReady ? await pageR.evaluate(() => window.__reefTest.renderScale()) : null
      ok('sharp on retina tablet (dpr2 picks the higher render scale)',
        !!rs && rs.retina && rs.scale >= 0.7 && !rs.lite,
        rs ? `scale=${rs.scale} internal=${rs.w}x${rs.h} css=${rs.css}@dpr${rs.dpr}` : 'renderScale unavailable')
      await ctxR.close()

      const calib = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256
        const g = c.getContext('webgl2'); if (!g) return Infinity
        const t0 = performance.now()
        for (let i = 0; i < 20; i++) { g.clearColor(i / 40, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT) }
        g.finish()
        return (performance.now() - t0) / 20
      })
      const soft = calib > 0.5
      const measure = async (q, vp, budget) => {
        const pctxQ = await browser.newContext({ viewport: vp })
        const pageQ = await pctxQ.newPage()
        await pageQ.goto(url + q, { waitUntil: 'load' })
        await pageQ.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 25000 })
        await pageQ.waitForTimeout(5000)
        let best = null
        for (let w = 0; w < 4; w++) {
          await pageQ.evaluate(() => window.__reefTest.resetPerf())
          await pageQ.waitForTimeout(2500)
          const perf = await pageQ.evaluate(() => window.__reefTest.perf())
          if (perf.n >= 20 && (best === null || perf.busy < best.busy)) best = perf
        }
        await pctxQ.close()
        const perf = best || { n: 0, busy: Infinity, avg: Infinity }
        ok(`GPU busy under ${budget} ms at ${vp.width}x${vp.height}${q ? ' (lite)' : ''} (${soft ? 'software GL' : 'hardware'})`,
          perf.n >= 20 && perf.busy <= budget, `busy=${perf.busy}ms avg-rAF=${perf.avg}ms steps=${perf.steps} cap=${perf.cap}`)
      }
      await measure('?lite=1', { width: 640, height: 426 }, +opt('--busy-lite', soft ? 90 : 10))
      await measure('', { width: 1280, height: 800 }, +opt('--busy-full', soft ? 260 : 24))
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
