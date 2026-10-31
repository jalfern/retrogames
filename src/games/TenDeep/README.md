# TEN-DEEP

A ten-floor dungeon crawl in the spirit of Wizardry (Apple II, 1981) — same
rules, **our own world**. Title, floors, bestiary, items and story are
original work (#1127). Private until Jon promotes it (#379).

## The rules (unchanged from the original's spirit)

- A **party of six** is one body: arrows walk/turn the grid in first person;
  the party lives or falls together.
- **Turn-based ledger combat**: every round, survivors act in SPD order
  (heroes first on ties). Every point dealt and taken is booked in a ledger
  the harness recomputes independently — overkill never inflates it, the dead
  never strike, and a tin-can mob still bleeds the damage floor.
- **Resource puzzle**: spellbooks earned by class and level (Firebolt, Heal,
  Prayer, Ward, Heel), potions, and one-shot MP
  springs. The Slack Rule re-proves the campaign winnable with one fewer of
  every supply the proof consumed.
- **Ten seeded mazes** (19x19, DFS-carved + braided) with stairs at the far
  end; DEEP 10 holds the throne of THE HOLLOW KING — no flight from that.
- **XP ladder**: heroes level across the deeps; the dungeon is deterministic
  — what the harness audited is what you play, tile for tile.
- **Death has a price, not a reprieve**: a wipe drags the bodies back to the
  surface and taxes the purse; the temple can call the dead back — for gold.
  Dead with an empty purse is the end of the run.

Bestiary (own IP): Cave Rat, Mire Adder, Rag Goblin, Bone Sentry, Pale
Wraith, Grave Ghoul, Bog Troll, Minotauros, Deep Wyrm, THE HOLLOW KING.

## Stage 2 — THE RIM (the surface world)

The run OPENS at the hamlet on the lip of the well (Wizardry's town screen,
our own): four facades + the well, entered with ←→ + SPACE; F descends.

- **TAVERN** — `POST FOR HIRE` (40g): a corpse is replaced by a seeded fresh
  level-1 roll (own-IP names; the dead hero's purse stays in the company's
  hands — conservation is sacred). Refuses breathing heroes.
- **TEMPLE** — `MOURN` 200g×lvl returns the dead at 1 hp; `RESTORE` 400g×lvl
  whole; `MEND` 30g fills one hero's HP; `REFRESH` 25g fills one hero's MP.
- **TRAINING GROUNDS** — `TRAIN` 100g×next-level, and it spends the XP you
  actually carried out (Wizardry's exact bargain; refuses below threshold).
- **ALCHEMIST** — potions at 25g, unlimited stock.
- **Gold**: every mob pays `xp/4` coins (ledger `goldIn`); a wipe is not the
  end — the bodies walk home and the purse pays **half per hero** (dead-body
  tax). Dead + purse < hire price = the run truly ends.
- **Proof purity**: `makeRun({strict:true})` (every Node proof, slack run and
  determinism replay, and `playOut`) has NO second life — the campaign still
  wins or dies on dungeon supplies alone; the town is the player's bargain.
  tendeepcheck pins `proven.ledger.tx.length === 0`.

## Stage 3 — THE CREATE (races, classes, alignments, spells-by-level)

Wizardry's character sheet, our own world (`people.js`). Races shift the stats
and close doors; the class owns the gate and the ladder; alignment is a real
stat you pick at the bench.

- **Races**: VASK (+1 atk), ELPHAME (+2 aff — the arcane blood), DURROW (+2 def,
  −1 spd, may never be MAGUS or OATHBOUND), KNUM (+4 mp, −1 atk), HOB (+2 spd).
- **Classes + entry gates**: FECHT (steel), MAGUS (aff≥10), CLERIC (aff≥7),
  FOOTPAD (spd≥6), OATHBOUND (aff≥8 and atk≥9). Papers that miss print FAIL
  and stay FAIL.
- **Alignments**: OATH +1 def, WANDER +1 spd, RUIN +2 atk/−1 def. Shift the
  way at the bench and the paper recomposes — the hero who stands up matches
  the paper exactly (pinned).
- **Spells by level** (`SPELLS`): MAGUS firebolt L1 · firestorm L5 · ward L7 ·
  heel L9; CLERIC heal L1 · prayer L4; OATHBOUND heal L3 · firebolt L5 ·
  ward L7 · prayer L9; FECHT/FOOTPAD never. Spells ignore armour; a class
  that has not learned the letter cannot work it with any amount of MP
  (`cast firebolt` → `noLetter`, no round burns).
- **New battle verbs**: `guard` (held shields halve what they eat, floor 1)
  and WARD (monsters' eyes blind for three rounds — halves, then expires).
  HEEL subdues: the mob kneels, XP paid, its own remaining HP booked, zero
  overkill — and THE HOLLOW KING refuses the word at no cost.
- **The bench** (tavern): POST (40g) still fills a corpse with a seeded roll;
  CREATE (60g) opens six papers on the open slot (dead or POSTED-fresh).
  `roll` is free, `shift±/way` is free, only `accept` pays (books
  `tx {id:'create'}`); the wizardless company always finds a MAGUS among the
  papers. Gates, rolls, composition — all seeded; determinism covers them.

## Engine notes

- `sim.js` — pure state machine, zero `Math.random` (the only dice are
  `dungeon.js`'s seeded mulberry32, and only at floor generation; recruit
  and candidate rolls run on `st.townSeed`).
  Commands: map `fwd back left right use potion`; combat
  `attack guard potion flee target+/target- cast <spellId>`; town
  `down enter-<T|V|G|A> leave sel+/sel- svc+/svc- buy potion` and at the
  bench `open roll shift+/shift- accept`.
- `people.js` — races/alignments/classes/spells tables, the gates, the bench
  rolls, `compose`, the instant spellbook (`canCast`).
- `town.js` — the RIM's services table and price keys; `serviceHeroOk` also
  answers the vacant-slot rule (dead, or freshly POSTed and awaiting paper).
- `dungeon.js` — seeded floors; supplies and ambushes are PLACED tiles, so
  slack deletes are physical tile removals.
- `solver.js` — the autopilot AND the proof: BFS-to-stairs, never dodges
  ambushes, drinks only when dry (full party walks on — otherwise a spring
  tile is a deadlock). The attract demo drives this live, so the demo is the
  witness, not theatre.
- `index.jsx` — the corridor is the SHARED dungeon renderer (#1129,
  `demos/dungeon.core.js`, WebGL2, loaded on demand via
  `src/utils/dungeonRenderer.js`): torch-lit brick with falloff and fog,
  real stair geometry, water-shimmer springs, a crimson beacon on the
  Hollow King's throne (`R.light` each frame within range). The renderer's
  camera-right axis is `(-F.y, F.x)` for this repo's grid frame (x=east,
  y=south, z=up) — facing south puts screen-right at west; the old
  `(F.y, -F.x)` mirrored every frame and read as swapped left/right keys
  (#1293, pinned by `deepglasscheck` "camera:" and a `tendeepplay`
  junction pixel gate). It draws on a
  canvas stacked UNDER the 2D layer, which keeps the HUD strip, automap,
  toasts, FX, RIM, interiors, bench and combat plates exactly as before.
  Mapping: wall/floor 1/0, spring cells → water material, stairs → stair-down
  material; potions are NOT drawn in 3D (Wizardry never showed floor items —
  the automap and event text carry them). Pose: cell centres at +0.5,
  `yaw = (dir−1)·π/2`; moves/turns `animateTo` (250/190 ms, head-bob),
  teleports (descend, wipe, dev setup) `snapTo`. No WebGL2 → the old
  painter's-algorithm wireframe stands in, byte-for-byte behaviour.
  The pixel contract differs per renderer (tendeepplay branches on
  `probe().gl`): with GL, a wall at one pace ⇒ torch-lit brick at centre,
  open hall ⇒ darkness (the torch flips the wireframe's blue-wall signal,
  on purpose), and the eye's lag between `R.pose()` (sim truth) and
  `R.renderPose()` grades the glide — settled lag is 0 and landings are
  frame-exact; with the wireframe, the old wall-blue/centre-dark and
  130 ms `ease` proofs still run. GL pixel reads go through
  `gl.readPixels` (the renderer sets `preserveDrawingBuffer`, the js-dos
  lesson) — and always AFTER waiting for `glLag < 0.02`: sampling mid-glide
  reads a corridor whose axis is still swinging (learned the hard way on
  this harness's first run). The wireframe's fwd/back steps glide the ring
  geometry over ~130ms (`ringE` clamped at
   ring(0.62)) so the walk breathes — presentation only: the sim steps in
   whole cells and the settled frame is the exact snapped one; bumps and
   turns stay instant (the original snaps too). Probe exposes `ease` so
   tendeepplay can grade mid-glide vs settled frames.
   Combat feedback rides on top as `fxList` — a bolt streak per damage cast
   (280 ms, ease-out, additive glow), sparkles over a mended hero (520 ms),
   a wide prayer glimmer, and a dissolve + XP floater on a kill. The sim
   resolves every cast the instant it happens; `fxList` is a separate
   closure array that `stateHash` never mixes, so the light is free. Each
   bolt's path jitter is an FNV hash of `spell:mob` — the same cast at the
   same foe traces the same path (the harness can trust it), no
   `Math.random` anywhere near it. `mobSlot` mirrors `paintCombat`'s
   projection exactly, so a bolt lands where its target is drawn; a bolt
    for an already-gone target simply has no slot.
    Combat opens with staging, also presentation-only: on an ambush the group
    slides in from the right (300 ms per mob + 70 ms stagger, ease-out, off
    `combatT0` — a performance.now() the sim never sees, so `stateHash` is
     untouched), and under the crown the `THE HOLLOW KING — NO FLIGHT` banner
     pulses on the beat (`sin(bob/5)`) while the field dims with it.
    The automap breathes too: explored cells within Chebyshev radius 2 of the
    hero (the view radius) keep the bright ink, older ground dims to
    `#20284a` (`automapRing`/`automapShade` in sim.js — pure, so the Node
    gate proves them). The canvas carries a 20px floor-ruler gutter: one row
    per visited floor, amber on the current one, a green `v` where the stairs
    were seen and a red `K` at the throne — `st.marks` is the sim's pen-and-
    paper memory, written once per floor by `markView`, surviving descent.
- Harness hooks (DEV): `window.__deepTest` (probe/start/cmd/setup/hash),
  DebugKit with PROGNOSIS (re-solves the LIVE mutated state).

## Verify

```bash
npm run tendeepcheck            # floor audits, engine pins, proven campaign,
                                # slack rule, determinism (no browser needed)
npm run tendeepcheck -- --mutate  # each mutant must turn a probe red
npm run lint:tendeep
npm run dev && npm run tendeepplay   # headless Chrome, real key events,
                                     # pixel-graded view/ledger agreement
```

## Honest gaps (stage 4+ of #1127)

- Town is a service screen, not a walkable overworld (the original's New
  Sorpigal had streets; ours is the four-door view + the well).
- Monsters do not stand in the corridor before combat — the original showed
  roaming groups in the 3D view; ours are hidden ambush tiles (a sim rule
  since stage 1; the #1129 billboard pipeline is where this would land, and
  making ambushes visible would re-open the solver/proof).
- Combat keeps its 2D bitmap plates on the HUD layer (the original also cut
  to a separate combat screen, but the plates want their own MODERN pass).
- No between-run persistence (Wizardry saved to disk; we don't).
- ~~The pad carries arrows + A + F~~ #1275: B is mode-aware (`padB` in
  `sim.js`, pinned in tendeepcheck, graded in tendeeppplay) — DRINK in the
  corridor, LEAVE inside a building, DESCEND on the street, fire in battle
  or GUARD when no living hero can work a letter. Heal and flee stay
  keyboard verbs — the pad budget is arrows + A + B.
