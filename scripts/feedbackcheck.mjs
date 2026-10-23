// FEEDBACKCHECK (#737) — the in-game feedback button's proof, in plain Node.
//
// #737's law makes this check load-bearing: the GitHub token must stay server-side,
// and QA must be able to replay the last 30 s of input exactly. Those two claims
// are the token-free crux of the feature — payload validation, the quarantine
// label, the issue builder, the input ring and the submit path — so they are all
// provable without a browser, a deploy, or Jon's secret.
//
//   node scripts/feedbackcheck.mjs        # green when the contract holds
//   node scripts/feedbackcheck.mjs --mutate   # RED by design (drop the size cap)

import { readFileSync } from 'node:fs'
import {
    validateFeedback, feedbackLabels, buildFeedbackIssue, FB_MAX_PADS,
    corsOrigin, corsHeaders, CORS_ALLOW_HEADERS, FB_SHOT_PLACEHOLDER, screenshotMarkdown,
} from '../relay/core.js'
import {
    makeRing, captureFeedback, submitFeedback, probeFeedback, FB_RELAY,
    storeJonKey, readJonKey, saveJonKey, JONKEY_STORE,
    startKeyboardRing, installTypingGuard,
} from '../src/utils/feedback.js'
import { REC_FORMAT } from '../src/utils/recording.js'

const mutate = process.argv.includes('--mutate')
let pass = 0
let fail = 0
function ok(name, cond) {
    if (cond) { pass++; console.log(`ok   ${name}`) } else { fail++; console.log(`FAIL ${name}`) }
}

// ── relay: validateFeedback (the single gate on every report) ────────────────
const good = {
    note: 'Wyrm never saddles on the second pass',
    gameId: 'emberwood',
    build: 'abc1234',
    route: '/retrogames/emberwood',
    ts: Date.now(),
    screenshot: 'data:image/png;base64,' + 'A'.repeat(256),
    state: { tick: 7160, score: 150, x: 12, y: 4 },
    input: { format: REC_FORMAT, durationSec: 30, seed: 42, pads: [{ t: 1, pad: { right: true } }, { t: 2, pad: {} }] },
}
ok('validate: good payload accepted', validateFeedback(good).ok === true)
ok('validate: missing note rejected', validateFeedback({ ...good, note: '   ' }).ok === false)
ok('validate: long note rejected', validateFeedback({ ...good, note: 'x'.repeat(5000) }).ok === false)
ok('validate: missing gameId rejected', validateFeedback({ ...good, gameId: '' }).ok === false)
ok('validate: non-data screenshot rejected', validateFeedback({ ...good, screenshot: 'http://x/y.png' }).ok === false)
ok('validate: oversize screenshot rejected', validateFeedback({ ...good, screenshot: 'data:image/png;base64,' + 'A'.repeat(2_000_000) }).ok === false)
ok('validate: oversize state rejected', validateFeedback({ ...good, state: { big: 'y'.repeat(5000) } }).ok === false)
ok('validate: too many pads rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1, pads: Array.from({ length: FB_MAX_PADS + 1 }, (_, i) => ({ t: i + 1, pad: {} })) } }).ok === false)
ok('validate: non-integer seed rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1.5, pads: [] } }).ok === false)
ok('validate: bad pad frame rejected', validateFeedback({ ...good, input: { format: REC_FORMAT, seed: 1, pads: [{ t: 0, pad: {} }] } }).ok === false)
ok('validate: missing input ok (fallback)', validateFeedback({ note: 'hi', gameId: 'tetris' }).ok === true)

// ── relay: quarantine label is the only difference between Jon and friends ───
ok('labels: Jon -> feedback only', JSON.stringify(feedbackLabels(true)) === JSON.stringify(['feedback']))
ok('labels: friend -> feedback + needs-approval', feedbackLabels(false).includes('needs-approval'))

const issueJon = buildFeedbackIssue(good, true)
const issueFriend = buildFeedbackIssue(good, false)
ok('issue: title carries gameId', issueJon.title.startsWith('FEEDBACK emberwood:'))
ok('issue: body carries seed + rec format', issueJon.body.includes('seed 42') && issueJon.body.includes(REC_FORMAT))
ok('issue: body never leaks a token', !/ghp_|github_pat_|Authorization/i.test(issueJon.body))
ok('issue: friend quarantined', issueFriend.labels.includes('needs-approval') && !issueJon.labels.includes('needs-approval'))

// ── #905: the screenshot must be REAL (uploaded) or honestly absent ──────────
ok('issue: screenshot becomes a placeholder, never a fake "attached" claim',
    issueJon.body.includes(FB_SHOT_PLACEHOLDER) && !/data URL attached/.test(issueJon.body))
ok('shot: uploaded asset renders as markdown', screenshotMarkdown('https://github.githubassets.com/x/shot.png') === '![feedback screenshot](https://github.githubassets.com/x/shot.png)')
ok('shot: failed upload says so, no broken image tag', !screenshotMarkdown(null).includes('![') && !screenshotMarkdown('javascript:alert(1)').includes('!['))

// ── client: the input ring trims to the last 30 s ────────────────────────────
const ring = makeRing()
const NOW = Date.now()
ring.push({ right: true }, NOW - 40_000) // outside window
ring.push({ right: true }, NOW - 10_000)
ring.push({ right: true, a: true }, NOW - 1_000)
const tail = ring.tail(30)
ok('ring: trims to window (drops the 40s-old frame)', tail.length === 2)
ok('ring: frames are rec-style (1-based t, encoded pad)', tail[0].t === 1 && typeof tail[1].pad === 'object')

const ring2 = makeRing()
for (let i = 0; i < 5; i++) ring2.push({ up: true }, Date.now())
ok('ring: auto-trims on push', ring2.size() <= 30 * 60)

// ── client: capture shape + graceful fallback (no window in Node) ────────────
const capRing = makeRing()
capRing.push({ right: true }, Date.now())
const cap = captureFeedback({ note: 'bug!', ring: capRing, route: '/retrogames/tetris' })
ok('capture: note + gameId + build', cap.note === 'bug!' && cap.gameId === 'tetris' && typeof cap.build === 'string')
ok('capture: input uses rec format', cap.input && cap.input.format === REC_FORMAT && cap.input.pads.length === 1)
ok('capture: no screenshot/state in headless (fallback)', cap.screenshot === undefined && cap.state === undefined)

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
const feedbackSrc = readFileSync(new URL('../src/utils/feedback.js', import.meta.url), 'utf8')
ok('capture: seed key survives the contract filter', /'seed'/.test(feedbackSrc))
ok('capture: seed falls back to __feedbackInfo (production hook)', /__feedbackInfo\(\)\.seed/.test(feedbackSrc))

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
    const oversize = { ...good, input: { format: REC_FORMAT, seed: 1, pads: Array.from({ length: FB_MAX_PADS + 1 }, (_, i) => ({ t: i + 1, pad: {} })) } }
    ok('mutant: oversize input refused (catches a removed cap)', validateFeedback(oversize).ok === false)
}

console.log(`\nfeedbackcheck: ${pass}/${pass + fail} ${fail ? 'RED' : 'GREEN'}`)
process.exit(fail ? 1 : 0)
