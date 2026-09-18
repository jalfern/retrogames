# STATE.md — 2026-09-?? (session end)

## Status: the session goal is DONE and merged
**Raccoon Heist jobs 2 and 3 are completable by a walk-only player** — proven by
`npm run heistwin -- --job N`, a driver that touches nothing but stick/keys during
play (no teleports; `--fastdoor` is a labelled dev experiment for door geometry only).

| job | result | notes |
|-----|--------|-------|
| 1 Corner Bank   | CLEAR 4/4, 273 s | one arrest, rescued at the pound |
| 2 Museum        | CLEAR 6/6, 469 s | moonstone through the laser aisle, urn out of the chewed vault |
| 3 Manor         | CLEAR 6/6, 814 s | two pound rescues, moonstone+urn through the vault door |

Merged: **#54** (game fixes: loot survives arrest in `engine.js`; `batch([])` crash meant
job 2 had never booted, `art.js`; `dims()` on the dev hook; the completor itself) and
**#55** (driver-only: prop-aware routes/steering, point-aim on one-hop legs, hedge
ducking, livelock bail). `heistcheck` 303/303, `lint:heist` clean, static CI green on both.

## Where the bodies are (if this regresses)
- All three jobs take several **world**-minutes per run; budgets are world seconds
  (`--budget`, leashes). Chrome sometimes eats the WebGL renderer after ~8 min —
  `revivePage()` relaunches and the attempt counter bounds the job. A CI gate for
  `heistwin` would need `?lite=1` + `--throttle` like `heistplay`, and probably
  per-job shards (it is ~25 min for all three at crouch-pace).
- The geometry facts the driver encodes the hard way: chew gate is a strict `< 1.5`
  (engine `focus()`), collider stop at a door is 1.42 m, so aim points live at 1.25 m;
  blocked props use `p.r + 0.65` in the route model (cost +14) and arcs in steering;
  frozen watchdog is POSITION-based because `d` is constant when two barrels pin you.
- Job 3 at 814 s is honest but slow — crouch-everywhere + hedge waits. A human does
  ~3 min. Next lever is a per-patrol cycle-window planner, not a correctness fix.

## Repo hygiene after this session
Both dev servers stopped (the stale :5173 is gone; `npm run dev` now answers on 5173).
`heistwin` is in package.json. Branch clean = `main` @ 6798537.

## Three questions for Jon (4-hour checkpoint)
1. **Should `heistwin` become a CI gate** (sharded per job, `?lite=1`, node-24 runner),
   or stay a local proof? It is the only suite that plays a whole job start→gate; it is
   also the slowest thing in the repo (~25 min for three jobs) and Chrome renderer
   deaths make it the flakiest.
2. **Job 3 pacing:** want the driver (and by extension the game's own AI expectations)
   to chase a faster route via patrol-cycle planning, or is "slow but never dies" the
   right definition of done for the walk-only contract?
3. **`caught:1-2` in every clear:** the pound-and-rescue loop works, but every clear
   so far involves getting caught. Is a `clean: >0` clear (never caught) a goal, or is
   the rescue choreography accepted as part of the game's intended loop?

## Next work, if continuing (in order)
1. Answer above; if CI gate: shard `heistwin` per job into the manual `verify` job first.
2. Patrol-cycle planner (speed, and it exercises the beam-timing gate code paths that
   job 2 uses and job 1/3 don't).
3. The driver has never used `secondAction`-style B or the pad's crew button on a menu —
   small untested surface in `VirtualControls` dispatch under `?pad=1`.
