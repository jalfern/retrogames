# STATE — forge board snapshot (slot a, 2026-11-27 — MISSILE COMMAND ferries SHIPPED `0a1ff75`)

## This session (slot a)
- TARGET #3622 (DK mid-air ladders) REFUSED at claim — slot b live on it (and
  shipped it during my session as #3627). Normal ladder: steer 0 · `next` #1712
  waiting-jon (skip #605) · game-queue 0 · feedback-borrow blocked (QA MASTER
  live on mini) → flagship stage spent → honest `idle-kick` =
  **KICK MISSILE COMMAND 0 weak** (score 0 = no QA feedback names it + 4
  unowned README gaps, oldest-title tiebreak).
- Filed #3629 + claimed: gap-1's saucer slice. Gap 1 bundled three features
  (smart-silo split, 2P alternating, saucers) — took the saucer, filed the
  rest as **#3630** so the board shows what remains.
- **SHIPPED #3629 → PR #3635 (`0a1ff75`): cruise saucers from wave 6.**
  Seeded ferry (one guaranteed/wave ≥ 6, +1 every 3 waves), crosses y 120–200,
  launches REAL warheads (same physics → gunner doctrine covers them unchanged),
  any fireball + hull = burn for **125** (Atari 1981 manual Table 1) + wreck
  blast; wave can't clear while a ferry is owed/crossing. gunnerStep takes a
  bonus shot only with the warhead sky fully covered and a quarter-crossing in.
  RNG untouched below wave 6 → waves 1..5 **byte-identical** (recorded-trace
  pins in missilecmdcheck §gate).
- Proof: missilecmdcheck **49/0** (+16 §saucers), `--mutant` **12/12 dead**
  (gate/score/clear-hold new), **mcsaucerdrive 8/8** real Chrome (live wave-1
  negative probe AND pixels, probe↔sprite match, real mouse+Space +125),
  watchcheck missilecommand **322/322**. eslint + lint:mario/fps/ai + build green.
- New alias `mcsaucerdrive`. Sources in README: Wikipedia arcade article +
  archive.org Atari 1981 manual §2/§5/§6/Table 1 (fandom/strategywiki 403;
  2600 manual is the fetchable Atari-text source — its cruise rules match the
  arcade's later-wave exotic).
- Filed **#3638** `QA — MISSILE COMMAND: cruise saucers polish` (feedback):
  phone legibility, sound mix, watch feel waves 6–10 (unproven arithmetic),
  kill juice, attract ad of the ferry.

## BOARD facts at close
- main GREEN at `c727ff7` (nightly success; slot b shipped DK corner pair
  #3627 mid-session). building: empty. building-qa: #3632, #3633 (CENTIPEDE
  slices). game-queue: **#3630** (MC gap-1 rest). idle-kick now lands on
  MC gap 0 — #3630's ownsGap match is imperfect; whoever claims game-queue
  takes #3630 (it IS that gap, minus the shipped saucer line).
- Rule-4 satisfied: game code merged as #3635.

## PLAYABLE on main right now
- MISSILE COMMAND — wave 6+ now sends a satellite ferry across the sky; shoot
  it for 125, its warheads are real: https://jalfern.com/retrogames/missilecommand
- DONKEY KONG corner-pair ladders (#3627) + half-rungs. CENTIPEDE speed ladder.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3244 — (AWAITING, Nov 27). #2971 — contra polish. #1712 — PLAICRAFT S2.
- No new jonq questions this session (all calls measured, none of taste).

## Next claims (for whoever is free)
1. game-queue #3630 (MC smart-bomb evasion + 2P alternating; needs the
   center-battery speed rule — README gap 4 too).
2. Remaining MC honest gaps after #3630: bonus city every 10,000 (manual §5 —
   fully sourced: reserve, end-of-wave deploy, jingle) — the next-strongest
   cheap stage; then field-of-fire arcs per battery.
3. #3615 (DK finale polish) stays QA's first grab.

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-saucers DONE (#3635 merged; safe to
  prune — node_modules there is a symlink into the main checkout).
- Main checkout detached at origin/main; STATE.md ships via this docs PR and
  parks with `statepark.mjs park a`.
