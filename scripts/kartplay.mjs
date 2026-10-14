// kartplay — SUPER MARIO KART in Chrome with REAL key events only.
// The Node driver reads the sim's state to decide WHICH key to hold (the
// same planner the harness certified), but every actuation crosses the real
// keyboard event path: keydown/keyup through the page, into the same
// listener the human's fingers hit. It must start, drive a lap under keys,
// pick an item, and paint pixels where the sim says the kart is.
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.KART_URL || 'http://localhost:5173/retrogames/mario-kart'
const throttle = Number(opt(process.argv, '--throttle', 1))
const { throttleCPU } = await import('./lib/harness.mjs')

const r = new Report('kartplay')
const browser = await launch()
// this is the PHONE driver: touch on, so the pad it asserts is the one a
// thumb gets. The desktop assertion (pad must stay away) runs on its own
// non-touch page at the end.
const page = await openGame(browser, { url: URL, hook: '__kartTest', viewport: { width: 640, height: 560 }, touch: true })
if (throttle > 1) await throttleCPU(page, throttle)
// a clean cabinet: no lap table, no best, no ghost — the run must bank them
await page.evaluate(() => {
    localStorage.removeItem('arcade.kart.bestLap')
    localStorage.removeItem('arcade.kart.topLaps')
    localStorage.removeItem('arcade.kart.ghost')
})

const state = () => page.evaluate(() => {
    const g = window.__kartTest.game(); const k = g.karts[0]
    return { t: g.tick, phase: g.phase, screen: window.__kartTest.screen(),
        x: k.x, y: k.y, a: k.a, v: k.v, idx: k.idx, lap: k.lap, place: k.place,
        item: k.item, off: k.offroad, spin: k.spinT }
})

r.check('attract boots clean and runs the demo', await (async () => {
    const a = await state()
    await page.waitForTimeout(1200)
    const b = await state()
    return a.screen === 'attract' && b.t > a.t
})())

// the pad must be OFF the canvas during attract — its buttons used to sit
// right on the title band at phone scale — and a real tap on the bare
// canvas is the phone player's only way in
const padBtns = () => page.evaluate(() => document.querySelectorAll('.fixed.bottom-8 button').length)
r.check('attract: touchpad withdrawn from the canvas', (await padBtns()) === 0)

const cbox = await (await page.$('canvas')).boundingBox()
// the #204 bug: the canvas painted at its intrinsic 256x224 CSS px on every
// screen — `max-w/max-h` can shrink, never grow. It must fill the viewport.
r.check('canvas fills the phone viewport (scaled, not 256x224)', cbox.width >= 512 && cbox.height >= 448, `${cbox.width}x${cbox.height}`)
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(3500)
let s = await state()
r.check('a real TAP starts the race (no keyboard touched)', s.screen === 'race', `screen ${s.screen} phase ${s.phase}`)
r.check('race: touchpad present for the drive', (await padBtns()) > 0)
r.info('phase at first poll', s.phase)

// drive with REAL keys: the browser driver holds arrows just long enough
// to steer the sim's own state — no setPlan shortcut on this path
let lapsAtStart = s.lap
const held = { u: false, l: false, r: false }
const key = { u: 'ArrowUp', l: 'ArrowLeft', r: 'ArrowRight' }
const setKey = async (k, on) => {
    if (held[k] === on) return
    held[k] = on
    if (on) await page.keyboard.down(key[k]); else await page.keyboard.up(key[k])
}
const nodePlanner = await import('../src/games/MarioKart/planner.js')
const { TRACK } = await import('../src/games/MarioKart/track.js')
const kartSim = await import('../src/games/MarioKart/sim.js')

