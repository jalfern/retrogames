# TEMPEST (Atari, 1981) — engine notes

The vector tube shooter: ride the glowing rim of a polygonal tube, fire down the
faces, and stop everything before it reaches you. Original by Dave Theurer.

## Files

- `rng.js` — one seeded generator (mulberry32); the sim path never calls `Math.random`.
- `sim.js` — the whole game as `step(state, input, dt)` (60 Hz), resolution-free.
  World model: perimeter coordinate `A ∈ [0, faces)` (absolute position walking the
  near ring in face units) × depth `t ∈ [0,1]` (0 far end, 1 the rim you stand on).
  The face is the lane: a bullet kills the first enemy riding its face. Firing while
  straddling a boundary snaps to the edge line — the **super bullet** — which pierces
  and rakes both faces flanking that edge, chain-killing. Enemies: **flippers**
  hinge across face boundaries while climbing; **pulsers** launch from the far ring
  and curve toward you (angular convergence scaled with ring size); **spinners**
  spiral the deep then lock a lane and dive at 2.4× climb. The **rim rule**: any
  arrival at t=1 kills, at ANY longitude (the cabinet rule). 4 ships, +1 every
  10,000; wave-clear bonus 1000×level; four waves cycle 16·16·32·96 faces
  (the 96 ring keeps its wave sparse — travel is the tax there). The player wraps
  at a constant angular rate (¾ rev/s), so the 96-ring whips past exactly like the
  cabinet's. `CFG` holds every load-bearing constant for the harness.
- `planner.js` — the autopilot / attract pilot. Schedules by **slack** (time until
  an arrival beats time-to-kill), commits to a target until it dies, seizes the
  newest imminent arrival, leads flippers and orbiting spinners by bullet flight
  time, cross-fires anything already down the current lane, and takes edge clusters
  with the super bullet. `decide` is exported so the harness audits the pilot's
  honesty directly.
- `art.js` — vector style drawn in code: seeded starfield (outside the tube mouth
  and in the deep center), glow-stroked tube (radial edges, far ring, ridge
  chevrons on diamond levels, pulsing near rim), red hinge-flippers, purple
  pulsing diamonds, green/red spinner circles, and the classic twin-dart ship
  cycling hue every frame — exactly like the cabinet.
- `index.jsx` — cabinet shell: attract replays the autopilot's proven four-wave
  campaign tick-for-tick; SCORE/WAVE HUD + ship icons + hi-score board; particles,
  shake, flash on arrivals; `?` pauses; VirtualControls (D-pad + A fire);
  DEV hook `__tempestTest` and DebugKit (PROGNOSIS re-runs the pilot and reports
  whether the campaign is still winnable deathless).

## Controls

◀ ▶ (or A/D, or the D-pad) slide the rim — it wraps all the way around.
SPACE / Z / A fires down the face you stand on; stand on an edge line for the
super bullet. `?` pauses. Tap the screen starts and restarts.

## Verify

```bash
npm run lint:tempest               # eslint gate for this game + shared code
npm run tempestcheck             # 46 Node checks: determinism, ring geometry
                                 # (continuity, wrap, 16·16·32·96 table), the rim
                                 # rule at both longitudes, lane kills, super-bullet
                                 # rake + chain, flipper hinge, pulser homing,
                                 # spinner dive, spawn budget, wave advance + bonus,
                                 # bonus life, death reset, terminal over/win,
                                 # 4-seed deathless wins + slack rule, and 10 ART
                                 # gates (#298: depth variants per type, hinge on
                                 # the edge line, trail length/width, center glow,
                                 # hue override, zap decay) via a stub ctx
npm run tempestcheck -- --mutate  # + 4 mutants (rim kill off, lane kill off,
                                 # super pierce off, scoring off) — all must die
npm run tempestplay            # advisory browser drive (needs npm run dev):
                               # start/fire/slide both ways, idle arrivals kill,
                               # restart, HUD mirrors sim, zero page errors
```

Slack rule: a uniform handicap of **2 units** (fire cooldown +0.40, bullet speed
−0.44, spawn gap −0.18, climb +0.030) still wins the whole campaign **deathless
on four seeds**; at **3 units it loses** — the gun/tube economy is load-bearing.
Single knobs (cooldown alone, player speed alone) do NOT bite: the pilot wins by
throughput scheduling, so the harness handicaps the whole economy at once.

## Fidelity notes and honest gaps

- The original's exact enemy score table is my best recall (flipper 200, pulser
  50+50 per pulse stage, spinner 150); flagged as approximate.
- Saucers, the timed fuse bomb, and Tempest Plus' claws/tanks are out of scope;
  the warp-select between waves is simplified to auto-advance with a bonus.
- The level table (16 open, 16 diamond, 32, 96) follows the early original
  cycle; enemy mixes and wave sizes are tuned for the proof, with the 96-ring
  restricted to pulsers because spinner dives across a 96-face ring are physically
  uninteceptable at any sane ship speed (the cabinet's 96-face level leaned on
  converging pulsers for the same reason).
- Pulser "straight-line" flight is modeled as angular convergence toward you —
  a chord across the tube mouth reads as a diagonal on the flat screen.
- Rotation/zoom scope of the arcade monitor is not emulated; the camera locks the
  ship at screen-bottom and the tube counter-rotates, which is the original's
  actual trick.
- The proof campaign ends at four waves (one full geometry cycle) for a terminal,
  harness-provable state; the sim is endless-shaped — raise `TARGET_WAVES` and it
  loops the level table with growing speed.
- Multiplayer: none — two-player mode existed on the cabinet as alternating
  turns; single craft keeps the phone build honest.

## #298 polish pass (QA, 2026-10-20)

- Depth-progressive enemy art: each type swaps 3 line variants by depth band
  (near/mid/deep) — flipper hinge→fold→midrib, pulser diamond→+inner ring→+spokes,
  spinner dot→circle+core→+orbit-dot ring. The cabinet kept deep shapes legible
  this way. `art.js` bands on `posAt().s`.
- Flipper hinge axis runs along the shared radial edge line; the flap folds
  across it face-to-face (apex position = `1 - cos(frac·π)` along the face).
- Super bullet flashes the full edge polyline for ~12 ticks on launch (`super`
  event → `drawZaps`, decaying alpha + width), plus a double-wide trail head.
- Bullet trails now span 0.1 depth (super 0.18) with a fading 3-point tail.
- Arrival alarm: while any enemy has `t > 0.8` a rising tone loops (pitch with
  t, every 5 ticks) and the rim segment under the imminent arrival glows hot red.
- Wave clear cross-fades the tube palette over 1s (`drawTube` hue/alpha opts).
- Far-ring center breathes: radial gradient pulsing with the rim phase.
- Ship hue rate is tied to wave/score (12°/frame at wave 1, −1 per wave and per
  8k score, floor 4) instead of a flat 6.
