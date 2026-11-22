# STATE — forge board snapshot (slot a, 2026-11-22 — shipped)

## This session shipped
- **Contra trainable adapter** (#1712 S2 slice → PR **#2969** → main `9838eab`,
  prod-verified: `Contra-DsaiCIxB.js` carries the `seat2` drop-in law).
  - Consent-gated live capture, per-tick pad-pair banking, P2 drop-in ceremony
    as `rules.seat2` bank ticks, honest 67-feature rows (vision-masked,
    `model.js`), one take spans arcade loops via `sim.js arcadeLoop` carry (#2958).
  - Verdicts: contracheck 213/213, plaicraft:datasetcheck 70/70 + mutants 10-12
    RED by design, contractcheck 771/771, plaicraftcheck green, lint gates + build.
  - **Consent-vs-arcade lesson (the run's real catch):** Gauntlet-shaped consent
    parked the privacy modal BEFORE play; Contra's law is *any key takes the seat*
    and contracheck drives it with real keys → 21 checks starved at attract.
    Fixed arcade-shaped: `startPlay()` synchronous, consent gates RECORDING only
    (`beginRun` on stored grant; banking behind `isRecording() &&
    !contractHoldsLoop()`), sources honest at origin (#2058), `openGame({decline:true})`
    for robots (watchcheck pattern). Future trainable games: copy THIS, not Gauntlet's key-path.
- 8b QA polish filed: **#2971** (disclosure chip, phone consent flow, seat-2 copy,
  first real phone take).

## #1712 status (TARGET, stays OPEN on purpose)
- Done: trainable surface for TWO games (gauntlet + contra), store-ready.
- Open lines, both human-data-gated: `gamesCovered>=2` needs the first real
  Contra take through a phone (prod store 18 takes, gauntlet-only at last check —
  rerun `plaicraft:outbox`/store page before any new code); holdout needs takes
  from 2 live players. No human data can be faked (big-build rule 1).
- #2953's answered-default ("widen adapters while store waits") is now CONSUMED
  by #2969 — next #1712 progress is data, or holdout mechanics when data exists.

## Nightly / freeze at write-time
- Tip `9838eab` nightly not yet started; last completed run SUCCESS. #601 clear.

## PLAYABLE on main right now (prod-verified)
- `/retrogames/contra` — trainable: answer Yes once and your thumb's runs bank
  as consented takes (P2 = keyboard W/A/S/D/F/G drop-in; CPU wingman default).
- `/retrogames/floor-boss` — career takes (one take spans a whole shift).
- `/retrogames/r-type` — volley pre-dodge brains (#2951).

## Board at close
- `building`: **#2966** (FloorBoss tap-burst bank, slot-a 2nd-wave session —
  do not touch). **#1712** open (human data). `game-queue` empty.
- `feedback`: #2952 closed-shipped? (#2967 merged) + **#2964** (FB) + **#2971** (new).

## Open questions for Jon (links only, #605)
- **#2846 promote flagships? — due 11-23 (tomorrow)**, #2908, #2930 (QA DD seat
  laws). #2953 consumed this session (default taken, recorded on-thread).

## Harness notes (carry-overs)
- **`gh pr merge` needs local `main` free**: `fix-smallmodel` worktree holds the
  `main` branch → merge *did* land remotely, gh then died on local cleanup
  (misleading error). Verify merge with `gh pr view --json state,mergedAt` before
  retrying anything; local branch cleanup is manual (`git checkout --detach` first).
- **Prod grep recipes** (unchanged, re-proved): deployments API sha = merge→prod
  proof; game code in lazy chunks referenced `"./Name-hash.js"`; curl needs `-L`
  (jalfern.com 308→www — a bare grep of redirected 15-byte bodies "proves"
  nothing); string literals survive minification (`seat2` does, function names don't).
- **Consent gate in harness**: seed the stored decline (`openGame({decline:true})`)
  for any game whose entry asks; a robot is not a consenting human. Do NOT gate
  play behind consent in arcade-entry games.
- watchcheck FLOORBOSS pin window tight at 300 (~294 used) — see FloorBoss README.

## Slots / ops
- Slot a port 5173: this lane's servers stopped (by port); port free.
- Worktrees left: `retrogames-forge-plaicraft-s2-contra` (merged; re-detached
  `9838eab`; safe to remove), plus old cleanables listed in prior STATE
  (`forge-rtype-volley`, `forge-watchcheck-fb-window`).
- Main checkout detached `origin/main` `9838eab`; STATE.md committed+pushed to
  main (game merged, rule 9) and parked via `statepark.mjs park a`.

## Next lane starting here
- Nothing claimable is code: #1712's two lines are human data — check the store
  (#2971's phone-take checklist may deliver it) before writing anything.
- If tip nightly goes RED → 5a first (harness-only calibration goes without asking).
- #2846 deadline tomorrow; warden sweep takes the default at deadline — fine.
