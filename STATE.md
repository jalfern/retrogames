# STATE — 2026-10-18 (two lanes: COMET DRIFT HD shipped; ocean spikes fixed)

## Shipped this session
- **COMET DRIFT HD #465 (#468)** — retro GP's sim/track reused UNCHANGED under
  three.js **WebGPURenderer** (WebGL2 fallback): extruded Gulch, dusk + ACES,
  pooled GPU sparks/dust/flames, FOV punch + drift cam-lag, glass HUD,
  attract = autopilot win. `/comet-drift-hd`, private, verified live in prod.
  `cometdrifthdcheck` 29/0 (RED on `--mutate`); contractcheck 14/14; lint +
  build green. Polish pass filed **#471**.
- **Ocean single-frame spikes fixed (#466; feeds #456)** — four compounding
  bugs in `public/demos/ocean.html`: (1) mesh displaced by octave 1 (14 m grid
  on 1.8 m vertices) → oct-0 only; (2) grid snap at 0.22 m → mesh spacing;
  (3) chop applied twice (cs_prep ×chop·k AND enc amp) → once; (4) THE
  RESIDUAL: oct-0 spectrum ran to texel Nyquist — λ≈3–6 m energy zigzags
  VERTICALLY between 1.8 m vertices with *positive* Jacobian, so no fold check
  could see it. Fix: `kMax` low-pass in `cs_fill`, oct-0 fades at mesh Nyquist
  π·SEG/EXTENT, oct-1 unlimited (shading keeps ripple detail). dsp retune
  oct-0 4.0→2.0, oct-1 1.8→2.4. New guard `npm run oceanfold` (parses the
  demo; scans 3 texture periods × 6 phases; storm J +0.118, pre-fix −1.17;
  four mutants RED). oceancheck ALL GREEN (foam floor 3000→1200: single chop
  halves foam; a pixel spike detector cannot separate fog/foam from folds).
  Storm screenshots z=0→35 camera-travel: zero spikes; calm keeps ripples.
- **Ocean FFT butterfly race fixed (#474)** — Jon's diagnosis: each stage in
  `cs_row`/`cs_col` read a and b from workgroup memory and wrote BOTH butterfly
  slots with the only barrier *after* the writes; partners occupy each other's
  write slots, so another SIMD group could clobber before the owner read →
  one-frame whole-surface spikes. Added `workgroupBarrier()` between reads and
  writes in both butterflies; oceanfold now structurally requires the mid-stage
  barrier in rb and cb (deleting either → RED).

## Harness lessons (WebGPU is new ground — forge lane)
- `WebGPURenderer` lives at `three/webgpu` (r180). A WebGPU canvas answers
  BLACK to 2D drawImage/getImageData regardless of preserveDrawingBuffer —
  pixel checks run on `?gl=webgl2`; screenshots cover WebGPU.
- Never replace a React-owned canvas element (StrictMode resurrection);
  substitute canvases as hidden earlier siblings.
- Contract `state()` must be pure sim (particle-pool count broke snapshot
  round-trip).
- **Positive Jacobian ≠ smooth mesh**: vertical texel-scale zigzag spikes with
  no XZ fold (this is why `oceanfold` also band-limit-checks structurally).
- **Stage-end barriers don't make in-place butterflies safe**: any stage where
  lane X writes lane Y's read slot needs a barrier BETWEEN reads and writes.
- CometDRiftHD: autopilot ladder pays via treadmill only (|steer|>0 rarely
  holds) — see #471 item 8.

## Held / open (unchanged unless noted)
- **#391** `stalled` — awaiting Jon: close as shipped vs batch 5.
- **#375** `stalled` — Civ parked per Jon.
- **#443** open — idle-builder QA-borrow ruling pending.
- **#456** Ocean polish — spikes are FIXED and merged; comment the root-cause
  write-up on #456 before commissioning anything else Ocean.
- QA backlog (#440/#426/#423/#421/#422/#409/#410/#405, #365, #384) + **#471**.

## GOAL — next session
1. Re-check `next` / `game-queue` / `building` + pushed `forge/*` branches.
   Expect nothing unless Jon feeds it; QA lane owns throughput meanwhile
   (#443 unresolved — do not borrow while `QA MASTER` is live).
2. After #466 deploys: `curl -sL https://jalfern.com/retrogames/demos/ocean.html | grep KMAX`
   (jalfern 308s to www — always `curl -L`).
3. Rule 4 healthy: both lanes shipped game/demo code this session.

## Three questions for Jon
1. **WebGPU on phones**: WebGL-node fallback lost its device on this Mac; the
   self-heal to classic WebGL shipped untested. Old-phone target for real, or
   keep the pin-param? (#471)
2. **#471 item 8**: shared sim lets only treadmill-proven drift payouts — fix
   the sim (both twins change) or leave the human-only ladder?
3. **#398/#443**: Missile Battle `smoke` flaked on #466 (passed on rerun; the
   only reason rule-5 needed a rerun). Make `smoke` continue-on-error so
   advisory flakes can't wedge merges? (same ask as #398)
