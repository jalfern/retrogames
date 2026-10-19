# STATE — 2026-10-18 (forge: COMET DRIFT HD dune buggy swap #477 shipped; sideways kart fixed)

## Shipped this session (forge lane)
- **#477 SHIPPED (#480, squash 455cdde)** — swapped COMET DRIFT HD's hand-boxed
  primitive kart for Jon's authored `dune_buggy.glb` (player + all rivals), and
  fixed the sideways-kart bug.
  - **Sideways fix (root cause)**: the sim drives along `(cos a, sin a)` in the px
    plane → world `(X,Z)`; the buggy's nose is local **+Z**, so three-yaw must be
    `kartYaw(a) = π/2 − a`. The HD twin shipped `−a`, pointing the nose 90° off
    (Jon's "front is the driver's left door"). The arch already used `π/2 − a`; the
    kart now matches. The 2D retro twin is unaffected (top-down).
  - `loadBuggy()` dynamic-imports `GLTFLoader`, loads the GLB once (cached); the
    primitive buggy stays as an **instant fallback** — the race never dead-loads.
  - `decorateBuggy()` deep-clones materials per kart, recolours `Paint_Orange` per
    rival, arms `Taillight_Red` as brake lamps, scales the 3.4 m body to 0.48×.
  - Wheel rig `Wheel_FL/FR/RL/RR`: fronts steer about local vertical, all four
    spin about the axle; the model bakes a 180° flip into the right-side nodes and
    per-wheel side-signs undo it so both sides steer parallel + roll forward.
  - Verified live in prod (WebGPU): all seven buggies square to the road.

## Learned this session
- **GLTF nodes can carry `matrix` instead of translation/rotation/scale** — a
  node dump that only prints T/R/S shows nothing and looks identity. Parse the raw
  GLB JSON chunk to see the real transforms (the wheel flips live in `matrix`).
- **Node-safe glTF inspection without DOM**: read accessor `min`/`max` (exporters
  fill them) instead of slicing bufferViews — a hand-rolled positional read hits
  Node Buffer pool-offset bugs and returns 1e37 garbage. Accessor min/max is the
  trustworthy bbox.
- **Baked flip ⇒ sign bookkeeping**: a right-side 180° Y flip makes the same local
  steer/roll produce mirrored world motion. Lock the sign per side numerically
  (rotate the tire-top local +Z/+Y and check world sign) before writing it; the
  check re-derives each wheel's sign from its matrix so a future re-export that
  changes the flips fails the harness.
- **WebGPURenderer renders GLB MeshStandardMaterials** fine; cloning shares
  materials by reference, so deep-clone per instance for per-rival liveries.

## Harness
- cometdrifthdcheck: +GLB-contract / heading-law / wheel-sign Node section +
  browser `modelLoaded()` swap assertion. Heading law **proven red** on a reverted
  `−a` (27/2), green after restore. Node 29/0, full browser **44/0** (WebGL2 +
  WebGPU, attract→race→end→restart, zero page errors). lint hd/comet/mario/fps/ai
  + eslint + build green. CI static green → squash merged → re-detached.
- Filed **#481** `feedback` — QA polish pass for the buggy (driver figure, blob
  shadow size vs new footprint, distinct brake lenses, exhaust-flame alignment,
  steering travel, accent legibility, phone WebGPU retest).

## Held / open (unchanged unless noted)
- **#391** `stalled` — awaiting Jon: close as shipped vs batch 5.
- **#375** `stalled` — Civ parked per Jon.
- **#443** open — idle-builder QA-borrow ruling pending (QA lane owns throughput).
- **#456** Ocean — spikes+barrier deployed; comment before commissioning more Ocean.
- QA backlog (#440/#426/#423/#421/#422/#409/#410/#405, #365, #384) + **#478**
  + new **#481**.
- Rule 4 healthy: game code shipped this session.

## GOAL — next session
1. Re-check `next` / `game-queue` / `building` + pushed `forge/*`. Expect nothing
   unless Jon feeds it; QA lane owns throughput (#443 unresolved — don't borrow
   while `QA MASTER` is live).
2. If idle: #478 item 0 (`?renderer=webgl` alias) is a 2-line forge-appropriate
   fix with a harness name-check — only per FORGE.md 2 borrow rules.
3. If Jon wants it, #481 items 1 (driver figure) + 3 (brake lenses) are small
   forge-side follow-ups to this session's model.

## Three questions for Jon
1. **Buggy scale** — 0.48× the 3.4 m body reads kart-sized on desktop; on a phone
   does it feel too small / too big in the chase cam? (Want your phone verdict —
   the whole point of #477 was recognisability.)
2. **Empty cockpit** — the authored model has a seat but no driver. Add a
   synthesized helmet-in-accent driver (my call: yes, filed #481 item 1), or do you
   want the buggy to stay driverless as authored?
3. **Fallback policy** — the primitive buggy is kept as an instant fallback if the
   GLB ever fails to load. Keep that (safety) or drop it so a missing model is a
   loud failure instead of a silent downgrade?
