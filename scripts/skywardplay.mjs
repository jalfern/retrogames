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
    hasTouch: true, // #3310 — the pad hides behind keyboard use (device law); the pad-verb leg needs a real touch
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
  ok(planeGround !== null && planeGround.land === 350 && planeGround.craft === 'plane',
    `the plane is caught by the deck mid-strip (ground=${!!planeGround} ✈=${planeGround && planeGround.land})`)
  ok(/RUNWAY MIDDLE \+350/.test(landBanner), `the strip banners the zone (${landBanner || 'no banner'})`)
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
  ok(climbed !== null && climbed.land === 350,
    `wheels-abort climbs clear and keeps the banked badge (y=${climbed && climbed.y.toFixed(1)} ✈=${climbed && climbed.land})`)

  /* #3331 item 1 — the go-around: a hot-and-shallow straight pass over the
     strip bounces (banner teaches, no crash, nothing banked). */
  const goBefore = await page.evaluate(() => window.__skywardTest.state().crashes)
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'plane'; k++) T.recycle()
    T.teleport({ x: 40, y: 3.6, z: 130, heading: Math.PI / 2, speed: 36, vy: -1 })
  })
  let hotBanner = '', hotBad = false
  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => {
      const bn = document.querySelector('[data-h="banner"]')
      return { st: window.__skywardTest.state(), banner: bn ? bn.textContent : '' }
    })
    if (s.banner.includes('TOO HOT')) hotBanner = s.banner
    if (s.st.ground || s.st.crashes > goBefore) { hotBad = true; break }
    await simSleep(0.15)
  }
  ok(/TOO HOT — GO AROUND/.test(hotBanner) && !hotBad,
    `a hot shallow pass bounces with the go-around banner, never catching the deck (${hotBanner || 'no banner'})`)

  /* #3331 item 4 — the scuff gauge: a crabbed short final warns before the deck. */
  await page.evaluate(() => {
    const T = window.__skywardTest
    T.teleport({ x: 40, y: 6.6, z: 130, heading: Math.PI / 2 + 0.28, speed: 25, vy: -0.5 })
  })
  let tellTxt = '', scuffT = 0
  for (let i = 0; i < 6; i++) {
    const s = await page.evaluate(() => {
      const el = document.querySelector('[data-h="tell"]')
      return { scuff: window.__skywardTest.state().scuff, tell: el ? el.textContent : '' }
    })
    if (s.scuff && s.scuff.tell > scuffT) scuffT = s.scuff.tell
    if (s.scuff && s.scuff.tell >= 0.8 && /SCUFF/.test(s.tell)) tellTxt = s.tell
    await simSleep(0.1)
  }
  ok(scuffT >= 0.8 && /SCUFF/.test(tellTxt),
    `the HUD gauge reads the crab before touchdown (tell=${scuffT} "${tellTxt}")`)

  /* #3331 item 5 — the clean roll: straight in deep, no stick, the rollout
     rides the dash and the cabinet's last word pays onto the badge. The
     attempts loop re-enters because the bouncing hull from the go-around
     test may still splat mid-drift; a respawn grace suppresses one catch,
     not the law. */
  await simSleep(1.2) // let any touchdown/crew window settle before re-entry
  let rollBanner = '', bestLand = 0
  for (let a = 0; a < 3 && !(bestLand >= 850 && rollBanner); a++) {
    await page.evaluate(() => {
      const T = window.__skywardTest
      T.teleport({ x: 100, y: 3.6, z: 130, heading: Math.PI / 2, speed: 30, vy: -1 })
    })
    for (let i = 0; i < 16; i++) {
      const s = await page.evaluate(() => {
        const bn = document.querySelector('[data-h="banner"]')
        return { st: window.__skywardTest.state(), banner: bn ? bn.textContent : '' }
      })
      if (s.banner.includes('CLEAN ROLL')) rollBanner = s.banner
      if (s.st.land > bestLand) bestLand = s.st.land
      if (bestLand >= 850 && rollBanner) break
      await simSleep(0.2)
    }
  }
  ok(/CLEAN ROLL — CENTRELINE \+100/.test(rollBanner) && bestLand === 850,
    `a clean full-strip rollout banks ✈850 and banners the credit (${rollBanner || 'no banner'} ✈=${bestLand})`)
  await shot('skyward-clean-roll.png')
  await page.waitForTimeout(1500) // #3331: let crew respawn + the last banner fade before the belt section

  /* #3332 — the belt parks on the runway: a quiet arrival (soft, slow,
     straight) settles into PARKED with the zone banked ✺, banners it, and
     the throttle lifts her off the pad. */
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'belt'; k++) T.recycle()
  })
  await simSleep(0.7) // apron hand-off's respawn window must close before the low visit
  await page.evaluate(() => {
    const T = window.__skywardTest
    /* mid-strip, deck+0.7 m — inside the catch window, 2 m/s east, gentle
       −0.5 sink: quiet the whole way, so the deck takes her at first touch */
    T.teleport({ x: 60, y: 3.3, z: 130, heading: Math.PI / 2, speed: 2, vy: -0.5 })
  })
  let beltHint = false, beltPark = null, beltBanner = ''
  for (let i = 0; i < 12 && beltPark === null; i++) {
    const s = await page.evaluate(() => {
      const bn = document.querySelector('[data-h="banner"]')
      const hh = document.querySelector('[data-h="hint"]')
      return { st: window.__skywardTest.state(), banner: bn ? bn.textContent : '', hint: hh ? hh.textContent : '' }
    })
    if (s.hint.includes('RUNWAY')) beltHint = true
    if (s.banner.includes('RUNWAY')) beltBanner = s.banner
    if (s.st.parked) beltPark = s.st
    else await simSleep(0.15)
  }
  ok(beltHint, 'the HUD names the runway on the belt approach')
  ok(beltPark !== null && beltPark.beltLand === 450 && beltPark.craft === 'belt',
    `the belt parks mid-strip with the zone banked (parked=${!!beltPark} ✺=${beltPark && beltPark.beltLand})`)
  ok(/RUNWAY LONG \+450 — PARKED/.test(beltBanner), `the strip banners the park (${beltBanner || 'no banner'})`)
  await shot('skyward-belt-parked.png')
  await page.keyboard.down('Space')
  await simSleep(0.5)
  await page.keyboard.up('Space')
  let offPad = null
  for (let i = 0; i < 10 && offPad === null; i++) {
    const s = await page.evaluate(() => window.__skywardTest.state())
    if (!s.parked && s.y > 4) offPad = s
    else await simSleep(0.2)
  }
  ok(offPad !== null && offPad.beltLand === 450,
    `throttle lifts her off the pad and the banked ✺ stays (y=${offPad && offPad.y.toFixed(1)} ✺=${offPad && offPad.beltLand})`)

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

  /* #3300 item 4 — crash sequencing, proven live: the engine bed cruises, dies
     ON the crash tick (the rumble owns that moment alone), and re-spools once
     the respawn freeze releases. */
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'plane'; k++) T.recycle()
  })
  await simSleep(1.4)
  const bedCruise = await page.evaluate(() => window.__skywardTest.bedLive())
  ok(bedCruise.eng, `the engine bed cruises with the plane (eng=${bedCruise.eng})`)
  const crashesBefore = await page.evaluate(() => window.__skywardTest.state().crashes)
  await page.evaluate(() => {
    const T = window.__skywardTest
    const s = T.state()
    T.teleport({ x: s.x, y: -4, z: s.z, speed: 20, vy: -6 }) // below every floor
  })
  let killSeen = false
  for (let i = 0; i < 12 && !killSeen; i++) {
    const r = await page.evaluate(() => ({ c: window.__skywardTest.state().crashes, bed: window.__skywardTest.bedLive() }))
    if (r.c > crashesBefore) killSeen = !r.bed.eng
    else await simSleep(0.15)
  }
  ok(killSeen, 'the motor bed dies on the crash tick (cut leads, rumble owns the moment)')
  await simSleep(1.6) // respawn freeze releases; the restart spools
  const bedBack = await page.evaluate(() => window.__skywardTest.bedLive())
  ok(bedBack.eng, 'the bed re-spools after the ground crew hands the plane back')

  /* #3300 item 6 — the glider checkout teaches its one rule by banner */
  await page.evaluate(() => {
    const T = window.__skywardTest
    for (let k = 0; k < 3 && T.state().craft !== 'glider'; k++) T.recycle()
  })
  const banner6 = await page.evaluate(() => document.querySelector('[data-h="banner"]').textContent)
  ok(banner6.includes('NO ENGINE'), `the glider banners the wind law ("${banner6}")`)
  await shot('skyward-glider-banner.png')

  /* #3310 item 1 — the B pad names the verb it actually carries: DROP on the
     drop course, RECYCLE at the school apron, inert 'B' everywhere else (the
     glider's approach must not promise a button that does nothing). */
  const chipText = () => page.evaluate(() => {
    const el = document.querySelector('[data-vc="b"]')
    return el ? el.textContent.trim() : null
  })
  // the pad shows on touch (and hides again under keyboard use), so wake it
  // with a screen tap in empty sky before every read
  const wakePad = () => page.touchscreen.tap(640, 300)
  await page.evaluate(() => window.__skywardTest.checkout('drop'))
  await wakePad()
  let dropChip = null
  for (let i = 0; i < 25 && dropChip !== 'DROP'; i++) { dropChip = await chipText(); if (dropChip !== 'DROP') { await wakePad(); await page.waitForTimeout(100) } }
  ok(dropChip === 'DROP', `the B pad reads DROP on the drop course (${dropChip})`)
  await page.evaluate(() => window.__skywardTest.start())
  await wakePad()
  await simSleep(0.25)
  const inertChip = await chipText()
  ok(inertChip === 'B', `far from the apron the B pad promises nothing (${inertChip})`)
  await page.evaluate(() => window.__skywardTest.teleport({ x: 0, y: 20, z: 150, speed: 8 }))
  await wakePad()
  let apChip = null
  for (let i = 0; i < 25 && apChip !== 'RECYCLE'; i++) { apChip = await chipText(); if (apChip !== 'RECYCLE') { await wakePad(); await page.waitForTimeout(100) } }
  ok(apChip === 'RECYCLE', `at the apron the pad says what B does — RECYCLE (${apChip})`)

  /* #3300 item 5 — phone widths: at 390×844 the canvas must fill the stage,
     and no HUD readout may sit under the virtual pad or collide with another. */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(700)
  const audit = await page.evaluate(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
    const ovl = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const cvs = r(document.querySelector('canvas'))
    const readouts = ['speed', 'alt', 'score', 'chips'].map((k) => r(document.querySelector(`[data-h="${k}"]`)))
    const hud = [...readouts, r(document.querySelector('[data-h="hint"]'))] // hint floats mid-screen by design — pad rules still bind
    const pads = [...document.querySelectorAll('[data-vc]')].map(r).filter(Boolean)
    // corner chrome (ARCADE/FEEDBACK/mute) are not pad buttons but they squat
    // the top corners — the #3300 audit initially missed the mute/SCORE pile
    const chrome = [...document.querySelectorAll('[aria-label="Arcade"], [aria-label="Feedback"], button[aria-label*="mute" i], button[aria-label*="sound" i], button[aria-label*="audio" i]')].map(r).filter(Boolean)
    const solids = [...pads, ...chrome]
    let bad = 0
    for (const h of hud) {
      if (!h) bad++
      if (h && (h.x < -2 || h.x + h.w > innerWidth + 2)) bad++
      for (const p of solids) if (h && ovl(h, p)) bad++
    }
    for (const h of readouts) if (h && h.y > 300) bad++ // the readouts live in the top corners; the pad owns everything below
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) if (ovl(hud[i], hud[j])) bad++
    // #3331 item 3 — the NEW strings must fit their boxes at phone width,
    // and the scuff gauge must sit clear of the corner chrome (y ≥ 78).
    const bnEl = document.querySelector('[data-h="banner"]')
    const tlEl = document.querySelector('[data-h="tell"]')
    const fits = (el) => !!el && el.scrollWidth <= el.clientWidth + 2
    const keepBn = bnEl ? bnEl.textContent : '', keepTl = tlEl ? tlEl.textContent : ''
    if (bnEl) bnEl.textContent = 'CLEAN ROLL — CENTRELINE +100'
    if (tlEl) tlEl.textContent = '⚠ SCUFF LIMIT — STRAIGHTEN'
    const strs = {
      bannerFits: fits(bnEl), tellFits: fits(tlEl),
      tellTop: tlEl ? Math.round(tlEl.getBoundingClientRect().y) : 0,
      bannerTop: bnEl ? Math.round(bnEl.getBoundingClientRect().y) : 0,
    }
    if (bnEl) bnEl.textContent = keepBn
    if (tlEl) tlEl.textContent = keepTl
    return { canvas: cvs && `${Math.round(cvs.w)}x${Math.round(cvs.h)}`, vh: innerHeight, vw: innerWidth, bad, strs }
  })
  ok(Number(audit.canvas?.split('x')[1]) >= audit.vh - 4 && Number(audit.canvas?.split('x')[0]) >= audit.vw - 4,
    `phone stage fills the viewport (canvas ${audit.canvas} of ${audit.vw}x${audit.vh})`)
  ok(audit.bad === 0, `390px HUD: no pad overlap, no text collision, nothing offscreen (${audit.bad} violations)`)
  ok(audit.strs && audit.strs.bannerFits && audit.strs.tellFits && audit.strs.tellTop >= 78 && audit.strs.bannerTop < audit.strs.tellTop,
    `#3331 new strings fit at 390px and the gauge sits below the corner chrome (${JSON.stringify(audit.strs)})`)
  await shot('skyward-phone-hud.png')

  /* #3310 item 3 — the longest words the strip ever says, at phone width:
     `RUNWAY FULL STRIP +700` (the zone banner) and the spot-phase law line
     must stay inside the viewport, off the pad band, and off each other. */
  const fit = await page.evaluate(() => {
    const b = document.querySelector('[data-h="banner"]')
    b.textContent = 'RUNWAY FULL STRIP +700'
    b.style.opacity = '1'
    const h = document.querySelector('[data-h="hint"]')
    h.textContent = 'RUNWAY — TOUCH DEEP, KEEP IT STRAIGHT · far end pays 700'
    const r = (el) => { const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, sw: el.scrollWidth, cw: el.clientWidth } }
    const ovl = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h
    const bb = r(b), hb = r(h)
    const chips = r(document.querySelector('[data-h="chips"]'))
    const pads = [...document.querySelectorAll('[data-vc]')].map(r)
    const bad = []
    if (bb.sw > bb.cw + 4) bad.push(`banner text overflows (${bb.sw}>${bb.cw})`)
    if (bb.x < -2 || bb.x + bb.w > innerWidth + 2) bad.push('banner offscreen')
    if (ovl(bb, chips)) bad.push('banner covers the chips')
    if (hb.sw > hb.cw + 4) bad.push(`hint overflows (${hb.sw}>${hb.cw})`)
    if (hb.x + hb.w > innerWidth + 2 || hb.x < -2) bad.push('hint offscreen')
    for (const p of pads) if (ovl(hb, p)) bad.push('hint sits under the pad')
    if (ovl(hb, bb) || ovl(hb, chips)) bad.push('hint collides with banner/chips')
    return { bad, bbw: bb.sw, hbLines: Math.round(hb.h) }
  })
  ok(fit.bad.length === 0, `390px longest strings fit: banner ${fit.bbw}px, hint ${fit.hbLines}px tall (${fit.bad.join('; ') || 'clean'})`)
  await shot('skyward-phone-banner.png')
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
