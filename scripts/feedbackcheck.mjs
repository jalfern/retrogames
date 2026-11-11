// FEEDBACKCHECK (#737) — the in-game feedback button's proof, in plain Node.
//
// #737's law makes this check load-bearing: the GitHub token must stay server-side,
// and QA must be able to replay the last 30 s of input exactly. Those two claims
// are the token-free crux of the feature — payload validation, the quarantine
// label, the issue builder, the input ring and the submit path — so they are all
// provable without a browser, a deploy, or Jon's secret. The ring expands key
// events onto the sim's 60 Hz grid (one pad per tick), and this file replays a
// full 30 s window through the gauntlet sim to prove the filed stream determines
// the trajectory: schedule and expansion must land on the same state.hash.
//
//   node scripts/feedbackcheck.mjs        # green when the contract holds
//   node scripts/feedbackcheck.mjs --mutate   # RED by design (drop the size cap)

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedFromQuery, seedRng } from '../src/utils/gameContract.js'
import {
    validateFeedback, feedbackLabels, buildFeedbackIssue, FB_MAX_PADS,
    corsOrigin, corsHeaders, CORS_ALLOW_HEADERS, FB_SHOT_PLACEHOLDER, screenshotMarkdown,
    quarantineNote,
} from '../relay/core.js'
import {
    makeRing, captureFeedback, submitFeedback, probeFeedback, FB_RELAY,
    storeJonKey, readJonKey, saveJonKey, JONKEY_STORE,
    startKeyboardRing, installTypingGuard, appendPhrase, dictationSupported,
} from '../src/utils/feedback.js'
import { REC_FORMAT, validate, verifyRecording, decodePad, encodePad } from '../src/utils/recording.js'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'

const mutate = process.argv.includes('--mutate')
let pass = 0
let fail = 0
function ok(name, cond) {
    if (cond) { pass++; console.log(`ok   ${name}`) } else { fail++; console.log(`FAIL ${name}`) }
}

// ── relay: validateFeedback (the single gate on every report) ────────────────
const dense = (n) => Array.from({ length: n }, (_, i) => ({ t: i + 1, pad: {} }))
const good = {
    note: 'Wyrm never saddles on the second pass',
    gameId: 'emberwood',
    build: 'abc1234',
    route: '/retrogames/emberwood',
    ts: Date.now(),
    screenshot: 'data:image/png;base64,' + 'A'.repeat(256),
    state: { tick: 7160, score: 150, x: 12, y: 4 },
    input: { format: REC_FORMAT, durationSec: 30, tickRate: 60, seed: 42, ticks: 1800, pads: dense(1800) },
}
ok('validate: good payload accepted', validateFeedback(good).ok === true)
ok('validate: missing note rejected', validateFeedback({ ...good, note: '   ' }).ok === false)
ok('validate: long note rejected', validateFeedback({ ...good, note: 'x'.repeat(5000) }).ok === false)
ok('validate: missing gameId rejected', validateFeedback({ ...good, gameId: '' }).ok === false)
ok('validate: non-data screenshot rejected', validateFeedback({ ...good, screenshot: 'http://x/y.png' }).ok === false)
ok('validate: oversize screenshot rejected', validateFeedback({ ...good, screenshot: 'data:image/png;base64,' + 'A'.repeat(2_000_000) }).ok === false)
ok('validate: oversize state rejected', validateFeedback({ ...good, state: { big: 'y'.repeat(5000) } }).ok === false)
ok('validate: too many pads rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1, pads: dense(FB_MAX_PADS + 1) } }).ok === false)
ok('validate: non-integer seed rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1.5, pads: [] } }).ok === false)
ok('validate: bad pad frame rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1, pads: [{ t: 0, pad: {} }] } }).ok === false)
ok('validate: sparse event-list pads rejected (not per-tick)',
    validateFeedback({ ...good, input: { ...good.input, ticks: 12, pads: [{ t: 1, pad: { down: true } }, { t: 2, pad: {} }, { t: 4, pad: { right: true } }] } }).ok === false)
ok('validate: ticks cross-check rejected on mismatch',
    validateFeedback({ ...good, input: { ...good.input, ticks: 3, pads: dense(2) } }).ok === false)
ok('validate: 30 s @ 60 Hz (1800 dense frames) accepted', validateFeedback(good).ok === true)
ok('validate: missing input ok (fallback)', validateFeedback({ note: 'hi', gameId: 'tetris' }).ok === true)

// ── relay: quarantine label is the only difference between Jon and friends ───
ok('labels: Jon -> feedback only', JSON.stringify(feedbackLabels(true)) === JSON.stringify(['feedback']))
ok('labels: friend -> feedback + needs-approval', feedbackLabels(false).includes('needs-approval'))

const issueJon = buildFeedbackIssue(good, true)
const issueFriend = buildFeedbackIssue(good, false)
ok('issue: title carries gameId', issueJon.title.startsWith('FEEDBACK emberwood:'))
ok('issue: body carries seed + rec format', issueJon.body.includes('seed 42') && issueJon.body.includes(REC_FORMAT))
ok('issue: header names the per-tick window', /1800 ticks @ 60 Hz/.test(issueJon.body))
ok('issue: body never leaks a token', !/ghp_|github_pat_|Authorization/i.test(issueJon.body))
ok('issue: friend quarantined', issueFriend.labels.includes('needs-approval') && !issueJon.labels.includes('needs-approval'))

// ── #905: the screenshot must be REAL (uploaded) or honestly absent ──────────
ok('issue: screenshot becomes a placeholder, never a fake "attached" claim',
    issueJon.body.includes(FB_SHOT_PLACEHOLDER) && !/data URL attached/.test(issueJon.body))
ok('shot: uploaded asset renders as markdown', screenshotMarkdown('https://github.githubassets.com/x/shot.png') === '![feedback screenshot](https://github.githubassets.com/x/shot.png)')
ok('shot: failed upload says so, no broken image tag', !screenshotMarkdown(null).includes('![') && !screenshotMarkdown('javascript:alert(1)').includes('!['))

// ── #737 follow-up: quarantine must explain itself, and /status must be honest ─
// Jon filed one report from his iPhone; it landed behind needs-approval with zero
// explanation and the screenshot upload failed silently — "what happened to my
// test?" was unanswerable from the board. Every quarantined body now carries the
// why; every failed upload carries the HTTP status.
ok('quarantine: Jon gets no note', quarantineNote({ key: 'K' }, true) === null)
ok('quarantine: key offered but rejected says check JON_KEY', /did not match/.test(quarantineNote({ key: 'K9x' }, false)) && /JON_KEY/.test(quarantineNote({ key: 'K9x' }, false)))
ok('quarantine: no key says open the key link', /no tester key/.test(quarantineNote({}, false)) && /one-time key link/.test(quarantineNote({}, false)))
ok('quarantine: the note never leaks the key value', !quarantineNote({ key: 'S3cretOneTime' }, false).includes('S3cretOneTime'))
const qJon = buildFeedbackIssue(good, true)
const qKey = buildFeedbackIssue({ ...good, key: 'K9x' }, false)
const qAnon = buildFeedbackIssue(good, false)
ok('issue: Jon body carries no quarantine line', !qJon.body.includes('Quarantined'))
ok('issue: rejected-key body explains mismatch + secret', qKey.body.includes('Quarantined') && /did not match/.test(qKey.body))
ok('issue: no-key body explains the device tier', qAnon.body.includes('Quarantined') && /no tester key/.test(qAnon.body))
ok('issue: quarantine bodies still never leak secrets', !/K9x|ghp_|github_pat_/i.test(qKey.body + qAnon.body))
ok('shot: failed upload carries the http status', /http 401/.test(screenshotMarkdown(null, 401)) && !screenshotMarkdown(null, 404).includes('!['))
ok('shot: statusless failure keeps the honest line', /upload failed/.test(screenshotMarkdown(null)) && !/http/.test(screenshotMarkdown(null)))

// ── client: the input ring expands to per-tick frames (the replayable shape) ──
// Events at exact 60 Hz grid multiples (anchored on an injected NOW) so the
// expected frame counts are exact: 1 s = 60 ticks, no boundary ambiguity.
const NOW = Date.now()
const ring = makeRing()
ring.push({ right: true }, NOW - 40_000) // press+release fully outside the window
ring.push({}, NOW - 39_000)
ring.push({ right: true }, NOW - 10_000) // 1 s hold, mid-window
ring.push({}, NOW - 9_000)
ring.push({ right: true, a: true }, NOW - 1_000) // held into the capture edge
const tail = ring.tail(30, NOW)
const fr = (t) => (tail[t - 1] ? tail[t - 1].pad : null) // tick-numbered read, safe on a broken tail
ok('ring: expands to per-tick frames (30 s @ 60 Hz = 1800)', tail.length === 1800)
ok('ring: frames are dense (t = i+1) with encoded pads', tail[0] && tail[1] && tail[0].t === 1 && tail[1].t === 2 && typeof tail[0].pad === 'object')
ok('ring: a press+release outside the window leaves no trace', JSON.stringify(fr(1)) === '{}')
ok('ring: hold timing survives expansion (the 1 s hold = 60 right-only frames)',
    tail.filter((f) => f.pad.right && !f.pad.a).length === 60)
ok('ring: the 1 s hold starts at tick 1200 (10 s before capture)',
    JSON.stringify(fr(1199)) === '{}' && JSON.stringify(fr(1200)) === JSON.stringify({ right: true }))
ok('ring: a held key reaches the capture edge', !!fr(1800) && fr(1800).right === true && fr(1800).a === true)

const ring2 = makeRing()
for (let i = 0; i < 5; i++) ring2.push({ up: true }, Date.now())
ok('ring: auto-trims on push', ring2.size() <= 30 * 60)

// ── client: capture shape + graceful fallback (no window in Node) ────────────
const capRing = makeRing()
capRing.push({ right: true }, Date.now())
const cap = captureFeedback({ note: 'bug!', ring: capRing, route: '/retrogames/tetris' })
ok('capture: note + gameId + build', cap.note === 'bug!' && cap.gameId === 'tetris' && typeof cap.build === 'string')
ok('capture: input is a per-tick rec stream (1800 frames, seed-ready)',
    cap.input && cap.input.format === REC_FORMAT && cap.input.ticks === 1800 && cap.input.pads.length === 1800)
const capIdle = makeRing()
capIdle.push({ right: true }, Date.now() - 35_000) // press+release both before the window
capIdle.push({}, Date.now() - 31_000)
const capNoInput = captureFeedback({ note: 'static looks off', ring: capIdle, route: '/retrogames/britannia' })
ok('capture: an idle window files no input block (still-frame report)', capNoInput.input === undefined)
ok('capture: no screenshot/state in headless (fallback)', cap.screenshot === undefined && cap.state === undefined)

// ── #737 core: the filed 30 s stream replays EXACTLY (seed + per-tick pads) ──
// The Done bar is "QA replays the 30 s from one of them." The proof: a scripted
// input schedule produces the key EVENTS a ring would bank; tail() expands them
// onto the 60 Hz grid; the expanded frames and the schedule itself each drive a
// gauntlet sim — final state.hash must agree. Same seed+pads⇒hash law that
// replaycheck pins for multiplayer recordings, applied to a filed report.
const RT = 1800 // 30 s @ 60 Hz
const RT_SEED = 7
const RT_NOW = Date.now()
const RT_DT = 1000 / 60
const RT_BANDS = [
    [0, 300, { right: true }], [300, 600, {}], [600, 900, { up: true }],
    [900, 1200, { left: true }], [1200, 1500, { down: true }], [1500, 1800, { right: true }],
]
const rtPadAt = (i) => {
    const p = {}
    for (const [s, e, b] of RT_BANDS) if (i >= s && i < e) Object.assign(p, b)
    if ((i >= 1550 && i < 1552) || (i >= 1650 && i < 1652)) p.a = true // sword taps
    return p
}
// The ring banks keydown/keyup SNAPSHOTS only — derive them from the schedule:
const rtEvents = []
{
    let prev = ''
    for (let i = 0; i < RT; i++) {
        const p = rtPadAt(i)
        const j = JSON.stringify(p)
        if (j !== prev) { rtEvents.push({ ms: RT_NOW - (RT - 1 - i) * RT_DT, pad: p }); prev = j }
    }
}
const rtRing = makeRing(30_000)
for (const e of rtEvents) rtRing.push(e.pad, e.ms)
const rtFrames = rtRing.tail(30, RT_NOW)
ok('core: the ring expands the event list to the full 30 s window', rtFrames.length === RT)

const rtFold = (p, prev) => ({
    left: !!p.left, right: !!p.right, fwd: !!p.up, back: !!p.down,
    sword: !!p.a && !prev.a, arrow: !!p.b && !prev.b,
})
const rtRun = (padAt, seed = RT_SEED) => {
    const g = makeGame(seed % 97, 'warrior', { topDown: true })
    let prev = { a: false, b: false }
    const h0 = { x: g.hero.x, y: g.hero.y }
    let maxD = 0
    for (let i = 0; i < RT; i++) {
        const p = padAt(i) || {}
        step(g, rtFold(p, prev))
        prev = { a: !!p.a, b: !!p.b }
        maxD = Math.max(maxD, Math.hypot(g.hero.x - h0.x, g.hero.y - h0.y))
        g.events.length = 0
    }
    return { g, maxD }
}
const rtRef = rtRun(rtPadAt)                                   // the schedule, direct
const rtVia = rtRun((i) => decodePad(rtFrames[i] ? rtFrames[i].pad : {}, 'dpad')) // through tail()
ok('core: tail() expansion == the schedule (identical final state.hash)', stateHash(rtRef.g) === stateHash(rtVia.g))
ok('core: the 30 s is a live run (hero travels, scores, survives)', rtRef.maxD > 5 && rtRef.g.score > 0 && rtRef.g.tick === RT && !rtRef.g.end)
// The 5 s cardinal walk converges across most seeds (walls decide), but 7 and 1
// land on different states — the pair the calibration run proved divergent. If a
// future gauntlet change makes them agree, re-pick a divergent pair.
const rtOther = rtRun(rtPadAt, 1)
ok('core: the seed is load-bearing (seed 7 vs 1, same input, different state)', stateHash(rtOther.g) !== stateHash(rtRef.g))

// And the filed window assembles into a rec file the repo's OWN codec replays:
const rtRec = {
    format: REC_FORMAT, game: 'gauntlet', method: 'dpad', seed: RT_SEED, players: 1,
    ticks: RT, hashEvery: 30,
    slots: [{ source: { kind: 'human' }, pads: rtFrames.map((f) => f.pad), raw: dense(RT).map(() => ({})) }],
    hashes: [],
}
ok('core: the filed window assembles into a codec-VALID rec file', validate(rtRec) === null)
let rtG = null
let rtPrev = { a: false, b: false }
const rtRes = verifyRecording(rtRec, {
    reset: (seed) => { rtG = makeGame(seed % 97, 'warrior', { topDown: true }); rtPrev = { a: false, b: false } },
    step: (pads) => {
        const p = (pads[0] || {})
        step(rtG, rtFold(p, rtPrev))
        rtPrev = { a: !!p.a, b: !!p.b }
        rtG.events.length = 0
    },
    state: () => ({ tick: rtG.tick, hash: stateHash(rtG) }),
})
ok('core: verifyRecording replays the filed window to the same state', rtRes.ok === true && rtRes.state.hash === stateHash(rtRef.g))

// The pre-fix shape — what #1088 actually filed: an event list renumbered 1..E.
// It cannot fill the window, so any "replay" of it is a different game, not the
// player's 30 s. Kept as a standing gate: the old shape must NOT replay.
const oldFrames = rtEvents.map((e, i) => ({ t: i + 1, pad: encodePad(e.pad) }))
ok('core: the old event-list shape cannot fill the window (E << ticks)', oldFrames.length < RT / 10)
ok('core: replaying the old shape lands elsewhere (it has no timing)',
    stateHash(rtRun((i) => decodePad(oldFrames[i] ? oldFrames[i].pad : {}, 'dpad')).g) !== stateHash(rtRef.g))

// ── client: submit posts through the relay and never leaks the token ─────────
let captured = null
const fakeFetch = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) }
    return { ok: true, status: 200, json: async () => ({ ok: true, issue: 'https://github.com/jalfern/retrogames/issues/738', labels: ['feedback'] }) }
}
const sent = await submitFeedback(cap, { fetchImpl: fakeFetch })
ok('submit: posts to relay /feedback', captured && captured.url === `${FB_RELAY}/feedback`)
ok('submit: returns the issue url', sent.ok === true && sent.issue.endsWith('/738'))
ok('submit: sets json content-type', captured.headers['content-type'] === 'application/json')
ok('submit: NO authorization header (token stays server-side)', !('authorization' in captured.headers) && !('Authorization' in captured.headers))
ok('submit: payload has no secret', !/ghp_|github_pat_|token/i.test(captured.url + JSON.stringify(captured.body)))

