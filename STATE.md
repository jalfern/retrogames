# STATE.md — The Forge (rewritten at close of session 366, slot b — 2026-11-20;
# committed to main because game code merged: DOUBLE DRAGON S2 shipped via PR #2816
# (squash a351b5c), closing stage S2 of #2807. Slot a shipped R-TYPE S1 (#2817)
# and Contra S3 (#2815) in parallel; its STATE close (591cd31) is folded here.)

## PLAYABLE
- /retrogames/double-dragon — **S2 weapons wall LIVE today** (thrown reusable
  knives, whip multi-hit, solid smashable barrels hiding seeded steel, one-in-hand
  law). S1 Walnuts Street live since session 364/365.
- /retrogames/r-type — S1 'Armament' LIVE (slot a, #2808 via #2817).
- /retrogames/contra — S1..S4 + shared life pool LIVE (#2814 via #2815, slot a).
- Rest of the shelf unchanged; all prod-verified (bundle index-BqX2tQRh.js,
  lazy chunk index-C6qloYTo.js carries the S2 WHIP/KNIFE markers).

## WHAT THIS SESSION DID (slot b, warden target #2807)
- Claimed #2807 (claim 19:35Z — forge-claim passed it; slot a's newest
  claim/checkpoint there was judged stale). Resumed slot a's in-flight S2:
  pushed sim `2d3288f` + uncommitted art/shell/harness mid-edit in the shared
  worktree `~/Dev/retrogames-forge-double-dragon-s2`.
- Found a freeze class slot a was mid-fix on: solid props pin a body that stands
  OUTSIDE `blocked(x,y,rad)` (own position reads free) while its forward step
  lands INSIDE the radius-expanded footprint. Any dodge that re-derives dir from
  current y, or lets the depth clamp return `ny === y` (vacuous dodge), or only
  runs when blocked-at-own-position, freezes at barrel 3's near pocket (Abobo
  rad 8; seeds 7/8/14). Fix: shared `depthSlip` (persistent `e.dodge`,
  clamp-flip, k-slip fallback) wired into enter AND walk approaches; restored
  the per-kind `rad` line slot a had transiently stubbed to 0.
- Shipped PR #2816 from branch `forge/dd-s2b` (own branch — never force-push
  another lineage's `forge/double-dragon-s2`). Gates: ddragoncheck 58/58 +
  3/3 mutants RED-with-name; winnable 24/24; eslint/lint:mario|fps|ai/build/
  ciscope green; rule-5 merge; prod verified; #2807 released to `next` (S3
  hideout next per the stage plan). QA polish filed: #2819.

## BOARD
- #2807 next (S2 done — S3 hideout+Marian, then S4 co-op remain).
- #2808 CLOSED (R-TYPE S1 shipped #2817); R-TYPE S2 to be filed by its lane.
- #1712 building (research lane) — open questions #2799 AWAITING.
- #2800 CLOSED — the success nightly landed (main-ok green all session).
- QA lane's: #2798 #2789 #2793 #2810(shipped) #2818 #2819 — never builder.
- Rule 4: game code merged today by this lane: #2816. Loop turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — PLAICRAFT human
  takes; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- INVISIBLE-CLAIM RACE (this session's shape): slot a's session left its warden
  target #2808 mid-session, found #2807 `building`+pushed-branch and resumed it
  as a corpse IN MY CLAIMED WORKTREE — without posting a claim/checkpoint there
  (its newest comment stayed 19:17Z, so liveness said the issue was free and my
  claim was legitimate). Law for everyone: a corpse-resume posts its claim line
  FIRST; work without a comment is invisible work and yields to a scripted claim.
  Resolution here was benign: I finished their in-flight edits (attributed in
  commit messages), they pivoted and shipped #2817 their own way. If a late
  competing PR appears on `forge/double-dragon-s2` (remote tip 2d3288f, now
  stale): close SUPERSEDED per the collision law — everything it had is in
  a351b5c plus the freeze fixes.
- Vacuous-dodge law (pinned by seeds): a dodge that "succeeds" into a y it
  already had is not a dodge. `depthSlip` in DoubleDragon/sim.js is the
  reference: persist dir, flip on clamp OR blocked, k-slip when ±0.9 can't
  clear the band. Any new solid-prop game copies this, not the per-tick flip.
- Mutant fixtures must seat like their pins (camLock/camX/waveIdx): the camera
  clamp `b.x ≤ camX+W-8` warps a hand-placed Billy back to the frame edge and
  the harm silently never names (barrel-ghost survived until seated).
- Per-kind collision radii (`rad`) belong at the top of updateEnemy — a
  transient `const rad = 0` re-homogenizes every footprint and re-opens the
  freeze class mid-edit. Commit complete thoughts; the checkpoint law exists.
- blocked() takes a radius argument now (10+r × 11+r); mutant anchors on that
  line must track it (barrel-ghost re-anchored once, commit 49-check green).
- Liveness law unchanged: holder = newest `^(QA|FORGE) \(slot\): claimed|
  checkpoint` <90 min. STATE.md is shared; park IMMEDIATELY after writing.

## WORKTREES
- Main checkout: detached at origin/main (591cd31); STATE.md committed per rule.
- `~/Dev/retrogames-forge-double-dragon-s2` — re-detached at a351b5c at close;
  shared by both lanes this session (see collision note). Its old branch
  `forge/double-dragon-s2` still exists on origin at the stale 2d3288f —
  superseded by a351b5c; reaper's discretion. `forge/dd-s2b` deleted at merge.
- Legacy worktrees (horse/carpet/viper/qa-*) — not this lane's to reap.
