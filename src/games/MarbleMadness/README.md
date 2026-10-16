# MARBLE MADNESS — engine notes (Atari, 1984)

Isometric trackball classic: an inertial marble, six races against a carrying
clock, and the full hazard roster. All physics is deterministic and lives in
`sim.js`; nothing in this game uses `Math.random()` at world level.

## Files

- `sim.js` — pure `step(gs, input)` + `stateHash`, zero RNG. Hazard phases,
  the clock and the wave are functions of `gs.tick`, so `scripts/marblecheck.mjs`
  audits rules in plain Node and the attract replay is hash-reproducible.
- `levels.js` — six heightmap courses over a 36×36 grid (`buildHeights`).
  Corridor joints step at most 2 tile-steps (falling 3+ shatters); hazards are
  pinned to solid tiles.
- `planner.js` — the autopilot. BFS over the walkable graph (steelies, acid,
  muncher mouths and the swept hammer row are avoidances, not terrain), then
  live steering: target = arc-length lookahead clamped to the last polyline
  vertex whose CHORD actually reaches ground (straight chords cut void corners);
  a latched edge brake whose budget is refit to the real decel curve; steer
  commands quantized onto the eight directions the sim can actually produce.
  `plan()` scripts the full campaign — that script is the attract replay and
  the harness's winning run.
- `index.jsx` — iso painter (checkerboard tops, cliff skirts, hazard sprites,
  gloss + shadow on the marble), HUD with carry/bank readout, attract mode,
  drag-anywhere trackball for phones.

## The physics lesson (why `acc` is 0.005)

`stepOk` says a Δz≤1 neighbor is walkable — but with the original `acc`
(0.0011) against slope gravity (`slopeK` 0.004 per unit gradient) a Δz≥1
ramp is physically CLIMB-PROOF: the graph promised ground the trackball could
not reach, and the pilot froze at the base of a slope forever. Arcade marbles
climb; so `acc` now exceeds slope gravity at gradient ≤1 (steep = slow climb,
exactly like the cabinet). Brake-budget note: braking authority is
`acc*brakeBoost + (1-brakeFric)*v`, which at v≈0.12 is still ~0.75 tile —
the planner's `stopD = 0.1 + 6v + 12v²` mirrors it.

## Hammer geometry

`hammerR` (0.42) < row pitch (0.5): a hammer can only ever touch the row it
sweeps. `planner.blockedCell` relies on that — it blocks the swept columns on
the pivot row ONLY, so corridors stay two rows open and the pilot commits
through instead of gating. Keep `hammerR < 0.5` if you retune.

## Steelie

Chases within 9 tiles of its post, climbs at most one step, knocks (40-tick
cooldown, equal-and-opposite separation) — the cliff does the killing. The
planner blocks a radius-1.3 bubble around the LIVE steelie position with a
no-freeze fallback (an old route beats no route when the steelie parks in a
doorway).

## Verify

```bash
npm run marblecheck   # rules + determinism + win proof (Node, ~2s)
npm run lint:marble   # eslint over the four game files + harness
```

The harness proves it can fail: set `BREAKDROP = 99` in `levels.js` and the
"hard drop shatters" check goes red.

## Honest gaps (filed for the QA lane)

- Music is a sparse arpeggio set, not the Marsyas full theme.
- Steely knocks don't impart spin/visual wobble on the marble.
- SILLY bounciness is uniform; the cabinet varies trampoline strength per
  section.
- The camera now follows the marble at 2× zoom and scrolls the course off every
  screen edge (the whole-course diorama is gone, #265); the attract screen no
  longer bleeds the live race/timer/score HUD. Still flat vs the cabinet: no
  per-section push-in on the narrow bridges.
