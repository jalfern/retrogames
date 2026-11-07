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
// Online lockstep runs are NOT auto-recorded in S2 (the wire owns the seats;
// honest gap in the Gauntlet/Gravel README) — offline human runs, which is
// what the acceptance table asks for (Jon's phone, solo or vs CPU).

import { consentFor, grantConsent } from './consent.js'
import { probeStore, uploadSession, storeFromQuery } from './sessionStore.js'
import { queueRun, dropEntry, drain as drainOutbox } from './outbox.js'
import { classifyFailure } from './outboxCore.js'
import { voiceSupported } from './voiceCapture.js'
import { autoStart, autoStop, isRecording } from './gameContract.js'
import { planRun, decideMerge } from './autoRecordCore.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import ConsentGate from '../components/ConsentGate.jsx'

// One local human per device in S2; remote seats keep their own device's
// consent story (and are not auto-recorded yet).
export const PLAYER_ID = 'player'

const st = {
    probe: null, // { ok, sessions } — newest probe wins; refreshed when stale-false
    probeAt: 0,
    gate: null, // single-flight: one question on screen at a time
    base: null,
    busy: false, // a start is mid-ask (Space held through the gate must not re-enter)
    onlineArmed: false, // S6: the online->drain listener is installed once
}

const ls = () => { try { return localStorage } catch { return null } }
const base = () => st.base || (st.base = storeFromQuery(typeof window !== 'undefined' ? window.location.search : ''))

// initAutoRecord — fire the capability probe early (mount time), so by the
// moment the player reaches "start" the answer is already in hand and an
// already-decided player boots with zero added delay. S6: boot is also a
// drain trigger — a phone that was offline yesterday ships its queue today.
export function initAutoRecord() {
    if (typeof window === 'undefined') return
    if (!st.probe || (!st.probe.sessions && Date.now() - st.probeAt > 60000)) {
        st.probeAt = Date.now()
        probeStore(base()).then((p) => { st.probe = p; if (p.sessions) drainNow() }).catch(() => { st.probe = { ok: false, sessions: false } })
    }
    if (!st.onlineArmed) {
        st.onlineArmed = true
        try { window.addEventListener('online', () => { if (st.probe && st.probe.sessions) drainNow() }) } catch { /* no window events: single-attempt world */ }
    }
}

// drainNow — retry the outbox against the live store. Consent is read FRESH
// (last-moment rule unchanged: motion revoked = nothing uploads, and
// planDrain purges the pile). Stats land on window.__outbox for the harness.
export async function drainNow() {
    if (typeof window === 'undefined') return null
    const consent = consentFor(ls(), PLAYER_ID)
    const out = await drainOutbox({
        motion: consent.motion,
        upload: (e) => uploadSession(e.rec, { player: e.player, consent: consentFor(ls(), PLAYER_ID), base: base() }),
    })
    window.__outbox = { ...out, at: Date.now() }
    return out
}

// askConsent — resolve the player's stored decision, asking once if the store
// is live and the player is undecided (or the 90-day grace expired).
export async function askConsent() {
    if (typeof window === 'undefined') return { motion: false, voice: false, at: 0 }
    if (!st.probe) st.probe = await probeStore(base()).catch(() => ({ ok: false, sessions: false }))
    const plan = planRun(st.probe, consentFor(ls(), PLAYER_ID))
    if (!plan.ask) return consentFor(ls(), PLAYER_ID)
    if (st.gate) { await st.gate; return consentFor(ls(), PLAYER_ID) }
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
            const prev = consentFor(ls(), PLAYER_ID)
            const m = decideMerge(prev, answer)
            grantConsent(ls(), PLAYER_ID, m)
            resolve(consentFor(ls(), PLAYER_ID))
        }
        root.render(React.createElement(ConsentGate, { player: 'PLAYER', hasMic: voiceSupported(), onDecide: finish }))
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
// at start, before seed-birth).
export function beginRun(opts = {}) {
    if (typeof window === 'undefined') return false
    const plan = planRun(st.probe || { ok: false, sessions: false }, consentFor(ls(), PLAYER_ID))
    if (!plan.record) return false
    const c = consentFor(ls(), PLAYER_ID)
    return autoStart({ voiceConsent: c.voice, sources: opts.sources })
}

// endRun — async, call at the over-transition (and unmount). Stops the
// recorder, waits for the mic's final chunk (bounded), and uploads through
// the consent gate. Returns null when nothing was recording.
export async function endRun(opts = {}) {
    if (typeof window === 'undefined' || !isRecording()) return null
    const out = autoStop()
    if (!out) return null
    const { rec, flush } = out
    if (flush) {
        try {
            await Promise.race([flush.catch(() => null), new Promise((r) => setTimeout(r, 5000))])
        } catch { /* the take ships without the last chunk rather than not at all */ }
    }
    const consent = consentFor(ls(), PLAYER_ID)
    // S6: persist BEFORE the first attempt — the crash window is exactly the
    // await on fetch (iOS cancels in-flight uploads when the tab backgrounds,
    // and OVER-to-close is a thumb's width). Removed only when the store has
    // it or a permanent-failure rule says it never can.
    const entry = await queueRun(rec, opts.player || PLAYER_ID)
    const res = await uploadSession(rec, { player: opts.player || PLAYER_ID, consent, base: base() })
    if (entry) {
        if (res.uploaded || classifyFailure(res.reason) === 'drop') await dropEntry(entry.id)
        res.requeued = !res.uploaded && classifyFailure(res.reason) !== 'drop'
    }
    window.__autoRecord = {
        last: {
            game: rec.game, seed: rec.seed, ticks: rec.ticks,
            voice: !!rec.voice, uploaded: !!res.uploaded,
            reason: res.reason || null, key: res.key || null,
            requeued: !!res.requeued, queued: entry ? 1 : 0,
        },
    }
    return res
}
