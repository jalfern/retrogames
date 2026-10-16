# GAUNTLET (Atari, 1985) — overhead

The real cabinet view: a scrolling top-down camera above four pillar-hall
mazes. 8-way stick, swarms from generators, slam/locked doors, food economy,
potions, keys, stairs, and Death when the timer dies. Route `/gauntlet`.
The first-person sibling lives at `/four-halls` (FOUR HALLS) on the SAME engine.

## What is where

- `levels.js` / `sim.js` / `planner.js` / `art.js` / `sound.js` — the shared,
  camera-agnostic engine (FOUR HALLS imports these from here). `step()` takes
  a mode from `opts.topDown`:
  - **first-person (default)** — left/right turn, fwd/back along the facing.
  - **overhead (`topDown: true`)** — each arrow sets facing AND moves (8-way);
    a blocked diagonal slides along the free axis; doors, slam, keys, arrow
    and Death rules are the same code paths. `inp.aim` is the pilot lane: the
    autopilot points absolutely (a player does this with the stick), then
    travels down the barrel it is looking through.
- `index.jsx` — the overhead renderer: camera follows the hero (clamped to the
  level), raised wall blocks with mortar + drop shadow, two-tone floor grain,
  slam/locked/broken door faces, glowing stairs, sprites punched at runtime,
  facing-dagger + sword-arc sweep, vignette and scanlines, side panel (mini
  map, portrait, health, keys/gold), narrator strip, hero select, CPU partner
  toggle (`C`), attract replaying `plan(2, {topDown:true})`'s proven run.
- `minimap.js` — the pure half of the map panel (issue #275 item 8): the
  shared camera (`viewRect`, used by the view AND the map so "seen" can't
  drift from the screen), the beasts the view shows (`mapMonsters`), and the
  stairs' key-pulse (`stairsPulse`). drawPanel renders exactly its decisions;
  gauntletcheck proves them in plain Node.

## Fidelity notes

- The issue body asked for top-down — and the 1985 cabinet IS top-down; the
  previous first-person build keeps every rule it had and now ships under
  FOUR HALLS with the issue's HUD fixes (see `../FourHalls/README.md`).
- Kept from the original: overhead scroll that follows the hero, 8-way
  movement where facing follows the stick, arrows fire down the facing, the
  four heroes (stats differ), constant health drain + food + the narrator's
  "NEEDS FOOD, BADLY!", slam doors sealing behind you (sword-batter opens
   them), locked doors eating keys that carry between mazes, generators that
   wind up with a visible pulse + flash (issue #275 item 3) before belching the
   level roster, until smashed, potion clearing every roamer but not
  Death, Death walking in on the treasure timer and draining point by point,
  stairs up ending each world and the fourth ending the quest.
- Simplifications (honest gaps): no shop, no Valkyrie resurrection, one potion
  effect (screen clear), no fire/water/bomb item variants, CPU partner follows
  and stabs but has no door/key logic of its own, two-player is desktop-only,
  monster swarm caps follow the level roster rather than the cabinet's screen
  limits, wall tiles are uniform blocks rather than the original's themed
  per-world textures. Filed as a QA polish pass.

## Controls

Arrows / the stick: move 8-way (facing follows) · Space / A: sword at what you
face · X / F / B: arrow down the facing · C on the hero screen: CPU partner ·
?: pause.

## Verify

```bash
npm run lint:gauntlet               # eslint gate for both games + harness
npm run gauntletcheck             # 91 checks: geometry, art, sound, minimap,
                                   # generators (the wind-up), rules, overhead
                                   # mode, ledger, pilot, slack, determinism
npm run gauntletcheck -- --mutate # 9 mutants, all must die
npm run gauntletplay              # advisory browser drive (needs npm run dev)
```

The attract demo is `plan(2, {topDown:true})` — the same deathless full-quest
run the harness grades.
