// CLAP SYNC (#1711 S3) — the ±50 ms acceptance line as code. The issue demands
// "audio lines up with the frames to within ±50 ms (prove it with a clap test)",
// and plaicraft-evidence.mjs defers that proof to the browser, where opus bytes
// decode. This module is the PROOF half: pure, DOM-free, so recordcheck pins it
// offline and the browser driver (scripts/plaicraft-clap.mjs) runs it against
// bytes that came out of the real MediaRecorder path.
//
// A clap test works because a clap is a click: full-scale, near-instant attack.
// The player claps AND presses a button at the same instant; in the stored file
// the pad press sits at tick T, and the clap's onset sits at ms M in the audio.
// The clock trace says tick T belongs at tickToMs(clock, T) ms. If the capture
// pipeline is honest, |M - tickToMs(T)| <= CLAP_TOL_MS for every pair — and the
// error includes everything that could cheat it (mic-open vs recorder-start
// offset, encoder priming, clock interpolation, throttled-box drift).

import { tickToMs } from './voice.js'

export const CLAP_TOL_MS = 50 // the acceptance line, verbatim from #1711

// detectClaps(samples, { sampleRate, threshold, minGapMs, quietMs }) -> onset sample indices.
// Onset = first loud sample (|a| >= threshold) after a continuous quiet stretch
// (all samples <= threshold/3 for >= quietMs) and >= minGapMs since the last
// onset — a clap train spaced 300 ms apart separates; one burst does not
// double-fire. Noise floors (the synth mic's hum, room noise) sit far below
// the threshold; real claps on a phone mic sit far above it.
export function detectClaps(samples, opts = {}) {
    const sr = Number.isFinite(opts.sampleRate) && opts.sampleRate > 0 ? opts.sampleRate : 48000
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.35
    const minGap = Math.max(1, Math.round(((opts.minGapMs ?? 300) / 1000) * sr))
    const quietNeed = Math.max(1, Math.round(((opts.quietMs ?? 60) / 1000) * sr))
    const quiet = threshold / 3
    const onsets = []
    let below = 0
    for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i] || 0)
        if (a >= threshold) {
            if (below >= quietNeed && (!onsets.length || i - onsets[onsets.length - 1] >= minGap)) onsets.push(i)
            below = 0
        } else if (a <= quiet) {
            below++
        }
    }
    return onsets
}

// clapVerdict({ sampleRate, onsets (sample indices), clock (track trace),
// pressTicks (sim tick of the button pressed with each clap), tolMs }) ->
// { ok, pairs, worstMs, why }. Pairing is by ORDER (the driver claps in time
// order); a missing clap, a stray clap, or any pair beyond the budget fails,
// and `why` says which. offsetsMs > 0 means the sound arrives LATE against the
// frame clock — the direction a trainer needs to correct.
export function clapVerdict(r) {
    const sr = Number.isFinite(r.sampleRate) && r.sampleRate > 0 ? r.sampleRate : 48000
    const tol = Number.isFinite(r.tolMs) ? r.tolMs : CLAP_TOL_MS
    const onsets = r.onsets || []
    const pressTicks = r.pressTicks || []
    const clock = r.clock || []
    if (!clock.length) return { ok: false, pairs: [], worstMs: null, why: 'no clock trace' }
    if (pressTicks.length < 1) return { ok: false, pairs: [], worstMs: null, why: 'no clap-coincident presses recorded' }
    if (onsets.length !== pressTicks.length) {
        return { ok: false, pairs: [], worstMs: null, why: `heard ${onsets.length} clap(s) for ${pressTicks.length} press(es) — a clap test is exact` }
    }
    const pairs = pressTicks.map((t, i) => {
        const expectedMs = tickToMs(clock, t)
        const heardMs = (onsets[i] / sr) * 1000
        return { tick: t, expectedMs: +expectedMs.toFixed(1), heardMs: +heardMs.toFixed(1), offsetMs: +(heardMs - expectedMs).toFixed(1) }
    })
    const worst = pairs.reduce((w, p) => (Math.abs(p.offsetMs) > Math.abs(w) ? p.offsetMs : w), 0)
    const broke = pairs.filter((p) => Math.abs(p.offsetMs) > tol)
    return {
        ok: broke.length === 0,
        pairs,
        worstMs: +worst.toFixed(1),
        why: broke.length ? `${broke.length}/${pairs.length} clap(s) outside ±${tol} ms` : `${pairs.length} clap(s) inside ±${tol} ms`,
    }
}

