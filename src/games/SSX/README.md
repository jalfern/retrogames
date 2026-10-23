# SSX — engine notes

EA Sports BIG's 2000 snowboard racer, rebuilt whole in code. Three seeded
mountains, a CPU field of five, and a trick economy where clean landings fill
the boost meter and a full meter at takeoff throws OVER.

## Shape

- `course.js` — the mountains: downhill centerlines integrated segment-by-segment
  (#638: each spine opens on a summit traverse, then a drop-away; `openness(s)`
  blends open shoulders ↔ gully rock walls; `undulate` lays rollers/moguls and
  `bankTurn` banks the curves INTO terrainY — still the single painted==ridden
  surface; `sceneryPlan` scatters shelf props deterministically)
  (`DS = 4 m`), with kicker wedges, halfpipe walls, rails, and obstacles parked
  on fractions of the run. `terrainY(s, x)` / `slopePos` are the single surface
  every rider and the renderer share — the painted slope IS the ridden slope.
- `sim.js` — the whole game as `step(state, input)` at 60 Hz. Gravity off the
  drop, carve/powder drag, centrifugal push in curves, crouch-release ollies,
  auto-launch off lips and pipe walls, trick ledger (180-spins to 1080 with
  OVER, grabs, flips; chains to x4; a half-finished flip is a bail), boost
  economy (drain 26/s, ceiling 38 m/s, crash dumps half), rails with trickle
  points and pinned line, wall crash, three heats with standings points, and
  Showoff against the house bank. Zero `Math.random`, seeded state only.
- `planner.js` — the autopilot. It IS the CPU field (five seats, pace caps
  0.76–0.88 of the player top, skill decides grabs/flips/rails), drives the
  attract demo, and is the witness `ssxcheck` grades. Constants mirror `CFG`;
  the harness pins they agree.
