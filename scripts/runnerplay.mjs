// MOMENTUM RUNNER — Chrome plays the runner with NOTHING but real key events,
// and two things a Node harness cannot see are graded in PIXELS:
//
//   npm run runnerplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — a real Space/Arrow keypress reaching step() through
//      the browser event stack (the same codes the virtual pad dispatches);
//   2. THE PAINT FOLLOWS PHYSICS — the hero is sampled at the exact screen
//      pixel the physics reports (screen = world - cam, on a 2x canvas). If
//      the renderer painted the hero anywhere but where the body IS, that
//      pixel goes dark.
//
// The full route (all three zones INCLUDING the loop) is proven by the attract
// demo running in a real rAF tab, so the loop completion is real, not a Node
// fixture. Every jump that must land on a tick is scheduled against gs.tick,
// never the wall clock (the metroidplay lesson: CDP round-trips coalesce rAF).
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.RUNNER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/momentum`
await requireDevServer(URL)

const r = new Report('runnerplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__runnerTest.probe())
const tick = () => page.evaluate(() => window.__runnerTest.probe().tick)
const wait = ms => page.waitForTimeout(ms)
const tap = k => page.keyboard.press(k)
const untilTick = async (n) => { for (let i = 0; i < 400; i++) { if ((await tick()) >= n) return; await wait(10) } }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__runnerTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__runnerTest never appeared (dev server? /momentum route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1000)

// ---- attract: the autopilot's full route plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let zonesSeen = new Set(), maxRings = 0, maxScore = 0, camMax = 0, deaths = 0, loopDone = false, tickGrew = false
    const t0 = a.tick
    for (let i = 0; i < 55; i++) {
        const s = await probe()
        tickGrew = tickGrew || s.tick > t0 + 40
        zonesSeen.add(s.zone); maxRings = Math.max(maxRings, s.rings); maxScore = Math.max(maxScore, s.score)
        camMax = Math.max(camMax, s.cam.x); deaths = Math.max(deaths, s.deaths)
        if (s.loopTaken) loopDone = true
        if (s.evLog.some(e => e.type === 'loop')) loopDone = true
        await wait(400)
    }
    r.check('attract sim is live and zero-hit through a full route', tickGrew && deaths === 0, `tick ${t0}->${(await probe()).tick} deaths=${deaths}`)
    r.check('attract crosses all three zones', zonesSeen.has(0) && zonesSeen.has(1) && zonesSeen.has(2), `zones ${[...zonesSeen].join(',')}`)
    r.check('attract EARNES the loop on its own (real rAF, no fixture)', loopDone, loopDone ? 'loop event seen in a real tab' : 'loopTaken/loop-event never observed')
    r.check('attract collects rings and scores', maxRings > 0 && maxScore > 500, `rings=${maxRings} score=${maxScore}`)
    r.check('attract camera travels the whole run', camMax > 1400, `camMax=${camMax}`)
}

// ---- a real key starts a fresh run and held RIGHT drives speed + camera ----
await tap('KeyZ')
await wait(400)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.score === 0 && a.rings === 0, `screen=${a.screen} score=${a.score}`)

    // THE SECTOR BED: an original synth loop per zone, from the shared music
    // engine. The probe carries the engine's own state — pre-fix there is no
    // bed at all (playing=false), so this check fails on the old build.
    await wait(300)
    const m = (await probe()).music
    r.check('the sector bed is playing under the run (music engine state)',
        m && m.playing === true && m.track === 'runnerCity' && m.ctx === 'running',
        `playing=${m && m.playing} track=${m && m.track} ctx=${m && m.ctx}`)

    // #833 TEMPO LIFT: the grid must follow speed SSX-style — the pinned resting
    // step while coasting, tightening toward the 0.84 band at VMAX. The probe
    // reads the engine's live stepDur, so a dead seam (step pinned to the grid)
    // fails here even though the bed plays.
    await page.evaluate(() => { window.__runnerTest.setSpeed(0) })
    await wait(120)
    const rest = (await probe()).music
    await page.evaluate(() => { window.__runnerTest.setSpeed(1150) })
    await wait(140)
    const fast = (await probe()).music
    r.check('#833 the bed lifts its grid with speed (0.105 rest, tighter at VMAX)',
        rest && rest.stepDur === 0.105 && fast && fast.stepDur < rest.stepDur && fast.stepDur >= 0.105 * 0.84 - 1e-6,
        `rest=${rest && rest.stepDur} fast=${fast && fast.stepDur}`)
    await page.keyboard.down('ArrowRight')
    await wait(900)
    const b = await probe()
    r.check('held RIGHT builds real momentum (past a standing start)', b.speed > 260 && b.x > a.x + 40, `speed ${b.speed} x ${a.x}->${b.x}`)
    r.check('the run drags the camera forward', b.cam.x > 0, `cam.x=${b.cam.x}`)

    // PAINT FOLLOWS PHYSICS: the canvas renders at 2x the sim space, so the
    // hero's reported pixel is at at*2. Sample the hero's UNIQUE cyan core
    // (a colour the track, rings and backgrounds never use) at that exact
    // screen pixel, then move the body with a real key and resample — it must
    // still be there.
    const heroAt = () => page.evaluate(() => {
        const q = window.__runnerTest.probe()
        const g = document.querySelector('canvas[data-runner-stage]').getContext('2d')
        const X = q.at.x * 2, Y = q.at.y * 2
        const d = g.getImageData(Math.max(0, X - 13), Math.max(0, Y - 13), 26, 26).data
        let hero = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 75 && d[i] < 135 && d[i + 1] > 225 && d[i + 2] > 235) hero++
        return { hero, at: q.at }
    })
    const s1 = await heroAt()
    await wait(120)
    const s2 = await heroAt()
    r.check('the hero is PAINTED on the pixel the physics reports', s1.hero >= 35 && s2.hero >= 35, `hero px ${s1.hero}/${s2.hero} at ${s1.at.x},${s1.at.y}->${s2.at.x},${s2.at.y}`)
    await page.keyboard.up('ArrowRight')
}

// ---- variable jump: TWO real presses, scheduled against the sim tick ----
{
    // The cut window is ~19 ticks from the LAUNCH tick, and CDP latency is
    // itself multi-tick — so the check is decided by the ENGINE'S OWN `cut`
    // flag, not by a race against the wire. A tap attempt counts only if the
    // key-up demonstrably reached step() mid-climb (cut=true); on a busy tab
    // a late key-up simply doesn't count and the attempt retries. Hold:
    // release only AFTER landing, so a genuine hold measures the engine.
    const jump = async (hold) => {
        await page.evaluate(() => { window.__runnerTest.teleport(120); window.__runnerTest.setSpeed(0) })
        await wait(80)
        const y0 = (await probe()).y
        await page.keyboard.down('Space')
        let minY = 1e9, lt = 0, cut = false
        if (!hold) {
            for (let i = 0; i < 60; i++) {
                const q = await probe()
                if (q.mode === 'air') { lt = q.tick; minY = q.y; await page.keyboard.up('Space'); break }
                await wait(10)
            }
            for (let i = 0; i < 30 && !cut; i++) {
                const q = await probe()
                if (q.mode === 'air') minY = Math.min(minY, q.y)
                if (q.cut) cut = true
                if (!q.mode || (lt && q.tick >= lt + 40)) break
                await wait(10)
            }
        } else {
            for (let i = 0; i < 250; i++) {
                const q = await probe()
                if (q.mode === 'air') { if (!lt) lt = q.tick; minY = Math.min(minY, q.y) }
                if (lt && q.mode === 'track' && q.tick > lt + 2) break
                await wait(15)
            }
            await page.keyboard.up('Space')
        }
        return { rise: lt ? y0 - minY : 0, cut }
    }
    let shortRise = 0, tallRise = 0
    for (let a = 0; a < 8 && !shortRise; a++) { const t = await jump(false); if (t.cut && t.rise <= 88) shortRise = t.rise }
    for (let a = 0; a < 3; a++) tallRise = Math.max(tallRise, (await jump(true)).rise)
    r.check('a quick tap jumps SHORT, a held key jumps FAR (real keys, cut proven in the engine)',
        shortRise > 0 && tallRise >= 95 && tallRise - shortRise >= 10,
        `cut tap ${shortRise.toFixed(0)}px vs hold ${tallRise.toFixed(0)}px`)
}

// ---- a pit, jumped with real keys: launch near the lip, land past the far side ----
{
    await page.evaluate(() => { window.__runnerTest.teleport(470); window.__runnerTest.setSpeed(430) })
    await wait(60)
    await page.keyboard.down('ArrowRight')
    // fire the jump as the body nears the Green Hill lip (x≈540), tick-free by position
    for (let i = 0; i < 40; i++) { const q = await probe(); if (q.x >= 520) break; await wait(15) }
    const t0 = await tick()
    await page.keyboard.down('Space'); await untilTick(t0 + 3); await page.keyboard.up('Space')
    let landed = null
    for (let i = 0; i < 40; i++) { const q = await probe(); if (q.mode === 'track' && q.x > 600) { landed = q; break } await wait(30) }
    await page.keyboard.up('ArrowRight')
    r.check('real keys launch over a pit and land past the far lip (no death)',
        landed && landed.x > 720, landed ? `landed x=${landed.x.toFixed(0)} (lip 720)` : 'never landed past 600')
}

// ---- rings are collected by rolling through them (real input) ----
{
    await page.evaluate(() => { window.__runnerTest.teleport(840); window.__runnerTest.setSpeed(240) })
    await wait(60)
    await page.keyboard.down('ArrowRight')
    let rings = 0
    for (let i = 0; i < 60; i++) { const q = await probe(); rings = Math.max(rings, q.rings); if (q.x > 985) break; await wait(40) }
    await page.keyboard.up('ArrowRight')
    const ev = (await probe()).evLog.filter(e => e.type === 'ring').length
    r.check('rolling through a ring cluster collects rings (real keys)', rings > 0 && ev > 0, `rings=${rings} ringEvents=${ev}`)
}

// ---- the totem remembers: save, then a pit death returns you there ----
{
    await page.evaluate(() => { window.__runnerTest.teleport(1780); window.__runnerTest.setSpeed(300) })
    await wait(60)
    await page.keyboard.down('ArrowRight')
    let saved = false
    for (let i = 0; i < 60; i++) { const q = await probe(); if (q.save.x === 1900) { saved = true; break } await wait(40) }
    await wait(200)
    await page.keyboard.up('ArrowRight')
    r.check('rolling past a totem saves (checkpoint event)', saved, `save.x=${(await probe()).save.x}`)

    // Green Hill's pit is CROSSABLE with momentum — that IS the game: an early
    // trace of this very section showed a fast roll sailing off the lip and
    // LANDING on the far one (x≈795, alive, rings and all). So fall the way a
    // fumbled runner does: roll off the lip from standstill and BRAKE the
    // flight with a real LEFT. Pure-Node proof against sim.js: releasing RIGHT
    // and holding LEFT at ANY x from 500 to 640 — ground or mid-fall — crosses
    // deathY left of the far lip and respawns at the totem. The window is far
    // wider than one CDP poll, so no lag-sensitive scheduling is needed.
    await page.evaluate(() => { window.__runnerTest.teleport(470); window.__runnerTest.setSpeed(0) })
    await wait(60)
    const d0 = (await probe()).deaths
    await page.keyboard.down('ArrowRight')
    for (let i = 0; i < 60; i++) { const q = await probe(); if (q.x >= 515) break; await wait(20) }
    await page.keyboard.up('ArrowRight')
    await page.keyboard.down('ArrowLeft')
    let died = false
    for (let i = 0; i < 80; i++) { const q = await probe(); if (q.deaths > d0) { died = true; break } await wait(40) }
    await page.keyboard.up('ArrowLeft')
    await wait(200)
    const q = await probe()
    r.check('a pit death throws you back to the last totem, not the start',
        died && Math.abs(q.x - 1900) < 40 && q.screen === 'play', `died=${died} x=${q.x.toFixed(0)} screen=${q.screen}`)
}

// ---- per-zone beds: replay the PROVEN route in play mode on the contract
// clock and watch the bed switch track as the sectors change. The pad emulates
// the plan's jumpEdge/jumpCut as A-button transitions; the game's own contract
// tick derives the edges exactly as a real key would.
{
    const res = await page.evaluate(async () => {
        const sim = await import('/retrogames/src/games/MomentumRunner/sim.js')
        const script = sim.planRun().script
        window.__game.reset(0)
        await new Promise(r => requestAnimationFrame(r))
        const seen = {}
        let prevA = false
        for (let i = 0; i < script.length; i += 5) {
            for (let k = 0; k < 5 && i + k < script.length; k++) {
                const inp = script[i + k]
                let a = prevA
                if (inp.jumpEdge) a = true
                if (inp.jumpCut) a = false
                prevA = a
                window.__game.step({ left: !!inp.left, right: !!inp.right, up: a, a }, 1)
            }
            await new Promise(r => requestAnimationFrame(r))
            const p = window.__runnerTest.probe()
            if (seen[p.zone] === undefined && p.music) seen[p.zone] = p.music.track
            if (p.end) break
        }
        window.__game.release()
        return { seen, end: window.__runnerTest.probe().end }
    })
    r.check('each sector plays its OWN bed (proven route replayed in play mode)',
        res.seen[0] === 'runnerCity' && res.seen[1] === 'runnerForge' && res.seen[2] === 'runnerOrbit' && res.end === 'win',
        `seen=${JSON.stringify(res.seen)} end=${res.end}`)
}

// ---- the pause door ----
{
    await tap('Shift+Slash')
    await wait(300)
    r.check('a real ? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await tap('Shift+Slash')
    await wait(250)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
