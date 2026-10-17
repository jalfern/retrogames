# STATE — 2026-10-17 (forge session — CIV V polish #3 SHIPPED: spaceship parts)

## This session (#375 item 3, PRs #412 + #413, merged 4368dd6 + 926e682)
- Claimed #375 (only `game-queue`; no `next`). Fresh from main, clean; #398
  still held for Jon (no answer on it — do NOT attempt #4).
- **Spaceship parts**: the Science win now builds a named ship, not a budget.
  Beakers after Spaceflight weld **four parts in order — Cockpit 15, Booster
  20, Stasis 15, Launch 20** (= the proven 70 ledger). Overflow spills into
  the next weld; each closing weld fires `arkPart` (named); `arkLaunch` +
  Science victory only when all four are shut. Parts are a **pure derivation**
  of `gs.ark[civ]` via `arkPartsOf`/`arkPartsDone` (sim.js) — no parallel
  state, so hash/determinism/prior proofs byte-stable.
- UI: Y-panel SCIENCE card = four named part tracks (bar+✓, `n/4 welded`);
  HUD pill `ARK n/4`; weld callout "X WELDED · n/4 OF THE ARK" with rising
  sting; rival rows `ARK n/4`; end/help copy names the hull; DebugKit
  `PUSH THE ARK` reports the next weld; debug state carries
  `victory.parts/partsDone/rivalPartsDone`.
- Proof: **civcheck 512/512** (§36, +26 — ledger split 70, ordered spill,
  named welds, 3-plate hull holds on pad, launch⇒4 welded, clamps, rivals,
  replay determinism *inside the 40-turn horizon*). Mutant (`launch at
  arkPartsDone>=1`) reddened §36 **exactly** (1 check) → restored.
  **civplay 61/61** (§3h live parts check). lint:civ/mario/fps/ai + build green.
- CI green FIRST try on both PRs. Prod-verified: CivV lazy chunk
  `index-BHHc3LTk.js` contains Cockpit/Booster/Stasis/Launch/WELDED.
- **Lesson (repeat of the #398 near-miss pattern):** the 61st civplay check
  was authored but left uncommitted while #412 squash-merged — the PR shipped
  claiming 61 checks. Fixed by follow-up PR #413. Check `git status`
  `--porcelain` immediately before `gh pr create`, not just before push.
- #375 requeued `game-queue`, title bumped to item 4 (culture vs tourism).

## Still open / held
- **#398** (contract batch 2): HELD for Jon — 3-strikes Missile Battle smoke
  flake; branch `forge/contract-rollout-b2` intact (b2afe8a). If Jon says
  accept: from that branch `gh pr checks 398 --watch --fail-fast && gh pr
  merge --squash --delete-branch`, verify prod, relabel #391.
- **#391** keeps `building` (rollout umbrella): batch 3 must base on main
  AFTER #398 merges. Candidates: Lemmings, Sonar, Outpost, Polarity,
  Dogfight, SmashTV — omit snapshot/restore where sim state holds functions.
- Queue: #375 only.

## GOAL — next session
1. If Jon answers the #398 question: merge from branch (rerun failed smoke if
   he says accept) + verify prod + relabel #391's list. Else leave held.
2. Else #375 **item 4: culture vs tourism split** — separate tourism-per-turn
   from the culture ledger; the culture win gates on tourism LEAD like Civ V.
   Touches `cultureEarned` readers (victoryFor §33, panel, HUD ❦, DebugKit,
   civplay 3h probe needs a `tourism` field); new §37 + mutant, own PR.
   §33's culture ledger proofs must stay honest — decide loudly whether the
   win reads tourism-only or tourism AND lifetime; issue says tourism lead.

## Notes for whoever picks this up
- Main checkout detached at 926e682, clean. Build lane
  `~/Dev/retrogames-forge-civv-ark` re-detached at 926e682 (node_modules
  symlink to main — keep for item 4 context). Old worktrees
  `retrogames-forge-civv-{capitals,polish}` + `forge-civv-ark` clutter —
  prune when convenient (`git worktree remove --force`, then prune).
- gh merge leaves the lane worktree on local `main` (was at a stale 222438a
  here) — ALWAYS `git fetch && git checkout --detach origin/main` right after
  the merge command, and `git branch -D main` if a local main materialized.
- Prod-verify: jalfern.com 301s to **www.**; `curl -sL https://www.jalfern.com/retrogames/`
  → index hash → route `component:Rw=R.lazy(()=>…import("./index-<HASH>.js"))`
  → LC_ALL=C grep -a the chunk for string literals. CivV is its own chunk.
- Latent bug (not ours, still open): sim not deterministic past turn 40 (seed
  7 autopilot drifts at t59 with turnLimit:9999). §36 keeps its replay check
  inside the shipped clock. §37 must do the same.
- Never `git stash pop` in a lane worktree. CivV seeds 1/2/3/5 inland, 4
  coastal; seed 4 capital wins ~t12 so live loops accept `ended`.
- Dev server killed on :5173 this session — still check before reuse.

## Three questions for Jon
1. #398 attempt 4 still yours: accept the Missile Battle smoke flake
   (rerun+merge) or make `smoke` continue-on-error so advisory flakes can't
   wedge rule-5 merges?
2. The late-game determinism bug (past t40, masked by the shipped clock):
   file `feedback` for the QA lane, or won't-fix at the 40-turn ceiling?
3. #375 convention (3rd time): 1-of-6 item shipped, umbrella requeued with
   title bumped — still OK, or one issue per polish item now?
