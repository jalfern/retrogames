# STATE — 2026-10-24 forge session 7 (MYST's rocket flies: the fourth ending)

## Shipped this session
- **#1010 → main (PR #1011 squash 4bda8e5)** — **MYST: rocket ride + Selenitic
  sound-book**, live at `https://www.jalfern.com/retrogames/myst`.
  - Flagship stage (idle.mjs honest pick): Myst honest-gaps #0 — the only
    unowned flagship gap at claim time (SSX 0, Emberwood/HD QA-held).
  - Game code: `state.js` ride machine — the cave's metal seam opens only to the
    AMATEM observatory note; saddle → ignition → tick-driven liftoff → ascent →
    coast → reentry → splash; mid-flight every input but the loop's tick is
    refused; splashdown is the **fourth ending `surface`** (escape Myst).
    `soundBook` act + `echo` action replay the six true stone pitches via the
    same `stone:<i>` events. `nodes.js` +27th view `rocketSilo`; `scene.js`
    silver rocket (nose/fins/porthole/pad/console), breathing flame, stars that
    fade in with height, new `silo` sky+fog (dusk's orange horizon painted a
    lava pool on the pad); `index.jsx` rides the fixed-timestep tick with the
    camera, fog and sun.
  - Harness: mystcheck **292/0** (+13 gates: note-gated seam, mount, mid-flight
    refusal incl. rideT freeze, stage order, determinism, surface ending, six
    distinct book echoes, coast silence); `--mutate` **29/29 die** (+4).
    mystplay **22/22** live (full ride in real time, zero page errors);
    mystviewcheck **82/82** (27 views). lint myst/mario/fps/ai + build green.
  - Prod content-verified through browser-UA: lazy chunk index-D0RVQqOy.js
    contains `rocketSilo` + `endSurface`.
  - Polish notes for the new surfaces added to **#1008** — since claimed by the
    QA lane (`building-qa`).

## Next goal
- **STOP is legal**: idle.mjs re-pick at 4bda8e5 returns STAGE null — SSX 0
  gaps, Emberwood 0 (walk gap CLOSED by QA's #1007), HD held (#1002), Myst
  held (#1008). Both QA sessions are live and each holds a flagship.
  Next session: re-run idle.mjs honestly first; anything new on
  game-queue/steer/next, or a QA release, wakes the builder.

## Board / harness status
- main = 4bda8e5 (this ship, after QA's 4bda8e5-parent #1007 Emberwood walk).
  main-ok green at merge; static SUCCESS; Vercel prod content-verified.
- Worktrees: main checkout detached at origin/main ✓;
  `retrogames-forge-myst-rocket` done, detached ✓.

## New harness lessons (this session)
- **A mystery "pool" of light can be the sky, not a mesh.** A huge flat orange
  disc at the silo's feet was `SKIES.dusk`'s horizon rgb(214,96,52) seen
  through the shaft — color-match stray pixels against sky gradients before
  hunting geometry.
- **New sky names need three tables**: `texSky` silently falls back to `day`
  while `atmosphere()` returns an undefined `sun` and crashes — SKIES + FOG +
  SUNSET must all learn the name together.
- **Dark metal renders black at dusk** (metalness 0.72, no envmap): hero
  objects need low metalness or an emissive tint to read against dark rock.
- **A refusal gate must freeze progress, not just events**: a mutant that let
  any input advance the sim-tick survived an `events.length === 0` gate —
  assert the counters too (rideT before === after).
- **A reveal-once spot eats the act's first click** (reveal breaks the click
  branch): a reveal+need+act spot is a three-touch puzzle; write the gates
  against the chained state, not one dispatch per touch.

## Housekeeping owed
- Prune when idle: `retrogames-forge-myst-rocket`, plus standing list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, comet-hd-*,
  coral-reef, people-sim, campfire-670, forge-model-library, qa-863*,
  qa-973*). qa-973 stays detached from `main` (worktrees-only law).

## Open questions
- None (#605: nothing filed this session).
