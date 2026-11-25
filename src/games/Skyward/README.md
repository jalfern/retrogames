# SKYWARD — flight school on Gullwing Isle (#3105, rungs 1–2)

MODERN. Pilotwings-in-spirit, own IP: three craft, four school events, free
flight over an island built from the forge's own ocean/SHORE/mountain/storm
demo tech. One Gerstner swell table drives the water shader AND the sim's wave
skim (`world.waterGLSL()` emits the same constants the CPU reads). Rung 2 made
the thunderstorm a course (THUNDERPASS) and set the thermals drifting.

## Layout
- `world.js` — pure island: seeded fbm terrain with an explicit coastal shelf
  + carved course flats + a low supply corridor (the belt's route), the shared
  Gerstner field, thermals (drifting with the sea-breeze via `thermalPos(c,t)`
  — the ONE answer for sim lift, autopilot target and painted cumulus), the
  storm cell — which LIVES (#3267): `stormPos(t)` sweeps it on a slow seeded
  ellipse (E/W ±64 m ~140 s, N/S ±34 m ~190 s) and gusts, core downdraft,
  rain, clouds and the bolt anchor all read it — and the fixed THUNDERPASS
  gate line (`passStart`, `passRings`) the weather moves over.
- `sim.js` — 60 Hz pure sim (zero DOM, zero Math.random): plane / glider /
  belt physics, RING RUN / SPOT LANDING / TARGET DROP / THUNDERPASS scoring,
  graduation. The storm fights the PLANE too (rung 2): gusts, ~2 m/s core
  downdraft, buffet. Exports `checkout`/`recycleCraft` so the harness and the
  F1 panel skip the approach flight.
- `planner.js` — the autopilot: proportional ring-seeking for the plane,
  spiral-release soaring for the glider, two-band hover + brake-drop for the
  belt, storm-aware seeking for THUNDERPASS (aims above the gate while the
  core downdraft pulls; graduates all five seeds). Attract flies it;
  `skywardcheck` graduates on it.
- `renderer.js` — three.js: gradient sky + sun glitter, Gerstner vertex-shader
  sea with fresnel/crest/shoreline foam, vertex-coloured terrain (sand→grass→
  rock→snow), billboard cumuli + a rain-shaft storm cell with lightning,
  procedural craft meshes, ring gates, cargo crates, chase-cam with FOV kick.
- `index.jsx` — the cabinet: fixed-step loop, attract, pause, DOM HUD,
  VirtualControls (stick-first, supports dpad), `?` overlay, contract hooks.

## Controls
Stick/arrows bank + pitch (up = climb) on all three craft; SPACE = context
(start event at a marker / belt thrust); B = drop crate / recycle craft at
the school apron. The violet beacon east of the bay starts THUNDERPASS in
the plane. Full rule text lives in the PauseOverlay (`?`).

## Verify
```
npm run dev -- --port <DEV_PORT> --strictPort   # then:
npm run skywardcheck         # Node: geometry, rules, graduation × seeds, determinism
npm run skywardcheck -- --mutate   # proves the harness can fail
node scripts/skywardplay.mjs       # headless Chrome: boot → play → events → zero page errors
```
## Honest gaps
- **MOVED by #3332:** the plane landed at #3319 and the belt now answers the
  strip too — a quiet arrival parks with the zone banked (see *Quiet landing*
  below). What remains of the old bullet: no online (issue: not yet).
  (The engine-audio half closed in #3295, the glider's runway in #3302/#3306.)
- A strip touchdown is judged at the instant the hull crosses the deck (gh<0.7),
  same as the mat — there is no flare-quality or ground-roll law; a smooth
  approach that sinks 0.6 m at the threshold reads the same as a perfect one.
- The cell drifts on a fixed seeded ellipse, not a steered weather sim (no
  cell-to-cell travel, no squall line); a long run learns the sweep the way
  rungs 1's lines were learned.
- Lightning is scenery — no strike hazard anywhere (by design, the school
  forgives; the downdraft is the punishment).
- Thermals are analytic columns, not sim'd convection.
- A straight-and-level keyboard line dunks at the core — that's the course,
  but a first THUNDERPASS attempt crashes more than the ring run does.

## Juice (#3138)
- **Blob shadow** — one soft ellipse pressed onto the exact surface under the
  hull (terrain or the live Gerstner swell, edge-sampled so it rides slopes),
  widening and fading with altitude. No shadow maps; renderer-only.
- **Ring near-miss** — crossing the active ring's plane 2–6 m wide of the hoop
  fires a juice-only `near` event (`_zPrev` crossing detector; never scored,
  never hashed, sequence law applies); the cabinet answers with an airy whip.
- **Thermal shimmer** — the sim exposes `g.lift` (glider only, zeroed for the
  other craft, kept out of `stateOf`); the cabinet sings a two-note shimmer
  whose tempo and pitch ride the lift, teaching the elevator audio-only.
- **Storm bed (#3272)** — the cell is no longer silent. `stormBed(s)` maps
  hull depth to a continuous filtered-noise rumble (gain and cutoff rise with
  depth — deep rain is loud AND bright); `stormCue(s, prev)` holds the edge
  laws with hysteresis: first contact warns with a distant low rumble (the
  free-flight telegraph), crossing into the core lands a deep thunder sting.
  Both laws are pure in `sim.js` so `skywardcheck` pins them; `g.stormS` now
  reports depth for ALL three craft (was plane-only). The bed rides a new
  loop-noise voice in `AudioController` (`startLoopNoise`/`setLoopNoise`/
  `stopLoopNoise`, loopVoice's sibling on the ambience bus). THUNDERPASS
  keeps its own audio script untouched.

## Engine bed (#3295)
- **Sustained motor** — the pilot has no throttle lever, so the engine reads
  what the hull is DOING: `engineBed(craft, speed, vy, thrusting, stormS)`
  maps the plane's airspeed + climb load to a continuous hum (a fast or
  climbing hull is a working engine — louder AND brighter; a deep-stall hull
  drops to a near-cutout floor and re-spools on recovery), the belt answers
  its fan directly (thrusting bites 36 Hz higher), and the glider is
  motorless — its silence is the rule the bed teaches. The law is pure in
  `sim.js` (like the storm bed) so `skywardcheck` pins it; the cabinet rides
  the existing `startLoopVoice` saw (a deterministic 13 Hz blade-pass flutter
  timed off `gs.t`) — `AudioController` grows not one line. (#3300 later
  richened this bed — see *Bed polish*.)
- **Rain owns the core** — deep storm ducks the engine ×(1−0.5·depth) instead
  of duelling thunder; `raw` (pre-duck gain) rides the cue law so flying
  through the cell can never fake an engine death. `engineCue(raw, prevRaw)`
  holds the #3272 hysteresis idiom: one spool when boarding (armed below
  0.006, fires ≥0.012), one cut only into true zero (glider on); belt fan
  toggles sit above the arming lines and stay chirp-free.
- **Presentation-only** — the laws read state and never write it: hash,
  `stateOf`, scoring are byte-identical with the bed on (pinned), so replays
  and the QA robot's views are untouched.

## Bed polish (#3300)
- **Rich motor** — the loop voice was ONE raw saw; the cabinet now drives a
  `startLoopEngine` sibling in `AudioController`: two saws detuned ±9 cents
  through a lowpass, so the beating between them thickens the cruise, and the
  filter OPENES with load (`engineBed` gained a pure `cut` field — plane
  600→2200 Hz with load, belt fan 780/1400, glider 0). The 13 Hz blade-pass
  flutter now bends PITCH too (±30 cents on the same deterministic sim clock,
  both saws shifting together) as well as gain. Nothing else's graph changed.
- **Load tell** — twin exhaust streaks off the plane's cowl (renderer-only,
  never hashed): additive flame-cones that stretch, brighten and heat-whiten
  with `fx.raw` (the pre-duck load — driving through rain still shows the
  engine WORKING while the bed ducks); flicker rides the sim clock, not a RNG.
- **Glider wind-rush** — pure law `windBed(craft, speed, stormS)` in
  `sim.js`: glider-only filtered-noise rising with airspeed (hushed below
  9 m/s, full rush at the 19 m/s top), storm-ducked ×(1−0.5·depth), capped
  at 0.03 gain — a whisper, never a fake motor. Rides a sibling `loopWind`
  voice so the wind and the rain bed can sound together. The glider's
  checkout banners it: NO ENGINE — WIND IS YOUR THROTTLE.
- **Crash sequencing** — the crash rumble no longer stacks on the motor
  dying: on a crash the cabinet cuts the engine bed on the tick (its sweep
  leads), delays the rumble 0.18 s, and zeroes the arming line so the
  respawn spools fresh. `__skywardTest.bedLive()` proves the cut live.
- **Phone widths** — two fixes from a 390×844 audit: the stage's inline
  `position:relative` overrode its `absolute inset-0` class and collapsed
  the canvas to its intrinsic ratio (prod looked right only because the
  first `setSize` baked a matching aspect); and every HUD readout moved
  into a `<style>` block — a media query can never beat inline styles — so
  below 480px speed/alt/score/chips live in the top corners and the hint
  floats mid-screen, clear of the pad band. `skywardplay` now audits the
  overlap matrix at 390px (pinned).

## Second strip (#3302)
- **Runway landings, zone-scored** — Pilotwings' landing test in our keys: the
  painted strip on the south beach (west→east, threshold at x −30, deck 2.6,
  full-weight corridor + k² shoulders → exact and dry on every seed). A soft,
  aligned touchdown INSIDE the strip scores by how far down it carries: SHORT
  150 / MIDDLE 300 / LONG 450 / FULL STRIP 700. Past ~17° of crab (0.30 rad)
  it's a scuff (+60); hard arrivals tumble as before; anything off the strip
  keeps the mat law untouched. The bullseye (1000) stays the precision prize —
  no pad-band point lies on the strip (pinned), and the autopilot still aims
  at the mat (honesty pin: 5 seeds, strip lands = 0).
- Pure laws `stripZone(w,x,z)` / `stripScore(w,x,z,heading,vy,speed)` live in
  `sim.js` beside the glider; `skywardcheck` pins literals (7 seeds deck+storm,
  4 zones, alignment boundary, tumble/pool/beside precedence) and runs 4 new
  mutants. `stateOf` gained `strip` (where the glider is on it) and `stripD`;
  hash inputs are unchanged — the strip never rewrites the replay spine.
- Cabinet: threshold piano keys, edge lines, centreline dashes, zone ticks,
  windsock + RUNWAY board (renderer); the spot-phase HUD names the range and
  then the law ("TOUCH DEEP, KEEP IT STRAIGHT"); a deep landing gets a gold
  dust + rising flourish and the banner calls the zone.
- Live drive (`skywardplay`): a wind-crabbed short-final — heading
  `acos(−wind.z/speed)` holds a straight ground track against the seed wind —
  banks FULL STRIP +700 with zero console errors. Lesson kept: ±2.2 m/s of
  seed wind drifts a hull off a 14 m strip over a long final; drive legs short.

## Wheels down (#3319)
- **The plane answers the runway** — Pilotwings' landing test in the plane's
  own keys. In FREE flight (mid-event the course owns the hull), a plane
  crossing the strip deck inside the crash window with `vy > −2.2`, `vy < 0.5`
  and `speed < 34.5` touches down instead of crashing: wheels-down, zone score
  by the same #3302 table (SHORT 150 → FULL STRIP 700), the same crab law
  scuffs it to 60. The speed ceiling sits deliberately below the pump's cruise
  equilibrium (38): a hull that hasn't scrubbed with the stick is too hot, so
  slow is something the pilot makes. Hot, steep, crabbed-too-hard or off-strip
  arrivals keep today's crash law byte-identical.
- **Rollout** — on the deck the hull rides it (deck+0.5), friction
  (`×0.99/tick`) owns the decel, heading is locked to the axis; storm buffet
  doesn't reach a wheeled hull (the bed still hears the rain). Stick back at
  ≥16 m/s is a **wheels-abort** — a touch-and-go, banked and all — with a
  1.5 s departure grace (climbing out low is not a crash; a cruise line can't
  thread it). Coast under 12 m/s and the ground crew collects her: forgiving
  respawn to the start, no crash counted, the banked score kept.
- **Badge, not licence** — the best plane touchdown banks to `g.land` and the
  ✈ WHEELS chip / over-card line. Licence math stays core-three (the STORM
  WINGS precedent): landings never touch `score`, `grad` or `done`; hash
  inputs unchanged. Autopilot honesty: the planner graduates all seeds without
  ever landing the plane on the strip (5-seed pin).
- Pure laws `planeTouch(w,x,z,heading,vy,speed)` live in `sim.js` beside the
  glider's; `skywardcheck` pins the zones, bands, scuff, precedence, rollout,
  crew, abort, honesty and replay determinism (+14 pins, 6 new mutants — 36/36).
  Cabinet: RUNWAY zone banner on touchdown, WHEELS UP / GROUND CREW banners,
  a rising flourish and deck dust on landing, ✈ chip, WHEELS badge on the
  completion card, and free-flight cockpit hints that teach slow-over-hot.

## Strip tail (#3310)
- **The airfield reads itself** — the zone prices 150/300/450/700 are painted
  flat on the north lane at each band centre (glyph tops down-strip, like real
  runway distance paint), and the first SPOT LANDING of a run banners the whole
  ladder once (`SHORT 150 · MIDDLE 300 · LONG 450 · FULL 700`). A first-timer
  learns what the strip pays before the banner ever has to.
- **Dusk-proof paint** — asphalt and markings carry emissive floors
  (`0x10151c` / `0x7b8187`), so edge lines, piano keys, ticks and numbers keep
  their contrast when the storm cell dims the sand.
- **A pad that tells the truth** — the B chip is a live verb: `DROP` on the
  drop course, `RECYCLE` inside the apron circle (the same 74 m the sim uses),
  and a bare `B` when the button is inert — the glider's final no longer
  promises a verb it won't answer.
- **Every craft gets named** — `gliderRunwayHint` joins the plane's (#3319) and
  the belt's (#3332) free-flight lessons: over the strip a recycled glider reads
  `READ THE NUMBERS, RELEASE EARLY · far end pays 700`; the generic CRUISE line
  is only away from the airfield.
- **The windsock flies** — pure law `sockPose(wind, gust, t)` in `sim.js`: the
  cone streams downwind, droops at slack wind (flat by 2.2 m/s) and flutters on
  the sim clock (no RNG — replays see the same snap); the passing cell's gusts
  reach it. `skywardcheck` pins direction, droop monotonicity, the flip-under-
  gust, flutter bounds, decal-centre/zone agreement, the painted literals vs
  the scoring table, and the dusk emissives (+11 pins, 3 new mutants — 51/51).
- **Attract honesty kept** — the taste call #3310 item 7 asked the builder to
  record: NO scripted strip landing in attract. The autopilot still aims the
  mat (a robot that lands where it says it lands); the strip teaches itself now
  with the painted ladder, the first-run banner, the named hints and the flying
  sock instead.
- All of it presentation-only: hash, `stateOf` and scoring byte-identical.

## Quiet landing (#3332)
- **The belt parks on the runway** — Pilotwings' landing test in the belt's
  own keys. The belt already forgave the ground (soft, slow contact settles
  anywhere, silently); now the strip PAYs it. In FREE flight (mid-event the
  drop course owns the hull), a belt crossing the strip deck inside the crash
  window with a sink under 2 m/s (`BELT_SINK`), across under 4 m/s
  (`BELT_SPEED`) and not climbing away (`BELT_RISE`) parks with the zone
  score — the #3302 table (SHORT 150 → FULL STRIP 700), the same crab law
  scuffs it to 60. The bands are the belt's own: unlike the plane it cruises
  slow, so the skill is the HOLD — pulse the throttle and put it in the
  deepest zone you can carry straight in.
- **Parked means parked** — on the deck the hull rides the swell, locked:
  wind and gusts don't drag it (the crew chocks it), the bed still hears the
  rain, and only the throttle lets her go (`liftoff`). The banked best
  answers the plane's ✈ WHEELS with ✺ HOVER (chips line, completion card);
  licence math stays core-three (the STORM WINGS/#3319 precedent): landings
  never touch `score`, `grad` or `done`; hash inputs unchanged.
- **Today's edges untouched** — `vy < −5.2` or crossing > 10 m/s still crashes
  byte-identically; a sink a shade too firm, and off-strip or mid-event
  arrivals, keep the silent settle. The catch fires ONCE per deck crossing
  (`_air`): a settled hull can't sneak a park a tick later, and leaving the
  deck (airborne, or climbing under throttle) re-arms it — touch-and-park is
  a rhythm, and a second arrival pays again (best kept). Autopilot honesty:
  the planner graduates all seeds without ever parking the belt on the strip
  (5-seed pin).
- Pure law `beltTouch(w,x,z,heading,vy,speed)` lives in `sim.js` beside the
  plane's; `skywardcheck` pins zones, bands, scuff, the once-per-crossing
  arming, park lock, liftoff-and-re-land, crash/settle precedence, honesty,
  determinism and the stateOf add (+16 pins, 7 new mutants — 43/43).
  `skywardplay` drives it live: a wind-true approach banners
  `RUNWAY LONG +450 — PARKED`, the throttle answers `OFF THE PAD — AIRBORNE`.
  Cabinet: hints teach quiet-over-firm, the ✺ chip appears only once earned
  (phone width), deck dust on parks (shared strip flourish), and a `padfinal`
  F1 cheat.
