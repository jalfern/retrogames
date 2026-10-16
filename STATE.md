# STATE — 2026-10-15/16 (forge session, CIVILIZATION V Stage 3 shipped — TECH TREE)

## Shipped this session
**CIVILIZATION V — Stage 3 "The Tech Tree"** (deep pass on #295; PR #351
squash-landed as 5e9f77b; static+smoke+Vercel green; prod confirmed: entry
`index-Cd2OjJE3.js`, CivV chunk `index-C7hAuOMt.js` carries the tree):
https://jalfern.com/retrogames/civilization-v

What landed on top of Stage 2 (pure sim + deterministic; autopilot still
replays hash-for-hash):
- **Tree:** 12 real Civ V techs, 3 eras, real prereqs — Pottery/Agriculture/
  Archery/The Wheel/Bronze Working/Masonry → Writing→Philosophy, Currency,
  Horseback Riding, Engineering → Mathematics. Costs ascend by era (24–34 /
  70–100 / 150); science spent per turn; overflow carries.
- **Gating in the sim:** ARCHER needs Archery, CATAPULT needs Engineering;
  queueing a gated unit → `deny` + toast. `canQueue`/`setResearch`/`grantTech`
  exported; `step` honours `input.research`.
- **Effects:** Bronze +2 warrior str (living+new spawns); Horseback +1 military
  move (settlers unchanged); Pottery −2 growth food; Agriculture +1 grass food;
  Masonry +100 walls (`city.wallMax` — defence/bombard/capture all scale);
  Currency/Writing/Philosophy +2g/+1sci/+1cult per city; Mathematics +4 bombard.
- **Catapult unit:** str 7, range 2, ×2 vs cities, 3D model (frame/wheels/arm).
- **AI research:** `AI_TECH_ORDER` rotated by civ id → rivals diverge and the
  frontier hardens; barbarians timeless. Player witness researches
  arms-first (`RESEARCH_ORDER` in planner.js).
- **Shell:** RESEARCH panel (era columns, prereq labels, progress bar,
  tap-to-research), keys T panel / R next tech / C catapult, research HUD pill,
  discovery fanfare+toast, DebugKit PROGNOSIS + NEXT TECH, `__civTest.learn/
  research`, probe exposes `tech{known,research,prog,ai[]}`.

Gates: `civcheck` **132/132** (§16 tree data/acyclic/era costs, §17 spend +
gating + AI paths, §18 every effect bites incl. siege×2 and Math bombard).
Mutant proof: gate `if (need && !hasTech…)`→`if (false && …)` ⇒ 130/132 red,
restore green; stage-2 march-in mutant still reds §11. `civplay` **24/24**, zero
page errors (T/Escape/R live-key panel, refuse→unlock archer, fresh tech
completes in real time, rivals observed researching, win t17).
`lint:civ/mario/fps/ai` + `build` green. Scenarios 0/1/3 still WIN at t18.
Rule-4: not stalled. QA polish filed as #352.

## GOAL — next session
#295 Civ V (label `shipped`; deep pass continues). **Stage 4 candidates (in
order):** (1) BUILDINGS + city screen — Granary/Walls/Library/Market/Forge as
real queue items consuming banked production, per-city build UI, the "walls"
tech finally builds a wall model; (2) POLICIES/culture tree (Stage 5) then the
science + culture victories; (3) full-tree expansion (more units, roads via
The Wheel). Ship one stage per PR. Keep sim pure + deterministic; autopilot =
witness; prove one mutant red. If #295 is paused by Jon, there are NO
`next`/`game-queue` issues on the board — take a `feedback` item via FORGE.md
step 2 (QA lane first: check `pgrep -f "QA MASTER"`).

## Board (last read)
- #295 Civ V `shipped` (Stages 1–3 live; next: buildings + city screen).
- CivV polish backlog: #347 (stage 1 look), #350 (stage 2 war), #352 (stage 3
  tech tree). No `next`/`game-queue` items. Rule-4: not stalled — game code shipped.

## Notes for whoever picks this up
- **sim.js tech spine:** `TECH`/`TECH_IDS`/`ERAS`; `gs.tech[civ] = {known,
  research, prog}`; `hasTech/availableTechs/setResearch/canQueue/grantTech`;
  `applyLearn` mutates live units/cities on learn; `city.wallMax` replaces
  `CFG.cityHp` in city scaling (found/capture/doAttack/resolveCiv bombard);
  `UNIT[kind].tech` marks gated units — **every** queue path (player step,
  aiTurn, harness) must consult `canQueue`. `stateHash` includes per-civ known-
  mask + research idx + floor(prog) — never drop those bits or §17/§2 drift.
- **Turn order unchanged** (endPlayerTurn): aiTurn sets research *before*
  resolveCiv spends science; resolveCiv auto-picks cheapest available if
  research is null (keeps AI labs lit; the player's UI pill reflects it).
- **Shell:** `__civTest.learn(id)` cheat + `research(id)`; panel refreshes at
  200ms while open (`actRef.current.togglePanel/pickResearch` — handlers live
  in the effect, JSX reaches them via `actRef`).
- **Drive note (unchanged):** `npx vite --host 127.0.0.1 --port <p>
  --strictPort`, poll, `CIV_URL=... npm run civplay` in ONE shell call; kill
  the port after. Prod check must use **www.jalfern.com** (bare host 308s, and
  asset 404s look like "not deployed").
- Worktree `~/Dev/retrogames-forge-civilization-v` free (detached at
  origin/main); node_modules symlinked from the main checkout.

## Three questions for Jon
1. Stage 4 = BUILDINGS + city screen (my pick above), or would you rather the
   next pass deepen the tree first (full ~70-tech grid + more units)?
   (Carried over from the Stage-2 report — still unanswered.)
2. Barbarian pressure (carried over): today cap 7 / spawn 6 / seek 6. Keep the
   friendly-to-phones frontier, or crank it now that Bronze/Horseback make war
   two-way?
3. Prod verification greps minified shared `index-*.js` chunks (this session:
   index-C7hAuOMt.js). Want stable per-game `manualChunks` names so prod checks
   are grep-stable, or keep vendor-shared chunks?
