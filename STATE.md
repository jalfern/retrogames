# STATE — forge board snapshot (slot a first-wave, 2026-11-22 — shipped)

## This session shipped
- **R-TYPE volley pre-dodge** (#2951 → PR #2955 → main `b779123`, prod-verified:
  `volley` property present in prod `assets/RType-CzPmg0ks.js`; Vercel Production
  on tip `3e59fad`). Landed after this lane rebased the branch onto `d10493a`
  (conflicts were keep-both-sides additives in `rtypecheck.mjs` + README);
  post-rebase proof here: rtypecheck **242/242** (233 main + 9 volley laws) and
  mutant **240/240** — all 28 mutants red-by-design incl. #2938's four duel
  mutants on the auto-merged `sim.js`.
- **FloorBoss career takes** (#2958 → PR #2959 → main `ff6f58f`, merged by slot b
  when it woke; #2958 CLOSED shipped). This lane resumed slot b's lapsed claim,
  independently verified the branch: engine review (career door at the whistle;
  `closeTake()` guards key-exit/tap-exit/reset/unmount; `endRun` idempotent via
  `isRecording()`; consent law #2058 intact), floorbosscheck ALL GREEN,
  datasetcheck 66/66, plaicraftcheck green, floorbossplay 96/96, named mutants
  `--mutate-whistle` + `--mutate-career` both KILLED. 8b polish pass filed as
  **#2964** (recording-disclosure chip on the cleared sheet, seam markers,
  cleared-sheet visual beat, close-mid-career flush stress).
- **Main red cleared (#601)**: nightly 45045144722 died on `watchcheck`
  FLOORBOSS watch-feed pin — #2954's tap bank (`if (tapPad) pad.pointer = tapPad`)
  grew the feed block to ~234 chars, overshooting the pin's 200-char window
  (#2626 precedent: honesty rule unchanged, the PIN follows the signature).
  Fix = window 200→300, PR **#2962** → merged `d10493a`. Mutant-proved honest:
  recordTick(livePad()) lie → red; watch-deaf → red.
- **Freeze note**: #2955/#2959 merged at 18:59Z while the last FAILURE nightly was
  still the newest COMPLETED… a later cancellation of the stale in-flight nightlies
  made `main-ok.sh` read `cancelled → ok`. Both games were locally suite-green +
  `static`-green before that merge, so the spirit of #601 held — but if the
  tip nightly fails, 5a outranks everything.

## Nightly / freeze at write-time
- `45057066348` (sha `d10493a`) in progress — clears #601 on green.
- `45062897047` (tip `9127f4e`) queued.
- `scripts/main-ok.sh` currently exits 0 (latest completed = cancelled). Do not
  read that as “nightly green” — it means “no completed verdict yet”.

## PLAYABLE on main right now (prod-verified)
- `/retrogames/floor-boss` — career takes: clear a shift, clock on, the whole
  back-to-back run is ONE recorded, replayable consented take.
- `/retrogames/r-type` — brains now slip the marked Phase-2 fan (crossing-sign
  root fix since S1; solo winnable 7→8/12 seeds, co-op 12/12).

## Board at close
- `building` = **#2966** (FloorBoss tap-burst bank — owned by the slot-a 2nd-wave
  session, pid 61500; do not touch from here).
- **#1712** stays open ON PURPOSE (store lines need human friend-takes; ask #2953).
- `game-queue` empty. `feedback` = #2952 (R-TYPE duel wants, QA) + **#2964** (FB, new).

## Open questions for Jon (links only, #605)
- #2953 (friend takes / invite flow), #2846 (promote flagships? due 11-23),
  #2908, #2930 (QA lane DD seat laws).

## Harness notes (carry-overs)
- **Two slot-a sessions ran concurrently** (#1258 hazard): the warden's idle-detect
  is blind to lanes whose work is long background suites — it kicked a 2nd-wave
  session at 18:55Z while this lane was mid-verification; that session merged my
  PR. Consider a heartbeat comment from lanes while browsers run.
- **Orphan dev servers**: a dead session's `npm run dev` stayed alive (parent pid 1)
  on slot-a's port and silently served the WRONG tree — my first rtypecheck leg
  failed exactly one law (the on-screen one) because of it. Lesson: before trusting
  a browser suite, sanity-check the served tree (`curl …/src/<file>` for a marker).
  Freed by port only (`scripts/devstop.sh`), never pattern-kill.
- **Prod grep recipes**: Vercel Production deployment `sha` + `gh api deployments`
  is the merge→prod proof; game code lives in per-game lazy chunks referenced as
  `"./Name-hash.js"` (grep `./`, not just `assets/`); esbuild mangles FUNCTION names
  but preserves PROPERTY names (`volley` survives, `fanSlip`/`nextShift` don't) and
  string literals survive (`CLOCK IN`, `floorboss.deep`).
- **watchcheck FLOORBOSS pin window is now 300 and ~tight**: the career-take tree
  sits at 294 chars between `const pad = …` and `recordTick(pad`. One more line in
  that block breaks it — FloorBoss README states the law; the next editor must bump
  the window consciously, not silently.

## Slots / ops
- Slot a port 5173: this lane's servers stopped (by port). It is now held by the
  2nd-wave session's server (pid 64079) — leave it; it is mid-#2966.
- Worktrees left: `~/Dev/retrogames-forge-rtype-volley` (merged; re-detached to
  origin/main; removable), `~/Dev/retrogames-forge-watchcheck-fb-window`
  (abandoned by a dead session; contains only an uncommitted duplicate of merged
  #2962 — safe to remove), career-take worktree already removed by slot b.
- Main checkout: detached `origin/main` (`3e59fad`); STATE.md committed+pushed
  this session (game merged), parked via `statepark.mjs park a`.

## Next lane starting here
- Ladder: #2966 held by slot-a 2nd-wave; nothing else claimable. If a nightly
  (d10493a or tip) lands RED → 5a first, no exceptions; a harness-only calibration
  goes without asking. When green, `weakestStage` on a cleared board points at the
  never-dry shelf again (#1712's lines are human data — check `plaicraft:outbox`
  before writing any code).
