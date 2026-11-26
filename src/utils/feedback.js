// FEEDBACK SDK (#737) — capture what the player just did, from inside the game.
//
// The in-game button collects a note plus a snapshot of the live game (screenshot,
// state, camera) and — the core of the feature — the last 30 seconds of input as
// a `retrogames-rec/v1` pad stream, so QA can replay the exact moment Jon filed
// the report. It files THROUGH the Cloudflare relay (`/feedback`), never holding
// a GitHub token: the token lives in the worker's env. Games/demos without a
// contract or a recording still send note + screenshot (graceful fallback).
//
// Built to run in PRODUCTION (unlike the DEV-only __game contract): every browser
// API is probed so the module is also importable in plain Node for the harness.

import { REC_FORMAT, encodePad } from './recording.js'

export const FB_WINDOW_MS = 30_000
export const FB_RELAY = 'https://retrogames.jalfern.workers.dev'

// JON'S KEY (#886) — reports without a key land quarantined behind
// needs-approval, so Jon's own phone files the same way as a stranger's. He
// stores his private key once via a one-time link (`?jonkey=…`): the SDK
// captures it into localStorage and strips it from the address bar, and every
// later submit rides with it so his reports go straight to `feedback`. The key
// is per-device; the relay never echoes it back and it never reaches an issue.
export const JONKEY_PARAM = 'jonkey'
export const JONKEY_STORE = 'rg.jonkey'

export function storeJonKey(search, storage) {
    const m = new RegExp(`[?&]${JONKEY_PARAM}=([^&#]+)`).exec(search || '')
    if (!m || !storage) return null
    let key = m[1]
    try { key = decodeURIComponent(key) } catch { /* raw value */ }
    if (!key) return null
    try { storage.setItem(JONKEY_STORE, key) } catch { /* private mode: stay silent */ }
    return key
}

export function readJonKey(storage) {
    if (!storage) return null
    try { return storage.getItem(JONKEY_STORE) } catch { return null }
}

// #905: the one-time link is invisible on a phone once used, so the panel also
// offers a paste box — save the key once per device and every later report
// files straight to `feedback` instead of the quarantine label.
export function saveJonKey(value, storage) {
    const key = String(value == null ? '' : value).trim()
    if (!key || !storage) return null
    try { storage.setItem(JONKEY_STORE, key) } catch { /* private mode: stay silent */ }
    return key
}

function stripJonKey(loc) {
    const cleaned = (loc.search || '')
        .replace(new RegExp(`([?&])${JONKEY_PARAM}=[^&#]*`, 'g'), '$1')
        .replace(/([?&])$/, '')
        .replace('?&', '?')
    try { window.history.replaceState({}, '', loc.pathname + cleaned + (loc.hash || '')) } catch { /* no history */ }
}

const HAS_WIN = typeof window !== 'undefined'

if (HAS_WIN) {
    try {
        if (storeJonKey(window.location.search, window.localStorage) != null) stripJonKey(window.location)
    } catch { /* storage blocked */ }
}

// A ring of timestamped pad SNAPSHOTS (the full held state at each key event),
// trimmed to the last `seconds`. tail() expands the snapshots onto the sim's
// 60 Hz grid — one frame per tick, dense t = 1..N — so the filed stream IS the
// rec codec's per-tick pad slot: seed + these frames determines the trajectory
// exactly (the same shape replaycheck's verifyRecording consumes). The old
// event-indexed shape (t = 1..E, E key events) dropped every gap between presses
// — #1088's 12 events over 30 s could not be replayed at all. `now` is injectable
// so the harness drives it against a fake clock.
export function makeRing(windowMs = FB_WINDOW_MS) {
    const buf = []
    const TICK_MS = 1000 / 60
    return {
        push(pad, at) {
            buf.push({ ms: at == null ? (HAS_WIN ? performance.now() : Date.now()) : at, pad: pad || {} })
            const cutoff = (at == null ? (HAS_WIN ? performance.now() : Date.now()) : at) - windowMs
            while (buf.length && buf[0].ms < cutoff) buf.shift()
        },
        tail(seconds, now) {
            const win = seconds == null ? windowMs : seconds * 1000
            const n = Math.round(win / TICK_MS)
            const t1 = now == null ? (HAS_WIN ? performance.now() : Date.now()) : now
            const out = new Array(n)
            let e = 0
            for (let i = 0; i < n; i++) {
                const at = t1 - (n - 1 - i) * TICK_MS // when sim tick i ran
                while (e < buf.length && buf[e].ms <= at) e++
                out[i] = { t: i + 1, pad: encodePad(e > 0 ? buf[e - 1].pad : {}) }
            }
            return out
        },
        size() { return buf.length },
        clear() { buf.length = 0 },
    }
}

