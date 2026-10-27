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
