# ROGUE (1980 — Eglit/Upl, the ur-dungeon)

The dungeon crawl that started the genre: 80x22 ASCII rooms and corridors,
bump-to-attack melee with d20 to-hit and dice damage, sixteen monsters from
kestrel to dragon, unidentified potions-by-colour and scrolls-by-nonsense-
title, a hunger clock that goes full → hungry → weak → faint, and the green
status bar (`Dlvl Gold Hp Str Arm Exp`). Stairs `%` descend forever; the
Dungeons of Doom keep whatever you bring them.

## Engine

- `sim.js` — the whole game as pure functions (batch-13 template): dungeon
  generation, combat, monster AI, hunger, item actions, the reducer, and
  `buildGrid` for the drawn view. Zero `Math.random`, zero `Date.now`.
- **Seed-param port (#1473, batch 14).** One mulberry32 stream (gameContract
  `seedRng`'s algorithm) feeds every roll — layout, item dice, monster rosters,
  d20 combat, faint bites, the potion-colour and scroll-title ciphers. The
  stream position **travels inside the state** (`randState`), restored and
  banked by `stepGame` at every reducer entry/exit — two worlds alive at once
  provably cannot interleave entropy (roguecheck proves byte-identical replays
  with junk worlds running between the steps). This is the port's signature:
  classic reducers share a module-global RNG, and a harness replaying two
  same-seed worlds interleaved gets *different* worlds. Rogue carries its dice.
- Seeds regenerate at every human start honoring `?seed=N` (`freshSeed()` in
  index.jsx, DonkeyKong/batch-8 precedent); the production report is
  `{tick, score, done, seed, dungeon, hp}` — `tick` is the **turn count**, and
  `score` = gold + dlvl×50 (the terminal tally), live while playing.
- Monster ids are `dlvl*1000 + i` (gen) and `-1 - turn` (create-monster
  spawns) — deterministic, collision-free, no wall clock in the replay.
- `buildGrid` lives in sim.js so the harness fingerprints the drawn grid
  against logical state (@ placement, explored `%` draws as `%`, visible
  monster letters, blindness greying the @).

## Verify

```bash
npm run roguecheck        # 68 checks: boot+purity, determinism (incl.
                         # interleaved replays), BFS stairs-reachability on 40
                         # seeds, combat/xp/hunger/descend/pickup/wield/eat/
                         # quaff/scroll rules, the door mechanic (closed
                         # blocks, bump opens, hidden ⊂ doors, search +
                         # stumble reveal, monsters vs doors), both terminals,
                         # BFS autopilot wins (20/20 reach dlvl 2, ≥15 reach
                         # dlvl 4), draw-vs-logic, rng bounds, and the #1502
                         # audibility gate (hit/kill/die/descend/quaff/door
                         # fx all asserted in the sim)
npm run feedbackcheck    # seedpin law + floor (Rogue = title 45)
```

Mutant proof: flipping the descend guard in `handleDescend` (`!== '%'` →
`=== '%'`) turns roguecheck red on 4 checks incl. winnability 20/20 → 0/20.
Collapsing the search-reveal radius in `handleSearch` kills 3 door checks
(reveal / drawn `+` / door-found fx). Restore → green.

## Walls are solid — the glyph grammar (#1833)

First-play QA found the newcomer's fatal surprise: `MOVE` blocked only `' '`,
and room walls shared the corridor's `'#'` glyph — so walls were walkable stone
and rooms looked sealed (exits only visible after accidental wall-walks). The
port now speaks the original's glyph grammar:

- `'-'` / `'|'` = room walls (solid; corners take `'|'`), `'#'` = corridors,
  `'.'` = room floor, `'+'` = closed door, `"'"` = open jamb, `'%'` = stairs.
- Walls block EVERYONE: hero MOVE, confused moves, monster chase and wander
  all ask `blocksMove(c)` (`sim.js`, exported).
- Corridors PIERCE the walls they cross (`digH/digV` turn crossed `'-'/|'`
  into `'#'`), so rooms are connected through real openings. Door placement
  scans solid (`'#' || isWall`) runs, keeping every seed's door spots identical
  to the pre-#1833 layout (the RNG stream is untouched).
- An opened door leaves a walkable jamb `"'"` (was `'#'`), brighter amber than
  the corridor; walls draw `#999` lit / `#555` in dim memory vs the corridor's
  `#666/#444` — the exit always reads at a glance.
- The welcome message states the goal (stairs % + descend), the `?` legend
  separates Wall from Corridor, and the shell footer opts out of `/rogue`
  (it floated mid-screen over the short map — the #1221 pattern).
- Gates: roguecheck's structure BFS and autopilot BFS block walls too — the
  winnability proof walks the REAL map now — plus a 40-seed perimeter gate and
  a bump-the-wall gate (mutant: revert the MOVE block → exactly 1 red).

## Doors and sound (#1502)
- **Doors are a mechanic, not art.** Corridor gaps get one closed door each;
  every room wall hides one more (top/bottom middle, never on a corridor
  path). Both are pure functions of the dug layout — zero new rolls, so the
  entropy stream and every seeded dungeon are untouched. A closed door blocks
  hero and monsters; bumping it opens it (one turn, no move, it stays open,
  1980 rule). An unfound hidden door draws as wall and is walkable —
  creatures know their own doors (1980 rule); the hero finds one by `s`
  SEARCH (the 3x3 around him; found doors stand closed until bumped) or by
  stumbling into the cell, which swings it open under his feet.
- **The dungeon is loud.** The sim records every audible moment in
  `state.fx` (hit, kill, hurt, die+killer, levelup, quaff, eat, gold,
  descend, door-open, door-found); index.jsx drains it into
  `audioController` synth (Emberwood #1512 pattern). roguecheck's
  audibility gate asserts the sim fires them — a silent build goes red.
  The death screen names the killer ("Killed by a dragon").

## Honest gaps (vs the 1980 original)

- No ranged combat: wands `/`, rings `=` and thrown missiles are named in the
  legend but never generated; ammo (`!`) potions cover the spell slot loosely.
- Monsters never flee, and `moved` bookkeeping is per-frame rather than the
  original's per-monster energy (fast/ slow creature races).
- No traps at all: search finds hidden doors, but the original's trap floor
  (no rings of warning, no trap SPIRIT) is absent.
- No Amulet of Yendor win condition: the original's goal object and "you win"
  terminal don't exist; descending forever + the QUIT score tally is the loop.
  (Win/lose semantics: dlvl≥2 reached on every seed, death terminal proven;
  "won" here = the descent, not the amulet.)
- Level-up is xp-table + hp gain only — no class-based gain rolls, no hit dice
  display, no intelligence/charisma/wisdom spread (str only, per the port).
- Food is the only light-source clock; no lamp/oil and torch-lit radius.

RETRO bar: pure green-phosphor monospace look, original ASCII symbol set and
the classic message line voice ("You feel much better!", "Welcome to level 4!").
