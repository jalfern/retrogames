// RELAYCHECK (#1711 S5) — run the PRODUCTION relay worker in Node and prove
// the store's HTTP surface: capability flags, CORS, the consent door against
// hand-crafted envelopes (the acceptance line's "mutant that tries", now
// graded by the deployed file itself), a byte-exact upload→GET round-trip, the
// R2 metadata round-trip that feeds the admin listing, key-shape refusals,
// the relabel write (#2093 item 1 — the fixed model→human operation behind the
// same lockdown), and the real client (src/utils/sessionStore.js) composing
// with the real
// server. recordcheck grades the CLIENT rules; this grades the FILE the phone
// will actually talk to after #1730 binds the bucket.
//
//   npm run relaycheck            # green
//   npm run relaycheck -- --mutate   # RED by design: relaysim strips the
//       `if (!v.ok)` door from relay/worker.js SOURCE — the unconsented POST
//       lands. One line, the deployed file, load-bearing. (Hand equivalent:
//       delete that line in worker.js, run this, restore.)
//   npm run relaycheck -- --mutate-readlock   # RED by design (#1711 S8):
//       strips the read-lock doors — the no-key reads Jon asked to see
//       refused, and the no-key relabel write, would LAND. (Hand equivalent:
//       delete the `if (d) return d` lines in worker.js, run this, restore.)
//
// The worker runs via scripts/lib/relaysim.mjs (cloudflare:workers shim + a
// faithful in-memory R2). Node >= 22 (module.register).

import { startRelaySim, SIM_READ_KEY, SIM_WRITE_KEY } from './lib/relaysim.mjs'
import { validate, REC_FORMAT, REC_FORMAT_V2 } from '../src/utils/recording.js'
import { validateSessionEnvelope, sessionReadOk, sessionWriteOk, validateSessionPatch, applySessionRelabel, countsAsHumanSource, auditTakeSources } from '../relay/core.js'
import { uploadSession, listSessions, probeStore, relabelSession } from '../src/utils/sessionStore.js'

const MUTATE = process.argv.includes('--mutate')
const MUTATE_RL = process.argv.includes('--mutate-readlock')
const MUTATE_ANY = MUTATE || MUTATE_RL
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
    ok(st.jonKey === true, '/status advertises jonKey:true (the read lockdown has a key to check against)', JSON.stringify(st))
    ok(st.feedback === false, '/status keeps feedback honest (GH token not set)')

    // real client composes with the real server:
    const probe = await probeStore(sim.base)
    ok(probe.ok && probe.sessions === true, 'probeStore sees the real worker answering')

    const up1 = await uploadSession(mkRec(false), { player: 'jon', consent: { motion: true, voice: false, at: 1 }, base: sim.base })
    ok(up1.ok && !!up1.key, 'v1 upload via the real client hits the real route', JSON.stringify(up1))
    ok(up1.key && /^[a-z0-9][a-z0-9-]{0,40}\/[0-9-]{10}-seed\d+-[a-f0-9]{10}\.json$/.test(up1.key), `key from the worker matches the GET-route shape (${up1.key})`)
    const rec2 = mkRec(true)
    const up2 = await uploadSession(rec2, { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: sim.base })
    ok(up2.ok && !!up2.key, 'v2 (voice) upload accepted with both consents')

    const back = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(up1.key)}`, { headers: sim.readHeaders })).text()
    ok(back === JSON.stringify(mkRec(false)), 'GET round-trip: bytes land exactly as the client sent them')
    const back2 = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(up2.key)}`, { headers: sim.readHeaders })).json()
    ok(JSON.stringify(back2) === JSON.stringify(rec2), 'v2 voice bytes survive the R2 mock unmodified')

    // admin listing metadata: put(customMetadata) → head() → sessionRow.
    const listed = await listSessions({ base: sim.base, key: SIM_READ_KEY })
    ok(listed.ok && listed.sessions.length === 2, 'admin listing sees both uploads through worker.js')
    const row2 = listed.sessions.find((s) => s.key === up2.key)
    const row1 = listed.sessions.find((s) => s.key === up1.key)
    ok(row1 && row2 && row1.game === 'gauntlet' && row1.seed === 11 && row1.ticks === 60 && row1.player === 'jon', 'listing fields survive the metadata round-trip', JSON.stringify(row1))
    ok(row2 && row2.audio === true && row1.audio === false, 'audio flag comes from the stored file, per row')
    ok(listed.sessions[0].key <= listed.sessions[1].key, 'listing is key-ordered (R2 lexicographic semantics preserved)')

    // key-shape refusals run through the worker's own regex (with the read
    // key so they reach the shape check instead of the lockdown):
    const badKey = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/nope.json')}`, { headers: sim.readHeaders })
    ok(badKey.status === 400, 'malformed key refused by the GET route regex', `http ${badKey.status}`)
    const missing = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/2026-11-06-seed1-deadbeefca.json')}`, { headers: sim.readHeaders })
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
    ok(/PATCH/.test(pre.headers.get('access-control-allow-methods') || ''), 'preflight allows PATCH (the relabel write reaches the worker, #2093 item 1)', pre.headers.get('access-control-allow-methods'))
    const evil = await fetch(`${sim.base}/sessions`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })
    ok(!evil.headers.get('access-control-allow-origin'), 'stranger origin gets NO allow header (browser blocks it)')
    const dev = await fetch(`${sim.base}/sessions`, { headers: { origin: 'http://localhost:5173' } })
    ok(dev.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'localhost dev/QA origins are allowed through')
    sim.close()
}

