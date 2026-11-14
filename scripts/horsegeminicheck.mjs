// horsegeminicheck — self-verifying harness for public/demos/horse-gemini.html
// (SUNSTRIDE: procedural low-poly 3D mustang running a seamless transverse gallop).
//
// Proves five things:
//   1. BOOTS    — WebGL2 canvas + __horsegeminiTest ready, rAF advancing,
//                 attract first, key dismisses attract, zero page/console errors.
//   2. GAIT     — 4-beat transverse gallop footfall order (LH -> RH -> LF -> RF),
//                 gathered flight phase, 0.000 mm stance hoof slip (both analytic
//                 sweep and live rAF frames), IK within reach, legs + body + head
//                 + tail all animate, and seamless loop seam (< 0.05 mm).
//   3. PIXELS   — rendered WebGL2 pixels show sky + warm copper-bay mustang +
//                 projected ground shadow, pixel hashes differ across stride
//                 phases, pointer drag orbits camera, audio pill toggles mute.
//   4. PHONE    — 390x844 coarse-pointer viewport boots, shows touch pad, keeps
//                 HUD clear of BUILT BY GEMINI tag.
//   5. DEMO LAW — single self-contained HTML, zero external libraries/assets,
//                 not in src/config/games.js, honest Gemini + Antigravity CLI
//                 credits, linked in public/demos/index.html.
//
// Proven-fail mutant (run once by hand, restore after):
//   In public/demos/horse-gemini.html inside evaluateHorse's `if (inStance)` block,
//   add `u * 0.12` to `anchorX` so planted hooves slide 12 cm during stance ->
//   `gait: analytic stance hoof slip is zero` and `gait: live rAF stance hoof slip`
//   both go RED immediately; restore `anchorX` -> all checks green.
//
// Usage: DEV_PORT=5190 npm run horsegeminicheck

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, requireDevServer, relayNoise, opt } from './lib/harness.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const port = opt(args, '--port', process.env.DEV_PORT || '5190')
const BASE = `http://localhost:${port}/retrogames/demos/`
const URL_DEMO = BASE + 'horse-gemini.html'

let pass = 0, fail = 0
function ok(name, cond, detail = '') {
  const tag = cond ? '  ok  ' : '  FAIL'
  console.log(`${tag} ${name}${!cond && detail ? ' — ' + detail : ''}`)
  if (cond) pass++; else fail++
}

/* ---------------- 5. Static Demo Law Checks ---------------- */
console.log('horsegemini: demo law')
const demoPath = resolve(ROOT, 'public/demos/horse-gemini.html')
const idxPath = resolve(ROOT, 'public/demos/index.html')
const gamesPath = resolve(ROOT, 'src/config/games.js')

ok('law: horse-gemini.html exists', existsSync(demoPath))
ok('law: docs/horse-gemini-design.md exists', existsSync(resolve(ROOT, 'docs/horse-gemini-design.md')))

const html = readFileSync(demoPath, 'utf8')
const idxHtml = readFileSync(idxPath, 'utf8')
const gamesJs = readFileSync(gamesPath, 'utf8')

