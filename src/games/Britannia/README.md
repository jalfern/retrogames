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
  lightning + delayed thunder — and the whole pattern drifts west-to-east at
  one region per epoch (`driftOf`), so fronts travel and a cell keeps its kind
  as it rides. Fronts ignore terrain (no rain shadow behind the mountains),
  move at constant speed, and add nothing on the sea surface beyond the tint.
- Moongates warp between the 8 detected stars with a destination picker;
  the menu names each gate for its virtue-moon (moons.js, the eight-wheel
  homage to the original) and prints tonight's phase with a lit-disc glyph —
  phase = day count mod 8, pure + deterministic so `britanniacheck` proves
  the wheel (plus a bad-wheel mutant that goes red).
  the original's moon-phase routing and shrine destinations arrive with
  stage 5. Names (Britain, Trinsic…) arrive when town/talk data loads.
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

## Verify

```bash
npm run britanniacheck      # data integrity + rules + winnability (Node, no browser)
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
