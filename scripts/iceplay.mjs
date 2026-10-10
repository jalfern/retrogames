// ICE CLIMBER CO-OP — Chrome plays the mountain with NOTHING but real key
// events, and the thing a Node harness cannot see is graded in PIXELS:
//
//   npm run iceplay     (needs `npm run dev`)
//
//   1. THE INPUT PATHS — two real key sets (Arrows+Space AND W/A/D+F)
//      reaching the SAME tick of step() through the browser event stack.
//      The simultaneous-push check is the title's thesis: if the second
//      path secretly queues behind the first, P2's x stops moving.
//   2. THE MUTABLE TILEMAP THROUGH REAL KEYS — holding UP must actually
//      DELETE ice cells (boreRows grows), not just animate a fist.
//   3. THE PAINT FOLLOWS PHYSICS — the climber is sampled at the exact
//      screen pixel the physics reports (screen = cell*16, no camera).
//
// The full three-mountain route is proven in Node by icecheck (the attract
// demo is the same script, replayed live here too); this suite proves the
// browser plumbing around it — keys, paint, HUD, pause — on real events.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.ICE_URL || 'http://localhost:5173/retrogames/ice-climber'
await requireDevServer(URL)

const r = new Report('iceplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__iceTest.probe())
const wait = ms => page.waitForTimeout(ms)

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__iceTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__iceTest never appeared (dev server? /ice-climber route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(800)

// ---- attract: the co-op autopilot's real route plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let boreMax = 0, digs = 0, tickGrew = false
    const t0 = a.tick
    for (let i = 0; i < 40; i++) {
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 30
        boreMax = Math.max(boreMax, s.boreRows.length)
        digs = Math.max(digs, s.evLog.filter(e => e.type === 'dig').length)
        await wait(300)
    }
    r.check('attract sim is live', tickGrew, `tick ${t0}->${(await probe()).tick}`)
    r.check('attract PUNCHES real holes in the massif (sim runs in tab)', boreMax > 3, `boreRows=${boreMax} digEvents=${digs}`)
}

// ---- a real key starts a fresh run ----
await page.keyboard.press('KeyZ')
await wait(300)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.lives === 3 && a.level === 0, `screen=${a.screen} lives=${a.lives}`)
}

// ---- THE SECOND INPUT PATH: both key sets move in the SAME tick ----
{
    const a = await probe()
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyD')
    await wait(700)
    const b = await probe()
    await page.keyboard.up('ArrowRight')
    await page.keyboard.up('KeyD')
    const p1Moved = b.climbers[0].x > a.climbers[0].x + 0.4
    const p2Moved = b.climbers[1].x > a.climbers[1].x + 0.4
    r.check('P1 arrows AND P2 W/A/D drive SIMULTANEOUSLY (the second input path is real)',
        p1Moved && p2Moved, `P1 ${a.climbers[0].x.toFixed(1)}->${b.climbers[0].x.toFixed(1)}  P2 ${a.climbers[1].x.toFixed(1)}->${b.climbers[1].x.toFixed(1)}`)
}

// ---- hold UP under the massif: real keys DELETE ice cells ----
{
    await page.evaluate(() => { window.__iceTest.setup(0, { x: 8.5, y: 32 }, { x: 2.5, y: 32 }) })
    await wait(100)
    const a = await probe()
    await page.keyboard.down('ArrowUp')
    let climbed = false
    for (let i = 0; i < 90; i++) {
        const s = await probe()
        if (s.boreRows.length > a.boreRows.length + 2 && s.climbers[0].y < a.climbers[0].y - 1) { climbed = true; break }
        await wait(60)
    }
    await page.keyboard.up('ArrowUp')
    const s = await probe()
    r.check('holding UP through real keys bores the ice (tilemap is mutable via the keyboard)',
        climbed && s.climbers[0].climbing !== undefined, `bore ${a.boreRows.length}->${s.boreRows.length} y ${a.climbers[0].y}->${s.climbers[0].y.toFixed(1)}`)
}

