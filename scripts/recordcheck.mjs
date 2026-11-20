// RECORDCHECK (#1711) — PLAICRAFT S1 proof, plain Node: consent rules, the
// store contract, upload/list round-trips, replay verification of an uploaded
// file, and the voice-clock alignment bound (±50 ms) — the issue's acceptance
// lines that can be proven without Jon's phone (the clap test is the browser
// twin of the alignment section).
//
//   npm run recordcheck            # green
//   npm run recordcheck -- --mutate   # RED by design: the store's door-guard
//       is bypassed and an unconsented voice upload lands — proving the
//       refusal is load-bearing (the shipped path keeps refusing).
//   Two planted mutants: the taxonomy flip (permanent->keep) and, #1711
//   audit 1, the per-name consent predicate replaced by a shared flag.
//   Hand-mutant proof: delete the `if (!c.motion)` line in src/utils/
//   consent.js#uploadAllowed -> this script goes red at the consent gates.
//
// The stub store implements relay/core.js's real envelope validation against an
// in-memory bucket, so the client is graded against the same rules the worker
// enforces — contract shared, not duplicated.

import http from 'node:http'
import { validate, verifyRecording, createRecorder, REC_FORMAT, REC_FORMAT_V2 } from '../src/utils/recording.js'
import { createVoiceClock, tickToMs } from '../src/utils/voice.js'
import { loadConsent, grantConsent, revokeConsent, consentFor, uploadAllowed, CONSENT_LS_KEY, CONSENT_GRACE_MS, ANON_ID } from '../src/utils/consent.js'
import { playerId, loadLastPlayer, rememberPlayer, planGate, canGrant } from '../src/utils/player.js'
import { validateSessionEnvelope, sessionKey, sessionMeta, sessionRow } from '../relay/core.js'
import { uploadSession, listSessions, fetchSession, probeStore, storeFromQuery, tickSeconds } from '../src/utils/sessionStore.js'
import { planRun, decideMerge } from '../src/utils/autoRecordCore.js'
import { armLiveCapture, autoStart, autoStop, recordLiveTick, isRecording } from '../src/utils/gameContract.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { planAdd, planDrain, classifyFailure, OUTBOX_MAX_ITEMS } from '../src/utils/outboxCore.js'
import { badgeView, BADGE_HOLD_UPLOADED_MS, BADGE_HOLD_SYNCED_MS } from '../src/utils/syncBadgeCore.js'
import { coachView, COACH_TEXT, COACH_HOLD_MS, coachState, coachArmAfterTake, liveClapWatch, COACH_SHOWN, COACH_LEARNED } from '../src/utils/clapCoachCore.js'
import { makeOutbox, setOutboxFactory, queueRun, drain as drainOutbox, dropEntry } from '../src/utils/outbox.js'
import { plantNew, pull } from './lib/mutateguard.mjs' // #1359: SIGTERM mid-mutant must not leave the dotfile corpse in src/utils

const MUTATE = process.argv.includes('--mutate')

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// --- pure consent model ------------------------------------------------------
const memStore = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}
{
    const s = memStore()
    ok(Object.keys(loadConsent(s)).length === 0, 'fresh device: nobody consented')
    grantConsent(s, 'jon', { motion: true, voice: false })
    ok(consentFor(s, 'jon').motion === true && consentFor(s, 'jon').voice === false, 'motion grant, voice stays its own switch')
    grantConsent(s, 'jon', { voice: true })
    ok(consentFor(s, 'jon').motion === true && consentFor(s, 'jon').voice === true, 're-granting voice keeps the earlier motion grant')
    grantConsent(s, 'kid', { motion: true, voice: true })
    ok(consentFor(s, 'kid').motion && consentFor(s, 'jon').motion, 'consent is per player')
    revokeConsent(s, 'jon')
    ok(!consentFor(s, 'jon').motion && !consentFor(s, 'jon').voice, 'revoke takes everything back')
    ok(consentFor(s, 'kid').motion, 'revoke is per player too')
    const raw = JSON.parse(s.getItem(CONSENT_LS_KEY))
    ok(typeof raw.kid.at === 'number' && raw.kid.at > 0, 'grants are timestamped for the audit trail')
    const old = consentFor(s, 'kid', { now: Date.now() + CONSENT_GRACE_MS + 1 })
    ok(!old.motion && !old.voice && !!old.expired, 'a 90-day-quiet grant expires and re-asks')
}

// --- uploadAllowed: the client gate ------------------------------------------
const mkRec = (v2 = false, n = 200) => {
    const slots = Array.from({ length: 2 }, () => ({ source: { kind: 'human' }, pads: [], raw: [], ping: [] }))
    // hashes are computed WITH the synthetic sim in the replay section below:
    // h = (h*131 + padbits) % 1e9+7 from seed*31 — replay-verify must PASS
    // against that sim, so the checkpoints have to come from the same math.
    const hashes = []
    let h = (7 * 31) % 1000000007
    for (let i = 0; i < n; i++) {
        const right = i % 10 < 5
        slots[0].pads.push(right ? { right: true } : {})
        slots[1].pads.push({})
        slots[0].raw.push({ x: right ? 0.7 : 0 })
        slots[1].raw.push({})
        h = (h * 131 + (right ? 1 : 0)) % 1000000007
        const t = i + 1
        if (t % 60 === 0) hashes.push({ t, h })
    }
    if (!hashes.length || hashes[hashes.length - 1].t !== n) hashes.push({ t: n, h })
    const rec = { format: REC_FORMAT, build: 'testbuild', game: 'gauntlet', method: 'dpad', seed: 7, players: 2, ticks: n, hashEvery: 60, slots, hashes }
    if (v2) {
        rec.format = REC_FORMAT_V2
        rec.voice = { tracks: [{ slots: [0], consent: true, headset: false, mime: 'audio/webm;codecs=opus', ms: Math.round(n * 16.67), clock: [{ t: 1, ms: 0 }, { t: n, ms: Math.round(n * 16.67) }], b64: 'QUJD' }] }
        rec.voiceCmd = [{ t: 12, said: 'left', intent: 'left', ok: true }]
    }
    return rec
}
{
    const motion = { motion: true, voice: false, at: 1 }
    const both = { motion: true, voice: true, at: 1 }
    ok(uploadAllowed(mkRec(false), motion).ok === true, 'v1 uploads with motion consent')
    ok(uploadAllowed(mkRec(true), motion).strips.join(',') === 'voice,voiceCmd', 'voice denied -> voice AND voiceCmd strip off')
    ok(uploadAllowed(mkRec(true), both).strips.length === 0, 'voice granted -> nothing strips')
    ok(uploadAllowed(mkRec(false), { motion: false }).ok === false, 'no motion consent -> no upload')
    ok(uploadAllowed(null, both).ok === false, 'garbage in -> refused')
}

// --- identity: consent keys to a NAME, not the device (#1711 audit 1) ------
{
    // normalization: the id is what consent, takes and uploads all share.
    ok(playerId('  Jon  ') === 'jon' && playerId('A  B') === 'a b', 'names normalize: trim, collapse, lowercase')
    ok(playerId('ann.o@x-1') === 'ann.o@x-1', 'safe charset survives')
    ok(playerId('   ') === null && playerId('!!!') === null && playerId(null) === null && playerId(undefined) === null, 'no identifiable name -> null (a save needs a WHO)')
    ok(playerId('x'.repeat(100)).length === 64, 'name clipped to the envelope bound (64)')
    ok(canGrant('jon') === true && canGrant(ANON_ID) === false && canGrant(null) === false, 'anon declines; named ids grant')

    const s = memStore()
    const anonTry = grantConsent(s, ANON_ID, { motion: true, voice: true })
    ok(!anonTry.motion && !anonTry.voice && consentFor(s, ANON_ID).motion === false, 'a GRANT under anon is refused — nothing uploads for an id nobody owns')
    grantConsent(s, ANON_ID, { motion: false, voice: false })
    ok(consentFor(s, ANON_ID).at > 0, 'an unnamed NO THANKS is stored under anon (the gate stops nagging; nothing more)')

    // legacy device-wide grant is inert: a device that once said yes under
    // 'player' (no name, no owner) is re-asked now that WHO is required.
    const legacy = memStore()
    legacy.setItem(CONSENT_LS_KEY, JSON.stringify({ player: { motion: true, voice: true, at: Date.now() } }))
    const gp = planGate({ probe: { ok: true, sessions: true }, lastPlayer: null, consentForId: (id) => consentFor(legacy, id) })
    ok(gp.ask === true, "the legacy 'player' grant re-asks: consent is not transferable to a named player")

    // gate planning
    const ON = { ok: true, sessions: true }
    const OFF = { ok: false, sessions: false }
    ok(planGate({ probe: OFF, lastPlayer: { id: 'jon', name: 'Jon' }, consentForId: () => null }).ask === false, 'store off: nobody is asked (no dead buttons)')
    const dev = memStore()
    grantConsent(dev, 'jon', { motion: true, voice: false })
    ok(planGate({ probe: ON, lastPlayer: { id: 'jon', name: 'Jon' }, consentForId: (id) => consentFor(dev, id) }).ask === false, 'named + decided: zero added friction')
    ok(planGate({ probe: ON, lastPlayer: null, consentForId: (id) => consentFor(dev, id) }).ask === true, 'no name known -> the gate goes up (WHO is required to record)')
    grantConsent(dev, ANON_ID, { motion: false, voice: false })
    ok(planGate({ probe: ON, lastPlayer: null, consentForId: (id) => consentFor(dev, id) }).ask === false, 'anon DECLINED stays silent — declining needs no identity')

    // last-used name: prefill plumbing only
    const d2 = memStore()
    ok(rememberPlayer(d2, ' Mia ') && loadLastPlayer(d2).id === 'mia' && loadLastPlayer(d2).name === 'Mia', 'last-used name remembered, id normalized, display kept')
    ok(rememberPlayer(d2, 'anon') === null && loadLastPlayer(d2).id === 'mia', 'anon is never a prefill name')
    ok(loadLastPlayer(null) === null && rememberPlayer(null, 'jon') === null, 'no storage: honest no-op')
}

// --- S2 plan rules: when do we ask, when do we record (#1711) --------------
{
    const OFF = { ok: false, sessions: false }
    const ON = { ok: true, sessions: true }
    const UNDECIDED = { motion: false, voice: false, at: 0 }
    ok(planRun(OFF, UNDECIDED).reason === 'store-off' && !planRun(OFF, { motion: true, at: 1 }).record, 'store not provisioned: never asked, never recorded (no dead buttons, #737)')
    const ask = planRun(ON, UNDECIDED)
    ok(ask.ask === true && ask.record === false, 'decided-pending: the gate goes up BEFORE seed-birth')
    ok(planRun(ON, { motion: true, voice: false, at: 5 }).record === true, 'motion granted -> the run records')
    ok(planRun(ON, { motion: false, voice: false, at: 5 }).record === false, 'declined -> play on, nothing records')
    ok(planRun(ON, { motion: false, at: 5, expired: true }).ask === true, 'a 90-day-quiet decision re-asks')
    const m = decideMerge({ motion: true, voice: false }, { voice: true })
    ok(m.motion === true && m.voice === true, 'a partial answer never silently revokes the other channel')
    const m2 = decideMerge({ motion: true, voice: true }, { motion: false, voice: false })
    ok(!m2.motion && !m2.voice, 'a full NO at a re-ask takes both back')
}

// --- envelope rules (the worker's own door-guard) ---------------------------
{
    const env = (rec, player, consent) => ({ recording: rec, player, consent })
    ok(validateSessionEnvelope(env(mkRec(false), 'jon', { motion: true })).ok === true, 'envelope: motion-only upload accepted')
    ok(validateSessionEnvelope(env(mkRec(true), 'jon', { motion: true, voice: true })).ok === true, 'envelope: voice upload accepted')
    ok(validateSessionEnvelope(env(mkRec(true), 'jon', { motion: true })).err === 'voice section without voice consent', 'envelope: voice without voice consent refused')
    ok(validateSessionEnvelope(env(mkRec(false), 'jon', { motion: false })).err === 'consent.motion required', 'envelope: unconsented refused')
    ok(validateSessionEnvelope(env(mkRec(false), '', { motion: true })).ok === false, 'envelope: player label required')
    const badGame = { ...mkRec(false), game: 'Nope/../x' }
    ok(validateSessionEnvelope(env(badGame, 'jon', { motion: true })).ok === false, 'envelope: game id kept path-safe')
    const k = sessionKey(mkRec(false), '2026-11-06T12:00:00.000Z', 'deadbeefcafe1234')
    ok(k === 'gauntlet/2026-11-06-seed7-deadbeefca.json', `key shape: ${k}`)
    ok(/^[a-z0-9][a-z0-9-]{0,40}\/[0-9-]{10}-seed\d+-[a-f0-9]{10}\.json$/.test(k), 'key passes the worker GET-route regex')
    const meta = sessionMeta(mkRec(true), 'jon')
    ok(meta.audio === '1' && meta.game === 'gauntlet' && meta.ticks === '200', 'listing metadata comes from the file, not the caller')
    ok(sessionRow(k, { ...meta, uploadedAt: 'x' }, '').audio === true, 'row: audio flag from metadata')
}