const t0 = Date.now()
let moved = false; let usedItem = false; let spinSeen = false; let seenPickup = false
while (Date.now() - t0 < 150000) {
    s = await state()
    if (s.screen !== 'race') break
    if (!moved && Math.hypot(s.x - 900, s.y - 1810) > 300) moved = true
    if (s.spin > 0) spinSeen = true
    const g = await page.evaluate(() => window.__kartTest.game())
    const log = await page.evaluate(() => (window.__kartLog || []).filter((ev) => ev.e === 'pickup' && ev.who === 'PLAYER'))
    if (log.length) seenPickup = true
    const inp = nodePlanner.decide(g)
    if (s.item === null) {
        const ahead = g.boxes.filter((b) => b && ((b.idx - s.idx + TRACK.N) % TRACK.N) < 400)
            .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0]
        if (ahead) {
            let da = Math.atan2(ahead.y - s.y, ahead.x - s.x) - s.a
            while (da > Math.PI) da -= 2 * Math.PI
            while (da < -Math.PI) da += 2 * Math.PI
            if (da > 0.02) inp.r = true
            if (da < -0.02) inp.l = true
        }
    }
    await setKey('u', inp.u)
    await setKey('l', inp.l)
    await setKey('r', inp.r)
    if (inp.item && !usedItem) { usedItem = true; await page.keyboard.press('Space') }
    if (s.lap > lapsAtStart) break
    await page.waitForTimeout(16)
}
await setKey('u', false); await setKey('l', false); await setKey('r', false)

s = await state()
r.check('the kart drove (moved off the grid under keys)', moved)
r.check('picked up an item box', seenPickup, `item ${s.item}`)
r.check('completed a full lap under real keys', s.lap >= lapsAtStart + 1, `lap ${s.lap} t ${s.t}`)
r.check('never went off-road and stayed on the leaderboard', s.place >= 1 && s.place <= 5, `place ${s.place}`)

// pixels: the row the sim says the road is on must be asphalt-ish, and the
// player sprite band near the bottom must not be empty
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const x = c.getContext('2d')
    const row = x.getImageData(128, 192, 1, 1).data
    const mid = x.getImageData(120, 168, 16, 1).data
    let lit = 0
    for (let i = 0; i < 16; i++) if (mid[i * 4] + mid[i * 4 + 1] + mid[i * 4 + 2] > 90) lit++
    return { row: [row[0], row[1], row[2]], lit }
})
r.check('road pixels painted under the kart (not black)', px.row[0] + px.row[1] + px.row[2] > 90, px.row.join(','))
r.check('player kart sprite is on screen', px.lit >= 6, `lit ${px.lit}/16`)
// the gantry's "MARIO CIRCUIT" banner used to run straight across the lap
// clock on the start line — the clock now sits on a solid bar. Sample the
// bar's empty corner (the text glyphs themselves are #f8f8f8, like clouds):
// brightest world colour under the bar reads ≤128, dimmest world without it
// (gantry red) reads ≥256, so 160 separates the two.
const bar = await page.evaluate(() => {
    const d = document.querySelector('canvas').getContext('2d').getImageData(92, 28, 1, 1).data
    return d[0] + d[1] + d[2]
})
r.check('lap clock sits on its solid bar (readable over the gantry banner)', bar < 160, `rgb sum ${bar}`)
r.info('spin seen during the lap', String(spinSeen))

const best = await page.evaluate(() => ({
    hook: window.__kartTest.best(),
    stored: Number(localStorage.getItem('arcade.kart.bestLap')) || 0,
}))
r.check('a lap banks a persisted best lap', best.hook > 0 && best.stored === best.hook, `best ${best.hook} stored ${best.stored}`)

// ============ #204 graphics pass: the kart animates, the FX are real ============
// Render-only, so the sim and its hash are untouched (kartcheck stays
// hash-for-hash) — but the renderer now has to prove it: the running cycle
// must actually toggle its two frames, and drift/spin must emit + paint
// particles. All three are forced deterministically (real keys / sim state)
// rather than hoped for, so a dead FX path goes RED instead of shipping a
// static kart again.
const fxNow = () => page.evaluate(() => window.__kartTest.fx())

