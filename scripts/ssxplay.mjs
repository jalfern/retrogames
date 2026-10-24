// ssxplay — Chrome drives a real SSX heat with NOTHING but real key events, and the
// claims a Node harness cannot see are graded live in the tab:
//
//   npm run ssxplay     (needs `npm run dev`; SSX_URL overrides the port)
//
//   1. THE SIM IS LIVE ON LOAD — the heat rides itself in a real rAF tab (tick grows,
//      a renderable frame rate under software GL).
//   2. A REAL KEY ENGAGES THE RUN — the countdown lifts to GO and the sim keeps advancing.
//   3. REAL STEERING IS ANALOG — a held arrow ramps the #791 edge `press` to the target
//      and relaxes on release (the load-bearing steer law, through the browser event stack).
//   4. THE RUN IS WINNABLE IN A TAB — prognose() (the certified line) says WINNABLE.
//   5. A REAL OLLIE + GRAB BANKS POINTS — Space launches, KeyX latches a named grab, and
//      the clean landing pays (the trick economy, on real keys).
//   6. A REAL FLIP TURNS THE LEDGER — KeyZ spins the flip angle mid-air.
//   7. THE PAUSE DOOR — '?' opens the PauseOverlay, '?' closes it.
//
// Geometry, determinism and mutants live in ssxcheck.mjs; the hero rider, the poses, the
// touch trick-pad and the analogue stick are ssxmodelcheck.mjs's. This is the missing
// drive — the merge gate for SSX is no longer Node-only. Waits are against the sim tick /
// generous polls (software-GL headless runs 8-15 fps), never the wall clock.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/ssx?lite=1`
await requireDevServer(URL)

