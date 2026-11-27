# STATE — forge board snapshot (slot a, 2026-11-27 — MISSILE COMMAND three-button law SHIPPED `6012c2f`)

## This session (slot a)
- TARGET #3676 REFUSED at claim (slot b live, 25 min) — b's FROGGER duel merged
  `30ca7c3`/PR #3684 and b closed it out itself. Normal ladder: steer 0 · `next`
  #1712 waiting-jon (skip #605) · game-queue empty · feedback-borrow blocked (QA
  mini + studio live) → flagship stage spent → honest never-dry pick.
- **Weakest-stage audit:** `idle-kick` answered `KICK MISSILE COMMAND 0 weak`
  (score 7 = 5 unowned README gaps + 2 QA issues naming it; held dirs Frogger,
  Sonar — MC freed when #3630 closed with #3682). MC's five gaps verified: zero
  `~~`-phantoms (Centipede/Pac-Man still inflate — #3670 owns that filter).
- **Gap 0 disposition (the kick target):** arcade game-number table (games 18–34
  dial values) is fidelity-**BLOCKED** — structure sourced (manual §6), per-number
  values live only in the original's service chart, outside the network boundary;
  README now marks it BLOCKED with reason so future kicks decline, not re-audit.
  Full derivation on #3695.
- **SHIPPED gap 1 → filed+claimed #3695 → PR #3699 (`6012c2f`): the arcade
  three-button law, exposed.** Wikipedia §Gameplay verbatim ("one of three buttons
  … from the appropriate battery"). Keys `1`/`2`/`3` fire LEFT/CENTER/RIGHT at the
  live crosshair from ANY sector — key 2 = the fast battery everywhere, the expert's
  smart-bomb answer (manual §6). Phones: pad B wears **FAST** (registry pad,
  dispatches `KeyB`; attract 2 keeps meaning two-player). Duds stay duds (dead or
  empty named battery spends nothing, never reroutes). Hot-seat: battery keys obey
  the Space duty guard. HUD teaches 1/2/3 per battery + cyan FAST tell on center
  while smart bombs are live; attract line added. Mouse keeps the nearest-battery
  law, Space keeps crosshair fire — solo/hot-seat proofs byte-identical.
- Proof: missilecmdcheck **126/0** (§threobutton 14 + 5 wiring pins), `--mutant`
  **35/35 dead** (+3: key-falls-back-to-click / spends-neighbour / dead-reroutes),
  new alias **mcbatterydrive 13/13** real Chrome (KeyB spends center-only; key 2
  from LEFT sector flies 400 at 28 px/tick at the gate; mouse still nearest; duty
  guard 30→30; 0 page errors), eslint + lint:mario/fps/ai + build green.
  New `__mcTest.probe` fields: `origins`, `silosAmmo`, `smartWave`.
- Filed **#3707** `QA — MISSILE COMMAND: three-button polish pass` (feedback):
  human-P2 battery buttons, bonus-city 10k rule, phone legibility of the key
  numbers, per-battery launch audio, gap-4 arcs **needs re-sourcing before any
  build** (README's arc claim contradicts the free-aim sources), battery launch
  flash teaching.
- Drive-script lesson (kept honest): a `hasTouch` page context machine-gunned
  shells through the pad's tap-to-start machinery (11 shells on one tap);
  after three probes the drive presses the dispatched KEY and pins the pad
  declaration by regex — vpadcheck owns button→code wiring shelf-wide.

## BOARD facts at close
- main GREEN at `a8442f2`. building: **#3706** (ASTEROIDS kiting — another lane).
  building-qa: #3702 (ROGUE polish). game-queue: empty. Rule-4 satisfied
  (game code merged, #3699).
- After my merge, lanes landed frogger bonus-frog (#3704) and the ORRERY demo
  (#3701); slot b close-out f4c221f says ROGUE life-dice shipped (`7d74c29`).
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335 (QA,
  due Nov 27 14:14Z), #3516 (Arkanoid art, Nov 28). None mine — no new asks;
  every call this session was measured or doctrine-documented.

## PLAYABLE on main right now
- MISSILE COMMAND — `1 2 3` fire each battery from anywhere, key 2 (or the phone
  FAST button) is the fast center answer to smart bombs, the board teaches the
  keys and glows FAST when it matters: https://jalfern.com/retrogames/missilecommand
- FROGGER duel + bonus frog (#3684/#3692). ROGUE life dice (#3700). PAC-MAN
  ladder (#3661). ORRERY demo (#3701).

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. game-queue empty; #3707 (MC polish) and #3667 (PAC-MAN polish) are QA's unless
   a lane goes reverse per #1258; #3706 is held.
2. MC gap 2 (bonus city at 10k, auto-deploy reserve) is rule-sized builder work
   when #3707 gets triaged — Wikipedia §Gameplay carries the rule verbatim.
3. #3670 (`~~` phantom filter) still a clean small harness fix between games.

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-3button DONE (#3699 merged; safe to prune —
  node_modules is a symlink into the main checkout).
- Main checkout detached at origin/main; this STATE parks with
  `statepark.mjs park a`; the docs PR carries it to main.