// --- stub store: same core rules, in-memory bucket ---------------------------
const bucket = new Map()
let putCount = 0
const server = http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    const url = new URL(req.url, 'http://x')
    if (req.method === 'GET' && url.pathname === '/status') return send(200, { ok: true, service: 'stub', sessions: bucket !== null })
    if (req.method === 'POST' && url.pathname === '/sessions') {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
            let env
            try { env = JSON.parse(body) } catch { return send(400, { ok: false, err: 'bad json' }) }
            if (!MUTATE) {
                const v = validateSessionEnvelope(env)
                if (!v.ok) return send(400, { ok: false, err: v.err })
            }
            putCount++
            const stamp = new Date().toISOString()
            const key = sessionKey(env.recording, stamp, crypto.randomUUID().replace(/-/g, ''))
            bucket.set(key, { text: JSON.stringify(env.recording), meta: { ...sessionMeta(env.recording, env.player), uploadedAt: stamp } })
            return send(200, { ok: true, key })
        })
        return
    }
    if (req.method === 'GET' && url.pathname === '/sessions') {
        const rows = [...bucket.entries()].map(([key, v]) => sessionRow(key, v.meta))
        return send(200, { ok: true, sessions: rows })
    }
    if (req.method === 'GET' && url.pathname.startsWith('/sessions/')) {
        const v = bucket.get(decodeURIComponent(url.pathname.slice('/sessions/'.length)))
        if (!v) return send(404, { ok: false, err: 'not found' })
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(v.text)
    }
    send(404, { ok: false, err: 'no route' })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`
const bucketRowBySeed = (seed) => {
    for (const v of bucket.values()) if (Number(v.meta.seed) === seed) return v.meta.player
    return null
}

// --- upload round-trips --------------------------------------------------------
{
    const st = memStore()
    const probe = await probeStore(BASE)
    ok(probe.ok && probe.sessions === true, 'capability probe sees the store (workers keep it false until the bucket binds)')

    // counting fetch: the no-consent path must make ZERO network calls.
    let fetches = 0
    const counting = (...a) => { fetches++; return globalThis.fetch(...a) }
    grantConsent(st, 'jon', { motion: true, voice: false })
    const denied = await uploadSession(mkRec(true), { player: 'jon', consent: consentFor(st, 'jon'), base: BASE, fetchImpl: counting })
    ok(denied.uploaded === true && fetches === 1, 'voice-denied run still uploads its motion half', JSON.stringify(denied))
    const deniedKey = denied.key
    const storedDenied = deniedKey ? JSON.parse(bucket.get(deniedKey).text) : null
    ok(storedDenied && storedDenied.voice === undefined && storedDenied.voiceCmd === undefined && storedDenied.format === REC_FORMAT, 'stripped upload lands as an honest v1 (no audio, no words)', storedDenied ? storedDenied.format : 'missing')

    fetches = 0
    const nope = await uploadSession(mkRec(false), { player: 'jon', consent: { motion: false, voice: false, at: 0 }, base: BASE, fetchImpl: counting })
    ok(nope.uploaded === false && fetches === 0, 'motion refusal touches the network ZERO times')
    ok(nope.reason === 'no motion consent', `refusal reason: ${nope.reason}`)

    grantConsent(st, 'jon', { motion: true, voice: true })
    const rec = mkRec(true)
    const up = await uploadSession(rec, { player: 'jon', consent: consentFor(st, 'jon'), base: BASE })
    ok(up.ok && !!up.key, 'consented v2 session uploads')
    const stored = bucket.get(up.key)
    ok(stored && stored.text === JSON.stringify(rec), 'bytes land exactly as recorded (no transcode, no drift)')
    ok(!!stored && stored.meta.audio === '1' && stored.meta.player === 'jon', 'store indexes audio + player for the listing')

    const listed = await listSessions({ base: BASE })
    ok(listed.ok && listed.sessions.length >= 2, 'admin listing sees the uploads')
    const row = listed.sessions.find((s) => s.key === up.key)
    ok(row && row.game === 'gauntlet' && row.seed === 7 && row.ticks === 200 && row.audio === true, 'row shows game/seed/length/audio')
    ok(listed.sessions.some((s) => s.audio === false), 'motion-only runs list as audio:no')
    ok(tickSeconds(200) === 3.3, 'tick->seconds rounding sensible for the admin table')

    const back = await (await fetch(`${BASE}/sessions/${encodeURI(up.key)}`)).json()
    ok(JSON.stringify(back) === JSON.stringify(rec), 'GET the key back byte-identical')

    // #2805 (#1712 follow-up): pin the proven single-read client the dataset
    // builder rides — key escaping, lockdown header, honest failure shapes.
    const back2 = await fetchSession(up.key, { base: BASE })
    ok(back2.ok && JSON.stringify(back2.recording) === JSON.stringify(rec), 'fetchSession GETs the key back verbatim (#2805)')
    let lastUrl = ''
    let lastHdr = null
    const spy = (url, init) => {
        lastUrl = String(url)
        lastHdr = init && init.headers ? init.headers['x-session-key'] : null
        return globalThis.fetch(url, init)
    }
    await fetchSession('weird/key with spaces&x', { base: BASE, key: 'sekret', fetchImpl: spy })
    ok(lastUrl.endsWith(`/sessions/${encodeURIComponent('weird/key with spaces&x')}`), 'fetchSession escapes the key once, correctly', lastUrl)
    ok(lastHdr === 'sekret', 'fetchSession rides the read-lockdown header — keys ride opts, never hardcode (#1711 S8)')
    const gone = await fetchSession('no/such/key', { base: BASE, fetchImpl: spy })
    ok(gone.ok === false && typeof gone.reason === 'string' && gone.reason.length > 0, 'missing key answers ok:false with the store reason verbatim', gone.reason)
    const down = await fetchSession('k', { base: BASE, fetchImpl: () => { throw new Error('socket closed') } })
    ok(down.ok === false && /unreachable/.test(down.reason), 'unreachable store answers honestly', down.reason)

    // Replay-verify the STORED file against a deterministic synthetic sim:
    // acceptance line "100% of them replay-verify against the sim", structural.
    const sim = { seed: 0, tick: 0, h: 0 }
    const driver = {
        reset(seed) { sim.seed = seed; sim.tick = 0; sim.h = seed * 31 },
        step(pads) {
            sim.tick++
            // ONE multiply per tick — mkRec's hash math, verbatim.
            let bits = 0
            for (const p of pads) bits += (p.right ? 1 : 0) + (p.left ? 2 : 0) + (p.up ? 3 : 0) + (p.down ? 4 : 0)
            sim.h = (sim.h * 131 + bits) % 1000000007
        },
        state() { return { tick: sim.tick, hash: sim.h } },
    }
    const ver = verifyRecording(JSON.parse(stored.text), driver)
    ok(ver.ok && ver.ticks === rec.ticks, 'uploaded file replay-verifies against the sim')

    // server-side door stays shut even against a hand-crafted envelope:
    const sneak = await fetch(`${BASE}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recording: mkRec(true), player: 'mallory', consent: { motion: true } }) })
    ok(sneak.status === 400, 'server refuses voice-without-voice-consent even if a client is broken')
    const sneak2 = await fetch(`${BASE}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recording: mkRec(false), player: 'mallory', consent: {} }) })
    ok(sneak2.status === 400, 'server refuses an envelope with no motion consent')

    // #1711 audit 1 — the client's no-fallback door: no valid named player,
    // zero fetch. The fixed label 'player' is gone from the client.
    fetches = 0
    const unnamed = await uploadSession(mkRec(false), { consent: { motion: true, voice: false, at: 1 }, base: BASE, fetchImpl: counting })
    ok(unnamed.uploaded === false && fetches === 0 && unnamed.reason === 'named player required', 'no player name -> no fetch at all')
    const badname = await uploadSession(mkRec(false), { player: '   ', consent: { motion: true, at: 1 }, base: BASE, fetchImpl: counting })
    ok(badname.uploaded === false && fetches === 0, 'a name that normalizes to nothing is refused too')
    const stamped = mkRec(false)
    stamped.player = 'mia'
    const stampedUp = await uploadSession(stamped, { consent: { motion: true, at: 1 }, base: BASE })
    ok(stampedUp.uploaded && bucket.get(stampedUp.key).meta.player === 'mia', 'the take\u2019s own seed-birth stamp labels the upload with no opts.player')
    const normUp = await uploadSession(mkRec(false), { player: '  Bo ', consent: { motion: true, at: 1 }, base: BASE })
    ok(normUp.uploaded && bucket.get(normUp.key).meta.player === 'bo', 'the envelope carries the normalized id')
    const legacyDoor = await fetch(`${BASE}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recording: mkRec(false), player: 'player', consent: { motion: true } }) })
    ok(legacyDoor.status === 200, 'server stays lenient by design (cached old bundles keep working) — the client door is what ends new anonymous takes')
}

// --- S2 auto-capture: arm -> autoStart -> live bank -> autoStop -> upload ---
// The same production path a consented phone run drives (gameContract
// armLiveCapture/autoStart/autoStop + the recordLiveTick funnel), driven here
// against a fake spec whose hash math matches the synthetic sim above — so the
// auto-captured file must replay-verify AND upload through the real gate.
{
    const sim = { seed: 0, tick: 0, h: 0 }
    const advance = (pads) => {
        sim.tick++
        let bits = 0
        for (const p of pads) bits += (p.right ? 1 : 0) + (p.left ? 2 : 0) + (p.up ? 3 : 0) + (p.down ? 4 : 0)
        sim.h = (sim.h * 131 + bits) % 1000000007
    }
    const fakeSpec = {
        id: 'gauntlet',
        method: 'dpad',
        players: 2,
        sources: () => [{ kind: 'human' }, { kind: 'cpu' }],
        state: () => ({ seed: sim.seed, hash: sim.h }),
    }
    ok(armLiveCapture(fakeSpec) === true, 'armLiveCapture arms the production live feed')
    ok(!isRecording() && autoStop() === null, 'idle: autoStop returns nothing (no phantom file)')
    sim.seed = 7; sim.tick = 0; sim.h = 7 * 31
    ok(autoStart({ voiceConsent: false, player: 'jon' }) === true, 'autoStart opens the recorder at seed-birth')
    ok(isRecording(), 'the recorder is live while the human plays')
    for (let t = 1; t <= 120; t++) {
        const pads = [{ right: t % 10 < 5 }, {}]
        advance(pads)
        recordLiveTick(pads)
    }
    const out = autoStop()
    ok(out && out.rec && out.flush === null, 'autoStop returns the finished take (voice off -> no flush wait)')
    ok(!isRecording(), 'the recorder closes with the run')
    const rec = out.rec
    ok(validate(rec) === null, `auto-captured file validates (${validate(rec) || 'clean'})`, validate(rec) || '')
    ok(rec.format === REC_FORMAT && rec.voice === undefined, 'voice ungranted -> an honest v1 file')
    ok(rec.ticks === 120 && rec.seed === 7 && rec.game === 'gauntlet', 'seed + length + game stamped from the run')
    ok(rec.player === 'jon', '#1711 audit 1: autoStart stamps the consenting id into the take at seed-birth')
    ok(rec.slots[0].source.kind === 'human' && rec.slots[1].source.kind === 'cpu', 'seat labels come from the game at stop time')
    const ver2 = verifyRecording(rec, { reset: (seed) => { sim.seed = seed; sim.tick = 0; sim.h = seed * 31 }, step: advance, state: () => ({ tick: sim.tick, hash: sim.h }) })
    ok(ver2.ok && ver2.ticks === 120, 'the auto-captured file replay-verifies tick-for-tick')
    // the consented upload of an auto-captured run:
    const st2 = memStore()
    grantConsent(st2, 'jon', { motion: true, voice: false })
    const up2 = await uploadSession(rec, { player: 'jon', consent: consentFor(st2, 'jon'), base: BASE })
    ok(up2.ok && !!up2.key, 'a consented auto-capture uploads to the store')
    ok(bucket.get(up2.key).text === JSON.stringify(rec), 'auto-capture bytes land unmodified')
    // mid-run revoke: consent dies at the store door, zero bytes
    revokeConsent(st2, 'jon')
    const revoked = await uploadSession(rec, { player: 'jon', consent: consentFor(st2, 'jon'), base: BASE })
    ok(revoked.uploaded === false && revoked.reason === 'no motion consent', 'a mid-run revoke stops the upload at the last moment')
}

