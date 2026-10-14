# ARKANOID

The arcade's brick-breaker: one ball, one paddle, six hand-carved walls and a
boss with fifteen eyes. 256x224, everything drawn and synthesised at runtime.

## Files

- `sim.js` — the whole game as pure `step(state, input)`. Zero
  `Math.random()`: capsules fall from destroyed bricks the layout named,
  enemies enter on tick timers, DOH sways on `sin(tick)`. Same seed, same
  run, hash-for-hash (`stateHash`).
- `rounds.js` — the seven rounds as ASCII data. `#` normal, `s` silver
  (3 contacts), `g` gold (never breaks, never counts), letters are capsules
  hidden in the rubble. Each of `L S D C B E +` ships **exactly once**
  across the whole game — the harness pins it.
- `planner.js` — the autopilot. It aims by inverting the sim's own paddle
  formula (solve the rebound slope that carries the ball to the target x at
  brick height), digs bottom-up through lanes it has verified clear, threads
  fortress ring-gaps, and leads DOH's eyes with a `sin(swayT + t)`
  prediction. `plan()` returns the per-tick input `script` plus a receipt —
  the attract mode replays that proven run through the real `step()`.
- `index.jsx` — the shell: fixed timestep with a 250 ms catch-up cap (the
  heist law), attract/play/pause/over, VirtualControls, DEV hook
  `window.__arkTest`.

## Rules that are load-bearing

- **The paddle is positional, not velocity**: exit angle comes from where the
  ball lands on the face (`rel = (ball - centre) / halfW`, clamped), so an
  edge hit throws ~38° and dead-centre goes up. Straight-up bounces get an
  anti-vertical floor, and a real stall (`dry >= 60` bounces without a
  break) gets a deterministic nudge — but only when the pilot wasn't aiming
  (|vx| < 0.2·sp), because an early version nudged over every careful shot
  and stalled forever.
- **Ball loss is explicit**: a ball below the floor is filtered out of
  `gs.balls` after the movement loop; forgetting that (as v1 did) left a
  dead ball falling forever and the round never ended.
- **DOH's eyes live on the underside of the head**: a circle-vs-circle test
  against eyes inset in the hit-rect can never fire (the body bounce is always
  first) — an eye pops when the ball's contact x on the face lands within
  eye radius. 3 eyes → 5 → 7, then win.
- **Rounds must drain**: `arkanoidcheck` flood-fills every layout from the
  floor; an unreachable destroyable (or a gold roof the ball can park above)
  is a FAIL, not a difficulty. The fortress went through three shapes for
  exactly this reason — the shipped one has a gold frame and a destructible
  roof.

## Verifying

```bash
npm run arkcheck              # Node: geometry, rules, ledger, pilot, mutants
npm run arkcheck -- --mutate  # 5 fixed bugs replanted — each must be caught
npm run arkplay               # Chrome, real keys only (needs `npm run dev`)
```

`arkcheck` (in the CI `static` gate) asserts: rows 15 wide × 7 rounds, no
sealed pockets, capsule uniqueness, centre/edge paddle angles, silver = 3
contacts, gold immortal, the pilot WINS on 8/8 seeds with **zero deaths** and
exactly 15 eyes across 3 phases, one forced death still ends in a win, and
same-seed determinism by state hash.

## Known gaps / next ideas

- Two-player alternating mode (the classic was two-player) — a natural next
  step; lives and score are per-player in the original cabinet.
- Extra-ball (`C`) and multiball already exist in the sim; `E` expand is
  timed at 900 ticks — the original was ~10 s, close enough for now.
- The pilot's shaft-mode (gap piercing) is the fragile part of the fortress
  clear; a forward-simulated aim verifier would make it provably robust.
