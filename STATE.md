# STATE.md — The Forge (rewritten at slot a close, 2026-11-22; COMMITTED: game
# code merged this session — R-TYPE the duelist, PR #2936 → 57f8b7d.)

## PLAYABLE (main)
- /retrogames/r-type — THE DUELIST is live (#2934 → PR #2936 → 57f8b7d):
  the shelf's first REACTIVE enemy, in the spirit of Defender (Williams 1981).
  Authored entries (leg 1 ×2 y 76/158, leg 2 ×1 y 122 — zero rng, seed-blind).
  Hunt: tracks the NEARER hull across lanes at 1.15 px/tick on a ~110-px
  stand-off; gun: aimed round every 110 with a 24-tick eye-glow telegraph;
  commit: at t=260 crouch 40 (hull shudder) then ONE straight pass at 1.75 —
  never curves, the grinder takes what misses. Soft: vulcan ×2 / shell ram /
  thrown orb / four-bit orbit fold it (300 pod-money); body kills at contact;
  armour law untouched. rtypecheck 216/216 (15 new laws) + 22 named mutants
  red-and-named (new: pursuit-deaf, commit-deaf). Floors: solo 8/12 (≥4 —
  pre-duel was 7), co-op 11/12 (≥6). Prod verified (duelfire in
  index-DBHF5OQO.js).
- /retrogames/r-type — pad THROW (#2931), link-pad face labels (#2929), Options
  launch/pods, Half-Capsule, SSE loops all on the shelf (private until Jon
  promotes — #379).
- /retrogames/contra — hangar sorties + fixed-spot pods; /retrogames/double-
  dragon — opening movie + seat greet (#2863 → QA).

## WHAT THIS SESSION DID (slot a)
- Ladder empty (steer/next/game-queue none; only feedback #2889 QA-held; live
  QA sessions → no borrow). idle.mjs answered honestly: flagshipStage AND
  weakestStage both pick R-TYPE (score 5; DoubleDragon skipped, building-qa).
  Filed POLISH #2934 (game-queue + lane:games), claimed via forge-claim.sh,
  built in forge/rtype-duelist, gated, merged rule-5, prod-verified, shipped.
- Winnability lesson (README records both numbers): first duel-strafe override
  traded slab commitments for jinks → solo 2/12. Guard: strafe only when no
  slab/hunter-commitment is live → solo 8/12. Autopilot+wing score windup and
  dash lanes; hunt scores distant on purpose (no jitter).
- Filed QA polish pass #2938 (armor-overlap read, distinct round, phone-scale
  eye, dash trail, leg-3 duel candidate, dodge reward, wing cover-fire).

## OPEN
- building-qa: #2889 (DD guardian-read) with QA; #2938 (duelist polish) is
  fresh feedback — QA's pick, not ours.
- game-queue: empty; R-Type README honest gaps stay unowned: carrier
  interceptors, Phase-2 salvo pre-dodge, wing auto-shell, dark-seat life.
  The shelf is not dry — idle-kick will answer R-TYPE 0 again (score now 4).

## NOTES for the next lane
- DUEL numbers (sim.js export): close .9 back .7 range 110 track 1.15 fireCd
  110 warn 24 hp 2 score 300 commitAt 260 windup 40 dash 1.75. States:
  enter > hunt > windup > dash; removal at camX−24 and dash past W+30; y
  clamped inside the rails; fire gated on !frozen + on-screen.
- Mutant anchors this stage: `e.y += clamp(tp.y - e.y, -DUEL.track,
  DUEL.track) // it answers the stick — just slower` (pursuit-deaf) and
  `if (e.t >= DUEL.commitAt) { e.state = 'windup'; e.stateT = DUEL.windup;
  gs.events.push('duelwind') }` (commit-deaf) — both unique strings.
- Browser-law flake (this box, 3 runs, 3 different laws): press+short-wait
  laws under software-Chrome rAF throttle (#2906 ember, #2925 N-throw).
  New kill law drives contract `__game.step({a:true},30)` — immune; prefer
  contract steps over wall-clock waits in new laws.
- Prod-verify recipe: entry html → /retrogames/assets/index-*.js; sibling
  lazy chunks appear as `index-<8hash>.js` references INSIDE the entry
  (NOT `assets/…` prefixed) — enumerate those and grep bodies (duelfire).
- Fixture: `__rTest.setup({ spawnDuelist: {y,x,state,t,cd} })`; probe
  `duel/duelState/duelCd`; DebugKit SPAWN DUELIST; contract state `duel`.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main, this STATE.md committed
  on top (game merged → allowed) and pushed.
- ~/Dev/retrogames-forge-rtype-duelist: worktree done; prune with
  `git worktree remove --force ~/Dev/retrogames-forge-rtype-duelist`.
- Port 5173 stopped with scripts/devstop.sh at close. Other lanes' ports
  untouched all session.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON to public? (default keep
  private, due 11-23 — Jon; the duelist lands in R-Type either way.)
- #2908/#2930 (QA lane) — DD idle-seat laws (not ours, linked for the board).
- No new question filed this session — dry-shelf jonq stays unlockable ~11-27
  (7-day rule after #2795); the board had work anyway.
