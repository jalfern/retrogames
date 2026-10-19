// COMET DRIFT — Chrome drives the kart with NOTHING but real key events, and the
// claims a Node harness cannot see are graded in PIXELS:
//
//   npm run cometplay     (needs `npm run dev`; COMET_URL overrides the port)
//
//   1. THE PAD PATH IS REAL — ArrowUp is the throttle: v climbs, distance grows,
//      and the cyan buggy stays pinned at the bottom-centre of the canvas while
//      the world scrolls under it (drawn sprite == logical state).
//   2. THE MINIMAP DOT FOLLOWS THE SIM — the #28c8e8 dot crawls the HUD map as
//      the kart drives, so the painted position is the sim's position.
//   3. THE DRIFT LADDER CHARGES AND PAYS on real keys — with the technique
//      the physics actually allows: Space held + steering zigzag (see stage).
//   4. A SPIN BITES — a knocked kart cannot throttle out of the spin, and
//      drives again the moment it expires.
//   5. THE CIRCUIT CHOICE IS REAL KEYS + PERSISTENT — ArrowLeft/Right on the
//      attract cycle gulch/sandbank/corkscomb and survive a page reload.
//   6. THE WHOLE RACE IS DRIVABLE IN A TAB — the certified autopilot line
//      (decide, skill 1.0 — the same line cometcheck proves wins in Node) runs
//      the NEW Daytona/Laguna layouts (#513) end-to-end: four COMET lap events,
//      a WIN, the end table, and real keys looping back through attract.
// Speed-dependent stages seed POSITION only (the __bikeTest.setup precedent —
// __cometTest.setup): the straights at 2560 scale are ~660px, too short for a
// blind full-lock drive to survive to the corner, but every consequence of a
// seed still comes from the sim's own physics under real keys.
// Geometry, reference-shape, determinism and mutants live in cometcheck.mjs.
import { launch, requireDevServer, Report } from './lib/harness.mjs'
import { selectCourse, TRACK } from '../src/games/CometDrift/track.js'

const URL = process.env.COMET_URL || 'http://localhost:5173/retrogames/comet-drift'
await requireDevServer(URL)

// seed geometry, read off the same live track the browser builds
selectCourse('sandbank')
const N = TRACK.N
const PTS = TRACK.pts
let straight = { len: 0, start: 0 }, cur = 0
for (let w = 0; w < 2 * N; w++) {
    cur = Math.abs(PTS[w % N].k) <= 0.0012 ? cur + 1 : 0
    if (cur > straight.len) straight = { len: cur, start: (w - cur + 1 + N) % N }
}
let apex = 0
for (let i = 0; i < N; i++) if (Math.abs(PTS[i].k) > Math.abs(PTS[apex].k)) apex = i
const STR = (o) => (straight.start + o) % N
selectCourse('gulch')

const r = new Report('cometplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(240000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => {
    const t = window.__cometTest
    const g = t.game()
    const P = g.karts[0]
    return {
        screen: t.screen(), course: t.course(), phase: g.phase, count: g.count, tick: g.tick,
        end: g.end, lap: P.lap, place: P.place, v: P.v, a: P.a, x: P.x, y: P.y,
        charge: P.charge, driftT: P.driftT, boostT: P.boostT, spinT: P.spinT, ...t.pos(),
        laps: (window.__cometLog || []).filter((e) => e.e === 'lap' && e.who === 'COMET').map((e) => e.lap),
        finished: (window.__cometLog || []).some((e) => e.e === 'finish' && e.who === 'COMET'),
    }
})
const seed = (i, v) => page.evaluate(([i2, v2]) => window.__cometTest.setup({ i: i2, v: v2, go: true }), [i, v])
const wait = (ms) => page.waitForTimeout(ms)

