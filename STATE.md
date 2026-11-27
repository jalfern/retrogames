# STATE — forge board snapshot (slot b, 2026-11-27 — MC P2 batteries SHIPPED `4dc509c`; red main fixed `da3457a`)

## This session (slot b) — shipped + red-main repair (landed by twin)
- **Resumed a corpse (step 1b), not a claim:** #3760 `building` with pushed
  `forge/mc-p2batt` @ 3a58dbb and open PR #3765 — the previous slot-b session
  died 7 min into its 53-mutant walk. The walk process SURVIVED its session
  (pid watchable); attached a background waiter to it instead of re-running.
- **Shipped #3760** (PR #3765, squash `4dc509c`): **MC hot-seat P2 battery
  buttons** — arcade three-button law (Wikipedia §Gameplay) reaches seat 2:
  Z/X/C name LEFT/CENTER/RIGHT on P2's wave, edge latch beside p2Fire, duty
  swallow off-wave, seat-aware HUD teach (Z/X/C labels + join card line),
  registry updated. Walk verified green after resume: **53/53 mutants die,
  236 passed**. Prod-verified (bundle `index-BSXjF196.js` carries the
  join-card string); closed with live URL. Rule 4 satisfied: game code merged.
- **Red main (#3773, filed here):** nightly 46034576636 failed nightlychecks
  — dvhcheck 5/7 (5 demos size canvas 100vh with no dvh sibling; demos are
  nightly-only gates, fireflymeadow #3655 + lanternriver #3681 landed after
  the last nightly) + nightlybotcheck 50/51 (roster-vs-contractGames regex
  closes its brace at `path`, blind to optional spec keys → asteroids vanished
  from the parsed roster since #3586's `syncPixel` — false drift). My twin PR
  #3774 (fix + proofs) went green on static; the **parallel lane landed the
  identical fix first as #3772 `da3457a`** — mine closed unmerged as
  duplicate, #3773 closed completed. Verified at head `76158df`:
  dvhcheck 7/7, nightlybotcheck 51/51. Freeze clears when refresh
  46050066256 (at da3457a, running since 10:31) completes — it's the
  latest-completed rule, so green ≈ 11:49 unblocks all lanes; tonight's
  scheduled nightly covers the day's later merges and passes my local gates.

## Harness facts paid this session (kept so lanes stop re-paying)
- **Never `import` nightlybot.mjs** — importing RUNS the full bot (main() at
  module scope); cost ~5 min of a suite replay. Diff rosters statically.
- **`nightly` concurrency group is global** — parallel lanes' main-refreshes
  CANCEL any branch-dispatched nightly. A cancelled-at-ref proof is external,
  not evidence against your fix; re-prove via the gates themselves locally
  (deterministic Node checks — full reproduction) instead of racing the group.
- **The freeze bites only when the red run COMPLETES.** #3765 merged 09:49:54
  — 90 s before nightly 46034576636 (created 08:33, 1 h 18 m) completed and
  turned main red. Not a violation: main-ok reads latest-COMPLETED. Long
  nightlies leave an hours-wide window where merges land pre-red.
- **contractGames.mjs entries carry optional spec keys** (syncPixel, #3586):
  any regex parsing them must allow `[^}]*` before the brace, else rosters go
  blind to real games.
- Fresh worktrees hold no node_modules — `npm ci` before any script needing
  playwright-core/eslint deps, else checks exit with misleading module errors.
- forge-merge refuses detached HEAD and (correctly) red main with no
  built-in exception: a red-main REPAIR is the rule-5a exception by mandate
  (2 h deadline) — today the twin lane landed `da3457a` inside it; both lanes
  reached the same fix independently, which is the design working.

## BOARD facts at close
- main `76158df`: today merged #3765 (MC P2), #3772 (red-main), #3771
  (bonsai demo), #3780/#3782 (orrery guidance), #3781 (pacmandrive #3755),
  #3783 (slot a STATE; pinball sweep `9d35638`). building: none. building-qa:
  #3778 (pinball DMD race), #3744 (demo fireflies). game-queue: empty.
  next #1712 (waiting-jon). halt/steer: 0. jonq: nothing ANSWERED/DEFAULTED.
- idle-kick at close: `KICK DONKEY KONG 0 weak` (PAC-MAN cleared by #3781).

## PLAYABLE on main right now
- MISSILE COMMAND — seat 2 names its batteries: press 2 at the title, Z/X/C
  fire LEFT/CENTER/RIGHT on your wave: https://jalfern.com/retrogames/missilecommand
- DONKEY KONG walk-past 50 (#3759), PAC-MAN human-loop drive (#3781),
  PINBALL rescue sweep (#3783 note), CENTIPEDE kill-pop (#3750), orrery
  attract (#3782), TIDEPOOL guide (#3752).

## Open questions (links only — #605)
- #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. Never-dry names **DONKEY KONG** (`KICK DONKEY KONG 0 weak`): honest gaps
   left by #3759 — oil-drum/electric-floor fireball rules + timer-zero
   capture (see src/games/DonkeyKong/README.md). File POLISH, claim, ship.
2. QA lane owns #3778 (pinballplay DMD poll race) and #3744 (fireflies demo).
3. Pinball #3446-residue and Frogger driver-horizon notes stay as-is (slot a
   adjudicated both non-buildable).

## Slot state at handoff
- :5178 stopped via `scripts/devstop.sh` at close; never touched other ports.
- Worktrees pruned: `retrogames-forge-mc-p2batt` (#3765 merged),
  `retrogames-forge-red-main-dvh-roster` (#3774 dup-closed, remote deleted).
- STATE parked via `statepark.mjs park b`; shift report pushed.
- STATE commit to main intentionally SKIPPED: freeze was still latched at my
  close (latest completed nightly = 16:33 red; refresh green lands ~11:49).
  Whoever opens the next docs PR folds this report in.
