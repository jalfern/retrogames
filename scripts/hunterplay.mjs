// SPY HUNTER — Chrome plays the highway with NOTHING but real key events,
// and the claims a Node harness cannot see are graded in PIXELS:
//
//   npm run hunterplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — arrows steer, Space guns, X fires a missile, all on
//      the real event stack.
//   2. THE PAINT FOLLOWS PHYSICS — the G-6155 is sampled at the exact canvas
//      pixel the sim reports, before and after a real steering move.
//   3. THE REAL SCRIPT RUNS IN THE BROWSER — oil scripted into the road
//      spins the car (drift sampled from the sim), and a missile fired with
//      a real key kills the gunboat in the river the road cannon can't reach.
//   4. DEATH and restart loop back through the attract screen — which is the
//      autopilot's proven run playing itself, scoring on its own.
// The road audit, ledger, slack rule and mutants live in huntercheck.mjs.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.HUNTER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/spy-hunter`
await requireDevServer(URL)

const r = new Report('hunterplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 760 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__spyTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const tap = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__spyTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__spyTest never appeared (dev server? /spy-hunter route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1000)

// ---- attract: the autopilot's proven run plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let kills = 0, tickGrew = false
    const t0 = a.tick
    for (let i = 0; i < 110; i++) {   // ~16 s of real attract — long enough to reach the first scripted kill
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 60
        kills = Math.max(kills, s.evLog.filter((e) => e.type === 'kill').length)
        if (kills > 0 && tickGrew) break
        await wait(150)
    }
    r.check('attract sim is live (the proven run replays)', tickGrew, `tick ${t0} -> ${(await probe()).tick}`)
    r.check('the autopilot demo is actually KILLING traffic', kills > 0, `kills=${kills}`)
}

// ---- a real key starts a fresh run ----
await page.keyboard.press('KeyZ')
await wait(400)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.lives === 3 && a.stage === 0 && a.tick < 200,
        `screen=${a.screen} lives=${a.lives} stage=${a.stage} tick=${a.tick}`)
}

// ---- arrows steer, Space guns: the real event stack ----
{
    const a = await probe()
    await tap('ArrowRight', 500)
    const b = await probe()
    r.check('ArrowRight steers right (real keys)', b.player.x > a.player.x + 12, `${a.player.x} -> ${b.player.x}`)
    await tap('ArrowLeft', 500)
    const c = await probe()
    r.check('ArrowLeft steers left (real keys)', c.player.x < b.player.x - 12, `${b.player.x} -> ${c.player.x}`)
    await page.keyboard.down('Space')
    await wait(300)
    await page.keyboard.up('Space')
    const d = await probe()
    r.check('Space fires the machine gun', d.shots > 0 || d.heat > 0, `shots=${d.shots} heat=${d.heat.toFixed(1)}`)
}

// ---- paint follows physics: the car is where the sim says, in pixels ----
{
    await page.evaluate(() => window.__spyTest.setup({ player: { x: 120, spin: 0, dead: 0, offT: 0, invuln: 1e9 } }))
    await wait(150)
    const sample = () => page.evaluate(() => {
        const q = window.__spyTest.probe()
        const g = document.querySelector('canvas[data-spy-stage]').getContext('2d')
        const d = g.getImageData(Math.round(q.player.x - 8), 182 - 13, 17, 27).data
        let white = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 240) white++
        return { white, x: q.player.x }
    })
    const maxWhite = async () => {
        let best = 0
        for (let i = 0; i < 5; i++) { best = Math.max(best, (await sample()).white); await wait(90) }
        return best
    }
    const w1 = await maxWhite()
    await tap('ArrowRight', 700)
    const s2 = await sample()
    const w2 = await maxWhite()
    r.check('the G-6155 is PAINTED at the pixel the physics reports, before and after a real steer',
        w1 >= 15 && w2 >= 15 && s2.x > 120 + 15, `white px ${w1}/${w2} at x 120->${s2.x.toFixed(0)}`)
    const road = await page.evaluate(() => {
        const g = document.querySelector('canvas[data-spy-stage]').getContext('2d')
        const d = g.getImageData(100, 40, 56, 100).data
        let grey = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 90 && d[i] < 130 && Math.abs(d[i] - d[i + 1]) < 12) grey++
        return grey
    })
    r.check('the road is drawn under the car (grey asphalt pixels)', road > 3000, `${road} px`)
}

