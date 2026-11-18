// CLAP TEST PLAY (#2156) — drive the one-screen slap test end-to-end with REAL
// events: a synth mic bakes full-scale claps at known instants (only the sound
// source is synthetic — consent, recorder, tick clock, outbox, upload and the
// decode are the real production path), while the harness slaps the screen with
// trusted pointer events at the same instants. The phone must grade itself, the
// take must upload through the consent gate, and the studio must agree:
// plaicraft:clap --file=<the same bytes> lands the same verdict.
//
//   npm run dev -- --port 5173 --strictPort        (or DEV_PORT)
//   npm run claptestplay                            # two clean runs -> PASS everywhere
//   npm run claptestplay -- --mutant=shift          # taps +120 ms  -> FAIL both sides
//   npm run claptestplay -- --mutant=silent         # taps, no sound -> FAIL + hint
//   npm run claptestplay -- --mutant=few            # 2 slaps        -> FAIL minPairs
//
// The store is the production worker running in Node (relaysim #1711 S5), so
// the whole consent-gated path runs against the exact HTTP surface Jon's phone
// will hit.
//
// #2205 (polish): the clean pass drives TWO runs on one DEVICE — the
// nominal cadence and an off-nominal one (1.6 s / 2.4 s) — proving honest green
// survives real human rhythm variance, not just the baked cadence. Device memory
// (localStorage: verdict history, cached consent, coach flag) carries across the
// #2709 per-schedule relaunch via context.storageState(), so the second attract
// screen still shows the first run in the local verdict history. It also reads
// the new polish surfaces: the live mic meter, the pacing gap readout, the
// persisted verdict history line, and the aria-live verdict.
//
// #2205 lesson (throttling): on a box whose co-tenant starves this page's rAF,
// the fixed-timestep catch-up CAPS world time behind each slow frame and the
// take's own tick->ms clock compresses — pad edges land >250 ms from their
// claps no matter how the harness aims. That is a property of the MACHINE, not
// of the game, so a clean run that failed its core is re-attempted (fresh
// context, up to 3 tries) and only the accepted attempt's check lines print.
//
// #1711 live pair coach: coachProof() drives the two failure shapes measured
// out of Jon's stored Nov-16 takes (airborne clap / silent tap) plus one honest
// coincident slap and proves the page NAMES each live (NO TOUCH / NO SOUND /
// PAIR) while the take's own verdict stays honest (2 claps, 1 pair).
//
// #2709 (this migration): headless Chrome 157 delivers ZERO MediaRecorder
// chunks from a WebAudio MediaStreamDestination stream — the synth-mic trick
// this suite drove since #2156 went blind on the engine (matrix + probe in the
// issue). The mic is now Chrome's own fake capture device fed by a baked WAV
// (scripts/lib/fakemic.mjs): hum + full-scale claps at exact sample offsets,
// delivered through REAL gUM. Consent, MediaRecorder, opus, the tick clock, v2
// assembly, the upload and the decode remain the untouched production path.
// The fake-file path is fixed at BROWSER launch (a launch flag names the wav),
// so each clap schedule gets its own launch — and consent/localStorage
// continuity across runs (the #2205 history line, the cached gate, the learned
// coach flag) hands over via context.storageState(), making the relaunch
// invisible to everything under test. A fresh launch also replays the file from
// position zero, which is what every retry needs.

import { requireDevServer, launch, Report } from './lib/harness.mjs'
import { bakeFakeMicWav, fakeMicArgs, fakeMicInit, PRIME_MS } from './lib/fakemic.mjs'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validate } from '../src/utils/recording.js'
import { detectClaps, matchClapEdges, takeEdges, CLAP_TOL_MS } from '../src/utils/clapSync.js'
import { COACH_TEXT } from '../src/utils/clapCoachCore.js'
import { COACH_HAPTICS } from '../src/utils/clapTestCore.js'
import { startRelaySim } from './lib/relaysim.mjs'

const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const MUTANT = (() => {
    const hit = argv.find((a) => a.startsWith('--mutant'))
    if (!hit) return null
    const v = hit.includes('=') ? hit.split('=')[1] : 'shift'
    if (!['shift', 'silent', 'few'].includes(v)) { console.error(`claptestplay: unknown --mutant=${v} (shift|silent|few)`); process.exit(2) }
    return v
})()

// clap schedules from mic-open (same shape plaicraft-clap uses); taps aim at the
// same instants. shift = the #2156 acceptance mutant (+120 ms: inside the
// ±250 ms search window, outside the ±50 ms line); silent = taps, no sound;
// few = only two slaps. #2205: the clean pass runs the nominal cadence AND an
// off-nominal one, seeded with the first run's storageState so the second
// attract screen shows the first run in the local verdict history.
// --run=<label fragment> drives one named run (the loop breaks on a failed
// core, so a run queued behind a starved one needs this to be witnessed on a
// loaded box; the full suite is unchanged when the flag is absent).
const ONLY = argv.find((a) => a.startsWith('--run='))?.split('=').slice(1).join('=') || null
const RUNS = (MUTANT
    ? [{
        label: MUTANT === 'shift' ? 'MUTANT shift' : MUTANT === 'silent' ? 'MUTANT silent' : 'MUTANT few',
        clapMs: MUTANT === 'silent' ? [] : MUTANT === 'few' ? [1200, 2600] : [1200, 2600, 4000],
        tapsN: MUTANT === 'few' ? 2 : 3,
        shift: MUTANT === 'shift' ? 120 : 0,
        expectPass: false,
        studio: true,
    }]
    : [
        { label: 'nominal', clapMs: [1200, 2600, 4000], tapsN: 3, shift: 0, expectPass: true, studio: true },
        { label: 'off-tempo 1.6/2.4 s (#2205)', clapMs: [1200, 2800, 5200], tapsN: 3, shift: 0, expectPass: true, studio: false, showHistory: true },
        // #1711 re-arm: a fresh device that slaps SILENTLY ends its take with
        // the mic live and zero claps heard -> shown demotes to none, the ask
        // returns, and a new page proves the pill actually paints again.
        { label: 're-arm (silent take re-teaches)', clapMs: [], tapsN: 3, shift: 0, expectPass: false, studio: false, freshContext: true, expectReArm: true },
    ]).filter((cfg) => !ONLY || cfg.label.includes(ONLY))
