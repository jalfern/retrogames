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

import { readFileSync } from 'node:fs'
import {
    validateFeedback, feedbackLabels, buildFeedbackIssue, FB_MAX_PADS,
    corsOrigin, corsHeaders, CORS_ALLOW_HEADERS, FB_SHOT_PLACEHOLDER, screenshotMarkdown,
    quarantineNote,
} from '../relay/core.js'
import {
    makeRing, captureFeedback, submitFeedback, probeFeedback, FB_RELAY,
    storeJonKey, readJonKey, saveJonKey, JONKEY_STORE,
    startKeyboardRing, installTypingGuard,
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
ok('wiring: upload failure routes its status into the issue', /screenshotMarkdown\(null, res\.status\)/.test(workerSrc))
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
ok('wiring: worker uploads the screenshot as an issue asset', /uploads\.github\.com/.test(workerSrc) && /FB_SHOT_PLACEHOLDER/.test(workerSrc) && /screenshotMarkdown/.test(workerSrc))

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