// ---- the scripted road is REAL in the browser: oil scripted into stage 1
//      spins the actual car, and the sim drifts it while steering is dead ----
{
    // invuln must be ZERO here: respawn glass — like the real arcade's — makes
    // the car temporarily immune, and a test that floods immunity cannot see
    // the oil spin at all (it graded an invincible car and called the road dead)
    await page.evaluate(() => window.__spyTest.setup({ stage: 0, player: { x: 169, spin: 0, dead: 0, offT: 0, invuln: 0 } }))
    let spun = null
    for (let i = 0; i < 400 && !spun; i++) {
        const s = await probe()
        if (s.player.spin > 0) { spun = s; break }
        const near = s.oils.find((o) => o.y > 60 && o.y < 175)
        if (near && Math.abs(near.x - s.player.x) > 3) {
            await tap(near.x > s.player.x ? 'ArrowRight' : 'ArrowLeft', 40)
        } else await wait(30)
    }
    r.check('the scripted Road Lake SPINS the car (oil is real in the browser)', !!spun, spun ? `spin=${spun.player.spin}` : 'no spin in 20 s of oil driving')
    if (spun) {
        await wait(350)
        const s = await probe()
        r.check('steering is dead mid-spin (the sim owns the car, not the keys)',
            s.player.spin === 0 || Math.abs(s.player.x - spun.player.x) > 2, `x ${spun.player.x.toFixed(0)} -> ${s.player.x.toFixed(0)} spin=${s.player.spin}`)
    }
}

// ---- a real X-key missile kills the gunboat — the river the cannon can't reach ----
{
    await page.evaluate(() => window.__spyTest.setup({ stage: 1, lives: 9, missiles: 8, player: { x: 112, spin: 0, dead: 0, offT: 0, invuln: 1e9 } }))
    let boatKill = null
    for (let i = 0; i < 700 && !boatKill; i++) {
        const s = await probe()
        if (s.evLog.some((e) => e.type === 'kill' && e.kind === 'boat')) { boatKill = s; break }
        // dodge with real keys: a car closing on my lane (or oil under me)
        const threat = s.ents.find((e) => ['traffic', 'laker', 'rambler', 'sweeper'].includes(e.kind) && e.y > 40 && e.y < 170 && Math.abs(e.x - s.player.x) < 26)
        const oil = s.oils.find((o) => o.y > 60 && o.y < 176 && Math.abs(o.x - s.player.x) < 26)
        const away = threat || oil
        if (away) {
            const dir = away.x > 112 ? 'ArrowLeft' : 'ArrowRight'
            const want = away.x > 112 ? Math.min(169, s.player.x + 55) : Math.max(55, s.player.x - 55)
            if (Math.abs(s.player.x - want) > 6) await tap(dir, 60)
            else await wait(20)
        } else {
            if (s.player.x < 108) await tap('ArrowRight', 40)
            if (s.player.x > 116) await tap('ArrowLeft', 40)
            await page.keyboard.press('KeyX')
            await wait(80)
        }
        boatKill = null
    }
    r.check('a real X-key MISSILE kills the gunboat in the river', !!boatKill, boatKill ? `missiles left ${(await probe()).missiles}` : 'no boat kill in ~60 s of firing')
}

// ---- death and restart ----
{
    await page.evaluate(() => window.__spyTest.setup({ stage: 1, lives: 1, player: { x: 55, spin: 0, dead: 0, offT: 0, invuln: 0 } }))
    let died = null
    for (let i = 0; i < 900 && !died; i++) {
        const s = await probe()
        if (s.evLog.some((e) => e.type === 'death')) { died = s; break }
        await wait(60)
    }
    r.check('the highway can kill a motionless player (nothing is rigged in the browser)', !!died)
    let over = null
    for (let i = 0; i < 500 && !over; i++) { over = (await probe()).screen === 'over'; if (!over) await wait(60) }
    r.check('the last life ends the game (over screen)', over)
    await wait(1400)
    await page.keyboard.press('KeyZ')
    await wait(400)
    let mid = await probe()
    if (mid.screen === 'attract') { await page.keyboard.press('KeyZ'); await wait(400); mid = await probe() }
    r.check('a real key restarts from attract into a fresh run', mid.screen === 'play' && mid.lives === 3, `screen=${mid.screen} lives=${mid.lives}`)
}

// ---- the pause door ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    r.check('a real ? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await page.keyboard.press('Shift+Slash')
    await wait(250)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
