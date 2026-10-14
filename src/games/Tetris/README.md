# TETRIS (NES, 1989)

The 1989 NES cartridge on its own terms: a pure, audited simulation
(`sim.js`) with a shell that only paints and listens (`index.jsx`).
Verify with `npm run tetrischeck` — Node, no browser, the same code the tab runs.

## What is exact (pinned by the harness)

- **NTSC A-Type gravity, L0-9**: 48, 43, 38, 33, 28, 23, 18, 13, 8, 6 frames
  per row — measured tick-for-tick against a **literal table in the harness**,
  not against the sim's own constants (a check that imports the number it
  audits cannot see the number change).
- **DAS 16/6**: first move on press, then every 6 frames after a 16-frame
  delay; reversal moves immediately; release resets the delay.
- **Soft drop**: one row every 2 frames while DOWN is held; awards nothing.
- **No modern crutches**: no hard drop, no hold, no ghost, no rotation kicks.
  The piece locks on the first downward attempt that fails — the NES has zero
  lock delay. Top-out is a spawn that collides.
- **Scoring**: 40/100/300/1200 x (level+1), graded at the level **before**
  the clear; a new level every 10 lines, counted from the start level; score
  caps at 9,999,990.
- **Pieces**: 8-bit Galois LFSR (period 255), piece = r % 7. The modulo bias
  is *pinned* to the period residues [36,37,37,37,36,36,36] — that skew is a
  documented NES property. The anti-triple reroll (no piece three times in a
  row in 50k draws) additionally starves low-residue pieces; the stream is
  deterministic per seed and the harness says so with real numbers.

## Honest deviations (deliberate, flagged)

- **Levels past 9**: the real NES high-level table is not reproduced; gravity
  extrapolates down to a 2-frame floor, and the level caps at 29. Only L0-9
  is claimed exact, and only L0-9 is pinned.
- **Music**: Korobeiniki is the public-domain folk melody, arranged in our own
  notation; it does not speed up with the level.
- **Look**: 8px beveled blocks, the side panel, the marquee art column and the
  3x5 font are drawn from the NES's style, not traced from its ROM.

## Files

- `sim.js` — the whole game as pure `(state, input)`; zero Math.random.
- `planner.js` — the autopilot (placement heuristic + honest key-driving, so
  the attract demo obeys the same DAS as your thumb).
- `art.js` — block tiles, 3x5 bitmap font, marquee column; runtime-generated.
- `index.jsx` — 256x240 shell, attract/pause/over, touch start, DEV hook
  (`window.__tetrisTest`) and DebugKit.

## Known gaps / next round

- tetrisplay (Chrome driver) passes 24/24 locally but flakes on the shared
  runner: sustained CDP polling starves the tab's rAF and the world stalls
  mid-mash. Advisory tier until it is debugged; the merge gate is tetrischeck.
- Rotating pieces can slide behind overhangs like the real NES (no kicks), but
  the planner's reachability heuristic is approximate — that is the attract
  demo's ceiling, not the well's.
- No B-Type (fixed lines), no double-buffered NEXT.
