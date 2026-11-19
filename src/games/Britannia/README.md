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
- **Boarding is free at any coast — DECIDED, the original's law (#2353 audit
  of the bundled `AVATAR.EXE`):** the original ships boarding as terrain
  transitions (`SHIPSHOR/SHIPSEA/SHORSHIP/SHIPSHIP.CON` strings) plus a bare
  `Board:` command — no fare on the port path, and every gold string in the
  exe is town NPC dialog (shops, bars, seers: the economy is stage-2 TLK
  work). Distance fares would CHANGE the original's rules, so they stay
  stage 2. The 5-gold captain's toll is OURS (stage-1 presentation law, not
  Origin's) — **CLOSED by #2345** on the toll half: the purse is live (GOLD 250 at the
  start, as the original's HUD carried it), every boarding pays the captain
  5 gold, and a light purse is refused on the sand. Distance fares for named
  port pairs and the shops themselves stay stage 2. — **SEEN by #2351**: the
  toll now reads without sound — a moored boat waits off any coast you face
  (at the waterline when the purse can pay the fare, an honest tile further
  out when it cannot — `moorReach` in purse.js), coins arc from sand to deck
  as the keel goes in, the HUD carries a minted coin glyph that dims when
  unpayable and flashes whenever gold moves, and the captain refuses in his
  own two-tone deny instead of borrowing the chapel thud. The under-way sail
  obeys the wind class (`sailState` in hull.js): full canvas in FRESH/GALE,
  reefed in STEADY, furled on a becalmed sea.
