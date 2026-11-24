# MARBLE RUSH (#3107, rung 1)

A fancier marble roller, original 3D, hanging in the sky — the modern sibling
of MARBLE MADNESS (which stays the faithful 1984 game). In the spirit of Super
Monkey Ball / Marble Blast, with none of their names, courses or art.

## Layout

- `course.js` — the manifold. A stage is DATA: a centerline of segments
  (`[len, k, grade, halfWidth, bank]`) plus props pinned in course-space
  (`s` along, `u` across): bumpers, moving bridges, kicker lips with gaps, and
  gap segments (`w = 0`). `compileStage()` samples it once into tables
  (heading/x/z/y + k/grade/width/bank/gap/mover), blending joins over
  `SMOOTH` m so curvature and banking ramp in and out (gap widths do NOT
  blend — holes are holes). `pointOf(s, u, y)` is THE bridge: the sim rides
  it, the renderer extrudes from it, the check pins both.
- `sim.js` — pure 60 Hz, seeded, zero `Math.random`. One lateral friction
  budget: curve demand `v²k` vs `G(GRIP + sin(bank))`; the excess throws the
  marble outward at `SLIDE_K`. Edges (`|u − deck| > w + R/4`), gaps without a
  deck, and short landings are falls; bumpers kick +50 with a sideways impulse;
  kicker lips launch at `LAUNCH + 0.16v` when crossed above 6 m/s (resolved
  BEFORE the gap check — the lip that saves you must beat the hole behind it
  in the same tick). Moving decks carry the marble via lateral friction
  transfer toward the deck's velocity. `autoPad()` is the attract driver and
  the harness pilot: PD steering to a lookahead target line (centerline, minus
  bumper avoidance, plus the mover deck at the crossing time), speed capped by
  the tightest curve ahead, throttle committed before a kicker.
- `art.js` — MODERN bar: floor ribbons extruded through `pointOf` with per-
  segment plate shading, seam bands and start/finish checkers; neon edge-rail
  tubes along every solid run; PMREM env cube from a procedural equirect
  (per-sky palette) giving the chrome marble real reflections; a glass swirl
  map so the roll reads; shader sky (gradient + sun disc + bloom), drifting
  cloud sprites, spark pool, contact-shadow blob oriented by the banked
  surface normal.
- `index.jsx` — the cabinet: fixed-timestep loop with catch-up cap, attract
  (autopilot preview + ◀ ▶ shelf picker), GO countdown, medal cards,
  persistent per-stage bests (`localStorage` key `marble-rush-best-v1`),
  fall→retry, `?` PauseOverlay, stick pad (`VirtualControls`), `tapStart`.

## Determinism

`gs` holds no functions, so contract `snapshot/restore` are JSON-exact.
Seed + pads ⇒ identical hashes (`stateHash` quantizes s/u/v/wlat/y/phase/
score/flags + bumper counts). Stages are authored data; the seed drives cloud
decor — expect the same track every time, on purpose.

## Verify

```bash
npm run rollercheck                 # 36 checks: rules, win-by-bot, parity bridge, Chrome drive
npm run rollercheck -- --no-browser
node scripts/rollercheck.mjs --mutate          # edge fall muted   → red
node scripts/rollercheck.mjs --mutate=budget  # grip budget muted → red
CONTRACT_ONLY=marble-rush npm run contractcheck
```

## Medal bounds (seconds; gold/silver/bronze)

S1 20.5/24/29.5 · S2 27.5/32.5/39.5 · S3 25/29.5/35.5 · S4 24/28/34 ·
S5 21.5/25/30. The autopilot golds all five (18.6/24.8/22.6/21.7/19.2) —
gold is a hair off the bot; humans earn it differently.

## Honest gaps (rung 2+ backlog)

1. Five shelves, not ten — the issue wants "ten good ones"; ship the next five.
2. No mid-stage checkpoints — a fall at 90 % restarts the whole shelf.
3. Trick system absent — Monkey Ball's jumps/spins; the kicker only flies.
4. Ghost of your best run (or a rival marble) racing the shelf.
5. Tilt controller — deliberately untouched: the pad `method: 'stick'` shape
   is the contract the platform tilt issue will drive.
6. Sound is speed-hum only — no rolling surface tone variation (gravel/ice),
   no per-stage ambience.
7. Falling marble keeps reflecting the sky; no tumble spin or cam-follow on
   the way down.
