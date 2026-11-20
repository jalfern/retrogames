# STATE.md — The Forge (rewritten at close of session 365, slot a — 2026-11-20;
# NO game merged from this lane, so this report stays uncommitted per step 9 —
# parked at /tmp/forge/STATE.a.parked.md via statepark. Slot b merged #2813
# (DD polish) tonight and now builds #2807 S2 + #2808 R-TYPE.)

## PLAYABLE
- /retrogames/contra — S1..S4 co-op LIVE; /retrogames/double-dragon — S1 + tonight's
  polish pass (walk bob, tumble, Abobo charge, ambience, wave ticks; #2813).
- Studio-side: plaicraft dataset (2 games, per-seat voice) on main (#2811).

## WHAT THIS SESSION DID (slot a, warden target #2808 → REFUSED, ladder → #2807)
- #2808 claim REFUSED (b held it since 18:37Z). Ladder gave #2807 (DOUBLE DRAGON,
  `next`, lane:games) — S1 already shipped, so this lane built **S2 weapons wall**:
  thrown knives (4 dmg, reusable steel lands back as pickup), whip (reach 34,
  multi-hit, skips downed), solid smashable barrels (3 hits → knife/whip/stick
  drop, +100), one-in-hand law, contextual PUNCH. Engine pushed:
  `origin/forge/double-dragon-s2` @ `2d3288f`, proven at Node (knife kill+reuse,
  whip double-hit, barrel solid/break/drop; autopilot clears 22..24/24 seeds).
- HARNESS RESTART MID-BUILD (19:2xZ) killed the live session; on resume, slot b's
  claim of #2807 (19:35Z) had gone through ("slot a's session is gone" — true of
  the pre-restart process; my checkpoints predated the 90-min window). Full
  handoff posted on #2807 at 20:2xZ (branch state + the one open stall: seeds
  7/14 corner-stalemate at barrel 3 + fix candidates). b is building S2 now,
  partly IN THIS VERY WORKTREE (its edits merged with mine: e.dodge enter rework).
- Never-dry scan after yielding: flagship READMEs gap-free; shelf unowned gaps =
  Contra disclaimer (QA holds #2798) + DD S3 (#2807's own plan) → dry-stop legal;
  no new flagship question (#2795 answered TODAY, both titles building).

## BOARD
- #2807 DOUBLE DRAGON — b's, S2 in flight (my validated S2 sim core is on
  `forge/double-dragon-s2` @ 2d3288f; open stall = seeds 7/14 barrel-corner
  stalemate, details on the issue).
- #2808 R-TYPE — b's; engine-core checkpoint 20:07Z on forge/r-type.
- #2800 needs a SUCCESS nightly (re-proof dispatched 18:22Z).
- #1712..#1715/#1710 PLAICRAFT — research lane. #2798 Contra polish — QA lane.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — human takes for
  the 2-players line; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- LIVENESS COMMENTS MUST SAY THE WORD: the #1258 parser matches
  `^(FORGE|QA) (<slot>): claimed|checkpoint`. My "engine core pushed" floor
  comment did NOT count → liveness looked dead at 137 min → b's claim won a
  game-code branch mid-build. Always write `FORGE (<slot>): checkpoint`.
- HARNESS RESTART = assume your process died AND that a supervisor auto-commits
  your dirty tree (ac929a3 pattern) and may start a rebase. On resume: check
  `.git/rebase-merge/`, `git status` for UU, and `ps aux | grep "opencode run"`
  for other live lanes before touching any file.
- Two writers on one worktree converges only when both want the same green; do
  NOT push over a branch the other lane is live-editing (no force). Handoff via
  issue comment + pushed clean commit is the non-destructive lane.
- Solid-prop physics lessons (all pinned by seeds): center-line blocked() only
  (body-radius inflates footprints until pockets have no open step → re-pins);
  slip AWAY from the blocking barrel with a PERSISTENT dir (e.dodge —
  re-deriving from y ping-pongs on the mid-line); clamp-vacuous slides
  (ny === e.y at the lip) must flip; k-slip depth as last resort for
  floor+barrel corners; bots must treat charge states as threats (sidestep,
  don't outrun).
- Collision law (STATE's twin-PR note) now has a second shape: ISSUE re-claim
  mid-build. The claim script decides; loser posts a full handoff, keeps its
  pushed branch clean for the winner.

## WORKTREES
- Main checkout: detached origin/main; slot b's process runs there (cwd observed)
  — respect: don't edit main checkout; b is mid-S2.
- `~/Dev/retrogames-forge-double-dragon-s2` — CONTAMINATED (lane b live edits +
  my uncommitted sim fixes for seeds 7/14 etc.). Left uncommitted deliberately;
  the validated S2 core lives on origin @ 2d3288f. Next lane: re-clone from the
  branch, don't trust this tree's dirty state.
- My dev server on 5173 stopped at close; never touched other lanes' ports.
