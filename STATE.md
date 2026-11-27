# STATE — forge board snapshot (slot a, 2026-11-27 — CENTIPEDE's garden bites, shipped `29d4458`)

## This session (slot a) — never-dry rung, one game, shipped
- TARGET #3706 REFUSED at claim (slot b live, 84 min < 90 min window — the
  liveness namespace working exactly as built; b shipped it as `50f73b4`).
  Normal ladder: no steer, `next` #1712 is waiting-jon, queue empty, QA
  sessions live (borrow blocked), flagship stage spent (every flagship gap
  CLOSED/BLOCKED/owned) → NEVER-DRY: `weakestStage` scored CENTIPEDE 5,
  next title 4. Three of the five were `~~shipped~~` phantoms (#3670 shape);
  the oldest genuine gap was bug-vs-bug. Filed #3726 with why-weakest,
  claimed, shipped: **the menagerie bites** (PR #3728).
- Laws (pinned spec — the arcade's exact bug-vs-bug frames are unwitnessed):
  spider devours segments (lunch pays 0, leaves no mushroom, chain re-heads,
  rear takes the #3631 boost, one chew/tick); scorpion stings segments
  red-fast via the caps' venom law. Dice-free — `?seed=N` bit-exact.
- Proof: centipedechek **183/0**, **41/41 mutants die**; centipedadrive
  **27/27** real Chrome (2 bites banked live 10→8 = bites, heads 1→2,
  score 0→0, sting raced, zero page errors); eslint + lint:mario/fps/ai/
  centipede + build green. Advisory `smoke` red once — rerun per rule 3.
- **Harness fact paid (#8.8 lesson): the mutant walk caught a pin collision.**
  My new bite loop re-implemented the split-boost line verbatim; the old
  full-src pin `state.centipedes[j].spd = splitSpd(...)` then matched EITHER
  loop, so the 'cuts never accelerate' mutant survived (39/40). Fix: scope
  pins to their own loop body (`hitSeg`-anchored regex), and mortalise the
  new loop with its own mutant. Two identical laws = two scoped pins.
- **Harness fact paid: DEV witnesses don't ship.** `__cTest`/`exposeGame`
  are DEV-only, so grepping the prod bundle for `stingSeg`/`devour` can
  never verify a ship — poll the hash (`C2e-szns`→`BGVulaco`), check the
  Vercel check on the merge sha, and treat the at-head browser drive as the
  live proof. I lost 8 min of polling to the wrong string.
- Filed #3733 (`QA — CENTIPEDE: polish pass`, feedback): bite/sting lack
  visual tells; natural bites rare in waves 1–3 (rollout banked 0); kill-pop
  debris grammar is the remaining README look gap.

## BOARD facts at close
- main GREEN at `8ad170a`. building: #3698 (MC fairness — QA lane).
  game-queue: empty. shipped this shift: #3706 (b), #3726 (a), plus mini
  QA #3689/#3707 rides (`66c5339`, `8ad170a`).
- Rule 4 satisfied (game code merged this slot, #3728). Shift report pushed.
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335,
  #3516. None mine.

## PLAYABLE on main right now
- CENTIPEDE — the garden is an ecosystem: the spider chews the column (kill
  it with timing or let the menagerie halve it for free — but bug-kills pay
  nothing), and the scorpion's path races segments red before they reach you:
  https://jalfern.com/retrogames/centipede
- ASTEROIDS kiting bounty dance (#3706), MC knot doctrine + HUD tell
  (#3711/#3727), FROGGER duel-seat (#3721), ROGUE cart laws (#3710).

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. game-queue empty; #3698 is QA's. Fresh feedback: #3733 (CENTIPEDE bite/
   sting tells) is the newest builder-adjacent item — QA's by lane law.
2. If never-dry fires again: CENTIPEDE's remaining owned-note is the kill-pop
   debris gap; #3670 (`~~` phantom filter in `parseGaps`) stays the cleanest
   small harness job — three phantom gaps on CENTIPEDE alone this week.
3. Weakest after this ship (from today's scoring): PAC-MAN 4 (gaps 3 named 1),
   FROGGER/PINBALL 2.

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-centipede-bite detached at origin/main
  (#3728 merged); parked with `statepark.mjs park a`; docs PR carries here.
