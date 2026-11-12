// VOICE (#1247) — raw per-player audio tracks aligned to the game's TICK clock,
// carried inside `retrogames-rec/v2` (issue #1247: Plaicraft needs speech lined
// up with actions; recordings had seed + pad streams but no voice).
//
// One track per player-DEVICE (two local seats share the device mic, so a track
// lists the slots it covers). Raw MediaRecorder opus — whole session, no
// push-to-talk, no voice-activity clipping, no transcripts. The bytes ride the
// file base64-verbatim (`b64`), so re-export is decode-and-write: nothing to
// transcode when PLAICraft's own container lands.
//
//   { slots: [0], consent: true, headset: false,
//     mime: 'audio/webm;codecs=opus', ms: 182340,      // wall length of the audio,
//                                                       // stamped when the final
//                                                       // chunk landed (#2058)
//     clock: [ { t: 60, ms: 1002 }, … ],                // tick -> ms SINCE TRACK START
//     b64: '…' }                                       // verbatim container bytes
//
// ALIGNMENT: the sim is a fixed timestep but NOT realtime — a throttled box
// runs the world slower than wall time — so a track never assumes t*16.67. It
// carries a clock trace sampled ~1/s inside the sim loop: at tick t, the
// measured ms since the mic started. Consumers interpolate (`tickToMs`) to find
// where any pad event sits in the audio, and `voiceDrift` reports how far the
// world drifted from realtime across the session — the 30-min drift check.
//
// RELAY (remote seats): the production relay forwards an allowlist of message
// types with a 512-byte budget (relay/core.js) and is deliberately NOT
// redeployed, so voice rides the already-forwarded `pad` type as a `k:'v'`
// subkind — sig-style framing from padlink (#893), same trick, same reason.
// Guest -> host only; the host's file ends up holding every seat's track.
//
// Pure: no DOM, no MediaRecorder (those live in voiceCapture.js). Node owns the
// math, framing and validation (voicecheck); the browser owns the mic.

export const VOICE_CLOCK_EVERY = 60      // clock samples: ~1 per second at 60 Hz
export const TICK_MS = 1000 / 60

// Wire budget: relay caps whole messages at 512 bytes. The JSON envelope
// ({"t":"pad","k":"v","s":1,"m":"a","i":..,"z":..,"x":".."}) costs ~64 bytes
// itself, so payload stays at 440 — measured, not guessed (voicecheck pins it).
export const VOICE_CHUNK = 440

// --- clock ---------------------------------------------------------------------
// A clock trace maps tick -> ms since the track's mic started. `createVoiceClock`
// samples it from the sim loop: onTick(t) once per simulated tick, only after
// markStart() (consent takes time; ticks before the mic exists get no samples).

export function createVoiceClock(opts = {}) {
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    const every = Number.isInteger(opts.every) && opts.every > 0 ? opts.every : VOICE_CLOCK_EVERY
    const samples = []
    let start = 0
    let started = false // a clock whose now() begins at 0 is still started (the number alone can't prove it)
    let nextAt = 0
    let lastSeen = 0
    return {
        get started() { return started },
        markStart() { start = now(); started = true; samples.length = 0; nextAt = 0; lastSeen = 0 },
        onTick(t) {
            if (!started || !Number.isInteger(t) || t < 1) return
            lastSeen = t
            if (t >= nextAt) {
                samples.push({ t, ms: Math.round(now() - start) })
                nextAt = t + every
            }
        },
        // Close the trace: a final sample at the newest tick seen so consumers
        // can align events all the way to the end of the session.
        finish() {
            if (!started || !samples.length) return samples
            const last = samples[samples.length - 1]
            if (lastSeen !== last.t) samples.push({ t: lastSeen, ms: Math.round(now() - start) })
            return samples
        },
        lastTick() { return lastSeen },
        samples() { return samples },
    }
}

// tickToMs: interpolate the trace for tick t -> ms since track start.
// Clamped at both ends (events before the mic/after the trace land on the
// nearest edge — honest, not silent nonsense).
export function tickToMs(clock, t) {
    const c = clock || []
    if (!c.length) return null
    if (t <= c[0].t) return c[0].ms
    const n = c.length
    if (t >= c[n - 1].t) return c[n - 1].ms
    let lo = 0, hi = n - 1
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (c[mid].t <= t) lo = mid; else hi = mid
    }
    const a = c[lo], b = c[hi]
    const f = (t - a.t) / (b.t - a.t)
    return a.ms + f * (b.ms - a.ms)
}

