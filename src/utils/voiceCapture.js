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

// --- device preference (#1257) — the player picks their mic once; every later
// session honors it until they pick again. localStorage because the choice
// survives reloads (the headsets-vs-built-in decision is per machine).
const DEVICE_PREF_KEY = 'retrogames:voice-device'

function readDevicePref() {
    try { return localStorage.getItem(DEVICE_PREF_KEY) || '' } catch { return '' }
}
function saveDevicePref(id) {
    try { if (id) localStorage.setItem(DEVICE_PREF_KEY, id); else localStorage.removeItem(DEVICE_PREF_KEY) } catch { /* private mode */ }
}

// --- mic badge (#1257) — a silent-but-recording state must be VISIBLE: a dot
// per page/device while a voice session lives. Green while the mic is open,
// grey when declined/denied. Refcounted: one page can bank two sessions
// (recorder + online guest stream); the dot shows rec while ANY is live.
const liveSessions = new Set()

function badgeEl() {
    if (typeof document === 'undefined') return null
    let el = document.querySelector('[data-voice-mic]')
    if (!el) {
        el = document.createElement('div')
        el.setAttribute('data-voice-mic', '')
        el.style.cssText = 'position:fixed;z-index:9998;top:10px;left:10px;display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:rgba(6,4,16,0.72);border:1px solid rgba(255,255,255,0.18);font-family:"Press Start 2P",monospace;font-size:7px;color:#cfc4ee;pointer-events:none'
        el.innerHTML = '<span data-voice-dot style="width:9px;height:9px;border-radius:50%;display:inline-block"></span><span data-voice-label></span>'
        document.body.appendChild(el)
    }
    return el
}

function syncMicBadge() {
    if (typeof document === 'undefined') return
    const el = document.querySelector('[data-voice-mic]')
    const rec = [...liveSessions].some((s) => s.phase === 'recording')
    const listen = !rec && [...liveSessions].some((s) => s.phase === 'listening')
    const off = liveSessions.size > 0
    if (!off) { if (el) el.remove(); return }
    const b = el || badgeEl()
    if (!b) return
    const dot = b.querySelector('[data-voice-dot]')
    const label = b.querySelector('[data-voice-label]')
    b.setAttribute('data-state', rec ? 'rec' : listen ? 'listen' : 'off')
    dot.style.background = rec ? '#38e07b' : listen ? '#7ec8ff' : '#6b6b78'
    dot.style.boxShadow = rec ? '0 0 8px rgba(56,224,123,0.9)' : listen ? '0 0 8px rgba(126,200,255,0.9)' : 'none'
    label.textContent = rec ? 'REC' : listen ? 'LISTEN' : 'MIC OFF'
}

// acquireListenBadge (#1263/#1257 parity, #1427) — a mic that is LIVE for
// speech recognition is a silent-but-heard state too, even when no recorder
// backs it. Register one so the SAME refcounted dot shows LISTEN while the
// speech engine holds the mic; the returned release() takes it away. The
// honesty holds: LISTEN (blue) ≠ REC (green) — recognition is not recording.
export function acquireListenBadge() {
    const reg = { phase: 'listening' }
    liveSessions.add(reg); syncMicBadge()
    return () => { liveSessions.delete(reg); syncMicBadge() }
}