const boom = await submitFeedback(cap, { fetchImpl: async () => { throw new Error('network down') } })
ok('submit: never throws on network failure', boom.ok === false && /network/.test(boom.err))

const rejected = await submitFeedback({ note: 'x', gameId: 'g' }, { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, err: 'bad json' }) }) })
ok('submit: surfaces relay error', rejected.ok === false && rejected.err === 'bad json')

// ── client: the button self-hides until the relay advertises /feedback ───────
const probeOn = await probeFeedback({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, feedback: true }) }) })
ok('probe: shows button once relay supports feedback', probeOn === true)
const probeOff = await probeFeedback({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) })
ok('probe: hides button when relay lacks the capability', probeOff === false)
const probeErr = await probeFeedback({ fetchImpl: async () => { throw new Error('offline') } })
ok('probe: offline -> hidden (never a dead button)', probeErr === false)

// ── relay CORS (#886): the button on jalfern.com fetches cross-origin ───────
ok('cors: arcade origin allowed', corsOrigin('https://jalfern.com') === 'https://jalfern.com')
ok('cors: www + workers surface allowed', corsOrigin('https://www.jalfern.com') === 'https://www.jalfern.com'
    && corsOrigin('https://retrogames.jalfern.workers.dev') === 'https://retrogames.jalfern.workers.dev')
ok('cors: localhost dev origins allowed', corsOrigin('http://localhost:5176') === 'http://localhost:5176'
    && corsOrigin('http://127.0.0.1:8787') === 'http://127.0.0.1:8787')
ok('cors: unknown origin gets NO ACAO (browser blocks)', corsHeaders('https://evil.example')['access-control-allow-origin'] === undefined)
ok('cors: originless (curl/cron) gets no headers', Object.keys(corsHeaders(null)).length === 0)
ok('cors: preflight answers content-type + methods', corsHeaders('https://jalfern.com')['access-control-allow-headers'] === CORS_ALLOW_HEADERS
    && corsHeaders('https://jalfern.com')['access-control-allow-methods'].includes('POST'))
