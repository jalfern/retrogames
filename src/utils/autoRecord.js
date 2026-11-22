// AUTO-CAPTURE (#1711 S2) — PLAICRAFT: human sessions record themselves.
// When a human starts a run in a wired game, this module asks the #1711
// consent question once per player (ConsentGate, nothing checked by default,
// stored 90 days), opens the recorder AT SEED BIRTH (so the file replay-
// verifies from tick 1), and uploads it when the run ends — through
// sessionStore, which re-enforces consent at the last moment and strips the
// voice half the player never granted.
//
// The rules themselves are pure (autoRecordCore.js, pinned by recordcheck);
// this file is only the browser shell: the gate mount, the store probe cache,
// and the gameContract/autoStart hand-off. Every entry point is honest-degrade:
// no store -> nothing happens and nothing is asked; no mic -> motion-only
// files; consent declined -> the game plays exactly the same.
//
// #1711 audit 1 — IDENTITY: consent, takes and uploads are keyed by the
// consenting human's normalized id (player.js), never by a device-wide
// constant. The gate asks WHO; a name is required to save anything, so the
// store can tell players apart. An unnamed NO THANKS is honored as a decline
// under 'anon' — decline-only, nothing may ever upload for an id nobody
// owns. The last-used name is a prefill, not consent; the legacy 'player'
// key is no longer consulted, so old unnamed grants die inert and the gate
// re-asks with a name.
//
// Online lockstep runs are NOT auto-recorded in S2 (the wire owns the seats;
// honest gap in the Gauntlet/Gravel README) — offline human runs, which is
// what the acceptance table asks for (Jon's phone, solo or vs CPU).

import { consentFor, grantConsent, ANON_ID } from './consent.js'
import { playerId, loadLastPlayer, rememberPlayer, planGate, canGrant } from './player.js'
import { probeStore, uploadSession, storeFromQuery } from './sessionStore.js'
import { queueRun, updateEntry, dropEntry, drain as drainOutbox, countQueue } from './outbox.js'
import { classifyFailure } from './outboxCore.js'
import { badgeView } from './syncBadgeCore.js'
import { voiceSupported } from './voiceCapture.js'
import { autoStart, autoStop, isRecording } from './gameContract.js'
import { planRun, decideMerge } from './autoRecordCore.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import ConsentGate from '../components/ConsentGate.jsx'
import SyncBadge from '../components/SyncBadge.jsx'

const st = {
    probe: null, // { ok, sessions } — newest probe wins; refreshed when stale-false
    probeAt: 0,
    gate: null, // single-flight: one question on screen at a time
    base: null,
    busy: false, // a start is mid-ask (Space held through the gate must not re-enter)
    onlineArmed: false, // S6: the online->drain listener is installed once
    badge: null, // S7: { root, host } for the sync pill — mounted on first need
    badgeSeq: 0, // S7: a faded view may not overwrite a newer fact
    badgeTimer: null,
    id: null, // audit 1: the id the CURRENT run belongs to (resolved at the gate)
}

const ls = () => { try { return localStorage } catch { return null } }
const base = () => st.base || (st.base = storeFromQuery(typeof window !== 'undefined' ? window.location.search : ''))

// currentPlayerId — who we would record as right now: the id the gate
// resolved this session, else the device's last-used name, else 'anon'.
export function currentPlayerId() {
    if (typeof window === 'undefined') return ANON_ID
    return st.id || (loadLastPlayer(ls()) || {}).id || ANON_ID
}

// publishBadge (#1711 S7) — the one honest line the phone says about the
// store. Mounts the pill host once (ConsentGate's createRoot pattern), mirrors
// the view on window.__syncBadge for the harness, and fades views whose
// holdMs elapsed — unless a newer fact replaced them (badgeSeq).
export function publishBadge(view) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return view
    const v = view || { kind: 'hidden', text: '', holdMs: 0 }
    const seq = ++st.badgeSeq
    if (st.badgeTimer) { clearTimeout(st.badgeTimer); st.badgeTimer = null }
    if (!st.badge) {
        const host = document.createElement('div')
        host.setAttribute('data-sync-badge-host', '')
        document.body.appendChild(host)
        st.badge = { host, root: createRoot(host) }
    }
    st.badge.root.render(React.createElement(SyncBadge, { view: v }))
    window.__syncBadge = { ...v, at: Date.now() }
    if (v.kind !== 'hidden' && v.holdMs > 0) {
        st.badgeTimer = setTimeout(() => {
            st.badgeTimer = null
            if (seq === st.badgeSeq) publishBadge({ kind: 'hidden', text: '', holdMs: 0 })
        }, v.holdMs)
    }
    return v
}

