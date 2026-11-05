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
   #1027: the first time you open the sphere with a lens now thawed it fires
   `thaw:<age>` (first-time only, per save; sealed lenses never sing) — the
   soundplan answers with a soft per-Age colour note (`THAW_TONES`, a warm-up
   sweep into each Age's pitch). The panel renders each lens at 2× its
   on-screen size (crisp gear/ship/wheel detail) and stacks them one column
   on phones, two on wider screens. The attract title screen carries the four
   lenses live (all four Ages) as the Spectator shot — the dock tour can never
   reach the sphere itself, which sits behind Mechanical's door.
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
- `terrain.js` — the SELENITIC sculpt (#1033): pure `domeHeight(x, z, view)`
  displaces a 400-unit heightfield in `scene.js`; per-view crests, smooth
  falloff (rim/core), a below-sea skirt, and flat carves for the landing pad
  and the sounding corridor. `AGE_GROUND` (#838 item 1) and `ISLAND_GROUND`
  (#838 item 3) carry the same shape per outdoor view of the other Ages and the
  island itself — bed, crest, skirt to sea floor, flats under every path.
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
   Stoneship (#996) is three sibling views — pier, quarterdeck (the bare mast is the
   landmark) and the ridge dome — joined by free `to:` travel; since #838 item 12 the
   hull and deck ride `shipFloat` (see the sea.js notes below), so it is not static
   like the old builder was.
   The star-wheel (#1014) is one `wheelAssembly` built twice (landing + terrace):
   three symbol rings riding `state.wheelDial` (`chanRing0..2`, shortest way
   round), a bronze mark at the crown, and a hub cover that slides clear on
   `wheelOpen` (`chanHub`) to lay the linking book bare; the observatory drum
   wears the seeded clue-stars (`clueStar`, rebuilt by `updateWheel`). Views face +z: put what the caption promises at
   greater z than the camera, and check the moon's ray — corridor walls,
   lintels and buttresses silently eat it.
- `visions.js` — the SPECTATOR's age-visions (#1024): a circular glass pane painted on a 2D canvas per Age — green storm + dome + sounding rings + a
  timed lightning flash (Selenitic), teal swell + low sun + rocking ship
  (Stoneship), forge glow + two meshed gears + rising sparks (Mechanical),
  drifting cloud banks + falls + the star-wheel in silhouette (Channelwood).
   Every pixel is a pure function of world time `t` — no `Math.random` — and an
   unlinked age draws a grey sealed churn instead. `mystcheck` replays the
   painter through a recording ctx stub: same instant must paint the same
   picture, two instants must differ, sealed must never equal open. #1027
   widens the sealed-vs-dim-storm gap so the two read apart on a low-quality
   phone screen: the sealed pane drops to a near-black neutral floor while the
   dim Selenitic keeps a clear green floor (a brighter, greener at-rest sky),
   and the Selenitic lightning stays a brief 160 ms window of its 6.4 s cycle —
   its flash colour lives only in the Selenitic painter so no second lens
    strobes in step. #838 item 7 grows the dome: a fifth pane of MYST itself at
   dusk (stars, the low moon, the clock tower slim on the ridge with its one
   breathing warm dial, the jade dome-crag across the bay — the sea.js landmark
   laws painted small), live from the first opening because you stand on it;
   and the two brothers' portraits (`drawPortrait`), painted in link.js's trap
   colours, their static healing two tears per page returned to the right book
   and the face resolving calm at 4/4 (`portraitViews` in state.js carries the
   count — the paintings heal, they free nobody).
- `sea.js` — the sea wears each Age (#838 item 2): `SEA_VIEWS` per sea view
  carries its water level, multiply-tint colour, swell amplitude and texture
  drift; `seaSwell(x, z, t, view)` is a deterministic three-sine swell bounded
  by the view's amplitude (no `Math.random`); `foamAt`/`foamLine` hug the
  coast — foam exists exactly where the sculpted ground (and its RAW, uncarved
  form, `terrain.groundRaw`) meets the view's own waterline, never on a dry
  carved pad, never on open water. Hue laws ride the original's light: dusk
  amber island, green-dominant Selenitic, teal Stoneship ocean (the biggest
  swell), moss-dark glass Channelwood. `dressSea` in `scene.js` applies it all:
  colours and heaves every sea plane, drifts its texture, and seats up to 64
  foam puffs that ride the swell and breathe on their own phases. Mechanical
  has no entry — its forge floor stays dry.
- `sea.js` item 5 — the horizon is not empty: past the mirror edge the water
  wears the sky. `cloudMirror(x, z, t, view)` is deterministic broken cotton —
  a squared product of two long sine banks drifting at a slow fraction of the
  texture drift — zero inside the mirror band so the items 2/3 shoreline is
  untouched, and `cloudTint(view)` picks the per-sky cloud colour (`SKY_CLOUD`:
  dusk rose, Selenitic pale jade, Atlantic silver-grey, Channelwood cloud-floor
  white). `dressSea` paints it into the deep-ladder vertex colours every frame,
  lifting the mirror band toward the sky where the banks sit. `ISLE_LAW` names
  the land-bearing skies — the island's dusk views frame their bay with three
  dark headlands of Myst's own coast, Stoneship's Atlantic carries two low far
  islands; a sky absent from the table keeps its own horizon (Selenitic's dome,
  Channelwood's clouds, Mechanical's stone). `islesFor(view)` answers the
  silhouettes and `dressSea` seats them half-sunk domes on the view's own
  waterline, inside the fog's reach (`ISL_LIMIT`) so haze dresses them, not
  erases them. All deterministic — hash-born, no `Math.random`.
- `storm.js` — SELENITIC storms LIVE (#838 item 8): pure `stormFlash(t, view)`
  answers the caldera's lightning — a 6.4 s clock (the exact cycle visions.js
  paints in the Spectator lens, so the pane and the Age share one storm), a
  160 ms main stroke decaying from full, lifted mid-decay by a weaker second
  strike (the original's doubles), clamped to 0..1. The law is Selenitic-only:
  `STORM_VIEWS` is exactly the five sel* nodes — the island's dusk, the
  Atlantic, the cloud floor and the forge never flicker — and all five share
  one clock, so the whole Age lights at once. `skyGain`/`seaGain` say what the
  flash does: `dressSea`'s sibling `dressStorm` in `scene.js` drives the sky
  dome past white (tone-mapped light, not an overlay) and catches the sea's
  emissive in the same pale jade; `index.jsx` lifts the sun past its Age value
  and lerps the fog toward `STORM_COL` for the strike, restoring
  `sunBaseI`/`fogBase` exactly when the dark returns. Thunder is the storm's
  own voice (`thunderCues` in soundplan): a raw crack, then a 2.2 s rumble at
  110 Hz — an octave under the sea's 220 Hz surf wash and louder than any
  swell — parked at `STORM.rumbleDelay` (1.7 s) on the sim clock by the loop's
  own rising-edge watch: you see the strike, then the rocks answer.
- `link.js` — the LINKING BOOKS (#1031): touching an Age's book no longer cuts.
  The page cover rushes up (Age ink + double-rule border), a seam of light
  opens across it, and a stable starfield wheels outward on a slow swirl until
  the destination resolves — `LINK_TICKS` (175 ≈ 2.9 s) of flight, drained by
  the loop's own `tick`. Six touch-points link (`linkingBook(node, id)`):
  the tower's cogs book → Mechanical, the fireplace → Selenitic, the safe →
  Stoneship, the cave's wood door → Channelwood, and Channelwood keeps its own
  way home (hub book and landing panel) — the brothers' books fly too, each in
  its own trap colour (#838 stage, see Honest gaps). `state.link`/`state.linkT` are pure sim: the node swaps instantly
  UNDER the cover (opaque envelope across the swap window, zero exactly on the
  clearing tick), and the shell mutes keys and pad through the leap. The star
  table is a deterministic hash (no `Math.random` — the linking light is a
  world constant, not a per-seed roll); each Age wears its own floor/ink/tint.
  `mystcheck` replays `drawLink` through the recording ctx stub: same instant
  paints the same picture, two instants differ, no two Ages share a sky, and
  every sampled tick must lay ground AND >=100 streaks (no world mid-leap).
  #1035 polished the feel: leaving ANY Age flies the starfield home (not just
  Channelwood) — `selenitic/retSelenitic`, `stoneship/retStoneship` and
  `mechanical/retMechanical` link to MYST — while intra-Age steps (pier↔deck,
  terrace↔wheel, silo↔cave) stay plain walks. The seam of light no longer cracks
  open stiff: pure `linkSeam(prog)` shimmers and wavers the rift's angle, length
  and thickness on three incommensurate sines (deterministic — no `Math.random`).
  The starfield now accelerates into arrival — pure `linkAccel(prog)` ramps the
  swirl from 1× to ~2.9× so the fade lands instead of petering out. The leap has
  two audible phases: the page cover SNAPS up (a bright, short lowpass sheet,
  distinct from the rising flight whoosh). On phones the overlay overdraws on a
  DPR-aware backing (capped at 2×, the Spectator lenses' trick) so thin streaks
  stay hairlines. `mystcheck` proves the returns link, the wobble shimmers yet
  stays bounded, the pull never reverses and ends steep, the snap is its own voice,
  and the shell draws on a `devicePixelRatio` backing. The trap pulls fly too
  (#838 stage): the red and blue books start a real linking flight in their
  own crimson/cobalt before the fate screen.
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
npm run mystcheck            # Node: graph, every gate, all 8 pages, 4 endings, seeded locks, the ride, the wheel, the lenses, the linking starfield
npm run mystcheck -- --mutate # the interlocks must be able to fail (186 mutants)
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
time. Five more target the Spectator polish (#1027): a set of thaw notes that
collapse to one pitch, a sphere that never sings a thaw, a sealed pane that
climbs back to a dim-storm brightness, a dim Selenitic storm painted as
sealed grey, and an attract that loses its Spectator shot — each turns the
suite red. Eight target the linking books (#1031): either travel branch
skipping the starfield, the mechanical book's act cutting straight, a flight
that never clears, a page cover that lets the world flash through, a starfield
collapsed to one streak, every Age wearing the same sky, and keys staying live
through the leap — each turns the suite red. Five more target the linking polish
(#1035): a return panel cutting straight home, a seam opening stiff with no
shimmer, the arrival pull collapsing to a constant swirl, the page-rush cover
collapsing into the whoosh, and a starfield overlay losing its DPR backing —
each turns the suite red. Six target the sea (#838 item 2): the island sea
turning Selenitic green, the Stoneship ocean flattening to a millpond,
Channelwood glass growing an ocean swell, a swell that freezes, foam that
forgets the sculpt (dry pads wearing waterlines), and a scene that stops
dressing its seas — each turns the suite red. Six more target the island shores (#838 item 3):
the dock shore sinking out from under the pier, the cliff path hanging over a sea with no foot,
the beach bed drowning, the stair-top plateau tipping out of its carve, the sand reverting to
a flat plane, and two island shores sharing one sculpt — each turns the suite red. more target the empty horizon (#838 item 5): a cloud mirror bleeding onto the shore, banks
that freeze over, cotton flattening to a uniform varnish, dusk banks turning cold, a skyline
that vanishes, Selenitic growing coasts in front of its own dome, a headland drowning,
drifting past the fog, or floating 60 units up like a boulder, and a scene that stops
mirroring clouds or seating land — each turns the suite red.

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
- **CLOSED by #1031/#1035** — the Ages' books now link through the starfield: page
  cover, seam of light, and ~2.9 s of swirling stars before the Age resolves
  (see `link.js`). #1035 made every Age say goodbye through the field (not just
  Channelwood), shimmered the seam, accelerated the pull into arrival, snapped the
  page cover as its own sound phase, and crisped the streaks at DPR>1. Residual:
  the original also flew the starfield on the red and blue books' trap pulls —
  ours still cut to the ending screens.
- **CLOSED by #838 (stage)** — the trap pulls fly. Touching Sirrus's red book or
  Achenar's blue with the white page armed no longer cuts to the fate screen: it
  starts a real linking flight on the #1031 machinery (`link = trapRed | trapBlue`,
  `linkT = LINK_TICKS`) and parks the fate in `state.pending`; the loop's own tick
  moves it into `ending` on the exact tick the field clears, so the overlay's last
  frame and the fate screen agree — no cut, no dead beat. `LINK_PALETTE` gained the
  two trap skies and `mix` (how hard the stars take the palette's light): a normal
  leap mixes 0.18 (the Ages' light leaks at the edges), a trap mixes 0.42 — its
  field *is* the brother's colour, crimson for Sirrus, cobalt for Achenar, as the
  1993 trap books each linked in their own hue. Mid-trap every input but the loop's
  tick is refused (the same law the rocket ride runs by): you cannot step back out
  of a trap. `soundplan` answers `link:trap*` apart from an Age leap — a heavier
  cover slam and a sweep that FALLS (1250→65 Hz) where a leap rises (90→1400):
  the trap takes you in, not somewhere.
- **CLOSED by #1033 / #838 item 1 / #838 item 2** — SELENITIC is sculpted
  ground: `terrain.js` is a pure heightfield (`domeHeight`) — a grass-covered
  grey dome with a crest, smooth flanks and a skirt that dips below the
  waterline, so the shared ocean meets a real coast instead of running under a
  flat disc. The landing pad and the sounding-path corridor are carved flat
  (rings, posts, stones and the gate keep their level bed), and the two views
  carve their own crest, so the same dome reads correctly from both poses.
  #838 item 1 gave the other three Ages the same law (`AGE_GROUND`/`ageHeight`:
  real coasts, dry-land beds). #838 item 2 closed the last half of the old
  residual ("the ocean elsewhere is still one tiled plane"): `sea.js` pitches
  each Age's water — dusk amber island, green Selenitic chop, teal Stoneship
  ocean, moss-dark Channelwood glass — swells it deterministically, and lays a
  foam line exactly where the sculpt meets the sea. **CLOSED by #838 item 3** — the island
  wears the same law: `ISLAND_GROUND` in `terrain.js` sculpts the four dusk views (the pier
  lands on a shore instead of open water, the path is cut into a cliff that meets the sea
  below, the beach is a rising sand bed with the rotted boat aground, and the library stands
  on a plateau over the low sea), each carved level where the player stands and skirting to
  sea floor, so the foam line and swell dress the island coasts too. **CLOSED by #838
   item 4** — the deep wears the Age too: `SEA_DEEP`/`deepTint` in `sea.js` lay a distance
   ladder on every horizon-sized sea (shore keeps its Age tint, the deep darkens to ×0.55
   with the hue law intact, the last band before the fog lifts back to ×0.72 — the sky's
   return the FMV seas show), and `farSwell` adds long, slow ground-swell past the coast
   band (zero at the shore, ramped to 0.9× the view's swell, wavelengths ~5× the near chop)
   so the ocean heaves hardest away from land. `dressSea` paints the ladder as per-vertex
   colour and adds the far swell to every heave; small planes (the cave fall, Channelwood
   pools) sit inside the coast band and keep the flat tint. **CLOSED by #838 item 5** — the
   horizon wears the sky and carries land: `cloudMirror`/`SKY_CLOUD` drift the view's own
   cloud banks across the mirror band (rose dusk, jade Selenitic, silver Atlantic, white
   cloud-floor) and `dressSea` lifts the deep toward them per vertex; `ISLE_LAW` sets the
   dusk bay in a ring of Myst's own dark headlands and Stoneship's ocean in two far islets
   (`islesFor`), seated on the view's waterline and dressed by its fog. **CLOSED by #838
   item 6** — the skyline carries landmarks: `LANDMARK_LAW` in `sea.js` anchors the
   clock tower (slim w<h, the tallest silhouette on the bay, one warm breathing dial
   r>b) and the dome-crag (jade half-dome on dark basalt — Selenitic across the bay)
   at ONE seat each across all four dusk views: the island is one place, not four
   sets of props (generic headlands stay per-view hash texture; named landmarks don't).
   The empty `stoneship` row is the law table saying the Atlantic keeps its two low
   generic islands; Selenitic, Channelwood and the dry Ages keep their own horizons.
   mystcheck's item 6 section proves anchorage, fog-limit seating, the slim-and-tall
   inverse of the isle law, the jade/warm hue laws, layered separation from headlands
   and the scene wiring; 7 new mutants all die.
  **CLOSED by #838 item 7** —
    the dome carries home and the brothers: the Spectator's fifth optic is the
    island itself at dusk — stars, the low moon, the clock tower slim on the
    ridge with its one warm breathing dial, the jade dome-crag across the bay
    (one seat, the same law as the skyline) — never sealed, because the player
    is standing in it; and Sirrus and Achenar hang beside it in trap crimson
    and cobalt, the corrupted static healing exactly two tears per page
    returned to the right book, the face resolving at 4/4 — the visual twin of
    the message-clearing law the books already run. Freeing a brother still
    costs the white page; the paintings change nothing but what you see.
    mystcheck's item 7 section proves the pane live-and-clocked, the landmark
    hues, the heal-count monotone, the face law, the trap palettes and the
    shell wiring; 7 new mutants all die. **CLOSED by #838 item 8** — the storm
    strikes live: standing in SELENITIC the sky now flashes on the same clock
    the Spectator lens already ran (`storm.js` — 6.4 s cycle, 160 ms decaying
    double strike, whole Age at once), the sea catches it, the haze goes jade,
    and thunder (crack + 110 Hz roll, `thunderCues`) answers 1.7 s after the
    light off the sim clock. The other Ages never flicker. mystcheck's item 8
    section proves determinism, the shared lens clock, Age-only scope, the
    one-sky-at-once law, bounded + doubling envelope, the thunder voice law
    against every swell, the delay and the wiring; 8 new mutants all die.
    **CLOSED by #838 item 12** — the ship floats: standing on the quarterdeck
    the longship lifts and heels on the Atlantic instead of sitting welded to
    its shelf (`stoneDeck` was the one view with “no live mechanism to drive”).
    Pure `shipFloat(t, view)` in `sea.js` samples `seaSwell` at five seats —
    centre, both rails, bow, stern of the moored footprint — and answers
    `{ heave, roll, pitch }`: heave is the average (a sixty-foot hull cannot
    surf one chop crest), the tilts ride the water's own slope, clamped to
    `SHIP_ROCK.maxTilt`. Scope is the quarterdeck alone — the island's rotted
    boat stays beached. The deck carries its cargo (crates, barrel and lantern
    re-parented onto the hull: a heaving deck that leaves barrels standing is
    a prop, not a ship), the loop lifts and rolls the camera with the deck
    (`camGain: 1` — you stand ON it, so the horizon tilts exactly as much as
    the hull heels), and `visions.js` paints the pane's bob and heel from the
    SAME law — the Spectator and the Age rock the ship in step, item 8's
    shared-clock rule on the water. mystcheck's item-12 section proves
    determinism, footprint-averaged heave, the high-side-lifts sign law
    (roll AND pitch, axis-mapping spelled out), bounds, real Atlantic motion,
    Stone-only scope, cargo aboard, camera lift/sway/restore and the pane
    equality; 10 new mutants all die.
    **CLOSED by #838 item 11** — the fifth gear is provably cast in: the island's
    gear sat fixed by law, but `the island's gear comes loose` (neutering
    `if (g.fixed)` in `state.js`) survived `--mutate` — with the branch gone the
    seat action still answered `blocked` through the empty-hand path, so no gate
    could tell the law's refusal from the slot's shrug. The item-9 section now
    asserts the refusal words (`will not come`/`one casting`) and pulls the gear
    from a wall whose seat map records it seated, where an unguarded lift branch
    must answer `gearLift` — the fixed law is load-bearing and the last mutate
    survivor dies.
    **CLOSED by #838 item 13** — the forge breathes: MECHANICAL is the first
    Age to wear Jon's look pass (item 3, "one Age per PR"). Pure `forge.js`:
    `FORGE_SEATS` (one furnace seat per Mechanical view — the drum, the slabs,
    the shaft, the door, the gear-wall), `forgeBreath(t)` (a 0.9 Hz bellows pump
    with a double hammer-flicker, clamped to [0.55, 1.15] — it gutters but never
    goes out), `forgeLight(t,x,z,view)` (breath × squared distance falloff from
    the seat: near brass hot, far ground rust, exactly 0 past `FORGE.reach`,
    and 0 for every non-Mechanical view — the forge stays home, item 8's scope
    rule on light), `ventPuff(t,key)` (per-vent hashed cadence 2.4–4.6 s with a
    true rest gap: a leak is not a valve) and `forgeSparks(n,t,view)` (deterministic
    rise-and-die pool climbing 1.6 m off the furnace). `scene.js` seats one
    breathing lamp + one spark pool in each of the five Mechanical views, tints
    the tower drum and walk slab with the hot bounce, and puffs the blue-page
    vent on its own clock. mystcheck's item-13 section proves determinism,
    envelope bounds and pump, Age-only scope, the distance-law ordering, vent
    rest + cadence clustering, spark climb/burnout/anchorage and the scene
    wiring; 13 new mutants all die (173 total).
    **CLOSED by #838 item 14** — the cloud floor breathes: CHANNELWOOD is the
    second Age to wear Jon's look pass. The 1993 Age floats ON the clouds, and
    that cloud sea is half its light — ours wore one static sun. Pure
    `cloudlight.js`: `CLOUD_VIEWS` (exactly the four chan* nodes),
    `cloudBounce(t, view)` (a ~17 s bank-breath clamped to [0.80, 1.06] — it
    dims but never fails; the one-sky law says every Channelwood view answers
    the SAME gain at the same instant, item 8's storm rule on gentle light, and
    the Δ over the storm's 160 ms is ≤ 0.01: slow weather, not a strike),
    `cloudShade(t, x, z, view)` (a bank crossing: per-view hashed period
    34–58 s, duty 0.55 with a TRUE clear gap — a bank that never leaves is a
    ceiling, not weather — a linear moving front so near planks darken before
    the far edge, and a ragged edge so shadow lines are never straight), and
    `deckLight = bounce × (1 − 0.26·shade)` (a bank only ever takes light
    away). `CLOUD_SEATS` puts one lamp BELOW each view's own sea level — the
    glow comes up out of the clouds, which no other Age does — and its colour
    IS `SKY_CLOUD.channelwood` from sea.js, the very constant the mirrored
    horizon paints (item 12's shared-law rule: mirror and bounce cannot drift
    apart). `scene.js` seats the four lamps on the breath and re-reads
    `deckLight` per marked deck mesh (terrains, driftwood, the blue-page
    bridge, the wheel-shelter) every frame — per spot, not per Age. Scope:
    `cloudBounce` answers exactly 1 and `cloudShade` exactly 0 everywhere else.
    mystcheck's item-14 section proves determinism, scope, the one-sky identity,
    bounds + pump, the slow voice vs the storm, clear sky + real eclipse +
    duty, the front sweep, per-view cadences, deck ordering (≤ bounce, equal
    where the sky is clear, never below floor·(1−depth)), per-spot light,
    seats-under-the-waterline, tint identity and the scene wiring; 13 new
    mutants all die (186 total).
