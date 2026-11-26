# STATE — forge board snapshot (slot a, 2026-11-26 — PONG RANGE knob SHIPPED `5ab9b66`; polish #3576 filed)

## This session (slot a)
- TARGET #3553 REFUSED at claim (slot b held it — it shipped later today as #3559,
  ASTEROIDS saucer curve). Normal ladder: steer/next/game-queue empty (#1712 is
  waiting-jon, skipped per #605); feedback-borrow blocked (live QA mini + studio)
  → flagship stage: all six flagships' README gaps owned/closed → #1571 never-dry:
  `weakestStage` (live issues) picked **PONG**, score 4 (2 unowned README gaps +
  2 body-named), held dirs Asteroids/Adventure/SpaceInvaders skipped.
- Filed + claimed **#3565** (POLISH — PONG: selectable max-score knob). Shipped:
  a `RANGE` dial on the attract switch bank — `FREE · 1 · 3 · 5 · 7 · 9`, ↑/↓ keys
  + right-half thumb zone + `?range=` pin. The cap binds IN THE SIM: reaching N is
  an honest terminal (`ev.winner`, no dead re-serve, no extra dice); FREE is the
  untouched b16 play-to-quit default — every pre-existing pin replays verbatim.
  Honest framing (issue design note + README): the 1972 RANGE switch was the
  Easy/Difficult *speed* control (already the #3502 tiers) — this dial is a
  cabinet-native FEATURE, not a claimed restoration.
- Harness: pongcheck §range — range-3 sweep 40/40 wins ending at exactly 3, pinned
  5 conceded, zero dead serves; range-1 closes on the first point (20 seeds); FREE
  uncapped at 4000 ticks; seed+range replay determinism; 3 range mutants die; the
  scatter mutant re-armed after the scoring-branch restructure; +280px audit width
  keeps the clip mutant honest after the prompt trim (`PRESS ANY KEY TO START` now
  matches the two-dial truth). pongdrive leg 9 (dial keys, thumb, honest cap win
  with ascending sting, restart with target standing, pin) — 47/47 + 5/5 chip
  mutants. Local: pongcheck 172/0, attractcheck 694/0, lint gates + build green.
- Ship: PR #3575 squash-merged `5ab9b66`. One `static` red (my 30-char attract
  line vs the shared 28-char law) — genuine fix within the one-PR budget, trimmed,
  green. #3565 shipped+closed; prod verified (`index-Z-PXDI8s.js` carries
  `SELECT RANGE`). Polish pass filed: **#3576** (feedback).

## BOARD facts at close
- building: #3573 (INVADERS discrete-step march — slot b LIVE). building-qa:
  #3568 (ASTEROIDS), #3564 (ADVENTURE). game-queue empty · steer empty.
- feedback open: #3576 (PONG, mine), #3572/#3571 (LUNAR LANDER, lane:qa),
  #3244 + #2971 (waiting-jon).
- Main GREEN at `5ab9b66` (my merge; `main-ok`: latest nightly is
  cancelled-conclusion, not a failure). #3554 (nightly red, needs-approval) is the
  warden's, not a builder item.
- Rule-4 satisfied: game code merged today (`8490932`, `85f3b61`, `5ab9b66`).

## PLAYABLE on prod right now
- PONG — turn the RANGE dial; pick a number and first to it wins honestly:
  https://jalfern.com/retrogames/pong
- ASTEROIDS saucer learning curve, ADVENTURE seam law, PONG cabinet voice,
  DEFENDER wall veto, INVADERS flowing pilot.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27; PINBALL gate).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (no taste calls).

## Slot state at handoff
- Main checkout detached at `origin/main` (`5ab9b66`). Slot-a dev server (:5173)
  stopped via `scripts/devstop.sh` at close. `forge-pong-range` worktree pruned
  post-merge (clean).
- :5178 = slot b LIVE (#3573), :5174 = QA mini, :5176 = QA studio — do not stop.

## Next claims (for whoever is free)
1. Ladder is empty → never-dry again. Re-run `idle.mjs` LIVE, don't trust this
   note: PONG's gaps are now self-handled (its README gap 0 carries CLOSED-by),
   and #3576 makes PONG QA-owned. Fresh `weakestStage` will point elsewhere
   (Centipede / MissileCommand / Rogue / DonkeyKong all carry 4 unowned gaps;
   registry order breaks ties). #2910 note: body-named scores from OTHER lanes'
   polish passes still inflate picks — ownership is what matters.
2. QA lanes: #3576 (PONG polish) joins #3568 + #3564 on the board.
3. When jonq answers land (#3335 Nov 27, #3516 Nov 28), execute at the next claim.
