# STATE — 2026-10-17 (forge session — CIV V polish #2 SHIPPED: capital capture ≠ extinction)

## This session (#375 item 2, PR #408, merged c35d0a4)
- Claimed #375 (only `game-queue`; no `next`). Resumed fresh from main — no
  corpse (origin/main == HEAD, clean); #398 left held for Jon (do NOT attempt #4).
- **Capital capture ≠ extinction**: when a major civ's CAPITAL falls to another
  major, `collapseRealm` (sim.js) folds the defeated realm into the victor — the
  prize city sheds its banner, remaining cities/garrisons/borders flip to the
  captor, wars/pacts dissolve — and the civ is `alive=false` + `vassal=<captor>`
  via a new `civFall` event (NOT the every-city-lost `civDead`). Majors-only
  guard (`civ<BARB && old<BARB && old!==0`): barbs still raze-without-vassalizing,
  a non-capital fall changes nothing for the reign, Rome keeps exactly one capital.
- UI: `civFall` callout+sting; victory-panel rival rows show "vassal of X";
  domination blurb now honest ("take a capital and that realm submits"). The HUD
  pill X/3 capitals IS the domination score now.
- Proof: **civcheck 486/486** (new §35, +17) — capital fall vassalizes a civ with
  a living army (capture≠body-count), ends by `civFall` never `civDead`, Rome
  keeps one capital, three falls trip DOMINATION w/ pill=3, conquest replays
  hash-for-hash. Mutant (`fellCapital=false`) reds EXACTLY §35 (7 checks) → restored.
  §14 post-capture war assertion updated to allow vassalization settling the front.
  **civplay 60/60**, eslint + lint:mario/fps/ai/civ + build green.
- CI green FIRST try (static+smoke+Vercel; the Missile Battle flake did not repeat).
- #375 requeued `game-queue`, title bumped to item 3 (spaceship parts).

## Still open / held
- **#398** (contract batch 2): still HELD for Jon — 3-strikes on Missile Battle
  smoke flake. Branch `forge/contract-rollout-b2` intact (b2afe8a). If Jon says
  accept: from that branch `gh pr checks 398 --watch --fail-fast && gh pr merge
  --squash --delete-branch`, verify prod, relabel #391.
- **#391** (keep `building`): batch 3 must base on main AFTER #398 merges
  (contractcheck conflict otherwise). Candidates: Lemmings, Sonar, Outpost,
  Polarity, Dogfight, SmashTV — check each for function-bearing state; omit
  snapshot/restore where the sim holds functions (#391).
- No `next`-labeled issues. Queue: #375 only.

## GOAL — next session
1. If Jon answers the #398 question: merge from branch (rerun failed smoke if he
   says accept) + verify prod + relabel #391 list. Else leave #398 held.
2. Else work #375 **item 3: spaceship parts** — the Science win builds 4 named
   Ark parts (Cockpit, Booster, Stasis, Cockpit→launch — issue says the 4th is
   launch-ready) instead of one anonymous 70-beaker pool; Ark panel shows the four.
   New civcheck section (§36) + mutant, own PR. Update README + victory panel.

## Notes for whoever picks this up
- Main checkout detached at c35d0a4, clean. New lane worktree
  `~/Dev/retrogames-forge-civv-capitals` re-detached at c35d0a4 (node_modules
  symlinked to main — keep for item 3 context). Old `retrogames-forge-civv-polish`
  worktree still around; prune when convenient.
- **Prod-verify (lighter-weight, no attack-mode):** CivV is its OWN lazy chunk, NOT
  the main index (STATE's old note was wrong). Find it from the prod index:
  `curl -L .../retrogames/` → the route `{path:"/civilization-v",...component:RW}` →
  `RW=R.lazy(()=>...import("./index-<HASH>.js"))` → grep THAT chunk for a string
  literal (e.g. `VASSALIZED`). One fetch, no polling. Strings survive minify;
  minified function names do not. Use `LC_ALL=C grep -a` (minified bytes trip grep).
- **Latent bug FOUND (not ours):** sim/planner is NOT deterministic past the 40-turn
  clock — seed 7 autopilot with `turnLimit:9999` diverges hash-for-hash at turn 59
  (reproducible on origin/main; masked because shipped `turnLimit:40`). §35 keeps its
  determinism check inside the horizon. Worth a feedback issue? Left for Jon below.
- Never `git stash pop` in a lane worktree (stash@{0} is whichever lane parked it).
- CivV seeds 1/2/3/5 inland, 4 coastal; seed 4 capital wins ~t12 (size 4) so
  live-turn loops accept `ended`.
- Dev server may linger on :5173 — killed this session; still check before reuse.

## Three questions for Jon
1. #398 attempt 4 still yours: accept the Missile Battle smoke flake (rerun+merge)
   or mark `smoke` continue-on-error so advisory flakes can't wedge rule-5 merges?
2. Found a real late-game determinism bug (past turn 40, masked by the shipped
   clock — see notes). File a `feedback` issue for the QA lane, or park it as
   won't-fix since 40 turns is the design ceiling?
3. #375 convention (repeated): shipping 1-of-6 polish items and requeuing the
   umbrella `game-queue` with the title bumped to the next item — still OK, or
   want one issue per polish item now?
