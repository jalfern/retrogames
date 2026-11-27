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

// #3618 half-rungs with real arrows: walk to the broken ladder foot (x=120),
// climb part-way, hang at the break line, never pass it, step back off.
await page.keyboard.down('ArrowRight')
for (let k = 0; k < 40; k++) {
    await sleep(100)
    const s = await p()
    if (s.x >= 112) break
}
await page.keyboard.up('ArrowRight')
await page.keyboard.down('ArrowUp')
let hung = null
for (let k = 0; k < 40; k++) {
    await sleep(100)
    const s = await p()
    if (s.hang) { hung = s; break }
}
rep.check('human climbs a broken ladder and hangs at the break line (#3618)',
    !!hung && hung.climbing && hung.brk !== null && Math.abs(hung.y + 16 - hung.brk) <= 2,
    hung ? `y=${hung.y} brk=${hung.brk}` : 'never hung')
await sleep(500) // keep pushing UP at the break
const hung2 = await p()
rep.check('the break line holds — held UP never passes it', hung2.hang && hung2.y === hung.y, `${hung.y} -> ${hung2.y}`)
await page.keyboard.up('ArrowUp')
await page.keyboard.down('ArrowDown')
let off = null
for (let k = 0; k < 40; k++) {
    await sleep(100)
    const s = await p()
    if (!s.climbing && s.y >= 214) { off = s; break }
}
rep.check('climbing back down steps off onto the girder', !!off, off ? `y=${off.y}` : 'still stuck')
await page.keyboard.up('ArrowDown')

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

// #3754 — the walk-past 50, live and deterministic: DEV rig mirrors the
// Node test (barrel rolls past below a grounded runner) against the shipped
// shell on the fresh restart — the browser half of the law, no seed luck.
{
    const wpr = await page.evaluate(() => window.__dkTest.walkpast())
    rep.check('walk-past pays the arcade 50 live, exactly once', wpr.paid === 1 && wpr.delta === 50 && wpr.witnesses === 1, JSON.stringify(wpr))
}

// #3786 — the fuse in the browser: the counter burns in real seconds on a
// live board, and when it hits zero the ape takes Pauline — the grab arms,
// the life pays, and the next attempt lights a fresh fuse.
{
    // The earlier scripted sections closed the contract loop lock (step owns
    // the clock); the fuse law is a WALL-CLOCK law, so hand the rAF loop back
    // before measuring real seconds.
    await page.evaluate(() => window.__game && window.__game.release())
    const f0 = await p()
    await sleep(1300)
    const f1 = await p()
    rep.check('BONUS counts down in real seconds while the board is live',
        typeof f0.bonus === 'number' && f0.bonus - f1.bonus >= 100 && f1.bonus > 0,
        `${f0.bonus} -> ${f1.bonus}`)
    const l0 = f1.lives
    await page.evaluate(() => window.__dkTest.burnFuse())
    let capSeen = false
    for (let k = 0; k < 12 && !capSeen; k++) { await sleep(200); capSeen = (await p()).cap === 1 }
    rep.check('zero bonus arms the capture live (the grab is on the board)', capSeen, `cap=${capSeen}`)
    let healed = false
    const heal0 = Date.now()
    while (!healed && Date.now() - heal0 < 6000) {
        const q = await p()
        healed = q.lives === l0 - 1 && q.cap === 0 && q.bonus === 5000 && !q.over
        if (!healed) await sleep(200)
    }
    rep.check('the grab spends the life and rebuilds with a fresh fuse', healed, JSON.stringify(await p()))
}

rep.check('zero page errors across the drive', errors === 0, `${errors}`)
rep.exit(browser)