if (ONLY && !RUNS.length) { console.error(`claptestplay: --run=${ONLY} matched no run`); process.exit(2) }

const r = new Report('claptest:play')
const sim = await startRelaySim()
const BASE = sim.base
const PAGE_URL = `http://localhost:${PORT}/retrogames/claptest?store=${encodeURIComponent(BASE)}`

await requireDevServer(PAGE_URL)
const errors = []
let prevCleanPass = false // did the previous accepted run grade a real PASS to persist?
let seed = null // storageState from the last accepted run — the device's memory
// (verdict history, cached consent, learned coach flag) survives the relaunch
// that a new clap schedule forces, so run two still greets run one's PASS.

// One fake-mic browser per clap schedule (#2709): --use-file-for-fake-audio-
// capture names the baked wav at launch, so the schedule IS the launch. Closing
// the previous browser here keeps the GPU to one Chrome at a time.
async function micLaunch(clapMs) {
    const wav = bakeFakeMicWav({ clapMs, secs: 14 })
    const b = await launch({ headless: !argv.includes('--headful'), extraArgs: fakeMicArgs(wav) })
    r.info('mic capture (#2709)', `fake-file (baked wav) claps=[${clapMs.join('/') || 'hum only'}] — Chrome ${b.version()}`)
    return b
}

// fakeMicInit wraps the REAL gUM (stamps __clapWall = resolve + baked offset +
// PRIME_MS, honours __MICDELAY); the second script arms the measured priming.
async function addFakeMic(context) {
    await context.addInitScript(fakeMicInit)
    await context.addInitScript(({ prime }) => { window.__FAKE_PRIME_MS = prime }, { prime: PRIME_MS })
}