// --- the take carries WHO (#1711 audit 1) ------------------------------------
// The consent evidence belongs IN the file, not only in the envelope: an
// exported take still says which human it came from. Additive: v1 files
// without the stamp stay valid, readers that don't know it ignore it.
{
    const r = createRecorder({ gameId: 'gauntlet', method: 'dpad', seed: 7, players: 1, build: 'test', hashEvery: 30, player: 'jon' })
    for (let t = 1; t <= 60; t++) r.addTick([{ right: true }], null, t % 30 === 0 ? 1000 + t : null)
    const rec = r.finish()
    ok(rec.player === 'jon', 'recorder stamps the consenting player id into the take')
    ok(validate(rec) === null, 'stamped files validate (additive field; old readers ignore it)')
    const r2 = createRecorder({ gameId: 'gauntlet', method: 'dpad', seed: 7, players: 1, build: 'test', hashEvery: 30 })
    for (let t = 1; t <= 60; t++) r2.addTick([{}], null, t % 30 === 0 ? 1 : null)
    const rec2 = r2.finish()
    ok(rec2.player === undefined && validate(rec2) === null, 'files without the stamp stay valid v1 (old takes untouched)')
    const badP = (p) => { const x = mkRec(false); x.player = p; return validate(x) }
    ok(badP('') !== null && badP(42) !== null && badP('x'.repeat(65)) !== null, 'validate rejects bad player stamps (empty, non-string, >64)')
    let threw = false
    try { createRecorder({ gameId: 'gauntlet', method: 'dpad', seed: 7, player: 'x'.repeat(65) }) } catch { threw = true }
    ok(threw, 'recorder refuses an over-long player at birth, not at finish')
}

// --- #2058: an auto-captured run stamps seat 0 human whatever the spec claims --
// Gauntlet's armed spec says seat 0 is `model` — true for contract steps, a
// LIE for a phone thumb — and humanSeats came back 0 on every iPhone take,
// starving the S3 training set of its human labels. autoStart is only ever
// reached through autoRecord.beginRun, which only fires at human-start sites
// with stored motion consent; so seat 0 IS the human there, structurally.
{
    const sim = { seed: 0, tick: 0, h: 0 }
    const advance = (pads) => {
        sim.tick++
        let bits = 0
        for (const p of pads) bits += (p.right ? 1 : 0) + (p.left ? 2 : 0)
        sim.h = (sim.h * 131 + bits) % 1000000007
    }
    ok(armLiveCapture({ id: 'gauntlet', method: 'dpad', players: 2, sources: () => [{ kind: 'model' }, { kind: 'cpu' }], state: () => ({ seed: sim.seed, hash: sim.h }) }) === true, 're-arm: spec claims seat 0 model (the contract truth)')
    sim.seed = 9; sim.h = 9 * 31
    ok(autoStart({ voiceConsent: false }) === true, 'autoStart #2 opens for the consented human run')
    for (let t = 1; t <= 60; t++) { const pads = [{ left: t % 8 < 4 }, {}]; advance(pads); recordLiveTick(pads) }
    const outA = autoStop()
    ok(outA.rec.slots[0].source.kind === 'human', '#2058: seat 0 lands human whatever the spec claimed', JSON.stringify(outA.rec.slots.map((s) => s.source)))
    ok(outA.rec.slots[1].source.kind === 'cpu', '#2058: the other seats keep what the game reports')
    ok(armLiveCapture({ id: 'gauntlet', method: 'dpad', players: 2, sources: () => [{ kind: 'model' }, { kind: 'cpu' }], state: () => ({ seed: sim.seed, hash: sim.h }) }) === true, 're-arm: watch-seat style spec')
    sim.seed = 10; sim.h = 10 * 31
    ok(autoStart({ voiceConsent: false, humanSeats: false }) === true, 'autoStart #2b: the honest-lobby opt-out opens')
    for (let t = 1; t <= 60; t++) { const pads = [{ left: t % 8 < 4 }, {}]; advance(pads); recordLiveTick(pads) }
    const outW = autoStop()
    ok(outW.rec.slots[0].source.kind === 'model', '#2058: humanSeats:false opts the stamp out — Rally\'s watch seat stays model', JSON.stringify(outW.rec.slots.map((s) => s.source)))
    ok(armLiveCapture({ id: 'gauntlet', method: 'dpad', players: 2, state: () => ({ seed: sim.seed, hash: sim.h }) }) === true, 're-arm: spec with no sources at all')
    sim.seed = 11; sim.h = 11 * 31
    ok(autoStart({ voiceConsent: false }) === true, 'autoStart #3 opens')
    for (let t = 1; t <= 60; t++) { const pads = [{ right: t % 6 < 3 }, {}]; advance(pads); recordLiveTick(pads) }
    const outB = autoStop()
    ok(outB.rec.slots[0].source.kind === 'human' && outB.rec.slots[1].source.kind === 'model', '#2058: no-sources spec -> human seat 0 + the recorder model default beyond it', JSON.stringify(outB.rec.slots.map((s) => s.source)))
}

// --- alignment bound: the clap proof (Node twin) ------------------------------
// A clap is one spike: mic-open (tick 1, ms 0) is the t0 anchor; every later
// tick must sit within ±50 ms of where the clock trace interpolates it —
// even on a box that throttles the world to half speed for half the session.
{
    const TICK_MS = 1000 / 60
    const throttled = []
    let vt = 0
    const clock = createVoiceClock({ now: () => vt })
    clock.markStart()
    for (let t = 1; t <= 108000; t++) { // 30 minutes of world
        vt += t > 54000 ? TICK_MS * 1.8 : TICK_MS // late-half box: 1.8x per tick
        clock.onTick(t)
        if (t % 600 === 0) throttled.push({ t, truth: vt })
    }
    clock.finish()
    const samples = clock.samples()
    ok(samples.length > 1000, `clock sampled all 30 minutes (${samples.length} samples)`)
    let worst = 0
    for (const { t, truth } of throttled) {
        const got = tickToMs(samples, t)
        worst = Math.max(worst, Math.abs(got - truth))
    }
    ok(worst <= 50, `clap alignment inside ±50 ms across 30 min + throttle (worst ${worst.toFixed(1)} ms)`)
}

// --- #2247: the trace rides the audio pipeline's OWN clock, not the wall ----
// Load physics measured on saturated boxes (#2136 residual b): the delivered-
// samples clock and the main thread pace apart (starvation spikes ~55 ms)
// while the recorded bytes stay rock-stable. A wall-stamped trace therefore
// sits ~55 ms off the byte line mid-session; a content-stamped one agrees by
// construction. This gate drives the REAL createVoiceSession against a mock
// browser whose AudioContext.currentTime is a starving pipeline clock while
// `now()` runs freely — the trace must follow the pipeline.
// Hand mutant: in src/utils/voiceCapture.js change the hybrid gate to
// `if (clockCtx && false)` -> SAMPLES RED (stamps fall back to wall, ~55 ms
// off bytes) and FALLBACK stays green — the fallback half proves the guard.
{
    const TICK_MS = 1000 / 60
    const STARVE = 55 // first starvation spike, ms (the #2136 load-physics term)
    const STARVE2 = 25 // a second, smaller spike mid-take
    const MOCK = { wall: 0 }
    const pipelineAt = (w) => w - (w >= 2000 ? STARVE : 0) - (w >= 8000 ? STARVE2 : 0)
    const pipeline = () => pipelineAt(MOCK.wall)
    const el = () => ({ style: { cssText: '', background: '', boxShadow: '', width: '' }, setAttribute() {}, remove() {}, appendChild() {}, querySelector: () => el(), innerHTML: '', isConnected: true })
    class FakeCtx {
        constructor() { this.zero = pipeline(); this.state = 'running' }
        get currentTime() { return (pipeline() - this.zero) / 1000 }
        resume() { this.state = 'running'; return Promise.resolve() }
        close() { this.state = 'closed' }
        createMediaStreamSource() { return { connect() {}, disconnect() {} } }
        createAnalyser() { return { fftSize: 512, getByteTimeDomainData(b) { b.fill(128) } } }
    }
    class FakeRecorder {
        static isTypeSupported(m) { return m === 'audio/webm;codecs=opus' }
        constructor(_s, o) { this.mimeType = (o && o.mimeType) || 'audio/webm'; this.state = 'inactive'; this.ondataavailable = null; this.onstop = null }
        start() { this.state = 'recording' }
        stop() {
            this.state = 'inactive'
            if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) })
            if (this.onstop) this.onstop()
        }
    }
    const stream = { getTracks: () => [{ stop() {} }] }
    const prev = {
        window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator,
        MediaRecorder: globalThis.MediaRecorder, AudioContext: globalThis.AudioContext,
        webkitAudioContext: globalThis.webkitAudioContext,
        requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
    }
    const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
    const del = (k) => { try { delete globalThis[k] } catch { /* keep */ } if (prev[k] === undefined) put(k, prev[k]) }
    put('window', {})
    put('document', { createElement: () => el(), querySelector: () => el(), body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} })
    put('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve(stream), enumerateDevices: () => Promise.resolve([]) } })
    put('MediaRecorder', FakeRecorder)
    put('AudioContext', FakeCtx)
    put('requestAnimationFrame', () => 1)
    put('cancelAnimationFrame', () => {})
    try {
        const { createVoiceSession } = await import('../src/utils/voiceCapture.js')
        // open the take with the first starvation already spent (fake wall
        // 2000, pipeline 1945) so the anchor bias is a single frame, and
        // measure everything against BYTE TRUTH: bytes delivered since the
        // take opened = pipeline(now) - pipeline(take open).
        MOCK.wall = 2000
        const session = createVoiceSession({ ask: async () => ({ consent: true }), now: () => MOCK.wall })
        await session.ready
        ok(session.phase === 'recording', '#2247 mock take opens (voiceSupported on the mock browser)')
        const startW = MOCK.wall
        const pipe0 = pipeline()
        const bytesAt = (wall) => pipelineAt(wall) - pipe0 // honest ms into the audio
        let midMs = null
        for (let t = 1; t <= 1200; t++) { // ~20 s near-realtime tick pacing; the pipeline starves 25 ms more at wall >= 8000
            MOCK.wall += TICK_MS
            session.onTick(t)
            if (t === 400) midMs = session.msNow()
        }
        const track = await session.finalize()
        const samples = (track && track.clock) || []
        ok(samples.length >= 20, `#2247 take sampled (${samples.length} samples)`)
        let post = 0, worst = 0, worstWall = 0
        for (const s of samples) {
            const wall = startW + s.t * TICK_MS
            if (wall < 8000) continue // exercise the post-second-spike regime
            post++
            worst = Math.max(worst, Math.abs(s.ms - bytesAt(wall)))
            worstWall = Math.max(worstWall, Math.abs((wall - startW) - bytesAt(wall))) // what a WALL stamp would claim
        }
        ok(post >= 10, `post-spike regime exercised (${post} samples after the second starvation)`)
        ok(worst <= 2, `#2247 trace rides the content clock through starvation (worst byte-line error ${worst.toFixed(1)} ms)`)
        ok(worstWall >= 20, `control: wall stamps miss the byte line by ${worstWall.toFixed(0)} ms after the spike — old behavior fails the line above (this is the ±50 flake family)`)
        ok(track && Math.abs(track.ms - bytesAt(startW + 1200 * TICK_MS)) <= 2, `#2247 audio length shares the byte origin (${track && track.ms} vs ${Math.round(bytesAt(startW + 1200 * TICK_MS))})`)
        ok(midMs !== null && Math.abs(midMs - bytesAt(startW + 400 * TICK_MS)) <= 2, `msNow is content-paced mid-take (${midMs} vs byte-line ${Math.round(bytesAt(startW + 400 * TICK_MS))}, wall-stamp ${Math.round(400 * TICK_MS)})`)
        // fallback: no AudioContext in the room -> wall stamps, exactly the
        // pre-#2247 capture (old browsers keep working).
        del('AudioContext'); del('webkitAudioContext')
        MOCK.wall = 0
        const s2 = createVoiceSession({ ask: async () => ({ consent: true }), now: () => MOCK.wall })
        await s2.ready
        for (let t = 1; t <= 300; t++) { MOCK.wall += TICK_MS; s2.onTick(t) }
        const tr2 = await s2.finalize()
        const sc = (tr2 && tr2.clock) || []
        const off = sc.length ? Math.max(...sc.map((s) => Math.abs(s.ms - s.t * TICK_MS))) : Infinity
        ok(sc.length > 3 && off <= 2, `no AudioContext -> wall-stamped fallback preserved (${sc.length} samples, max offset ${off === Infinity ? 'n/a' : off.toFixed(1)} ms)`)
    } finally {
        for (const k of ['window', 'document', 'navigator', 'MediaRecorder', 'AudioContext', 'webkitAudioContext', 'requestAnimationFrame', 'cancelAnimationFrame']) {
            if (prev[k] === undefined) del(k); else put(k, prev[k])
        }
    }
}

