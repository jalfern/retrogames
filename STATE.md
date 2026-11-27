# STATE — forge board snapshot (slot b, 2026-11-27 — FROGGER duel + tell + time bonus SHIPPED `30ca7c3`)

## This session (slot b)
- TARGET #3630 REFUSED at claim (slot a live, DESIGN posted minutes earlier —
  its `building` label leaked again, the #3110-class shape: claim comment live,
  label events stale). Normal ladder: steer 0 · `next` #1712 waiting-jon
  (skip #605) · game-queue otherwise empty · feedback-borrow blocked (QA
  studio + mini live) → flagship stage spent (`flagshipStage` null) → honest
  never-dry pick.
- **Weakest-stage audit:** idle-kick answered `KICK MISSILE COMMAND 0 weak`
  (the #3630 label-leak phantom). Recomputed with #3630 as building and the
  #3672 phantom corrections: Centipede raw 5 → honest 2 (3 bullets struck with
  `~~`), Pong's lone gap is `**DISCLAIMER:**`-with-colon — the filter regex
  wants no colon — honest 0, Pinball gap 0 annotated `OPEN (#3336 item 2)`
  (owned). **FROGGER 3 stands — highest honest.** Filed + claimed **#3676**.
- **SHIPPED #3676 → PR #3684 (`30ca7c3`).** `2` at attract/game-over opens
  the alternating duel (Wikipedia §Gameplay): P1 until out → P2 takes the
  SAME board (homes persist), 3 frogs, full clock; dual-score HUD, active seat
  bright; verdict WINS/DRAW. Row-entry tell: a surviving hop to a new row
  freezes field + clock `ROW_FREEZE=18` ticks, frog spins, rising bleep —
  human seats only: watchStep's dt law stays exact so #2869/#1776 certified
  sweeps run byte-unchanged (harness check pins it). Home pays §Scoring's
  unused-time bonus (10 per ½ s). Event honesty fix: filled nest now reports
  `died:'wall'` (was `home` — jingle over a splat).
- Proof: froggercheck **61/0** (+21 duel&tell), new mutants **6/6 dead**
  (via new `--mutant-only` slice flag; full 19-board ran on branch head,
  verdicts regenerated for the new six), manual break of the handoff gate
  went exactly red (4 duel checks), new alias **froggerdueldrive 10/10**
  real Chrome (Enter=1P, ArrowUp freeze observed, 2=duel, forced P1-out →
  P2 seat, 0-0 DRAW, key restart, 0 page errors). eslint + lint gates +
  build green; rebased over main's metroid/pacman QA (package.json alias
  collision, trivial).
- Filed **#3692** `QA — FROGGER: duel polish + lady frog, bonus life, original
  tunes` (feedback): §Gameplay lady frog (+200 ride-home), 20k bonus frog +
  99,990 rollover, Inu no Omawarisan/US tunes synthesized, off-screen
  carry-off splat, driver turtle-lane re-measure, duel HUD seat identity +
  phone legibility.

## BOARD facts at close
- main GREEN at `30ca7c3`. game-queue: empty after #3676 closed. #3630's
  state belongs to slot a (its building-label leak keeps idle-kick answering
  MC — the leak itself is the same #3110 family; a harness fix issue for
  label-leak-on-claim would save every free slot ~1 mis-kick/session: worth
  someone's lane-check).
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335
  (QA, due Nov 27 14:14Z), #3516 (Arkanoid art, Nov 28).

## PLAYABLE on main right now
- FROGGER — press 2 for the alternating duel; the field holds its breath on
  every new row; homes pay the arcade's time bonus:
  https://jalfern.com/retrogames/frogger
- PAC-MAN — arcade progression + the #3678/#3679 QA lifts. MISSILE COMMAND —
  2P alternating (#3630, slot a) if it lands tonight.

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session —
  every call was measured, none of taste).

## Next claims (for whoever is free)
1. game-queue empty; feedback #3692 (FROGGER polish) and #3667/#3665/#3662
   are QA's unless a lane goes reverse per #1258. #3672 (`~~` filter fix) is
   still open — a clean small harness fix for any lane between games; it also
   now has company: the DISCLAIMER-colon variant found this session belongs
   in the same fix.
2. #3630's remaining stages stay slot a's (context lives there).
3. The claim label-leak (`building` missing though the claim comment is live,
   twice observed) deserves its own lane:forge issue before it causes a real
   double-dispatch.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-frogger-duo DONE (#3684 merged; safe to
  prune — node_modules is a symlink into the main checkout).
- Main checkout detached at origin/main; STATE.md parks with
  `statepark.mjs park b`; docs PR carries it to main.
