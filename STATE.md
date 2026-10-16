# STATE — 2026-10-15 (forge session, CIVILIZATION V Stage 2 shipped — WAR)

## Shipped this session
**CIVILIZATION V — Stage 2 "War"** (deep pass on #295; PR #348 squash-landed as
39982ec; static+smoke+Vercel green; prod confirmed: entry `index-Cr3XCmif.js`,
CivV chunk `index-DqljDzRM.js` carries domination/camp-burn logic):
https://jalfern.com/retrogames/civilization-v

What landed on top of Stage 1 (all pure-sim, deterministic — the autopilot still
replays hash-for-hash):
- **Combat:** 100-HP units, str × health × modifiers (hills +25%, fortified
  +25%, city-tile +50%, river-crosser −10%); ≤4 strikes resolve a battle;
  melee killer marches in (one-unit-per-tile holds in battle); ARCHER (range 2,
  str 11) takes no retaliation. WARRIOR 8 / ARCHER 11 / SETTLER 0 / barb 7.
- **Barbarians:** civ id 4 (`BARB`), always at war; 3 world-gen camps (≥4 hex
  from seats, ≥6 apart) spawn roamers every 6 turns (global cap 7) that seek
  soft targets within 6; razing pays 12 gold; camps block move + settle.
- **Cities:** defence 10+3·size × wall integrity (hp 100); bombard weakest
  adjacent enemy each turn; capture at 0 walls (flip at half size, 60 walls);
  civ dead when last city falls; capital-fall is now a real loss path.
- **Victories:** DOMINATION (all rival civs destroyed) + Stage-1 size-4
  milestone; turn-40 loss unchanged.
- **Production:** player queue keys 1/2/3 (WARRIOR 15 / ARCHER 22 / SETTLER
  35) at first city; AI queues settlers + wartime army; buildP accrues in
  resolveCiv (moved out of aiTurn). Heal at rest: home 12 (+8 fortified) / 5.
- **AI war:** healthy rivals (power ≥5) declare on hash2 roll ≤0.34 from
  turn 12; attacking a civ unit/city IS a declaration; AI seeks targets (r7
  war / r3 peace).
- **Juice:** huts with ember flicker, HP bars (green/amber/red), arcing arrows,
  impact rings + sparks, camera shake, synth clash/raze/war/capture audio;
  hostile-hex tap-to-attack (works on phone).

Gates: `civcheck` **89/89** (§11–15 new: march-in, modifiers, ranged, camps,
capture/domination, production/healing; boot expects 5 civs now) + mutant proof
(march-in `!ranged`→`ranged` ⇒ 88/89 red, restore green). `civplay` **17/17**
zero page errors (camps at attract, Digit1 queue, trained warrior, win t18).
`lint:civ/mario/fps/ai` clean; `build` green. #295 back on `next`. QA polish
filed as #350 (stage-2 list; #347 covered stage 1). Rule-4: not stalled.

## GOAL — next session
#295 Civ V on `next`. **Stage 3 candidates (in order):** (1) TECH TREE —
science spend, real unlocks (Pottery→…→Currency…), tech-tree UI panel, gate
buildings/units behind tech (archers need Archery). (2) BUILDINGS + city
screen — granary/walls/market on the banked production, per-city build UI.
(3) then culture/policies and the other victories. Ship one stage per PR.
Keep sim pure + deterministic, autopilot = witness, prove one mutant red.

## Board (last read)
- #295 Civ V `next` (Stages 1–2 shipped; deep pass continues).
- #347 QA stage-1 polish (feedback), #350 QA stage-2 polish (feedback).
- No other `game-queue`/`next` items. Rule-4: not stalled — game code shipped.

## Notes for whoever picks this up
- **sim.js war spine:** `UNIT` table; `BARB=4` in `CIVS`; `gs.wars` keyed
  `"lo-hi"`; `atWar/declareWar`; `doAttack(gs,u,tc,tr)` handles unit/city/camp
  (pushes `strike` events with `from:[c,r]` for arrows); `defenseBonus`,
  `cityDefense`; `captureCity` halves size; `checkCivDeath`; `tileBlocked`
  (live camps) — **every mover must honour it** (orderMove, findPath,
  landFree, stepToward, reachSet in the shell, bestSiteNeighbor in planner).
  `spawnUnit(gs,civ,kind,c,r,{str})` exported. `stateHash` includes hp/camps/
  wars — **never hash u.id** (global unitSeq drifts across sequential replays;
  that burned determinism §2 once).
- **Turn order (endPlayerTurn):** fortify idle players → AI civs → barbarians →
  resolveCiv (yield/grow/produce/bombard) → turn++ → heal+reset moves → refog
  → checkEnd. `capitalOf[civ]` only set on first founding (fixed this stage).
- **Planner:** `decide` = found → strike (adjacent/range threats+camp) →
  march to objective (threat or camp within 4 of capital) → expand settlers →
  endTurn. Scenarios 0,1,3 still WIN at turn 18 — keep that if you retune war.
- **Shell:** `__civTest` adds `attack(c,r)`, `queue(k)`; probe exposes
  barbsVisible/campsAlive/wars/queue. Attract = `decide` every 5th tick.
- **Drive note (unchanged):** `npx vite --host 127.0.0.1 --port <p>
  --strictPort`, poll, `CIV_URL=... npm run civplay` in ONE shell call; kill
  the port after (`lsof -ti tcp:<p> | xargs kill -9`) — zombie vites on old
  ports served the WRONG checkout once this session (phantom "React is not
  defined"). canvas is WebGL → readPixels, scan a grid for brightness.
- Worktree `~/Dev/retrogames-forge-civilization-v` free (detached at
  origin/main); node_modules symlinked from the main checkout.

## Three questions for Jon
1. Stage 3 = TECH TREE first (then buildings), or buildings+city screen first?
   (Restating #347-era q1 — combat is in, so progression unlocks feel next.)
2. Barbarian pressure today is light (cap 7, spawn/6). Do you want a nastier
   frontier (cap 10, faster spawns, camps closer), or keep it friendly-to-
   phones with war mostly a rival-civ affair?
3. Prod entry hash moved (index-Cr3XCmif.js) and the CivV chunk is minified to
   a shared `index-*.js` name — if you want stable per-game chunk names for
   prod-verification grepping, I can add `manualChunks` for game engines.
