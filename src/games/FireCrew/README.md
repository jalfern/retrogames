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
- Voices in the smoke (#2994): a still-hidden victim cries. The cry carries
  across the floor it is on, up to `CRY_RANGE = 5` tiles — light is
  directional and long, sound is omni-directional and short. Only the still-lost
  cry (found, carried, rescued and lost are silence). `cryAt(g, seat)` is the
  per-seat law — the mirror of `lightAt`: on a three-seat device only the seat
  standing in earshot of a voice hears it — and `step()` names each new voice
  once for human seats while cpu seats and a seated WATCH stay silent (#2989
  law: hands off, ears off). The cry names no direction and draws no marker:
  within-range is all it says; closing in stays the light's job.

## Verify

```bash
npm run firecrewcheck      # Node gate: boots, rules, wins 8/10 seeds, wiring, night art, model.js senses (228)
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

- **DISCLAIMER** — trainable production line (#1712): the adapter and wiring are
  proven on the fixture store; the PRODUCTION card keeps `fire-crew` humanTakes
  at 0 until consented phone takes land at https://jalfern.com/retrogames/fire-crew
  — the lines are human data, as ever. This is a decided state, not lane work
  (#2488 doctrine): a lane must never fake a human take, so the bullet states
  the wait without scoring as weakness; #1712 (and #2985 item 5, the first-live-
  take acceptance) own it until the first take lands, and this bullet is deleted
  in the PR that closes those lines.

- Wind-noise cue for the ladder seat — **CLOSED by #1744** (`windVoice(gust)`
  and `ladderCreak(gust, ladder)` in `sim.js` — pure, rng-free, so replays and
  hashes are untouched): calm is silence, a breeze a soft low bed, a gale loud,
  deep and long; the creak is the load moan of a gale bending a ladder past 0.4,
  heavier as the ladder tops out. `index.jsx` overlaps `playFilteredNoise` bursts
  at 85% of the voice duration so the wind reads continuous, and moans the creak
  every ~0.7–1.2 s while the load holds. `firecrewcheck` +8 gates (calm silence,
  monotone loudness/brightness, rng-free, creak needs both, moan shape, and two
  src pins that the shell routes through the sim voices, never its own numbers);
  `firecrewplay` +4 browser gates on real rAF ticks (breeze lays the bed, gale +
  extended ladder howls and creaks, calm silences both, live-shift guard).
  Mutants (one line each, in `sim.js`):
  - bed: `sed -i '' 's/gust >= 2 ? { vol: 0.085/gust >= 2 ? { vol: 0/' src/games/FireCrew/sim.js`
    — "the bed gets louder as the wind rises" goes red.
  - creak: `sed -i '' 's/gust >= 2 && ladder > 0.4/false/' src/games/FireCrew/sim.js`
    — the two creak gates go red.
  - routing: swap `windVoice(g.wind.gust)` in `index.jsx` for a literal voice —
    the bed src pin goes red.

- Wind direction, the pre-whistle, the jingle tails — **CLOSED by #1749**
  (the audio/feel remainder of the polish pass; the truck silhouette, smoke-dim
  fire and crew breathe remain open under #1766): `windVoice(gust, dir)` now leans into the
  compass — a horizontal wind (E/W) tilts the bed's pitch by a fixed ±30 Hz
  (E lifts, W sinks), and a cross-wind (N/S) carries a second, quieter burst an
  octave lower (the mix has no pan, so the octave shadow is how a gale reads
  "from the other side"); CALM/omitted dir stays the centered #1744 voice.
  `windWhistle(remaining)` is the vane pre-whistle: a rising figure in the last
  60 ticks before the wind turns (one fixed f0 240, climbing f1 to 760,
  thickening vol) so seat 3 braces instead of reacting — the sim already knew
  `wind.next`; now it is heard. `crewTail(win)` is the crowd/machinery murmur
  under the win/lose jingle (ducked: 0.05/0.06 vs the jingle's 0.09/0.08; the
  loss tail is darker and lingers longer). All three are pure, rng-free specs
  in `sim.js` — replays, hashes and the autopilot are untouched. `index.jsx`
  fires them: the cross-wind shadow through a new `playFilteredNoise` delay
  param (0.15 s under the bed), the whistle at most one shot per 15 ticks on
  the sim countdown, the tail 0.1 s into the jingle. `firecrewcheck` +19 gates
  (tilt amounts, shadow shape, window, climb ≥ a fifth, pinned max, duck
  contract, four src routing pins); `firecrewplay` +3 browser gates on real
  rAF ticks (cross-wind shadow fires, east gale lifts without shadow, the
  whistle fires and climbs before the shift lands). Mutants (one line each,
  in `sim.js`):
  - tilt: `sed -i '' 's/freq: main.freq + d\[0\] \* 30/freq: main.freq/' src/games/FireCrew/sim.js`
    — the east/west tilt gates (three) go red.
  - shadow: `sed -i '' 's/freq: main.freq \/ 2/freq: main.freq/' src/games/FireCrew/sim.js`
    — "a cross-wind carries a quieter, shorter burst an octave lower" goes red.
  - whistle climb: `sed -i '' 's/u \* 520/u * 52/' src/games/FireCrew/sim.js`
    — the climb and max-urgency gates go red.
  - window: `sed -i '' 's/export const WIND_TELEGRAPH = 60/export const WIND_TELEGRAPH = 120/' src/games/FireCrew/sim.js`
    — the window and silence gates go red.
  - tails: `sed -i '' 's/win ? { dur: 1.2, vol: 0.05, freq: 520 }/win ? { dur: 1.8, vol: 0.06, freq: 300 }/' src/games/FireCrew/sim.js`
    — "the loss tail is darker and lingers longer" goes red.

## Shipped since the first pass

- **#2994 — voices in the smoke (never-dry polish):** the information split had
  one direction — light finds the lost. `helpCry(dist)` and `cryAt(g, seat)` in
  `sim.js` open the mirror law (windVoice/tankAlarm pattern, pure and rng-free):
  a still-hidden victim cries across its own floor up to `CRY_RANGE = 5` tiles —
  omni-directional where the flashlight cone is directional, short where it is
  long — and the audible-but-unlit band is real geometry the gates pin (cells
  within earshot that `lightAt` denies). Only the still-lost cry; found, carried,
  rescued and lost are silence; no voice crosses the decking (mirror of the
  water law). `step()` names each new voice once per victim for human seats
  (`SOMEONE'S IN THERE - LISTEN`) — cpu seats neither hear nor spend the naming,
  a seated WATCH is silent (#2989), and the repeated locating cry is the shell's
  cadence on the sim's `CRY_BEATS` = 30, voice from `helpCry`, never shell
  numbers. `art.js` gains nothing: an audible-but-unlit victim gets no drawn
  marker — a pin would leak exactly the position the light law denies. Hash and
  autopilot untouched (`cryAt` is a pure read, `cried` is hash-invisible like
  battery and sweep; replays byte-equal). The README's #1712 bullet also gets
  its doctrine shape: `**DISCLAIMER** —` — the marker `parseGaps` declines, which
  is why this game kept topping never-dry scoring as a decided human-data state
  (#2488). `firecrewcheck` +27 (voice algebra, geometry, naming law, determinism,
  src pins, README doctrine); `firecrewplay` +7 browser legs on real rAF ticks
  (drive inside → hear the cry; out of reach → silence; seated → ears shut;
  released → hears again). Mutants (one line each):
  - reach: `sed -i '' 's/export const CRY_RANGE = 5/export const CRY_RANGE = 1/' src/games/FireCrew/sim.js`
    — the five-tiles constant and the audible-band geometry gate (two) go red.
  - hidden-only: `sed -i '' "s/if (v.state !== 'hidden') continue/if (false) continue/" src/games/FireCrew/sim.js`
    — the found-are-silent gate goes red (with the near/nearest/once gates, five).
  - decking: `sed -i '' "s/if (inLoft(v.y) !== floor) continue/continue/" src/games/FireCrew/sim.js`
    — the same-deck-carries gate goes red (the silence-expected pair gate passes vacuously — the pair is what pins the line).
  - closeness: `sed -i '' 's/(CRY_RANGE - Math.max(0, dist))/(Math.max(0, dist))/' src/games/FireCrew/sim.js`
    — the climb-as-it-nears gate goes red (pitch would fall as the voice nears).
  - human-only stamp: `sed -i '' "s/if (g.sources\[s - 1\] !== 'human') continue/if (g.sources[s - 1] === 'human') continue/" src/games/FireCrew/sim.js`
    — the naming, cpu-silence and src-pin gates (three) go red: a robot house names nothing, and the pin refuses the inverted law.
- **#2989 — the tank speaks (never-dry polish):** the pressure arc (#1411)
  shrinks the stream 4→3→2→1 as the tank drains and dry kills it — but the
  human hose heard only its own spray stop, while the CPU hose already refills
  under 25 and the battery names its refusal. `TANK_LOW = 30` (the arc's first
  lost muscle) and `tankAlarm(level)` in `sim.js` — pure, rng-free voice spec
  (windVoice pattern): null above the threshold, a two-tone caution whose pitch
  and weight climb with the drain, a low dry-valve clunk at zero. `step()`
  names each downward crossing for the human seat 1 (`TANK LOW - REFILL AT THE
  HYDRANT` / `TANK EMPTY - NO REACH`) — cpu seats and a seated WATCH stay
  silent, refills are silent (the hydrant is never nagged), re-crossings name
  again. `index.jsx` fires the specs on the crossings, adds a held dry-valve
  click in the spray mirror (`tick % 14`, the arc's edge cases included), and
  routes nothing through shell numbers. `art.js` blinks the bar amber↔ember
  under TANK_LOW and keeps a red↔dark stub when dry — an invisible zero
  becomes the loudest thing on the gauge. `firecrewcheck` +22 (voice algebra,
  crossing stamps, src pins, HUD blink through the recording-ctx pattern);
  `firecrewplay` +7 legs on real rAF ticks (force→hear LOW, force→clunk DRY,
  held-dry, seated silence, re-seat names again). Mutants (one line each):
  - stamp: `sed -i '' 's/hoseStage > g.tankStage/hoseStage > 99/' src/games/FireCrew/sim.js`
    — the crossing gates (4) go red.
  - voice: `sed -i '' 's/drain \* 180/-drain * 180/' src/games/FireCrew/sim.js`
    — "the caution climbs with the drain" goes red.
  - blink: `sed -i '' "s/Math.floor(g.tick \/ 10) % 2 ? '#ffd24a' : '#ff8a5a'/'#39d7ff'/" src/games/FireCrew/art.js`
    — the amber blink gate goes red.
  - routing: `sed -i '' 's/p\.tank > TANK_LOW/p.tank > 40/' src/games/FireCrew/index.jsx`
    — the two src pins go red (invented levels are refused).
- **#1712 — trainable (PLAICRAFT S2 adapter + auto-capture):** the crew now
    records itself. The shell wires `autoRecord` like the shelf's eight before
    it: consent goes up BEFORE the alarm is struck (recorder opens at
    seed-birth, files replay-verify from tick 1), `recordLiveTick` banks the
    per-seat pads the loop consumed, and `endRun` ships the take after the
    radio's final chunk lands (endVoice orders it). Seat kinds resolve live at
    record-STOP (Rally's law + `humanSeats:false`): a WATCH left on when the
    clock dies is labelled cpu, not stamped human. The WATCH flips themselves
    ride `rules.watch` ("t0-t1,…") — the seed cannot know when a watcher let
    go, so the sheet stamps the ticks; the adapter (`fireCrewRows`,
    scripts/plaicraft-dataset.mjs) re-seats the autopilot at the spans and
    DROPS seat-0 rows inside them (nobody's hands were on the wheel), and
    re-runs banked radio calls through THE sim's `applyRadio` (battery and
    sweep never touch the hash, so the replay is exact). Voice: the auto mic
    captures seat 0 from seed-birth when the gate grants voice; the radio's own
    raw track yields then (`hasAutoVoice()` — validateVoice forbids slot 0
    twice) while recognition stays live either way. `model.js` adds THE 65
    seat features: the `lightAt` law IS the featurizer's eyes (a victim the
    smoke hides is an honest zero; fire is shared because it glows through),
    radio one-hots with countdown, wind + vane, rig state, autoregressive
    prev-pad banked after the label. Proof: `plaicraft:datasetcheck` 81/81
    (+4 legs: verify/tamper, radio re-seat, watch-span drop, split-honesty;
    mutant 14 adapter-bypass dies by name), `firecrewcheck` 171 (+6 model
    gates; the `lightAt` leak gate goes red when the view is widened past the
    law), `firecrewplay` +4 browser gates (the gate goes up at START, declines
    still play, spans open/close into the rules string). Recording `side` into
    voiceCmd (recording.js) — an adapter that cannot re-seat a sweep cannot
    verify a shouted take.
- **#2985 — QA polish (named span cap, one voice ask):** the WATCH-span bank
    is capped at `WATCH_SPAN_CAP = 64` and the cap is HONEST: past it banking
    STOPS and the take stamps `rules.watchOverflow:'1'` (the old `slice(-19)`
    silently lost early spans, so the take just failed replay and nobody knew
    why). `fireCrewRows` refuses an overflow-stamped take up front
    (`ok:false, overflow:true`) — a provably incomplete span list never burns
    a replay. And the radio reuses the auto gate's voice grant when it already
    covers seat 0 (`hasAutoVoice()`): one ask per person per device; the
    browser's own permission bubble is not the second ask. Proof:
    `firecrewcheck` +3 source gates, `firecrewplay` +1 cap law (a 65-flip
    storm banks exactly 64 spans and names the 65th), datasetcheck +1
    overflow-refuse unit.
  - **#2985 item 4 — the refusal is a sense (`radioDeny`):** a LIGHT DEAD
    shout lived only in the message, so a seat learning to shout could never
    see its shout FAIL. `applyRadio` now stamps `g.radioDenyT = DENY_ECHO_TICKS`
    (120 — the echo's own length) and the featurizer mirrors `sweepLeft`:
    `radioDeny` + `radioDenyLeft` countdown, shared like every radio lane
    (N_FEAT 65→67). The refusal never touches `stateHash` (like battery and
    sweep), and `fireCrewRows` re-seats refused banked calls too — battery is
    pad-deterministic, so the replay re-lights the same refusal and rows train
    what live carried. Proof: `firecrewcheck` +5 gates (stamp/decay/silence +
    honest-zero + lit lane, all in plain Node), datasetcheck +1 refusal-replay
    unit (flare-starved take: denied at t=80, lane lights the row, silent by
    t=200, take still verifies).
- **#1766 — polish round 3 (truck silhouette, smoke-dimmed fire, crew breathe):**
  three visual bullets, all provable in plain Node through the #1440 recording-ctx
  pattern (they draw only fillRects). (1) *The ladder truck IS the base column*
  (#1424's `g.ladderX`): `drawLadderTruck` in `art.js` parks a body/skirt/cab/
  wheels/headlight at seat 3's column with a red↔blue light bar that turns, so the
  bare ladder line reads as a vehicle; it rides the base law — move `g.ladderX` and
  the whole truck moves. `drawProps` calls it every frame. (2) *Distant fire greys
  behind smoke*: `SMOKE_FIRE_DIM` (0.45) — a burning cell whose advected
  `g.smoke[i]` sits above the threshold draws the desaturated `FLAME.smoke` palette
  (saturation dies before brightness), the drawn mirror of the sim's `SMOKE_DIM`
  light law; per-cell, so a clear neighbour still burns. (3) *An idle firefighter
  breathes*: `breath = moving ? 0 : floor(t / BREATHE) % 2` lifts coat/trim/helmet/
  tool one pixel while the feet stay planted; a walker runs the step cycle instead.
  17 gates in `firecrewcheck` (+1 → 148 total). Mutants (one line each): revert the
  palette routing → 4 smoke gates red; `const breath = 0` → 2 breathe gates red;
  delete the `drawLadderTruck(ctx, g, t)` call in `drawProps` → the props pin red.
  Gotcha learned: `g.smoke` is a `Float32Array`, so storing the JS double `0.45`
  rounds *below* the `>= 0.45` threshold — set a robustly-above density in gates.
- **#1440 — night art pass (gap 4):** flame palette per fuel (loft decking
  burns heavy-timber amber, ground crates burn white-hot), gale shifts throw
  bright ember streaks downwind (gust 2 only, calm never), and a starving
  FUEL cell telegraphs its collapse before the sim opens the hole: the flame
  sinks toward the joists, sag cracks etch the planks, and the hole-rim
  blinks. Nine gates in firecrewcheck drive `drawFire` through a recording
  ctx stub — the art pass is provable in plain Node. Mutants (one line each,
  in `art.js`):
  - palette: `sed -i '' 's/y <= LOFT_Y1 ? FLAME.loft : FLAME.crate/FLAME.loft/' src/games/FireCrew/art.js`
    — "ground crates burn white-hot" goes red.
  - telegraph: `sed -i '' 's/const warn = c.fuel < COLLAPSE_WARN_FUEL/const warn = false/' src/games/FireCrew/art.js`
    — the cracks, rim and sink gates (three) go red.
  - gale: `sed -i '' 's/if (gale && hash(x, y, Math.floor(t \/ 5)) < 0.45)/if (false)/' src/games/FireCrew/art.js`
    — both streak gates go red.
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

## WATCH seat (#1637 b28)
The proven route is not new here — the sim has always driven `cpu` seats with
its own autopilot, and `firecrewcheck` races that path (`runTo`: 6/6 rescues on
the named seed list, byte-equal replays). So the WATCH seat is the SHEET flip:
Y sets `gs.sources[0] = 'cpu'` (any driving key or a field tap sets it back to
`'human'`, and the pressed key lands in `keys1` the same tick — a held key
drives immediately). Consequences the gates pin:
- seated spray mirror is silent (`!watchingRef.current && h.a`), so held SPACE
  never fakes the hose sound while the autopilot works;
- radio (V + shouts) STAYS live seated — calls steer cpu seats by design
  ("a human shout outranks the autopilot", sim.js), which makes WATCH here a
  co-driver mode: watch the route, still shout "LADDER UP";
- watch never lingers: `startPlay` rebuilds sources human, `finish` releases
  silent (racer rule);
- the attract watch-pill is honestly SKIPPED (watchphonecheck SKIP_ATTRACT: the
  crew picker sits in the boot path and the attract IS the CPU-crew demo);
  on phones the in-run pill (#1653 safe-area law) seats seat 1 mid-alarm.
Verify: `npm run firecrewcheck` (seat rules: cpu drives / human idles with an
empty pad; byte-equal across 24 seeds; rescue floor >= 18/24 honest share) and
`DEV_PORT=<port> npm run watchcheck -- --only fire-crew` (Y seats with blips,
crew works idle hands, steer takes over, re-seat resumes from the live floor).
