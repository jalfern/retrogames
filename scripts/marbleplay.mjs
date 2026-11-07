// marbleplay — advisory browser driver (FORGE.md step 6, #1752): real keys
// start the race, the virtuosic bed is live and audible, it rides the run
// through the races (tempo ladder + finale switch by REAL sim events), it
// survives a death, stops at game over, and restarts — zero page errors.
// Needs `npm run dev` (or MARBLE_URL). DEV_PORT is the slot port.
import { launch, openGame, Report } from './lib/harness.mjs'
import { buildHeights, GRID } from '../src/games/MarbleMadness/levels.js'
import { narrowness, targetZoom, ZOOM_BASE } from '../src/games/MarbleMadness/camera.js'

const URL = process.env.MARBLE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/marble-madness`
const r = new Report('marbleplay')
const browser = await launch({ headless: !process.argv.includes('--headful') })
const page = await openGame(browser, { url: URL, hook: '__marble', start: false, viewport: { width: 820, height: 680 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const spy = () => page.evaluate(() => window.__marble.musicSpy())
const peak = () => page.evaluate(() => window.__marble.musicPeak())
const gsq = (fn) => page.evaluate(fn)
const settle = (ms = 250) => page.waitForTimeout(ms)

// ---- attract boots with the bed silent (ctx locked pre-gesture) ----
let m = await spy()
r.check('attract boots with the bed silent (ctx locked pre-gesture)', !m.playing, JSON.stringify(m))

// ---- attract bleeds the live HUD (#1758 item 3) ----
// Painter proof in pixels: the cabinet's demo ran UNDER the HUD, so in attract
// the 20px band must be painted (dark bar over the sky) and carry bright text
// (race/clock/score glyphs). And it must be LIVE: the countdown repaints the
// band as the demo clock ticks. Mutant: re-gate the HUD on mode!=='attract'
// and the first gate below goes red (stars alone never reach 40 text pixels).
const hudScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, 20).data
    let text = 0, bar = 0, h = 2166136261
    for (let i = 0; i < d.length; i += 4) {
        const s = d[i] + d[i + 1] + d[i + 2]
        if (s > 300) text++
        if (d[i + 2] < 45) bar++
        h = (h * 16777619 ^ d[i]) >>> 0
    }
    return { mode: window.__marble.mode(), text, bar, px: d.length / 4, hash: h }
})
let hz = await hudScan()
r.check('attract paints the HUD band: dark bar + race/clock/score text pixels (#1758)',
    hz.mode === 'attract' && hz.bar > hz.px * 0.5 && hz.text > 40, JSON.stringify(hz))
await page.waitForTimeout(1300)
const hz2 = await hudScan()
r.check('the attract HUD is live — the demo clock repaints the band',
    hz2.mode === 'attract' && hz2.hash !== hz.hash && hz2.text > 40, JSON.stringify({ a: hz.hash, b: hz2.hash, text: hz2.text }))

// ---- real key starts the race AND the bed ----
await page.keyboard.press('ArrowRight')
await settle(400)
let p = await gsq(() => ({ mode: window.__marble.mode(), race: window.__marble.getGs().raceIdx }))
r.check('press any key starts the race', p.mode === 'play' && p.race === 0, JSON.stringify(p))
m = await spy()
r.check('the race bed is playing from race 1 at the base tempo',
    m.playing && m.track === 'marble' && Math.abs(m.stepDur - 0.085) < 1e-9, JSON.stringify(m))

// the analyser taps the music bus: compare a pre-gesture-style floor with now
let bedPeak = 0
for (let i = 0; i < 12; i++) { bedPeak = Math.max(bedPeak, await peak()); await settle(60) }
r.check('the bed is audible (music-bus analyser rises above silence)', bedPeak >= 8, `peak ${bedPeak}`)

// ---- drawn state tracks input ----
const pos0 = await gsq(() => ({ ...window.__marble.getGs().m }))
const px0 = await gsq(() => window.__marble.marblePx())
await page.keyboard.down('ArrowDown')
await settle(600)
await page.keyboard.up('ArrowDown')
const pos1 = await gsq(() => ({ ...window.__marble.getGs().m }))
const px1 = await gsq(() => window.__marble.marblePx())
r.check('down-arrow rolls the marble and the sprite follows',
    pos1.y > pos0.y && Math.abs(px1.y - px0.y) > 1, `y ${pos0.y.toFixed(2)}->${pos1.y.toFixed(2)} px ${px0.y.toFixed(1)}->${px1.y.toFixed(1)}`)

// ---- the ladder by REAL events: clear races 0..3 via the harness goal trick ----
const clearRace = async (want) => {
    await gsq(() => { const g = window.__marble.getGs(); g.m.x = g.race.goal.c + 0.5; g.m.y = g.race.goal.r + 0.5; g.m.vx = g.m.vy = 0 })
    await page.waitForFunction((w) => window.__marble.getGs().raceIdx === w || window.__marble.getGs().end, want, { timeout: 8000 }).catch(() => {})
    await settle(350)
}
let ladder = []
for (let want = 1; want <= 4; want++) {
    await clearRace(want)
    const st = await gsq(() => ({ race: window.__marble.getGs().raceIdx, s: window.__marble.musicSpy() }))
    ladder.push([st.race, st.s.track, st.s.stepDur?.toFixed(3)])
    if (st.race !== want) break
}
const EXPECT_BED = { 1: 'marble', 2: 'marbleMenace', 3: 'marbleAerial', 4: 'marbleFinale' }
r.check('race clears walk the tempo ladder (steps shrink, bed keeps playing)',
    ladder.length === 4 && ladder.every(([race, track, sd], i) =>
        race === i + 1 && track === EXPECT_BED[race] &&
        (!i || Number(sd) < Number(ladder[i - 1][2]))), JSON.stringify(ladder))
r.check('per-course re-voicing rides the real raceStart events (#1758)',
    ladder.length === 4 && ladder.every(([race, track], i) => race === i + 1 && track === EXPECT_BED[race]),
    JSON.stringify(ladder))
r.check('SILLY switches to the variation-up (finale track, faster step)',
    ladder.length === 4 && ladder[3][1] === 'marbleFinale' && Math.abs(ladder[3][2] - 0.072) < 1e-9,
    JSON.stringify(ladder.at(-1)))

// ---- a death ducks but never silences ----
await gsq(() => { const g = window.__marble.getGs(); g.invulnT = 0; g.m.x = 0.5; g.m.y = 0.5; g.m.z = 8 })
await settle(700)
m = await spy()
const p2 = await gsq(() => ({ lives: window.__marble.getGs().lives, deaths: window.__marble.getGs().deaths }))
r.check('a void death costs a life but keeps the bed running',
    p2.deaths >= 1 && m.playing && m.track === 'marbleFinale', JSON.stringify({ ...m, ...p2 }))

// ---- game over: the bed stops; restart: it comes back ----
// The clock is the geometry-proof kill switch: on a scoring race, expiring it
// is a death, and lives=1 under it means the next death ends the run
// (void corners vary by race and 1UPs refill lives — the clock does neither).
await gsq(() => { const g = window.__marble.getGs(); g.lives = 1; g.timeT = 2 })
await page.waitForFunction(() => window.__marble.getGs().end === 'over', null, { timeout: 5000 }).catch(() => {})
await settle(300)
m = await spy()
const over = await gsq(() => window.__marble.getGs().end)
r.check('game over stops the bed', over === 'over' && !m.playing, JSON.stringify({ over, ...m }))

await page.keyboard.press('Space')
await settle(400)
m = await spy()
const p3 = await gsq(() => ({ mode: window.__marble.mode(), race: window.__marble.getGs().raceIdx }))
r.check('any key restarts: fresh race, fresh bed at the base tempo',
    p3.mode === 'play' && p3.race === 0 && m.playing && m.track === 'marble' && Math.abs(m.stepDur - 0.085) < 1e-9,
    JSON.stringify({ ...p3, ...m }))

// ---- piano dynamics ride the live sim (#1758 item 2) ----
// fresh run = empty carry bank: the bed holds the base swell, no vibrato
m = await spy()
r.check('run start: bus holds the empty-bank swell, no vibrato',
    Math.abs(m.level - 0.82) < 1e-6 && m.vib === null, JSON.stringify(m))
await gsq(() => { const g = window.__marble.getGs(); g.carry = 30 * 60 })
await settle(200)
m = await spy()
r.check('a banked 30s carry opens the swell to full bus',
    Math.abs(m.level - 1) < 1e-6, JSON.stringify(m))
await gsq(() => { const g = window.__marble.getGs(); g.timeT = 9 * 60 })
await settle(200)
m = await spy()
r.check('the time-warning band engages the slow lead vibrato',
    m.vib !== null && Math.abs(m.vib.hz - 5.5) < 1e-9 && m.vib.cents >= 12 && m.vib.cents <= 26, JSON.stringify(m))
await gsq(() => { const g = window.__marble.getGs(); g.timeT = 40 * 60 })
await settle(200)
m = await spy()
r.check('time back above the band releases the vibrato',
    m.vib === null && m.playing, JSON.stringify(m))

// ---- a steely knock spins the marble (#1758 item 4) ----
// Park the marble on the steelie's nose (race 0 keeps one at 8.5,12.5): the
// sim knocks it (steelieHit), and the painter must spin/rock it and bend the
// bed — then everything must settle back on its own. Mutant: drop the
// `wob = WOBBLE_TICKS` seam and every gate below goes red.
await gsq(() => { const g = window.__marble.getGs(); const st = g.steelies[0]; g.knockT = 0; g.m.air = false; g.m.vx = 0; g.m.vy = 0; g.m.vz = 0; g.m.x = st.x + 0.7; g.m.y = st.y; g.m.z = g.heights[Math.floor(g.m.y)][Math.floor(g.m.x)] })
await page.waitForFunction(() => window.__marble.wobbleSpy().t > 0 || window.__marble.getGs().end, null, { timeout: 4000 }).catch(() => {})
const w1 = await gsq(() => window.__marble.wobbleSpy())
r.check('a steely knock spins the marble (wobble armed at the hit, hottest)',
    w1.t > 0 && w1.kb !== null && w1.kb.decay > 0.8, JSON.stringify(w1))
await settle(140)
const w2 = await gsq(() => window.__marble.wobbleSpy())
r.check('the spin reads through the settle (angle advances, envelope shrinks)',
    w2.kb !== null && w2.kb.angle > w1.kb.angle && w2.kb.decay < w1.kb.decay,
    JSON.stringify({ a: w1.kb && w1.kb.angle.toFixed(2), b: w2.kb && w2.kb.angle.toFixed(2) }))
m = await spy()
r.check('the knock bends the bed (fast sweep deeper than the warning vibrato)',
    m.vib !== null && m.vib.hz > 6 && m.vib.cents > 26, JSON.stringify(m))
await page.waitForFunction(() => window.__marble.wobbleSpy().t === 0 || window.__marble.getGs().end, null, { timeout: 4000 }).catch(() => {})
await settle(200)
const w3 = await gsq(() => window.__marble.wobbleSpy())
m = await spy()
r.check('the marble steadies and the bed releases (wobble done, vibrato cleared)',
    w3.t === 0 && w3.kb === null && m.vib === null && m.playing, JSON.stringify({ ...w3, vib: m.vib, playing: m.playing }))

// ---- per-section camera push-in (#1758 item 5) ----
// Drive to AERIAL (the sky-bridge race) and park the marble on its narrowest
// bridge cell: the follow-camera must ease IN toward that cell's target zoom.
// Move it onto a wide apron cell: the view must ease back OUT toward base. The
// cells are picked from the real heightmap at runtime (no hardcoding), and the
// law is painter-side — so this proves the seam is wired live, not just pinned.
const H3 = buildHeights(3)
// flat cells (all 4 neighbours same height) so the marble rests and the zoom
// converges on a constant target rather than chasing a rolling marble.
const flat = (r, c) => { const z = H3[r][c]; return [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].every(([rr, cc]) => H3[rr][cc] === z) }
let nCell = null, nm = -1, wCell = null
for (let rr = 1; rr < GRID - 1; rr++) for (let cc = 1; cc < GRID - 1; cc++) {
    if (H3[rr][cc] < 0 || !flat(rr, cc)) continue
    const nn = narrowness(H3, GRID, rr, cc)
    if (nn > nm) { nm = nn; nCell = [rr, cc] }
    if (!wCell && nn === 0) wCell = [rr, cc]
}
const park = (cell) => page.evaluate(([r, c]) => {
    const g = window.__marble.getGs()
    g.m.air = false; g.m.vx = g.m.vy = g.m.vz = 0
    g.m.x = c + 0.5; g.m.y = r + 0.5; g.m.z = g.heights[r][c]
}, cell)
// hold keeps re-parking so a down-slope can't roll the marble off the cell we
// are measuring — zoom then converges on that cell's constant target.
const hold = async (cell, ms) => { const end = Date.now() + ms; while (Date.now() < end) { await park(cell); await page.waitForTimeout(40) } }
const camSpy = () => page.evaluate(() => window.__marble.camSpy())

await clearRace(1); await clearRace(2); await clearRace(3)
const aerial = await gsq(() => window.__marble.getGs().raceIdx)
r.check('camera push-in: reached AERIAL (the sky-bridge race) to test the seam', aerial === 3, JSON.stringify({ race: aerial }))

await hold(nCell, 1600)
const camN = await camSpy()
r.check('on a narrow bridge the camera pushes in — zoom converges on the cell target, past base',
    camN.zoom > ZOOM_BASE + 0.2 && Math.abs(camN.target - targetZoom(H3, GRID, ...nCell)) < 1e-9 &&
    Math.abs(camN.zoom - camN.target) < 0.15,
    JSON.stringify({ cell: nCell, zoom: camN.zoom.toFixed(2), target: camN.target.toFixed(2) }))

await hold(wCell, 1600)
const camW = await camSpy()
r.check('back over an open apron the camera pulls out — zoom converges down to base',
    camW.zoom < camN.zoom - 0.2 && Math.abs(camW.target - ZOOM_BASE) < 1e-9 && Math.abs(camW.zoom - ZOOM_BASE) < 0.12,
    JSON.stringify({ cell: wCell, zoom: camW.zoom.toFixed(2), target: camW.target.toFixed(2), was: camN.zoom.toFixed(2) }))

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
