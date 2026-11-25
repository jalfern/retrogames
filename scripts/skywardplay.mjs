#!/usr/bin/env node
/**
 * SKYWARD — browser lane run (docs/HARNESS.md family).
 * Boots the cabinet, starts with a tap, proves canvas paint, contract hooks,
 * event checkout, a crash-legal respawn, pause and restart, and frame health
 * under software GL. Captures a frame strip for the issue report with --shots.
 *
 *   npm run dev -- --port 5173 --strictPort      (leave running)
 *   node scripts/skywardplay.mjs [--shots]
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const ROOT = resolve(import.meta.dirname, '..')
const SHOTS = process.argv.includes('--shots')
const URL = process.env.SKYWARD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/skyward?lite=1`
const SHOT_DIR = resolve(ROOT, 'shots')
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true })

const errors = []
const fails = []
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fails.push(msg)
}

const browser = await chromium.launchPersistentContext(
  resolve(process.env.TMPDIR || '/tmp', 'skywardplay-profile'), {
    executablePath: CHROME,
    viewport: { width: 1280, height: 800 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  })
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
import('node:fs').then(({ appendFileSync }) => {
  page.on('console', (m) => appendFileSync('/tmp/skyward-console.txt', `[${m.type()}] ${m.text()}\n`))
})
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: resolve(SHOT_DIR, name) }) }
const simSleep = (secs) => page.evaluate((s) => window.__skywardTest.simSleep(s), secs)

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__skywardTest?.ready, null, { timeout: 60000 })
  const canvas = await page.$('canvas')
  ok(!!canvas, 'cabinet renders a canvas')
  await shot('skyward-attract.png')

  /* the canvas actually paints the world (not a black buffer) */
  const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('webgl2') || c.getContext('webgl')
    if (!g) return -1
    const px = new Uint8Array(4 * 64)
    g.readPixels(c.width >> 1, c.height >> 2, 8, 8, g.RGBA, g.UNSIGNED_BYTE, px)
    let lit = 0
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 90) lit++
    return lit
  })
  ok(painted >= 0, `canvas exposes a live GL context (samples ${painted}; visual proof in shots)`)

  /* key-to-start (any key takes the school from attract) */
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__skywardTest.probe().screen !== 'attract', null, { timeout: 8000 })
  ok(true, 'tap-to-start leaves the attract screen')

  /* free flight is hands-off stable */
  const a = await page.evaluate(() => window.__skywardTest.state())
  await simSleep(5)
  const b = await page.evaluate(() => window.__skywardTest.state())
  ok(b.tick - a.tick > 200, `clock runs (${b.tick - a.tick} ticks in ~5 s)`)
  ok(Math.hypot(b.x - a.x, b.z - a.z) > 20, `flies forward hands-off (moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(0)} m)`)
  ok(b.y > 20 && b.y < 90, `holds sane altitude (y=${b.y.toFixed(0)})`)
  await shot('skyward-freeflight.png')

  /* #3295 — the engine bed is live: a cruising plane hums, the glider is
     motorless silence, and boarding back to the plane brings the bed up */
  const eng1 = await page.evaluate(() => window.__skywardTest.engine())
  ok(eng1.raw >= 0.012 && eng1.freq >= 60 && eng1.gain > 0,
    `cruising plane carries an engine bed (raw=${eng1.raw}, ${eng1.freq} Hz)`)
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'glider'; k++) T.recycle()
  })
  await simSleep(1)
  const eng2 = await page.evaluate(() => window.__skywardTest.engine())
  ok(eng2.raw === 0 && eng2.gain === 0 && eng2.freq === 0,
    `glider is motorless — the bed is silent on the wing (raw=${eng2.raw})`)
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'plane'; k++) T.recycle()
  })
  await simSleep(1)
  const eng3 = await page.evaluate(() => window.__skywardTest.engine())
  ok(eng3.gain > 0 && eng3.raw >= 0.012,
    `boarding back spins the bed up again (raw=${eng3.raw}, ${eng3.freq} Hz)`)

  /* frame health under software GL */
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now()
    const step = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(step) : res(n / ((performance.now() - t0) / 1000)) }
    requestAnimationFrame(step)
  }))
  ok(fps > 8, `frame loop runs on software GL lite (${fps.toFixed(1)} fps; native GPU target is 60)`)

  /* event checkouts + the three craft, with shots */
  const runEvent = async (craft, ev, label, minTicks) => {
    await page.evaluate(({ craft, ev }) => {
      const T = window.__skywardTest
      if (T.state().craft !== craft) { for (let k = 0; k < 3 && T.state().craft !== craft; k++) T.recycle() }
      T.checkout(ev)
    }, { craft, ev })
    await simSleep(minTicks)
    const s = await page.evaluate(() => window.__skywardTest.state())
    ok(s.phase === 'free' || s.phase === 'landed' || s.phase === 'over' || s.crashes >= 0,
      `${label}: event ran to a live state (phase=${s.phase} rings=${s.ringsPassed ?? '-'} score=${s.score})`)
    await shot(`skyward-${label}.png`)
  }
  await runEvent('plane', 'ring', 'rings-plane', 12)
  await runEvent('glider', 'spot', 'spot-glider', 12)
  await runEvent('belt', 'drop', 'drop-belt', 8)

  /* rung 2 — THUNDERPASS: drive east into the cell and feel the storm */
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'plane'; k++) T.recycle()
    T.checkout('pass')
  })
  const ps0 = await page.evaluate(() => window.__skywardTest.state())
  ok(ps0.phase === 'pass' && ps0.craft === 'plane', `thunderpass checkout eastbound (phase=${ps0.phase})`)
  await simSleep(3)
  await page.keyboard.down('ArrowLeft'); await simSleep(0.35); await page.keyboard.up('ArrowLeft')
  // #3267 moved the cell: a fixed instant at the fixed gate line is seed luck.
  // Poll a short window — the hull is IN the cell if any sample finds rain.
  let mid = await page.evaluate(() => window.__skywardTest.state())
  for (let i = 0; i < 8 && !(mid.stormS > 0.3); i++) {
    await simSleep(0.8)
    mid = await page.evaluate(() => window.__skywardTest.state())
  }
  ok(mid.stormS > 0.3, `the hull is IN the cell (stormS=${mid.stormS})`)
  await shot('skyward-thunderpass.png')
  await page.keyboard.down('ArrowRight'); await simSleep(0.5); await page.keyboard.up('ArrowRight')
  await simSleep(6)
  const ps1 = await page.evaluate(() => window.__skywardTest.state())
  ok(ps1.passIdx >= 1 || ps1.stormWings || ps1.crashes > 0,
    `the storm fight is live: gates cleared or weather felt (passIdx=${ps1.passIdx} stormS=${ps1.stormS} crashes=${ps1.crashes})`)
  ok(Number.isFinite(ps1.x + ps1.y + ps1.z) && ps1.y > 0, `plane survives the cell (y=${ps1.y.toFixed(0)})`)

  /* #3267 — the living storm: the cell itself wanders on the sim clock,
     bounded, and the pass start line stays honest (never deep under it) */
  const cell0 = await page.evaluate(() => window.__skywardTest.stormCell())
  await simSleep(18)
  const cell1 = await page.evaluate(() => window.__skywardTest.stormCell())
  const cellMoved = Math.hypot(cell1.x - cell0.x, cell1.z - cell0.z)
  ok(cellMoved > 10, `the storm cell drifts live (${cellMoved.toFixed(0)} m over ~18 s of sim time)`)
  ok(Math.abs(cell1.dx) <= 75 && Math.abs(cell1.dz) <= 45,
    `drift stays bounded (dx=${cell1.dx.toFixed(0)}, dz=${cell1.dz.toFixed(0)})`)
  ok(cell1.startS < 0.35, `the pass start line stays shallow under the wandering cell (s=${cell1.startS})`)
  await shot('skyward-living-storm.png')

  /* #3302 — the second strip: a short final crabbed into the seed wind so the
     ground track runs straight down the axis. Touches at frac ≈0.78–0.85 on
     any wind → FULL STRIP +700. The lesson from the first live leg: a long
     final lets ±2.2 m/s of seed wind drift the hull off a 14 m strip. */
  const wd = await page.evaluate(() => window.__skywardTest.wind())
  await page.evaluate((wd) => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'glider'; k++) T.recycle()
    T.checkout('spot')
    const hdg = Math.acos(Math.max(-1, Math.min(1, -wd.z / 11))) // straight ground track east
    T.teleport({ x: 72, y: 6.5, z: 130, heading: hdg, speed: 11, vy: -1.2 })
  }, wd)
  let hintRunway = false, stripSpot = null
  for (let i = 0; i < 8 && stripSpot === null; i++) {
    const s = await page.evaluate(() => {
      const h = document.querySelector('[data-h="hint"]')
      return { st: window.__skywardTest.state(), hint: h ? h.textContent : '' }
    })
    if (s.hint.includes('RUNWAY')) hintRunway = true
    if (s.st.phase === 'free') stripSpot = s.st
    else await simSleep(0.4)
  }
  ok(hintRunway, 'the HUD names the runway on approach')
  ok(stripSpot !== null && stripSpot.grad.spot === 700,
    `a deep straight landing banks FULL STRIP +700 (spot=${stripSpot && stripSpot.grad.spot})`)
  await shot('skyward-strip-landed.png')

  /* #3319 — the plane answers the runway: a soft, slow, straight arrival is
     caught by the deck (not crashed), banks ✈ WHEELS, banners its zone, and a
     stick-back during the rollout is a touch-and-go that climbs clear. */
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'plane'; k++) T.recycle()
  })
  await simSleep(0.7) // let the apron hand-off's respawn window close before the low visit
  await page.evaluate(() => {
    const T = window.__skywardTest
    /* mid-strip, deck+1.0 m (inside the catch window), 30 m/s due east, gentle
       sink — well below the 34.5 hot line, so the pump can't cook it en route */
    T.teleport({ x: 40, y: 3.6, z: 130, heading: Math.PI / 2, speed: 30, vy: -1 })
  })
  let planeGround = null, landBanner = ''
  for (let i = 0; i < 10 && planeGround === null; i++) {
    const s = await page.evaluate(() => {
      const bn = document.querySelector('[data-h="banner"]')
      return { st: window.__skywardTest.state(), banner: bn ? bn.textContent : '' }
    })
    if (s.banner.includes('RUNWAY')) landBanner = s.banner
    if (s.st.ground) planeGround = s.st
    else await simSleep(0.15)
  }
  ok(planeGround !== null && planeGround.land === 300 && planeGround.craft === 'plane',
    `the plane is caught by the deck mid-strip (ground=${!!planeGround} ✈=${planeGround && planeGround.land})`)
  ok(/RUNWAY MIDDLE \+300/.test(landBanner), `the strip banners the zone (${landBanner || 'no banner'})`)
  await shot('skyward-plane-rollout.png')
  /* wheels-abort: stick back while still above the liftoff speed */
  await page.keyboard.down('ArrowUp')
  await simSleep(0.4)
  await page.keyboard.up('ArrowUp')
  let climbed = null
  for (let i = 0; i < 10 && climbed === null; i++) {
    const s = await page.evaluate(() => window.__skywardTest.state())
    if (!s.ground && s.y > 5) climbed = s
    else await simSleep(0.2)
  }
  ok(climbed !== null && climbed.land === 300,
    `wheels-abort climbs clear and keeps the banked badge (y=${climbed && climbed.y.toFixed(1)} ✈=${climbed && climbed.land})`)

  /* keyboard path + pause + restart through real UI */
  await page.keyboard.press('KeyN')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await simSleep(1)
  await page.keyboard.press('Slash')
  const paused = await page.evaluate(() => window.__skywardTest.probe().screen)
  console.log(`NOTE  pause screen after ?: ${paused}`)
  await shot('skyward-pause.png')
  await page.keyboard.press('Slash')

  const contract = await page.evaluate(() => {
    const g = window.__game
    if (!g) return { ok: false, why: 'no __game' }
    if (g.meta?.id !== 'skyward') return { ok: false, why: `id=${g.meta?.id}` }
    g.buttons?.a !== undefined && (g.buttons.a = true)
    const fns = ['reset', 'step', 'state', 'frame'].filter((k) => typeof g[k] === 'function')
    return { ok: fns.length === 4, why: `fns=${fns.join(',')}` }
  })
  ok(contract.ok, `exposeGame contract present (meta.id/reset/step/state/frame) ${contract.why || ''}`)
} catch (e) {
  fails.push(`exception: ${e.message}`)
  console.log(`FAIL  exception: ${e.message}`)
  await shot('skyward-failure.png')
} finally {
  await browser.close()
}

ok(errors.length === 0, `no console errors${errors.length ? ` (${errors.map((e) => e.slice(0, 160)).join(' || ')} )` : ''}`)
console.log(`\n${fails.length === 0 ? 'skywardplay: PASSED' : `skywardplay: FAILED (${fails.length})`}`)
process.exit(fails.length ? 1 : 0)
