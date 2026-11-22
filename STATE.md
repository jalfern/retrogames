# STATE.md — The Forge (rewritten at close of slot b, 2026-11-22; committed to
# main because game code merged: R-TYPE desperation phase #2901 -> PR #2903 ->
# 06ef0ab. While this slot ran, slot a shipped the CONTRA arcade loop #2894 ->
# PR #2896 and opened #2905. Rule 4 keeps turning: #2887, #2893, #2896, #2903 —
# four game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/r-type — **the dreadnought panics** (#2901, this slot): 1000
  ticks of camera-lock on a beating Phase-1 core latches `p1.hot` — the maw
  cycle runs at double tick-rate until the heart dies (the S3 enrage shape,
  `mouthT -= 2`), announced by a rising wail + slam; ember flush, ±1 px hull
  shudder, maw horns an octave up. Zero new rng draws (winnability floor
  re-measured 4/12 unchanged — tempo, not bullet speed, per the Contra
  fairness law); hot rides `stateHash`; every rebuilt dread is cold with its
  own 1000 ticks (`hot-leaks` guards it). The autopilot kills the core at
  ~lock+980, so the panic is exactly what it should be: pressure for the
  struggling, invisible to the skilled. rtypecheck 138/138 (5 heat pins + 2
  browser legs), mutants 10/10 named (`panic-deaf`, `tempo-deaf`, `hot-leaks`
  new).
- /retrogames/contra — arcade stage loop live (#2894, slot a): stage 1
  rebuilds as LOOP n with tempo-only escalation; scores and lives carry.
- /retrogames/double-dragon — opening movie live (#2891, last slot).

## WHAT THIS SESSION DID (slot b)
- Warden target #2894 claim REFUSED (slot a, 28-min checkpoint). Ladder: no
  steer/next/game-queue; QA MASTER alive -> no feedback borrow; flagshipStage
  null; weakestStage null -> **but the dry was fake**: Jon's answered #2795
  ("both flagships starting with double dragon", 11-20) had never been
  executed — `idle.mjs FLAGSHIPS` still listed four games. Executed it:
  FLAGSHIPS = SSX, Emberwood, COMET DRIFT HD, Myst, DOUBLE DRAGON, R-TYPE
  (FORGE.md idle clause, docs/HARNESS.md, new jonqcheck order-pin all updated;
  R-TYPE README `Known gaps` -> parseable `Honest gaps` bullets, order kept).
  DD is QA-held (#2874/#2863), so R-TYPE's oldest unowned gap became the
  stage: filed POLISH #2901, claimed, shipped end-to-end (design note with
  fidelity interpretation -> sim -> art/audio -> 5 pins + 2 legs + 3 mutants
  -> gates -> merge -> prod verify). Filed QA polish pass #2906.
- At close `idle-kick` answers **KICK R-TYPE 0** — the shelf is not dry.

## OPEN
- #2905 building — slot a live (CONTRA sniper-perch drift + grenadier rifle).
- building-qa: #2899 (app-chrome over HUD), #2889 (DD guardian-read).
- Unowned feedback (QA lane's board): #2906 (R-TYPE desperation polish),
  #2902 (CONTRA loop presentation), #2897 (DD opening-movie polish).
- Next builder at idle-kick: R-TYPE gap 0 = **Stage 2 "Dobkeratops"** (the
  walking tank — big stage; scope it as its own multi-part issue if needed).
- Open question issues (link only): #2846 (flagship public promotion;
  default keep private, due 11-23). None filed this session (a dry-queue
  title question was already on the record this week — jonq refused, rightfully).

## NOTES for the next lane
- **Answered jonq questions are work items**: #2795 sat ANSWERED-and-closed for
  two days while two lanes derived "dry". Before asking anything new,
  `gh issue list --state all --search <topic>` and check whether a Jon answer
  is sitting unexecuted — executing one is never a question.
- Flagship-list changes need FOUR files together: `scripts/lib/idle.mjs`
  (FLAGSHIPS + FLAGSHIP_DIRS), `scripts/FORGE.md` idle clause (jonqcheck:392
  pins every name), `docs/HARNESS.md` map line, plus jonqcheck pins. The order
  itself is now pinned (`FLAGSHIPS.join('|') === 'SSX|...|R-TYPE'`).
- **Browser legs: `__game.step(pad, n)` is the contract API — not `tick`.**
  And any leg that calls `__game.reset` RESEEDS the world: put reset legs LAST
  in the block. A mid-flow reset wiped rtypecheck's deep state once this
  session (S3/S4 legs then failed: schedule still WAVES(1), fortress jumped).
- **Prod markers must survive tree-shaking**: DebugKit is DEV-only, so action
  labels (`HEAT CORE`) never reach prod chunks. Durable markers = sim event
  strings (`hotspeed`) and attract text. Entry-hash watching is a lie when the
  edge HTML is cached — crawl the chunk graph for the marker instead.
- rtypecheck fixtures: `__rTest.setup({ heat: n })` winds the desperation timer
  (0 = ignite next tick); probe reports `p1hot` (0/1/-1) + raw `heat` ticks.
  HEAT_AT exported from sim.js.
- Sim-transition trap: `stageClear` fires on the step AFTER `dyingT` hits 0 —
  step once before waiting on a `mode === 'clear'` loop.
- R-TYPE README Honest gaps after this PR (7 open): Dobkeratops, capsule list,
  Williams duelist, carrier interceptors, straight salvos + autopilot
  pre-dodge, wing shell initiative, dark-seat free life.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit).
- `~/Dev/retrogames-forge-rtype-core-heat` — reaped suggestion: branch gone on
  merge; `git worktree remove` when convenient.
- `~/Dev/retrogames-qa-mini-rollback` still holds local `main` — makes gh's
  post-merge re-checkout die on bookkeeping (merge itself is fine; re-detach
  manually). Whoever owns it, please purge.
- Ports: b's 5178 stopped at close (devstop.sh). QA nodes 5174/5176/5179 and
  slot a's server — leave them.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
