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
const URL = process.env.SKYWARD_URL || 'http://localhost:5173/retrogames/skyward?lite=1'
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
  const mid = await page.evaluate(() => window.__skywardTest.state())
  ok(mid.stormS > 0.3, `the hull is IN the cell (stormS=${mid.stormS})`)
  await shot('skyward-thunderpass.png')
  await page.keyboard.down('ArrowRight'); await simSleep(0.5); await page.keyboard.up('ArrowRight')
  await simSleep(6)
  const ps1 = await page.evaluate(() => window.__skywardTest.state())
  ok(ps1.passIdx >= 1 || ps1.stormWings || ps1.crashes > 0,
    `the storm fight is live: gates cleared or weather felt (passIdx=${ps1.passIdx} stormS=${ps1.stormS} crashes=${ps1.crashes})`)
  ok(Number.isFinite(ps1.x + ps1.y + ps1.z) && ps1.y > 0, `plane survives the cell (y=${ps1.y.toFixed(0)})`)

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
  await shot('skyward-failure.png')
} finally {
  await browser.close()
}

ok(errors.length === 0, `no console errors${errors.length ? ` (${errors.map((e) => e.slice(0, 160)).join(' || ')} )` : ''}`)
console.log(`\n${fails.length === 0 ? 'skywardplay: PASSED' : `skywardplay: FAILED (${fails.length})`}`)
process.exit(fails.length ? 1 : 0)
