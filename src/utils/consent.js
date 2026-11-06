// CONSENT (#1711) — PLAICRAFT S1: nothing about a human player leaves the
// device without that player's recorded consent, asked BEFORE the session is
// recorded, and revocable. Two channels, separately granted (Jon's rule: the
// motion stream and the voice stream are different animals):
//
//   motion — pad streams, raw device input, seeds, state hashes, build ids:
//            everything a `retrogames-rec/v1` file is made of.
//   voice  — the raw audio tracks of `retrogames-rec/v2` (voice.js owns the
//            mic-layer consent; THIS layer re-checks before anything uploads —
//            defence in depth, a v2 file reaching the store without a voice
//            grant must be impossible, not unlikely).
//
// Consent is per PLAYER (a named player on this device), not per game: one
// grant covers every title, a revoke stops every title. Persistence is
// localStorage when available (phones re-open the arcade all day; asking on
// every launch trains people to tap yes without reading, which is consent
// theatre, not consent). The store shape is pure so Node (recordcheck) can pin
// the rules, mutants included:
//
//   { "<playerId>": { motion: true, voice: false, at: 1730900000000 } }
//
// `at` is the last decision time — the store stamps it into uploads so a
// leaked record can be traced to a grant, and a grant older than GRACE_MS is
// re-asked (consent expires unless it keeps being confirmed).

export const CONSENT_LS_KEY = 'retrogames-consent-v1'
export const CONSENT_GRACE_MS = 1000 * 60 * 60 * 24 * 90 // re-ask after 90 quiet days

// --- store-shaped pure helpers ----------------------------------------------

export function loadConsent(store) {
    if (!store) return {}
    try {
        const raw = store.getItem(CONSENT_LS_KEY)
        const obj = raw ? JSON.parse(raw) : {}
        return obj && typeof obj === 'object' ? obj : {}
    } catch { return {} }
}

function saveConsent(store, map) {
    try { store.setItem(CONSENT_LS_KEY, JSON.stringify(map)) } catch { /* private mode: decisions live for the page only */ }
}

// grant(playerId, { motion, voice }) — a channel omitted keeps its previous
// value (the consent modal sends both, but a voice re-ask must not silently
// revoke the motion grant). Unknown ids are created.
export function grantConsent(store, playerId, { motion = false, voice = false } = {}) {
    const id = String(playerId || 'player')
    const map = loadConsent(store)
    const prev = map[id] || { motion: false, voice: false }
    map[id] = { motion: !!motion || !!prev.motion, voice: !!voice || !!prev.voice, at: Date.now() }
    saveConsent(store, map)
    return map[id]
}

export function revokeConsent(store, playerId) {
    const id = String(playerId || 'player')
    const map = loadConsent(store)
    map[id] = { motion: false, voice: false, at: Date.now() }
    saveConsent(store, map)
    return map[id]
}

export function consentFor(store, playerId, { now = Date.now() } = {}) {
    const id = String(playerId || 'player')
    const c = loadConsent(store)[id]
    if (!c) return { motion: false, voice: false, at: 0 }
    if (c.at && now - c.at > CONSENT_GRACE_MS) return { motion: false, voice: false, at: c.at, expired: true }
    return { motion: !!c.motion, voice: !!c.voice, at: c.at || 0 }
}

// uploadAllowed(rec, consent) — the gate an uploader consults. Motion consent
// is ALL consent for a motion-only file. A v2 file (voice section present)
// additionally needs the voice grant. Returns { ok, strips } — `strips` names
// what must come off the upload because it was never consented to (voice
// rejection is the common case, and the run is still worth keeping).
export function uploadAllowed(rec, consent) {
    if (!rec || typeof rec !== 'object') return { ok: false, reason: 'no recording' }
    const c = consent || {}
    if (!c.motion) return { ok: false, reason: 'no motion consent' }
    const hasVoice = !!rec.voice
    const hasCmd = Array.isArray(rec.voiceCmd) && rec.voiceCmd.length > 0
    if ((hasVoice || hasCmd) && !c.voice) return { ok: true, strips: hasVoice ? ['voice', 'voiceCmd'] : ['voiceCmd'] }
    return { ok: true, strips: [] }
}
