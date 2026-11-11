# STATE — Forge session 225 (slot a) — 2026-11-11

## Shipped this session
**DONKEY KONG seats the WATCH rollout — batch 27** (#1637, PR #2015, merged as 7d17133).
- `src/games/DonkeyKong/sim.js` (new): whole-tick engine lifted out of index.jsx and
  determinised (seeded `rnd(gs)` replaces Math.random everywhere). 30/30 seeds reach the
  top; the old agent won ~13% and died.
- Arcade driver `watchStep` in sim.js: one 90-tick rollout of the real sim scores
  move-and-timed-jump candidate sequences. Doctrine in the file header: jumps only
  compete when a barrel is near (a kangaroo could hop the tower; the original never did),
  retreat gates the mount, and the progress term is height-monotone so a mid-ladder rung
  can never outrank a finished exit. Result: it zigzags the girders under live fire,
  waits at mouths, climbs at the first gap, without touching one barrel.
- `index.jsx` rewritten as the b26-pattern shell (WATCH pill, no-touch toast, attract ▶
  WATCH via a silent pilot, bail hands back with an explanation, `__dkTest.seat()`).
  Registry WATCH_HELP line: "the route zigzags the girders, arcs the barrels, and never
  touches one". Live screenshot verified mid-climb.
- `scripts/kongcheck.mjs` (new, aliased `kongcheck`, parked in MANUAL_CHECKS): 51 rules
  — contract, determinism (byte-equal replay), 24-seed ladder sim (all bank a lap;
  zero-death floor 22, median lap 518), driver pins (kangaroo gate, no ladder-hang, mount
  wait, no-touch, lap bounds), seat pins, 17 mutants that all die.
- `watchcheck.mjs`: donkeykong live pilot (271/271) + batch-27 source pins; whole suite
  green. feedbackcheck migrated to the sim layout; contractcheck 724/724 green.
- #2018 filed: `QA — DONKEY KONG: polish pass` (hammer power-up — attract promises
  "HAMMERS SMASH BARRELS" and no hammer exists; the 25m rivet stage; oil-drum flame;
  spawn cadence; missing tones; sprite stride; plus the do-not-change pins).
- **Unfroze main**: nightly red was the nightlybot soak roster missing FROGGER (#1986)
  and ASTEROIDS (#2000) — the #1525 drift shape. Fixed on main directly (a9bce01, 2
  lines; nightlybotcheck 40/40 + boredom order-parity verified locally — the #601 freeze
  otherwise self-deadlocks), re-triggered the nightly; #2015 then merged through the
  rule-5 loop (jalfern, 15:52Z).

## Playable now
https://jalfern.com/retrogames/donkeykong — press Y and watch Mario climb the whole tower.

## Notes for the next session
- **When contractGames grows, scripts/nightlybot.mjs GAMES must grow at the same position
  in the same commit** — the nightly selftest reddens main otherwise (that froze every
  lane this week). boredomcheck compares ORDERS; nightlybotcheck proves sets.
- b27 progress: 67 pilots in watchcheck (Frogger b25, Asteroids b26, DonkeyKong b27).
  Real unseated registry gaps found at session end: **mario-classic, pacman, centipede,
  pitfall, missilecommand, viper-pit, britannia, fire-crew** (+ DOS/IF tier).
  mario/ironkeep/raccoon-heist were read as seated via spine agents/replays — verify
  that reading before claiming. Arcade route-proofs come next; probability-shaped titles
  would need a Jon question once the clean-arcade tier is exhausted.
- Kongcheck sweep is ~30 s seeded-deterministic; `KONG_SWEEP=fast` trims it for mutants.
  Touch sim.js → run `npm run kongcheck`; the replay + zero-death pins catch
  nondeterminism immediately.

## Open questions
(none — all decisions this session were pattern-following; no jonq filed)
