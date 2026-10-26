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
//   8. PLUNGE (#1048) — the flyby loop ends by actually falling in: r(s) falls
//               monotonically to the horizon, the escape-cone half-angle collapses to 0
//               below the photon sphere, infall Doppler D=sqrt((1+b)/(1-b)) rises
//               (blueshift) before the crossing, pixels show a mostly-dark frame with a
//               bright blue-white centre disc (sky through the shrinking cone), the dark
//               interior fades, and the loop auto-restarts to the flyby with probes cleared.
//   7. PROBES (#1047) — tap drops a glowing beacon on a real infalling
//               geodesic: it falls (r↓), slows in observer time (Δr shrinks),
//               reddens + dims (g, g^3 ↓), never crosses (r > rs, fades to
//               black), holds its image while freezing, then retires; pixels
//               prove it lights the shadow; phone quick-tap drops too.
//   8. POLISH (#1074) — the drop sells itself: launch puff ring at spawn,
//               decaying motion trail of solved images, the beacon's own
//               Doppler hue (disk law on its line-of-sight velocity),
//               rim-fade instead of an off-screen pop, rim-wrap on pinned images.
//   9. SPIN (#1049) — Kerr: separated geodesics prove the physics numerically —
//               horizon/photon-orbit/ISCO radii match GR at a*=0.9, the capture
//               silhouette is asymmetric (prograde < retrograde, >1.4x) and flips
//               with the spin sign while staying symmetric at a=0, co-rotating
//               rays bend >30% more (Lense-Thirring); in pixels the
//               Doppler-beamed bright side reverses when the spin reverses.
//  10. SPIN POLISH (#1082) — the spin sells itself: the disk inner edge truncates
//               to the Kerr prograde ISCO at spin (uniform uRIn, 3 rs at rest),
//               the orbital whistle re-pitches on the frame-dragged Omega
//               (prograde below Keplerian, retrograde above, rising on approach),
//               each toggle records a sub-bass rumble cue with the spin's sign,
//               an on-screen chip cycles the mode for touch players, and the HUD
//               telemetry shows the Kerr radii (a*, r+, photon ring, ISCO,
//               shadow half-widths) only while spinning.
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
// the puff gate stay green (the trail is a real record of solved images). Fifth mutant
// (#1048): pin the plunge beaming uniform (`gl.uniform1f(us('uBeam'), cb.beam)` ->
// `... 1.0`) -> the blue-white centre disc pixel gate goes red while every numeric dive
// gate stays green (the bright blueshifted sky circle is computed physics, not painted).
// Sixth mutant (#1049): drop the frame-shift (xi-a)^2 from the JS mirror's radial
// potential (kerrRr `((xi - a) * (xi - a) + Q)` -> `(xi * xi + Q)`) -> the frame-dragging
// bend gate goes red (and the capture asymmetry breaks) while every Schwarzschild gate
// stays green (the lopsidedness lives in the frame-dragging term, not the horizon size).
// Seventh mutant (#1082): pin the live disk inner edge to its Schwarzschild value
// (`rInNow = spinA === 0 ? R_IN : Math.max(RS * 1.05, kerrNum(Math.abs(spinA)).iscoPro)`
// -> `rInNow = R_IN`) -> the ISCO-truncation gate goes red while every #1049 Kerr
// geodesic and pixel gate stays green (the hot inner rim is a physical truncation
// radius, not a painted brightness boost).
// Eighth mutant (#1077): pin the CMB glow uniform (`gl.uniform1f(us('uGlow'), cb.glow)`
// -> `... 0.0`) -> the CMB-ring pixel gate goes red (ring px -> 0) while dive().glow and
// every physics/audio/HUD gate stay green (the ring is painted by that one uniform in the
// dark interior, not simulated — proven-fail: glow held 0.54, ring dropped to 0).

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
// Per-run profile dir + port: QA lanes run this script concurrently (mini on
// #1077, studio on #1082) and guardChrome's exit cleanup pkill-matches its
// profile dir — a shared name meant one lane killed another's Chrome mid-run.
// The dir must not CONTAIN the old shared path as a substring (pkill -f),
// hence bh-check-<pid>, not blackholecheck-profile-<pid>.
const PROF = `/tmp/forge/bh-check-${process.pid}`
const PORT = opt('--port', String(9386 + (process.pid % 97)))
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
    /if \(!captured && length\(ro\) > 1\.6\)\{[^}]*ring = exp\(-max\(b - B_CRIT[^)]*\)[^}]*\}/.test(src) &&
    !/if \(captured\)\{[^}]*ring/.test(src))
  ok('probe beacon integrates the timelike geodesic with e^2 = f0^2/(f0 - v^2) (#1047)',
    /f0 \* f0 \/ Math\.max\(f0 - v2, 1e-4\)/.test(src) && /pr\.vr \+= ar \* k/.test(src))
  ok('probe light reddens/dims by g^3 on blackbody(T0*g*doppler) (#1047/#1074)',
    /g \* g \* g \* Math\.min\(1, pr\.t/.test(src) && /blackbodyJS\(PROBE_T0 \* probeGlow\(pr\)\.g \* pr\.dlt\)/.test(src))
  ok('probe apparent position solved by null-geodesic miss search (#1047)',
    /const missOf = \(al\)/.test(src) && /phiG = 0\.618/.test(src))
  ok('tap (<300ms, <12px) drops a probe; drags do not (#1047)',
    /performance\.now\(\) - downPt\.t < 300/.test(src) && /Math\.hypot\(e\.clientX - downPt\.x, e\.clientY - downPt\.y\) < 12/.test(src))
  ok('plunge profile r(s) = rs*(1 + (R1/rs-1)*(1-s)^3.5) drives the dive (#1048)',
    /Math\.pow\(1 - s, 3\.5\)/.test(src))
  ok('cone formula sin^2 = 27 M^2 (1-rs/r)/r^2 implemented (#1048)',
    /27 \* 0\.25 \* \(1 - RS \/ r\) \/ \(r \* r\)/.test(src))
  ok('local-tetrad impact parameter b = r*sin(psi)/sqrt(1-rs/r) at the launcher (#1048)',
    /float bb0 = et > 1e-4 \? r0 \* et \/ sqrt\(f00\)/.test(src))
  ok('infall Doppler sqrt((1+b)/(1-b)) beams the escaping sky D^3 and tints blue (#1048)',
    /Math\.sqrt\(\(1 \+ b\) \/ \(1 - b\)\)/.test(src) && /bg \* uBeam \* mix\(vec3\(1\.0\), vec3\(0\.62, 0\.80, 1\.38\), uTint\)/.test(src))
  ok('horizon crossing keeps physics lit — beam capped, not a fade-to-black trick (#1048)',
    /Math\.min\(42, Math\.pow\(D, 3\)\)/.test(src))
  ok('loop restarts after the plunge and clears probes (#1048)',
    /t - cycleBase - diveHold >= CYCLE/.test(src) && /probes = \[\];/.test(src))
  ok('the drone waits to fall while its beacons are still in view (#1048)',
    /probes\.length && cb\.phase === 'orbit'/.test(src))
  ok('the disk recedes from view as the diver falls past it (#1048)',
    /gl\.uniform1f\(us\('uDisc'\), cb\.disc\)/.test(src) && /1 - 1\.15 \* s/.test(src) &&
    /col \+= uDisc \* T \* diskEmission/.test(src))
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
  ok('Kerr separated null geodesics: Bardeen R = P^2 - Del[(xi-a)^2 + Q] (#1049)',
    /P \* P - Del \* \(\(xi - a\) \* \(xi - a\) \+ Q\)/.test(src))
  ok('Kerr launch uses the static-tetrad covariant constants (g_tphi cross term) (#1049)',
    /float E0 = ftt \* pt - ftphi \* pphi;/.test(src) && /float Lz = ftphi \* pt \+ gpp \* pphi;/.test(src))
  ok('Kerr horizon r+ = M + sqrt(M^2 - a^2) gates capture (#1049)',
    /0\.5 \+ sqrt\(max\(0\.25 - ka \* ka, 0\.0\)\)/.test(src) && /0\.5 \+ Math\.sqrt\(Math\.max\(0\.25 - a \* a, 0\)\)/.test(src))
  ok('frame-dragged Keplerian Omega = sqrt(M)/(r^1.5 + a*sqrt(M)) + Lense-Thirring omega (#1049)',
    /sqrt\(0\.5\) \/ \(pow\(r, 1\.5\) \+ aa \* sqrt\(0\.5\)\)/.test(src) && /omL = 2\.0 \* 0\.5 \* aa \* r \/ Ak/.test(src))
  ok('spin toggle: key K + ?spin= URL + uSpin uniform, default Schwarzschild (#1049)',
    /if \(e\.key === 'k' \|\| e\.key === 'K'\)/.test(src) && /qs\.get\('spin'\)/.test(src) && /us\('uSpin'\), spinA\)/.test(src) &&
    /SPIN_Q === null \|\| isNaN\(parseFloat\(SPIN_Q\)\) \? 0 :/.test(src))
  ok('Kerr orbital velocity relative to the ZAMO (v = (Omega-omega)*sqrt(g_phiphi)/lapse) (#1049)',
    /abs\(om - omL\) \* Ak \/ \(r \* r \* sqrt\(max\(Del, 1e-3\)\)\)/.test(src) && /g = r \* sqrt\(max\(Del \/ Ak, 1e-4\)\)/.test(src))
  ok('disk inner edge is a live uniform uRIn used by the mask and both crossing gates (#1082)',
    /uniform float uRIn;/.test(src) && /smoothstep\(uRIn \* 1\.02, uRIn \* 2\.0, r\)/.test(src) &&
    /rr > uRIn && rr < R_OUT/.test(src) && /rDisk > uRIn && rDisk < R_OUT/.test(src) &&
    /gl\.uniform1f\(us\('uRIn'\), rInNow\)/.test(src))
  ok('orbital whistle re-pitches on the frame-dragged Kerr Omega; toggle fires a sub-bass rumble (#1082)',
    /function whineHz\(R, a\)\{[\s\S]{0,200}\+ a \* Math\.sqrt\(0\.5\)/.test(src) &&
    /whineOsc\.frequency\.setTargetAtTime\(whineHz\(R, spinA\)/.test(src) &&
    /function spinRumble\(a\)/.test(src) && /spinRumble\(spinA\)/.test(src))
  ok('on-screen spin chip cycles the same off/prograde/retrograde cycle as K (#1082)',
    /id="spinchip"/.test(src) && /spinChip\.addEventListener\('pointerdown'/.test(src) &&
    /function cycleSpin\(\)\{ applySpin\(spinA === 0 \? SPIN_MAX : spinA > 0 \? -SPIN_MAX : 0\)/.test(src) &&
    /if \(e\.key === 'k' \|\| e\.key === 'K'\) cycleSpin\(\)/.test(src))
  ok('telemetry HUD (a*, r+, photon, ISCO, shadow span) driven by kerrNum + kerrSpan (#1082)',
    /id="telemetry"/.test(src) &&
    /function updateTelemetry\(\)\{[\s\S]{0,400}kerrNum\(Math\.abs\(spinA\)\)[\s\S]{0,200}kerrSpan\(Math\.abs\(spinA\)\)/.test(src))
  ok('plunge audio rides the dive: Doppler pitch + sub swell near the horizon (#1077)',
    /function diveAudio/.test(src) && /diveOsc/.test(src) && /subGainRef\.gain\.setTargetAtTime/.test(src))
  ok('tidal shear stretches the sky disc tangentially as the cone compresses (#1077)',
    /uniform float uShear/.test(src) && /focus \* uShear/.test(src) && /function shearFactor/.test(src))
  ok('singularity CMB ring glows in the dark interior before the loop restart (#1077)',
    /uniform float uGlow/.test(src) && /exp\(-pow\(\(length\(ac\) - 0\.11\) \* 20\.0, 2\.0\)\)/.test(src))
  ok('dive telemetry HUD shows r\/rs, D and cone while falling (#1077)',
    /id="divehud"/.test(src) && /divehudEl\.textContent/.test(src) && /cb\.rcam\.toFixed\(2\)/.test(src) && /cb\.cone\.toFixed\(0\)/.test(src))
  ok('tip-over cue warns in the last 1 s before the loop dives (#1077)',
    /id="tipcue"/.test(src) && /ORBIT_T - tlc/.test(src) && /until >= 0 && until <= 1/.test(src))
  const idx = readFileSync(resolve(ROOT, 'public/demos/index.html'), 'utf8')
  ok('linked from the demos index (card + DEMO_INDEX)', /id="blackhole"/.test(idx) && /el: 'blackhole'/.test(idx))
  ok('credits card block present (#674)', /window\.DEMO_CREDITS\s*=/.test(src) && /<script src="credits\.js">/.test(src))

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    `--user-data-dir=${PROF}`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, PROF)
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

      // --- Kerr spin (#1049): numbers + pixels ---
      const kn = await page.evaluate(() => window.__holeTest.kerrNum(0.45))
      ok('Kerr constants match GR reference at a* = 0.9 (rs=1 units)',
        Math.abs(kn.rPlus - 0.7179) < 0.01 && Math.abs(kn.phPro - 0.779) < 0.02 &&
        Math.abs(kn.phRetro - 1.955) < 0.02 && Math.abs(kn.iscoPro - 1.187) < 0.03 &&
        Math.abs(kn.iscoRetro - 4.354) < 0.05,
        `r+ ${kn.rPlus} ph ${kn.phPro}/${kn.phRetro} isco ${kn.iscoPro}/${kn.iscoRetro}`)
      const sp0 = await page.evaluate(() => window.__holeTest.kerrSpan(0))
      const spP = await page.evaluate(() => window.__holeTest.kerrSpan(0.45))
      const spM = await page.evaluate(() => window.__holeTest.kerrSpan(-0.45))
      ok('shadow is symmetric when Schwarzschild', Math.abs(sp0.left - sp0.right) < 0.02,
        `L=${sp0.left} R=${sp0.right}`)
      ok('D-shaped Kerr shadow: prograde capture radius < retrograde by >1.4x (#1049)',
        spP.pro > 0 && spP.retro > 0 && spP.retro / spP.pro > 1.4, `pro=${spP.pro} retro=${spP.retro}`)
      ok('the asymmetry flips with the spin direction (#1049)',
        Math.abs(spM.left - spP.right) < 0.02 && Math.abs(spM.right - spP.left) < 0.02,
        `+spin L=${spP.left} R=${spP.right} | -spin L=${spM.left} R=${spM.right}`)
      const bp = await page.evaluate(() => window.__holeTest.kerrBends(0.45))
      const bm = await page.evaluate(() => window.__holeTest.kerrBends(-0.45))
      ok('frame dragging: co-rotating ray bends >30% more than counter-rotating (#1049)',
        bp.pro / bp.retro > 1.3 && bm.pro / bm.retro > 1.3,
        `pro=${bp.pro} retro=${bp.retro}`)

      // D-shape in pixels: the dark core centroid shifts, and the shift flips with spin
      await page.evaluate(() => window.__holeTest.setSpin(0))
      await page.waitForTimeout(700)
      const pxS0 = decodePng(await page.screenshot())
      await page.evaluate(() => window.__holeTest.setSpin(0.45))
      await page.waitForTimeout(700)
      const pxSP = decodePng(await page.screenshot())
      await page.evaluate(() => window.__holeTest.setSpin(-0.45))
      await page.waitForTimeout(700)
      const pxSM = decodePng(await page.screenshot())
      await page.evaluate(() => window.__holeTest.setSpin(0))
      const sideBal = img => {
        const cx = Math.round(img.w / 2), cy = Math.round(img.h / 2)
        let l = 0, r = 0
        for (let y = cy - 70; y <= cy + 70; y += 2) for (let x = cx - 300; x <= cx + 300; x += 2) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < 64 * 64) continue
          const p = px(img, x, y)
          if (p[0] - p[2] < 10 || luma(p) < 45) continue
          if (x < cx - 20) l += luma(p); else if (x > cx + 20) r += luma(p)
        }
        return l - r
      }
      const bP = sideBal(pxSP), bM = sideBal(pxSM)
      ok('spin flips the disk orbit: the Doppler-beamed bright side reverses sign (#1049)',
        Math.abs(bP) > 1500 && Math.abs(bM) > 1500 && bP * bM < 0,
        `L-R balance +spin: ${bP.toFixed(0)}  -spin: ${bM.toFixed(0)}`)

      // --- spin polish (#1082): ISCO inner edge, whistle, rumble, chip, telemetry ---
      const rigOff = await page.evaluate(() => { window.__holeTest.setSpin(0); return window.__holeTest.spinRig() })
      const rigP = await page.evaluate(() => { window.__holeTest.setSpin(0.45); return window.__holeTest.spinRig() })
      const rigM = await page.evaluate(() => { window.__holeTest.setSpin(-0.45); return window.__holeTest.spinRig() })
      ok('disk inner edge truncates to the Kerr prograde ISCO at spin, 3 rs when off (#1082)',
        rigOff.rIn === 3 && Math.abs(rigP.rIn - kn.iscoPro) < 0.01 && rigM.rIn === rigP.rIn,
        `off=${rigOff.rIn} +spin=${rigP.rIn} (ISCO ${kn.iscoPro}) -spin=${rigM.rIn}`)
      ok('spin toggle records a rumble cue carrying the new spin direction (#1082)',
        rigOff.rumble === 0 && rigP.rumble === 1 && rigM.rumble === -1,
        `${rigOff.rumble}/${rigP.rumble}/${rigM.rumble}`)
      ok('telemetry HUD lists the Kerr radii while spinning and clears at Schwarzschild (#1082)',
        rigOff.telemetry === '' && rigP.telemetry.includes('a* 0.9') &&
        rigP.telemetry.includes(`r+ ${kn.rPlus}rs`) && rigP.telemetry.includes(`ISCO ${kn.iscoPro}rs`) &&
        rigP.telemetry.includes('shadow'), rigP.telemetry)
      ok('the spin chip mirrors the mode and cycles off -> prograde -> retrograde -> off on tap (#1082)',
        rigOff.chip.includes('off') && rigP.chip.includes('prograde') && rigM.chip.includes('retrograde'),
        rigP.chip)
      await page.evaluate(() => window.__holeTest.setSpin(0))
      const chipCycle = []
      for (let i = 0; i < 3; i++){
        await page.evaluate(() => document.getElementById('spinchip')
          .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
        chipCycle.push(await page.evaluate(() => window.__holeTest.spin().a))
      }
      ok('tapping the chip drives the spin engine, not just the label (#1082)',
        chipCycle[0] === 0.45 && chipCycle[1] === -0.45 && chipCycle[2] === 0, chipCycle.join(','))
      const wh = await page.evaluate(() => ({
        s0: window.__holeTest.whineAt(7.5, 0), sp: window.__holeTest.whineAt(7.5, 0.45),
        sm: window.__holeTest.whineAt(7.5, -0.45), near: window.__holeTest.whineAt(4, 0.45),
        far: window.__holeTest.whineAt(14, 0.45),
      }))
      ok('orbital whistle: frame-dragged Omega detunes prograde below Keplerian and retrograde above; pitch rises on approach (#1082)',
        wh.sp < wh.s0 && wh.sm > wh.s0 && wh.near > wh.far && wh.near / wh.far > 2.4,
        `S=${wh.s0} pro=${wh.sp} retro=${wh.sm} near=${wh.near} far=${wh.far}`)

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
      for (let i = 0; i < 48; i++){
        await page.waitForTimeout(700)
        const ps = await page.evaluate(() => window.__holeTest.probes())
        if (!ps.length) break
        const ph = await page.evaluate(() => window.__holeTest.dive().phase)
        trail.push({ ...ps[ps.length - 1], phase: ph })
        if (ps[ps.length - 1].r < 1.06) break
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
      const frozen = trail.filter(p => p.vis && p.r < 1.5 && p.phase === 'orbit')
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

      // --- the plunge (#1048): fall through the horizon ---
      const pl = await page.evaluate(() => {
        const d = window.__holeTest
        const rs = []
        for (let i = 0; i <= 10; i++) rs.push(d.diveR(i / 10))
        return { rs,
          c145: d.coneAt(1.45), c12: d.coneAt(1.2), c105: d.coneAt(1.05), c101: d.coneAt(1.01), c1: d.coneAt(1),
          b105: d.blueAt(1.05), b12: d.blueAt(1.2), b75: d.blueAt(7.5) }
      })
      ok('dive radius falls monotonically from the flyby exit to the horizon (#1048)',
        pl.rs.every((v, i) => i === 0 || v < pl.rs[i - 1]) && pl.rs[0] < 8 && pl.rs[0] > 6 && pl.rs[10] === 1,
        `r: ${pl.rs[0]} -> ${pl.rs[5]} -> ${pl.rs[10]}`)
      ok('below the photon sphere the sky cone collapses monotonically to zero at the horizon (#1048)',
        pl.c145 > pl.c12 && pl.c12 > pl.c105 && pl.c105 > pl.c101 && pl.c101 > 0 && pl.c1 === 0 &&
        pl.c145 > 80 && pl.c105 < 40,
        `cone(1.45)=${pl.c145}deg (1.2)=${pl.c12} (1.05)=${pl.c105} (1.01)=${pl.c101} (1)=${pl.c1}`)
      ok('infall blueshift D = sqrt((1+b)/(1-b)) rises toward the horizon (#1048)',
        pl.b105 > pl.b12 && pl.b12 > pl.b75 && pl.b105 > 1.9 && pl.b75 > 1.4,
        `D: r7.5=${pl.b75} r1.2=${pl.b12} r1.05=${pl.b105}`)

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 1.5))
      await page.waitForTimeout(200)
      const dv0 = await page.evaluate(() => window.__holeTest.dive())
      ok('after the flyby the camera plunges inward (#1048)',
        dv0.phase === 'dive' && dv0.r < 6 && dv0.r > 1.05 && dv0.beam > 1.5, JSON.stringify(dv0))
      const liveR = []
      for (let i = 0; i < 10; i++){
        await page.waitForTimeout(250)
        liveR.push(await page.evaluate(() => window.__holeTest.dive().r))
      }
      ok('live plunge: radius strictly decreases (#1048)',
        liveR.every((v, i) => i === 0 || v < liveR[i - 1]), liveR.map(v => v.toFixed(2)).join('>'))

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 9 * 0.85))
      await page.waitForTimeout(150)
      const dchk = await page.evaluate(() => window.__holeTest.dive())
      const dimg = decodePng(await page.screenshot())
      const dW = dimg.w, dH = dimg.h, dcx = Math.round(dW / 2), dcy = Math.round(dH / 2)
      let litDisc = 0, blueDisc = 0, darker = 0, tot = 0, core = 0
      for (let y = 0; y < dH; y += 3) for (let x = 0; x < dW; x += 3){
        const p = px(dimg, x, y), L = luma(p)
        tot++
        if (L < 10) darker++
        const dx = x - dcx, dy = y - dcy
        if (dx * dx + dy * dy < 120 * 120 && L > 70){ litDisc++; if (p[2] > p[0] - 4) blueDisc++ }
        if (dx * dx + dy * dy < 60 * 60 && L > 150) core++
      }
      ok('the sky compresses to a bright blue-white disc while the shadow fills the frame (#1048)',
        dchk.phase === 'dive' && dchk.disc < 0.25 && litDisc > 60 && blueDisc > litDisc * 0.6 && core > 40 && darker / tot > 0.5,
        `lit=${litDisc} blueish=${blueDisc} core=${core} dark=${(100 * darker / tot).toFixed(0)}% ${JSON.stringify(dchk)}`)

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 9 + 0.15))
      await page.waitForTimeout(250)
      const dk = await page.evaluate(() => window.__holeTest.dive())
      ok('past the horizon the interior goes dark — r < rs, cone 0, fade out (#1048)',
        dk.phase === 'dark' && dk.inside && dk.cone === 0 && dk.fade < 0.2, JSON.stringify(dk))

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 9 + 1.5))
      await page.waitForTimeout(500)
      const rb = await page.evaluate(() => window.__holeTest.dive())
      ok('the loop fades back to the flyby start (#1048)',
        rb.phase === 'orbit' && rb.r > 15 && rb.fade === 1, JSON.stringify(rb))

      // --- plunge polish (#1077): shear, telemetry HUD, dive audio, CMB ring, tip cue ---
      const sh = await page.evaluate(() => ({ far: window.__holeTest.shearAt(7.5), mid: window.__holeTest.shearAt(2.0), rim: window.__holeTest.shearAt(1.05) }))
      ok('tidal shear grows as the sky disc compresses toward the collapse (#1077)',
        sh.rim > sh.mid && sh.mid > sh.far && sh.rim > sh.far + 0.6,
        `r7.5=${sh.far} r2.0=${sh.mid} r1.05=${sh.rim}`)

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 3))
      await page.waitForTimeout(200)
      const hudOn = await page.evaluate(() => window.__holeTest.diveHud())
      ok('dive telemetry HUD is up mid-plunge with r\/rs, D, cone (#1077)',
        hudOn.visible === true && /r\/rs/.test(hudOn.text) && /D /.test(hudOn.text) && /cone/.test(hudOn.text), JSON.stringify(hudOn))
      await page.evaluate(() => window.__holeTest.jumpTo(30))
      await page.waitForTimeout(200)
      const hudOff = await page.evaluate(() => window.__holeTest.diveHud())
      ok('dive telemetry HUD is hidden during the flyby (#1077)', hudOff.visible === false, JSON.stringify(hudOff))

      await page.evaluate(() => window.__holeTest.jumpTo(20))
      await page.waitForTimeout(200)
      const auOrbit = await page.evaluate(() => window.__holeTest.drone())
      await page.evaluate(() => window.__holeTest.jumpTo(62 + 4))
      await page.waitForTimeout(200)
      const auDive = await page.evaluate(() => window.__holeTest.drone())
      await page.evaluate(() => window.__holeTest.jumpTo(62 + 9.2))
      await page.waitForTimeout(200)
      const auDeep = await page.evaluate(() => window.__holeTest.drone())
      ok('plunge audio: Doppler pitch rises toward the horizon (#1077)',
        auOrbit.dopplerHz === 0 && auDive.dopplerHz > auOrbit.dopplerHz && auDeep.dopplerHz > auDive.dopplerHz && auDeep.dopplerHz > 600,
        `orbit=${auOrbit.dopplerHz}Hz dive=${auDive.dopplerHz}Hz deep=${auDeep.dopplerHz}Hz`)
      ok('plunge audio: sub-bass swells near the horizon (#1077)',
        auOrbit.subSwell === 0 && auDive.subSwell > auOrbit.subSwell && auDeep.subSwell > 0.6,
        `orbit=${auOrbit.subSwell} dive=${auDive.subSwell} deep=${auDeep.subSwell}`)

      await page.evaluate(() => window.__holeTest.jumpTo(62 + 9 + 0.1))
      await page.waitForTimeout(250)
      // read the live glow BEFORE the (slow, software-rendered) screenshot: the
      // screenshot advances the wall-clock sim deep into the dark interior and
      // would otherwise decay the Doppler glow below the gate's threshold.
      const gGlow = await page.evaluate(() => window.__holeTest.dive().glow)
      const gimg = decodePng(await page.screenshot())
      const gW = gimg.w, gH = gimg.h, gcx = Math.round(gW / 2), gcy = Math.round(gH / 2)
      const ringPx = 0.11 * Math.min(gW, gH)
      let gRing = 0, gDark = 0, gTot = 0
      for (let y = 4; y < gH - 4; y += 2) for (let x = 4; x < gW - 4; x += 2){
        const rad = Math.hypot(x - gcx, y - gcy); const L = luma(px(gimg, x, y)); gTot++
        if (L > 38 && Math.abs(rad - ringPx) < 16) gRing++
        if (L < 14) gDark++
      }
      ok('singularity CMB ring glows in the dark interior near the crossing (#1077)',
        gGlow > 0.3 && gRing > 60 && gDark / gTot > 0.6, `glow=${gGlow} ring=${gRing} dark=${(100 * gDark / gTot).toFixed(0)}%`)

      await page.evaluate(() => window.__holeTest.jumpTo(61.55))
      await page.waitForTimeout(200)
      const tipNear = await page.evaluate(() => window.__holeTest.tipCue())
      ok('tip-over cue is live ~1 s before the loop dives (#1077)',
        tipNear.visible === true && tipNear.until > 0 && tipNear.until < 1, JSON.stringify(tipNear))
      await page.evaluate(() => window.__holeTest.jumpTo(60.0))
      await page.waitForTimeout(200)
      const tipFar = await page.evaluate(() => window.__holeTest.tipCue())
      await page.evaluate(() => window.__holeTest.jumpTo(63.0))
      await page.waitForTimeout(200)
      const tipGone = await page.evaluate(() => window.__holeTest.tipCue())
      ok('tip-over cue is quiet well before the tip and gone once diving (#1077)',
        tipFar.visible === false && tipGone.visible === false, `far=${JSON.stringify(tipFar)} diving=${JSON.stringify(tipGone)}`)

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