// Dictation (#737 "type OR dictate"): pure glue between a spoken phrase and the
// note being composed. Final transcripts append with exactly one space between
// existing text and the new phrase (typing then dictating must not glue words),
// whitespace inside the phrase collapses, blank phrases change nothing, and the
// result never exceeds `maxLen` (the panel's textarea maxLength) — when a
// phrase would overflow, the note keeps what it had rather than half a word.
export function appendPhrase(note, phrase, maxLen = 2000) {
    const clean = String(phrase == null ? '' : phrase).replace(/\s+/g, ' ').trim()
    const base = String(note == null ? '' : note)
    if (!clean) return base
    const joined = base && !/\s$/.test(base) ? `${base} ${clean}` : `${base}${clean}`
    if (joined.length > maxLen) return base.length <= maxLen ? base : base.slice(0, maxLen)
    return joined
}

// Does this device have a speech recognizer at all? The panel hides its mic
// button when false (Safari, headless CI) — same self-gating style as the
// relay probe, so the fallback (typing) is never obscured by a dead button.
export function dictationSupported(win = HAS_WIN ? window : null) {
    return !!(win && (win.SpeechRecognition || win.webkitSpeechRecognition))
}

// Keyboard input logger: a global keydown/keyup bridge so EVERY game that answers
// arrows/space banks real input with zero per-game wiring (VirtualControls already
// dispatches these as KeyboardEvents). Returns a stop() that removes the listeners.
// `win` is injectable so the harness can drive it against a fake window.
export function startKeyboardRing(ring, win = HAS_WIN ? window : null) {
    if (!win) return () => {}
    const held = new Set()
    const CODES = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        Space: 'a', KeyZ: 'a', KeyX: 'b', Enter: 'start',
    }
    const pad = () => {
        const p = {}
        if (held.has('left')) p.left = true
        if (held.has('right')) p.right = true
        if (held.has('up')) p.up = true
        if (held.has('down')) p.down = true
        if (held.has('a')) p.a = true
        if (held.has('b')) p.b = true
        if (held.has('start')) p.start = true
        return p
    }
    const bank = () => ring.push(pad())
    const down = (e) => { const k = CODES[e.code]; if (k) { held.add(k); bank() } }
    const up = (e) => { const k = CODES[e.code]; if (k) { held.delete(k); bank() } }
    win.addEventListener('keydown', down)
    win.addEventListener('keyup', up)
    return () => { win.removeEventListener('keydown', down); win.removeEventListener('keyup', up) }
}

// #905: typing a report killed its own spaces — games preventDefault() Space (to
// stop page scroll) and eat arrow keys as steer, and those handlers sit on window,
// so every keystroke in the note hit the game too. While the panel is open this
// capture-phase guard stops key events whose target is inside the panel before
// they reach ANY bubble-phase listener: the game hears nothing, the replay ring
// stays clean, and the browser's default action still writes the character
// (nothing here calls preventDefault, so Space survives). `onKey` runs for
// in-panel keys before stopping, so the panel can own Escape itself.
export function installTypingGuard(panelEl, win = HAS_WIN ? window : null, onKey = null) {
    if (!win || !panelEl) return () => {}
    const shield = (e) => {
        if (panelEl.contains && panelEl.contains(e.target)) {
            if (onKey) { try { onKey(e) } catch { /* panel handler failed */ } }
            e.stopPropagation()
        }
    }
    win.addEventListener('keydown', shield, true)
    win.addEventListener('keyup', shield, true)
    return () => {
        win.removeEventListener('keydown', shield, true)
        win.removeEventListener('keyup', shield, true)
    }
}

