// VOICECHECK (#1247) — voice capture's proof, in plain Node.
//
// The browser owns the mic (voiceCapture.js); everything else about voice is
// pure and gets pinned here: the rec/v2 format gate, the tick-clock alignment
// math (interpolation + the 30-min drift check), the relay-framed chunk
// transport (guest -> host over the already-forwarded `pad` type), consent
// gating (no consent = no audio), and byte-exact re-export.
//
//   node scripts/voicecheck.mjs             # green
//   node scripts/voicecheck.mjs --mutate  # RED by design: the guest's clock
//                                         # never reaches the host — a track
//                                         # without a tick clock must be refused
//   npm run voicecheck

import { createRecorder, validate, recDownload, REC_FORMAT, REC_FORMAT_V2 } from '../src/utils/recording.js'
import {
    createVoiceClock, tickToMs, voiceDrift, b64FromBytes, bytesFromB64, voiceReexport,
    packVoiceAudio, makeVoiceInbox, trackToWire, validateVoice, VOICE_CHUNK,
} from '../src/utils/voice.js'
import { decodePadPacket } from '../src/utils/padlink.js'

const MUTATE = process.argv.includes('--mutate')
const TICK_MS = 1000 / 60

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// A realistic raw track: 90 s at 24 kbps mono opus ≈ 270 kB of audio bytes,
// fake-quantised base64, clock sampled every 60 ticks by the real tracker.
function makeTrack({ ticks = 5400, seconds = 90, throttleAt = 0 } = {}) {
    let vt = 0 // virtual ms, advanced ONE frame per simulated tick
    const clock = createVoiceClock({ now: () => vt })
    clock.markStart()
    for (let t = 1; t <= ticks; t++) {
        vt += throttleAt && t > throttleAt ? TICK_MS * 2 : TICK_MS // post-mark: half speed
        clock.onTick(t)
    }
    const kb = seconds * 3000 // 24 kbps = 3000 bytes/s
    const bytes = new Uint8Array(kb)
    for (let i = 0; i < kb; i++) bytes[i] = (i * 31 + 7) & 0xff
    return {
        slots: [1], consent: true, headset: true,
        mime: 'audio/webm;codecs=opus',
        ms: Math.round(vt),
        clock: clock.finish(),
        b64: b64FromBytes(bytes),
        _bytes: bytes,
    }
}

console.log('format — v1 stays valid, v2 carries voice:')
{
    const rec1 = createRecorder({ gameId: 'gauntlet', seed: 7, players: 2, build: 'check' }).finish(1)
    ok(rec1.format === REC_FORMAT && validate(rec1) === null, 'v1 file (no voice) still validates')
    ok(validate({ ...rec1, voice: { tracks: [], declined: [] } }) !== null, 'voice on a v1 tag refused')
    const tr = makeTrack()
    const rec2 = createRecorder({ gameId: 'gauntlet', seed: 7, players: 2, build: 'check' }).finish(1, { tracks: [tr], declined: [] })
    ok(rec2.format === REC_FORMAT_V2 && validate(rec2) === null, 'v2 file with one consented track validates')
    ok(validate({ ...rec2, voice: undefined }) !== null, 'v2 tag without a voice section refused')
    ok(validate({ ...rec2, voice: { tracks: [{ ...tr, consent: false }], declined: [] } }) !== null, 'file-level gate: consent:false refused through validate() itself')
    ok(validate({ ...rec2, voice: { tracks: [{ ...tr, b64: '' }], declined: [] } }) !== null, 'file-level gate: empty audio refused through validate() itself')
    const dl = recDownload(rec2)
    ok(dl.filename.includes('gauntlet-seed7') && JSON.parse(dl.text).voice.tracks[0].b64.length === tr.b64.length, 'recDownload serialises v2 whole', dl.filename)
}

