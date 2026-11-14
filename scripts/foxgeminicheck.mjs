// foxgeminicheck — self-verifying harness for public/demos/fox-gemini.html
// (FROSTBRUSH: procedural 3D red fox running a rotary double-suspension gallop in WebGL2).
//
// Proves five things:
//   1. BOOTS    — WebGL2 canvas + __foxTest ready, rAF advancing, attract first,
//                 keypress dismisses attract + unlocks audio, zero page errors,
//                 and clickable #fox-gemini card on public/demos/index.html.
//   2. GAIT     — true 4-beat ROTARY gallop footfall order (LH -> RH -> RF -> LF),
//                 TWO distinct suspension phases per stride (extended flight +
//                 gathered coiled flight), 0.000 mm stance paw slip (analytic +
//                 live rAF), digitigrade 2-bone IK within reach, spinal flex,
//                 brush wave, and seamless 12-stride world loop (< 0.05 mm).
//   3. PIXELS   — WebGL2 renders boreal dawn sky, russet-orange fox coat, white
//                 tail tag/bib, black stockings + PCF shadow, and frosted turf;
//                 pixel hashes change across flight/stance phases; drag orbits;
//                 audio pill mutes/unmutes cleanly.
//   4. PHONE    — 390x844 coarse-pointer viewport boots, renders fox + sky,
//                 shows touch pad, keeps #hud clear of BUILT BY GEMINI tag.
//   5. DEMO LAW — single self-contained HTML, dvh viewport form, zero external
//                 libraries/assets, not in src/config/games.js, honest Gemini +
//                 Antigravity CLI credits, linked in public/demos/index.html.
//
// Proven-fail mutants (run by hand, restored immediately):
//   1. Stance slip mutant: in evaluateFox's `if (inStance)` block, add
//      `uStance * 0.09` to `paw[0]` -> `gait: analytic stance paw slip is zero`
//      and `gait: live rAF stance paw slip is zero` both go RED (~90 mm).
//   2. Transverse-instead-of-rotary mutant: swap `RF.td` (0.50) and `LF.td`
//      (0.59) in LEGS_DEF -> `gait: 4-beat rotary gallop footfall order` goes
//      RED (sees LH,RH,LF,RF instead of LH,RH,RF,LF).
//
// Usage: DEV_PORT=5194 npm run foxgeminicheck

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, requireDevServer, relayNoise, opt } from './lib/harness.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const port = opt(args, '--port', process.env.DEV_PORT || '5173')
const BASE = `http://localhost:${port}/retrogames/demos/`
const URL_DEMO = BASE + 'fox-gemini.html'

let pass = 0, fail = 0
function ok(name, cond, detail = '') {
  const tag = cond ? '  ok  ' : '  FAIL'
  console.log(`${tag} ${name}${!cond && detail ? ' — ' + detail : ''}`)
  if (cond) pass++; else fail++
}

/* ---------------- 5. Static Demo Law Checks ---------------- */
console.log('fox-gemini: demo law')
const demoPath = resolve(ROOT, 'public/demos/fox-gemini.html')
const idxPath = resolve(ROOT, 'public/demos/index.html')
const gamesPath = resolve(ROOT, 'src/config/games.js')

ok('law: fox-gemini.html exists', existsSync(demoPath))
ok('law: docs/fox-gemini-design.md exists', existsSync(resolve(ROOT, 'docs/fox-gemini-design.md')))

const html = readFileSync(demoPath, 'utf8')
const idxHtml = readFileSync(idxPath, 'utf8')
const gamesJs = readFileSync(gamesPath, 'utf8')

