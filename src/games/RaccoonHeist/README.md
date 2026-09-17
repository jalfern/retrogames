# RACCOON HEIST

`/raccoon-heist` — three night jobs run by a crew of thieving raccoons. Slip past the
watchman's torch, carry the loot one sack at a time to the getaway cart, chew the vault
lock, and be over the gate before the heat climbs. Caught raccoons go in the pound, and
the rest of the crew can chew them out.

three.js, lazy-loaded (`lazy()` in `config/games.js` + `<Suspense>` in `App.jsx`) so Pong
never downloads a 3D engine — the main chunk stays ~131 KB gzip. **Every texture, mesh and
sound is generated at runtime.** No assets, no glTF, no audio files.

## The file split, and why each boundary exists

| File | Knows about | Never touches |
|---|---|---|
| `levels.js` | the map: cell grids, wall heights, markers, patrol routes | three, DOM |
| `stealth.js` | the arithmetic: sight, cones, noise, cover, gait, score | anything stateful |
| `engine.js` | the simulation: movement, detection, heat, carrying, winning | geometry, shaders |
| `art.js` | textures, materials, rigs, props, icons, rain, sky | levels |
| `world.js` | grid → scene: batching, instancing, set dressing | decisions |
| `alley.js` | the attract diorama (the concept frame, rebuilt) | gameplay |
| `audio.js` | a synthesized score with three heat-reactive beds | game state |
| `index.jsx` | renderer, camera, input, HUD, job flow | rules |

`levels.js` and `stealth.js` import cleanly into **plain Node**. That is not tidiness —
it is what lets `npm run heistcheck` audit every job (264 assertions) in about a second,
with no browser, before a pixel is ever drawn.

## Levels are carved, not typed

Every cell starts as WALL; rooms and corridors are *cut*. A carved map cannot leak, so
"a wall with a hole in it" is not a class of bug this game can produce. The class of bug
it *does* produce is the one a screenshot cannot catch: a door that leads nowhere, a
patrol that cannot walk its route, a torch that sees the getaway cart on frame one. That
is what the audit is for, and it earned its keep immediately — the first museum build had
exactly one door, and it was the one you were not allowed to use yet, so the level was
unenterable.

**A cell is 2.2 m (`CELL`).** Not 1 m, because this is a third-person game: at 1 m a
corridor is a toilet booth, the raccoon is 0.64 m wide, and any chase camera further back
than two metres is inside a wall. The grid stays in cells; only the world mapping scales,
so every carve coordinate and the whole pathfinder kept working untouched.

## Being caught is a setback, not a full stop

Playtest round 2 said: *"once I'm caught the game is basically done — nothing works except
rotating the camera."* That was four defects in one sentence.

1. **Control never moved.** `catchCrew` caged the raccoon and left `active` pointing at it.
   The camera kept orbiting a caged animal (the one input path that doesn't ask the actor
   to move) and every other key did nothing. Now a catch hands you the next free crew
   member, recentres the camera on them, and says so.
2. **Arrests cascaded.** Being caught switches you to a crewmate standing on the same
   square, and the guard who just bagged one raccoon reached straight for the next: three
   arrests in four seconds = bust. A guard who has taken a raccoon is now **busy for 2.8 s**
   (`cool`), drops every other raccoon's suspicion, and goes back to suspect.
3. **Guards could not catch a walking raccoon.** Chase speed was `patrolSpeed * 1.75`, i.e.
   2.1–2.8 m/s against a raccoon that *walks* at 2.75. Safety was a jog. Now
   `CHASE = { guard: 3.4, dog: 4.4, cop: 3.55 }`: walking gets you caught, sprinting
   (5.0 m/s, loud, costs wind) is how you escape. The stealth economy only exists if the
   numbers point this way.
4. **Detection was spectator-paced.** `detectRate`'s constant was 2.6, which at 5 m in a
   torch took ~2.4 s. It is 4.6 with a distance floor now, so 5 m is ~1.1 s: the meter
   fills while you can still react. `heistplay` times it, and the budget scales with the
   distance the driver stood at, tuned so the old constant cannot pass.

An arrest also **SHOUTS**: nearby watchers go `suspect` and converge on the sighting. Which
is why the harness check is "the job survives an arrest", not "exactly one raccoon gets
bagged" — a second guard arriving on the noise is the design working.