// --- #1711 S1: the content clock that FREEZES (Jon's seed4 take shape) ----------
// iOS/Android can stall the capture context's currentTime while still reporting
// state 'running' (screen-lock / audio interruption): bytes stopped at 816 ms
// and the content-paced trace froze with them — clock stamps advanced in t but
// every ms after tick ~126 stayed 816, and the take LOOKED internally sound
// (track ms == clock end ms) while 99 s of play had no audio behind it. The
// capture must notice a device clock that stops dead, keep the trace on the
// wall for the rest of the take, and leave the short bytes to fail grading
// HONESTLY (audioLonger false naming the gap) instead of hiding inside a
// frozen pair. Hand mutant: delete the freeze branch in hybridNow
// (src/utils/voiceCapture.js, `contentBurned = true`) -> the trace freezes
// again, the paced-pace and stall lines go RED while the #2247 block above
// stays green (only the freeze scenario sees it).
{
    const TICK_MS = 1000 / 60
    const FREEZE_AT = 5000 // the pipe dies 5 s into the take (wall)
    const MOCK = { wall: 0 }
    const el = () => ({ style: { cssText: '', background: '', boxShadow: '', width: '' }, setAttribute() {}, remove() {}, appendChild() {}, querySelector: () => el(), innerHTML: '', isConnected: true })
    class FrozenCtx {
        constructor() { this.state = 'running'; this.resumeCalls = 0 }
        // currentTime advances normally, then dies mid-take at a fixed value
        get currentTime() { return Math.min(MOCK.wall, FREEZE_AT) / 1000 }
        resume() { this.resumeCalls++; return Promise.resolve() }
        close() { this.state = 'closed' }
        createMediaStreamSource() { return { connect() {}, disconnect() {} } }
        createAnalyser() { return { fftSize: 512, getByteTimeDomainData(b) { b.fill(128) } } }
    }
    let CTX = null
    class SpyCtx extends FrozenCtx { constructor() { super(); CTX = this } }
    class FakeRecorder {
        static isTypeSupported(m) { return m === 'audio/webm;codecs=opus' }
        constructor(_s, o) { this.mimeType = (o && o.mimeType) || 'audio/webm'; this.state = 'inactive'; this.ondataavailable = null; this.onstop = null }
        start() { this.state = 'recording' }
        stop() {
            this.state = 'inactive'
            // honest dead bytes: what the pipe produced up to FREEZE_AT (a
            // handful of bytes stands in for ~5 s of opus — the take's declared
            // ms is what the guard is judged on, not this blob size).
            if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) })
            if (this.onstop) this.onstop()
        }
    }
    const trackObj = { stop() {}, onended: null, onmute: null, onunmute: null }
    const stream = { getTracks: () => [trackObj] }
    const prev = {
        window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator,
        MediaRecorder: globalThis.MediaRecorder, AudioContext: globalThis.AudioContext,
        webkitAudioContext: globalThis.webkitAudioContext,
        requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
    }
    const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
    const del = (k) => { try { delete globalThis[k] } catch { /* keep */ } if (prev[k] === undefined) put(k, prev[k]) }
    put('window', {})
    put('document', { createElement: () => el(), querySelector: () => el(), body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} })
    put('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve(stream), enumerateDevices: () => Promise.resolve([]) } })
    put('MediaRecorder', FakeRecorder)
    put('AudioContext', SpyCtx)
    put('requestAnimationFrame', () => 1)
    put('cancelAnimationFrame', () => {})
    try {
        const { createVoiceSession } = await import('../src/utils/voiceCapture.js')
        MOCK.wall = 0
        const session = createVoiceSession({ ask: async () => ({ consent: true }), now: () => MOCK.wall })
        await session.ready
        ok(session.phase === 'recording', '#1711 S1 frozen-pipeline mock take opens')
        let sawFreeze = false
        for (let t = 1; t <= 3600; t++) { MOCK.wall += TICK_MS; session.onTick(t); if (globalThis.window.__voiceDebug && globalThis.window.__voiceDebug.where === 'content-clock-frozen') sawFreeze = true } // 60 s of world, pipe dead after 5 s
        const tr = await session.finalize()
        const clk = (tr && tr.clock) || []
        ok(clk.length >= 30, `#1711 S1 take sampled across the freeze (${clk.length} samples)`)
        // 1) no frozen run: consecutive samples keep advancing after the pipe died
        let frozenRun = 0, maxFrozenRun = 0
        for (let i = 1; i < clk.length; i++) { if (clk[i].ms === clk[i - 1].ms) { frozenRun++; maxFrozenRun = Math.max(maxFrozenRun, frozenRun) } else frozenRun = 0 }
        ok(maxFrozenRun <= 1, `trace never freezes again (longest same-ms run ${maxFrozenRun}; seed4 shipped 100+)`)
        // 2) ms-space stall (the #2430 grader metric): the trace keeps wall pace
        const stallMs = clk.length >= 2 ? Math.round((clk[clk.length - 1].t - clk[0].t) * TICK_MS - (clk[clk.length - 1].ms - clk[0].ms)) : 0
        ok(Math.abs(stallMs) <= 1500, `post-freeze trace keeps honest pace (stall ${stallMs} ms vs the 8000 ms grader bound)`)
        // 3) honest length: declared ms reaches the END of the take, far past
        //    the dead pipe — the short bytes then fail audioLonger loudly.
        ok(tr && tr.ms > FREEZE_AT + 40000, `settle ms names the whole take (${tr && tr.ms} > freeze ${FREEZE_AT} + 40000) — bytes-vs-clock gap is visible, not hidden`)
        ok(CTX && CTX.resumeCalls >= 1, `the frozen context was asked to resume (${CTX && CTX.resumeCalls} calls)`)
        ok(sawFreeze, 'the freeze is named in __voiceDebug when it happens')
        // 4) a dropped mic track mid-take says so on the debug breadcrumb
        MOCK.wall = 0
        const s2 = createVoiceSession({ ask: async () => ({ consent: true }), now: () => MOCK.wall })
        await s2.ready
        for (let t = 1; t <= 120; t++) { MOCK.wall += TICK_MS; s2.onTick(t) }
        if (trackObj.onended) trackObj.onended()
        ok(globalThis.window.__voiceDebug.where === 'mic-track-ended', 'an OS-dropped mic track is named in __voiceDebug', JSON.stringify(globalThis.window.__voiceDebug))
        const tr2 = await s2.finalize()
        ok(tr2 !== null, 'a take whose track died still flushes its bytes honestly (finalize not short-circuited)')
    } finally {
        for (const k of ['window', 'document', 'navigator', 'MediaRecorder', 'AudioContext', 'webkitAudioContext', 'requestAnimationFrame', 'cancelAnimationFrame']) {
            if (prev[k] === undefined) del(k); else put(k, prev[k])
        }
    }
}

// --- clap sync: the ±50 ms acceptance line, pure twin of the browser proof --
// (#1711 S3) scripts/plaicraft-clap.mjs runs these two functions on bytes that
// came out of the real MediaRecorder; here synthetic PCM pins the same verdicts
// offline — including the ones that MUST fail (shifted clock, dropped clap),
// so the clap verdict is provably load-bearing before a single mic opens.
{
    const { detectClaps, clapVerdict, matchClapEdges, clapPairGate, CLAP_TOL_MS, CLAP_OPUS_FRAME_MS } = await import('../src/utils/clapSync.js')
    const SR = 48000
    const TICK_MS = 1000 / 60
    const mkPcm = (clapsMs, durMs = 6000) => {
        const n = Math.round((durMs / 1000) * SR)
        const a = new Float32Array(n)
        let s = 12345
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
        for (let i = 0; i < n; i++) a[i] = 0.03 * Math.sin((2 * Math.PI * 220 * i) / SR) + rnd() * 0.004 // mic hum floor, far below any clap
        for (const ms of clapsMs) {
            const s0 = Math.round((ms / 1000) * SR)
            for (let k = 0; k < Math.round(0.05 * SR) && s0 + k < n; k++) {
                const env = Math.exp(-k / (0.012 * SR)) // the browser driver's clap shape, verbatim — low-frequency, survives opus
                a[s0 + k] = Math.max(-1, Math.min(1, (0.55 * rnd() + 0.55 * Math.sin(k * 2 * Math.PI * 190 / SR) + 0.35 * Math.sin(k * 2 * Math.PI * 760 / SR)) * env))
            }
        }
        return a
    }
    const realtimeClock = (uptoTick) => {
        const c = []
        for (let t = 1; t <= uptoTick; t += 60) c.push({ t, ms: Math.round((t - 1) * TICK_MS) })
        if (c[c.length - 1].t !== uptoTick) c.push({ t: uptoTick, ms: Math.round((uptoTick - 1) * TICK_MS) })
        return c
    }
    const CLAPS = [1000, 2400, 3800] // clap at wall-ms ~ tick 61/145/229 at realtime
    const PRESSED = [61, 145, 229]
    const pcm = mkPcm(CLAPS)
    const onsets = detectClaps(pcm, { sampleRate: SR })
    ok(onsets.length === 3, `detector heard every synthetic clap (${onsets.length}/3)`)
    const precision = onsets.map((o, i) => Math.abs((o / SR) * 1000 - CLAPS[i]))
    ok(Math.max(...precision) < 5, `onset placement < 5 ms off truth (worst ${Math.max(...precision).toFixed(1)} ms)`)
    const clean = clapVerdict({ sampleRate: SR, onsets, pressTicks: PRESSED, clock: realtimeClock(300) })
    ok(clean.ok && Math.abs(clean.worstMs) <= CLAP_TOL_MS, `clean take verdicts ok within ±${CLAP_TOL_MS} ms (worst ${clean.worstMs} ms)`, clean.why)
    // mutants — the verdict must be able to fail:
    const shifted = clapVerdict({ sampleRate: SR, onsets, pressTicks: PRESSED, clock: realtimeClock(300).map((s) => ({ t: s.t, ms: s.ms + 80 })) })
    ok(!shifted.ok, 'MUTANT +80 ms clock shift -> RED', shifted.why)
    const dropped = clapVerdict({ sampleRate: SR, onsets: detectClaps(mkPcm([CLAPS[0], CLAPS[2]]), { sampleRate: SR }).slice(0, 2), pressTicks: PRESSED, clock: realtimeClock(300) })
    ok(!dropped.ok, 'MUTANT dropped clap (2 heard, 3 pressed) -> RED', dropped.why)
    const mispressed = clapVerdict({ sampleRate: SR, onsets, pressTicks: [61, 145, 289], clock: realtimeClock(300) })
    ok(!mispressed.ok, 'MUTANT press 1000 ms from its clap -> RED', mispressed.why)
    ok(detectClaps(mkPcm([], 4000), { sampleRate: SR }).length === 0, 'sub-threshold hum detects nothing (real claps are the only trigger)')

    // LOAD-HONEST PAIR GATE (#1711 #2664 + AUDIT 2026-11-18 item 3): the pure
    // skip decision. PASS rides the verdict; jitter SKIPs only inside a proven
    // drift band AND away from the drift constant; the SIGNATURE ZONE (|offset −
    // drift| ≤ one 20 ms opus frame — the bf1a96e shape: 102.8 vs 102 ms) is
    // the realtime-stamp failure and REFUSES the skip; bigger desync goes RED
    // regardless; --witness turns skips off.
    ok(CLAP_OPUS_FRAME_MS === 20, 'signature band is one opus frame (20 ms)')
    ok(clapPairGate({ ok: true, worstMs: 3.2, driftMs: 90 }).action === 'PASS', 'gate: green verdict PASSes whatever the drift says')
    ok(clapPairGate({ ok: false, worstMs: 130, driftMs: 102 }).action === 'SKIP', 'gate: jitter inside the drift band, clear of the drift constant -> SKIP (named)', JSON.stringify(clapPairGate({ ok: false, worstMs: 130, driftMs: 102 }).why))
    ok(clapPairGate({ ok: false, worstMs: 152, driftMs: 102 }).action === 'SKIP', 'gate: drift+tol band edge (152 @ 102) still SKIPs — the signature zone is only ±20 ms around the drift constant', JSON.stringify(clapPairGate({ ok: false, worstMs: 152, driftMs: 102 }).action))
    ok(clapPairGate({ ok: false, worstMs: 51.5, driftMs: 102 }).action === 'SKIP', 'gate: just over tolerance deep inside the band -> SKIP')
    ok(clapPairGate({ ok: false, worstMs: 81.9, driftMs: 102 }).action === 'SKIP', 'gate: signature-zone outer edge (20.1 ms above the drift constant) still SKIPs', String(clapPairGate({ ok: false, worstMs: 81.9, driftMs: 102 }).action))
    {
        const sig = clapPairGate({ ok: false, worstMs: 102.8, driftMs: 102 })
        ok(sig.action === 'RED' && sig.signature === true && Math.abs(sig.marginMs - 0.8) < 0.05,
            'AUDIT MUTANT bf1a96e shape (102.8 ms offset @ 102 ms drift) -> RED realtime-stamp signature, SKIP refused (old rule skipped it)', JSON.stringify(sig))
        const sigEdge = clapPairGate({ ok: false, worstMs: 121.9, driftMs: 102 })
        ok(sigEdge.action === 'RED' && sigEdge.signature === true, 'signature zone edge (|offset−drift| ≤ 20 ms) -> RED', JSON.stringify(sigEdge))
        const sigNeg = clapPairGate({ ok: false, worstMs: -101.5, driftMs: -102 })
        ok(sigNeg.action === 'RED' && sigNeg.signature === true, 'signed drift (late mic −102 ms) with matching early offset -> same signature RED')
    }
    ok(clapPairGate({ ok: false, worstMs: 200, driftMs: 102 }).action === 'RED', 'gate: 200 ms over 102 ms drift -> RED (a desync larger than the demonstrated drift never launders)', clapPairGate({ ok: false, worstMs: 200, driftMs: 102 }).why)
    ok(clapPairGate({ ok: false, worstMs: -200, driftMs: 102 }).action === 'RED', 'ANTI-LAUNDER: EARLY −200 ms offset vs 102 ms drift -> RED (the old signed comparison slipped it under the band)', clapPairGate({ ok: false, worstMs: -200, driftMs: 102 }).why)
    ok(clapPairGate({ ok: false, worstMs: 130, driftMs: 102, witness: true }).action === 'RED', 'gate: --witness turns the skip off — a contended strict run goes RED by design')
    ok(clapPairGate({ ok: false, worstMs: 60, driftMs: 10 }).action === 'RED', 'gate: clean box (no demonstrated drift) — a red pair is RED, not excused')
    ok(clapPairGate({ ok: false, worstMs: null, driftMs: 102 }).action === 'RED', 'gate: red pair with no measured offset -> RED, never vacuous')

    // #2056 phone grading + the 2026-11-12 AUDIT fix: a real phone take is NOT
    // one clean direction stream — steering/drift adds edges and the clap taps
    // live on the A button (what the #2056 instructions name). matchClapEdges
    // pairs each onset ONLY with A-tagged taps inside the ±250 ms search window
    // (wide so a late phone mic grades honestly RED, not ungradeable); every
    // other control's edge is context, never a pairing candidate. The old
    // any-control pairing let a ~120 ms-lagging phone land its onset on an
    // unrelated steering edge inside ±50 ms — the dense-stick mutant below is
    // exactly that attack and MUST stay RED.
    const mkPhone = (taps, noise) => [
        ...taps.map((t) => ({ t, control: 'a' })),
        ...noise.map((t) => ({ t, control: 'right' })),
    ]
    const TAPS = [PRESSED[0] + 2, PRESSED[1] + 1, PRESSED[2] - 2] // clap-coincident A taps
    const NOISE = [90, 120, 180, 250, 292]                         // steering/drift bits
    const phone = matchClapEdges({ sampleRate: SR, onsets, edges: mkPhone(TAPS, NOISE), clock: realtimeClock(300) })
    ok(phone.ok && phone.matched === 3 && phone.ignoredEdges === 5, `PHONE take grades green: 3 A-taps matched among 8 edges (steering noise ignored) (worst ${phone.worstMs} ms)`, phone.why)
    const phoneLate = matchClapEdges({ sampleRate: SR, onsets, edges: mkPhone(TAPS.map((t) => t + 30), NOISE), clock: realtimeClock(300) }) // taps +500 ms
    ok(!phoneLate.ok && phoneLate.matched < 3, 'MUTANT phone take 500 ms from its claps -> RED (the clap taps pair with nothing)', phoneLate.why)
    // AUDIT MUTANT (#1711 audit 2026-11-12): DENSE stick edges hugging every
    // onset (within ±2 ticks) + the real taps shifted +120 ms. Under the old
    // any-control pairing the onsets would snap onto the stick edges and grade
    // GREEN at offset ~0 — the lagging phone the acceptance line exists to
    // catch. With A-only pairing the taps pair at ~+117 ms -> RED. Must stay red.
    const DENSE = []
    for (const p of PRESSED) for (const k of [-2, -1, 1, 2]) DENSE.push({ t: p + k, control: k > 0 ? 'x' : 'right' })
    const lagPhone = matchClapEdges({ sampleRate: SR, onsets, edges: [...DENSE, ...mkPhone(TAPS.map((t) => t + 7), [])], clock: realtimeClock(300) }) // +120 ms taps
    ok(!lagPhone.ok && lagPhone.matched === 3 && lagPhone.pairs.every((p) => Math.abs(p.offsetMs) > CLAP_TOL_MS),
        'AUDIT MUTANT dense steering edges + taps shifted +120 ms -> RED (steering can never absorb a clap)', lagPhone.why)
    // shape law: untagged numbers pair NOTHING — fail-closed, so a caller that
    // forgets the control tags gets RED, never a silent return to any-control.
    ok(!matchClapEdges({ sampleRate: SR, onsets, edgeTicks: TAPS, clock: realtimeClock(300) }).ok, 'untagged numeric edges pair nothing -> RED (SHAPE LAW: edges must be {t, control})')
    const clock3 = realtimeClock(300).map((s) => ({ t: s.t, ms: s.ms + 120 })).concat([{ t: 301, ms: Math.round(300 * TICK_MS) + 120 }]) // +120 ms drift, samples kept, clamp never hides it
    const phoneDrift = matchClapEdges({ sampleRate: SR, onsets, edges: mkPhone(TAPS, NOISE), clock: clock3 }) // inside ±150 window, outside budget
    ok(!phoneDrift.ok && phoneDrift.matched === 3 && phoneDrift.pairs.every((p) => Math.abs(p.offsetMs) > CLAP_TOL_MS), 'MUTANT 120 ms pipeline drift all outside ±50 ms -> RED — the line is not relaxed, the window only finds candidates', phoneDrift.why)
    const quiet = matchClapEdges({ sampleRate: SR, onsets: onsets.slice(0, 2), edges: mkPhone(TAPS, NOISE), clock: realtimeClock(300) })
    ok(!quiet.ok && quiet.matched === 2, 'fewer than 3 clap-coincident A-taps -> RED (a real take has a clap per tap)', quiet.why)
    ok(!matchClapEdges({ sampleRate: SR, onsets, edges: [], clock: realtimeClock(300) }).ok, 'no input edges at all -> RED, never vacuous green')
    ok(!matchClapEdges({ sampleRate: SR, onsets, edges: NOISE.map((t) => ({ t, control: 'right' })), clock: realtimeClock(300) }).ok, 'noise edges without a single A-tap -> RED (the named control must be present)')
}

