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
npm run roguecheck        # 192 checks: boot+purity, determinism (incl.
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
                         # then flees, bump-skip accrual, hash coverage), and
                         # the #3514 flee-moment cues (one fx per creature,
                         # decision-turn timing, silent unseen/healthy,
                         # snake recoil line + blip), and the #3592 Amulet laws
                         # (dlvl-20 single spawn off the start ring and trap-free,
                         # no shallow amulets, BFS reachability, the pre-#3592
                         # shallow cart goldens byte-honest, the pickup you-win
                         # terminal + sting + cart-law score on six seeds, two
                         # doomed seeds dying honest at the same terminal, and an
                         # honest QUIT on the bottom floor), and the #3697 life-dice gates (the cart
                         # ladder verbatim incl. 40920, Δd10 multi-level jump,
                         # level-20 top rung, heal d4s/d8s per level, the
                         # ++max overflow quirk)
npm run roguedrive       # real Chrome, real keys only (#3491/#3509/#3592): walk onto
                         # a quiver, f → menu → direction, one arrow spent, the
                         # miss lies east to salvage, help teaches f; the mobility
                         # leg scans seeds for a route whose laws fire, replays it
                         # with real keys to hash-equality, and watches a snake
                         # bite-then-flee in the browser; the #3592 leg seats at
                         # dlvl 20 via ?dlvl=, lets the guide hunt the Amulet on
                         # the real loop, and reads the YOU WIN card off the DOM
                         # — 28/28
npm run feedbackcheck    # seedpin law + floor (Rogue = title 45)
npm run watchcheck -- --only rogue    # the WATCH pilot + batch-23 source pins
```

Mutant proof: flipping the descend guard in `handleDescend` (`!== '%'` →
`=== '%'`) turns roguecheck red on 4 checks incl. winnability 20/20 → 0/20.
Collapsing the search-reveal radius in `handleSearch` kills 3 door checks
(reveal / drawn `+` / door-found fx). Restore → green. #3491 planted four:
shot passes through bodies (3 red), charge never spent (2), salvage dropped
(4), arrows wieldable (1). Restore → green. #3697 planted one: turning the
multi-level walk into a single-step `if` dies exactly 3 checks (jump, greeting,
real-dice spread). Restore → green.

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

**The break reads (#3514 polish).** A creature fleeing for good used to be
invisible at a glance — it just stepped away. Now the sim records the flee
MOMENT (`fx: flee`, once per creature, on the turn it breaks — the decision
turn, even for ¾ races that have no step yet that turn), and index.jsx turns
it into a distinctive nervous chirp + a one-turn amber tint on the glyph (the
port's accent, cf. the door jambs). The tint is turn-stamped, not time-based:
it ages out with the next hero action, honest to the turn model. The snake's
recoil gets the port's message voice ("The snake recoils!") — the 1980 cart
printed nothing at this moment; this is a labelled port addition in the same
class as the narrated doors. The `?` help gained a **Mobility** block stating
the speed roster (K B C L J swift ×1½, T M heavy ×¾, wounded ≤¼ hp flee for
good, snake recoils) — the speed table the cart never printed, in the port's
teaching voice. The turn model is discrete, so a double-step never draws two
cells at once: the frame shows the resolved cell after the burst, which is the
honest picture of a turn-based world. roguecheck §9 gates the cue: exactly one
fx per creature, decision-turn timing, silence when unseen or healthy, and the
snake's line + blip (mutants: unplugged emit → 2 red; deleted line → 1 red).

## Honest gaps (vs the 1980 original)

- **CLOSED by #3579:** the trap floor. Every level is mined — 2..(4+⌊dlvl/2⌋)
  hidden traps on floor and corridor cells, never the start ring, stairs, or
  under an item/monster; rolls ride a borrowed, rewound slice of the stream,
  so every pre-existing seed's dungeon replays byte-identical until a trap
  actually springs. The cart's roster fires underfoot: trap door (the fall
  grudge — nth consecutive fall costs (n−1)·2d6, walking the stairs settles
  it), teleport, sleep (monsters close in while you snooze), lose-strength,
  confusion, snare (turns spent struggling) and the dart launcher. Sprung
  traps mark the map with the original's backtick `` ` `` and stay armed —
  the teleport trap keeps its 1980 joke. Monsters spring nothing (no
  monster-trap interaction), and search never reveals traps — exactly the
  ring-of-warning gap this file always admitted.