- Town walls/buildings are still tile terrain; enterable buildings are stage 2.
  — **CLOSED by #2538** for the WALLS half: six of eight gate-towns stand
  behind a seeded stone ring with one gate (#2516-ladder POLISH — see "Town
  walls" below). The enterable half is now data-proven stage-2, not choice:
  every `*.ULT` region file in the bundle is exactly 1280 B (terrain-only)
  and no `INSIDE.DAT` ships — the original's interiors/objects are not in
  the repo (audited 2026-11-17; don't-guess law).
- Classic mode (`C`) stamps the ORIGINAL terrain tiles: Origin's own
  terrain-named tilesets (`GRASS/MARSH/BRUSH/HILL/FOREST/SHORE.CON`, 192B =
  6×32B records; records 2..5 are four 8×8 chunky-4bpp variants, high nibble
  = left pixel; `BRICK.CON` is held for stage-2 cities). The filename is the
  terrain mapping — nothing guessed. `SHAPES.EGA` stays undecoded on purpose:
  its terrain→base table isn't in the bundle and the lone AVATAR.EXE candidate
  contradicts the sheet's colour runs, so wiring it would mislabel marsh vs
  heath vs plains (#1135 archaeology). Sea/cliff/plains have no named tileset
  and stay flat fills. The EGA map palette in `ega.js` reproduces the semantic
  colour use the tilesets prove (the original set it by port I/O at runtime). —
  **CLOSED by #2538** (88215bd shipped it the same day as the walls): `ega.js`
  decodes the six terrain CONs (+ BRICK) into classic stamps, `classicOn` wires
  them into the renderer, and britanniacheck proves the structure per file with
  a relabel mutant (FOREST↔GRASS swap goes red). The bullet outlived its own
  ship — an idle-ladder kick onto BRITANNIA gap 0 (2026-11-17) hit exactly this
  #961 shape: a stale gap re-kicking lanes onto closed work.

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

## Storms endanger the hull (#1829 item 1, hazard half)
- `hull.js`: the sea that was made FELT (#1822) and slow (#1829-drag) now
  bites — but only the STORM bites. Every sea tile crossed (boarding leg
  included) under a storm sky strains the planks `STRAIN_STORM` (=0.5) scaled
  by the tile's wind-memory: a full sea costs half a plank. Rain, snow and the
  beautiful post-front heave under blue sky cost NOTHING — in the original
  (Ultima IV, 1985) it is the storm itself that damages shipping, and a
  memory of rain must not kill what the rain couldn't. Strain state is
  `(hull, worn)`: integer planks plus an honest carried fraction, so small
  strains accumulate — no rounding into immortality. Capacity `HULL_MAX` = 12:
  a straight 24-tile storm crossing finishes a sound ship (exact, pinned).
- Foundering is never fatal, never winnable-breaking: when the last plank
  gives way (`hull <= 0 && worn <= 0`) the ship is lost, the storm's fury
  spent, and `nearestCoast` — a deterministic wrapped BFS over the one-body
  sea — puts the pilgrim back on open water with dry land at hand, hull 1,
  wreck not kindling. The pilgrimage survives any weather; gates stay
  reachable by moon-route alone.
- The shore heals: standing on dry land the hull knits back one point a tick
  (`repair`), bit-exact ceiling at capacity — a repaired ship is exactly the
  pre-hazard ship. The rescue coast itself (a sea tile) never heals her; the
  first step onto sand starts the mending.
- The player reads it before the numbers: every plank of loss creaks a low
  groan, rate-limited by `GROAN_GAP` = 20 ticks (the SPLAT_GAP doctrine — a
  hammering storm rattles, never machine-guns); a strained hull (half or
  below) goes dark and waterlogged under a tattered sail; the HUD swaps the
  ship word to `SHIP n`, gold sound, amber at half, red on the last planks.
  A foundering pays the full wreck bill: noise crash, falling sweep, and
  "The ship founders! The tide casts thee up upon the coast."
- `hull` rides the harness state; the hazard block writes only hull/worn/
  groan/cd + the rescue position — weather, drift and the drag law are
  untouched, so every pre-existing pin rides unchanged (calm and rain
  voyages replay bit-exact).
- Proof: britanniacheck +22 gates (HULL LAW block: booked profile 12/0.5,
  storm-only strain, monotone + clamped, half-points landing on whole planks,
  trickle accumulation, zero floor, repair ceiling/exact chain, the literal
  sink-at-24 and the heavy-rain-crossing-is-free voyage sims, deep-sea
  rescue sweep over the real map (40 tiles, always the same coast), dead-map
  centre rescue, 6 wiring/purity pins + the groan gap). Mutants die by name:
  `--mutate-hull-zero` (strain zeroed, 4 red), `--mutate-hull-sky` (rain
  eats hulls, 3 red), `--mutate-founder` (the pilgrim drowns, 1 red) — tree
  restores green. `britannidrive` lives it with locked-loop real motion: the
  epoch-2 corridor (12 storm tiles) costs exactly half the hull with panel ==
  node fold over the drive's own recorded legs; amber HUD ink proves the
  danger is painted; the epoch-5 blow founders the ship at the booked tile
  and washes her onto a coast tile; the epoch-19 calm sails on a sound hull.
- Honest tail: hull is per-ship and invisible to the storm-free landlubber —
  which is the point; combat-style attrition and ship purchase/repair shops
  stay stage 2.

## Purse & passage toll (#2345)

In the original (Ultima IV, Origin 1985) the party carries gold from the first
minute — the HUD's `GOLD 250` — and no captain weighs anchor unpaid. Until this
stage Britannia's sea was free at any beach; now the economy's first organ
lives:

- `purse.js` (pure + deterministic): `START_GOLD` = 250 (the original's starting
  purse), `FARE` = 5 gold a boarding, `TRIBUTE` = 20 at each day turn.
  The original's fares ran by port distance (5/10/25); stage 1 has no port
  pairs, so we honour its RULE (every passage is paid, in gold) rather than
  fake its rows — the #1862 doctrine again.
- **The toll bites at the beach:** boarding asks `payToll(S.gold)` before the
  keel goes in. Paid: the creak plus two square-wave coin chinks, the toast
  names the fare. Refused: the chapel-stone pattern (cooldown, buzz, refusal
  names the fare), the pilgrim stays dry and the gold stays — refusal is a
  door, not a fine.
- **The dawn tribute is OURS, not Origin's**: the eight gate-towns tithe their
  Avatar 20 gold at every day turn (capped at the bounty — the land taxes, it
  does not mint). It exists because stage 2's chests/trade are not here yet;
  replace it then (see tail). With it, two boardings a day live on the land
  forever; six a day drains the bounty by day 23 and the captain shutteth the
  sea until thrift returns.
- **Presentation:** `PURSE n` rides the HUD bar in gold ink (red when the next
  fare cannot be paid), the toast speaks toll and tithe, and `gold/fare/day`
  ride the harness state (`setGold` + an `empty purse` DebugKit cheat drive
  the refusal). The state hash carries gold, so a replay that dodged a toll
  hashes differently.
- `britanniacheck` +28 gates: spec values pinned literal (250/5/20), the toll
  law (exact-zero pays, four refuseth, no gold debts, determinism), the tithe
  law (cap, clamps, monotone), the economy at scale — moderate pilgrim rides
  the tithe forever, and a spendthrift's refusal day is booked twice (a
  literal loop written beside the module-run one, #1822: they must agree on
  day 23), the closed sea for penniless and its reopening, winnable-with-an-
  empty-purse (the moon chain never asks a captain), purity, and wiring pins.
  Mutants: `--mutate-toll-free` (refusal deleted, 2 red),
  `--mutate-purse-hollow` (bounty emptied, 5 red), `--mutate-tithe-mint`
  (cap lifted, 3 red) — each restored green.
- Honest tail: the tithe is invented glue (see above); per-port distance fares,
  purchase, repair and plunder all wait for stage 2's shops.

## Verify

```bash
npm run britanniacheck       # data integrity + rules + winnability (Node, no browser)
npm run britannreadycheck    # readiness law (#2770): publish-after-stand + start-at-landing (dev server on $DEV_PORT)
npm run britannidrive        # real-key browser drive (needs `npm run dev` on $DEV_PORT)
npm run dev                  # play at /retrogames/britannia
```

## Drivable at expose — the readiness law (#2770)

The nightly bot hit `tick did not advance on step 1` (#2769): the DEV contract
used to publish `__game` at mount, while the world still unrolled (fetch of
`games/ultima4.jsdos` → inflate → star/land plots → `S = fresh(0)`). Inside that
window `reset`/`tick` silently no-op (`if (S)`), so a harness that waits only
for `__game` drives a corpse; on a loaded machine (multi-lane CI) the drive
lands in the window and the run stalls at step 1. The law now: **nothing is
published until the world stands** — `exposeGame`/`__britanniaTest`/DebugKit
are *built* at mount (`devUp`) and *run* at the end of `load()`, so the first
sight of `__game` is drivable: `state().ready` is true and the first `step`
advances one tick.

Same seam, player half: a key or tap that arrives while Britannia unrolls used
to be dropped or leak as a stale buffered action. It now **arms the start** —
the instant the map is ready the game begins (attract's "any key or tap" law,
honoured early); held keys keep walking, stale one-shot taps are drained.

Harness: `npm run britannreadycheck` (lane-advisory, listed in
`MANUAL_CHECKS`) route-throttles the map fetch +2.5 s to widen the load window
and proves both halves plus source laws pinning the shape. Mutant: calling
`devUp()` at mount — 7 gates red, and the drivability probe reproduces the
nightly signature verbatim (`ready:false, t0:0, t1:0`).

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
- The sea speaks (#1829 item 3): `swell.js` marks each dimple ring with `o`
  (the tick its drop LANDS, `ph === 0`) and `splashStrikes(tx, ty, i, t, seed)`
  counts the rings opening this tick — the voice and the paint read ONE hash
  field, so sound can never drift from what the player sees. `index.jsx` fires
  a soft `playNoise` (volume and length scale with the sky: storm loudest, snow
  dullest) whenever a ring opens on the sea tile under the Avatar — the same
  truth `seaRain` exposes — rate-limited by `SPLAT_GAP = 8` so a storm
  shatters but never machine-guns. Land-locked skies stay silent; a glass sea
  never speaks. View/audio only: the block writes only `S.splat`.
  `britanniacheck` +10 gates: determinism, glass-sea silence, the one-source
  law (strikes == rings opening, 1800 ticks), strike-on-fresh-ring alignment,
  storm>rain>snow strike ordering, the gap law, 4 wiring/purity pins.
  Mutants: `o: ph === 0.5` (sound lands on a mid-life ring) reddens 3 gates
  (fresh-ring alignment, storm>rain>snow ordering, the landing-tick pin);
  `SPLAT_GAP: 600` (one splash per ten seconds) reddens the gap law — each
  restored green.
- Still honest: no surf roar beneath the ship in a blow until #1829-item-1
  (below) gave the hull its voice. (The "no swell of its own" caveat here is
  superseded by #1822 below — wet skies now lift the crests and foam through
  the wind-memory.)

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

## The sea reads aboard (#1829 item 1)
- `swell.js`: `shipCd(rough, calmCd)` gives sea state a hand on the tiller —
  the cooldown for the next sea tile is the calm cadence plus `SAIL_DRAG` (=4)
  ticks scaled by the wind-memory of the tile just crossed (`seaRough`).
  Calm is bit-exactly the old cadence (every pre-existing voyage replays
  unchanged); the law is integer, monotone and clamped, so the hash law
  survives. `surfVoice`/`surfDue` give the hull a roar: silent below
  `SURF_FLOOR` (calm aboard stays quiet), gaps close as the sea heaves with
  an 8-tick floor (the SPLAT_GAP law — a storm rattles, never machine-guns).
  Pure rough+tick: the voice can never drift from the swell the painter draws.
- `index.jsx`: boarding and mid-sea moves set `S.cd = shipCd(seaRough(...),
  SHIP_CD)`; aboard, the hull sounds when `surfDue` says; `shipCd` rides the
  harness state for panel parity.
- Gates: britanniacheck's SAIL LAW block (calm identity, monotone integer
  drag, clamped inputs, surf silence + cadence) and britannidrive's live law
  — loop locked, due south off gate V, boarding at (235,254), the same
  480-tick voyage run at epoch 57 (corridor-bit-calm: every sea gap is
  exactly SHIP_CD+1) and epoch 18 (corridor at full swell: every gap >= 8):
  calm gains ~9 tiles on the same budget, and the panel's `shipCd` matches
  the node drag law at the ship's tile.
- Still honest: fronts vary speed only through the drift wind (#1853) —
  pressure-style variation is item 2, pinned by the drift law. (The surf roar
  landed in #1829-item-1 below, and storms now endanger the hull — see
  "Storms endanger the hull".)

## Town walls — the gate-towns become places (#2538, POLISH #2516 ladder)

In the original (Ultima IV, Origin 1985) every town is walled with a gate.
Until now ours were open tinted skirts. `walls.js` (pure + deterministic, the
village.js family) rings each gate-town at Chebyshev 3 with stone that sits
only on level town ground — never sea, cliff, hill, forest, marsh, sand, gate,
sanctum or cottage (so boarding, chapels and hearths are untouched). Exactly
ONE opening per town, its cardinal side hashed from the gate's coordinates:
learnable and stable, honouring the RULE of walled towns without faking
Origin's per-town gate table (not in the bundle).

- **Two laws, both booked in britanniacheck, never strands** — the plaza must
  reach the wider land THROUGH the gate; **never costs a road** — land
  connectivity on the radius-6 rim with walls must equal connectivity without
  them (an isthmus never dies by masonry). Survive neither on any side? The
  town stays honestly unwalled: on real Britannia **6 towns wall up**, gates
  II (161,21) and VI' (231,235) are thin isles with <6 level ring tiles.
- **Feel:** the wall is stone — its own knock (116->78 Hz; chapel 96->60,
  cottage 82->50), a first-touch refusal naming the gate's side, and
  "Thou enterest the town by its gate." when you cross the threshold.
- **Look:** modern tiles get seeded stone courses with lit capstones and the
  occasional moss patch; classic (`C`) stamps **Origin's own BRICK.CON** —
  the tileset ega.js held for the stage-2 cities — decoded in
  `buildBrickStamps` and selected with variant seed 9.
- Harness +14 gates (booked 6-walled result, determinism 40x, siting/ring/
  strand/road laws recomputed in the check, foreign-world honesty both ways,
  purity, wiring pins); mutants `--mutate-wall-flat` and `--mutate-wall-noopen`
  each die and restore. The known britannidrive walks (spawn gate VI boarding
  south, gate VI sanctum west, gate III walk-off north) sit on open or unwalled
  sides — verified against the side table before ship; a dedicated
  knock-and-enter drive step is the fair follow-up.

## Village craft — eight towns that read inhabited (#2499 polish pass)

The polish pass over the village substance (#2494) and the town walls
(#2538). Two laws landed here (items 1 doors and 4 footstep-voice had
already shipped with their gates):

- **Eight greetings.** The arrival toast was one copy-paste line for all
  eight towns. `village.js:townToast` keys a fixed 8-line table to the
  gate whose ground you enter (`nearestGateIndex`, wrapped Chebyshev,
  first wins ties) — gate I keeps the original `#1135` ink
  ("Cottages and smoke: a town lieth nigh."). Honest tail: these are
  flavor lines, NOT recovered names — AVATAR.EXE's town-name table is not
  in the bundle (#1829 item 5 stands); the boards carry terrain ids only.
- **Lamps at night.** `village.js:lampLit` seats the lamp law on the
  cottage's own seed hash: most cottages burn a warm halo after nightfall
  (the original's towns read inhabited even empty), the shuttered third
  keep the traveller's dark, and the village lights identically every
  night — seeded, never rolled.
- **Shingled roofs.** `village.js:roofShade` picks a seeded two-tone
  variant; the view lays courses up the pitch with the eastern half sunk
  (as the chapel's slate keeps the sun west) and a ridge cap at the peak,
  so cottage ink separates from ordinary town green at a glance.

Harness +13 gates (toast table distinctness/wrap/gate-I ink, nearest-gate
law, lit-fraction strictly between 0 and the cottage count, both roof
shades on the shelf, purity, wiring pins into index.jsx; the #1135
toast-once pin re-targeted to the new call). Mutants
`--mutate-toast-same`, `--mutate-lamp-dark`, `--mutate-roof-flat` each
die and restore. Still honest: interiors and NPC talk remain stage 2
(#1128); the halo is cosmetic — lamps obey nothing but the hash.
