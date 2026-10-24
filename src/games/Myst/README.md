# MYST — Cyan, 1993 (rebuilt in code)

First-person, node-to-node adventure. Every view is a still camera pose in a
live three.js world; travel is a fade, not a walk. Click/tap hot spots, or step
and turn with the arrow keys. No inventory UI, no hints — take notes, as in 1993.

## Engine notes
- `nodes.js` — the node graph: 28 camera poses (island, clock tower, cave,
  cabin, four Ages; Mechanical is a 5-node walkable set: landing, tower base,
  cage, gantry, control room; Selenitic is a 5-node walkable set: landing,
  sounding path, throne chamber, terraces, summit ledge; Channelwood is a
  4-node walkable set: landing, channels, star terrace, observatory;
  Stoneship is a 3-node walkable set: pier, ship's quarterdeck, ridge
  observatory) with hot spots.
  A spot with `to:` travels; `act:` runs a puzzle verb; `need:` gates it behind
  a flag; `reveal:` turns an illusion into a lever/door the first time you
  touch it; `visits:` hints the reachability audit about node changes an
  `act:` makes.
- `state.js` — the pure rules machine, `dispatch(state, action)` with zero DOM.
  Gates: palm illusion → tower lever → clock tower → Mechanical; matchbook →
  fireplace burn → Selenitic; star dials → wood door → Channelwood; safe dial
  → Stoneship — and the safe/star/sphere codes are stamped per save (#1005,
  see `codes.js`). Mechanical's switch chain (5 levers, each throws
  its neighbours) unseals the red page on the gantry. The tower: the call lever
  brings the cage down; the cage rides up to the gantry; the cage at the
  landing jams the control-room door, so send it down before the release works;
  inside, the door bangs shut, floor plates hold door/cage only while pressed,
  and the latch lever freezes a pressed plate so you can walk out — the
  original's control-room puzzle. The SPECTATOR sphere shows the other Ages
  through four glass lenses (#1024): each lens is sealed until its Age's book
  is linked — `spectatorViews(s)` reads the `link_<age>` flags, and #1024
  fixed `link_channelwood`, which no route had ever set (the star-panel solve
  now fires `link:channelwood` the way the safe fires `link:stoneship`).
  Selenitic's chain: six stepping stones ring ascending pitches (biggest =
  lowest, as in the original) — any wrong stone buzzes and resets, the full
  route grinds the cliff gate open; the throne swivels through eight detents
  and only the sun-and-moon detent frames both lights and opens the mountain;
  the summit slot hands over the brass SELENITIC GEAR (one of Mechanical's
  five). Pages red/blue x four Ages; returning pages to
  a book clears its brother's corrupted message line by line; eight pages make
  the WHITE page appear. Freeing a brother requires the white page to exist —
  and then it traps you. Seating the white page brings Atrus home (`atrus`).
  `solveScript(codes)` is the canonical winning route — the attract tour and the
  harness share it; it reads the save's codes, so it solves any seeded island.
  The ROCKET (#1010): the metal seam in the cave opens only after you read the
  AMATEM observatory note to its reader-plate. Inside the silo: board the
  saddle, throw the ignition, and the loop's `tick` action flies the rest —
  ignite → liftoff → ascent → coast → reentry → splash, `RIDE` holding the
  seconds per stage (~10 s, the original's FMV scaled down). Mid-flight every
  input but the tick is refused (the rocket drives you); the coast stage is
  deliberately, assertedly silent. Splashing down is the fourth ending:
  `surface`, escape. The SELENITIC SOUND-BOOK (tree stump by the landing)
  echoes any of the six stones' true pitches (`echo` action → the same
  `stone:<i>` events the field rings), so the path order is learnable in-world
  like the original's pages. THE STAR-WHEEL (#1014): Channelwood's lock. The
  great wheel carries three concentric rings of five star-symbols (4–8 points);
  clicking a ring turns it one notch (`dial` pad `wheel`, wrapping mod 5) and
  answers with its own weighted clunk. The alignment is stamped per save
  (`codes.wheel`), and the observatory drum above the terrace wears the
  answer — three glowing clue-stars left/crown/right for outer/middle/inner,
  their points this island's, spelled in words on the rim (`starDrum`). When
  the rings stand true, `wheelOpen` grinds the hub aside and the CHANNELWOOD
  linking book inside is the Age's way home (`hubBook` → cave); until then the
  hub cover and the landing return panel both refuse — as in 1993, the last
  Age found keeps its own exit.
- `codes.js` — per-save codes (#1005), the original's per-copy combination
  stamps. One 32-bit seed per fresh game (pin with `?seed=N`; a fresh game
  without a pin draws a new one, so a restart is a new book of Myst).
  mulberry32 derives: safe = 3 digits 1-9, star = permutation of sizes 1-4,
  sphere = permutation of the four posts, wheel = three distinct notch positions
  0–4 for the star-wheel's outer/middle/inner rings (#1014). Clues stay in-world: Atrus's shelf
  note spells the safe digits in words, the cave dome grows four stars whose
  SIZE rank is the star code (rebuilt by `updateTrueStars` on every seed
  change), the sphere's posts sing the seeded ring order (`sing:<code>`
  event → soundplan), and the observatory drum wears the wheel's seeded
  point-counts (rebuilt by `updateWheel`). Same seed, same island; different
  seed, different lock.
- `scene.js` — builds all 27 views as sibling groups spaced `GAP` apart on X;
  the camera teleports. Conventions: a node's camera faces world +z at
  `yaw 0`; spot bearings are relative degrees from there. Sea, fire, gears,
  waterfall offsets, steam and the illusion palm animate on every frame;
  Mechanical's mechanisms (cage on rails, jamming door, depressible plates,
  latch lever, gear seal) and Selenitic's (stones sinking when rung, cliff
  gate slab, swiveling throne, sun disc appearing only at the alignment,
  mountain door, gear lifting from its slot) are driven live from `state`
   via `updateMech` (the Channelwood sluice gate, channel water and float ride `chanFlood`).
   The star-wheel (#1014) is one `wheelAssembly` built twice (landing + terrace):
   three symbol rings riding `state.wheelDial` (`chanRing0..2`, shortest way
   round), a bronze mark at the crown, and a hub cover that slides clear on
   `wheelOpen` (`chanHub`) to lay the linking book bare; the observatory drum
   wears the seeded clue-stars (`clueStar`, rebuilt by `updateWheel`). Views face +z: put what the caption promises at
   greater z than the camera, and check the moon's ray — corridor walls,
   lintels and buttresses silently eat it. Stoneship (#996) is three static
   sibling views — pier, quarterdeck (the bare mast is the landmark) and the
   ridge dome — joined by free `to:` travel, with no live mechanism to drive.
- `visions.js` — the SPECTATOR's age-visions (#1024): a circular glass pane
  painted on a 2D canvas per Age — green storm + dome + sounding rings + a
  timed lightning flash (Selenitic), teal swell + low sun + rocking ship
  (Stoneship), forge glow + two meshed gears + rising sparks (Mechanical),
  drifting cloud banks + falls + the star-wheel in silhouette (Channelwood).
  Every pixel is a pure function of world time `t` — no `Math.random` — and an
  unlinked age draws a grey sealed churn instead. `mystcheck` replays the
  painter through a recording ctx stub: same instant must paint the same
  picture, two instants must differ, sealed must never equal open.
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
npm run mystcheck            # Node: graph, every gate, all 8 pages, 4 endings, seeded locks, the ride, the wheel, the lenses
npm run mystcheck -- --mutate # the interlocks must be able to fail (45 mutants)
npm run mystplay             # browser (needs npm run dev): keys, travel, full win, seed wire-up, the wheel + the Spectator lenses live
npm run mystviewcheck        # browser: every one of the 28 views framed
npm run lint:myst
```
`mystcheck` was proven to fail: forcing the tower-door gate open (deleting the
`need` check in the `move` branch) turns it red; restoring turns it green. Three
more mutants target the Mechanical stage: un-jam the cage from the door slot,
un-shut the control-room door, and let an un-latched plate hold the door open —
each turns the suite red. Seven more target Selenitic: any-order stones, the
gate stuck shut, alignment at every detent, the mountain door ignoring the
alignment, a gear slot that keeps giving, six stones collapsing to one pitch,
and a silent buzz. Two more target the walkable Stoneship (#996): the rock stair
that stops reaching the observatory, and an observatory that stops recording the
note — each turns the suite red. One targets the seeded locks (#1005): an
island that ignores its seed and stamps every save the same — the determinism
and different-locks gates catch it (it survived its first draft because the
gate compared the seed FIELD, not the locks; compare locks, always). Four
target the rocket (#1010): a seam that opens to a bare hand, a ride that never
reaches the surface, mid-flight steering that is accepted (the rider rides
instead of ticking — the gate checks rideT, not just the events), and a
sound-book whose pages all echo one stone. Five target the star-wheel (#1014):
a wheel that opens at any alignment, a hub cover that stopped needing the stars,
a landing panel that never sealed with the wheel, a drum that preaches one fixed
sky to every island, and three rings collapsed to one clunk. Three
target the Spectator lenses (#1024): a sphere that forgets which ages you
walked, lenses that stopped showing visions, and a vision frozen outside
time — each turns the suite red.

## Honest gaps vs the original
- **CLOSED by #838/#989/#996** — all four Ages are walkable node sets:
  MECHANICAL and SELENITIC (stage 1-2), CHANNELWOOD (channels + star terrace,
  flood lever floats the raft), STONESHIP (pier, quarterdeck, ridge
  observatory, free on-foot travel to the note).
- **CLOSED by #1005** — the safe, star and sphere codes are seeded per save
  and every clue (note words, dome-star sizes, post sequence) rides the seed,
  as the original stamped them per game copy. Residual: the original kept a
  code for the lifetime of a SAVE FILE; an unpinned reload used to re-roll
  the island (`?seed=N` pins it).
- **CLOSED by #1008** — the seed notebook: the seed lives in localStorage
  (`myst:save-seed`), so a returning explorer finds the same locks where
  they left them; `?seed=N` still pins over the notebook, private-mode
  storage degrades to per-visit islands, and a post-ending restart recasts a
  new island (new stored seed + a one-line hint). Also #1008: while the
  sphere's posts sing, slot *i* visibly ticks ring *i* (panel button amber +
  the post bulb flashing `codes.sphere[i]`) via pure `singTicks()`; the four
  dome stars carry distinct 4-/5-/6-point silhouettes (`STAR_SHAPES`, fixed
  per slot — size stays the only clue) and twinkle on a slow phase-shifted
  emissive cycle, separate from the background point field. The
  sounding-path order (biggest→smallest) and the sun-and-moon detent stay
  fixed — in the original they are world constants, not per-save rolls.
- **CLOSED by #1010/#1014/#1017** — every Age now holds sub-puzzles beyond its
  gate: Selenitic's sphere, sounding path, throne and gear; Mechanical's switch
  chain, cage tower and control room; the Stoneship observatory note; the cave's
  metal seam reads the AMATEM note and the ROCKET rides to a fourth, escape
  ending; the Selenitic sound-book replays the sounding path's true pitches.
  #1017 turned the Channelwood star-wheel from decoration into the Age's axle
  lock: five spokes, one worn notch, one groove cut in the housing under the
  axle — at detent 3 the notch drops home, the falls catch the vanes, and the
  grinding axle throws the wheel-shelter's stone lock over a second brass gear
  (two of five, it said on the tower of Mechanical). #1014 stacked the sky's
  lock on the same wheel: three rings of star-symbols aligned by the
  observatory drum's seeded sky (`codes.wheel`), the Age's linking book sealed
  inside the hub until they stand true — as in the original, where Channelwood
  kept its own way home.
- **CLOSED by #1024** — the Spectator is four live glass lenses, one per
  Age: the green storm with its rings and flash, the teal sea with the
  rocking ship, the forge with meshed gears and sparks, the cloud world
  with the wheel — every picture a pure function of the world clock, and
  each lens stays a sealed grey churn until you link that Age's book.
- Ages' books link straight from their home node; there is no linking-book
  animation with the starfield travel.
- The ocean is one shared plane. Selenitic's grass-covered grey dome shape is
  suggested with rings and terraces, not the original's full terrain sculpt.
