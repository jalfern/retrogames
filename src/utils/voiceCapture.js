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
// ensureVuBar — the shared #vc-vu markup: one bar element per page, reused by
// the recorder's 1.2 s proof and the live mid-game meter (#1448) alike.
function ensureVuBar() {
    if (typeof document === 'undefined') return null
    let bar = document.querySelector('#vc-vu')
    if (!bar) {
        bar = document.createElement('div')
        bar.id = 'vc-vu'
        bar.setAttribute('aria-hidden', 'true')
        bar.style.cssText = 'position:fixed;z-index:9998;top:32px;left:10px;width:120px;height:8px;background:rgba(6,4,16,0.72);border:1px solid rgba(255,255,255,0.18);border-radius:4px;overflow:hidden;pointer-events:none'
        bar.innerHTML = '<i data-voice-vu-fill style="display:block;height:100%;width:0%;background:#38e07b;border-radius:3px"></i>'
        document.body.appendChild(bar)
    }
    return bar
}

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
        const bar = ensureVuBar()
        if (!bar) { try { src.disconnect(); an.disconnect(); ctx.close() } catch { /* gone */ } return }
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


// liveLevelTap (#2205) — a passive level read on the RECORDER'S OWN stream for
// as long as the take is open: window.__voiceLevel is the same peak scale the
// #1257 bar uses (peak/128 × 2.5, capped at 1), refreshed every frame. The
// analyser is a fan-out sink — it consumes nothing, records nothing and plays
// nothing, so the take bytes are untouched (claptest relies on that). ClapTest
// renders it as its live mic meter so a too-quiet slap is obvious mid-test.
// #2247: the handle also carries `ctx` — this context is fed by the recorder's
// own stream for the whole take, so it doubles as the take's delivered-samples
// clock (the tick trace stamps from it); null when the tap degrades to a no-op.
function liveLevelTap(stream) {
    const noop = { stop() {}, ctx: null }
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return noop
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (globalThis.webkitAudioContext || null)
    if (!AC) return noop
    let ctx = null
    try { ctx = new AC() } catch { return noop }
    try {
        const src = ctx.createMediaStreamSource(stream)
        if (!ctx.createAnalyser) { try { src.disconnect(); ctx.close() } catch { /* gone */ } return noop }
        const an = ctx.createAnalyser()
        an.fftSize = 512
        src.connect(an)
        const data = new Uint8Array(an.fftSize)
        window.__voiceLevel = 0
        let raf = 0
        const step = () => {
            // A fresh AudioContext can be born suspended (autoplay); unlike the
            // fire-and-forget #1257 bar, this meter is gated on by the harness,
            // so keep asking for resume until it runs.
            if (ctx.state !== 'running') { try { ctx.resume() } catch { /* gone */ } raf = requestAnimationFrame(step); return }
            an.getByteTimeDomainData(data)
            let peak = 0
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128))
            window.__voiceLevel = Math.min(1, (peak / 128) * 2.5)
            raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return {
            stop() {
                if (raf) cancelAnimationFrame(raf)
                window.__voiceLevel = 0
                try { src.disconnect(); an.disconnect(); ctx.close() } catch { /* gone */ }
            },
            ctx, // #2247: the take's device clock (see createVoiceSession)
        }
    } catch { try { ctx.close() } catch { /* gone */ } return noop }
}

