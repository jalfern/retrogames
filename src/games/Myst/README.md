# MYST — Cyan, 1993 (rebuilt in code)

First-person, node-to-node adventure. Every view is a still camera pose in a
live three.js world; travel is a fade, not a walk. Click/tap hot spots, or step
and turn with the arrow keys. No inventory UI, no hints — take notes, as in 1993.

## Engine notes
- `nodes.js` — the node graph: 14 camera poses (island, clock tower, cave,
  cabin, four Ages) with hot spots. A spot with `to:` travels; `act:` runs a
  puzzle verb; `need:` gates it behind a flag; `reveal:` turns an illusion into
  a lever/door the first time you touch it.
- `state.js` — the pure rules machine, `dispatch(state, action)` with zero DOM.
  Gates: palm illusion → tower lever → clock tower → Mechanical; matchbook →
  fireplace burn → Selenitic; star dials 4-1-3-2 → wood door → Channelwood;
  safe dial 8-5-2 → Stoneship. Pages red/blue x four Ages; returning pages to
  a book clears its brother's corrupted message line by line; eight pages make
  the WHITE page appear. Freeing a brother requires the white page to exist —
  and then it traps you. Seating the white page brings Atrus home (`atrus`).
  `solveScript()` is the canonical winning route — the attract tour and the
  harness share it.
- `scene.js` — builds all 14 views as sibling groups spaced `GAP` apart on X;
  the camera teleports. Conventions: a node's camera faces world +z at
  `yaw 0`; spot bearings are relative degrees from there. Sea, fire, gears,
  waterfall offsets, steam and the illusion palm animate on every frame.
- `textures.js` — fbm value noise per material palette; `SKIES` gradients.
- `sound.js` — every action is synthesized via `audioController`; ambience
  (surf, wind, birds, fire, drips, gears, the sphere hum) is scheduled off the
  fixed-timestep loop, never `setTimeout`.
- One driver: the RAF loop owns the clock (`FIXED_DT 1000/60`, catch-up cap).

## Verify
```bash
npm run mystcheck            # Node: graph, every gate, all 8 pages, 3 endings
npm run mystplay             # browser (needs npm run dev): keys, travel, full win
npm run lint:myst
```
`mystcheck` was proven to fail: forcing the tower-door gate open (deleting the
`need` check in the `move` branch) turns it red; restoring turns it green.

## Honest gaps vs the original
- The safe combination and the star/sphere codes are discoverable in-world but
  fixed (8-5-2; dome stars 4-1-3-2; tones 3-1-4-2); the original randomised
  some of these per save.
- No teleporting sound-book pages, no age-specific sub-puzzles beyond each
  Age's one gate (Selenitic sphere, Mechanical switch chain, Channelwood
  star-wheel, Stoneship observatory note), no rocket ride.
- Ages are single-view, not walkable; the ocean is one shared plane.
- The two bad endings are reached by clicking a restored book once the white
  page exists; there is no separate "speak the words" dialog.
- Ages' books link straight from their home node; there is no linking-book
  animation with the starfield travel.