// (a) ANIMATION: at speed the kart must run its 2-frame cycle. fx().frame is
// the exact index the sprite drew; parked it sits on frame 0.
await setKey('u', true)
await page.waitForTimeout(1200)
let sSpeed = await state()
let f0 = -1, f1 = -1, animToggled = false
for (let i = 0; i < 10; i++) {
    const f = await fxNow()
    if (f0 < 0) f0 = f.frame
    f1 = f.frame
    if (f.frame !== f0) animToggled = true
    await page.waitForTimeout(85)
}
await setKey('u', false)
r.check('the kart runs its 2-frame cycle while moving (not a flat block)',
    sSpeed.v > 0.4 && animToggled, `v ${sSpeed.v.toFixed(1)} frames ${f0}->${f1}`)

// (b) DRIFT SPARKS: park the kart on the start straight (test-setup, like
// kartcheck's pinned-straight probe), build speed with real keys, then hold
// steer + the drift key (B = KeyX) so the SIM enters its drift branch. The
// renderer must emit sparks — proven by the cumulative counter, a live
// sim-state witness (driftT>0), and a pixel probe while drifting.
await page.evaluate((p) => {
    const P = window.__kartTest.game().karts[0]
    P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 4; P.hint = 4; P.v = 0; P.spinT = 0
}, TRACK.pts[4])
await setKey('u', true)
await page.waitForTimeout(1400)
const baseTotal = (await fxNow()).sparkTotal
await page.keyboard.down('KeyX')
await setKey('l', true)
let driftSeen = false, sparkPx = 0
for (let i = 0; i < 12; i++) {
    const f = await fxNow()
    if (f.driftT > 0) driftSeen = true
    const hot = await page.evaluate(() => {
        const d = document.querySelector('canvas').getContext('2d').getImageData(92, 194, 72, 10).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 120 && d[i + 2] < 130) n++
        return n
    })
    if (hot > sparkPx) sparkPx = hot
    await page.waitForTimeout(55)
}
await setKey('l', false); await page.keyboard.up('KeyX'); await setKey('u', false)
const afterDrift = await fxNow()
r.check('drift emits sparks (sim drift -> renderer particles)',
    driftSeen && (afterDrift.sparkTotal - baseTotal) > 0,
    `driftSeen ${driftSeen} delta ${afterDrift.sparkTotal - baseTotal}`)
r.check('drift sparks paint pixels at the rear wheels', sparkPx > 0, `hot px ${sparkPx}`)

// (c) SPIN-OUT DUST: force a spin through the sim; the renderer must emit
// dust while spinT is live.
await page.evaluate(() => window.__kartTest.forceSpin())
await page.waitForTimeout(240)
const afterSpin = await fxNow()
r.check('spin-out emits dust (sim spinT -> renderer particles)',
    afterSpin.dust > 0 || afterSpin.spinT > 0, `dust ${afterSpin.dust} spinT ${afterSpin.spinT}`)
await setKey('u', false); await setKey('l', false); await setKey('r', false)

// ============ #199 items 1+2: the raceable ghost and the lap table ============
// The ghost must be the CERTIFIED line: the same pure machine stepped in
// Node from the same makeGame(). If the browser's phantom drifts from the
// reference at the same tick, the demo is no longer the proof.
const T_REF = 1500
const refAt = (tick) => {
    const g = kartSim.makeGame()
    for (let i = 0; i < tick; i++) kartSim.step(g, nodePlanner.decide(g))
    return g.karts[0]
}

// the end screen is the ghost's switch — and G must not be a way to leave it
await page.evaluate(() => { window.__kartTest.game().end = 'lose'; window.__kartTest.game().karts[0].place = 4 })
await page.waitForTimeout(400)
r.check('end screen withdraws the pad', (await padBtns()) === 0, `pad ${(await padBtns())}`)
const ghostState = () => page.evaluate(() => ({
    on: window.__kartTest.ghost(),
    inst: window.__kartTest.ghostGame() ? 1 : 0,
    stored: localStorage.getItem('arcade.kart.ghost'),
    top: window.__kartTest.top(),
    topStored: localStorage.getItem('arcade.kart.topLaps'),
    screen: window.__kartTest.screen(),
}))
let gs = await ghostState()
r.check('ghost is off by default (race 1 had no phantom)', gs.on === false && gs.inst === 0)
await page.keyboard.press('KeyG')
await page.waitForTimeout(150)
gs = await ghostState()
r.check('G on the end screen turns the ghost ON and stays on the screen', gs.screen === 'end' && gs.on === true && gs.stored === '1')
await page.keyboard.press('KeyG')
await page.waitForTimeout(150)
gs = await ghostState()
r.check('G again turns it back OFF', gs.on === false && gs.stored === '0')
await page.keyboard.press('KeyG')
await page.waitForTimeout(150)
gs = await ghostState()
r.check('G a third time: ON and persisted', gs.on === true && gs.stored === '1')