console.log('format — mutation gates on the voice section:')
{
    const tr = makeTrack({ ticks: 120, seconds: 2 })
    const base = { tracks: [tr], declined: [] }
    ok(validateVoice(base, 2) === null, 'consented track passes')
    ok(validateVoice({ tracks: [{ ...tr, consent: false }] }, 2) !== null, 'consent:false refused — a track exists only with consent')
    ok(validateVoice({ tracks: [{ ...tr, clock: [{ t: 5, ms: 83 }, { t: 3, ms: 50 }] }] }, 2) !== null, 'clock tick regression refused')
    ok(validateVoice({ tracks: [{ ...tr, b64: 'QUJ' }] }, 2) !== null, 'truncated base64 refused')
    ok(validateVoice({ tracks: [{ ...tr, slots: [0, 1] }, { ...tr, slots: [1] }] }, 2) !== null, 'one slot covered by two tracks refused')
    ok(validateVoice({ tracks: [{ ...tr, slots: [7] }] }, 2) !== null, 'slot out of players range refused')
    ok(validateVoice({ tracks: [tr], declined: [1] }, 2) !== null, 'seat both recorded and declined refused')
    ok(validateVoice({ tracks: [], declined: [1] }, 2) === null, 'declined seat (no audio) is valid — the game still played')
}

console.log('clock — sampling, interpolation, drift:')
{
    let vt = 0
    const clock = createVoiceClock({ now: () => vt })
    clock.markStart()
    for (let t = 1; t <= 600; t++) { vt += TICK_MS; clock.onTick(t) }
    const s = clock.finish()
    ok(s.length === 11, 'realtime 600 ticks -> 10 boundary samples + closing sample', `${s.length}`)
    ok(s[0].t === 1 && s[1].t === 61 && s[2].t === 121, 'samples land on tick boundaries 1,61,121,…')
    const ms300 = tickToMs(s, 300)
    ok(Math.abs(ms300 - (299 * TICK_MS)) < 17, 'tickToMs interpolates within one frame of truth', `${ms300}`)
    ok(tickToMs(s, 0) === s[0].ms && tickToMs(s, 999999) === s[s.length - 1].ms, 'tickToMs clamps at both ends (honest edges)')
    ok(tickToMs([], 5) === null, 'tickToMs on an empty clock is null')
    const d0 = voiceDrift(s)
    ok(Math.abs(d0.maxLagMs) < 100, 'realtime session drift < 100 ms (sampling granularity)', `${d0.maxLagMs}`)
}

console.log('drift — the 30-min check:')
{
    // 30 min at 60 Hz; the LAST 15 minutes throttled to half realtime (CI box,
    // software-rendered) — the world ends up 450 s behind the wall clock.
    const tr = makeTrack({ ticks: 108000, throttleAt: 81000 })
    const d = voiceDrift(tr.clock)
    ok(d.totalTicks === 108000 && d.samples >= 1800, '30-min trace carries every clock sample', `ticks=${d.totalTicks} samples=${d.samples}`)
    const wantMs = Math.round(1350000 + 900000) // 15 min realtime + 15 min slow
    ok(Math.abs(tr.ms - wantMs) < 5, 'wall ms matches the throttled profile', `${tr.ms} vs ${wantMs}`)
    const expectLag = wantMs - Math.round(108000 * TICK_MS) // ≈ +450 000 ms
    ok(Math.abs(d.maxLagMs - expectLag) < 5 && d.worstTick === 108000, 'worst drift is the accumulated throttle, at the final tick', `${Math.round(d.maxLagMs)} ms @ ${d.worstTick}`)
    // and alignment stays TRUE despite the drift: tick 90000 sits deep inside
    // the throttled half; interpolation must agree within one sampling window.
    const truth = Math.round(80999 * TICK_MS + 9000 * TICK_MS * 2)
    const got = tickToMs(tr.clock, 90000)
    ok(Math.abs(got - truth) < 60 * TICK_MS * 2 + 1, 'interpolation tracks throttled time', `got=${Math.round(got)} truth=${truth}`)
}

