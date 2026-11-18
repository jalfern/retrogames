# STATE — session 340 slot b close-out

## Shipped this session
- **FLOOR BOSS: DUCK & PASS — carts yield-and-pass into bays — PR #2698
  merged `c407f09`** (#2692, never-dry rung; `idle-kick` answered
  `KICK FLOOR BOSS 0 weak` at `12c9ed0`).
  A cart nose-blocked by a *rival* for YIELD_WAIT ticks reads the rival's
  facing and slips into the perpendicular arm bay (N before S, W before E —
  pulling off *along* the route costs the cart its place, so only
  perpendicular shoulders), holds until the BFS route reopens, resumes with a
  courtesy chirp + cyan traffic ring (duck costs 14 energy — never free).
  Racks and broken rivals are never ducked for; jam law still owns everything
  else; YIELD_MAX=60 falls back to the jam law, YIELD_CD=24 anti-oscillation.
  **YIELD_WAIT=4 by measurement:** swept 4/6/8/12 on 15 seeds — 12 fires zero
  (autopilot repaths shallow blocks; the freeze is the no-route stall, so the
  law triggers on the stall with an adjacent rival too), 4 wins 14/15, avg
  1425 vs 1420, jams 0, seed 42 recovers 1323→1408. Unmanaged floors
  bit-identical to main. Cadence 4/60/24 pinned in a gate; per-bot `Y` +
  tally `DK` joined stateHash (#1373); cyan reserved as traffic livery
  (#1407 palette law). floorbosscheck 307→324 (+17 §YIELD, killed
  `--mutate-duck`); browser legs prove the ring pixels and a staged duel
  (rig clears live `pickT` residue first); seed 1337 @6404 (16,3) arm-bay
  crush is the §YIELD rig. README gap struck, honest residual: swept volumes
  through corners stay faked.

## Claims / board
- TARGET #2689 (warden): claim REFUSED — slot a alive and shipped it mid-shift
  (#2691 `50dcf8f` Homebody wings). Ladder after: steer empty; `next` #1711
  skipped (store dry, line 3 hardware-gated by jonq #2652 AWAITING — re-sweep
  = spin); game-queue empty; feedback #2688/#2690 held by a LIVE QA MASTER
  session → no borrow. Flagship stage spent → never-dry: `KICK FLOOR BOSS 0
  weak`. Filed #2692 + why-weakest, claimed, shipped.
- #2700 filed (`feedback`): FloorBoss QA polish pass (ring readability at
  speed, dual-duck corner choreography, yield chirp mix). QA lane's job (#1745).

## Next queued
- Re-derive at new main: `node scripts/idle-kick.mjs` (do NOT trust this
  line; it said NONE at `c407f09`). FloorBoss surviving gap: swept volumes
  through corners (README bullet).
- #1711 unchanged wait-state (jonq #2652, deadline Nov 20 01:36Z).

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon, deadline Nov 20 01:36Z) — phone
  clap take vs waiver for #1711 line 3; default keeps waiting.

## Catches for the next session (each cost probes this shift)
- **A trigger-gate must count fires first.** The first yield law keyed on the
  blocked-step alone and measured ZERO duck events — autopilot repaths defeat
  shallow blocks. Stall forensics (which states actually freeze, on the same
  seeds the gates use) before choosing the trigger; a passing unit rig can
  still be dead code in the live loop.
- **Browser rigs inherit live crew state** — a duel rig must clear `pickT`
  before staging, else the cart is mid-task and never enters the hold branch.
- **Dashed-ring pixel checks:** ≥8 sample angles and relaxed alpha (0.5–0.85
  band, dash gaps) — a 4-point sampler flakes on rotation.
- **node `fetch` to jalfern.com gets proxied and times out in this
  environment; curl works.** Prod-verify = curl loop over entry-chunk asset
  list, grep a minification-STABLE literal (`'BAY: '`); query-string busting
  doesn't beat edge staleness (~20 min). Unquoted `?` URLs also glob-break in
  zsh — quote them.
- **Vite recreates `node_modules/.vite` after you delete it** — stop the dev
  server BEFORE removing a worktree, or `worktree remove` half-succeeds and
  leaves an orphan dir (kill needs its own approval; ask early).
- floorbossplay duel/servo pixel legs flake 1–4/run on loaded boxes — advisory;
  rerun once, note, move on (#601 doctrine).

## RULE 4
Game code merged this session (#2698, `src/games/FloorBoss/`), rule 4 intact;
STATE.md committed to main per rule-step-9 exception.

## Lanes clean
- Main checkout detached at `origin/main` (`c407f09`); this STATE commit rides
  the merge (game shipped — rule-step-9 exception).
- Worktree `retrogames-forge-floorboss-yield` removed after merge + prune.
  :5178 vite dev server was still running at close (kill denied by sandbox
  approval) — harmless, serves a deleted dir; next lane can reuse 5178.
