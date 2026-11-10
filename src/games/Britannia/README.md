# BRITANNIA — Ultima IV rebuilt from scratch (Milestone 1: Walk Britannia)

Issue #1128. The original: **Ultima IV: Quest of the Avatar**, Papyrus/Origin
(IBM PC/EGA, 1985). MODERN bar (the issue says "built to the MODERN bar").

## Data — the real Britannia, loaded at runtime

All geography is read from the original data files inside
`public/games/ultima4.jsdos` (the 2011 freeware release). Nothing is
transcribed into source:

- the `.jsdos` is a ZIP; `src/games/Britannia/britmap.js` carries a tiny
  ZIP reader + a self-contained raw-deflate inflate (the bundle's streams
  carry padding junk that strict inflaters reject).
- `WORLD.MAP` = one terrain byte per tile in **32x32 blocks, blocks row-major**
  over a 256x256 world; **0 = ocean** (the whole map border reads 0).
  Terrain values 1..8 are land kinds (grass, marsh, rock, hill, forest, heath,
  plains, coast) — the art is ours; the geography is Origin's.
- **Moongates are detected from the tile data, not constants**: the original
  marks sites with bright 4-arm stars; `findStars` merges them and keeps the
  8 strongest inland ones, mutually ≥22 tiles apart. A different `WORLD.MAP`
  loads the same way — the engine is world-agnostic as the issue asks.

## Milestones (#1128 ships in stages; this PR is stage 1)

1. **THIS**: walk Britannia — overworld, ocean, ships, towns (as built-up
   terrain you can cross), 8 working moongates, day/night with torchlight,
   classic-tiles comparison (`C`), full game contract, `britanniacheck`.
2. Talk, trade and virtue (keyword conversations from the `.TLK` files).
3. Combat.
4. Dungeons in 3D by torchlight (the `.DNG` files are 48x48x2).
5. Shrines, the Abyss, the ending.

## Honest gaps (stage 1)

- Weather (`weather.js`, #1135): a deterministic sky per 16x16-tile region —
  rain in the south, snow north of the snow line (y<72), storms with night
  lightning + delayed thunder — and the whole pattern drifts west-to-east on
  the wind, so fronts travel and a cell keeps its kind as it rides. Rock
  blocks the wind: rain shadow, see below. — **CLOSED by #1853** (fronts ride
  a seeded pressure wind of 0..3 regions per epoch — see "Variable wind"
  below; rain on the sea and the swell memory landed earlier in #1822 and are
  untouched).
- Moongates warp between the 8 detected stars with a destination picker;
  the menu names each gate for its virtue-moon (moons.js, the eight-wheel
  homage to the original) and prints tonight's phase with a lit-disc glyph —
  phase = day count mod 8, pure + deterministic so `britanniacheck` proves
  the wheel (plus a bad-wheel mutant that goes red). — **CLOSED by #1862**
  (moon-phase routing seats the picker: the moon decides the destination —
  see "Moon-phase routing" below).
- Gate journeys land at a star, not a shrine, and the stars carry roman
  numerals: the original's shrine destinations and town names (Britain,
  Trinsic…) arrive when stage 5's town/talk data loads. — **CLOSED by #1876**
  for the shrine half: gates now land at named chapels with their keeper in
  the toast (see "Shrines" below). The town names (Britain, Trinsic…) still
  wait for stage 2/5's town/talk data — that tail stays open (#1829 item 5).