// ── #3407: NOTHING VANISHES ───────────────────────────────────────────────────
// Jon sent two reports; only one reached GitHub. A failed send used to live only
// in component state — close the panel, navigate, or reload and it evaporated —
// and a dictated note could miss React's synthetic change tracking entirely. The
// law here: a report that was composed is kept ON THE DEVICE until the relay
// accepts it, and the text you SEE is the text that is SENT.

export const OUTBOX_STORE = 'rg.feedback.outbox'
export const DRAFT_STORE = 'rg.feedback.draft'
export const OUTBOX_MAX = 5
export const RETRY_BASE_MS = 10_000
export const RETRY_MAX_MS = 300_000

function storeGet(storage, key) {
    if (!storage) return null
    try { return storage.getItem(key) } catch { return null }
}
function storeSet(storage, key, value) {
    if (!storage) return false
    try { storage.setItem(key, value); return true } catch { return false } // quota / private mode
}
function storeDel(storage, key) {
    if (!storage) return
    try { storage.removeItem(key) } catch { /* nothing to remove */ }
}

// The heavy parts of a payload (a multi-MB screenshot data URL, the 30 s pad
// stream) are what burst localStorage's ~5 MB. Slimming drops them before a
// NOTE ever is — the words are the report; the extras are proof that rides when
// there is room.
export function slimForStore(payload) {
    if (!payload || typeof payload !== 'object') return {}
    const rest = {}
    for (const k of Object.keys(payload)) {
        if (k !== 'screenshot' && k !== 'input') rest[k] = payload[k]
    }
    return rest
}

export function loadOutbox(storage) {
    const raw = storeGet(storage, OUTBOX_STORE)
    if (!raw) return []
    try {
        const a = JSON.parse(raw)
        return Array.isArray(a) ? a.filter((e) => e && e.id && e.payload) : []
    } catch { return [] } // corrupt → start clean, never throw
}

// Persist the outbox, shrinking before losing everything: full payloads →
// slimmed payloads → notes-only, newest last. Any list that fits counts — the
// note is what must survive.
function persistOutbox(list, storage) {
    if (!storage) return false
    if (storeSet(storage, OUTBOX_STORE, JSON.stringify(list))) return true
    const slim = list.map((e) => ({ ...e, payload: slimForStore(e.payload) }))
    if (storeSet(storage, OUTBOX_STORE, JSON.stringify(slim))) return true
    for (let n = 0; n < slim.length; n++) {
        const notesOnly = slim.slice(n).map((e) => ({
            id: e.id, ts: e.ts, attempts: e.attempts | 0,
            payload: { note: String(e.payload.note || ''), gameId: e.payload.gameId || 'unknown', route: e.payload.route || '', ts: e.ts },
        }))
        if (storeSet(storage, OUTBOX_STORE, JSON.stringify(notesOnly))) return true
    }
    return false
}

// Keep a failed report. Blank notes are not kept (the relay would refuse them
// forever) — that is what the panel's honest empty-note line is for.
export function outboxAdd(payload, storage) {
    if (!storage || !payload || typeof payload !== 'object') return null
    if (!String(payload.note == null ? '' : payload.note).trim()) return null
    const ts = Number.isFinite(payload.ts) ? payload.ts : Date.now()
    const id = `${ts}-${Math.random().toString(36).slice(2, 8)}`
    const list = loadOutbox(storage)
    list.push({ id, ts, attempts: 0, payload })
    while (list.length > OUTBOX_MAX) list.shift() // oldest, already-kept reports go first
    persistOutbox(list, storage)
    return id
}

