// VOICE CAPTURE (#1247, browser half) — the mic. Consent BEFORE any mic opens,
// then one raw MediaRecorder track per device for the whole session, with the
// sim tick clock sampled alongside it. The format/framing/validation is pure
// (src/utils/voice.js); this module is deliberately thin: DOM + getUserMedia +
// MediaRecorder, nothing else.
//
// Raw means RAW: no echo cancellation, no noise suppression, no gain control,
// no voice-activity clipping — the bytes are what the mic heard (PLAICraft may
// re-mux them later; see voiceReexport). The consent prompt suggests headsets
// so players' tracks don't bleed into each other on open speakers.

import { createVoiceClock, b64FromBytes } from './voice.js'

export function voiceSupported() {
    return typeof navigator !== 'undefined'
        && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        && typeof MediaRecorder !== 'undefined'
        && typeof document !== 'undefined'
}

const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
]

function pickMime() {
    for (const m of MIME_CANDIDATES) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
    return ''
}

// askVoiceConsent — the prompt that fires BEFORE getUserMedia (browsers cache
// permission, so the permission bubble is not consent; this one is ours, is
// answered per player per session, and its result is saved in the recording).
// Resolves { consent, headset, reason? }. Never throws; unsupported browsers
// resolve consent:false and the game plays on silently.
// Consent is per player per PAGE session: ask once, reuse the answer for every
// later prompt that run (Gauntlet asks at race start, the recorder at
// recordStart — one human answer, both flows honoured). `fresh: true` re-asks.
let cachedConsent = null

export function askVoiceConsent(opts = {}) {
    if (cachedConsent && !opts.fresh) return Promise.resolve({ ...cachedConsent, cached: true })
    if (!voiceSupported()) {
        cachedConsent = { consent: false, headset: false, reason: 'unsupported' }
        return Promise.resolve({ ...cachedConsent })
    }
    return new Promise((resolve) => {
        const done = (v) => {
            if (!overlay.isConnected) return
            document.removeEventListener('keydown', onKey)
            overlay.remove()
            cachedConsent = { consent: v.consent, headset: v.headset, reason: v.reason }
            resolve(v)
        }
        const overlay = document.createElement('div')
        overlay.setAttribute('role', 'dialog')
        overlay.setAttribute('aria-modal', 'true')
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9999', 'display:flex',
            'align-items:center', 'justify-content:center', 'background:rgba(6,4,16,0.86)',
            'font-family:"Press Start 2P",monospace', 'color:#e8e0ff', 'text-align:center',
        ]
        const box = document.createElement('div')
        box.style.cssText = 'max-width:420px;padding:28px 26px;border:3px solid #7c4dff;background:#12082b;box-shadow:0 0 0 3px #12082b,0 0 24px rgba(124,77,255,0.55);border-radius:8px'
        box.innerHTML = `
            <div style="font-size:15px;color:#ffd54f;margin-bottom:14px">RECORD VOICE?</div>
            <div style="font-size:9px;line-height:1.9;margin-bottom:12px">Your mic is recorded for this session's replay.<br>Headsets recommended — tracks don't bleed.</div>
            <label style="font-size:8px;line-height:1.8;display:block;margin-bottom:16px;cursor:pointer">
                <input type="checkbox" id="vc-headset" style="transform:scale(1.4);margin-right:8px;vertical-align:middle">
                I'm using a headset
            </label>
            <div style="display:flex;gap:12px;justify-content:center">
                <button id="vc-yes" style="font-family:inherit;font-size:10px;padding:10px 14px;background:#7c4dff;color:#fff;border:0;border-radius:4px;cursor:pointer">YES, RECORD</button>
                <button id="vc-no" style="font-family:inherit;font-size:10px;padding:10px 14px;background:#2a1b4d;color:#b9a8e8;border:0;border-radius:4px;cursor:pointer">NO MIC</button>
            </div>`
        overlay.appendChild(box)
        document.body.appendChild(overlay)
        const headset = box.querySelector('#vc-headset')
        box.querySelector('#vc-yes').addEventListener('click', () => done({ consent: true, headset: !!headset.checked }))
        box.querySelector('#vc-no').addEventListener('click', () => done({ consent: false, headset: !!headset.checked, reason: 'declined' }))
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done({ consent: false, headset: !!headset.checked, reason: 'declined' }) } }
        document.addEventListener('keydown', onKey)
    })
}