// PHONE GRADING (#2056): the order-pairing above assumes a take where the ONLY
// presses are the clap taps — true for the synth driver, false for a real phone
// Gauntlet session: the analog stick adds steering/drift edges, the attack
// buttons never enter the direction streams, and normal play happens between
// claps. matchClapEdges pairs each onset with the NEAREST input edge of ANY
// control (buttons, direction bits, analog threshold crossings — the caller
// flattens them into one tick list) within a ±windowMs search window, then the
// SAME ±50 ms line runs over those pairs. Edges with no nearby onset are
// ignored (play is not a clap); onsets with no nearby edge stay unmatched and
// keep the take honest via minPairs (default 3 — the physical test is three
// claps). The search window makes the take gradeable; it does NOT soften the
// budget: an edge inside window but outside ±50 ms still goes RED, so the
// 500 ms mutant (presses half a second from their claps) can never pair and
// can never pass. Window > budget on purpose: a phone whose mic sits ~200 ms
// behind the frame clock must come back honestly RED (measured), not merely
// ungradeable — hence ±250 ms candidates against the ±50 ms acceptance line.
export const CLAP_SEARCH_MS = 250
export const CLAP_MIN_PAIRS = 3

export function matchClapEdges(r) {
    const sr = Number.isFinite(r.sampleRate) && r.sampleRate > 0 ? r.sampleRate : 48000
    const tol = Number.isFinite(r.tolMs) ? r.tolMs : CLAP_TOL_MS
    const win = Number.isFinite(r.windowMs) ? r.windowMs : CLAP_SEARCH_MS
    const minPairs = Number.isFinite(r.minPairs) ? r.minPairs : CLAP_MIN_PAIRS
    const onsets = r.onsets || []
    const edgeTicks = [...(r.edgeTicks || [])].sort((a, b) => a - b)
    const clock = r.clock || []
    if (!clock.length) return { ok: false, pairs: [], matched: 0, unmatchedOnsets: onsets.length, ignoredEdges: edgeTicks.length, worstMs: null, why: 'no clock trace' }
    if (!edgeTicks.length) return { ok: false, pairs: [], matched: 0, unmatchedOnsets: onsets.length, ignoredEdges: 0, worstMs: null, why: 'no input edges recorded' }
    const pairs = []
    const used = new Set()
    let unmatched = 0
    for (const o of onsets) {
        const heardMs = (o / sr) * 1000
        let best = null
        for (const t of edgeTicks) {
            const expectedMs = tickToMs(clock, t)
            if (expectedMs == null) continue
            const d = Math.abs(heardMs - expectedMs)
            if (d <= win && d <= (best ? best.d : Infinity) && !used.has(t)) { best = { t, expectedMs, d }; }
        }
        if (!best) { unmatched++; continue }
        used.add(best.t)
        pairs.push({ tick: best.t, expectedMs: +best.expectedMs.toFixed(1), heardMs: +heardMs.toFixed(1), offsetMs: +(heardMs - best.expectedMs).toFixed(1) })
    }
    pairs.sort((a, b) => a.tick - b.tick)
    const matched = pairs.length
    if (matched < minPairs) {
        return { ok: false, pairs, matched, unmatchedOnsets: unmatched, ignoredEdges: edgeTicks.length - matched, worstMs: null,
            why: `${matched} clap-coincident edge(s) of ${onsets.length} clap(s) — need ${minPairs} (a real take has a clap per tap)` }
    }
    const worst = pairs.reduce((w, p) => (Math.abs(p.offsetMs) > Math.abs(w) ? p.offsetMs : w), 0)
    const broke = pairs.filter((p) => Math.abs(p.offsetMs) > tol)
    return {
        ok: broke.length === 0,
        pairs,
        matched,
        unmatchedOnsets: unmatched,
        ignoredEdges: edgeTicks.length - matched,
        worstMs: +worst.toFixed(1),
        why: broke.length ? `${broke.length}/${matched} clap(s) outside ±${tol} ms` : `${matched} clap(s) inside ±${tol} ms`,
    }
}