- `art.js` — vertex-coloured snow ribbon (#638: smooth analytic shading —
  hollows darken blue, crests catch light, wind grain, groomed trail line), a
  sky-following horizon of distant peaks + sun (#638), shelf scenery models
  (`attachShelf`, tree_pine/oak, rock, boulder, fence, flag — primitive
  fallback so nothing blocks), neon rails and city pylons, rigs
   that crouch/grab/spin/flip/tumble, spray sprites. `index.jsx` is paint,
   sound, HUD and input only. #731: trees span all four shelf species
   (`tree_pine`, `tree_pine_snow`, `tree_pine_tall`, `tree_oak`) picked per
   instance, with continuous scale/rotation spread and a per-instance material
   tint so no two look alike.
- Real surfaces (#669): `surfaceInfo` blends snow over rock by NATURAL slope
  (`slopeAt` — featureLift excluded, the #638 lesson) and ridge height, with
  crag banding, bedding planes + fracture blocks in the rock colour, and
  snow-on-ledge relaxation; rock exists only beyond piste |x|>=1.5. Wind
  cords + lit lumps ride the vertex shade; a tiling canvas detail texture
  (cords, crust cracks, grit, `SURF_TILE` m) and an additive sparkle overlay
  (`buildSparkles`, masked by `sparkleMask` to flat lit snow) complete the
  look. Purely cosmetic: `terrainY` and physics untouched — pinned by
  `ssxterraincheck`.
- #685 surfaces round 3: coarse `rockStrata` slabs (~18 m) ride the rock
   colour so mip-washed cliffs keep their bands at chase-cam distance; two
   sparkle layers (`SPARKLE_PULSE`, independent seeds + decorrelated pulse
   rates) approximate the original's per-facet glitter; night rock is authored
   warm/dark so cliffs separate from moonlit blue snow; `cpuSprayCount` gives
   the rival field powder spray; carve grooves get a packed-snow albedo lip
   (`GROOVE.lipColor/lipAlpha`); `rimJagPlan` + `buildRimJags` stand
   non-physics shards on high rock rims to break the skyline; and
   `landingSound` splits icy crust snaps from powder thuffs. All cosmetic —
   `terrainY` and physics untouched; pinned by 15 new `ssxterraincheck` gates.
- Carved tracks: `sim.js` records `r.carves` samples (`{s, x, t}`) whenever the
  player carves hard on the snow (|steer| > 0.45 at v > 8), fading after
  `CARVE_FADE = 300` ticks (~5 s). `index.jsx` lays those as two dark groove
  quads on the slope, plus speed streaks past the camera edges over ~90 km/h
  and spray whose density scales with speed. Carve state lives in the sim so
  `ssxcheck` can pin it deterministically.
- #665 round 2 (items 1-4, 6): canyon walls shade two-tone — a `litFace` term
  (height drop toward +x = the disc side) lightens sun-facing rock and leaves
  clefts dark; rounded rims high above the piste wear snow caps (`capT`,
  killed on sheer faces so #669's rock-through rule holds, tinted per theme by
  `capSnow` so moonlit caps read at night). The constant blue shadow became
  hollow-weighted (open faces stay near-white). `peaksRing()` is exported pure
  data: varied cone counts/squashed footprints, hazed-rock bodies
  (`peakRock`), only ~70% of peaks capped. `sceneryPlan` parks a pair of
  shelf `grandstand` props straddling the finish, scanned back to open ground
  so no gully pierces them.

## Rules that are load-bearing (each pinned by ssxcheck)

1. Gravity feeds the hill; carving and powder take it back; the valley wall bails.
2. A trick banks only on a clean landing — spin is safe at any angle, a flip
   must finish near a multiple of 360° or it's a crash.
3. Consecutive clean tricks multiply to x4; any bail resets to x1.
4. OVER: meter ≥100 at takeoff doubles the whole pay and renames the trick.
5. Boost spends meter for speed; a crash dumps half the meter and the chain.
6. Race: three heats, standings 10/7/5/3/2/1; the mountain crowns the leader.
7. Showoff: 90 s, house target 8000.
8. Carved tracks: hard carving on the snow etches grooves that fade in ~5 s;
   straight riding and airborne boards leave nothing.
9. Rock bounce (#731): dropping onto a rock's top from above kicks you back
   off with `CFG.rockPts` and a meter bump (chain-neutral); a second contact
   with the same rock crashes, a rock met at ground level bails, and trees
   never bounce. Pinned by five ssxcheck gates.
10. Seeded wipeouts (#791): a CPU flagged at takeoff washes out on landing;
    the flag rides `g._rs`, so the same seed replays every fall exactly, and
    the player is exempt. Pinned by seven ssxcheck gates.
11. Landing impact (#791): descent speed at touchdown sets `r.stompPow` and a
    short `r.stomp` beat; the rig compresses toward the deck and the renderer
    throws a spray burst sized by the impact. Bails and takeoffs clear it.
    Cosmetic state — physics untouched — but it rides `stateHash`. Pinned by
    eight ssxcheck gates.
12. Revert (#791): a takeoff loaded with edge pressure (`|press| >=
    CFG.revertTake`) signs `r.takeSpin`; landing spun ≥ `CFG.revertSpin`°
    the *other* way banks `CFG.revertPts` (chain- and OVER-scaled) and
    renames the trick `REVERT …`. The bonus pays score but never the
    meter — the boost economy stays the trick economy. Bails eat it.

## The hero rider (#548)

The player rides a real rigged character: KayKit Adventurers "Rogue_Hooded"
(CC0 — full provenance in `public/models/characters/LICENSE.txt`), loaded with
GLTFLoader from `public/models/characters/rogue.glb` (trimmed: weapons/props
removed, kept the `Idle`, `Jump_Start`, `Jump_Idle`, `Sit_Chair_Pose` clips).

- `art.js` composes six poses from baked clip frames plus per-bone euler
  offsets (`STANCE` twists the character sideways onto the board; `OFFS`
  deepens tuck/crouch/grab/tumble) and blends every bone toward its target
  each frame, so pose changes read as motion. Boardside grab, aero tuck and
  the ollie crouch all read against the sky at chase-cam distance.
- The deck is sculpted procedurally (`makeBoard`): sidecut outline, nose/tail
  rocker, striped topsheet. No CC0 snowboard exists in the KayKit/Quaternius/
  Kenney packs, so the board is the one hand-built piece — the model itself
  is the CC0 rig.

## The CPU field (#620)

All five rivals ride real KayKit bodies too — `RIDER_MODELS` maps sim ids
to `public/models/characters/{knight,barbarian,mage,rogue_plain,rogue}.glb` (same
CC0 pack, same trimming recipe: weapons/shields dropped, hats kept, only
`Idle`/`Jump_Start`/`Jump_Idle` resampled — ~330 KB each, see LICENSE.txt).
The whole pack shares one skeleton, so `STANCE`/`OFFS`/pose-bases transfer
unchanged — rivals crouch, grab, tuck and tumble with the same pipeline as
the hero. Rider 5 reuses the hooded body (the pack ships exactly five).
Distinctness comes from body + `RIDER_COLORS` on outfit and board + six
`makeBoard(color, style)` graphics (stripes, solid, bands, gradient,
pinstripe, split).

Frame budget (headless software-GL harness, 900×640, `?lite=1`):
single-hero baseline ≈ 8–10 fps → six skinned riders ≈ 11–15 fps (no
regression; the box caps everything — real GPU runs are smooth). The
`ssxmodelcheck` pack checks gate: 6/6 rigs loaded, 48+ bones each, pose
override reaches all six, fps floor. Its capture loop waits-until-still
because six rigs converge over seconds on slow renderers (a fixed settle
was flaking the same-pose stability gate).
- A dark ellipse tracks the snow under the rider (fades with air height) so
  the pack reads when flying.
- The GLB is fetched lazily and the primitive box-rider stays on screen until
  it arrives, then swaps — the game (and `ssxcheck`) never block on it. CPU
  riders keep the primitive rigs until the polish pass gives the field models.

## The feel pass (#780) — summit start, soundtrack, physical mix

- **The countdown stands on top of the mountain.** `START_VISTA` (art.js, pure
  data pinned by ssxcheck) parks the camera high and far during `phase==='count'`
  with a slow tick-driven pan, looking down the whole face; at GO the chase goal
  takes over and the position/FOV lerps swoop you into the run. The camera is
  constructed at the vista FOV so attract opens wide too. A big 3-2-1-GO! readout
  rides the countdown.
- **One original big-beat bed per mountain** (`AudioController.MUSIC`:
  SIGNAL HILL / NEON ASCENT / LONG SHADOW — composed here, none from the
  soundtrack). The bed runs only during an actual run (attract/pause/results
  silent), switches per heat with the theme via `MUSIC_TRACKS`, and its grid
  lifts up to 14% with your speed through `setMusicStep` (`MUSIC_STEP` is the
  resting tempo, pinned equal to the track grid by ssxcheck).
- **Physical mix**: wind rising with speed (grounded), an edge swish on hard
  carves, an open-air hush on hangs, a sustained rising boost engine (#791, see
  below), lip-launch whoosh, a low
  thud on big-air landings, a filtered rumble on crashes — crashes and big hits
  `duckMusic` so the field of sound keeps the hit.
- `__ssxTest.cam()` exposes phase/fov/pos/dir + the music state; the headless
  drive (vista→swoop→bed→carve/ollie/boost/wall/heat-swap→iPhone tap) runs off
  it. ssxmodelcheck now waits for the run phase before pose capture (#780).

## Seeded CPU misses (#791)

The field is error-prone, not just pace-limited. At every CPU takeoff `sim.js`
asks `planner.cpuMiss(g, r)`; the roll rides the LCG seeded into `g._rs`
(`makeGame`), with `missChance(skill, pace) = MISS.base · (1−skill) ·
(1+MISS.paceK·(PACE₀−pace))` — seat 1 ≈ 4%, seat 5 ≈ 27% — and a flagged seat
washes out on the landing (`crash what='miss'`: chain and meter go, the field
drives past). The witness (player) is exempt, so `ssxcheck` still proves the
win; the new section-9 gates pin the exemption, the monotone seat ramp, ≥2
seeded `miss` falls, rival finish orders that actually differ, and hash-exact
replay of every fall. Mutant proof (done once, by hand): `cpuMiss → false` and
the wipeout gate goes red.

## Analog steer (#791)

Steer is edge pressure, not a switch. Every rider carries `press ∈ [-1,1]`;
`sim.js` ramps it toward the input target at `CFG.PRESS` units/s (full lock in
~0.1 s), and *press* — not the raw input — drives lateral carve, speed bleed,
air spin and the groove threshold. A tap nips, a hold carves, and the planner's
already-fractional CPU line now also spools in smoothly. Touch is the true
stick: dragging on the canvas maps horizontal offset (÷64 px) straight into the
steer target, so shallow drag = shallow carve; keyboard/d-pad feed ±1 through
the same ramp. Spray/swish read `press` too, so powder density scales with
depth. `press` rides `stateHash` (section 6 replays it) and the DEV probe;
ssxcheck section 9b pins ramp-in/out, the half-target hold, depth-vs-line-width,
tap-shallowness, saturation, and pressure-scaled spin. Mutant proof (done once,
by hand): `press = target` (no ramp) and three gates go red.

## Attract hotness + bed (#791)

The attract loop was silent and static-ish next to the original's soundtrack-
driven highlight reel. Two changes, neither touching the race economy:

- **The bed runs under attract** at 0.45 gain (`AudioController.setMusicLevel`)
  — same per-theme track, same speed-lifted grid; pause and results stay
  silent. Autoplay policy still gates the first gesture (App.jsx unlock), so a
  click-through into the arcade gets the bed on attract, a cold load does not.
- **The demo is hot**: `decide(g, r, hot)` — only the attract witness passes
  `hot`. A hot profile keeps its tank above `keep` instead of dumping at 45,
  stops boosting inside 40 m of a lip, and asks the sim for `inp.fuel`, a
  meter feed at `CFG.attractFuel` that `sim.js` honours **only** for a hot
  input on the player. The rider therefore arrives at lips with meter 100 →
  OVER (rule 4): doubled pay, over-the-top names, the OVER!! sweep + the
  attract pop callout (`[data-apop]`). Cold inputs (`ssxcheck`'s witness, the
  CPU field, real play) never see `fuel` and spend exactly as before —
  section 9c gates the cold-vs-hot split, the ≥4 OVERs per heat, clean rides
  and hot-replay hashes. Mutant proof (done once, by hand): `attractFuel: 0`
  → 3 gates red; leaking `inp.fuel` into every input → the cold-witness gate
  (plus two pre-existing ones) red; restore → 114 green.

## Landing impact — stomp pose + spray burst (#791)

Landing is an event the body feels. `sim.js` reads the descent speed at
touchdown as `impact = -vy` and sets `stompPow = min(1, impact/11)` plus a
short `stomp` beat (`8 + pow·10` ticks) that decays on the ground. The
`land` event carries `impact`; the renderer's existing spray pool throws a
burster `4 + impact·10` particles wide, and a mid-strength landing (impact
>0.25, not already a big-air thud) adds its own low tone. `art.js poseRider`
compresses the whole rig toward the deck by `5–24 %` (root + legs, for both
the rigged hero and primitive field), deeper the harder the hit; it only
applies on the ground, never during tumble/air, and `poseOverride` (the
`ssxmodelcheck` probe) skips it so pose captures stay clean.

Cosmetic by construction — physics, scoring and the meter are untouched — but
`stomp/stompPow` ride `stateHash`, so a replay stomps identically. Sub-60-pt
micro-touchdowns still push no `land` event (pre-existing: only banked tricks
report); the spray/pose still fire off the event, so a soft roller that banks
gets a small puff, a hard drop a full cloud.

Note: a `land` event only exists when the trick actually banks. A landing
below the 60-pt floor, and every crash/miss/bail, clear stomp without a burst
(the tumble owns those frames).

Mutant proof (done once, by hand): neuter the `stomp` set in `sim.js` and
two gates go red (the deeper-and-longer stomp, the relax-beat); restore →
green.

## Sustained boost engine (#791)

The original's boost is a sustained engine that climbs while you hold the
trigger, not a one-shot whistle. The mix used to fire a fixed `300→720` saw
burst every 8 frames — a constant whine no matter how long Shift stayed down.

- **The rev lives in the sim** so the harness can pin it and replays carry it:
  `rider.boostHum` ramps 0→1 at `CFG.boostRev` rev/s while `wantBoost` holds,
  saturating at 1 (the redline). It resets to 0 the instant boost drops, so a
  fresh hold re-kicks from the floor instead of resuming mid-pitch.
- **Audio** (`index.jsx`) reads `boostHum`: the boost-start edge is now a low
  ignition sweep (`80→190`), and the grounded bed sweeps `150+hum·300 →
  260+hum·520` at `0.026+hum·0.012` gain. The floor and ceiling both climb with
  the hold, so overlapping bursts read as one engine winding toward redline; the
  FOV/spray already keyed off `p.boost` sell the spend alongside it.
- ssxcheck pins the knob's sanity, the cold idle, the kick, frame-monotonic
  climb, the `~1/rev s` wind-up to the `1` ceiling, the release-to-idle, the
  fresh-hold re-kick, and that the rev rides `stateHash` (9 gates, 133 total).
  Mutant proof (done once, by hand): pin `boostHum` to a fixed `0.5` and three
  gates go red (wind-up, the `~1/rev` timing, the fresh-hold floor); restore →
  green. Browser (`__ssxTest`): holding ShiftKey drives `p.boostHum` `0 → ~0.89`
  with zero page errors.

## Carve voice reads the snow (#791 slice 7)

The edge swish used to be one voice everywhere — the same filter whether the
board was screaming down an icy shoulder or plowing fresh powder. `art.js`
exports `carveVoice(grad, v, s)` (pure, next to `landingSound`): a
`smooth01((grad − 0.18)·3.5)` crust blend lifts the cutoff up to +900 Hz,
shortens the burst and adds a touch of volume, so icy sections swish brighter
and thinner while powder stays the low wash. `index.jsx` samples the surface
under the board (`slopeAt(course, p.s, p.x)`) at each swish tick and plays
what `carveVoice` prescribes. Audio-only: physics, scoring and the mix
envelope are untouched. ssxterraincheck pins the crust-vs-powder split, slope
monotonicity, the speed/pressure scaling surviving on both surfaces, the
bounds, and that both surfaces actually occur carved on the mountain
(5 gates, 50 total). Mutant proof (done once, by hand): pin `icy = 0`
(surface-blind) → 3 gates red; restore → green.

## Revert bonus (#791 slice 9)

The original paid REVERT when you left a lip carved one way and landed spun
the other. Two new sim pieces make it real:

- **The takeoff keeps the carve.** Both launch paths (crouch-ollie release and
  lip auto-launch) sign `r.takeSpin` from the edge pressure at that instant
  (`|press| >= CFG.revertTake`, else the board owns no direction — a square
  launch can't revert). Landings and crashes clear it; it rides `stateHash`.
- **The landing collects it.** `evalTrick` pays `CFG.revertPts` when the
  accumulated spin is opposite `takeSpin` and at least `CFG.revertSpin`° deep,
  scaled by chain and doubled by OVER, and the name gains a `REVERT ` prefix
  (`OVER!! REVERT BACKFLIP 540`). The bonus goes to score, never the meter:
  `r.meter` still counts the pre-revert base, so the documented boost economy
  is untouched by the style bonus.
- **The hot attract demo wears it.** The hot planner carves through a lip's
  final stretch (never across an obstacle veto), presses `-takeSpin` in the
  air until the spin is committed (160°), then drops the steering so the
  revert can't unwind — REVERTs land visibly, cleanly. The cold race witness
  and the CPU field never *attempt* a revert; when their existing lines
  happen to carve a lip and spin against it, the sim pays them honestly (the
  rules are the same for the whole field — win gates re-run green on top).

ssxcheck section 9f (+14 gates, 173 total): carve-signs the takeoff
(left/right/straight), REVERT banks against the carve and only on top of the
same spin (`pts` delta `=== CFG.revertPts`), the bonus never feeds the meter,
a wiggle below depth doesn't revert, an unloaded launch can't, landing clears
it, a bail eats it, hash determinism, and the hot attract demo throws ≥2
REVERTs with zero crashes. Mutation proof (done once, by hand):
`revert = false` → 4 gates red; restore → green.

## Flags flutter, grandstands hop (#791 slice 11)

The face was frozen decor: slalom flags stood rigid and the finish grandstands
were empty boxes. All new motion is pure functions of `(tick, s, seed)` in
`art.js` — the sim is untouched, so nothing rides the sim hash; replays differ
only in pixels.

- **One wind field** `windAt(tick, s)` ∈ [0,1]: a slow gust (`sin(t·0.011 +
  s·0.019)`) plus a faster ripple, clamped — the breeze travels down the face,
  so flags at different heights disagree at the same tick.
- **`flagSway`** bends the pole (≤0.15 rad lean) and snaps the banner out
  along the breeze (stretch ±10%), both scaled by the local wind; a per-instance
  phase (from the plan's s/x) staggers neighbours so the line never claps.
- **`crowdPlan(seed)`** packs voxels on the three concrete tiers (7/6/5 seats,
  some empty, kit colors from eight) under the roof line; `crowdHop` bounces
  each block `|sin|` at its own rate/phase, and **`crowdHype(s, standS)`**
  gates it: seated beyond ~280 m, full inside ~60 m, symmetric, so the crowd
  is already up when the line comes into view and keeps roaring through it.
- `attachShelf` tags every flag + spectator into `world.userData.anim` (and
  records `standS`); `index.jsx` calls `animateDecor(world, g.tick, hype)` once
  per frame — 0 touched when the shelf never attached (degrades whole). The
  DEV probe `__ssxTest.decor()` reports tag counts + live y-samples.

ssxcheck section 9g (+14 gates, 204 total): wind band/variance/determinism/
travelling gust, lean bounds + wind-tracking + phase spread, seeded crowd size/
rows/colors/replay-stability, hype 0 = seated, bounded hop, distinct beats,
hype monotone/symmetric, animateDecor drives both lists and degrades whole.
Mutation proofs (done once, by hand): constant wind → 3 gates red; `crowdHop`
ignoring hype → the seated gate red; restore → green. Browser: 34 flags + 31
spectators tagged, crowd hops at the stands, zero page errors.

## Hard-won verify notes


- The far mesh SINKS past the ridge line (`bank` q>9) — outer columns must
  never stand above the near crest, or the silhouette reads as a black blade
  floating in the sky (the #638 screenshot hunt).
- `snowColor`'s hollow/crest laplacian reads the NATURAL surface only
  (`terrainY − featureLift`): kicker lips are built features, and comparing
  against them drew dark lines along every jump edge.
- The pipe `featureLift` wall term is clamped/faded past the piste; before
  that, halfpipe courses generated kilometre-high towers at the wide columns.
- The chase-cam SNAPS to the rider on the first frame after any course
  rebuild (`camFresh`) — lerping from world origin meant the first frames of
  every heat looked at the mountain from below it.
- GLTFLoader runs every node name through `sanitizeNodeName`, which strips
  dots ("foot.l" → "footl"): the dotted keys in `STANCE`/`OFFS` were silent
  no-ops until #615 — pose offsets composed onto nothing and the poses still
  looked "distinct" because the base clips differ. Bone-key tables must use
  the runtime (sanitised) names; `ssxmodelcheck` now pins zero dotted keys.

## Verify

```bash
npm run lint:ssx && npm run ssxcheck     # 204 checks, blocks merges (CI `static`)
npm run ssxmountaincheck                # 119 checks: mountain feel (#638, #665)
npm run ssxterraincheck                 # 50 checks: snow/rock surfaces (#669, #685)
npm run ssxmodelcheck                    # browser: hero loads, 6 poses distinct,
                                          #   keys drive poses, race still winnable,
                                          #   #615 rider polish (grab reach, boot weld,
                                          #   Idle breath, liveries, per-theme shadow)
```

The check proves the autopilot wins RACE (30/30 standings, zero bails) and
SHOWOFF (≥8000), and re-proves both at the slack economy (`boostGain×0.75`,
chain cap x3) — the win is not a knife-edge. Determinism: identical scripts →
identical hashes; `Math.random` is banned in course/sim/planner and the check
greps for it. Mutant proof (done once, by hand): neuter the bail rule in
`sim.js` and "a half-done flip is a bail" goes red; neuter the carve push and
the five "carved tracks" checks go red.

The renderer treats vertex colours as LINEAR (SRGB output), so authored
palettes lift a stop — day rock is authored dark or cliffs wash to grey
(the #669 screenshot hunt). Vertex-colour `above`/laplacian/slope reads all
exclude `featureLift`: built features must not read as terrain.

Mutant proof for the terrain gate (done once, by hand): re-including
featureLift in `slopeAt` goes red on "kicker flank stays snow" + piste
continuity.

Live drive: `npm run dev`, open `/retrogames/ssx`, press any key.
`__ssxTest.seek(m)` / `.heat(n)` jump the rider/heat for screenshots and QA.

## The invert — hands on, board over (#791 slice 12)

Hold the grab (X) and shove the board past vertical with V: it rolls about its
long axis at `invertRate` (420°/s, one turn in ~0.86 s) and only advances while
held, exactly like the flip ledger. The steer sign at the first shove frame
picks the direction — NIKE nose-over (right) or SOLID tail-over (left); the
name reads `<GRAB> NIKE/SOLID INVERT` (DOUBLE past 720°). A full roll banks
`invertPts` × chain on landing; `invertCheck` bails anything left between 140°
and 305° — half an invert is no invert, the same law as flips. V without a
grab does nothing: hands on the board are what turn it. `r.invert` rides the
hash line (`iv…`), so replays roll identically; gates in `ssxcheck` pin the
name, direction, pay, the half-done bail, the grab requirement and determinism.

## Honest gaps (filed as the polish pass)

- CPU riders wipe out on seeded landings (#791) and now *miss* lines too
  (#791 slice 10): a rival that clips a rock/tree bobbles past it — speed and
  line lost, off-balance wobble, dust burst — on a skill-scaled seeded roll, so
  places change hands even when nobody actually falls. A bad roll still goes over
  the bars; the player is never exempt (ground contact is a straight bailing).
- Keyboard-only flips/grabs/inverts on desktop (V is the invert key — no second
  touchpad, per platform law); phones get steer + A-jump + B-boost
  (spins still work via the d-pad mid-air). Analogue depth is the #791 ramp +
  canvas drag distance — not a physical analogue stick.
- Snow tracks are now geometry: fading carve grooves under the board (#310),
  on top of the speed-scaled spray. Attract now runs the theme bed at low
  gain and a hot, OVER-happy demo (#791).
- No browser-drive harness script yet (`ssxplay`) — the merge gate is Node;
  `ssxmodelcheck` covers the hero rider in the browser.
- Only the player's livery carries the bib + logo decal set; grab/boot weld
  reach the board now (#615 — probe gates `grabReach`/`bootClear` in
  `ssxmodelcheck`), but the offsets are static per pose, not IK.
- Grabs are named by the reach (#791 slice 6): `grabKindFor` reads the steer
  sign (reaching hand, mirrored for goofy seats), ↓ (heel edge) and a held
  flip (weight fore/aft) at the grab frame — INDY/MUTE/METHOD/SALISBURY/
  NOSEGRAB/TAILGRAB, each with its own hero pose; the flip commit follows
  the reach — front hand to the nose, back hand to the tail. Reverts landed
  in slice 9; inverts landed in slice 12 (below).
- Doubles (#791 slice 8): past a second of hang the flip ledger opens to a
  second rotation — a held flip through big normal air banks DOUBLE BACK/
  FRONTFLIP at full double pay, capped at 720+~20 so a clean landing still
  fits; short air stays single and flipCheck still eats any half-done double.
  Seat 1 of the CPU field commits doubles when its predicted hang can carry
  the board to 665° before the landing margin (releases inside the clean
  window; latched past 330° so a sagging estimate can't strand the band).

## Lateral sign and the tuck/scrub (#547)

`+x` in the sim is the rider's RIGHT, and `slopePos` is the one place that
turns that convention into world coordinates: the chase-cam looks along
`d = (sin θ, cos θ)`, so screen-right is `d × up = (−cos θ, sin θ)`. The
original basis used `(+cos θ, −sin θ)` — a mirror — which made ArrowRight
(and the gamepad stick, which correctly synthesises ArrowRight) carve to the
left on screen. The shared input layer is innocent: `gamepadMap.stickDirections`
maps stick-left → ArrowLeft faithfully; the bug lived at the render boundary.
ssxcheck now pins the basis ("+x is screen-right") and the end-to-end steer
sign (steer +1 pushes the world offset right), so any future mirror flips RED.

Tuck and scrub are the original SSX stick verbs: ↑ aero-tucks (lower stance,
`CFG.tuckAcc` m/s² extra downhill pull), ↓ edge-check scrubs (`CFG.scrubDrag`,
proportional speed bite). Steering stays live through both — and through the
crouch-charge (ssxcheck pins it). The rider pose drops to `legs.scale.y 0.66`
while tucked. `__ssxTest.probe().p` carries `tuck`/`scrub` for QA.
