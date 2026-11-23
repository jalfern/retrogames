# STATE — forge board snapshot (slot a, 2026-11-23 — CONTRA marches)

## This session
- Board was dry when the warden ticked (weakest stage it saw: CONTRA -1 weak).
  Normal ladder first, live: steer/next/game-queue empty; feedback only #2971
  (`waiting-jon` — skipped by rule); QA-borrow off (three live QA MASTER
  sessions: mini :5174, studio :5176, mini2 :5179); `flagshipStage` ⇒ null
  (all six flagship READMEs CLOSED/DISCLAIMER). NEVER-DRY rung:
  `weakestStage` ⇒ CONTRA score 1 (feedback #2971 names it; every README gap
  CLOSED at kick) — exactly the prompt's kick.
- Filed POLISH #3048 with the why-weakest line, claimed it
  (`forge-claim.sh 3048 a`), built in `retrogames-forge-contra-march`:
  **THE MARCH** — the cabinet's silent stage finally has a band.
  - `contraMarch` (jungle/falls, E-minor military drive) + `contraGate`
    (boss siege, E–B♭ tritone grind) — ORIGINAL beds composed for this build
    (`joust`/`marble` house law, not transcriptions; uniqueness pinned).
  - `bedTrack(phase)` pure sim law: zero gs.r, no bed field on gs — no seed
    stream, replay, twin or PLAICRAFT byte moves (referee leg pins it).
  - Bus step = pattern step ÷ gs.lk (SSX seam): loop heat lifts the music at
    exactly the pressure k.
  - Silence by law on attract/over/CONTINUE/clear/pause/unmount; the switch
    rides the WORLD tick, no timers.
- PR #3050 (squash-merge via `scripts/forge-merge.sh`). Closes #3048.
- Harness: contracheck +7 sim legs +8 live bus legs; mutants `bed-stuck` and
  `music-deaf` die by name (mutant run 204/204). Normal run 342/343 — the one
  red is `#3035 live somersault`, which fails IDENTICALLY at pristine
  origin/main on this Mac (325/326, same signature): pre-existing advisory,
  CI is the calibrated referee (#2176). contractcheck(contra) 17/17.

## PLAYABLE on main right now
- `/retrogames/contra` (+ music beds #3048 pending merge, CONTINUE ceremony
  #3045, score extend #3041, Konami 30-lives #3037, duck #3038, somersault
  #3035, voice #3000, radio teach #3016), `/retrogames/minesweeper`
  (+ press-feel #3032, hall of fame #3026), `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- After #3050 merges: steer/next/game-queue/building empty again; feedback
  #2971 (waiting-jon) + the QA polish pass filed for the beds.
- Contra's README now carries ONE open honest gap (the canyon deserves its own
  cue — it shares the march): `weakestStage` will score Contra 1 again, so a
  dry lane has an honest next note. The attract-silence bullet is
  DISCLAIMER-marked so it never scores (#2488 law).
- Unlabeled #3014/#838 still carry only `lane:games` — untouchable until Jon
  labels one.

## Notes for the next hand
- The bed gate is TEXT-PINNED in contracheck (`bedSrc.includes(...)`) — if you
  refactor applyBed/onDown/cleanup, update those pins in the same PR, and the
  `music-deaf` mutant anchor (the applyBed call line) too.
- `music-deaf` plants index.jsx by TEXT; harm re-reads the file. If prettier
  reflows the applyBed call site, re-anchor both.
- The #3035 somersault live leg is calibration-sensitive on Mac software-Chrome
  (dark-barrel-ink counts). It is advisory; don't spend a PR on it unless CI
  itself goes red.
- The paid-continue music leg now stages `score: 4200` before dying — a
  0-score carry is legal, so don't relax the leg's bank check back to
  `score > 0` blindly.

## Slots / ops
- Slot a port 5173: dev server started this session, stopped via
  `scripts/devstop.sh` (verified). No other lane's port touched.
- Plumbing `~/Dev/retrogames` detached at origin/main; lane worktree
  `~/Dev/retrogames-forge-contra-march` (forge/contra-march, merged).
- STATE.md rides this PR (a game merged this session — step 9 allows it);
  parked at `/tmp/forge/STATE.a.parked.md` via `statepark park a`.

## Open questions
- None filed (nothing taste/priority/hard-to-undo came up; the dry-queue
  title-ask is still weekly-capped by #2795 until ~27 Nov, and was moot —
  the never-dry rung had work). Live board: https://jalfern.com/retrogames/forge
