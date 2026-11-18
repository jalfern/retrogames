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
import { DIR_FIELDS, AIM_FIELDS } from './onePad.js'

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
// Gauntlet session: steering/drift adds edges, and normal play happens between
// claps. matchClapEdges pairs each onset with the NEAREST CLAP-TAP — an edge
// tagged `control: 'a'`, the ONE control the player instructions name (#2056:
// "smack the orange A button") — within a ±windowMs search window, then the
// SAME ±50 ms line runs over those pairs. Edges of every OTHER control
// (direction bits, analog crossings, b/start/aim) are CONTEXT ONLY: counted in
// ignoredEdges, never paired. That restriction is the 2026-11-12 AUDIT fix: with
// any-control pairing, a phone whose audio lags ~120 ms could land its onset on
// an unrelated steering edge inside ±50 ms and grade GREEN — the acceptance line
// must only ever measure the tap that the test physically coincides with the
// clap. Taps with no nearby onset stay unmatched and keep the take honest via
// minPairs (default 3 — the physical test is three claps). The search window
// makes the take gradeable; it does NOT soften the budget: a tap inside window
// but outside ±50 ms still goes RED, so a lagging mic comes back honestly RED
// (measured), not merely ungradeable — hence ±250 ms candidates against the
// ±50 ms acceptance line. SHAPE LAW: edges must be {t, control} objects; plain
// numbers pair NOTHING (fail-closed — a caller that forgets the tags gets RED,
// never a silent return to any-control pairing).
export const CLAP_SEARCH_MS = 250
export const CLAP_MIN_PAIRS = 3

export function matchClapEdges(r) {
    const sr = Number.isFinite(r.sampleRate) && r.sampleRate > 0 ? r.sampleRate : 48000
    const tol = Number.isFinite(r.tolMs) ? r.tolMs : CLAP_TOL_MS
    const win = Number.isFinite(r.windowMs) ? r.windowMs : CLAP_SEARCH_MS
    const minPairs = Number.isFinite(r.minPairs) ? r.minPairs : CLAP_MIN_PAIRS
    const onsets = r.onsets || []
    const edges = (r.edges || []).filter((e) => e && Number.isFinite(e.t))
    const tapSet = new Set(edges.filter((e) => e.control === 'a').map((e) => e.t))
    const tapTicks = [...tapSet].sort((a, b) => a - b)
    const ignored = edges.length - tapSet.size
    const clock = r.clock || []
    // #1711 report card: the residue WITH times. The pairing loop already knows
    // which onsets never met a tap and which taps never met an onset — before,
    // it threw those times away and kept only counts, so the phone's graded
    // screen could not say WHICH slap was airborne and which was silent. These
    // fields are the same numbers the counts already measure (additive — ok,
    // pairs, matched and every verdict word are untouched).
    const onsetMs = (o) => +((o / sr) * 1000).toFixed(1)
    if (!clock.length) return { ok: false, pairs: [], matched: 0, unmatchedOnsets: onsets.length, ignoredEdges: edges.length, unmatchedOnsetMs: [], unmatchedTapMs: [], worstMs: null, why: 'no clock trace' }
    if (!tapTicks.length) return { ok: false, pairs: [], matched: 0, unmatchedOnsets: onsets.length, ignoredEdges: ignored, unmatchedOnsetMs: onsets.map(onsetMs), unmatchedTapMs: [], worstMs: null, why: 'no A-button taps recorded — the clap test names the A button (#2056)' }
    const pairs = []
    const used = new Set()
    let unmatched = 0
    const unmatchedOnsetMs = []
    for (const o of onsets) {
        const heardMs = (o / sr) * 1000
        let best = null
        for (const t of tapTicks) {
            const expectedMs = tickToMs(clock, t)
            if (expectedMs == null) continue
            const d = Math.abs(heardMs - expectedMs)
            if (d <= win && d <= (best ? best.d : Infinity) && !used.has(t)) { best = { t, expectedMs, d }; }
        }
        if (!best) { unmatched++; unmatchedOnsetMs.push(onsetMs(o)); continue }
        used.add(best.t)
        pairs.push({ tick: best.t, expectedMs: +best.expectedMs.toFixed(1), heardMs: +heardMs.toFixed(1), offsetMs: +(heardMs - best.expectedMs).toFixed(1) })
    }
    pairs.sort((a, b) => a.tick - b.tick)
    const matched = pairs.length
    const unmatchedTapMs = tapTicks.filter((t) => !used.has(t))
        .map((t) => tickToMs(clock, t)).filter((ms) => Number.isFinite(ms)).map((ms) => +ms.toFixed(1))
    if (matched < minPairs) {
        return { ok: false, pairs, matched, unmatchedOnsets: unmatched, ignoredEdges: ignored, unmatchedOnsetMs, unmatchedTapMs, worstMs: null,
            why: `${matched} clap-coincident A-tap(s) of ${onsets.length} clap(s) — need ${minPairs} (a real take has a clap per tap)` }
    }
    const worst = pairs.reduce((w, p) => (Math.abs(p.offsetMs) > Math.abs(w) ? p.offsetMs : w), 0)
    const broke = pairs.filter((p) => Math.abs(p.offsetMs) > tol)
    return {
        ok: broke.length === 0,
        pairs,
        matched,
        unmatchedOnsets: unmatched,
        ignoredEdges: ignored,
        unmatchedOnsetMs,
        unmatchedTapMs,
        worstMs: +worst.toFixed(1),
        why: broke.length ? `${broke.length}/${matched} clap(s) outside ±${tol} ms` : `${matched} clap(s) inside ±${tol} ms`,
    }
}

