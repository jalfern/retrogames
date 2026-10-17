# STATE — 2026-10-17 (forge session — CIV V polish #4 SHIPPED: culture vs tourism)

## This session (#375 item 4, PR #414, merged e8d9c5a)
- Claimed #375 (only `game-queue`; no `next`). Fresh from main; #398 still
  HELD for Jon (no answer found on it — did NOT attempt).
- **Culture vs tourism split**: the CULTURE win follows the crowd now. Every
  civ keeps THREE ledgers — pool (`culture`, buys policies), record
  (`cultureEarned`, lifetime, shown but inert for crowning) and the new
  **visitor book `tourism`**: `ceil(cult/2) + 3/wonder + 1/luxury` per turn,
  never spent. Crown = tourism ≥ `CFG.tourismWin` (120) AND strictly ahead of
  every LIVING rival's tourism. Decision (loud, in design comment + README):
  the win reads **tourism only**; the original weighs attractiveness vs rival
  culture at World Congresses, the issue said "tourism lead", issue wins.
- Tourism is REAL state (not derivation like #3's ark parts): it enters
  newGame, resolveCiv, `turnEnd.tour` events and `stateHash`.
- UI: HUD pill `☼ n%`; Y-panel named **TOURISM** track (bar + LEADING + ❦
  record line); rival rows `☼ n`; attract/end/help/registry copy reworded;
  DebugKit `+200 TOURISM` cheat; probe carries
  `tourism/needTourism/tourismLead/rivalTourism` (replaces `culturedLead`).
- Proof: **civcheck 533/533** (§37 +21: income law incl. forced luxury
  seam + Stonehenge, never-spent ×3 ledgers, monotonic, bar+strict lead incl.
  frozen-rival TIE-stays-uncoroned, rival law, hash, seed-7 replay inside the
  40-turn clock). Mutant (drop strict-lead clause) reddened §33+§37 exactly
  (2 checks) → restored. **civplay 61/61**. lint:civ/mario/fps/ai + build, CI
  green FIRST try. Prod-verified: CivV chunk `index-D6favlGT.js` has
  TOURISM/☼/travellers-cross; main chunk carries the new registry copy.
- §33 was rewritten, not just extended: every prior `cultureWin = 1e9`
  isolation (§9 clock, §35 domination, §36 hull, science race) now ALSO sets
  `tourismWin` — else the live tourist crown upstages those races at ~t22 and
  the suite self-sabotages. This is the mandatory pattern for any new crown.
- Calibrated tourismWin=120 on plan(): culture line wins t21–22 seeds 1/2/3,
  Aztec within ~10 tourists — race stays close.
- #375 requeued `game-queue`, title bumped to item 5 (mobile perf).

## Still open / held
- **#398** (contract batch 2): HELD for Jon — 3-strikes Missile Battle smoke
  flake; branch `forge/contract-rollout-b2` intact (b2afe8a). If Jon says
  accept: from that branch `gh pr checks 398 --watch --fail-fast && gh pr
  merge --squash --delete-branch`, verify prod, relabel #391.
- **#391** keeps `building`+`stalled` (rollout umbrella): batch 3 bases on main
  AFTER #398 merges. Candidates: Lemmings, Sonar, Outpost, Polarity,
  Dogfight, SmashTV — omit snapshot/restore where sim holds functions.
- Queue: #375 (item 5 mobile perf, then item 6 Galleon seed check).

## GOAL — next session
1. If Jon answers the #398 question: merge from branch (rerun failed smoke if
   accept) + verify prod + relabel #391. Else leave held.
2. Else #375 **item 5: mobile perf pass** — 40-turn late game (musket lines +
   6 wonders + galleons) under `?lite=1` on throttled Chrome; budget the
   frame. Read the frame-floor lesson in AGENTS first (`__gameTime`, not
   setTimeout; `npm run heistclock -- --throttle ...` is the diagnostic
   pattern — a CivV analogue may be needed, keep it small, rule 6).
3. Tourism note for whoever does polish: rival tourism AI is the same
   economy loop — if item 5's late-game scenes show rivals' ☼ saturating,
   check `resolveCiv` luxury double-dip (culture AND tourism both count lux).

## Notes for whoever picks this up
- Main checkout detached at e8d9c5a, clean. Lane worktree
  `~/Dev/retrogames-forge-civv-tourism` now detached at origin/main (node_modules
  symlink to main — keep for item 5 context). Many stale `retrogames-forge-*`
  + `retrogames-qa-*` worktrees listed by `git worktree list` — prune when
  convenient (`git worktree remove --force`, then `git worktree prune`).
- `gh pr checks --watch` hung >10 min silently on #414 while `static` was
  pending (~11 min runtime). Poll
  `gh pr checks <n> --json name,state --jq '.[]|select(.name=="static")|.state'`
  (this gh build has NO `conclusion` field) until SUCCESS, THEN run the
  rule-5 chain — it exits instantly when everything is green.
- Prod-verify: jalfern.com 301s to **www.**; index hash changed only after
  deploy; find lazy chunk by scanning referenced `index-*.js` for
  `Cockpit`+`Stasis`, then `LC_ALL=C grep -a` literals (probe field names get
  minified; UI strings don't).
- Latent bug (not ours): sim not deterministic past turn 40 (seed 7 autopilot
  drifts t59 with turnLimit:9999). §36/§37 keep replay checks inside the
  shipped clock. Item 5 must do the same.
- CivV seeds 1/2/3/5 inland, 4 coastal; seed 4 capital wins ~t12; live loops
  accept `ended`. Never `git stash pop` in a lane worktree.
- Dev server started on :5173 this session and killed at the end — still check
  before reuse.

## Three questions for Jon
1. #398 attempt 4 still yours: accept the Missile Battle smoke flake
   (rerun+merge) or make `smoke` continue-on-error so advisory flakes can't
   wedge rule-5 merges?
2. Late-game determinism bug (past t40, masked by the shipped clock): file
   `feedback` for the QA lane, or won't-fix at the 40-turn ceiling?
3. #375 convention (4th time): item shipped, umbrella requeued with title
   bumped — still OK, or one issue per polish item now?
