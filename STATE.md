# STATE — session 245 (2026-11-12, slot a)

## What shipped
**PAPERS, PLEASE-MIN — THE ARC POLISH PASS** merged as `c36bb74`
(PR #2105, Closes #1988 — warden TARGET #1988 claimed first, plan accepted).
Five upgrades to the Ministry arc, all view-side (stateHash byte-identical for
week 0, the TMD ghost-cell doctrine):
- **Bulletin faces** (`ARC_MUG` 26×26 @ s0.30): the ARC entry on day 6's wall
  carries the neighbor's mugshot; decoy rows stay text-only — a face for a
  name that never walks is a lie with no witness (m58 plants that, dies).
  `bulletinRows()` is now the single shared walk (law and paint can't drift).
- **Turn announce**: the ARC row flashes `ARC_HL` #ff3b30 when the arc is at
  the glass — gg 59 sits under the wallRed family's 80 floor, so `wantedInk`
  keeps counting sheet rows only.
- **Voice breadth**: per-id `turnAlt`/`againAlt`/`seize` pools, a 43-sentence
  authored repertoire (distinctness law), mixed by chapter
  `repChapter = floor(seed/|REGULARS|) % 2` — week 0 keeps every canonical
  literal, so existing fixtures replay verbatim.
- **Deny aftershock**: turning the friend thuds `SEIZE.tone = 147` Hz (below
  every fixed owned tone) and hangs their argue line under the DENIED stamp
  for the #2021 pin's lifetime. Corridor MEASURED, not guessed: SEIZE =
  (STAMP.x+4, y 154); baseline 156 put descender ink on the stamp's white
  stroke and the probe read 0px against correct state.
- **Bubble-tail pixel pin** (`bubbleTailPix`): lit by a speaking neighbor,
  dark for strangers — both sides gated live.
Harness: paperscheck 22459/22459; mutants **59/59 die** (22518/22518);
papersplay 121/121. Rule-4 streak reset (src/games shipped).

## The session's catches
- **Mutant IDs are shared property.** Two lanes filed m53/m54 the same night
  (#2020 won by merge order); collision resolution = renumber the LATE merge
  (#1988 → m55–m58). A README count is wrong until `--mutate` says the
  number — 55+4=59, both pre-merge counts were fiction at merge time.
- **Merge-loop hangs on absent checks.** `gh pr checks … select(.name=="static")
  [0].state` spins forever when CI never triggered (happened once; a manual
  `gh workflow run ci.yml --ref <branch>` fixed it) and the loop's own
  `[ "$s" = … ]` errors on empty. Guard with `// "PENDING"` + an iteration cap.
  workflow_dispatch DOES satisfy branch protection (it reports on the head SHA).
- **Worktree file loss, twice.** Uncommitted edits vanished from the lane
  worktree between tool calls (tracked files snapped to HEAD; untracked
  survived), and `gh pr merge` left the lane worktree checked out on `main`.
  Filed as part of #2109. Until root-caused: commit every working increment
  immediately (the rule-5 habit is load-bearing, not ceremonial).
- **Top-level name collisions across lanes.** main's attract probe owns `lit`
  at papersplay module scope; my bulletin probe collided → rename on merge
  (`arcLit`). Node --check catches it in seconds; run it on merge resolutions
  before the harness.

## Ladder trail
- #2109 open (feedback): decoy-faces design call, mug detail vs the original's
  portraits, aftershock breadth to non-arc regulars, + the worktree-loss
  sighting (harness).
- Advisory reds seen on `smoke` from `/gauntlet` pad boot (vpadboot 209/211
  locally, gauntlet only) — pre-existing on main, not papers; a QA lane owns it.
- No open questions for Jon this session (jonq: nothing filed).

## Lane state
Slot A: idle — #1988 shipped, worktree `~/Dev/retrogames-forge-ppm-arc-polish`
removed, dev server :5173 stopped. Main checkout detached at origin/main per
Jon's 2026-10-11 decision. Next session claims the warden TARGET as usual.