// ---- paint follows physics: the red parka is AT its reported pixel ----
{
    await page.evaluate(() => { window.__iceTest.setup(0, { x: 5.0, y: 32 }, { x: 12.0, y: 32 }) })
    await wait(120)
    const sample = () => page.evaluate(() => {
        const q = window.__iceTest.probe()
        const g = document.querySelector('canvas[data-ice-stage]').getContext('2d')
        const d = g.getImageData(Math.max(0, q.climbers[0].at.x - 7), Math.max(0, q.climbers[0].at.y - 8), 15, 16).data
        let red = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 120 && d[i + 2] < 120) red++
        return { red, at: q.climbers[0].at }
    })
    const s1 = await sample()
    await page.keyboard.down('ArrowRight')
    await wait(500)
    await page.keyboard.up('ArrowRight')
    const s2 = await sample()
    r.check('the climber is PAINTED at the pixel the physics reports (before AND after a real move)',
        s1.red >= 6 && s2.red >= 6 && s2.at.x > s1.at.x + 10,
        `red px ${s1.red}/${s2.red} at ${s1.at.x}->${s2.at.x}`)
}

// ---- THE STACK with real keys: jump on your partner, then reach the carrot ----
{
    await page.evaluate(() => { window.__iceTest.setup(2, { x: 9.32, y: 6 }, { x: 9.4, y: 6 }) })
    await wait(150)
    await page.keyboard.press('Space')          // hop onto the partner's head
    let onHead = false
    for (let i = 0; i < 60; i++) {
        const s = await probe()
        if (s.climbers[0].onPartner) { onHead = true; break }
        await wait(50)
    }
    r.check('P1 can stand on P2 — the shoulder rule works through real keys', onHead,
        `onHead=${onHead} at ${(await probe()).climbers[0].y}`)
    await page.keyboard.press('Space')          // from the head: the impossible ledge
    await wait(500)
    await page.keyboard.down('ArrowRight')      // walk the shelf to the carrot
    let carrot = null
    for (let i = 0; i < 80; i++) {
        const s = await probe()
        carrot = s.evLog.find(e => e.type === 'carrot')
        if (carrot) break
        await wait(50)
    }
    await page.keyboard.up('ArrowRight')
    const fin = await probe()
    r.check('the stack jump reaches the carrot no solo jump can (real keys, real physics)',
        !!carrot && fin.screen === 'over' && fin.end === 'win',
        `carrot=${!!carrot} end=${fin.screen}/${fin.end}`)
}

// ---- condor downs, a partner's touch revives — both through real input ----
{
    for (let i = 0; i < 8 && (await probe()).screen !== 'play'; i++) {
        await page.keyboard.press('Space')      // over -> attract -> play (900ms over-guard between)
        await wait(600)
    }
    const live = await probe()
    r.check('the win screen returns to a fresh run on a real key', live.screen === 'play' && live.level === 0, `screen=${live.screen}`)
    const okSetup = await page.evaluate(() => window.__iceTest.setup(1, { x: 12.3, y: 6 }, { x: 11.3, y: 6 }))
    r.check('setup rig accepts play-mode setup', !!okSetup)
    let down = false
    for (let i = 0; i < 60; i++) {
        const s = await probe()
        if (s.climbers[0].down) { down = true; break }
        await wait(60)
    }
    const mid = await probe()
    r.check('the condor downs a climber and spends a shared life (real sim clock)',
        down && mid.lives === 2, `down=${down} lives=${mid.lives}`)
    await page.keyboard.down('KeyD')            // P2 walks onto the body
    let revived = false
    for (let i = 0; i < 40; i++) {
        const s = await probe()
        if (!s.climbers[0].down) { revived = true; break }
        await wait(50)
    }
    await page.keyboard.up('KeyD')
    r.check('a partner walking onto the body revives them (second player saves the run)', revived)
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