// createVoiceSession(opts) — one device's raw track lifecycle:
//   slots    the player slots this device's mic covers (local humans)
//   now()    ms clock (injectable for checks; default performance.now)
//   ask      consent fn (default askVoiceConsent; injectable so harnesses and
//            games with their own flow can drive it)
// Flow: ask() -> granted? getUserMedia -> MediaRecorder starts -> onTick(t)
// samples the tick clock -> finalize() resolves the voice.js track shape
// (or null when declined/failed — the game keeps playing either way).
export function createVoiceSession(opts = {}) {
    const now = typeof opts.now === 'function' ? opts.now : (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now())
    const slots = (opts.slots && opts.slots.length ? opts.slots : [0]).map((s) => s | 0)
    const ask = typeof opts.ask === 'function' ? opts.ask : askVoiceConsent
    const onData = typeof opts.onData === 'function' ? opts.onData : null
    const bitrate = opts.bitrate || 24000
    const clock = createVoiceClock({ now })
    const consent = { consent: false, headset: false, reason: 'unasked' }
    let phase = 'asking' // asking | recording | declined | failed | done
    let rec = null
    let stream = null
    let mime = ''
    let chunks = []
    let startMs = 0
    let clockCursor = 0
    // QA/prod-safe breadcrumbs: the last voice session's outcome, no secrets —
    // "why is there no audio in my recording?" answers itself.
    const dbg = (where) => {
        if (typeof window === 'undefined') return
        window.__voiceDebug = { where, phase, consent: { ...consent }, mime, chunks: chunks.length, bytes: chunks.reduce((a, b) => a + b.size, 0), ticks: clock.lastTick() }
    }

    const ready = Promise.resolve(ask(opts.consentOpts || {})).then((c) => {
        consent.consent = !!(c && c.consent)
        consent.headset = !!(c && c.headset)
        if (c && c.reason) consent.reason = c.reason
        if (!consent.consent) { phase = 'declined'; dbg('asked'); return null }
        if (!voiceSupported()) { phase = 'failed'; consent.reason = 'unsupported'; dbg('unsupported'); return null }
        return navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: { ideal: 1 },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        }).then((s) => {
            stream = s
            mime = pickMime()
            rec = mime ? new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: bitrate }) : new MediaRecorder(s)
            chunks = []
            rec.ondataavailable = (e) => {
                if (e.data && e.data.size) {
                    chunks.push(e.data)
                    // live streaming (guest -> host over the relay): report each
                    // finished chunk as base64 the moment the mic hands it over.
                    if (onData) e.data.arrayBuffer().then((buf) => { try { onData(b64FromBytes(new Uint8Array(buf))) } catch { /* gone */ } }).catch(() => { /* gone */ })
                }
            }
            clock.markStart()
            startMs = now()
            rec.start(1000)
            phase = 'recording'; dbg('mic-open')
            return null
        }).catch(() => { phase = 'failed'; consent.consent = false; consent.reason = 'mic-denied'; dbg('mic-denied'); return null })
    })

    return {
        get phase() { return phase },
        get slots() { return slots },
        get consent() { return consent },
        ready,
        // call for every simulated tick; samples the tick->ms trace while live
        onTick(t) { if (phase === 'recording') clock.onTick(t) },
        // live-stream helpers (guest side): wall ms since the mic opened, and
        // the clock samples produced since the last drain (send each exactly
        // once, in order).
        msNow() { return phase === 'recording' ? Math.round(now() - startMs) : null },
        drainClock() {
            const s = clock.samples()
            const out = s.slice(clockCursor)
            clockCursor = s.length
            return out
        },
        intro() { return { mime: mime || 'audio/webm', headset: consent.headset } },
        // Stop the mic and assemble the track. Resolves the voice.js track
        // shape, or null when there is nothing honest to store.
        finalize() {
            if (phase === 'done') return Promise.resolve(null)
            if (phase !== 'recording') { phase = 'done'; dbg('finalize-idle'); return Promise.resolve(null) }
            phase = 'done'
            const ms = Math.round(now() - startMs)
            return new Promise((resolve) => {
                const settle = () => {
                    if (stream) stream.getTracks().forEach((t) => { try { t.stop() } catch { /* gone */ } })
                    stream = null
                    const samples = clock.finish()
                    const b64From = (text) => ({
                        slots, consent: true, headset: consent.headset,
                        mime: mime || rec.mimeType || 'audio/webm',
                        ms,
                        clock: samples,
                        b64: text,
                    })
                    if (!samples.length || !chunks.length) { dbg('finalize-empty'); resolve(null); return }
                    const blob = new Blob(chunks, { type: mime || 'audio/webm' })
                    chunks = []
                    if (blob.size === 0) { dbg('finalize-blob-empty'); resolve(null); return }
                    blob.arrayBuffer().then((buf) => { dbg('track-ready'); resolve(b64From(b64FromBytes(new Uint8Array(buf)))) }).catch(() => { dbg('arraybuffer-failed'); resolve(null) })
                }
                try {
                    if (rec && rec.state !== 'inactive') { rec.onstop = settle; rec.stop() }
                    else settle()
                } catch { settle() }
            })
        },
    }
}
