# STATE — forge board snapshot (slot a, 2026-11-28 — one-shot blockers shipped; the marquee remembers its default)

## This session (slot a) — never-dry rung, taken and shipped
- Normal ladder dry, verified honest: halt/steer 0; `next` #1712 waiting-jon →
  skipped; game-queue empty; feedback QA-held (#3860) or waiting-jon
  (#3244/#2971); QA MASTER live → no borrow; flagship ladder spent.
  `idle-kick` → `KICK LEMMINGS-LITE 0 weak` (same target the slot note carried).
- Filed POLISH #3864 (blocker-wake — oldest gap that fits one session; BUILDER
  stays for a dedicated multi-session claim per #3853 sizing). Shipped PR #3865
  → squash `30f0af6`: **the block is one-shot**. A CLIMBER treats a blocker dead
  ahead as the original's first rung (`traffic` mount: cross the head, land on
  the far side); any body crossing the head line spends the block
  (`releaseBlocker`/`wakeCheck`) — the blocker resumes walking the direction he
  faced (pond-rim releases walk him under: fidelity, the original judges the
  player). THE SPIRE ships `block: 1` — solver spends it at the west pond rim
  (attract demos the line) and SPIRE now carries block+climb together, so the
  combo is player-stageable. Re-solve: all four levels win, slack/proofs/
  determinism unchanged.
- **static caught a real regression mid-merge** (1 fail, fixed same session):
  the mount path AND `recmethods` each derived "default selected skill = first
  SKILLS-order skill with supply"; SPIRE's new `block: 1` flipped the marquee
  default CLIMBER→BLOCKER and collapsed the pointer-only rec (pointer taps carry
  no skill switch) to 1 tap, 0/4. Fix: `sim.defaultSkill(level)` — levels
  declare their tutorial arm (SPIRE: climb), game + harness read one source.
  On-disk `lemmings-pointer.json` byte-identical after the fix.
- Proof: lemcheck 199/199 (+3 wake pins; hand-drift neutering `releaseBlocker`
  → exactly 2 red → restore), lemplay 46/46 (new player-staged wake drive:
  block mid-lane by aim+Space, climber at the line, blocker seen resuming on
  page frames, climber lands west of where walkers turn), recmethods + 
  goldentracecheck 89/89 + contractcheck 859/859 + attractcheck green, build
  green. Prod verified by content: live `Lemmings-NCB4h2uC.js` carries
  climbblock/wake code, SPIRE `block:1,...defaultSkill:"climb"`.
- #3864: building→shipped, closed (auto-closed at merge; labels corrected).

## BOARD facts at close
- main tip `30f0af6`. Rule-4 streak: reset (game code merged).
- building: **#3863 POLISH — LEMMINGS-LITE: BUILDER skill** (another lane is
  inside Lemmings — NEVER touch; this is why `idle-kick` now answers NONE:
  Lemmings + Defender both held, no unowned gaps score). building-qa: #3860.
  halt/steer: 0. #3841 (lemplay flake) platform lane's — it fired once this
  session mid-drive and reran green, as predicted by its title.
- jonq: #3791 AWAITING (deadline 11-29), #3516 AWAITING (default `done` at its
  sweep ~11-28 12:35Z). Let the sweeps take them; do not re-file.

## PLAYABLE on main right now
- LEMMINGS-LITE with the original's one-shot line: https://jalfern.com/retrogames/lemmings
  — block a walker, send a climber over him, watch the blocker wake and the
  climber land where walkers must turn; SPIRE holds its crowd at the pond.
- FROGGER eases at level six; MINESWEEPER marquee; BARD'S TALE; PINBALL; KOI demo.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title — AWAITING, deadline 11-29),
  #3516 (Arkanoid texture rung — AWAITING, defaults done at its sweep).

## Next claims (for whoever is free)
1. LEMMINGS-LITE still owns the shelf's last two unowned gaps: **BUILDER** is
   held by #3863 (in flight), **float-while-dig** remains — but it opens with a
   design question (the horizontal tunneler contradicts the original's
   air-dig; decide dig-model scope BEFORE filing a stage, `jonq` fodder rather
   than a fake stage). While #3863 is live, idle-kick correctly says NONE —
   do not kick Lemmings twice.
2. If #3863 ships and float stays undecided, the dry-shelf question (#3791) is
   the only question Jon sees; its default holds the shelf if unanswered.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh`; no other lane's port touched.
- Worktree `retrogames-forge-lemmings-wake` left detached at `origin/main`
  (mergeclean: remote branch gone, lane re-detached, clean). mergeclean/warden
  prune; node_modules symlink unlink first if you prune by hand.
- STATE committed to main (step-9 allowance: the forge game merged this
  session) and parked slot-scoped via `statepark.mjs park a`.

## Harness facts worth keeping
- (a) Any default-skill/auto-select derivation duplicated between game and
  harness drifts when a level's supply dict changes — read it through
  `sim.defaultSkill` (level may declare `defaultSkill`), never re-find.
- (b) `recmethods` pointer recs can only commit the SELECTED skill — before
  changing a game's skill supply, run `npm run recmethods` locally (it's a
  static step and it bites exactly here).
- (c) Claim-time ladder: `next` #1712 carries waiting-jon → builders skip it;
  skip list stable across four sessions now.
