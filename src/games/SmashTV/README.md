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
extra life every 20,000. Respawn keeps the room and lands **unshielded** —
#2491 took out the last softener: the arcade gives no spawn invulnerability,
and reading the opening volley is the pilot's (and the player's) own job.

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
- The studio floor (`art.js buildFloor`) is painted as a lit stage: a
  vertical gradient from the horizon to the foreground, a warm spotlight pool
  centred on the board, a faint minor grid + stronger majors, the cracked
  SMASH diamond with a soft glow, and a crowd band with lit shirt
  accents along the top edge. (#3804)
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

**Gun language at phone scale (#1950).** The 2 px carriage kick vanishes once
the 256x248 canvas downscales, so the guns speak louder than one recoil vector:
`SHELL_KICK` rattles the whole shell on report, weighted by the iron
(laser 2, MG 1.5, spread 1, twin 0 — never more than an ordinary kill jolt);
`barrelHot` glows the firing barrel in its own muzzle colour for the first
instants of the kick; a fresh weapon pick-up flashes a mount glint that fades
over `GLINT_TICKS`. `sprite.js SPREAD_FLOOR` slides a twin's crowded barrel
along its perpendicular until it clears 2 px of the body centre line, so one
gun stays visibly behind each shoulder at every diagonal aim (cardinal geometry
byte-identical; flat aims keep their vertical stack). And `art.js
PAULDRON_BOB` lifts the chrome caps 1 px as the feet plant, so the shoulders
ride the run cycle — steady at rest.


The cabinet's power-up ladder had eight guns; this arena had four plus the bomb.
#2032 adds the two signatures it was missing — the guided missile and the fire.

**HEAT-SEEKER** (`WEAPONS.homing`, interval 14, speed 2.6, dmg 2) fires ONE
missile per shot (the cabinet fired heat-seekers singly). At launch the seeker
locks on the nearest living enemy to the muzzle — not the one the barrel
points at — and steers with a **bounded turn rate** `MISSILE_TURN = 0.16`
rad/tick at constant speed: guidance, not a tractor beam; a clean sidestep
still beats it. A dead lock re-acquires the nearest heat, and an unhunted hunt
dies at `MISSILE_LIFE = 150` ticks (a fizzle event, not a cruise missile). A
kill detonates the warhead: everything within `MISSILE_BLAST = 10` px of the
impact takes a point (the direct hit pays its own two — no double-dip).

**FLAMER** (`WEAPONS.flame`, interval 5, speed 2.2, pierce 1) breathes a
three-pellet puff: centre full speed, outer two splayed ±`FLAME_FAN = 0.17` rad
and eased by `FLAME_SLOW = 0.88`. Fixed offsets, so the stream replays
identically. Fire dies at `FLAME_LIFE = 20` ticks ≈ **45 px of reach**: king at
contact range, useless across the stage.

**Where they drop.** The specials hide in the BONUS rounds — HEAT-SEEKER in
room 4, FLAMER in room 7 — on a deterministic free cell, and nowhere else. The
combat-room ladder (`CRATE_WEAPONS`: spread/laser/gun, doubled spreads in rooms
5/8) is byte-identical to pre-#2032, so every proven route, pickup order and
seed hash behaviour is preserved. Combat-board trials were tried and rejected: a
special crate on a contested floor gets broken by stray fire and the drop
equips under any lane-walking route.

**The seat-law.** The autopilot never equips the FLAMER: the planner wraps
every seat decision with a drop-barrel avoidance (steer away when a dropped
flame item is within 16 px, slide along the perpendicular if straight-away is
walled). A 45 px stream cannot win the doctrine's lane duels — seed 4 once took
one to THE ANNOUNCER's fan. The law lives in the brain, never in the sim: a
human thumb steps onto the barrel and gets the gun, free. The HEAT-SEEKER needs
no law (homing missiles win those duels outright) and the nine-seed sweep
never happens to equip it.

Presentation: distinct silhouette (single stubby launcher / wide nozzle fan),
muzzle colour, crate and HUD icon tint, fire/whoosh timbres, missile arc +
detonation/`fizzle` visuals, and a heavier shell kick for the seeker.

smashcheck (`specials` section, 24 pins): the table law, the bonus-room-only
drop placement across all seeds, lock-the-nearest, turn cap, constant speed,
splash, fizzle, the three-pellet fan, the reach cap, pierce, and the seat-law
across solo 9 seeds and co-op. Five mutants (straight missile, immortal
missile, inert warhead, undying fire, one-pellet flamer), the levels mutant
(specials off the bonus boards) and the planner mutant (seat walks onto the
barrel) must all die.


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
Seeds 1 and 7 prove the deathless matinee (#2530's router fix re-laid the
lines — matinee {1,2,3,5,7}; the slack runs (seeds 0–2) and
co-op (all nine seeds) still win.

## BONUS GIBS — the splatter sprites (#2044)

The cabinet paid you to gun down the bonus crowd and made every kill SPLAT.
This stage replaces the old blue `burst()` spark on `civKill` with real gore,
presentation-only (`rules/gen/sim` untouched, layout pins byte-identical):

- `juice.js` owns the spec: `goreSet(rng)` returns **seven MULTI-pixel parts**
  (2×2 head-dot, 3×4 torso chunk, two limb strips, a bone chip, two spatter
  dashes) on bounded outward velocities with a constant upward bias; palette is
  two-tone red (`#c81f2f`, `#e8464a`, `#a01824`) plus one bone `#f0e6d8`.
  `GORE_GRAV = 0.22` (heavier than the 0.18 casing sparks), `GORE_TICKS = 34`
  (longer than a spark's 20 so the arc reads), `STAIN_TICKS = 120`,
  `stainRadius(combo) = 3 + min(3, combo)`.
- `index.jsx` draws them in the fx layer: gibs snap to the pixel grid (#2043's
  lesson — fractional fills anti-alias away at 1× canvas) and fade with their
  age; a dark-red cross-pizza stain dries on the floor under everything from
  spawn to STAIN_TICKS. A room `advance` scrubs the floor. The splat gets its
  own voice: white noise + a low triangle thud under the combo chime.
- Gates: `smashcheck` gore section (14 gates: count, multi-pixel law, palette,
  weight vs sparks, bounded speeds, rng determinism, lifetimes, stain growth +
  cap, and the presentation wiring pinned at source) + five JUICE mutants (all
  die). `smashplay` adds three live gates: a staged bonus kill splats ≥10 red
  gib px on canvas near the corpse, the whole set lands (7 gibs + a stain),
  and the air is clear after the lifetime.

## PAN & READABILITY POLISH (#1978)

Measured before fixing (rAF-rate probe): the old camera recomputed
`camX = round(mid − CW/2)` every frame, so a 1.2 px/tick walk stepped the
world `1,1,2,1,1,2` px — a 2 px hop every fifth tick — and the hero's screen
x oscillated ±0.5 px around his pace. The fix is the **uniform pan**
(`juice.js camPan`): the float camera steps at most `CAM_PAN = 1` px per drawn
frame, so the world glides at a steady rate; the camera trails a run by at
most a few px and eases the hero back to centre when he stops (every board is
wider than the screen, so the frame always has slack to give). A framing jump
past `CAM_SNAP = 24` is a teleport, not a walk — new room, respawn, seat
change — and snaps through instantly; `camF = -1e9` on start/reset frames the
show at once instead of panning in.

Also in this pass: **off-screen markers** (spawns, threats and the bonus crowd
parked past the frame edge stamp a blinking chip in the game's own colours —
telegraph yellow, kill red, exit green — on the edge they sit on; the host is
exempt, the host law already keeps him framed); the **cross-screen door
confirm** (when the nearest open exit is more than `FAR_EXIT_PX = 96` px from
the hero at the clear, the shutter answers with a two-tone clank over noise —
a bigger confirm for a longer walk); and the combo pop moved to `HUD_H + 48`,
below the border door row, since at mid-board framing it sat right on the
sealed/shuttering up-door (the patterns never build in rows 0–2, now pinned).

Gates: smashcheck `polish` section (uniform-step walk at hero speed, snap and
convergence laws, far/near door distances, marker side mapping and palette,
pop-band emptiness across all rooms) + 5 mutants (2 px hop, no-snap drift,
confirm off, blind handler, pop back on the door row); smashplay adds a live
rAF-rate gate — max hop ≤ 1 px/frame and the pan monotone with the run.

The zoom-out-vs-cabinet question (item 5) was the last honest gap here:
~~a mild entry scale was not prototyped blind; the pan board is the shipped
framing.~~ CLOSED by #2521 — see THE OPENING SHOT below.

## THE LONG WALK HOME — the crowd follows you to the door (#2011)

Measured before fixing: on the wide boards the cleared hero can sit a full pan
(~190 px) from every open door — room 1's spawn is the exception (its down-door
lands 36 px away), everywhere else the walk across the quiet floor was dead
air. #1978 already keeps the pan smooth and the off-screen cast legible; this
stage gives the walk itself a beat:

- `juice.js` owns the law: `walkHype(dPx, boardPx)` maps the px remaining to
  the nearest open door onto 0..1 — dead inside `FAR_EXIT_PX` (the shutter's
  two-tone clank confirm owns that moment), swelling with distance; `camLead`
  leans the camera target up to `CAM_LEAD = 8` px toward the door so the exit
  rides the screen edge instead of hiding a whole pan away.
- `sim.js` emits one `murmur` per `MURMUR_TICKS` after a non-bonus room
  clears while the cast is still a walk from every door, carrying its `hype`.
  No rng, no state touched — the pilot replay and `stateHash` are unchanged,
  and bonus rooms keep their own clock-driven bed.
- `index.jsx` mixes the hype into the bed (`MURMUR.vol + MURMUR_SWELL *
  e.hype`, plus a brighter cutoff at full hype — the crowd leaning in) and
  adds `camLead` to the pan target. The bias moves the TARGET a few px;
  `camPan` still caps the pan at `CAM_PAN = 1` px/frame, so the settle eases
  in and the #1978 uniform-pan law holds untouched.

Gates: smashcheck `walk-home` (pure law + live sim: hush inside the confirm
distance, monotone swell, capped lean, bed-stays-a-bed; a cleared far-from-
doors room murmurs with hype every `MURMUR_TICKS`, goes silent at the door and
while the room still fights; renderer pins) + 6 mutants; the old pilot gate
"murmur nowhere else in the studio" became "murmur only on the bonus clock or
a cleared walk-home, and walk-home murmurs carry hype".

## #2028 finale-room playtest — the add entry cue

QA played the wide finale (autopilot replays + live watches at `/retrogames/
smash-tv`) against the three audit questions #2024 left open:

- **Do the adds read?** NO — and it was measurable. The host throws adds at
  `24 + rng*(bw-48)` across the 384 px studio; with the hero at a clamp the
  camera window sits where the cast is, and the live mat in smashcheck 3b
  counts the misses (seeds 0–3: 3 of 16 thrown adds land past the frame —
  rare but real, every seed of that run had its camera pinned). The
  materialize ring pulsed on unseen floor — a threat just APPEARED. Fix: the
  **add-entry cue** — when the host throws an add past the frame, that edge
  flares a taller spawn-yellow chip (`juice.js SPAWN_CUE`, solid half the
  window then a fast blink, in the #1978 colour language). The flare
  re-reads its edge every frame, so panning onto the add kills it dead; the
  generic enemy blink (#1978) covers it for the rest of its off-screen life.
- **Host bullets at the clamps?** Clean by construction: the host law keeps
  his centre at screen `[48, 208]` of 256 every tick (smashcheck pins 28 px
  of margin across 1200 ticks of sliding camera), and the fan spawns AT his
  centre — every boss bullet is born inside the frame at both clamp edges.
  No change needed; the containment pin IS the proof.
- **Does the extra floor trivialize the fan?** No rebalance taken. The wide
  board lets the hero kite farther from the clamp, but the host paces the
  LIVE window (kiting drags him along), his fan opens centre-stage, and the
  3-add cap keeps pressure on. The pilot still clears all nine seeds with
  the fan unmodified — the finale reads as a puzzle at both edges.
- **Remaining honest gaps:** ~~one-hit death softened by spawn invulnerability
  stays AS DOCUMENTED. On a phone pad across a 384 px board with 8-way fan
  fire, the arcade's zero-mercy respawn would be a control-tax, not a rule;
  it is the only gap left and it is deliberate.~~ CLOSED by #2491 (below):
  fidelity beats provability — the arcade gives none, so neither does the
  arena. (Weapons 4→6, gibs, and the wide finale all closed since the pass
  that opened this list.)

Gates: smashcheck 3b extends the off-screen-marker section — `SPAWN_CUE` /
`edgeRow` law pins, renderer seam scans (arming + per-frame side re-read),
and a live finale mat across 4 seeds counting `bossAdd` spawn events against
the camera clamp (the cue is proven needed, not decorative).

## NO MERCY — the arcade's law (#2491)

Honest-gaps list, last line: *"One-hit death softened by spawn invulnerability;
the arcade gives none."* Midway's SMASH TV (1990) never shields the contestant —
room entries and respawns land exposed. `sim.js` granted `invulnRoom: 70` on
room entry and `invulnRespawn: 150` after death: two and a half seconds of
tanking the opening volley. Both are zero now (the fields stay as harness
isolation hooks, pinned at zero). The `#2028` pass had kept the softener as a
deliberate control-tax call; #2491 overrules it — fidelity beats provability
(AGENTS.md), the arcade is the spec, and the field now reads the throw like
the cabinet's own telegraphs ask the player to.

What it took to keep the show provably winnable **without** the shield — four
doctrine laws in `planner.js` plus two physics laws in `sim.js`:

- **Swept-horizon volley gate** (`volleyGate`, seatDrive tail): every move
  lane is simulated 26 ticks against live rounds — a lane is dead when a round
  crosses the body, when its horizon exit still closes distance, or when it
  pins the seat into chrome. Surviving lanes rank forward-biased; the chosen
  escape commits until it stops being safe. Objective legs own the *where*;
  the gate owns only the veto.
- **Lane-sound duel** (seat-1 threat branch): never align onto a lane chrome
  owns. Seed 4 nailed itself onto the (12,10) corner twice a cycle — align
  north into the bar, volley-commit east under the turret's throw, drift back,
  repeat — while the open column beneath the turret sat unclaimed. For
  ground-holding duelists (turret, heavy) the pilot probes both cardinal lanes
  from the would-be stand and takes the one that can actually fire.
- **Spawn-lean parking** (hold-center): the pilot reads `roomData.spawns` the
  way the human reads the #1978 spawn cue — never loiter inside a queued
  landing ring. Slack seed 1 room 1 used to materialise a walkcam on the
  hero's crown; three lives, room 1.
- **Dry-tank reload**: LASER burns 2 energy a shot and the sim answers an
  underfunded trigger with silence — a dry pilot is scenery holding a gun
  (seeds 2/5 strafed THE ANNOUNCER thousands of ticks at energy 0). Below
  30 energy the room's business becomes the reload: walk the nearest energy
  cell, dropped barrel or crate (never the FLAMER — the seat-law holds) while
  keeping the aim on the threat.
- **Open-door landing** (sim): the world freezes while a seat dies, so a
  chaser can park ON the spawn cell — with zero shield every respawn would
  die on contact without ever moving. Body-physics still refuse a body inside
  a body: `landX` seats the respawn at the nearest clear cell along the spawn
  row. The door is clear; the shield is not — any round already in the room
  still kills on arrival.
- **Grenade escape + contact guard** (prior #2491 pass): fly the sim's own
  detonation path to find the blast spot and clear the ring before it blows;
  a graze is a life now, so anything inside the touch band gets backed off the
  moment it is.

Honest re-measure, pins and README together (Pong's seed 25 style): the
9-seed sweep wins **9/9 unshielded**, co-op wins **9/9**, slack seeds 0–2 all
win on the stripped boards, and the deathless matinee moved from {1,5,7} to
{7,8} (#2491) and to **{1,2,3,5,7}** with #2530's router fix — under zero
mercy the opening volley costs first blood on most boards. First blood the
shields used to eat is now read or paid.

#2530 audit note: a 97-roll-seed sweep (`scripts/qa-smash-seeds.mjs`) found
25 autopilot stalls; the cause was `pathOn` re-keying the BFS prev-map with
its own array values (Map keys are strict), collapsing every relocation route
to its goal cell — the seat then walked straight into the chrome it was being
routed around. Re-keying the parent cells fixed 21 of 25 (wins 66→80, stuck
0). The wide-corner ping-pong roamers then needed a second law: the stall
window only catches bodies that STOP, but a volley-commit pulling east while
the objective pulls SW travels big chords forever and never closes the gap —
so the pilot now also judges GOAL PROGRESS (600 ticks of wanted walking with
no net 16px toward a goal that keeps its place, no score, no hp flinch, no
boss in the room = the straight legs are losing → grow the streak and let the
BFS router plan the walk). Seed 20 (static turret, east/volt-back line) now
wins: 81/13/0/3. Seed 53 then fell to the BARREL RING: a dropped flame barrel
sits ON its exit-route cell — the #2032 avoid law repels the body at d≤16
while the router commands east into the barrel centre, a 1.2px wobble forever;
the router's BFS now rings flame-barrel cells, but only on cleared-room,
non-boss, non-kill routes — an unscoped ring phase-shifted seed 21's mid-fight
routes into a boss-room loss, the cleared gate keeps seed 21 byte-identical
AND un-wedges 53: 82/13/0/2. The last two roamers then fell to their own laws
(studio, 2026-11-17): seed 60 froze dry against a shut gun crate — the refuel
walk stops at its 4px drop radius and the branch only ever aimed at a VISIBLE
enemy, so behind chrome the trigger was never pulled; the dry walk now shoots
its crate target. Seed 66 outran its dodge: a round falling south leaves the
north escape lane safe forever, so one slip off the turret's line became a 90px
retreat every reload while the router held the stand behind it — a commit that
carries the body away from the router's waypoint now releases after a 10-tick
hysteresis of walkable objective lane (single-tick flickers must not release —
#2491's fluency lesson): 85/12/0/0, roam class closed, {60,66} graduated into
smashcheck's `roll seeds` gate, which now pins 27 seeds against re-freeze.
The trade, honestly: seed 43 and 76 flipped lost→won on the new lines; seed 13
flipped won→lost (the paid-release re-laid its seed-1 duel approach and it
attritions in room 8, t≈8.7k) — its line is tracked, not certified.

Duel re-measure (nightly 43996221673, same family): the sweep's proof of the
lane-sound duel was route luck too — seed 4's corner walk died with the router
fix and the deaf-duel mutant survived; the nightly itself red on two stale
mutant anchors from the #2521 centre-anchor rewrite. The laws are alive:
smashcheck now pins replay ticks (seed 1 tick 3420 heavy#853, seed 2 tick
1775 heavy#305) where routes bring the seat onto a walled row, asserting the
duel's answer against the live board shape, and all mutant anchors match the
current renderer text.

Gates: rules-section pins (spawn unshielded, entry round kills, solo + co-op
respawn exposed, open-door landing), pilot pins above, slack pins 0–2. Four
mercyBack mutants (entry shield 70, solo respawn shield 150, co-op respawn
shield 150, landing forgets parked bodies) and three doctrine mutants
(lane-sound deaf, loiter under spawns, reload never fires) must all die.
`smashplay` drives a live respawn under fire with zero page errors.

## DRY-TANK ALARM — the meter screams before the gun (#2507)

A dry pilot is scenery with a gun (#2491), but until now the *player* found
that out by pulling a dead trigger: the POWER bar just got shorter. When the
LASER drops below the reload zone the HUD now says so:

- **One threshold, one home**: `CFG.dryLimit = 30` (sim.js). The planner's
  refuel doctrine and the HUD pulse both read it — the alarm can never drift
  off the autopilot's zone (source pin: no second literal in planner.js).
- **Edge bark** (sim event `powerLow`): fired once on the crossing, re-armed
  by any refuel (cell, room clear, respawn). Two-note falling siren +
  "POWER LOW! FIND FUEL!" — you look at the meter before the silence does.
- **Red-pulse trough** (HUD): while dry the whole bar track pulses dark red
  (the *trough*, not the fill — at 1 energy a red fill is one invisible
  pixel) and the remaining burn holds solid red; the POWER label blinks at
  half the bar cadence. `powerLow(weapon, energy, dryLimit)` is LASER-only —
  free lead never warns.
- **Half-second ping** while parked in the zone (`POWER_PING`, audio.js):
  the steady heartbeat between barks.

`smashcheck` pins: strict-under threshold, LASER-only, bark-once-and-re-arm
(direct energy writes — the laser's 16-tick cadence stays out of the proof),
shared-threshold source pins over planner + index, cadence constants.
Mutants: bark deleted, flag never re-arms, weapon-blind alarm, planner
re-hardcodes its own number, HUD goes numb — five must die.

## Honest gaps vs the cabinet
- ~~THE ANNOUNCER keeps his screen-sized stage on purpose (a boss half off-screen
  reads as a bug); every other room runs the 24-column pan board.~~ CLOSED by
  #2024: the finale boards wide with the show, and framing got stronger, not
  looser — the host law keeps him always on camera (above). (#1973 opened
  rooms 5/8, #2007 opened the whole show.)
- ~~Eight original weapons are distilled to four (twin, machine gun, spread,
  laser) + firebomb; the homing/heat-seeking and flamer are not modelled.~~
  CLOSED by #2032: **HEAT-SEEKER** and **FLAMER** join the ladder (below).
- ~~Bonus-room civilians are stylized (dot-matrix contestants, no gore sprites).~~
  CLOSED by #2044: the bonus crowd now SPLATS — seven multi-pixel gibs, a bone
  chip and a floor stain (above).
- ~~One-hit death softened by spawn invulnerability; the arcade gives none.~~
  CLOSED by #2491: both shields are zero — the arena now lands exposed like the
  cabinet, and the pilot doctrine above carries the proof (NO MERCY section).

## #2507 item 2 — the open-door landing BEAT (QA studio)

The #2491 open-door landing may step the seat a cell or two off the spawn
cell when a body parks the door (`landX`). Without a beat that shift reads as
a teleport. The beat rides the respawn event (presentation-only, like
MagicCarpet's wizfire cast point — `stateHash` never reads events):

- `respawnBeat(gs, self)` (sim.js, exported, pure): `shift` says the seat
  landed off the door cell; `tx/ty` name the living body that OWNS the old
  cell — the same occupancy test `landX` uses (within `CFG.contactR` of the
  cell centre), so the marker points at the cell-stealer, not "an enemy
  around here". A clean door reports `shift:false, tx:null` — silence. Both
  respawn seats (solo + co-op) spread the beat onto the event.
- juice.js owns the clock: `LAND_FLASH_TICKS` 14 / `landFlashPhase` (the
  ring) and `THREAT_MARK_TICKS` 36 / `threatMarkPhase` (the bracket outlives
  its own flash — it keeps pointing after the ring is gone). Monotone decays,
  both pinned.
- index.jsx draws inside the world transform: a spawn-yellow ring of 8 ticks
  closes in over the landing cell (the seat, seen), the shell thuds a low step
  (85 Hz square + noise — heard), and the cell-stealer wears a blinking
  kill-red ring of 8 dashes for the bracket window ("that thing took my
  cell"). Rules untouched: zero invulnerability, `landX` physics, pan law.

Harness: 11 gates added to smashcheck — event carrier (shift reported on the
dodge), stealer naming (a decoy sits alive 10 px off the free cell — nearer
the landing than the true owner — so "nearest enemy anywhere" goes red),
landing actually shifted, hash purity, clean-door silence (no false alarm),
three decay-law gates, and three source pins (both seats spread the beat; the
shell routes flash + bracket; the draw reads the juice phases). Mutation
guide: strip the spread at a respawn site → that seat's pin dies; `find`
without the cell test → the stealer gate dies; clean-door tx → null breaks the
false-alarm gate.

## OPENING VOLLEY — ENTRY RINGS (#2507 item 1)
Zero input, nine seeds: room 1 carries no guns — every seed's first blood is
walkcam **contact**, and the fastest lands 16 ticks after a silent pop-in
beside the seat (seed 2; `smashcheck` measures and pins it). The studio had
arrival cues only for the host's adds (the materialize ring) and for cells
past the camera (the #1978 edge chip) — an enemy that materialized IN FRAME
said nothing. Now every `spawn` event wears the add-ring geometry in
spawn-yellow for `ADD_TELEGRAPH` ticks (`juice.js entryRingPhase/entryRingR`,
drawn from a renderer-side `bornFx` list): the opening volley of every room
announces itself, and the marker still glows when the fastest contact lands
(22 > 16, pinned). Presentation only — the sim, the no-mercy law (#2491) and
every seed hash are untouched (the pilot sweep holds at 9/9).
Mutation guide: flatten `entryRingPhase` → the decay pin dies; freeze the
radius → the geometry pin dies; re-gate the push to `bossAdd` → the source
pin dies.

## THE OPENING SHOT — the entry pull-back (#2507 item 4, QA studio)

The last framing gap vs the cabinet: its 16:9 lens showed more arena than our
256 px window ever could, and the studio had never tried a wider opening beat.
Prototype knobs first (`?scale=<f>` pins the view scale for A/B shots,
`?nozoom=1` off) — then the shipped law:

- `juice.js` owns the curve: `ENTRY_ZOOM = 0.8` → the room opens showing
  `CW/0.8 = 320` of the 384 px board (**83%, vs the old 67%**), holds
  `ZOOM_HOLD = 10` ticks, and smoothsteps back to play scale by
  `ZOOM_SETTLE = 90`. Smoothstep, not linear: no kink at either end, and the
  steepest edge flow is `CW·Δscale = 0.96 px/frame` — inside the #1978 pan
  budget, so the reveal never moves the picture harder than the camera it
  rides. And the reveal is decoupled from the pan entirely (centre anchor,
  below) — `camPan`'s law cannot even see it.
- `index.jsx` renders the arena through a transform anchored on the **live
  window centre** (`screen x = (world − camX − CW/2)·zs + CW/2`): the pan
  target stays the nominal formula, so the #1978 uniform-pan law is untouched
  by construction. (Design lesson, caught live: the first prototype centred
  the WIDE window on the cast mid — that slid the pan target ~1.8 px/tick,
  above the 1 px/frame cap, the lag accumulated, `camPan` snapped… and the
  camera teleported 25 px mid-room. Decoupling zoom from pan is the law.)
  Markers and the add-entry flare read their edges against `CW/zs` centred on
  the window, so nothing visible earns a chip during the reveal.
- **The host law moves with it (#2024).** The sim keeps THE ANNOUNCER inside
  the NOMINAL window `[cam+48, cam+CW−48]`; a zoomed window is always a
  superset of the nominal one at any mid and any reveal scale (smashcheck
  sweeps the grid) — his minimum on-screen margin through the whole reveal is
  `48·ENTRY_ZOOM ≥ 38 px`. Containment rides wide without touching the sim:
  no hash moves, the pilot sweep stays 9/9.
- Honest limit, measured: during the 1.5 s reveal the 0.8 scale draws sprite
  pixels fractionally (the #2043 blur note) — a soft-focus opening, crisp by
  the time the guns matter. `zs = 1` is the byte-identical old camera.

Gates: smashcheck `entry-zoom` (15 pins — reveal ≥80% of the board, curve
endpoints/monotone/range, edge-flow ≤ pan budget, superset + host-margin
sweep, capped pan through the reveal, and the renderer/sim-purity source pins)
+ 5 mutants (never-wide, overshoot, blind camera, blind chips, unarmed entry).
