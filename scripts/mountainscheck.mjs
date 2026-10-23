// mountainscheck — self-verifying harness for public/demos/mountains.html (#671).
//
// Proves the raymarched sunrise-range demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, HDR target, zero page errors.
//   2. RULES  — the scene behaves like dawn in the mountains, sensed from pixels:
//     · sky up top is blue (b > r)
//     · the horizon carries a warm sunrise glow
//     · a mountain skyline exists below the sky (detects per-column skyline)
//     · sunlit rock runs warm gold below the skyline (alpenglow side-lighting)
//     · snow sits high: bright near-white pixels among the peaks
//     · aerial perspective: the band under the skyline is hazier/brighter than
//       the foreground lower down
//     · the lake mirrors the sky: cool blue reflective water in the foreground
//     · the camera pose moves the world
//     · the sim never freezes (frames keep advancing)
//   2b. #736 READS AS A RANGE — ridge bases reach lit ground (no dark void mid-band),
//     · no thin horizontal line cuts the range.
//   2c. #834 PHOTOGRAPHIC — wobbled natural lake edge, still-water ripples, mirror
//     reflection, soft wet-shallow waterline; far field continues past the heightfield
//     edge (no seam cliff); distance-damped snow (no floating patches); rock grain is
//     slope-aligned streak detail, and a pixel gate requires fine-grain energy to
//     outweigh low-frequency blot energy on sunlit rock (the cheetah test).
//   3. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); exposes the __mountainsTest hook.
//   4. SPEED  — frame budget with software-raster fallback detection.
//
// Usage: node scripts/mountainscheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 45]
// Proven-fail mutant: zero the sun diffuse gain (`* mix(0.11, 1.0, sh) * 1.75` ->
// `* mix(0.11, 1.0, sh) * 0.0`) -> sunlit-rock, snow-brightness and haze-order
// gates go red (warm gold light is what separates lit rock from silhouette).
// Second mutant (#834): restore the blob highlight `smoothstep(0.66, 0.95, rockN)` ->
// cheetah-grain gate red; restore hard ellipse `length(vec2(lp.x*0.80, lp.z+0.7)) < 3.0`
// -> wobbled-basin gate red.

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
const file = resolve(ROOT, opt('--file', 'public/demos/mountains.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 45)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9381')
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

const px = (img, x, y) => { const i = (y * img.w + x) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]] }
function toRGBA(img) {
  if (img.bpp === 4) return img.px
  const out = Buffer.alloc(img.w * img.h * 4)
  for (let i = 0, j = 0; i < img.w * img.h; i++, j += 4) {
    out[j] = img.px[i * img.bpp]; out[j + 1] = img.px[i * img.bpp + 1]; out[j + 2] = img.px[i * img.bpp + 2]; out[j + 3] = 255
  }
  return out
}
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b

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

