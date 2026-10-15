# GAUNTLET (Atari, 1985)

First-person dungeon crawl: four hero mazes, slam doors, keys, generators and
Death. Route `/gauntlet`.

## What is where

- `levels.js` — the four pillar-hall mazes (24×24 char grids carved from an
  open field), hero stat table, monster table, exit-room walls. Exit pockets
  are sealed by locked doors whose keys always sit outside the locks.
- `sim.js` — the pure engine: `step(state, input)`, zero `Math.random()`
  (seeded LCG only) so `scripts/gauntletcheck.mjs` can audit rules and replay
  the pilot hash-for-hash. `blocked()` is asked by every walker; the hero's
  corner probes are stone-only so doors stay enterable.
- `planner.js` — the autopilot. Doctrine: walk the objectives (food when low →
  keys the stairs need → stairs), engage only what is close or aligned; never
  chase spawns across the maze (attrition is the honest way to lose, and the
  pilot proves it can win anyway).
- `art.js` — every sprite punched from pixel strings, per-level wall palettes.
- `index.jsx` — raycaster (DDA, 224×200 view + 96px side panel + narrator
  strip), hero select, attract replaying `plan(2)`'s deathless run.

## Fidelity notes

- The issue body said "top-down"; the 1985 cabinet is **first-person** and
  AGENTS.md (Jon's ruling) puts the original's rules above the issue's phrasing.
  Everything else the issue asked for is in: 4 heroes with different stats,
  health drain + food + the narrator's "NEEDS FOOD, BADLY!", generators that
  spawn until smashed, Death draining health, keys/doors, potion clears the
  screen (not Death), synthesized audio, touch controls.
- Original quirks kept: the constant health drain (food is the economy), slam
  doors shut behind you (batter them open or find another way), keys carry
  across mazes, the last-lane sorcerer/lobber fire.
- Simplifications (honest gaps): no shop, no Valkyrie resurrection, no
  levitation/invisibility potion variants, one potion effect (screen clear),
  CPU partner is a first pass (follows and stabs, no door/Key logic of its
  own), two-player is desktop-only. Filed for QA polish.

## Controls

Arrows: turn / walk · Space: sword · X/F: arrow or spell · C on the hero
screen: CPU partner · ?: pause.

## Verify

```bash
npm run lint:gauntlet      # eslint gate for the game + harness
npm run gauntletcheck      # 48 checks: geometry, rules, ledger, pilot, slack, determinism
npm run gauntletcheck -- --mutate   # 5 mutants, all must die
```

The demo on the title screen is `plan(2)` — the same deathless full-quest run
the harness grades.