// --- CLAP TEST screen (#2156): pure core + the acceptance mutants ------------
// The one-screen slap test grades ITSELF on the phone with the SAME clapSync
// functions the studio runs. This pins the screen's own decisions (sim
// determinism, auto-END, honest hints) plus the three mutants #2156 names RED:
// taps shifted +120 ms; taps with no sound; fewer than 3 slaps. The browser
// twin — driving the real screen with a synth mic — is scripts/claptestplay.mjs.
{
    const { createTestSim, screenVerdict, FIXED_DT, SETTLE_TICKS, TEST_CAP_TICKS, SLAPS_NEEDED } = await import('../src/utils/clapTestCore.js')
    const { takeEdges } = await import('../src/utils/clapSync.js')
    const { encodePad } = await import('../src/utils/recording.js')
    const SR = 48000
    const TICK_MS = 1000 / 60
    const HOLD = Math.max(1, Math.round(140 / FIXED_DT)) // a palm slap ~140 ms of contact

    // sim determinism + auto-END rules
    const driveSim = (seed, tapTicks) => {
        const sim = createTestSim({ seed })
        const trace = []
        sim.start()
        for (let t = 1; sim.phase === 'testing'; t++) {
            sim.step({ a: tapTicks.some((tt) => t >= tt && t < tt + HOLD) })
            trace.push(sim.hash())
        }
        return { sim, trace }
    }
    const T1 = [61, 145, 229] // three slap taps ~2 s apart
    const sA = driveSim(12345, T1)
    const sB = driveSim(12345, T1)
    ok(SLAPS_NEEDED === 3, 'the physical test is three slaps (#2156)')
    ok(sA.sim.phase === 'ended' && sA.sim.taps.join() === T1.join(), 'screen sim banks the three slap taps and ends itself')
    ok(sA.trace.join() === sB.trace.join(), 'same seed + same taps -> identical hash trace (the take replays byte-exact)')
    ok(sA.trace.length === T1[2] + SETTLE_TICKS, `auto-END fires right after the 3rd tap settles (tick ${sA.trace.length})`)
    ok(driveSim(7, []).trace.length === TEST_CAP_TICKS, `no slaps at all -> caps at ${TEST_CAP_TICKS} ticks, the screen cannot hang open`)

    // take + PCM builders (int16 samples — screenVerdict takes what the browser
    // decode produces; clap ms sit exactly at their tap ticks)
    const mkI16 = (clapsMs, durMs = 8000) => {
        const n = Math.round((durMs / 1000) * SR)
        const out = new Array(n).fill(0)
        let s = 12345
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
        for (let i = 0; i < n; i++) out[i] = Math.round((0.03 * Math.sin((2 * Math.PI * 220 * i) / SR) + rnd() * 0.004) * 32767) // mic hum floor
        for (const ms of clapsMs) {
            const s0 = Math.round((ms / 1000) * SR)
            for (let k = 0; k < Math.round(0.05 * SR) && s0 + k < n; k++) {
                const env = Math.exp(-k / (0.012 * SR))
                out[s0 + k] = Math.max(-32767, Math.min(32767, Math.round((0.55 * rnd() + 0.55 * Math.sin((k * 2 * Math.PI * 190) / SR) + 0.35 * Math.sin((k * 2 * Math.PI * 760) / SR)) * env * 32767)))
            }
        }
        return out
    }
    const mkTake = (tapTicks, wiggle = []) => {
        const ticks = Math.max(...tapTicks, ...wiggle, 0) + SETTLE_TICKS
        const pads = []
        for (let t = 1; t <= ticks; t++) pads.push(encodePad({ a: tapTicks.some((tt) => t >= tt && t < tt + HOLD), right: wiggle.includes(t) }))
        const clock = []
        for (let t = 1; t <= ticks; t += 60) clock.push({ t, ms: Math.round((t - 1) * TICK_MS) })
        if (clock[clock.length - 1].t !== ticks) clock.push({ t: ticks, ms: Math.round((ticks - 1) * TICK_MS) })
        return {
            format: 'retrogames-rec/v2', build: 'test', game: 'claptest', method: 'pointer', seed: 4242, players: 1, ticks, hashEvery: 30,
            slots: [{ source: { kind: 'human' }, pads, raw: pads.map(() => ({})) }],
            hashes: [],
            voice: { tracks: [{ slots: [0], clock, b64: 'x' }], declined: [] },
        }
    }
    const CLAPS_AT = (tapTicks) => tapTicks.map((t) => (t - 1) * TICK_MS)

    const clean = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1)), rec: mkTake(T1) })
    ok(clean.ok && clean.claps === 3 && clean.matched === 3 && Math.abs(clean.worstMs) <= 50, `clean slap take PASSes on the phone within ±50 ms (worst ${clean.worstMs} ms)`, clean.why)
    ok(clean.hint === null, 'a PASS carries no hint')

    // MUTANT #1 (#2156): the taps land +120 ms away from their slaps — inside
    // the ±250 ms window, outside the ±50 ms line: measured RED, not ungradeable.
    const m1 = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1)), rec: mkTake(T1.map((t) => t + 7)) })
    ok(!m1.ok && m1.matched === 3 && m1.pairs.every((p) => Math.abs(p.offsetMs) > 50), 'MUTANT taps +120 ms -> phone grades RED (measured, inside the search window)', m1.why)

    // MUTANT #2: taps with no sound (mic off / too quiet).
    const m2 = screenVerdict({ sampleRate: SR, samples: mkI16([]), rec: mkTake(T1) })
    ok(!m2.ok && m2.claps === 0 && m2.hint === "didn't hear the slaps, try louder", 'MUTANT taps with no sound -> RED with the plain hint (#2156 verbatim)', m2.why)

    // MUTANT #3: fewer than 3 slaps — unheard clap for 3 taps, and 2-taps/2-claps.
    const m3 = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1.slice(0, 2))), rec: mkTake(T1) })
    ok(!m3.ok && m3.matched === 2, 'MUTANT only 2 slaps heard for 3 taps -> RED (minPairs 3)', m3.why)
    const m3b = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1.slice(0, 2))), rec: mkTake(T1.slice(0, 2)) })
    ok(!m3b.ok && m3b.matched === 2, 'MUTANT only 2 slaps tapped -> RED (a test is three slaps)', m3b.why)

    // steering context must never launder a lagging take on this screen either
    const m4 = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1)), rec: mkTake(T1.map((t) => t + 7), [40, 100, 160, 200, 260]) })
    ok(!m4.ok && m4.ignoredEdges >= 5, 'MUTANT +120 ms taps with steering edges -> still RED (A-only pairing holds on the screen)', `${m4.why}; ignored ${m4.ignoredEdges}`)

    // honest degradation: no voice half, no PCM
    const noVoice = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1)), rec: { ...mkTake(T1), voice: undefined } })
    ok(!noVoice.ok && /mic|voice/i.test(noVoice.hint || ''), 'voiceless take -> RED naming the microphone (motion-only consent)', noVoice.why)
    ok(!screenVerdict({ sampleRate: SR, samples: null, rec: mkTake(T1) }).ok, 'no PCM at all -> RED, never vacuous green')

    // studio agreement by CONSTRUCTION: the studio analyzer runs the same
    // takeEdges + matchClapEdges over the same bytes -> same numbers.
    const { matchClapEdges, detectClaps: dc2 } = await import('../src/utils/clapSync.js')
    const take = mkTake(T1)
    const stOnsets = dc2(Float32Array.from(mkI16(CLAPS_AT(T1)), (v) => v / 32767), { sampleRate: SR })
    const stV = takeEdges(take).map((c) => matchClapEdges({ sampleRate: SR, onsets: stOnsets, edges: c.edges, clock: take.voice.tracks[0].clock }))
    ok(stV.length === 1 && stV[0].ok === clean.ok && stV[0].worstMs === clean.worstMs, 'studio-side grading of the same bytes lands the same verdict (shared takeEdges)', stV[0] ? stV[0].why : 'no seats')

    // --- #2205 polish pins -----------------------------------------------------
    const { lastGapMs, pushHistory, formatHistory, hardFailNote } = await import('../src/utils/clapTestCore.js')

    // item 2: pacing readout is pure over the tick bank
    ok(lastGapMs(null) === null && lastGapMs([]) === null && lastGapMs([61]) === null, 'pacing gap: null until a second slap exists')
    ok(lastGapMs(T1) === Math.round((T1[2] - T1[1]) * TICK_MS), `pacing gap reports ms since the previous slap (${lastGapMs(T1)} ms)`, String(lastGapMs(T1)))

    // item 6 (pure half): honest green survives human rhythm variance — 1.6 s
    // and 2.4 s spacing, not just the baked cadence.
    const T2 = [61, 157, 301] // 96 + 144 ticks = 1.6 s / 2.4 s apart
    const off = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T2)), rec: mkTake(T2) })
    ok(off.ok && off.claps === 3 && off.matched === 3 && Math.abs(off.worstMs) <= 50, `off-nominal spacing 1.6/2.4 s PASSes too (worst ${off.worstMs} ms) — the line is about sync, not tempo`, off.why)
    ok(!clean.noTouches && !off.noTouches, 'a take with real taps is not flagged no-touches')

    // item 3: zero registered touches gets its own plain-language hint, with
    // and without sound — never the generic minPairs line.
    const zeroTapSound = screenVerdict({ sampleRate: SR, samples: mkI16(CLAPS_AT(T1)), rec: mkTake([]) })
    ok(!zeroTapSound.ok && zeroTapSound.noTouches && /no slaps registered|did you hit START/i.test(zeroTapSound.hint || '') && /3 sounds/.test(zeroTapSound.hint || ''),
        'MUTANT taps never registered, mic heard slaps -> RED naming START and the page', zeroTapSound.hint)
    const zeroTapDead = screenVerdict({ sampleRate: SR, samples: mkI16([]), rec: mkTake([]) })
    ok(!zeroTapDead.ok && zeroTapDead.noTouches && /did you hit START/i.test(zeroTapDead.hint || '') && /heard nothing/i.test(zeroTapDead.hint || ''),
        'MUTANT zero taps AND no sound -> RED, hint names START + dead mic', zeroTapDead.hint)

    // item 7: a hard fail reads differently dead vs instrumented-partial.
    ok(hardFailNote(clean) === null, 'a PASS has no hard-fail note (the number speaks)')
    ok(/dead/.test(hardFailNote(m2) || ''), 'silent no-pair take -> dead-take note', hardFailNote(m2))
    ok(/heard 3 slaps but 0 touches paired/.test(hardFailNote(zeroTapSound) || ''), 'heard-but-unpaired take -> instrumented partial note', hardFailNote(zeroTapSound))

    // item 4: verdict history shape — newest first, capped, junk-tolerant.
    const h5 = pushHistory(pushHistory(null, { d: 2, ok: false, worstMs: -84, key: 'b' }), { d: 1, ok: true, worstMs: 12, key: 'a' })
    ok(h5.length === 2 && h5[0].key === 'a', 'history prepends newest first')
    let hAcc = null
    for (let i = 0; i < 8; i++) hAcc = pushHistory(hAcc, { d: i, ok: i % 2 === 0, worstMs: i, key: `k${i}` })
    ok(hAcc.length === 5 && hAcc[0].key === 'k7', 'history caps at the last 5 verdicts')
    ok(pushHistory([null, 7, { nope: true }], { d: 1, ok: true, worstMs: 1, key: 'x' }).length === 1, 'corrupt stored history is dropped, not fatal')
    ok(/PASS 12ms.*FAIL 84ms/.test(formatHistory([{ d: Date.now(), ok: true, worstMs: 12, key: 'a' }, { d: Date.now(), ok: false, worstMs: -84, key: 'b' }])), 'history line renders day + verdict + |worst| ms, newest first')
    ok(formatHistory(null) === '', 'no history -> empty line')

    // --- LIVE PAIR COACH (#1711) pins ------------------------------------------
    // The three Nov-16 phone takes missed by HALF (airborne clap / silent tap —
    // measured from the stored bytes), so the coach must name the missing half
    // live. These pins run the same pure machine the page drives.
    const { createPairCoach, pairCoachFeed, pairCoachAge, COACH_LIVE_TEXT } = await import('../src/utils/clapTestCore.js')
    const { CLAP_TOL_MS: TOL, CLAP_SEARCH_MS: WIN } = await import('../src/utils/clapSync.js')

    // green inside the SAME lines the studio grades with (not a second law)
    const c1 = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 1000), 'clap', 1020)
    ok(c1.last && c1.last.kind === 'pair' && c1.last.ms === 20 && c1.pairs === 1, 'coincident clap+tap -> PAIR naming its ms', JSON.stringify(c1.last))
    const cBound = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', TOL)
    ok(cBound.last.kind === 'pair', `exactly ±${TOL} ms still PAIRs (the acceptance line itself, not tighter)`)
    const cJust = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', TOL + 1)
    ok(cJust.last.kind === 'off' && cJust.last.ms === TOL + 1, `MUTANT: apart ${TOL + 1} ms -> OFF, never green (the ±50 line has teeth)`, JSON.stringify(cJust.last))
    const cFar = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', WIN)
    ok(cFar.pairs === 1 && cFar.last.kind === 'off', `apart ${WIN} ms still PAIRs at OFF (window = the grader's CLAP_SEARCH_MS)`)
    const cOut = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', WIN + 1)
    ok(cOut.pairs === 0 && cOut.openT === 0 && cOut.openC === WIN + 1, `MUTANT: apart ${WIN + 1} ms -> no pair — both events stay open for their own naming`)
    // opts override proves the machine READS its constants (a hardcoded 60 dies here)
    const cOpt = pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', 45, { tolMs: 40 })
    ok(cOpt.last.kind === 'off', 'tolMs opts override honoured -> green gate is the constant, not baked text')

    // the two named half-misses Jon's takes actually showed
    const n1 = pairCoachAge(pairCoachFeed(createPairCoach(), 'clap', 3000), 3000 + WIN + 1)
    ok(n1.last.kind === 'notouch' && n1.last.ms === 0 && n1.pairs === 0, 'airborne clap (seed978353 shape) -> NO TOUCH named when its window closes')
    const n2 = pairCoachAge(pairCoachFeed(createPairCoach(), 'tap', 4000), 4000 + WIN + 1)
    ok(n2.last.kind === 'nosound' && n2.last.ms === 0, 'silent tap (seed144524 shape) -> NO SOUND named when its window closes')
    const stillInFlight = pairCoachAge(pairCoachFeed(createPairCoach(), 'clap', 3000), 3000 + WIN)
    ok(stillInFlight.last === null, 'naming waits the FULL window — never nags a slap still in flight')

    // consumption + supersede + idempotence guards
    const d1 = pairCoachAge(pairCoachFeed(pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'clap', 10), 'clap', 20), 20 + WIN + 1)
    ok(d1.pairs === 1 && d1.last.kind === 'notouch', 'one slap cannot double-pair: the extra clap ages out as its own notouch')
    const d2 = pairCoachFeed(pairCoachFeed(pairCoachFeed(createPairCoach(), 'tap', 0), 'tap', 100), 'clap', 120)
    ok(d2.pairs === 1 && d2.last.ms === 20, 'supersede: a lone clap pairs with the MOST RECENT open tap')
    ok(pairCoachFeed(createPairCoach(), 'x', 0).last === null, 'unknown event kind is a no-op, never a phantom pair')
    const ageTwice = pairCoachAge(pairCoachAge(pairCoachFeed(createPairCoach(), 'tap', 0), 400), 500)
    ok(ageTwice.last.kind === 'nosound' && ageTwice.seq === 1, 'an expired event is named EXACTLY once (age clears the window)')

    // determinism: identical event streams produce identical machines (deep)
    const stream = (s0) => { pairCoachFeed(s0, 'tap', 100); pairCoachFeed(s0, 'clap', 110); pairCoachAge(s0, 500); pairCoachFeed(s0, 'clap', 900); pairCoachAge(s0, 1300); return s0 }
    ok(JSON.stringify(stream(createPairCoach())) === JSON.stringify(stream(createPairCoach())), 'coach stream is deterministic (replay-safe)')

    // the words the player reads, and honesty: naming carries no fake number
    ok(COACH_LIVE_TEXT.pair(12).startsWith('PAIR ✓ 12'), 'pair text names PAIR + ms', COACH_LIVE_TEXT.pair(12))
    ok(/OFF 62/.test(COACH_LIVE_TEXT.off(62)) && /glass/.test(COACH_LIVE_TEXT.off(62)), 'off text names OFF + ms + the glass', COACH_LIVE_TEXT.off(62))
    ok(/TOUCH/.test(COACH_LIVE_TEXT.notouch) && /glass/.test(COACH_LIVE_TEXT.notouch), 'notouch text says TOUCH + glass')
    ok(/SOUND/.test(COACH_LIVE_TEXT.nosound) && /slap harder/i.test(COACH_LIVE_TEXT.nosound), 'nosound text says SOUND + prompts louder (one-sided bias: prompt, never claim)')

    // --- REPORT CARD (#1711): one named row per slap, in time order -----------
    // The totals ("0 of 2 paired") never told Jon WHICH habit failed — silent
    // tap vs airborne clap vs late palm all read the same. The card speaks each
    // row from the verdict's own residue (matchClapEdges' timed unmatched lists),
    // so card and verdict can never disagree.
    const { clapReportRows, MAX_REPORT_ROWS } = await import('../src/utils/clapTestCore.js')

    // residue WITH times on matchClapEdges — additive (counts unchanged)
    const resNoTaps = matchClapEdges({ sampleRate: SR, onsets: dc2(Float32Array.from(mkI16(CLAPS_AT(T1)), (v) => v / 32767), { sampleRate: SR }), edges: [], clock: mkTake(T1).voice.tracks[0].clock })
    ok(resNoTaps.unmatchedOnsetMs.length === 3 && resNoTaps.unmatchedOnsetMs.every((ms, i) => Math.abs(ms - CLAPS_AT(T1)[i]) <= 2), 'residue: claps with no taps keep their heard times (seed978353 shape)', JSON.stringify(resNoTaps.unmatchedOnsetMs))
    ok(resNoTaps.unmatchedTapMs.length === 0 && resNoTaps.unmatchedOnsets === 3, 'residue times agree with the counts already graded')
    const resNoClock = matchClapEdges({ sampleRate: SR, onsets: [1000], edges: [{ t: 1, control: 'a' }], clock: [] })
    ok(Array.isArray(resNoClock.unmatchedOnsetMs) && resNoClock.unmatchedOnsetMs.length === 0 && resNoClock.unmatchedTapMs.length === 0, 'no clock -> empty residue lists (no ms can be computed, never fabricated)')

    // clean take: three PAIR rows, ascending, each within the line
    ok(clean.report.length === 3 && clean.report.every((r) => r.kind === 'pair') && clean.report.every((r) => Math.abs(r.ms) <= 50), 'clean take card: three PAIR rows within ±50 ms', JSON.stringify(clean.report))
    ok(clean.report.every((r, i) => r.n === i + 1) && clean.report.every((r, i) => i === 0 || r.atMs >= clean.report[i - 1].atMs), 'card rows are numbered and time-ordered')
    ok(clean.report.length === clean.matched, 'card says exactly one row per matched pair (paint == verdict)')

    // the three acceptance mutants each name their own failure shape
    ok(m1.report.length === 3 && m1.report.every((r) => r.kind === 'off' && r.ms < -50), 'taps +120 ms card: three OFF rows, signed late vs the glass', JSON.stringify(m1.report.map((r) => r.ms)))
    ok(m2.report.length === 3 && m2.report.every((r) => r.kind === 'nosound'), 'silent taps card: three NO SOUND rows (the seed144524 habit named per slap)', JSON.stringify(m2.report.map((r) => r.kind)))
    ok(m3.report.map((r) => r.kind).join() === 'pair,pair,nosound', 'two claps + three taps card: the third slap named NO SOUND in place', JSON.stringify(m3.report.map((r) => r.kind)))

    // airborne clap card: loud claps, zero touches -> every row NO TOUCH
    ok(zeroTapSound.report.length === 3 && zeroTapSound.report.every((r) => r.kind === 'notouch'), 'heard claps with zero touches card: three NO TOUCH rows (seed978353 named at grading)', JSON.stringify(zeroTapSound.report))
    ok(zeroTapDead.report.length === 0, 'dead take card is empty — no events happened, none invented')
    ok(noVoice.report.length === 0, 'voiceless take card is empty — nothing was heard to name')

    // the row builder is a law of its own constants, not baked text
    const fakeV = { pairs: [{ tick: 1, expectedMs: 1000, heardMs: 1060, offsetMs: 60 }], unmatchedOnsetMs: [], unmatchedTapMs: [] }
    ok(clapReportRows(fakeV)[0].kind === 'off', 'row kind uses the acceptance line (60 ms > ±50 -> OFF)')
    ok(clapReportRows({ ...fakeV, pairs: [{ tick: 1, expectedMs: 1000, heardMs: 1050, offsetMs: 50 }], unmatchedOnsetMs: [], unmatchedTapMs: [] })[0].kind === 'pair', 'exactly ±50 ms still Pairs on the card (the line itself, not tighter)')
    ok(clapReportRows(fakeV, 70)[0].kind === 'pair', 'tolMs opts override honoured -> the gate is the constant, not baked text')
    const crowded = clapReportRows({ pairs: [], unmatchedOnsetMs: Array.from({ length: MAX_REPORT_ROWS + 2 }, (_, i) => i * 1000), unmatchedTapMs: [] })
    ok(crowded.length === MAX_REPORT_ROWS + 1 && crowded[MAX_REPORT_ROWS].kind === 'more' && crowded[MAX_REPORT_ROWS].ms === 2, `crowded card caps at ${MAX_REPORT_ROWS} rows and admits the hidden count (+2 more)`, JSON.stringify(crowded.slice(-2)))
    ok(crowded[MAX_REPORT_ROWS - 1].n === MAX_REPORT_ROWS, 'numbering survives the cap (row 12 is #12)')

    // #2654 item 3: haptics per kind — distinct, verdict-pure, unknown silent.
    const { COACH_HAPTICS, coachHaptics } = await import('../src/utils/clapTestCore.js')
    const verdictPatterns = ['60', '140,70,140'] // the final PASS/FAIL buzzes (item 5, #2205)
    ok(Object.keys(COACH_HAPTICS).sort().join(',') === 'nosound,notouch,off,pair', 'haptics table covers exactly the four named kinds')
    ok(Object.values(COACH_HAPTICS).every((p) => Array.isArray(p) && p.length > 0 && p.every((n) => Number.isInteger(n) && n > 0 && n <= 200)), 'every live pattern is short, positive, integer ms (mid-take guidance, never a seizure)')
    const sigs = Object.values(COACH_HAPTICS).map((p) => p.join(','))
    ok(new Set(sigs).size === sigs.length, 'all four live rhythms are distinct from each other (told apart blind)')
    ok(sigs.every((s) => !verdictPatterns.includes(s)), 'no live rhythm impersonates the final PASS/FAIL buzz (verdict stays the only end-of-take statement)')
    ok(coachHaptics('pair') === COACH_HAPTICS.pair && coachHaptics('bogus') === null, 'coachHaptics answers known kinds, null for unknown (never vibrate on a name the table lacks)')
}

