# STATE — session 35 (2026-10-28) — TEN-DEEP stage 3: THE CREATE SHIPPED

## Shipped
- **TEN-DEEP — stage 3: THE CREATE** (races, classes, alignments,
  spells-by-level), PR #1159, squash `6e5765f`, part of #1127.
  Live: https://jalfern.com/retrogames/ten-deep (private, #379 — prod chunk
  index-BpBMMimF.js carries THE CREATION BENCH).
- `people.js` owns the people: 5 races (shift+gift, DURROW banned from
  MAGUS/OATHBOUND), 5 gated classes (MAGUS aff≥10, CLERIC aff≥7, FOOTPAD
  spd≥6, OATHBOUND aff≥8+atk≥9), 3 alignments that move steel.
- Spellbooks are EARNED: `cast <id>` replaces fire/heal — a class that has
  not learned the letter cannot work it with any MP (`noLetter`, no round).
  New verbs: guard (halves what the shield eats, floor 1), ward (3 rounds,
  expires), heel/subdue (XP paid, zero overkill; the King refuses, free).
- Bench at the Drowning Crow: POST 40g leaves the slot fresh; CREATE 60g
  opens six seeded papers — roll free, way-shift free (compose recomposes
  live), only accept pays; FAIL stays FAIL; wizardless company always finds
  a MAGUS (constructed, seeded — kept promise, no gambling).
- Proof purity kept: strict proofs never visit the RIM; campaign still wins
  (1147 cmds), slack holds all four variants, `proven.ledger.tx === 0`.

## Harness
- tendeepcheck 779/779 (+63 RIM-stage-3 pins: ladder thresholds, class gate
  at the table, guard/ward arithmetic+expiry, subdue ledger exactness,
  alignment composition, vacancy, bench determinism + wizardless MAGUS, FAIL
  refusal, flat-fee booking, conservation through hire+create, hashes see
  people/cand/ward); 8/8 mutants incl. new guardDiv→1, firestorm L5→1.
- tendeepplay 46/46 real keys + pixels: guard press, open/cursor/reroll/
  shift/accept flow — created hero matches the composed paper stat-for-stat.

## Board
- #1127 stays OPEN, OFF the queue: stage 4 (MODERN look) is gated on #1129
  (shared renderer) — don't double-build it inside TEN-DEEP. Comment on the
  issue says so; put it back on `game-queue` when #1129 ships.
- Game-queue now: #1150 (STICK WALK demo), #1147 (iPhone canvas stretch),
  robot sims #1141–1144, #1132/#1131/#1130 (platform), #1129.
- #1138 remains the QA lane's TEN-DEEP polish pass (incl. stage-3 UI notes).

## Branches / housekeeping
- Worktree `~/Dev/retrogames-forge-ten-deep-surface` — detached at
  origin/main; it is the natural resume point for stage 4 after #1129.
- TEN-DEEP is NOT in contractcheck/nightlybot rosters (deliberate scope
  choice — its own tendeep* arms). Don't "fix" by reflex; revisit with Jon.

## For the next session
- Claim the oldest free `game-queue` item; #1129 (shared dungeon renderer) is
  the best neighbor — TEN-DEEP stage 4 rides on it.

## Open questions
- #1121 (board direction) — AWAITING, deadline today 20:04Z; the warden
  sweep takes its default. No new questions filed this session.

## Lessons learned
- tendeeppplay drives Economy REAL: the bench fee must be payable at the
  point the flow reaches it — fund the purse via `setup({gold})` before
  driving CREATE (the sim's broke-refusal was CORRECT, the driver was poor).
- "Guaranteed MAGUS" by reroll-until-lucky failed ~44% of seeds; a kept
  promise is CONSTRUCTED from seeded dice, not hoped for.
- When a pin fails, check whose arithmetic you trusted: two of six new pin
  failures were the PIN's math (zeroed-MP totals, FECHT's +1 atk bonus),
  not the engine's.
