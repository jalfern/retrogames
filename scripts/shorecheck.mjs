// shorecheck — self-verifying harness for public/demos/shore.html (#521, #616).
//
// The demo's swash is a GPU shallow-water sim now; there are no CPU lanes, so
// the harness senses the water ONLY through the 64x64 compute probe (x, z, d,
// foam, wet) and the eikonal travel-time table exposed by the page. It proves:
//   1. BOOTS  — WebGPU adapter + device, zero console/WGSL errors, rAF on.
//   2. RULES  —
//     · swash oscillates (waterline runs up and back)
//     · uprush faster than backwash — best-of-3 windows (#721-B: gentle look
//       approved; steady asymmetry is phase luck on this bathymetry)
//     · wet band lags the waterline (drying memory) and never sits below it
//     · GPU depth > 0 at sea, ~0 above the wet line, thin sheet behind the
//       advancing waterline
//     · breaker foam exists AND persists on dry sand after backwash (advected
//       foam with decay, not an analytical line)
//     · depth field varies in time
//     · refraction: travel time grows shoreward and crest tilt (|dT/dz|/|dT/dx|)
//       INCREASES toward shore — Snell bending, from the shipped T table
//     · waterline coherent alongshore (no per-column sawtooth)
//   3. WINS   — golden-hour sky, foam pixels, warm sand, camera moves the world.
//   4. SPEED  — steady-state frame time at the worst-case window under --max-ms.
//   5. PROFILE (#702) — a 390x844 touch viewport auto-picks the lite grid +
//     rs<1 at startup; ?lite=0 overrides it back to full quality.
//   + static: no var<uniform> array of f32/vec2/vec3 (Safari standard layout).
//
// Chrome is launched DIRECTLY with --enable-unsafe-swiftshader (playwright's
// stock switches hide navigator.gpu; same recipe as oceancheck).
//
// Usage:
//   node scripts/shorecheck.mjs [--file <path>] [--json] [--shots <dir>] [--strip] [--max-ms 20]
// --shots writes view-a.png / view-b.png; --strip adds strip.png + waveframes/.
// Proven-fail mutant: zero the inlet sponge (`k3 ... * 0.4` -> `* 0.0`) ->
// swash oscillation, asymmetry, sea-depth and vary-in-time checks go red.
// Second mutant (#660): declare the sim uniform as `array<f32, 4>` again ->
// the uniform-stride check goes red (Chrome accepts it, Safari rejects it).

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
const file = resolve(ROOT, opt('--file', 'public/demos/shore.html'))
const shots = opt('--shots', null)
const wantStrip = args.includes('--strip')
const maxMs = +opt('--max-ms', 120)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9378')
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

// --- minimal PNG encode (8-bit RGBA, filter 0) ---
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

function analyze(img, yFrom, yTo, pred) {
  let n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      if (pred(img.px[i], img.px[i + 1], img.px[i + 2])) n++
    }
  }
  return n
}
const meanLum = (img, yFrom, yTo) => {
  let s = 0, n = 0
  for (let y = yFrom; y < yTo; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * img.bpp
      s += img.px[i] + img.px[i + 1] + img.px[i + 2]; n += 3
    }
  }
  return s / n
}

const xsC = z => 84 + 9 * Math.sin(z * 0.043 + 1.7) + 3.5 * Math.sin(z * 0.12 + 0.6)
const bedC = (x, z) => 0.052 * (x - xsC(z)) - 0.16 * Math.exp(-Math.pow((x - xsC(z) + 9) / 5, 2))