// initAutoRecord — fire the capability probe early (mount time), so by the
// moment the player reaches "start" the answer is already in hand and an
// already-decided player boots with zero added delay. S6: boot is also a
// drain trigger — a phone that was offline yesterday ships its queue today.
export function initAutoRecord() {
    if (typeof window === 'undefined') return
    if (!st.probe || (!st.probe.sessions && Date.now() - st.probeAt > 60000)) {
        st.probeAt = Date.now()
        probeStore(base()).then((p) => { st.probe = p; if (p.sessions) drainNow() }).catch(() => { st.probe = { ok: false, sessions: false } })
        // S7 honesty: if the latest probe says no store, any pill on screen
        // is stale — take it down until the store is real again.
        if (st.probe && !st.probe.sessions) publishBadge({ kind: 'hidden', text: '', holdMs: 0 })
    }
    if (!st.onlineArmed) {
        st.onlineArmed = true
        try { window.addEventListener('online', () => { if (st.probe && st.probe.sessions) drainNow() }) } catch { /* no window events: single-attempt world */ }
    }
}

// drainNow — retry the outbox against the live store. Consent is read FRESH
// per ENTRY, keyed by the name the take was queued under (audit 1: one device
// may hold takes from two humans; revoking `mia` purges her pile while
// `jon`'s ship) — last-moment rule unchanged: motion revoked = nothing
// uploads. Stats land on window.__outbox for the harness.
// S7: the phone narrates — only when the pen has work (no empty-queue
// theater), and the closing view comes from badgeView over the pass facts.
export async function drainNow() {
    if (typeof window === 'undefined') return null
    const consentOf = (e) => consentFor(ls(), (e && e.player) || ANON_ID)
    const storeLive = !!(st.probe && st.probe.sessions)
    const before = await countQueue()
    if (storeLive && before > 0) publishBadge(badgeView({ storeLive, phase: 'drain', left: before }))
    const out = await drainOutbox({
        motion: (e) => consentOf(e).motion,
        upload: (e) => uploadSession(e.rec, { player: (e && e.player) || ANON_ID, consent: consentOf(e), base: base() }),
    })
    window.__outbox = { ...out, at: Date.now() }
    if (storeLive) publishBadge(badgeView({ storeLive, sent: out.sent.length, left: out.queued }))
    return out
}

// askConsent — resolve the CURRENT player's stored decision, asking once if
// the store is live and that player is undecided (or the 90-day grace
// expired). The gate answers WHO too: saving anything requires a valid name,
// and consent keys to it. A named answer becomes the device's prefill for
// the next ask (prefill, not consent).
export async function askConsent() {
    if (typeof window === 'undefined') return { motion: false, voice: false, at: 0 }
    if (!st.probe) st.probe = await probeStore(base()).catch(() => ({ ok: false, sessions: false }))
    const last = loadLastPlayer(ls())
    const plan = planGate({ probe: st.probe, lastPlayer: last, consentForId: (id) => consentFor(ls(), id) })
    st.id = plan.id
    if (!plan.ask) return consentFor(ls(), plan.id)
    if (st.gate) { await st.gate; return consentFor(ls(), st.id || plan.id) }
    st.gate = new Promise((resolve) => {
        const host = document.createElement('div')
        host.setAttribute('data-auto-record-gate', '')
        host.style.cssText = 'position:fixed;inset:0;z-index:9990'
        document.body.appendChild(host)
        const root = createRoot(host)
        const finish = (answer) => {
            st.gate = null
            root.unmount()
            host.remove()
            const a = answer || {}
            const pid = playerId(a.name)
            const wantsSave = !!a.motion || !!a.voice
            let id
            if (wantsSave && pid && canGrant(pid)) {
                id = pid
                rememberPlayer(ls(), a.name)
                const prev = consentFor(ls(), id)
                grantConsent(ls(), id, decideMerge(prev, a))
            } else if (!wantsSave && pid) {
                // named decline: the name is useful as prefill; the DECLINE
                // keys to the name so this person's NO silences THIS person's
                // gate (someone else on the phone gets asked their own).
                id = pid
                rememberPlayer(ls(), a.name)
                grantConsent(ls(), id, decideMerge(consentFor(ls(), id), { motion: false, voice: false }))
            } else {
                // unnamed decline (or a save with no name — the gate's UI
                // refuses that; this is the honest fallback): decline anon.
                id = ANON_ID
                grantConsent(ls(), ANON_ID, decideMerge(consentFor(ls(), ANON_ID), { motion: false, voice: false }))
            }
            st.id = id
            resolve(consentFor(ls(), id))
        }
        root.render(React.createElement(ConsentGate, { defaultName: last ? last.name : '', hasMic: voiceSupported(), onDecide: finish }))
    })
    return st.gate
}

// startBusy — the human-start sites guard re-entry while askConsent is up
// (the gate swallows Space, but the keydown may have fired twice).
export const startBusy = () => st.busy
export const setStartBusy = (v) => { st.busy = !!v }

