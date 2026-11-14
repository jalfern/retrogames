// CLAP TEST CORE (#2156) — the pure rules of the one-screen clap test, DOM-free
// so recordcheck pins them offline (the browser half is scripts/claptestplay.mjs).
//
// The screen: whole face = slap target, "turn the media volume down; slap the
// screen 3 times, about 2 s apart". Every slap is a pointerdown, which the
// component turns into an `a` press in the pad stream — the ONE control the
// A-only grader names (#2056). The recorder, clock, consent gate and upload are
// the game-take path (autoRecord/gameContract); this module owns only the two
// decisions the screen makes for itself:
//
// 1) the sim — phase machine, tick bank, deterministic hash (the take must
//    replay-verify like every other recording), and the auto-END rule;
// 2) the on-phone verdict — the SAME clapSync code the studio runs
//    (detectClaps + takeEdges + matchClapEdges, ±50 ms line untouched), plus
//    the plain-language hint #2156 asks for when the phone fails itself.

import { detectClaps, matchClapEdges, takeEdges, CLAP_TOL_MS, CLAP_MIN_PAIRS } from './clapSync.js'

export const FIXED_DT = 1000 / 60
export const SLAPS_NEEDED = 3 // #2156: "slap the screen 3 times" — and CLAP_MIN_PAIRS stays 3
export const TEST_CAP_TICKS = Math.round(12000 / FIXED_DT) // 12 s of patience, then grade what arrived
export const SETTLE_TICKS = Math.round(600 / FIXED_DT) // after the 3rd tap: a beat for a 4th slap, then END
export const SLAP_HOLD_TICKS = Math.round(140 / FIXED_DT) // a palm slap is ~140 ms of contact

// --- the sim -------------------------------------------------------------------
// hash is recomputable from (seed, tick, taps) alone — replay feeds the same
// pads, sees the same taps, lands the same hash at every checkpoint.

const mix = (a, b) => {
    let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) | 0
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return h >>> 0
}

export function createTestSim({ seed }) {
    if (!Number.isInteger(seed)) throw new Error('clapTest: seed must be an integer')
    const taps = []
    let tick = 0
    let prevA = false
    let phase = 'attract'

    const hashNow = () => mix(mix(mix(seed >>> 0, tick), taps.length), (taps[taps.length - 1] || 0) + 1)

    return {
        get phase() { return phase },
        get ticks() { return tick },
        get taps() { return taps.slice() },
        hash() { return hashNow() },
        start() { if (phase === 'attract') phase = 'testing' },
        // one simulated play tick; pad is the normalized {a} view. Returns the
        // phase AFTER the tick, so the loop can end the take the instant the
        // rule fires.
        step(pad) {
            if (phase !== 'testing') return phase
            tick++
            const a = !!(pad && pad.a)
            if (a && !prevA) taps.push(tick)
            prevA = a
            const settled = taps.length >= SLAPS_NEEDED && tick - taps[taps.length - 1] >= SETTLE_TICKS
            if (settled || tick >= TEST_CAP_TICKS) phase = 'ended'
            return phase
        },
    }
}

// --- the on-phone verdict --------------------------------------------------------
// samples: Int16 PCM decoded IN the browser from the take's own opus (same
// conversion the studio analyzer uses). rec: the finished take (v2, voice
// track + clock). Grading is seat-by-seat through the SAME matchClapEdges the
// studio runs over the downloaded bytes — phone and studio can only disagree
// if the bytes differ, which is the point of uploading first.

// pacing readout (#2205): measured ms gap to the PREVIOUS slap, so the player
// corrects the ~2 s rhythm mid-test instead of after the verdict. null until a
// second slap exists. Pure over the sim's tick bank.
export function lastGapMs(taps) {
    if (!Array.isArray(taps) || taps.length < 2) return null
    return Math.round((taps[taps.length - 1] - taps[taps.length - 2]) * FIXED_DT)
}

