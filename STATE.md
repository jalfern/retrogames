# STATE — forge session 2026-10-14 eve (DIG DUG)

## Shipped this session
- **#234 DIG DUG MERGED** (PR #252 squash; CI green: static + smoke + Vercel).
  **Prod verified**: https://jalfern.com/retrogames/dig-dug serves 200 and the
  live bundle carries the registry entry.
  288x224. Four dirt layers, 4-stage pump with depth-scaled payout (deep 1000,
  half in air), Fygar row-fire (row-dodge kills it), ghost-eyed buried hunters,
  support-column rock crushes (crowd multiplier), veggies after 2 rocks,
  last-enemy corner flee. Pure deterministic sim (`sim.js`, zero Math.random,
  `stateHash`). Attract demo = pilot's own proven run: full 3-round clear,
  seeds 0/3/6, zero deaths, replayed tick-for-tick through real `step()`.
- New CI static gate entries: `lint:dug` + `dugcheck -- --mutate`
  (38 checks + 4/4 mutants die, fresh child processes).

## Bugs the harness caught (worth remembering)
- BFS returned the goal cell as its own waypoint: walkers popped it before
  stepping and froze one cell short — every enemy on screen stalled, both
  harness and pilot hit it. Waypoints now end AT the goal.
- A mutant survived because the test only counted kills, not the stage at the
  kill — "pump never pops at 4" still popped at 5. Ledger tests must pin the
  exact number, not "it happened".
- Another mutant survived on unreachable code: the sim's ghost-hook guard is
  defense-in-depth (harpoons stop at dirt anyway), so no test can reach it.
  Replaced with a reachable deflate mutant; the redundancy is documented.
- Testbeds die mid-check: a round-restart reset the dirt the test had cleared.
  Rig tests pin enemies and re-apply surgery every tick.
- A worktree squatting on `main` (`retrogames-forge-arkanoid`) broke rule-5's
  local git step after merge (remote merge succeeded). Detached it — main must
  stay free in EVERY worktree.

## Queue (game-queue)
- #235, #236, #237, #239, #241 remain. Oldest is #235 BUBBLE BOBBLE.
- QA lane: #253 (DIG DUG polish: pilot robustness, sprite animation, sound)
  plus existing feedback items.

## Three questions for Jon
1. DIG DUG rounds end at a fixed kill roster (8/10/12) then the game ends —
   the cabinet is endless. Want endless + rolling difficulty, or is a
   three-round set with a win screen right for this arcade?
2. Rock crush pays more at depth AND for crowds — correct multiplier shape
   (300 x (layer+1) x n) is my invention since I couldn't trust memory for
   the 1982 table. Keep, or match a documented table?
3. The pilot loses lives on the two non-losing spawn rotations in rounds 2-3.
   Fix via rollout planner (polish issue #253), or accept a partial-strength
   attract demo until then?

## Housekeeping
- Worktree `~/Dev/retrogames-forge-digdug` on branch `state-2026-10-14b`
  (this STATE update). `retrogames-forge-arkanoid` detached off `main`.
- Main checkout refreshed to detached origin/main.
- Previous STATE parked at /tmp/forge/STATE.parked.md (superseded, questions
  answered by shipped work).
