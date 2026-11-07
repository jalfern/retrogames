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
//   Hand-mutant proof: delete the `if (!c.motion)` line in src/utils/
//   consent.js#uploadAllowed -> this script goes red at the consent gates.
//
// The stub store implements relay/core.js's real envelope validation against an
// in-memory bucket, so the client is graded against the same rules the worker
// enforces — contract shared, not duplicated.

import http from 'node:http'
import { validate, verifyRecording, REC_FORMAT, REC_FORMAT_V2 } from '../src/utils/recording.js'
import { createVoiceClock, tickToMs } from '../src/utils/voice.js'
import { loadConsent, grantConsent, revokeConsent, consentFor, uploadAllowed, CONSENT_LS_KEY, CONSENT_GRACE_MS } from '../src/utils/consent.js'
import { validateSessionEnvelope, sessionKey, sessionMeta, sessionRow } from '../relay/core.js'
import { uploadSession, listSessions, probeStore, storeFromQuery, tickSeconds } from '../src/utils/sessionStore.js'
import { planRun, decideMerge } from '../src/utils/autoRecordCore.js'
import { armLiveCapture, autoStart, autoStop, recordLiveTick, isRecording } from '../src/utils/gameContract.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { planAdd, planDrain, classifyFailure, OUTBOX_MAX_ITEMS } from '../src/utils/outboxCore.js'
import { makeOutbox, setOutboxFactory, queueRun, drain as drainOutbox, dropEntry } from '../src/utils/outbox.js'

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
    ok(autoStart({ voiceConsent: false }) === true, 'autoStart opens the recorder at seed-birth')
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

// --- clap sync: the ±50 ms acceptance line, pure twin of the browser proof --
// (#1711 S3) scripts/plaicraft-clap.mjs runs these two functions on bytes that
// came out of the real MediaRecorder; here synthetic PCM pins the same verdicts
// offline — including the ones that MUST fail (shifted clock, dropped clap),
// so the clap verdict is provably load-bearing before a single mic opens.
{
    const { detectClaps, clapVerdict, CLAP_TOL_MS } = await import('../src/utils/clapSync.js')
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
        fs.writeFileSync(MUT, src.replace(ANCHOR, "        if (code === 408 || code === 429) return 'keep'\n        return 'keep' // MUTANT: permanent refusals retry forever"))
        try {
            const mutated = await import(pathToFileURL(MUT).href + `?t=${Date.now()}`)
            setOutboxFactory(fakeIDB())
            await queueRun(mkRec2('gauntlet', 606, 60), 'jon')
            const mOut = await drainOutbox({ motion: true, upload: async () => ({ uploaded: false, reason: 'http 413' }), classify: mutated.classifyFailure })
            ok(mOut.kept.length === 1 && mOut.dropped.length === 0,
                'MUTANT classifyFailure drop->keep: a 413 must stay dropped \u2014 red here means a poison entry would clog the queue')
        } finally {
            fs.rmSync(MUT, { force: true })
        }
    }
}

server.closeAllConnections()
server.close()
console.log(`\nrecordcheck: ${pass}/${pass + fail} checks passed — ${fail ? 'FAILED' : MUTATE ? 'RED BY DESIGN (--mutate)' : 'OK'}`)
if (fail && !MUTATE) process.exit(1)
if (!fail && MUTATE) { console.log('mutate: expected red, got green — mutant did NOT bite'); process.exit(1) }
