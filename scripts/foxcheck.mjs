// foxcheck — self-verifying harness for public/demos/fox.html (RENARD, #2261:
// a procedural red fox at a seamless rotary gallop on golden-hour snow —
// Canvas 2D perspective painter, no libraries).
//
// Proves three things:
//   1. BOOTS  — DEV hook ready, rAF advancing, zero page errors, the scene
//               actually paints (cool dusk sky over warm-bright snow).
//   2. RULES  — the gallop laws: rotary footfall LH·RH·LF·RF, suspension
//               ≈0.3 of stride with every paw airborne, stance paws NEVER
//               slide (ground-frame slip < 1 mm), the 6-stride seam is exact
//               to float noise, the back crack oscillates ±0.04 m+, stance
//               travel stays inside each limb's chord (a planted paw is
//               geometrically reachable), swing paws clear the snow.
//   3. PIXELS — rust coat / white tail tip / dark legs / contact shadow on
//               canvas; the drawn sprite sits where the state says it does;
//               a paw-print trail accumulates behind the runner; spruce
//               silhouettes stand on the horizon; phone viewport boots clean.
//   + DEMO LAW — self-contained page, not registered in games.js, credits
//               card and index entry present.
//
// Proven-fail mutants (run by hand, 2026-11-14, then restored):
//  1. poseAt stance `wx = anchorX(name, n)` -> `wx = anchorX(name, n) + 0.02`
//     (the paw rides with the body): EXACTLY the slip gate goes RED (20 mm),
//     everything else green — the stance lock is load-bearing.
//  2. LEGS LF `c: 0.58` -> `c: 0.30` (fore paw lands right behind the hind
//     pair): EXACTLY the new rotary-timing-signature gate goes RED — the name
//     order is unchanged, which is precisely why the gap pattern is gated and
//     not just the letter order (learning banked from this run).
//  3. flex amplitude `0.050` -> `0`: EXACTLY the arch gate goes RED (0.000),
//     24/25 — the cracking back is provably animated, not painted on.
//
// Usage: node scripts/foxcheck.mjs [--shots <dir>]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/fox'))
mkdirSync(shots, { recursive: true })

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'fox.html'
await requireDevServer(BASE)