// beginRun — sync, call IMMEDIATELY after the game object for the new run is
// created (before its first tick). Returns true when a recorder is now bank.
// Records only when the stored plan says so; never asks here (asking belongs
// at start, before seed-birth). The run's take is stamped with the player id
// (audit 1) so consent evidence lives in the file, not only the envelope.
export function beginRun(opts = {}) {
    if (typeof window === 'undefined') return false
    const id = (opts.player && playerId(opts.player)) || (st.id && st.id !== ANON_ID && st.id) || (loadLastPlayer(ls()) || {}).id || ANON_ID
    const consent = consentFor(ls(), id)
    const plan = planRun(st.probe || { ok: false, sessions: false }, consent)
    if (!plan.record) return false
    st.id = id
    return autoStart({ voiceConsent: consent.voice, sources: opts.sources, humanSeats: opts.humanSeats, player: id === ANON_ID ? null : id })
}

// endRun — async, call at the over-transition (and unmount). Stops the
// recorder, waits for the mic's final chunk (bounded), and uploads through
// the consent gate. Returns null when nothing was recording.
export async function endRun(opts = {}) {
    if (typeof window === 'undefined' || !isRecording()) return null
    const out = autoStop()
    if (!out) return null
    const { rec, flush } = out
    // audit 1: identity order — explicit opt, the take's own stamp (seed-
    // birth truth), the session's gate answer, the device prefill name.
    const id = (opts.player && playerId(opts.player)) || rec.player || st.id || (loadLastPlayer(ls()) || {}).id || ANON_ID
    // S6: persist BEFORE the first attempt — the crash window is exactly the
    // await on fetch (iOS cancels in-flight uploads when the tab backgrounds,
    // and OVER-to-close is a thumb's width). Removed only when the store has
    // it or a permanent-failure rule says it never can.
    // #2964 item 4: the flush race below is a SECOND crash window, and longer
    // career takes ride it longer. So the bank comes first and the pen says
    // what it holds: an entry queued while the mic tail is still racing wears
    // `voiceFlushPending`; when the race resolves the entry is rewritten —
    // whole take (name gone) or `voiceFlushTimedOut` (#2093's named outcome,
    // now surviving the tab it was named on). Close-mid-career tab-kills are
    // then never silence: the pen either holds the whole take or says so.
    const entry = await queueRun(rec, id, flush ? { voiceFlushPending: true } : null)
    // #2093 item 4: a flush that never lands is a NAMED outcome, not silence.
    // Past the 5 s race the last chunk (or the whole track, worst case) rides
    // off missing — say so on the two surfaces the harnesses read, so a
    // voiceless upload can be traced to the flush instead of a mystery.
    let voiceFlushTimedOut = false
    if (flush) {
        let flushed = false
        try {
            await Promise.race([flush.then(() => { flushed = true }).catch(() => null), new Promise((r) => setTimeout(r, 5000))])
        } catch { /* the take ships without the last chunk rather than not at all */ }
        voiceFlushTimedOut = !flushed
        if (voiceFlushTimedOut) window.__autoCapture = { ...(window.__autoCapture || {}), voiceFlushTimedOut: true }
        // carry the verdict onto the pen entry (the one surface that outlives
        // the tab): tail joined -> names cleared; timeout -> named.
        if (entry) await updateEntry(entry, rec, voiceFlushTimedOut ? { voiceFlushTimedOut: true } : null)
    }
    // last-moment consent, read fresh after the race (unchanged since S6: what
    // gates the upload is the answer AT upload time, not at seed-birth).
    const consent = consentFor(ls(), id)
    const storeLive = !!(st.probe && st.probe.sessions)
    // S7: saved first, said first — a persisted take IS pending-sync before
    // the network ever answers, and the hang window is exactly where the
    // player is left wondering.
    if (storeLive && entry) publishBadge(badgeView({ storeLive, requeued: true, left: 1 }))
    const res = await uploadSession(rec, { player: id, consent, base: base() })
    if (entry) {
        if (res.uploaded || classifyFailure(res.reason) === 'drop') await dropEntry(entry.id)
        res.requeued = !res.uploaded && classifyFailure(res.reason) !== 'drop'
    }
    // S7: say what happened. left is the pen's real backlog after this run's
    // fate (a fresh upload with stale takes waiting still shows the backlog —
    // rule 2, backlog beats success).
    const left = storeLive ? await countQueue() : 0
    publishBadge(badgeView({ storeLive, uploaded: !!res.uploaded, requeued: !!res.requeued, left }))
    window.__autoRecord = {
        last: {
            game: rec.game, seed: rec.seed, ticks: rec.ticks,
            player: id, // audit 1: the label this take went up under
            voice: !!rec.voice, uploaded: !!res.uploaded,
            reason: res.reason || null, key: res.key || null,
            requeued: !!res.requeued, queued: entry ? 1 : 0,
            voiceFlushTimedOut, // #2093: the missing-tail outcome has a name
        },
    }
    return res
}
