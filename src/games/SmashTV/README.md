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

## VARISIZE BOARD + CAMERA (#1973, whole-show by #2007, finale by #2024)
The cabinet framed the show through its 16:9 lens — arenas read wider than the
playfield. #1973 widened rooms 5 and 8; **#2007 widened the whole show**;
**#2024 brought THE ANNOUNCER's studio onto the board too** — every room,
finale included (`BIG_ROOMS` = indices 0–8), boards 24 cells across:
384px, 1.5× the screen, with the wall pattern mirrored across the wider board
so corridors really run longer. Every boundary reads the room's own
`boardW = gw * CELL` — collision, player and enemy shots, civilian bounce,
THE ANNOUNCER's pace and add spawns, and the exits (the right door sits on the
room's true border, the up/down doors centre on it, `exitsOf`). Each board's
spawn is its own lower middle (`startColOf`): 16-wide keeps byte-identical
c8, the wide boards open at c12. The renderer owns the camera: `camX` snaps
each frame to keep the live cast's midpoint centred, clamped to the board
edges; the whole arena layer renders translated while HUD, banners and
scanlines stay screen-space.

The finale used to sit outside all this — exactly screen-wide with `camX`
pinned at 0, because a boss half off-screen reads as a bug. #2024 replaces
that pin with a stronger law, the **host law**: THE ANNOUNCER paces the middle
of the **live camera window** — the sim computes the same cast-midpoint the
renderer pans to and keeps him inside `[cam + 48, camW − 48]`, snapping (not
just flipping) at the edges so containment holds even when the shot slides
faster than his 0.7 pace. He is TV; the camera never loses him — and he opens
deterministically centre-stage at cell (gw/2, 2). smashcheck pins the spawn
cell and always-framed containment across 1200 ticks of sliding camera.

The autopilot learned the new floor: a minor-axis lane-alignment walk when its
snap-aim line misses a threat (doctrine #508 extended to seat 1 — a wide-room
add can pin itself against a bar corner just off the lane, and seat 1 held the
duel firing past it forever), at THE ANNOUNCER one add is already worth the
firebomb, and when the bonus clock dies EVERY seat walks a door (the #508
partner law, extended to seat 1 — a 24-column ghosting floor gave civilians
somewhere to hide for 58k ticks). The stalled-exit fix is the DIRECTED break:
when the goal walk stalls, the hero slides sideways until the goal direction is
actually open again (`blockedPx` probe), with the sweep growing by the stall
streak while it isn't — a fixed 30-tick break spans ~36px, less than the ~45px
no-go band between two bar columns on a wide board, and the exit walk
ping-ponged inside that band forever (seed 6, 59k ticks). And fleeing is for
chasers that can reach you: #2024 added the **pin-shot law** — the planner
tracks per-seat stillness of the threat it is worried about, and a chaser that
has not budged in 30 ticks is scenery (wedged into chrome on the wide boards
it sat exactly ON the 42px flee threshold, so seat 1 orbited it, firing past
the pinned camera for 56k ticks in room 8 — seed 1). No fleeing a pinned
camera; walk the lane onto it and let the shot land. The pilot floor was
re-measured honestly on the new boards: **solo clears all 9 seeds** — the
#1973 seed-3 forced loss is retired (the directed break ends the fan attrition
without costing another seed; smashcheck pins the count — if a future change
loses one again, update pin and README together, Pong's seed 25 style).
Seeds 1, 5 and 7 prove the deathless matinee; the slack runs (seeds 0–2) and
co-op (all nine seeds) still win.

## Honest gaps vs the cabinet
- ~~THE ANNOUNCER keeps his screen-sized stage on purpose (a boss half off-screen
  reads as a bug); every other room runs the 24-column pan board.~~ CLOSED by
  #2024: the finale boards wide with the show, and framing got stronger, not
  looser — the host law keeps him always on camera (above). (#1973 opened
  rooms 5/8, #2007 opened the whole show.)
- Eight original weapons are distilled to four (twin, machine gun, spread,
  laser) + firebomb; the homing/heat-seeking and flamer are not modelled.
- Bonus-room civilians are stylized (dot-matrix contestants, no gore sprites).
- One-hit death softened by spawn invulnerability; the arcade gives none.