## Four rules the sim obeys

1. **The drawn cone *is* the deadly cone.** A guard's vision mesh is built from the same
   half-angle and range the sim uses to see you, and occlusion for both the camera and the
   guards marches the same grid sampler (`losWorld` / `castWorld`). Two sources of truth
   about where a wall is is how a stealth game starts lying.
2. **Sight is marched in CELL space.** `losWorld` / `castWorld` take metres and walk a
   grid indexed in cells, so the step must be divided by `CELL`. It wasn't, which made
   every reported distance 2.2× too large: the camera believed a wall 1.3 m behind you was
   2.9 m away and drove into the brick (the "screen full of blurred wall" the second
   playtest reported), and guards saw through the last metre and a half of every doorway.
   `heistcheck` pins this per level with assertions *in metres* — "a wall one cell away is
   ~1.1 m" — because a check here that only proved a number came back would have been
   green through the whole bug. It used to live on the raccoon as one shared
   number, which meant every guard who *couldn't* see you subtracted from the one who
   could: walking past a second guard made you invincible, and levels got easier as they
   got harder.
3. **Noise is an event, not a stat.** Footsteps, splashes, clattered lids and thrown
   shinies are pushed into a queue that guards ask `hears()` about. Thunder sets `masked`
   for its window, which is why the manor storm is a mechanic you plan around instead of
   weather you look at.

Being caught is also not game over: you go in the pound, the job continues with whoever is
loose, and a padlock takes about 1.5 s to chew (Tinker faster, Scout slower). A rescue that
takes longer than 4 s fails `heistplay` — being locked up should feel desperate, not like a
minigame.

4. **Every verb has a body.** If the sim offers `CHEW X LOOSE`, there is a padlock mesh at
   the point that verb points at, and it shakes while you chew and falls off when it gives.
   The pound used to ask for exactly that chew while drawing bars, a roof, a floor and a
   sign — no lock anywhere — and the only cue was a line of HUD text. So `engine.affordance()`
   publishes *where a verb points and what material ought to be there*, derived from the
   level and the verb and never from the prop (so deleting the prop fails the check instead
   of moving the goalpost), and `heistplay` walks every verb the engine can return and
   fails if the world has nothing to show. A verb with no body is a build failure now, not a
   playtest finding.

   The rule generalises past the pound, and two more bugs fell out of applying it: the gate
   now wears a chain that snaps off when the cart is full ("the way out is open" used to be
   a door rising in silence), and the pound turns to face the approach so the lock is on the
   side you walk up to. The vault plate turned out to be drawn **0.86 m outside its cell**
   and to have never moved when chewed — both are `bakeMeshes` traps, and both are in the
   next section because they will bite again.

## Two `bakeMeshes` traps, both paid for

`bakeMeshes(node)` bakes every child's **world** matrix into its geometry and adds the
merged mesh back to `node`. Which means:

- **Offset a hinged child *before* baking and the offset applies twice** — once in the baked
  geometry, once again when the parent transforms it on draw. The vault plate hung 0.86 m
  (one door radius) outside its cell for the whole life of the game. Bake first, then move
  the assembly onto its hinge.
- **`userData.keep` on a node disables baking *of that node*, not just of its parent's
  bake.** Set on a door group before `bakeMeshes(door)` it leaves seven draw calls where
  three belong; omitted, the frame's bake swallows the plate and the group the engine
  rotates is empty — the door "opens" with nothing on it. Set it *after* baking the node
  and *before* baking the parent.

Neither showed up in a screenshot: at night, a plate slightly out of its frame and a door
that does not swing both look like art choices. `heistplay` pins all of it — plate centred
(≤ 0.45 m from its cell centre), plate merged (1–4 meshes on the pivot), plate moving when
chewed (≥ 0.3 m of travel) — by measuring the **geometry bounding box in world space**,
because a merged mesh's object origin sits on the hinge and never moves.

## Draw calls

