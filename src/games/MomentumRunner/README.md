# MOMENTUM RUNNER

A Sonic-like momentum runner: gravity is the engine. Pure sim in `sim.js`,
rendered 2x (960×540, `ctx.scale(2,2)`) in `index.jsx` for the neon look.

## Architecture
- `sim.js` — the pure, tick-deterministic world (no DOM, no RNG, no clock).
  Angle-based physics: scalar speed along the ground tangent, gravity projected
  onto it; the loop is a real circle integrated by energy (`v² ≥ G·r·cosφ` or
  you peel off). `planRun()` is the autopilot that proves every zone winnable.
- `index.jsx` — the renderer + shell. Its ONLY spatial contract is
  `screen = world - cam` with no vertical flip; the hero is painted at exactly
  the pixel the physics reports, which `runnerplay` samples to prove.

## Two routes (#550)
Every sector carries a `routes.high` deck (ramp → ringed plateau → ramp) over
one flat stretch of the tail; its ramps start and end exactly ON the low line,
so commit and rejoin are surface transitions, not teleports. `groundY(z, x,
route)` and `segAtRoute` make the ground TWO functions of x — the body carries
`p.route`. `maybeRouteFork` (called inside `step`, so planner/replay/shell
share it) commits a grounded body at/above `FORK_SPEED` at the ramp mouth —
above the flat-run equilibrium, so the sprint strips and downhills are what
open the lane; the deck's six rings are the only ones up there.

## Sound
All synthesized at runtime (no assets) through the shared chiptune engine
(`src/utils/AudioController.js`):
- **One original bed per sector** — `MUSIC.runnerCity` (A-minor synthwave
  sprint, 0.105s steps), `runnerForge` (D-Phrygian industrial drive),
  `runnerOrbit` (slow F-lydian float). The tempo is the map: fast→heavy→sparse
  across the three zones.
- **Bed lifecycle** (in the frame loop): plays only during a live run — attract
  has no gesture yet so it stays silent (autoplay policy). It switches track on
  zone change, stops on pause and on goal (`playFanfare`), and restarts on
  respawn after a death (`playDeath` drops the bed first).
- **Speed whoosh** — one looping band-passed noise source whose gain and
  centre frequency track velocity past `RUN_TOP` (0 below the cap, full at
  `VMAX`); it is the engine note that tells you the slope is doing your work.
  Built lazily after the first gesture, muted-aware, stopped on unmount.