// cyan pixel census: the COMET buggy's chassis (#28c8e8) and the minimap dot
// are the only strict-cyan things on screen. Pixels below the horizon outside
// the minimap rectangle are the buggy itself; inside it, the HUD dot.
const cyanCensus = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-fit="source"]')
    const g = c.getContext('2d')
    const { w, h, horizon } = window.__cometTest.view()
    const d = g.getImageData(0, 0, w, h).data
    const isC = (i) => d[i] >= 30 && d[i] <= 55 && d[i + 1] >= 185 && d[i + 1] <= 215 && d[i + 2] >= 218 && d[i + 2] <= 246
    const hs = Math.min(h / 176, w / 256)
    const mmX = Math.round(w - 58 * hs - 2 * hs) - 2
    const mmY = Math.round(52 * hs) + 2
    const dot = { n: 0, x: 0, y: 0 }
    const kart = { n: 0, x: 0, y: 0 }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!isC((y * w + x) * 4)) continue
            if (x >= mmX && y <= mmY) { dot.n++; dot.x += x; dot.y += y }
            else if (y > horizon) { kart.n++; kart.x += x; kart.y += y }
        }
    }
    return { w, h, horizon, dot, kart }
})
const centroid = (o) => (o.n ? { x: o.x / o.n, y: o.y / o.n } : null)

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__cometTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__cometTest never appeared (dev server? /comet-drift route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(800)

// ---- attract: the autopilot demo rides a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let moved = false
    const t0 = a.tick
    for (let i = 0; i < 60 && !moved; i++) { moved = (await probe()).tick > t0 + 30; if (!moved) await wait(100) }
    r.check('attract sim is live (autopilot demo ticks)', moved, `tick ${t0} -> ${(await probe()).tick}`)
    const p = await cyanCensus()
    r.check('the attract view paints the cyan buggy on the road', p.kart.n > 25, `${p.kart.n} cyan px below horizon`)
}

// ---- real ←/→ cycle circuits, and the pick survives a reload ----
{
    const seen = [(await probe()).course]
    for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await wait(200); seen.push((await probe()).course) }
    r.check('real ArrowRight cycles all three circuits from attract', new Set(seen).size === 3, seen.join(' -> '))
    for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await wait(150) }
    const pick = (await probe()).course
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__cometTest, null, { timeout: 30000 })
    await wait(500)
    const after = (await probe()).course
    r.check('the circuit choice persists across a reload (localStorage)', after === pick, `${pick} -> reload -> ${after}`)
}

// ---- a real key starts the race; the countdown lifts; the grid throttle is real ----
await page.keyboard.press('KeyX')
await wait(250)
{
    const a = await probe()
    r.check('a real key starts the race on the picked circuit', a.screen === 'race' && a.phase === 'count' && a.count > 0 && a.course === 'sandbank',
        `screen=${a.screen} phase=${a.phase} count=${a.count} course=${a.course}`)
}
let go = false
for (let i = 0; i < 120 && !go; i++) { const s = await probe(); go = s.phase === 'race'; if (!go) await wait(80) }
r.check('the countdown lifts to GO (real 3-2-1)', go, `phase=${(await probe()).phase}`)
{
    const a = await probe()
    await page.keyboard.down('ArrowUp')
    let vPeak = 0
    for (let i = 0; i < 42; i++) { vPeak = Math.max(vPeak, (await probe()).v); await wait(60) }
    const b = await probe()
    const p = await cyanCensus()
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const kc = centroid(p.kart)
    r.check('ArrowUp off the grid builds real speed', vPeak > 4.5, `v ${a.v.toFixed(2)} -> peak ${vPeak.toFixed(2)}`)
    r.check('holding throttle moves the kart through the world', dist > 60, `moved ${dist.toFixed(0)} px`)
    r.check('the buggy is PAINTED pinned at bottom-centre while the world scrolls',
        p.kart.n > 25 && Math.abs(kc.x - p.w / 2) < 20 && kc.y > p.horizon + 10,
        `kart centroid (${kc.x.toFixed(0)},${kc.y.toFixed(0)}) on ${p.w}x${p.h} horizon ${p.horizon}, ${p.kart.n} px`)
    await page.keyboard.up('ArrowUp')
}