// voiceDrift: how far the WORLD clock drifted from realtime over the trace.
// lag(t) = traceMs(t) - t * tickMs: 0 when the sim ran exactly realtime,
// negative when the box throttled (world slower than wall clock). Returns the
// worst |lag|, where it happened, and what it means for alignment:
// interpolation already absorbs it — drift is reported, not assumed away.
export function voiceDrift(clock, tickMs = TICK_MS) {
    const c = clock || []
    if (c.length < 2) return { samples: c.length, maxLagMs: 0, worstTick: 0, totalMs: 0, totalTicks: 0 }
    let maxLagMs = 0, worstTick = c[0].t
    for (const s of c) {
        const lag = s.ms - s.t * tickMs
        if (Math.abs(lag) > Math.abs(maxLagMs)) { maxLagMs = lag; worstTick = s.t }
    }
    return {
        samples: c.length,
        maxLagMs,
        worstTick,
        totalMs: c[c.length - 1].ms,
        totalTicks: c[c.length - 1].t,
    }
}

// --- container duration (#2058) -------------------------------------------------
// The wall-clock `ms` a track claims is only as honest as the capture that
// stamped it. Jon's first iPhone takes came back `audioLonger:false` — audio
// shorter than its own clock. To tell "ms computed wrong" from "the phone
// really dropped the tail" (iOS Safari's MediaRecorder.stop() flushes slowly
// and, at the run-end 5 s bound, can lose bytes), read the DURATION THE
// CONTAINER ITSELF declares. Two families: EBML/WebM (Info > Duration, scaled
// by TimecodeScale) and ISO-BMFF/mp4 — what iOS answers when none of our
// webm/ogg candidates is supported. Returns whole ms, or null when the bytes
// say nothing parseable (never guesses).

const EBML_ID = { HEADER: 0x1a45dfa3, SEGMENT: 0x18538067, INFO: 0x1549a966, TIMECODE_SCALE: 0x2ad7b1, DURATION: 0x4489 }
const MASTER_IDS = new Set([EBML_ID.HEADER, EBML_ID.SEGMENT, EBML_ID.INFO])

// EBML variable integers: the count of leading zero bits sets the length.
// Ids keep the marker bit (they ARE their bytes); sizes strip it. All-ones is
// "unknown size" — an element we cannot walk past, so the walk gives up.
function ebmlVint(u8, p, { stripMarker }) {
    if (p >= u8.length) return null
    const b = u8[p]
    let len = 1
    for (let i = 0; i < 8; i++) { if (b & (0x80 >> i)) break; len++ }
    if (len > (stripMarker ? 8 : 4) || p + len > u8.length) return null
    let v = stripMarker ? b & (0xff >> len) : b
    for (let i = 1; i < len; i++) v = v * 256 + u8[p + i]
    if (stripMarker && v === Math.pow(2, 7 * len) - 1) return null // unknown-size marker
    return { v, next: p + len }
}

function ebmlDurationMs(u8) {
    let timecodeScale = 1000000 // EBML default: nanoseconds => Duration is ms
    let duration = null
    const walk = (start, end, depth) => {
        if (depth > 2) return
        let p = start
        while (p < end) {
            const id = ebmlVint(u8, p, { stripMarker: false })
            if (!id) return
            const size = ebmlVint(u8, id.next, { stripMarker: true })
            if (!size) return
            const cStart = size.next, cEnd = Math.min(cStart + size.v, end)
            if (id.v === EBML_ID.TIMECODE_SCALE && size.v >= 1 && size.v <= 8) {
                let n = 0
                for (let i = 0; i < size.v; i++) n = n * 256 + u8[cStart + i]
                timecodeScale = n
            } else if (id.v === EBML_ID.DURATION) {
                if (size.v === 4) { duration = new DataView(u8.buffer, u8.byteOffset + cStart, 4).getFloat32(0); duration = +duration.toFixed(3) }
                else if (size.v === 8) duration = new DataView(u8.buffer, u8.byteOffset + cStart, 8).getFloat64(0)
                else {
                    let n = 0
                    for (let i = 0; i < size.v; i++) n = n * 256 + u8[cStart + i]
                    duration = n
                }
            } else if (MASTER_IDS.has(id.v)) walk(cStart, cEnd, depth + 1)
            p = cEnd
        }
    }
    walk(0, u8.length, 0)
    if (duration === null || !Number.isFinite(duration) || duration < 0) return null
    return Math.round((duration * timecodeScale) / 1e6)
}

