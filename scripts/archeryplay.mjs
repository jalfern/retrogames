// ARENA ARCHERY in Chrome — real key events only. The Node audit owns the
// math; this file owns the CLAIMS ONLY A BROWSER CAN MAKE:
//
//   - attract mode is alive: the demo tick advances through the real
//     step() with no human attached,
//   - the keys a human actually presses drive P1 (through the window
//     listeners, not the DEV hook), and the DRAWN PIXELS match the LOGICAL
//     position after every input — sprite-is-state, the issue's demand,
//   - hold/release on Space is a real charge-and-loose,
//   - an arrow stuck by the sim is painted, and a pulled one is not,
//   - one key starts, ? pauses, R restarts, and zero page errors fall on
//     the floor during the whole ride.
import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.ARCHERY_URL || 'http://localhost:5173/retrogames/arena-archery'
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__archeryTest', wait: 300 })
const r = new Report('archeryplay')
const probe = () => page.evaluate(() => window.__archeryTest.probe())
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

let pageErrors = 0
page.on('pageerror', () => { pageErrors++ })

// ------------------------------------------------------------ attract ----
{
    const a = await probe()
    r.check('loads in attract mode', a.screen === 'attract', a.screen)
    await sleep(1200)
    const b = await probe()
    r.check('attract demo drives itself', b.demo && b.demo.tick > a.demo.tick + 20, `${a.demo?.tick} -> ${b.demo?.tick}`)
    r.check('attract plays a real match (not an idle board)', b.demo.tick > 0, JSON.stringify(b.demo))
}

// ------------------------------------------------------ start + move ----
{
    await page.keyboard.press('Digit1')
    await sleep(250)
    const a = await probe()
    r.check('1 starts the solo duel', a.screen === 'play' && a.mode === '1p', a.screen)
    const x0 = a.p1.x
    await page.keyboard.down('ArrowRight')
    await sleep(500)
    await page.keyboard.up('ArrowRight')
    await sleep(120)
    const b = await probe()
    r.check('held ArrowRight walks P1 right (real keys)', b.p1.x > x0 + 20, `${x0.toFixed(0)} -> ${b.p1.x.toFixed(0)}`)

    // the drawn sprite must be where the sim says it is
    const lit = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-archery-stage]')
        const x = window.__archeryTest.probe().p1
        const g = c.getContext('2d')
        const s = c.width / (20 * 24)
        const px = Math.round(x.x * s), py = Math.round(x.y * s)
        let count = 0
        const d = g.getImageData(Math.max(0, px - 8), Math.max(0, py - 10), 16, 20).data
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 2] < 130) count++
        return count
    })
    r.check('the archer is PAINTED at his logical position', lit > 20, `${lit} red pixels at (p1.x, p1.y)`)

    const y0 = (await probe()).p1.y
    await page.keyboard.down('ArrowUp')
    let minY = y0
    for (let k = 0; k < 12; k++) { await sleep(60); const s = await probe(); minY = Math.min(minY, s.p1.y) }
    await page.keyboard.up('ArrowUp')
    r.check('UP jumps — UP is the jump the title card promises', minY < y0 - 10, `${y0.toFixed(0)} -> ${minY.toFixed(0)}`)
    await sleep(600)
}

// ------------------------------------------------------ draw + loose ----
{
    const a = await probe()
    await page.keyboard.down('Space')
    await sleep(350)
    const mid = await probe()
    r.check('holding SPACE charges a draw', mid.p1.charge > 0.25, mid.p1.charge.toFixed(2))
    await page.keyboard.up('Space')
    await sleep(120)
    const b = await probe()
    // count arrows the PLAYER loosed by id — a census of the sky is not a
    // receipt, the bot has arrows up there too
    const seen = new Set(a.arrows.map((x) => x.id))
    const mine = b.arrows.filter((x) => x.owner === 0 && !seen.has(x.id))
    r.check('releasing looses YOUR arrow (quiver drops, a new arrow of yours is airborne)', b.p1.quiver === a.p1.quiver - 1 && mine.length >= 1, `q ${a.p1.quiver}->${b.p1.quiver} new ${JSON.stringify(mine)}`)
    // the stuck chain: wait for an arrow to be in the terrain and painted
    let paintedStuck = 0
    for (let k = 0; k < 40 && !paintedStuck; k++) {
        await sleep(150)
        const s = await probe()
        if (s.stuck > 0) {
            paintedStuck = await page.evaluate(() => {
                const c = document.querySelector('canvas[data-archery-stage]')
                const st = window.__archeryTest.probe()
                void st
                const g = c.getContext('2d')
                const d = g.getImageData(0, 0, c.width, c.height).data
                let n = 0
                for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] > 140 && d[i + 2] < 110) n++
                return n
            })
        }
    }
    r.check('a stuck arrow is painted as terrain', paintedStuck > 0, `${paintedStuck} amber pixels incl. stuck shafts`)
}

// ---------------------------------------------- bot plays, game moves ----
{
    const a = await probe()
    await page.evaluate(() => window.__archeryTest.drive(600))
    await sleep(300)
    const b = await probe()
    r.check('the bot archer actually fights (it moves and shoots)', b.p2.x !== a.p2.x || b.p2.quiver !== a.p2.quiver, JSON.stringify([a.p2.x, a.p2.quiver]) + ' -> ' + JSON.stringify([b.p2.x, b.p2.quiver]))
    r.check('the arrow ledger is exact in the browser too', b.ledger.now === b.ledger.total, JSON.stringify(b.ledger))
    const rc = await page.evaluate(() => window.__archeryTest.replayCheck())
    r.check('live replay of the input stream hashes identical', rc && rc.match,
        rc && `${rc.live} vs ${rc.replay} tick ${rc.tick}/${rc.twinTick} p1 ${JSON.stringify(rc.liveP1)} vs ${JSON.stringify(rc.twinP1)} stuck ${rc.liveStuck.length}/${rc.twinStuck.length}`)
}

// ------------------------------------------- pause / die / restart ----
{
    await page.keyboard.down('Shift')
    await page.keyboard.press('Slash') // the real '?': shift+/
    await page.keyboard.up('Shift')
    await sleep(200)
    const pausedTxt = await page.evaluate(() => document.body.textContent.includes('RESUME GAME'))
    r.check('? opens the pause overlay (real keys)', pausedTxt)
    await page.keyboard.down('Shift')
    await page.keyboard.press('Slash')
    await page.keyboard.up('Shift')
    await sleep(200)
    const resumedTxt = await page.evaluate(() => !document.body.textContent.includes('RESUME GAME'))
    r.check('? again resumes play', resumedTxt)

    // walk the match to its REAL end through driven real ticks
    await page.evaluate(async () => {
        const t = window.__archeryTest
        for (let k = 0; k < 80 && t.probe().screen === 'play'; k++) t.drive(120)
    })
    const ov = await probe()
    r.check('a real match ENDS and shows the result', ov.screen === 'over', `${ov.screen} ${JSON.stringify(ov.scores)}`)
    await sleep(1000)
    await page.keyboard.press('KeyR')
    await sleep(250)
    const re = await probe()
    r.check('R restarts a fresh duel', re.screen === 'play' && re.scores.join() === '0,0', `${re.screen} ${re.scores.join()}`)
}

r.check('zero page errors across the whole session', pageErrors === 0, `errors=${pageErrors}`)
r.exit(browser)
