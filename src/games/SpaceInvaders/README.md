# SPACE INVADERS

**Bar: RETRO.** Taito 1978, the formation shooter (route `/invaders`). The
world is a fixed **224×256** grid (the original's rotated-panel resolution),
integer-scaled to the canvas with smoothing off, fixed 60 Hz timestep. The
overlay palette is honored: red score zone + red top row + red saucer, green
base line, cyan spare cannons, everything else white on black; the descending
four-tone march accelerates as the fleet shrinks.

## Modules

| File | Job | Proven by |
|------|-----|-----------|
| `sim.js` | one `step(state, input, rand)` — **zero `Math.random`**, every dice roll (invader fire, shooter choice, UFO arrival + bounty) drawn from the injected `rand` stream | `npm run invaderscheck` (42 checks incl. 4 mutants proven RED→GREEN) |
| `index.jsx` | render (pixel sprites from bit-rows, 2-frame march), input, seed lifecycle, attract autopilot, harness contract | eslint + `feedbackcheck` laws |
| `attract.js` | attract screen frames | intact from the original port |

## Terminal model (restored in #1473 batch 13)

The first port (Feb 2026) had **no terminal at all**: a hit, a landing or a
cleared wave silently re-initialised, and `score` was a dead field. This
batch rebuilt the original's honest end-of-run model:

- Rows score **30 / 20 / 20 / 10** top-to-bottom (the original's 30/20/20/10/10
  bands folded to four rows); the mystery UFO banks 50/100/150/300.
- **Three lives**; a hit clears the screen's shots, blinks the cannon, holds
  the formation in place (original behavior) and respawns after 90 ticks.
- **A landing ends the game** — with lives left on screen, `done=true`. So
  does the third death. The score you die with is the score you report.
- Waves rebuild full and march faster (`0.8 + 0.25·wave`), start 8px lower
  per wave up to +48, and fire more often (capped 5%/tick).

## The forts (#1495)

The original's four destructible bunkers, restored to the sim:

- Four forts of **2x2 bricks** (11x8 cells = 22x16 px each), dome corners
  cut, a 6x4 slot in the crown, at x = 23/75/127/179 on the line y = 208 —
  between the fleet and the player. Green, like the original's overlay.
- **A shot eats exactly one brick and is lost.** The 1px column is swept
  from the previous to the current position (a 5px shot skips brick rows),
  scanned from the leading edge; a pixel on a brick boundary tries the
  right-hand neighbour. A hollow path (slot or chewed gap) lets the shot
  through to what is behind the fort.
- **The forts shield the player:** a falling invader shot that meets a brick
  is consumed by the fort. The fleet's fire chews the forts down for free.
- **A descended invader grinds the bricks it walks over** (original
  overwrite) — the last rows of a run eat the forts before the landing
  ends the game.
- **A cleared wave does NOT rebuild the forts** — only a new game restores
  them (original behavior).

The contract state reports `bunkerBricks` (0–328); DebugKit gains a
"Wipe forts" action and the brick count on the status line.

## Seed pinning (#1473)

`seedRng(seed)` (mulberry32, gameContract) drives all sim entropy; the seed is
regenerated at **every human start** (the attract demo runs the same sim), and
`?seed=N` replays the exact world. Production report:
`{ tick, score, done, seed, lives, wave }`. The harness contract
(`id: 'invaders'`) ships `reset/tick/state/canvas`; `snapshot/restore`
omitted — the rand closure can't JSON round-trip (#391).

## Verify

```bash
npm run invaderscheck          # Node: boot, rules, winnable, determinism, contract
npm run feedbackcheck          # the seedpin law incl. this title
```

## Honest gaps

- 4 rows × 8 = 32 invaders; the original opens with 55 and grows per wave.
- The UFO bounty is uniform-random from the four values; the original's
  mystery score came from a shot-count table.
- No 100-point bonus life; no tilt/coin mechanics; one UFO type.
- Sound is the synthesized descending four + effect blips (studio audio law);
  the original's exact march waveform and the bonus-life jingle are absent.
