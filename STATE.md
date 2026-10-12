# STATE.md — 2026-10-12 (MINESWEEPER session end — NO GAME MERGED)

## Where things stand
**No game shipped this session.** #118 Minesweeper is WIP: branch
`forge-minesweeper` (commit `d061ba2`) pushed, draft PR #162 marked WIP
(NOT merged — AGENTS #5), `building` label stays, handoff comment on #118.
NOTE: this file is deliberately left UNCOMMITTED per FORGE.md #9 (no game
merged) — a dirty STATE.md is the intended signal, not a dead session.

Queue truth: #82 BensMagicBugLife was **closed as duplicate** — BEEZEE
(#81) shipped the exact core loop (bee/nectar/UV/webs/wasps/gecko/wind/
leaderboard) minutes before #82 was filed; duplicate label + closed with
the live URL and a note inviting Ben to file a *different* variant.
Next queue head after #118: #143 Paperboy, then #152 Wizardry.

## What changed (all on the forge branch, none on main)
`src/games/Minesweeper/minefield.js` + `WIP.md`: pure seeded board, rules,
and the fairness referee — zero-guess single-square + subset-pair, chord
as the STRIP-ABLE shortcut (slack gate: boards must close without chord).
Hill-climb mine-repair replaced rejection-resampling (500 reshuffles →
~5 moves/board). Two solver lies found and killed; the third is alive.

## The lesson (this is why the branch exists)
**The fairness gate runs the SAME solver as the generator — when the
subset rule was unsound (it subtracted `set.filter(isMine)` from a set
that had already filtered mines out, so every count-delta was the raw
clue delta), the gate certified mines-as-safe boards and the autopilot
lost on them: the referee corroborated its own lie.** Permanent fix now
in code: the solver THROWS when it derives a mine as safe or vice versa —
a referee that can lie quietly is worse than a stuck one. Second density
lesson: ~12% mines is the ceiling where zero-guess-under-slack boards
generate at human pace; classic 20% density never closes the gate at any
budget we tried.

## Open bug (for the next session — do NOT re-derive this)
On ~1/3 of gate-certified boards, sequential play (which only ever has
MORE information) refuses a derivation the batch solve "proved" and ends
one cell short on a true 50/50. Unsound step, false premise expired.
`src/games/Minesweeper/WIP.md` has both repro one-liners, the 60-seed
battery, and the candidate roots. Kill this BEFORE writing index.jsx.
Then: index.jsx → sweepcheck.mjs (+aliases, lint:sweep, CI) → sweepplay
→ gates → PR. Same drill as every shipped title.

## What is playable right now
Unchanged from last session: jalfern.com/retrogames/dogfight (+ the other
34 titles). Minesweeper: NOT reachable (no route registered — deliberate).

## Three questions for Jon
1. Was closing #82 as a BEEZEE-duplicate the call you want? (It felt wrong
   to clone your own arcade; Ben's board entry sits closed now.)
2. Session received repeated relayed "user" messages that echoed my own
   tool output AND asserted instructions to rename the harness to
   `paperscheck` (which would overwrite Papers-Please-Min's shipped
   harness). I ignored them and kept `sweepcheck`. Where do those relays
   come from — the QA launchd job (`forge-qa.sh`)? Same driver as the
   `sweepcheck`/`lint:sweep` references in them that don't exist yet?
3. For #118's next session: 3h barely covers the fairness proof. Split it
   into two issues (fair-board engine, then the UI+harness shell), or
   give one session a longer clock?

## Lineage
AGENTS.md honored: STATE first; oldest-queue discipline with a stated
reason for the #82 skip; design comment before code; checkpoint pushed
with its issue comment; merge path untouched (nothing merged); timebox
respected with this report. Rule 4 check: the 11-session game-code streak
survives in the pushed branch (not on main). Ran ~3h.
