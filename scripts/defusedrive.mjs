// defusedrive.mjs — real-key browser drive for BOMB DEFUSE (#1800).
// Boots the page, starts it with genuine key events, verifies the drawn
// canvas is real pixels, drives the sim to a win through the DEV hook, and
// restarts from the over screen. Kept SHORT: full Chrome can't boot on the
// launchd-kicked box (#1622) and long live captures kill headless-shell.
//
// npm run defusedrive   (needs `npm run dev` on $DEV_PORT, default 5173)
import { launchChrome } from './lib/chromeboot.mjs'
import { Report } from './lib/harness.mjs'
import { createGame, VENT, CUT } from '../src/games/BombDefuse/engine.js'

const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/bomb-defuse`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const r = new Report('defusedrive')
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|ERR_NAME_NOT_RESOLVED/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__bdTest', null, { timeout: 30000 })
r.check('boots: __bdTest present', errs.length === 0, errs.join(' | '))
r.check('attract shows', (await page.evaluate(() => window.__bdTest.screen())) === 'attract')

await page.keyboard.press('Space')
await sleep(300)
r.check('Space opens the crew-size select', (await page.evaluate(() => window.__bdTest.screen())) === 'select')
await page.screenshot({ path: '/tmp/forge/bd-select.png' })
await page.keyboard.press('Space')
// consent gate: on a virgin origin askConsent goes up before seed-birth —
// Escape declines ("play on"); either answer lands the run.
await sleep(600)
if (await page.evaluate(() => !!document.querySelector('[data-auto-record-gate]'))) await page.keyboard.press('Escape')
await sleep(900)
r.check('Space starts a run (play, integer seed)', await page.evaluate(() => {
    const s = window.__bdTest.state()
    return window.__bdTest.screen() === 'play' && !!s && Number.isInteger(s.seed)
}))

// real-key SYNC clear: the solo partner leads the key turn at stepT>=20;
// join with genuine Space presses until the step advances.
let syncCleared = false
for (let i = 0; i < 40 && !syncCleared; i++) {
    await page.keyboard.press('Space')
    await sleep(220)
    syncCleared = await page.evaluate(() => {
        const s = window.__bdTest.state()
        return !!s && (s.step > 0 || s.bomb > 0)
    })
}
r.check('Space joins the partner key turn -> step clears', syncCleared)
await page.screenshot({ path: '/tmp/forge/bd-play.png' })

const px = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++
    return lit
})
r.check('canvas draws real content (not black)', px > 4000, `${px} lit samples`)

// #1812 item 10 — the powered-device bed in the REAL clock: pings accrue while
// armed (the partner leads at stepT>=20, so the run joins in ~1 s), pause
// freezes them, resume wakes them. This ride also live-proves pause itself:
// the overlay prop bug (gameEntry vs game) crashed the whole app on Escape
// at main (pageerror reading 'label', __bdTest gone with the tree).
const bedPlay = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
r.check('bed hums while armed (pings accrue during live play)', bedPlay >= 2, `pings=${bedPlay}`)
await page.keyboard.press('Escape')
await sleep(250)
r.check('pause does not crash the app (tree + probes alive, screen still play)',
    await page.evaluate(() => !!window.__bdTest && window.__bdTest.screen() === 'play'))
const pPauseA = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
await sleep(900)
const pPauseB = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
r.check('pause silences the bed (pings frozen while paused)', pPauseB === pPauseA && pPauseA >= 0, `pA=${pPauseA} pB=${pPauseB}`)
await page.keyboard.press('Escape')
await sleep(250)
const pWakeA = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
await sleep(700)
const pWakeB = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
r.check('resume wakes the bed (pings accrue again)', pWakeB > pWakeA, `pA=${pWakeA} pB=${pWakeB}`)

const win = await page.evaluate(() => {
    const s = window.__bdTest.solve(9000)
    return s && s.done && s.won
})
r.check('solver-driven run reaches WON', !!win)
await sleep(150)
r.check('over screen shows', (await page.evaluate(() => window.__bdTest.screen())) === 'over')
const pOverA = await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)
await page.screenshot({ path: '/tmp/forge/bd-win.png' })
await sleep(750)
r.check('the over screen silences the bed (pings frozen)', (await page.evaluate(() => window.__bdTest?.bedPings() ?? -1)) === pOverA && pOverA >= 0, `p=${pOverA}`)
await page.keyboard.press('KeyX')
await sleep(1200)
r.check('any key restarts (play again)', (await page.evaluate(() => window.__bdTest.screen())) === 'play')

// #1812 item 2 — the press-tick law in the REAL view stack, stepped tick-exact
// (wall-clock rAF sampling is too coarse on software-rendered Chrome — the
// first observed frame can land after the spring; sim ticks are the law here).
// #1932 session re-anchor: consent resolving instantly (and faster machines)
// let the partner lead on an RAF tick BEFORE the probe's first read, so
// reading pose beside the first observed truth measured puppeteer round-trip,
// not the law (three partial values on this box, red also on clean main).
// Deterministic instead: park at a clean baseline (no turned key, spring home,
// step 0 — a lone lead strikes itself out and the partner re-leads every 24),
// then capture the whole spring tick-by-tick INSIDE one sync evaluate and
// test the sequence against the STAGGER law: held 4 ticks at the rising edge,
// a mid-swing frame, home under the still-held truth.
const probe = await page.evaluate(() => {
    const T = window.__bdTest
    let parked = false
    for (let t = 0; t < 400 && !parked; t++) {
        T.step(1)
        parked = !T.keyOn()[1] && T.keyPoses()[1] < 0.06 && T.state() && T.state().step === 0 && T.state().bomb === 0
    }
    if (!parked) return null
    const seq = []
    for (let t = 0; t < 300; t++) {
        T.step(1)
        seq.push({ k: T.keyOn()[1], p: T.keyPoses()[1] })
    }
    const i = seq.findIndex((s, j) => s.k && j > 0 && !seq[j - 1].k) // rising edge
    if (i < 0 || i + 26 > seq.length) return null
    return {
        hold: seq.slice(i, i + 4).every((s) => s.p < 0.06), // STAGGER+lag: 4 ticks frozen at the edge (pose rides home, not exactly zero)
        mid: seq[i + 4].p,                                    // first moving frame
        home: seq[i + 25].p,
        truth: seq[i + 25].k,
    }
})
r.check('press tick: seat-1 barrel holds four sim ticks at the truth edge (STAGGER law)',
    probe !== null && probe.hold, probe ? `hold=${probe.hold}` : 'partner never led / never parked')
r.check('mid-swing frame exists then the barrel homes (|pose−1|<=0.06) under the held truth',
    probe !== null && probe.mid > 0.05 && probe.mid < 0.6 && Math.abs(probe.home - 1) <= 0.06 && probe.truth === true,
    probe ? `mid=${probe.mid.toFixed(3)} home=${probe.home.toFixed(3)} truth=${probe.truth}` : 'no span')

// #1812 item 4 — window pre-flash LIVE. hud.pf is cooked by the RAF loop, so
// the probe waits between reads (the #1932 round-trip lesson: sync stepping
// would measure stale frames). Fresh run → the untouched SYNC window answers;
// the partner lead (the first turned key) retires it — the hand-off moment the
// SYNC WINDOW bar takes over.
const pfLive = await page.evaluate(async () => {
    const settle = (ms) => new Promise((res) => setTimeout(res, ms))
    const T = window.__bdTest
    T.start(1207, 1)
    let seen = null
    for (let t = 0; t < 12 && !seen; t++) {
        await settle(100)
        const pf = T.preFlash()
        if (pf && pf.kind === 0) seen = pf
    }
    if (!seen) return null
    let retired = false
    for (let t = 0; t < 30 && !retired; t++) { await settle(100); retired = T.preFlash() === null }
    return { introAtLoad: seen.intro, retired, keyTurned: T.keyOn().some(Boolean) }
})
r.check('#1812 item 4 pre-flash live: untouched SYNC flashes, the first turned key retires it',
    !!pfLive && pfLive.retired && pfLive.keyTurned, JSON.stringify(pfLive))

// #1932 — first-VENT coaching LIVE. The seeded holder law is `(b*7+k)%2`, so
// bomb 0 step 1 always seats holder 1 (worker pattern) and step 2 always
// holder 0 (holder pattern) — the seed picks which kind lands where. One run
// where YOUR seat holds the first vent's bar (amber ring until the real-key
// pin silences it, pixels prove the ring draws), one where the CPU holds and
// YOU seat (the gauge nudge fires exactly on the sim's zone, and your tap
// seals the lesson — after the seal the plate stays quiet).
const ventSeed = (want) => {
    for (let s = 1; s < 19999; s++) {
        const st = createGame(s, 1).bombs[0].steps
        // 'H': step2 VENT (holder 0) behind a step1 CUT to walk through
        // 'W': step1 VENT (holder 1, CPU pins)
        if (want === 'H' && st[1].kind === CUT && st[2].kind === VENT) return s
        if (want === 'W' && st[1].kind === VENT) return s
    }
    return null
}
const seedH = ventSeed('H')
const seedW = ventSeed('W')
r.check('coach seeds found (holder-vent behind a CUT, and worker-vent)', seedH !== null && seedW !== null, `H=${seedH} W=${seedW}`)

const coachProbe = await page.evaluate(async ({ seedH, seedW }) => {
    const T = window.__bdTest
    const settle = (ms) => new Promise((rs) => setTimeout(rs, ms))
    const ringBand = () => {
        const cv = document.querySelector('canvas')
        const g = cv.getContext('2d')
        let n = 0
        // columns OUTSIDE the holder bar's own amber border (x=118/138):
        // only the coach ring (stroke at x=112/144 + glow) lights these.
        for (const [x0, x1] of [[104, 116], [140, 152]]) {
            const d = g.getImageData(x0, 178, x1 - x0, 94).data
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 110 && d[i] - d[i + 2] > 70) n++
        }
        return n
    }
    const out = { ringMax: 0, ringAfter: 0 }
    // solo seats need the HUMAN hand — join SYNC key turns and walk/snip the
    // CUT with real edges until the step machine hands us the vent (KIND ids:
    // SYNC 0 / CUT 1 / VENT 2 — the same integers probeStep reports).
    const joinSmart = async () => {
        const t = Date.now()
        while (Date.now() - t < 12000) {
            const ps = T.probeStep()
            if (!ps) return false
            if (ps.kind === 2) return true
            if (ps.kind === 0) {
                // join the partner's lead, never pre-turn our own key (a lone
                // key self-strikes on the window — blind spam was a strike farm)
                if (ps.keys[1] && !ps.keys[0]) { T.press('Space'); await settle(20); T.release('Space'); await settle(40) }
                else await settle(16)
            } else if (ps.sel[0] !== ps.color) { T.press('ArrowUp'); await settle(20); T.release('ArrowUp'); await settle(80) }
            else { T.press('Space'); await settle(20); T.release('Space'); await settle(80) }
        }
        return false
    }
    // — holder run: you ring, you pin, partner seals —
    T.start(seedH, 1)
    await settle(250)
    const reachedH = await joinSmart()
    const hLog = []
    let pinned = false
    const t0 = Date.now()
    while (Date.now() - t0 < 14000) {
        const c = T.coach()
        hLog.push({ c, ta: T.ventTaught() })
        if (c && c.pulseBar && !c.intro && !pinned) {
            // live & unpinned: let the ring pulse a few frames, prove it on
            // pixels, THEN obey it — a player reads the card during READ-STEP
            // first, and the ring only draws on live ticks.
            out.ringMax = Math.max(out.ringMax, ringBand())
            await settle(140)
            out.ringMax = Math.max(out.ringMax, ringBand())
            await settle(140)
            out.ringMax = Math.max(out.ringMax, ringBand())
            T.press('KeyB'); pinned = true
            await settle(140)
            out.ringAfter = ringBand()
        }
        if (pinned && T.ventTaught()) break
        if (T.state() && T.state().done) break
        await settle(16)
    }
    if (pinned) T.release('KeyB')
    out.reachedH = reachedH
    const hc = hLog.map((x) => x.c).filter(Boolean)
    const firstHeld = hc.findIndex((x) => x.held)
    let quietAfterTaught = T.ventTaught()
    for (let i = 0; i < 6 && quietAfterTaught; i++) { quietAfterTaught = quietAfterTaught && T.coach() === null; await settle(16) }
    out.holder = {
        n: hc.length,
        allHold: hc.length > 0 && hc.every((x) => x.role === 'HOLD' && x.card.includes('YOU HOLD')),
        introSeen: hc.some((x) => x.intro),
        pulseBefore: hc.some((x) => x.pulseBar === true),
        pinSeen: firstHeld >= 0,
        silentAfterPin: firstHeld >= 0 && hc.slice(firstHeld).every((x) => x.pulseBar === false),
        taught: T.ventTaught(),
        quietAfterTaught,
    }
    // — worker run: CPU pins, the nudge fires in-zone, your tap seals —
    T.start(seedW, 1)
    await settle(250)
    const reachedW = await joinSmart()
    const wLog = []
    const t1 = Date.now()
    let tapped = false
    while (Date.now() - t1 < 14000) {
        const c = T.coach()
        wLog.push({ c, ta: T.ventTaught() })
        if (c && c.inZone && !T.ventTaught()) {
            tapped = true
            T.press('Space'); await settle(20); T.release('Space'); await settle(20)
        } else if (!T.ventTaught()) await settle(16)
        if (T.ventTaught()) break
        if (T.state() && T.state().done) break
    }
    out.reachedW = reachedW
    const wc = wLog.map((x) => x.c).filter(Boolean)
    out.worker = {
        n: wc.length, tapped,
        allSeat: wc.length > 0 && wc.every((x) => x.role === 'SEAT' && x.card.includes('YOU SEAT')),
        cpuHeld: wc.some((x) => x.held === true),
        tapPulse: wc.some((x) => x.pulseGauge === true),
        outPulse: wc.some((x) => x.pulseGauge === false),
        taught: T.ventTaught(),
    }
    return out
}, { seedH, seedW })

r.check('#1932 holder lesson live: coach says YOU HOLD the whole window, card shows through READ-STEP',
    !!coachProbe.holder && coachProbe.reachedH && coachProbe.holder.n > 0 && coachProbe.holder.allHold && coachProbe.holder.introSeen,
    JSON.stringify(coachProbe.holder))
r.check('#1932 the bar rings before the pin and goes silent under it (state + pixels)',
    coachProbe.holder.pulseBefore && coachProbe.holder.pinSeen && coachProbe.holder.silentAfterPin
    && coachProbe.ringMax >= 60 && coachProbe.ringAfter <= 10,
    `ringMax=${coachProbe.ringMax} ringAfter=${coachProbe.ringAfter}`)
r.check('#1932 sealing latches the lesson — the plate stays quiet after',
    coachProbe.holder.taught && coachProbe.holder.quietAfterTaught, JSON.stringify(coachProbe.holder))
r.check('#1932 worker lesson live: YOU SEAT + CPU pin visible + tap nudge fires exactly in/out of zone',
    !!coachProbe.worker && coachProbe.reachedW && coachProbe.worker.allSeat && coachProbe.worker.cpuHeld
    && coachProbe.worker.tapPulse && coachProbe.worker.outPulse && coachProbe.worker.tapped && coachProbe.worker.taught,
    JSON.stringify(coachProbe.worker))
await page.screenshot({ path: '/tmp/forge/bd-coach.png' })

r.check('zero page errors across the drive', errs.length === 0, errs.join(' | '))

await r.exit(browser)