- Boarding is free at any coast (the purchase lives in stage 2's shops).
- Town walls/buildings are still tile terrain; enterable buildings are stage 2.
- Classic mode (`C`) stamps the ORIGINAL terrain tiles: Origin's own
  terrain-named tilesets (`GRASS/MARSH/BRUSH/HILL/FOREST/SHORE.CON`, 192B =
  6×32B records; records 2..5 are four 8×8 chunky-4bpp variants, high nibble
  = left pixel; `BRICK.CON` is held for stage-2 cities). The filename is the
  terrain mapping — nothing guessed. `SHAPES.EGA` stays undecoded on purpose:
  its terrain→base table isn't in the bundle and the lone AVATAR.EXE candidate
  contradicts the sheet's colour runs, so wiring it would mislabel marsh vs
  heath vs plains (#1135 archaeology). Sea/cliff/plains have no named tileset
  and stay flat fills. The EGA map palette in `ega.js` reproduces the semantic
  colour use the tilesets prove (the original set it by port I/O at runtime).

## Rain shadow (#1135 polish)

- `weather.js`: fronts ride west-to-east, so rock (terrain 3) is a wind
  barrier. `reliefBias(x, y, terrainAt)` shifts the region roll by −0.22 at
  the ridge's east foot, decaying linearly to 0 past 8 tiles (leeward shadow:
  the air already rained out); +0.12 west of the ridge with the same falloff
  (windward uplift); +0.15 on the rock itself (summit). Rock equidistant both
  sides cancels to 0 (a valley between twin ridges stays neutral), sea casts
  nothing (sea is not rock), and with no terrain passed the sky is bit-for-bit
  the old drift field — every pre-existing 4-arg caller is untouched.
- `weatherAt` / `flashAt` / `flashOnset` take the optional `terrainAt` last and
  shift the same roll, so the first leeward tile can never storm (−0.22 caps
  r below the 0.88 storm line) and lightning follows its storm into the dry.
- `index.jsx` feeds the loaded `WORLD.MAP` through `terrainAt`, and the
  harness state exposes `shadow` (the bias under the Avatar) so bots can see
  it: walk east off a ridge and the moors stay dry while the west face takes
  the weather.
- `britanniacheck` +18 gates: null-passthrough parity, orientation
  (summit/up/wet, east/down/dry), monotone decay + hard zero past 8, twin-ridge
  cancellation, sea neutrality, determinism, dry conversions with zero
  impossible reversals east, wet conversions with zero impossible dryings west,
  the first leeward tile never storms (the base field storms it 41 times
  without the shadow), windward storms do arrive, no lightning in the shadow,
  real Britannia has rock (693 sampled), the sky bites exactly where ridges
  stand and never where they don't, and 4 wiring gates. Mutants: flipping the
  two signs reddens 5 gates; zeroing the bias reddens 6 — each restored green.
- Still honest: the shadow is 1-D along the wind (no cross-wind ridge shape,
  no orographic cloud cap on the summit itself).

## Variable wind — fronts race and stall (#1853)

The old sky marched at exactly one region per epoch forever. Real mid-latitude
weather races on a gale and parks under a high, so the wind itself now has
weather (`weather.js`):

- `windOf(epoch, seed)` — a seeded pressure cycle. Per epoch the zonal wind
  blows 0 (**becalmed** — a stalled high), 1 (**steady**), 2 (**fresh**) or 3
  (**gale**) regions, at 15/40/35/10% (hash thresholds 0.90 / 0.40 / 0.75 /
  else). Over any 80 epochs every class shows up.
- `driftOf(tick, seed)` — the pattern's drift is the cumulative sum of the
  winds so far: monotone east (the sky never blows backward), constant within
  an epoch, and a front that crosses a boundary jumps exactly its new wind.
  Memoized per seed (append-only), so the per-frame `weatherAt` calls stay
  O(1); replays and hashes see identical values. Negative ticks (the #1822
  swell memory asking before epoch 0) integrate backward with the same series.
- What the player reads: the HUD appends the wind name (`RAIN FRESH`,
  `STORM GALE`) whenever the wind is not the steady baseline, and each shift
  toasts with its own sound — gale sweep rising, becalmed tone falling. The
  sea feels it through the untouched #1822 memory: a stalled storm piles
  multi-epoch heave into the swell, a gale empties the memory fast.
- What is deliberately NOT swept up: the ambient flocks (`ambient.js`) ride
  their own constant `CELL_DRIFT` — wildlife has its own schedule, and its
  gates (#1135) stay byte-exact.

Harness (`npm run britanniacheck`, 9 new gates): the fronts/lightning riding
identities moved from "one region per epoch" to "exactly drift(t0→t1) regions"
measured against **literal booked wind in the harness** (#1822 lesson — the
module under test never supplies its own expectation); plus varies (module and
booked both show ≥3 classes), agreement 6 seeds x 80 epochs, monotonicity,
memo==naive sum at 1M ticks, zero-crossing steps, HUD names + shell wiring.
Mutant: flattening `windOf` to a constant reddens ride (199/288), varies
(1/4) and agreement — restored green.

## Moon-phase routing — the moon decides the destination (#1862 polish)

The picker made every gate a taxi to every star; in the original (Ultima IV,
1985) the **moon decides** — ride a gate on a given night and it sends thee to
the one star its wheel links that phase. The game now seats that rule:

- `moons.js` grows `ROUTE_OFFSET = [1,3,5,7,4,7,5,3]` and
  `routeDest(gate, phase, n)`: each phase rotates the gate circle by its
  fixed offset — wider as the moon waxes (1,3,5,7), diameters at the full
  (4), waning mirrors waxing. The original's exact table isn't in the bundle,
  so we honour its RULE (phase-determined, fixed, learnable) rather than fake
  its rows. Every phase is a rotation by a shift held in 1..n-1: a
  derangement — no gate routes to itself, none is left without a destination.
- The gate menu marks tonight's moonlit road with a small silver disc beside
  the row, tints it moon-ink, and captions the wheel in words (`tonight's
  moon routeth hence to V of Spirituality`). Choosing a non-routed row is
  **refused** — buzz, menu stays open, and the refusal toast names where the
  moon actually routeth, so the wheel gets learned rather than guessed. The
  rule bites on keyboard, number keys and tap alike (all selection paths
  funnel through one pad.a handler).
- Riding the routed row warps exactly as before (#1135 swirl intact). Phase =
  day count mod 8 (`moonPhase(tick)`), pure and deterministic, so the whole
  wheel is provable headless. Shrine destinations and town names stay stage 5.
- The menu box grew 20px (`GM.foot` 44→64) for the caption line; row text is
  byte-identical, so the #1352 width pins still measure what they always did.
- The DEV probe gained `moonRoute` (tonight's road while the menu is open)
  and `toastMsg`; DebugKit gained a `full moon` jump.

Harness (`npm run britanniacheck`, 10 new gates + 2 mutants): per-phase
derangement + no-self over all 8 gates, wheel shape (waxing grows, full is
diameter, waning mirrors), phase-locks-per-day, `dest != gate` for every
(gate, phase), determinism + wrap, the honest replacement of the old vacuous
"network" winnable gate (phase-0 chain reaches all 8 in 7 rides; full-moon
rides alone reach exactly the diametric pair — the wheel adds meaning), and
source pins for refusal/menu-mark/probe wiring. Mutants: `ROUTE_OFFSET[4]`
4→2 reddens the wheel, and cutting the refusal test (`dest === routed`)
reddens the rule pin — restored green. `britannidrive` rides the rule in a
real browser: refusal on the wrong row, warp on the moonlit row, and the
route flipping when the day turns.

## Shrines — the landings become named chapels (#1876 polish)

In the original (Ultima IV, Origin 1985) the eight moongates connect the eight
**shrines of the virtues**, each keeping the stone Avatar who attained that
virtue. Until now a journey ended at a bare star with a roman numeral on it;
this stage makes the destination live up to the moon-name the gate has carried
since #1135:

- `shrines.js` (pure + deterministic): one **consecrated plot** per gate —
  `SHRINE_DIST = 2` tiles out, cardinals tried in seeded hash order, first
  tile the town FLAT law accepts (grass/heath/plains — never sea, cliff,
  hill, forest, marsh or another star's POI) and no earlier shrine claimed.
  Distance 2 by construction keeps every sanctum outside a gate's ±1 approach
  ring: **stone cannot strand a pilgrim** (britanniacheck pins it). A world
  that offers nothing gets `null`, not a lie.
- `AVATARS` names the eight canonical statue-keepers aligned index-for-index
  with `MOONS`: Humility/Dracmato, Honesty/Ires, Compassion/Emoj,
  Valor/Dactio, Spirituality/Naergius, Justice/Agdash, Sacrifice/Gordam,
  Honor/Andros — the menu's moon and the shrine's keeper always speak the
  same virtue.
- **The chapel is stone**: on foot the sanctum tile refuses you (thud +
  retry cooldown; first touch toasts `The Shrine of X is stone — about face.`).
  Ships, warps and the gate itself are untouched; sim positions change only
  by the refusal, so every pre-existing pin and win-margin rides unchanged.
- **Look (MODERN bar):** a chapel over each plot — ashlar walls with
  staggered joints, steep slate roof, an arched oak door facing its gate
  head-on, and a bell-cote carrying a moonstone in the gate's own cyan ink
  that pulses and halos at night. Classic (`C`) mode stays the clean CON
  tile sheet. The panel gate box grew 480→520px for `Shrine of Spirituality`.
- **Words replace numerals where a destination is NAMED**: menu rows read
  `III — Shrine of Spirituality`, the arrival toast carries shrine + keeper
  (`…whirls thee to the shrine of Spirituality, where Naergius standeth of
  old.`), and the compass points `to Spirituality · 214 paces`. The refusal
  and route caption keep their roman-numeral wheel-teaching — the #1862 pins
  stay true, word-for-word.
- Honesty: gate III's chapel plots due SOUTH at (161,23), so the #1829
  item-7 stickiness walk in `britannidrive` walks off NORTH instead; gates
  V/VI (the isles) stay the ship's business with or without chapels
  (britanniacheck proves walls lose no land but the chapel floors).

Proof: britanniacheck +18 gates (plot/dist/ring/FLAT laws with the spec value
pinned, keeper alignment, 40× determinism, null-on-sea, wall-BFS land +
gate-reach, 8 wiring pins); mutants `--mutate-shrine` (dist 2→1) and
`--mutate-block` (refusal deleted) both die, tree restores clean. The drive
adds panel/node plot parity, the real-keys stone refusal at gate VI and the
keeper-toast check.

## Verify

```bash
npm run britanniacheck      # data integrity + rules + winnability (Node, no browser)
npm run britannidrive       # real-key browser drive (needs `npm run dev` on $DEV_PORT)
npm run dev                 # play at /retrogames/britannia
```

## Walk sprites + input latch (#1135 polish)

- `avatar.js`: the Avatar is 4 facings x 3 frames (idle + two striding),
  procedural, mirrored profile, face only when the world sees it. `S.face`
  + `S.anim` live in the sim; `face`/`frame` ride the harness state.
- Tap latch (`taps`): a keydown that lands between two fixed-timestep steps
  used to vanish (keyup deleted it before any `step()` read the pad — the
  moongate B-cancel and quick arrows were losing presses). Keys now latch in
  `taps` and die only after a step consumed them; pointer taps use the same
  latch instead of `setTimeout` races.
- A cancelled moongate (`dismissed`) stays closed until you leave its 3x3
  neighbourhood — B beside a gate no longer locks the pilgrim in the menu.
- Pad chrome (`[data-vc="1"]`) is full-width `pointer-events-auto`; a
  Britannia-scoped `<style>` makes its transparent gaps fall through, so
  moongate menu row-taps reach the canvas on phones. Shared component
  untouched on purpose — other titles may lean on the bar; a sweep there
  needs its own QA issue.

## Ambient life (#1135 polish)

- `ambient.js`: the land is never empty — birds wheel over the moors, fish
  break at sea. Like the weather it is pure and deterministic: each 8x8-tile
  cell rolls one hash per its life (`rollOf`), the whole pattern rides the
  same west-to-east wind as the fronts (8 tiles per 720 ticks), a cell keeps
  its wildlife as it travels and a new lineup enters from the west. Fish
  prefer the shallows (coast cells ~0.42 vs open sea ~0.18); a flock is
  fixed for its life (3–5 birds, own direction and height) and flies across
  its cell (`flightOf`), so nothing flickers in place.
- `index.jsx` samples the cell under the Avatar each step: first arrival
  chirps (two sine notes) or splashes (short noise); the draw layer strokes
  flapping chevrons over land cells and silver arcs + ripples over sea cells,
  in play and in attract; classic mode (`C`) stays a clean tile sheet.
  `ambient` rides the harness state.
- `britanniacheck` +18 gates: habitat (never birds-on-hill / fish-on-moor),
  no starved land or fishless sea cell within 64 drift steps, coast bias,
  density sanity both ways, pattern-rides-the-wind invariant, one sweep per
  cell-life, flock determinism + both directions, and step/sound/draw/state
  wiring. Mutants: habitat swap, dropped coast bias, frozen drift — each
  goes red, restored green.
- Still empty of *monsters* — the honest overworld threat arrives with
  combat (stage 3).

## Coastal swell (#1135 polish)

- `swell.js`: the sea breathes. A plane-wave crest field `crest(tx,ty,t)`
  rides west-to-east at one tile per 24 ticks — the same wind the weather
  fronts drift on — with a slight north-south tilt so wavefronts are not
  screen-perfect lines. Exact invariant: the crest at `(x, t)` reappears at
  `(x+k, t+k*24)`. `crestLane` jitters the crest's position within each tile
  so neighbours never paint in lockstep.
- Foam lives only where land holds the water: `landSides` reads the map for
  the edges with land beside them, `foam` is 0 on open ocean and pulses
  0.35..1 at shore as each crest passes (monotone in the crest), and
  `foamPatches` scatters seeded speckles against the correct edge — the
  ocean-demo painted-blob dissolve shrunk to tile scale, never a solid
  stroke. Pure + deterministic (hashes of tile/side/seed); sim and hashes
  untouched; classic mode (`C`) stays a clean tile sheet.
- `britanniacheck` +21 gates: determinism, east-phase (PH_T < 0), ride
  invariant, periodic-but-alive, band span, lane spread, open-ocean never
  foams, shore foam never vanishes, everywhere-pulsing, foam-tracks-crest
  monotone, coast/open sampling of the real map, speckle determinism/
  count/bounds/edge-hugging/seed-sensitivity, plus 4 wiring gates. Mutants:
  PH_T=0 (ride/east red), drop coast gate (open-ocean foam red), swap the
  'w' cluster (edge red), stub the drawTile crest (wiring red) — each goes
  red, restored green.

## Rain on the sea (#1135 polish)

- `swell.js`: wet cells now strike the open water. `splatIntensity(wx)` maps
  RAIN/SNOW/STORM to 0.55/0.35/1 (clear = 0), and `dimples` scatters that
  many seeded rings per tile, each with its own period (22..42 ticks): the
  ring opens, fades, dies, and a new drop takes its place — struck water,
  never static dots. Storm > rain > snow > glass, every tile, every tick.
- `index.jsx` asks the terrain-aware `weatherAt` per sea tile at draw time,
  so dimples sit exactly where the cell rains (rain shadow included); snow
  paints soft flecks instead of rings; classic mode (`C`) stays a clean tile
  sheet (the v===0 modern branch only). `seaRain` rides the harness state.
  Pure + deterministic — the sim and its hashes are untouched.
- `britanniacheck` +12 gates: determinism, dry-sea silence, per-kind
  mapping, storm>rain>snow ordering, tile bounds + sane alpha, the
  live-and-die lifecycle, real-ocean coverage of both sky states, zero
  dimple/sky mismatches over 7.8k sea samples, and 3 wiring gates.
  Mutants: dropping the `intensity <= 0` guard reddens 3 gates; swapping
  the rain/snow intensities reddens 2 — each restored green.
- Still honest: no splash sound at sea beyond the global rain hiss. (The
  "no swell of its own" caveat here is superseded by #1822 below — wet skies
  now lift the crests and foam through the wind-memory.)

## Rain winds the swell (#1822 polish)

- `swell.js`: `seaRough(tx, ty, t, seed, terrainAt)` is the sea's wind-memory
  — `splatIntensity` of `weatherAt` sampled at `t - d*WX_EPOCH` for d = 0..3
  with weights `ROUGH_MEMORY = [1, 0.5, 0.24, 0.11]`, clamped ≤1. The drift
  carries a cell one region east per epoch, so `t - d*epoch` is exactly the
  sky that stood over this tile d epochs ago: a storm now is a full sea
  (1.00), the rain that moved off it leaves it half up, four clear epochs
  return it bit-exactly to the calm field the older gates prove.
- `index.jsx` per sea tile: crest stroke alpha scales by `crestGain(rough)`
  (1 → 1.6), shore foam body by `foamGain(rough)` (1 → 1.45), and a big
  crest (`c > 0.72`) in wind (`rough > 0.45`) breaks a seeded whitecap dash
  whose coverage grows with the roughness. Both gains are exactly 1 wherever
  no front has passed, so the pre-#1822 painting survives untouched. The
  harness state carries `seaRough` under the Avatar; sim + stateHash are
  untouched (pure render math over `weatherAt` — the #1135 drift identity
  `pattern rides (x+16k, t+k·epoch)` stays pinned).
- `britanniacheck` +15 gates: determinism, the literal weight profile (the
  expected values live in the check, not re-read from the module — a harness
  that re-reads the mutant's constants can never go red), bounds + calm-only-
  under-clear + no-full-heave-under-clear over 800 samples, both states at
  scale, storm-overhead = full sea, the exact 0.275 linger bracket, per-epoch
  contribution ≥ booked weight over 3.6k samples, epoch-cadence, both gain
  curves, the 4-arg weather contract, and 4 wiring gates.
  Mutants: zeroing `ROUGH_MEMORY[1..3]` reddens exactly 3 gates (profile,
  linger, contribution); pinning `crestGain/foamGain` to 1 reddens exactly
  2 — each restored green.
- `npm run britannidrive` (10/10): real Arrow keys start and walk the Avatar;
  riding the clock 12 epochs at the walk-point shows the panel carrying the
  memory curve live (STORM 1.00 → CLEAR 0.50 → 0.28 → 0.13 → 0.06); at the
  coastal moongate spawn (235,211, open water, south of the snow line) the
  drive recomputes the wind state of every visible sea tile node-side,
  replays the same seed+tick to the lightest (avg 0.02) and heaviest (1.00)
  of 24 epochs, and proves the heavy epoch paints more bright crest/foam/
  whitecap pixels; the panel's `seaRough` matches the drive's recomputation
  to 1e-9; `reset(7)` clean; zero page errors.
- Still honest: fronts move at constant speed (the sea reacts to the rain but
  the sky itself never quickens), and roughness is paint only — no sea-state
  hazard for shipping yet.

## Gate-menu flavor + hover chirp (#1135 polish)

- `moons.js`: `PHASE_FLAVOR` — eight lines, one per moon phase, each naming
  the very phase it decorates, each ≤ 48 chars so it fits the 420px panel.
  The open gate menu prints tonight's line under the destination rows, so the
  warp is flavored by the moon it claims to follow (still pure +
  deterministic; the wheel already lived in `moonPhase`).
- `index.jsx`: a mouse travelling the open menu now *chirps* — the row under
  the pointer becomes the selection and answers with the same square-wave blip
  class the arrows always gave (420 Hz). Taps keep their old silent
  choose-on-touch. `hoverRow` (−1 when the menu is closed) and the current
  flavor line ride the harness state.
- Playtest fix (screenshot evidence): the phase line + lit-disc shared the
  title's baseline and the longer phase names overprinted "A MOONGATE
  WHIRLS" — the phase row now sits below the title (disc by+54, text by+58,
  title by+36; pinned so it cannot creep back).
- `britanniacheck` +9 gates: 8 distinct lines, self-naming phase word,
  wrap-deterministic `gateFlavor`, panel-fit bounds, menu print wiring,
  pointermove tracking + chirp parity, state exposure, title-clear layout pin.
  Mutants: duplicate a line (2 red), strip a phase word (1 red), delete the
  hover chirp (1 red) — each restored green.

## Town tint (#1135 polish)

- `towns.js`: the land around each detected moongate reads **built-up** before
  its walls arrive. In the original every virtue gate stands at a settlement's
  edge, so a 4-tile Chebyshev skirt of level ground (grass/heath/plains) around
  each gate scores 1→0.2 outward; sea, marsh, rock, hill, forest, sand and POI
  tiles score 0 (towns are founded on level ground, never on a peak or a star).
  Pure + deterministic, driven entirely by the runtime gate detections — nothing
  transcribed.
- `tiles.js`: `builtPalette` washes the terrain palette toward cottage-grey
  mortar (0.55·score) and `cobbleBlock` darkens ~39% of a town tile's sub-blocks
  into grout — paved, not painted flat. Modern mode only; classic (`C`) stays a
  clean original sheet. Stepping onto built ground toasts once ("Cottages and
  smoke: a town lieth nigh."). `town` rides the harness state.
- `britanniacheck` +14 gates: level-builds, hard-terrain-never, per-gate radius
  (no bleed), strict decay, level plazas, every gate populated on real Britannia
  (18–41 built tiles), whole-map built-ground-is-flat, greyer-not-hued wash,
  mixHex identity+format, cobble determinism+scatter, and 5 wiring gates.
  Mutants: FLAT+rock reddens 2 (never-build + whole-map), TOWN_R=0 reddens the
  population gate, dropping the wash reddens wiring — each restored green.
- Still honest: these are tinted outskirts, not town *data* — walls, gates and
  enterable buildings come when the `.ULT` region files load in stage 2.

## iPhone portrait fit (#1147)
- The 1280x720 canvas is `w-full h-full object-contain`: portrait letterboxes
  to a correct-aspect band (square tiles) instead of squashing 3x tall.
- Pointer mapping (gate-menu hover + tap-to-move) subtracts the letterbox bars
  via `containMap()` in src/utils/fitCanvas.js — rect-relative math would land
  taps in the wrong game row.
- Night is readable at phone scale: overlay alpha 0.72->0.58 of the phase,
  torch radius 150->220; the shared RotateHint card asks landscape titles
  to rotate in portrait. `npm run portraitsweep` (port 390x844) hard-fails
  britannia/outrun/tempest if the stretch ever returns.