const extLinks = html.match(/(src|href)\s*=\s*["']https?:\/\//gi) || []
ok('law: zero external scripts or asset URLs', extLinks.length === 0, extLinks.join(', '))
ok('law: zero Three.js / Babylon / external engine imports', !/three(\.min)?\.js|babylon|regl|twgl/i.test(html))
ok('law: loads credits.js and feedback.js relatively',
  /<script src="credits\.js"><\/script>/.test(html) && /<script src="feedback\.js"><\/script>/.test(html))
ok('law: declares honest Gemini + Antigravity CLI builder credit',
  /model:\s*'Gemini'/.test(html) && /where:\s*'via Antigravity CLI'/.test(html) && !/Qwen/.test(html))
ok('law: not registered in src/config/games.js', !/horse-gemini/i.test(gamesJs))
ok('law: index.html carries card id="horse-gemini" and DEMO_INDEX entry',
  /<a class="card" id="horse-gemini"/.test(idxHtml) && /el:\s*'horse-gemini'/.test(idxHtml))

/* ---------------- Browser Harness ---------------- */
await requireDevServer(BASE)
const browser = await launch()
const pageErrors = []

try {
  console.log('horsegemini: boots')
  const page = await browser.newPage({ viewport: { width: 1080, height: 680 }, deviceScaleFactor: 2 })
  page.setDefaultTimeout(25000)
  page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text())) pageErrors.push('console: ' + m.text()) })
  page.on('requestfailed', r => {
    if (!relayNoise(null, { url: r.url() }) && !/favicon/i.test(r.url())) pageErrors.push('404: ' + r.url())
  })

  await page.goto(URL_DEMO, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__horsegeminiTest && window.__horsegeminiTest.ready && window.__horsegeminiTest.frames > 4)

  const f0 = await page.evaluate(() => window.__horsegeminiTest.frames)
  await page.waitForFunction(k => window.__horsegeminiTest.frames >= k, f0 + 18)
  const bootState = await page.evaluate(() => ({
    st: window.__horsegeminiTest.state(),
    padDisplay: getComputedStyle(document.getElementById('pad')).display,
    creditsTag: (document.getElementById('credits-tag') || {}).textContent || '',
  }))

  ok('boots: ready + rAF advancing', bootState.st && (await page.evaluate(() => window.__horsegeminiTest.frames)) >= f0 + 18)
  ok('boots: starts in attract mode', bootState.st.screenMode === 'attract', bootState.st.screenMode)
  ok('boots: procedural horse + steppe meshes populated',
    bootState.st.horseTris >= 1500 && bootState.st.worldTris >= 3000,
    `horseTris=${bootState.st.horseTris} worldTris=${bootState.st.worldTris}`)
  ok('boots: mobile pad hidden on desktop pointer', bootState.padDisplay === 'none', bootState.padDisplay)
  ok('boots: credits tag says BUILT BY GEMINI', /BUILT BY GEMINI/.test(bootState.creditsTag), bootState.creditsTag)

  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__horsegeminiTest.state().screenMode === 'play')
  ok('boots: keypress dismisses attract and unlocks audio', await page.evaluate(() => {
    const s = window.__horsegeminiTest.state()
    return s.screenMode === 'play' && s.audioUnlocked === true
  }))

  /* ---------------- 2. GAIT RULES ---------------- */
  console.log('horsegemini: gait rules')
  const audit = await page.evaluate(() => window.__horsegeminiTest.audit(300, 3))
  ok('gait: 4-beat transverse gallop footfall order (LH -> RH -> LF -> RF)',
    JSON.stringify(audit.footfallOrder) === JSON.stringify(['LH', 'RH', 'LF', 'RF']),
    JSON.stringify(audit.footfallOrder))
  ok('gait: analytic stance hoof slip is zero (< 0.01 mm across 3 strides)',
    audit.maxSlipMm < 0.01, `maxSlipMm=${audit.maxSlipMm}`)
  ok('gait: gathered flight suspension phase present (25%..45% of stride)',
    audit.flightFraction >= 0.25 && audit.flightFraction <= 0.45, `flightFraction=${audit.flightFraction}`)
  ok('gait: mid-swing hooves clear ground (>= 20 mm)',
    audit.minMidSwingClearanceM >= 0.02, `clearance=${audit.minMidSwingClearanceM}m`)
  ok('gait: 2-bone IK stays strictly within reach (no bone stretch)',
    audit.maxIkRatio <= 1.0, `maxIkRatio=${audit.maxIkRatio}`)
  ok('gait: trunk heaves and pitches across stride',
    audit.ranges.bodyHeaveM >= 0.08 && audit.ranges.bodyPitchRad >= 0.12,
    JSON.stringify(audit.ranges))
  ok('gait: head/neck bascule and tail wave animate across stride',
    audit.ranges.headMuzzleM >= 0.14 && audit.ranges.tailTipM >= 0.18,
    JSON.stringify(audit.ranges))
  ok('gait: seamless stride loop (pose(0) === pose(1) within 0.05 mm)',
    audit.loopSeamMm < 0.05, `loopSeamMm=${audit.loopSeamMm}`)

  // Live rAF multi-frame hoof-slip check (proves live loop obeys zero-slip too)
  const liveSlipMm = await page.evaluate(async () => {
    const t = window.__horsegeminiTest
    t.setPose({ paused: false, timeScale: 1.0 })
    const anchors = {}
    let maxMm = 0
    for (let i = 0; i < 42; i++) {
      await new Promise(r => requestAnimationFrame(r))
      const s = t.state()
      for (const [id, L] of Object.entries(s.legs)) {
        const key = `${id}:${s.strideIndex}`
        if (L.inStance) {
          if (!anchors[key]) anchors[key] = L.hoof
          else {
            const dx = L.hoof[0] - anchors[key][0]
            const dy = L.hoof[1] - anchors[key][1]
            const dz = L.hoof[2] - anchors[key][2]
            const mm = Math.hypot(dx, dy, dz) * 1000
            if (mm > maxMm) maxMm = mm
          }
        }
      }
    }
    return +maxMm.toFixed(4)
  })
  ok('gait: live rAF stance hoof slip is zero (< 0.05 mm)', liveSlipMm < 0.05, `liveSlipMm=${liveSlipMm}`)

  /* ---------------- 3. PIXELS & INTERACTION ---------------- */
  console.log('horsegemini: pixels & controls')
  const px08 = await page.evaluate(() => {
    window.__horsegeminiTest.setPose({ phase: 0.08, stride: 2, paused: true, yaw: 0.0, pitch: 0.06, dist: 3.55, attract: false })
    return window.__horsegeminiTest.samplePixels()
  })
  const px46 = await page.evaluate(() => {
    window.__horsegeminiTest.setPose({ phase: 0.46, stride: 2, paused: true, yaw: 0.0, pitch: 0.06, dist: 3.55, attract: false })
    return window.__horsegeminiTest.samplePixels()
  })
  const px78 = await page.evaluate(() => {
    window.__horsegeminiTest.setPose({ phase: 0.78, stride: 2, paused: true, yaw: 0.0, pitch: 0.06, dist: 3.55, attract: false })
    return window.__horsegeminiTest.samplePixels()
  })

  ok('pixels: WebGL2 renders sky, copper-bay mustang, and dark ground shadow',
    px46.skySamples >= 25 && px46.warmHorseSamples >= 15 && px46.darkShadowSamples >= 8,
    JSON.stringify(px46))
  ok('pixels: rendered silhouette changes across stride phases',
    px08.hash !== px46.hash && px46.hash !== px78.hash && px08.hash !== px78.hash,
    `hashes=${px08.hash},${px46.hash},${px78.hash}`)

  // Drag to orbit
  await page.evaluate(() => window.__horsegeminiTest.setPose({ paused: false, yaw: 0.10, pitch: 0.08 }))
  const yawBefore = await page.evaluate(() => window.__horsegeminiTest.state().cam.yaw)
  await page.mouse.move(540, 340)
  await page.mouse.down()
  await page.mouse.move(380, 290, { steps: 6 })
  await page.mouse.up()
  const fDrag = await page.evaluate(() => window.__horsegeminiTest.frames)
  await page.waitForFunction(k => window.__horsegeminiTest.frames >= k, fDrag + 8)
  const yawAfter = await page.evaluate(() => window.__horsegeminiTest.state().cam.yaw)
  ok('controls: pointer drag orbits camera', Math.abs(yawAfter - yawBefore) > 0.12, `before=${yawBefore} after=${yawAfter}`)

  // Audio mute pill toggle
  await page.click('#audiohint')
  const muted1 = await page.evaluate(() => window.__horsegeminiTest.state().audioMuted)
  await page.click('#audiohint')
  const muted2 = await page.evaluate(() => window.__horsegeminiTest.state().audioMuted)
  ok('controls: #audiohint pill toggles mute cleanly', muted1 === true && muted2 === false)

  /* ---------------- 4. PHONE (390x844 Touch) ---------------- */
  console.log('horsegemini: phone 390x844')
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  phone.on('pageerror', e => pageErrors.push('phone pageerror: ' + e.message))
  phone.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text())) pageErrors.push('phone console: ' + m.text()) })
  await phone.goto(URL_DEMO, { waitUntil: 'load' })
  await phone.waitForFunction(() => !!window.__horsegeminiTest && window.__horsegeminiTest.ready && window.__horsegeminiTest.frames > 3)
  const pLayout = await phone.evaluate(() => {
    const pad = getComputedStyle(document.getElementById('pad')).display
    const hud = document.getElementById('hud').getBoundingClientRect()
    const tag = document.getElementById('credits-tag').getBoundingClientRect()
    const overlapX = Math.min(hud.right, tag.right) - Math.max(hud.left, tag.left)
    const overlapY = Math.min(hud.bottom, tag.bottom) - Math.max(hud.top, tag.top)
    return { pad, noOverlap: overlapX <= 0 || overlapY <= 0, overlapX, overlapY }
  })
  ok('phone: coarse pointer shows touch pad', pLayout.pad === 'flex', pLayout.pad)
  ok('phone: #hud stays clear of #credits-tag at 390x844', pLayout.noOverlap, JSON.stringify(pLayout))
  await phone.close()

  ok('browser: zero page/console/network errors across desktop + phone', pageErrors.length === 0, pageErrors.join(' | '))
} finally {
  await browser.close()
}

console.log(`\nhorsegeminicheck: ${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
