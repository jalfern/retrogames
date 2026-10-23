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

// A ring of timestamped pads, trimmed to the last `seconds`. Fed once per play
// tick from the game's loop (or from the keyboard logger below). tail() returns
// rec-style frames so QA replays the same codec the recorder ships.
export function makeRing(windowMs = FB_WINDOW_MS) {
    const buf = []
    return {
        push(pad, at) {
            buf.push({ ms: at == null ? (HAS_WIN ? performance.now() : Date.now()) : at, pad: pad || {} })
            const cutoff = (at == null ? (HAS_WIN ? performance.now() : Date.now()) : at) - windowMs
            while (buf.length && buf[0].ms < cutoff) buf.shift()
        },
        tail(seconds) {
            const win = (seconds == null ? windowMs : seconds * 1000)
            const now = HAS_WIN ? performance.now() : Date.now()
            const kept = buf.filter((e) => now - e.ms <= win)
            return kept.map((e, i) => ({ t: i + 1, pad: encodePad(e.pad) }))
        },
        size() { return buf.length },
        clear() { buf.length = 0 },
    }
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
export function captureState() {
    if (!HAS_WIN) return null
    const g = window.__game
    const s = g && typeof g.state === 'function' ? g.state() : (window.__feedbackInfo && window.__feedbackInfo())
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
export function captureFeedback({ note = '', ring = null, seconds = 30, route = '', isDemo = false, diag = null } = {}) {
    const fullRoute = route || (HAS_WIN ? (window.location && window.location.pathname) || '' : '')
    const payload = {
        note: String(note),
        gameId: gameIdFrom(fullRoute),
        build: typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev',
        route: fullRoute,
        ts: Date.now(),
    }
    if (HAS_WIN && navigator && navigator.userAgent) payload.ua = navigator.userAgent.slice(0, 200)
    const shot = captureScreenshot()
    if (shot) payload.screenshot = shot
    const state = captureState()
    if (state) payload.state = state
    if (isDemo && diag) payload.diag = diag
    if (ring) {
        const pads = ring.tail(seconds)
        if (pads.length) {
            payload.input = { format: REC_FORMAT, durationSec: seconds, pads }
            // #905: seed was "?" on every filed report because it only looked at
            // __game (DEV-only). The same state source the contract uses (and the
            // production __feedbackInfo fallback) carries the seed when it exists.
            const seed = (state && state.seed) ?? (HAS_WIN && window.__feedbackInfo ? window.__feedbackInfo().seed : undefined)
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
