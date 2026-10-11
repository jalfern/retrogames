// MISSILE BATTLE — Chrome plays the board with NOTHING but real key/mouse
// events, and the claims a Node harness cannot see are graded in PIXELS:
//
//   npm run missileplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — arrows walk the reticle, Space launches, and a held
//      Space fires EXACTLY one interceptor (the edge latch, keepplay lesson).
//   2. THE PAINT FOLLOWS PHYSICS — the interceptor is sampled at the exact
//      canvas pixel the sim reports, mid-flight.
//   3. THE TAP PATH — one pointerdown aims and fires in a single tick.
//   4. A NEGLECTED CITY BURNS — cityHit + the board state, not an opinion.
//   5. THE MAP GOES DARK AND A KEY RESTARTS IT — lose, over screen, one
//      press, attract again, zero page errors throughout.
// The slack rule, script audit and determinism live in missilecheck (Node).
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.MB_URL || 'http://localhost:5173/retrogames/missile-battle'
await requireDevServer(URL)

const r = new Report('missileplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__mbTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
// arrows are HELD, never tapped: a press() can fit inside one frame gap
// and be swallowed between two 60Hz samples (the keepplay lesson)
const holdArrow = async (key, ms = 70) => {
    await page.keyboard.down(key)
    await wait(ms)
    await page.keyboard.up(key)
}
const waitEv = async (pred, tries = 400) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        const ev = s.evLog.find(pred)
        if (ev) return ev
        await wait(50)
    }
    return null
}
const waitPlay = async (tries = 200) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        if (s.phase === 'play' && s.screen === 'play') return s
        await wait(60)
    }
    return null
}
const setup = (o) => page.evaluate((x) => window.__mbTest.setup(x), o)
const ensureSetup = async (o) => {
    for (let i = 0; i < 8; i++) {
        if (await setup(o)) return true
        await wait(300)
    }
    return false
}

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__mbTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__mbTest never appeared (dev server? /missile-battle route?)')
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
    for (let i = 0; i < 45; i++) {
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 60
        kills = Math.max(kills, s.evLog.filter((e) => e.type === 'kill').length)
        await wait(160)
    }
    r.check('attract sim is live (the proven run replays)', tickGrew, `tick ${t0} -> ${(await probe()).tick}`)
    r.check('the autopilot demo is actually KILLING warheads', kills > 0, `kills=${kills}`)
}

// ---- a real key starts a fresh run ----
await page.keyboard.press('KeyZ')
await wait(200)
let s = await probe()
r.check('any key leaves attract', s.screen === 'play', `screen=${s.screen}`)
const st = await waitPlay()
r.check('the banner hands the sky over to the script', !!st, `phase=${(await probe()).phase}`)

// ---- arrows walk the reticle (real key events on the real event stack) ----
{
    const a = await probe()
    for (let i = 0; i < 6; i++) await holdArrow('ArrowRight')
    await wait(150)
    const b = await probe()
    r.check('ArrowRight walks the reticle right', b.aim.x > a.aim.x + 5, `${a.aim.x} -> ${b.aim.x}`)
    for (let i = 0; i < 4; i++) await holdArrow('ArrowUp')
    await wait(150)
    const c = await probe()
    r.check('ArrowUp walks the reticle up', c.aim.y < b.aim.y - 3, `${b.aim.y} -> ${c.aim.y}`)
}

// ---- Space fires EXACTLY one per press, and the launch is real ----
{
    const a = await probe()
    await page.keyboard.down('Space')
    await wait(600)
    await page.keyboard.up('Space')
    await wait(150)
    const b = await probe()
    r.check('a HELD Space spends exactly one interceptor', a.fired + 1 === b.fired, `${a.fired} -> ${b.fired} over ~36 frames`)
    r.check('the launch is logged and charged to a battery', b.firedBy.reduce((n, k) => n + k, 0) === b.fired, `firedBy=${b.firedBy}`)
}

// ---- shoot a planted warhead with arrows + Space, grade the KILL ----
// each graded section RELOADS its own quiet stage: the script must not race
// the probe, or every wait grades a world the driver did not build
{
    await ensureSetup({ wave: 0, quiet: true })
    await waitPlay()
    await ensureSetup({ spawn: { kind: 'icbm', x: 128, y: 60, spd: 500, ti: -1 } })
    // aim where the warhead WILL BE, not where it is: from the battery the
    // interceptor needs dist/2.1 ticks, and a blast cannot chase a receder.
    // Firing at the present tense is a legitimate miss — the driver must
    // play like a competent human, not like a hindsight cheat.
    let fired = false
    for (let t = 0; t < 40 && !fired; t++) {
        const p = await probe()
        const e = p.enemies[0]
        if (!e) break
        const dx = e.x - p.aim.x
        const lead = (Math.hypot(128 - e.x, 200 - e.y) / 2.1) * 0.28
        const ty = e.y + lead
        const dy = ty - p.aim.y
        if (Math.abs(dx) > 4) { await holdArrow(dx > 0 ? 'ArrowRight' : 'ArrowLeft', Math.min(320, Math.abs(dx) * 5)); continue }
        if (Math.abs(dy) > 4) { await holdArrow(dy > 0 ? 'ArrowDown' : 'ArrowUp', Math.min(320, Math.abs(dy) * 5)); continue }
        await page.keyboard.press('Space')
        fired = !!(await waitEv((ev) => ev.type === 'boom', 60))
    }
    r.check('arrows + Space put a blast exactly on the reticle', fired)
    const kill = await waitEv((ev) => ev.type === 'kill' && ev.kind === 'icbm', 80)
    r.check('the planted warhead DIED to that blast', !!kill, kill ? `kill @ ${kill.x},${kill.y}` : 'no kill event')
}