function mp4DurationMs(u8) {
    const ascii = (p, n) => String.fromCharCode(...u8.subarray(p, p + n))
    const u32 = (p) => (u8[p] * 0x1000000 + u8[p + 1] * 0x65536 + u8[p + 2] * 0x100 + u8[p + 3]) >>> 0
    const walk = (start, end, depth) => {
        if (depth > 2) return null
        let p = start
        while (p + 8 <= end) {
            let size = u32(p)
            let body = p + 8
            if (size === 1) {
                const hi = u32(p + 8), lo = u32(p + 12)
                size = hi * 0x100000000 + lo
                body = p + 16
            } else if (size === 0) size = end - p
            if (size < 8 || p + size > end) return null
            const type = ascii(p + 4, 4)
            if (type === 'moov') { const r = walk(body, p + size, depth + 1); if (r !== null) return r }
            if (type === 'mvhd') {
                const v = u8[body]
                const timescale = v === 1 ? u32(body + 20) : u32(body + 12)
                const dur = v === 1 ? u32(body + 24) * 0x100000000 + u32(body + 28) : u32(body + 16)
                if (timescale > 0) return Math.round((dur / timescale) * 1000)
                return null
            }
            p += size
        }
        return null
    }
    return walk(0, u8.length, 0)
}

export function containerDurationMs(track) {
    if (!track || typeof track.b64 !== 'string' || !track.b64.length) return null
    let u8
    try { u8 = bytesFromB64(track.b64) } catch { return null }
    if (u8.length < 16) return null
    const isEbml = u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3
    const isMp4 = asciiAt(u8, 4) === 'ftyp' || asciiAt(u8, 4) === 'moov'
    if (isEbml) return ebmlDurationMs(u8)
    if (isMp4) return mp4DurationMs(u8)
    return null
}

const asciiAt = (u8, p) => (p + 4 <= u8.length ? String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) : '')

// --- base64 (browser + Node, no deps) -------------------------------------------

export function b64FromBytes(u8) {
    const B = globalThis.Buffer
    if (B) return B.from(u8).toString('base64')
    let s = ''
    const STEP = 0x8000
    for (let i = 0; i < u8.length; i += STEP) s += String.fromCharCode.apply(null, u8.subarray(i, i + STEP))
    return btoa(s)
}

export function bytesFromB64(b64) {
    const B = globalThis.Buffer
    if (B) return new Uint8Array(B.from(b64, 'base64'))
    const s = atob(b64)
    const u8 = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
    return u8
}

// Re-export (the issue: "keep the audio easy to re-export"): a track's audio is
// its b64 decoded verbatim — the same bytes MediaRecorder produced.
export function voiceReexport(track, name = 'voice') {
    if (!track || typeof track.b64 !== 'string') throw new Error('voiceReexport: track has no bytes')
    const ext = String(track.mime || '').includes('ogg') ? 'ogg' : 'webm'
    return { filename: `${name}.${ext}`, bytes: bytesFromB64(track.b64), mime: track.mime || 'audio/webm' }
}

// --- wire framing (rides the relay's forwarded `pad` type, k:'v') -------------
// Message forms (all { t:'pad', k:'v', s: seat }):
//   m:'i'  intro      x: JSON { mime, headset }        (sent once on capture start)
//   m:'c'  clock tick  a: tick, b: ms since track start (one per VOICE_CLOCK_EVERY)
//   m:'a'  audio       x: base64 chunk, i/z framing like packSig
//   m:'x'  declined    (no consent — the game still plays, silently)
//   m:'e'  end         a: wall ms of the whole track

export const VOICE_MSG = { INTRO: 'i', CLOCK: 'c', AUDIO: 'a', DECLINED: 'x', END: 'e' }

export function packVoiceAudio(seat, b64, chunk = VOICE_CHUNK) {
    const out = []
    const n = Math.max(1, Math.ceil(b64.length / chunk))
    for (let i = 0; i < n; i++) out.push({ t: 'pad', k: 'v', s: seat, m: VOICE_MSG.AUDIO, i, z: n, x: b64.slice(i * chunk, (i + 1) * chunk) })
    return out
}

