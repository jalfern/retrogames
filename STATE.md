# STATE — 2026-10-24 forge session (GAUNTLET ten mazes shipped; gauntletcheck 257 + 40/40 mutants)

## Shipped this session
- **#950 → main (PR #970 squash 6417d9b)** — **GAUNTLET: ten mazes, warp
  exits, hazard furniture**, live at
  `https://www.jalfern.com/retrogames/gauntlet`.
  - L1–L4 grids untouched (FOUR HALLS pinned `levelCount:4`); L5–L10
    stroke-built with six new materials + ramped rosters/gens/Death timers.
  - Warp arches L5→7, L6→9, L8→10 (bonus banked, guarded: never fires to
    `to >= levelCount` or backwards — bricked for FOUR HALLS).
  - Hazards: `B` breakable (2 sword blows), `T` vanishing traps (fixed cycle,
    bruise+shove), `P/p` teleporters, `S` stun (× `stunFactor` speed), `h`
    hidden passages. `visualChar`/`logicChar` split look vs walkability;
    planner blocks `B`/`T` so no route needs hammer or trap timing.
  - Proof: `gauntletcheck` **PASS 257**; `--mutate` **40/40 die** (5 new);
    `gauntletplay` 22/22 real browser (live demo took the L5 warp: L7 at tick
    6500); lint:gauntlet + build + `static` green; prod verified.
  - Pilot: overhead clears all ten seeds 0–3 (3 deathless) + slack win; FP
    pilot at `levelCount:4` unchanged.
- Filed **#973** `QA — GAUNTLET: polish pass (ten-maze hazards)` (feedback).

## Next goal
- `game-queue` is EMPTY → #841 stages apply: borrow-QA or flagship polish.
- Never touch QA-held issues; QA holds #928, #891, #939, #947, #956, #973.

## Board / harness status
- main = 6417d9b (this ship). `main-ok` green at claim + merge; `static`
  SUCCESS; Vercel pass; prod verified.
- `lint:mario`/`lint:fps`/`lint:ai`, `lint:gauntlet`, `npm run build` green.
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.
- Gauntlet `maxTicks` default 40000 → 30000 (measured worst pilot ~17.3k).

## New harness lessons (this session)
- **Never kill a `--mutate` run with a shell timeout.** The runner plants a
  bug, spawns a child, restores in `finally`; SIGKILL strands the plant in
  the working tree. One leaked into c76f772 this session (gen-respawn) and a
  later race with a *live background* run produced phantom FAILs when a
  normal check read the planted tree. Rule: mutate runs are detached-only
  (`nohup` + poll), and NOTHING touches the worktree while one is live.
- **Static assertions don't kill runtime mutants.** The bricked-arch gate
  was "L1–L4 define no early warp" (true in both mutant and fix) — the
  mutant survived until the gate ran the guard (levelCount 6, stand on the
  arch, expect no `levelClear`). Gate behavior, not tables.
- **A "level" jump the pilot shouldn't be able to make is free proof**:
  attract demo at L7 by tick 6500 is only reachable via the warp — use
  impossible milestones as live-fire checks in the browser.

## Housekeeping owed
- Prune worktrees when idle: this session's `retrogames-forge-gauntlet-mazes`
  already removed; standing list (momentum-courses, iphone-controller, ssx-*,
  emberwood-*, qa-863*, people-sim, campfire-670, forge-model-library,
  coral-reef).
- STATE.md ships via its own PR (#920 convention) — this session merged a
  game, so this file goes out via its own PR + merge.

## Open questions
- None (#605: nothing filed this session).
