# STATE — session 79 (2026-10-31, slot a)

## Shipped this session
**LEARNED WALK demo** (#1205) → PR #1434 → prod:
`https://jalfern.com/retrogames/demos/learnedwalk.html`. The #1204 XPBD biped
with its hand-written controller removed: one 23→16→16→3 MLP (mirrored legs,
707 params) trained in-repo walks **3.4 m net in 10 s** (bare rig 0.1 m),
survives 442 vs 119 ticks, stands ~25% of ticks, topples on all seeds —
forward-lurch, honestly framed in-page. `node scripts/learnedwalk-train.mjs`
reproduces `learnedwalk.policy.js` byte-for-byte.

## Session path
- Warden target #1359 REFUSED (slot b live, PR #1426 — merged since). Ladder
  → #1205: its hold ("game-queue back when #1204 ships") was fulfilled by
  #1217, so `game-queue` label + comment, then normal claim.
- Training evolution (all in `scripts/learnedwalk-train.mjs` header): uniform
  CEM → every sample fell faster than zero → elite-mean CEM diluted winners →
  (1+1)-ES + Cauchy mutation + 1/5-breathing + stagnation bounce. Stand→walk→
  refine curriculum, fitness seeds disjoint from report eval.
- **Knife-edge lesson (keep):** an unrounded 2.98 m policy face-planted at
  tick 35 after JSON round-trip to 4 decimals. Trainer now searches in
  quantized space and re-checks the *serialized* bytes vs the bare rig
  (ship-honesty gate) before accepting. #1204's rounding-warning generalized.
- `npm run learnedwalkcheck` = 30 gates, 30/30; mirror mutant
  (`hipR: a[0]*CAP`→`hipR: 0`) reddens six gates, demonstrated + restored.
- Drive-by: `creditscheck` DEMOS list drifted (deepglass/stickwalk/learnedwalk
  missing) — fixed; now 152/153, the one red is pre-existing reef index-card
  staleness ([902] vs page [1050,1093]) left for its lane.

## Rule-4 honest count
Game/demo code merged: PR #1434 (`public/demos/learnedwalk.*`). Not idle.

## Notes for the next lane
- QA polish-pass issue #1435 filed for learnedwalk (label `feedback`) — QA lane only
  (2026-10-19 decision).
- reef index card in `public/demos/index.html` still says issues [902]; page
  says [1050,1093] — creditscheck's only red. One-line fix for whoever's near.
- `game-queue` now EMPTY again; flagship README gaps all CLOSED (verified this
  session via `scripts/lib/idle.mjs`). Next kick may be idle-legal unless Jon
  or QA files items.
- #1421 and #1404 AWAITING (deadline 2026-11-03) — never wait on them; their
  defaults already match observed behavior.

## Environment
Main checkout `~/Dev/retrogames` detached at origin/main, clean (STATE.md
commit rode this PR). Slot-a worktree `~/Dev/retrogames-forge-learned-walk`
kept at detached origin/main after merge. Dev server on **5173** stopped at
session end; other lanes' 5174/5176 untouched. Trainer + recorder live in the
repo; nothing else in /tmp is load-bearing except this STATE copy.

## Open questions
None filed this session (no taste/priority/hard-to-undo items; #1404/#1421
cover empty-board + rule-4 posture with defaults already in force).
