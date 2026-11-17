# STATE — session 312 slot b close-out

## Shipped this session
- **#2532 shipped — HOMEBODY even-night prowl (PR #2533, squash d936368).**
  Finished the corpse session 311 left (draft PR with 2 WIP items):
  1. `peoplecheck` §PROWL (33 checks): parity arithmetic + sneak-complement
     cross-check (no dark hosts boots AND paws), organic due-night twin
     (d2@23.00h, d1 odd quiet), feet-move during the BFS, midnight
     send-home same-night, natural walk-home when rung at breakfast, no-cat
     quiet + refusal-in-words, purrs-never-pennies (fun up, money/lost
     frozen), hash ledger (prowl/prowlNight/prowlSerial), rng determinism
     twin, win-economy intact, 12 source pins. Suite **682/0**; mutant
     proof: `day % 2 === 0` flipped → 9 reds, restored.
  2. `homebodydrive` §PROWL live (8 gates): refusal-words, real adoption,
     flap opens, banner paints cream over the lawn (y≈348 scan), sprite
     cell follows logic, amber night-eyes px, home stamped one-on-serial,
     home banner. Drive **85/0**, zero page errors.
  Live: https://jalfern.com/retrogames/homebody — deployed chunk
  index-BtX3Q5cz.js carries `MISO PROWLS EVEN NIGHTS`. Issue labeled
  shipped + closed.

## Board
- Resumed #2532 (TARGET, claim accepted — already ours). No halt/steer.
- `game-queue` empty; `next` = #1711 (lane:platform, no lane action);
  building #2516 held by rl lane. #2530 (smash-tv planner wedge) got
  `building-qa` mid-session — QA took the real game bug; leave it.
- jonq #2529 AWAITING is lane:research's, not ours.
- Step 8b not filed: Homebody already has open QA pass #2508.

## Next queued
- Ladder will fall through to the #841 flagship stage again — check
  `idle.mjs` weakestStage fresh (Homebody's score dropped after this ship;
  #2508 is QA-held so Homebody is hands-off for builder lanes now).
- #2530 smash-tv wedge is QA-held — builders skip it even when the queue
  empties.

## Open questions
- None filed this session (finishing a spelled-out WIP handoff is
  derivation, not a taste call). Lane-foreign: jonq #2529 AWAITING.

## Catches for the next session (each cost probes this shift)
- **Prod-carry checks must `curl -sL --compressed` into files.** A plain
  `curl | grep` scans the 15-byte "Redirecting..." body (jalfern.com 308s
  to www.jalfern.com) and false-fails forever on a perfect deploy. Game
  chunks are 2 levels deep: entry mapDeps → chunk mapDeps; scan both.
- **Day-crossing sim twins: a prowl rung in daylight completes NATURALLY
  (out+back ≈ 4 sim h at 40 px/s), long before midnight.** Assert the
  same-day natural close; use an explicit 23:5 re-ring to prove the
  midnight retire.
- **Fun-pay floor math**: cat fun decays 0.08/sim-h; a `+PET_PROWL_FUN
  − 0.05` assertion fails on decay alone (observed 0.52 vs floor 0.55).
  Margins ≥ −0.15 for hour-spanning fun deltas.
- `ringProwl` (like ringSneak) lowers `prowlNight` to day−1 so the law
  may re-ring the SAME night — serial, not stamp, counts visits.
- The `gh` identity is jalfern, so my FORGE comments render as jalfern —
  when checking for Jon's hold on a PR, distinguish the `vc` bot and
  `FORGE:`-prefixed own comments.

## Lanes clean
- Main checkout detached at origin/main (ahead: STATE #2527 by another
  lane). STATE.md rewritten + parked for slot b; STATE PR carries it.
- Worktree `~/Dev/retrogames-forge-homebody-prowl` re-detached at
  d936368-ish tip, clean tree, real node_modules (reusable).
- Slot b dev server (:5178) stopped at close-out.
