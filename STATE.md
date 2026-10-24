# STATE — 2026-10-23 forge session (BLACK HOLE demo shipped; blackholecheck 31/31)

## Shipped this session
- **#903 → main (PR #955 squash 94272a8)** — **BLACK HOLE** demo, live at
  `https://www.jalfern.com/retrogames/demos/blackhole.html`. Self-contained
  WebGL2 geodesic lenser (demos law: /retrogames/demos only, no registry).
  Every pixel ray is an RK4-integrated Schwarzschild null geodesic
  (u''+u=1.5·rs·u²); Keplerian disk (ISCO 3 rs) sampled at each equatorial
  crossing → far half arcs over+under the shadow (Interstellar halo); Doppler
  beaming δ=1/(γ(1−β·n̂)), I∝δ³ with colour temp riding δ·√(1−rs/r);
  photon-ring rim at b_crit=2.598 rs; procedural starfield+milky-way lensed
  around the shadow; bloom+ACES; drone audio swelling on approach; slow
  flyby R≈11–25 rs; drag-to-look; fence-driven quality ladder (steps first,
  then pixels). Index card + DEMO_INDEX entry + blackholecheck alias.
- **blackholecheck 31/31** (`npm run blackholecheck`) — RK4-anchored bending
  (b=4/6/10 within ~1% of reference), monotonicity, capture cone (b=2.4 in,
  b=2.8 out), halo-lift probe, Doppler ratio+pixel asymmetry+colour shift,
  shadow, top/bottom halo, shear motion, phone lite, retina, speed (detects
  headless sync pipeline → software budget). **Proven red**: Doppler beaming
  `pow(dlt,3)*g*g -> 1.0` → both Doppler gates red (ratio 1.24); restored.
- `npm run creditscheck` **76/76** (blackhole added to DEMOS list).
- Filed **#956** `QA — BLACK HOLE: polish pass` (feedback).

## Next goal
- Oldest `game-queue`: check `gh issue list --label game-queue`; if empty,
  the borrow-QA / flagship-polish stages (#841) apply.
- QA holds #928, #891, #939, #947, #956. Never touch heldGames.

## Board / harness status
- main = 94272a8 (this ship). `main-ok` green at claim + merge; `static`
  SUCCESS; prod verified (blackhole.html @200 + index card live).
- `lint:mario`/`lint:fps`/`lint:ai` clean; `npm run build` green.
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.

## New harness lessons (this session)
- **Symplectic Euler pumps orbital energy.** The first tracer over-bent
  (b=4: 0.86 vs 0.5 first-order) and faked captures; RK4 matches the stiff
  reference within 1%. Cheap orbits need RK-class steps near the mass.
- **An impossible number IS the clue**: rMin < b ruled out physics and pinned
  the step scheme; a straight-line (rs=0) test proved the bend measurement
  itself exact. Two probes that can't both be wrong → the third number is
  the bug.
- **Headless "hardware" WebGL can be a sync pipeline**: ANGLE Metal reported,
  fences never busy, rAF-dt 60-80ms. Classify avg>45 && busy<1 as
  headless-sync and give it the software budget; on real hardware gate the
  honest pair (submit work, fence busy).
- **Colour physics beats colour paint**: one observed-temperature law
  (T_obs ∝ δ·g·T in a single blackbody ramp) makes the Doppler side whiter
  AND passes the redness-differential pixel gate with margin; a separate
  "blue tint" multiplied on top failed the same gate.

## Housekeeping owed
- Prune worktrees when idle: `retrogames-forge-black-hole` (this session;
  symlinked node_modules — worktree-only), plus the standing list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, qa-863*,
  people-sim, campfire-670, forge-model-library, coral-reef).
- STATE.md ships via its own PR (#920 convention) — this session merged, so
  this file ships via its own PR + merge.

## Open questions
- None (#605: nothing filed this session).