Static geometry is merged at build time: one mesh for all walls (`tileBox` bakes texel
density into the UVs so a 3 m shed and an 11 m facade share one material *and* one texture
upload), one world-mapped floor batch, `InstancedMesh` for crates/hedges/planters, and a
`stamp`/`flushBuckets` pass that bakes all bins, cans, cartons, hydrants, pallets and
laundry into one mesh per material. Props that *move* stay individual. Lampposts collapse
into three meshes for the whole level — ironwork, bulbs (one shared emissive material, so
eight flickering lamps cost one call), and halos. `bakeMeshes` does the same inside the
pound, the gate, the vault and the cart, which are built as little scenes but only ever
move as objects.

Budget, pinned by `heistplay`: level ≤ 50 meshes, whole scene ≤ 280 draw calls. The level
runs at 48 after the pound's padlock, the gate's chain and its padlock (five meshes, and
the padlock cannot merge with the cage bars — it has to shake and fall off). That budget is
nearly spent, so the facade work in `FEEDBACK.md` (E1) has to come with a deliberate
raising of the pin, not an accidental overshoot.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | WASD / arrows | floating stick (re-anchors under the thumb) |
| Sprint / Crouch | Shift or R / C or Ctrl | — / CROUCH |
| Work | **E / Space / Z — tap to take, hold to chew** | big button, ring lights up when there is a verb |
| Lure / Crew | F or B / Q or X | LURE (with a count) / CREW |
| Look | drag, wheel to zoom, G to recentre | drag the right half |
| Pause | `?` | `?` |

The shared `<VirtualControls />` is deliberately **not** used: a discrete arrow-key pad
cannot express an analog thumb, and a 3D game driven by an 8-way tap-pad feels like a
shopping trolley through a letterbox. Arrow/Space are still handled, so key-driven harness
code works. The pad is gated behind `isTouch() || ?pad=1` — on a mouse-and-keyboard
machine it would just be two discs covering the level.

## Verifying

```bash
npm run heistcheck         # Node, no browser, ~1 s: level audit + stealth model + --mutate
npm run heistplay          # Chrome plays job 1 end to end -- 107 assertions (needs `npm run dev`)
npm run heistmutate        # revert each fix in turn and prove heistplay notices (~20 min)
npm run heistmutate -- --dry  # just check the mutant anchors still exist
npm run lint:heist         # eslint over the game + shared shell + scripts
npm run heistcheck -- --map 1    # ASCII dump of a job
npm run heistcheck -- --mutate   # seals the vault; the audit MUST notice
```

`heistplay` walks with a **thumbstick value**, not by assigning positions; the only
teleports are the ones whose check is *about* placement, and they say so in the check name.
It asserts the raccoon is a visible mesh in the scene graph — because for a whole stage
the cast was simulated, audited, passed every check, and never added to the scene. And it
asserts every verb has a body, which is how the padlock, the chain and the crooked vault
door were all found in one sitting.

`heistmutate` is the reason to believe any of it: nine mutants, each one a previously fixed
bug re-introduced by an anchored text swap, each run through the real driver, each restored
from a `/tmp` copy so the working tree is never reverted. Two of them were *equivalent*
mutants — the harness hid a lock with `visible = false`, which `reset()` repairs before
play, and a plate measured by object origin, which never moves because it sits on the
hinge — and both are written down in that file's header, because an equivalent mutant is a
lesson about the test, not the code.

Two things to try before believing a change: seal the vault in `levels.js` and watch
`--mutate` go red; stand in the open and read `__heistTest.why()`, which prints every
nearby watcher's `los / align / cover / light / rate / det`.

## Known gaps

- **Affordance hardware is only drawn for the pound and the gate.** A hide-spot bin has no
  latch and a stolen pile leaves no scuff on the ground where it was, both because the
  level mesh budget is at 48/50 and a scuff per pile is four more draw calls. The right
  shape for both is one `InstancedMesh` per kind, toggled by scaling the instance to zero,
  not a mesh each.
- Guards never speak, so alerts are visual + musical only. No voice lines, no "Hey!".
- The cat is a distraction, not a system: it bolts when seen and steals attention. It has
  no stash and no route to a secret.
- Job 2's lasers are timing gates, not destructible; there is no fusebox to shoot out.
- Only job 1 has been play-tested end to end by a human-shaped process (the harness).
  Jobs 2 and 3 are audited but not *played*.
- No saved progress between jobs, no localStorage, no settings page, no colourblind
  cone palette.
- The raccoon's fur blows out under its own fill light in open lamplight. Tuned down,
  not solved.
