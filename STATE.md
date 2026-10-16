# STATE — 2026-10-16 (forge session, CIVILIZATION V Stage 4 shipped — LAND)

## Shipped this session
**CIVILIZATION V — Stage 4 "Land"** (#355 deep pass; PR #357 squash-landed as
0c42fd0; static+smoke+Vercel green; prod confirmed: entry `index-i96h6A8F.js`,
CivV chunk `index-DFut9Ata.js` carries Legion/Chariot/pillage/WORK panel):
https://jalfern.com/retrogames/civilization-v

What landed on top of Stage 3 (pure sim + deterministic; autopilot = witness):
- **Workers:** civilian unit (cost 20, ungated); FARM (Pottery) +2/+1 food,
  MINE (Masonry) +1 prod (+1 more Engineering), ROAD (The Wheel); jobs take
  real turns (2/2/1), one per worker; abandoned if the worker dies/moves off.
- **Pillage:** barbarians strip improvements/roads/builds on every tile they
  march onto (`pillageAt` in barbarianTurn + march-in).
- **Resources:** 6 luxuries + Horses/IRON on fitting terrain (spread ≥3).
  Land-connection BFS from cities (`resourceNetwork`, owned-or-road tiles);
  unique connected luxuries pay +1g/+1c empire-wide; connected strategic
  feeds its holding city (+1f horses / +1p iron).
- **Resource-gated units (real Civ V):** CHARIOT (Wheel+Horses, str 9, rng 2,
  mv 3) and LEGION (Bronze+Iron, str 12) — canQueue/queueDeny enforce in the
  sim; refusals name the missing resource; AI ladder uses both when land+era
  allow. Strategic seams stay hidden until their tech (`resRevealed`).
- **Roads** halve movement cost for any unit (`roadCost` in animateUnits).
- **stateHash** now folds per-tile imp/road/build/res + per-civ connected mask
  + worker busy — §2 replay determinism preserved.
- **Witness:** economy-first research (Pottery→Wheel→arms), queues a worker,
  works the ring; wins scenarios 0/1/3 by t15–17 (was t18).
- **Shell/art:** WORKER cart/spade, CHARIOT, crested LEGION models; road
  ribbons joining hex-to-hex; furrowed farm patches; timbered mine; fogged
  glowing resource tokens; WORK panel (W, F/M/O, tappable); worker + luxury
  pills; land sounds (start/complete/pillage/luxury/strategic); DebugKit
  QUEUE WORKER + IMPROVE HERE + probe `workers/land`; hooks `__civTest.turn()`
  (one witness turn) and `.improve(k)`.

Gates: `civcheck` **185/185** (new §19 improvement gates incl. city-centre +
borders + busy; §20 build turns/yields/roads/pillage; §21 reveal/connect/pay;
§22 resource-gated units + end-to-end labour). Mutant: `connectedResources`
counts every tile ⇒ 179/185 red (§21+§22); restore green. Stage-3 queue-gate
mutant still reds §17. `civplay` **28/28**, zero page errors (Digit4 worker,
W panel, real F key, farms in real time). lint:civ/mario/fps/ai + build green.

## GOAL — next session
#355 Civ V back on `game-queue`, retitled **stages 5–8** (4 shipped). Stage 5
candidates (in order): (1) CULTURE & HAPPINESS — borders by culture, a few
social policies, happiness/unhappiness (luxuries currently pay gold as the
honest stand-in); (2) WONDERS + great people points; (3) city-states/diplomacy
(war/peace/trade) + naval units on coasts; (4) later eras + domination/
science/culture victories. Ship one stage per PR; keep sim pure + deterministic;
prove one mutant red per stage. If #355 paused by Jon, take `feedback` via
FORGE.md step 2 — QA lane is usually active (check `pgrep -f "QA MASTER"`);
fresh polish pass filed as **#358** (stage-4 look/juice/tooltips/sound mix).

## Board (last read)
- #355 Civ V `game-queue` (stages 5–8; stage 4 live).
- CivV polish backlog: #347, #350, #352, #358 (stage 4). No `next` items.
  Rule-4: not stalled — game code shipped this session.

## Notes for whoever picks this up
- **sim.js land spine:** `IMP`/`RES`/`IMP_IDS`/`RES_IDS` live after `BARB`
  (need `T`); tiles carry `res/imp/road/build`; `canImprove`/`startImprove`/
  `advanceBuilds` (runs in endPlayerTurn after barbarianTurn),
  `resourceNetwork`/`connectedResources`/`resRevealed`/`roadCost`/`queueDeny`;
  strategic bonuses applied in `cityYield`; luxury caravans + `resKnown`
  one-shot events in `resolveCiv`. WORKER `busy` = tile index; `KC` in
  stateHash extended (WORKER/CHARIOT/LEGION).
- **Don't break §2:** any new world state must fold into `stateHash` before
  shipping (land fold is the `L` accumulator + `rm` per-civ mask).
- **civplay timing lesson:** Space-spamming end-turn idles the capital and
  barbs take it (~t15); drive waits with `__civTest.turn()` (one defended
  witness turn) and do instant UI checks at turn 2 BEFORE long runs. Worker
  spawns on the capital centre (never workable) — move it off before F.
- **Drive note (unchanged):** `npx vite --host 127.0.0.1 --port <p>
  --strictPort`, poll, `CIV_URL=... npm run civplay` in ONE shell call; kill
  the port after. Prod check: game code lives in a lazy per-game chunk
  referenced inside the entry `index-*.js` — fetch the entry, collect
  `index-*.js` refs, grep the chunk (this session: index-DFut9Ata.js).
- Worktree `~/Dev/retrogames-forge-civilization-v` free (detached at
  origin/main); node_modules symlinked from the main checkout.

## Three questions for Jon
1. Stage 5 = culture + happiness + policies (my pick), or jump to wonders/
   great people first? (#355 lists culture as 5, wonders as 6.)
2. Connection rule today is owned-OR-road BFS (a resource on owned land counts
   without a road). Civ V is stricter: road connection required. Tighten it now
   (and rebuild civplay fixtures) or keep the friendlier rule?
3. Carried: prod verification greps minified shared `index-*.js` chunks
   (now a lazy CivV chunk inside the entry list). Still want stable per-game
   `manualChunks` names for grep-stable prod checks?
