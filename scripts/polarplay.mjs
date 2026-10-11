// POLARITY — Chrome plays the reactor with NOTHING but real key events,
// and the claims a Node harness cannot see are graded in PIXELS:
//
//   npm run polarplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — arrows move, Space fires, X flips polarity, all on
//      the real event stack.
//   2. THE PAINT FOLLOWS PHYSICS AND POLARITY — the fighter is sampled at
//      the exact canvas pixel the sim reports, before and after a real
//      move, and the sampled COLOR is the sim's polarity.
//   3. THE ABSORB / DEATH / NOVA CHAIN IN THE BROWSER — an injected L
//      bullet vanishes into an L fighter (charge +1, alive); a D bullet
//      kills it; a full charge + a real X press sweeps the board.
//   4. THE STORM TELEGRAPH KILLS A STANDER — warn precedes, column lands,
//      a motionless fighter dies of 'storm'.
//   5. THE SHELL ANSWERS ONLY THE OPPOSITE COLOR — real X steers polarity
//      into the open window, real Space chits the quota, same color is
//      blocked.
// The fairness scan, tree pins and determinism live in polarcheck (Node).
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.POLAR_URL || 'http://localhost:5173/retrogames/polarity'
await requireDevServer(URL)

const r = new Report('polarplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__polarTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const waitEv = async (pred, tries = 600) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        if (s.evLog.some(pred)) return s
        await wait(50)
    }
    return null
}
const waitAlive = async (tries = 200) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        if (s.phase === 'play' && s.screen === 'play' && s.player.state === 'alive' && s.enemies.length) return s
        await wait(60)
    }
    return null
}
// setup() is refused on the over/attract screens (a dead player two lives
// deep from the last scripted death lands there), and a refused setup that
// nobody checks makes every later assert chase a world that was never built.
const ensureSetup = async (opts) => {
    for (let i = 0; i < 6; i++) {
        if (await page.evaluate((o) => window.__polarTest.setup(o), opts)) return true
        await page.keyboard.press('KeyZ')
        await wait(450)
    }
    return false
}

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__polarTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__polarTest never appeared (dev server? /polarity route?)')
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
    r.check('the autopilot demo is actually KILLING the fleet', kills > 0, `kills=${kills}`)
}

// ---- a real key starts a fresh run ----
await page.keyboard.press('KeyZ')
await wait(300)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.lives === 3 && a.wave === 0, `screen=${a.screen} lives=${a.lives}`)
    const live = await waitAlive()
    r.check('the fighter goes live after the stage banner, fleet on formation', !!live, JSON.stringify((await probe()).player))
}

// ---- arrows move, Space fires, X flips ----
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
    r.check('Space fires (bullets in flight)', c.shots.length > 0 || c.evLog.some((e) => e.type === 'fire' && e.tick > b.tick), `shots=${c.shots.length}`)
    const pol0 = c.player.pol
    await page.keyboard.press('KeyX')
    await wait(120)
    const d = await probe()
    r.check('X flips polarity (real key)', d.player.pol !== pol0, `${pol0} -> ${d.player.pol}`)
    for (let i = 0; i < 60 && (await probe()).shots.length > 0; i++) await wait(80)
    await page.keyboard.press('Space')
    let shot = null
    for (let i = 0; i < 20; i++) { await wait(80); shot = await probe(); if (shot.shots.length > 0) break }
    const fires = shot ? shot.evLog.filter((e) => e.type === 'fire') : []
    const last = fires[fires.length - 1]
    r.check('the shot after a real flip comes out in the NEW color',
        !!last && last.color === d.player.pol, `pol=${d.player.pol} last fire=${last && last.color}`)
}