let pass = 0, fail = 0
function ok(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  (' + extra + ')' : ''))
  if (cond) pass++; else fail++
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 780 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(45000)
let pageErrors = 0
page.on('pageerror', e => { pageErrors++; console.log('[pageerror]', e.message) })

await page.goto(URL_DEMO + '?lite=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__foxTest && window.__foxTest.ready, null, { timeout: 15000 })

/* ---------------- 1. BOOTS ---------------- */
ok('DEV hook exists', true)
const f1 = await page.evaluate(() => window.__foxTest.frames())
const grown = await page.waitForFunction('window.__foxTest.frames() > ' + (f1 + 20), null, { timeout: 8000 }).then(() => true).catch(() => false)
ok('the sim is live on load (rAF advancing)', grown, 'frames ' + f1 + ' -> ' + await page.evaluate(() => window.__foxTest.frames()))
ok('zero page errors while booting', pageErrors === 0, pageErrors + ' errors')

const lit = await page.evaluate(() => window.__foxTest.countPixels((r, g, b) => r + g + b > 240, 3))
ok('the scene paints (lit samples across the canvas)', lit > 10000, lit + ' lit px')
const skyTop = await page.evaluate(() => window.__foxTest.pixel(590, 40))
ok('dusk sky crown is cool (blue over red)', skyTop[2] > skyTop[0], 'top ' + skyTop)
const groundLo = await page.evaluate(() => window.__foxTest.countPixels((r, g, b) => r + g + b > 560, 7))
ok('bright snow fills the lower field', groundLo > 3000, groundLo + ' bright px')

/* ---------------- 2. RULES (gait law) ---------------- */
await page.evaluate(() => { const t = window.__foxTest; t.reset(); })
const gait = await page.evaluate(() => window.__foxTest.gait())
ok('rotary footfall order LH·RH·LF·RF (a true fox gallop)', gait.order === 'LHRHLFRF', 'saw ' + (gait.order || 'nothing'))
{
  const t = gait.times || []
  const okTimes = t.length === 4 &&
    t[1] - t[0] <= 0.25 && t[1] - t[0] >= 0.04 &&   // hind pair lands close, not simultaneous
    t[2] - t[1] >= 0.30 &&                            // wide gap between hind push and fore landing
    t[3] - t[2] <= 0.25 && t[3] - t[2] >= 0.04 &&   // fore pair close
    (1 - t[3]) + t[0] >= 0.15                        // run-through gap before the next stride
  ok('rotary timing signature: tight pairs, wide inter-pair gap', okTimes, JSON.stringify(t))
}
ok('suspension phase 0.25–0.45 of stride', gait.susp > 0.25 && gait.susp < 0.45, 'susp ' + gait.susp.toFixed(3))

const audit = await page.evaluate(() => window.__foxTest.slipAudit())
ok('stance paws never slide (slip < 1 mm)', audit.slip < 0.001, 'slip ' + (audit.slip * 1000).toFixed(3) + ' mm' + (audit.leg ? ' @' + audit.leg : ''))

const seam = await page.evaluate(() => window.__foxTest.seam())
ok('6-stride loop seam is exact (< 1e-9)', seam < 1e-9, 'seam ' + seam.toExponential(2))

const arch = await page.evaluate(() => window.__foxTest.arch())
ok('back crack: dorsal arch oscillates ≥ 0.08 m peak-to-peak', arch.range >= 0.08, 'range ' + arch.range.toFixed(3) + ' m')

const law = await page.evaluate(() => window.__foxTest.law)
{
  const chordOk = ['LH', 'RH', 'LF', 'RF'].every(nm => law.L * law.durs[nm] <= (nm[0] === 'L' && nm[1] === 'H' || nm === 'RH' ? 0.62 : 0.66))
  ok('stance travel fits inside each limb chord (≤ 0.62/0.66 m)', chordOk, 'hind ' + (law.L * law.durs.LH).toFixed(2) + ' fore ' + (law.L * law.durs.LF).toFixed(2))
  const onsets = ['LH', 'RH', 'LF', 'RF'].map(nm => law.onsets[nm])
  ok('onsets strictly increasing in the gait cycle', onsets.every((v, i) => i === 0 || v > onsets[i - 1]), JSON.stringify(onsets))
}
{
  // swing clearance: at mid-swing every airborne paw sits above the snow
  const clear = await page.evaluate(() => {
    const t = window.__foxTest
    let worst = 1
    for (let i = 0; i < 400; i++) {
      const p = i / 400
      const s = t.stateAt(p)
      for (const nm of ['LH', 'RH', 'LF', 'RF']) {
        const w = s.paws[nm]
        if (!w.stance) {
          // normalise by swing progress — clearance required mid-swing
          const d = ((p - t.law.onsets[nm]) % 1 + 1) % 1
          const u = (d - t.law.durs[nm]) / (1 - t.law.durs[nm])
          if (u > 0.25 && u < 0.75) worst = Math.min(worst, w.z)
        }
      }
    }
    return worst
  })
  ok('mid-swing paws clear the snow (> 40 mm)', clear > 0.04, 'min z ' + (clear * 1000).toFixed(1) + ' mm')
}
{
  const touch = await page.evaluate(() => {
    const t = window.__foxTest
    let bad = 0
    for (const nm of ['LH', 'RH', 'LF', 'RF']) {
      const s = t.stateAt(t.law.onsets[nm] + 0.001)
      if (Math.abs(s.paws[nm].z) > 1e-9) bad++
    }
    return bad
  })
  ok('every footfall lands exactly on the snow (z = 0)', touch === 0, touch + ' off-plane')
}

/* ---------------- 3. PIXELS ---------------- */
// freeze mid-fore-stance for the probes (RF planted, tail streaming)
await page.evaluate(() => window.__foxTest.setPhase(0.66))
await page.screenshot({ path: resolve(shots, 'check-freeze.png') })
const ctr = await page.evaluate(() => window.__foxTest.foxCenterScreen())
ok('fox centre projects inside the frame', ctr && ctr[0] > 200 && ctr[0] < 980 && ctr[1] > 150 && ctr[1] < 640, ctr)
const coat = await page.evaluate(() => {
  const c = window.__foxTest.foxCenterScreen()
  return window.__foxTest.countNear(c[0], c[1] + 5, 70, { rMin: 120, rMax: 255, gMin: 40, gMax: 150, bMin: 0, bMax: 105 })
})
ok('rust coat colour on the body at the state-predicted spot', coat > 250, coat + ' coat px')
const tip = await page.evaluate(() => {
  const t = window.__foxTest
  const q = t.partScreen('tail')
  if (!q) return -1
  return t.countNear(q[0], q[1], 26, { rMin: 200, rMax: 255, gMin: 190, gMax: 255, bMin: 170, bMax: 255 })
})
ok('white tail tip where the state says the tail ends', tip > 40, tip + ' white px')
const nose = await page.evaluate(() => {
  const t = window.__foxTest
  const q = t.partScreen('nose')
  if (!q) return -1
  return t.countNear(q[0], q[1], 24, { rMin: 100, rMax: 255, gMin: 40, gMax: 160, bMin: 0, bMax: 115 })
})
ok('head projects ahead of the body (coat visible at the snout)', nose > 20, nose + ' px')
const shadow = await page.evaluate(() => {
  const c = window.__foxTest.foxCenterScreen()
  return window.__foxTest.countNear(c[0] + 25, c[1] + 95, 55, { rMin: 60, rMax: 190, gMin: 60, gMax: 195, bMin: 70, bMax: 215 })
})
ok('contact shadow grounds the fox', shadow > 300, shadow + ' shadow px')

// paw-print trail accumulates while running (needs the live loop)
await page.evaluate(() => { const t = window.__foxTest; t.resume(); t.reset() })
const boxBehind = null; void boxBehind
await page.waitForFunction(() => window.__foxTest.prints() >= 6, null, { timeout: 8000 }).catch(() => {})
const printN = await page.evaluate(() => window.__foxTest.prints())
ok('paw prints accumulate behind the runner (≥ 6 after two strides)', printN >= 6, printN + ' prints')
await page.evaluate(() => window.__foxTest.setPhase(0.66))
const trailDark = await page.evaluate(`(()=>{const t=window.__foxTest;const c=t.foxCenterScreen();const dpr=window.devicePixelRatio||1;const cv=document.querySelector('canvas#c');const x0=Math.round((c[0]-330)*dpr),y0=Math.round((c[1]+40)*dpr),w=Math.round(220*dpr),h=Math.round(70*dpr);const img=cv.getContext('2d').getImageData(Math.max(0,x0),Math.max(0,y0),w,h).data;let n=0;for(let i=0;i<img.length;i+=12){const r=img[i],g=img[i+1],b=img[i+2];if(r+g+b<560)n++}return n})()`)
ok('the print trail reads on the snow behind the fox', trailDark > 120, trailDark + ' dark px')

// spruce silhouettes on the horizon band
const spruce = await page.evaluate(`(()=>{const t=window.__foxTest;const dpr=window.devicePixelRatio||1;const cv=document.querySelector('canvas#c');const hz=t.horizonPx();const y0=Math.max(0,Math.round((hz-70)*dpr)),h=Math.round(80*dpr);const img=cv.getContext('2d').getImageData(0,y0,cv.width,h).data;let n=0;for(let i=0;i<img.length;i+=12){const r=img[i],g=img[i+1],b=img[i+2];if(r<95&&g<115&&b<130)n++}return n})()`)
ok('distant spruce silhouettes stand on the horizon band', spruce > 150, spruce + ' dark px')

/* ---------------- 4. PHONE ---------------- */
{
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  let errs2 = 0
  p2.on('pageerror', e => { errs2++; console.log('[phone pageerror]', e.message) })
  await p2.goto(URL_DEMO, { waitUntil: 'load' })
  await p2.waitForFunction(() => window.__foxTest && window.__foxTest.ready, null, { timeout: 15000 })
  await p2.waitForFunction('window.__foxTest.frames() > 30', null, { timeout: 8000 }).catch(() => {})
  const litP = await p2.evaluate(() => window.__foxTest.countPixels((r, g, b) => r + g + b > 240, 5))
  ok('phone viewport: boots, runs, paints, zero errors', errs2 === 0 && litP > 4000, 'lit ' + litP + ', ' + errs2 + ' errors')
  await p2.close()
}

/* ---------------- 5. DEMO LAW ---------------- */
{
  const html = readFileSync('public/demos/fox.html', 'utf8')
  ok('self-contained: no absolute http(s) resources', !/<(script|link|img)[^>]+src=["']https?:/i.test(html))
  ok('credits card block present with honest fields', /window\.DEMO_CREDITS\s*=/.test(html) && /name:\s*'RENARD'/.test(html) && /assist:\s*'solo'/.test(html) && /issues:\s*\[2261\]/.test(html))
  ok('shared credits.js loaded', /<script src="credits\.js"><\/script>/.test(html))
  const idx = readFileSync('public/demos/index.html', 'utf8')
  ok('index card + DEMO_INDEX entry', /id="fox"/.test(idx) && /el:\s*'fox'/.test(idx))
  const reg = readFileSync('src/config/games.js', 'utf8')
  ok('demos stay out of the arcade registry (#1258)', !/fox/i.test(reg))
}

console.log((fail ? '\nfoxcheck FAILED: ' + fail + ' of ' + (pass + fail) : '\nfoxcheck PASS: ' + pass + '/' + (pass + fail)) + ' — shots in ' + shots)
await browser.close()
process.exit(fail ? 1 : 0)