// --- READ LOCKDOWN (#1711 S8) — reads answer only to the key ------------------------------
// Jon 2026-11-11 19:14Z: "GET /sessions and GET /sessions/<key> have no auth,
// so anyone with the URL could list and download voice recordings." These gates
// pin the door. Under --mutate-readlock the doors are stripped from worker.js
// SOURCE and the no-key reads LAND — the mutant Jon asked for, graded by the
// deployed file.
{
    const sim = await startRelaySim({ mutateReadlock: MUTATE_RL })
    const rlUp = await uploadSession(mkRec(true), { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: sim.base })
    ok(rlUp.ok && !!rlUp.key, 'uploads still need NO key (Jon: uploads stay as they are)', JSON.stringify(rlUp))

    // These four assert the SECURE behaviour unconditionally: under
    // --mutate-readlock the doors are gone, the no-key reads LAND with 200
    // rows/bytes, and exactly these gates go red — the mutant grading Jon
    // asked for ("a read without the key is refused").
    const listNoKey = await fetch(`${sim.base}/sessions`)
    const listNoKeyJson = await listNoKey.json().catch(() => null)
    ok(listNoKey.status === 401 && listNoKeyJson && listNoKeyJson.err === 'unauthorized',
        'GET /sessions without the key is refused (the acceptance mutant: dies when the door is stripped)', `http ${listNoKey.status}`)
    const listWrong = await fetch(`${sim.base}/sessions`, { headers: { 'x-session-key': 'not-the-key' } })
    ok(listWrong.status === 401, 'GET /sessions with the wrong key is refused', `http ${listWrong.status}`)
    const getNoKey = await fetch(`${sim.base}/sessions/${encodeURIComponent(rlUp.key)}`)
    ok(getNoKey.status === 401, 'GET /sessions/<key> without the key is refused — voice bytes never reach the URL-holder', `http ${getNoKey.status}`)
    const getWrong = await fetch(`${sim.base}/sessions/${encodeURIComponent(rlUp.key)}`, { headers: { 'x-session-key': 'not-the-key' } })
    ok(getWrong.status === 401, 'GET /sessions/<key> with the wrong key is refused', `http ${getWrong.status}`)
    const listKeyed = await listSessions({ base: sim.base, key: SIM_READ_KEY })
    ok(listKeyed.ok && listKeyed.sessions.some((s) => s.key === rlUp.key), 'with the key the admin read still works (lockdown, not lockout)')
    const getOk = await fetch(`${sim.base}/sessions/${encodeURIComponent(rlUp.key)}`, { headers: sim.readHeaders })
    ok(getOk.status === 200, 'with the key the download still lands')
    const pre2 = await fetch(`${sim.base}/sessions`, { method: 'OPTIONS', headers: { origin: 'https://jalfern.com' } })
    ok(/x-session-key/i.test(pre2.headers.get('access-control-allow-headers') || ''), 'preflight opens x-session-key (browsers can present the key)', pre2.headers.get('access-control-allow-headers'))

    // the rule itself, pinned pure (constant-time core, not just transport):
    ok(sessionReadOk(SIM_READ_KEY, SIM_READ_KEY) === true, 'core: the correct key is accepted')
    ok(sessionReadOk('x'.repeat(SIM_READ_KEY.length), SIM_READ_KEY) === false, 'core: a same-length wrong key is refused')
    ok(sessionReadOk('a'.repeat(999), SIM_READ_KEY) === false, 'core: an over-long guess is refused')
    ok(sessionReadOk(null, SIM_READ_KEY) === false && sessionReadOk('', SIM_READ_KEY) === false, 'core: missing/empty key refused')
    ok(sessionReadOk(SIM_READ_KEY, null) === false && sessionReadOk(SIM_READ_KEY, '') === false, 'core: no deployed secret = fail closed, nobody reads')
    sim.close()

    // fail-closed pre-deploy worker: bucket bound, JON_KEY absent -> reads
    // refused with an honest reason distinct from 'unauthorized'; uploads live.
    if (!MUTATE_RL) {
        const simNoKey = await startRelaySim({ readKey: null })
        const nc = await (await fetch(`${simNoKey.base}/sessions`)).json().catch(() => null)
        ok(nc && nc.ok === false && nc.err === 'read lock not configured', 'no JON_KEY deployed: reads fail closed naming the arm state', JSON.stringify(nc))
        const ncUp = await uploadSession(mkRec(false), { player: 'jon', consent: { motion: true }, base: simNoKey.base })
        ok(ncUp.ok, 'no JON_KEY deployed: uploads unaffected (the lockdown gates reads only)')
        const st3 = await (await fetch(`${simNoKey.base}/status`)).json()
        ok(st3.jonKey === false && st3.sessions === true, 'status tells the two apart before deploy: jonKey:false + sessions:true', JSON.stringify(st3))
        simNoKey.close()
    }
}

