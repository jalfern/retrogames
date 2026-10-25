// reefcheck — self-verifying harness for public/demos/reef.html (#902).
//
// Proves the coral-reef drift demo:
//   1. BOOTS  — canvas 2D, DEV hook ready, rAF advancing, zero page errors.
//   2. RULES  — the scene reads as an underwater reef, sensed from pixels:
//     · the water column brightens toward the surface and dimens with depth
//     · red is absorbed with depth: red/green ratio drops far below the surface
//     · god rays slant down from the surface (vertical bright columns, additive)
//     · caustics lie on the sand: lit pixels on the floor band, and they MOVE
//     · warm coral colour (pinks/oranges) sits across the reef bands
//     · a fish school exists and FLOCKS (Vicsek order parameter > 0.85)
//     · marine-snow particles + coral props are alive in the scene
//     · the camera pose moves the world; the sim never freezes
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); exposes the __reefTest hook.
//   4. PHONE  — boots clean at 390x844 (tap-to-look); sharp at dpr2.
//   5. SPEED  — our own draw cost (ms spent inside the frame body, not rAF
//               delivery, which headless software-composites at 10–20fps
//               regardless — see AGENTS "CI Chrome is software-rendered").
//
// Usage: node scripts/reefcheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 45]
// Proven-fail mutant: zero the caustic field (`v * v * 255` -> `0`) -> the
// lit-sand and caustics-move gates go red (ripples are what make the floor a
// reef floor, not just gradient).

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
const maxMs = +opt('--max-ms', 45)
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
  ok('depth absorption is the law (red decays fastest in waterCol)',
    /function waterCol\(/.test(src) && /mix\(126, 9,/.test(src) && /mix\(197, 44,/.test(src))
  ok('god rays drawn additively (lighter composite)', /drawRays/.test(src) && /globalCompositeOperation = 'lighter'/.test(src))
  ok('caustics computed as a moving field and composited onto the sand',
    /function caustic\(x, z, t\)/.test(src) && /putImageData\(causticImg/.test(src) && /drawCausticOverlay/.test(src))
  ok('corals / fans / anemones sway with a current',
    /buildGeo\(/.test(src) && /p\.sway/.test(src) && /'anemone'/.test(src) && /'fan'/.test(src) && /'branch'/.test(src))
  ok('fish school runs boids rules (separation + alignment + cohesion)',
    /SEPR/.test(src) && /ALGN/.test(src) && /COH/.test(src) && /fishOrder/.test(src))
  ok('fish vary by species (multiple silhouettes + size classes, #947)',
    /SPECIES\s*=\s*\[/.test(src) && /species/.test(src) && /cls/.test(src))
  ok('school wheels around a drifting heading (murmuration bias, #947)', /const wheel =/.test(src))
  ok('caustics hug the seabed contour (height-aware strips, #947)',
    /seabedH\(wx, wz\) - Yc/.test(src) && /drawCausticOverlay/.test(src))
  ok('caustics brighter on shallow floor than deep (#947)',     /\(1 - th \/ 170\)/.test(src))
  ok('branch coral tips curl with phase lag down the branch (#947)',
    /seg\.y1 \* 0\.35/.test(src) && /t \* p\.sway \+ p\.phase \+ seg\.y1/.test(src))
  ok('sea fans flex, ribs bending with the current (#947)',
    /const flex = Math\.sin\(t \* p\.sway/.test(src) && /flex \* fr \* fr/.test(src))
  ok('god rays wobble in width and scatter at the surface line (#947)',
    /const wobble = 1 \+ 0\.45/.test(src) && /beamTex/.test(src) && /skew \/ hgt/.test(src))
  ok('reef crackle + pass-by whoosh audio wired (#947)',
    /function crackle\(/.test(src) && /function scheduleCrackle\(/.test(src) && /function fishWhoosh\(/.test(src) && /scheduleCrackle\(\);/.test(src))
  ok('idle camera bobs and hovers near hero corals (#947)',
    /cam\.touched > 2500/.test(src) && /driftMul = 0\.5/.test(src))
  ok('marine snow + bubbles particles live in the scene', /layoutSnow/.test(src) && /maybeBubble/.test(src))
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
    try { await page.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: canvas 2D + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__reefTest.frames > 15))
      ok('school is alive and flocking (order > 0.85)', await page.evaluate(() => {
        const f = window.__reefTest.fish()
        return f.n >= 24 && f.order > 0.85
      }), JSON.stringify(await page.evaluate(() => window.__reefTest.fish())))
      ok('reef is populated (coral props + marine snow)', await page.evaluate(() => {
        const c = window.__reefTest.corals(), p = window.__reefTest.particles()
        return c.n >= 12 && p.snow >= 48
      }), JSON.stringify(await page.evaluate(() => ({ coral: window.__reefTest.corals(), snow: window.__reefTest.particles().snow }))))

      await page.evaluate(() => window.__reefTest.setPose({ look: 0, y: 0 }))
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const img = decodePng(bufA)
      const W = img.w, H = img.h

      const topBand = meanRGB(img, Math.round(W * 0.15), Math.round(H * 0.08), Math.round(W * 0.85), Math.round(H * 0.22))
      const botBand = meanRGB(img, Math.round(W * 0.15), Math.round(H * 0.86), Math.round(W * 0.85), Math.round(H * 0.97))
      ok('water brightens toward the surface (luma top > bottom)',
        luma(topBand) > luma(botBand) + 30, `top=${luma(topBand).toFixed(0)} bottom=${luma(botBand).toFixed(0)}`)
      const rgTop = topBand[0] / topBand[1], rgBot = botBand[0] / botBand[1]
      ok('red absorbed with depth (r/g ratio collapses down-column)',
        rgTop > rgBot * 1.5 && rgBot < 0.45, `r/g top=${rgTop.toFixed(2)} bottom=${rgBot.toFixed(2)}`)
      ok('upper column reads cyan-green, deep column blue (b > r everywhere)',
        topBand[2] > topBand[0] + 20 && botBand[2] > botBand[0] + 20,
        `top rgb=${topBand.map(v => v.toFixed(0)).join(',')} bottom rgb=${botBand.map(v => v.toFixed(0)).join(',')}`)

      let rays = 0, rayCols = new Set()
      for (let x = 4; x < W - 18; x += 2) {
        let hits = 0
        for (let y = Math.round(H * 0.06); y < Math.round(H * 0.66); y += 3) {
          const l = luma(px(img, x, y))
          const lL = luma(px(img, Math.max(0, x - 14), y)), lR = luma(px(img, Math.min(W - 1, x + 14), y))
          if (l > lL + 5 && l > lR + 5 && l > 65) hits++
        }
        if (hits >= 5) { rays += hits; rayCols.add(Math.floor(x / 96)) }
      }
      ok('god rays slant down from the surface', rays > 1200 && rayCols.size >= 4, `${rays} ray px across ${rayCols.size}/10 sections`)

      const floorY0 = Math.round(H * 0.80), floorY1 = Math.round(H * 0.95)
      let lit = 0, litCols = new Set()
      for (let x = 4; x < W - 4; x += 2) {
        for (let y = floorY0; y < floorY1; y += 2) {
          const [r, g, b] = px(img, x, y)
          if (g > 120 && b > 110 && luma([r, g, b]) > 100) { lit++; litCols.add(Math.floor(x / 96)) }
        }
      }
      ok('caustics light the sand floor', lit > 700 && litCols.size >= 5, `${lit} lit sand px across ${litCols.size}/10 sections`)

      await page.waitForTimeout(650)
      const img2 = decodePng(await page.screenshot())
      let diff = 0, dn = 0
      for (let y = floorY0; y < floorY1; y += 2) for (let x = 4; x < W - 4; x += 2) {
        diff += Math.abs(luma(px(img, x, y)) - luma(px(img2, x, y))); dn++
      }
      const floorMotion = diff / dn
      ok('caustics ripple — the sand field moves between frames', floorMotion > 1.2, `mean|Δ|=${floorMotion.toFixed(2)} on floor band`)

      let coral = 0, coralCols = new Set()
      for (let x = 4; x < W - 4; x += 2) {
        for (let y = Math.round(H * 0.52); y < Math.round(H * 0.92); y += 2) {
          const [r, g, b] = px(img, x, y)
          if (r - b > 16 && r - g > 30 && r > 75 && luma([r, g, b]) < 215) { coral++; coralCols.add(Math.floor(x / 96)) }
        }
      }
      ok('warm living coral colour across the reef bands', coral > 120 && coralCols.size >= 4,
        `${coral} warm coral px across ${coralCols.size}/10 sections`)

      const tops = []
      for (let x = 8; x < W - 8; x += 4) {
        let found = -1
        for (let y = Math.round(H * 0.70); y < Math.round(H * 0.97); y += 2) {
          const [r, g, b] = px(img, x, y)
          if (g > 120 && b > 110 && luma([r, g, b]) > 100) { found = y; break }
        }
        if (found >= 0) tops.push(found)
      }
      const tmed = tops.slice().sort((a, b) => a - b)[Math.floor(tops.length / 2)] || 0
      const tdev = tops.length ? tops.reduce((s, y) => s + Math.abs(y - tmed), 0) / tops.length : 0
      ok('caustic field follows the seabed contour (lit-band top undulates, #947)',
        tops.length > 60 && tdev > 1.5, `${tops.length} columns, mean top deviation=${tdev.toFixed(1)}px`)

      const bandLit = (y0, y1) => {
        let s = 0, n = 0
        for (let x = 8; x < W - 8; x += 2) for (let y = Math.round(H * y0); y < Math.round(H * y1); y += 2) {
          const [r, g, b] = px(img, x, y)
          if (g > 120 && b > 110 && luma([r, g, b]) > 100) { s += luma([r, g, b]); n++ }
        }
        return n > 20 ? s / n : -1
      }
      const litNear = bandLit(0.90, 0.97), litFar = bandLit(0.75, 0.82)
      ok('shallow sand catches brighter caustics than deep sand (#947)',
        litNear > 0 && litFar > 0 && litNear > litFar + 6, `near=${litNear.toFixed(0)} far=${litFar.toFixed(0)}`)

      let rayShim = 0, rn = 0
      for (let y = Math.round(H * 0.10); y < Math.round(H * 0.50); y += 3) for (let x = 4; x < W - 4; x += 2) {
        rayShim += Math.abs(luma(px(img, x, y)) - luma(px(img2, x, y))); rn++
      }
      ok('god rays shimmer between frames (width wobble + drift, #947)',
        rayShim / rn > 0.5, `mean|Δ|=${(rayShim / rn).toFixed(2)} in ray band`)

      ok('fish school carries species variety and stays ordered (#947)',
        await page.evaluate(() => { const f = window.__reefTest.fish(); return f.species >= 3 && f.order > 0.85 }),
        JSON.stringify(await page.evaluate(() => window.__reefTest.fish())))

      await page.evaluate(() => window.__reefTest.setPose({ look: 0, y: 0 }))
      await page.waitForTimeout(3200)
      const yA = await page.evaluate(() => window.__reefTest.pose().y)
      await page.waitForTimeout(2000)
      const yB = await page.evaluate(() => window.__reefTest.pose().y)
      ok('idle camera bobs vertically without input (#947)', Math.abs(yB - yA) > 2, `y ${yA.toFixed(1)} -> ${yB.toFixed(1)}`)
      await page.evaluate(() => window.__reefTest.setPose({ look: 260, y: 40 }))

      await page.evaluate(() => window.__reefTest.setPose({ look: 260, y: 40 }))
      await page.waitForTimeout(1400)
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
      try { await phone.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 20000 }) }
      catch { phoneReady = false }
      ok('phone 390x844 boots clean (lite)', phoneReady && errsP.length === 0, errsP[0])
      await phone.evaluate(() => {
        const c = document.getElementById('c')
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 400, bubbles: true }))
        c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 430, bubbles: true }))
      })
      await phone.waitForTimeout(600)
      ok('phone tap-drag steers the look', await phone.evaluate(() => Math.abs(window.__reefTest.pose().look) > 40))
      await pctx.close()

      const ctxR = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 })
      const pageR = await ctxR.newPage()
      await pageR.goto(url, { waitUntil: 'load' })
      let rsReady = true
      try { await pageR.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 20000 }) }
      catch { rsReady = false }
      const rs = rsReady ? await pageR.evaluate(() => window.__reefTest.renderScale()) : null
      ok('sharp on retina tablet (dpr2 picks the higher render scale)',
        !!rs && rs.retina && rs.scale >= 0.7 && !rs.lite,
        rs ? `scale=${rs.scale} internal=${rs.w}x${rs.h} css=${rs.css}@dpr${rs.dpr}` : 'renderScale unavailable')
      await ctxR.close()

      const calib = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512
        const g = c.getContext('2d'); if (!g) return Infinity
        g.fillStyle = '#0af'
        const t0 = performance.now()
        for (let i = 0; i < 80; i++) g.fillRect(0, 0, 512, 512)
        g.getImageData(0, 0, 1, 1)
        return (performance.now() - t0) / 80
      })
      const soft = calib > 0.6
      const measure = async (q, vp, budget) => {
        const pctxQ = await browser.newContext({ viewport: vp })
        const pageQ = await pctxQ.newPage()
        await pageQ.goto(url + q, { waitUntil: 'load' })
        await pageQ.waitForFunction(() => window.__reefTest && window.__reefTest.ready, null, { timeout: 20000 })
        await pageQ.waitForTimeout(4000)
        let best = null
        for (let w = 0; w < 4; w++) {
          await pageQ.evaluate(() => window.__reefTest.resetPerf())
          await pageQ.waitForTimeout(2500)
          const perf = await pageQ.evaluate(() => window.__reefTest.perf())
          if (perf.n >= 20 && (best === null || perf.work < best.work)) best = perf
        }
        await pctxQ.close()
        const perf = best || { n: 0, work: Infinity, avg: Infinity, max: Infinity }
        ok(`draw cost under ${budget} ms at ${vp.width}x${vp.height}${q ? ' (lite)' : ''} (${soft ? 'software canvas' : 'hardware'})`,
          perf.n >= 20 && perf.work <= budget, `work=${perf.work}ms cap=${perf.cap} (headless rAF-dt=${perf.avg}ms is compositor delivery, not our cost)`)
      }
      await measure('?lite=1', { width: 640, height: 426 }, soft ? +opt('--work-ms-sw', 12) : +opt('--work-ms', 8))
      await measure('', { width: 1280, height: 800 }, soft ? 20 : +opt('--work-ms-full', 14))
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
