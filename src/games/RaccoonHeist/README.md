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

## Three rules the sim obeys

1. **The drawn cone *is* the deadly cone.** A guard's vision mesh is built from the same
   half-angle and range the sim uses to see you, and occlusion for both the camera and the
   guards marches the same grid sampler (`losWorld` / `castWorld`). Two sources of truth
   about where a wall is is how a stealth game starts lying.
2. **Suspicion is per-watcher, per-prey.** It used to live on the raccoon as one shared
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

Budget, pinned by `heistplay`: level ≤ 50 meshes, whole scene ≤ 280 draw calls.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | WASD / arrows | floating stick (re-anchors under the thumb) |
| Dash / Crouch | Shift / C | — / CROUCH |
| Work | **E — tap to take, hold to chew** | big button, ring lights up when there is a verb |
| Lure / Crew | F / Q | LURE (with a count) / CREW |
| Look | drag, wheel to zoom | drag the right half |
| Pause | `?` | `?` |

The shared `<VirtualControls />` is deliberately **not** used: a discrete arrow-key pad
cannot express an analog thumb, and a 3D game driven by an 8-way tap-pad feels like a
shopping trolley through a letterbox. Arrow/Space are still handled, so key-driven harness
code works. The pad is gated behind `isTouch() || ?pad=1` — on a mouse-and-keyboard
machine it would just be two discs covering the level.

## Verifying

```bash
npm run heistcheck         # Node, no browser, ~1 s: level audit + stealth model + --mutate
npm run heistplay          # Chrome plays job 1 end to end (needs `npm run dev`)
npm run lint:heist         # eslint over the game + shared shell + scripts
npm run heistcheck -- --map 1    # ASCII dump of a job
npm run heistcheck -- --mutate   # seals the vault; the audit MUST notice
```

`heistplay` walks with a **thumbstick value**, not by assigning positions; the only
teleports are the ones whose check is *about* placement, and they say so in the check name.
It asserts the raccoon is a visible mesh in the scene graph — because for a whole stage
the cast was simulated, audited, passed every check, and never added to the scene.

Two things to try before believing a change: seal the vault in `levels.js` and watch
`--mutate` go red; stand in the open and read `__heistTest.why()`, which prints every
nearby watcher's `los / align / cover / light / rate / det`.

## Known gaps

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
