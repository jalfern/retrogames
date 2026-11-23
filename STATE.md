# STATE — forge board snapshot (slot b, 2026-11-23 — shipped)

## This session shipped
- **#3037 CONTRA — the Konami code → PR #3040 → main `3741df8`, prod-verified.**
  Attract-typed `↑↑↓↓←→←→ B A` starts the run at 30 lives in the shared pool.
  Referee-clean: pure sim-side detector (`konamiFeed`, zero `gs.r`), prize enters
  only at `makeGame(seed, loop, lives)` (default 3 — every pre-Konami pin/replay/
  dataset byte stands; lives already rode `stateHash`, armed runs replay identical).
  `arcadeLoop` now banks the courtesy only at ≤5; bigger pools carry whole.
  Feel: teach line in both copy sets, gold progress glyphs mid-type, `THIRTY UP!`
  salute + five-note sting, HUD head row gains numeric `x30` (>7 heads overflow
  the row), pad rides attract with a `B` button (pad excluded from tap-to-start;
  background tap still starts; seat-2 law untouched — `KeyA` is the code's last
  note AT attract only). Proof: contracheck **292/292** (7 sim + 7 live legs),
  mutants **194/194** — `never-arms` & `quota-robbery` die by name.
- Never-dry walk (#1571/#1615): kick confirmed live (`KICK CONTRA -1 weak`, via
  feedback #2971; README gaps CLOSED → gap scoped live from the cabinet). Slot a
  shipped the duck (#3039) into the same game mid-build — rebase verified whole,
  one real law-change caught by the suite (below).

## LAW CHANGE the next hand must know
- **The loop bank no longer caps the pool.** `arcadeLoop` carries pools >5 whole
  (Konami 30 survives the arcade loop). The #2894 win-LOOPS browser leg silently
  encoded the OLD clamp (compared pools across stages; the harness `setup(lives:99)`
  sentinel used to normalize to 5 at every boundary). It now asserts
  `min(LOOP_LIVES_MAX, wonLeg.lives + 1)` from the observed win pool — identical
  at every pre-Konami value. Any FUTURE assertion that compares pools across a
  loop boundary must do the same, or account for a 30-sentinel surviving.
- kProg resets at `startPlay`/`endTo`; the detector is never fed during play.
  Typing happens before `beginRun` — the #1712 bank never sees cheat keys, keep it.

## PLAYABLE on main right now
- `/retrogames/contra` (+ somersault #3035, duck/kneel/prone #3039, Konami 30-lives
  #3037, voice #3000, radio teach #3016), `/retrogames/minesweeper` (+ press-feel
  #3032, hall of fame #3026), `/retrogames/double-dragon`, `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`steer`/`next`/`building`/`building-qa`: all EMPTY. `feedback`:
  only #2971 (waiting-jon — the QA polish pass needs a real phone take). No jonq
  open, no halt.
- Worth Jon's eye (unlabeled, so no lane may claim): **#3014 STAGE — CONTRA:
  attract teaches the voice orders** still waits for a ladder label.

## Harness notes (carry-overs + new)
- **Two lanes, one game, same cycle** — worked as designed: the live claim check
  kept both issues separate, and the second ship (mine) absorbed slot a's duck via
  rebase + full re-verification (292/292 + 194/194 + build). Rebasing a game
  branch onto a same-game merge is the moment to RE-RUN EVERYTHING, not just lint:
  that's where the 99-sentinel/#2894 truth surfaced.
- forge-merge.sh #3030 read-fail shape appeared again (merge succeeded, wrapper
  could not read PR state); exit criterion stayed = the PR's own state (MERGED),
  cleanup completed by hand (remote branch already gone, lane re-detached, no
  `[main]` squat).
- Headless paint ~12 fps law (slot a) still current; Konami live legs poll
  rather than single-shot and passed 3/3 runs.
- Prod-verify: main bundle is code-split — grep the `Contra-<hash>.js` chunk,
  not `index-*.js` (`curl -L` for the SPA 308s).

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` at close ✓.
  A temporary diagnostics server was run at 5181 and stopped the same way; the
  mystery listener at 5179 was NOT touched (not ours).
- Plumbing `~/Dev/retrogames` detached at origin/main ✓. Lane worktree
  `retrogames-forge-contra-konami` detached at origin/main (clean); node_modules
  is a symlink to plumbing's — purge must take the symlink before any dir.
- STATE.md committed to main this session (#3040 merged game code).

## Open questions
- None (no jonq filed this session; #2971's phone-take need stays on the QA
  thread). Live board: https://jalfern.com/retrogames/forge
