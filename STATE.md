# STATE — forge board snapshot (slot b, 2026-11-27 — DK corner pair lands: barrels take ladders mid-air)

## This session — TARGET #3622 accepted and SHIPPED
- TARGET #3622 (DK mid-air barrel ladder-take) taken at claim — the geometry
  slice split out of #3618. #3618 itself shipped half-rungs in slot a (#3625)
  while this branch built; the two DK mechanics coexist (rebased cleanly).
- Shipped **PR #3627 (`5bb797d`)**: girder-end ladder pair at x=222 — R1
  (girder 2→1) with its foot DANGLING into girder 1's end-gap, R2 (girder
  1→ground) braced off the corner below it. A falling barrel crossing a
  ladder span rolls one BARREL_DIVE_CHANCE; `takenBits` = one roll and one
  ride per barrel per ladder (the loop #3618 warned about can't happen).
  R2 is `barrelOnly` — mouth hangs past girder 1's end; runner/attract
  refuse it, kongcheck pins that.
- ROOT CAUSE found en route: edge check `!onPlat && vy===0` could never fire
  — gravity beats it to vy>0 the tick support is lost. No airborne barrel
  state existed AT ALL in the shipped sim (that's why #3618 traced zero
  crossings). Fixed to `vy >= 0`; the exact mid-air floors in kongcheck
  would catch the regression (mutant-proved: reverting zeroes them, red).
- Proof: kongcheck **122/0** incl. new §corner pair — parked-runner stream,
  exact floors: 4 mid-air takes (2 onto R2), 1 landed R1 board, 3 dangling
  exits, 0 retakes, 0 stuck; 24-seed WATCH sweep unchanged (seat centres
  stay ≤185, never touches the corner). Hand-mutants: falling-fix revert →
  aerial floors red; takenBits removal → `double=3` red. Restored green.
  kongdrive **14/14** real Chrome, zero page errors.
- CI note: `static` never received the pull_request event for this ref
  (#3269 twice — before AND after the rebase push). `gh workflow run ci.yml
  --ref` + the check-runs-API fallback did the merge both times.
- Prod verified: live bundle `index-CE3jLvq3.js` contains `takenBits`; live
  URL commented on #3622, label shipped, issue CLOSED.
- **Filed #3641 `QA — DONKEY KONG: polish pass (corner pair)`** — mid-air/
  foot-drop sound grammar, double-board rule decide-or-retire, left-column
  symmetry check, brace legibility on phones, ride wobble.
- Rule-4 satisfied: game code merged (`5bb797d`).

## BOARD facts at close
- main `970eeea` (IronKeep attract art landed after mine) · building: #3629
  (MISSILE COMMAND cruise saucers, other lane) · game-queue: #3630 (MC
  smart-bomb evasion + two-player, gap 1 rest) · building-qa: #3632/#3633
  (CENTIPEDE splits) · new feedback: #3641.
- Slot b dev server :5178 stopped via `scripts/devstop.sh` at close.

## PLAYABLE on main right now
- DONKEY KONG — miss the dive, catch the outside ladder on the way down;
  broken ladders hang you over the break line: https://jalfern.com/retrogames/donkeykong
- CENTIPEDE menagerie. TEMPEST depth hoops. ROGUE Amulet win. PONG tap-start.

## Open questions (links only — #605)
- #3516 — Arkanoid art rung (AWAITING, Nov 28). #3335 — QA music-bus
  low-pass (AWAITING, Nov 27). #3244 — TIDAL RUSH tilt-muffle; #2971 —
  contra polish; #1712 — PLAICRAFT S2. Nothing new evaporated (park read
  matched my report).
- No new jonq questions this session (all calls were measured/fidelity law).

## Next claims (for whoever is free)
1. #3630 is the one game-queue item (MISSILE COMMAND gap 1 rest) — take it
   normally; it likely assumes #3629's saucers landed first, check its body.
2. DK remaining honest gaps (README): double-board drop onto a span, left
   fall-gap column (if the trace says the arcade carried it) — #3641 holds
   the sound/legibility half for QA.
3. #3629's lane: if it goes red on static, the same dropped-event workaround
   applies (`gh workflow run ci.yml --ref` + API fallback in forge-merge).

## Slot state at handoff
- Worktree ~/Dev/retrogames-forge-dk-fallgap-ladders — merged + clean;
  detached at origin/main (`5bb797d`→`970eeea`), remote branch gone.
  Prunable at next cleanup (kongcheck artifacts absent — plain clean tree).
- Main checkout ~/Dev/retrogames detached at origin/main.
- STATE.md committed via docs PR (game merged this session, so allowed) and
  parked with `statepark.mjs park b`.
