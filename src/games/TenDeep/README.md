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
- First-time-player pass (#1351, pinned in tendeepplay): toasts decay per
  SIM frame — 150 frames is 2.5 s of screen time, not the old 15 s stall; a
  wall bump gets a 12-frame darken + shake beat (presentation-only, probe
  `bump`); automap cells grew to 6 px and a faint UNIFORM dot grid fills the
  box (dots reveal no walls — the explored ink is still the only truth); the
  town footer + controls line paints in-canvas at 176..200 (the rim's
  convention — the old H-24 band belongs to the party strip, which
  overpainted it); the party cards print `hp/maxHp` where the class tag used
  to sit (the class still prints in full on every town screen); on touch the
  letterbox reserves the pad band (vpadSize's law) and lifts the stage above
  it, and the site footer opts out (`footer: 'none'` — the strip is the
  game's own bottom surface).
- hudfit's measurement was font-blind (the pass found it): `fitSize`/
  `fitTwoCols` measured every candidate size with `ctx.measureText` at the
  font the caller left behind, so a 5-char `hp/maxHp` string "didn't fit"
  the column and printed `40…`. `measure()` now sets and restores `ctx.font`
  per candidate; the Node estimator was already size-aware.
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

- ~~Town is a service screen, not a walkable overworld~~ **CLOSED by #1751**:
  THE RIM is a place you walk now. `RIM_STREET` (town.js) is a 32-tile,
  two-lane hamlet: four facades with door tiles on the far lane (T 3, V 9,
  G 16, A 22), hedges blocking the far lane at 6-7 and 18-19, the well curb
  blocking the near lane at 12-13 — so every door needs a lane-hop to reach.
  `st.town.tx/ty/face` is sim state (in `stateHash`); `walk-left/right/far/near`
  commands move it, `rimBlocked` refuses (a refused step books a `walkBlocked`
  event — an unmoving frame is an answer, AGENTS' blocked() law), `enter-<key>`
  is strict (`rimDoorAt(tx,ty)` must match — DOORAWAY otherwise), `leave`
  steps you onto your own threshold, and F descends from anywhere (pad law).
  The shell draws the same map you walk: lamp pools, hedges, door steps, and a
  walker whose stride keys to tile parity (idle = still). Pure data, zero rng:
  proofs bypass the town, so every campaign pin stands. tendeepcheck +8 gates
  (map well-formedness, edge/hedge/well refusals, lane round-trip + facing,
  strict door, all-doors-reachable + threshold on leave, hash rides the walk,
  determinism, source pins); mutants: kill `rimBlocked`'s lane lookup → street
  gates red, kill the `rimDoorAt` guard → strict-door gate red, restored.
- ~~Monsters do not stand in the corridor before combat~~ **PARTIAL by #2315**:
  roaming packs are now VISIBLE in the first-person view before they spring. The
  single source of truth is `view.js · sightedMobs(st)` — pure, deterministic, no
  RNG, no browser — reused by the WebGL billboards, the wireframe painter, the
  harness probe and tendeepcheck. A pack is sighted when it is within the torch
  (`SIGHT = 6`), in front of the facing, and honest line-of-sight (no seeing
  through a wall — `losClear` mirrors `dungeon.core.js` `viewCells`). The GL
  corridor feeds the renderer's built-in monster atlas (8 rat, 9 skeleton, 10
  goblin), sized up for a bigger pack, swaying on a presentation-only clock; the
  wireframe paints a tinted glyph with two red eyes on the forward column
  (paintMap stops at the first wall, so a tile it reaches is honest forward LOS).
  **#2324:** the renderer documented sprite `tint` since #1129 but never read
  it — `uTint` now multiplies the lit core (white default, deepglass
  byte-identical), so the per-mob tints in `view.js` finally reach the screen;
  tendeepcheck pins the wiring + default and kills an unwired-tint mutant.
  **ROAMING MOVEMENT by #2321** — packs drift like the original's groups.
  `st.packPos` (spawn tile key -> live tile, plain JSON so `cloneState` carries
  it) is sim truth: once per honest party step each unsprung pack takes at most
  one tile, direction chosen by a hash of (spawn key, `st.tick`) — no RNG, so
  replays reproduce every drift — and a pack that NOTICES the party
  (`view.js · packNotices`, the view's own honest test) closes the gap.
  Legality law: never through walls, never on a spring, throne, the party's
  tile or another live pack's tile; never further than ONE tile from the spawn
  (the pack keeps its beat — and a pack seeded on the road stays findable on
  the road). The ambush springs on the pack's live tile **or its post** (a pack
  that sidesteps as you walk onto its post still lunges — it is right there and
  visible), so no seeded encounter can be skipped and XP never leaks: the
  no-spring slack economy still closes (WINS in 1133 ticks). `stateHash` mixes
  every live pack tile; the solver never dodges and each pack still fights at
  most once, so the proven campaign, the slack rule and determinism ride
  (tendeepcheck +14 gates: synthetic closure/freeze/spring-refusal/party-tile/
  live-sighting, and per-deep legality + closing-steps + replay determinism).
  A pack newly entering the cone gets a low synthesized warning sting (shell
  only, keyed by floor + spawn key so it never machine-guns). **The sim's
  proofs still referee nothing sighted** — sightings stay a view-layer question.
  **#2321 pt5:** the view layer now referees ITSELF in tendeepcheck —
  §THE DARK SAYS SO unit-tests `packNotices` (mid-torchlight yes, past the
  flame no, behind/abeam no, through stone no, point-blank no) and source-
  pins the shell's sting wiring (fresh ledger per floor, floor+spawn key,
  one sting on fresh eyes). 6 mutants — near guard lifted, range past the
  torchlight, facing law dropped, sim deaf to the notice law, ledger page
  stuck, sting gate loose — all die.
  Per-species silhouettes **CLOSED by #2332**: the whole bestiary got its own
  atlas shape (`SPR_UV` table in the shared renderer; the Ghoul still shares the
  skeleton's bones on purpose, under a dead-flesh tint).
  The automap stays clean — Wizardry never drew monsters on paper, neither do we.
- ~~Combat keeps its 2D bitmap plates on the HUD layer (the original also cut
  to a separate combat screen, but the plates want their own MODERN pass)~~
  **CLOSED by #2321**: the ambush no longer cuts to a separate screen. The
  corridor keeps painting behind the fight — the WebGL view draws through a
  cleared 2D band (`glOn` covers combat mode; without GL, `paintMap` paints
  the same hall) — and the plates ride that lit view wearing the bestiary's
  own coats: `shadePixel` pulls each bitmap toward the same `MOB_TINT` the GL
  billboards and wireframe glyph use, with a torch falloff toward the floor
  (eyes stay raw). The slay dissolve carries the tint too. Pins: tendeeppcheck
  §MODERN COMBAT (branch structure, no opaque backdrop, tint load-bearing,
  MOB_TINT covers every `MOBS` key; 5 mutants all die); tendeeppplay reads the
  2D-layer alpha at the old gradient's corners (must be 0) and proves
  `glFrames` advance mid-fight.
- **No between-run persistence — DECIDED stateless (#2321):** the run is one
  sitting; a wipe drags the bodies to the RIM and taxes the purse, and that
  grief IS the economy (temple gold, hire posts, the dead-purse end). A
  localStorage snapshot would let players bank around the tax and split the
  campaign from its own consequences, so we do not save — the gap is
  intentional. Wizardry saved to disk because the Apple II couldn't hold the
  party between sessions; the browser tab holds ours.
- ~~The pad carries arrows + A + F~~ **CLOSED by #1275**: B is mode-aware (`padB` in
  `sim.js`, pinned in tendeepcheck, graded in tendeeppplay) — DRINK in the
  corridor, LEAVE inside a building, DESCEND on the street, fire in battle
  or GUARD when no living hero can work a letter. Heal and flee stay
  keyboard verbs — the pad budget is arrows + A + B.