ok('cors: ACAO echoes the exact origin (credentials-safe)', corsHeaders('https://www.jalfern.com')['access-control-allow-origin'] === 'https://www.jalfern.com')

const workerSrc = readFileSync(new URL('../relay/worker.js', import.meta.url), 'utf8')
ok('wiring: worker preflights OPTIONS on the HTTP endpoints', /req\.method === 'OPTIONS'/.test(workerSrc) && /corsHeaders/.test(workerSrc))
ok('wiring: /status + /feedback answers carry corsHeaders', (workerSrc.match(/json\(/g) || []).length >= 6 && !/Response\.json\(\{ ok: true, service/.test(workerSrc))
ok('wiring: /status advertises jonKey presence (boolean, no value)', /jonKey:\s*!!env\.JON_KEY/.test(workerSrc) && !/jonKey:\s*env\.JON_KEY[^?]/.test(workerSrc))
ok('wiring: upload failure routes its status + reason into the issue', /screenshotMarkdown\(null, up\.status, up\.err\)/.test(workerSrc))
const chromeSrc = readFileSync(new URL('../src/components/GameChrome.jsx', import.meta.url), 'utf8')
ok('panel: opening the feedback panel toggles the game pause', /onClick=\{toggle\}/.test(chromeSrc) && /const toggle = \(\) => \{[\s\S]*?dispatchPause\(\)/.test(chromeSrc))

// ── Jon's key (#886): stored once from a one-time link, rides every submit ───
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) } }
const store = memStore()
ok('jonkey: ?jonkey= captured to storage', storeJonKey('?feedback=1&jonkey=S3cretOneTime', store) === 'S3cretOneTime'
    && readJonKey(store) === 'S3cretOneTime')
ok('jonkey: plain visit keeps stored key', storeJonKey('?x=1', store) === null && readJonKey(store) === 'S3cretOneTime')
ok('jonkey: no link, no key', readJonKey(memStore()) === null && readJonKey(null) === null)

let captured2 = null
const fakeFetch2 = async (url, init) => {
    captured2 = { url, body: JSON.parse(init.body) }
    return { ok: true, status: 200, json: async () => ({ ok: true, issue: 'https://github.com/jalfern/retrogames/issues/739', labels: ['feedback'] }) }
}
const sentKey = await submitFeedback(cap, { fetchImpl: fakeFetch2, storage: store })
ok('jonkey: submit attaches the stored key', sentKey.ok === true && captured2.body.key === 'S3cretOneTime')
const sentNoKey = await submitFeedback(cap, { fetchImpl: fakeFetch2, storage: memStore() })
ok('jonkey: anonymous submit sends no key field', sentNoKey.ok === true && captured2.body.key === undefined)
ok('jonkey: the key never reaches the filed issue body', !buildFeedbackIssue({ ...cap, key: 'S3cretOneTime' }, true).body.includes('S3cretOneTime'))

// ── #905: save the key from the panel (one-time link is invisible on a phone) ─
const store2 = memStore()
ok('jonkey: pasted key saved + read back', saveJonKey('Pasted-Device-Key', store2) === 'Pasted-Device-Key' && readJonKey(store2) === 'Pasted-Device-Key')
ok('jonkey: blank paste refused (never clobbers)', saveJonKey('   ', store2) === null && readJonKey(store2) === 'Pasted-Device-Key'
    && saveJonKey(null, memStore()) === null && saveJonKey('x', null) === null)

// ── #905: typing the note must not drive the game or pollute the replay ring ──
// Fake window: capture listeners run first, then bubble ones, unless stopped.
const fakeWin = () => {
    const L = { keydown: [], keyup: [] }
    return {
        addEventListener: (t, fn, cap) => { if (cap) L[t].unshift(fn); else L[t].push(fn) },
        removeEventListener: (t, fn, cap) => { const a = L[t]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1) },
        dispatch(t, target, code, key) {
            const e = { type: t, key: key || code || ' ', code: code || 'Space', target, stopped: false, stopPropagation() { this.stopped = true } }
            for (const fn of [...L[t]]) { fn(e); if (e.stopped) break }
            return e
        },
        listenerCount: (t) => L[t].length,
    }
}
const noteEl = {}
const panelEl = { contains: (n) => n === noteEl }

const ringG = makeRing()
const win1 = fakeWin()
startKeyboardRing(ringG, win1)
let escapeSeen = 0
const stopGuard = installTypingGuard(panelEl, win1, (e) => { if (e.key === 'Escape') escapeSeen++ })
const e1 = win1.dispatch('keydown', noteEl, 'Space')
ok('guard: Space typed in the panel stops before the game listeners', e1.stopped === true)
ok('guard: typing never banks into the replay ring', ringG.size() === 0)
const e2 = win1.dispatch('keydown', {}, 'ArrowRight')
ok('guard: keys outside the panel still reach the game', e2.stopped === false && ringG.size() === 1)
win1.dispatch('keydown', noteEl, 'Escape')
ok('guard: Escape inside the panel reaches the panel callback', escapeSeen === 1)
stopGuard()
const e3 = win1.dispatch('keydown', noteEl, 'Space')
ok('guard: removing the shield hands keys back to the game', e3.stopped === false && ringG.size() === 2)
ok('guard: stop() detaches both shields', win1.listenerCount('keydown') === 1 && win1.listenerCount('keyup') === 1)

// ── #905: seed reaches the replay without DEV-only __game ────────────────────
// #1200: this used to be a regex asserting the __feedbackInfo fallback text
// existed in feedback.js. Now drive captureFeedback against a fake PRODUCTION
// window — no __game (that's the DEV-only contract), __feedbackInfo present (the
// new production-safe hook) — and prove the payload actually carries state.seed
// + input.seed: a report Jon files from his phone is replayable. The DEV path
// (a window WITH __game) still prefers the contract state, so the hook is a
// fallback, not a replacement.
const prodWin = {
    location: { pathname: '/retrogames/gauntlet' },
    navigator: { userAgent: 'QA-fake-phone/1.0' },
    __feedbackInfo: () => ({ tick: 7160, score: 150, done: false, seed: 42, x: 12, y: 4 }),
}
const prodRing = makeRing()
prodRing.push({ right: true }, Date.now() - 500) // a key held inside the window
const prodCap = captureFeedback({ note: 'prod replay test', ring: prodRing, route: '/retrogames/gauntlet', win: prodWin })
ok('prod: the state block rides the report without __game', prodCap.state && prodCap.state.seed === 42 && prodCap.state.tick === 7160 && prodCap.state.x === 12)
ok('prod: the input stream carries the seed (replayable)', prodCap.input && prodCap.input.seed === 42 && prodCap.input.ticks === 1800)
const devWin = { location: { pathname: '/retrogames/gauntlet' }, __game: { state: () => ({ seed: 7, tick: 5 }) } }
const devRing = makeRing()
devRing.push({ right: true }, Date.now() - 500)
const devCap = captureFeedback({ note: 'dev contract test', ring: devRing, route: '/retrogames/gauntlet', win: devWin })
ok('dev: the __game contract state is still preferred when present', devCap.state && devCap.state.seed === 7 && devCap.state.tick === 5)

// ── #905: panel UX — own screen, ESC, send returns to the game, key row ─────
ok('panel: owns a full screen above every game overlay', /fixed inset-0 z-\[80\]/.test(chromeSrc))
ok('panel: ESC closes and resumes the game', /e\.key === 'Escape'[\s\S]{0,60}closePanel\(\)/.test(chromeSrc))
ok('panel: successful send goes straight back to the game', /if \(res\.ok\) \{[\s\S]{0,160}closePanel\(\)/.test(chromeSrc))
ok('panel: a toast confirms the filed issue after the screen is gone', /data-feedback="toast"/.test(chromeSrc))
ok('panel: typing is shielded by the capture guard', /installTypingGuard\(panelRef\.current/.test(chromeSrc))
ok('panel: Jon key row saves to the device', /saveJonKey/.test(chromeSrc) && /data-feedback="keysave"/.test(chromeSrc))
const coreSrc = readFileSync(new URL('../relay/core.js', import.meta.url), 'utf8')
ok('wiring: worker uploads the screenshot through core.uploadScreenshot', /uploadScreenshot/.test(workerSrc) && /FB_SHOT_PLACEHOLDER/.test(workerSrc) && /screenshotMarkdown/.test(workerSrc))
ok('wiring: uploads ride release assets, never the dead issue-assets endpoint',
    /releases\/tags\//.test(coreSrc) && /releases\/\$\{release\.id\}\/assets|uploads\.github\.com/.test(coreSrc)
    && !/issues\/\$\{number\}\/assets/.test(coreSrc))

// ── #1222: screenshot upload through the persistent feedback-assets release ──
// uploads.github.com issue-assets answers 400 "Multipart form data required" to raw
// bodies and 422 "Bad Size" to canonical multipart at any size (live-reproduced with
// a valid token) — the relay files screenshots as RELEASE assets instead. Drive the
// whole flow against a fake GitHub and prove the URL that lands in the issue.
import { uploadScreenshot, screenshotContentType, screenshotAssetName, screenshotErrorReason, FB_ASSET_TAG } from '../relay/core.js'

const PNG1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPG1x1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//dFmYWtlAAC40wAAAA==.jpeg'
const UP_URL = 'https://uploads.github.com/repos/r/r/releases/42/assets{?name,label}'
const DL_URL = 'https://github.com/jalfern/retrogames/releases/download/feedback-assets/feedback-7-1700000000000.png'
const H = { authorization: 'Bearer tok', 'user-agent': 'retrogames-relay' }

const ghStub = (routes) => {
    const calls = []
    const fn = async (url, init = {}) => {
        calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body })
        const key = `${init.method || 'GET'} ${url.replace(/\?.*/, '')}`
        const r = routes[key]
        if (r === undefined) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) }
        return typeof r === 'function' ? r(init) : { ok: true, status: 200, json: async () => r }
    }
    fn.calls = calls
    return fn
}
const okRelease = { id: 42, draft: false, upload_url: UP_URL }

