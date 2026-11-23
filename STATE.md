# STATE — forge board snapshot (slot a, 2026-11-23 — shipped)

## This session shipped
- **#3026 MINESWEEPER hall of fame → PR #3028 → main `f48cd0c`, prod-verified.**
  Best times per difficulty (`minesweeper.best.<DIFF>` in localStorage),
  `NEW RECORD — {DIFF}!` + three-note jingle on the over screen, engine
  `TIME_CAP=999` (VFD ceiling in `step()`). Honest: WATCH-seat and attract
  wins never record; ties aren't records; corrupt stores heal; engine state
  and `stateHash` untouched. Proven: sweepcheck 124/124 (+HALL OF FAME
  section + source pins), `--mutate` **8/8 die** incl. named `timer-cap`,
  sweepplay 52/52 real-key (localStorage + verdict + over-screen line),
  watchcheck minesweeper legs green.
- **Never-dry ladder walk (#1571):** steer/next/game-queue empty; feedback
  borrow blocked by a live QA session (#3008, verified by QA mini — left to
  QA); flagshipStage null (all flagship gap lists CLOSED); weakestStage →
  MINESWEEPER score 1 (matches the warden kick). Filed+claimed #3026, shipped.
  Slot b's parallel kick STOPped legally (my claim held the title) — its
  report was read from the park; no collision, no double-work.

## PLAYABLE on main right now
- `/retrogames/minesweeper` (+ hall of fame & 999 cap #3026),
  `/retrogames/double-dragon` (#3005), `/retrogames/contra` (voice #3000,
  radio teach #3016), `/retrogames/floor-boss`, `/retrogames/fire-crew`,
  `/retrogames/r-type`.

## Board at close
- `game-queue`: **#3031 POLISH — MINESWEEPER press-feel** (tile sinks on
  press, chord-preview ring flatten, drag-off cancels, mouse+face scope;
  scoped by slot b's audit, seeded here so the next kick doesn't re-derive).
  `next`/`steer`/`building` empty. `building-qa`: #3018 (QA inside Contra —
  don't touch Contra from a builder claim). feedback: #3008 (verified done,
  QA's to close), #2971 waiting-jon. `halt`: none. No jonq open (dry-shelf
  flagship question already on the record this week).
- Filed harness issues: **#3027** watchcheck FLOORBOSS pin stale since #2987's
  brainOn hoist (smoke's only red, 908/909, pre-existing); **#3030**
  forge-merge.sh second shape — gh's `--delete-branch` lands the LANE worktree
  on `main` and breaks the wrapper's branch-based PR-state read (fix: capture
  PR number pre-merge; detach lane post-merge before any git-state read).
  Incident from my own merge: cleanup completed by hand, lane re-detached, no
  squat remains (`worktree list | grep '\[main\]'` → empty).

## Harness notes (carry-overs)
- **Prod-verify probes need `curl -L`**: Vercel answers 308 on moved asset
  hashes; without -L grep sees a 15-byte redirect body and the bundle looks
  stale forever. (Two poll rounds lost before the clue was read.)
- A `--mutate` run needs a committed tree (mutateguard); commit the increment,
  then run mutants — checkpoint e6583c3 first, then 8/8.
- STATE.md commits to main ONLY on a game merge (#3021 precedent `08f8f53`);
  direct commit from the plumbing checkout at origin/main, push `HEAD:main`.
- macOS /var realpath vs git in sandbox tests; sandbox zsh sources ~/.zshenv;
  ciscope #1575 (new alias ⇒ scope in checks.mjs same PR). #2910 (kick-prompt
  staleness) still unclaimed — needs a warden target or Jon.

## Slots / ops
- Slot a port 5173: dev server stopped via `scripts/devstop.sh` at close ✓.
  Plumbing `~/Dev/retrogames` detached at origin/main after the STATE commit ✓.
  Lane worktree `retrogames-forge-ms-halloffame` detached at f48cd0c (clean);
  purge cleaner may reap it.
- STATE.md committed to main this session (#3028 merged game code).

## Open questions
- None (no taste call needed; dry-shelf flagship question already open this
  week — see https://jalfern.com/retrogames/forge for the live board).
