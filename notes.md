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
