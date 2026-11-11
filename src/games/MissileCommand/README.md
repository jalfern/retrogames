# MISSILE COMMAND (1980, Atari)

Six cities, three silos, ten interceptors a salvo. Wave after wave of
warheads picks targets off the board; explosions clear the sky. Bonus between
waves pays 100 per living city and 50 per spare missile, then reloads.

## Engine notes
- **Whole-tick sim (#1637 batch 29):** `sim.js` holds the ENTIRE world —
  `makeRun(seed)` builds it, `tickMc(gs, cmd)` advances exactly one fixed
  tick. No `setTimeout`, no `Math.random` inside (the wave break is
  `WAVE_BREAK_TICKS = 180` world ticks — that closes the old wall-clock
  cruft, #1525). `?seed=N` now replays the whole raid: spawner, intercepts,
  splashes, the lot.
- **Seed (#1473 batch 15):** targets, trails, the deco explosion colour and
  the attract pilot's trigger finger ride ONE seeded stream; `startRun()`
  regenerates the seed at every human start. Production report:
  `{tick,score,done,seed,wave}`. DebugKit (F1) shows cities/ammo/wave/watch
  and can fire or force a game over through the real destruction path.
- **Restart was missing entirely before the batch-15 port** — the GAME OVER
  screen was dead. `startRun()` now rebuilds cities, silos, ammo, score, wave
  and spawn state from any key, click, or canvas tap (phones included).
  Aim-with-mouse no longer silently leaves attract: a click starts the run.
- **WATCH (#1637 b29) — the proven route.** `gunnerStep(gs)` is the driver
  the Y seat runs, reactive per tick (Rogue law): it takes the LOWEST live
  warhead, re-simulates it with the engine's own discrete stepping, and fires
  at the earliest future point an ABM can meet it — centered at
  `SAFE_Y = 485` or above, which is out of every structure's 40 px reach
  (altitude is life, the arcade lesson). Each warhead gets one promised shot
  (`coverUntil`); when a cover lapses while it still lives, the next tick
  re-solves. Nearest silo by |dx| — the engine's own click law. Proof:
  every seed in the sweep clears waves 1–5 with **6 cities AND 3 silos
  untouched**, spending ≈ 1 ABM per warhead (79.8 avg vs 80). Deeper, the
  math gets honest: wave 11 spawns 32 warheads against 30 shells per wave —
  the sweep observes a deepest wave of 12, and no driver ever promised more.
  Seat: Y or the pill; ANY key, click, mouse move or board tap hands the
  crosshair back mid-barrage; watch never lingers into GAME OVER or a new raid.

## Verify
```
npm run missilecmdcheck             # 33 checks: raid replay, sweep 24 seeds waves 1-5 clean,
                                  #   doctrine pins (safe altitude, urgency, cover), wiring + registry
npm run missilecmdcheck -- --mutant # 9 mutants, all must die
npm run watchcheck                # live browser pilot (needs the dev server)
npm run feedbackcheck             # pin law + rollout floor (48)
npm run attractcheck              # attract screen rule 6
```

## Honest gaps
- No smart/missile-silo split, no two-player alternating game, no flying
  saucers dropping in mid-wave.
- Cities revive only between games (original revives every 10k points).
- The gunner is proven to wave 5 (the sweep's bar); past the ammo horizon
  (~wave 11) losing cities is arithmetic, not style.
- Outer batteries fire by nearest-silo |dx| like the human click law — the
  original's field-of-fire arcs per battery are not modelled.