const r = new Report('ssxplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const P = () => page.evaluate(() => {
    const q = window.__ssxTest.probe()
    return { tick: q.tick, phase: q.phase, end: q.end, p: q.p, fps: window.__ssxTest.fps() }
})
const wait = ms => page.waitForTimeout(ms)
const grounded = async () => { for (let i = 0; i < 25; i++) { if (!(await P()).p.air) return true; await wait(80) } return !(await P()).p.air }
const toRun = async (tries = 80) => { for (let i = 0; i < tries; i++) { if ((await P()).phase === 'run') return true; await wait(100) } return (await P()).phase === 'run' }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
} catch {
    r.check('DEV hook exists', false, 'window.__ssxTest never appeared (dev server? /ssx route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)

// ---- 1. the sim is live on load: the heat rides itself in a real rAF tab ----
{
    await wait(1200)
    const a0 = await P()
    await wait(2500)
    const a1 = await P()
    const grew = a1.tick - a0.tick
    r.check('the sim is live on load (heat rides itself in a real tab)',
        grew > 40 && a1.fps >= 8, `tick ${a0.tick}->${a1.tick} (+${grew}) fps=${a1.fps} phase=${a1.phase}`)
}

// ---- 2. a real key engages the run (countdown lifts, the sim keeps advancing) ----
{
    await page.keyboard.press('ArrowRight')
    let run = null
    for (let i = 0; i < 120; i++) { const s = await P(); if (s.phase === 'run') { run = s; break } await wait(100) }
    await wait(300)
    const s = await P()
    r.check('a real key engages the run (phase run, tick still advancing)',
        !!run && s.tick > run.tick, `phase=${s.phase} tick ${run ? run.tick : '?'}->${s.tick}`)
}

// ---- 3. real steering is the #791 analog press law: held ramps, release relaxes ----
{
    await page.keyboard.down('ArrowLeft')
    let held = null
    for (let i = 0; i < 50; i++) { const s = await P(); if (s.p.press <= -0.7) { held = s; break } await wait(60) }
    await page.keyboard.up('ArrowLeft')
    await wait(200)
    let rel = null
    for (let i = 0; i < 50; i++) { const s = await P(); if (s.p.press >= -0.3) { rel = s; break } await wait(60) }
    r.check('held ArrowLeft ramps the analog edge press toward -1',
        !!held && held.p.press <= -0.7, `press=${held ? held.p.press.toFixed(2) : '?'}`)
    r.check('releasing relaxes the press back to the centre',
        !!rel && rel.p.press >= -0.3, `press=${rel ? rel.p.press.toFixed(2) : '?'}`)
}

// ---- 4. the certified line is winnable from this real tab ----
{
    const pr = await page.evaluate(() => window.__ssxTest.prognose())
    r.check('prognose() says the run is WINNABLE from a real tab', String(pr).startsWith('WINNABLE'), String(pr))
}

// ---- 5. a real Space ollie + KeyX grab banks points (the trick economy) ----
{
    const grabOnce = async () => {
        await page.evaluate(() => {
            const k = window.__ssxTest.keys
            k.delete('KeyX'); k.delete('KeyZ'); k.delete('KeyV')
            window.__ssxTest.center()
        })
        await wait(150)
        await grounded()
        await page.keyboard.down('Space')
        await wait(550)
        await page.keyboard.up('Space')
        let air = false
        for (let i = 0; i < 30; i++) { if ((await P()).p.air) { air = true; break } await wait(70) }
        if (!air) return { air: false }
        const before = (await P()).p
        await page.keyboard.down('KeyX')
        let named = null
        for (let i = 0; i < 20; i++) { const p = (await P()).p; if (p.grabName) { named = p; break } await wait(50) }
        await wait(120)
        await page.keyboard.up('KeyX')
        let after = (await P()).p
        for (let i = 0; i < 55; i++) { const p = (await P()).p; if (!p.air) { after = p; break } await wait(70) }
        return { air: true, named: !!named, banked: after.score > before.score || after.tricks > before.tricks,
            before: { score: before.score, tricks: before.tricks }, after: { score: after.score, tricks: after.tricks, crashes: after.crashes } }
    }
    let g = null
    for (let a = 0; a < 5 && !(g && g.air && g.named && g.banked); a++) {
        g = await grabOnce()
        if (g && g.after && g.after.crashes > 0) {
            await page.evaluate(() => window.__ssxTest.heat(0))
            await toRun()
        } else if (!g || !g.air) {
            await wait(250)
        }
    }
    r.check('a real Space ollie + KeyX grab banks points (the trick economy)',
        !!(g && g.air && g.named && g.banked),
        g ? `air=${g.air} named=${g.named} score ${g.before.score}->${g.after.score} tricks ${g.before.tricks}->${g.after.tricks}` : 'no air')
}

// ---- 6. a real KeyZ flip turns the flip ledger mid-air ----
{
    const flipOnce = async () => {
        await page.evaluate(() => {
            const k = window.__ssxTest.keys
            k.delete('KeyZ'); k.delete('KeyC'); k.delete('KeyV')
            window.__ssxTest.center()
        })
        await wait(150)
        await grounded()
        await page.keyboard.down('Space')
        await wait(550)
        await page.keyboard.up('Space')
        let air = false
        for (let i = 0; i < 30; i++) { if ((await P()).p.air) { air = true; break } await wait(70) }
        if (!air) return { air: false, maxFlip: 0 }
        await page.keyboard.down('KeyZ')
        let maxFlip = 0
        for (let i = 0; i < 35; i++) { const p = (await P()).p; maxFlip = Math.max(maxFlip, Math.abs(p.flip)); if (Math.abs(p.flip) > 15) break; await wait(60) }
        await page.keyboard.up('KeyZ')
        for (let i = 0; i < 45; i++) { if (!(await P()).p.air) break; await wait(70) }
        return { air: true, maxFlip }
    }
    let f = null
    for (let a = 0; a < 5 && !(f && f.air && f.maxFlip > 15); a++) {
        f = await flipOnce()
        if (!f || !f.air) await wait(250)
    }
    r.check('a real KeyZ flip turns the flip ledger mid-air',
        !!(f && f.air && f.maxFlip > 15), f ? `maxFlip=${f.maxFlip.toFixed(0)}deg` : 'no air')
}

// ---- 7. the pause door: '?' opens the PauseOverlay, '?' closes it ----
{
    await page.keyboard.press('?')
    await wait(450)
    const open = await page.locator('text=RESUME GAME').count()
    await page.keyboard.press('?')
    await wait(350)
    const closed = await page.locator('text=RESUME GAME').count()
    r.check("'?' opens the pause overlay", open > 0, `RESUME count=${open}`)
    r.check("'?' closes it again", closed === 0, `RESUME count=${closed}`)
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