// verdict history (#2205): pure list ops the page runs over localStorage so the
// pins stay DOM-free. newest first, capped; entries are {d, ok, worstMs, key}.
export function pushHistory(list, entry, cap = 5) {
    const l = Array.isArray(list) ? list.filter((e) => e && typeof e.ok === 'boolean') : []
    return [entry, ...l].slice(0, cap)
}
export function formatHistory(list) {
    const l = Array.isArray(list) ? list.filter((e) => e && typeof e.ok === 'boolean') : []
    return l.map((e) => {
        const d = new Date(e.d || 0)
        const day = Number.isNaN(d.getTime()) ? '?' : `${d.getMonth() + 1}/${d.getDate()}`
        const w = e.worstMs === null || e.worstMs === undefined ? '—' : `${Math.abs(e.worstMs)}ms`
        return `${day} ${e.ok ? 'PASS' : 'FAIL'} ${w}`
    }).join(' · ')
}

// hard-fail flavor (#2205): when nothing paired there is no worst gap to show,
// and a dead take must read differently from an instrumented partial. null when
// a value exists or the run passed — callers show the number then.
export function hardFailNote(v) {
    if (!v || v.ok || (v.worstMs !== null && v.worstMs !== undefined)) return null
    if ((v.claps || 0) === 0) return 'no slaps heard — the take is dead, nothing paired'
    return `mic heard ${v.claps} slaps but ${v.matched || 0} touches paired — no gap measured`
}

export function screenVerdict({ sampleRate, samples, rec, minPairs = CLAP_MIN_PAIRS, tolMs = CLAP_TOL_MS }) {
    if (!rec || !rec.voice || !Array.isArray(rec.voice.tracks) || !rec.voice.tracks.length || !rec.voice.tracks[0].clock || rec.voice.tracks[0].clock.length < 2) {
        return { ok: false, claps: 0, pairs: [], matched: 0, worstMs: null, why: 'no audio track in the take', hint: 'no microphone audio — say YES to the voice switch, and check the mic permission for this site' }
    }
    if (!samples || samples.length < 1000) {
        return { ok: false, claps: 0, pairs: [], matched: 0, worstMs: null, why: 'the mic recorded nothing', hint: "didn't hear the slaps, try louder" }
    }
    const onsets = detectClaps(Float32Array.from(samples, (v) => v / 32767), { sampleRate })
    const track = rec.voice.tracks[0]
    const seats = takeEdges(rec)
        .map((c) => ({ ...c, verdict: matchClapEdges({ sampleRate, onsets, edges: c.edges, clock: track.clock, minPairs, tolMs }) }))
        .sort((a, b) => (b.verdict.ok - a.verdict.ok)
            || ((a.verdict.worstMs ?? 1e9) - (b.verdict.worstMs ?? 1e9))
            || (b.verdict.matched - a.verdict.matched))
    const best = seats[0]
    const v = (best && best.verdict) || { ok: false, pairs: [], matched: 0, unmatchedOnsets: onsets.length, ignoredEdges: 0, worstMs: null, why: 'no controls recorded — slap the screen 3 times' }
    // #2205 item 3: zero registered touches is its own failure mode (never hit
    // START / wrong page) — say it plainly instead of the generic minPairs line.
    const noTouches = !seats.some((c) => c.edges && c.edges.length)
    let hint = null
    if (!v.ok) {
        if (noTouches) hint = onsets.length
            ? `the mic heard ${onsets.length} sound${onsets.length === 1 ? '' : 's'} but no slaps registered — did you hit START, and is this the right page?`
            : 'no slaps registered — did you hit START, and is this the right page? (the mic heard nothing either)'
        else if (!onsets.length) hint = "didn't hear the slaps, try louder"
        else if (v.matched < minPairs) hint = 'each slap must TOUCH the screen — slap it 3 times, about 2 s apart'
        else hint = 'the sound and the touch were apart — let your palm hit the screen itself'
    }
    return {
        ok: !!v.ok,
        claps: onsets.length,
        pairs: v.pairs,
        matched: v.matched || 0,
        unmatchedOnsets: v.unmatchedOnsets || 0,
        ignoredEdges: v.ignoredEdges || 0,
        noTouches,
        worstMs: v.worstMs === undefined ? null : v.worstMs,
        why: v.why,
        hint,
    }
}
