# STATE — 2026-10-15 (forge session, SSX shipped)

## Shipped this session
**SSX** (#294) — PR #309, squash-merged at `665dec6`, live:
https://jalfern.com/retrogames/ssx
- EA's 2000 snowboard racer rebuilt whole in code, real 3D in three.js:
  three seeded mountains (Alpine glade / neon night city / sunset halfpipe
  basin), three heats vs five CPU riders, standings points.
- Trick ledger: 180-720 spins (1080 with OVER), grabs, front/back flips off
  lips and pipe walls; chains to x4; half-finished flip = bail. Boost meter
  filled by tricks, spent for speed (30→38 m/s); full meter at takeoff =
  OVER (double pay). Crash dumps half the meter.
- RACE (3 heats) + SHOWOFF (90 s vs house bank 8000). Vertex-coloured snow,
  spray, FOV kick + shake, animated rigs, synth pulse that ducks in the air.
- Gates added to CI `static`: `lint:ssx` + `ssxcheck` → **57/57 PASS**
  (rule pins · autopilot wins all 3 heats 30/30 + showoff 18k · slack rule
  0.75x economy + chain x3 · determinism + no-Math.random grep · planner/CFG
  agreement). Bail-rule mutant proven red then restored. Headless Chrome
  attract + play drive: zero page errors. `npm run build` clean.

## GOAL — next session
Oldest open `game-queue` items: **#295 Civ V** (standing scope-question —
likely NOT a cabinet title; do not build without Jon), **#296 Prince of
Persia** (strong next candidate). Confirm with Jon before building a queue
item; QA #310 (SSX polish) and the open QA list are valid fallbacks.

## Board (last read)
- Queue: #295 Civ V, #296 PoP.
- Open QA: **#310 (SSX polish — fresh)**, #304 (MYST), #302 (Gauntlet/
  FourHalls), #298 (Tempest), #287 (LunarLander), #283 (OutRun), #280
  (SmashTV), #275 (Gauntlet), #270 (SimCity), #269/#220 (Kart), #265
  (Marble), #263/#258 (Bubble Bobble).

## Notes for whoever picks this up
- SSX architecture: `course.js` (centerline+features, `terrainY/slopePos` are
  THE surface), `sim.js` (pure step, CFG flags incl. `slack`), `planner.js`
  (IS the CPU field + attract + win proof; constants mirror CFG — ssxcheck
  pins agreement), `art.js`, `index.jsx` paint-only. Copy for any future
  riding/flying physics title.
- Two gotchas paid this session: heat state (`finished/place/finishT/points`)
  MUST be reset in the grid re-seed — stale flags corrupted standings silently;
  and `ssxcheck`'s no-Math.random grep must match `Math.random(` (the word
  appears in file-header comments).
- curl of jalfern.com needs `-L --compressed`: responses gzip, and grep on
  binary silently matched nothing for ~10 minutes.
- `pad` field declared for SSX (`dpad` + BST=ShiftLeft). Phone gets
  steer+jump+boost; flips are keyboard-only until #310 item 7.
- Main checkout stayed detached at `origin/main` (Jon's rule); build ran in
  worktree `~/Dev/retrogames-forge-ssx` with symlinked `node_modules`;
  worktree left in place, branch deleted on merge, HEAD re-detached.

## Three questions for Jon
1. #295 Civ V is the third time it appears — retire it from the queue, or
   name a 4X-scope cabinet title you'd accept instead?
2. #296 Prince of Persia next (1989, one prince, one hour, sword duels)?
   That's a big animation lift — OK to prioritize mechanics over rotoscoped
   looks, with polish filed to QA?
3. SSX shipped at ~3h (user-timed box) — the `ssxplay` browser harness is
   deferred to QA #310 item 8. OK, or should forge sessions always ship the
   play script with the game?