// Safari/WebGPU enforces uniform standard layout (16-byte array strides);
// Chrome only passes because it accepts the uniform_buffer_standard_layout
// exception. A `var<uniform>` (or any struct it binds) holding an array of
// f32/vec2/vec3 breaks on iPad (#660), so catch it statically.
function uniformStrideOffenders(src) {
  const bad = []
  for (const m of src.matchAll(/var<uniform>\s*\w+\s*:\s*([\w]+(?:\s*<[^;]*>)?)/g)) {
    const t = m[1].replace(/\s+/g, '')
    if (/^array<(f32|f16|vec2f?|vec3f?)[,>]/.test(t)) bad.push(`var<uniform> : ${t}`)
    const sm = src.match(new RegExp(`struct\\s+${t}\\s*\\{([\\s\\S]*?)\\};`))
    if (sm) for (const mm of sm[1].matchAll(/(\w+)\s*:\s*(array<\s*(?:f32|f16|vec2f?|vec3f?)[^>]*>)/g))
      bad.push(`struct ${t}.${mm[1]}: ${mm[2].replace(/\s+/g, '')}`)
  }
  return bad
}

async function main() {
  const offenders = uniformStrideOffenders(readFileSync(file, 'utf8'))
  ok('uniform buffers obey 16-byte stride (Safari #660)', offenders.length === 0, offenders.join(' | '))

  const chrome = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/shorecheck-profile`, 'about:blank',
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
    page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('WGSL'))) errs.push('console: ' + m.text().split('\n')[0]) })

    await page.goto(url, { waitUntil: 'load' })

    // 1. boots
    let ready = true
    try { await page.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: WebGPU + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__shoreTest.frames > 10))

      // wiring tripwires: ping-pong parity + sim grid sane
      const gr = await page.evaluate(() => window.__shoreTest.grid())
      ok('sim grid wired (2D swash grid, even substeps)',
        gr.ns >= 2 && gr.ns % 2 === 0 && gr.sx1 > gr.sx0 && gr.sz1 > gr.sz0 && gr.n > 10000 && gr.dx > 0.1 && gr.dx < 1.2,
        `dx=${gr.dx} cells=${gr.n} ns=${gr.ns}`)

      // refraction: from the shipped travel-time table — T grows shoreward, and
      // the crest tilt |dT/dz|/|dT/dx| increases toward shore (Snell bending).
      const refr = await page.evaluate(() => {
        const T = window.__shoreTest
        const cols = [-45, -20, 5, 30, 55]
        let mono = 0, tot = 0
        for (const z of cols) {
          const t1 = T.ttAt(0, 45, z), t2 = T.ttAt(0, 90, z)
          tot++; if (isFinite(t1) && isFinite(t2) && t2 > t1 + 1) mono++
        }
        const tilt = x => {
          let best = 0
          for (const z of [-55, -30, -5, 20, 45]) {
            const gx = (T.ttAt(0, x + 2, z) - T.ttAt(0, x - 2, z)) / 4
            const gz = (T.ttAt(0, x, z + 2) - T.ttAt(0, x, z - 2)) / 4
            best = Math.max(best, Math.abs(gz) / Math.max(Math.abs(gx), 1e-6))
          }
          return best
        }
        return { mono, tot, tiltOff: tilt(42), tiltNear: tilt(88) }
      })
      ok('travel time grows shoreward', refr.mono === refr.tot, `${refr.mono}/${refr.tot}`)
      ok('crests bend toward the shore (Snell)', refr.tiltNear > refr.tiltOff * 1.5 && refr.tiltNear > 0.15,
        `tilt offshore ${refr.tiltOff.toFixed(2)} -> near ${refr.tiltNear.toFixed(2)}`)

      // 2. rules — swash trace over ~13.5 s (> one 7.4 s swell period), all
      // read from the GPU probe columns.
      const trace = []
      for (let i = 0; i < 180; i++) {
        trace.push(await page.evaluate(() => window.__shoreTest.swashMean()))
        await page.waitForTimeout(150)
      }
      // headless runs the sim at ~0.7 real-time and the setup settles after a
      // few seconds: skip the warm-up so gates see the steady state.
      const traceS = trace.slice(12)
      const runsRaw = traceS.map(s => s.run)
      const runs = runsRaw.map((_, i) => {
        const w = runsRaw.slice(Math.max(0, i - 1), i + 2)
        return w.reduce((a, b) => a + b, 0) / w.length
      })
      const mn = Math.min(...runs), mx = Math.max(...runs)
      let peaks = 0
      for (let i = 2; i < runs.length - 2; i++) {
        if (runs[i] >= runs[i - 1] && runs[i] > runs[i - 2] && runs[i] >= runs[i + 1] && runs[i] > runs[i + 2] && runs[i] - mn > 0.35) peaks++
      }
      ok('swash oscillates (peak + range, not drift)', peaks >= 1 && mx - mn > 0.9, `run ${mn.toFixed(2)}…${mx.toFixed(2)} m peaks=${peaks}`)

      // asymmetry — #721 (Jon's decision B, 2026-10-23): keep the approved
      // gentle look. Physics note: with honest dt and the bore cap left where the
      // approved ~1.8 m run-up needs it, uprush-vs-backwash asymmetry is *phase
      // luck* on this bathymetry — replica sweeps show ratio >1.15 in only 1–2
      // of 4 time windows, and widening the bore cap to make it steady doubles
      // the run-up range (~4–7 m vs approved ~1.8 m). So the gate is best-of-3
      // windows: the trace is split into three swell-length windows, each scored
      // on its own local extremes, and the best window decides. A broken sim
      // (e.g. zeroed inlet sponge) kills the asymmetry in EVERY window.
      const winScore = (seq) => {
        let best = null
        for (let p = 2; p < seq.length - 2; p++) {
          if (seq[p] <= seq[p - 1] || seq[p] <= seq[p + 1]) continue
          let a = p
          while (a > 0 && seq[a] > seq[a - 1]) a--
          let b = p
          while (b < seq.length - 1 && seq[b] > seq[b + 1]) b++
          const rise = seq[p] - seq[a], fall = seq[p] - seq[b]
          if (rise < 0.35 || fall < 0.35) continue
          const cand = { vUp: rise / ((p - a) * 0.15 || 0.15), vDn: fall / ((b - p) * 0.15 || 0.15) }
          if (!best || cand.vUp / cand.vDn > best.vUp / best.vDn) best = cand
        }
        return best
      }
      const W = Math.floor(runs.length / 3)
      const wins = []
      for (let k = 0; k < 3; k++) {
        const s = winScore(runs.slice(k * W, k === 2 ? runs.length : (k + 1) * W))
        if (s) wins.push(s)
      }
      const passing = wins.filter(s => s.vUp > s.vDn * 1.15 && s.vUp > 0.1).length
      const best = wins.length ? wins.reduce((a, b) => (b.vUp / b.vDn > a.vUp / a.vDn ? b : a)) : null
      ok('uprush faster than backwash (best-of-3 windows, #721)',
        passing >= 1,
        best ? `${passing}/3 windows pass · best vUp=${best.vUp.toFixed(2)} vDn=${best.vDn.toFixed(2)} m/s` : 'no scoreable window in trace')

      const lagPeak = Math.max(...trace.map(s => s.wetLag))
      ok('wet band lags the waterline (drying memory)', lagPeak > 0.5, `peak lag ${lagPeak.toFixed(2)} m`)

      // paired probe readback
      const pickProbe = async () => {
        let pr = null
        for (let i = 0; i < 14; i++) {
          pr = await page.evaluate(() => window.__shoreTest.probeNow())
          if (pr && pr.data) {
            let sc = 0
            for (let k = 0; k < 96 * 64; k++) {
              const x = pr.data[k * 5], z = pr.data[k * 5 + 1], d = pr.data[k * 5 + 2]
              if (bedC(x, z) > 0.02 && x < xsC(z) - 0.5 && d > 0.015) sc++
            }
            if (sc >= 2) return pr
          }
        }
        return pr
      }
      const pr = await pickProbe()
      if (!pr || !pr.data) {
        ok('probe readback available', false, 'probeNow() returned null')
      } else {
        let sea = 0, seaOk = 0, dry = 0, dryOk = 0, sheet = 0, sheetOk = 0
        let foamCells = 0, foamMax = 0, dryFoam = 0
        const colX = new Array(64).fill(null), colWet = new Array(64).fill(null)
        for (let j = 0; j < 64; j++) {
          for (let i = 0; i < 96; i++) {
            const k = (j * 96 + i) * 5
            const x = pr.data[k], z = pr.data[k + 1], d = pr.data[k + 2], f = pr.data[k + 3], wet = pr.data[k + 4]
            if (d > 0.02) colX[j] = x
            if (wet > 0.45) colWet[j] = x
            const bed = bedC(x, z)
            if (f > 0.4) foamCells++
            if (f > foamMax) foamMax = f
            if (d < 0.01 && bed > 0.02 && f > 0.15) dryFoam++
            if (bed < -0.05) { sea++; if (d > 0.02) seaOk++ }
          }
          for (let i = 0; i < 96; i++) {
            const k = (j * 96 + i) * 5
            const x = pr.data[k], z = pr.data[k + 1], d = pr.data[k + 2]
            const wl = colX[j]
            if (wl !== null && x > wl + 1.5 && bedC(x, z) > 0.02) { dry++; if (d < 0.03) dryOk++ }
            if (wl !== null && x < wl - 1.0 && bedC(x, z) > 0.02) { sheet++; if (d > 0.01) sheetOk++ }
          }
        }
        ok('GPU depth > 0 across the sea cells', seaOk > sea * 0.9, `${seaOk}/${sea}`)
        ok('GPU depth ~0 above the wet line', dryOk > dry * 0.9, `${dryOk}/${dry}`)
        ok('thin sheet behind the waterline', sheet >= 2 && sheetOk >= 2 && sheetOk >= sheet * 0.5, `${sheetOk}/${sheet}`)
        ok('breaker foam present on GPU field', foamCells >= 6 && foamMax > 0.6, `cells=${foamCells} max=${foamMax.toFixed(2)}`)
        ok('foam persists on dry sand (advected, not analytical)', dryFoam >= 4, `${dryFoam} dry+foam cells`)

        const wlErr = colX.filter((x, j) => x !== null && colWet[j] !== null && colWet[j] < x - 0.6).length
        ok('wet limit never below the waterline', wlErr === 0, `${wlErr} bad columns`)

        let dzs = 0, dzn = 0
        for (let j = 1; j < 64; j++) if (colX[j] !== null && colX[j - 1] !== null) { dzs += Math.abs(colX[j] - colX[j - 1]); dzn++ }
        const dz = dzs / Math.max(1, dzn)
        ok('waterline coherent alongshore (no sawtooth)', dz < 1.2, `mean|Δx|=${dz.toFixed(2)} m/column (${(120 / 63).toFixed(2)} m spacing)`)

        await page.waitForTimeout(2500)
        const pr2 = await page.evaluate(() => window.__shoreTest.probeNow())
        let dDelta = 0
        if (pr2 && pr2.data) for (let i = 0; i < 96 * 64; i++) dDelta += Math.abs(pr2.data[i * 5 + 2] - pr.data[i * 5 + 2])
        ok('depth field varies in time', dDelta / (96 * 64) > 0.004, `mean|Δd|=${(dDelta / 6144).toFixed(4)}`)
      }

      // 3. wins — golden-hour look + camera reacts
      await page.evaluate(() => window.__shoreTest.setPose({ pos: [48, 3.0, -18], yaw: -0.55, pitch: -0.15 }))
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const imgA = decodePng(bufA)
      const skyWarm = meanLum(imgA, 0, Math.floor(imgA.h * 0.22)) > 110
      const foamPix = analyze(imgA, Math.floor(imgA.h * 0.35), imgA.h, (r, g, b) => r > 200 && g > 200 && b > 190 && r - b <= 30)
      const sandPix = analyze(imgA, Math.floor(imgA.h * 0.18), Math.floor(imgA.h * 0.52), (r, g, b) => r > 150 && r < 250 && r - b > 45 && g - b > 15 && g < r)
      ok('golden-hour sky (warm bright top band)', skyWarm, `mean lum=${meanLum(imgA, 0, Math.floor(imgA.h * 0.22)).toFixed(0)}`)
      ok('foam visible', foamPix > 800, `${foamPix} foam px`)
      ok('warm sand visible', sandPix > 4000, `${sandPix} sand px`)

      let ui = '0'
      for (let i = 0; i < 14; i++) {
        const v = await page.evaluate(() => document.getElementById('runLbl').textContent)
        if (parseFloat(v) > parseFloat(ui)) ui = v
        await page.waitForTimeout(200)
      }
      ok('HUD reports live run-up', parseFloat(ui) > 0.3, `runLbl=${ui}m`)

      let foamUi = 0
      for (let i = 0; i < 10; i++) {
        const v = parseFloat(await page.evaluate(() => document.getElementById('foamLbl').textContent))
        if (v > foamUi) foamUi = v
        await page.waitForTimeout(250)
      }
      ok('HUD reports live foam cover', foamUi > 0, `foamLbl=${foamUi}%`)

      await page.evaluate(() => window.__shoreTest.setPose({ pos: [48, 3.0, -18], yaw: -1.62, pitch: -0.10 }))
      await page.waitForTimeout(1200)
      const bufB = await page.screenshot()
      const imgB = decodePng(bufB)
      let d = 0
      for (let i = 0; i < Math.min(imgA.px.length, imgB.px.length); i += 64) d += Math.abs(imgA.px[i] - imgB.px[i])
      ok('camera pose changes the world', d / (imgA.px.length / 64) > 8, `mean|Δ|=${(d / (imgA.px.length / 64)).toFixed(1)}`)

      // #544 — into-sun sun-path must sparkle (glitter), not smear into a
      // clipped-white river. Grazing into-sun view: the path is a true
      // specular lobe on the REFLECTED direction broken by moving ripples
      // (OCEAN's sea); the old Blinn-Phong halfway-vector lobe painted one
      // solid white band. Sense it the way a human does — a sparkly path has
      // many bright local maxima and little near-constant clipped white.
      await page.evaluate(() => window.__shoreTest.setPose({ pos: [48, 1.4, -18], yaw: -1.75, pitch: -0.05 }))
      await page.waitForTimeout(1200)
      const imgS = decodePng(await page.screenshot())
      const y0s = Math.floor(imgS.h * 0.45)
      const Ls = new Float32Array(imgS.w * imgS.h)
      let ns = 0, nearWhiteS = 0, sparkleS = 0
      for (let y = y0s; y < imgS.h; y++) for (let x = 0; x < imgS.w; x++) {
        const i = (y * imgS.w + x) * imgS.bpp
        const r = imgS.px[i], g = imgS.px[i + 1], b = imgS.px[i + 2]
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
        Ls[y * imgS.w + x] = l
        if (y === y0s || x === 0 || x === imgS.w - 1) continue
        ns++
        const sat = Math.max(r, g, b) - Math.min(r, g, b)
        if (l > 200 && sat < 30) nearWhiteS++
        if (l > 140) {
          let isMax = true
          for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            if (Ls[(y + dy) * imgS.w + x + dx] >= l) { isMax = false; break }
          }
          if (isMax) sparkleS++
        }
      }
      const nearPctS = 100 * nearWhiteS / ns
      ok('into-sun sun-path sparkles, no clipped-white smear (#544)',
        sparkleS > 25000 && nearPctS < 4.2,
        `sparkle=${sparkleS} nearWhite=${nearPctS.toFixed(1)}%`)

      let sawBig = false
      for (let i = 0; i < 60 && !sawBig; i++) {
        if (await page.evaluate(() => document.getElementById('setLbl').textContent) === 'BIG') sawBig = true
        else await page.waitForTimeout(250)
      }
      ok('wave-set label catches a BIG set', sawBig)

      if (shots) {
        mkdirSync(shots, { recursive: true })
        writeFileSync(resolve(shots, 'view-a.png'), bufA)
        writeFileSync(resolve(shots, 'view-b.png'), bufB)
      }

      if (wantStrip) {
        const dir = shots || 'docs/shots/shore'
        mkdirSync(resolve(dir, 'waveframes'), { recursive: true })
        let prevRun = await page.evaluate(() => window.__shoreTest.swashMean().run)
        for (let i = 0; i < 120; i++) {
          await page.waitForTimeout(120)
          const r = await page.evaluate(() => window.__shoreTest.swashMean().run)
          if (r > 0.8 && r > prevRun + 0.12) break
          prevRun = r
        }
        const frames = [], raws = []
        for (let i = 0; i < 9; i++) {
          const b = await page.screenshot()
          raws.push(b); frames.push(decodePng(b))
          await page.waitForTimeout(550)
        }
        frames.forEach((f, i) => writeFileSync(resolve(dir, 'waveframes', `f${i}.png`), raws[i]))
        const TW = 320, TH = 180
        const grid = Buffer.alloc(TW * 3 * TH * 3 * 4)
        for (let n = 0; n < 9; n++) {
          const f = frames[n], ox = (n % 3) * TW, oy = Math.floor(n / 3) * TH
          for (let y = 0; y < TH; y++) {
            for (let x = 0; x < TW; x++) {
              const si = (Math.floor(y * f.h / TH) * f.w + Math.floor(x * f.w / TW)) * f.bpp
              const di = ((oy + y) * TW * 3 + ox + x) * 4
              grid[di] = f.px[si]; grid[di + 1] = f.px[si + 1]; grid[di + 2] = f.px[si + 2]; grid[di + 3] = 255
            }
          }
        }
        writeFileSync(resolve(dir, 'strip.png'), encodePng(TW * 3, TH * 3, grid))
      }

      // 4. speed — full-window frame budget (canvas caps at 1600x1000).
      // Headless Chrome may fall back to SwiftShader (software): the hardware
      // budget is impossible there and meaningless, so detect the renderer via
      // WebGL and gate against the software budget instead.
      const renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
        if (!g) return 'none'
        const dbg = g.getExtension('WEBGL_debug_renderer_info')
        return dbg ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked'
      })
      const soft = /swiftshader|llvmpipe|software/i.test(renderer)
      const budget = soft ? +opt('--max-ms-sw', 160) : maxMs
      await page.setViewportSize({ width: 1600, height: 1000 })
      await page.waitForTimeout(1500)
      await page.evaluate(() => window.__shoreTest.resetPerf())
      let perf = await page.evaluate(() => window.__shoreTest.perf())
      for (let i = 0; i < 24 && perf.n < 60; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__shoreTest.perf())
        if (perf.n >= 30 && perf.avg > maxMs) break
      }
      ok(`frame time under ${budget} ms at full window (1600x1000, ${soft ? 'software raster' : 'hardware'})`,
        perf.n >= 60 && perf.avg <= budget, `avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)

      // 4b. retina speed — the dpr-2 path is where Safari choked (dpr cap 2 +
      // MSAA 4 = 25.6M shaded samples/frame). Gate only on hardware: a GPU
      // pixel budget on SwiftShader measures the raster, not the scene.
      if (!soft) {
        const rctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
        const rpage = await rctx.newPage()
        await rpage.goto(url + '?v=' + Date.now(), { waitUntil: 'load' })
        await rpage.waitForFunction(() => window.__shoreTest && window.__shoreTest.perf().n > 40, null, { timeout: 30000 })
        await rpage.evaluate(() => window.__shoreTest.resetPerf())
        let rperf = await rpage.evaluate(() => window.__shoreTest.perf())
        for (let i = 0; i < 24 && rperf.n < 60; i++) {
          await rpage.waitForTimeout(250)
          rperf = await rpage.evaluate(() => window.__shoreTest.perf())
          if (rperf.n >= 30 && rperf.avg > maxMs) break
        }
        const cw = await rpage.evaluate(() => [document.querySelector('canvas').width, document.querySelector('canvas').height])
        ok(`retina (dpr2) frame time under ${budget} ms — canvas caps at dpr 1.5`,
          rperf.n >= 60 && rperf.avg <= budget && cw[0] <= 2400,
          `avg=${rperf.avg}ms max=${rperf.max}ms over ${rperf.n} frames, canvas ${cw.join('x')}`)
        await rctx.close()
      }
    }

          // #702 phone profile: a phone-sized touch viewport boots LITE with a
      // sub-1 blit by default; ?lite=0 forces full quality back. Runs LAST of
      // the sim gates: booting a second WebGPU context heats the software
      // raster and its residual contention compresses the swash trace window
      // (an earlier placement flipped the uprush/backwash ratio to noise).
      const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true })
      const ppage = await pctx.newPage()
      let pg = null, phr = null, fg = null, fr = null
      try {
        await ppage.goto(url, { waitUntil: 'load' })
        await ppage.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 })
        await ppage.waitForFunction(() => window.__shoreTest.perf().n > 5, null, { timeout: 15000 })
        pg = await ppage.evaluate(() => window.__shoreTest.grid())
        phr = await ppage.evaluate(() => window.__shoreTest.perf())
      } catch { /* the gate below goes red */ }
      ok('phone viewport auto-picks lite grid + reduced rs (#702)',
        !!pg && !!pg.auto && !!pg.lite && pg.n < 20000 && !!phr && phr.rs < 1,
        pg ? `n=${pg.n} rs=${phr && phr.rs}` : 'phone boot failed')
      try {
        await ppage.goto(url + '?lite=0', { waitUntil: 'load' })
        await ppage.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 })
        await ppage.waitForFunction(() => window.__shoreTest.perf().n > 5, null, { timeout: 15000 })
        fg = await ppage.evaluate(() => window.__shoreTest.grid())
        fr = await ppage.evaluate(() => window.__shoreTest.perf())
      } catch { /* the gate below goes red */ }
      await pctx.close()
      ok('?lite=0 overrides the phone profile (full grid, rs 1)',
        !!fg && !fg.lite && fg.n > 40000 && !!fr && fr.rs >= 1,
        fg ? `n=${fg.n} rs=${fr && fr.rs}` : 'phone boot failed')

      // #702 lifecycle: a WebGPU demo must stop submitting when the page is
      // hidden and must release the device on teardown, so a backgrounded or
      // closing SHORE tab stops pinning GPU + memory (Jon: slow to switch apps /
      // close the tab, and "gets slower the longer it runs"). Uses its own
      // context so a device-lost hiccup never contaminates the main page's
      // error counter. Runs after the phone profile so its contention can't
      // touch the swash trace window.
      const lerrs = []
      const lctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
      const lpage = await lctx.newPage()
      lpage.on('pageerror', e => lerrs.push(String(e)))
      lpage.on('console', m => { if (m.type() === 'error') lerrs.push(m.text()) })
      try {
        await lpage.goto(url, { waitUntil: 'load' })
        await lpage.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 })
        await lpage.waitForFunction(() => window.__shoreTest.perf().n > 5, null, { timeout: 15000 })
        ok('loop is running when visible (#702)',
          await lpage.evaluate(() => window.__shoreTest.running && window.__shoreTest.frames > 5))

        await lpage.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await lpage.waitForTimeout(700)
        const frozen1 = await lpage.evaluate(() => window.__shoreTest.frames)
        const frozenRun = await lpage.evaluate(() => window.__shoreTest.running)
        await lpage.waitForTimeout(700)
        const frozen2 = await lpage.evaluate(() => window.__shoreTest.frames)
        ok('render loop pauses when the page is hidden (#702)',
          frozenRun === false && frozen2 === frozen1,
          `hidden: running=${frozenRun} frames ${frozen1}->${frozen2}`)

        await lpage.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await lpage.waitForTimeout(900)
        const resumed = await lpage.evaluate(() => ({ run: window.__shoreTest.running, f: window.__shoreTest.frames, sp: window.__shoreTest.perf() }))
        ok('render loop resumes when the page is visible again (#702)',
          resumed.run === true && resumed.f > frozen2,
          `resumed: running=${resumed.run} frames ${frozen2}->${resumed.f}`)

        const td = await lpage.evaluate(() => {
          try { window.__shoreTest.teardown() } catch (e) { return { err: String(e) } }
          return { err: null }
        })
        await lpage.waitForTimeout(400)
        const post = await lpage.evaluate(() => {
          window.__shoreTest.resume()
          return { released: window.__shoreTest.released, run: window.__shoreTest.running, f: window.__shoreTest.frames }
        })
        ok('teardown releases the GPU and is terminal (#702)',
          td.err === null && post.released === true && post.run === false,
          `teardown err=${td.err} released=${post.released} runAfterResume=${post.run}`)
        ok('lifecycle (hide/resume/teardown) raises no GPU errors (#702)',
          lerrs.length === 0, lerrs.slice(0, 2).join(' | '))
      } catch (e) {
        ok('render loop pauses when the page is hidden (#702)', false, `lifecycle page failed: ${e}`)
      } finally {
        await lctx.close()
      }

    // #702 slice B: ?diag=1 copy-report overlay — Jon pastes a real-device
    // report (browser+GPU, settings, 10s frame times + hitches, per-pass GPU
    // ms where allowed, camera pose) instead of reading numbers off a phone.
    const dctx = await browser.newContext({ viewport: { width: 960, height: 540 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const dpage = await dctx.newPage()
    const derr = []
    dpage.on('pageerror', e => derr.push(String(e)))
    try {
      await dpage.goto(url + '?diag=1', { waitUntil: 'load' })
      await dpage.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 })
      await dpage.waitForFunction(() => window.__shoreTest.perf().n > 10, null, { timeout: 15000 })
      const ui = await dpage.evaluate(() => {
        const p = document.getElementById('diagPanel')
        return {
          on: window.__shoreTest.diagOn === true,
          panel: !!p && getComputedStyle(p).display !== 'none',
          txt: p ? p.textContent.includes('diag') : false,
          btn: !!document.getElementById('diagCopy'),
        }
      })
      ok('diag=1 shows the copy-report panel (#702)',
        ui.on && ui.panel && ui.txt && ui.btn, JSON.stringify(ui))
      const rep = await dpage.evaluate(() => { try { return JSON.parse(window.__diagReport()) } catch (e) { return { err: String(e) } } })
      const good = !rep.err
        && typeof rep.ua === 'string' && rep.ua.length > 10
        && typeof rep.gpu.tsQuery === 'boolean'
        && rep.settings && rep.settings.rs > 0.5 && rep.settings.rs <= 1 && rep.settings.grid.dx > 0
        && rep.frames && rep.frames.n >= 10 && rep.frames.spanS > 0.3
        && rep.frames.worstMs >= rep.frames.avgMs
        && Array.isArray(rep.cam.pos) && rep.cam.pos.length === 3 && rep.t > 0
      ok('diag report is complete and sane (#702)', good,
        good ? `${rep.frames.n}f avg ${rep.frames.avgMs}ms worst ${rep.frames.worstMs}ms ts=${rep.gpu.tsQuery}` : JSON.stringify(rep).slice(0, 200))
      const cb = await dpage.evaluate(async () => {
        try { await navigator.clipboard.writeText('diag-ok'); return await navigator.clipboard.readText() } catch { return null }
      })
      ok('diag panel clipboard is usable (#702)', cb === 'diag-ok', `clip=${cb}`)
    } catch (e) {
      ok('diag=1 shows the copy-report panel (#702)', false, `diag page failed: ${e}`)
    } finally {
      ok('diag=1 raises no page errors (#702)', derr.length === 0, derr.slice(0, 2).join(' | '))
      await dctx.close()
    }

    ok('zero page/WGSL errors', errs.length === 0, errs.slice(0, 2).join(' | '))
  } finally {
    chrome.kill()
  }

  if (asJson) console.log(JSON.stringify(results, null, 1))
  const failed = results.filter(r => !r.pass)
  if (!asJson) console.log(`\n${results.length - failed.length}/${results.length} green`)
  process.exit(failed.length ? 1 : 0)
}

main()
