# STATE — forge board snapshot (slot b, 2026-11-22 — shipped)

## This session shipped
- **FloorBoss career takes** (#2958 → PR #2959 → main `ff6f58f`, prod
  deployed). Never-dry stage: `idle-kick` said `KICK FLOOR BOSS 0 weak`
  (flagships all owned/held, queue empty, feedback held by QA) — filed,
  claimed, built. A cleared whistle no longer ends a consented take:
  clocking into the next shift banks ONE take (contiguous rows — the over
  screen pauses wall-time, never ticks; same seed/stream; shift bits ride
  stateHash #2346). The take ends at the real end: lost night at the sheet
  (`finish`), cleared night walked to attract (`closeTake`: key-exit,
  tap-exit, contract reset, unmount). Adapter (`plaicraft-dataset`
  floorBossRows) replays the seam — rows past a win advance `nextShift`,
  checkpoints keep judging; invented post-whistle rows refuse. Proof:
  synth career take (seed 4242, 2 nights, 18k ticks) validates; mutants
  `--mutate-career` / `--mutate-whistle` RED-BY-DESIGN; floorbosscheck
  green, datasetcheck 66/66, lint×3, build. Consent/watch law untouched
  (#2058 stamp persists across seams).
- **Main cleared twice (#601/#2176), harness-only:**
  1. #2957 (`0565b21`): frogger zero-death pin followed the #2869 floor
     (≥34→≥38; #2884 bumped the text, the pin missed it) — nightly
     45033023373's lone red.
  2. Feed-window pin: #2954's tap-mirror grew the FloorBoss feed line to
     217 chars vs watchcheck's `{0,200}` (nightly 45045144722's lone red).
     My #2963 (`{0,240}`) was closed obsolete — slot a's #2962 landed first
     at `{0,300}`, which survives the career-take lines too. Lesson:
     cross-lane duplicate main-fixes race; the WIDER window wins.
- **Also on main from slot a today:** R-TYPE volley pre-dodge (#2951 → #2955
  `b779123`), deps npm audit fix (#2960). Career-take merge also merged
  slot-a-side while I was timeboxed — cross-checked all landed clean.

## PLAYABLE on main right now
- `/retrogames/floor-boss` — career takes: a cleared night + clock-in is one
  recorded, replayable take (this session; Vercel Production on `ff6f58f`+).
- `/retrogames/r-type` — volley pre-dodge (#2955).
- `/retrogames/double-dragon` — carrier rotations + duel steel.

## Board at close
- `game-queue` empty, `steer`/`next` empty. `building`: #1712 PLAICRAFT S2
  stays open ON PURPOSE (S2 lines are store-data-blocked — friend takes;
  ask #2953). `feedback`: #2952 held by QA (`building-qa`).
- FloorBoss README still lists 2 honest gaps (tap-per-frame refusals,
  conservative WATCH stamp — both deliberate law, not free work) + a
  documented frozen-hashes gap (appended rows behind a LOST take are
  hash-invisible).
- Nightly `45057066348` in progress on `d10493a` (covers both pin fixes);
  NOTE: it does NOT contain `ff6f58f`/`8318eab`/`b779123` — the next
  scheduled nightly is the first full-suite proof of career takes, the
  deps bump, and the volley. Keep an eye on it.

## Open questions for Jon (links only, #605)
- #2953 — S2 friend-takes invite flow; default: widen adapters (Contra next).
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON public? (due 11-23).
- #2908, #2930 (QA lane) — DD seat laws.

## Harness notes (carry-overs)
- Watchcheck pins that measure a CODE WINDOW (`{0,200}` style) rot when a PR
  inserts lines between the anchors. Two bites today (frogger text, floor-boss
  window). Any PR adding lines inside a pinned span: grep watchcheck for the
  game's pin family FIRST and widen in the same PR.
- A `gh pr merge --squash --delete-branch` run from a worktree can vanish the
  worktree dir mid-command when the cleaner races it (twice today:
  forge-red-main-frogger-pin, forge-mainfix-feed-window). Commit EARLY, push
  after every increment — the pushed branch survived both times and nothing
  was lost. `git worktree prune` after.
- Slot-a/slot-b main-fix race: same diagnosis, two PRs; GitHub closed the
  loser cleanly. Next time, check `gh pr list` for an open fix on the same
  pin BEFORE opening one.
- Mutant runs in this repo refuse a dirty tree (good) and `pull(sim)` only
  restored sim.js — #2959 ships `pull(tgt)` so painter/adapter mutants
  restore their own file.

## Slots / ops
- Slot b port 5178: no dev server was started this session (all Node-side
  proof) — nothing to devstop.
- Worktrees left: forge-floorboss-career-take + forge-red-main-frogger-pin
  (branches merged/shipped; dirs prunable — remove when convenient).
- Main checkout: detached `origin/main`, STATE.md committed this session
  (#2959 merged) + `statepark.mjs park b`.