const extLinks = html.match(/(src|href)\s*=\s*["']https?:\/\//gi) || []
ok('law: zero external scripts or asset URLs', extLinks.length === 0, extLinks.join(', '))
ok('law: zero Three.js / Babylon / external engine imports', !/three(\.min)?\.js|babylon|regl|twgl|\bimport\s/i.test(html))
ok('law: canvas carries visible-viewport 100dvh alongside 100vh',
  /height:\s*100vh;\s*height:\s*100dvh/.test(html))
ok('law: loads credits.js and feedback.js relatively',
  /<script src="credits\.js"><\/script>/.test(html) && /<script src="feedback\.js"><\/script>/.test(html))
ok('law: declares honest Gemini + Antigravity CLI builder credit',
  /model:\s*'Gemini 4 Carbon'/.test(html) && /where:\s*'via Antigravity CLI'/.test(html) && !/Qwen|Mac Studio/.test(html))
ok('law: not registered in src/config/games.js', !/fox-gemini|FROSTBRUSH/i.test(gamesJs))
ok('law: index.html carries card id="fox-gemini", href wiring, and DEMO_INDEX entry',
  /<a class="card" id="fox-gemini"/.test(idxHtml) &&
  /getElementById\('fox-gemini'\)\.href\s*=/.test(idxHtml) &&
  /el:\s*'fox-gemini'/.test(idxHtml))

/* ---------------- Browser Harness ---------------- */
await requireDevServer(BASE)
const browser = await launch()
const pageErrors = []

try {
  console.log('fox-gemini: boots & index card')
  const page = await browser.newPage({ viewport: { width: 1120, height: 700 }, deviceScaleFactor: 2 })
  page.setDefaultTimeout(25000)
  page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message))
  page.on('response', r => {
    if (r.status() >= 400 && !/\/favicon\.ico(\?|$)/.test(r.url()) && !relayNoise(null, { url: r.url() })) {
      pageErrors.push(`http ${r.status()}: ${r.url()}`)
    }
  })
  page.on('console', m => {
    if (m.type() !== 'error' || relayNoise(m.text())) return
    if (/Failed to load resource: the server responded with a status of 404/.test(m.text())) return
    pageErrors.push('console: ' + m.text())
  })
  page.on('requestfailed', r => {
    if (!relayNoise(null, { url: r.url() }) && !/favicon/i.test(r.url())) pageErrors.push('404: ' + r.url())
  })

  await page.goto(BASE + 'index.html?_ts=' + Date.now(), { waitUntil: 'load' })
  const cardHref = await page.evaluate(() => {
    const el = document.getElementById('fox-gemini')
    return el ? el.getAttribute('href') : null
  })
  ok('index: #fox-gemini card has live clickable href', !!cardHref && cardHref.endsWith('fox-gemini.html'), String(cardHref))

  await page.goto(URL_DEMO + '?_ts=' + Date.now(), { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__foxTest && window.__foxTest.ready && window.__foxTest.frames > 4)

  const f0 = await page.evaluate(() => window.__foxTest.frames)
  await page.waitForFunction(k => window.__foxTest.frames >= k, f0 + 18)
  const bootState = await page.evaluate(() => ({
    st: window.__foxTest.state(),
    padDisplay: getComputedStyle(document.getElementById('pad')).display,
    creditsTag: (document.getElementById('credits-tag') || {}).textContent || '',
  }))

  ok('boots: ready + rAF advancing', bootState.st && (await page.evaluate(() => window.__foxTest.frames)) >= f0 + 18)
  ok('boots: starts in attract mode', bootState.st.screenMode === 'attract', bootState.st.screenMode)
  ok('boots: procedural fox + boreal glade meshes populated',
    bootState.st.foxTris >= 1400 && bootState.st.worldTris >= 10000,
    `foxTris=${bootState.st.foxTris} worldTris=${bootState.st.worldTris}`)
  ok('boots: mobile pad hidden on desktop pointer', bootState.padDisplay === 'none', bootState.padDisplay)
  ok('boots: credits tag says BUILT BY GEMINI', /BUILT BY GEMINI/.test(bootState.creditsTag), bootState.creditsTag)

  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__foxTest.state().screenMode === 'play')
  ok('boots: keypress dismisses attract and unlocks audio', await page.evaluate(() => {
    const s = window.__foxTest.state()
    return s.screenMode === 'play' && s.audioUnlocked === true
  }))

  /* ---------------- 2. GAIT & BIOMECHANICS RULES ---------------- */
  console.log('fox-gemini: gait rules')
  const audit = await page.evaluate(() => window.__foxTest.audit(360, 3))
  ok('gait: 4-beat rotary gallop footfall order (LH -> RH -> RF -> LF)',
    JSON.stringify(audit.footfallOrder) === JSON.stringify(['LH', 'RH', 'RF', 'LF']),
    JSON.stringify(audit.footfallOrder))
  ok('gait: double-suspension carnivore gallop (2 distinct flight phases per stride)',
    audit.suspensionPhases === 2 && audit.extFlightFraction >= 0.14 && audit.gathFlightFraction >= 0.18,
    `phases=${audit.suspensionPhases} ext=${audit.extFlightFraction} gath=${audit.gathFlightFraction}`)
  ok('gait: extended flight stretches paws wide; gathered flight coils hindpaws under chest',
    audit.extSpanM >= 0.70 && audit.gathSpanM <= 0.05,
    `extSpanM=${audit.extSpanM} gathSpanM=${audit.gathSpanM}`)
  ok('gait: analytic stance paw slip is zero (< 0.01 mm across 3 strides)',
    audit.maxSlipMm < 0.01, `maxSlipMm=${audit.maxSlipMm}`)
  ok('gait: mid-swing paws clear frosted trail (>= 30 mm) and never sink underground',
    audit.minSwingClearanceM >= 0.03 && audit.minPawY >= 0.01,
    `clearance=${audit.minSwingClearanceM}m minPawY=${audit.minPawY}m`)
  ok('gait: 2-bone digitigrade IK stays strictly within reach (no bone stretch)',
    audit.maxIkRatio <= 1.0, `maxIkRatio=${audit.maxIkRatio}`)
  ok('gait: supple spine flexes/extends and body heaves across stride',
    audit.ranges.spineFlexM >= 0.08 && audit.ranges.bodyHeaveM >= 0.04,
    JSON.stringify(audit.ranges))
  ok('gait: head bascule and plumed brush wave animate across stride',
    audit.ranges.headMuzzleM >= 0.10 && audit.ranges.tailTipM >= 0.12,
    JSON.stringify(audit.ranges))
  ok('gait: seamless 12-stride world loop closure (< 0.05 mm)',
    audit.loopSeamMm < 0.05, `loopSeamMm=${audit.loopSeamMm}`)

  // Live rAF multi-frame paw-slip audit
  const liveSlipMm = await page.evaluate(async () => {
    const t = window.__foxTest
    t.setPose({ paused: false, timeScale: 1.0 })
    const anchors = {}
    let maxMm = 0
    for (let i = 0; i < 42; i++) {
      await new Promise(r => requestAnimationFrame(r))
      const s = t.state()
      for (const [id, L] of Object.entries(s.legs)) {
        const key = `${id}:${s.strideIndex}`
        if (L.inStance) {
          if (!anchors[key]) anchors[key] = L.paw
          else {
            const mm = Math.hypot(
              L.paw[0] - anchors[key][0],
              L.paw[1] - anchors[key][1],
              L.paw[2] - anchors[key][2]
            ) * 1000
            if (mm > maxMm) maxMm = mm
          }
        }
      }
    }
    return +maxMm.toFixed(4)
  })
  ok('gait: live rAF stance paw slip is zero (< 0.05 mm)', liveSlipMm < 0.05, `liveSlipMm=${liveSlipMm}`)

  /* ---------------- 3. PIXELS & INTERACTION ---------------- */
  console.log('fox-gemini: pixels & controls')
  const pxExt = await page.evaluate(() => {
    window.__foxTest.setPose({ phase: 0.40, stride: 2, paused: true, yaw: 0.34, pitch: 0.11, dist: 1.84, attract: false })
    return window.__foxTest.samplePixels()
  })
  const pxStance = await page.evaluate(() => {
    window.__foxTest.setPose({ phase: 0.56, stride: 2, paused: true, yaw: 0.34, pitch: 0.11, dist: 1.84, attract: false })
    return window.__foxTest.samplePixels()
  })
  const pxGath = await page.evaluate(() => {
    window.__foxTest.setPose({ phase: 0.89, stride: 2, paused: true, yaw: 0.34, pitch: 0.11, dist: 1.84, attract: false })
    return window.__foxTest.samplePixels()
  })

  ok('pixels: WebGL2 renders dawn sky, russet fox coat, white fur, dark stockings/shadow & frost turf',
    pxExt.skySamples >= 40 && pxExt.russetFoxSamples >= 12 && pxExt.whiteFurSamples >= 2 &&
    pxExt.darkStockingSamples >= 4 && pxExt.frostTurfSamples >= 40,
    JSON.stringify(pxExt))
  ok('pixels: rendered silhouette changes across extended flight, stance, and gathered flight',
    pxExt.hash !== pxStance.hash && pxStance.hash !== pxGath.hash && pxExt.hash !== pxGath.hash,
    `hashes=${pxExt.hash},${pxStance.hash},${pxGath.hash}`)

  // Drag to orbit
  await page.evaluate(() => window.__foxTest.setPose({ paused: false, yaw: 0.20, pitch: 0.10 }))
  const yawBefore = await page.evaluate(() => window.__foxTest.state().cam.yaw)
  await page.mouse.move(560, 350)
  await page.mouse.down()
  await page.mouse.move(390, 300, { steps: 6 })
  await page.mouse.up()
  const fDrag = await page.evaluate(() => window.__foxTest.frames)
  await page.waitForFunction(k => window.__foxTest.frames >= k, fDrag + 8)
  const yawAfter = await page.evaluate(() => window.__foxTest.state().cam.yaw)
  ok('controls: pointer drag orbits camera', Math.abs(yawAfter - yawBefore) > 0.12, `before=${yawBefore} after=${yawAfter}`)

  // Audio mute pill toggle
  await page.click('#audiohint')
  const muted1 = await page.evaluate(() => window.__foxTest.state().audioMuted)
  await page.click('#audiohint')
  const muted2 = await page.evaluate(() => window.__foxTest.state().audioMuted)
  ok('controls: #audiohint pill toggles mute cleanly', muted1 === true && muted2 === false)

  /* ---------------- 4. PHONE (390x844 Touch) ---------------- */
  console.log('fox-gemini: phone 390x844')
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  phone.on('pageerror', e => pageErrors.push('phone pageerror: ' + e.message))
  phone.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text())) pageErrors.push('phone console: ' + m.text()) })
  await phone.goto(URL_DEMO + '?_ts=' + Date.now(), { waitUntil: 'load' })
  await phone.waitForFunction(() => !!window.__foxTest && window.__foxTest.ready && window.__foxTest.frames > 3)
  const pLayout = await phone.evaluate(() => {
    window.__foxTest.setPose({ phase: 0.40, stride: 2, paused: true, yaw: 0.34, pitch: 0.11, dist: 1.92, attract: false })
    const px = window.__foxTest.samplePixels()
    const pad = getComputedStyle(document.getElementById('pad')).display
    const hud = document.getElementById('hud').getBoundingClientRect()
    const tag = document.getElementById('credits-tag').getBoundingClientRect()
    const overlapX = Math.min(hud.right, tag.right) - Math.max(hud.left, tag.left)
    const overlapY = Math.min(hud.bottom, tag.bottom) - Math.max(hud.top, tag.top)
    return { pad, noOverlap: overlapX <= 0 || overlapY <= 0, overlapX, overlapY, px }
  })
  ok('phone: coarse pointer shows touch pad', pLayout.pad === 'flex', pLayout.pad)
  ok('phone: #hud stays clear of #credits-tag at 390x844', pLayout.noOverlap, JSON.stringify(pLayout))
  ok('phone: WebGL2 renders fox and sky cleanly in portrait',
    pLayout.px.skySamples >= 40 && pLayout.px.russetFoxSamples >= 4,
    JSON.stringify(pLayout.px))
  await phone.close()

  ok('browser: zero page/console/network errors across desktop + phone', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  await browser.close()
}

console.log(`\nfoxgeminicheck: ${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