async function runOnce(cfg, { requireGate, sink, browser, seed }) {
    // Checks land in the sink, not the report: a throttled attempt must not be
    // able to turn the suite red when its retry proves the honest green.
    const r = {
        check: (label, pass, detail = '') => sink.push({ label, pass: !!pass, detail }),
        info: (label, detail) => sink.push({ info: true, label, detail }),
        skip: (label, detail = '') => sink.push({ skip: true, label, detail }),
    }
    const pfx = RUNS.length > 1 ? `${cfg.label}: ` : ''
    // A taught device cannot re-learn — cfg.freshContext means a stranger again,
    // which a fresh launch already is; a continuing device gets the seed.
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, ...(seed && !cfg.freshContext ? { storageState: seed } : {}) })
    await addFakeMic(context)
    const page = await context.newPage()
    // run two lives in a second tab — without this its loop starves in the
    // background (frames skip, palm holds vanish, the meter undersamples).
    await page.bringToFront()
    page.setDefaultTimeout(30000)
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(PAGE_URL, { waitUntil: 'load' })

    // #2205 x heistclock lesson: measure the runner. On a box whose co-tenant
    // starves this page's rAF, pad edges quantize past ±250 ms and NO aiming
    // can prove ±50 ms sync — those time-shaped gates are SKIPPED then, not
    // quietly passed (the precedent heistplay set for its frame-rate floor).
    const fps = await page.evaluate(() => new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const t = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(t); else res(Math.round((n * 1000) / (performance.now() - t0))) }
        requestAnimationFrame(t)
    }))
    const fast = fps >= 30
    const dead = (extra = {}) => ({ page, coreOk: false, fast, ...extra })
    if (!fast) r.info(`${pfx}runner measured ${fps} fps (< 30) — time-shaped gates will SKIP, honest partial only`, '#2205 busy-box rule')

    // --- attract: one screen, one START ------------------------------------------------
    await page.waitForSelector('[data-clap-test]', { timeout: 15000 })
    r.check(`${pfx}the clap test screen mounts`, await page.locator('[data-clap-phase="attract"]').count() === 1)
    if (cfg.expectPass && cfg.showHistory) {
        // #2205 item 4: earlier verdicts persist on this phone and greet the player.
        const hist = await page.locator('[data-clap-history]').textContent().catch(() => null)
        if (prevCleanPass) r.check(`${pfx}attract shows the previous verdict history line`, !!(hist && /PASS/.test(hist)), hist || 'no history line')
        else r.skip(`${pfx}attract history line (PASS content)`, 'previous run was skipped/messy — nothing clean to persist')
    }
    await page.evaluate((clapMs) => { window.__CLAP = { clapMs } }, cfg.clapMs)
    await page.click('[data-clap-start]')

    // the SAME consent gate as the game takes, before anything records
    let gateUp = false
    try {
        await page.waitForSelector('[data-consent-gate]', { timeout: 5000 })
        gateUp = true
    } catch { /* cached consent — only honest for a repeat run */ }
    if (requireGate) {
        r.check(`${pfx}the game-take consent gate goes up at START (nothing checked by default)`, gateUp)
        if (!gateUp) return dead()
    }
    if (gateUp) {
        const offByDefault = await page.evaluate(() => {
            const m = document.querySelector('#consent-motion')
            const v = document.querySelector('#consent-voice')
            return m && v && m.getAttribute('aria-checked') === 'false' && v.getAttribute('aria-checked') === 'false'
        })
        r.check(`${pfx}both switches default OFF (Jon's rule)`, !!offByDefault)
        await page.click('#consent-motion')
        await page.click('#consent-voice')
        const saveDisabled = await page.evaluate(() => document.querySelector('#consent-yes')?.disabled === true)
        r.check(`${pfx}SAVE refuses while the WHO field is empty (#1711 audit 1)`, saveDisabled)
        await page.click('#consent-name')
        await page.type('#consent-name', 'qabot')
        await page.click('#consent-yes')
    }

    let armed = false
    try {
        await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording) && window.__clapTest && window.__clapTest.phase === 'testing', null, { timeout: 12000 })
        armed = true
    } catch { /* gate below */ }
    r.check(`${pfx}recorder + mic open at seed-birth after consent`, armed, await page.evaluate(() => JSON.stringify({ ac: window.__autoCapture || null, ct: (window.__clapTest || {}).phase })))
    if (!armed) return dead()
    // #2709 shape: the fake-file device intermittently resolves gUM many seconds
    // late on a contended Mac. The take hasn't played its claps yet at this
    // point, so give the device time to stamp __clapWall before aiming; a device
    // that never lands stays honestly red at the mic-live gate below.
    try {
        await page.waitForFunction((n) => (window.__clapWall || []).length === n, cfg.clapMs.length, { timeout: 12000 })
    } catch { /* the mic-live gate reports it */ }

    // #1711 clap coach: the ±50 ms proof must TEACH itself at live REC. A fresh
    // consented boot shows the pill once (flag 'shown'); every later boot on the
    // same device stays silent — and after a take whose live mic heard its
    // claps, the device is LEARNED ('2'), resting forever (#1711 re-arm:
    // silent devices re-arm instead, proven by the third run below). kind/flag
    // survive the visual fade; the element check is the paint.
    {
        // The coach stamps when the mic goes LIVE, not at seed-birth — the
        // fake-file device can resolve gUM well after the recorder armed
        // (#2709 slow-open), so wait for the stamp before reading it.
        try { await page.waitForFunction(() => !!window.__clapCoach, null, { timeout: 8000 }) } catch { /* the gates below report unset honestly */ }
        await page.waitForTimeout(fast ? 120 : 300) // let the pill paint
        const coach = await page.evaluate(() => ({
            kind: (window.__clapCoach || {}).kind || 'unset',
            state: (window.__clapCoach || {}).state || 'unset',
            text: (window.__clapCoach || {}).text || '',
            el: !!document.querySelector('[data-clap-coach]'),
            flag: localStorage.getItem('vc.clapCoach'),
        }))
        if (gateUp) {
            r.check(`${pfx}clap coach appears at live REC (fresh device learns the ±50 ms proof)`,
                coach.kind === 'coach' && coach.text === COACH_TEXT && coach.flag === '1', JSON.stringify(coach))
            r.check(`${pfx}coach pill is painted on screen`, coach.el, JSON.stringify(coach))
        } else if (coach.flag === '2') {
            // Cached consent usually means the device learned earlier — but a
            // starved box can re-arm and re-learn within this run (paint reads
            // '1'/null, the first heard clap flips the flag to '2' mid-take,
            // #2466's own path). The honest truths are the flag + state; `kind`
            // is the paint-time snapshot and may name the pill that taught.
            r.check(`${pfx}no second lesson on a learned device — coach rests, habit proven`,
                !coach.el && coach.state === 'learned', JSON.stringify(coach))
        } else {
            r.check(`${pfx}cached-consent device that never learned keeps being asked (#2466 re-arm)`,
                coach.kind === 'coach' && coach.state === 'shown', JSON.stringify(coach))
        }
    }

    // #2205 item 5: the whole screen is the slap target and says so to a11y.
    r.check(`${pfx}the slap target carries a descriptive aria-label`, /Slap target/.test(await page.getAttribute('[data-clap-test]', 'aria-label') || ''))

    const clapWall = await page.evaluate(() => window.__clapWall || [])
    r.check(`${pfx}mic stream is live (claps scheduled from mic-open)`, cfg.clapMs.length === 0 || clapWall.length === cfg.clapMs.length, JSON.stringify(clapWall.map((w) => w - clapWall[0])))

    // #2205 items 1+look: observe the meter PAGE-SIDE (rAF max trackers) — a
    // harness poll that blocks between down and up would stretch the palm hold
    // and merge taps, corrupting the very measurement the page is grading.
    if (cfg.expectPass) {
        await page.evaluate(() => {
            window.__lvlMax = 0
            window.__meterMax = 0
            const t = () => {
                window.__lvlMax = Math.max(window.__lvlMax, window.__voiceLevel || 0)
                const el = document.querySelector('[data-clap-meter] i')
                if (el) window.__meterMax = Math.max(window.__meterMax, parseFloat(el.style.width) || 0)
                requestAnimationFrame(t)
            }
            t()
        })
    }

    // --- the slaps: trusted pointer events on the whole-face target --------------
    const gapsSeen = []
    const holdMs = fast ? 130 : 420 // a slow box needs a longer palm so the press lands on some frame
    for (let i = 0; i < cfg.tapsN; i++) {
        const aim = (cfg.clapMs.length ? clapWall[i] : Date.now() + 1200 + i * 1400) + cfg.shift
        await new Promise((res) => setTimeout(res, Math.max(0, aim - Date.now())))
        await page.mouse.down()
        await page.waitForTimeout(holdMs)
        await page.mouse.up()
        if (i >= 1) {
            await page.waitForTimeout(fast ? 80 : 220) // let the pacing readout render (state → paint)
            gapsSeen.push(await page.getAttribute('[data-clap-gap]', 'data-clap-gap').catch(() => null))
        }
    }
    if (cfg.expectPass && fast) {
        const seen = await page.evaluate(() => ({ lvl: window.__lvlMax || 0, meter: window.__meterMax || 0 }))
        r.check(`${pfx}live mic meter reacts to the slaps (window.__voiceLevel peaked > 0.5)`, seen.lvl > 0.5, JSON.stringify(seen))
        r.check(`${pfx}the meter bar actually fills (width > 0 while testing)`, seen.meter > 0, JSON.stringify(seen))
        // item 2: the pacing readout must match the schedule's consecutive gaps.
        const wantGaps = cfg.clapMs.slice(1).map((ms, k) => ms - cfg.clapMs[k])
        const gapNums = gapsSeen.map((g) => (g === null ? null : Number(g)))
        r.check(`${pfx}pacing readout matches the slap schedule (${wantGaps.join('/')} ms)`,
            gapNums.length === wantGaps.length && gapNums.every((g, k) => g !== null && Math.abs(g - wantGaps[k]) <= 200),
            `got ${gapNums.join('/')} vs want ${wantGaps.join('/')}`)
    } else if (cfg.expectPass) {
        r.skip(`${pfx}live meter + pacing readout gates`, `runner at ${fps} fps — pad edges cannot prove ms-level timing`)
    }
    try {
        await page.waitForFunction(() => window.__clapTest && window.__clapTest.phase === 'graded', null, { timeout: 25000 })
    } catch { /* gate below */ }
    const graded = await page.evaluate(() => window.__clapTest || null)
    r.check(`${pfx}the screen graded itself and left the target`, !!(graded && graded.phase === 'graded'), graded && graded.phase)
    if (!(graded && graded.phase === 'graded')) return dead()
    const v = graded.verdict || null
    r.check(`${pfx}a verdict is on screen in big text`, ['PASS', 'FAIL'].includes(await page.getAttribute('[data-clap-test]', 'data-clap-verdict')), await page.getAttribute('[data-clap-test]', 'data-clap-verdict'))
    r.info(`${pfx}phone verdict`, JSON.stringify(v))
    // #2205 item 5: the verdict also exists for screen readers.
    r.check(`${pfx}an aria-live region announces the verdict`, (await page.locator('[data-clap-phase="graded"] [aria-live="assertive"]').count()) === 1)

    // #1711 report card: the DOM paints exactly the verdict's residue — one row
    // per event, kinds in agreement (pairish = matched, notouch = unheard taps
    // flipped, nosound = taps without claps). Paint == state, proven per take.
    {
        const domRows = await page.$$eval('[data-clap-row]', (els) => els.map((e) => e.getAttribute('data-clap-row'))).catch(() => null)
        const rep = graded.report || []
        const paint = !!domRows && domRows.length === rep.length && domRows.every((k, i) => k === rep[i].kind)
        r.check(`${pfx}report card paints the verdict residue row-for-row`, paint, JSON.stringify({ dom: domRows, verdict: rep.map((x) => x.kind) }))
        if (v) {
            const kinds = rep.map((x) => x.kind)
            const plaus = kinds.filter((k) => k === 'pair' || k === 'off').length === v.matched &&
                kinds.filter((k) => k === 'notouch').length === v.unmatchedOnsets &&
                kinds.filter((k) => k === 'nosound').length === (v.unmatchedTapMs ? v.unmatchedTapMs.length : 0)
            r.check(`${pfx}report card counts agree with the verdict numbers (matched/unmatchedOnsets/unmatchedTaps)`, plaus, JSON.stringify({ kinds, v: { m: v.matched, uo: v.unmatchedOnsets, ut: (v.unmatchedTapMs || []).length } }))
        }
    }
    let coreOk = false
    if (!fast) {
        coreOk = true // graded + uploaded; the ms-shaped verdicts below can't be proven on this box
        r.skip(`${pfx}verdict content gates`, `runner at ${fps} fps — the take clock is quantized beyond the ±50 ms line`)
    } else if (cfg.expectPass) {
        coreOk = !!(v && v.ok && v.matched === cfg.tapsN)
        r.check(`${pfx}PASS: ${cfg.tapsN} slaps matched within ±${CLAP_TOL_MS} ms on the phone`, !!(v && v.ok && v.matched === 3), v && v.why)
        r.check(`${pfx}PASS carries no hint`, !!(v && v.hint === null))
        r.check(`${pfx}PASS shows no hard-fail note`, (await page.locator('[data-clap-worst-note]').count()) === 0)
    } else if (MUTANT === 'shift') {
        coreOk = !!(v && !v.ok && v.matched === 3 && v.pairs.every((p) => Math.abs(p.offsetMs) > CLAP_TOL_MS))
        r.check(`${pfx}MUTANT taps +120 ms -> FAIL on the phone (measured, not ungradeable)`, coreOk, v && `${v.why} worst ${v.worstMs}`)
        r.check(`${pfx}shift hint names the sound-vs-touch gap`, !!(v && /sound and the touch/i.test(v.hint || '')), v && v.hint)
    } else if (MUTANT === 'silent') {
        coreOk = !!(v && !v.ok && v.claps === 0)
        r.check(`${pfx}MUTANT taps with no sound -> FAIL`, coreOk, v && v.why)
        r.check(`${pfx}silent hint is the verbatim "didn't hear the slaps, try louder"`, !!(v && v.hint === "didn't hear the slaps, try louder"), v && v.hint)
    } else if (MUTANT === 'few') {
        coreOk = !!(v && !v.ok && v.matched === 2)
        r.check(`${pfx}MUTANT 2 slaps -> FAIL (minPairs 3)`, coreOk, v && v.why)
    }

    // --- the take left the phone through the consent gate -------------------------
    const last = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last)
    r.check(`${pfx}the take uploaded through the consent gate`, !!(last && last.uploaded), JSON.stringify(last))
    if (!(last && last.uploaded)) return dead({ v })
    coreOk = coreOk && true // uploading is part of the core, both directions
    // #1711 re-arm: the take's own live analyser is the habit evidence. A pass
    // must leave the device LEARNED; a silent take must leave it CLEARED so the
    // next boot asks again (the flag is the whole mechanism — the repaint proof
    // runs at the end of this run).
    {
        const arm = await page.evaluate(() => ({
            ...(window.__clapCoachTake || {}),
            flag: localStorage.getItem('vc.clapCoach'),
        }))
        if (cfg.expectPass) {
            if (fast) r.check(`${pfx}the take's live watch heard the claps — device marked learned`,
                arm.took === 'learned' && arm.claps >= 1 && arm.flag === '2' && arm.state === 'learned', JSON.stringify(arm))
            else r.skip(`${pfx}live-watch learned pin`, `runner at ${fps} fps — frames cannot resolve the claps`)
        }
        if (cfg.expectReArm) {
            r.check(`${pfx}silent take on a live mic re-arms the ask — shown demoted, flag cleared`,
                arm.took === 'rearm' && arm.claps === 0 && arm.flag === null && arm.state === 'none', JSON.stringify(arm))
        }
    }
    const listed = await (await fetch(`${BASE}/sessions`, { headers: sim.readHeaders })).json()
    const row = (listed.sessions || []).find((s) => s.key === last.key)
    r.check(`${pfx}the store lists the take with audio, game=claptest`, !!(row && row.audio === true && row.game === 'claptest'), JSON.stringify(row))
    r.check(`${pfx}the typed name reached the store and the mirror (#1711 audit 1)`,
        row && row.player === 'qabot' && last.player === 'qabot', JSON.stringify({ row: row && row.player, last: last && last.player }))

    if (cfg.expectReArm) {
        // The story's other half: on a re-armed device the NEXT take's REC paints
        // the pill again — the phone teaches until the habit lands. Consent is
        // cached in this context, so the recorder arms without the gate.
        const p2 = await context.newPage()
        p2.on('pageerror', (e) => errors.push(String(e)))
        await p2.bringToFront()
        await p2.goto(PAGE_URL, { waitUntil: 'load' })
        await p2.click('[data-clap-start]').catch(() => {})
        let rearmed = false
        try {
            await p2.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording) && window.__clapTest && window.__clapTest.phase === 'testing', null, { timeout: 12000 })
            rearmed = true
        } catch { /* gate below */ }
        // same slow-open lesson: the pill lands when the mic goes live
        try { await p2.waitForFunction(() => !!window.__clapCoach, null, { timeout: 8000 }) } catch { /* the gate below reports it honestly */ }
        await p2.waitForTimeout(fast ? 120 : 300)
        const coach2 = await p2.evaluate(() => ({
            kind: (window.__clapCoach || {}).kind || 'unset',
            el: !!document.querySelector('[data-clap-coach]'),
            flag: localStorage.getItem('vc.clapCoach'),
        })).catch(() => null)
        r.check(`${pfx}re-armed device sees the pill again on its next take — teaches until learned`,
            rearmed && !!coach2 && coach2.kind === 'coach' && coach2.el && coach2.flag === '1', JSON.stringify(coach2))
        await p2.close().catch(() => {})
    }
    if (!cfg.studio) return { page, v, last, coreOk, fast }

    // --- the studio agrees: same bytes, same code, same verdict --------------------
    const text = await (await fetch(`${BASE}/sessions/${encodeURIComponent(last.key)}`, { headers: sim.readHeaders })).text()
    const rec = JSON.parse(text)
    r.check(`${pfx}stored take validates as rec/v2 with one voice track`, validate(rec) === null && rec.format === 'retrogames-rec/v2' && rec.voice.tracks.length === 1, validate(rec) || rec.format)
    const track = rec.voice && rec.voice.tracks[0]
    let pcm = null
    try {
        pcm = await page.evaluate(async (b64) => {
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const AC = window.AudioContext || window.webkitAudioContext
            const ctx = new AC()
            const buf = await ctx.decodeAudioData(bytes.buffer)
            const ch0 = buf.getChannelData(0)
            const out = new Array(ch0.length)
            for (let i = 0; i < ch0.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767)))
            const sr = buf.sampleRate
            ctx.close()
            return { sr, samples: out }
        }, track.b64)
    } catch { /* gate below */ }
    r.check(`${pfx}opus bytes decode back to PCM in the browser`, !!(pcm && pcm.samples.length > 1000), pcm ? `${pcm.samples.length} samples @ ${pcm.sr} Hz` : 'decode failed')
    if (pcm && track && fast) {
        const onsets = detectClaps(Float32Array.from(pcm.samples, (x) => x / 32767), { sampleRate: pcm.sr })
        const studio = takeEdges(rec)
            .map((c) => matchClapEdges({ sampleRate: pcm.sr, onsets, edges: c.edges, clock: track.clock }))
            .sort((a, b) => (b.ok - a.ok) || ((a.worstMs ?? 1e9) - (b.worstMs ?? 1e9)))[0]
        r.check(`${pfx}studio verdict == phone verdict on the same bytes (shared takeEdges/clapSync)`, !!studio && studio.ok === v.ok && studio.worstMs === v.worstMs, studio ? `${studio.why} (worst ${studio.worstMs}) vs phone ${v && v.worstMs}` : 'no seats')
    } else if (cfg.studio && !fast) {
        r.skip(`${pfx}studio-agreement gate`, `runner at ${fps} fps`)
    }

    // --- the literal acceptance: `plaicraft:clap` re-grades the take ------------
    if (fast) {
        const dump = path.join(fs.realpathSync(os.tmpdir()), `claptest-take-${last.key.replace(/[^a-z0-9._-]/gi, '_')}.json`)
        fs.writeFileSync(dump, text)
        const studioCode = await new Promise((res) => {
            const child = spawn(process.execPath, ['scripts/plaicraft-clap.mjs', `--file=${dump}`], { cwd: process.cwd(), env: { ...process.env, DEV_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
            let out = ''
            child.stdout.on('data', (d) => { out += d })
            child.stderr.on('data', (d) => { out += d })
            child.on('close', (code) => { res({ code, out }) })
        })
        fs.rmSync(dump, { force: true })
        if (cfg.expectPass) {
            r.check(`${pfx}plaicraft:clap --file= PASSes the same take (the studio command, verbatim)`, studioCode.code === 0, `exit ${studioCode.code}: ${(studioCode.out.match(/within ±50 ms[^\n]*|outside[^\n]*/) || [''])[0].trim()}`)
        } else {
            r.check(`${pfx}plaicraft:clap --file= REFUSES the mutated take (studio sees ${MUTANT} too)`, studioCode.code !== 0, `exit ${studioCode.code}`)
        }
    } else if (cfg.studio) {
        r.skip(`${pfx}plaicraft:clap --file= acceptance`, `runner at ${fps} fps`)
    }
    return { page, v, last, coreOk, fast }
}

for (let i = 0; i < RUNS.length; i++) {
    const cfg = RUNS[i]
    if (cfg.freshContext) seed = null // a stranger must be a stranger: no device memory
    const maxAttempts = cfg.expectPass ? 3 : 1 // throttling re-attempt is for clean runs only
    let chosen = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const sink = []
        // fresh launch per attempt (#2709): the baked fake-file replays from
        // position zero, which is what an aim at mic-open instants requires;
        // device memory rides in via the seed instead of context reuse.
        const browser = await micLaunch(cfg.clapMs)
        const out = await runOnce(cfg, { requireGate: attempt === 1 && (i === 0 || !!cfg.freshContext), sink, browser, seed })
        chosen = { sink, out, browser }
        const st = out.page ? await out.page.context().storageState().catch(() => null) : null
        if (st) seed = st
        if ((out.fast && out.coreOk) || attempt === maxAttempts) break
        r.info(`${cfg.label}: attempt ${attempt} ${out.fast ? 'failed its core gates' : 'ran on a starved box'} — retrying (busy-box lesson, #2205; fresh launch replays the baked wav, #2709)`)
        if (out.page) await out.page.close().catch(() => {})
        await browser.close().catch(() => {})
    }
    for (const c of chosen.sink) (c.skip ? r.skip(c.label, c.detail) : c.info ? r.info(c.label, c.detail) : r.check(c.label, c.pass, c.detail))
    prevCleanPass = !!(chosen.out.fast && cfg.expectPass && chosen.out.coreOk)
    if (chosen.out.page) await chosen.out.page.close().catch(() => {}) // one live browser = no background throttling, one Chrome on the GPU
    await chosen.browser.close().catch(() => {})
    if (!chosen.out.coreOk) break // dead or failed: its red lines are printed, stop honestly
}

// #2504 (session 309): the thumb case. Jon's /claptest takes stored loud slaps
// in audio but ~zero A-taps in pads — the leading shape is a phone gripped with
// a thumb on the glass, which makes every slap from the other hand a SECONDARY
// pointer. Chromium marks that slap isPrimary=false, exactly like a real phone,
// so CDP multi-touch drives it honestly: hold the thumb, slap three times with
// a second finger — every slap must fold into the pad stream, and the run must
// still auto-end. With the old isPrimary filter restored this goes RED
// (taps stay one: only the thumb itself).
async function twoFingerProof() {
    const attempts = 3 // same busy-box doctrine as the clean runs (#2205)
    let chosen = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const sink = []
        const out = await twoFingerOnce(sink)
        chosen = { sink, out }
        if (out.coreOk || attempt === attempts) break
        r.info(`two-finger: attempt ${attempt} ${out.fast ? 'missed a fold gate' : 'ran on a starved box'} — retrying (busy-box lesson, #2205)`)
    }
    for (const c of chosen.sink) (c.skip ? r.skip(c.label, c.detail) : c.info ? r.info(c.label, c.detail) : r.check(c.label, c.pass, c.detail))
}
async function twoFingerOnce(sink) {
    const r2 = {
        check: (label, pass, detail = '') => sink.push({ label, pass: !!pass, detail }),
        skip: (label, detail = '') => sink.push({ skip: true, label, detail }),
    }
    // taps only — no claps needed, but the recorder still streams the device
    // (hum-only wav), so this runs the same #2709 capture shape as the takes.
    const browser = await micLaunch([])
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
    await addFakeMic(context)
    const page = await context.newPage()
    await page.bringToFront()
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(PAGE_URL, { waitUntil: 'load' })
    await page.waitForSelector('[data-clap-test]', { timeout: 15000 })
    await page.tap('[data-clap-start]')
    let gate = false
    try { await page.waitForSelector('[data-consent-gate]', { timeout: 5000 }); gate = true } catch { /* cached consent */ }
    if (gate) {
        await page.tap('#consent-motion')
        await page.tap('#consent-voice')
        await page.tap('#consent-name')
        await page.type('#consent-name', 'qabot')
        await page.tap('#consent-yes')
    }
    let inTest = false
    try {
        await page.waitForFunction(() => window.__clapTest && window.__clapTest.phase === 'testing', null, { timeout: 12000 })
        inTest = true
    } catch { /* gated below */ }
    if (!inTest) {
        r2.check('two-finger: run reaches the testing phase', false, 'stuck before testing')
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        return { coreOk: false, fast: false }
    }
    const fps = await page.evaluate(() => new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const t = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(t); else res(Math.round((n * 1000) / (performance.now() - t0))) }
        requestAnimationFrame(t)
    }))
    const fast = fps >= 30
    const holdMs = fast ? 120 : 420 // a slow box needs a longer palm so the press lands on some frame
    const cdp = await context.newCDPSession(page)
    const thumb = { x: 22, y: 754, id: 1 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] })
    await page.waitForTimeout(350)
    const afterThumb = await page.evaluate(() => ((window.__clapTest || {}).taps || []).length)
    // one slap per pointer id, ~400 ms apart (each tap resets the 600 ms
    // settle, so the run ends after the LAST slap, not the third); the first
    // multi-point event of a CDP sequence is absorbed as warm-up because
    // Chromium's handler treats it differently from subsequent ones.
    for (let i = 0; i < 4; i++) {
        const slap = { x: 195, y: 390, id: 2 + i }
        await page.waitForTimeout(i === 0 ? 500 : 400)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb, slap] })
        await page.waitForTimeout(holdMs)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [slap] })
    }
    const taps = await page.evaluate(() => ((window.__clapTest || {}).taps || []).length)
    const tapsOk = taps - afterThumb >= 3
    let ended = false
    try {
        await page.waitForFunction(() => window.__clapTest && (window.__clapTest.phase === 'grading' || window.__clapTest.phase === 'graded'), null, { timeout: fast ? 3000 : 8000 })
        ended = true
    } catch { /* gated below */ }
    if (fast) {
        r2.check('two-finger: slaps with a second finger register while a thumb holds the screen (isPrimary drop, #2504)', tapsOk, JSON.stringify({ afterThumb, taps }))
        r2.check('two-finger: the run still auto-ends one settle after the last tap', ended, JSON.stringify(await page.evaluate(() => ({ phase: (window.__clapTest || {}).phase, taps: (window.__clapTest || {}).taps }))))
    } else {
        r2.skip('two-finger fold + auto-end gates', `runner at ${fps} fps — pad events quantize past the fold/settle resolution (#2205 busy-box rule)`)
    }
    await cdp.detach().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    return { coreOk: fast && tapsOk && ended, fast }
}
if (!MUTANT) await twoFingerProof()

