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
npm run roguecheck        # 116 checks: boot+purity, determinism (incl.
                         # interleaved replays), BFS stairs-reachability on 40
                         # seeds, combat/xp/hunger/descend/pickup/wield/eat/
                         # quaff/scroll rules, the door mechanic (closed
                         # blocks, bump opens, hidden ⊂ doors, search +
                         # stumble reveal, monsters vs doors), both terminals,
                         # BFS autopilot wins (20/20 reach dlvl 2, ≥15 reach
                         # dlvl 4), draw-vs-logic, rng bounds, the #1502
                         # audibility gate (hit/kill/die/descend/quaff/door
                         # fx all asserted in the sim), the #3491 ranged
                         # gates (generation, ray physics vs wall/door/body,
                         # xp-through-grantExp, charge spend + crumble, arrow
                         # spend/salvage/stack, aim flow, interleaved ranged
                         # replay, grid draws /, pilot stays melee), and the
                         # #3509 mobility laws (speed table, clock arithmetic
                         # x1.0/x1.5/x0.75, carry rule, wounded flee +
                         # quarter-hp boundary, cornered-fights, snake bites
                         # then flees, bump-skip accrual, hash coverage)
npm run roguedrive       # real Chrome, real keys only (#3491/#3509): walk onto
                         # a quiver, f → menu → direction, one arrow spent, the
                         # miss lies east to salvage, help teaches f; the mobility
                         # leg scans seeds for a route whose laws fire, replays it
                         # with real keys to hash-equality, and watches a snake
                         # bite-then-flee in the browser — 18/18
npm run feedbackcheck    # seedpin law + floor (Rogue = title 45)
npm run watchcheck -- --only rogue    # the WATCH pilot + batch-23 source pins
```

Mutant proof: flipping the descend guard in `handleDescend` (`!== '%'` →
`=== '%'`) turns roguecheck red on 4 checks incl. winnability 20/20 → 0/20.
Collapsing the search-reveal radius in `handleSearch` kills 3 door checks
(reveal / drawn `+` / door-found fx). Restore → green. #3491 planted four:
shot passes through bodies (3 red), charge never spent (2), salvage dropped
(4), arrows wieldable (1). Restore → green.

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

## WATCH (#1637 batch 23) — the Y key seats the BFS crawler

`watchStep(state)` in sim.js is roguecheck §6's proven autopilot lifted INTO
the game: standing on `%` descends; an adjacent monster gets the bump-attack;
otherwise the first step of the 8-dir BFS to the stairs; no route -> null and
the seat releases honestly (never fakes progress). Because it reads only the
state it is handed, Y seats at ANY live position, a steer hands back from
exactly there, and Y re-seats and re-plans from where the player stopped —
reactive, not a recording. The seat is turn-based: one reducer action per
140 ms on its own interval (no frame clock to race; the reducer owns the RNG
stream, so the seat consumes no more entropy than the same moves typed).

- Collision to know: lowercase `y` was the 1980 NW key. The shared Y/WATCH
  contract wins (one key in every pilot); NW lives on numpad `7` and the
  D-pad. `Y` never seats on a menu/help/death screen.
- Witness: roguecheck §6 descends 20/20 seeds with this same route (dlvl 4
  on >=15/20, food slack >=500 without eating); the watchcheck pilot advances
  the REAL dungeon untouched and re-seats after takeover.
- No attract screen — the dungeon boots straight into play, so the pill sits
  on live ground from the first frame (named in watchphonecheck SKIP_ATTRACT).

## Mobility (#3509) — energy clocks and the flee law

Monsters no longer march in lockstep with the hero. Each creature carries an
`energy` pool; every hero turn it accrues `speed` quanta (quarter units,
`MONSTER_ENERGY = 4` per action) and every full threshold buys one action —
a step toward the hero, a bite, a wander, or a flee. The remainder carries,
so ×1.5 races (kestrel, bat, centaur, leprechaun, jabberwock) pattern
step-double-step-step-… and ×0.75 races (troll, medusa) skip one turn in
four. The monster bumped by the hero accrues but spends its step on the
counterattack already resolved (no double-tap for free).

An awake monster that SEES the hero and is wounded — hp ≤ ¼ of its max —
turns and runs: the DIRS8-ordered step maximising Manhattan distance, ties
broken by the fixed order (determinism, not dice). Fleeing is for good. A
cornered one (no step increases distance) fights — a rat with its back to
the rock still bites. The snake has its own law: once it bites you it flees
for good, healthy or not (`bitten`, set in `monsterAttack`).

The speed column and the ¼-hp threshold are documented approximations of the
1980 per-race energy constants (which the cart never published), the same
honesty class as the staff-damage bands above. What the law *is* — fast
races act more often, wounded things run — is the original's, and roguecheck
§8 measures the arithmetic (4/6/3 steps per 4 hero turns) rather than
trusting the table.

## Honest gaps (vs the 1980 original)

- **CLOSED by #3491:** ranged combat. Staves `/` generate with 3–9 charges
  (lightning/fire/cold/striking, the cart's four-shots flavour); arrows are a
  counted quiver on the original's single weapon/missile glyph `)`. `f` picks
  the missile, then a direction answers (arrows refuse the `w` sword hand).
  A shot walks the line, stopped by rock, walls, closed doors — and the first
  body; hidden doors pass, the same 1980 law the creatures live by. d20 to-hit
  with steady-hand +2 (no strength at range), the item's damage dice, xp and
  level-ups booked through `grantExp` like melee. One arrow spent per throw,
  a miss leaves the bundle on the flight line to salvage, quivers stack, and
  a staff crumbles with its last charge. What stays honestly open: rings `=`
  still never generate, staves carry no unidentified-name cipher (scrolls and
  potions have one), and the original's exact per-level staff damage tables
  are approximated by the four dice bands above.
- **CLOSED by #3509:** monster mobility. Per-monster energy clocks (fast
  races double-step, slow ones skip turns — roguecheck §8 measures the
  arithmetic), the wounded flee law (hp ≤ ¼ max, flees when seen, flees for
  good, cornered rats fight), and the snake's bite-then-flee. What stays
  honestly open: the original's exact per-race energy constants were never
  published, so the ×1.5/×0.75 roster table and the ¼-hp flee threshold are
  approximations; and the original's flee sometimes routes to a specific
  room — ours takes the greedy farthest step.
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
