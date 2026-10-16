# STATE — 2026-10-16 (forge session, CIVILIZATION V Stage 5 shipped — CULTURE & HAPPINESS)

## Shipped this session
**CIVILIZATION V — Stage 5 "Culture & Happiness"** (#355; PR #360 squash-landed
as 3009944; static+smoke+Vercel green; prod confirmed: CivV chunk
`index-DslZEyo2.js` carries the six policy names + borderGrow):
https://jalfern.com/retrogames/civilization-v

What landed on top of Stage 4 (pure sim + deterministic; autopilot = witness):
- **Culture borders:** city banks culture per turn; ring 2 @ 40, ring 3 @ 120;
  unowned-first claiming (rival tiles never annexed); `borderGrow` events;
  court baseline `out.cult += 1` in cityYield.
- **Happiness ledger** `happinessOf(gs,civ)`: palace +2, unique connected
  luxury +1, city −1, war −2 weariness. Happy (net≥1): +25% growth on surplus,
  +10% gold. Unhappy (net<0): no growth, cityDef ×0.75. Mood flips emit
  `happy` events (C.happyState/happyNet).
- **Policies:** POLICY table — Tradition (FOUNDATIONS +3 cult/city @15,
  CEREMONY +1 happy/luxury @40), Liberty (COLONIAL settlers 35→10 @15,
  COLLEGE +1 sci/city @40), Commerce (TRADING_POSTS +1 gold/city @15,
  TREATIES weariness halved @40). `canAdopt/adoptPolicy/hasPolicy/unitCost`;
  branch order + pool enforced in sim, refusals name reason; AI civs adopt
  deterministic lines (1 Commerce, 2 Liberty, 3 Tradition). `input.policy` in
  step(); witness policy line in planner; fixed a pre-existing double-add of
  C.culture in resolveCiv.
- **Shell:** happiness face pill in HUD; POLICY panel (P, violet, branches,
  pool, AI law counts, refusal lines); adoption/growth/mood cues + toasts;
  DebugKit happiness line + ADOPT POLICY/+200 CULTURE cheats; probe adds
  `happy/policies/culturePool/owned`; hooks `__civTest.policy(id)`.
- **stateHash** now folds city.culture, per-civ policy mask + culture pool
  (§2 replay determinism preserved).

Gates: `civcheck` **236/236** (new §23 border thresholds + first-come; §24
ledger math, mood bonuses via CFG.cityUnhappy/happyGold isolation, mood
events; §25 cost/order/effects, step() refusals, AI law, hash fold).
Mutants: spreadBorders rad-clamp ⇒ §23×5 red; canAdopt order-check deletion ⇒
§25 red; restore green. `civplay` **33/33**, zero page errors. lint:civ/
mario/fps/ai + build green.

## GOAL — next session
#355 is back on `game-queue`, retitled **stages 6–8** (5 shipped). Stage 6
candidates per issue body: **WONDERS + great-people points** (a handful of real
wonders; GP points generate per city, a great person is spendable — engineer =
hasty production, scientist = instant tech, merchant = trade gold). Keep sim
pure + deterministic, fold new state into stateHash, prove one mutant red, ship
one stage per PR. QA lane: fresh stage-5 polish pass filed as **#362** (border
FX, adoption ceremony, happiness faces, tooltips, sound mix); older CivV polish
backlog #347/#350/#352/#358, #220 building-qa.

## Board (last read)
- #355 Civ V `game-queue` (stages 6–8; stage 5 live).
- No `next` items. Rule-4 satisfied — game code shipped this session.

## Notes for whoever picks this up
- **sim.js Stage-5 spine:** CFG.border2/3 + palaceHappy/cityUnhappy/warWeariness/
  happyGrowth/happyGold/angryDef; POLICY/POLICY_IDS/BRANCHES after RES_IDS;
  hasPolicy/happinessOf/unitCost/canAdopt/adoptPolicy after queueDeny; policy
  modifiers inside cityYield; growth/gold/mood in resolveCiv (hs computed once);
  spreadBorders thresholds + city.border; AI policy block in aiTurn; KC mask +
  L fold unchanged — new folds are ct.culture, pm, civ culture pool.
- **Timeline shift:** happy growth makes the witness win at **t12** (was 15–17);
  §22 labour proof runs on scenario 3 now. civplay instant UI checks live in §3b
  (turn ~2) — the game can be OVER before turn 14, any late browser check needs
  `|| p.end` fallback or move it early.
- **Civplay lesson:** jalfern.com 308-redirects without trailing slash — curl
  prod greps need `-L`; entry lists lazy chunks as bare `index-*.js` refs —
  fetch `https://jalfern.com/retrogames/assets/<chunk>` with -L.
- **Mutant discipline:** commit + push BEFORE mutation testing (a `git checkout`
  mid-session wiped uncommitted balance tweaks this session and had to be
  re-applied by hand).
- Worktree `~/Dev/retrogames-forge-civilization-v` now detached at origin/main
  (3009944); node_modules symlinked from the main checkout.

## Three questions for Jon
1. Stage 6 = wonders + great people (my pick, follows the issue order) — or is
   the 12-tech tree too thin for wonders? I'd gate wonders on era-2 techs and
   add ~6 more techs to bridge (Engineering→Renaissance runway).
2. Happiness is one empire-wide face here (per-city faces is the real rule).
   Keep the single ledger for stages 6–8 simplicity, or make faces per-city
   now? (Per-city changes growth math ~everywhere.)
3. Carried: still want stable per-game `manualChunks` names for grep-stable
   prod checks? (Prod CivV chunk this session: index-DslZEyo2.js.)
