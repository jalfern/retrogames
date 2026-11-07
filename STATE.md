# STATE — session 174 (2026-11-07, slot a)

## What shipped
**CIVILIZATION V: VASSALS KNEEL — PR #1781 squash-merged as `5bdabcc` (Closes #1777).**
Never-dry pick (#1571): steer/next/game-queue empty, QA lanes (studio+mini) live so the
feedback borrow was blocked, flagshipStage null; weakestStage returned MAGIC CARPET 7 but
it yields (open QA pass #1764 restates all five of its README gaps — owns-when-unsure),
TALK ME DOWN 7 held by live #1711; score-5 tie → registry-oldest CIVILIZATION V,
gap #0 "Vassals are annexed, not puppets". Filed POLISH #1777 with why-weakest line,
claimed, shipped in-session.
- **The mechanic:** original-capital fall (majors, not Rome) → realm KNEELS instead of
  folding: keeps surviving cities/garrisons/banners as an AI puppet (`civ.vassal`,
  `alive` stays true; `collapseRealm` deleted), palace RELOCATES to largest surviving
  city (`relocatePalace`), forced peace, whole-purse **tribute** each turn (halts at war
  again), puppet **never starts a war** (`canDeclareWar` refuses at the one gate all
  tables share), puppet cities **never queue SETTLER**, overlord death **unbinds**
  vassals. Single-city realms extinguish honestly (`civDead`); barbs raze-without-
  kneel; relocated seats annex-and-move-on (kneel once, at the first capital).
- **The pill stays honest:** HUD pill AND `victoryFor` domination now count ORIGINAL
  capitals (`gs.origCapOf`, `city.orig`) — a relocated palace can't hide a fallen seat;
  §33 witness timings unchanged (science/culture lines still land in window).
- **Gates:** civcheck **547/547** (was 533; §35 rewritten: kneel block, extinction
  block, pill-on-originals ×3, determinism, hash folds for vassal+orig). Mutants
  re-proved on-branch: kneel-off → exactly 7 red (extinction/pill correctly stay
  green); tribute-line → exactly 2 red; restored green. lint:mario/fps/ai 0, build
  green. Local civplay = #1622 degraded-Chrome (chromeboot→shell+sp kills newPage at
  civplay.mjs:390, 30+ DOM gates pass, 2 pixel gates fail; evidence on #1777, CI
  Chrome carries the browser proof as advisory).
- Prod verified: entry `index-Cmw3v_3k.js`, CivV chunk `index-kh5hvW94.js` carries
  `origCapOf` + `VASSAL of` (content sweep of entry chunk list — session-172 lesson).
- QA polish pass filed: **#1783** (sell the kneel: pennants, tribute motes, ghost-stars,
  motifs, attract kneel beat).

## Warden-target note
#1637 held by live slot b (claimed 03:54Z, branch `forge/watch-rollout-b9` pushed
18 min before claim check); #1711 hardware-blocked on #1730. Honest ladder path taken.

## Next queued
- Slot-a ladder at session start: expect steer/next empty; #1637 + #1711 likely still
  slot-b-held — check `gh issue list --label building` + comment liveness before claim.
- Never-dry when dry: re-run weakestStage fresh (pass {games,qaIssues,heldDirs} from
  registry+READMEs+live board — the lib is pure; the /tmp/forge slot-a-weak.mjs driver
  from session 173 still works). Known score-5 tier after this session: HOMEBODY,
  BRITANNIA, FLOOR BOSS (+COMET DRIFT GP whose "gaps" are stale changelog text + one
  closed-#431 referent — README-prune candidate, NOT game work; same for GravelYard's
  2 changelog bullets). CivV gaps remaining: naval supply, per-city Ark yards, BNW
  tourism, the big feature wall — all #1783-adjacent polish territory for QA.
- PLAICRAFT S3 relay rows stay gated on #1730 (AWAITING, deadline 11-08; default hold).

## Open questions
- #1730 (waiting-jon, lane:games) — R2 bucket + relay deploy; default hold.

## Slot hygiene
- Dev server: slot-a's `npm run dev -- --port 5173 --strictPort` LEFT RUNNING (mine;
  kill before restarting: `lsof -ti :5173 | xargs kill`). Vite binds IPv6-only here —
  browser scripts need `CIV_URL=http://localhost:5173/...`, NOT 127.0.0.1.
- Worktree `~/Dev/retrogames-forge-civv-vassals` (node_modules symlinked) sits detached
  at `5bdabcc`; remote branch deleted at merge.
- Lessons kept: (1) capture `v.civ` BEFORE the storm helper flips the city — reading it
  after gives you civ 0 (Rome) and your whole scenario asserts vacuously or crashes on
  `origCapOf[0]`; (2) MBP Chrome on this box is currently hard-degraded (SCDynamicStore
  ipc flood, chromeboot fallback, newPage death) — Node gates + CI Chrome are the proof
  there, don't burn the session on it; (3) domination law change that survives timing:
  judge the ORIGINAL capital (irrevocable) so mid-game state churn can't un-crown.
