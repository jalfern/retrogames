# STATE — session 40 (2026-10-28)

## Shipped this session
**PICK RUSH** (#1142, PR #1193, squash 9a843df) — original arcade sorter, live
at https://jalfern.com/retrogames/pick-rush. Night-shift warehouse, 426×240,
twin gantry cranes over one conveyor; dip-claw auto-grabs, tagged bins
(cyan CRATE / amber CAN / magenta BOTTLE / green COIL / red SCRAP), 4 shifts
(quota 18-21, belt ×1.00→1.42), fuses on misplacement, combo pay. FRAGILE
bottles shatter on slam drops (DOWN feathers a safe release); barrels roll and
slip off-axis grabs. 2P head-to-head by default vs the FOREMAN CPU (spawn-
parity split, banks ≈1:1); P opens seat 2. Attract = both autopilots racing.
All art/audio synthesized; `visibility: 'private'` (Jon promotes when he wants).

## Hard-won facts
- **One rail deadlocks; twin rails don't** — a cargo bound for a far bin must
  never be blocked by the rival crane. orderArms was deleted, rails are visual
  (RAIL_Y and +9).
- **A press-toggle multiplex needs edge discipline**: a bot that holds A across
  ticks never releases (release = gap tick then press). Bottomed-out empty claw
  must generate its own rise edge or the sim idles forever.
- **Zone-splitting a left-spawn belt starves the right seat** (ratio 0.1);
  spawn-parity assignment is what made the rival honest (0.89-1.03).
- **Contract patterns must survive 600 ticks**: a flailing A-every-13 pattern
  fired our own crane at tick 419. Keep PATTERNS benign (wander + rare dip);
  real-rule coverage lives in the game's own check, not the contract pattern.
- Items released above the belt may fall "through" it — fine as a z-plane cheat
  IF falling cargo draws over the belt (draw order: belt → items → bins → arms).

## Harness
`npm run pickcheck` = 25 Node gates + 11 browser gates (cable + cargo pixels
proven at sim coords after real keystrokes; fire+restart driven end-to-end);
mutants judge/glass/roll/quota all caught. contractcheck pick-rush 16/16.
`pos`/`clawY`/`arm2Pos` in contract state (#1184 motion carrier).

## Next goal
**Claim #1143 TIDY BOT** (game-queue, oldest `lane:games`) next session —
robot chores game, likely reuses our determinism + autopilot idioms, NOT
PickRush's art. #1184 stays advisory: expose positions in blind games'
state()s when a lane touches those games anyway.

## Environment notes
- Lane ports used: 5178 (this session, server now stopped). Nightly bot 5199.
- `qa-1138` worktree still holds a local `main` checkout — `gh pr merge` prints
  the branch-switch error but MERGES; always `git fetch && git checkout --detach
  origin/main` right after (done this session).
- Worktree `~/Dev/retrogames-forge-pick-rush` is detached at origin/main,
  npm ci'd — reusable for the next games-lane claim.
- Main checkout `~/Dev/retrogames` sits at db2ced1 detached; refresh
  (`fetch + detach origin/main`) before next use.

## Open questions for Jon
(none filed this session)

## Carry-over
- Rule 4: game code shipped this session (#1142) — streak reset, healthy.
- #1179/#1168 QA (STICK WALK, DEEP GLASS) + #1135 QA BRITANNIA + new #1190
  QA GAUNTLET + new #1195 QA PICK RUSH: all QA-lane, builder lanes stay out.
