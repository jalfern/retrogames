// OUTBOX RULES (#1711 S6) — the pure half of "uploads survive the phone".
//
// endRun() gets ONE fetch in before life ends: iOS cancels in-flight requests
// the moment the tab backgrounds, a thumb closes the app seconds after OVER,
// a subway run ends offline. Anything not on the wire when that happens is
// gone — and the acceptance line "Jon plays 3 sessions and ALL 3 appear in
// the store" dies one backgrounded tab at a time. The outbox is a local
// holding pen (IndexedDB, outbox.js): a finished take is persisted BEFORE the
// first upload attempt, retried when the phone breathes again, and deleted
// only when the store has it or a rule says it must not have it.
//
// These three functions are the whole rule set, pure so recordcheck pins
// them (and mutates them) in Node; the shell below them is mechanics.

// How many takes wait on-device. A consented player producing more than this
// without ever reaching a network is a phone that never sees wifi — the oldest
// take is the one that had the most chances already.
export const OUTBOX_MAX_ITEMS = 24

// Age a queued take survives. Past a week the run is stale news — and holding
// a recording (voice included) indefinitely without the store ever seeing it
// is worse for the player than honest loss.
export const OUTBOX_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

// --- add-time rules -----------------------------------------------------------

// planAdd(entries, entry, { maxItems }) — append, then evict OLDEST until the
// store fits. The new entry is never the eviction victim: it is the take that
// just asked for help. Entries keep { id, savedAt, ... }; order of `entries`
// is not assumed — sort is by savedAt (the queue drains oldest-first).
export function planAdd(entries, entry, { maxItems = OUTBOX_MAX_ITEMS } = {}) {
    const cap = Math.max(1, maxItems | 0)
    const list = [...(entries || []), entry].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
    const overflow = Math.max(0, list.length - cap)
    return { entries: list.slice(overflow), evicted: list.slice(0, overflow) }
}

// --- retry-time rules ---------------------------------------------------------

// classifyFailure(reason) — the taxonomy that keeps the queue healthy:
//  - 'drop': the store will refuse this payload FOREVER (bad file, permanent
//    4xx like 413-too-big or 400-envelope). Retrying only burns battery, and
//    a permanent-refusal entry would clog the queue and starve fresh takes.
//  - 'keep': the store was unreachable / busy / timed out — retrying is the
//    whole point of the outbox.
// reasons arrive from uploadSession: `http <status>`, the worker's own err
// text (core.js validateSessionEnvelope), or `store unreachable: ...`.
export function classifyFailure(reason) {
    const r = String(reason || '')
    const m = /^http (4\d\d)$/.exec(r)
    if (m) {
        const code = Number(m[1])
        // 408 Request Timeout and 429 Too Many Requests are "try again"
        // answers even though they are 4xx — timing/luck, not verdicts.
        if (code === 408 || code === 429) return 'keep'
        return 'drop'
    }
    if (/^invalid recording/.test(r)) return 'drop'
    if (/^strip produced invalid file/.test(r)) return 'drop'
    if (/^no motion consent/.test(r)) return 'drop'
    if (/^upload without consent/.test(r)) return 'drop' // worker's door (core.js) — same verdict client-side
    return 'keep'
}

// planDrain(entries, { motion, now, maxAgeMs }) — one drain pass's decisions.
//  - consent is read LIVE at drain time (last-moment enforcement, same rule as
//    uploadSession): if motion consent is gone, EVERY entry drops. A player
//    who revoked consent must not leave a pile of their recordings queued on
//    the device — that is the acceptance line ("without consent, nothing
//    uploads") seen from the storage side.
//  - stale entries drop by age.
//  - survivors send oldest-first: the take that has waited longest leaves
//    first, so ordering in the store matches the order they were played.
export function planDrain(entries, { motion = false, now = Date.now(), maxAgeMs = OUTBOX_MAX_AGE_MS } = {}) {
    const sorted = [...(entries || [])].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
    const drop = []
    const send = []
    for (const e of sorted) {
        if (!motion) { drop.push({ id: e.id, reason: 'motion consent revoked — outbox purged' }); continue }
        if (!e.savedAt || now - e.savedAt > maxAgeMs) { drop.push({ id: e.id, reason: 'too old to ship' }); continue }
        send.push(e)
    }
    return { drop, send }
}