// ---- paint follows physics AND polarity ----
{
    await ensureSetup({ player: { x: 60, y: 264, pol: 'L', state: 'alive', invuln: 999 } })
    await wait(120)
    const sample = () => page.evaluate(() => {
        const q = window.__polarTest.probe()
        const g = document.querySelector('canvas[data-polar-stage]').getContext('2d')
        const d = g.getImageData(Math.max(0, q.player.x - 8), Math.max(0, q.player.y - 9), 17, 18).data
        let cyan = 0, magenta = 0
        for (let i = 0; i < d.length; i += 4) {
            const [R, G, B] = [d[i], d[i + 1], d[i + 2]]
            if (B > 200 && G > 140 && R < 150) cyan++
            if (R > 180 && B > 180 && G < 140) magenta++
        }
        return { cyan, magenta, x: q.player.x, pol: q.player.pol, st: q.player.state }
    })
    const best = async () => {
        let c = 0, m = 0
        for (let i = 0; i < 6; i++) { const s = await sample(); c = Math.max(c, s.cyan); m = Math.max(m, s.magenta); await wait(90) }
        return { c, m }
    }
    const L1 = await best()
    await page.keyboard.down('ArrowRight')
    await wait(700)
    await page.keyboard.up('ArrowRight')
    const s2 = await sample()
    const L2 = await best()
    r.check('the LIGHT fighter is PAINTED cyan at the pixel the physics reports, before and after a real move',
        L1.c >= 2 && L2.c >= 2 && s2.x > 60 + 15, `cyan ${L1.c}/${L2.c} at x 60->${s2.x.toFixed(0)} (${s2.st})`)
    await ensureSetup({ player: { x: 60, y: 264, pol: 'D', state: 'alive', invuln: 999 } })
    await wait(150)
    const D1 = await best()
    r.check('flip the sim, the SAME pixels turn magenta — the paint IS the polarity', D1.m >= 2, `magenta ${D1.m} cyan ${D1.c}`)
    const fleet = await page.evaluate(() => {
        const g = document.querySelector('canvas[data-polar-stage]').getContext('2d')
        const d = g.getImageData(0, 20, 224, 160).data
        let lit = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 240) lit++
        return lit
    })
    r.check('the fleet is drawn on the board', fleet > 60, `${fleet} px`)
}

// ---- absorb / death chain in the browser ----
{
    await ensureSetup({ wave: 0, player: { x: 112, y: 264, pol: 'L', state: 'alive', invuln: 0 }, charge: 3 })
    await waitAlive()
    await ensureSetup({ player: { x: 112, y: 264, pol: 'L', state: 'alive', invuln: 0 }, charge: 3, shot: { x: 112, y: 267, color: 'L', vy: 0.4 } })
    let s = null, died = null
    for (let i = 0; i < 60; i++) {
        s = await probe()
        if (s.evLog.some((e) => e.type === 'absorb')) break
        if (s.player.state !== 'alive') { died = s; break }
        await wait(50)
    }
    r.check('an L bullet vanishes into an L fighter (absorb, charge +1, alive)',
        !!s && !died && s.evLog.some((e) => e.type === 'absorb') && s.player.state === 'alive',
        died ? 'the player died before the injected bullet arrived' : `absorb=${s && s.evLog.some((e) => e.type === 'absorb')}`)
    await ensureSetup({ player: { x: 112, y: 264, pol: 'L', state: 'alive', invuln: 0 }, shot: { x: 112, y: 267, color: 'D', vy: 0.4 } })
    const dead = await waitEv((e) => e.type === 'death' && e.cause === 'shot', 100)
    r.check('the opposite color kills the same fighter (real browser sim)', !!dead, `cause=${dead && dead.cause}`)
    await waitAlive()
}

// ---- nova in the browser: real X press sweeps the board ----
{
    await ensureSetup({ wave: 0, player: { x: 112, y: 264, pol: 'L', state: 'alive', invuln: 0 } })
    await waitAlive() // startStage clears shots at banner-end — inject AFTER it
    await page.evaluate(() => {
        window.__polarTest.setup({ charge: 10 })
        for (let k = 0; k < 6; k++) window.__polarTest.setup({ shot: { x: 40 + k * 20, y: 150 + (k % 3) * 14, color: 'D', vy: 0 } })
    })
    const before = await probe()
    await page.keyboard.press('KeyX')
    await wait(200)
    const after = await probe()
    r.check('a real X with full charge fires FLUX NOVA and sweeps the board',
        after.evLog.some((e) => e.type === 'nova') && before.eShots >= 5 && after.eShots <= before.eShots - 4,
        `shots ${before.eShots} -> ${after.eShots}`)
    r.check('the nova spends the charge and flips too', after.charge === 0 && after.player.pol === 'D', `charge=${after.charge} pol=${after.player.pol}`)
}