{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: okRelease,
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: true, status: 201, json: async () => ({ browser_download_url: DL_URL }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 7, dataUrl: PNG1x1, headers: H, now: 1700000000000 })
    const post = f.calls.find((c) => c.method === 'POST')
    ok('shot1222: existing release reused (no create call)', up.url === DL_URL && !f.calls.some((c) => c.method === 'POST' && c.url === 'https://api.github.com/repos/r/r/releases'))
    ok('shot1222: upload goes to uploads.github.com release assets', post.url.startsWith('https://uploads.github.com/repos/r/r/releases/42/assets?name='))
    ok('shot1222: raw bytes uploaded, not JSON or multipart', post.body instanceof Uint8Array && post.headers['content-type'] === 'image/png')
    ok('shot1222: asset name unique per issue + timestamp', /name=feedback-7-1700000000000\.png/.test(post.url))
    ok('shot1222: auth header rides the upload', post.headers.authorization === 'Bearer tok')
}
{
    const f = ghStub({
        [`POST https://api.github.com/repos/r/r/releases`]: () => ({ ok: true, status: 201, json: async () => okRelease }),
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: true, status: 201, json: async () => ({ browser_download_url: DL_URL }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 8, dataUrl: PNG1x1, headers: H, now: 1 })
    const create = f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/repos/r/r/releases'))
    ok('shot1222: missing release created on first use', up.url === DL_URL && JSON.parse(create.body).tag_name === FB_ASSET_TAG)
    ok('shot1222: new release is published, not draft (draft URLs are private)', JSON.parse(create.body).draft === false)
}
{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: { id: 42, draft: true, upload_url: UP_URL },
        [`PATCH https://api.github.com/repos/r/r/releases/42`]: () => ({ ok: true, status: 200, json: async () => ({ ...okRelease, draft: false }) }),
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: true, status: 201, json: async () => ({ browser_download_url: DL_URL }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 9, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1222: a draft release found at the tag is published before use',
        up.url === DL_URL && f.calls.some((c) => c.method === 'PATCH' && JSON.parse(c.body).draft === false))
}
{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: { id: 42, draft: false, upload_url: UP_URL },
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: false, status: 422, json: async () => ({ message: 'Bad Size' }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 10, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1222: upload rejection reports its status for the honest line',
        up.url === null && up.status === 422 && /http 422/.test(screenshotMarkdown(null, up.status)))
}
{
    const f = ghStub({})
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 11, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1222: release create refused (read-only token) fails honest', up.url === null && !up.url)
}
// ── #1295: a bare "(http 403)" hid the real cause for three nights ──────────
// Every production upload since #1222 failed with a status and no reason, so
// the scope gap in the relay's GITHUB_TOKEN was unprovable from the issue. The
// server's own words now ride the honest line: a scope gap says
// "Must have push access…", a rate limit says so too — self-diagnosing.
{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: okRelease,
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: false, status: 403, json: async () => ({ message: 'Must have push access of the repository to access this endpoint.' }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 14, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1295: a rejected upload carries the server reason, not just the status',
        up.url === null && up.status === 403 && /push access/.test(up.err || ''))
    ok('shot1295: the honest line says WHY (debuggable from the issue alone)',
        /http 403: Must have push access of the repository to access this endpoint\./.test(screenshotMarkdown(null, up.status, up.err)))
}
{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: okRelease,
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: false, status: 403, json: async () => { throw new Error('not json') }, text: async () => '<?xml version="1.0"?>\n<Error><Code>AccessDenied</Code></Error>' }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 15, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1295: a non-JSON body degrades to a trimmed snippet',
        up.url === null && up.status === 403 && /AccessDenied/.test(up.err || '') && up.err.length <= 160)
}
{
    // Real-Response shape: text() read ONCE, JSON parsed from the text — a
    // consumed body must never be read twice.
    let reads = 0
    const res = { status: 403, ok: false, text: async () => { reads++; return JSON.stringify({ message: 'Resource not accessible by integration' }) } }
    const why = await screenshotErrorReason(res)
    ok('shot1295: a real Response body is read once and its JSON message extracted',
        reads === 1 && why === 'Resource not accessible by integration'
        && /http 403: Resource not accessible/.test(screenshotMarkdown(null, 403, why)))
    const noReason = await screenshotErrorReason({ status: 500, text: async () => '' })
    ok('shot1295: an empty body leaves err blank (status-only line, as before)',
        noReason === '' && !screenshotMarkdown(null, 500, noReason).includes('http 500:'))
}
{
    const boom = async () => { throw new Error('network down') }
    const up = await uploadScreenshot({ fetchImpl: boom, apiUrl: 'https://api.github.com', repo: 'r/r', number: 12, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1222: network failure never throws', up.url === null)
}
ok('shot1222: jpeg data URL uploads as image/jpeg with a .jpg name',
    screenshotContentType(JPG1x1) === 'image/jpeg' && /\.jpg$/.test(screenshotAssetName(7, 1, JPG1x1))
    && screenshotContentType(PNG1x1) === 'image/png' && screenshotContentType('garbage') === 'image/png')
{
    const f = ghStub({
        [`GET https://api.github.com/repos/r/r/releases/tags/${FB_ASSET_TAG}`]: okRelease,
        [`POST https://uploads.github.com/repos/r/r/releases/42/assets`]: () => ({ ok: true, status: 201, json: async () => ({ state: 'starter' }) }),
    })
    const up = await uploadScreenshot({ fetchImpl: f, apiUrl: 'https://api.github.com', repo: 'r/r', number: 13, dataUrl: PNG1x1, headers: H, now: 1 })
    ok('shot1222: a 201 without browser_download_url is not a fake success',
        up.url === null && !screenshotMarkdown(up.url).includes('!['))
}
ok('shot1222: placeholder patch renders the image in the filed body', (() => {
    const body = buildFeedbackIssue({ ...good, screenshot: PNG1x1 }, true).body
    const patched = body.replace(FB_SHOT_PLACEHOLDER, screenshotMarkdown(DL_URL))
    return patched.includes(`![feedback screenshot](${DL_URL})`) && !patched.includes(FB_SHOT_PLACEHOLDER)
})())

// ── #737 demo half: the demo FEEDBACK injector (public/demos/feedback.js) ────
// Same law, different surface: a demo has no sim, no contract, no pad stream —
// its complaint is usually "it stutters", so the report carries a DIAGNOSTICS
// block instead: browser, GPU, settings, and the last ~10 s of REAL frame
// times with hitches (the numbers QA used to read off the screen, #702). The
// injector is a classic script (no build step), so this runs it in a fake
// window: no document → the DOM mount is skipped, the pure logic is exposed
// on window.__demoFeedback and driven exactly as the browser would.
const fbSrc = readFileSync(fileURLToPath(new URL('../public/demos/feedback.js', import.meta.url)), 'utf8')
function runDemoFeedback(fakeWin) {
    new Function('window', 'document', 'fetch', fbSrc)(fakeWin, undefined, undefined)
    return fakeWin.__demoFeedback
}
const memStorage = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: (k) => { m.delete(k) } }
}
const demoWin = {
    location: { pathname: '/retrogames/demos/ocean.html', search: '' },
    navigator: { userAgent: 'DemoPhone Safari/605.1.15', deviceMemory: 4, hardwareConcurrency: 8 },
    localStorage: memStorage(),
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    DEMO_CREDITS: { name: 'OCEAN', accent: '#ffb060', shipped: '2026-10-18' },
    DEMO_DIAG: { waves: 3 },
}
const dfb = runDemoFeedback(demoWin)
ok('demo: injector exposes __demoFeedback in plain Node',
    !!(dfb && dfb.makeFrameRing && dfb.buildDiag && dfb.captureDemoFeedback && dfb.probe && dfb.submit))
{
    // 600 real frames at 16 ms with three hitches (80/120/400 ms) — the
    // summary is the proof the report carries.
    const ring = dfb.makeFrameRing()
    for (let i = 0; i < 600; i++) {
        const ms = (i === 100) ? 80 : (i === 300) ? 120 : (i === 500) ? 400 : 16
        ring.push(i, ms)
    }
    const s = ring.summary(600)
    const expectedAvg = Math.round(((597 * 16) + 80 + 120 + 400) / 600 * 100) / 100
    ok('demo frames: 600 samples with exactly 3 hitches', s.n === 600 && s.spanMs === 600 && s.hitches.length === 3)
    ok('demo frames: avg/max honest (16.92 / 400)', s.avgMs === expectedAvg && s.maxMs === 400)
    ok('demo frames: a hitch carries when + how long', s.hitches[0].t === 100 && s.hitches[0].ms === 80 && s.hitches[2].t === 500 && s.hitches[2].ms === 400)
}
{
    const ring = dfb.makeFrameRing()
    ring.push(1000, 16)
    for (let i = 0; i < 600; i++) ring.push(11000 + i, 16)
    ok('demo frames: the ring trims to the last 10 s (old frame gone)', ring.summary(12599).n === 600)
}
{
    const ring = dfb.makeFrameRing()
    ring.push(0, 33.3)
    ring.push(1, 33.4)
    const s = ring.summary(2)
    ok('demo frames: 33.3 ms is not a hitch, 33.4 is (the 30 fps line)', s.hitches.length === 1 && s.hitches[0].t === 1)
}
{
    const d = dfb.buildDiag({ win: demoWin, route: '/retrogames/demos/ocean.html', frames: { n: 600, spanMs: 10000, avgMs: 16.9, maxMs: 40, hitches: [{ t: 5, ms: 80 }] } })
    ok('demo diag: browser + gpu + settings + frames', !!(d.browser && d.gpu && d.settings && d.frames))
    ok('demo diag: browser honest (ua/deviceMemory/cores)', d.browser.ua === 'DemoPhone Safari/605.1.15' && d.browser.deviceMemory === 4 && d.browser.cores === 8)
    ok('demo diag: gpu degrades to n/a without a document (no GL here)', d.gpu === 'n/a')
    ok('demo diag: settings carry demo identity + display + DEMO_DIAG hook',
        d.settings.demo === 'ocean' && d.settings.accent === '#ffb060' && d.settings.dpr === 3 && d.settings.viewport === '390x844' && d.settings.waves === 3)
    ok('demo diag: stays under the relay cap (8000 B)', new TextEncoder().encode(JSON.stringify(d)).length <= 8000)
}
{
    const d2 = dfb.buildDiag({ win: { ...demoWin, DEMO_DIAG: () => ({ quality: 'high' }) }, frames: null })
    ok('demo diag: a DEMO_DIAG function merges into settings', d2.settings.quality === 'high')
    ok('demo diag: an empty ring reports zero, not NaN', d2.frames.n === 0 && d2.frames.avgMs === 0 && d2.frames.hitches.length === 0)
}
{
    // Pathological 10 s: every frame a hitch. The cap must hold — thinned or
    // dropped with the count kept — a report is never rejected over detail.
    const frames = { n: 600, spanMs: 10000, avgMs: 55, maxMs: 400, hitches: Array.from({ length: 600 }, (_, i) => ({ t: i * 16, ms: 60 })) }
    const d = dfb.buildDiag({ win: demoWin, frames })
    ok('demo diag: 600 hitches stay under the cap', new TextEncoder().encode(JSON.stringify(d)).length <= 8000,
        `${new TextEncoder().encode(JSON.stringify(d)).length} B`)
    ok('demo diag: the summary survives even when the detail is dropped',
        d.frames.n === 600 && d.frames.maxMs === 400 && (d.frames.hitches.length > 0 || d.frames.hitchesDropped === 600))
}
{
    const p = dfb.captureDemoFeedback({
        note: 'stutters after wave 3', route: '/retrogames/demos/ocean.html',
        frames: { n: 100, spanMs: 10000, avgMs: 17, maxMs: 90, hitches: [{ t: 9, ms: 90 }] },
        screenshot: 'data:image/png;base64,' + 'A'.repeat(64), ts: 123, win: demoWin,
    })
    ok('demo report: note/gameId/build/route/ua assembled',
        p.note === 'stutters after wave 3' && p.gameId === 'ocean' && p.build === 'static' &&
        p.route === '/retrogames/demos/ocean.html' && p.ua === 'DemoPhone Safari/605.1.15')
    ok('demo report: diag present, no input ring (a demo has no pads)', !!p.diag && p.diag.frames.n === 100 && p.input === undefined)
    ok('demo report: relay accepts the demo shape', validateFeedback(p).ok === true)
    ok('demo report: relay refuses a diag over the 8000 B cap',
        validateFeedback({ note: 'x', gameId: 'ocean', diag: { big: 'y'.repeat(9000) } }).ok === false)
    const body = buildFeedbackIssue(p, false).body
    ok('demo report: the issue body renders the Diagnostics block', body.includes('Diagnostics:') && body.includes('"hitches"'))
}
{
    const mkFetch = (json, throws) => async () => {
        if (throws) throw new Error('network down')
        return { ok: true, status: 200, json: async () => json }
    }
    ok('demo probe: relay feedback:true → mount', (await dfb.probe({ win: demoWin, fetchImpl: mkFetch({ feedback: true }) })) === true)
    ok('demo probe: feedback:false → stays hidden', (await dfb.probe({ win: demoWin, fetchImpl: mkFetch({ feedback: false }) })) === false)
    ok('demo probe: relay down → hidden, never throws', (await dfb.probe({ win: demoWin, fetchImpl: mkFetch(null, true) })) === false)
    let called = 0
    const forced = { ...demoWin, location: { pathname: '/retrogames/demos/ocean.html', search: '?feedback=1' } }
    ok('demo probe: ?feedback=1 forces on without a fetch (file:// QA path)',
        (await dfb.probe({ win: forced, fetchImpl: async () => { called++; return { json: async () => ({}) } } })) === true && called === 0)
}
{
    const seen = []
    const post = async (url, init) => {
        seen.push({ url, init })
        return { ok: true, status: 200, json: async () => ({ ok: true, issue: 'https://github.com/jalfern/retrogames/issues/777' }) }
    }
    const p = dfb.captureDemoFeedback({ note: 'hi', route: '/retrogames/demos/ocean.html', win: demoWin })
    const res = await dfb.submit(p, { storage: demoWin.localStorage, fetchImpl: post })
    ok('demo submit: posts JSON to the relay /feedback',
        res.ok === true && res.issue === 'https://github.com/jalfern/retrogames/issues/777' &&
        seen[0].url === dfb.RELAY + '/feedback' && seen[0].init.method === 'POST' &&
        seen[0].init.headers['content-type'] === 'application/json')
    ok('demo submit: no key saved → the body has no key field', !('key' in JSON.parse(seen[0].init.body)))
    dfb.saveJonKey('  jonkey-123  ', demoWin.localStorage)
    await dfb.submit(p, { storage: demoWin.localStorage, fetchImpl: post })
    ok('demo submit: a saved Jon key rides the next report (trimmed)', JSON.parse(seen[1].init.body).key === 'jonkey-123')
    const res2 = await dfb.submit(p, { storage: demoWin.localStorage, fetchImpl: async () => { throw new Error('network down') } })
    ok('demo submit: network failure resolves honest, never throws', res2.ok === false && /network down/.test(res2.err))
}
{
    const st = memStorage()
    ok('demo key: one-time link captured, decoded, stored',
        dfb.storeJonKey('?next=1&jonkey=abc%20123#h', st) === 'abc 123' && dfb.readJonKey(st) === 'abc 123')
    ok('demo key: no link → nothing stored', dfb.storeJonKey('?other=1', memStorage()) == null)
    ok('demo key: same store as the game side (one origin, one key)', dfb.JONKEY_STORE === JONKEY_STORE)
}

