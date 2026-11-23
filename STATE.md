# STATE — forge board snapshot (slot b, 2026-11-23 — CONTRA shipped its march)

## This session — SHIPPED
- **#3047 POLISH — CONTRA: stage music** (never-dry rung #1571/#1615).
  Board verified dry live (steer/next/game-queue/building/building-qa empty;
  only feedback #2971 — waiting-jon, skipped; flagshipStage ⇒ null;
  weakestStage ⇒ CONTRA score 1 via #2971, QA out since #3045 shipped).
  Filed, claimed, built, merged: **PR #3049 → main `c3158ad`**, prod
  verified (bundle `index-Bu09fX01.js` contains `contraGate`).
- The game: the cabinet never plays silent — ours had ~40 SFX and no music.
  Two ORIGINAL beds in AudioController (`MUSIC.contra` E-minor march,
  `MUSIC.contraGate` tritone variation-up; header law: no transcription —
  a leg proves they're no copy of shelf beds). Cadence locked to the world
  clock (1 step = 6 ticks, loop = 24 rifle cadences, qbert law). Bed law is
  pure sim arithmetic (`bedFor`, `liftStep` — the loopVoice precedent); the
  shell maps: seat-start raises it, gate revoices, loop heat lifts tempo by
  lk, `?` ducks to 0.15, GAME OVER strikes it (coin owns the over screen),
  paid continue brings it back. Referee-clean: zero gs.r, hash twin pinned.
- Proof: 7 sim legs + 6 live legs + mutants `bed-deaf`, `lift-flat` (mutant
  run 204/204). Full suite 339/340 three times — each run a DIFFERENT
  pixel-sampling leg went red (#3035+#3038 r1, #3018 r2, #3035 r3): the
  sampling flake family, advisory; every #3047 leg green on all three runs.

## PLAYABLE on main right now
- `/retrogames/contra` (+ STAGE BED #3047, CONTINUE #3042/#3045, score
  extend #3041, Konami 30 #3037, duck #3038, somersault #3035, voice
  #3000/#3016), `/retrogames/minesweeper`, `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `steer`/`next`/`game-queue`/`building`/`building-qa`: EMPTY (my #3047
  closed; #2971 shipped items 1–3, its last item is Jon's phone take).
  `feedback`: #2971 (waiting-jon) + #3052 (stage-bed mix pass — QA's ears;
  it names CONTRA, so weakestStage will keep kicking CONTRA with a real,
  unowned-on-success item until QA takes or closes it). No jonq open, no halt.
- The shelf is gap-free again unless #3047's CLOSED-markers change nothing:
  weakestStage after this ship scores every title 0 (#2971 still names
  Contra — expect `CONTRA -1 weak` until Jon's take closes it; a lane
  hearing that kick can re-scope another cabinet rule live: the prior three
  kicks (#3037/#3041/#3042) all found real ones).
- Unlabeled #3014/#838 still carry only `lane:games` — not ladder items.
- `main-ok.sh`: OK. Required check `static` green on #3049.

## Notes for the next hand
- **mergeclean `post` bug (platform):** `scripts/lib/mergeclean.mjs` runs
  `gh pr view --repo jalfern/retrogames --json state,headRefName` with no
  PR/branch arg — this gh build refuses ("argument required when using the
  --repo flag"), so `forge-merge.sh` aborted AFTER a successful merge
  (#3049). Merge, branch-delete and re-detach all completed by hand;
  the lane worktree had to be force-removed. Filed as #3051 — fix: pass the
  branch (gh pr view --repo X --head <branch> or resolve the number first).
  Until fixed, a lane whose forge-merge prints the mergeclean error must
  verify PR state itself (`gh pr view <n>`) and finish cleanup (reap).
- Live-laws learned: puppeteer `press('?')` sends `shiftKey:false` — press
  `Shift+Slash` for honest '?' (the shell's gate is right, the leg was
  lying). `'contra' + 0.083 > 0` is string-concat NaN-poisoned — never
  concatenate onto a bed name in a numeric expression. jalfern.com 308s to
  **www.** — prod asset greps need `curl -L` (HTML@200 fallback hides
  misses otherwise).
- Slot a's title-ask trap notes stand (DRY_QUEUE_SHAPE wording; #2795 cap
  clears ~27 Nov).

## Slots / ops
- Slot b port 5178: dev server stopped with `scripts/devstop.sh` (verified
  free). Plumbing `~/Dev/retrogames` detached at origin/main `c3158ad` ✓.
  Lane worktree `retrogames-forge-contra-stage-bed` removed post-merge;
  `/tmp/rg-baseline-main` scratch removed too.
- STATE.md committed to main this session (game merged — the exception), and
  parked via `statepark park b`.

## Open questions
- None filed (nothing taste/priority-shaped came up). #2971's phone-take
  need lives on its own waiting-jon thread.
  Live board: https://jalfern.com/retrogames/forge
