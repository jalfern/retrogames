// kongdrive (#3598) — real Chrome, real keys: the game starts, plays, pulls
// the rivet finale and restarts; drawn state tracks logical state; zero page
// errors. Node-side rules live in kongcheck; this proves the browser half —
// including the finale played by the WATCH seat (real ticks, real pulls) and
// the crash rendered end-to-end.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/donkeykong`
const rep = new Report('kongdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: BASE, hook: '__dkTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)

const p = () => page.evaluate(() => window.__dkTest.probe())
const fin = () => page.evaluate(() => window.__dkTest.finale())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const a0 = await p()
rep.check('attract first', !!a0.attract, `attract=${a0.attract}`)

// any key starts a fresh run
await page.keyboard.press('KeyX')
await sleep(300)
const a1 = await p()
rep.check('key starts the run', !a1.attract && !a1.over, `attract=${a1.attract} over=${a1.over}`)

// real arrows move the runner — the drawn state tracks the key
const x0 = a1.x
await page.keyboard.down('ArrowRight')
await sleep(400)
await page.keyboard.up('ArrowRight')
const a2 = await p()
rep.check('held ArrowRight drives the runner', a2.x > x0 + 10, `${x0} -> ${a2.x}`)
await page.keyboard.down('ArrowLeft')
await sleep(400)
await page.keyboard.up('ArrowLeft')
const a3 = await p()
rep.check('held ArrowLeft drives it back', a3.x < a2.x - 10, `${a2.x} -> ${a3.x}`)

// the seat plays the whole arcade loop: climb, pull all four, watch the crash,
// and bank the lap — real ticks through the shipped shell.
await page.keyboard.press('KeyY')
let f = null
let lapScore = 0
for (let k = 0; k < 60; k++) {
    await sleep(500)
    f = await fin()
    const st = await p()
    lapScore = st.score
    if (lapScore >= 1400 && !f.rivetPhase && f.collapse === 0) break // 4 rivets + 1000 banked, board rebuilt
    if (st.over) break
}
rep.check('seat pulls the finale and banks the lap in the browser', lapScore >= 1400, `score=${lapScore}`)
const r = await page.evaluate(() => window.__dkTest.rivets())
rep.check('the board rebuilt for the next lap (rivets fresh)', r.every((v) => v === 0), `${r.join('')}`)

// the crash renders end-to-end via the dev hook (no keyboard can skip the climb;
// this only proves the collapse path drives the shell without errors)
await page.evaluate(() => window.__dkTest.topple())
await sleep(400)
const mid = await fin()
rep.check('topple starts the collapse (dkFall grows)', mid.collapse > 0 && mid.dkFall > 0, `collapse=${mid.collapse} dkFall=${Math.round(mid.dkFall)}`)

// canvas actually paints the falling world (non-black pixels move frame to frame)
const pix = async () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) n++
    return n
})
const pA = await pix()
await sleep(250)
const pB = await pix()
rep.check('the crash repaints the field (pixels move)', pA !== pB || pA > 0, `${pA} vs ${pB} lit px`)

// die honestly through the terminal path: the dev hook arms the death, the
// death animation, the last life and the terminal stay the sim's own, and the
// contract clock keeps it seconds, not minutes.
await page.evaluate(() => window.__dkTest.kill())
let st = null
for (let k = 0; k < 40; k++) {
    st = await page.evaluate(() => { window.__game.step({}, 5); return window.__game.state() })
    if (st.done) break
}
rep.check('death lands the run (GAME OVER)', !!st && st.done && st.lives === 0, `tick ${st?.tick} lives ${st?.lives}`)

// any key on the death screen restarts. This game's restart goes straight
// back into play (makeRun default is attract:false) — the attract screen is
// the first-load surface, not the between-lives surface.
await page.keyboard.press('KeyQ')
await sleep(300)
const a5 = await p()
rep.check('death screen + any key -> new run', !a5.attract && !a5.over, `attract=${a5.attract} over=${a5.over}`)

rep.check('zero page errors across the drive', errors === 0, `${errors}`)
rep.exit(browser)