// ── #1452: a tap on the note box must not close the panel ────────────────────
// The card is a backdrop that closes on click; the note textarea sits INSIDE
// it, so a tap-to-focus on the box bubbles to the card and closed the panel
// before a word could be typed. The DOM mount is real code the fake-window
// section above skips (no document), so give it a minimal document: mount()
// attaches its real listeners onto these fakes, and the gate drives the REAL
// card click handler with a synthetic click — open the panel, click the
// textarea, assert it is still open; then the backdrop (target === card)
// still closes it, so the fix cannot delete the close-on-tap-away behavior.
{
    let uid = 0
    const allEls = []
    const qselCache = new Map()
    const mkEl = (tag) => {
        const el = {
            tag, id: '', className: '', textContent: '', _innerHTML: '',
            _uid: ++uid, attrs: {}, children: [], listeners: {}, parent: null,
            setAttribute(k, v) { el.attrs[k] = String(v); if (k === 'id') el.id = String(v) },
            appendChild(c) { c.parent = el; el.children.push(c); return c },
            addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn) },
            removeEventListener() {},
            contains(n) { for (let c = n; c; c = c.parent) if (c === el) return true; return false },
            querySelector(sel) {
                const key = el._uid + '|' + sel
                if (!qselCache.has(key)) {
                    const m = mkEl('sel:' + sel)
                    m.parent = el
                    qselCache.set(key, m)
                }
                return qselCache.get(key)
            },
            get innerHTML() { return el._innerHTML },
            set innerHTML(v) { el._innerHTML = String(v) },
        }
        el.classList = {
            _s: new Set(),
            add(c) { el.classList._s.add(c) },
            remove(c) { el.classList._s.delete(c) },
            contains(c) { return el.classList._s.has(c) },
        }
        allEls.push(el)
        return el
    }
    const fdoc = {
        readyState: 'complete',
        head: mkEl('head'),
        body: mkEl('body'),
        listeners: {},
        createElement: (t) => mkEl(t),
        getElementById: (id) => allEls.find((e) => e.id === id) || null,
        addEventListener(t, fn) { (fdoc.listeners[t] = fdoc.listeners[t] || []).push(fn) },
        querySelectorAll: () => [],
    }
    const dwin = {
        location: { pathname: '/retrogames/demos/ocean.html', search: '?feedback=1' },
        navigator: { userAgent: 'DemoPhone Safari/605.1.15' },
        localStorage: memStorage(),
        requestAnimationFrame: () => {},
    }
    new Function('window', 'document', 'fetch', fbSrc)(dwin, fdoc, undefined)
    await new Promise((r) => setImmediate(r)) // let probe().then(mount) run
    const card = fdoc.getElementById('dfeedback-card')
    ok('panel1452: the injector mounted the card (box inside) into the page',
        !!card && card.children.length === 1)
    const note = card.children[0].querySelector('[data-feedback="note"]')
    ok('panel1452: the card carries exactly one click handler (the backdrop close)',
        Array.isArray(card.listeners.click) && card.listeners.click.length === 1)
    const backdropClick = card.listeners.click[0]
    card.classList.add('open')
    backdropClick({ target: note, stopPropagation() {} })
    ok('panel1452: tapping the note box does NOT close the panel', card.classList.contains('open') === true)
    backdropClick({ target: note, stopPropagation() {} })
    ok('panel1452: tapping the note box again still does not close it', card.classList.contains('open') === true)
    backdropClick({ target: card, stopPropagation() {} })
    ok('panel1452: a tap on the backdrop (target === card) still closes it', card.classList.contains('open') === false)
}

