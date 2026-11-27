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
  pre-start draws. Production report: `{tick,score,done,seed,lives,round,stage}`.
  DebugKit (F1) shows the live seed, can reset positions / force game over,
  and (#3661) rides the ladder: Next round / Round → 14 / Score → 5000.
- **Progression (#3661):** the round number and score now bite on four axes.
  `SPEED_STAGES` lifts pac (0.15→0.178) and every ghost base (×1→×1.2) at
  score 700/2000/5000; `ghostSlowsAt` halves ghost speed on the warp-tunnel
  mouths (row 14, x ≤ 9 / x ≥ 18 — the ghost-house span is NOT a tunnel) with
  the scared/dead multipliers stacking after the stage factor; `energizerTicks`
  decays the fright window per round (600 → 120) and from round 14 the pellet
  scores 50 but frightens nobody; `fruitForRound` keys the drop kind/value
  (cherry 100 r1, strawberry 300 r2, peach 500 r3–4, galaxian 1000 r5–6,
  bell 2000 r7–8, key 5000 r9–10, bell/key pair cycling from r11). The LAWS
  are sourced (Wikipedia "Pac-Man" §Gameplay: ghosts speed up, ghosts slow at
  the tunnels, energizer effect decreases then disappears, fruit bonuses);
  the exact rates/values are this repo's pinned spec — dice-free, so late-round
  replay stays deterministic. The component owns the round counter (human start
  → 1, cleared maze → +1) and paints the round's fruit as a HUD icon.
  Round 1 below 700 outside the tunnels is byte-identical to pre-#3661 (the
  identity floor is pinned in `pacmancheck §progression`).
- Score fidelity: the score is no longer zeroed when the last life is lost —
  it stays on the GAME OVER screen like the arcade and clears only at restart.
- **Fruit (#1517):** bonus fruit drops at the 70th and 170th pellet (once per
  threshold), sits at `FRUIT_POS` below the ghost house for `FRUIT_TICKS` (600
  world ticks — the blink phase reads the timer, never `Date.now()`), blinks
  for the last `FRUIT_BLINK` ticks, and pays `fruitForRound(round).points`
  (kind art in `index.jsx drawFruit`). The fruit timer rides through
  lives (only a new stage resets it), like the arcade. Dead ghosts now render
  pupils facing their heading — the classic eyes-home direction cue.

## Verify
```
npm run pacmancheck            # 102 checks: input rules, maze, attract, seed replay, fruit, eyes-home, #3661 progression
npm run pacmancheck -- --mutate  # 31 mutants, all must die
npm run pacprogressiondrive  # real Chrome: HUD fruit paint vs probe, ladder cheats, restart (advisory #737)
npm run feedbackcheck          # pin law + rollout floor (48)
```

## Honest gaps
- ~~No intermission ("brief") screen; ghost speed per score stage is fixed at
  one speed class. Fruit is cherries-only (stage-keyed fruit art/types are
  open).~~ #3661 shipped the ladder: score-stage speeds, tunnel-mouth crawl,
  round-keyed fruit kinds/values, energizer decay to nothing at r14. The exact
  rate tables are this repo's pinned spec (UNVERIFIED against arcade ROMs).
- No intermission ("brief") cutscenes between rounds (#3667 item 1) — the
  arcade's humorous Pac-vs-Blinky shorts stay unwitnessed in-repo.
- Chrome on this dev box aborts (#737), so browser-tier drive is advisory;
  the Node gate carries the proof.