// a tap still leaves the end screen the old way: through attract
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(250)
r.check('tap on the end screen returns to attract', (await state()).screen === 'attract')
// the top table already holds race 1's single lap, and the attract paints it
const gold = await page.evaluate(() => {
    const d = document.querySelector('canvas').getContext('2d').getImageData(68, 101, 120, 10).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 130) n++
    return n
})
gs = await ghostState()
r.check('attract paints the gold BEST row of the top table', gold > 0, `gold px ${gold}`)
r.check('race 1 banked exactly one lap in the top table',
    gs.top.length === 1 && gs.top[0] === best.hook && gs.topStored === JSON.stringify([best.hook]),
    `top ${gs.top.map((t) => (t / 60).toFixed(1)).join(', ')}`)

// a fresh race must spawn the phantom, and race 2 is driven with the crude
// thumb (kartcheck's "human") so real laps flow into the table
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(500)
gs = await ghostState()
r.check('a new race spawns the ghost instance', gs.screen === 'race' && gs.inst === 1)

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
const thumb = (g2) => {
    const k = g2.karts[0]
    const inp = { u: true, d: false, l: false, r: false, drift: false, item: false }
    if (g2.phase !== 'race' || k.finished) { inp.u = false; return inp }
    const look = 6 + Math.round(k.v * 2.2)
    const t = TRACK.pts[(k.idx + look) % TRACK.N]
    const da = wrapA(Math.atan2(t.y - k.y, t.x - k.x) - k.a)
    if (da < -0.035) inp.l = true
    if (da > 0.035) inp.r = true
    const kmax = TRACK.aheadK((k.idx + look) % TRACK.N, look + 10)
    const vmax = Math.min(9.2, 0.040 / Math.max(kmax, 8e-4))
    if (k.v > vmax * 1.12) { inp.d = true; inp.u = false }
    if (Math.abs(da) > 0.16 && k.v > 5) inp.drift = true
    if (k.item === 'mushroom' && kmax < 0.0012) inp.item = true
    if (k.item === 'shell' || k.item === 'banana') inp.item = true
    return inp
}
// the renderer's own projection, mirrored: the ghost sprite is visible only
// while its forward distance f sits in (240, 1640) — closer and it falls off
// the bottom of the screen, farther and the cull drops it
let lineSnap = null; let ghostPix = 0; let pixDetail = 'never in view'
const t2 = Date.now()
while (Date.now() - t2 < 150000) {
    const snap = await page.evaluate((tRef) => {
        const g = window.__kartTest.game()
        const G = window.__kartTest.ghostGame()
        if (!G) return null
        const P = g.karts[0]
        const out = { tick: g.tick, top: window.__kartTest.top().length, screen: window.__kartTest.screen(), line: null, pix: null }
        if (g.tick >= tRef) out.line = { x: G.karts[0].x, y: G.karts[0].y }
        if (!G.end) {
            const GK = G.karts[0]
            const camA = window.__kartTest.camAt()
            const ca = Math.cos(camA), sa = Math.sin(camA)
            const dx = GK.x - P.x, dy = GK.y - P.y
            const f = dx * ca + dy * sa
            const l = dx * -sa + dy * ca
            if (f > 240 && f < 1640) {
                const s = 520 / f
                const sx = 128 + l * s
                const sy = 78 + 55 * s
                const w = Math.min(300, 56 * s * 0.9), h = Math.min(320, 64 * s * 0.9)
                const x0 = Math.max(0, Math.round(sx - w / 4)), y0 = Math.max(0, Math.round(sy - 3 * h / 4))
                const x1 = Math.min(256, Math.round(sx + w / 4)), y1 = Math.min(200, Math.round(sy - h / 4))
                if (x1 - x0 >= 4 && y1 - y0 >= 4) {
                    const d = document.querySelector('canvas').getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data
                    let n = 0
                    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 160) n++
                    out.pix = { frac: n / ((x1 - x0) * (y1 - y0)), f }
                }
            }
        }
        return out
    }, T_REF)
    if (!snap || snap.screen !== 'race') break
    if (!lineSnap && snap.line) lineSnap = { tick: snap.tick, ...snap.line }
    if (snap.pix && snap.pix.frac >= 0.2) { ghostPix = 1; pixDetail = `f ${snap.pix.f.toFixed(0)} frac ${snap.pix.frac.toFixed(2)}` }
    const g = await page.evaluate(() => window.__kartTest.game())
    const inp = thumb(g)
    await setKey('u', inp.u); await setKey('l', inp.l); await setKey('r', inp.r)
    if (inp.item) await page.keyboard.press('Space')
    if (lineSnap && snap.top >= 3) break
    await page.waitForTimeout(120)
}
await setKey('u', false); await setKey('l', false); await setKey('r', false)

