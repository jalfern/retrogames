# PAC-MAN (1980, Midway/Namco port)

Breadth-first ghost town: four pen-held ghosts, one energizer gamble, tunnel
wrap, arcade cornering (#472: held diagonals keep the heading and pre-turn the
other axis; a 180 is instant; turns start up to 4px early).

## Engine notes
- `move.js` is the pure core: player rules (`stepPlayer`, `tileOpen`) AND the
  whole ghost brain (`stepGhost`: pen timers, exit funnel, chase BFS, inky's
  coin flip, scared wander, tunnel wrap, touch predicate). `index.jsx` keeps
  drawing, input, and the consequences (score, lives, respawn, audio).
- **Seed (#1473 batch 15):** every gameplay die — ghost wander, inky coin
  flip, attract picks, even the dot-eat pitch — draws from ONE mulberry32
  stream (`seedRng`). The seed regenerates at every human start and
  `?seed=N` replays the exact ghost script. The attract demo spends its own
  pre-start draws. Production report: `{tick,score,done,seed,lives}`.
  DebugKit (F1) shows the live seed and can reset positions / force game over.
- Score fidelity: the score is no longer zeroed when the last life is lost —
  it stays on the GAME OVER screen like the arcade and clears only at restart.
- **Fruit (#1517):** bonus cherries drop at the 70th and 170th pellet (once per
  threshold), sit at `FRUIT_POS` below the ghost house for `FRUIT_TICKS` (600
  world ticks — the blink phase reads the timer, never `Date.now()`), pay 100,
  and blink for the last `FRUIT_BLINK` ticks. The fruit timer rides through
  lives (only a new stage resets it), like the arcade. Dead ghosts now render
  pupils facing their heading — the classic eyes-home direction cue.

## Verify
```
npm run pacmancheck            # 72 checks: input rules, maze, attract, seed replay, fruit, eyes-home
npm run pacmancheck -- --mutate  # 21 mutants, all must die
npm run feedbackcheck          # pin law + rollout floor (48)
```

## Honest gaps
- No intermission ("brief") screen; ghost speed per score stage is fixed at one
  speed class. Fruit is cherries-only (stage-keyed fruit art/types are open).
- Chrome on this dev box aborts (#737), so browser-tier drive is advisory;
  the Node gate carries the proof.
