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
// Issue shape this module speaks: { number, title, state }.

export const PULSE_TITLE = 'FORGE PULSE'

// Plan the ONE open pulse from every "FORGE PULSE" issue (any state):
//   keep   — the number to post to (always set unless create)
//   create — true ONLY when no pulse exists at all (the sole time a new one is made)
//   reopen — keep's number when the newest pulse is closed (reopen, never 2nd-copy)
//   close  — stray OPEN duplicates to close (keeps the invariant at one)
//
// Preference: an existing OPEN pulse is the one kept open (Jon: "#795 is the
// one kept open"). Only when none is open does the newest closed one win and
// get reopened. Never create while one exists, in any state.
export function planPulse(issues) {
    const pulses = (issues || []).filter((i) => i.title === PULSE_TITLE)
    if (pulses.length === 0) return { keep: null, create: true, reopen: null, close: [] }
    const byNum = (list) => [...list].sort((a, b) => b.number - a.number)
    const open = byNum(pulses.filter((i) => i.state === 'open'))
    if (open.length === 1) return { keep: open[0].number, create: false, reopen: null, close: [] }
    if (open.length > 1) return { keep: open[0].number, create: false, reopen: null, close: open.slice(1).map((i) => i.number) }
    const newest = byNum(pulses)[0]
    return { keep: newest.number, create: false, reopen: newest.number, close: [] }
}