// --- query plumbing -----------------------------------------------------------
{
    ok(storeFromQuery('') === 'https://retrogames.jalfern.workers.dev', 'default store = the relay host')
    ok(storeFromQuery('?relay=wss://elsewhere.example') === 'https://elsewhere.example', '?relay relocates the store too')
    ok(storeFromQuery('?store=ws://host') === 'http://host', '?store override, ws->http')
    const dead = await probeStore('http://127.0.0.1:1')
    ok(dead.ok === false && dead.sessions === false, 'a dead relay probes as not-configured, never throws')
}

// --- outbox: uploads survive the phone (#1711 S6) ---------------------------
// Fake IndexedDB matching the adapter's exact contract (open + createObjectStore
// keyPath 'id' + readwrite tx add/getAll/delete/count, async completion). The
// same factory object reused across setOutboxFactory calls = storage that
// survives a "browser restart", which is exactly the kill-test in Node form.
const fakeIDB = () => {
    const dbs = new Map()
    return {
        __dbs: dbs,
        open(name, version = 1) {
            const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null, error: null }
            queueMicrotask(() => {
                let d = dbs.get(name)
                const isNew = !d
                if (isNew) {
                    d = { stores: new Map(), close() {} }
                    d.objectStoreNames = { contains: (n) => d.stores.has(n) }
                    d.createObjectStore = (storeName, { keyPath } = {}) => {
                        const st = { keyPath: keyPath || null, data: new Map() }
                        d.stores.set(storeName, st)
                        return st
                    }
                    d.transaction = (storeName) => {
                        const st = d.stores.get(storeName)
                        let err = null
                        const t = {
                            oncomplete: null, onerror: null, onabort: null,
                            objectStore: () => ({
                                add: (v) => {
                                    const k = st.keyPath ? v[st.keyPath] : null
                                    if (k == null) { err = new Error('missing key'); return {} }
                                    if (st.data.has(k)) { err = new Error('constraint'); return {} }
                                    st.data.set(k, JSON.parse(JSON.stringify(v)))
                                    return { result: k }
                                },
                                getAll: () => ({ result: [...st.data.values()].map((v) => JSON.parse(JSON.stringify(v))) }),
                                count: () => ({ result: st.data.size }),
                                delete: (k) => { st.data.delete(k); return {} },
                            }),
                        }
                        queueMicrotask(() => { if (err && t.onerror) t.onerror(); else if (t.oncomplete) t.oncomplete() })
                        return t
                    }
                    dbs.set(name, d)
                }
                req.result = d
                try {
                    if (isNew && req.onupgradeneeded) req.onupgradeneeded()
                    if (req.onsuccess) req.onsuccess()
                } catch (e) { if (req.onerror) req.onerror() }
            })
            return req
        },
    }
}
const mkRec2 = (game = 'gauntlet', seed = 777, ticks = 90) => {
    const slots = Array.from({ length: 1 }, () => ({ source: { kind: 'human' }, pads: [], raw: [] }))
    for (let i = 0; i < ticks; i++) { slots[0].pads.push({}); slots[0].raw.push({}) }
    return {
        format: REC_FORMAT, build: 'test', game, method: 'stick', seed, players: 1, ticks, hashEvery: 30,
        slots, hashes: ticks >= 30 ? [{ t: 30, h: 1 }, { t: ticks, h: 2 }] : [{ t: ticks || 1, h: 2 }],
    }
}
{
    // honest degrade: no IndexedDB in the world
    setOutboxFactory(null)
    ok(await queueRun(mkRec2(), 'jon') === null, 'no IndexedDB: queueRun is an honest no-op (today\u2019s single-attempt world)')
    const offOut = await drainOutbox({ motion: true, upload: async () => ({ uploaded: true }) })
    ok(offOut.available === false && offOut.sent.length === 0, 'no IndexedDB: drain reports unavailable and sends nothing')

    const fac = fakeIDB()
    setOutboxFactory(fac)
    const e1 = await queueRun(mkRec2('gauntlet', 101, 90), 'jon')
    ok(!!e1 && e1.rec.seed === 101 && e1.player === 'jon' && e1.savedAt > 0, 'a finished take is queued with rec+player+savedAt (drain can rebuild the upload)')
    const pen = makeOutbox(fac)
    ok(await pen.count() === 1, 'queued BEFORE any upload attempt \u2014 the entry stands on its own')

    // plan rules
    const many = Array.from({ length: OUTBOX_MAX_ITEMS + 3 }, (_, i) => ({ id: `e${i}`, savedAt: 1000 + i }))
    const pa = planAdd(many, { id: 'new-comer', savedAt: 999999 })
    ok(pa.entries.length === OUTBOX_MAX_ITEMS && pa.evicted.length === 4 && pa.evicted[0].id === 'e0' && pa.entries.some((x) => x.id === 'new-comer'),
        `cap ${OUTBOX_MAX_ITEMS}: overflows evict the OLDEST, never the fresh take`)
    ok(classifyFailure('http 413') === 'drop' && classifyFailure('invalid recording: x') === 'drop'
        && classifyFailure('no motion consent') === 'drop' && classifyFailure('upload without consent') === 'drop',
        'permanent refusals classify drop (never hammer a store that will always say no)')
    ok(classifyFailure('store unreachable: boom') === 'keep' && classifyFailure('http 503') === 'keep'
        && classifyFailure('http 429') === 'keep' && classifyFailure('http 408') === 'keep',
        'unreachable/busy/timeout classify keep (retrying is the point)')
    const pd = planDrain([{ id: 'old', savedAt: 500 }, { id: 'fresh', savedAt: 900 }], { motion: true, now: 1000 })
    ok(pd.send.length === 2 && pd.send[0].id === 'old', 'drain sends oldest-first \u2014 store order = play order')
    ok(planDrain([{ id: 'a', savedAt: 1 }], { motion: false, now: 2 }).drop.length === 1, 'consent revoked/absent = drop ALL (no recordings pile for a player who said no)')
    ok(planDrain([{ id: 'ancient', savedAt: 1 }], { motion: true, now: 1e13 }).drop.length === 1, 'stale entries drop past the age cap')

    // drain mechanics over the fake pen
    setOutboxFactory(fac) // restart the handle, keep the storage (browser relaunch in Node form)
    const survived = await makeOutbox(fac).count()
    ok(survived === 1, 'entries survive a restart when the factory (device storage) is the same')
    const okUp = async () => ({ uploaded: true, key: 'gauntlet/x.json' })
    const sOut = await drainOutbox({ motion: true, upload: okUp })
    ok(sOut.sent.length === 1 && await makeOutbox(fac).count() === 0, 'successful retry removes the entry \u2014 the store has it, the pen keeps nothing')

    setOutboxFactory(fac)
    await queueRun(mkRec2('gauntlet', 202, 60), 'jon')
    const netOut = await drainOutbox({ motion: true, upload: async () => ({ uploaded: false, reason: 'store unreachable: down' }) })
    ok(netOut.kept.length === 1 && await makeOutbox(fac).count() === 1, 'network failure KEEPS the entry for the next trigger')
    const retryOut = await drainOutbox({ motion: true, upload: okUp })
    ok(retryOut.sent.length === 1 && await makeOutbox(fac).count() === 0, 'the next drain ships what the outage kept')

    setOutboxFactory(fac)
    await queueRun(mkRec2('gauntlet', 303, 60), 'jon')
    await queueRun(mkRec2('gauntlet', 404, 60), 'jon')
    let calls = 0
    const stopOut = await drainOutbox({ motion: true, upload: async () => { calls++; return { uploaded: false, reason: 'store unreachable: down' } } })
    ok(calls === 1 && stopOut.kept.length === 1 && await makeOutbox(fac).count() === 2, 'a dead store ENDS the pass \u2014 the rest of the queue is not hammered')
    let poison = true
    const dropOut = await drainOutbox({ motion: true, upload: async () => (poison ? (poison = false, { uploaded: false, reason: 'http 413' }) : okUp()) })
    ok(dropOut.dropped.length === 1 && await makeOutbox(fac).count() === 0, 'a permanent failure drops its entry and the drain moves to the next')
    ok(dropOut.sent.length === 1, 'after the poison leaves, the healthy entry ships in the same pass')

    setOutboxFactory(fac)
    await queueRun(mkRec2('gauntlet', 505, 60), 'jon')
    const revOut = await drainOutbox({ motion: false, upload: async () => ({ uploaded: true }) })
    ok(revOut.dropped.length === 1 && revOut.sent.length === 0 && await makeOutbox(fac).count() === 0,
        'revoked consent purges the pen through drain \u2014 nothing uploads AND nothing lingers')
    ok(await dropEntry('no-such-id') === true, 'dropEntry is silent on missing (already-gone is success)')

    // --- two humans, one phone (#1711 audit 1 acceptance gate) --------------
    // Consent keys by name, so the outbox drains per NAME: revoking `mia`
    // purges her pile while `jon`'s ships, and the store ends up showing
    // distinct labels for distinct players on the same device.
    const dev = memStore()
    grantConsent(dev, 'jon', { motion: true, voice: false })
    grantConsent(dev, 'mia', { motion: true, voice: false })
    const pdP = planDrain([{ id: 'j', player: 'jon', savedAt: 1 }, { id: 'm', player: 'mia', savedAt: 2 }], { motion: (e) => e.player === 'jon', now: 3 })
    ok(pdP.send.length === 1 && pdP.send[0].id === 'j' && pdP.drop.length === 1 && pdP.drop[0].id === 'm', 'planDrain takes a per-entry motion predicate — one flag per name, not per device')

    const fac2 = fakeIDB()
    setOutboxFactory(fac2)
    const pen2 = () => makeOutbox(fac2).count()
    await queueRun(mkRec2('gauntlet', 701, 60), 'jon')
    await queueRun(mkRec2('gauntlet', 702, 60), 'mia')
    await queueRun(mkRec2('gauntlet', 703, 60), 'jon')
    revokeConsent(dev, 'mia')
    const nameUpload = (e) => uploadSession(e.rec, { player: e.player, consent: consentFor(dev, e.player), base: BASE })
    const twoOut = await drainOutbox({ motion: (e) => consentFor(dev, e.player).motion, upload: nameUpload })
    ok(twoOut.sent.length === 2 && twoOut.dropped.length === 1 && await pen2() === 0,
        'revoking mia purges only her take — jon\u2019s two ship in the same pass')
    const rowFor = (seed) => bucketRowBySeed(seed)
    ok(rowFor(701) === 'jon' && rowFor(703) === 'jon', 'jon\u2019s drained takes reach the store labelled jon')
    ok(twoOut.dropped[0].reason.includes('revoked'), 'the purged take names why: consent revoked')
    grantConsent(dev, 'mia', { motion: true, voice: false })
    setOutboxFactory(fac2)
    await queueRun(mkRec2('gauntlet', 704, 60), 'mia')
    const miaOut = await drainOutbox({ motion: (e) => consentFor(dev, e.player).motion, upload: nameUpload })
    ok(miaOut.sent.length === 1 && await pen2() === 0, 'a re-granted mia ships her own take')
    ok(rowFor(701) === 'jon' && rowFor(704) === 'mia', 'two players consented on ONE device -> the store shows two labels (acceptance line, Node form)')
}

