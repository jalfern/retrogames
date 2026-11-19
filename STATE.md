# STATE — session 352, slot b (2026-11-19 ~14:20Z)

## Shipped this session
- **#2770 shipped as `30a79ac` — BRITANNIA: drivable at expose.** The nightly
  stall (#2769, seed 20261155: `tick did not advance on step 1`) was the DEV
  contract publishing `__game` at mount while the world still unrolled
  (fetch ultima4.jsdos → inflate → star/land plots → `S = fresh(0)`): in that
  window reset/tick silently no-op (`if (S)`). Law now: nothing publishes
  until the world stands — `exposeGame`/`__britanniaTest`/DebugKit built at
  mount (`devUp`), fired at the end of `load()`. Player half at the same seam:
  key/tap during the unroll **arms the start** — the game begins at the
  landing, held keys walk, stale one-shot taps drain.
  Gate: `npm run britannreadycheck` (lane-advisory, MANUAL_CHECKS) route-
  throttles the map +2.5 s — 12/12; mutant (mount-time publish) → 7 red with
  the nightly signature verbatim (`ready:false, t0:0, t1:0`), restore green.
  britanniacheck all green; nightly britannia PASS at seed 20261155; lint
  gates + build green. **Prod verified**: new shell `index-aaXgQXsM.js`; live
  probe throttled the map on jalfern.com, held key mid-flight started the run
  at the landing (`__feedbackInfo` tick 15, zero page errors).
- Warden target #2760 was REFUSED at claim (slot a holds it, 75 min) — normal
  ladder: steer/next/game-queue empty, feedback only #2769 (+QA live, no
  borrow), flagship gaps all owned → never-dry rung: `weakestStage` named
  BRITANNIA (score 1, gap index −1: the weakness WAS #2769). Filed #2770,
  claimed, shipped.

## Playable now
- BRITANNIA: a key pressed while the map unrolls sets off the pilgrimage the
  moment Britannia stands. `jalfern.com/retrogames/britannia`.

## Board (as seen at close)
- #2760 building (slot a, PR #2768 WIP — tail law resume lives in its body).
- #2772 filed (feedback, lane:qa): britannidrive walk/chapel legs fail
  IDENTICALLY at pristine main (gate-menu law drift since #2494/#2516) —
  pre-existing, verified by A/B at origin/main, untouched by #2773.
- #2769: root-cause comment posted; next green nightly should nightlyheal it.
- Rule-4 counter reset: game code merged.

## Next queue
- Re-derive at main (`node scripts/idle-kick.mjs`, then the ladder) — do NOT
  trust this line. #1711 stays wait-state behind #2652 (platform takes).

## Catches learned
- **A green mutant can be a false mutant.** First plant (`devUp()` at the load
  call) went GREEN because the DEV-block assignment runs *after* load() in the
  effect body — devUp was still null there. Plant where the original bug lived
  (end of the mount body), not where the fix's flag happens to sit.
- **`git stash pop` on a shared lane box pops someone else's stash.** My
  push-pop found "no local changes" but still applied stash@{0} (slot a's old
  STATE) under my worktree. Use `git checkout <ref> -- <file>` for A/B runs
  at other revisions; never stash-pop blind.
- **nightlybot's repro line double-adds the seed.** Issues print
  `NIGHTLY_SEED=<SEED+index>` but the bot adds the game index again; to replay
  seed 20261155 pass NIGHTLY_SEED=20261119 (SEED for 2026-11-19).
- **Verify prod deploys by shell-hash change + behavioral probe**, not asset
  names (mine 404'd for 10 min pre-deploy; www-redirect matters too).
  `__feedbackInfo` is prod-safe (#1473) — that's the only drivability window
  a prod probe has, and it's enough.

## Housekeeping
- STATE committed direct to main (game merged — allowed); parked at the
  slot-b path via `statepark.mjs park b`. Shift report published.
- Slot-b port 5178 dev server killed at close; my worktree
  `~/Dev/retrogames-forge-britannia-ready` removed after detach; main checkout
  detached at origin/main. `git worktree prune` run.

## Open questions
- #2652 (AWAITING, lane:platform — Jon's phone take, deadline 2026-11-20
  01:36Z). Nothing new filed by slot b this session.
