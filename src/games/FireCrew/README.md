# FIRE CREW (#1254)

Original co-op firefighting, after the doc's rule: **split the information so
the crew has to talk**. A night warehouse, six victims, three seats that each
see a different slice of the smoke. RETRO bar, 480x320, everything synthesized.

## Files

- `sim.js` — the pure heart. Grid world (30x20 @ 16px): seeded layout, fire
  cells (`fuel/heat/burning/gone`), wind (direction + gust, re-rolled every
  900–1500 ticks), collapse (fuel out ⇒ hole), water, flares, victims, and the
  deterministic autopilot (BFS `stepToward`, heat-costed, never walks into
  flame). `lightAt()` is ONE law used both to decide who can *see* what and to
  draw the darkness — the information split is a rule, not a shader.
  The loft is only walkable via the ladder tile (x=15) with the stick ≥0.9;
  `stepToward` enforces the same gate so AIs replan when the stick drops.
  Determinism: mulberry32 here owns every sim random; `Math.random()` in the
  shell drives juice only (never reaches state).
- `attract.js` — rule-6 copy. `scripts/attractcheck.mjs` anchors on these
  exact strings; reword here and there together.
- `voiceradio.js` — the crew radio (#1361): the spoken grammar, pure Node.
  `parseRadio` turns a shouted call into an intent (spot / ladder / hold),
  the same law voicecalls.js is for GAUNTLET. A spot call is a flashlight
  SWEEP in sim.js — it lights one side through `lightAt` and costs the hose
  seat 15 battery (light is fuel), so the mic can never beat the darkness;
  ladder/hold calls drive the CPU seats through their pads. Fire is never
  the call — it glows through any smoke.
- `art.js` — prerendered backdrop (planks/crates/asphalt from a hash noise),
  3-frame fire, waving victims, 2-frame walk, engine/ladder/ambulance/hydrant,
  per-tile darkness pass + warm fire bleed + flare radial light.
- `index.jsx` — the shell per docs/GAME-SHELL.md: one rAF loop, FIXED_DT,
  attract → select (crew size 1–3) → play → over, `?` pause, VirtualControls
  (A=SOAK, B=FLARE), keys: seat 1 arrows+Space+B, seat 2 WASD+F/G,
  seat 3 IJKL+U/O. The `__game` contract carries per-seat pads
  (`step([p1,p2,p3])`, `reset(seed, players)`), sources report
  human/cpu per seat (#494) so a model can take any seat later.

## Rules worth knowing

- Fire spreads each half-tick with `0.0034 * windBias(dir)`; downwind 2.4+gust,
  upwind 0.35. Burning cells eat fuel (gales faster); empty fuel ⇒ `gone` ⇒
  hole. `walkable()` refuses holes unconditionally — this line once regressed
  to "tile kind only" and crews walked over the void (`firecrewcheck` owns it).
- The hose cone in `lightAt` is capped at 6 tiles — uncapped it saw the loft
  through the ceiling (the check "the hose seat cannot see the loft" owns it).
- Three knocks drag a firefighter to the engine for 4 s; a carried victim
  standing on a collapsing tile is lost. The structure clock is 2:00.
- Gales slip an unbraced, raised ladder (150 ticks) — seat 3 holds U to raise
  AND brace. This is why the third seat exists.
- The crew radio (#1361): V toggles the mic (consent first, #1247's ask, never
  auto-asked). A spot call is a flashlight sweep — it lights the named side
  through `lightAt` (the SAME rule that finds victims and draws the darkness)
  and costs the hose seat 15 battery, so a shout can only carry what a
  flashlight could reach; a dead battery is refused. Ladder and hold calls
  drive the CPU seats through their pads; against a human seat they are an
  echo only. Every call banks into the recording as `voiceCmd` + the raw
  track (`spec.voiceExtra`).

## Verify

```bash
npm run firecrewcheck      # Node gate: boots, rules, wins 8/10 seeds, wiring (65)
npm run attractcheck -- --mutate   # attract rules + 6 FIRE CREW mutants die
npm run lint:firecrew
npm run dev -- --port 5173 --strictPort   # then /retrogames/fire-crew
# drive:  __firecrewTest.resolveAll() forces the autopilot to the end;
#         PROGNOSIS in the F1 panel re-solves reachability on the LIVE state.
```

Mutant-on-file proof: `sed -i '' 's/0\.0034 \* windBias/0.0 * windBias/'
src/games/FireCrew/sim.js` turns firecrewcheck red ("the spread loop actually
routes through the wind law"); restore afterwards.

## Honest gaps (first follow-ups)

1. Seat 3 human movement is near-pointless (the truck is parked); consider
   a mobile ladder or wind-noise cue instead of walking.
2. Smoke drift is a static darkness field; real advected smoke (downwind
   thickening) would sell the wind harder.
3. Water is a straight 3-tile cone; pressure arc by tank level, and water
   reaching the loft through the ladder shaft, are unclaimed juice.
4. CPU never douses the loft (no bucket brigade) — a model seat could.
