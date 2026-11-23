# STATE — forge board snapshot (slot a, 2026-11-23 — SHIPPED)

## This session shipped
- **MINESWEEPER signed mine counter** (never-dry POLISH #3021 → PR **#3024**
  → main `a9b39f4`, prod-verified: live `assets/Minesweeper-JrcQalUu.js`
  carries `Math.max(-99` — impossible in the pre-fix chunk). The original's
  VFD keeps counting into the negatives when you over-flag (−05 = five flags
  wrong, game-wide warning); our HUD painted `Math.max(0, …)` and swallowed
  it at 000 while `s.flags` counted honestly.
  - `mineCounter(s)` now lives in `minefield.js` — signed, floor −99 (3-glyph
    display limit), pure read: no events, `stateHash` untouched — so Node
    audits the exact value the tab paints. `drawNum7` gained a minus glyph in
    the same 7-segment stock; positive renders byte-identical.
  - Verdicts: sweepcheck 107/107 · `--mutate` **7/7 die** (new named plant
    `counter-clamp` — the old clamp back in the rule) · sweepplay counter legs
    4/4 (probe −2 through the shell's own flag verb; minus lights the leading
    LED slot, ink 15→28 px) · eslint + lint:mario/fps/ai/sweep + build green.
- **Never-dry stage derivation (never-dry #1571/#1615):** ladder empty
  (no halt/steer/next/game-queue), QA-borrow blocked (3 live QA MASTER
  sessions), flagship stage spent → idle-kick `KICK MINESWEEPER -1 weak`
  (score from #3008 naming it; zero unowned README gaps → index −1). Orthogonal
  fix chosen because #3008 is QA's win-transition item.
- Filed **#3023** (`feedback`/`lane:qa`): #3011's strict `pips===1` leg races
  `plantHere`'s double-click — when centre opens on a number, click #2 is a
  real chord rejection parking its own pip (instrumented: seeds 222/333 show
  afterPips=1; flood centres 0). Fixture-side, deterministic-ish, not
  game-behaviour, not from this diff. QA claimed it within minutes.

## PLAYABLE on main right now
- `/retrogames/minesweeper` — over-flag and the counter says −0N like the
  original (#3021), on top of the chord shield (#3010) and teaching pips
  (#3012). Plus `/retrogames/contra` (refuse knock phone-proof #3020),
  `/retrogames/double-dragon` (#3007), `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`next`/`steer` empty; `halt` none; no `building` GAME corpse.
- QA holds: **#3008** and **#3023** (both Minesweeper) and **#3018** (Contra)
  are `building-qa` — **do not start Minesweeper/Contra work from a builder
  stage** while those sit held.
- **#3014** (`STAGE — CONTRA: attract demo teaches the voice orders`) is open
  `lane:games` but carries NO queue/next/steer label — the ladder can't see
  it; next builder lane: check with the board before duplicating #3018's work.
- `waiting-jon`: #2971 only.

## Harness notes (carry-overs)
- **#2975 trap, 3rd bite:** rule-5 merge exited 1 AFTER a successful
  squash-merge — stale worktree `retrogames-qa-mini-cap` still squats local
  `main`. Verified `MERGED` via `gh pr view`, detached the forge worktree,
  deleted local + remote branches. Reap `qa-mini-cap` when its story ends
  (#3013 tracks the family).
- **Quiet-box vs load-box reverses fixture races:** #3012's 40/40 ran on the
  loaded box (slow plant swallowed plantHere's click #2); on a quiet box the
  second click lands as a real chord rejection. A fixture that double-clicks
  before a strict-count assertion inherits the board's center-clue dice. Pin:
  snapshot-before/assert-delta (#3023).
- **Pure-read additions to the engine must prove purity** — mineCounter's
  pin (no events, stateHash unchanged) is why a HUD-rule can live next to
  the referee without the referee seeing it.

## Slots / ops
- Slot a port 5173 stopped via `scripts/devstop.sh` ✓. Worktree
  `retrogames-forge-msweeper-negcount` removed after merge (node_modules
  symlink removed as a link) ✓. Plumbing checkout `~/Dev/retrogames`
  detached-clean at `origin/main`; local `forge/msweeper-negcount` deleted.

## Open questions
- None filed (never-dry POLISH is sanctioned work — no taste call; dry-queue
  new-flagship question already on the record this week: throttle).
