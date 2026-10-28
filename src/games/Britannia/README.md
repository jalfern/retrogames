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
  the original's moon-phase routing and shrine destinations arrive with
  stage 5. Names (Britain, Trinsic…) arrive when town/talk data loads.
- Boarding is free at any coast (the purchase lives in stage 2's shops).
- Town walls/buildings are still tile terrain; enterable buildings are stage 2.
- Classic mode (`C`) approximates the EGA look with raw terrain shades;
  decoding `SHAPES.EGA` tile graphics for a true tile sheet is queued.

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
