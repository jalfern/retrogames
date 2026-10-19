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

## Co-op (#496)
The cabinet was two players on two sticks, so seat 2 is a player slot, not a
skin. At the attract screen **C** adds a CPU partner, **P** opens seat 2 for a
human; a connected second gamepad claims the seat itself. Rules that make it
co-op rather than a shared run:
- **Two banks**: the shot that kills pays that shooter's score (`addScore(..., pi)`);
  seats have independent lives, respawn, weapons and combo ladders.
- **ONE shared POWER meter**: the studio's power, not per-hero — LASER shots
  and FIREBOMBS drain the same bar either way.
- **The show ends only when both seats burn their last life**; a downed hero
  freezes on his tile while the partner plays on, and either hero walking an
  open exit advances the whole cast.
- **The aim stick**: `ax/ay` (analog, right stick) + `aimUp/Down/Left/Right`
  (quantized, numpad/d-pad) ride THE one pad shape (`onePad`), so every source
  — keyboard, pad, `__game.step([p1, p2])` — folds to the same input. P2 keys:
  WASD move, numpad 8/4/6/2+corners aim, Numpad0/Enter fire, RightShift bomb.
- The co-op autopilot (`planCoop`) drives the partner through **pads only**
  (`decidePad` → pad stream), proving a second gamepad could do everything the
  model does; it clears the show on 7/9 seeds (smashcheck pins the bar at 4).
- Single-player is untouched: solo runs never read seat 2, `stateHash` appends
  P2 fields only when `players.length > 1`, so every pre-co-op hash and the
  solo pilot's byte-identical replay still hold.

## Layout
- `levels.js` — seeded room generator (wall patterns, exit cells, crates, rosters).
- `sim.js` — pure `step(state, input)`, zero `Math.random()`: spawn picks and
  grenade timing come from a seeded LCG, so `scripts/smashcheck.mjs` replays
  the pilot tick-for-tick and the attract demo is that proven run.
- `planner.js` — the autopilot: engage nearest threat with LOS, dodge incoming
  fire, chase civilians in bonus rooms, strafe the boss.
- `walls.js` — the wall paint decisions (two-tone chrome, mortar, per-room
  neon top edge, rivet highlights); `drawWalls` renders exactly these.
- `sprite.js` — the contestant's paint decisions (4-frame run cycle,
  per-weapon gun silhouettes, layer order: feet under the gun layer).
- `art.js` — every sprite/texture synthesized at runtime.
- `index.jsx` — canvas loop (fixed 60 Hz timestep, 256x248 internal), attract
  with seat pick (C/P), `'?'` PauseOverlay, VirtualControls (A = fire, B =
  firebomb), P2 keyboard map and the seat-2 slot wiring.

## Verify
```bash
npm run lint:smash && npm run smashcheck        # rules + pilot + co-op + ledger + determinism
npm run smashcheck -- --mutate                  # planted bugs (incl. 2 co-op) must all die
npm run smashplay                               # headless browser: play, die, restart, seat 2
```

## Honest gaps vs the cabinet
- The original's over-the-shoulder gun sprites and zoom-out on big rooms are
  approximated with a fixed top-down camera.
- Eight original weapons are distilled to four (twin, machine gun, spread,
  laser) + firebomb; the homing/heat-seeking and flamer are not modelled.
- Bonus-room civilians are stylized (dot-matrix contestants, no gore sprites).
- One-hit death softened by spawn invulnerability; the arcade gives none.
