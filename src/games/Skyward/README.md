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
- **MOVED by #3319:** the plane takes the strip now — wheels-down, rollout and
  touch-and-go (see *Wheels down* below). What remains of the old bullet: no
  online (issue: not yet), and the belt still can't be landed (it settles on
  soft terrain without crashing, but scores nothing there). (The engine-audio
  half closed in #3295, the glider's runway in #3302/#3306.)
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
  timed off `gs.t`) — `AudioController` grows not one line.
- **Rain owns the core** — deep storm ducks the engine ×(1−0.5·depth) instead
  of duelling thunder; `raw` (pre-duck gain) rides the cue law so flying
  through the cell can never fake an engine death. `engineCue(raw, prevRaw)`
  holds the #3272 hysteresis idiom: one spool when boarding (armed below
  0.006, fires ≥0.012), one cut only into true zero (glider on); belt fan
  toggles sit above the arming lines and stay chirp-free.
- **Presentation-only** — the laws read state and never write it: hash,
  `stateOf`, scoring are byte-identical with the bed on (pinned), so replays
  and the QA robot's views are untouched.

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