- **Tempo lift (#833)** — the SSX seam, in `music.js` (pure): the bed's grid is
  the resting tempo while you coast at `RUN_TOP` and tightens linearly to
  `0.84x` at `VMAX`, so a downhill or boost pushes the music ahead of you.
  `runnercheck` pins the resting grids, the band and monotonicity; `runnerplay`
  proves the live engine step drops under speed (the probe carries `stepDur`,
  now part of `_musicState`).
- One-shot cues (ring, spring, loop, hit, save, goal…) in `handleEvents`.

## Gates
- `npm run runnercheck` — pure Node: every rule pinned + mutants + the autopilot
  wins all three zones incl. the loop. The sim must not change under a look pass.
- `npm run runnerplay` — real Chrome, real keys: input path, paint-follows-
  physics at the exact reported pixel, variable jump, pit death→totem, and the
  sector bed actually playing (music-engine state via the probe).

## Curves, early loops, real enemies (#627)
- The tail beat cycle was `fastBoost → valleyLoop → pitHop → hill` until #642
  replaced it with per-zone programs (below); `arcPipe()`
  samples true circular arcs (tangent-flat quarter-pipes) into ~77px segments,
  so hills/dips are rolling curves and downhill is the speed engine.
- `beatValleyLoop` sets a full loop (r=70) on each valley floor — zone 1's is
  taken inside the first ~10s, zone 2 carries one too. Flag `loadBearing` marks
  the loop whose apex rings are load-bearing (only SKY LOOP's loops[0]); the
  WORLD gate scopes the apex-ring geometry to flagged loops only.
- `DRONE_R` is 18 (was 10) so bodies read at a glance on a phone; every zone
  carries a patrol + hover. A patrol never sits within a loop's stagger-shadow
  (SKY LOOP's starts at 1450, past loop[1]'s exit at 1360).
- Fork ramps are quarter-pipe arcs (steep launch, flat landing) with identical
  run/rise; the commit window keys off `FORK_RAMP`, not the segment array.

## Curves-first course rework (#900)
- The tail programs were still too flat and angular. Three new beat shapes, all
  tangent-flat at the entry height so they chain like the rest:
  `beatCascade` (six chained quarter-arcs — dip/crest/dip/crest/dip/crest,
  near-zero flat ground), `beatHalfPipe` (deep U: arc down, floor with a boost
  strip, far wall up — the pipe is the engine), `beatSpringHigh` (spring at a
  420px pit lip throws the runner onto a HILL-TOP deck h above the low line,
  ringed, back down through an arc — a per-sector high route earned by speed:
  landings need vx, a slow springer hits the pit wall and dies).
- Flat expanse halved: flat ground measured as segments >=400px wide dropped
  from 56-63% of a sector to 38-43%. The only long flats left are the two
  justified ones — the fork runway (`beatRunway`, where the fast lane is
  earned) and the spring-hop landing band (ballistics need it). `beatSCurves`
  lost its flat tail; valley/hill/spike beats got packed tails; spikes now sit
  in a shallow dip (toll rings at the trough floor).
- Programs are 24 beats per zone. FLATNESS gate in `runnercheck` pins every
  sector <45% flat expanse (re-flattening a valley tail turns it red);
  SPRING-HIGH gate proves the deck route per zone (fast body lands on deck,
  slow body hits the wall and dies, autopilot banks >=1 deck ring/zone);
  the CURVES arc-steps floor rose 8 -> 24.

## Curves-first polish pass (#934)
Renderer + audio only; the sim is untouched except one derived-data field.
- **Pipe walls:** segments steeper than ~0.18 rad get a dark inner face with a
  neon far-rim line (offset scales with slope) and a rib whose colour alternates
  by bend direction — dips glow, crests catch cold white. Half-pipes/valleys now
  read as volume, and cascades read as alternating bends.
- **Pipe-floor boost strips** (`span < 200`) render differently from runway
  strips: hot white chevrons (4, faster, bigger) + a white under-line, so the
  two terrain speed sources are told apart at a glance.
- **Spring-high route telegraph:** `sim.js` now records each spring-high beat's
  geometry on `z.springHighs` (`{sx,pit,h,px0,py,plat}`); the renderer draws a
  deterministic dashed gold arc from pad to deck top so the "this spring goes
  OVER there" read exists before commit. Pure data — no physics reads it.
- **Deck-landing juice:** a `land` event inside a deck's x-range (and within
  24px of its height) fires a white+gold spark burst, a 5px camera dip (a paint
  offset like shake — `cam()` untouched, so the paint-follows-physics contract
  holds), a two-note ding and a `DECK LANDED` toast.
- **Half-pipe ascent sweep:** `climbWatch()` accumulates the sink going down a
  steep face and pays out a rising triangle sweep at the far-wall climb edge,
  keyed to how deep the pipe actually dropped you; fires once per climb,
  play-screen only (attract stays silent).

## Per-zone beat programs (#642)
- The tail is NO LONGER a 23-beat cycle: each zone gets a hand-authored
  `PROGRAMS` list of 20 beats (24 since #900), no two neighbours alike. Beats:
  `flatBoost` (fork runway, ≥2600 so the deck ramps land on flat),
  `valleyLoop` (+ two toll rings), `springHop` (spring at the lip of a wide
  pit — run-off 1150: a 240px pit at ~800 px/s flies ~1000px; a short pad
  throws the landing onto the next beat's downslope and the pit-wall rule
  kills it), `bigHop` (wide gaps you must jump), `hill` (sized per zone),
  `sCurves` (four chained quarter-pipes, nearly no flat ground),
  `pitHop`, `spikeSprint` (strip → three toll rings → spike: enemies where
  they matter; zone 2 has NO tail rings/spikes — its load-bearing apex-ring
  WORLD check validates every ring in the zone).
- `TWEAKS` re-params shared beats per zone so neighbouring zones don't share
  shapes. Hovers ride spring landings; every beat still starts and ends
  tangent-flat at the entry height, so programs chain with no height math.

## Pit walls (#641)
A pit's far side is a WALL (`CFG.pitWalls`), not a ramp. An airborne body that
crosses the far lip line BELOW `lip + WALL_TOL` (48px — a legit crossing dips
at most ~vy·dt + slope·dt) gets `vx=0` pinned to the lip face and falls to
`deathY`; only near-level arrivals snap onto the surface. `p.hole` marks that
the current airtime started over a hole, so jumps off solid ground still land
everywhere, and `flyLand` applies the same rule so the autopilot never promises
a climb-out. `runnercheck` HAZARD runs a body at a pit too slow to clear it and
mutates `pitWalls` to prove the check touches the line.