console.log('wire — chunks ride the relay budget and reassemble exactly:')
{
    const tr = makeTrack({ ticks: 300, seconds: 5 })
    const msgs = trackToWire(1, tr)
    const oversize = msgs.filter((m) => JSON.stringify(m).length > 512)
    ok(oversize.length === 0, 'every voice message fits the 512-byte relay budget', oversize.length ? `worst=${JSON.stringify(oversize[0] || {}).length}` : `${msgs.length} msgs`)
    ok(JSON.stringify(packVoiceAudio(1, 'A'.repeat(VOICE_CHUNK * 2 + 1))[0]).length <= 512, 'framed audio never crosses MAX_MSG at the chunk boundary')
    const perSecond = Math.ceil(3000 * (4 / 3) / VOICE_CHUNK)
    ok(perSecond <= 30, 'streaming stays far under the relay rate window (240/s)', `~${perSecond} msg/s at 24 kbps`)
    const inbox = makeVoiceInbox()
    for (const m of msgs) if (!MUTATE || m.m !== 'c') inbox.feed(m) // --mutate: clock never arrives
    const sec = inbox.voiceSection()
    ok(sec.tracks.length === 1 && sec.tracks[0].b64 === tr.b64, 'reassembled audio is byte-identical', MUTATE ? '(mutated)' : '')
    ok(sec.tracks[0].ms === tr.ms && !sec.tracks[0].partial, 'end marker stamps wall ms, track complete')
    ok(MUTATE
        ? sec.tracks[0].clock.length === 0
        : sec.tracks[0].clock.length === tr.clock.length && sec.tracks[0].clock[0].t === tr.clock[0].t,
    MUTATE ? 'MUTATION: clock samples withheld from the host' : 'clock trace survives the wire in order')
    const finalRec = createRecorder({ gameId: 'gauntlet', seed: 7, players: 2, build: 'check' }).finish(1, sec)
    const bad = validate(finalRec)
    ok(MUTATE ? bad !== null && /clock/.test(bad) : bad === null, MUTATE ? 'MUTATION: missing clock refused' : 'assembled-over-wire file validates clean', bad || '')
}

console.log('wire — consent, partial tracks, seat sanity:')
{
    const inbox = makeVoiceInbox()
    inbox.feed({ t: 'pad', k: 'v', s: 1, m: 'x' })
    let sec = inbox.voiceSection()
    ok(sec.tracks.length === 0 && sec.declined[0] === 1, 'declined guest lands in declined, no audio')
    inbox.feed({ t: 'pad', k: 'v', s: 2, m: 'i', x: JSON.stringify({ mime: 'audio/webm;codecs=opus', headset: false }) })
    inbox.feed({ t: 'pad', k: 'v', s: 2, m: 'a', i: 0, z: 1, x: 'QUJDRA==' })
    sec = inbox.voiceSection()
    ok(sec.tracks.length === 1 && sec.tracks[0].partial === true, 'intro+audio without end marker -> partial track kept')
    const inbox2 = makeVoiceInbox()
    inbox2.feed({ t: 'pad', k: 'v', s: 0, m: 'i', x: '{"mime":"audio/webm"}' })
    inbox2.feed({ t: 'pad', k: 'v', s: 5, m: 'a', i: 0, z: 1, x: 'QUJDRA==' })
    ok(inbox2.seats().length === 0, 'seat 0 / out-of-range seats ignored (host never self-streams)')
    inbox2.feed({ t: 'pad', k: 'v', s: 1, m: 'i', x: 'not json' })
    ok(inbox2.seats().length === 0, 'garbage intro dropped')
    ok(decodePadPacket({ t: 'pad', k: 'v', s: 1, m: 'i', x: '{}' }) === null, "k:'v' is never mistaken for a pad by the padlink decoder")
    inbox2.reset()
    ok(inbox2.seats().length === 0, 'inbox resets between races')
}

console.log('bytes — base64 round-trip and re-export:')
{
    const raw = new Uint8Array(5000)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * i + 3) & 0xff
    const back = bytesFromB64(b64FromBytes(raw))
    ok(back.length === raw.length && back.every((v, i) => v === raw[i]), 'b64 round-trip byte-exact')
    const tr = makeTrack({ ticks: 120, seconds: 2 })
    const out = voiceReexport(tr, 'p2')
    ok(out.filename === 'p2.webm' && out.bytes.length === tr._bytes.length && out.bytes.every((v, i) => v === tr._bytes[i]), 're-export is a verbatim decode — nothing to transcode')
}

console.log(`\n${fail === 0 ? 'VOICECHECK PASS' : 'VOICECHECK FAIL'} — ${pass} passed, ${fail} failed${MUTATE ? ' [mutant run]' : ''}`)
process.exit(fail === 0 ? 0 : 1)
