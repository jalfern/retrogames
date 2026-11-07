// RELAYCHECK (#1711 S5) — run the PRODUCTION relay worker in Node and prove
// the store's HTTP surface: capability flags, CORS, the consent door against
// hand-crafted envelopes (the acceptance line's "mutant that tries", now
// graded by the deployed file itself), a byte-exact upload→GET round-trip, the
// R2 metadata round-trip that feeds the admin listing, key-shape refusals,
// and the real client (src/utils/sessionStore.js) composing with the real
// server. recordcheck grades the CLIENT rules; this grades the FILE the phone
// will actually talk to after #1730 binds the bucket.
//
//   npm run relaycheck            # green
//   npm run relaycheck -- --mutate   # RED by design: relaysim strips the
//       `if (!v.ok)` door from relay/worker.js SOURCE — the unconsented POST
//       lands. One line, the deployed file, load-bearing. (Hand equivalent:
//       delete that line in worker.js, run this, restore.)
//
// The worker runs via scripts/lib/relaysim.mjs (cloudflare:workers shim + a
// faithful in-memory R2). Node >= 22 (module.register).

import { startRelaySim } from './lib/relaysim.mjs'
import { validate, REC_FORMAT, REC_FORMAT_V2 } from '../src/utils/recording.js'
import { validateSessionEnvelope } from '../relay/core.js'
import { uploadSession, listSessions, probeStore } from '../src/utils/sessionStore.js'

const MUTATE = process.argv.includes('--mutate')
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// a structurally valid v1/v2 recording (same math as recordcheck's mkRec —
// tiny, hashes are not replayed here; relaycheck grades transport + doors).
const mkRec = (v2 = false, n = 60) => {
    const slots = Array.from({ length: 2 }, () => ({ source: { kind: 'human' }, pads: [], raw: [] }))
    const hashes = []
    for (let i = 1; i <= n; i++) {
        slots[0].pads.push(i % 10 < 5 ? { right: true } : {})
        slots[1].pads.push({})
        slots[0].raw.push({ x: i % 10 < 5 ? 0.7 : 0 })
        slots[1].raw.push({})
        if (i % 30 === 0) hashes.push({ t: i, h: (i * 7919) % 1000000007 })
    }
    if (!hashes.length || hashes[hashes.length - 1].t !== n) hashes.push({ t: n, h: (n * 7919) % 1000000007 })
    const rec = { format: REC_FORMAT, build: 'relaycheck', game: 'gauntlet', method: 'dpad', seed: 11, players: 2, ticks: n, hashEvery: 30, slots, hashes }
    if (v2) {
        rec.format = REC_FORMAT_V2
        rec.voice = { tracks: [{ slots: [0], consent: true, headset: false, mime: 'audio/webm;codecs=opus', ms: Math.round(n * 16.67), clock: [{ t: 1, ms: 0 }, { t: n, ms: Math.round(n * 16.67) }], b64: 'QUJD' }] }
    }
    return rec
}

const post = async (base, body, headers = {}) => {
    const res = await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
    let json = null
    try { json = await res.json() } catch { /* non-json answer is itself a finding */ }
    return { status: res.status, json, headers: res.headers }
}

// --- bound store: capability + honest answers -----------------------------------
{
    const sim = startRelaySim ? await startRelaySim() : null
    ok(!!sim, 'worker boots in Node (cloudflare:workers shim holds)')

    const st = await (await fetch(`${sim.base}/status`)).json()
    ok(st.ok === true && st.sessions === true, '/status advertises sessions:true with the bucket bound', JSON.stringify(st))
    ok(st.feedback === false && st.jonKey === false, '/status keeps the other capability bools honest (no secrets set)')

    // real client composes with the real server:
    const probe = await probeStore(sim.base)
    ok(probe.ok && probe.sessions === true, 'probeStore sees the real worker answering')

    const up1 = await uploadSession(mkRec(false), { player: 'jon', consent: { motion: true, voice: false, at: 1 }, base: sim.base })
    ok(up1.ok && !!up1.key, 'v1 upload via the real client hits the real route', JSON.stringify(up1))
    ok(up1.key && /^[a-z0-9][a-z0-9-]{0,40}\/[0-9-]{10}-seed\d+-[a-f0-9]{10}\.json$/.test(up1.key), `key from the worker matches the GET-route shape (${up1.key})`)
    const rec2 = mkRec(true)
    const up2 = await uploadSession(rec2, { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: sim.base })
    ok(up2.ok && !!up2.key, 'v2 (voice) upload accepted with both consents')

    const back = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(up1.key)}`)).text()
    ok(back === JSON.stringify(mkRec(false)), 'GET round-trip: bytes land exactly as the client sent them')
    const back2 = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(up2.key)}`)).json()
    ok(JSON.stringify(back2) === JSON.stringify(rec2), 'v2 voice bytes survive the R2 mock unmodified')

    // admin listing metadata: put(customMetadata) → head() → sessionRow.
    const listed = await listSessions({ base: sim.base })
    ok(listed.ok && listed.sessions.length === 2, 'admin listing sees both uploads through worker.js')
    const row2 = listed.sessions.find((s) => s.key === up2.key)
    const row1 = listed.sessions.find((s) => s.key === up1.key)
    ok(row1 && row2 && row1.game === 'gauntlet' && row1.seed === 11 && row1.ticks === 60 && row1.player === 'jon', 'listing fields survive the metadata round-trip', JSON.stringify(row1))
    ok(row2 && row2.audio === true && row1.audio === false, 'audio flag comes from the stored file, per row')
    ok(listed.sessions[0].key <= listed.sessions[1].key, 'listing is key-ordered (R2 lexicographic semantics preserved)')

    // key-shape refusals run through the worker's own regex:
    const badKey = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/nope.json')}`)
    ok(badKey.status === 400, 'malformed key refused by the GET route regex', `http ${badKey.status}`)
    const missing = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/2026-11-06-seed1-deadbeefca.json')}`)
    ok(missing.status === 404, 'unknown key answers an honest 404')

    sim.close()
}

