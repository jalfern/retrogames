// marbleplay — advisory browser driver (FORGE.md step 6, #1752): real keys
// start the race, the virtuosic bed is live and audible, it rides the run
// through the races (tempo ladder + finale switch by REAL sim events), it
// survives a death, stops at game over, and restarts — zero page errors.
// Needs `npm run dev` (or MARBLE_URL). DEV_PORT is the slot port.
import { launch, openGame, Report } from './lib/harness.mjs'

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

// ---- attract: alive, and the bed is not yet unlocked (no gesture yet) ----
let m = await spy()
r.check('attract boots with the bed silent (ctx locked pre-gesture)', !m.playing, JSON.stringify(m))

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

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