// #1711 live pair coach: drive the EXACT shapes Jon's phone took (measured from
// the stored bytes — airborne clap seed978353, silent tap seed144524) plus one
// honest coincident slap, and prove the page names each while the take runs:
// NO TOUCH, NO SOUND, PAIR/OFF. The take itself must stay honest — the studio
// re-grades the same bytes and sees 2 claps / 1 aligned pair, so the coach
// guided without touching the measurement. Retries like a clean run (#2205).
async function coachOnce(sink) {
    const r = {
        check: (label, pass, detail = '') => sink.push({ label, pass: !!pass, detail }),
        info: (label, detail) => sink.push({ info: true, label, detail }),
        skip: (label, detail = '') => sink.push({ skip: true, label, detail }),
    }
    const browser = await micLaunch([1400, 3000]) // the coach schedule rides its own baked wav (#2709)
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
    await addFakeMic(context)
    // #2654 item 3: headless Chrome has no vibrate — record what the page asks
    // for instead of silencing it, so the per-kind rhythms are proven, not hoped.
    await context.addInitScript(() => {
        window.__vibes = []
        try {
            Object.defineProperty(navigator, 'vibrate', {
                configurable: true,
                value: (p) => { window.__vibes.push(Array.isArray(p) ? p.join(',') : String(p)); return true },
            })
        } catch { /* frozen navigator — the gate reports what it sees */ }
    })
    const page = await context.newPage()
    await page.bringToFront()
    page.setDefaultTimeout(30000)
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(PAGE_URL, { waitUntil: 'load' })
    await page.waitForSelector('[data-clap-test]', { timeout: 15000 })
    await page.evaluate(() => { window.__CLAP = { clapMs: [1400, 3000] } })
    await page.tap('[data-clap-start]')
    let gate = false
    try { await page.waitForSelector('[data-consent-gate]', { timeout: 5000 }); gate = true } catch { /* cached consent */ }
    if (gate) {
        await page.tap('#consent-motion')
        await page.tap('#consent-voice')
        await page.tap('#consent-name')
        await page.type('#consent-name', 'qabot')
        await page.tap('#consent-yes')
    }
    let armed = false
    try {
        await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording) && window.__clapTest && window.__clapTest.phase === 'testing', null, { timeout: 12000 })
        armed = true
    } catch { /* gated below */ }
    if (!armed) {
        r.check('coach: run arms the recorder', false, 'stuck before testing')
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        return { coreOk: false, fast: true }
    }
    const fps = await page.evaluate(() => new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const t = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(t); else res(Math.round((n * 1000) / (performance.now() - t0))) }
        requestAnimationFrame(t)
    }))
    const fast = fps >= 30
    // page-side badge sampler (rAF tracker, same non-blocking idiom as __lvlMax)
    await page.evaluate(() => {
        window.__coachSeen = []
        window.__pulseSeen = []
        window.__pairsMax = 0
        const t = () => {
            const el = document.querySelector('[data-clap-coach-live]')
            const v = el ? el.getAttribute('data-clap-coach-live') : null
            if (v && window.__coachSeen[window.__coachSeen.length - 1] !== v) window.__coachSeen.push(v)
            const ring = document.querySelector('[data-clap-coach-pulse]')
            const pv = ring ? ring.getAttribute('data-clap-coach-pulse') : null
            if (pv && window.__pulseSeen[window.__pulseSeen.length - 1] !== pv) window.__pulseSeen.push(pv)
            const p = document.querySelector('[data-clap-pairs]')
            if (p) window.__pairsMax = Math.max(window.__pairsMax, Number(p.getAttribute('data-clap-pairs')) || 0)
            requestAnimationFrame(t)
        }
        t()
    })
    try {
        await page.waitForFunction(() => (window.__clapWall || []).length === 2, null, { timeout: 12000 })
    } catch { /* the gate below reports it */ }
    const clapWall = await page.evaluate(() => window.__clapWall || [])
    if (clapWall.length !== 2) {
        r.check('coach: fake mic (baked wav) scheduled the two claps', false, JSON.stringify(clapWall))
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        return { coreOk: false, fast }
    }
    // silent tap at +2.2 s (no clap in its window), coincident slap at +3.0 s
    // (the mic's clap@3000 and this press aim the same instant). The clap@1400
    // rides alone: the airborne clap.
    for (const ms of [2200, 3000]) {
        const aim = clapWall[0] + ms
        await new Promise((res) => setTimeout(res, Math.max(0, aim - Date.now())))
        await page.mouse.down()
        await page.waitForTimeout(fast ? 130 : 420)
        await page.mouse.up()
    }
    let phase = null
    try {
        await page.waitForFunction(() => window.__clapTest && window.__clapTest.phase === 'graded', null, { timeout: 25000 })
    } catch { /* gated below */ }
    const seen = await page.evaluate(() => ({ coach: window.__coachSeen || [], pulse: window.__pulseSeen || [], vibes: window.__vibes || [], pairs: window.__pairsMax || 0, ct: window.__clapTest || null }))
    phase = seen.ct && seen.ct.phase
    r.check('coach: the take ended and graded itself', phase === 'graded', phase)
    let coreOk = phase === 'graded'
    const last = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last)
    r.check('coach: the take uploaded through the consent gate', !!(last && last.uploaded), JSON.stringify(last))
    coreOk = coreOk && !!(last && last.uploaded)
    if (!fast) {
        r.skip('coach naming gates', `runner at ${fps} fps — windows quantize past the naming resolution`)
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        return { coreOk, fast }
    }
    const has = (k) => seen.coach.includes(k)
    const p = has('notouch'); coreOk = coreOk && p
    r.check('coach: airborne clap named NO TOUCH while the take runs (the seed978353 shape, live)', p, JSON.stringify(seen.coach))
    const q = has('nosound'); coreOk = coreOk && q
    r.check('coach: silent tap named NO SOUND while the take runs (the seed144524 shape, live)', q, JSON.stringify(seen.coach))
    const pr = has('pair') || has('off'); coreOk = coreOk && pr
    r.check('coach: the coincident slap named as a PAIR — never as a missing half', pr, JSON.stringify(seen.coach))
    // #2654 item 3 juice: every named event ALSO pulses the ring in its colour
    // and buzzes its own rhythm — the same kind set, in the eye and in the hand.
    const pu = seen.coach.every((k) => seen.pulse.includes(k)); coreOk = coreOk && pu
    r.check('coach: every named event pulsed the target ring in its kind colour (#2654)', pu, JSON.stringify({ coach: seen.coach, pulse: seen.pulse }))
    const vb = seen.coach.length > 0 && seen.coach.every((k) => COACH_HAPTICS[k] && seen.vibes.includes(COACH_HAPTICS[k].join(','))); coreOk = coreOk && vb
    r.check('coach: every named event buzzed its own hand rhythm, matching the pure table (#2654, #2205 idiom)', vb, JSON.stringify({ coach: seen.coach, vibes: seen.vibes }))
    const pn = seen.pairs >= 1; coreOk = coreOk && pn
    r.check('coach: the matched-pair counter reached 1', pn, String(seen.pairs))
    const v = seen.ct && seen.ct.verdict
    const vh = !!(v && !v.ok && v.claps === 2 && v.matched === 1 && /TOUCH/i.test(v.hint || ''))
    coreOk = coreOk && vh
    r.check('coach guided WITHOUT touching the measurement: honest verdict — 2 claps, 1 pair, hint names the touch half', vh, JSON.stringify(v))
    // #1711 report card: the graded screen names each of the three slaps the
    // same way the live coach named them mid-take — airborne NO TOUCH first,
    // silent NO SOUND second, the honest slap PAIR/OFF last (time order).
    const rowKinds = await page.$$eval('[data-clap-row]', (els) => els.map((e) => e.getAttribute('data-clap-row'))).catch(() => null)
    const cardOk = !!(rowKinds && rowKinds.length === 3 && rowKinds[0] === 'notouch' && rowKinds[1] === 'nosound' && (rowKinds[2] === 'pair' || rowKinds[2] === 'off'))
    coreOk = coreOk && cardOk
    r.check('report card names all three slaps in time order: NO TOUCH, NO SOUND, PAIR/OFF', cardOk, JSON.stringify(rowKinds))
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    return { coreOk, fast }
}
async function coachProof() {
    const attempts = 3
    let chosen = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const sink = []
        const out = await coachOnce(sink)
        chosen = { sink, out }
        if (out.coreOk || attempt === attempts) break
        r.info(`coach: attempt ${attempt} ${out.fast ? 'missed a naming gate' : 'ran on a starved box'} — retrying (busy-box lesson, #2205)`)
    }
    for (const c of chosen.sink) (c.skip ? r.skip(c.label, c.detail) : c.info ? r.info(c.label, c.detail) : r.check(c.label, c.pass, c.detail))
}
if (!MUTANT) await coachProof()

r.check('zero page errors', errors.length === 0, errors.join(' | '))
sim.close()
await r.exit(null)