// ---- the HUD minimap dot crawls as the sim advances (seeded on the straight) ----
{
    r.info('sandbank geometry', `longest straight ${straight.len} samples @idx ${straight.start}; tightest r=${(1 / Math.abs(PTS[apex].k)).toFixed(0)}px @idx ${apex}`)
    await seed(STR(4), 6.5)
    const p = await cyanCensus()
    const d0 = centroid(p.dot)
    await page.keyboard.down('ArrowUp')
    await wait(1600)
    const p2 = await cyanCensus()
    const d1 = centroid(p2.dot)
    await page.keyboard.up('ArrowUp')
    const crawled = d0 && d1 ? Math.hypot(d1.x - d0.x, d1.y - d0.y) : -1
    r.check('the HUD minimap dot is painted and follows the sim position', crawled >= 2,
        crawled < 0 ? `dot ${p.dot.n}px -> ${p2.dot.n}px (one census empty)` : `dot crawled ${crawled.toFixed(1)}px (${p.dot.n}px -> ${p2.dot.n}px)`)
}

// ---- steering is real: a short held ArrowLeft turns the kart ----
{
    await seed(STR(8), 5)
    const a = await probe()
    await page.keyboard.down('ArrowLeft')
    let turned = null
    for (let i = 0; i < 8 && turned === null; i++) {
        await wait(45)
        const d = (await probe()).a - a.a
        if (Math.abs(d) > 0.05) turned = d
    }
    await page.keyboard.up('ArrowLeft')
    r.check('held ArrowLeft steers the kart (heading changes)', turned !== null && turned < 0, `Δheading=${turned === null ? 'none' : turned.toFixed(3)}`)
}

// ---- the drift ladder charges and pays on real keys ----
// The drift the keyboard can actually hold: Space stays down while the steering
// ZAGZAGS (left/right swapped every ~8 ticks) — each leg slides the kart out,
// the counter-leg swings it back, driftT (and the charge) never release, and
// the gas outruns the drag. Node-verified (v 5.4 -> tier 1 exactly at tick 50,
// |lat| <= 67, surf stays road on the Sandbank straight). A one-direction
// full-lock drift is physically impossible to hold: it walks the kart off the
// asphalt in ~20 ticks (measured), so the ladder was always a slalom game.
{
    await page.evaluate(() => window.__game.reset(0))
    await seed(STR(4), 5.4)
    await page.keyboard.down('Space')
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('ArrowLeft')
    // swap on WORLD ticks, not wall time (the harness-law: waits are sim
    // seconds), AND correct like a driver does: flip early whenever |lat|
    // strays toward the verge — a leg that runs long because of a browser
    // stall must not be allowed to walk the kart into the sand.
    let charged = 0
    let steerLeft = true
    const t0 = (await probe()).tick
    // #518: the downhill sections make every leg slide farther for the same
    // key timing, so the correction band tightened (Node-reverified: held drift
    // still reaches tier 1 at |lat| <= 92, off=never on the Gulch straight).
    let nextSwap = t0 + 6
    for (let i = 0; i < 400 && charged < 50; i++) {
        const s = await probe()
        charged = Math.max(charged, s.charge)
        if (charged < 50) {
            const flip = s.tick >= nextSwap || (steerLeft ? s.lat < -45 : s.lat > -30)
            if (flip) {
                steerLeft = !steerLeft
                await page.keyboard.down(steerLeft ? 'ArrowLeft' : 'ArrowRight')
                await page.keyboard.up(steerLeft ? 'ArrowRight' : 'ArrowLeft')
                nextSwap = s.tick + 6
            }
        }
        await wait(15)
    }
    const held = await probe()
    await page.keyboard.up('Space')
    await page.keyboard.up('ArrowLeft')
    await page.keyboard.up('ArrowRight')
    await page.keyboard.up('ArrowUp')
    let paid = (await probe()).boostT
    for (let i = 0; i < 10 && paid <= 0; i++) { paid = (await probe()).boostT; await wait(50) }
    r.check('Space + steering zigzag above v4.5 charges the drift ladder (>= tier 1)', charged >= 50,
        `charge=${charged} surf=${held.surf} v=${held.v.toFixed(2)}`)
    r.check('releasing the drift pays a turbo boost', paid > 0, `boostT=${paid}`)
}

