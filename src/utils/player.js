// PLAYER IDENTITY (#1711 audit, finding 1) — the store had a player column
// end to end (envelope, R2 metadata, admin listing) but the client only ever
// filled the constant 'player', so every take arrived under one fixed label
// and the column told nobody anything. This module is the pure identity half:
// DOM-free so recordcheck pins it (mutants included); the browser shell is
// autoRecord.js and the name field is ConsentGate.
//
// Rules:
//  - an id is a NORMALIZED name: trimmed, inner runs of whitespace collapse
//    to one space, lowercase, limited to a safe charset, 1..64 chars (the
//    relay's own envelope bound). " Jon " and "jon" are the same player;
//    "jon " vs "jon x" are not.
//  - consent is keyed by that id (consent.js already keys by id — this fixes
//    which id the shell asks for).
//  - ANON_ID is the DECLINE-ONLY identity. A player who refuses to say who
//    they are can still say NO (stored under 'anon' so the gate stops
//    nagging); a grant under 'anon' is refused — nothing may upload for an
//    identity nobody owns. That is what makes the old device-wide 'player'
//    grant inert: it is no longer consulted by anything, and a nameless run
//    cannot record, so the gate re-asks with a name field.
//  - last-used name (retrogames-player-v1) is a PREFILL, never consent.

import { CONSENT_GRACE_MS, ANON_ID } from './consent.js'

export { ANON_ID }
export const PLAYER_LS_KEY = 'retrogames-player-v1'
export const PLAYER_NAME_MAX = 64

// playerId(name) — normalized id, or null when the name cannot identify a
// player (empty, all-punctuation, too long after clipping to the bound).
export function playerId(name) {
    const s = String(name ?? '').trim().toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ._@-]/g, '')
        .trim()
    if (!s) return null
    return s.slice(0, PLAYER_NAME_MAX)
}

// canGrant(id) — 'anon' (and absent ids) can decline, never grant.
export function canGrant(id) {
    return typeof id === 'string' && id !== '' && id !== ANON_ID
}

// --- last-used name (prefill only) --------------------------------------------
// Shape: { id, name, at }. A record older than the consent grace is dropped:
// by the time consent needs re-asking, the device should ask WHO too.

export function loadLastPlayer(store) {
    if (!store) return null
    try {
        const raw = store.getItem(PLAYER_LS_KEY)
        const o = raw ? JSON.parse(raw) : null
        if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || o.id === ANON_ID) return null
        if (typeof o.at === 'number' && Date.now() - o.at > CONSENT_GRACE_MS) return null
        return { id: o.id, name: typeof o.name === 'string' && o.name ? o.name : o.id, at: o.at || 0 }
    } catch { return null }
}

export function rememberPlayer(store, name) {
    const id = playerId(name)
    if (!store || !id || id === ANON_ID) return null // anon is a decline marker, never a person to prefill
    const rec = { id, name: String(name).trim().slice(0, PLAYER_NAME_MAX), at: Date.now() }
    try { store.setItem(PLAYER_LS_KEY, JSON.stringify(rec)) } catch { /* private mode: prefill lives for the page only */ }
    return rec
}

// planGate({ probe, named, anonDecision }) — what the start site does. A
// named player is decided by their own consent; with no name known, a stored
// anon DECLINE still silences the gate (saying no is identity-free), but a
// stored anon GRANT never exists, so unnamed devices re-ask.
// Returns { ask, id }: id is the identity the run would record under.
export function planGate({ probe, lastPlayer = null, consentForId = null } = {}) {
    if (!probe || !probe.sessions) return { ask: false, id: lastPlayer ? lastPlayer.id : ANON_ID }
    const id = lastPlayer ? lastPlayer.id : null
    if (id) {
        const c = consentForId ? consentForId(id) : null
        return { ask: !c || !c.at || !!c.expired, id }
    }
    const c = consentForId ? consentForId(ANON_ID) : null
    // silent only when anon DECLINED and not expired — a decision that exists
    if (c && c.at && !c.expired && !c.motion) return { ask: false, id: ANON_ID }
    return { ask: true, id: ANON_ID }
}