// startLevelMeter (#1448) — a LIVE meter without the recorder. Games whose
// mic is held by speech recognition (Rally's V mode: speechListen exposes no
// stream of its own) still owe the #1257 proof mid-game — "is the mic hearing
// you?" answered while you drive, not just at recorder start. It opens the mic
// (the CALLER owns consent, #1247 — never call this before a YES), feeds the
// same #vc-vu bar until stop(), and records NOTHING: no MediaRecorder, no
// bytes — so the honest badge stays whatever the session already shows
// (LISTEN for recognition). Honesty note: Chrome shares the mic between
// recognition and this analyser; decline/failure degrades to a no-op handle.
// opts.ms caps the meter (0/default = live until stop).
export function startLevelMeter(opts = {}) {
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (globalThis.webkitAudioContext || null)
    if (typeof window === 'undefined' || typeof document === 'undefined' || !AC
        || typeof navigator === 'undefined' || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        return { supported: false, level: () => null, stop() {} }
    }
    const liveUntil = opts.ms ? Date.now() + opts.ms : 0
    let closed = false
    let stream = null
    let ctx = null
    let raf = 0
    const bar = ensureVuBar()
    const fill = bar ? bar.querySelector('[data-voice-vu-fill]') : null
    window.__voiceVu = 0
    const close = () => {
        if (closed) return
        closed = true
        if (raf) cancelAnimationFrame(raf)
        if (stream) stream.getTracks().forEach((t) => { try { t.stop() } catch { /* gone */ } })
        stream = null
        try { if (ctx) ctx.close() } catch { /* gone */ }
        ctx = null
        if (bar) bar.remove()
    }
    const audioBase = {
        channelCount: { ideal: 1 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
    }
    const pref = readDevicePref()
    const openMic = pref
        ? navigator.mediaDevices.getUserMedia({ audio: { ...audioBase, deviceId: { exact: pref } } })
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: audioBase }))
        : navigator.mediaDevices.getUserMedia({ audio: audioBase })
    openMic.then((s) => {
        if (closed) { s.getTracks().forEach((t) => { try { t.stop() } catch { /* gone */ } }); return }
        stream = s
        try { ctx = new AC() } catch { ctx = null }
        if (!ctx || !ctx.createAnalyser || !fill) { close(); return }
        const src = ctx.createMediaStreamSource(stream)
        const an = ctx.createAnalyser()
        an.fftSize = 512
        src.connect(an)
        const data = new Uint8Array(an.fftSize)
        const step = () => {
            if (closed) return
            an.getByteTimeDomainData(data)
            let peak = 0
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128))
            const lvl = Math.min(1, (peak / 128) * 2.5)
            if (lvl > window.__voiceVu) window.__voiceVu = Math.round(lvl * 100) / 100
            fill.style.width = `${Math.round(lvl * 100)}%`
            if (liveUntil && Date.now() >= liveUntil) { close(); return }
            raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
    }).catch(() => { closed = true; if (bar) bar.remove() })
    return { supported: true, level: () => window.__voiceVu, stop: close }
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
    // #2247: stamp the tick trace from AUDIO-CONTENT time, not the wall clock.
    // On a contended box the audio pipeline and the main thread pace apart (the
    // sim tick staircases — stall -> catch-up burst — while delivered samples
    // stall or starve on the audio threads), so wall stamps and byte positions
    // drift and `tickToMs` chords up to ±50 ms mid-window between honest
    // 1-per-second samples (#2136 residual b — denser sampling cannot fix a
    // pacing mismatch, verified). The recorder's own stream lives in a capture
    // AudioContext (the #2205 live tap): its currentTime is the delivered-
    // samples clock — the same origin the encoded bytes accrue on — so once it
    // runs, the trace continues on it and tick->ms and byte->ms share ONE
    // origin by construction. Continuous hybrid: wall until the first running
    // read, device pace after (anchored once — no jump, no mid-take origin
    // swap). No AudioContext (old browsers, Node checks) or never-running
    // context = every stamp is wall, exactly the pre-#2247 behavior.
    // voiceDrift keeps its meaning: the device clock runs at realtime rate, so
    // trace-vs-tick lag is still world-vs-realtime.
    let clockCtx = null
    let contentBase = null // { wall, content } captured at the first running read
    const hybridNow = () => {
        const wall = now()
        if (clockCtx && clockCtx.state === 'running') {
            const content = clockCtx.currentTime * 1000
            if (!contentBase) contentBase = { wall, content }
            return contentBase.wall + (content - contentBase.content)
        }
        return wall
    }
    const clock = createVoiceClock({ now: hybridNow })
    const consent = { consent: false, headset: false, reason: 'unasked' }
    const reg = { get phase() { return phase } } // badge refcount view of this session
    let phase = 'asking' // asking | recording | declined | failed | done
    let rec = null
    let stream = null
    let mime = ''
    let chunks = []
    let startMs = 0
    let clockCursor = 0
    let levelTap = null // #2205: passive live-level handle, stopped at finalize
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
            levelTap = liveLevelTap(s) // #2205: keep a live level visible for the whole take
            clockCtx = levelTap.ctx || null // #2247: the take's device clock (null -> wall)
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
        // live-stream helpers (guest side): ms since the mic opened on the
        // trace's own clock (#2247: content-paced once the capture context
        // runs, so a guest's audio and its clock stamps share one origin), and
        // the clock samples produced since the last drain (send each exactly
        // once, in order).
        msNow() { return phase === 'recording' ? Math.round(hybridNow() - startMs) : null },
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
            return new Promise((resolve) => {
                const settle = () => {
                    // #2247: read the trace and the length BEFORE the capture
                    // context closes — after close() the hybrid would fall back
                    // to wall and the final stamps would jump off the content
                    // line the earlier ones sit on.
                    const samples = clock.finish()
                    // #2058: stamp the audio length HERE, after the encoder's
                    // final chunk has landed — not when stop() was called.
                    // iPhone Safari's flush latency (stop -> ondataavailable ->
                    // onstop) is hundreds of ms; stamping before it made every
                    // phone track claim an audio length SHORTER than its own
                    // clock trace ends at (audioLonger:false on all three of
                    // Jon's first takes). The bytes settle covers are the
                    // bytes the track stores, so this is the honest length.
                    const ms = Math.round(hybridNow() - startMs)
                    if (levelTap) { levelTap.stop(); levelTap = null } // #2205: meter dies with the take
                    if (stream) stream.getTracks().forEach((t) => { try { t.stop() } catch { /* gone */ } })
                    stream = null
                    clockCtx = null // #2247: the take's device clock is gone with it
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
