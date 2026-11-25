# MARBLE RUSH (#3107, rungs 1–2)

A fancier marble roller, original 3D, hanging in the sky — the modern sibling
of MARBLE MADNESS (which stays the faithful 1984 game). In the spirit of Super
Monkey Ball / Marble Blast, with none of their names, courses or art.

## Layout

- `course.js` — the manifold. A stage is DATA: a centerline of segments
  (`[len, k, grade, halfWidth, bank]`) plus props pinned in course-space
  (`s` along, `u` across): bumpers, moving bridges, kicker lips with gaps,
  gap segments (`w = 0`), sweeping bars (`{s, A, w, omega, phase}` — a neon
  saw-drum at station s that slides across the road on the moverDeck sine), and
  one checkpoint station `cp` on shelves 6–10. `compileStage()` samples it
  once into tables (heading/x/z/y + k/grade/width/bank/gap/mover), blending
  joins over `SMOOTH` m so curvature and banking ramp in and out (gap widths
  do NOT blend — holes are holes). `pointOf(s, u, y)` is THE bridge: the sim
  rides it, the renderer extrudes from it, the check pins both.
  `moverDeck`/`sweeperBar` are the same sine from both sides of that bridge.
- `sim.js` — pure 60 Hz, seeded, zero `Math.random`. One lateral friction
  budget: curve demand `v²k` vs `G(GRIP + sin(bank))`; the excess throws the
  marble outward at `SLIDE_K`. Edges (`|u − deck| > w + R/4`), gaps without a
  deck, and short landings are falls; bumpers kick +50 with a sideways
  impulse; kicker lips launch at `LAUNCH + 0.16v` when crossed above 6 m/s
  (resolved BEFORE the gap check). Moving decks carry the marble via lateral
  friction transfer. Sweeper bars knock `±5.2 m/s` sideways and bite 28 % of
  speed, with a 0.5 s immunity so one pass is one knock — the knock walks you
  toward the edge, and the edge is honest. Checkpoint gates arm at the
  station; `respawn(gs)` puts you back at `cp − 4` at 8 m/s keeping the
  running clock and score (medals stay honest; it refuses on a clear finish).
  `autoPad()` is the attract driver and the harness pilot: PD steering to a
  lookahead target line (centerline, minus bumper avoidance, plus the mover
  deck at the crossing time, minus the sweeper bar at the crossing time),
  speed capped by the tightest curve ahead, throttle committed before a kicker.
  The player's trick hop (`pad.a` — Space/A) pops off any grounded deck for
  ~0.47 s at a 12% speed cost; air skips sweeper knocks, and a down over open
  sky still falls — `autoPad` never hops, so bot hashes are untouched.
- `art.js` — MODERN bar: floor ribbons extruded through `pointOf` with per-
  segment plate shading, seam bands and start/finish checkers; neon edge-rail
  tubes along every solid run; PMREM env cube from a procedural equirect
  (per-sky palette) giving the chrome marble real reflections; a glass swirl
  map so the roll reads; shader sky (gradient + sun disc + bloom), drifting
  cloud sprites, spark pool, contact-shadow blob oriented by the banked
  surface normal. Stage 2 props: a spinning saw-drum bar per sweeping
  station (long emissive cylinder, spinning ridge bands, deck-shadow
  telegraph, cap-glows in hue + 320°, clearly NOT-deck colour), checkpoint
  arches with a road strip that lights green when armed and stays lit.
- `index.jsx` — the cabinet: fixed-timestep loop with catch-up cap, attract
  (autopilot preview + ◀ ▶ shelf picker), GO countdown, medal cards,
  persistent per-stage bests (`localStorage` key `marble-rush-best-v1`),
  fall→retry, post-gate fall → "THE GATE REMEMBERS" → Space respawns at the
  gate, `?` PauseOverlay, stick pad (`VirtualControls`), `tapStart`.

## Determinism

`gs` holds no functions, so contract `snapshot/restore` are JSON-exact.
Seed + pads ⇒ identical hashes (`stateHash` quantizes s/u/v/wlat/y/phase/
score/flags + bumper counts + gate-armed/respawns/sweeper-hits). The seed
swings bridge AND bar phases (`mvPhase`, `swPhase`) — same authored track,
different moment. Stages are authored data; expect the same track every time,
on purpose.

## Verify

```bash
npm run rollercheck                 # 70 checks: rules, verbs, win-by-bot, parity bridge, surface tone, trick hop
npm run rollercheck -- --browser  #  + 13 Chrome-drive checks incl. the gate-flow UX
node scripts/rollercheck.mjs --mutate            # edge fall muted     → red
node scripts/rollercheck.mjs --mutate=budget    # grip budget muted   → red
node scripts/rollercheck.mjs --mutate=sweep     # bar knock muted     → red
node scripts/rollercheck.mjs --mutate=gate      # gate arming muted   → red
node scripts/rollercheck.mjs --mutate=hop       # trick hop muted     → red
CONTRACT_ONLY=marble-rush npm run contractcheck
```

## Medal bounds (seconds; gold/silver/bronze)

S1 20.5/24/29.5 · S2 27.5/32.5/39.5 · S3 25/29.5/35.5 · S4 24/28/34 ·
S5 21.5/25/30 · S6 19.5/25/32 · S7 22/27.5/34.5 · S8 21.5/27/34 ·
S9 19/24.5/31.5 · S10 30/36/43. The autopilot golds all ten
(18.6/24.8/22.6/21.7/19.2 · 18.0/20.3/20.2/17.3/28.4) — gold is a hair
off the bot; humans earn it differently.

## Honest gaps (rung 3+ backlog)

1. Trick system partial — the TRICK HOP ships (Space/A pops off the deck at a
   12% speed cost; air skips sweeping bars, sim.js pins + `--mutate=hop`), but
   spins/tricks-with-points are still absent. The hop rides the pad's existing
   A button and Space — the one-analog-vector steering and the tilt contract
   (#3129) are untouched, and autoPad never presses it, so every pinned bot
   line and hash baseline predates and survives it.
2. Ghost of your best run (or a rival marble) racing the shelf.
3. Tilt controller — deliberately untouched: the pad `method: 'stick'` shape
   is the contract the platform tilt issue will drive.
4. Surface tone ships (satin/gravel/ice hum per the tagged surface + quiet
   per-sky ambience) — the tone is a muted-with-the-plated-surface hum, not an
   art layer; nothing is textured or lit beyond the tags themselves.
5. Falling marble tumbles and the chase-cam sinks with it, its sky-reflection
   dimming to near-black (#3165); it still pops out of existence at FALL_Y
   rather than passing through any cloud layer on the way.
6. Table select shows ten shelves at once; at twelve-plus a paging shelf UI
   would beat the ◀ ▶ cycle.
