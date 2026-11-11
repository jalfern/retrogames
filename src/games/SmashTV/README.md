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
  model does; it clears the show on all 9 seeds (smashcheck pins the bar at 9).
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
  per-weapon gun silhouettes, layer order: feet under the gun layer) and the
  over-the-shoulder carriage geometry (`gunPose`) the renderer stamps exactly.
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

## OVER-THE-SHOULDER GUNS (#1945)
The cabinet frames the contestant from a camera above-behind: the guns ride the
**shoulders**, muzzles out past the head. `sprite.js` owns the pose as pure
geometry — `CARRIAGE = { back: 1, rise: 2.5 }` puts every mount behind the body
plane on the shoulder line, and `gunPose(weapon, aim, kick, x, y)` returns one
carriage per barrel: shoulder base, muzzle, trailing stock stub, flash point.
Per-weapon carriage: twin = one barrel over each shoulder (dual muzzle flash);
MACHINE GUN = long right-shoulder mount with a drum-mag stub; SPREAD = short fat
sawed-off across the chest with two muzzle dots; LASER = boxy emitter with a hot
tip and side-cell glow. Chrome pauldrons cap the shoulder line in the sprite
sheet (seat-palette aware). `juice.js recoilKick` snaps the carriage back 2 px
on report, decaying to zero within 5 ticks ≤ the tightest fire interval. The
sim is untouched — paint-only, so every seed hash and replay pin still holds.

## VARISIZE BOARD + CAMERA (#1973)
The cabinet framed the show through its 16:9 lens — arenas read wider than the
playfield. Rooms 5 and 8 (`BIG_ROOMS`) now board 24 cells across: 384px, 1.5×
the screen, with the wall pattern mirrored across the wider board so corridors
really run longer. Every boundary reads the room's own `boardW = gw * CELL` —
collision, player and enemy shots, civilian bounce, THE ANNOUNCER's pace and
add spawns, and the exits (the right door sits on the room's true border,
`exitsOf`). The renderer owns the camera: `camX` snaps each frame to keep the
live cast's midpoint centred, clamped to the board edges; the whole arena
layer renders translated while HUD, banners and scanlines stay screen-space.
Standard rooms are exactly screen-wide, so their `camX` is pinned at 0 and
their framing is byte-identical to the old fixed camera.

The autopilot learned the new floor: a minor-axis lane-alignment walk when its
snap-aim line misses a threat (doctrine #508 extended to seat 1 — a wide-room
add can pin itself against a bar corner just off the lane, and seat 1 held the
duel firing past it forever), and at THE ANNOUNCER one add is already worth
the firebomb. The pilot floor was re-measured honestly: solo clears 8 of 9
seeds — **seed 3 is a documented forced loss** (fan attrition at the
ANNOUNCER; volley-commit, round-relative, crosser-aware and bottom-pocket-rise
breaks were all measured, and each rescues seed 3 by losing another seed
instead; smashcheck pins the count AND names the seed — update pin and README
together, Pong's seed 25 style). Seed 6 proves the deathless matinee; the
slack run (seed 1) and co-op (all nine seeds) still win.

## Honest gaps vs the cabinet
- Big rooms pan (rooms 5 and 8 run 24 columns, #1973), but the rest are still
  screen-sized — the original rotated its whole cabinet to 16:9. THE ANNOUNCER
  keeps his screen-sized stage on purpose: a boss half off-screen reads as a bug.
- Eight original weapons are distilled to four (twin, machine gun, spread,
  laser) + firebomb; the homing/heat-seeking and flamer are not modelled.
- Bonus-room civilians are stylized (dot-matrix contestants, no gore sprites).
- One-hit death softened by spawn invulnerability; the arcade gives none.
