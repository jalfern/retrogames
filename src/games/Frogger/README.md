# FROGGER (1981, Konami)

Five homes, four river lanes, five roads and a rest lane: hop, ride, dive
turtles, beat the clock. Fly house = +200, level clear = +1000, lanes speed up
12% per level (cap 1.8×).

## Engine notes
- `sim.js` holds the world-spawn dice: each floating lane's dive-phase offset
  (`t`) and which home hosts the fly. Both draw from the injected `rand`
  (`seedRng(seed)` upstream), so a seeded world reproduces its traffic exactly.
- **Seed (#1473 batch 15):** lane offsets, the bonus house and the attract
  pilot's wobble hops all ride ONE seeded stream; `startGame()` regenerates
  the seed at every human start and `?seed=N` replays the exact traffic.
  Production report: `{tick,score,done,seed,lives,level}`. DebugKit (F1) shows
  the seed/house row and can hop or force a game over through the real death
  path.
- The attract demo plays by the same rules as the player (demoThink drives the
  real `hop`), and the splat freezes under GAME OVER.

## Verify
```
npm run froggercheck             # 17 checks: attract rule 6 + seed replay
npm run froggercheck -- --mutate # 8 mutants, all must die
npm run feedbackcheck            # pin law + rollout floor (48)
```

## Honest gaps
- No 2-player alternating turns; no arcade bonus timer per row-entry sound.
- Original logs-turtles carry frogs off-screen only via riding; a frog riding
  off the edge dies as "off" — faithful, but the arcade shows a distinct
  off-screen splat.
