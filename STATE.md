# STATE — forge board snapshot (slot b, 2026-11-26 — PAC-MAN arcade progression SHIPPED `791132c`)

## This session (slot b)
- TARGET #3630 REFUSED at claim (slot a live, 16 min) → normal ladder: steer 0 ·
  `next` #1712 waiting-jon (skip #605) · game-queue empty · feedback-borrow
  blocked (QA mini + studio live) → flagship stage spent → honest never-dry pick.
- **Weakest-stage audit:** `idle-kick` answered `KICK CENTIPEDE 0 weak` but 3 of
  Centipede's 5 "gaps" are struck-through shipped work (`~~…~~ #NNNN:`) —
  `parseGaps` has NO `~~` filter (same phantom class #3553 fixed for Restored).
  Honest scores tie six titles at 2; registry order picks **PAC-MAN** gap 0.
  Filed + claimed **#3661**; filed **#3672** to fix the `~~` filter properly
  (with pins) so future kicks stop counting shipped work.
- **SHIPPED #3661 → PR #3669 (`791132c`): arcade progression.**
  Score-stage ladder 0/700/2000/5000 (pac 0.15→0.178, ghosts ×1→×1.2 — the
  80/75→95/90 % table); tunnel-mouth crawl (row 14 x≤9/x≥18, house NOT a
  tunnel, laws sourced Wikipedia §Gameplay, rates pinned per #3631 tradition);
  round-keyed fruit (cherry 100→key 5000, bell/key cycle r11+, six original
  `drawFruit` sprites + arcade fruit-as-round HUD icon); energizer decays
  600→120 per round, no fright at all ≥ r14. Round counter human-start→1,
  cleared maze→+1; report carries `{round,stage}`; DebugKit Next round /
  Round→14 / Score→5000. Round 1 <700 outside tunnels **byte-identical**.
- Proof: pacmancheck **102/0** (+30 §progression), `--mutant` **31/31 dead**
  (+10; one survived first pass — bare `round++` regex eaten by my own DebugKit
  button — tightened to pin the incrementer inside resetGame), new alias
  **pacprogressiondrive 12/12** real Chrome (probe↔HUD-pixel match cherry→
  galaxian→key, real keys eat, r1/s0 restart, 0 errors), eslint + lint:mario/
  fps/ai + build green. New DEV hook `window.__pacTest.probe()` (MC pattern).
- Filed **#3667** `QA — PAC-MAN: arcade-progression polish + intermission briefs`
  (feedback): intermissions (gap-0's remaining feature), per-kind eat jingle,
  stage-lift tell, tunnel audio, phone legibility, watch-horizon check.

## BOARD facts at close
- main GREEN at `791132c`. building: **#3630** (slot a — saucers+smart bombs
  shipped, 2P alternating remains). building-qa: #3645 (DEMO TIDE POOL).
  game-queue: empty. Rule-4 satisfied (game code merged #3669).
- idle-kick at close answered `KICK MISSILE COMMAND 0 weak` — but #3630's
  building title names MissileCommand, so MC is held: a held-dir leak worth a
  lane-check look (or the title-match normalize misses `—`). Do not chase
  from a free slot; the real MC work item #3630 needs slot a's context.
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335
  (QA, due Nov 27 14:14Z), #3516 (Arkanoid art, Nov 28).

## PLAYABLE on main right now
- PAC-MAN — the maze speeds up as you score, ghosts crawl the tunnels, the HUD
  fruit marks the round (key pays 5000), and round 14 kills the energizer:
  https://jalfern.com/retrogames/pacman
- MISSILE COMMAND — smart bombs + center-silo speed (slot a). CENTIPEDE garden
  revival (#3664). DK span-body law (#3657).

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session —
  no new jonq asks, every call was measured, none of taste).

## Next claims (for whoever is free)
1. game-queue is empty; feedback #3667 (PAC-MAN polish) and #2971/#3244 are
   QA's unless a lane goes reverse per #1258. #3672 (`~~` filter fix) is a
   clean small harness fix — good fit for any lane between games.
2. #3630's 2P-alternating stage stays slot a's (context lives there).
3. #3615 (DK finale polish) still QA's first grab when #3657's follow-ups clear.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-pac-progression DONE (#3669 merged; safe to
  prune — node_modules is a symlink into the main checkout).
- Main checkout detached at origin/main; STATE.md parks with
  `statepark.mjs park b`; docs PR carries it to main.
