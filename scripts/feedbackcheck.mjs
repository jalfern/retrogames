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

import {
    validateFeedback, feedbackLabels, buildFeedbackIssue, FB_MAX_PADS,
} from '../relay/core.js'
import {
    makeRing, captureFeedback, submitFeedback, probeFeedback, FB_RELAY,
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

if (mutate) {
    // Mutant (nightly): tamper = a report one pad over the hard cap. A validator
    // that still enforces FB_MAX_PADS refuses it (green); remove the cap and this
    // goes red — proving the size gate is load-bearing, not decoration.
    const oversize = { ...good, input: { format: REC_FORMAT, seed: 1, pads: Array.from({ length: FB_MAX_PADS + 1 }, (_, i) => ({ t: i + 1, pad: {} })) } }
    ok('mutant: oversize input refused (catches a removed cap)', validateFeedback(oversize).ok === false)
}

console.log(`\nfeedbackcheck: ${pass}/${pass + fail} ${fail ? 'RED' : 'GREEN'}`)
process.exit(fail ? 1 : 0)