// --- RELABEL WRITE (#2093 item 1) — the fixed model->human repair ----------
// The three iPhone takes stored before #2090 carry seat 0 as 'model' although
// auto-record only captures human starts. The store's one permitted write:
// JON_KEY-gated (the same door as reads — under --mutate-readlock the no-key
// PATCH lands and these gates go red), operation FIXED (core pins every other
// edit refused), auditable (the answer names the change; GET shows it).
{
    // the rule pure first — what the worker is allowed to do at all:
    const pOk = validateSessionPatch({ seat: 0 })
    ok(pOk.ok === true && pOk.seat === 0, 'core: a bare {seat} patch is the whole surface')
    ok(validateSessionPatch({ seat: 0, kind: 'cpu' }).ok === false, 'core: any extra patch field refused (SHAPE law, fail-closed)')
    ok(validateSessionPatch({ seat: '0' }).ok === false && validateSessionPatch({ seat: 4 }).ok === false && validateSessionPatch({}).ok === false, 'core: non-integer / out-of-range / missing seat refused')
    const modelRec = mkRec(true)
    modelRec.slots[0].source = { kind: 'model', modelId: 'qwen-x' }
    const rel = applySessionRelabel(modelRec, 0, { now: 1763000000000 })
    const src0 = rel.rec.slots[0].source
    ok(rel.ok === true && src0.kind === 'human' && src0.relabeledFrom === 'model' && src0.modelId === 'qwen-x' && src0.relabeledAt === new Date(1763000000000).toISOString(),
        'core: model->human applied WITH the audit stamp #2142 — relabeledFrom, modelId KEPT, relabeledAt', JSON.stringify(src0))
    ok(modelRec.slots[0].source.kind === 'model', 'core: the input object is never half-mutated (a NEW rec comes back)')
    ok(rel.rec.slots[1].source.kind === 'human' && rel.rec.voice === modelRec.voice, 'core: every byte outside the patched seat survives untouched')
    ok(applySessionRelabel(rel.rec, 0).ok === false, 'core: the reverse (human->model) is REFUSED — provenance cannot be laundered')
    ok(applySessionRelabel(modelRec, 1).ok === false && applySessionRelabel(modelRec, 7).ok === false, 'core: non-model kinds and out-of-take seats refused')
    ok(applySessionRelabel({ ...modelRec, slots: [modelRec.slots[0]] }, 1).ok === false, 'core: a seat the take does not have is refused')
    ok(applySessionRelabel({ ...modelRec, slots: [{ source: null, pads: [], raw: [] }] }, 0).ok === false, 'core: a seat with no source is refused (nothing to relabel)')

    // HUMAN-EVIDENCE GRADING (#2142 finding 1c) — a relabeled seat carries its
    // stamp, and grading refuses to read a stamp as thumbs. This is the rule
    // that makes "relabel a CPU/model take" worthless for the acceptance line.
    ok(countsAsHumanSource({ kind: 'human' }) === true, 'audit: native human counts')
    ok(countsAsHumanSource({ kind: 'human', relabeledFrom: 'model', modelId: 'qwen-x', relabeledAt: 'x' }) === false, 'audit: a RELABELED seat does NOT count as human evidence')
    ok(countsAsHumanSource({ kind: 'cpu' }) === false && countsAsHumanSource({ kind: 'model' }) === false && countsAsHumanSource(null) === false, 'audit: cpu/model/no-source never count')
    const auditMixed = auditTakeSources({ slots: [{ source: { kind: 'human' } }, { source: { kind: 'cpu' } }, { source: { kind: 'model' } }] })
    ok(auditMixed.human === 1 && auditMixed.relabeled === 0 && auditMixed.other === 2, 'audit: mixed take graded 1 native human / 2 other', JSON.stringify(auditMixed))
    const launderTry = auditTakeSources(applySessionRelabel(modelRec, 0, { now: 1 }).rec)
    ok(launderTry.human === 1 && launderTry.relabeled === 1, 'audit: relabeling seat 0 of a model take yields 0 EXTRA native human seats — the relabeled seat is flagged, not laundered', JSON.stringify(launderTry))
    const allBot = { slots: [{ source: { kind: 'model', modelId: 'qwen-x' } }, { source: { kind: 'cpu' } }] }
    ok(auditTakeSources(allBot).human === 0 && auditTakeSources(applySessionRelabel(allBot, 0, { now: 1 }).rec).human === 0, 'audit: a bot-driven take never reaches human:1, relabeled or not — it cannot satisfy "Jon plays 3 sessions"')

    // the deployed file, transport end. Order matters for honest mutant grading:
    // the FEATURE round-trip runs first on take A; the security probes get a
    // fresh take B — under --mutate-readlock the unlocks LAND (that is the
    // mutant signal, all 3 gates red) and never cascade through the feature
    // checks as confusing 422s.
    const sim = await startRelaySim({ mutateReadlock: MUTATE_RL })
    const pUp = await uploadSession(modelRec, { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: sim.base })
    ok(pUp.ok && !!pUp.key, 'a model-sourced take uploads (the broken provenance the repair exists for)', JSON.stringify(pUp))
    const badShape = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/nope.json')}`, { method: 'PATCH', headers: sim.readHeaders, body: '{"seat":0}' })
    ok(badShape.status === 400, 'malformed key refused by the PATCH route regex', `http ${badShape.status}`)
    const pMissing = await fetch(`${sim.base}/sessions/${encodeURIComponent('gauntlet/2026-11-06-seed1-deadbeefca.json')}`, { method: 'PATCH', headers: sim.readHeaders, body: '{"seat":0}' })
    ok(pMissing.status === 404, 'unknown key answers an honest 404 to PATCH too')
    const badBody = await fetch(`${sim.base}/sessions/${encodeURIComponent(pUp.key)}`, { method: 'PATCH', headers: sim.readHeaders, body: '{"seat":0,"kind":"cpu"}' })
    ok(badBody.status === 400 && badBody.headers.get('content-type'), 'a general-editor body refused at the door (unknown patch field)', `http ${badBody.status}`)

    // the real client composing with the real server — the tool's exact path:
    const relClient = await relabelSession(pUp.key, { seat: 0, base: sim.base, key: SIM_READ_KEY })
    ok(relClient.ok === true, 'client relabelSession applied through worker.js', JSON.stringify(relClient))
    const after = await (await fetch(`${sim.base}/sessions/${encodeURIComponent(pUp.key)}`, { headers: sim.readHeaders })).json()
    ok(after.slots[0].source.kind === 'human' && after.slots[0].source.relabeledFrom === 'model' && after.slots[0].source.modelId === 'qwen-x' && !!after.slots[0].source.relabeledAt,
        'GET back: the relabel landed on the stored FILE and carries the audit stamp (#2142)', JSON.stringify(after.slots[0].source))
    ok(auditTakeSources(after).relabeled === 1, 'GET back: the deployed file grades the relabeled seat as flagged, not laundered', JSON.stringify(auditTakeSources(after)))
    ok(JSON.stringify(after.slots[1]) === JSON.stringify(modelRec.slots[1]), 'GET back: the other seat byte-identical')
    ok(JSON.stringify(after.voice) === JSON.stringify(modelRec.voice), 'GET back: voice bytes untouched by the write')
    const rowAfter = (await listSessions({ base: sim.base, key: SIM_READ_KEY })).sessions.find((s) => s.key === pUp.key)
    ok(rowAfter && rowAfter.audio === true && rowAfter.player === 'jon' && !!rowAfter.uploadedAt, 'metadata survives the rewrite (player, audio flag, uploadedAt)', JSON.stringify(rowAfter))
    const twice = await relabelSession(pUp.key, { seat: 0, base: sim.base, key: SIM_READ_KEY })
    ok(twice.ok === false && /only 'model'/.test(twice.reason || ''), 'relabeling the same seat twice refused — the repair is one-way', JSON.stringify(twice))
    const seat1 = await relabelSession(pUp.key, { seat: 1, base: sim.base, key: SIM_READ_KEY })
    ok(seat1.ok === false && /kind is 'human'/.test(seat1.reason || ''), 'PATCHing an already-human seat refused with the reason verbatim', JSON.stringify(seat1))

    // security probes on a FRESH model-sourced take B: these are the gates
    // --mutate-readlock exists to kill.
    const pUp2 = await uploadSession(modelRec, { player: 'mallory', consent: { motion: true, voice: true, at: 1 }, base: sim.base })
    const patchNoKey = await fetch(`${sim.base}/sessions/${encodeURIComponent(pUp2.key)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"seat":0}' })
    ok(patchNoKey.status === 401, 'PATCH without the key is refused — a URL-holder edits nothing (dies under --mutate-readlock)', `http ${patchNoKey.status}`)
    const patchWrong = await fetch(`${sim.base}/sessions/${encodeURIComponent(pUp2.key)}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-session-key': 'not-the-key' }, body: '{"seat":0}' })
    ok(patchWrong.status === 401, 'PATCH with the wrong key is refused', `http ${patchWrong.status}`)
    const noKeyClient = await relabelSession(pUp2.key, { seat: 0, base: sim.base })
    ok(noKeyClient.ok === false && noKeyClient.reason === 'unauthorized', 'client without the key surfaces the lockdown honestly')
    const afterB = JSON.parse(sim.bucket._map.get(pUp2.key).value)
    ok(afterB.slots[0].source.kind === 'model', 'the refused probes wrote NOTHING to take B', JSON.stringify(afterB.slots[0].source))
    sim.close()
}

// --- WRITE-KEY SEPARATION (#2142 finding 1b) ----------------------------------
// #2157 will put the lanes' READ key into a lane-readable file. The relabel
// PATCH must survive that: when SESSION_WRITE_KEY is deployed, ONLY the write
// key opens it — the read key degrades to exactly what its name promises.
// Pre-deploy, JON_KEY still opens the door (status quo), but the stamp in the
// file keeps any relabel in that window visible, and /status `writeKey` makes
// the window itself detectable.
{
    // the rule pure first (constant-time, fail-closed on both edges):
    ok(sessionWriteOk(SIM_WRITE_KEY, SIM_WRITE_KEY, SIM_READ_KEY) === true, 'audit: separation deployed — the write key opens PATCH')
    ok(sessionWriteOk(SIM_READ_KEY, SIM_WRITE_KEY, SIM_READ_KEY) === false, 'audit: separation deployed — the READ key alone edits nothing (the #2157 shape)')
    ok(sessionWriteOk(SIM_READ_KEY, null, SIM_READ_KEY) === true, 'audit: separation not deployed — JON_KEY fallback keeps the tool working')
    ok(sessionWriteOk(null, SIM_WRITE_KEY, SIM_READ_KEY) === false && sessionWriteOk('x', null, null) === false, 'audit: no key offered / no secret deployed — fail closed')

    const simW = await startRelaySim({ writeKey: SIM_WRITE_KEY })
    const stW = await (await fetch(`${simW.base}/status`)).json()
    ok(stW.ok === true && stW.jonKey === true && stW.writeKey === true, 'status announces both secrets presence-only so callers can check separation', JSON.stringify(stW))
    const sepRec = mkRec(true)
    sepRec.slots[0].source = { kind: 'model', modelId: 'qwen-x' }
    const upW = await uploadSession(sepRec, { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: simW.base })
    ok(upW.ok && !!upW.key, 'the separated worker still accepts uploads (phones never carry keys)')
    const readKeyPatch = await relabelSession(upW.key, { seat: 0, base: simW.base, key: SIM_READ_KEY })
    ok(readKeyPatch.ok === false && readKeyPatch.reason === 'unauthorized', 'read-key relabel REFUSED once separation is deployed — the key #2157 distributes cannot launder', JSON.stringify(readKeyPatch))
    ok(JSON.parse(simW.bucket._map.get(upW.key).value).slots[0].source.kind === 'model', 'the refused read-key attempt wrote nothing')
    const withWrite = await relabelSession(upW.key, { seat: 0, base: simW.base, key: SIM_WRITE_KEY })
    ok(withWrite.ok === true && !!withWrite.relabeledAt, 'write-key relabel succeeds and reports relabeledAt', JSON.stringify(withWrite))
    ok(JSON.parse(simW.bucket._map.get(upW.key).value).slots[0].source.relabeledFrom === 'model', 'write-key relabel stored the audit stamp end-to-end')

    // reads still ride the READ key while separation is on (lanes grade,
    // lanes never edit):
    const listW = await listSessions({ base: simW.base, key: SIM_READ_KEY })
    ok(listW.ok === true && listW.sessions.length >= 1, 'read key still lists after separation — read-only access is intact (#2157 dependency)')
    simW.close()

    const simFb = await startRelaySim()
    const stFb = await (await fetch(`${simFb.base}/status`)).json()
    ok(stFb.jonKey === true && stFb.writeKey === false, 'pre-separation status: writeKey:false — the fallback window is detectable, never silent', JSON.stringify(stFb))
    const upFb = await uploadSession(sepRec, { player: 'jon', consent: { motion: true, voice: true, at: 1 }, base: simFb.base })
    const fbRel = await relabelSession(upFb.key, { seat: 0, base: simFb.base, key: SIM_READ_KEY })
    ok(fbRel.ok === true && !!fbRel.relabeledAt, 'pre-separation deploy: the JON_KEY tool keeps working (status quo), WITH the stamp')
    ok(JSON.parse(simFb.bucket._map.get(upFb.key).value).slots[0].source.relabeledFrom === 'model', 'even during the fallback window the trace lands in the file')
    simFb.close()
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
    const patchUnbound = await fetch(`${sim.base}/sessions/gauntlet/2026-11-06-seed1-deadbeefca.json`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-session-key': SIM_READ_KEY }, body: '{"seat":0}' })
    ok(patchUnbound.status === 503, 'relabel against an unbound store answers an honest 503, never writes')
    sim.close()

    const dead = await startRelaySim({ registry: 'dead' })
    const res = await fetch(`${dead.base}/status`)
    const st2 = await res.json()
    ok(res.status === 200 && st2.ok === true && st2.rooms === -1 && st2.sessions === true, 'a dead registry cannot sink /status (rooms=-1, store capability still true)', JSON.stringify(st2))
    dead.close()
}

// cross-check: what the worker enforces IS core's contract (shared, not drifted)
ok(typeof validateSessionEnvelope === 'function' && validate(mkRec(true)) === null, 'the envelopes graded here are structurally valid rec files')

console.log(`\nrelaycheck: ${pass}/${pass + fail} checks passed — ${fail ? (MUTATE_ANY ? `RED BY DESIGN (${MUTATE ? '--mutate' : '--mutate-readlock'})` : 'FAILED') : 'OK'}`)
if (fail && !MUTATE_ANY) process.exit(1)
if (!fail && MUTATE_ANY) { console.log('mutate: expected red, got green — the door line is not load-bearing?'); process.exit(1) }
