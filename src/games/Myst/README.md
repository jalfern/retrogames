# MYST — Cyan, 1993 (rebuilt in code)

First-person, node-to-node adventure. Every view is a still camera pose in a
live three.js world; travel is a fade, not a walk. Click/tap hot spots, or step
and turn with the arrow keys. No inventory UI, no hints — take notes, as in 1993.

## Engine notes
- `nodes.js` — the node graph: 24 camera poses (island, clock tower, cave,
  cabin, four Ages; Mechanical is a 5-node walkable set: landing, tower base,
  cage, gantry, control room; Selenitic is a 5-node walkable set: landing,
  sounding path, throne chamber, terraces, summit ledge; Channelwood is a
  3-node walkable set: landing, channels, star terrace) with hot spots.
  A spot with `to:` travels; `act:` runs a puzzle verb; `need:` gates it behind
  a flag; `reveal:` turns an illusion into a lever/door the first time you
  touch it; `visits:` hints the reachability audit about node changes an
  `act:` makes.
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
  Selenitic's chain: six stepping stones ring ascending pitches (biggest =
  lowest, as in the original) — any wrong stone buzzes and resets, the full
  route grinds the cliff gate open; the throne swivels through eight detents
  and only the sun-and-moon detent frames both lights and opens the mountain;
  the summit slot hands over the brass SELENITIC GEAR (one of Mechanical's
  five). Pages red/blue x four Ages; returning pages to
  a book clears its brother's corrupted message line by line; eight pages make
  the WHITE page appear. Freeing a brother requires the white page to exist —
  and then it traps you. Seating the white page brings Atrus home (`atrus`).
  `solveScript()` is the canonical winning route — the attract tour and the
  harness share it.
- `scene.js` — builds all 24 views as sibling groups spaced `GAP` apart on X;
  the camera teleports. Conventions: a node's camera faces world +z at
  `yaw 0`; spot bearings are relative degrees from there. Sea, fire, gears,
  waterfall offsets, steam and the illusion palm animate on every frame;
  Mechanical's mechanisms (cage on rails, jamming door, depressible plates,
  latch lever, gear seal) and Selenitic's (stones sinking when rung, cliff
  gate slab, swiveling throne, sun disc appearing only at the alignment,
  mountain door, gear lifting from its slot) are driven live from `state`
  via `updateMech` (the Channelwood sluice gate, channel water and float ride `chanFlood`). Views face +z: put what the caption promises at
  greater z than the camera, and check the moon's ray — corridor walls,
  lintels and buttresses silently eat it.
- `textures.js` — fbm value noise per material palette; `SKIES` gradients with
  seeded starfields (dusk/selenitic) and soft cloud banks (day/stoneship/dusk).
- Atmosphere (#928): the shared `DirectionalLight` rides the camera and casts a
  1024² shadow map (solids cast, everything but the sky receives); ACES tone
  mapping; `atmosphere(id)` (exported from `scene.js`) retints fog (per-Age color + range) and the
  sun (hue + intensity) on every travel — dusk amber on the island, green
  haze in Selenitic, forge-orange in Mechanical, near-dark in interiors.
  All materials carry a self-bump (`bumpMap` = their own noise, softer on
  metal); every view is dressed with props (crates, barrels, boulders, tufts,
  braziers, pipes) placed clear of the caption's landmark sightlines.
- `sound.js` — every action is synthesized via `audioController`; ambience
  (surf, wind, birds, fire, drips, gears, the sphere hum) is scheduled off the
  fixed-timestep loop, never `setTimeout`. The sounding stones each ring their
  own pitch (`stone:0..5` events); a wrong stone is a detuned saw buzz. The
  sounding field (`selSound`) also drones a low approach hum (`hum`, `amb:'stones'`)
  so the rock feels alive before you touch it.
- One driver: the RAF loop owns the clock (`FIXED_DT 1000/60`, catch-up cap).

## Verify
```bash
npm run mystcheck            # Node: graph, every gate, all 8 pages, 3 endings
npm run mystcheck -- --mutate # the interlocks must be able to fail (22 mutants)
npm run mystplay             # browser (needs npm run dev): keys, travel, full win
npm run mystviewcheck        # browser: every one of the 22 views framed
npm run lint:myst
```
`mystcheck` was proven to fail: forcing the tower-door gate open (deleting the
`need` check in the `move` branch) turns it red; restoring turns it green. Three
more mutants target the Mechanical stage: un-jam the cage from the door slot,
un-shut the control-room door, and let an un-latched plate hold the door open —
each turns the suite red. Seven more target Selenitic: any-order stones, the
gate stuck shut, alignment at every detent, the mountain door ignoring the
alignment, a gear slot that keeps giving, six stones collapsing to one pitch,
and a silent buzz.

## Honest gaps vs the original
- #838 stage 1 made MECHANICAL walkable; stage 2 made SELENITIC walkable;
  stage 3 (#989) made CHANNELWOOD walkable (channels + star terrace, flood
  lever floats the raft). Stoneship is still single-view with one gate
  (next stage per the issue).
- The safe combination and the star/sphere codes are discoverable in-world but
  fixed (8-5-2; dome stars 4-1-3-2; tones 3-1-4-2); the original randomised
  some of these per save. The sounding-path order (biggest→smallest) and the
  sun-and-moon detent are fixed too.
- No teleporting sound-book pages, no age-specific sub-puzzles beyond each
  Age's gate (Selenitic sphere + path/throne/gear, Mechanical switch chain +
  tower, Channelwood star-wheel, Stoneship observatory note), no rocket ride.
- The Spectator is a still panel listing the Ages, not a rendered age-vision.
- Ages' books link straight from their home node; there is no linking-book
  animation with the starfield travel.
- The ocean is one shared plane. Selenitic's grass-covered grey dome shape is
  suggested with rings and terraces, not the original's full terrain sculpt.