// --- VU bar (#1257) — the mic just opened after a YES; prove in THAT second
// that it actually hears something, before a 30-min session dies quietly.
// ~1.2 s of level meter; the peak lands on window.__voiceVu for the harness.
function runVuMeter(stream, ms = 1200) {
    if (typeof document === 'undefined') return
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (globalThis.webkitAudioContext || null)
    if (!AC) return
    let ctx = null
    try { ctx = new AC() } catch { return }
    try {
        const src = ctx.createMediaStreamSource(stream)
        const an = ctx.createAnalyser
            ? ctx.createAnalyser()
            : null
        if (!an) { try { ctx.close() } catch { /* gone */ } return }
        an.fftSize = 512
        src.connect(an)
        const data = new Uint8Array(an.fftSize)
        let bar = document.querySelector('#vc-vu')
        if (!bar) {
            bar = document.createElement('div')
            bar.id = 'vc-vu'
            bar.setAttribute('aria-hidden', 'true')
            bar.style.cssText = 'position:fixed;z-index:9998;top:32px;left:10px;width:120px;height:8px;background:rgba(6,4,16,0.72);border:1px solid rgba(255,255,255,0.18);border-radius:4px;overflow:hidden;pointer-events:none'
            bar.innerHTML = '<i data-voice-vu-fill style="display:block;height:100%;width:0%;background:#38e07b;border-radius:3px"></i>'
            document.body.appendChild(bar)
        }
        const fill = bar.querySelector('[data-voice-vu-fill]')
        const t0 = Date.now()
        window.__voiceVu = 0
        const step = () => {
            an.getByteTimeDomainData(data)
            let peak = 0
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128))
            const lvl = Math.min(1, (peak / 128) * 2.5)
            if (lvl > window.__voiceVu) window.__voiceVu = Math.round(lvl * 100) / 100
            fill.style.width = `${Math.round(lvl * 100)}%`
            if (Date.now() - t0 >= ms) {
                bar.remove()
                try { src.disconnect(); an.disconnect(); ctx.close() } catch { /* gone */ }
                return
            }
            requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    } catch {
        try { ctx.close() } catch { /* gone */ }
    }
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
            <select id="vc-device" style="display:none;font-family:inherit;font-size:8px;padding:6px 8px;background:#1b0f3d;color:#e8e0ff;border:1px solid #7c4dff;border-radius:4px;margin-bottom:14px;max-width:100%" aria-label="Microphone input"></select>
            <div style="display:flex;gap:12px;justify-content:center">
                <button id="vc-yes" style="font-family:inherit;font-size:10px;padding:10px 14px;background:#7c4dff;color:#fff;border:0;border-radius:4px;cursor:pointer">YES, RECORD</button>
                <button id="vc-no" style="font-family:inherit;font-size:10px;padding:10px 14px;background:#2a1b4d;color:#b9a8e8;border:0;border-radius:4px;cursor:pointer">NO MIC</button>
            </div>`
        overlay.appendChild(box)
        document.body.appendChild(overlay)
        const headset = box.querySelector('#vc-headset')
        const device = box.querySelector('#vc-device')
        // Fill the mic picker without ever blocking the YES/NO decision: devices
        // (and their labels) appear when enumerate answers; headless boxes with
        // no input list keep the default device silently.
        navigator.mediaDevices.enumerateDevices().then((list) => {
            if (!overlay.isConnected) return
            const ins = (list || []).filter((d) => d.kind === 'audioinput')
            if (!ins.length) return
            const saved = readDevicePref()
            device.innerHTML = ''
            ins.forEach((d, i) => {
                const o = document.createElement('option')
                o.value = d.deviceId
                o.textContent = d.label || `Microphone ${i + 1}`
                device.appendChild(o)
            })
            const def = ins.find((d) => d.deviceId === saved) || ins.find((d) => d.deviceId === 'default') || ins[0]
            device.value = def.deviceId
            device.style.display = 'inline-block'
        }).catch(() => { /* no list: default device it is */ })
        box.querySelector('#vc-yes').addEventListener('click', () => { if (device && device.value) saveDevicePref(device.value); done({ consent: true, headset: !!headset.checked }) })
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
    const reg = { get phase() { return phase } } // badge refcount view of this session
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
        if (!consent.consent) { phase = 'declined'; liveSessions.add(reg); syncMicBadge(); dbg('asked'); return null }
        if (!voiceSupported()) { phase = 'failed'; consent.reason = 'unsupported'; dbg('unsupported'); return null }
        const audioBase = {
            channelCount: { ideal: 1 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        }
        // #1257: honor the picked device; a stale deviceId (headset unplugged)
        // falls back to the system default rather than killing the take.
        const pref = readDevicePref()
        const openMic = pref
            ? navigator.mediaDevices.getUserMedia({ audio: { ...audioBase, deviceId: { exact: pref } } })
                .catch(() => navigator.mediaDevices.getUserMedia({ audio: audioBase }))
            : navigator.mediaDevices.getUserMedia({ audio: audioBase })
        return openMic.then((s) => {
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
            liveSessions.add(reg); syncMicBadge()
            runVuMeter(s) // #1257: prove this mic hears something, right now
            return null
        }).catch(() => { phase = 'failed'; consent.consent = false; consent.reason = 'mic-denied'; liveSessions.add(reg); syncMicBadge(); dbg('mic-denied'); return null })
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
            liveSessions.delete(reg); syncMicBadge()
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