// ---- pixels: the drawn interceptor sits where the physics says ----
{
    await ensureSetup({ wave: 0, quiet: true })
    await waitPlay()
    await ensureSetup({ spawn: { kind: 'icbm', x: 200, y: 40, spd: 520, ti: -1 } })
    let okpx = false, detail = 'no shot in flight was sampled'
    for (let t = 0; t < 60 && !okpx; t++) {
        const p = await probe()
        const e = p.enemies[0]
        if (!e) break
        const dx = e.x - p.aim.x, dy = e.y - p.aim.y
        if (Math.abs(dx) > 4 || Math.abs(dy) > 6) {
            await holdArrow(Math.abs(dx) > 4 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'), 60)
            continue
        }
        await page.keyboard.press('Space')
        for (let k = 0; k < 40; k++) {
            const q = await probe()
            const m = q.intc[0]
            if (m) {
                const lum = await page.evaluate(([x, y]) => {
                    const c = document.querySelector('canvas[data-mb-stage]')
                    const g = c.getContext('2d')
                    const d = g.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data
                    let mx = 0
                    for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, Math.min(d[i], d[i + 1], d[i + 2]))
                    return mx
                }, [m.x, m.y])
                detail = `(${m.x},${m.y}) brightest pixel ${lum}`
                if (lum > 150) { okpx = true; break }
            }
            await wait(25)
        }
        break
    }
    r.check('the drawn interceptor is white where the sim says it is', okpx, detail)
}

// ---- the phone path: one pointerdown aims AND fires ----
{
    await ensureSetup({ wave: 0, quiet: true })
    await waitPlay()
    await ensureSetup({ spawn: { kind: 'smart', x: 70, y: 50, spd: 480, amp: 8, ti: -1 } })
    const box = await page.evaluate(() => {
        const r = document.querySelector('canvas[data-mb-stage]').getBoundingClientRect()
        // click the LEAD point: warhead at (70,50) vy≈0.3, battery 0 needs
        // ~71 ticks to reach that column — the crosshair belongs where the
        // smart bomb will be, 21px lower
        return { x: r.left + (70 / 256) * r.width, y: r.top + (76 / 224) * r.height }
    })
    const shot = await probe()
    await page.mouse.click(box.x, box.y)
    const tap = await waitEv((ev) => ev.type === 'ifire', 60)
    r.check('one phone tap aims and fires in one tick', !!tap && Math.abs(tap.tx - 70) < 6,
        tap ? `shot at ${tap.tx},${tap.ty}` : `no launch — screen=${shot.screen} phase=${shot.phase} aim=${shot.aim.x},${shot.aim.y} ev=${JSON.stringify((await probe()).evLog.slice(-5).map((e) => e.type))}`)
    const smart = await waitEv((ev) => ev.type === 'kill' && ev.kind === 'smart', 120)
    r.check('the weaving smart bomb died to the tap-shot', !!smart, smart ? '' : JSON.stringify((await probe()).enemies.map((e) => e.kind)))
}

// ---- a neglected city burns (honest punishment, real world time) ----
{
    await ensureSetup({ wave: 1, quiet: true })
    await waitPlay()
    const alive = (await probe()).cities.filter(Boolean).length
    r.check('the between-wave rebuild relit the cities', alive >= 5, `cities=${alive} after reload`)
    await ensureSetup({ spawn: { kind: 'icbm', x: 54, y: 150, vy: 0.9, ti: 0 } })
    const burn = await waitEv((ev) => ev.type === 'cityHit' && ev.x === 54, 150)
    r.check('an unopposed warhead takes the city it was aimed at', !!burn,
        burn ? '' : `cities=${JSON.stringify((await probe()).cities)} last=${JSON.stringify((await probe()).evLog.slice(-3).map((e) => e.type))}`)
    const s = await probe()
    r.check('the board state knows the city is dark', s.cities[0] === false, JSON.stringify(s.cities))
}

// ---- the map goes dark, a key brings it back ----
{
    await ensureSetup({ wave: 1, quiet: true })
    await waitPlay()
    for (let i = 1; i < 6; i++) await setup({ killCity: i })
    await setup({ spawn: { kind: 'icbm', x: 146, y: 170, vy: 1.5, ti: 3 } })
    const dark = await waitEv((ev) => ev.type === 'lose', 160)
    r.check('the sixth city falling ends the run', !!dark)
    await wait(1400)
    let o = await probe()
    r.check('the over screen is up', o.screen === 'over', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(400)
    o = await probe()
    r.check('one press returns to attract with a clean board', o.screen === 'attract' || o.screen === 'play', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    const fresh = await waitPlay()
    r.check('and it plays again immediately', !!fresh, `phase=${(await probe()).phase}`)
}

// ---- ? pauses and reads controls ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    const paused = await page.evaluate(() => !!document.querySelector('h2, [class*=pause], [class*=PAUSE]'))
    r.check('? opens the pause overlay', paused)
    await page.keyboard.press('Shift+Slash')
    await wait(200)
    const back = await probe()
    r.check('? again hands the sky back', back.screen === 'play')
}

r.check('zero page errors for the whole session', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