// --- sync badge: the phone says so (#1711 S7) -------------------------------
// badgeView is the whole pill rule set; these gates pin its honesty:
// no store = no claim; backlog outranks a fresh success; nothing says
// "syncing" for an empty pen; confirmations fade, pending states don't.
{
    const H = { kind: 'hidden' }
    ok(badgeView({ storeLive: false, uploaded: true }).kind === 'hidden'
        && badgeView({ storeLive: false, phase: 'drain', left: 3 }).kind === 'hidden',
        'no store, no pill — never claim storage the device does not have')
    const up = badgeView({ storeLive: true, uploaded: true, left: 0 })
    ok(up.kind === 'uploaded' && up.holdMs === BADGE_HOLD_UPLOADED_MS, 'a run that reached the store says TAKE UPLOADED, then fades')
    const q = badgeView({ storeLive: true, uploaded: false, requeued: true, left: 1 })
    ok(q.kind === 'queued' && q.holdMs === 0, 'a requeued take says SAVED — WILL SYNC and persists until truth changes')
    ok(badgeView({ storeLive: true, uploaded: true, left: 2 }).kind === 'queued',
        'backlog beats success — an uploaded run with stale takes waiting shows the backlog')
    ok(badgeView({ storeLive: true, uploaded: true, left: 2 }).text.startsWith('2 TAKES'), 'backlog counts in words — 2 TAKES, not vibes')
    ok(badgeView({ storeLive: true, phase: 'drain', left: 1 }).kind === 'syncing', 'a pass with work announces SYNCING')
    ok(badgeView({ storeLive: true, phase: 'drain', left: 0, sent: 0 }).kind === 'hidden', 'no syncing theater for an empty pen')
    const sy = badgeView({ storeLive: true, sent: 3, left: 0 })
    ok(sy.kind === 'synced' && sy.text === '3 TAKES SYNCED' && sy.holdMs === BADGE_HOLD_SYNCED_MS, 'a drain that shipped 3 counts them, then fades')
    ok(badgeView({ storeLive: true, sent: 1, left: 0 }).text === '1 TAKE SYNCED', 'one take reads one TAKE (no broken plurals)')
    ok(badgeView({ storeLive: true, sent: 2, left: 1 }).kind === 'queued' && badgeView({ storeLive: true, sent: 2, left: 1 }).text.startsWith('1 TAKE'),
        'partial drain reports the REMAINING count, not the shipped one — pending outranks done')
    ok(badgeView({ storeLive: true, sent: 0, left: 0, uploaded: false }).kind === 'hidden', 'a pass that did nothing says nothing')
    const mut = badgeView({ storeLive: true, requeued: true, left: 0 })
    ok(mut.kind === 'queued' && mut.text === 'TAKE SAVED — WILL SYNC', 'a requeue with an unreadable pen count still says a take is saved')
}