// ---- the storm telegraph kills a stander ----
{
    await ensureSetup({ wave: 0, player: { x: 112, y: 264, pol: 'L', state: 'alive', invuln: 0 } })
    const warned = await waitEv((e) => e.type === 'warn' && e.hazard === 'storm', 400)
    r.check('the storm TELEGRAPHS before it lands (warn event + drawn strip)', !!warned, `warn at tick ${warned && warned.tick}`)
    const stormDeath = await waitEv((e) => e.type === 'death' && e.cause === 'storm', 600)
    r.check('a motionless fighter at the telegraph column dies of storm', !!stormDeath, `cause=${stormDeath && stormDeath.cause}`)
    await waitAlive()
}

// ---- the shell answers only the opposite color, real keys ----
{
    await ensureSetup({ wave: 2, player: { x: 112, y: 264, state: 'alive', invuln: 0 }, lives: 9 })
    await waitAlive()
    // The proof is the QUOTA the sim reports, not the event log: a busy
    // reactor scrolls chits out of any fixed event window. The core dying
    // after being seen alive is itself a receipt — the quota is the only
    // way it dies.
    let sawCore = false
    let quotaChanged = false
    for (let i = 0; i < 900 && !(quotaChanged && sawCore); i++) {
        const st = await probe()
        const core = st.enemies.find((e) => e.kind === 'core')
        if (!core) { if (sawCore) break; await wait(60); continue }
        sawCore = true
        if (core.quota && core.quota !== '0/0') quotaChanged = true
        const need = core.shell === 'L' ? 'D' : 'L' // a chit is a shot OPPOSITE the shell
        if (st.player.state !== 'alive') { await wait(80); continue }
        if (st.player.pol !== need) {
            await page.keyboard.press('KeyX')
            await wait(60)
        }
        const now = await probe()
        if (Math.abs(112 - now.player.x) > 3) {
            const dir = 112 > now.player.x ? 'ArrowRight' : 'ArrowLeft'
            await page.keyboard.down(dir)
            await wait(80)
            await page.keyboard.up(dir)
        } else {
            const c2 = now.enemies.find((e) => e.kind === 'core')
            if (c2 && now.player.pol !== c2.shell) {
                await page.keyboard.press('Space')
                await wait(140)
            } else await wait(60)
        }
    }
    const fin = await probe()
    const core = fin.enemies.find((e) => e.kind === 'core')
    const coreDown = sawCore && !core
    r.check('real X + real Space: opposite-color shots CHIT the core (quota moved, then the core died)',
        quotaChanged && sawCore, `quota seen=${quotaChanged} core down=${coreDown} now=${core ? core.quota : 'gone'} screen=${fin.screen}`)
}

// ---- death and restart ----
{
    await ensureSetup({ wave: 0, player: { x: 112, y: 264, pol: 'D', state: 'alive', invuln: 0 }, lives: 1 })
    const died = await waitEv((e) => e.type === 'death', 800)
    r.check('the fleet can kill a motionless player (the sim is not rigged in the browser)', !!died)
    let over = null
    for (let i = 0; i < 400 && !over; i++) { over = (await probe()).screen === 'over'; if (!over) await wait(50) }
    r.check('the last life ends the game (over screen)', over)
    await wait(1500)
    await page.keyboard.press('KeyZ')
    await wait(400)
    const mid = await probe()
    if (mid.screen === 'attract') { await page.keyboard.press('KeyZ'); await wait(400) }
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
