// pacmandrive (#3755) — real Chrome plays PAC-MAN end to end with REAL keys.
//
// pacmancheck is Node-only by design (#472) and pacwatchdrive (#3679) rides the
// attract autopilot — until now nothing drove the HUMAN loop in a browser.
// The ride, per FORGE.md step 6: attract observes → a real key starts the run →
// dots pay → the lower-left energizer frightens the ghosts → a ghost is chased
// while powered → Pac-Man dies → the run restarts (game-over pressed away with
// a real key) — and at checkpoints the DRAWN wedge is compared with the
// LOGICAL head position on the canvas (the mcsaucerdrive pixel-vs-probe habit).
//
// Route (seed-fixed, classic 28×31 map): start (14,23) Left along row 23, UP
// col 6 to the open tunnel row 14, then the arcade wrap (x=0↔x=27) carries
// the run to col 21; DOWN to row 20, RIGHT along row 20's east dots into
// col 26, DOWN col 26 (two dots, then the energizer at (23,26)). Every turn
// is a real keydown/keyup, pressed EARLY so the arcade pre-turn law lands it
// at the intended cell; polls ride the DEV probe (window.__pacTest).
//
// Repro: `PACMANDRIVE_SEED=7 npm run pacmandrive` against `npm run dev`
// (DEV_PORT, default 5173). Advisory lane drive — runs on the lanes, not CI.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/pacman`
const SEED = Number(process.env.PACMANDRIVE_SEED || 7)
const MW = 28 * 16, MH = 31 * 16 // logical maze size in drawing units (CELL_SIZE = 16)

const rep = new Report('pacmandrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=${SEED}`, hook: '__pacTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)

const probe = () => page.evaluate(() => (window.__pacTest ? window.__pacTest.probe() : null))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// real key transitions, one pad held at a time (the game reads window key/keyup)
let held = null
async function steer(dir) {
    const code = 'Arrow' + dir
    if (held && held !== code) await page.keyboard.up(held)
    await page.keyboard.down(code)
    held = code
}
async function release() { if (held) { await page.keyboard.up(held); held = null } }

// poll the probe until f(p) is true; returns the winning probe, or null when
// the budget ran out — never the last sample (a truthy timeout would read as
// a passed leg, the same trap as an unfalsy page handle).
async function until(f, ms, stepMs = 100) {
    const end = Date.now() + ms
    for (;;) {
        const p = await probe()
        if (p && f(p)) return p
        if (!p || Date.now() > end) return null
        await sleep(stepMs)
    }
}

// drawn-vs-logical: the yellow wedge must sit at the logical head position
// (canvas transform recomputed here from the same math the draw uses: fit×0.95,
// centred — index.jsx draw()). Returns { n, off, cell } — yellows in a ±1.7
// cell window and the centroid offset from the expected point, in cells.
function pacPixels() {
    return page.evaluate(({ MW, MH }) => {
        const c = document.querySelector('canvas')
        const p = window.__pacTest.probe()
        const r = c.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const s = Math.min(r.width / MW, r.height / MH) * 0.95
        const mx = (p.pac.x + p.pac.dir.x * p.pac.p) * 16 + 8
        const my = (p.pac.y + p.pac.dir.y * p.pac.p) * 16 + 8
        const ex = ((r.width - MW * s) / 2 + mx * s) * dpr
        const ey = ((r.height - MH * s) / 2 + my * s) * dpr
        const rad = Math.ceil(1.7 * 16 * s * dpr)
        const x0 = Math.max(0, Math.floor(ex - rad))
        const y0 = Math.max(0, Math.floor(ey - rad))
        const w = Math.min(c.width - x0, Math.ceil(rad * 2))
        const h = Math.min(c.height - y0, Math.ceil(rad * 2))
        const d = c.getContext('2d').getImageData(x0, y0, w, h).data
        let n = 0, sx = 0, sy = 0
        for (let i = 0; i < d.length; i += 4) {
            // strong yellow — the wedge (#ffff00); the pinks/oranges/blues of
            // ghosts and fruit fail at least one channel bound
            if (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 140) {
                n++; sx += (i / 4) % w; sy += Math.floor((i / 4) / w)
            }
        }
        const cx = n ? x0 + sx / n : -1, cy = n ? y0 + sy / n : -1
        return { n, off: n ? Math.hypot(cx - ex, cy - ey) / (16 * s * dpr) : -1 }
    }, { MW, MH })
}

const p0 = await probe()
rep.check('boots with the DEV probe, zero errors so far', !!p0 && errors === 0, `errors=${errors}`)

// 1 — ATTRACT: the demo drives itself before any input
const a1 = await probe()
await sleep(1200)
const a2 = await probe()
rep.check('attract demo moves with no input', a1.attract && a2.attract &&
    (a1.pac.x !== a2.pac.x || a1.pac.y !== a2.pac.y),
    `pac (${a1.pac.x},${a1.pac.y}) → (${a2.pac.x},${a2.pac.y})`)

