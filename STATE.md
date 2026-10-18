# STATE — 2026-10-18 (FORGE session: COMET DRIFT HD shipped — first MODERN title)

## This session
- **#465 SHIPPED (#468)**: **COMET DRIFT HD** — the retro GP's sim/track
  reused UNCHANGED under three.js **WebGPURenderer** (WebGL2 fallback):
  extruded Gulch geometry, dusk lighting + ACES, pooled GPU sparks/dust/
  flames, FOV punch + drift cam-lag, glass HUD, attract = autopilot win.
  `/comet-drift-hd`, private. Verified live in real Chrome against
  production. Board: #465 shipped; polish pass filed as **#471 (feedback)**.
- `cometdrifthdcheck` (new, `npm run` alias): geometry audit + rules +
  win + browser cycle — 29/0, RED on `--mutate` (particle-spawn kill).
  contractcheck 14/14 for id `comet-drift-hd`. lint mario/fps/ai/hd 0,
  build green.

## Learned this session (WebGPU is new ground — the HARNESS lessons)
- **`WebGPURenderer` lives at `three/webgpu`**, not `three` (r180).
- **A WebGPU canvas answers BLACK to 2D drawImage/getImageData** no matter
  what `preserveDrawingBuffer` says. Pixel checks must run on the WebGL2
  path — the game accepts `?gl=webgl2` to pin it; screenshots cover WebGPU.
- **three's WebGL-node-backend lost its device on this Mac** (forceWebGL,
  even lite). The game now self-heals: render-failure/black-frame heartbeat
  rebuilds on classic `WebGLRenderer`. Phones on that fallback are still
  untested for real (in #471).
- **Never replace a React-owned canvas element**: StrictMode re-attaches the
  ref to the original node and resurrects a dead context (mount crash).
  Substitute canvases are inserted BEFORE it, hidden siblings; cleanup
  removes them at effect start.
- **Contract `state()` must be pure sim** — a particle-pool count leaked in
  and broke snapshot/restore round-trip (restore can't rebuild juice).
- **Screenshot review is load-bearing**: it caught an empty minimap (integer
  padding on fractions), a road-edge arch leg the karts could clip, a
  floating wing, HUD under the #437 corner chrome — none caught by logic
  checks.
- The autopilot's ideal line barely triggers the drift-charge condition
  (needs |steer|>0): ladder pays only via treadmill (same as retro twin;
  race-event proof is impossible against the pinned sim — see #471 item 8).

## Held / open (unchanged unless noted)
- **#391** `stalled` — awaiting Jon: close as shipped vs batch 5.
- **#375** `stalled` — Civ parked per Jon.
- **#443** open — idle-builder QA-borrow ruling pending.
- **#456** — Ocean polish; #461 already shipped storm slider — check overlap
  before commissioning.
- QA backlog unchanged (#440/#426/#423/#421/#422/#409/#410/#405, #365,
  #384); new: **#471** CometDriftHD polish pass.

## GOAL — next session
1. Re-check `next` / `game-queue` / `building` + pushed `forge/*` branches.
   Expect nothing unless Jon feeds it; QA lane owns throughput meanwhile
   (#443 unresolved — do not borrow while `QA MASTER` is live).
2. If anything lands for the forge: remember rule 4 — this session broke
   the streak (game code shipped).

## Three questions for Jon
1. **WebGPU on phones**: the WebGL-node fallback lost its device on this
   Mac; I shipped the classic-WebGL self-heal. Do you have an old-phone
   target to test the auto-fallback path for real, or keep the pin-param?
2. **#471 item 8**: the shared sim lets only treadmill-proven drift payouts
   (autopilot rarely banks a tier in-race). Fix the sim (both twins change)
   or leave the human-only ladder as designed?
3. **MODERN standard**: first MODERN title shipped without TSL
   post-processing (stability). Should bloom/AAA post be a requirement in
   ART.md's MODERN bar, or earned per-game via polish passes?
