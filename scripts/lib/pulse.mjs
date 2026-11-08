// pulse — the FORGE PULSE selection, pure half (#891).
//
// The warden posts a machine status line to ONE open "FORGE PULSE" issue. It
// used to find it by paging the flat open list (per_page=100); past 100 issues,
// or once the pulse was closed, the lookup missed and the warden made a 2nd
// copy — 8 dups piled up (#91, #777–#795). The fix finds it by title search
// (open AND closed) and keeps exactly one. This module is that decision, pure:
// no gh, no fs, no clock it invents (same discipline as scripts/lib/jonq.mjs),
// so scripts/pulsecheck.mjs pins it offline. The gh calls live in
// scripts/pulse.mjs.
//
// Issue shape this module speaks: { number, title, state, comments }.
//
// Rotation (#1842): GitHub refuses comments past 2,500 per issue, and the
// refusal is silent from the board's side — #795 filled on 2026-11-06 19:40Z
// and the pulse stopped for ~28 h with every warden tick "succeeding". A pulse
// at FULL_AT comments is retired: never kept, closed if open, and a fresh one
// is created when no usable pulse is left. ~165 comments/day, so 100 comments
// of headroom is ~14 h of ticks for a missed rotation to self-correct.

export const PULSE_TITLE = 'FORGE PULSE'
export const FULL_AT = 2400

// Plan the ONE open pulse from every "FORGE PULSE" issue (any state):
//   keep   — the number to post to (always set unless create)
//   create — true when no USABLE pulse exists (none at all, or all full)
//   reopen — keep's number when the newest usable pulse is closed (reopen, never 2nd-copy)
//   close  — open pulses to close: stray duplicates and full (retired) ones
//
// Preference: an existing OPEN usable pulse is the one kept open. Only when
// none is open does the newest closed usable one win and get reopened. Never
// create while a usable one exists, in any state. A missing comments count is
// treated as 0 (usable), so an old caller can never trigger a rotation.
export function planPulse(issues) {
    const pulses = (issues || []).filter((i) => i.title === PULSE_TITLE)
    const full = (i) => (i.comments ?? 0) >= FULL_AT
    const byNum = (list) => [...list].sort((a, b) => b.number - a.number)
    const retire = byNum(pulses.filter((i) => i.state === 'open' && full(i))).map((i) => i.number)
    const usable = pulses.filter((i) => !full(i))
    if (usable.length === 0) return { keep: null, create: true, reopen: null, close: retire }
    const open = byNum(usable.filter((i) => i.state === 'open'))
    if (open.length >= 1) return { keep: open[0].number, create: false, reopen: null, close: [...open.slice(1).map((i) => i.number), ...retire] }
    const newest = byNum(usable)[0]
    return { keep: newest.number, create: false, reopen: newest.number, close: retire }
}
