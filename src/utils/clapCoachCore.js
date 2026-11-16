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
//   2. ONCE PER DEVICE. The screen belongs to the game (syncBadge rule 4): the
//      coach teaches the habit once and trusts the player; the mic badge and
//      VU bar keep carrying the ongoing truth. A player who declines to clap
//      never sees it again until they clear device data.
//   3. INSTRUCTION, NOT CLAIM. The text tells the player what to do; it never
//      says the audio IS synced — the clap verdict does that, in the store.

export const COACH_HOLD_MS = 5000

export const COACH_TEXT = 'CLAP WITH YOUR FIRST TAPS'

// coachView({ micLive, shown }) -> { kind: hidden|coach, text, holdMs }
//  - micLive: the take recorder's mic is open and recording (green REC).
//  - shown:  the coach already ran on this device (localStorage truth lives
//    in the shell; this core only applies the rule).
export function coachView({ micLive = false, shown = false } = {}) {
    if (!micLive) return { kind: 'hidden', text: '', holdMs: 0 }
    if (shown) return { kind: 'hidden', text: '', holdMs: 0 }
    return { kind: 'coach', text: COACH_TEXT, holdMs: COACH_HOLD_MS }
}
