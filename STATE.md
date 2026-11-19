# STATE — session 348 slot b close-out

## Shipped this session
- **PICK RUSH — PERFECT SHIFT (#2742) — PR #2745** (rule-5 loop on `static`).
  Never-dry stage (#1571): warden target #2736 REFUSED at claim (slot a live
  since 01:38Z, branch pushed, PR #2740 — their Homebody build); ladder:
  #1711 WAIT-STATE (`grade --dry-run`: nothing new; #2652 AWAITING), queue
  empty, feedback rung blocked (QA MASTER live pid), flagship gaps all spent
  (idle-kick fell through) → `weakestStage` PICK RUSH score 1 (feedback #2739
  names it; README gaps CLOSED+DISCLAIMER only) → filed #2742, claimed, shipped.
  Law: per-seat `arm.clean`; `PERFECT_SPOIL` = miss (unowned → spoils ALL
  seats: shared line) + wrong/shatter/floor (attributed by `lastSeat`); slip
  excuses. Whistle + quota-clear pays `PERFECT_PAY` 200/250/300/350 into
  score AND seat bank, sheet resets, last shift pays before win, short never
  pays. Moment: sparkle fanfare over the whistle, gold CLEAR sub-line, gold
  over-card tally. Hygiene: zero rng at payout, no new stateHash fields.
  Gates: §CLEAN SHIFT 21 node + CLEAN LIVE chrome; 114/114 + 35/35, 0 page
  errors; `PICK_MUT=perfect` reds 5, `PICK_MUT=spoil` reds 2 (restored).
  Corpus regenerated & committed: measured all 20 export seeds bank exactly
  +500 (both planner seats clear shift 2 clean — verified per-seed, not
  inferred); drops identical 4461/4010/451; replay-verified ALL. contractcheck
  16/16, robokitcheck OK, lint×3 + build green.

## Next queued (slot b)
- Re-derive at main (`node scripts/idle-kick.mjs`); do NOT trust this line.
  Expect: #1711 WAIT-STATE (phone half #2652 AWAITING until Nov 20 01:36Z,
  default keeps waiting); #2736 → shipped-or-not by slot a; PICK RUSH is now
  held ONLY while this PR's issue closes — its never-dry score came from
  #2739, which QA MASTER holds for its six polish items (crane inertia, bin
  interiors, feather lesson, take replay, audio variety, attract seeds). If
  QA has claimed #2739 by then, expect the never-dry rung to score the rest
  of the shelf at 0 → STOP legal only when every gap everywhere is owned.

## Catches learned (durable)
- **Uniform deltas hide attribution.** All 20 corpus seeds moved +500 — the
  honest claim needed a per-seed re-walk (both seats, shift index 1 — and
  seed 13, a NON-export seed, busts shift 2 with a belt-kill; don't
  generalize the export pattern to "always").
- **`grabFrom` can't see a slip mid-call** — its loop only returns between
  attempts, so a 400-cap call rode the barrel to the belt end (a MISS, wrong
  law tested). Poll fx between short (~45-tick) attempts for mid-attempt
  events.
- **ESM namespace bindings are live for CONTENT, not for REBIND.** Runtime
  mutants work because they mutate exported arrays in place (fill/splice);
  `s.PERFECT_PAY = …` would throw. Design law data as arrays/objects, not
  scalars, so it stays mutant-killable.
- **Prod verify chunk refs come both ways**: the deployed entry lists some lazy
  chunk refs WITHOUT the `assets/` prefix — scan `index-[A-Za-z0-9_-]*\.js`
  bare (that's how #2748 got its docs; the same miss cost slot b 7 minutes
  here — marker FOUND in `assets/index-Bug_iATq.js`, entry `index-BJir61Hz.js`).
- **Foreign scratch edits can land in YOUR worktree.** An uncommitted
  binVis-zeroing fix (slot-a style, #2678/#2740 refs) appeared in the lane
  worktree between PR creation and merge. The PR was clean (verified pre-PR)
  — but `git status` before teardown is mandatory, and unexplained edits are
  PARKED (`/tmp/forge/stray-binvis-reset.patch`) + announced on the issue,
  never silently dropped.

## Lane state
- Worktree `~/Dev/retrogames-forge-pickrush-perfect-shift` + branch to be
  removed post-merge verification; main checkout to be re-detached at
  `origin/main` including the STATE commit below. Port 5178 freed at close.
- Rule 4: game code merged (`src/games/**`) — streak reset, shelf healthy.
- No halt on the board; nothing taste-shaped came up (the stage was
  README/never-dry prescribed), so no jonq filed by this lane.
- Open questions for Jon: none owned by slot b. #2652 (AWAITING, platform)
  remains the only gate on #1711 line 3's human half.
- Polish round for PICK RUSH already exists as #2739 (filed by session 347,
  QA-held) — no duplicate filed per step 8b.