export function outboxRemove(id, storage) {
    const list = loadOutbox(storage)
    const next = list.filter((e) => e.id !== id)
    if (next.length !== list.length) persistOutbox(next, storage)
    return next.length
}

export function outboxPending(storage) {
    return loadOutbox(storage).length
}

function bumpAttempt(id, storage) {
    const list = loadOutbox(storage)
    let attempts = 1
    for (const e of list) if (e.id === id) { e.attempts = (e.attempts | 0) + 1; attempts = e.attempts }
    persistOutbox(list, storage)
    return attempts
}

// 10 s → 20 → 40 … 300 s cap: patient enough to outlive a flaky train,
// quiet enough never to hammer the relay.
export function retryDelayMs(attempt) {
    return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt | 0), RETRY_MAX_MS)
}

// Try every kept report once; successes leave the outbox, failures stay (with
// their attempt count upped, which is what backs the backoff). Never throws.
export async function flushOutbox({ base = FB_RELAY, fetchImpl = null, storage = HAS_WIN ? window.localStorage : null, submitOne = submitFeedback } = {}) {
    const list = loadOutbox(storage)
    const sent = []
    const failed = []
    let maxAttempts = 0
    for (const e of list) {
        const res = await submitOne(e.payload, { base, fetchImpl, storage })
        if (res && res.ok) {
            outboxRemove(e.id, storage)
            sent.push({ id: e.id, issue: res.issue || null })
        } else {
            const attempts = bumpAttempt(e.id, storage)
            maxAttempts = Math.max(maxAttempts, attempts)
            failed.push({ id: e.id, err: (res && res.err) || 'send failed' })
        }
    }
    return { sent, failed, pending: loadOutbox(storage).length, maxAttempts }
}

// The in-progress note rides the device while it is being composed: closing the
// panel, navigating, or a crash must not eat a dictated complaint. Blank clears
// the draft (a report that went out or was erased leaves nothing behind).
export function saveDraft(text, storage) {
    const t = String(text == null ? '' : text)
    if (!storage) return false
    if (!t.trim()) { storeDel(storage, DRAFT_STORE); return true }
    return storeSet(storage, DRAFT_STORE, t.slice(0, 2000))
}
export function loadDraft(storage) {
    const v = storeGet(storage, DRAFT_STORE)
    return v == null ? '' : String(v)
}
export function clearDraft(storage) {
    storeDel(storage, DRAFT_STORE)
}

// Dictation and IME commit text WITHOUT keypresses. React's synthetic onChange
// usually rides the same input event — when its value tracking dedupes a native
// insertion anyway (mobile dictation on iOS), the textarea looks full while the
// state stays empty: the send button is dead and the visible report evaporates.
// These listeners sit on the textarea itself, so every insertion path — keys,
// dictation, paste, autofill — lands in onText: what you see is what gets sent.
export function installNoteSync(el, onText) {
    if (!el || typeof el.addEventListener !== 'function' || typeof onText !== 'function') return () => {}
    const sync = () => onText(String(el.value == null ? '' : el.value))
    el.addEventListener('input', sync)
    el.addEventListener('compositionend', sync)
    return () => {
        el.removeEventListener('input', sync)
        el.removeEventListener('compositionend', sync)
    }
}

// Best-effort canvas grab. WebGL canvases without preserveDrawingBuffer return a
// black/blank PNG — tolerated; the note + input replay carry the report.
export function captureScreenshot() {
    if (typeof document === 'undefined') return null
    const canvases = document.querySelectorAll('canvas')
    for (let i = canvases.length - 1; i >= 0; i--) {
        const c = canvases[i]
        if (!c.width || !c.height) continue
        try {
            const url = c.toDataURL('image/png')
            if (url && url.length > 64) return url
        } catch { /* tainted / WebGL: fall through */ }
    }
    return null
}

