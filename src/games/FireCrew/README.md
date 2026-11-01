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
  The loft is only walkable via the ladder column (`g.ladderX`) with the
  stick ≥0.9; `stepToward` enforces the same gate so AIs replan when the
  stick drops. **The ladder is mobile (#1424): the base column follows
  seat 3's x while the loft line is clear, and holds while anyone is on
  the loft** (a base pulled out from under a climber would strand them).
  A raised ladder is also a water shaft: a stream crossing the base column
  climbs it and soaks the loft decking above (the hose seat's only way up).
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
- The mobile ladder (#1424): seat 3's x IS the base column (`g.ladderX`)
  while no one is on the loft; the base holds while a climber is up. The
  CPU ladder seat walks the base under the nearest loft victim, else under a
  loft fire (the bucket brigade). The CPU hose climbs the stick to douse a
  loft fire — a human hose never climbs; its loft tool is the shaft: with
  the stick ≥0.9, a stream crossing the base column soaks the loft column
  above it, one cell of run per loft row.
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

1. **Night art pass (#1424 remainder):** check the drawn night against
   docs/ART.md exemplars — flame palette variety per fuel type, ember
   particles on gale shifts, and the collapse hole needs a clearer
   telegraph before it drops.
2. The ladder has no wind-noise cue yet: seat 3 reads gales from the HUD
   vane and the ladder physics, not from sound.

Shipped since the first pass:
- **#1424 — the three meat gaps:** the mobile ladder (base follows seat 3,
  holds under a climber, `loftGateX` keeps the base off the pillar lines),
  the ladder shaft (stream crossing the base column soaks the loft above —
  `cool()` gained a `loftOK` so a ground line can never cheat the decking),
  and the CPU bucket brigade (the CPU hose climbs the stick to douse a loft
  fire; the CPU ladder walks the base under loft work). Mutants below.
- **#1411:** advected smoke — a seeded field that
drifts downwind one tile every 5/9/14 ticks (gale/calm-breeze/calm), pools
against walls, vents at the doors, and dims crew-lamp light up to 30% while
sources above 0.9 (fire, flares) pierce it; and the hose pressure arc —
range 4/3/2/1 by tank level with a wide nozzle fan above 60%. `advectSmoke`
is rng-free, so replays and the hashes are unchanged in kind.
Mutant-on-file: `sed -i '' 's/^    advectSmoke(g)$/    void g \&\& 0/'
src/games/FireCrew/sim.js` turns the five drift gates red; restoring the
one line is green.
#1424 mutants (all one-line, all turn a named gate red):
- follow law: `sed -i '' 's/    if (!g.crew.some((f) => inLoft(f.y))) g.ladderX = g.crew\[2\].x/    void 0/' src/games/FireCrew/sim.js`
  — "the base follows seat 3 once the loft line is clear" goes red.
- shaft: delete the body of the `if (d[0] !== 0 && g.ladder > 0.9)` block in `crewA`
  (keep the condition) — "the stream climbs the shaft and soaks the loft column" goes red.
- bucket brigade: change the `if (g.ladder > 0.9) {` line that opens the
  bucket-brigade branch in `cpuHose` to `if (false) {` — "the CPU douses a
  loft fire (the bucket brigade)" goes red (the shaft is the hose's own
  ground law; the branch is what makes a loft fire the CPU's job).
