// SYNC BADGE RULES (#1711 S7) — the pure half of "the phone says so".
//
// S6 made uploads survive the phone (outboxCore/outbox); nothing on the phone
// admitted any of it. After OVER a player could not tell an uploaded take from
// a queued one from a silently-lost one, and the boot/online drain ran without
// a word. The acceptance test — 3 phone sessions, all 3 in the store — should
// not require trusting a pen you cannot see.
//
// badgeView(ev) is the whole rule set: it takes the facts the shell knows at
// the three truth moments (endRun result, drain start, drain end) and returns
// the one honest view: { kind: hidden|syncing|queued|uploaded|synced, text,
// holdMs } (holdMs = how long the view stands before the shell hides it; 0 =
// stands until the next fact). recordcheck pins and mutates these rules in
// Node; SyncBadge.jsx is the paint, autoRecord.js the publisher.
//
// Honesty rules, in order:
//  1. NO STORE, NO PILL. Without store capability there is no storage to
//     claim — the pill never appears on devices where none of it is true.
//  2. BACKLOG BEATS SUCCESS. If takes are still waiting on-device (left>0),
//     the pill says so even when the latest run uploaded — an old take that
//     never made it is the more important truth.
//  3. A PASS THAT SENT NOTHING AND KEPT NOTHING says nothing (no theater).
//  4. Pending states persist (holdMs 0) until the facts change; confirmations
//     fade (uploaded 3 s, synced 4 s) because the screen belongs to the game.

export const BADGE_HOLD_UPLOADED_MS = 3000
export const BADGE_HOLD_SYNCED_MS = 4000

const hidden = () => ({ kind: 'hidden', text: '', holdMs: 0 })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// badgeView({ storeLive, phase, uploaded, requeued, sent, left })
//  - storeLive: the capability probe says /sessions exists (last known).
//  - phase:    'idle' | 'drain' — 'drain' while a drain pass is in flight.
//  - uploaded: the run that just ended reached the store.
//  - requeued: the run that just ended went to the pen instead.
//  - sent:     entries a finished drain pass shipped.
//  - left:     entries still in the pen after the finished action.
export function badgeView(ev = {}) {
    const {
        storeLive = false, phase = 'idle', uploaded = false,
        requeued = false, sent = 0, left = 0,
    } = ev
    if (!storeLive) return hidden()
    if (phase === 'drain') {
        // Only announce a pass that actually has work — an empty-queue
        // "syncing…" is a lie of omission about nothing happening.
        if (!(left > 0 || sent > 0)) return hidden()
        return { kind: 'syncing', text: 'SYNCING…', holdMs: 0 }
    }
    if (left > 0) {
        return { kind: 'queued', text: `${plural(left, 'TAKE', 'TAKES')} SAVED — WILL SYNC`, holdMs: 0 }
    }
    if (requeued) {
        // A requeue without a visible count is still a pending take — say so.
        return { kind: 'queued', text: 'TAKE SAVED — WILL SYNC', holdMs: 0 }
    }
    if (uploaded) return { kind: 'uploaded', text: 'TAKE UPLOADED', holdMs: BADGE_HOLD_UPLOADED_MS }
    if (sent > 0) {
        return { kind: 'synced', text: `${plural(sent, 'TAKE', 'TAKES')} SYNCED`, holdMs: BADGE_HOLD_SYNCED_MS }
    }
    return hidden()
}
