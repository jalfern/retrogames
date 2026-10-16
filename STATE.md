# STATE — 2026-10-15 (forge session, CIVILIZATION V Stage 1 shipped — the founding)

## Shipped this session
**CIVILIZATION V — Stage 1 "The Founding"** (first stage of the deep pass on
#295; PR #346 squash-landed as d7f91af; static+smoke+Vercel green; prod confirmed:
entry `index-6x01j6vS.js` carries `/civilization-v`):
https://jalfern.com/retrogames/civilization-v

A new title (was `game-queue`; #316 PoP was retired to `shipped`, so #295 was the
claim). One self-contained lazy chunk (`src/games/CivilizationV/`):
- **Tilted 3D hex world** (three.js, instanced relief): ocean/coast/grass/plains/
  desert/hills/mountain with per-tile elevation + jitter, forest cones, river
  ribbons, animated water shimmer, fog-of-war per-instance dimming, owner-border
  tint, north-light shading. Orbit/pan/zoom camera + raycast pick. All geometry in
  code (no assets, no Math.random at render — hash2 jitter).
- **Pure sim** `sim.js` (Node-importable, deterministic mulberry32): odd-r hexes,
  one-unit/tile, BFS path, fog(explored/visible/fog), canFound(≥3 spacing),
  cityWorkedTiles + cityYield (inherent +2f/+2p/+1g centre), citizens eat 2,
  growth on stored-food surplus, spreadBorders, AI expansion, win=capital size4
  before turn40 / loss=turn limit.
- **Autopilot** `planner.js` = attract demo AND harness witness (`decide`/`plan`).
- **Shell** `index.jsx`: fixed-timestep loop (250ms cap), attract (paced so it's
  watchable — NOT auto-flipping to the over screen), E=settle, Space/Enter=end
  turn, arrows tilt/rotate, drag orbit, wheel zoom, synth SFX, DebugKit PROGNOSIS,
  DEV `__civTest`. VirtualControls A=End Turn, B=E(settle).

Gates: `civcheck` **42/42** (boot, determinism, sites, fog, one-unit, spacing,
founding, yields+growth, borders, winnable on 3 scenarios, forced loss, slack) +
mutant proof (centre food +2→0 → red on growth/win/slack, restore green).
`civplay` **14/14** zero page errors (real keys: settle E, end-turn Space, grow,
win, canvas never black). `lint:civ` clean; `build` green. `lint:mario/fps/ai` clean.
#295 stays OPEN (game not complete); moved to `next` for Stage 2. Filed QA #347.
Rule-4: not stalled (brand-new game code shipped).

## GOAL — next session
#295 Civ V on `next`. **Stage 2 candidates (in order):** (1) WAR — warrior combat
(Civ V melee: attack from a hex, defense from terrain/city, units die/heal, one
unit per tile enforced in battle), city defenses + barbarian camps roaming (the
issue names them). (2) TECH TREE — science spend unlocks (Pottery→writing etc.),
a real tech-tree UI panel; gate buildings/units behind tech. (3) BUILDINGS +
city screen (granary/walls/etc. from the production already banked). (4) the four
VICTORIES. Ship each as its own stage/PR. Keep sim pure + deterministic, keep the
harness witness = the autopilot, prove one mutant red each stage.
If Jon retires #295: it is the only game-queue item; ask before inventing a goal.

## Board (last read)
- #295 Civ V on `next` (Stage 1 shipped; deep pass continues — war next).
- #347 QA polish pass for Civ V (feedback) filed.
- #316 PoP `shipped`. No `game-queue` items remain besides #295.
- Rule-4: not stalled — CIVILIZATION V game code shipped this session.

## Notes for whoever picks this up
- **Sim spine (sim.js):** `CFG`, `T`, `CIVS`, `offsetToCube/hexDist/neighbors`,
  `newGame(seed,scenario)` (resets `unitSeq=1` — REQUIRED for determinism),
  `step(gs,input)` where input = `{select,move:[c,r],found,endTurn}`,
  `canFound(gs,civ,c,r,self)` (pass the settler as `self` or it reports
  'occupied' on its own tile — bit twice), `cityWorkedTiles/cityYield`,
  `findPath`, `reveal/clearVisible`, `stateHash`. Growth: `growBase+growStep*(size-1)`.
  Inherent centre `out.f+=2;out.p+=2;out.g+=1` is load-bearing (drop it → no growth).
- **Autopilot:** `decide(gs)` returns `{}` while any civ-0 unit has a non-empty
  `.path` (movement animates), else found/move/endTurn. `plan(scenario,seed)` runs
  to completion → `{ok,end,turns,capitalSize,hash}`. Scenarios 0,1,3 win by ~turn18.
- **Art (art.js):** `hexToWorld(c,r)` (flat-top, `SQ3*(c+0.5*(r&1))`, `1.5*r`),
  `createView(gs)` (sets `tl._h` height per tile; instanced hexes/cones/ribbons),
  `updateView(view,gs,{reach})` sets per-instance colour from fog/owner + lerps
  unit meshes toward logical tile. `disposeObj` exported.
- **Shell:** `__civTest` = {probe,start,hash,select,move,settle,endTurn,auto}.
  `auto(turns)` runs the autopilot in-page (bypasses render) — the win path for civplay.
  Attract steps `decide` every 5th tick and NEVER calls finish (guarded `play` only).
- **drive note:** headless Chrome needs IPv4 dev — `npx vite --host 127.0.0.1 --port <p>
  --strictPort`, poll, then `CIV_URL=http://127.0.0.1:<p>/retrogames/civilization-v
  npm run civplay`, all one shell call. canvas is WebGL → sample pixels with
  `readPixels` (2d ctx returns null); origin is bottom-left, so scan a grid for
  brightness (single centre can honestly land on sky).
- **CI flake:** the `smoke` job runs heistsmoke+missileplay etc.; it flaked red on
  `missileplay` ("sixth city falling"/over-screen) this session and on unrelated
  #345 — it PASSED on a plain rerun. `static` is the only merge gate (AGENTS #3);
  rerun `gh run rerun <id> --failed` to clear an advisory smoke flake before the
  rule-5 merge.
- Worktree `~/Dev/retrogames-forge-civilization-v` is free (detached at origin/main);
  node_modules symlinked from the main checkout. Re-detach main checkout at next start.

## Three questions for Jon
1. Stage 2 = WAR (Civ V melee + city defense + barbarians) — right call to lead
   with combat next, or do you want the TECH TREE + buildings first so units have
   a progression to unlock?
2. The map renders dim under software GL in headless CI (bright on a real GPU).
   Should I raise ambient/exposure so screenshots read punchier, or leave the
   moodier dusk palette?
3. #295 is huge — keep one stage per session (slow, steady, honest), or compress
   (war+tech in one bigger PR)? And is the tilted-3D hex look the direction you
   want, vs a crisper flat/isometric Civ?