// per-column skyline: first y (searching downward from 0.22H) where the pixel
// drops well below the local sky luminance (dark rock against bright sky).
function skyline(img) {
  const H = img.h, W = img.w
  const cols = new Array(W).fill(-1)
  for (let x = 0; x < W; x += 4) {
    const skyL = luma(px(img, x, Math.round(H * 0.20)))
    for (let y = Math.round(H * 0.22); y < Math.round(H * 0.72); y += 2) {
      const l = luma(px(img, x, y))
      if (l < skyL * 0.72 || Math.abs(l - skyL) > 22) { cols[x] = y; break }
    }
  }
  let last = -1
  for (let x = 0; x < W; x++) {
    if (cols[x] === -1) cols[x] = last
    else last = cols[x]
  }
  return cols
}

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"]\/[^'"]*mountains|label:\s*['"]Mountains/i.test(reg))
  ok('exposes __mountainsTest DEV hook', /__mountainsTest/.test(src))
  ok('LAKE_Y single source (JS value interpolated into shader)', /const float LAKE_Y = \$\{LAKE_Y/.test(src) && !/const float LAKE_Y = 0\.\d+;/.test(src))
  const basinM = src.match(/length\(lc\) < 3\.0 \+ lakeW\(lc\)/)
  ok('lake bounded to a noise-perturbed basin (r<4.5, wobbled shoreline in both shaders)',
    !!basinM && (src.match(/lakeW\(/g) || []).length >= 3 && /rr = r2 \+ lakeW\(vec2\(p\.x \* 0\.80, p\.y \+ 0\.7\)\)/.test(src) && !/abs\(lp\.y\)/.test(src),
    basinM ? 'wobbled ellipse, shared lakeW()' : 'hard ellipse')
  ok('still-water ripples: derivative-only normals, small amplitude (#834)',
    !/rip - 0\.75/.test(src) && /-ex \* 0\.01\d/.test(src) && /vec2\(0\.07, 0\.0\)\) \* 9\.0/.test(src))
  ok('reflection mirror-smooth: tight gradient, small wobble (#834)',
    /e2 = vec2\(0\.18, 0\.0\)/.test(src) && /0\.05, 1\.0, -nz/.test(src) && !/\* 0\.30, 1\.0, -nz/.test(src))
  ok('lake fades to wet-shallow at its edge (no hard curved waterline, #834)',
    /waterShallow/.test(src) && /smoothstep\(0\.02, 0\.10, lakeDepth\)/.test(src))
  ok('H16 bake stores FULL height, not hi-byte (8-bit contour-seam regression, #834)',
    /#ifdef H16\n\s*o = vec4\(h, 0\.0, 0\.0, 1\.0\);/.test(src) && /progHeight16 = program\(VS_QUAD, '#version 300 es\\n#define H16\\n'/.test(src))
  ok('far field continues past the heightfield edge: baked, angular-broken, max-merged (seam fix, #834)',
    /return max\(hs, c\);/.test(src) && /FS_FAR/.test(src) && /textureLod\(uFar/.test(src) && /smoothstep\(21\.0, 25\.5, rad\)/.test(src) && /vnoise\(vec2\(ang \* 2\.7/.test(src))
  ok('lake-bed cull only bites inside the lake outline (seam across range fix, #834)',
    /if \(length\(dlc\) < 3\.0 \+ lakeW\(dlc\)\) tLim = td;/.test(src))
  ok('ray early-exit cannot dump near-ridge slopes to sky (hd>2.4 gated by t, #834)',
    /hd > 2\.4 && t > 9\.0/.test(src))
  ok('snow break-up damps with distance (no floating patches, #834)',
    /farSoft = smoothstep\(15\.0, 28\.0/.test(src) && /brk = mix\(brk, 0\.80, farSoft\)/.test(src))
  ok('rock detail is slope-aligned streak grain, not blob thresholds (no cheetah, #834)',
    /vec2 pd = vec2\(dot\(p\.xz, sd\)/.test(src) && /vec3\(0\.150, 0\.155, 0\.172\), vec3\(0\.255, 0\.240, 0\.228\)/.test(src) && !/smoothstep\(0\.66, 0\.95, rockN\)/.test(src))
  ok('shoreline bank lifts land above the waterline, on the far side only (valley mouth)',
    /float bank = \(0\.0\d+ \+ 0\.0\d+ \* \(1\.0 - smoothstep\([^)]*\)\)\) \* smoothstep\(-/.test(src) && /max\(h, bank\)/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/mountainscheck-profile`, 'about:blank',
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
    try { await page.waitForFunction(() => window.__mountainsTest && window.__mountainsTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__mountainsTest.frames > 15))
      ok('HDR float render target active', await page.evaluate(() => window.__mountainsTest.hdr))
      const sun = await page.evaluate(() => window.__mountainsTest.sun())
      ok('sun rides low (3–14° elevation)', sun.elev > 3 && sun.elev < 14, `${sun.elev.toFixed(1)}° warm=(${sun.r.toFixed(2)},${sun.g.toFixed(2)},${sun.b.toFixed(2)})`)

      await page.evaluate(() => window.__mountainsTest.setPose({ yaw: 0.02, pitch: 0.02 }))
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const img = decodePng(bufA)
      const W = img.w, H = img.h
      const sky = skyline(img)

      const skyMean = meanRGB(img, Math.round(W * 0.15), Math.round(H * 0.04), Math.round(W * 0.85), Math.round(H * 0.16))
      ok('upper sky is blue (b > r)', skyMean[2] > skyMean[0] + 8, `sky rgb=${skyMean.map(v => v.toFixed(0)).join(',')}`)

      let glow = 0
      for (let x = Math.round(W * 0.02); x < Math.round(W * 0.98); x += 2) {
        const top = sky[x] > 0 ? sky[x] : Math.round(H * 0.45)
        for (let y = Math.max(Math.round(H * 0.24), top - Math.round(H * 0.16)); y < top; y += 2) {
          const [r, g, b] = px(img, x, y)
          if (r - b > 14 && r > 150) glow++
        }
      }
      ok('horizon carries warm sunrise glow', glow * 4 > 1500, `${glow * 4} warm glow px`)

      const skyCols = sky.filter(v => v > 0).length
      ok('mountain skyline spans the frame', skyCols > W * 0.45, `${skyCols}/${W} columns have terrain`)

      const skyVals = sky.filter(v => v > 0).sort((a, b) => a - b)
      const ridge = skyVals[Math.floor(skyVals.length / 2)]
      const summit = skyVals[Math.floor(skyVals.length * 0.02)]
      const peakCols = sky.filter(v => v > 0 && v < ridge - Math.round(H * 0.06)).length
      ok('peaks break the skyline above the ridge band',
        summit < ridge - Math.round(H * 0.10) && peakCols > W * 0.08,
        `ridge=${ridge} summit=${summit} (${ridge - summit}px relief), ${peakCols} peak columns`)

      const warmRock = (r, g, b) => r - b > 28 && r > 110 && luma([r, g, b]) < 190
      const snowHi = (r, g, b) => r > 150 && g > 150 && b > 150
      let rock = 0, snow = 0, nearL = 0, nearN = 0, lowL = 0, lowN = 0
      let pink = 0
      const rockBuckets = new Set()
      const pinkBuckets = new Set()
      for (let x = 4; x < W - 4; x += 4) {
        const s = sky[x]
        if (s < 0) continue
        for (let y = s + 2; y < Math.min(s + Math.round(H * 0.30), Math.round(H * 0.72)); y += 2) {
          const [r, g, b] = px(img, x, y)
          if (warmRock(r, g, b)) { rock++; rockBuckets.add(Math.floor(x / 64)) }
          if (snowHi(r, g, b)) snow++
          if (y < s + Math.round(H * 0.10)) {
            nearL += luma([r, g, b]); nearN++
            if (r - g > 12 && r - b > 30 && r > 140 && luma([r, g, b]) < 235) { pink++; pinkBuckets.add(Math.floor(x / 64)) }
          }
          if (y >= s + Math.round(H * 0.16) && y < s + Math.round(H * 0.30)) { lowL += luma([r, g, b]); lowN++ }
        }
      }
      ok('sunlit rock runs warm gold (alpenglow)', rock * 4 > 6000 && rockBuckets.size >= 8, `${rock * 4} warm-lit rock px across ${rockBuckets.size}/15 frame sections`)
      ok('snow sits among the peaks', snow * 4 > 800, `${snow * 4} bright snow px`)
      ok('alpenglow paints the summits pink-gold', pink * 4 > 400 && pinkBuckets.size >= 4,
        `${pink * 4} pink-gold crown px across ${pinkBuckets.size}/15 frame sections`)

      const nearMean = nearN ? nearL / nearN : 0
      const lowMean = lowN ? lowL / lowN : 0
      ok('aerial perspective: snow-crowned tops read brighter than rock bands',
        nearN > 500 && lowN > 500 && nearMean > lowMean + 4, `crown=${nearMean.toFixed(1)} rock=${lowMean.toFixed(1)}`)

      let devSum = 0, nDev = 0, blot = 0
      for (let x = 32; x < W - 32; x += 2) {
        const s = sky[x]
        if (s < 0) continue
        for (let y = s + Math.round(H * 0.10); y < Math.min(s + Math.round(H * 0.30), Math.round(H * 0.68)); y += 2) {
          if (!warmRock(...px(img, x, y))) continue
          let sum = 0, m = 0
          for (let dx = -28; dx <= 28; dx += 4) { const c = px(img, x + dx, y); if (warmRock(...c)) { sum += luma(c); m++ } }
          if (m < 6) continue
          const d = Math.abs(luma(px(img, x, y)) - sum / m)
          if (d > 30) blot++
          devSum += d; nDev++
        }
      }
      const meanDev = nDev ? devSum / nDev : 99
      ok('rock carries fine grain, not cheetah blotches (#834)',
        nDev > 800 && meanDev < 2.9 && blot / nDev < 0.01, `meanDev=${meanDev.toFixed(2)} over ${nDev} rock px, ${blot} hard-blot px`)

      const coolMirror = (r, g, b) => b > r + 6 && b > 55
      let mirror = 0, mirrorN = 0
      for (let x = 8; x < W - 8; x += 4) {
        const s = sky[x]
        if (s < 0) continue
        for (let y = Math.round(H * 0.72); y < Math.round(H * 0.95); y += 2) {
          mirrorN++
          if (coolMirror(...px(img, x, y))) mirror++
        }
      }
      ok('lake mirrors the sky (cool reflection in foreground)', mirrorN > 100 && mirror / mirrorN > 0.18, `${((mirror / mirrorN) * 100).toFixed(0)}% cool px in foreground band`)

      let sliver = 0, sliverN = 0
      for (let x = 8; x < W - 8; x += 4) {
        const s = sky[x]
        if (s < 0) continue
        for (let y = s + 4; y < s + Math.round(H * 0.16); y += 2) {
          const [r, g, b] = px(img, x, y)
          sliverN++
          if (b > r + 20 && b > 165) sliver++
        }
      }
      ok('no bright water sliver cuts across the range', sliverN > 500 && sliver / sliverN < 0.02,
        `${((sliver / sliverN) * 100).toFixed(2)}% bright-cool px just below the skyline`)

      let voidPx = 0, voidN = 0
      for (let x = Math.round(W * 0.05); x < Math.round(W * 0.95); x += 2) {
        for (let y = Math.round(H * 0.42); y < Math.round(H * 0.62); y++) {
          const [r, g, b] = px(img, x, y)
          voidN++
          if (b > r + 25 && luma([r, g, b]) < 150) voidPx++
        }
      }
      ok('land fills the band between the range and the lake (no dark void, #736)',
        voidN > 1000 && voidPx / voidN < 0.02,
        `${((voidPx / voidN) * 100).toFixed(1)}% void px mid-band`)

      let lineRows = 0
      for (let y = Math.round(H * 0.32); y < Math.round(H * 0.70); y++) {
        let hits = 0, darkHits = 0, cols = 0
        for (let x = Math.round(W * 0.10); x < Math.round(W * 0.90); x += 4) {
          const l = luma(px(img, x, y))
          const up = luma(px(img, x, Math.max(y - 9, 0))), dn = luma(px(img, x, Math.min(y + 9, H - 1)))
          if (l > 150 && l - up > 12 && l - dn > 12) hits++
          if (l < 150 && up - l > 13 && dn - l > 13) darkHits++
          cols++
        }
        if (hits / cols > 0.30 || darkHits / cols > 0.30) lineRows++
      }
      ok('no thin horizontal line runs through the range (#736, dark seams #834)', lineRows === 0, `${lineRows} line rows`)

      await page.evaluate(() => window.__mountainsTest.setPose({ yaw: 0.62, pitch: 0.05 }))
      await page.waitForTimeout(1400)
      const imgB = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgB.h; y += 3) for (let x = 0; x < imgB.w; x += 3) {
        const p = px(imgB, x, y), q = px(img, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose changes the world', d / n > 4, `mean|Δ|=${(d / n).toFixed(1)}`)

      const fBefore = await page.evaluate(() => window.__mountainsTest.frames)
      await page.waitForTimeout(1500)
      const fAfter = await page.evaluate(() => window.__mountainsTest.frames)
      ok('sim never freezes', fAfter > fBefore + 8, `${fBefore} -> ${fAfter}`)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'front.png'), bufA)
        writeFileSync(resolve(shots, 'orbit.png'), encodePng(imgB.w, imgB.h, toRGBA(imgB)))
      }

      const ctxR = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 })
      const pageR = await ctxR.newPage()
      await pageR.goto(url, { waitUntil: 'load' })
      let rsReady = true
      try { await pageR.waitForFunction(() => window.__mountainsTest && window.__mountainsTest.ready, null, { timeout: 20000 }) }
      catch { rsReady = false }
      const rs = rsReady ? await pageR.evaluate(() => window.__mountainsTest.renderScale()) : null
      ok('sharp on retina tablet (dpr2 picks the higher render scale)',
        !!rs && rs.retina && rs.scale >= 0.55 && !rs.lite,
        rs ? `scale=${rs.scale} internal=${rs.w}x${rs.h} css=${rs.css}@dpr${rs.dpr}` : 'renderScale unavailable')
      await ctxR.close()

      const renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2')
        if (!g) return 'none'
        const dbg = g.getExtension('WEBGL_debug_renderer_info')
        return String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      })
      const soft = /swiftshader|llvmpipe|software/i.test(renderer)
      const budget = soft ? +opt('--max-ms-sw', 160) : maxMs
      await page.setViewportSize({ width: 1600, height: 1000 })
      await page.waitForTimeout(1500)
      let best = null
      for (let w = 0; w < 3; w++) {
        await page.evaluate(() => window.__mountainsTest.resetPerf())
        await page.waitForTimeout(2500)
        const perf = await page.evaluate(() => window.__mountainsTest.perf())
        if (perf.n >= 20 && (best === null || perf.avg < best.avg)) best = perf
      }
      const perf = best || { n: 0, avg: Infinity, max: Infinity }
      ok(`frame time under ${budget} ms at 1600x1000 (${soft ? 'software raster' : 'hardware'})`,
        perf.n >= 20 && perf.avg <= budget, `best-window avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)
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
