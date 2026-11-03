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

## Verify
```
npm run pacmancheck            # 48 checks: input rules, maze, attract, seed replay
npm run pacmancheck -- --mutate  # 12 mutants, all must die
npm run feedbackcheck          # pin law + rollout floor (48)
```

## Honest gaps
- No fruit, no intermission, ghost speed stages per score are fixed at one
  speed class; scared flash uses the power timer, not the arcade's 2-stage flash.
- Chrome on this dev box aborts (#737), so browser-tier drive is advisory;
  the Node gate carries the proof.
