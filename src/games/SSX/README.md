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
  carves, an open-air hush on hangs, a boost whine, lip-launch whoosh, a low
  thud on big-air landings, a filtered rumble on crashes — crashes and big hits
  `duckMusic` so the field of sound keeps the hit.
- `__ssxTest.cam()` exposes phase/fov/pos/dir + the music state; the headless
  drive (vista→swoop→bed→carve/ollie/boost/wall/heat-swap→iPhone tap) runs off
  it. ssxmodelcheck now waits for the run phase before pose capture (#780).

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
npm run lint:ssx && npm run ssxcheck     # 87 checks, blocks merges (CI `static`)
npm run ssxmountaincheck                # 119 checks: mountain feel (#638, #665)
npm run ssxterraincheck                 # 45 checks: snow/rock surfaces (#669, #685)
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

## Honest gaps (filed as the polish pass)

- CPU riders never crash (the field is pace-limited rather than error-prone).
- Keyboard-only flips/grabs on desktop; phones get steer + A-jump + B-boost
  (spins still work via the d-pad mid-air). No analogue stick yet.
- Snow tracks are now geometry: fading carve grooves under the board (#310),
  on top of the speed-scaled spray. Attract mode runs silent — the beds run
  only during heats (#780).
- No browser-drive harness script yet (`ssxplay`) — the merge gate is Node;
  `ssxmodelcheck` covers the hero rider in the browser.
- Only the player's livery carries the bib + logo decal set; grab/boot weld
  reach the board now (#615 — probe gates `grabReach`/`bootClear` in
  `ssxmodelcheck`), but the offsets are static per pose, not IK.

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
