# STATE — session 182 (2026-11-07, slot b)

## What shipped
**WATCH batch 10 — the solver-script family: PR #1835 (Part of #1637), squash `3ce939a`, LIVE** at /retrogames/zelda · /lemmings · /momentum · /papers-please. Four titles whose attract already replayed a harness-proven script now seat that driver mid-run on Y; coverage 43 → **47** titles.
- ZELDA: planner.js decides live (dodge→fight→phase-walk); `plan.done()` hands back with the falling blip. LEMMINGS-LITE: clone live board (damage included) → solve() → replay cmds at their stamps (determinism = lemcheck's identical-hash law); declines when the oracle sees no path; pill docks bottom-right above the skill panel. MOMENTUM RUNNER: planRun() on a live clone (loopsTaken copied — stricter than PROGNOSIS); clean-win plans only. PAPERS PLEASE-MIN: autopilot() on a structuredClone; honest decline when the week can't be survived.
- Harness: 4 watchcheck pilots (prover-only signals: idle never moves/swings, never assigns, coasts to stop, never stamps); tripwires phonecheck 37→47, pillcheck 40→47; pillcheck generalized for bottom-anchored right pills. **Mutant:** Papers drive off → exactly the 2 prover gates red (145/147), restore green.
- Gates: full watchcheck **475/475**; zeldacheck 29, lemcheck 115, runnercheck 319, paperscheck 6495; watchphonecheck 349, watchpillcheck 160, attractcheck 694; eslint+mario/fps/ai+build.

## The phase law (the lesson of the session)
Momentum drones sweep on ABSOLUTE ticks: greedy planRun from spawn dies at a patrol at ~1/3 of start phases (tick 72 ok, 73 declines, 74 ok; reproduced node == browser). Seat declines honestly there; pilot retries every 200 ms (decline-runs ≤2 ticks). Waiting-seat (prove "stand k ticks, then go") filed as **#1828** (feedback, QA lane) — removing the pilot retries is its regression test.
**Second lesson:** vite's watcher can MISS a write in this sandbox (served stale transform; the papers mutant looked invisible). When a browser result contradicts the disk: curl the transformed module URL, compare; if stale, restart the dev server. (AGENTS "unmoving frame" family.)

## Board this session
- #1637 stays open + `building` (multi-stage; batch 11 next). Filed **#1828** (QA: momentum waiting-seat).
- Local contractcheck dies at tempest here ([--single-process Chrome #1622 family], NOT in CI; exposeGame surface untouched by b10 — advisory, evidence posted on #1835).

## Next queued (slot b)
1. #1637 batch 11: Adventure (`solve`), Defender/Pacman attract-brains — check each for a *reactive proven* driver first (SpaceInvaders-style verdict if scripted-only).
2. Ladder otherwise: halt → steer/next → game-queue (check emptiness) → feedback borrow only if no `QA MASTER` running (pgrep broken; use `ps ax | grep`) → flagshipStage → weakestStage.

## Open questions
- #1730 (waiting-jon, lane:games) — R2 bucket + relay deploy; default hold (deadline 11-08T19:10Z).

## Notes for the next slot-b session
- Dev server on **5178** (this worktree `~/Dev/retrogames-forge-watch-rollout-b10`, node_modules symlinked). After merge, re-detach: `git checkout --detach origin/main`. Vite watcher misses writes here — restart the server after big edits, verify via curl when in doubt.
- `nohup` broken in sandbox; `(cmd >log 2>&1 &)` works for background servers. pgrep broken; `gh` shim quirks as session 181 noted.
- Seat contract template (this batch): watching useState+ref; seat = clone → prove → store script; stamp-rule apply in the sim tick (`cmd.tick === gs.tick + 1` for lemmings); release at finish/start/pause-adjacent; hooks watching/watchSfx on the game's __xTest; phonecheck needs attract button within 400 chars below `screen === 'attract'`.
- STATE commit to main legal (game merged): push on top of the squash SHA.
