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

const HAS_WIN = typeof window !== 'undefined'

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
export function startKeyboardRing(ring) {
    if (!HAS_WIN) return () => {}
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
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
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
    for (const k of ['tick', 'score', 'done', 'x', 'y', 'z', 'camera', 'players', 'lives']) {
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
            const seed = HAS_WIN && window.__game && window.__game.state && window.__game.state().seed
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
export async function submitFeedback(payload, { base = FB_RELAY, fetchImpl = null } = {}) {
    const doFetch = fetchImpl || (HAS_WIN && typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return { ok: false, err: 'no fetch' }
    try {
        const res = await doFetch(`${base}/feedback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const j = await res.json().catch(() => ({}))
        return { ok: !!j.ok, issue: j.issue || null, err: j.err || (res.ok ? null : `http ${res.status}`) }
    } catch (e) {
        return { ok: false, err: String((e && e.message) || e) }
    }
}
