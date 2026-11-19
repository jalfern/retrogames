// britannreadycheck.mjs — #2770: BRITANNIA must be DRIVABLE AT EXPOSE.
//
// The nightly bot hit `tick did not advance on step 1` (#2769) because the DEV
// contract published __game at mount while the world still unrolled: reset/tick
// silently no-op until load() finished (fetch ultima4.jsdos → inflate → world
// plots → S = fresh(0)). The fix publishes only once the world stands, and an
// input that lands during the unroll starts the game at the landing instead of
// leaking a stale action into play.
//
// Proves it by THROTTLING the map fetch (route intercept, +2.5 s) so the load
// window is minutes-wide for the gate and milliseconds-wide for a player:
//   A. nothing is published while the map crosses the wire; the first sight of
//      __game is drivable — state().ready true and the first step advances tick.
//   B. a key that arrives mid-flight starts the game at the landing (tick runs
//      on its own — attract never steps), with no gate menu and no page errors.
//   C. source laws pin the shape so a refactor can't silently republish early.
//
// Usage: node scripts/britanniareadycheck.mjs   (needs `npm run dev` on $DEV_PORT)
// Proven-fail mutant: publish at mount (`if (devUp) devUp()` moved above the
// load() call) — gate A's mid-flight absence and drivability both go red, and
// gate B starts in attract so its tick stays 0.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launchChrome } from './lib/chromeboot.mjs'
import { requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const GAME_URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/britannia`
const MAP = '**/ultima4.jsdos'
const SLOW_MS = +(process.env.BRITANNIA_SLOW_MS || 2500)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
await requireDevServer(GAME_URL)
const r = new Report('britannreadycheck')
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => {
    // Headless-box audio-backend noise (carpetcheck/britannidrive carve-out):
    // thrown by the browser process, never by app code.
    if (/AudioContext encountered an error from the audio device/i.test(String(e))) return
    errs.push(String(e))
})
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text()) && !/favicon|AudioContext encountered an error from the audio device/i.test(m.text())) errs.push(m.text()) })

// widen the load window: hold the map response on the wire
await page.route(MAP, (route) => { setTimeout(() => route.continue().catch(() => {}), SLOW_MS) })

// --- A. nothing published mid-flight; first sight is drivable ---
await page.goto(GAME_URL, { waitUntil: 'commit' })
await page.waitForRequest(MAP, { timeout: 20000 })
const early = await page.evaluate(() => ({ game: typeof window.__game, dbg: typeof window.__britanniaTest }))
r.check('nothing published while the map crosses the wire (#2770)', early.game === 'undefined' && early.dbg === 'undefined', JSON.stringify(early))
await sleep(400) // still mid-flight (the response is held ~2.5 s)
r.check('still unpublished mid-flight', await page.evaluate(() => typeof window.__game) === 'undefined')
await page.waitForFunction('!!window.__game', null, { timeout: 30000 })
const driv = await page.evaluate(() => {
    const g = window.__game
    const s0 = g.state()
    const s1 = g.step({}, 1)
    g.release()
    return { ready: s0.ready, seed: s0.seed, t0: s0.tick, t1: s1.tick }
})
r.check('the first sight of __game is drivable: ready, and one step advances one tick (#2770)',
    driv.ready === true && driv.t1 === driv.t0 + 1, JSON.stringify(driv))

// --- B. input during the unroll starts the game at the landing ---
await page.reload({ waitUntil: 'commit' })
await page.waitForRequest(MAP, { timeout: 20000 })
await page.keyboard.down('ArrowRight')
await sleep(300)
r.check('a held key mid-flight does not force a premature publish',
    await page.evaluate(() => typeof window.__game) === 'undefined')
await page.waitForFunction('!!window.__game', null, { timeout: 30000 })
await sleep(500) // the landing has passed; play mode steps on its own clock
await page.keyboard.up('ArrowRight')
const st = await page.evaluate(() => {
    const s = window.__game.state()
    window.__game.release()
    return { ready: s.ready, tick: s.tick, gate: s.gate, done: s.done, face: s.face }
})
r.check('the key that arrived during the unroll starts the game at the landing (#2770)',
    st.ready === true && st.tick > 0, JSON.stringify(st))
r.check('the landing opened the walk: the held key turns the pilgrim, and the run never won outright (#2770)',
    st.face === 'right' && st.done === false, JSON.stringify(st))
r.check('the landing honours the world it woke in: the gate menu only ever shows a real gate index (#2770)',
    st.gate === -1 || st.gate === 0, JSON.stringify(st))

// --- C. source laws: shape pinned so no refactor republishes early ---
const src = readFileSync(`${ROOT}src/games/Britannia/index.jsx`, 'utf8')
const cWorld = src.indexOf('S = fresh(0)\n            S.camX')
const cPublish = src.search(/if \(devUp\) devUp\(\)/)
r.check('source law: the publish runs inside load(), after the world stands',
    cWorld > -1 && cPublish > cWorld, `world@${cWorld} publish@${cPublish}`)
r.check('source law: exposeGame lives inside devUp — built at mount, fired at landing',
    /devUp = \(\) => \{[\s\S]{0,6000}?exposeGame\(\{/.test(src))
r.check('source law: key and tap both arm the start during the unroll (#2770)',
    (src.match(/startArmed = true/g) || []).length >= 2)
r.check('source law: the landing drains stale taps before starting, held keys walk (#2770)',
    /startArmed \|\| held\.size > 0\) \{[\s\S]{0,40}?taps\.clear\(\);\s*startGame\(\)\s*\}/.test(src))

r.check('zero page errors across the whole readiness drive', errs.length === 0, errs.join(' | '))
await r.exit(browser)
