# STATE — forge session 2026-10-14 (3rd) — MARBLE MADNESS SHIPPED

## Shipped
- **MARBLE MADNESS** (#236) merged as PR #264 (squash `40739f5`).
  Prod verified: `https://jalfern.com/retrogames/marble-madness` → 200,
  bundle `index-BkMx7sxt.js` contains it. Labels: `shipped`.
  CI on main: `completed success`. Smoke was flaky on the PR run
  (Missile Battle step — unrelated, advisory per rule 3); it passed clean on
  the main push. `static` green both times.

## What the game is
Atari 1984 iso trackball classic, complete: six races (Practice, Beginner,
Intermediate, Aerial, Silly reversed-gravity, Ultimate), carrying clock that
banks by race weight, full hazard roster (steelie knock, acid/green slinkies,
munchers, swinging hammers, wave-floor hurl), attract replaying a scripted
six-race win, drag-anywhere trackball on phones, all art/audio synthesized.
Files: `src/games/MarbleMadness/{sim,levels,planner,index}.js(x)` + README.
Gate: `npm run lint:marble` + `npm run marblecheck` (new CI static steps);
`npm run marbleplay` is the advisory browser drive.

## The engine lesson (see the game README, it's written there in full)
The BFS's `stepOk` promised Δz≤1 steps as walkable, but the original
`acc: 0.0011` against `slopeK: 0.004` made every Δz≥1 ramp physically
unclimbable — the autopilot froze at a slope base, and the real player would
too. `acc` is now 0.005 so the graph and the force agree. Two more pilot
truths worth reusing: the achievable push directions are the sim's 8
`screenToWorld` octants (an anisotropic screen projection is NOT the inverse
and flips the lateral sign at lips), and brake rays must be bisected —
0.25-quantized detection lands *past* the stopping distance.

## Queue (game-queue)
- #237 GAUNTLET, #239 SmashTV, #241 Out Run, #245 Lunar Lander, #246
  Tempest, #258 Bubble Bobble polish.
- Fresh QA: #265 QA — MARBLE MADNESS polish pass (art, music, fidelity).

## Three questions for Jon
1. Marble Madness physics is now trackball-strong (`acc` 0.005) so Δz=1
   slopes are climbable — that was required for the graph to be truthful, but
   it makes the marble accelerate hard in a straight line. Want a lower top
   speed (`maxV` 0.24 → ~0.18) to trade climb authority for less "skatey"
   straights?
2. The scripted attract run takes 5 lives across the six races. Is a
   dying-but-finishing demo acceptable (shows the hazards honestly), or
   should I spend a session grinding a deathless pilot line to replay?
3. Steelie post radius is capped at 9 tiles with 1-step climbs, so the
   arcade's wide-roaming steelies aren't represented. Keep the tame cap (it
   keeps the courses winnable by the harness pilot), or widen it and accept a
   harder pilot problem?

## Housekeeping
- Main checkout is detached at `origin/main` (`40739f5`); clean.
- Lane worktree `~/Dev/retrogames-forge-marble-madness` still holds
  `forge/marble-madness` — PR merged + branch deleted on origin, so that
  worktree is done; `git worktree remove` it (needs `--force`, the local
  branch is now behind/at the squash).
- Other stale worktrees from prior sessions are listed in `git worktree
  list` (arkanoid, bobubble, digdug, kart, papers, qa-*, tetris, zelda,
  simcity, noder) — several look finished. Worth a prune pass; I left them
  alone to avoid touching lanes that may still be live.
- My merge command `gh pr checks --watch --fail-fast && gh pr merge` was
  piped through `tail`, which swallowed `--fail-fast`'s exit code — the
  merge proceeded while `smoke` was red on that run. Only `static` gates
  merges (rule 3) and `static` was green, but the pipeline should be split
  so `--fail-fast` can actually stop the chain. FORGE.md step 7 shows the
  command un-piped; that's correct — the piping was my addition, not the
  playbook's.
