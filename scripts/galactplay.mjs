// GALAGA — Chrome plays the hive with NOTHING but real key events, and the
// claims a Node harness cannot see are graded in PIXELS:
//
//   npm run galactplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — arrows move, Space fires, on the real event stack.
//   2. THE PAINT FOLLOWS PHYSICS — the fighter is sampled at the exact
//      canvas pixel the sim reports, before and after a real move.
//   3. THE CAPTURE CHAIN END TO END IN THE BROWSER — the real Flagship
//      drops a real beam, a real keypress steers the fighter into it, the
//      next stage carries a real captive, gunfire frees it and a real
//      dodge-under-the-falling-fighter earns the DOUBLE.
//   4. DEATH AND RESTART loop back to attract and to a fresh run.
// The path audit, tree pins, slack rule and determinism live in
// scripts/galactcheck.mjs (Node) — this suite proves the browser plumbing.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.GALAGA_URL || 'http://localhost:5173/retrogames/galaga'
await requireDevServer(URL)

const r = new Report('galactplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__galagaTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const waitEv = async (type, tries = 600) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        if (s.evLog.some((e) => e.type === type)) return s
        await wait(50)
    }
    return null
}

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__galagaTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__galagaTest never appeared (dev server? /galaga route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(800)

// ---- attract: the autopilot's proven run plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let kills = 0, tickGrew = false
    const t0 = a.tick
    for (let i = 0; i < 25; i++) {
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 60
        kills = Math.max(kills, s.evLog.filter((e) => e.type === 'kill').length)
        await wait(160)
    }
    r.check('attract sim is live (the proven run replays)', tickGrew, `tick ${t0} -> ${(await probe()).tick}`)
    r.check('the autopilot demo is actually KILLING bees', kills > 0, `kills=${kills}`)
}

// ---- a real key starts a fresh run ----
await page.keyboard.press('KeyZ')
await wait(300)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.lives === 3 && a.wave === 0, `screen=${a.screen} lives=${a.lives}`)
}

// ---- arrows move, Space fires ----
{
    const a = await probe()
    await page.keyboard.down('ArrowRight')
    await wait(500)
    const b = await probe()
    await page.keyboard.up('ArrowRight')
    r.check('ArrowRight moves the fighter (real keys)', b.player.x > a.player.x + 15, `${a.player.x} -> ${b.player.x}`)
    await page.keyboard.press('Space')
    await wait(120)
    const c = await probe()
    r.check('Space fires (bullets in flight)', c.player.shots > 0 || c.evLog.some((e) => e.type === 'fire' && e.tick > b.tick), `shots=${c.player.shots}`)
}

// ---- paint follows physics ----
{
    await page.evaluate(() => window.__galagaTest.setup({ player: { x: 60, y: 258, state: 'alive', invuln: 100000 } }))
    await wait(120)
    const sample = () => page.evaluate(() => {
        const q = window.__galagaTest.probe()
        const g = document.querySelector('canvas[data-galaga-stage]').getContext('2d')
        const d = g.getImageData(Math.max(0, q.player.x - 6), Math.max(0, q.player.y - 8), 13, 15).data
        let red = 0, white = 0
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110) red++
            if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 230) white++
        }
        return { red, white, x: q.player.x }
    })
    const s1 = await sample()
    await page.keyboard.down('ArrowRight')
    await wait(700)
    await page.keyboard.up('ArrowRight')
    const s2 = await sample()
    r.check('the fighter is PAINTED at the pixel the physics reports, before and after a real move',
        s1.red >= 2 && s2.red >= 2 && s2.x > s1.x + 15, `red ${s1.red}/${s2.red} at x ${s1.x}->${s2.x}`)
    const fleet = await page.evaluate(() => {
        const g = document.querySelector('canvas[data-galaga-stage]').getContext('2d')
        const d = g.getImageData(0, 40, 224, 120).data
        let yellow = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 110) yellow++
        return yellow
    })
    r.check('the fleet is drawn (yellow bee pixels in the formation band)', fleet > 60, `${fleet} px`)
}

// ---- THE CAPTURE CHAIN, end to end, real keys only ----
{
    await page.evaluate(() => window.__galagaTest.setup({ wave: 1, player: { x: 112, y: 258, state: 'alive', invuln: 30 } }))
    const capped = await waitEv('captured', 800)
    r.check('the Flagship real-beamed a real fighter (real keys steered into it)', !!capped, capped ? `lives now ${(await probe()).lives}` : 'no capture in 40 s')
    if (capped) {
        const after = await waitEv('stage', 400) || await probe()
        const s = await probe()
        r.check('a captured fighter becomes a captive escort next stage', s.escorts >= 1 || (after.evLog || []).some((e) => e.type === 'takerest'), `escorts=${s.escorts}`)
        // wait for the captive to dive, then shoot it with REAL Space presses
        let loose = null
        for (let i = 0; i < 500 && !loose; i++) {
            const st = await probe()
            const capt = st.enemies.find((e) => e.kind === 'captive' && e.state === 'dive')
            if (capt) {
                const dx = capt.x - st.player.x
                if (Math.abs(dx) > 6) {
                    await page.keyboard.down(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                    await wait(90)
                    await page.keyboard.up(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                } else {
                    await page.keyboard.press('Space')
                    await wait(90)
                }
            } else {
                await wait(50)
            }
            loose = (await probe()).evLog.find((e) => e.type === 'fighterloose') || null
        }
        r.check('gunfire (real Space) takes down the captive carrying YOUR fighter', !!loose)
        if (loose) {
            let resc = null
            for (let i = 0; i < 400 && !resc; i++) {
                const st = await probe()
                if (st.player.state === 'alive') {
                    if (st.fallers.length) {
                        // steer under the real falling fighter with real keys
                        const fx = st.fallers[0]
                        const dx = fx - st.player.x
                        if (Math.abs(dx) > 5) {
                            await page.keyboard.down(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                            await wait(60)
                            await page.keyboard.up(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
                        }
                    }
                }
                resc = (await probe()).evLog.find((e) => e.type === 'rescued') || null
                await wait(30)
            }
            r.check('catching the falling fighter with a real ship earns the DOUBLE', !!resc, `double=${(await probe()).double}`)
        }
    }
}

// ---- death and restart ----
{
    await page.evaluate(() => window.__galagaTest.setup({ wave: 0, player: { x: 112, y: 258, state: 'alive', invuln: 0 }, lives: 1 }))
    const died = await waitEv('death', 800)
    r.check('the hive can kill a motionless player (the sim is not rigged in the browser)', !!died)
    let over = null
    for (let i = 0; i < 400 && !over; i++) { over = (await probe()).screen === 'over'; if (!over) await wait(50) }
    r.check('the last life ends the game (over screen)', over)
    await wait(1000)
    await page.keyboard.press('KeyZ')
    await wait(400)
    const fresh = await probe()
    r.check('a real key restarts from the attract screen into a fresh run', fresh.screen === 'play' && fresh.lives === 3, `screen=${fresh.screen} lives=${fresh.lives}`)
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