// Game contract state + camera when a game exposes them; absent otherwise.
// `win` is injectable (defaults to the real window) so the harness can drive it
// against a fake PRODUCTION window — no __game, __feedbackInfo present (#1200).
export function captureState(win = HAS_WIN ? window : null) {
    if (!win) return null
    const g = win.__game
    const s = g && typeof g.state === 'function' ? g.state() : (win.__feedbackInfo && win.__feedbackInfo())
    if (!s || typeof s !== 'object') return null
    const out = {}
    for (const k of ['tick', 'score', 'done', 'seed', 'x', 'y', 'z', 'camera', 'players', 'lives']) {
        if (s[k] !== undefined) out[k] = s[k]
    }
    if (!Object.keys(out).length) return null
    try {
        if (new TextEncoder().encode(JSON.stringify(out)).length > 4000) return null
    } catch { return null }
    return out
}

function gameIdFrom(route) {
    if (HAS_WIN && window.__feedbackGameId) return window.__feedbackGameId
    const parts = (route || '').split('/').filter(Boolean)
    return parts[parts.length - 1] || 'unknown'
}

// Assemble a validated-shape report. `ring`/`fetchImpl` are injectable so the
// harness can drive it with fake time and a fake network.
export function captureFeedback({ note = '', ring = null, seconds = 30, route = '', isDemo = false, diag = null, win = HAS_WIN ? window : null } = {}) {
    const fullRoute = route || (win && win.location && win.location.pathname) || ''
    const payload = {
        note: String(note),
        gameId: gameIdFrom(fullRoute),
        build: typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev',
        route: fullRoute,
        ts: Date.now(),
    }
    if (win && win.navigator && win.navigator.userAgent) payload.ua = win.navigator.userAgent.slice(0, 200)
    const shot = captureScreenshot()
    if (shot) payload.screenshot = shot
    const state = captureState(win)
    if (state) payload.state = state
    if (isDemo && diag) payload.diag = diag
    if (ring) {
        const pads = ring.tail(seconds)
        // Only file an input block when the window actually held a key: a report
        // on a still frame (a graphics bug) carries no stream, same as before.
        if (pads.some((f) => Object.keys(f.pad).length)) {
            payload.input = { format: REC_FORMAT, durationSec: seconds, tickRate: 60, ticks: pads.length, pads }
            // #905: seed was "?" on every filed report because it only looked at
            // __game (DEV-only). The same state source the contract uses (and the
            // production __feedbackInfo fallback) carries the seed when it exists.
            const seed = (state && state.seed) ?? (win && win.__feedbackInfo ? win.__feedbackInfo().seed : undefined)
            if (Number.isInteger(seed)) payload.input.seed = seed
        }
    }
    return payload
}

// Does the relay currently accept feedback reports? The button hides itself until
// this is true, so shipping the client ahead of Jon's deploy never shows a 503.
// `?feedback=1` forces it on for local/QA testing.
export async function probeFeedback({ base = FB_RELAY, fetchImpl = null } = {}) {
    if (HAS_WIN && typeof location !== 'undefined' && /[?&]feedback=1/.test(location.search || '')) return true
    const doFetch = fetchImpl || (HAS_WIN && typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return false
    try {
        const res = await doFetch(`${base}/status`)
        const j = await res.json().catch(() => ({}))
        return !!j.feedback
    } catch {
        return false
    }
}

// File via the relay. Never throws: a failed submit must not crash the game.
// Jon's stored key (#886) rides along when present so his reports skip the
// needs-approval quarantine; `storage` is injectable for the harness.
export async function submitFeedback(payload, { base = FB_RELAY, fetchImpl = null, storage = HAS_WIN ? window.localStorage : null } = {}) {
    const doFetch = fetchImpl || (HAS_WIN && typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return { ok: false, err: 'no fetch' }
    const body = { ...payload }
    const jonKey = readJonKey(storage)
    if (jonKey) body.key = jonKey
    try {
        const res = await doFetch(`${base}/feedback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
        const j = await res.json().catch(() => ({}))
        return { ok: !!j.ok, issue: j.issue || null, err: j.err || (res.ok ? null : `http ${res.status}`) }
    } catch (e) {
        return { ok: false, err: String((e && e.message) || e) }
    }
}
