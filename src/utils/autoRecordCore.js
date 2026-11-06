// AUTO-CAPTURE RULES (#1711 S2, pure) — the decision logic behind PLAICRAFT's
// consent-gated auto-recording, DOM-free so recordcheck can pin it (mutants
// included). autoRecord.js is the browser shell; this file answers, for one
// human run: do we ask? do we record? do we upload?
//
//   store off   -> ask nothing, record nothing (a capability the worker does
//                  not answer must not train players to tap a dead button, #737)
//   undecided   -> ask BEFORE the game is created: the recorder must open at
//                  seed-birth so the banked pads start at tick 1 and the stored
//                  file replay-verifies (a gate mid-run would cut the head off
//                  the pad stream)
//   granted     -> record motion; voice only with the voice grant (the mic
//                  layer re-checks too — defence in depth)
//   declined    -> play on, nothing recorded, nothing uploaded; the decision
//                  is stored (consent.js), so we ask once per 90 days, not
//                  once per run
//   revoked     -> uploadSession re-reads consent at the last moment; a
//                  mid-run revoke stops the bytes (stage-1 gate, unchanged)

// planRun(probe, consent) -> { ask, record, reason }
export function planRun(probe, consent) {
    if (!probe || !probe.sessions) return { ask: false, record: false, reason: 'store-off' }
    const c = consent || {}
    if (!c.at || c.expired) return { ask: true, record: false, reason: 'undecided' }
    return { ask: false, record: !!c.motion, reason: c.motion ? 'granted' : 'declined' }
}

// decideMerge(prev, answer) — what grantConsent stores after a gate answer:
// the gate sends both switches explicitly; an absent switch keeps its previous
// value (the consent.js grant rule, restated here so the wiring and the store
// cannot drift on the one point that matters: a voice re-ask never silently
// revokes motion).
export function decideMerge(prev, answer) {
    const p = prev || {}
    const a = answer || {}
    return {
        motion: a.motion === undefined ? !!p.motion : !!a.motion,
        voice: a.voice === undefined ? !!p.voice : !!a.voice,
    }
}
