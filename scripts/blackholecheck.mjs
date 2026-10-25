// blackholecheck — self-verifying harness for public/demos/blackhole.html (#903).
//
// Proves the black-hole flyby demo:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, zero page errors.
//   2. RULES  — the physics is right, proved numerically AND in pixels:
//     · light bending follows the geodesic u''+u=1.5u^2 (rs=1): the demo's own
//       integrator matches a stiff RK4 reference at b=4/6/10 within a few %,
//       and is monotone in the impact parameter
//     · capture cone: rays with b < b_crit = 2.598 fall in; b > b_crit escape
//     · the far half of the disk is lifted into view above the shadow
//       (gravitational lensing of the disk — the Interstellar halo)
//     · Doppler beaming: approaching side brighter (~delta^3) AND bluer
//   3. PIXELS — shadow, top+bottom halo arcs, warm disk, Doppler left/right
//       asymmetry with colour shift, Keplerian shear motion between frames
//   4. LAW    — self-contained single file; NOT registered in games.js
//               (demos law, Jon 2026-10-19); carries the credits card; the
//               demos index links it.
//   5. PHONE  — boots clean at 390x844 lite; sharp at dpr2.
//   6. SPEED  — frame budget with software-raster fallback detection
//               (campfire convention; rAF-dt is delivery, fence-busy on the
//               demo side drives its own degradation ladder).
//   7. PROBES (#1047) — tap drops a glowing beacon on a real infalling
//               geodesic: it falls (r↓), slows in observer time (Δr shrinks),
//               reddens + dims (g, g^3 ↓), never crosses (r > rs, fades to
//               black), holds its image while freezing, then retires; pixels
//               prove it lights the shadow; phone quick-tap drops too.
//   8. POLISH (#1074) — the drop sells itself: launch puff ring at spawn,
//               decaying motion trail of solved images, the beacon's own
//               Doppler hue (disk law on its line-of-sight velocity),
//               rim-fade instead of an off-screen pop, rim-wrap on pinned images.
//
// Usage: node scripts/blackholecheck.mjs [--file <path>] [--shots <dir>] [--json] [--max-ms 45]
// Proven-fail mutant: kill Doppler beaming (`pow(dlt, 3.0) * g * g` -> `1.0`)
// -> the left/right pixel asymmetry gate goes red (the disk becomes a
// symmetric ring; the one-side-brighter signature is what makes it a disk in
// orbit, not a halo prop). Second mutant (#1046): paint the photon ring on
// captured rays (`!captured` -> `captured`, glow inside the shadow) -> the
// ring-bounded + interior-black gates go red. Third mutant (#1047): skip the
// beacon HDR pass (`if (probes.length)` -> `if (false)`) -> the newly-lit
// pixels gate goes red while every physics gate stays green (the probe is
// simulated, not painted). Fourth mutant (#1074): empty the trail buffer each
// frame (`if (pr.trail.length > TRAIL_MAX) pr.trail.shift()` ->
// `pr.trail.length = 0`) -> the trail gate goes red while physics, pixels and
// the puff gate stay green (the trail is a real record of solved images).

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
const file = resolve(ROOT, opt('--file', 'public/demos/blackhole.html'))
const shots = opt('--shots', null)
const maxMs = +opt('--max-ms', 45)
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1) }
const url = 'file://' + file
const PORT = opt('--port', '9386')
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

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law, Jon 2026-10-19)', !/path:\s*['"]\/[^'"]*blackhole|label:\s*['"]Black Hole/i.test(reg))
  ok('exposes __holeTest DEV hook', /__holeTest/.test(src))
  ok('geodesic equation in the tracer (u\x27\x27 + u = 1.5*RS*u^2)', /-u \+ 1\.5 \* RS \* u \* u/.test(src))
  ok('capture cone uses b_crit = 2.598 rs', /B_CRIT = 2\.598/.test(src))
  ok('Doppler beaming implemented (delta = 1/(gamma(1-beta cos)) with I ~ delta^3)',
    /1\.0 \/ \(gam \* \(1\.0 - beta \* cs\)\)/.test(src) && /pow\(dlt, 3\.0\)/.test(src))
  ok('gravitational redshift sqrt(1 - rs/r) tints the disk', /sqrt\(max\(1\.0 - RS \/ r/.test(src))
  ok('Keplerian shear (Omega ~ r^-3/2) drives disk rotation', /sqrt\(0\.5 \/ \(r \* r \* r\)\)/.test(src))
  ok('photons integrated with RK4 (Euler pumps energy)', /f1 \+ 2\.0 \* f2 \+ 2\.0 \* f3 \+ f4/.test(src))
  ok('photon ring lights escaping rays only — captured rays stay black (#1046)',
    /if \(!captured\)\{[^}]*ring = exp\(-max\(b - B_CRIT[^)]*\)[^}]*\}/.test(src) &&
    !/if \(captured\)\{[^}]*ring/.test(src))
  ok('probe beacon integrates the timelike geodesic with e^2 = f0^2/(f0 - v^2) (#1047)',
    /f0 \* f0 \/ Math\.max\(f0 - v2, 1e-4\)/.test(src) && /pr\.vr \+= ar \* k/.test(src))
  ok('probe light reddens/dims by g^3 on blackbody(T0*g*doppler) (#1047/#1074)',
    /g \* g \* g \* Math\.min\(1, pr\.t/.test(src) && /blackbodyJS\(PROBE_T0 \* probeGlow\(pr\)\.g \* pr\.dlt\)/.test(src))
  ok('probe apparent position solved by null-geodesic miss search (#1047)',
    /const missOf = \(al\)/.test(src) && /phiG = 0\.618/.test(src))
  ok('tap (<300ms, <12px) drops a probe; drags do not (#1047)',
    /performance\.now\(\) - downPt\.t < 300/.test(src) && /Math\.hypot\(e\.clientX - downPt\.x, e\.clientY - downPt\.y\) < 12/.test(src))
  ok('beacons composite additively into HDR so they bloom (#1047)',
    /gl\.blendFunc\(gl\.ONE, gl\.ONE\)/.test(src))
  ok('launch puff: expanding shock ring at spawn + synthesized radio blip (#1074)',
    /puffs\.push\(\{ x: im0\.x/.test(src) && /uniform vec4 uQ\[4\]/.test(src) && /function probeBlip/.test(src))
  ok('beacon leaves a decaying motion trail of solved images (#1074)',
    /TRAIL_MAX = 6/.test(src) && /pr\.trail\.push\(\{ x: im\.x/.test(src) && /Math\.pow\(0\.6,/.test(src))
  ok('beacon carries its own Doppler hue (disk law on its line-of-sight velocity) (#1074)',
    /function probeDopplerHue/.test(src) && /pr\.dlt = probeDopplerHue\(pr, cb\)/.test(src))
  ok('off-screen beacons fade along the rim instead of popping (#1074)',
    /function edgeFade\(nx, ny\)/.test(src) && /const wf = w \* im\.fade/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="blackhole"/.test(idx) && /el: 'blackhole'/.test(idx))
  ok('credits card block present (#674)', /window\.DEMO_CREDITS\s*=/.test(src) && /<script src="credits\.js">/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=/tmp/forge/blackholecheck-profile`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, '/tmp/forge/blackholecheck-profile')
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
    try { await page.waitForFunction(() => window.__holeTest && window.__holeTest.ready, null, { timeout: 25000 }) }
    catch { ready = false }
    ok('boots: WebGL2 + demo init', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(2500)
      ok('frames advancing at rAF', await page.evaluate(() => window.__holeTest.frames > 15))

      // --- numerical physics (JS mirror of the same integrator) ---
      const b4 = await page.evaluate(() => window.__holeTest.bendAt(4))
      const b6 = await page.evaluate(() => window.__holeTest.bendAt(6))
      const b10 = await page.evaluate(() => window.__holeTest.bendAt(10))
      ok('light bending matches GR reference at b=4/6/10 (RK4 anchors)',
        b4.bend > 0.80 && b4.bend < 0.92 && b6.bend > 0.40 && b6.bend < 0.51 && b10.bend > 0.20 && b10.bend < 0.27,
        `b4=${b4.bend} (ref 0.848) b6=${b6.bend} (ref 0.448) b10=${b10.bend} (ref 0.234)`)
      ok('bending decreases monotonically with impact parameter',
        b10.bend < b6.bend && b6.bend < b4.bend, `${b10.bend} < ${b6.bend} < ${b4.bend}`)
      const cap = await page.evaluate(() => window.__holeTest.bendAt(2.4))
      const esc = await page.evaluate(() => window.__holeTest.bendAt(2.8))
      ok('capture cone: b=2.4 falls through the horizon, b=2.8 escapes',
        cap.captured === true && esc.captured === false, `b2.4 captured=${cap.captured} rMin=${cap.rMin}; b2.8 captured=${esc.captured}`)
      const halo = await page.evaluate(() => window.__holeTest.halo())
      ok('far side of the disk is lensed into view (halo ray hits disk above shadow)',
        halo.lifted === true && halo.hits >= 1, JSON.stringify(halo))
      const dop = await page.evaluate(() => window.__holeTest.doppler())
      ok('Doppler factor ratio (approaching/receding, beamed) > 2.5', dop.ratio > 2.5, JSON.stringify(dop))
      const orb = await page.evaluate(() => window.__holeTest.orbit())
      ok('close pass: trajectory plunges to ~7-8 rs mid-loop and recedes past 20 rs',
        orb.min <= 8.2 && orb.max >= 20, JSON.stringify(orb))
      const sf = await page.evaluate(() => ({ rim: window.__holeTest.starFocusAt(2.7), far: window.__holeTest.starFocusAt(9) }))
      ok('Jacobian star magnification switches on at the limb (rim >2x far)',
        sf.rim > 2 && sf.far < 1.2, `rim=${sf.rim} far=${sf.far}`)

      // --- pixels ---
      await page.waitForTimeout(1200)
      const bufA = await page.screenshot()
      const img = decodePng(bufA)
      const W = img.w, H = img.h
      const cx = Math.round(W / 2), cy = Math.round(H / 2)

      let dark = 0, darkBox = 0
      for (let y = cy - 60; y <= cy + 60; y += 2) for (let x = cx - 60; x <= cx + 60; x += 2) {
        if (luma(px(img, x, y)) < 14) { dark++; darkBox++ }
      }
      ok('event-horizon shadow: black disk at screen centre', dark > 700 && dark / darkBox > 0.72,
        `${dark}/${darkBox} centre px below luma 14`)

      let warm = 0, warmCols = new Set(), blueTop = 0, blueBot = 0
      for (let y = 4; y < H - 4; y += 2) for (let x = 4; x < W - 4; x += 2) {
        const [r, g, b] = px(img, x, y)
        if (r > 70 && r - b > 14 && luma([r, g, b]) > 55) { warm++; warmCols.add(Math.floor(x / 96)) }
      }
      ok('warm accretion-disk light spans most of the frame width', warm > 2000 && warmCols.size >= 7,
        `${warm} warm px across ${warmCols.size}/10 sections`)

      const nearShadow = (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < 64 * 64
      for (let x = 4; x < W - 4; x += 2) {
        for (let y = Math.round(H * 0.16); y < Math.round(H * 0.40); y += 2) {
          if (!nearShadow(x, y) && luma(px(img, x, y)) > 45 && px(img, x, y)[0] - px(img, x, y)[2] > 12) blueTop++
        }
        for (let y = Math.round(H * 0.60); y < Math.round(H * 0.84); y += 2) {
          if (!nearShadow(x, y) && luma(px(img, x, y)) > 45 && px(img, x, y)[0] - px(img, x, y)[2] > 12) blueBot++
        }
      }
      ok('lensed disk arcs ABOVE and BELOW the shadow (Interstellar halo, top + bottom)',
        blueTop > 250 && blueBot > 250, `top=${blueTop} bottom=${blueBot} arc px`)

      let L = 0, Ln = 0, R = 0, Rn = 0, lr_ = 0, rr_ = 0
      for (let y = Math.round(H * 0.34); y < Math.round(H * 0.66); y += 2) {
        for (let x = Math.round(W * 0.06); x < Math.round(W * 0.94); x += 2) {
          if (nearShadow(x, y)) continue
          const p = px(img, x, y)
          if (p[0] - p[2] < 10 || luma(p) < 45) continue                 // disk-bright only
          if (x < cx - 20) { L += luma(p); Ln++; lr_ += p[0] - p[2] } else if (x > cx + 20) { R += luma(p); Rn++; rr_ += p[0] - p[2] }
        }
      }
      const lL = L / Math.max(1, Ln), lR = R / Math.max(1, Rn)
      const brightL = lL >= lR
      ok('Doppler beaming in pixels: one disk side >1.4x brighter', (brightL ? lL / Math.max(1, lR) : lR / Math.max(1, lL)) > 1.4,
        `left=${lL.toFixed(1)} right=${lR.toFixed(1)} (n ${Ln}/${Rn})`)
      ok('brighter side runs whiter (less red) — relativistic colour shift',
        (brightL ? rr_ / Math.max(1, Rn) : lr_ / Math.max(1, Ln)) - (brightL ? lr_ / Math.max(1, Ln) : rr_ / Math.max(1, Rn)) > 12,
        `r-b bright=${(brightL ? lr_ / Ln : rr_ / Rn).toFixed(1)} vs dim=${(brightL ? rr_ / Rn : lr_ / Ln).toFixed(1)}`)

      await page.waitForTimeout(700)
      const img2 = decodePng(await page.screenshot())
      let diff = 0, dn = 0
      for (let y = Math.round(H * 0.30); y < Math.round(H * 0.70); y += 3) for (let x = 4; x < W - 4; x += 3) {
        if (nearShadow(x, y)) continue
        diff += Math.abs(luma(px(img, x, y)) - luma(px(img2, x, y))); dn++
      }
      ok('the disk moves (Keplerian shear + turbulence between frames)', diff / dn > 0.8,
        `mean|delta|=${(diff / dn).toFixed(2)} over disk band`)

      await page.evaluate(() => window.__holeTest.setPose({ yaw: 0.5, pitch: -0.2 }))
      await page.waitForTimeout(1400)
      const imgB = decodePng(await page.screenshot())
      let d = 0, n = 0
      for (let y = 0; y < imgB.h; y += 3) for (let x = 0; x < imgB.w; x += 3) {
        const p = px(imgB, x, y), q = px(img, x, y)
        d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n += 3
      }
      ok('camera pose moves the world', d / n > 4, `mean|delta|=${(d / n).toFixed(1)}`)

      // --- probe beacons (#1047) ---
      await page.evaluate(() => window.__holeTest.setPose({ yaw: 0, pitch: 0 }))
      let rr2 = 99
      for (let i = 0; i < 240 && !(rr2 > 6 && rr2 < 9); i++){
        await page.waitForTimeout(250)
        rr2 = await page.evaluate(() => window.__holeTest.flightR)
      }
      const s0 = decodePng(await page.screenshot())
      const W2 = s0.w, H2 = s0.h, cx2 = Math.round(W2 / 2), cy2 = Math.round(H2 / 2)
      await page.mouse.click(cx2, cy2 - 2)
      ok('quick tap drops a beacon', await page.evaluate(() => window.__holeTest.probes().length) === 1)
      ok('launch puff spawns at the drop point (#1074)',
        await page.evaluate(() => window.__holeTest.puffs()) >= 1)
      const ef = await page.evaluate(() => ({
        in: window.__holeTest.edgeFade(0.4, 0.4),
        edge: window.__holeTest.edgeFade(1.08, 0),
        gone: window.__holeTest.edgeFade(1.4, 0),
      }))
      ok('off-screen fade law: full on-frame, partial on the rim, zero past it (#1074)',
        ef.in === 1 && ef.edge > 0.2 && ef.edge < 0.9 && ef.gone === 0, JSON.stringify(ef))
      await page.waitForTimeout(500)
      const s1 = decodePng(await page.screenshot())
      let lit = 0
      for (let y = cy2 - 90; y <= cy2 + 90; y += 2) for (let x = cx2 - 90; x <= cx2 + 90; x += 2) {
        const a = px(s0, x, y), b = px(s1, x, y)
        if (luma(b) - luma(a) > 55 && b[0] >= b[2] - 6) lit++
      }
      ok('the beacon lights new pixels over the shadow (#1047)', lit > 30, `${lit} newly-lit px near centre`)
      const trail = []
      for (let i = 0; i < 24; i++){
        await page.waitForTimeout(1500)
        const ps = await page.evaluate(() => window.__holeTest.probes())
        if (!ps.length) break
        trail.push(ps[ps.length - 1])
        if (ps[ps.length - 1].r < 1.3) break
      }
      const rad = trail.map(p => p.r), gs = trail.map(p => p.g), ws = trail.map(p => p.glow)
      ok('beacon falls: radius strictly decreases (#1047)',
        rad.length >= 5 && rad.every((v, i) => i === 0 || v < rad[i - 1]), rad.map(v => v.toFixed(2)).join('>'))
      const drad = rad.slice(1).map((v, i) => rad[i] - v)
      ok('beacon slows in observer time: coordinate dr/dt shrinks to a crawl (#1047)',
        drad.length >= 4 && drad[drad.length - 1] < 0.6 * drad[0], `first Δr=${drad[0].toFixed(3)} last Δr=${drad[drad.length - 1].toFixed(3)}`)
      ok('beacon reddens and dims: g and g^3 glow strictly decrease (#1047)',
        gs.length >= 5 && gs.every((v, i) => i === 0 || v < gs[i - 1]) &&
        ws.every((v, i) => i === 0 || v < ws[i - 1]) && gs[gs.length - 1] < 0.7,
        `g ${gs[0].toFixed(3)}->${gs[gs.length - 1].toFixed(3)} glow ${ws[0].toFixed(3)}->${ws[ws.length - 1].toFixed(3)}`)
      ok('beacon never crosses the horizon: r stays above rs and fades toward black (#1047)',
        rad.every(v => v > 1.0001) && ws[ws.length - 1] < 0.3, `min r=${Math.min(...rad).toFixed(4)} end glow=${ws[ws.length - 1].toFixed(3)}`)
      const frozen = trail.filter(p => p.vis && p.r < 1.5)
      ok('beacon image holds its screen position while it freezes (#1047)',
        frozen.length >= 2 && Math.max(...frozen.map(p => p.x)) - Math.min(...frozen.map(p => p.x)) < 18 &&
        Math.max(...frozen.map(p => p.y)) - Math.min(...frozen.map(p => p.y)) < 12,
        frozen.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' '))
      let retired = 0
      for (let i = 0; i < 160; i++){
        if ((await page.evaluate(() => window.__holeTest.probes().length)) === 0){ retired = 1; break }
        await page.waitForTimeout(300)
      }
      ok('beacon retires once redshifted below visibility (#1047)', retired === 1)
      ok('beacon accumulates a motion trail of solved images (#1074)',
        trail.some(p => p.trail >= 3), trail.map(p => p.trail).join(','))
      ok('beacon Doppler hue is physical and relaxes as the beacon freezes (#1074)',
        trail.every(p => p.dlt > 0.54 && p.dlt < 1.82) &&
        Math.max(...trail.map(p => p.dlt)) - Math.min(...trail.map(p => p.dlt)) >= 0.15 &&
        trail[trail.length - 1].dlt > trail[0].dlt + 0.1,
        `dlt ${trail.map(p => p.dlt).join(' ')}`)

      // photon ring vs shadow purity (#1046) at a deterministic pose: freeze
      // performance.now so the flyby sits still, then walk 48 radials. A
      // ring-bounded angle = bright line (>60) whose two inner neighbours are
      // shadow-dark (<8) — the visible silhouette of the hole IS the ring.
      // Inside that silhouette must read ~0; the old bug painted glow inside.
      const fctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
      await fctx.addInitScript(() => { const o = performance.now.bind(performance); let base = null; performance.now = () => (base === null ? (base = o()) : base + 2000) })
      const fpage = await fctx.newPage()
      await fpage.goto(url, { waitUntil: 'load' })
      await fpage.waitForFunction(() => window.__holeTest && window.__holeTest.ready, null, { timeout: 25000 })
      await fpage.waitForTimeout(2000)
      const fimg = decodePng(await fpage.screenshot())
      const fW = fimg.w, fH = fimg.h, fcx = Math.round(fW / 2), fcy = Math.round(fH / 2)
      let ringAngles = 0, inMax = 0, ratioFails = 0
      for (let a = 0; a < 48; a++) {
        const th = a / 48 * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th)
        const at = k => { const x = Math.round(fcx + dx * k), y = Math.round(fcy + dy * k)
          return (x > 1 && y > 1 && x < fW - 1 && y < fH - 1) ? luma(px(fimg, x, y)) : -1 }
        let rP = -1, pk = 0
        for (let k = 30; k <= 90; k++) { const l = at(k); if (l > pk && at(k - 2) >= 0 && at(k - 2) < 8) { pk = l; rP = k } }
        if (pk < 60 || rP < 0) continue
        ringAngles++
        for (const f of [0, 0.4, 0.8]) { const l = Math.max(0, at(Math.round(rP * f))); if (l > inMax) inMax = l }
        let iS = 0, iN = 0, oS = 0, oN = 0
        for (let k = rP - 18; k <= rP - 4; k++) { const l = at(k); if (l >= 0) { iS += l; iN++ } }
        for (let k = rP + 4; k <= rP + 18; k++) { const l = at(k); if (l >= 0) { oS += l; oN++ } }
        if (iS / Math.max(1, iN) >= Math.max(4, 0.5 * oS / Math.max(1, oN))) ratioFails++
      }
      ok('shadow silhouette is ring-bounded from outside (#1046)', ringAngles >= 8, `${ringAngles}/48 angles show a bright line backed by dark shadow`)
      ok('shadow interior reads ~0 — no glow painted inside the horizon (#1046)', ringAngles >= 8 && inMax < 12,
        `max luma at 0/0.4/0.8R on ${ringAngles} ring angles = ${inMax.toFixed(1)}`)
      ok('edge brightness decays outward (ring on the escaping side)', ringAngles >= 8 && ratioFails === 0,
        `${ratioFails}/${ringAngles} angles with inside-brighter-than-outside rim`)
      await fctx.close()

      const fBefore = await page.evaluate(() => window.__holeTest.frames)
      await page.waitForTimeout(1500)
      const fAfter = await page.evaluate(() => window.__holeTest.frames)
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
      try { await phone.waitForFunction(() => window.__holeTest && window.__holeTest.ready, null, { timeout: 25000 }) }
      catch { phoneReady = false }
      ok('phone 390x844 boots clean (lite)', phoneReady && errsP.length === 0, errsP[0])
      await phone.evaluate(() => {
        const c = document.getElementById('c')
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 400, bubbles: true }))
        c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 430, bubbles: true }))
      })
      await phone.waitForTimeout(600)
      ok('phone tap-drag steers the look', await phone.evaluate(() => Math.abs(window.__holeTest.pose().yaw) > 0.05))
      await phone.evaluate(() => {
        const c = document.getElementById('c')
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 195, clientY: 420, bubbles: true }))
        c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 195, clientY: 420, bubbles: true }))
      })
      ok('phone quick-tap drops a beacon (#1047)', await phone.evaluate(() => window.__holeTest.probes().length) === 1)
      await pctx.close()

      const ctxR = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 })
      const pageR = await ctxR.newPage()
      await pageR.goto(url, { waitUntil: 'load' })
      let rsReady = true
      try { await pageR.waitForFunction(() => window.__holeTest && window.__holeTest.ready, null, { timeout: 25000 }) }
      catch { rsReady = false }
      const rs = rsReady ? await pageR.evaluate(() => window.__holeTest.renderScale()) : null
      ok('sharp on retina tablet (dpr2 picks the higher render scale)',
        !!rs && rs.retina && rs.scale >= 0.7 && !rs.lite,
        rs ? `scale=${rs.scale} internal=${rs.w}x${rs.h} css=${rs.css}@dpr${rs.dpr}` : 'renderScale unavailable')
      await ctxR.close()

      // speed: software raster gets its own budget (campfire convention). A
      // "hardware" renderer whose rAF-dt is huge while the demo's fence never
      // fires busy is a headless sync pipeline — rAF-dt is delivery, not cost
      // (reef lesson), so that case also gets the software budget. On real
      // hardware the gate uses the demo's own numbers: JS work + fence busy.
      const renderer = await page.evaluate(() => {
        const g = document.createElement('canvas').getContext('webgl2')
        if (!g) return 'none'
        const dbg = g.getExtension('WEBGL_debug_renderer_info')
        return dbg ? String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked'
      })
      await page.setViewportSize({ width: 1600, height: 1000 })
      await page.waitForTimeout(1500)
      await page.evaluate(() => window.__holeTest.resetPerf())
      let perf = await page.evaluate(() => window.__holeTest.perf())
      for (let i = 0; i < 40 && perf.n < 45; i++) {
        await page.waitForTimeout(250)
        perf = await page.evaluate(() => window.__holeTest.perf())
      }
      const headlessSync = !/swiftshader|llvmpipe|software/i.test(renderer) && perf.avg > 45 && perf.busy < 1
      const soft = /swiftshader|llvmpipe|software/i.test(renderer) || headlessSync
      const budget = soft ? +opt('--max-ms-sw', 170) : maxMs
      const honest = soft ? perf.avg <= budget : (perf.work <= +opt('--work-ms', 8) && perf.busy <= +opt('--busy-ms', 20))
      ok(`frame cost under budget at 1600x1000 (${soft ? (headlessSync ? 'headless sync pipeline' : 'software raster') : 'hardware'})`,
        perf.n >= 45 && honest, `avg=${perf.avg}ms max=${perf.max}ms work=${perf.work}ms busy=${perf.busy}ms over ${perf.n} frames (${renderer.slice(0, 28)})`)
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
