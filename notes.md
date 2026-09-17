# RACCOON HEIST — build log

Working notes for the Raccoon Heist build (`src/games/RaccoonHeist/`). Appended to on
every commit; each commit ships notes + code together so the reasoning travels with
the diff.

Brief: *"you and your team of thieving raccoons are tasked with pulling off a series of
daring heists… avoid the police and make a clean getaway with the loot."* 3D, browser,
mobile-first, all art and audio generated locally (no assets, no remote AI).

---

## 2026-03 — session 1

### Ground rules I'm holding to
- **Everything procedural.** Every texture is painted at runtime into a `<canvas>`
  (value-noise `fbm` for asphalt grit, rust, grime), every mesh is built from
  primitives. IronKeep set the precedent ("every texture, sprite and font glyph is
  generated at runtime"); I want the same claim here.
- **Blender evaluated and deliberately skipped.** It was on the table for the raccoon
  rig and for hero props. Rejected: a glTF pipeline means a 200 KB binary blob in
  `public/`, an asset that drifts from the code, and a bake step nobody can re-run in
  CI. An articulated `Group` hierarchy (hips → spine → head → ears, plus a 5-segment
  tail chain) animated with sines gives the waddle, the tail sway and the ear twitch
  for ~12 draw calls and stays readable/editable in the diff. If a prop ever needs
  organic sculpting (a real fur coat), that's the moment to reach for Blender.
- **One input path.** Touch buttons dispatch real `KeyboardEvent`s onto `window`
  (the `VirtualControls` contract), so the touch pad, the keyboard and the harness
  all drive the same handler. The thumbstick is the one extra channel, because
  arrows cannot express "half-pressed".
- **Commit early, commit ugly-but-visible.** First push is a playable-looking title
  screen, not a TODO.

### The reference frame
The brief came with an "ALT" concept frame: two raccoons in a blue night alley, one
peeking out of a cardboard box, one mid-sneak, warm sodium light in a grimy window,
cold cyan puddle glare. The title screen is that frame rebuilt in 3D and slowly
orbiting — cardboard box, dumpster, lit window, wet ground — because the fastest way
to know whether my palette works is to rebuild a picture someone already chose.

### Stack
`three@0.180` added as a dependency. Chosen over hand-rolled WebGL because the thing
that makes a night alley read as *night* — shadow-mapped moonlight, exponential fog,
emissive windows, per-material roughness for wet asphalt — is exactly what you don't
want to write by hand twice. It is also the honest size: ~150 KB gzipped, tree-shaken,
lazy-loaded behind the route's import.
### Commit 1 — the alley exists

Registered `/raccoon-heist` (theme dark) and shipped a live 3D attract screen: brick
corner, fire escape, washing line, open carton with a raccoon standing in it, dumpster
stencilled NO RACCOONS, rain, puddle glare, wanted posters. Verified by screenshot, not
by hope (`npm run shot -- --url .../raccoon-heist --no-start`).

**three.js is lazy-loaded, and that is the js-dos lesson wearing a different hat.**
`games.js` now does `lazy(() => import('../games/RaccoonHeist'))` and `App.jsx` wraps
route elements in `<Suspense>`. Before it, adding three.js put 189 KB gzip into the main
chunk — every Pong player downloading a 3D engine. Main chunk went 319 KB → 131 KB gzip.

**Five bugs the screenshots caught that the code review did not:**

1. **StrictMode poisoned the WebGL context.** With a JSX-owned `<canvas>`, React mounts
   the effect twice; my cleanup called `renderer.forceContextLoss()`, and the second
   mount got a dead context — three then died in `WebGLCapabilities` with *"Cannot read
   properties of null (reading 'precision')"*. Fix is structural, not a guard: the effect
   creates the canvas element itself and removes it on cleanup. Fresh canvas ⇒ fresh
   context. `preserveDrawingBuffer` is DEV-only (screenshot checks need it; a phone does
   not pay for it).
2. **`propMat('asphalt')` handed three a wrapper object, not a texture.** `makeTex`
   returns `{map, rough}` and I passed the pair as `map:`. Crash: `refreshTransformUniform`
   reads `map.matrix` on a plain object. Now `scripts/probe.mjs` walks the live scene and
   fails loudly if any material slot holds a non-`isTexture` — a one-line invariant that
   catches this class of bug for the rest of the build.
3. **Point sprites are square, so rain fell as snow.** A 8×32 streak texture stretched
   into a square sprite is a falling churro. Rain is `LineSegments` now: two verts per
   drop, wind shear applied to both.
4. **Rain recycle left the tail vertex behind.** On wrap I re-seeded the head only, so
   every recycled drop drew one enormous diagonal from its old tail to its new head — the
   "giant spiderweb" screenshot. Recycle must re-seed the whole primitive.
5. **A flap hinge past 90° curls inward.** The carton's first attempt was a paper tulip.
   Rotating about the rim by +θ sends the tip to `(0, -sinθ, cosθ)`: past π/2 the Z flips
   and the flap folds back *inside* the box. Droop is 1.05–1.37 rad, never more.

Also: `g.add(mesh).rotation.x = …` rotates the **group**, because `add()` returns the
group — that is how every trash can in the alley was lying on its side.

**Lighting rig, settled:** one shadow-casting directional moon (1024/512 on mobile), one
hemisphere bounce, PMREM env from a generated equirect (this is what makes wet asphalt and
metal actually *wet* — a Standard material with nothing to reflect has no specular), plus
emissive windows and additive halos for everything else. Only the moon casts shadows.

`tileBox` / `tilePlane` bake world-unit texel density into UVs instead of
`texture.repeat`, so a 3 m shed and a 12 m facade share one brick material (one GPU
upload) — the level builder needs that to stay at tens of draw calls, not hundreds.
### Commit 2 — maps that cannot lie, and the audit that proved mine did

`levels.js` (pure Node, no three, no DOM) carves three jobs out of solid rock:
**the corner bank**, **the museum of shiny things**, **the moonstone manor**. Pure data:
grid arrays, wall heights, markers, patrol routes. `stealth.js` is also pure: sight,
cones, noise, gaits, scoring — every one of them a function of numbers, so the whole
stealth model is testable without a browser.

`npm run heistcheck` is now the gate, and it earned its place immediately: **270
checks, 20 real failures on the first run.** A stealth level's classic failure is not an
ugly screenshot, it is content the player can never reach, a guard who cannot walk his
route, or a torch that sees the getaway cart on frame one. None of that is visible in a
picture. All of it is three lines of flood fill.

What it caught (all real, all in maps I had already "finished"):

- **The museum had one door, and it was the exit.** The lane and the entrance hall were
  separated by a wall row pierced only by the escape gate `X`. With the gate shut the
  *entire level* was unreachable: you cannot get in without finishing the job. Now there
  is a propped staff door at (8,19) you walk in through and a front alarm-door you only
  get on the way out — which, it turns out, is the shape of a heist.
- **A two-cell doorway left a second opening.** I carved the vault doorway two cells
  wide and put the door in one of them. The other was an open corridor: the vault lock
  was decoration. Caught by the audit's favourite trick — run reachability twice, once
  with the doors and gate shut and once open, and **the difference is the proof the lock
  is load-bearing**.
- **Guards could see the getaway cart from their patrol.** Two jobs. Fixed architecturally,
  not by dialling a number down: the cut onto the street is now plugged with two
  dumpsters (walk past them down the x=8 column, sight stops on galvanised steel), and
  the manor got a garden wall with two blind corners between the courtyard mouth and the
  cart. "The guard happens to be looking away" is not a design; a wall is.
- **Dead content**: trash cans and loot stamped inside walls, a guard route laid across
  a room that did not exist, a waypoint that was a crate.
- **Chain-link sanity**: a fence must block movement and *never* sight. Tested directly.

Invariants the audit now holds every job to, forever:
1 loot ≥ 3; 2 nothing unreachable (except wall-mounted emitters, which have their own
"your beam must cross a floor cell" rule); 3 every loot pile has cover within 3.6 m —
a target with no cover nearby teaches the player that stealth is optional; 4 every
patrol waypoint walkable, reachable, and walkable to the next one; 5 no waypoint looks
at the spawn; 6 some loot **requires** the door; 7 the escape has a reachable neighbour
and is not the spawn cell.

`loot(x, y, ch, cover)` now plants the cover in the same call that plants the money: the
thing that creates an obligation is the thing that satisfies it, and the audit still
checks the result. That is the difference between a rule and a habit.

**The harness must be able to fail:** `npm run heistcheck -- --mutate` walls the vault
of job 1 off completely and asserts the audit notices. It reports 12 complaints and
exits 0 *because it failed loudly* — mutation mode inverts the exit, because there the
complaints are the pass condition.

`L` used to mean both "lamppost" and "laser emitter" in the marker alphabet. The audit
cheerfully reported job 1 as having four lasers. Emitters are `Z` now. Two meanings in
one alphabet is how a lamp becomes a death ray.
### Commit 3 — the game is playable: engine, cast, audio, HUD, thumbsticks, and a harness that steals the loot itself

`engine.js` (the simulation), `world.js` (grid → scene), `audio.js` (synthesized score),
a rebuilt `index.jsx` (input rig + HUD + job flow), and **`npm run heistplay`**, which
boots Chrome, starts job 1 and *plays it*: walks with a thumbstick value, takes a sack,
carries it to the cart, chews a vault lock, stands in a torch beam until it is spotted,
gets bagged, chews a friend out of the pound, loads every pile, raises the gate and rides
out the gateway. **44/44 green**, render cost ~2 ms.

Eight real bugs, every one invisible in a screenshot:

- **Suspicion was one shared counter per raccoon, so a second guard made you harder to
  see.** Every watcher that *couldn't* see you subtracted from the one that could:
  walking past a guard on his way to another guard made you invisible, and the level got
  easier as it got harder. `det` is now **per-watcher, per-prey**; the HUD publishes the
  worst. Caught because the driver stood in a beam at 1.5 m, `why()` reported the guard at
  `rate 2.275/s`, and the meter read zero.
- **`audio.step` was clobbered by `audio.step = 0`.** The music sequencer's bar counter
  and the footstep SFX method had the same name; the number won, and every footstep threw.
- **The action button showed the *previous* interaction.** `hint` was only computed inside
  `act()`, so the label read LOAD THE CART while you stood at a vault with empty hands.
  `focus()` now runs every tick: the button label is live, and it names the verb —
  TAKE / LOAD THE CART / CHEW THE LOCK / TINKER THE LOCK / CHEW BANDIT LOOSE / TIP THE CAN.
- **The camera could sit inside a wall.** Occlusion now casts through the *grid* with
  `castWorld` — the same sampler the guards' eyes use — and when a wall does cut in, the
  rig **climbs** instead of merely shortening. Two sources of truth about where a wall is,
  is how a drawn cone and a deadly cone start disagreeing.
- **Decor swallowed the player.** Random cartons landed on walkable cells; one landed on
  the spawn and the first minute of the game was a close-up of cardboard. Props now go
  against a wall and never within 3 cells of a marker or a patrol point.
- **138 draw calls.** Twenty dumpsters × 28 meshes each. Static junk is now *baked*:
  every prop is merged into one mesh per material at build time (`stamp`/`flushBuckets`),
  so the yard's entire clutter costs 3–4 calls. Anything that moves stays separate.
- **A rescue took 4.4 s with Scout** and the harness held the button for 3.2. Two of your
  crew are in a cage; that is desperate, not a minigame. Padlock is 1.5 s at 0.85×grab
  (Tinker ~1.2 s, Scout ~2.4 s) and a new check pins the pacing: *a rescue is desperate,
  not a chore* — it fails if the slowest padlock exceeds 4 s.
- **Objective lied.** "FIND THE SHINY" while carrying a sack. Now derived: piles behind
  the sealed vault are computed with the same `reachFrom(block:['X','V'])` flood fill the
  map audit uses, so the HUD says LOAD THE CART for what is reachable and CHEW THE VAULT
  LOCK only when the only thing left is behind the door. If a vault seals nothing, the
  engine `console.warn`s — a lock that hides nothing is a bug, not a level feature.

Two harness lessons, both about the *test*:

- `if (!Math.max(...) > 0.15)` compiles, and is never true: `(!NaN) > 0.15`. The check
  that was supposed to print the detection arithmetic printed nothing for two runs.
- A check that sleeps 260 ms and then reads the button label passes on an idle machine
  and fails on a loaded one. It now polls for up to 1.5 s, which is not a weaker test —
  "the affordance must appear within 1.5 s" is the actual requirement, stated as itself.

`why()` is the diagnostic this whole stage needed: for the raccoon you control, every
nearby watcher's `los / align / cover / light / rate / det`. "Why can't they see me" is
the one question a stealth game must be able to answer, and now the machine can too.

Controls: WASD/arrows, Shift dash, C crouch, **E tap to take / hold to work a lock**,
F lure, Q crew, drag to look, wheel to zoom. On touch: a re-anchoring floating stick (the
stick appears where your thumb lands, because a fixed stick on a phone is always an inch
from your thumb), CROUCH, LURE (with a count), CREW, and one big action button whose ring
lights up when there is something to do. The shared `<VirtualControls />` is deliberately
*not* used here: an analog thumb position is not a discrete key. Arrow/Space are still
handled, so the pad-shaped harness still works. The touch pad is gated behind
`isTouch() || ?pad=1` — a thumbstick on a desktop is two discs covering the game.

---

## Raccoon Heist, checkpoint 3 — the world gets taller, the cast appears, and the harness learns to open its eyes

### The camera was in a wall because the world was a toilet
Every screenshot for two rounds showed brick. Not bad framing — *brick*, edge to edge. The
cause was in `levels.js`: one grid cell was one metre. A corridor was therefore a metre
wide, a raccoon 0.64 m, and any chase camera further back than two metres was inside a
wall. Every fix I tried (pull the camera back, raise it, fade the wall) made the frame
worse, because the level was too small to hold a camera at all.

So the world got 2.2x wider: `export const CELL = 2.2`. The decision that made this a
twenty-minute change instead of a rewrite: **the grid stays in cells and only the world
mapping scales.** `at / cellOf / worldOf / build()`, every carve coordinate, the
pathfinder, `heistcheck`'s cell arithmetic — untouched. What *did* need hunting were the
metres anyone had hardcoded while a metre and a cell were the same number: floor quads
`±0.5`, `BoxGeometry(1, h, 1)`, windows at `dx * 0.52`, rain extent, a hardcoded sky
radius of 80, and the fog density (exp-squared fog, so the old value swallowed the far
half of every yard in solid black).

One was a genuine trap: the fence used to be *one merged batch with a mesh-level scale*
(`fence.scale.set(0.98, 0.55, 0.98)`). At 1 m cells, sliding every panel a few centimetres
is invisible. At 2.2 m it is a floating rail the width of a doorway, in the wrong place.
Scaling a merged batch scales the positions inside it, so dimensions now get baked into
`wallGeometry(level, wantHeight, fixedH)` instead.

### The raccoons did not exist
`npm run heistplay` said 45/45. The screenshots said no raccoon. `engine.group` — crew,
guards, loot, the cat, everything alive — was never added to the scene. The level looked
lovely, the numbers were perfect, and the stage was empty for the entire time I had been
"playing" it.

The fix is one line. The lesson is the reason this commit exists: **my harness could not
see.** Every check read simulation state, and simulation state was correct. So `heistplay`
now has a section named `THE CAST EXISTS` that asks whether the crew is a mesh, whether
that mesh is in the rendered scene graph, and whether it is inside the frame — plus a
triangle/draw-call floor, because a scene that draws *nothing* used to satisfy "no errors".
A numeric check certifies an empty stage happily, and it had just done exactly that.

### Draw calls: 138 → 67 → 43 level meshes
Three rounds of batching, each one a real reduction rather than a raised threshold:
- `bakeMeshes(node)` merges every static mesh inside a prop into one per material
  (transparent parts skipped, `userData.keep` respected). The pound is twenty bars and a
  roof: one mesh now. Same for the gate plate and slats (baked *inside* the door group, so
  the door still slides as one object), the vault, and the cart (whose `pile` group is kept
  out of the bake, because delivered loot keeps landing in it).
- Lampposts collapsed hardest. Five meshes × eight lamps was half the level's draw calls.
  Now: all ironwork into the clutter buckets, **all bulbs into one mesh sharing one emissive
  material** — the flicker drives the shared material, so eight flickering lamps cost one
  call — and all additive halos into a third.
- Puddles: fourteen transparent quads, one mesh, one shimmer. They pulse in unison now,
  which is the price, and the rain is thick enough that nobody collects it.

The budget check got *split* rather than loosened: level ≤ 50 meshes, whole scene ≤ 280
calls. One combined number lets a 400-mesh level hide behind a 20-mesh guard.

### Two smaller truths
- **Suspicion is per-watcher, per-prey.** It lived on the raccoon as one shared number, so
  every guard who *couldn't* see you subtracted from the one who could. Bigger levels with
  more guards were quietly easier. That is a level-design bug wearing a rendering hat.
- **`hears()` is an event queue, not a stat**, and `masked` is thunder's honest name for
  "you are loud and it does not matter". The manor storm is a mechanic you plan around
  because of those two lines, not because the sky has rain in it.

### Where it is
`heistcheck` 264 PASS · `heistplay` 50 PASS · `lint:heist` clean · CI now carries
`lint:heist` + `heistcheck` in the blocking static job and `heistplay` in the manual
browser job. Three jobs carved; job 1 played end to end by a machine. The raccoon is
visible, the crew waits by the cart, and the gate opens when the cart is empty.

---

## Playtest round 1 — three complaints, three bugs, and the harness learning to read a direction

The first human playtest of the shipped build came back with three sentences, and every one
of them was a real bug that 264 level checks and 50 play checks had walked straight past.

### "Controls are inverted"
The strafe axis had the wrong sign. The camera looks along `(sin yaw, cos yaw)`, so with Y
up, screen-right is `(-cos yaw, sin yaw)`; the engine was using `(cos, -sin)`, which is the
same axis pointed the other way. One minus sign, and D meant left for every second of
every session.

The harness could not have caught it as written. The move check asserted
`moved > 0.9 metres` — and walking left *is* walking. So `heistplay` has a section
**WHICH WAY IS RIGHT** now: pin the camera to a known yaw and assert world axes.
Two conventions had to be nailed down to write it honestly, and one of them was the test's
own:

- the touch pad speaks **screen** coordinates (thumb-up is negative DOM y) and `index.jsx`
  negates them into engine forward; the first draft of the test pushed `stick(0, 1)`
  meaning "forward" and the engine correctly walked **backwards**. A driver that lies about
  its own input teaches you nothing about the game, so the driver now has a `thumb(dx, dyUp)`
  helper that says which frame of reference it is speaking in.
- screen coordinates are useless as a ruler *here*: the camera follows the raccoon and keeps
  it centred, so its ndc never budges no matter which way it walks. World axes at a pinned
  yaw is the only honest measurement available.

Then I proved it: put the old sign back, and three checks go red
(`dx=+1.97` where it must be negative).

### "I keep walking through things"
Collision was the grid, the whole of it. The grid is 2.2 m cells, and every interesting
piece of furniture in this game — hydrants, bins, pallets, lampposts, the cart — is
*decoration standing on a walkable cell*, so the grid said WALK and the raccoon walked
through a lamppost. Within two seconds of that a player stops believing the world.

`world.js` now hands the sim a collider list (`{ x, z, r }` per stamped prop; pallets
deliberately excluded, because you can step over a pallet) and `blocked()` tests circles
after cells. There is an "already inside" exemption, because a collider that a shove or a
teleport can put you *inside* is a prison, and a stuck raccoon is worse than a ghost one.

The check walks the raccoon at a prop for long enough to cross it and asserts both halves:
never inside, **and** stopped near the surface. That second half is the one that matters —
"did not end up inside the bin" is also satisfied by a raccoon that wandered off. Actual
output: walked 1.83 m, stopped 0.77 m from a 0.42 m hydrant. `0.42 + 0.32 = 0.74`, the
radius plus the body. The number is the proof.

### "The guard didn't capture me even though I was on top of him"
Three separate defects wearing one hat, which is why "make the guard catch you" is not an
action item:

1. the catch radius was **0.62 m** — a handshake, with a 0.64 m wide raccoon;
2. an alerted guard walked the **path**, and waypoints are 2.2 m apart, so it stopped a
   metre short of you and stood there staring;
3. **nothing in the game pushed back.** Two actors could occupy the same cubic metre of air
   indefinitely. So the player was, literally, inside the guard.

Now an alerted watcher inside 3.6 m with line of sight abandons pathing and walks straight
at the actual raccoon; `lastSeen` refreshes every frame it still sees you (it used to update
only when suspicion refilled, so a guard would sprint to where you were eight seconds ago
and give up there); reach is an arm (1.15 m, dogs 1.25 m); a *surprised* watcher grabs too,
because bumping into a raccoon in the dark is not a thing a guard just watches; and
`separate()` shoves overlapping bodies apart — with meshes re-set afterwards, or the shove
lands a frame late and reads as a stutter.

The harness stages the arrest (`warpWatcher`) and then puts the job back
(`release`/`calm`), because the driver has to be able to get caught on purpose and keep
going.

### On mutation testing, and one thing I broke
Each fix got a mutation run: invert the strafe, empty the collider list, restore the
handshake radius. All three went red, and the collider mutation took two downstream checks
with it (a raccoon that walks through a lamppost also wanders out of the torch beam it was
supposed to be standing in), which is what a connected suite is supposed to do.

Then I reverted a mutation with `git checkout <path>` — on a dirty tree — and destroyed
every uncommitted line of this session's `engine.js`. Rebuilt from the session log, 12
patches, green again, and committed before touching anything else. **Revert experiments with
a `/tmp` copy; commit before you play with fire.** A harness that can prove the code is
wrong is worthless if the person running it can delete the code.

**Where the checks stand:** `heistcheck` 264 · `heistplay` 66 · `lint:heist` clean.
