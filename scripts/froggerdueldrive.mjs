// froggerdueldrive (#3676) — real Chrome, real keys: the alternating duel and
// the row-entry tell on the live page. froggercheck owns the laws; this proves
// the browser half: Enter opens 1P, `2` opens the duel on the attract screen,
// the tell visibly holds the field on a new row, P1's out-seat hands the same
// board to P2 (banner up, three frogs), the duel ends in a verdict (draw at
// 0-0), and any key restarts at a plain 1P run — zero page errors through it.
// Advisory under #737; the Node gate carries the rules.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/frogger`
const rep = new Report('froggerdueldrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=1776`, hook: '__froggerTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = () => page.evaluate(() => window.__froggerTest.state())

// 1 — attract: any key starts a plain 1P run
await page.keyboard.press('Enter')
await sleep(250)
let s = await probe()
rep.check('Enter opens a one-player run', s.attract === false && s.players === 1 && s.player === 1, JSON.stringify({ attract: s.attract, players: s.players }))

// 2 — the row-entry tell: a real ArrowUp must visibly freeze the field
//     (poll for freeze > 0 inside the hold; retries cover a crushed landing)
let sawFreeze = false
for (let i = 0; i < 12 && !sawFreeze; i++) {
    await page.keyboard.press('ArrowUp')
    for (let k = 0; k < 10 && !sawFreeze; k++) {
        await sleep(50)
        const p = await probe()
        if (p.freeze > 0) sawFreeze = true
    }
    if (!sawFreeze) await sleep(650)
}
rep.check('a real hop onto a new row holds the field (freeze observed)', sawFreeze)

// 3 — `2` at attract opens the duel
await page.reload({ waitUntil: 'load' })
await sleep(700)
await page.keyboard.press('Digit2')
await sleep(300)
s = await probe()
rep.check('`2` opens the two-player duel', s.players === 2 && s.player === 1 && s.attract === false,
    JSON.stringify({ players: s.players, player: s.player, attract: s.attract }))
rep.check('the duel carries two score lines', Array.isArray(s.scores) && s.scores.length === 2, JSON.stringify(s.scores))

// 4 — P1 out hands the SAME seat rules to P2: fresh frogs, banner ticking.
//     (DebugKit 'Force game over' drops the clock to 1 — the death lands the
//     honest way through the real tick; in a duel P1's last frog is a handoff.)
await page.evaluate(() => window.__dbg.act('Force game over'))
let handed = null
for (let i = 0; i < 40 && !handed; i++) {
    await sleep(100)
    const p = await probe()
    if (p.player === 2) handed = p
}
rep.check('P1 out at the third frog hands P2 the seat', !!handed && handed.lives === 3,
    handed ? JSON.stringify({ lives: handed.lives }) : 'no handoff within 4 s')
rep.check('the verdict is still open while P2 plays', handed && handed.over === false && handed.winner === 0,
    handed ? JSON.stringify({ done: handed.over, winner: handed.winner }) : 'n/a')

// 5 — P2 out ends the duel; 0-0 is an honest draw
await page.evaluate(() => window.__dbg.act('Force game over'))
let verdict = null
for (let i = 0; i < 40 && !verdict; i++) {
    await sleep(100)
    const p = await probe()
    if (p.over) verdict = p
}
rep.check('when P2 is out too the duel ends', !!verdict, verdict ? JSON.stringify({ done: verdict.over }) : 'no verdict in 4 s')
rep.check('tied duel draws', !!verdict && verdict.winner === 0, verdict ? `winner ${verdict.winner}` : 'n/a')

// 6 — any key restarts at a plain 1P run
await page.keyboard.press('ArrowUp')
await sleep(300)
s = await probe()
rep.check('a key after the duel restarts a 1P run', s.players === 1 && !s.over && s.over === false,
    JSON.stringify({ players: s.players, done: s.over }))

// 7 — the whole run in a clean browser
rep.check('zero page errors through the duel', errors === 0, `${errors}`)

await rep.exit(browser)