// 2 — START + eat: a real key starts the run; row 23 leftward pays dots
await steer('Left')
const turnPt = await until(p => p.pac.y === 23 && p.pac.x <= 6.35, 6000)
rep.check('a real key starts the run and row 23 left is walked', !!turnPt,
    `pac (${turnPt?.pac.x?.toFixed?.(2)},${turnPt?.pac.y})`)
const s1 = await probe()
rep.check('dots pay (score rises from the fresh 0)', s1.score >= 40, `score=${s1.score}`)

// 3 — the energizer leg, tunnel circuit. Press EARLY and let the arcade
// pre-turn law steer: Left rails row 23 to col 6; UP climbs col 6 to the
// open tunnel row 14; Left enters the wrap (x=0 re-emerges at x=27) and
// rails to col 21 (wall at col 20 stops it); DOWN col 21 to row 20; RIGHT
// along row 20's east dots into col 26; DOWN col 26 — rows 21–22 are dots
// (+10 each) so a +50 there can only be the energizer at (23,26), and the
// witness position must agree (x≥24, y≥22). A natural death lands mid-route
// (ghosts chase from tick 0): the leg retries from the respawn cell.
const pBase = await probe()
let baseDeaths = pBase.deaths, won = null, toTunnel = null, wrapped = null
let sawPower = false, sawScared = false, eatDelta = 0, ateAt = null
const evidence = (p) => {
    if (p.power > 0) sawPower = true
    if (p.ghosts.some(g => g.state === 'scared')) sawScared = true
}
const ATE = (p) => sawPower || sawScared || (eatDelta >= 50 && p.pac.y >= 22 && p.pac.x >= 24)
for (let attempt = 0; attempt < 3 && !won; attempt++) {
    await steer('Left')
    const t1 = await until(p => { evidence(p); return (p.pac.y === 23 && p.pac.x <= 6.6) || p.deaths > baseDeaths }, 8000)
    if (!t1 || t1.deaths > baseDeaths) { baseDeaths = t1?.deaths ?? baseDeaths; continue }
    await steer('Up')
    // press Left ~1 cell early (poll+steer latency ≈ a cell at ghost speed):
    // the buffer then turns exactly at (6,14), the first open-left cell. A
    // late press (y=13 witnesses) coasts past the tunnel and never wraps.
    const t2 = await until(p => { evidence(p); return p.pac.y <= 15.2 || p.deaths > baseDeaths }, 6000)
    if (!t2 || t2.deaths > baseDeaths) { baseDeaths = t2?.deaths ?? baseDeaths; continue }
    toTunnel ??= t2
    await steer('Left')
    const t3 = await until(p => {
        evidence(p)
        if (p.pac.y === 14 && p.pac.x >= 23) wrapped ??= { x: p.pac.x, y: p.pac.y }
        return (p.pac.y === 14 && p.pac.x >= 23) || p.deaths > baseDeaths
    }, 6000)
    if (!t3 || t3.deaths > baseDeaths) { baseDeaths = t3?.deaths ?? baseDeaths; continue }
    await steer('Down')
    // press Right early: col 22 is wall on every row but 20, so the buffer
    // must already be held when the run enters (21,20)
    const t4 = await until(p => { evidence(p); return p.pac.y >= 18.5 || p.deaths > baseDeaths }, 5000)
    if (!t4 || t4.deaths > baseDeaths) { baseDeaths = t4?.deaths ?? baseDeaths; continue }
    await steer('Right')
    const t5 = await until(p => { evidence(p); return p.pac.y === 20 && p.pac.x >= 25.5 || p.deaths > baseDeaths }, 5000)
    if (!t5 || t5.deaths > baseDeaths) { baseDeaths = t5?.deaths ?? baseDeaths; continue }
    await steer('Down')
    const descentScore = (await probe()).score
    won = await until(p => {
        evidence(p); eatDelta = p.score - descentScore
        if (ATE(p) && !ateAt) ateAt = { x: p.pac.x, y: p.pac.y }
        return ATE(p) || p.done || p.deaths > baseDeaths
    }, 8000, 60)
    if (!won || !ATE(won)) { baseDeaths = won?.deaths ?? baseDeaths; won = null } // died or derailed
}
rep.check('rail climbs col 6 to the tunnel row 14', !!toTunnel, `pac y=${toTunnel?.pac.y}`)
rep.check('the wrap tunnel carries the run to col 21', !!wrapped, wrapped ? `pac (${wrapped.x},${wrapped.y})` : 'never')
rep.check('the energizer at (23,26) is eaten', !!won && (sawPower || (eatDelta >= 50 && ateAt && ateAt.y >= 22 && ateAt.x >= 24)),
    `at (${ateAt?.x},${ateAt?.y}) +${eatDelta} power seen=${sawPower}`)
rep.check('the pellet frightens the ghosts', sawScared, `scared=${sawScared}`)

