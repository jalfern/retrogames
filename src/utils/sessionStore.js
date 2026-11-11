// SESSION STORE client (#1711) — PLAICRAFT S1: a recorded human session can
// leave the phone and reach the Studio. The store is a private Cloudflare R2
// bucket behind the existing relay worker (retrogames/relay): POST /sessions
// puts one recording object, GET /sessions lists them, GET /sessions/<key>
// reads one back. Until Jon creates the bucket + binding and redeploys the
// worker, the capability flag (GET /status -> sessions: true) stays false and
// this module refuses uploads honestly — a client never sees a broken button
// (#737 pattern: capability-gate, don't guess).
//
// Consent is enforced HERE, at the last moment before bytes leave the device,
// on top of whatever the caller already checked (defence in depth):
//   - no motion consent  -> nothing happens at all (zero fetch calls);
//   - motion yes, voice no -> the upload goes WITHOUT the voice section and
//     without voiceCmd (spoken words are voice-derived), as an honest v1 file.
// The gate lives in consent.js#uploadAllowed so Node can pin it with mutants.

import { validate } from './recording.js'
import { uploadAllowed } from './consent.js'

export const STORE_DEFAULT = 'https://retrogames.jalfern.workers.dev'

// storeFromQuery mirrors relayFromQuery: ?relay=wss://host also relocates the
// store (same worker answers both), ?store=https://host overrides alone.
export function storeFromQuery(search, fallback = STORE_DEFAULT) {
    const q = new URLSearchParams(String(search || ''))
    const s = q.get('store')
    if (s) return s.replace(/^ws/, 'http')
    const r = q.get('relay')
    if (r) return r.replace(/^ws/, 'http')
    return fallback
}

// probeStore reads the capability flag. Never throws: a relay that is down
// reads as "not configured", which is the same practical answer.
export async function probeStore(base = STORE_DEFAULT, { fetchImpl = null } = {}) {
    const f = fetchImpl || globalThis.fetch
    try {
        const res = await f(`${base}/status`)
        if (!res.ok) return { ok: false, sessions: false, err: `http ${res.status}` }
        const j = await res.json()
        return { ok: true, sessions: !!j.sessions }
    } catch (e) {
        return { ok: false, sessions: false, err: String((e && e.message) || e) }
    }
}

// uploadSession(rec, { player, consent, base, fetchImpl }) — the only path to
// the store. Returns { ok, uploaded, reason?, key? }; `uploaded:false` with a
// reason is a normal outcome (no consent / store absent), not a throw.
export async function uploadSession(rec, opts = {}) {
    const { player = 'player', consent = null, base = STORE_DEFAULT, fetchImpl = null } = opts
    const bad = validate(rec)
    if (bad) return { ok: false, uploaded: false, reason: `invalid recording: ${bad}` }
    const gate = uploadAllowed(rec, consent)
    if (!gate.ok) return { ok: false, uploaded: false, reason: gate.reason }
    const strips = gate.strips || []
    const payload = strips.length ? (() => {
        const clone = { ...rec }
        for (const k of strips) delete clone[k]
        // voice stripped from a v2 file -> the remainder IS a v1 file by the
        // format rule (v2 requires a voice section), so retag honestly.
        if (clone.voice === undefined && clone.format === 'retrogames-rec/v2') clone.format = 'retrogames-rec/v1'
        return clone
    })() : rec
    const recheck = validate(payload)
    if (recheck) return { ok: false, uploaded: false, reason: `strip produced invalid file: ${recheck}` }
    const f = fetchImpl || globalThis.fetch
    try {
        const res = await f(`${base}/sessions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                recording: payload,
                player: String(player),
                consent: { motion: true, voice: consent ? !!consent.voice : false, at: (consent && consent.at) || null },
            }),
        })
        if (!res.ok) {
            let err = `http ${res.status}`
            try { const j = await res.json(); if (j && j.err) err = j.err } catch { /* non-json error body */ }
            return { ok: false, uploaded: false, reason: err }
        }
        const j = await res.json()
        return { ok: true, uploaded: true, key: j.key || null, stripped: strips }
    } catch (e) {
        return { ok: false, uploaded: false, reason: `store unreachable: ${String((e && e.message) || e)}` }
    }
}

// listSessions is the admin read (scripts/sessions.mjs and any future admin
// page ride it). Returns { ok, sessions: [ { key, game, player, seed, ticks,
// players, audio, uploadedAt } ] }. Since the read lockdown (#1711 S8) the
// store answers reads only with the JON_KEY in x-session-key; `opts.key`
// carries it (callers read it from env — keys never hardcode). Without it
// the honest answer is ok:false reason:'unauthorized'.
export async function listSessions(opts = {}) {
    const { base = STORE_DEFAULT, limit = 50, key = null, fetchImpl = null } = opts
    const f = fetchImpl || globalThis.fetch
    try {
        const res = await f(`${base}/sessions?limit=${encodeURIComponent(String(limit))}`,
            key ? { headers: { 'x-session-key': String(key) } } : undefined)
        if (!res.ok) {
            let err = `http ${res.status}`
            try { const j = await res.json(); if (j && j.err) err = j.err } catch { /* ignore */ }
            return { ok: false, sessions: [], reason: err }
        }
        const j = await res.json()
        return { ok: true, sessions: Array.isArray(j.sessions) ? j.sessions : [] }
    } catch (e) {
        return { ok: false, sessions: [], reason: `store unreachable: ${String((e && e.message) || e)}` }
    }
}

// tickSeconds converts a tick count to world-seconds for the admin listing
// (fixed timestep 60 Hz — WORLD seconds, per the harness law).
export const tickSeconds = (ticks) => Math.round((ticks / 60) * 10) / 10
