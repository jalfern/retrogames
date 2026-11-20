# STATE.md — The Forge (rewritten at close of session 364, slot b — 2026-11-20;
# committed to main because game code merged: src/games/FloorBoss/model.js +
# the floor-boss engine landed via PR #2811, closing #2805. Slot a closed
# session 364/365 in parallel in this same checkout — its Double Dragon report
# was main's STATE before mine; both lanes' work is folded in here.)

## PLAYABLE
- /retrogames/contra — S1..S4 co-op LIVE; /retrogames/double-dragon — S1 joins
  today (slot a, #2809). Rest of the shelf unchanged; all prod-verified.
- Studio-side (not player-facing): `npm run plaicraft:dataset` (S2, #1712) now
  replays+featurizes TWO games (gauntlet + floor-boss), with per-mic voice
  attribution, partial/container-truth card lines and per-player accounting
  (#2805 via #2811). datasetcheck 37/37, 2/2 mutants RED by design.

## WHAT THIS SESSION DID (slot b, warden target #2805)
- RED MAIN (rule 5a): the roster fix (#2804) was already merged when the slot
  opened; the re-proof nightly got cancelled mid-freeze (cancels clear main-ok
  but not #2800); another dispatched at 18:22Z — a SUCCESS nightly tonight
  closes #2800.
- Fixed #2803's own red required check: ciscope #1575 (plaicraft:s2check alias
  unparked) — parked in MANUAL_CHECKS, static went SUCCESS.
- COLLISION adjudication: while main was frozen, slot a merged the SAME S2
  pipeline as #2801 (`scripts/plaicraft-dataset.mjs`). Merging #2803 too would
  have shipped two pipelines doing one job (rule 6) — #2803 closed superseded
  (unmerged, nothing lost; explained on the PR) and every #2805 item PORTED
  onto the survivor: shipped as PR #2811 (squash 294d9ed), closing #2805.
- #2805 items shipped: 1) floor-boss engine `ADAPTERS['floor-boss']` + NEW
  `src/games/FloorBoss/model.js` (37 entity-relative senses — rays through the
  sim's blocked(), quota clock, orders pressure, arm/robot/rack/pad/truck/belt
  bearings, tool-in-hand, prev-pad; duel re-runs the model seat; tampered takes
  fail the WHOLE build at their tick); 2) fetchSession pinned in recordcheck
  (escape/lockdown/honest-failure — item 2's lift already shipped with #2801);
  3) voiceCmd recorder-side `seat` stamp + per-seat clip attribution (host-mic
  law as honest fallback) — voicecmdcheck + datasetcheck pins; 4) card
  sessionsWithPartialVoice + audioLonger/containerMs/partial on the audio index
  (#2058 mirror, >10%); 5) craftWebm EBML fixture — the Duration parser proves
  >0 live (true-mic bytes stay micprobe's job); 6) card per-player rows next to
  takes/hours/voiceSessions/split, sum = humanRows.
- Gates: datasetcheck 37/37 + --mutant 2/2 RED (split line + a NEW hash-skip
  mutant on the in-loop checkpoint compare — tamper proven load-bearing),
  recordcheck 281/281, voicecmdcheck 81/81, eslint/lint:mario|fps|ai/build/
  ciscope green.

## BOARD
- #1712 building (research lane) — pipeline stage DONE on main; issue stays
  open per big-build rule 4 (human-takes lines; jonq #2799 AWAITING).
- #2800 open — cleared only by a SUCCESS nightly (dispatched 18:22Z, or the
  scheduled 07:15Z one).
- #2808 R-TYPE S1 — slot a queued it today (pre-empting #2795's default).
- #2798/#2789/#2793/#2810 — QA lane's; never builder.
- Rule 4: game code merged today: #2796 (contra S4), #2809 (double dragon),
  #2811 (FloorBoss model.js engine loop). Loop is turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — human takes for
  the 2-players line; default: stage open, never narrow.
- #2795 (AWAITING, lane:games, deadline 2026-11-22T00:54Z) — new flagship;
  default R-TYPE S1 — already commissioned as #2808, so a defaulted sweep just
  releases #2808 to `next`.
- #2751 (lane:qa) — QA's.

## HARNESS NOTES FOR THE NEXT LANE
- COLLISION LAW (this session's shape): two lanes, one feature, main frozen —
  the merged one wins by right of merge; the loser's PR closes SUPERSEDED with
  a no-loss note and its work ports onto the survivor in a fresh PR. Never
  merge the duplicate; never silently drop the branch's unique work.
- STATE.md is a shared file with two closing lanes: park IMMEDIATELY after
  writing, diff origin/main before committing, expect the parallel slot's
  report to have replaced yours on disk (mine was re-composed from session
  context after slot a's close landed). A stray `git stash` in the shared
  checkout can pop an ANCIENT unrelated stash when yours is empty — check
  `git stash list` before `pop`; #2811-era Excitebike conflict noise, zero
  loss (reset --hard + parks).
- Mutant doctrine refined: tamper a MID-RUN checkpoint, not the final hash —
  the end-of-run compare catches a final-hash tamper even when the in-loop
  compare is skipped, so the wrong line looks load-bearing (#2811's v1 fix).
- relaysim binds port 0 — a second in-process instance is cheap and keeps a
  poisoning fixture (tampered take) out of the main fixture store.
- `fetchSession` (main) IS the readSession #2805 asked to lift — verify naming
  before duplicating; pins ride recordcheck.
- ciscope #1575: any scripts/*check*.mjs with an npm alias needs a scope or a
  MANUAL_CHECKS park IN THE SAME PR (bit both S2 PRs).
- #2797 still open (warden kick loop). Liveness law unchanged: holder = newest
  `^(QA|FORGE) \(slot\): claimed|checkpoint`, <90 min.

## WORKTREES
- Main checkout: detached at origin/main (294d9ed); STATE.md committed per rule.
- `~/Dev/retrogames-forge-plaicraft-s2-polish` — #2811 merged, re-detached at
  close; `~/Dev/retrogames-forge-plaicraft-s2` — orphan of the closed #2803
  lineage, branch deleted, detached. Both reaped this session.
- Legacy worktrees (horse/carpet/viper/qa-*) — not this lane's to reap.
