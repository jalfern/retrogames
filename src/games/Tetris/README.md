# TETRIS (NES, 1989)

The 1989 NES cartridge on its own terms: a pure, audited simulation
(`sim.js`) with a shell that only paints and listens (`index.jsx`).
Verify with `npm run tetrischeck` — Node, no browser, the same code the tab runs.

## What is exact (pinned by the harness)

- **Line clear: the flash comes first.** Full rows blink white for
  `CLEAR_FRAMES` (30 ticks, 0.5s at 60Hz) while the board is frozen — the
  score waits for the shift, input is ignored, and the next piece does not
  even spawn until the shift lands. The sim owns the window (`s.clearing`);
  the shell only blinks.
- **NTSC A-Type gravity, L0-9**: 48, 43, 38, 33, 28, 23, 18, 13, 8, 6 frames
  per row — measured tick-for-tick against a **literal table in the harness**,
  not against the sim's own constants (a check that imports the number
  it audits cannot see the number change).
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
- **Music**: Korobeiniki is the public-domain folk melody, arranged in our
  own notation. It now speeds up with the level (`music.js`: 0.15s step at
  L0 down to a 0.06s floor at L9 — the exact ROM tempo values are not
  reproduced; the shape is pinned, the numbers are ours).
- **Attract**: the demo cycles its start level 0 -> 5 -> 9 -> 0 so the
  gravity range is visible, not a level-9 loop.
- **Look**: 8px beveled blocks, the side panel, the marquee's piece
  illustration (the seven tetrominoes cycling the side columns) and the 3x5
  font are drawn from the NES's style, not traced from its ROM.

## Files

- `sim.js` — the whole game as pure `(state, input)`; zero Math.random. Also
  owns the marquee piece glyph (the pin-able half of the side-column art).
- `planner.js` — the autopilot (placement heuristic + honest key-driving, so
  the attract demo obeys the same DAS as your thumb) and the demo's level
  cycle (0/5/9).
- `art.js` — block tiles, 3x5 bitmap font, the marquee's piece illustration;
  runtime-generated.
- `music.js` — the Korobeiniki tempo table by level (pinned data).
- `sounds.js` — the per-action SFX table (rotate/lock/drop/level/over + the
  per-line-count clear arpeggio); pure data, pinned in tetrischeck.
- `index.jsx` — 256x240 shell, attract/pause/over, touch start, DEV hook
  (`window.__tetrisTest`) and DebugKit.

## Known gaps / next round

- tetrisplay's long sections (tap-drift, mash top-out) are sensitive to
  rAF stalling on contended boxes: catch-up bursts can stretch a tap over a
  DAS repeat, and a starved tab descends in slow motion. The polls now run
  at 50ms, the drops breathe (800ms), and every verdict is in WORLD ticks,
  but the section is still advisory-tier until it is green on the shared
  runner a handful of times (promotion is Jon's call — STATE question 3).
  The deterministic gate is tetrischeck in `static`.
- The marquee's piece illustration is pinned as DATA (`pieceGlyph` in
  sim.js); its pixel rendering is only light-probed by tetrisplay (advisory),
  not graded pixel-for-pixel.
- Rotating pieces can slide behind overhangs like the real NES (no kicks), but
  the planner's reachability heuristic is approximate — that is the attract
  demo's ceiling, not the well's.
- No B-Type (fixed lines), no double-buffered NEXT.
