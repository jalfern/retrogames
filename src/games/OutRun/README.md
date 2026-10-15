# OUT RUN — engine notes

The 1986 Sega highway, rebuilt from the original's spec (issue #241): a red
convertible with its wind-in-the-hair couple, seen from behind, tearing a
**segment-projected pseudo-3D road** against the checkpoint clock. No assets —
every sprite, backdrop and tune is synthesized at runtime.

## Files
- `road.js` — the route + the projector. A flat strip of segments at increasing
  depth `z`, projected by `scale = CAM_DEPTH / z` (curves slide the road
  sideways, hills are a real per-segment world height so a crest hides the road
  beyond it). Also builds the **merge-back fork lattice** (depths 0–4, columns
  0..depth → ids 1–15, five depth-5 goals), the seeded roadside props, the
  traffic, and the five per-depth `SCENES` palettes. Pure, seeded — the harness
  imports it unchanged.
- `sim.js` — the whole game as `step(state, input)`. No DOM, no `Math.random`
  (a seeded state LCG only), so a replay is exact. Gears (`LOW`/`HIGH` caps
  top speed), speed-scaled **centrifugal force**, the **checkpoint timer** (the
  only killer), traffic bogs, the **roadside flip** crash (the couple tumbles),
  the fork choice, and the win at the depth-5 gantry. `CFG` switches exist so
  the harness can prove each rule load-bearing.
- `planner.js` — the autopilot. Holds a committed lane (never drives under
  traffic), counter-steers the curves, rides LOW off the line / HIGH on the
  straights, and takes the LEFT (easier) branch at every fork. Produces the
  input script that the attract demo replays **tick-for-tick** and the harness
  grades.
- `art.js` — synthesized sprites (the convertible + couple, traffic, palms,
  cacti, pines, windmills, mesas, signs, billboards, the GOAL gantry) and the
  wide parallax `makeBackdrop(theme)` strip (sky gradient + sun + a distant
  ocean/mesa/mountain/skyline band) that scrolls sideways as you curve.
- `index.jsx` — the cabinet shell: projection renderer (grass/rumble/road/lane
  strips, painter-sorted props + cars, the fork median, crest occlusion via
  `p2.y >= p1.y`), attract demo, radio pick, HUD, crash animation, `VirtualControls`,
  `?` pause, DebugKit.
- Radio tunes live in `src/utils/AudioController.js`: `cruise`, `sunset`,
  `breeze` — three ORIGINAL compositions in the arcade's sunlit beach-cruiser
  idiom. They are our own melodies, deliberately **not** the cabinet's tracks.

## Input
- ◀ ▶ / D-pad: steer (hold the line — the curves throw you outward)
- ▲ / Space / A: gas · ▼: brake
- B / Shift / G (the on-screen GEAR button): toggle LOW ⇄ HIGH
- `?` (or Esc / `): pause

## Verify
```bash
npm run lint:outrun                       # scoped ESLint gate
npm run outruncheck                     # 30 checks: boot, projection+crests,
                                        #   fork lattice, the rules, a deathless
                                        #   5-stage autopilot win, the slack rule
npm run outruncheck -- --mutate         # + 4 load-bearing mutants must all die
```
The whole game is proven in Node (no browser needed). The attract demo drives
the exact script `outruncheck` grades, so what you watch winning is what is
proven winning.

## Fidelity vs the original — and honest gaps
Faithful: segment pseudo-3D (not Mode 7) with real hiding hills; checkpoint
clock that only loses; LOW/HIGH gears; centrifugal push; slower traffic; a
roadside object that flips the car; the fork at the end of every stage over a
15-stage / 5-goal merge-back lattice; per-stage scenery; a three-station radio.

Honest gaps (the QA polish pass should chase these):
- The couple is baked, not a separate animated body; no hair-flap frames.
- Traffic is a fixed pace per stage, not drafting or rubber-banding.
- No rev-limiter / engine-brake feel beyond the two gears; no tyre-squeal or
  crash SFX variety (one flip + one bog sound).
- The fork is a wide median, not the cabinet's literal signpost gantry.
- No bonus-time-per-rev; the arcade pays a bit more nuance to the score.
