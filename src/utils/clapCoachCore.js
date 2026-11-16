// CLAP COACH RULES (#1711) — the pure half of "the player knows to clap".
//
// The S1 acceptance line — "audio lines up with the frames to within ±50 ms
// (prove it with a clap test)" — grades clap pairs inside a take: a clap the
// mic heard at ms M must sit within CLAP_TOL_MS of the tick-time of a pad
// press. Every human take graded so far heard ZERO claps: the store proves
// replay and voice honesty, but nothing ever TOLD the player that a clap with
// a tap makes alignment provable. A take you never coached cannot grade the
// ±50 ms line, and demanding that line of players who were never asked for
// the evidence is theater.
//
// coachView({ micLive, shown }) is the whole rule set; voiceCapture.js paints
// and times it (the pill lives next to the mic badge and the VU bar, in that
// file's DOM idiom) and recordcheck pins it in Node. Honesty rules, in order:
//   1. MIC NOT LIVE, NO COACH. The pill promises nothing to a mic that is not
//      actually recording — it appears at the recorder's green REC moment,
//      never during LISTEN (recognition is not recording, #1257/#1427) and
//      never before getUserMedia resolved.
//   2. ONCE LEARNED PER DEVICE. The screen belongs to the game (syncBadge rule
//      4): the coach teaches the habit once and trusts the player; the mic
//      badge and VU bar keep carrying the ongoing truth. "Learned" has a
//      physical definition though — the take's own mic heard a clap. A take
//      that ends with the mic live and ZERO claps heard proves the lesson never
//      landed, and re-arms the ask (coachArmAfterTake); the pill returns next
//      take. A player who claps once never sees it again.
//   3. INSTRUCTION, NOT CLAIM. The text tells the player what to do; it never
//      says the audio IS synced — the clap verdict does that, in the store.

export const COACH_HOLD_MS = 5000

export const COACH_TEXT = 'CLAP WITH YOUR FIRST TAPS'

// coachView({ micLive, shown }) -> { kind: hidden|coach, text, holdMs }
//  - micLive: the take recorder's mic is open and recording (green REC).
//  - shown:  the coach already LEARNED on this device (localStorage truth
//    lives in the shell; this core only applies the rule). "shown" below is
//    the pre-learn state: the pill painted, but the habit is not yet proven.
export function coachView({ micLive = false, shown = false } = {}) {
    if (!micLive) return { kind: 'hidden', text: '', holdMs: 0 }
    if (shown) return { kind: 'hidden', text: '', holdMs: 0 }
    return { kind: 'coach', text: COACH_TEXT, holdMs: COACH_HOLD_MS }
}

// TAUGHT, NOT SHOWN (rule 2's upgrade). The store proved every human take
// carried zero claps — and a once-per-device flag burns the lesson exactly for
// the players who missed it: Jon drives the moment REC goes green, a pill at
// the badge is easy to never look at, and under the old rule that device never
// sees the ask again. A take is its own evidence of whether the habit landed:
// the recorder's live analyser (voiceCapture #2205 tap) hears claps while the
// take runs. So the device state moves none -> shown -> learned, and a take
// that ENDS with the mic live and zero claps heard demotes shown -> none: the
// ask comes back next take. Detection bias is deliberate: a missed clap only
// re-shows a 5 s pill (cheap); the asymmetry means a learned device keeps the
// screen. Legacy '1' flags (shipped under once-per-shown) read as `shown` —
// devices that burned the lesson unconsumed re-arm on their first silent take.

export const COACH_SHOWN = '1' // pill painted at a live REC; no clap heard yet
export const COACH_LEARNED = '2' // a take on this device heard a clap — habit proven

// coachState(stored) -> 'none' | 'shown' | 'learned' (fail-open: any unknown
// non-empty flag reads as shown — a corrupt flag suppresses exactly as long as
// the shipped rule did, then re-arms; it never nags more).
export function coachState(stored) {
    if (stored === COACH_LEARNED) return 'learned'
    return stored ? 'shown' : 'none'
}

// coachArmAfterTake({ stored, micLive, heardClaps }) -> next stored value
// (null = cleared). Order is the whole rule:
//   - any clap heard        -> learned (habit proven, pill rests forever);
//   - shown but nothing heard, mic WAS live this take -> re-arm (null);
//   - anything else (mic never live this take, already learned, never shown)
//     -> stored unchanged: no evidence, no state move.
export function coachArmAfterTake({ stored = null, micLive = false, heardClaps = 0 } = {}) {
    if (heardClaps > 0) return COACH_LEARNED
    if (coachState(stored) === 'shown' && micLive) return null
    return stored || null
}

// liveClapWatch(prev, level, opts) -> { quiet, gap, claps } — one frame of
// clap-watching over the live analyser's per-frame peak (the VU scale, 0..1).
// Same shape law as clapSync.detectClaps, in frame units: a LOUD frame after
// a QUIET stretch of QUIET_FRAMES, at least GAP_FRAMES since the last count.
// One burst never double-fires (the analyser samples every rAF frame, the
// clap decays over ~50 ms of them); sustained loud bleed (game audio through
// the speaker) never sees a quiet stretch and counts NOTHING — a take whose
// claps this coarse watch cannot hear simply re-arms the pill, which is the
// honest direction of error. Thresholds sit where claps saturate (the VU gain
// is x2.5: a near-full-scale clap pins the meter) and voice/gameplay does not.
export const LIVE_CLAP_LOUD = 0.6
export const LIVE_CLAP_QUIET = 0.25
export const LIVE_QUIET_FRAMES = 4 // ~66 ms of quiet at 60 fps
export const LIVE_GAP_FRAMES = 18 // ~300 ms, matching clapSync's minGap

export function liveClapWatch(prev, level, opts = {}) {
    const loud = Number.isFinite(opts.loud) ? opts.loud : LIVE_CLAP_LOUD
    const quietLvl = Number.isFinite(opts.quietLevel) ? opts.quietLevel : LIVE_CLAP_QUIET
    const quietNeed = Number.isFinite(opts.quietFrames) ? opts.quietFrames : LIVE_QUIET_FRAMES
    const gapNeed = Number.isFinite(opts.gapFrames) ? opts.gapFrames : LIVE_GAP_FRAMES
    const p = prev && Number.isFinite(prev.quiet) ? prev : { quiet: 0, gap: gapNeed, claps: 0 }
    const lvl = Number.isFinite(level) ? level : 0
    const gap = p.gap + 1
    if (lvl >= loud) {
        if (p.quiet >= quietNeed && gap >= gapNeed) return { quiet: 0, gap: 0, claps: p.claps + 1 }
        return { quiet: 0, gap: p.gap, claps: p.claps }
    }
    return { quiet: lvl <= quietLvl ? p.quiet + 1 : 0, gap, claps: p.claps }
}
