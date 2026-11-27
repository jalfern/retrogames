// asteroidsdrive (#3706) — real Chrome, real keys: the kiting dance on the
// live seat. asteroidscheck owns the law (margin reuse, ledger pay, banked
// bounty seeds); this proves the shell half end-to-end: tap-to-start, the Y
// seat takes the wheel on a seeded field, the pilot draws and BANKS saucer
// bounties on the live page (the DEV kill witness counts them), a real arrow
// releases the seat, a forced death costs a life, and any key restarts —
// all with zero page errors. mcbatterydrive convention.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/asteroids`
const rep = new Report('asteroidsdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=42`, hook: '__asteroidsTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = () => page.evaluate(() => window.__asteroidsTest.probe())
const kills = () => page.evaluate(() => window.__asteroidsTest.kills())

// ---- attract → start ----
{
    const a = await probe()
    rep.check('attract holds the field before the first key', a.attract === true && a.rocks > 0, `attract=${a.attract} rocks=${a.rocks}`)
}
await page.keyboard.press('Space')
await sleep(400)
{
    const a = await probe()
    rep.check('Space starts a live run on the pinned seed', !a.attract && !a.over && a.rocks >= 6, `rocks=${a.rocks} wave=${a.wave}`)
}

// ---- take the WATCH seat ----
await page.keyboard.press('KeyY')
await sleep(300)
{
    const w = await page.evaluate(() => window.__asteroidsTest.watching())
    rep.check('Y puts the pilot on the wheel', w === true)
}

// ---- the dance on the live page: alarms arrive and the pilot banks them ----
const killBase = (await kills()).length
let sawSaucer = false
let banked = 0
const t0 = Date.now()
let prevTick = (await probe()).tick
while (Date.now() - t0 < 80000) {
    await sleep(1000)
    const p = await probe()
    if (p.saucers > 0) sawSaucer = true
    banked = (await kills()).length - killBase
    if (p.over) break
    if (sawSaucer && banked >= 2) break
    prevTick = p.tick
}
rep.check('alarms arrive on the live seat', sawSaucer)
rep.check('the pilot banks at least two saucer bounties in one seated run',
    banked >= 2, `banked=${banked} of seed-42 law`)

// ---- takeover: a real arrow releases the seat ----
await page.keyboard.press('ArrowLeft')
await sleep(200)
{
    const w = await page.evaluate(() => window.__asteroidsTest.watching())
    rep.check('driving keys take the wheel back from the pilot', w === false)
}

// ---- death and restart: three forced hull touches drain the bank, then the
// game-over screen hands the run back to any key ----
{
    const before = await probe()
    let died = false
    for (let i = 0; i < 4 && !died; i++) {
        await page.evaluate(() => window.__dbg.act('Drop a rock on the ship'))
        await sleep(1500)
        const mid = await probe()
        if (mid.lives < before.lives || !mid.alive) died = true
    }
    rep.check('the live hull pays for a rock it touched — death is real on the seat',
        died, `lives ${before.lives} → ${(await probe()).lives}`)
    let over = false
    for (let i = 0; i < 20 && !over; i++) {
        await page.evaluate(() => window.__dbg.act('Drop a rock on the ship'))
        await sleep(1400)
        over = (await probe()).over === true
    }
    rep.check('the bank runs dry and the seat shows the terminal', over, `over=${over}`)
    await page.keyboard.press('Space')
    await sleep(400)
    const fresh = await probe()
    rep.check('any key restarts — score, wave and field come back clean',
        !fresh.over && fresh.wave === 1 && fresh.score === 0 && fresh.rocks >= 6,
        `w${fresh.wave} s${fresh.score} rocks=${fresh.rocks}`)
}

rep.check('zero page errors across the dance', errors === 0, `${errors} errors`)
rep.exit(browser)
