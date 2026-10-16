# STATE — 2026-10-16 (forge session, CIVILIZATION V Stage 6 shipped — WONDERS & GREAT PEOPLE)

## Shipped this session
**CIVILIZATION V — Stage 6 "Wonders & Great People"** (#355; PR #363 squash-landed
as 64eeea4; static+smoke+Vercel green; prod confirmed: CivV chunk
`index-jPMcKPdk.js` carries the six wonder names + gp ledger):
https://jalfern.com/retrogames/civilization-v

- **Wonders:** six real wonders (Pyramids/Stonehenge/Hanging Gardens/Great
  Library/Colossus/Great Wall) queued in the city production line behind real
  techs; first builder takes it forever, losing copies torn from rival queues
  (spent shields carry). Effects: worker job −1 turn · +2 culture/city ·
  +1 food/worked farm · +2 sci/city · +1 gold/luxury · +50% cityDef.
- **Great people:** engineer/scientist/merchant points bank per city every turn
  (palace +1 engineer, connected luxury +1 merchant); recruit at threshold
  (10+6/legend) for escalating gold (30+25); spend once — engineer completes a
  city's current build, scientist completes current research, merchant +200g.
  Refusals name reasons (`canRecruit/canUseGP/canBuildWonder` = one law for
  panel/harness/AI).
- **Shell:** U·WONDERS race panel (progress bars, owner lockout, AI counts),
  G·LEGENDS panel (point bars, RECRUIT/EXPULSE), 🏛/✨ HUD pill, toasts +
  synthesized motifs, six procedural 3D landmarks over builder capitals,
  DebugKit lines + 5 cheats, hooks `__civTest.recruit/useGP`, probes
  `wonders/gp`. Fixed a latent HUD crash (`UNIT[q].cost` with a wonder
  queue-head).
- **Sim spine:** WONDER/WONDER_IDS/GP/GP_TYPES after POLICY; hasWonder/
  canBuildWonder/gpThreshold/gpCost/gpReady/canRecruit/recruitGP/canUseGP/
  spendGP after adoptPolicy; `pumpCityQueue` extracted (race + abandon events);
  resolveCiv GP points + Colossus gold + gpReady events; aiTurn wonder line +
  recruit/spend; planner: spend(save engineer for wonders, scientist for >half
  research left)→recruit→queue first unlocked. stateHash folds wonders +
  per-civ pts/held.

Gates: `civcheck` **305/305** (§26 table/gates/race/effects/AI race, §27
points/recruit/escalation/spend×3/zero-gold/hash, §28 live races + slack +
determinism). Mutants: race-check neutered ⇒ §26×4 red; gold-gate deleted ⇒
§27×2 red; restore green. `civplay` **41/41**, zero page errors (U/G checks run
at turn ~2 — the game can be OVER by t12, keep late browser checks behind
`|| p.end`). lint:civ/mario/fps/ai + build green.

## GOAL — next session
#355 is back on `game-queue`, covers **stages 7–8** (5+6 shipped). Stage 7 per
issue body: **city-states + simple diplomacy (war/peace/trade) + naval units on
coast**. Keep sim pure + deterministic, fold new state into stateHash, prove one
mutant red, ship one stage per PR. QA lane: stage-6 polish pass filed as
**#364** (landmark FX, camera nudge, panel juice, rival progress lines, motif
mix); older CivV polish backlog #347/#350/#352/#358, #220 building-qa.

## Board (last read)
- #355 Civ V `game-queue` (stages 7–8; stages 5–6 live).
- No `next` items. Rule-4 satisfied — game code shipped this session.

## Notes for whoever picks this up
- **sim.js Stage-6 spine:** CFG gp* + wonder-effect constants after angryDef;
  WONDER/GP tables after BRANCHES; wonder/GP API block after adoptPolicy;
  `pumpCityQueue(gs,city)` sits just above resolveCiv (handles wonder delivery,
  race-loss removal, unit delivery); GP-point block lives after the luxury
  caravan block in resolveCiv.
- **Pace lesson:** this game ends at t12 (size-4 milestone + happy growth).
  Wonder/GP costs must fit that clock (wonders 18–65 shields, GP 30 gold) or
  the witness never sees the feature — tune costs against the t12 witness, not
  Civ V numbers. Costs were rebalanced twice this session for that reason.
- **Harness pattern:** isolate an effect delta by delete/restore of
  `gs.wonders.X` around `cityYield` (size growth poisons before/after diffs);
  suspend the milestone with `CFG.capitalSizeToWin = 99` (§9 pattern) when a
  section needs many live turns.
- **Lint:** `useGP` trips react-hooks/rules-of-hooks in sim context — the
  action is `spendGP`; the input key stays `useGP`.
- Prod check: jalfern.com entry references lazy chunks as bare
  `index-*.js` inside the entry JS (`__vite__mapDeps`), not all with an
  `assets/` prefix — grep bare names with `-L`; CivV chunk now
  index-jPMcKPdk.js.
- Worktree `~/Dev/retrogames-forge-civilization-v` detached at origin/main
  (64eeea4); node_modules symlinked from the main checkout.

## Three questions for Jon
1. Stage 7 = city-states + diplomacy + naval (issue order). Naval on a 40-turn
   map with no harbors yet: OK to gate ships at Coast tiles adjacent to your
   border (no port buildings until stage 8)?
2. Carried: happiness stays one empire-wide face; per-city faces still deferred
   — fine through stage 8, or pull forward when culture victory lands?
3. Carried: still want stable per-game `manualChunks` names for grep-stable
   prod checks? (This session's CivV prod chunk: index-jPMcKPdk.js.)