// makeVoiceInbox(assembledBySeat) — host-side assembler. feed(msg) accepts the
// k:'v' messages above and maintains one raw track record per seat; get(seat)
// returns the assembled track (with `ended`/`declined` flags) or null.
export function makeVoiceInbox() {
    const bySeat = new Map()
    return {
        feed(msg) {
            if (!msg || msg.k !== 'v') return
            const seat = msg.s | 0
            if (seat < 1 || seat > 3) return
            let tr = bySeat.get(seat)
            switch (msg.m) {
                case VOICE_MSG.INTRO: {
                    let meta = null
                    try { meta = JSON.parse(msg.x) } catch { return }
                    if (!meta || typeof meta.mime !== 'string') return
                    tr = { slots: [seat], consent: true, headset: !!meta.headset, mime: meta.mime, ms: 0, clock: [], b64: '', parts: null, ended: false, declined: false, droppedAt: 0 }
                    bySeat.set(seat, tr)
                    break
                }
                case VOICE_MSG.CLOCK:
                    if (tr && Number.isInteger(msg.a) && Number.isFinite(msg.b)) {
                        const last = tr.clock[tr.clock.length - 1]
                        if (!last || msg.a > last.t) tr.clock.push({ t: msg.a, ms: Math.round(msg.b) })
                    }
                    break
                case VOICE_MSG.AUDIO: {
                    if (!tr) return
                    if (!tr.parts) tr.parts = []
                    tr.parts[msg.i | 0] = typeof msg.x === 'string' ? msg.x : ''
                    if (tr.parts.filter(Boolean).length >= (msg.z || 1)) {
                        tr.b64 += tr.parts.join('')
                        tr.parts = null
                    }
                    break
                }
                case VOICE_MSG.DECLINED:
                    bySeat.set(seat, { declined: true, seat })
                    break
                case VOICE_MSG.END:
                    if (tr) { tr.ms = Math.max(0, Math.round(msg.a || 0)); tr.ended = true }
                    break
                default:
                    break
            }
        },
        get(seat) { return bySeat.get(seat) || null },
        // Host-pill state (#1257): 'rec' once the guest's intro lands (mic live),
        // 'off' once it declines, null until the guest says anything.
        voiceState(seat) {
            const tr = bySeat.get(seat | 0)
            if (!tr) return null
            return tr.declined ? 'off' : 'rec'
        },
        seats() { return [...bySeat.keys()].sort() },
        // Host view for the file: consented, assembled tracks (audio bytes
        // present) + the list of seats that explicitly declined.
        voiceSection() {
            const tracks = []
            const declined = []
            for (const seat of this.seats()) {
                const tr = bySeat.get(seat)
                if (tr.declined) { declined.push(seat); continue }
                if (!tr.b64.length) continue // intro but no audio yet: nothing worth storing
                const out = { slots: tr.slots, consent: true, headset: tr.headset, mime: tr.mime, ms: tr.ms, clock: tr.clock, b64: tr.b64 }
                if (!tr.ended) out.partial = true // guest left before m:'e'
                tracks.push(out)
            }
            return { tracks, declined }
        },
        reset() { bySeat.clear() },
    }
}

// Guest side: turn a finished local capture into wire messages, in order.
export function trackToWire(seat, track) {
    if (!track) return []
    const out = [{ t: 'pad', k: 'v', s: seat, m: VOICE_MSG.INTRO, x: JSON.stringify({ mime: track.mime, headset: !!track.headset }) }]
    for (const s of track.clock || []) out.push({ t: 'pad', k: 'v', s: seat, m: VOICE_MSG.CLOCK, a: s.t, b: s.ms })
    for (const m of packVoiceAudio(seat, track.b64 || '')) out.push(m)
    out.push({ t: 'pad', k: 'v', s: seat, m: VOICE_MSG.END, a: Math.round(track.ms || 0) })
    return out
}

// --- validation ----------------------------------------------------------------
// Called from recording.js validate() for v2 files. Returns an error string or
// null. `players` bounds the slot numbers.

export function validateVoice(voice, players) {
    if (!voice || typeof voice !== 'object') return 'voice must be an object'
    if (!Array.isArray(voice.tracks)) return 'voice.tracks must be an array'
    const seen = new Set()
    for (const tr of voice.tracks) {
        if (!tr || typeof tr !== 'object') return 'voice: track must be an object'
        if (!Array.isArray(tr.slots) || !tr.slots.length) return 'voice: track needs the slots its mic covers'
        for (const s of tr.slots) {
            if (!Number.isInteger(s) || s < 0 || s >= players) return `voice: track slot ${JSON.stringify(s)} out of range`
            if (seen.has(s)) return `voice: slot ${s} covered by two tracks`
            seen.add(s)
        }
        if (tr.consent !== true) return 'voice: a track exists only with consent'
        if (typeof tr.mime !== 'string' || !tr.mime) return 'voice: track needs a mime'
        if (!Number.isFinite(tr.ms) || tr.ms < 0) return 'voice: track ms must be a non-negative number'
        if (!Array.isArray(tr.clock) || !tr.clock.length) return 'voice: track needs a tick clock'
        let lastT = 0
        for (const c of tr.clock) {
            if (!c || !Number.isInteger(c.t) || c.t < 1 || c.t <= lastT) return 'voice: clock ticks must increase'
            if (!Number.isFinite(c.ms) || c.ms < 0) return 'voice: clock ms must be non-negative'
            lastT = c.t
        }
        if (typeof tr.b64 !== 'string' || tr.b64.length === 0) return 'voice: track needs audio bytes'
        if (tr.b64.length % 4 !== 0) return 'voice: b64 length must be a multiple of 4'
    }
    if (voice.declined !== undefined) {
        if (!Array.isArray(voice.declined)) return 'voice.declined must be an array'
        for (const s of voice.declined) {
            if (!Number.isInteger(s) || s < 0 || s >= players) return `voice: declined slot ${JSON.stringify(s)} out of range`
            if (seen.has(s)) return `voice: slot ${s} both recorded and declined`
        }
    }
    return null
}
