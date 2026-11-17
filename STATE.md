# STATE — session 317 slot a close-out

## Shipped this session
- **PR #2553 → retrogames `34adc13` — LODE RUNNER-LITE #2550: THE VAULT zero-death
  witness.** Never-dry rung (#1571): ladder empty, live QA owned all feedback,
  flagshipStage null; `weakestStage` scored LodeRunnerLite 1 (its only open README
  gap: THE VAULT's witness spent a life). Game fix (`levels.js`, vault 3 only): the
  far nugget hangs at the rope's end (x20, was floor x24) and the guard posts at x18
  (was x15 mid-corridor) — the crossing is now the rope, the one highway a walker
  can't enter. Witness: **win, lives 3/3, t124** (was 2 lives, t116); vaults 1–2
  untouched, determinism unchanged, all construction contracts + strata law green.
  Harness: shelf-wide **CLEAN-WITNESS gate** (no attract witness may spend a life) +
  design-law pin (exactly one walk-row nugget in THE VAULT). Mutant: guard→x15
  restores the corridor → both new gates red; restored → **136/136 plain, 164/164
  --mutate**. lodeplay 52/52 live (:5173); lint:lode/fps/ai + build green. Prod
  verified (chunk `index-DSnNocPJ.js` carries guard@18/gold@20); #2550 auto-closed
  via `Closes` ref, `shipped` label applied, live URL commented.
  Same PR fixed a pre-existing lodeplay 5b flake (grey-ladder sample clamped to the
  walk row when the runner's climb drifted; anchor is the rung span 6–14).
- **TARGET #2546 (warden) — REFUSED at claim, correctly:** slot b held it (29 min
  fresh), shipped the FloorBoss aisle law itself (`3318a05`, #2549) and did its own
  close-out + STATE (#2552). This lane did NOT duplicate its paperwork.

## Next queued
- `game-queue` empty at close. `next` = **#1711** (lane:platform — machine side
  closed, ONLY Jon's clap take remains, do NOT claim to re-confirm; note stands).
- Fall through to flagship/idle — **recompute with `idle.mjs`, never from memory**:
  this session consumed LodeRunnerLite's last gap (README now all-CLOSED), so the
  shelf map moved; live QA masters own `feedback` (3 were running).

## Open questions (issues, not here — #605)
- None filed this lane. Lane-foreign: **#2529** (lane:research, AWAITING, deadline
  2026-11-19T00:01Z, default A) gates #2516, not this lane's work.

## Catches for the next session (each cost probes this shift)
- **`$?` after `cmd | tail` is TAIL's exit — again.** A lint gate "passed" through a
  pipe while eslint had actually died on a missing package. Unpipe, check `$?`.
- **Fresh lane worktrees have no `node_modules`.** Symlink the main checkout's
  (`ln -s /Users/jon/Dev/retrogames/node_modules <worktree>/node_modules`) — lockfile
  matches; a full `npm ci` is minutes you don't spend. Create the link IN the
  worktree (a chained `cd` put one inside the main checkout's node_modules once).
- **Orphan dev servers squat port 5173.** A merged session's vite (PPID 1, 404 at
  root, cwd = a finished worktree) blocked my strictPort start; `lsof -nP
  -iTCP:5173 -sTCP:LISTEN` + ancestry, confirm PPID 1 + merged branch, then kill.
  Zombie debris on YOUR port is fair game; other lanes' ports never are.
- **Prod verification by marker, not hash:** lazy chunks are `./index-*.js` refs in
  the main bundle — fetch and grep the game chunk for a code marker (mine:
  `18:"G"`) instead of watching the index hash.
- A PR body's `Closes #n` auto-closes at squash-merge; a later explicit
  `gh issue close` just says "already closed" — harmless, labels still apply.

## Lanes clean
- Main checkout detached at origin/main; STATE.md written + `statepark.mjs park a`
  (`/tmp/forge/STATE.a.parked.md` + shared path). STATE commit goes to main via
  PR (game merged this session, so STATE is committable — same shape as #2552).
- Worktree `~/Dev/retrogames-forge-lode-vault3-nolife` re-detached at origin/main,
  reusable. My :5173 dev server stopped at close-out; other lanes' ports untouched.
