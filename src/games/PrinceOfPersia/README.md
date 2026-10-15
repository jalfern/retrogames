# PRINCE OF PERSIA

Jordan Mechner's 1989 Brøderbund dungeon escape, rebuilt whole in code — no
assets. One hour of dungeon clock, five torch-lit screens, and the Vizier
Jaffar at the end of them.

`https://jalfern.com/retrogames/prince-of-persia`

## What's here

- `sim.js` — the pure deterministic engine. `step(state, input)` at 60 Hz:
  weighted drive (walk → run acceleration, skid on reverse press, friction),
  careful step (Shift refuses an open edge), crouch, standing/running jumps
  with hold-to-extend (distance scales with speed), auto-grab hang on ledge
  faces, pull-up / drop / shimmy / hang-jump, loose tiles (shake, then drop
  `CFG.looseT` ticks after you step on them), spike ports that latch open
  when a pressure plate is stood on, the scheduled guillotine (its phase
  cycle sums exactly to its period — seam-free, pinned by the check), the
  three-height duel (stance high/middle/low; a windup is telegraphed by the
  guard's held height and a red pip; matching height parries, mismatch cuts),
  potions (Life +1, Strength = longer sword, Levitation = soft gravity,
  Poison = instant loss), hearts, three lives, and the 60-minute clock.
- `levels.js` — five hand-built 19x12 ASCII screens: THE DUNGEON (pits, a
  crumbling tile, a spike step-up), THE PORT (first duel + plate/retractable
  spikes + portcullis), THE GUILLOTINE (timed blade + crumbling bridge),
  THE STOREHOUSE (four flasks — one of them poisoned), JAFFAR'S THRONEROOM
  (boss duel; the princess door will not open while a boss lives).
- `planner.js` — the autopilot. It IS the attract demo: pulls up from hangs,
  hops pits and poison, holds behind the guillotine until its phase is safe,
  walks to the plate that opens the spikes, and duels by reading the windup
  (parry at the incoming height, strike at the height the guard is not
  holding). The same code is what `popcheck` runs.
- `art.js` — every pixel in code: mortar-grained stone, torch flames with
  flickering light pools, animated runners (walk/run/jump/fall/hang/climb/
  shimmy/crouch/duel/hurt/die poses), spikes, portcullis bars, plate,
  sparks/knockback shake, princess in the doorway, HUD (hearts, lives, clock,
  STRENGTH/LEVITATION tags).
- `index.jsx` — the shell: attract first, fixed-timestep loop, `'?'` pause,
  `VirtualControls` d-pad + ⚔ (KeyX) for phones, DEV-only DebugKit (F1) with
  cheat actions + live state, synth sfx off sim events.

## Controls

Arrows move / guard-height / climb · SPACE jump (hold = farther) · SHIFT
careful step · X or Z strike · ? pause · R restart after win/death.

## Verify

```bash
npm run lint:pop     # scoped lint gate
npm run popcheck     # ~57 checks: rules pinned, full 5-screen win proof,
                     # slack (0.75x clock + every guard at hp−1 still wins),
                     # hash-for-hash determinism, no-Math.random grep,
                     # planner/CFG constant agreement
```

Mutant proof done at ship time: breaking the parry rule (`p.stance !==
gd.stance` in `stepGuards`) turned the run red (6 failures) and was restored.

## Honest gaps (filed to QA)

- Five screens, not the original twelve (every mechanic the twelve teach is
  present; levels 6-12 are content, not systems).
- Guards telegraph only with height + a red pip; the original also had
  distinct lunge patterns. Boss Jaffar is faster/harder, no teleport.
- Animation is procedural limb-swing (~4-6 frames per move), not
  rotoscoped-grade; polish pass will thicken the frame counts.
- Phone controls cover run/jump/careful/strike; hang-climb on touch leans on
  the d-pad up (works, but the original's mouse-grab feel is desktop-first).