// --- the consent door, graded by the deployed file -----------------------------
// Under --mutate this section runs against the door-stripped copy (see
// relaysim): every refusal here goes RED and the unconsented bytes land —
// the acceptance line's mutant, executed against worker.js SOURCE.
{
    const sim = await startRelaySim({ mutate: MUTATE })
    const door = await post(sim.base, { recording: mkRec(false), player: 'mallory', consent: { motion: false } })
    ok(door.status === 400 && door.json && door.json.err === 'consent.motion required', 'worker refuses an unconsented envelope (acceptance mutant attempt)', JSON.stringify(door.json))
    const sneak = await post(sim.base, { recording: mkRec(true), player: 'mallory', consent: { motion: true } })
    ok(sneak.status === 400 && sneak.json && /voice/.test(sneak.json.err || ''), 'worker refuses voice bytes without the voice grant', JSON.stringify(sneak.json))
    ok(sim.bucket._map.size === 0, 'the refused POSTs wrote NOTHING to the bucket')
    const junk = await post(sim.base, 'not json at all{')
    ok(junk.status === 400 && junk.json && junk.json.err === 'bad json', 'malformed JSON refused before anything reads it')
    const noPlayer = await post(sim.base, { recording: mkRec(false), consent: { motion: true } })
    ok(noPlayer.status === 400, 'envelope without a player label refused')
    const traversal = await post(sim.base, { recording: { ...mkRec(false), game: 'Up/../../etc' }, player: 'mallory', consent: { motion: true } })
    ok(traversal.status === 400, 'path-traversal game id refused at the door')
    const huge = await post(sim.base, 'a'.repeat(20_000_010))
    ok(huge.status === 413, 'oversized body refused by the SES_MAX_BODY cap (before parse)', `http ${huge.status}`)
    sim.close()
}

// --- CORS: the arcade is allowed, strangers are not ---------------------------
{
    const sim = await startRelaySim()
    const pre = await fetch(`${sim.base}/sessions`, { method: 'OPTIONS', headers: { origin: 'https://jalfern.com' } })
    ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://jalfern.com', 'preflight from the arcade origin opens the POST door', `http ${pre.status}`)
    ok(/POST/.test(pre.headers.get('access-control-allow-methods') || ''), 'preflight allows POST')
    const evil = await fetch(`${sim.base}/sessions`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
    ok(!evil.headers.get('access-control-allow-origin'), 'stranger origin gets NO allow header (browser blocks it)')
    const dev = await fetch(`${sim.base}/sessions`, { headers: { origin: 'http://localhost:5173' } })
    ok(dev.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'localhost dev/QA origins are allowed through')
    sim.close()
}

// --- unbound store: the honest 503 pair + dead registry ------------------------
{
    const sim = await startRelaySim({ bind: false })
    const st = await (await fetch(`${sim.base}/status`)).json()
    ok(st.ok === true && st.sessions === false, 'no bucket: /status says sessions:false (clients hide the affordance)')
    const up = await post(sim.base, { recording: mkRec(false), player: 'jon', consent: { motion: true } })
    ok(up.status === 503 && up.json && up.json.err === 'store not configured', 'upload against an unbound store answers an honest 503, never writes')
    const list = await (await fetch(`${sim.base}/sessions`)).json()
    ok(list.ok === false && list.err === 'store not configured', 'listing against an unbound store answers honestly too')
    sim.close()

    const dead = await startRelaySim({ registry: 'dead' })
    const res = await fetch(`${dead.base}/status`)
    const st2 = await res.json()
    ok(res.status === 200 && st2.ok === true && st2.rooms === -1 && st2.sessions === true, 'a dead registry cannot sink /status (rooms=-1, store capability still true)', JSON.stringify(st2))
    dead.close()
}

// cross-check: what the worker enforces IS core's contract (shared, not drifted)
ok(typeof validateSessionEnvelope === 'function' && validate(mkRec(true)) === null, 'the envelopes graded here are structurally valid rec files')

console.log(`\nrelaycheck: ${pass}/${pass + fail} checks passed — ${fail ? (MUTATE ? 'RED BY DESIGN (--mutate)' : 'FAILED') : 'OK'}`)
if (fail && !MUTATE) process.exit(1)
if (!fail && MUTATE) { console.log('mutate: expected red, got green — the door line is not load-bearing?'); process.exit(1) }
