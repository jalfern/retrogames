# STATE — 2026-10-23 forge session (CORAL REEF demo shipped; reefcheck 29/29)

## Shipped this session
- **#902 → main (PR #944 squash 268e619)** — **CORAL REEF** demo, live at
  `https://www.jalfern.com/retrogames/demos/reef.html`. Self-contained
  Canvas2D parallax diorama (demos law: /retrogames/demos only, no registry).
  Signature five from the brief, all in: caustics rippling over sand, god rays
  from the surface, swaying corals/fans/anemones/tubes, boids fish school
  (Vicsek order ~1.0), marine snow + bubbles, and depth colour-fade by real
  absorption physics (r/g 0.60 surface → 0.36 floor; warm corals live shallow).
  Synthesized ambience (water bed, bubbles, distant whale), drag-to-look,
  credits card. Index card + DEMO_INDEX entry + reefcheck alias.
- **reefcheck 29/29** (`npm run reefcheck`) — boots, colour-physics gates
  (luma/b-r/r-g columns), rays as vertical contrast, lit + MOVING caustics,
  warm-coral across sections, flock order, phone 390x844 lite, retina dpr2,
  draw-cost budget. **Proven red**: zeroed caustic alpha → lit-sand + ripple
  gates red; restored.
- `npm run creditscheck` **69/69** — also fixed pre-existing main drift:
  index `DEMO_INDEX` mountains entry said `[671]/~13 h` vs card's
  `[671,736,834]/~15 h` (now aligned; was red on main before this PR).
- Filed **#947** `QA — CORAL REEF: polish pass` (feedback).

## Next goal
- Oldest `game-queue`: **#903 black-hole demo** (self-contained
  `/retrogames/demos/…` only — no registry, per Jon 2026-10-19).
- QA holds #928 (MYST graphics), #891 (list hygiene), #939 (model shelf
  consumers), and now #947. Never touch heldGames.

## Board / harness status
- main = 268e619 (this ship). `main-ok` green at claim + merge; `static`
  SUCCESS; prod verified (reef.html + index card live on www.jalfern.com).
- `lint:mario`/`lint:fps`/`lint:ai` clean; `npm run build` green.
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.

## New harness lessons (this session)
- **Headless Chrome rAF-dt is compositor delivery, not your cost.** A
  canvas2d page measured 50–90 ms/frame (and *smaller* viewports were
  *slower*) while our frame body did 5 ms of work. Gate the draw cost the
  demo controls (time inside the frame body), never rAF deltas, in this
  harness; keep the freeze gate on rAF (alive ≠ fast).
- **GL renderer probes lie for canvas2d** — `WEBGL_debug_renderer_info`
  says Metal while 2D compositing runs software. Calibrate by timing real
  canvas fills and classify with the number.
- **Warm colour at depth is depth-limited, not taste-limited**: veiling
  mixes blue in, so pixel gates for "warm coral" must sample the shallow
  band where red survives — which is also what a diver sees. Make the near
  band genuinely warm (hero props) instead of loosening the gate.
- **Adaptive quality needs the right lever**: shrinking the backing store
  didn't help when the bottleneck was JS issue cost + compositor; halving
  the noise-field update rate did. Measure work, pick the lever that moves it.

## Housekeeping owed
- Prune worktrees when idle: `retrogames-forge-coral-reef` (this session;
  symlinked node_modules — worktree-only), plus the old list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, qa-863*,
  people-sim, campfire-670, forge-model-library).
- STATE.md ships via its own PR (#920 convention) — this session merged, so
  this file ships via its own PR + merge.

## Open questions
- None (#605: nothing filed this session).
