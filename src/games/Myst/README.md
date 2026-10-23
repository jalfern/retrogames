# MYST — Cyan, 1993 (rebuilt in code)

First-person, node-to-node adventure. Every view is a still camera pose in a
live three.js world; travel is a fade, not a walk. Click/tap hot spots, or step
and turn with the arrow keys. No inventory UI, no hints — take notes, as in 1993.

## Engine notes
- `nodes.js` — the node graph: 18 camera poses (island, clock tower, cave,
  cabin, four Ages; Mechanical is a 5-node walkable set: landing, tower base,
  cage, gantry, control room) with hot spots. A spot with `to:` travels; `act:`
  runs a puzzle verb; `need:` gates it behind a flag; `reveal:` turns an
  illusion into a lever/door the first time you touch it; `visits:` hints the
  reachability audit about node changes an `act:` makes.
- `state.js` — the pure rules machine, `dispatch(state, action)` with zero DOM.
  Gates: palm illusion → tower lever → clock tower → Mechanical; matchbook →
  fireplace burn → Selenitic; star dials 4-1-3-2 → wood door → Channelwood;
  safe dial 8-5-2 → Stoneship. Mechanical's switch chain (5 levers, each throws
  its neighbours) unseals the red page on the gantry. The tower: the call lever
  brings the cage down; the cage rides up to the gantry; the cage at the
  landing jams the control-room door, so send it down before the release works;
  inside, the door bangs shut, floor plates hold door/cage only while pressed,
  and the latch lever freezes a pressed plate so you can walk out — the
  original's control-room puzzle. The SPECTATOR sphere shows the other Ages.
  Pages red/blue x four Ages; returning pages to
  a book clears its brother's corrupted message line by line; eight pages make
  the WHITE page appear. Freeing a brother requires the white page to exist —
  and then it traps you. Seating the white page brings Atrus home (`atrus`).
  `solveScript()` is the canonical winning route — the attract tour and the
  harness share it.
- `scene.js` — builds all 18 views as sibling groups spaced `GAP` apart on X;
  the camera teleports. Conventions: a node's camera faces world +z at
  `yaw 0`; spot bearings are relative degrees from there. Sea, fire, gears,
  waterfall offsets, steam and the illusion palm animate on every frame;
  Mechanical's mechanisms (cage on rails, jamming door, depressible plates,
  latch lever, gear seal) are driven live from `state.flags` via `updateMech`.
- `textures.js` — fbm value noise per material palette; `SKIES` gradients.
- `sound.js` — every action is synthesized via `audioController`; ambience
  (surf, wind, birds, fire, drips, gears, the sphere hum) is scheduled off the
  fixed-timestep loop, never `setTimeout`.
- One driver: the RAF loop owns the clock (`FIXED_DT 1000/60`, catch-up cap).

## Verify
```bash
npm run mystcheck            # Node: graph, every gate, all 8 pages, 3 endings
npm run mystcheck -- --mutate # the interlocks must be able to fail (14 mutants)
npm run mystplay             # browser (needs npm run dev): keys, travel, full win
npm run mystviewcheck        # browser: every one of the 18 views framed
npm run lint:myst
```
`mystcheck` was proven to fail: forcing the tower-door gate open (deleting the
`need` check in the `move` branch) turns it red; restoring turns it green. Three
more mutants target the Mechanical stage: un-jam the cage from the door slot,
un-shut the control-room door, and let an un-latched plate hold the door open —
each turns the suite red.

## Honest gaps vs the original
- #838 stage 1 made MECHANICAL walkable; Selenitic, Channelwood and Stoneship
  are still single-view with one gate each (next stages per the issue).
- The safe combination and the star/sphere codes are discoverable in-world but
  fixed (8-5-2; dome stars 4-1-3-2; tones 3-1-4-2); the original randomised
  some of these per save.
- No teleporting sound-book pages, no age-specific sub-puzzles beyond each
  Age's gate (Selenitic sphere, Mechanical switch chain + tower, Channelwood
  star-wheel, Stoneship observatory note), no rocket ride.
- The Spectator is a still panel listing the Ages, not a rendered age-vision.
- Ages' books link straight from their home node; there is no linking-book
  animation with the starfield travel.
- The ocean is one shared plane.
