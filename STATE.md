# STATE — forge board snapshot (slot a, 2026-11-27 — MISSILE COMMAND 2P hot-seat SHIPPED `93e9a37`)

## This session (slot a)
- TARGET #3630 accepted at claim (already slot a's; slice 1 smart bombs had
  shipped as `038a986`/#3656). This session shipped the final stage.
- **SHIPPED #3630 → PR #3682 (`93e9a37`): two-player alternating (manual §6,
  games 18–34).** Wave-alternating seats (P1 odd, P2 even), SHARED cities/silos
  (your burns cost your partner — the strategy core), dual-score HUD with the
  on-duty line blinking, per-seat credits (warhead 25 / ferry 125 / wave bonus
  all route through `addScore`), winner + A DRAW on THE END, mode keys `1`/`2`
  persist across restarts + attract tap button for phones, CPU seat default on
  the certified `gunnerStep` (8 seeds, zero cities lost on a P2 wave), human P2
  = WASD+F joins mid-run ("PLAYER 2 JOINED", CPU yields), off-duty P1 inputs
  spend nothing, watch solo-only, hand-off jingle + PLAYER N card. Solo byte
  parity: dice-free flip, score2 only moves in 2P, 5000-tick trace equal.
  BONUS fix: arrow/pad aim actually moves the crosshair now (registry promised
  it since the port; the keys were dead).
- Proof: missilecmdcheck **107/0** (+24 §2player, +9 wiring), `--mutant`
  **32/32 dead** (+8), new alias **mc2pdrive 15/15** real Chrome (real 2/keys/
  mouse; HUD both-books pixels; CPU wave p2=1700 w/ 6 cities; arrow aim
  495→657; join + human F; 0 errors), attractcheck 694/0, lint gates + eslint
  + build green. Two harness self-inflicted wounds found and fixed mid-run: an
  unguarded waveEnd loop hung the wave-break mutant (now bounded); the ferry-
  score mutant anchor pointed at the line my refactor moved (retargeted).
- Filed **#3689** `QA — MISSILE COMMAND: hot-seat polish pass` (feedback):
  score typography/blink legibility, per-seat audio identity, JOINED card size,
  rematch hint on THE END, watch-hint vs 2P tidy, game-number-table note.

## BOARD facts at close
- main GREEN at `93e9a37`. building: **#3676** (slot b — FROGGER 2P alternating
  + row-entry feel; saw their mutant run live in frogger-duo). building-qa:
  #3688 (SONAR art), #3647 (DEMO ORRERY). game-queue: empty.
  Rule-4 satisfied (game code merged #3682).
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335 (QA,
  due Nov 27 14:14Z), #3516 (Arkanoid art, Nov 28).

## PLAYABLE on main right now
- MISSILE COMMAND — press 2 at the title: waves alternate P1/CPU, both books on
  the HUD, the CPU holds its wave untouched, and a WASD friend can seize seat 2
  mid-raid: https://jalfern.com/retrogames/missilecommand (bundle
  index-Cwg1I6i7.js)
- PAC-MAN — score-stage ladder, tunnel crawl, round-keyed fruit:
  https://jalfern.com/retrogames/pacman

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session —
  no new jonq asks; every call was measured or spec-pinned, none of taste).

## Next claims (for whoever is free)
1. game-queue empty; feedback #3689 (MC hot-seat) and #3667 (PAC-MAN) are QA's
   unless a lane goes reverse per #1258. #3670/#3672 (`~~` parseGaps filter fix)
   is a clean small harness fix between games.
2. #3615 (DK finale polish) still QA's first grab when #3657's follow-ups clear.

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-two-player DONE (#3682 merged; safe to
  prune — node_modules is a symlink into the main checkout).
- Main checkout detached at origin/main; STATE.md parked with
  `statepark.mjs park a`; docs PR carries it to main.
