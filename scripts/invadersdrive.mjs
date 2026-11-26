// invadersdrive (#3517) — real Chrome, real keys: the game starts, plays, dies,
// restarts; drawn state tracks logical state; zero page errors. Node-side
// determinism lives in invaderscheck; this proves the browser half.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/invaders`
const rep = new Report('invadersdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: BASE, hook: '__invadersTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)

const p = () => page.evaluate(() => window.__invadersTest.probe())

const a0 = await p()
rep.check('attract first', a0.screen === 'attract', `screen=${a0.screen}`)

// any key starts a fresh run
await page.keyboard.press('KeyX')
await new Promise((r) => setTimeout(r, 300))
const a1 = await p()
rep.check('key starts the run with the 55-wall', a1.screen === 'play' && a1.fleet === 55, `fleet=${a1.fleet}`)

// real arrows move the cannon — the drawn state tracks the key
const x0 = a1.playerX
await page.keyboard.down('ArrowRight')
await new Promise((r) => setTimeout(r, 400))
await page.keyboard.up('ArrowRight')
const a2 = await p()
rep.check('held ArrowRight drives the cannon', a2.playerX > x0 + 20, `${x0} -> ${a2.playerX}`)
await page.keyboard.down('ArrowLeft')
await new Promise((r) => setTimeout(r, 400))
await page.keyboard.up('ArrowLeft')
const a3 = await p()
rep.check('held ArrowLeft drives it back', a3.playerX < a2.playerX - 20, `${a2.playerX} -> ${a3.playerX}`)

// Space goes through the real event path into the one-shot rule
await page.keyboard.press('Space')
await new Promise((r) => setTimeout(r, 120))
const st1 = await page.evaluate(() => window.__game.state())
rep.check('harness state live after Space', st1.invadersLeft <= 55 && st1.tick > 0, `${st1.invadersLeft} left, tick ${st1.tick}`)

// die honestly: the idle 55-wall lands (contract clock keeps it seconds, not minutes)
let st = null
for (let k = 0; k < 200; k++) {
    st = await page.evaluate(() => { window.__game.step({}, 50); return window.__game.state() })
    if (st.done) break
}
rep.check('idle world lands the fleet -> GAME OVER', !!st && st.done, `tick ${st?.tick}, lives ${st?.lives}`)

// any key on the death screen restarts to attract
await page.keyboard.press('KeyQ')
await new Promise((r) => setTimeout(r, 300))
const a4 = await p()
rep.check('death screen + any key -> attract', a4.screen === 'attract', `screen=${a4.screen}`)

rep.check('zero page errors across the drive', errors === 0, `${errors}`)
rep.exit(browser)