// --- clap coach: teach the ±50 ms proof (#1711) -----------------------------
// Every graded human take heard ZERO claps, so the ±50 ms line could not be
// graded on any of them — nothing ever asked the player. coachView is the
// whole rule set (voiceCapture.js paints it at the green-REC moment); these
// gates pin its honesty: a dead pipe gets no lesson, one lesson per boot,
// and the text instructs instead of claiming.
{
    ok(coachView({ micLive: false, shown: false }).kind === 'hidden',
        'no coaching for a mic that is not live — LISTEN and declined pipes get nothing')
    ok(coachView({ micLive: true, shown: true }).kind === 'hidden',
        'once LEARNED on the device — the screen belongs to the game after the lesson lands')
    const c = coachView({ micLive: true, shown: false })
    ok(c.kind === 'coach' && c.text === COACH_TEXT && c.holdMs === COACH_HOLD_MS,
        'a live take mic teaches CLAP WITH YOUR FIRST TAPS, then fades')
    ok(!/IS SYNCED|SYNC OK|ALIGNED/i.test(COACH_TEXT),
        'the coach instructs and never claims — the clap verdict decides sync')
    ok(COACH_HOLD_MS > 0 && COACH_HOLD_MS <= 6000,
        'the lesson is a whisper, not a takeover — it holds at most 6 s of screen')
}

// --- clap coach RE-ARM (#1711): taught, not shown ---------------------------
// Once-per-shown burned the lesson on the players who needed it: Jon drives
// the instant REC goes green, the pill is easy never to look at, and the old
// flag then silenced the ask forever on exactly his device. A take is its own
// evidence — the recorder's live analyser hears claps while the take runs — so
// the device state is none|shown|learned and a mic-live take that ends with
// zero claps heard re-arms the ask. The error bias is one-sided by design: a
// missed clap costs a 5 s pill, never a lost proof.
{
    ok(coachState(null) === 'none' && coachState(COACH_SHOWN) === 'shown' && coachState(COACH_LEARNED) === 'learned',
        'device states read none|shown|learned')
    ok(coachState('1') === 'shown',
        'the legacy shipped flag (once-per-shown) migrates as shown — a device that never clapped CAN re-learn')
    ok(coachState('bogus') === 'shown',
        'a corrupt flag fails open to shown — at most one more pill, never a nag storm')
    // the arm table, in rule order
    ok(coachArmAfterTake({ stored: COACH_SHOWN, micLive: true, heardClaps: 0 }) === null,
        'silent take on a live mic demotes shown -> cleared: the ask returns next take')
    ok(coachArmAfterTake({ stored: COACH_SHOWN, micLive: true, heardClaps: 2 }) === COACH_LEARNED,
        'a heard clap upgrades shown -> learned')
    ok(coachArmAfterTake({ stored: null, micLive: true, heardClaps: 1 }) === COACH_LEARNED,
        'habit before the pill is still habit — a clapping device is marked learned')
    ok(coachArmAfterTake({ stored: COACH_LEARNED, micLive: true, heardClaps: 0 }) === COACH_LEARNED,
        'learned rests — a quiet take after the habit landed never nags')
    ok(coachArmAfterTake({ stored: COACH_SHOWN, micLive: false, heardClaps: 0 }) === COACH_SHOWN,
        'a take with no live mic is NO evidence — declined/failed pipes change nothing')
    ok(coachArmAfterTake({ stored: null, micLive: true, heardClaps: 0 }) === null,
        'nothing to demote — a never-shown device stays never-shown')
    // the live watcher: clapSync's onset law in frame units over the VU scale
    const runWatch = (levels) => levels.reduce((s, l) => liveClapWatch(s, l), null)
    const HUM = 0.075 // the synth mic's 220 Hz hum on the VU scale
    const humOnly = Array.from({ length: 240 }, () => HUM)
    ok(runWatch(humOnly).claps === 0, 'room/synth hum never counts as a clap')
    const burst = (n, lvl = 0.95) => Array.from({ length: n }, () => lvl)
    ok(runWatch([...humOnly, ...burst(3), ...humOnly]).claps === 1,
        'one loud burst after a quiet stretch counts exactly once — a 50 ms decay sampled over many frames does not double-fire')
    ok(runWatch([...humOnly, ...burst(3), ...humOnly.slice(0, 6), ...burst(3), ...humOnly]).claps === 1,
        'a second transient within the gap window (~300 ms) is still the same burst')
    ok(runWatch([...humOnly, ...burst(3), ...humOnly, ...burst(3), ...humOnly, ...burst(3), ...humOnly]).claps === 3,
        'three claps about 2 s apart count three — the clap test\'s own cadence')
    ok(runWatch(Array.from({ length: 240 }, () => 0.9)).claps === 0,
        'sustained loud (game bleed through a speaker) never counts — no quiet stretch, no clap')
    ok(runWatch([...humOnly, 0.4, 0.45, 0.4, ...burst(3), ...humOnly]).claps === 0,
        'voice-level frames reset the quiet stretch — a transient right after speech is not proven sharp, quiet must return first')
}

// --mutate: the taxonomy flip (permanent -> keep) must poison the queue — this
// gate goes RED by design under --mutate, green without it (mutant is a
// transient file next to the source, deleted at close \u2014 relaysim's pattern).
{
    const CORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/outboxCore.js')
    const MUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/.recordcheck-mutant-core.mjs')
    const ANCHOR = "        if (code === 408 || code === 429) return 'keep'\n        return 'drop'"
    const src = fs.readFileSync(CORE, 'utf8')
    if (!src.includes(ANCHOR)) { console.log('FAIL   outbox mutant anchor not found in outboxCore.js \u2014 update recordcheck ANCHOR to match'); fail++ }
    else {
        plantNew(MUT, src.replace(ANCHOR, "        if (code === 408 || code === 429) return 'keep'\n        return 'keep' // MUTANT: permanent refusals retry forever"))
        try {
            const mutated = await import(pathToFileURL(MUT).href + `?t=${Date.now()}`)
            setOutboxFactory(fakeIDB())
            await queueRun(mkRec2('gauntlet', 606, 60), 'jon')
            const mOut = await drainOutbox({ motion: true, upload: async () => ({ uploaded: false, reason: 'http 413' }), classify: mutated.classifyFailure })
            ok(mOut.kept.length === 1 && mOut.dropped.length === 0,
                'MUTANT classifyFailure drop->keep: a 413 must stay dropped \u2014 red here means a poison entry would clog the queue')
        } finally {
            pull(MUT) // #1359 — guard also rewinds on SIGTERM/SIGINT/SIGHUP/exit
        }
    }
}

// --mutate audit 1: replace the per-name consent predicate with a shared
// flag. The gate below asserts on the MUTANT module that a revoked player's
// take STILL purges — red means revoked humans' recordings would ship.
{
    const CORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/outboxCore.js')
    const MUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/.recordcheck-mutant-names.mjs')
    const ANCHOR = "    const motionOf = typeof motion === 'function' ? motion : () => !!motion"
    const src = fs.readFileSync(CORE, 'utf8')
    if (!src.includes(ANCHOR)) { console.log('FAIL   names mutant anchor not found in outboxCore.js \u2014 update recordcheck ANCHOR to match'); fail++ }
    else {
        plantNew(MUT, src.replace(ANCHOR, "    const motionOf = () => true // MUTANT: per-name consent ignored"))
        try {
            const mutated = await import(pathToFileURL(MUT).href + `?t=${Date.now()}`)
            const pdm = mutated.planDrain([{ id: 'j', player: 'jon', savedAt: 1 }, { id: 'm', player: 'mia', savedAt: 2 }], { motion: (e) => e.player === 'jon', now: 3 })
            ok(pdm.send.length === 2 && pdm.drop.length === 0,
                'MUTANT per-name consent ignored: both names ship regardless \u2014 the real module must (and does, above) purge revoked mia')
        } finally {
            pull(MUT)
        }
    }
}

server.closeAllConnections()
server.close()
console.log(`\nrecordcheck: ${pass}/${pass + fail} checks passed — ${fail ? 'FAILED' : MUTATE ? 'RED BY DESIGN (--mutate)' : 'OK'}`)
if (fail && !MUTATE) process.exit(1)
if (!fail && MUTATE) { console.log('mutate: expected red, got green — mutant did NOT bite'); process.exit(1) }