let lineCheck = { ok: false, d: 'never reached the reference tick' }
if (lineSnap) {
    const rk = refAt(lineSnap.tick)
    const dd = Math.hypot(lineSnap.x - rk.x, lineSnap.y - rk.y)
    lineCheck = { ok: dd <= 5, d: `ghost (${lineSnap.x.toFixed(0)},${lineSnap.y.toFixed(0)}) vs ref (${rk.x.toFixed(0)},${rk.y.toFixed(0)}) @tick ${lineSnap.tick}` }
}
r.check('the phantom IS the certified line (position == Node reference at the same tick)', lineCheck.ok, lineCheck.d)
r.check('the ghost paints pixels where its sim says it is', ghostPix === 1, pixDetail)

// laps banked so far by real keys: race 1 exactly one, plus the thumb's
gs = await ghostState()
const lapEvents = await page.evaluate(() => (window.__kartLog || []).filter((e) => e.e === 'lap' && e.who === 'PLAYER').length)
r.check('the top table keeps the best three, sorted, and matches storage',
    gs.top.length === Math.min(3, lapEvents) &&
    gs.top.every((v, i) => i === 0 || gs.top[i - 1] <= v) &&
    gs.topStored === JSON.stringify(gs.top) &&
    gs.top.length >= 2,
    `banked ${lapEvents}, top ${gs.top.map((t) => (t / 60).toFixed(1)).join(', ')}`)

// out to the end screen one last time
await page.evaluate(() => { window.__kartTest.game().end = 'lose'; window.__kartTest.game().karts[0].place = 4 })
await page.waitForTimeout(400)
gs = await ghostState()
r.check('the ghost toggle survived the race (still ON)', gs.on === true && gs.stored === '1')
await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
await page.waitForTimeout(250)
r.check('tap on the end screen returns to attract', (await state()).screen === 'attract')

// the same race on a desktop box: the touchpad must stay away — the finding
// was a D-pad and A/B buttons floating over the page at 1280x800.
const desk = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
desk.on('pageerror', e => console.log('[pageerror:desk]', e.message))
await desk.goto(URL, { waitUntil: 'load' })
await desk.waitForFunction(() => !!window.__kartTest, { timeout: 15000 })
await desk.keyboard.press('ArrowUp')
await desk.waitForTimeout(1000)
r.check('desktop: no touchpad during the race', (await desk.evaluate(() => document.querySelectorAll('.fixed.bottom-8 button').length)) === 0)
await desk.close()

if (throttle > 1) r.info('throttle', `${throttle}x (advisory frame rate)`)

r.exit(browser)
