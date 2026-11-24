# STATE — RetroGames arcade (slot a)

_Last update: 2026-11-24 ~09:40Z (forge lane a session end)._

## What's playable now
- **STOMPTOWN (#3094) is LIVE**: https://jalfern.com/retrogames/stomptown — Jon's
  city-breaker prototype promoted to a full registered title. Own cast (GROG/ZARRA/
  FENRIS), 12-city tour, climbable towers, window loot, blimp rescue. Prod bundle
  verified serving `Stomptown-*.js`. Merged `43df2c8` (PR #3112); #3094 shipped+closed.
  Gates: `npm run stompcheck` (69 Node checks + 10 mutants, `stomp` scope registered,
  runs in `static`), `npm run stompdrive` (15 browser checks). Autopilot razes day 1
  in ~28 s world time; full tour win is hash-for-hash deterministic (seed 11, 144 380).
- PINBALL — CABINET ONE (#3103 rung 1, #3116) and PADTYPES five switchable overlays
  (#3117) also merged today by other lanes.
- Production remains everything on `main`; `static` (green at `43df2c8`) is the only
  required check; main-ok clear at session end.

## This session (lane a) — SHIPPED #3094
- Built the full STOMPTOWN package in the issue-keyed worktree
  (`~/Dev/retrogames-forge-3094-stomptown`, now detached at `origin/main`):
  pure seeded `sim.js`, shared attract/harness autopilot `planner.js`, DOM-free
  `art.js`, shell with attract/pause/pad/exposeGame, registry entry `/stomptown`
  (private until Jon promotes), contract roster+pattern, original music bed, README,
  `stompcheck` + `stompdrive` + `stomp` CI scope registration.
- Two real bugs caught by the harness mid-build: `step()` overwrote `gs.prev` before
  its `just()` closure read it (no punch/jump/eat could fire), and the frame loop
  gated event-draining on `!gs.end` (over-screen never opened). Both fixed + pinned.
- #3094 collision history (from the prior lane-a report, now resolved): lane a's
  earlier single-file attempt (`stomp-town` id, `/stomp-town` route) stood down when
  the warden kicked a second builder onto the same issue; the surviving build kept
  `stomptown` naming everywhere. Both hazards the old report flagged (dir-case 404,
  on-screen "RAMPAGE" text) are fixed and verified — prod copy says STOMP, git tree
  is `src/games/Stomptown` (case-checked; Linux CI passed).
- Filed **QA — STOMPTOWN: polish pass → #3123** (label `feedback`): destruction
  theatre (sequential floor-crush, dust, burning rubble), third parallax layer +
  street life, distinct monster silhouettes/eyes, per-city music variation +
  newspaper ceremony days, blimp spotlight. QA lane picks it up; builders don't.
- Lane-collision harness bug #3110 stays open (claim paths should be lane-keyed and
  heartbeats tool-call based); a builder may take it if the ladder offers.

## Untrusted artifacts rule (still true)
- Park files have carried fabricated issue numbers before (the "#3089 MACARONI SHIFT"
  variant never existed). Verify every issue/commit claim against the board (`gh`)
  before believing or repeating it. This file's numbers were all checked 09:40Z.

## Next queued
1. Builder ladder: next title from Jon's flagship order (#2795); new-title asks are
   capped ~Nov 27 — don't ask, build. (Don't pick up #3123 — polish is QA's lane,
   per Jon's 2026-10-19 decision.)
2. #3110 (harness: lane-keyed worktrees/claims) — take only if it surfaces on the
   ladder; do not grow the harness past the code it tests.
3. If STOMPTOWN regressions appear in nightly `static`/prsmokes, they're lane a's:
   the `stomp` scope is ours.

## Open questions for Jon
- None open for lane games. (Board `waiting-jon`: #3054 lane:qa, #2971 contra-qa,
  #1712 research — none owned here.)
