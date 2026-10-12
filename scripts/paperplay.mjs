// PAPERBOY — Chrome rides the route with NOTHING but real key events, and
// the claims a Node harness cannot see are graded in PIXELS:
//
//   npm run paperplay     (needs `npm run dev`)
//
//   1. THE DEMO IS ALIVE — the proven route plays itself and delivers.
//   2. THE INPUT PATH — held arrows steer, and the drawn boy is painted at
//      the exact column proj(x) says he is (projection lies die here).
//   3. THE DOOR WINDOW IN REAL TIME — wait for s to enter the window, one
//      real Space at the right instant = a delivery and a streak.
//   4. THE LEAN GATE BITES — the same throw from centre wastes paper.
//   5. A CRASH PAYS A LIFE — straight into a named crate, on the real clock.
//   6. LAST LIFE, OVER SCREEN, ONE KEY BACK — and the game plays again.
//   7. ? pauses; zero page errors throughout.
// The slack rule, route audit and determinism live in papercheck (Node).

import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.PB_URL || 'http://localhost:5173/retrogames/paperboy'
await requireDevServer(URL)

const r = new Report('paperplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 700, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__paperTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
// arrows are HELD, never tapped: a press() can fit inside one frame gap
// and be swallowed between two 60Hz samples (the keepplay lesson)
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }
const waitEv = async (pred, tries = 220) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        const ev = s.evLog.find(pred)
        if (ev) return ev
        await wait(50)
    }
    return null
}
const setup = (o) => page.evaluate((x) => window.__paperTest.setup(x), o)
const ensureSetup = async (o) => {
    for (let i = 0; i < 8; i++) {
        if (await setup(o)) return true
        await wait(300)
    }
    return false
}

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__paperTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__paperTest never appeared (dev server? /paperboy route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(900)

// ---- attract: the solver's proven route rides a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let tickGrew = false, delivered = 0
    const t0 = a.tick
    for (let i = 0; i < 30; i++) {
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 120
        delivered = Math.max(delivered, s.delivered, s.evLog.filter((e) => e.type === 'deliver').length)
        await wait(200)
    }
    r.check('the proven demo is live (ticks advance)', tickGrew, `tick ${t0} -> ${(await probe()).tick}`)
    r.check('the demo actually delivers papers', delivered > 0, `delivered=${delivered}`)
}

// ---- a real key leaves attract ----
await page.keyboard.press('KeyZ')
await wait(250)
let s = await probe()
r.check('any key starts the route', s.screen === 'play', `screen=${s.screen}`)

// ---- steering: real held keys move the sim, and the boy is PAINTED there ----
{
    const a = await probe()
    await hold('ArrowRight', 350)
    await wait(120)
    const b = await probe()
    r.check('held ArrowRight steers right', b.x > a.x + 4, `${a.x} -> ${b.x}`)
    await hold('ArrowLeft', 500)
    await wait(120)
    const c = await probe()
    r.check('held ArrowLeft steers left', c.x < b.x - 6, `${b.x} -> ${c.x}`)
    // pixels: the boy's own colours must sit at the projected column
    const px = await page.evaluate(([bx, by]) => {
        const cv = document.querySelector('canvas[data-pb-stage]')
        const g = cv.getContext('2d')
        const d = g.getImageData(Math.round(bx) - 5, by - 19, 11, 20).data
        let red = 0, blue = 0
        for (let i = 0; i < d.length; i += 4) {
            const [R, Gc, B] = [d[i], d[i + 1], d[i + 2]]
            if (R > 190 && Gc < 110 && B < 100) red++
            if (B > 170 && R < 90 && Gc < 150) blue++
        }
        return { red, blue }
    }, [c.boy.bx, c.boy.by])
    r.check('the drawn boy sits where the physics projects him', px.red >= 3 && px.blue >= 3,
        `(${c.boy.bx},${c.boy.by}) frame-red=${px.red} rider-blue=${px.blue}`)
}

// ---- the door window in real time: one Space at the right instant ----
{
    await ensureSetup({ s: 240, x: -20, quiet: true, dogsOff: [1250] })
    // wait for the real clock to carry s into the window, then throw — the
    // driver plays in the present tense like a human, no rewinding state
    let threw = false
    for (let t = 0; t < 40 && !threw; t++) {
        const p = await probe()
        if (p.s >= 244 && p.s <= 272) { await page.keyboard.press('Space'); threw = true }
        await wait(25)
    }
    r.check('the driver caught the window', threw)
    const del = await waitEv((e) => e.type === 'deliver')
    r.check('a real timed throw delivered to the mat', !!del, del ? `+${del.pts} x${del.streak}` : `ev=${JSON.stringify((await probe()).evLog.slice(-4).map((e) => e.type))}`)
    const b = await probe()
    r.check('the score paid for it and the streak is up', b.score > 0 && b.streak >= 1, `score=${b.score} streak=${b.streak}`)
}

// ---- the lean gate bites: same window, but riding centre ----
{
    await ensureSetup({ s: 444, x: 0, quiet: true, dogsOff: [1250] })
    let threw = false
    for (let t = 0; t < 40 && !threw; t++) {
        const p = await probe()
        if (p.s >= 448 && p.s <= 472) { await page.keyboard.press('Space'); threw = true }
        await wait(25)
    }
    const lean = await waitEv((e) => e.type === 'lean')
    r.check('a centre-riding throw bounces off the lean gate', !!lean, `threw=${threw} ev=${JSON.stringify((await probe()).evLog.slice(-4).map((e) => e.type))}`)
}

// ---- a crash pays a life on the real clock ----
{
    await ensureSetup({ s: 868, x: 0, inv: 0, quiet: true, dogsOff: [1250] })
    const before = (await probe()).lives
    const cr = await waitEv((e) => e.type === 'crash' && e.what === 'crate', 160)
    const a = await probe()
    r.check('riding straight into the crate takes a life', !!cr && a.lives === before - 1,
        `${cr ? 'crash at s=' + cr.s : 'no crash'} lives ${before}->${a.lives}`)
    r.check('the streak died with the bike', a.streak === 0 || !cr, `streak=${a.streak}`)
}

// ---- the last life, the over screen, and one key back ----
{
    await ensureSetup({ s: 868, x: 0, lives: 1, inv: 0, quiet: true })
    const dead = await waitEv((e) => e.type === 'dead', 200)
    r.check('the last life spent into a crate ends the run', !!dead)
    await wait(1300)
    let o = await probe()
    r.check('the over screen is up', o.screen === 'over', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(400)
    o = await probe()
    r.check('one press returns to attract', o.screen === 'attract' || o.screen === 'play', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(300)
    const fresh = await probe()
    r.check('and it rides again immediately', fresh.screen === 'play' && fresh.lives === 3, `screen=${fresh.screen} lives=${fresh.lives}`)
}

// ---- ? pauses and hands the handlebars back ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    const paused = await page.evaluate(() => !!document.querySelector('h2, [class*=pause], [class*=PAUSE]'))
    r.check('? opens the pause overlay', paused)
    await page.keyboard.press('Shift+Slash')
    await wait(200)
    const back = await probe()
    r.check('? gives the route back', back.screen === 'play')
}

r.check('zero page errors for the whole ride', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