// pixel proof #1 while powered: the drawn wedge matches the logical head
const px1 = await pacPixels()
rep.check('drawn wedge matches logical head (in play)', px1.n >= 60 && px1.off >= 0 && px1.off <= 1.15,
    `yellows=${px1.n} off=${px1.off.toFixed(2)} cells`)

// 4 — powered ride: chase the nearest scared ghost; kills (+200 each) are
// evidence, their absence an honest note — the spec's die/restart legs stay
let kills = 0
{
    let p = await probe()
    let prevS = p ? p.score : 0
    const end = Date.now() + 8000
    while (p && Date.now() < end && !p.done) {
        const t = p.ghosts.filter(g => g.state === 'scared').sort((g, h) =>
            ((g.x - p.pac.x) ** 2 + (g.y - p.pac.y) ** 2) -
            ((h.x - p.pac.x) ** 2 + (h.y - p.pac.y) ** 2))[0]
        if (!t) break // fright over (or death ended it) — the die leg takes over
        if (Math.abs(t.x - p.pac.x) > Math.abs(t.y - p.pac.y)) await steer(t.x < p.pac.x ? 'Left' : 'Right')
        else if (t.y !== p.pac.y) await steer(t.y < p.pac.y ? 'Up' : 'Down')
        await sleep(120)
        const q = await probe()
        if (!q) break
        if (q.score >= prevS + 200) kills++
        prevS = q.score
        p = q
    }
}
rep.info('ghosts eaten while powered', kills ? `${kills} (+${kills * 200})` : 'none this seed (advisory)')
if (sawPower) {
    const exp = await until(p => p.power === 0, 9000)
    rep.check('the fright window expires on the world timer', !!exp && exp.power === 0, `power=${exp?.power}`)
} else {
    rep.skip('world-timer expiry', 'no live power counter this seed (the fright died with Pac-Man)')
}

// 5 — DIE: steer at the nearest active ghost until a life goes (cap 90 s)
const beforeDeath = await probe()
let died = null
{
    const budget = Date.now() + 90000
    while (Date.now() < budget) {
        const p = await probe()
        if (!p || p.done) { died = p; break }
        if (p.deaths > beforeDeath.deaths) { died = p; break }
        const t = p.ghosts
            .filter(g => g.state !== 'pen' && g.state !== 'eaten')
            .sort((g, h) => (g.x - p.pac.x) ** 2 + (g.y - p.pac.y) ** 2 - ((h.x - p.pac.x) ** 2 + (h.y - p.pac.y) ** 2))[0]
        if (t) {
            if (Math.abs(t.x - p.pac.x) > Math.abs(t.y - p.pac.y)) await steer(t.x < p.pac.x ? 'Left' : 'Right')
            else if (t.y !== p.pac.y) await steer(t.y < p.pac.y ? 'Up' : 'Down')
        }
        await sleep(120)
    }
}
rep.check('Pac-Man dies to a ghost', !!died && died.deaths > beforeDeath.deaths,
    `deaths ${beforeDeath.deaths} → ${died?.deaths} (lives ${died?.lives})`)

// respawn: the sim keeps driving with one life fewer
const res = await until(p => p.tick > (died?.tick ?? p.tick) + 30 && !p.done, 4000)
rep.check('respawn keeps the sim driving', !!res && !res.done && res.tick > (died?.tick ?? 0),
    res ? `tick=${res.tick} lives=${res.lives}` : 'no')

// 6 — game over → restart with a real key. The DebugKit cheat ends the run
// deterministically (three natural deaths would triple the drive time); the
// restart leg itself is all real keys.
const over = await page.evaluate(() => {
    if (!window.__dbg) return 'no-dbg'
    window.__dbg.act('Force game over')
    return 'ok'
})
const doneP = await until(p => p.done, 1500)
rep.check("game over shows `done`", over === 'ok' && !!doneP && doneP.done, `act=${over}`)
await release()
await page.keyboard.press('ArrowLeft')
const fresh = await until(p => !p.done && !p.attract && p.score === 0 && p.lives === 3, 4000)
rep.check('a real key restarts the run (score 0, lives 3)', !!fresh && !fresh.done && !fresh.attract &&
    fresh.score === 0 && fresh.lives === 3,
    fresh ? `score=${fresh.score} lives=${fresh.lives} attract=${fresh.attract}` : 'no')
const t1 = await probe()
await sleep(500)
const t2 = await probe()
rep.check('the restarted run drives on', t2.tick > t1.tick, `tick ${t1.tick} → ${t2.tick}`)

// pixel proof #2 after the restart: the wedge is drawn at its logical cell
const px2 = await pacPixels()
rep.check('drawn wedge matches logical head (after restart)', px2.n >= 60 && px2.off >= 0 && px2.off <= 1.15,
    `yellows=${px2.n} off=${px2.off.toFixed(2)} cells`)

await release()
rep.check('zero page errors across the whole ride', errors === 0, `errors=${errors}`)
await rep.exit(browser)
