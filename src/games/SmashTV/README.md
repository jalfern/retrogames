# SMASH TV — engine notes

Williams 1990 (Eugene Jarvis) — the game-show death arena, rebuilt top-down.
The five signature features of the original are the spec:

1. **Twin-stick, 8-way**: move and fire independently in eight directions
   (desktop: Arrows move, IJKL fires in its own 8-way stick; Space fires the
   way you face; phone: pad + A fires along your last move).
2. **Room-chain arenas**: single-screen rooms; the exit doors unlock only when
   every enemy in the room is dead — walk into any open door to advance.
3. **Weapon crates + Power-Up energy**: glass crates hold SPREAD, LASER and
   the rapid MACHINE GUN (smash the crate, touch the weapon to swap). LASER
   burns energy; the B button drops a **FIREBOMB** that clears the screen for
   34 energy. Energy refills when a room falls.
4. **The Blood Bonus room**: every fourth room, civilians run in panic for
   10 seconds — the audience adores you, points cascade, combo pays double.
5. **Game-show presentation**: 1UP/HI board, ROOM banner, announcer barks,
   screen shake, gore sparks, and THE ANNOUNCER himself as the room-9 boss.

Faithful rules: **one hit kills** (the original has no hit points), 3 lives,
extra life every 20,000. Respawn keeps the room but grants spawn invulnerability.

## Layout
- `levels.js` — seeded room generator (wall patterns, exit cells, crates, rosters).
- `sim.js` — pure `step(state, input)`, zero `Math.random()`: spawn picks and
  grenade timing come from a seeded LCG, so `scripts/smashcheck.mjs` replays
  the pilot tick-for-tick and the attract demo is that proven run.
- `planner.js` — the autopilot: engage nearest threat with LOS, dodge incoming
  fire, chase civilians in bonus rooms, strafe the boss.
- `art.js` — every sprite/texture synthesized at runtime.
- `index.jsx` — canvas loop (fixed 60 Hz timestep, 256x248 internal), attract,
  `'?'` PauseOverlay, VirtualControls (A = fire, B = firebomb).

## Verify
```bash
npm run lint:smash && npm run smashcheck        # rules + pilot + ledger + determinism
npm run smashcheck -- --mutate                  # planted bugs must all die
npm run smashplay                               # headless browser: start/play/die/restart
```

## Honest gaps vs the cabinet
- The original's over-the-shoulder gun sprites and zoom-out on big rooms are
  approximated with a fixed top-down camera.
- Eight original weapons are distilled to four (twin, machine gun, spread,
  laser) + firebomb; the homing/heat-seeking and flamer are not modelled.
- Bonus-room civilians are stylized (dot-matrix contestants, no gore sprites).
- One-hit death softened by spawn invulnerability; the arcade gives none.