// ── #737 seed-pin law: a reported seed must be replayable ──────────────────
// A game that files its seed via __feedbackInfo but ignores ?seed=N at start
// ships a decorative seed: feedbackreplay opens the game with the report's
// seed and the game rolls a new world. Static law per game: if the file wires
// exposeFeedbackState with a seed key, it must also consume seedFromQuery.
const gcSrc = readFileSync(new URL('../src/utils/gameContract.js', import.meta.url), 'utf8')
ok('seedpin: gameContract exports seedFromQuery (the shared half)', /export function seedFromQuery/.test(gcSrc))
ok('seedpin: helper takes integers only (junk -> null, keep own RNG)',
    seedFromQuery('?seed=42') === 42 && seedFromQuery('?seed=0') === 0
    && seedFromQuery('?seed=1.5') === null && seedFromQuery('?seed=NaN') === null
    && seedFromQuery('?seed=-3') === null && seedFromQuery('?seed=x') === null
    && seedFromQuery('?x=1') === null && seedFromQuery('') === null)
const unpinneable = []
let reportingGames = 0
for (const d of readdirSync(new URL('../src/games/', import.meta.url), { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const f = new URL(`../src/games/${d.name}/index.jsx`, import.meta.url)
    let src = ''
    try { src = readFileSync(f, 'utf8') } catch { continue }
    const reportsSeed = /exposeFeedbackState\([\s\S]*?\bseed:/.test(src)
    const pinsSeed = /seedFromQuery\s*\(/.test(src)
    if (reportsSeed) reportingGames++
    if (reportsSeed && !pinsSeed) unpinneable.push(d.name)
}
ok('seedpin: every seed-reporting game honors seedFromQuery', unpinneable.length === 0, unpinneable.join(','))
ok('seedpin: the law covers the games that report seeds (>0)', reportingGames > 0, `${reportingGames} reporting`)
// #1473 rollout floor: #1472 shipped Gauntlet/QBert/Tetris/PickRush (PickRush
// pins but doesn't yet report a seed, so the law's counter sees 3 of them);
// batch 1 adds 8 (SSX, CometDrift, CometDriftHD, SmashTV, ShortOrderShout,
// Tempest, LunarLander, Lemmings) → 11; batch 2 adds 10 (Sonar, TenDeep,
// Beezee, GravelYard, FloorBoss, TidyBot, FireCrew, TalkMeDown, Minesweeper,
// Homebody) → 21 reporting+pinning titles; batch 3 adds 3 (Outpost, BlobBattle
// — offline only, online keeps the lobby seed — PapersPleaseMin) → 24; batch 4
// adds 6 (Arkanoid, BubbleBobble — local modes only, DigDug, OutRun,
// MarbleMadness, MagicCarpet — the pure-sim classic ports, seeded LCG worlds)
// → 30; FourHalls joins (it rolls its seed inline as Math.random()%97 at start
// — hid from the batch inventory, flagged #1473 at 00:01Z) → 31; batch 5 adds 5
// pure engines (Emberwood, ViperPit — offline only — CivilizationV, Myst, and
// PickRush, whose #1472 pin finally becomes visible to this counter via the
// inline report) → 36 reporting+pinning titles. BardsTale reports seedless: its
// six dungeons are fixed floors by design. Batch 6 adds 2 honest-seed sims
// (GardenGuard — sim.js is "deterministic from a single integer seed"; RobotLab
// — createRobotSim mulberry32, its Date.now rolls at human start now lose to
// the pin) → 38. Batch 7 adds IronKeep: the keep's every entropy source (guard
// cooldowns, shot spread, crits, prop bob, flicker) already flows through a fixed
// seed rng(1337) in art.js — it starts honoring ?seed=N at startPlay now, so it
// joins the reporting+pinning count → 39. Batch 8 is the first SEED-PARAM port:
// DonkeyKong's gameplay randomness (barrel spacing, ladder chance) moved from raw
// Math.random into seedRng(seed) regenerated at every human start → 40. Batch
// 12 adds 3 whose seed machinery already existed and only lacked the report +
// pin: RallyCoDriver (createSim drives every curve/pack/grip call from go.seed
// — rnd=0 across the whole title; offline starts honor ?seed=N, the lobby seed
// keeps authority online), Britannia (fresh(seed) selects the spawn gate +
// every weather/ambient/foam hash; the human start was hardcoded seed 0, now
// seedFromQuery() ?? 0 — score = moons visited) and IronRing (pure seeded
// engine per the #531 netcode law; offline startFight used a Date.now LCG —
// the pin wins when the caller passes no seed, explicit online seeds
// untouched) → 43 reporting+pinning titles; batch 13 adds Space Invaders
// (the Feb-2026 port had NO terminal at all — hits/landings/wave-clears all
// silently re-init'ed and `score` was dead; rebuilt faithful: 30/20/20/10
// row bands, mystery UFO, 3 lives + respawn, landing ends the run, faster
// waves; sim.js extracted zero-entropy, seedRng pin at every human start)
// → 44 reporting+pinning titles; batch 14 adds Rogue (turn-based ur-dungeon —
// sim.js extracted with the mulberry32 stream position CARRIED IN STATE
// (`randState`), so parallel worlds provably never interleave entropy; the
// whole RNG surface — layout, dice, ciphers, monster ids — flows from one
// integer, regenerated at every human start honoring ?seed=N; turn counter
// lands in the report as `tick`) → 45 reporting+pinning titles; batch 15 adds
// the three mechanical classic ports whose terminals already existed but whose
// dice ran naked off Math.random — Pacman (the whole ghost brain — pen timers,
// chase BFS, inky coin flip, scared wander — extracted to pure stepGhost in
// move.js on one seeded stream, and the score now survives the GAME OVER
// screen like the arcade), Frogger (sim.js: lane dive-phase offsets + the
// bonus fly house seeded, so the traffic itself replays), and MissileCommand
// (sim.js: every warhead's target, trail entry and start on the stream — and
// the port had NO restart at all, so startRun now rebuilds the whole board
// from any key, click or tap) → 48 reporting+pinning titles.
// Dropping below is a regression, so pin it.
// → 51 at batch 16: the dead-terminal restoration tier — Pong (serve dir/angle,
// paddle scatter and hit spin onto one stream; no terminal existed and the score
// persisted across runs under a literal 'Reset score? Maybe' comment — now a
// play-to-quit honest terminal), Asteroids (the port had NO score, NO lives, NO
// terminal — the ship could not die; restored the 1979 law: 20/50/100 rocks with
// the pinned 520 big-rock chain, 3 lives + bonus@10k + grace respawn + wave
// regen) and Centipede (score was dead code, one touch hard-reset the board, cut
// bodies never grew heads; restored 100/10/1, the chain-head rule and the
// 3-life persist-field death).
// Batch 17 adds Defender — the fourth dead terminal of the arcade shelf: the
// Feb shell could not score, lose a life or die, and its terrain/wave dice ran
// off Math.random. The whole engine now lives in src/games/Defender/sim.js on
// one mulberry32 stream: wrap-around terrain, 5 humans, the abduction chain
// (lander 150, falling-human catch 250, delivery 500), lander→mutant mutation
// (1500), wave clear 1000, 3 lives + bonus@10k + respawn grace + honest GAME
// OVER — ?seed=N replays the exact planet → 52 reporting+pinning titles.
// Batch 18 adds Adventure — the dice (dragon wander, bat course-change) ran
// naked, and the castle exteriors carried full-width solid TOP walls with the
// gate rect as extra collision, so no parked key could ever open a foyer:
// room-level BFS proved the chalice home run impossible (single bridge,
// three wall crossings needing it). Restored per the port's own comment: gate
// rooms get a top gap blocked by the gate rect while closed. Whole engine now
// in src/games/Adventure/sim.js on one mulberry32 stream; scripted run wins
// 10/10 seeds at identical tick → 53 reporting+pinning titles.
// Batch 19 adds SuperMario — the arcade's flagship had no seed, no report and no
// exposeGame; coin anim phase, brick-debris scatter, explosion particles, and the
// evolutionary AI's weights/crossover/tournament all ran naked off Math.random.
// All 10 sites now draw from seedRng(seed) regenerated at every human start;
// ?seed=N replays identical AI opponents → 54 reporting+pinning titles.
ok('seedpin: rollout floor — at least 54 games report+pin seeds', reportingGames >= 54, `${reportingGames} reporting`)
// Batch 20 adds RaccoonHeist — a 3D stealth game whose engine already ran on an
// xorshift seeded from level dimensions (guard blink/patrol timing deterministic),
// but never reported a seed. Seed now generated at every human start honoring
// ?seed=N and threaded into createEngine → 55 reporting+pinning titles.
ok('seedpin: rollout floor — at least 55 games report+pin seeds', reportingGames >= 55, `${reportingGames} reporting`)
// Batch 21 is the EMULATOR tier — js-dos / ifvms titles run binary ROMs: there
// is no JS RNG to seed and no game memory to read, so they join the rollout
// SEEDLESS (the pattern BardsTale proved). DosShell.jsx (shared by Ultima I–V)
// and the hand-rolled mounts in KingsQuest (js-dos AGI) and Zork (ifvms ZVM)
// each report {tick,score:0,done:false} while the emulator is mounted — tick is
// elapsed frames, score/done are honest zeros, never a fake. The seedless
// counter below counts them (it resolves the DosShell import); this law proves
// the shell reports the shape without a seed and un-exposes on cleanup.
const dosShellSrc = readFileSync(new URL('../src/components/DosShell.jsx', import.meta.url), 'utf8')
ok('dos: DosShell reports seedless {tick,score,done} while mounted and cleans up',
    /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{\s*tick\b/.test(dosShellSrc)
    && /score: 0/.test(dosShellSrc) && /done: false/.test(dosShellSrc)
    && !/exposeFeedbackState\([\s\S]*?\bseed:/.test(dosShellSrc)
    && /unexposeFeedbackState\(\)/.test(dosShellSrc))
// The two hand-rolled emulator mounts carry the same honest shape in their own
// files (they cannot reuse DosShell: KingsQuest has its own key/pixel seams,
// Zork is a story VM with no canvas at all).
for (const t of ['KingsQuest', 'Zork']) {
    const src = readFileSync(new URL(`../src/games/${t}/index.jsx`, import.meta.url), 'utf8')
    ok(`dos: ${t} reports seedless {tick,score,done} and cleans up`,
        /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{\s*tick\b/.test(src)
        && /score: 0/.test(src) && /done: false/.test(src)
        && !/exposeFeedbackState\([\s\S]*?\bseed:/.test(src)
        && /unexposeFeedbackState\(\)/.test(src))
}

// #1473 seedless law: fixed-world titles — audited zero Math.random across every
// file in the title's directory — carry {tick,score,done} so a filed report can
// pinpoint the run even where there is no world to re-seed. BardsTale's static
// dungeons proved the pattern (batch 5); batch 7 adds Pitfall (fixed screen cycle:
// fixed-seed LFSR), SimCityMin (scenario tables — even fire/tornado follow fixed
// rules), Excitebike (fixed track tables + scripted rivals) and LodeRunnerLite
// (hand-authored vaults). Two laws per title: the report shape AND the audit
// premise itself. If anyone later feeds these engines randomness without a seed,
// both laws go RED — that is the point. Batch 9 adds six sim-shell ports whose
// sim.js headers already promised determinism — a comment-grep of the old audit
// that flagged them "gameplay Math.random" was reading those very promises; the
// code after comment-stripping is clean: Joust, MetroidLite, BoulderDash,
// Paperboy, SpyHunter, MissileBattle. Batch 10 adds ArenaArchery (the two-player
// duel sim pins collision order so both keyboards resolve identically — zero RNG).
// Batch 11 adds Zelda: 3x3 Hyrule is fully authored (world.js tables, scripted
// enemy casts per room), and the gameover restart (Object.assign over the live
// object) keeps the global tick — so {tick,score=rupees collected,done,screen}
// pinpoints a run without any seed to fake.
const SEEDLESS = ['Pitfall', 'SimCityMin', 'Excitebike', 'LodeRunnerLite',
    'Joust', 'MetroidLite', 'BoulderDash', 'Paperboy', 'SpyHunter', 'MissileBattle', 'ArenaArchery', 'Zelda',
    // Batch 12: MarioKart — one authored track, items by standing on fixed
    // cycles, scripted CPU, and even the screen jitter is jit(tick) (rnd=0
    // across all 5 files). PrinceOfPersia — twelve hand-authored rooms
    // (levels.js tables; guards/pots/chomps/mirror scripted, the art grain a
    // pure hash of position, the crackle tick arithmetic; rnd=0 across 6
    // files), score = level reached, done at win/lost.
    'MarioKart', 'PrinceOfPersia']
for (const t of SEEDLESS) {
    const dir = new URL(`../src/games/${t}/`, import.meta.url)
    const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f))
    const all = files.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
    const code = all.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    ok(`seedless: ${t} engine stays entropy-free (audit premise: no Math.random)`, !/Math\.random/.test(code))
    ok(`seedless: ${t} reports {tick,score,done}`,
        /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\btick:/.test(all)
        && /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\bscore:/.test(all)
        && /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\bdone:/.test(all))
}

// #1473 DECO-aware law (batch 11): some classic engines are fully deterministic
// but decorate the screen with unseeded Math.random — starfields, explosion
// particles, camera shake, sparkle phase. A seed param there would be a FAKE pin
// (nothing in the replay depends on it), so these titles report seedless instead.
// The DECO law proves the decoration is confined: after comment-stripping, every
// Math.random line in index.jsx must match that title's audited deco pattern, and
// every other file in the directory (the sim itself) must hold zero Math.random.
// Anyone later feeding these games gameplay RNG fails both halves — new logic
// lines do not read like starfield init or camera shake. Batch 11 audited
// Galaga/IceClimber/Polarity/Dogfight — batch 10's "7/8/8/2 sites" note counted
// CALL SITES of pure decoration (stars ×3, blast ×2, shake ×2, …) — and
// SuperMarioClassic (coin sparkle phase + brick-debris scatter), the candidate
// STATE.md parked for exactly this law variant.
const DECO = {
    Galaga: [/stars\.push/, /sp = 0\.6 \+ Math\.random/, /\* shake : 0/],
    IceClimber: [/starSeed\.push/, /sp = 0\.6 \+ Math\.random/, /\* shake : 0/, /fillRect\(-2 \+ \(Math\.random/],
    Polarity: [/stars\.push/, /sp = 0\.6 \+ Math\.random/, /\* shake : 0/, /0\.25 \+ 0\.5 \* a \* Math\.random/],
    Dogfight: [/camGoal\.[xy] \+= \(Math\.random\(\) - 0\.5\) \* shake/],
    SuperMarioClassic: [/anim: Math\.random\(\) \* 6/, /vy: -3 - Math\.random\(\) \* 2/],
    // Batch 12: MomentumRunner — sim.js/attract.js are zero-entropy (authored
    // ZONES tables; bg silhouettes use literal seeds 11/23/37), and the six
    // index.jsx lines are wind-noise PCM fill, burst-particle angle/speed,
    // ring-pickup pitch jitter and camera shake: nothing the sim reads.
    MomentumRunner: [/d\[i\] = Math\.random\(\) \* 2 - 1/, /const a = Math\.random\(\) \* Math\.PI \* 2, sp = 1 \+ Math\.random/, /1046 \+ Math\.random\(\) \* 120/, /shake > 0 \? \(Math\.random\(\) - 0\.5\) \* shake : 0/],
}
for (const [t, pats] of Object.entries(DECO)) {
    const dir = new URL(`../src/games/${t}/`, import.meta.url)
    const files = readdirSync(dir).filter((f) => /\.jsx?$/.test(f))
    let stray = 0
    let engineEntropy = 0
    const all = files.map((f) => {
        const src = readFileSync(new URL(f, dir), 'utf8')
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split('\n').forEach((l) => {
            if (!/Math\.random/.test(l)) return
            if (f !== 'index.jsx') engineEntropy++
            else if (!pats.some((p) => p.test(l))) stray++
        })
        return src
    }).join('\n')
    ok(`deco: ${t} Math.random stays audited decoration (zero stray index lines, zero outside index.jsx)`,
        stray === 0 && engineEntropy === 0, `${stray} stray, ${engineEntropy} outside index`)
    ok(`deco: ${t} reports {tick,score,done}`,
        /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\btick:/.test(all)
        && /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\bscore:/.test(all)
        && /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[^)]*?\bdone:/.test(all))
}
let seedlessReporters = 0
for (const d of readdirSync(new URL('../src/games/', import.meta.url), { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    let src = ''
    try { src = readFileSync(new URL(`../src/games/${d.name}/index.jsx`, import.meta.url), 'utf8') } catch { continue }
    // Emulator titles mount through the shared shell (Ultima I–V, batch 21):
    // the report lives in DosShell.jsx, so resolve that import before judging.
    if (!/exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{/.test(src) && /from ['"][^'"]*components\/DosShell['"]/.test(src)) src += '\n' + dosShellSrc
    if (/exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{/.test(src) && !/exposeFeedbackState\([\s\S]*?\bseed:/.test(src)) seedlessReporters++
}
ok('seedless: at least 28 titles report without a seed (BardsTale + fixed-world + deco batches + the emulator tier: Ultima I–V, KingsQuest, Zork)', seedlessReporters >= 28, `${seedlessReporters} seedless reporters`)

// Batch 23 — the TOTAL-COVERAGE law. After b22 (the emulator tier) every title on
// the board files at least one feedback state; measured, not remembered: 83/83.
// This turns that audit result into a law — a new game cannot merge without a
// report. The strict-shape ratchet tightened the remaining slack: 13 titles reported
// through block-body callbacks or ternary fallbacks the `() => ({` parsers could
// not see. Batch 24 RETIRES that slack: all 13 (BlobBattle, CometDrift,
// CometDriftHD, FireCrew, GardenGuard, GravelYard, Homebody, IronRing, PickRush,
// Rogue, ShortOrderShout, TalkMeDown, ViperPit) were normalized to expression-body
// reports — gs-null fallbacks moved into per-field guards, so the reported VALUES
// are unchanged (multiplayer titles keep their online-seed authority: this touched
// report shape only, never netcode). The list may not grow again: a new title that
// reports outside the strict shape goes RED immediately, and any future unlisted
// non-strict reporter fails the per-directory law above this one.
const UNSTRICT = new Set([])
let dirsTotal = 0, looseReporters = 0, strictReporters = 0
for (const d of readdirSync(new URL('../src/games/', import.meta.url), { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    let src = ''
    try { src = readFileSync(new URL(`../src/games/${d.name}/index.jsx`, import.meta.url), 'utf8') } catch { continue }
    dirsTotal++
    const strictHere = /exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{/.test(src)
    const viaShell = !strictHere && /from ['"][^'"]*components\/DosShell['"]/.test(src)
    if (strictHere || viaShell) strictReporters++
    const anyInDir = strictHere || viaShell || readdirSync(new URL(`../src/games/${d.name}/`, import.meta.url))
        .some((f) => /\.jsx?$/.test(f) && /exposeFeedbackState\s*\(/.test(readFileSync(new URL(`../src/games/${d.name}/${f}`, import.meta.url), 'utf8')))
    if (anyInDir) looseReporters++
    if (!strictHere && !viaShell && !UNSTRICT.has(d.name)) {
        ok(`coverage: ${d.name} reports in a shape the parsers see (or is on the ratchet list)`, false, 'unlisted non-strict reporter')
    }
}
ok('coverage: every game directory files a feedback report (#1473 total-rollout floor)', looseReporters === dirsTotal && dirsTotal >= 83, `${looseReporters}/${dirsTotal}`)
ok(`coverage: strict-shape ratchet — at most ${UNSTRICT.size} titles report outside the () => ({ shape`, dirsTotal - strictReporters <= UNSTRICT.size, `${dirsTotal - strictReporters} of ${dirsTotal} non-strict`)

// #1473 seed-param law: the shared mulberry32 helper is proven first (same seed
// -> same stream, different seed -> different stream, values in [0,1)), then per
// port: every Math.random in the file must sit on a seed-generation line, so ALL
// gameplay randomness provably flows through seedRng(seed). DonkeyKong is the
// first such port — its barrel spacing + ladder chance used to be raw Math.random.
const r1 = seedRng(424242)
const r2 = seedRng(424242)
const stream1 = [r1(), r1(), r1(), r1(), r1()]
const stream2 = [r2(), r2(), r2(), r2(), r2()]
ok('seedparam: seedRng is deterministic (same seed -> same stream)', stream1.join() === stream2.join())
ok('seedparam: seedRng actually varies with the seed', seedRng(1)() !== seedRng(2)() && seedRng(7)() !== seedRng(8)())
ok('seedparam: seedRng stays in [0,1)', stream1.every((v) => v >= 0 && v < 1))
{
    const dk = readFileSync(new URL('../src/games/DonkeyKong/index.jsx', import.meta.url), 'utf8')
    const dkSim = readFileSync(new URL('../src/games/DonkeyKong/sim.js', import.meta.url), 'utf8')
    const stray = [...dk.split('\n'), ...dkSim.split('\n')].filter((l) => /Math\.random/.test(l) && !/seed/i.test(l))
    ok('seedparam: DonkeyKong — Math.random only on seed-generation lines', stray.length === 0, stray.map((l) => l.trim()).join(' | '))
    ok('seedparam: DonkeyKong — gameplay draws from the seeded stream', /rnd\(gs\)/.test(dkSim) && /rngState/.test(dkSim) && /seedRng is step|mulberry/.test(dkSim))
    ok('seedparam: DonkeyKong — seed regenerated at every human start', /seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(dk))
}

// ── #737 "type OR dictate": the mic half of the note ────────────────────────
// Dictation is how a mid-game phone report gets written. The recognizer wrapper
// is drivable without a mic: makeDictation takes an injected window, so a fake
// SpeechRecognition proves the whole pipeline — config, interim-vs-final
// routing, permission disarm, silence rearm, and stop() staying stopped. The
// append rule is what keeps typed+dictated text readable; the wiring gates pin
// that BOTH surfaces (in-game panel + demo credits card) carry the mic button,
// stop recognition when the panel closes, and hide it where no API exists.
ok('dictate: appendPhrase joins typed + spoken text with one space',
    appendPhrase('black flash', 'on resize') === 'black flash on resize'
    && appendPhrase('black flash ', 'on resize') === 'black flash on resize'
    && appendPhrase('', 'it stutters') === 'it stutters')
ok('dictate: a blank phrase never rewrites the note',
    appendPhrase('keep me', '   ') === 'keep me' && appendPhrase('keep me', null) === 'keep me')
ok('dictate: overflow keeps the existing note intact (no half words)',
    appendPhrase('x'.repeat(1995), 'a phrase too far', 2000) === 'x'.repeat(1995))
ok('dictate: supported() gates on the API existing (Safari/CI hide the mic)',
    dictationSupported({ webkitSpeechRecognition: class {} }) === true
    && dictationSupported({ SpeechRecognition: class {} }) === true
    && dictationSupported({}) === false && dictationSupported(null) === false)
{
    const made = []
    class FakeSR {
        constructor() { made.push(this); this.started = 0 }
        start() { this.started++ }
        stop() {}
    }
    const d = dfb.makeDictation({ SpeechRecognition: FakeSR })
    ok('dictate: unsupported window never starts (start() false, no instance)',
        dfb.makeDictation({}).supported() === false && dfb.makeDictation({}).start({}) === false && made.length === 0)
    ok('dictate: start arms continuous en-US recognition with interim results',
        d.start({ onText: () => {}, onHeard: () => {}, done: () => {} }) === true
        && d.active() === true && made.length === 1 && made[0].started === 1
        && made[0].lang === 'en-US' && made[0].continuous === true && made[0].interimResults === true)
    const texts = [], heardList = []
    const d2 = dfb.makeDictation({ SpeechRecognition: FakeSR })
    const doneSeen = []
    d2.start({ onText: (t) => texts.push(t), onHeard: (p) => heardList.push(p), done: (w) => doneSeen.push(w) })
    const inst = made[made.length - 1]
    inst.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'stutters ' }, isFinal: false }] })
    const afterInterim = texts.length
    inst.onresult({ resultIndex: 0, results: [{ isFinal: true, transcript: ' after wave 3 ' }] })
    ok('dictate: interim words stream live; final transcripts reach the note',
        afterInterim === 0 && heardList.join('|') === 'stutters' && texts.join('|') === 'after wave 3')
    inst.onerror({ error: 'no-speech' })
    ok('dictate: a silence wobble does NOT disarm (rearm is the answer)', d2.active() === true && doneSeen.length === 0)
    inst.onend()
    await new Promise((r) => setTimeout(r, 200))
    ok('dictate: Chrome silence-end rearms while armed (a second recognizer)',
        made.length === 3 && d2.active() === true)
    d2.stop()
    const n = made.length
    ok('dictate: stop() detaches the end handler (no rearm can fire)', made[n - 1].onend === null)
    await new Promise((r) => setTimeout(r, 200))
    ok('dictate: stop() disarms for good — no recognizer after it',
        d2.active() === false && made.length === n)
    const d3 = dfb.makeDictation({ SpeechRecognition: FakeSR })
    d3.start({ onText: () => {}, done: (w) => doneSeen.push(w) })
    made[made.length - 1].onerror({ error: 'not-allowed' })
    ok('dictate: permission refusal disarms and names the reason',
        d3.active() === false && doneSeen[doneSeen.length - 1] === 'not-allowed')
}
{
    const chromeSrc = readFileSync(new URL('../src/components/GameChrome.jsx', import.meta.url), 'utf8')
    ok('dictate wire: the in-game panel mounts a mic button via the house recognizer',
        /data-feedback="mic"/.test(chromeSrc) && /from '\.\.\/utils\/speechListen'/.test(chromeSrc)
        && /startSpeechListen\(/.test(chromeSrc))
    ok('dictate wire: in-game finals append with appendPhrase; interim stays in the status line',
        /onPhrase:\s*\(p\)\s*=>\s*setNote\(\(n\)\s*=>\s*appendPhrase\(n,\s*p\)\)/.test(chromeSrc)
        && /onHeard:\s*\(partial\)\s*=>\s*setHeard\(partial\)/.test(chromeSrc))
    ok('dictate wire: closing the in-game panel silences the mic',
        /closePanel[\s\S]{0,200}stopDictation\(\)/.test(chromeSrc))
    ok('dictate wire: the demo card carries the same law — mic button, stop on close',
        /data-feedback="mic"/.test(fbSrc) && /closePanel[\s\S]{0,160}stopDictation\(\)/.test(fbSrc)
        && /dictation\.supported\(\)/.test(fbSrc))
}

if (mutate) {
    // Mutant (nightly): tamper = a report one pad over the hard cap. A validator
    // that still enforces FB_MAX_PADS refuses it (green); remove the cap and this
    // goes red — proving the size gate is load-bearing, not decoration.
    const oversize = { ...good, input: { format: REC_FORMAT, seed: 1, pads: dense(FB_MAX_PADS + 1) } }
    ok('mutant: oversize input refused (catches a removed cap)', validateFeedback(oversize).ok === false)
    // Mutant: an expansion that ignores event timestamps (the pre-fix bug) gives
    // every frame the LAST held pad. It must diverge from the schedule's reference
    // run — the timestamps are what make a filed stream replayable. Remove the
    // clock from tail() and the always-on core gate above goes red instead.
    const rtMut = rtRun(() => decodePad(encodePad(rtEvents[rtEvents.length - 1].pad), 'dpad'))
    ok('mutant: timestamp-blind expansion diverges from the reference', stateHash(rtMut.g) !== stateHash(rtRef.g))
}

console.log(`\nfeedbackcheck: ${pass}/${pass + fail} ${fail ? 'RED' : 'GREEN'}`)
process.exit(fail ? 1 : 0)
