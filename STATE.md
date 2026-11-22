# STATE — forge board snapshot (slot b, 2026-11-22 late — shipped)

## This session shipped
- **PLAICRAFT S2 trainable adapter: TALK ME DOWN** (#1712 → PR #2976 → main
  `3a6ed2f`, Vercel deploy verified). The last autoRecord-wired game without a
  replay adapter now has one: consented phone takes land train/heldout WITH
  features instead of flagged `feat:null`.
  - `src/games/TalkMeDown/model.js` — THE 151-feature featurizer. Keeps the
    game's true split-information law in the dataset (rally partition precedent,
    this game is the real thing): defuser rows = panel eyes + the CPU manual's
    LCD order rail (solo), NEVER rulebook facts; manual rows = page/line/flag +
    live-stamp rail (#1880), NEVER panel facts. Back plate gated by flip (#1797);
    prev-pad lane banked after the label (model.js contract).
  - `talkMeDownRows` — replays takes against THE seed-pure engine.js, verifies
    every checkpoint + final hash (S1's law). Offline semantics: seats chosen at
    seed-birth, online runs not auto-recorded at S2 — no drop-in stamp needed.
  - `plaicraft:datasetcheck` 70→**77** (+ mutant 13, 13/13 die by name). The
    no-adapter gate fixture moved to gravel-yard (gate still proven); solo+couch
    TMD fixtures ride the trainable splits; order-rail + flip-gate pinned on
    deterministic sim legs (random fixtures CAN'T pin them: dice hit strike locks).
  - Prod-store run on the post-merge builder: version `5dcb62ac…` byte-identical
    to pre-merge — corpus unchanged because the store holds no TMD takes yet.
    This is ground-work, not proof; gamesCovered is still 1/2 (gauntlet only),
    holdout blocked need-2-players. **Lines are human-data, as ever.**
  - QA polish filed: **#2978** (order-string coupling, rail visibility design
    call, lineFrac depth, first live phone take, N_ACT vs banked `b`).

## PLAYABLE on main right now
- `/retrogames/talk-me-down` — play unchanged (adapter is script-side); its
  consented takes are trainable from this build.
- `/retrogames/floor-boss` (#2966), `/retrogames/contra` (#2969), `/retrogames/r-type` (#2955).

## Board at close
- `game-queue` empty; `steer`/`next` empty. `building`: #1712 (stage open by
  design — human-data lines; #2953 AWAITING).
- `feedback`: #2978 (this session's QA ask), #2971 contra-adapter polish,
  #2964 FloorBoss polish, #2952 R-TYPE (building-qa, QA holds).
- Adapter shelf: ALL EIGHT autoRecord-wired games are now trainable
  (gauntlet, floor-boss, bomb-defuse, SOS, rally, double-dragon, contra,
  talk-me-down). Next shelf work = wiring a new game (fire-crew/gravel-yard
  have voice but no autoRecord) — that is a game-code stage for a future session.
- Prod card: 18 takes, 8 audio tracks, human gauntlet-only.

## Open questions for Jon (links only, #605)
- #2953 — S2 friend-takes invite flow (due 11-24; default "keep widening
  adapters" now carries further: Contra AND TalkMeDown done).
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON public? (due 11-23).
- #2908, #2930 (QA lane) — DD seat laws.

## Harness notes (carry-overs)
- Rule-5 merge loop exits 1 AFTER a successful merge when `fix-smallmodel` holds
  `main` locally ("already used by worktree") — hit again this session. Verify
  origin/main + PR state before believing the exit code; merge landed (`3a6ed2f`).
- scriptedTake dice freeze behavior pins: TMD's strike lock is 180 ticks, so
  anything needing a quiet dwell (the CPU's 90-tick think) must be pinned on a
  hand-driven sim, not on random fixtures.
- All lanes off the old `talk-me-down` no-adapter expectations — gate proven via
  gravel-yard now; don't "fix" it back.

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` ✓.
- Worktrees left: `retrogames-forge-plaicraft-s2-audio-align` (merged; dir
  prunable) + older prunable dirs from 11-22 sessions.
- Main checkout: detached `origin/main` @ `3a6ed2f`; STATE.md committed this
  session (#2976 merged) + `statepark.mjs park b`.
- Nightly watch: first full nightly over `3a6ed2f` runs the adapter + dataset
  legs together; prod dataset version must stay `5dcb62ac…` until a real
  talk-me-down take lands (byte-identity is the honesty check).
