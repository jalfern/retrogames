# STATE — forge board snapshot (slot b, 2026-11-26 — ROGUE gets its Amulet, and main got healed first)

## This session — red-main fix, TARGET yield, then never-dry SHIP
- **Red main (kick warning #601) outranked everything.** Nightly 45875546378 red
  with one cause: tapstartcheck PONG (centre tap dead post-#3575). Owned issue
  #3584 existed; claimed it, root-caused: the RANGE thumb-zone spans `left:'50%'`
  and the 3:4 cabinet puts the canvas centre INSIDE the dial band — the exact
  tapstart tap died on the button's stopPropagation; the shell's #430 any-tap
  skips `closest('button')`. Fix: dial zones become label columns (GAME 4–46%,
  RANGE 54–96%), switch bank never covers the field centre.
  **SHIPPED #3584 → PR #3589 (`984c262`)** via the red-main-fix precedent
  (#2957/#3208: forge-merge's main-ok refuses by design while red → direct
  squash once static green → dispatch refresh). Prod verified (`left:"54%"`);
  refresh run **45902410013 went GREEN** — freeze lifted before session end.
- TARGET #3571 (LUNAR LANDER pad latch) **REFUSED at claim** — studio holds it
  live (9 min at kick). Yielded, per precedent.
- Ladder: steer 0 · `next` #1712 is waiting-jon (skip, #605) · game-queue 0 ·
  feedback-borrow blocked (QA MASTER live) · flagship stage spent → NEVER-DRY
  honest `idle-kick` = **KICK ROGUE 0 weak** (score 5 = 3 unowned README gaps
  + 2 QA items naming ROGUE; Pong/Asteroids/LunarLander held). Verified
  ownership first: gap 0 (Amulet) is not #3588's list.
- **SHIPPED #3592 → PR #3593 (`0f7b3ea`): the Amulet of Yendor.** One goal
  object on monster level 20 — the cart's depth, unlowered: gold `%`, never the
  start ring/stairs/item/monster/trap cell, BFS-reachable every seed.
  Pickup `,` = you-win terminal: `you have found the Amulet of Yendor!!`,
  ✦ YOU WIN ✦ card, ascending sting, gold + dlvl×50. Shallow dice untouched —
  roguecheck pins dlvl-1 dungeon+stream against **goldens captured from
  origin/main's sim.js**. WATCH-brain hunts it at depth; `?dlvl=N` QA pin.
- Proof: roguecheck **160/0** (+10 §amulet) · can-fail: pickup-branch mutant →
  2 red, restored · roguedrive **28/28** (real-key guide win at turn 410, DOM
  reads YOU WIN/Amulet/Final Score, zero page errors) · eslint + lint:rogue/
  mario/fps/ai + build green. Honest depth pinned both ways: six seeds win,
  two die en route (killer named) — fidelity beats provability, proved anyway.

## BOARD facts at close
- **main GREEN at `0f7b3ea`** (nightly 45902410013 success) · game-queue 0 ·
  building 0 · building-qa: #3571/#3576/#3568 (studio) · new feedback: **#3601**
  (ROGUE polish: amulet pack-name `?`, find-bloom, glyph shimmer, dlvl-20
  ambience) · #3588 (ROGUE trap sound pass) still open.
- Rule-4 satisfied twice: game code merged as #3589 AND #3593.

## PLAYABLE on main right now
- ROGUE — down to dlvl 20, the Amulet glows gold, and the pickup WINS:
  https://jalfern.com/retrogames/rogue
- PONG tap-starts again on phones + RANGE dial. SPACE INVADERS machine-step
  march. ASTEROIDS learning saucers. DEFENDER hot-seat 2P.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, Nov 27).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions (all calls were measured law/harness, none of taste).

## Next claims (for whoever is free)
1. #3601 items 1–2 are quick honest wins (pack naming + find-bloom) — but they
   are feedback: QA lane's first grab unless idle.
2. Honest `idle-kick` next; if it names shipped history, mark CLOSED per the
   README-phantom rule, don't build.
3. DONKEY KONG barrels-mid-air-over-ladders — still the smaller real fix.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktrees ~/Dev/retrogames-forge-pong-tapstart and …-forge-rogue-amulet DONE
  (both merged; safe to prune next session). Main checkout re-pinned detached at
  origin/main.
- STATE.md ships via this docs PR and parks with `statepark.mjs park b`.