// LOAD-HONEST PAIR GATE (#1711, #2664; hardened by the 2026-11-18 AUDIT item 3)
// — the synth clap run's verdict on a RED ±50 ms pair, as one pure decision.
// A contended box jitters the CDP key arrival while the audio side stays stable:
// when the take's OWN clock trace proves the world paced >tol off realtime
// (driftMs = voiceDrift(clock).maxLagMs) and the worst offset sits inside that
// demonstrated band (+tol), the measurement is noise — SKIP, named, never PASS.
// A desync LARGER than the proven drift goes RED regardless (anti-laundering),
// and --witness turns the skip off entirely for the quiet-box proof.
//
// THE SIGNATURE ZONE (audit 2026-11-18 item 3): the first bf1a96e studio run
// failed line 3 with ONE 102.8 ms offset while the same trace drifted 102 ms —
// and #2664's rule skipped it as jitter. But an offset that sits ON the drift
// is not random arrival noise: it is exactly what audio stamped on REALTIME
// instead of the frame clock measures (offset ≡ clock-vs-realtime lag, by
// construction). Random jitter landing within a millisecond of the drift
// constant is possible but rare; a refusal costs one rerun. So when |worst −
// drift| ≤ CLAP_OPUS_FRAME_MS (one opus frame — the encoder/onset precision of
// the measurement itself) the gate REFUSES to skip: RED, naming the signature
// and the margin. Also hardening the band comparison to |offset| throughout —
// the old signed form let a −200 ms EARLY offset slip under drift+tol.
export const CLAP_OPUS_FRAME_MS = 20

export function clapPairGate(r = {}) {
    const tol = Number.isFinite(r.tolMs) ? r.tolMs : CLAP_TOL_MS
    const band = Number.isFinite(r.sigBandMs) ? r.sigBandMs : CLAP_OPUS_FRAME_MS
    if (r.ok) return { action: 'PASS' }
    const worst = Number.isFinite(r.worstMs) ? Math.abs(r.worstMs) : null
    const drift = Number.isFinite(r.driftMs) ? Math.abs(r.driftMs) : 0
    if (worst === null) return { action: 'RED', why: 'red pair with no measured offset' }
    if (r.witness) return { action: 'RED', why: `worst ${worst} ms — strict --witness run, skips off` }
    if (Math.abs(worst - drift) <= band) {
        return {
            action: 'RED',
            signature: true,
            marginMs: +(worst - drift).toFixed(1),
            why: `worst ${worst} ms sits ${Math.abs(worst - drift).toFixed(1)} ms from the take's own ${drift.toFixed(1)} ms drift (<= ${band} ms = one opus frame) — the realtime-stamp signature (#1711 audit 2026-11-18: audio stamped on wall clock instead of the frame clock measures exactly this). Not jitter; refuse SKIP. Fix the stamp, or prove the shape with --witness on a quiet box.`,
        }
    }
    if (drift > tol && worst <= drift + tol) {
        return { action: 'SKIP', why: `contended box: world paced ${drift.toFixed(1)} ms off realtime; worst offset ${worst} ms is inside that drift band (+${tol}) but ${Math.abs(worst - drift).toFixed(1)} ms off the drift constant — arrival jitter, not the pipeline. Rerun when the box is quiet, or --witness on a quiet box.` }
    }
    return { action: 'RED', why: `worst ${worst} ms exceeds drift band ±${(drift + tol).toFixed(0)} ms${drift <= tol ? ' (clean box — no demonstrated drift to excuse it)' : ''}` }
}

// takeEdges(rec) — the per-seat edge flattening the studio analyzer uses
// (#2156: the phone screen must grade with the SAME code, so the extraction
// moves here from scripts/plaicraft-clap.mjs and both surfaces call it).
// Digital bits as rising edges tagged by their own control name; analog
// channels (post-zone and raw) as |value| threshold crossings tagged
// `ana:`/`raw:` so matchClapEdges sees them as CONTEXT only — pairing stays
// exclusive to the `a` taps (#2056's named control, audit 2026-11-12).
// Semantics byte-identical to the inline block this replaced.
const TAKE_DIG = [...DIR_FIELDS, 'a', 'b', 'start', ...AIM_FIELDS]
const TAKE_ANA = ['x', 'y', 'ax', 'ay']
const TAKE_RAW = ['x', 'y', 'ax', 'ay', 'px', 'py']
const TAKE_CROSS = 0.5

export function takeEdges(rec) {
    const out = []
    ;(rec && rec.slots || []).forEach((slot, seat) => {
        const pads = (slot && slot.pads) || []
        const raws = (slot && slot.raw) || []
        const edges = []
        const seen = new Set()
        const add = (t, control) => { const k = `${t}|${control}`; if (!seen.has(k)) { seen.add(k); edges.push({ t, control }) } }
        for (let i = 0; i < pads.length; i++) {
            const p = pads[i] || {}
            const q = i ? pads[i - 1] || {} : {}
            for (const f of TAKE_DIG) if (p[f] && !q[f]) add(i + 1, f)
            for (const f of TAKE_ANA) if (Math.abs(p[f] || 0) >= TAKE_CROSS && Math.abs(q[f] || 0) < TAKE_CROSS) add(i + 1, `ana:${f}`)
        }
        for (let i = 0; i < raws.length; i++) {
            const p = raws[i] || {}
            const q = i ? raws[i - 1] || {} : {}
            for (const f of TAKE_RAW) if (Math.abs(p[f] || 0) >= TAKE_CROSS && Math.abs(q[f] || 0) < TAKE_CROSS) add(i + 1, `raw:${f}`)
        }
        if (edges.length) out.push({ seat, edges, taps: edges.filter((e) => e.control === 'a').length })
    })
    return out
}
