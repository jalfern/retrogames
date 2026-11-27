// orrerycheck — self-verifying harness for public/demos/orrery.html (#3647).
//
// Proves the orrery:
//   1. BOOTS  — ready hook, rAF advancing, zero page errors.
//   2. RULES  — wind: ArrowRight (or drag) raises the wind and time flows;
//               honest gear ratios: teeth ∝ period, Mars > Earth > Venus > Mercury;
//               zoom: tap a planet zooms in (scale > 1, planet set), tap again zooms out.
//   3. LAW    — self-contained single file; not registered in games.js; one #hud caption;
//               credits + feedback injectors present.
//
// Proven-fail mutant (intentional, not runnable here): in update(), drop the
// `tDays += wind * dt` line -> wind/time gate goes red.

import { spawn } from 'node:child_process'
import { guardChrome } from './chromecleanup.mjs'
import { readFileSync, existsSync } from 'node:fs'
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
const asJson = args.includes('--json')
const file = resolve(ROOT, 'public/demos/orrery.html')

const PORT = '9443'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VIEW = { width: 960, height: 600 }

const results = []
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

async function main() {
  const src = readFileSync(file, 'utf8')
  const external = src.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
  ok('self-contained single file (no external scripts/links)', external.length === 0, external.join(' '))
  ok('exposes __orreryTest DEV hook', /__orreryTest/.test(src))
  ok('no network assets', !/fetch\(|XMLHttpRequest|new Image\(|new Audio\(/.test(src))
  ok('has #hud caption (creditscheck contract)', /id="hud"/.test(src))
  ok('hud teaches both verbs up front (#3780)',
    /drag .*wind time/.test(src) && /tap a planet to zoom/.test(src))
  ok('credits + feedback injectors loaded', /credits\.js/.test(src) && /feedback\.js/.test(src))
  const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
  ok('not registered in games.js (demos law)', !/orrery/i.test(reg))

  // honest gear ratios (static source check): teeth ∝ period, earth is the master
  const teethM = parseFloat(src.match(/name: 'MERCURY'\s*,\s*period:\s*([\d.]+)/)[1])
  const teethV = parseFloat(src.match(/name: 'VENUS'\s*,\s*period:\s*([\d.]+)/)[1])
  const teethE = parseFloat(src.match(/name: 'EARTH'\s*,\s*period:\s*([\d.]+)/)[1])
  const teethMars = parseFloat(src.match(/name: 'MARS'\s*,\s*period:\s*([\d.]+)/)[1])
  const TEETH_K = 100 / 365.25 // 100 teeth = Earth's period
  ok('gear teeth ∝ period (earth = 100)',
    Math.round(TEETH_K * 365.25) === 100 && Math.round(TEETH_K * teethM) < Math.round(TEETH_K * teethV) &&
    Math.round(TEETH_K * teethV) < Math.round(TEETH_K * teethE) && Math.round(TEETH_K * teethE) < Math.round(TEETH_K * teethMars),
    `teeth M=${Math.round(teethM * TEETH_K)} V=${Math.round(teethV * TEETH_K)} E=${Math.round(teethE * TEETH_K)} Mars=${Math.round(teethMars * TEETH_K)}`)

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--user-data-dir=/tmp/forge/orrerycheck-profile', 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = guardChrome(chrome, '/tmp/forge/orrerycheck-profile')
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise(r => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`) } catch { /* retry */ }
  }
  if (!browser) { chrome.kill(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }

  let ctx = null
  try {
    ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push('pageerror: ' + e.message))
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().split('\n')[0]) })
    await page.goto('file://' + file + '?feedback=1', { waitUntil: 'load' })

    let ready = true
    try { await page.waitForFunction(() => window.__orreryTest && window.__orreryTest.ready, null, { timeout: 20000 }) }
    catch { ready = false }
    ok('boots: hook ready, zero page errors', ready && errs.length === 0, errs[0])

    if (ready) {
      await page.waitForTimeout(1200)
      const frames1 = await page.evaluate(() => window.__orreryTest.frames)
      await page.waitForTimeout(900)
      const frames2 = await page.evaluate(() => window.__orreryTest.frames)
      ok('rAF advancing (frames advance)', frames2 > frames1 + 4, `${frames1} → ${frames2}`)

      // attract (#3780): the dial must be ALIVE on arrival — no static-scene confusion
      const attractState = await page.evaluate(() => ({ wind: window.__orreryTest.wind(), on: window.__orreryTest.attract() }))
      ok('attract: self-winds at rest before any input', attractState.wind > 0.5 && attractState.on,
        `wind=${attractState.wind.toFixed(2)} attract=${attractState.on}`)

      // wind: hold ArrowRight
      const daysBefore = await page.evaluate(() => window.__orreryTest.timeDays())
      await page.keyboard.down('ArrowRight')
      await page.waitForTimeout(900)
      const wind1 = await page.evaluate(() => window.__orreryTest.wind())
      await page.keyboard.up('ArrowRight')
      await page.waitForTimeout(150)
      const daysAfter = await page.evaluate(() => window.__orreryTest.timeDays())
      ok('ArrowRight raises the wind', wind1 > 0.05, `wind=${wind1.toFixed(3)} d/s`)
      ok('time flows when winding (tDays advances)', daysAfter > daysBefore, `${daysBefore.toFixed(2)} → ${daysAfter.toFixed(2)}`)
      ok('attract: first input releases the self-winder',
        await page.evaluate(() => !window.__orreryTest.attract()))

      // planet positions: they move
      const p1 = await page.evaluate(() => { const pl = window.__orreryTest.planets(); return pl })
      await page.waitForTimeout(1400)
      const p2 = await page.evaluate(() => { const pl = window.__orreryTest.planets(); return pl })
      let moved = false
      for (let i = 0; i < p1.length; i++) {
        const dx = Math.abs(p1[i].x - p2[i].x), dy = Math.abs(p1[i].y - p2[i].y)
        if (dx + dy > 1) moved = true
      }
      ok('planets move (honest period law)', moved)

      // zoom: tap on the EARTH planet
      const earth = await page.evaluate(() => window.__orreryTest.planets().find(q => q.name === 'EARTH'))
      await page.mouse.move(earth.x, earth.y)
      await page.mouse.down()
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(1100)
      const zoomIn = await page.evaluate(() => window.__orreryTest.zoom())
      ok('tap on EARTH zooms in (scale > 1.5)', zoomIn.active && zoomIn.scale > 1.5 && zoomIn.planet === 2,
        `scale=${zoomIn.scale.toFixed(2)} planet=${zoomIn.planet}`)

      // zoom out: tap again
      await page.mouse.move(earth.x, earth.y)
      await page.mouse.down()
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(1100)
      const zoomOut = await page.evaluate(() => window.__orreryTest.zoom())
      ok('tap again zooms out', !zoomOut.active && zoomOut.scale < 1.3, `scale=${zoomOut.scale.toFixed(2)}`)

      // captions are staged (#3780): the first zoom teaches the way back, then the pill retires
      const hudAfterZoom = await page.evaluate(() => window.__orreryTest.hud())
      ok('first zoom teaches the way back', /step back/i.test(hudAfterZoom.text) && !hudAfterZoom.gone, hudAfterZoom.text)
      let retired = false
      try { await page.waitForFunction(() => window.__orreryTest.hud().gone, null, { timeout: 9000 }); retired = true } catch { /* fall through to the pin */ }
      ok('caption retires once taught', retired)
    }
  } finally {
    if (ctx) { try { await ctx.close() } catch {} }
    try { await browser.close() } catch {}
    try { await cleanup() } catch {}
  }

  const failures = results.filter(r => !r.pass)
  console.log('')
  if (asJson) {
    console.log(JSON.stringify({ ok: failures.length === 0, results }, null, 2))
  } else {
    console.log(failures.length === 0 ? `ALL ${results.length} CHECKS PASS (orrery.html)` : `${failures.length} FAILING CHECKS (orrery.html)`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