- **CLOSED by #3588:** trap personality. The cabinet names the trap by ear —
  every kind has its own synthesized voice (darts tick high, teleport shimmers
  down, sleep glides low and slow, snare ratchets, strength drains, confusion
  hisses off-pitch, the door snaps), and the trap-door wail sinks deeper with
  every unpaid fall grudge (`falls` rides the fx event; the view pitches it).
  The spring moment: the cell the hero was wrong on burns white for exactly
  one turn and the grid shudders twice (view-layer stamps like the #3514 flee
  tint — sim hashes untouched). The banner shows the body's shackles —
  `Slp:n` / `Hld:n` while they bite — so a drugged hero can read why the
  arrows stopped.
- **CLOSED by #3605:** per-kind weights. The 1980 cart did NOT deal trap doors
  and snares as often as confusion gas and sleep — the mild kinds were the
  common bread, the level-stealing door and the turn-eating snare the rare
  nasties. Per-kind weights (#3605): str/sleep/confuse 3 · teleport/darts 2 ·
  door/snare 1 (levels 1–7) · 2 (levels 8–14) · 3 (levels 15–20) — mild common,
  the nasties rare and trending nastier with depth. One weighted roll per
  placed mine, on the same borrowed, rewound slice — the map, the items, the
  monsters and every downstream level replay byte-identical. roguecheck pins
  the curve, the empirical distribution at levels 1/10/20, and the seed-777
  anchor re-captured from the weighted stream.
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
- **CLOSED by #3592:** the Amulet of Yendor. One goal object generates on
  monster level 20 — the cart's depth, unlowered — drawn `%` in gold, never on
  the start ring, the staircase, or a cell shared with an item, monster or
  trap, BFS-reachable on every seed. Step onto it and press `,` and the run
  ends at the you-win terminal: `you have found the Amulet of Yendor!!`, a
  ✦ YOU WIN ✦ card, score still gold + dlvl×50. The dice roll only at level
  20, so every seed's shallower dungeon replays byte-identical against the
  cart's golden (roguecheck pins them). And dlvl 20 still kills — the harness
  pins both halves: six seeds pick up and win, two die honest en route. The
  guide (WATCH) hunts it when you dare the depth.
  - #3601 polish: the pack names it (`Amulet of Yendor`, not `?`) and the
    glyph shimmers gold ↔ bright white on the sim turn clock (a pure
    function, no timer); the WIN card carries a one-shot golden bloom
    (pure CSS, reduced-motion-aware); and every descent into dlvl ≥ 18
    rings `deep-descend` — a slow low drone — alongside the plain
    `descend` sweep. All pinned in roguecheck.
- **CLOSED by #3697:** level-up dice — with a ruling. Fetched from the BSD
  Restoration Project (`github.com/RoguelikeRestorationProject/rogue3.6`),
  the cart's real law is: `check_level` walks the whole `e_levels` ladder, so
  one big award can jump several levels and the gain is `roll(Δ, 10)` — Δ REAL
  d10s; healing rolls `roll(lvl, 4)`, extra healing `roll(lvl, 8)`, and
  overflow buys exactly +1 max (`hp = ++max_hp`). All three laws now live in
  sim.js (`checkLevel`, `healCart`) and roguecheck pins them (+10, incl. the
  original's 40920 misprint and the level-20 top rung). The gap's ask for
  "class-based gain rolls" and an "int/charisma/wisdom spread" is a dead end,
  the #3664 shape: `rogue.h struct stats` carries **strength only** — no
  attributes to spread — and BSD Rogue has **no class system at all** (classes
  enter the lineage through the derivatives, Hack/NetHack). The parenthesised
  `Hp: cur(max)` hit-dice read was already faithful. What stays open: the
  cart's potion of raise (`P_RAISE` — exp to the next rung, "skillful") is a
  new generation type, deferred, not forgotten.
- Food is the only light-source clock; no lamp/oil and torch-lit radius.

RETRO bar: pure green-phosphor monospace look, original ASCII symbol set and
the classic message line voice ("You feel much better!", "Welcome to level 4!").
