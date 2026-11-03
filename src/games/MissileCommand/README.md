# MISSILE COMMAND (1980, Atari)

Six cities, three silos, ten interceptors a salvo. Wave after wave of
warheads picks targets off the board; explosions clear the sky. Bonus between
waves pays 100 per living city and 50 per spare missile, then reloads.

## Engine notes
- `sim.js` holds the spawn dice: which surviving structure a warhead picks and
  where its trail enters the sky plus where the warhead starts (the original
  drew both independently — slanted trails). All three draw from the injected
  `rand` (`seedRng(seed)` upstream).
- **Seed (#1473 batch 15):** targets, trails, the deco explosion colour and
  the attract pilot's trigger finger ride ONE seeded stream; `startRun()`
  regenerates the seed at every human start and `?seed=N` replays the exact
  raid. Production report: `{tick,score,done,seed,wave}`. DebugKit (F1) shows
  cities/ammo/wave and can fire or force a game over through the real
  destruction path.
- **Restart was missing entirely before this port** — the GAME OVER screen was
  dead. `startRun()` now rebuilds cities, silos, ammo, score, wave and spawn
  state from any key, click, or canvas tap (phones included). Aim-with-mouse
  no longer silently leaves attract: a click starts the run.
- Known engine cruft kept from the original port: wave breaks run on a
  `setTimeout(3s)` wall clock, not the fixed timestep.

## Verify
```
npm run missilecmdcheck             # 15 checks: seeded raid replay, ranges, terminal, restart
npm run missilecmdcheck -- --mutant # 4 mutants, all must die
npm run feedbackcheck             # pin law + rollout floor (48)
npm run attractcheck              # attract screen rule 6
```

## Honest gaps
- No smart/missile-silo split, no two-player alternating game, no flying
  saucers dropping in mid-wave.
- Cities revive only between games (original revives every 10k points).
- Wave break uses a wall-clock timeout (see above) — a harness that owns the
  clock must wait it out in world time.