// ---- a spin bites: no throttle out of it, and it recovers ----
{
    await seed(STR(2), 6)
    await page.keyboard.down('ArrowUp')
    const v0 = (await probe()).v
    await page.evaluate(() => window.__cometTest.forceSpin())
    let mid = null
    for (let i = 0; i < 60; i++) {
        const s = await probe()
        if (s.spinT > 0 && s.spinT <= 45) { mid = s; break }
        await wait(60)
    }
    const killed = !!mid && mid.v <= v0 * 0.75
    let back = -1
    for (let i = 0; i < 120; i++) { back = (await probe()).spinT; if (back === 0) break; await wait(60) }
    let rec = 0
    for (let i = 0; i < 40; i++) { rec = Math.max(rec, (await probe()).v); if (rec > 4) break; await wait(60) }
    await page.keyboard.up('ArrowUp')
    r.check('a spin kills speed under a held throttle (a knocked kart cannot drive off)', killed,
        `v ${v0.toFixed(2)} -> ${mid ? mid.v.toFixed(2) : '?'} while spinT=${mid ? mid.spinT : '?'}`)
    r.check('the kart recovers from the spin and drives again', back === 0 && rec > 4, `spinT=${back}, v rebuilt to ${rec.toFixed(2)}`)
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

// ---- the whole race is drivable IN THE TAB on the #513 layouts ----
// The certified autopilot line (the exact line cometcheck proves wins in Node)
// drives the NEW Daytona track end-to-end: 4 laps, a win, the end table, and
// real keys loop back through attract into a fresh race.
{
    await page.evaluate(() => { window.__cometTest.setCourse('sandbank'); window.__cometTest.setPlan(true) })
    await wait(250)
    const a = await probe()
    r.check('SANDBANK (Daytona layout) takes the wheel fresh', a.screen === 'race' && a.lap === 0 && a.course === 'sandbank',
        `screen=${a.screen} lap=${a.lap} course=${a.course}`)
    let win = false
    let lastLap = -1, lastTick = 0, frozen = false
    const t0 = Date.now()
    while (!win && Date.now() - t0 < 9 * 60 * 1000) {
        const s = await probe()
        if (s.lap !== lastLap) {
            lastLap = s.lap
            r.info('autopilot on the Daytona layout', `lap ${Math.min(s.lap + 1, 4)}/4 v=${s.v.toFixed(1)} pos ${s.place} — ${((Date.now() - t0) / 1000).toFixed(0)}s`)
        }
        if (s.tick <= lastTick && Date.now() - t0 > 30000) { frozen = true; break }
        lastTick = s.tick
        win = s.end === 'win'
        if (!win && s.end) { r.check('autopilot finishes the race', false, `finished ${s.place}th — not P1`); break }
        if (!win) await wait(250)
    }
    if (frozen) r.check('the sim clock keeps running', false, `tick frozen at ${lastTick}`)
    const fin = await probe()
    r.check('the certified line drives 4 laps of the NEW Daytona layout and WINS in the tab',
        win && new Set(fin.laps).size === 4 && fin.finished, `lap events {${fin.laps.join(',')}}`)
    await wait(1200)
    await page.keyboard.press('KeyX')
    await wait(350)
    const mid = await probe()
    r.check('a real key returns to attract after the win', mid.screen === 'attract', `screen=${mid.screen}`)
    await page.evaluate(() => window.__cometTest.setCourse('corkscomb'))
    await page.keyboard.press('KeyX')
    await wait(250)
    const fresh = await probe()
    r.check('and a real key starts a fresh race on CORKSCOMB (Laguna layout)',
        fresh.screen === 'race' && fresh.course === 'corkscomb' && fresh.lap === 0, `screen=${fresh.screen} course=${fresh.course} lap=${fresh.lap}`)
    await page.evaluate(() => window.__cometTest.setPlan(false))
}

r.check('zero page errors across the whole drive', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
