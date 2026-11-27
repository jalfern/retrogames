# STATE — forge board snapshot (slot a, 2026-11-27 — DK walk-past 50 SHIPPED `fca8127`)

## This session (slot a) — shipped twice
- **TARGET #3753 REFUSED at claim** — held by b (live, pid 34 min at kick,
  `forge/mc-bonus-city` pushed with game+harness). Normal ladder: halt none;
  steer none; `next` #1712 skipped (`waiting-jon`+`lane:research`+`big-build`);
  game-queue empty; feedback held (#3749 `building-qa`, #3244/#2971
  `waiting-jon`); QA-borrow blocked (live QA mini) → flagship stage null →
  NEVER-DRY rung (#1571).
- **Honest ladder audit:** `idle-kick` answered `KICK PAC-MAN 0 weak`, but
  PAC-MAN's only gap was its live-drive advisory — harness, not gameplay.
  Filed `pacmandrive` as its own job **#3755** (`lane:forge`) with the
  mis-citation fixed, and took the oldest title with a real rule gap: DK.
- **Shipped #3672** (PR #3756, squash `36e73b3`): parseGaps declines leading
  `~~` struck-through bullets — shipped work can no longer score as weakness.
  +2 jonqcheck pins, +2 lanecheck weakestStage pins; proof = mutating the
  filter reddens exactly those 3. Verified stale-marks merged with it: Frogger
  audio CLOSED #3714, Pong `**DISCLAIMER:**`→canonical, Asteroids #391 note
  marked DISCLAIMER (AGENTS-blessed omission), Pinball #3336-item-2 marked
  DISCLAIMER (#3335 DEFAULTED keep-level-only), Pac-Man #737 misref corrected.
- **Shipped #3754** (PR #3759, squash `fca8127`): **DONKEY KONG walk-past 50** —
  the arcade obstacle bonus's missing half (§Scoring: jump 100 / walk past 50;
  the 100 existed). Grounded, alive, barrel crossing below the feet (dy band
  −48..−10, clear of the kill box) pays +50 once per barrel; `passedBarrels`
  witness rides `stateHash` + watch serialize; lower 50-blip beside the jump's
  100-blip; no dice. kongcheck §obstacle-bonus 6 pins + 4 named mutants
  (all 41 mutants die); kongdrive 15/15 with a deterministic `walkpast()` DEV
  rig (paid=1, delta=50, witnesses=1). README: walk-past clause CLOSED;
  oil-drum flame + timer-zero stay honest open.
- jonq: nothing ANSWERED/DEFAULTED to execute (#3335 already consumed by QA
  lane); asked nothing new — no taste/priority call needed.

## Harness facts paid this session (kept so lanes stop re-paying)
- **kongcheck's mutant flag is `--mutant`** (singular). `--mutate` is silently
  ignored and the run reads as green-with-no-walk. Check the gate's own argv
  word before trusting a "mutants passed" line.
- mutateguard #2047 works: `--mutant` refuses a dirty tree — commit first, then
  walk; `.mutant-running` gone when the walk exits clean.
- Canvas dy is **player.cy − barrel.cy**: a barrel BELOW the feet is NEGATIVE
  dy (a `dy>=10` band for "below" fires on nothing). Girder spacings 24/32/40
  → lower-track crossings sit at dy ≈ −27…−43; band −48..−10 spans them all.
- A walk-past completed before the killer lands is a LEGITIMATE 50 — the
  dead-pay-nothing proof needs an instant-kill rig (killer already in the
  kill box) with the floor barrel timed to cross only during the death anim.
- kongdrive's #3618 ladder-hang check is seed-luck (random seed per load;
  observed flap on identical code). New live proof rides the deterministic
  `walkpast()` DEV hook, not board luck — same lesson as slot b's stamp hook.

## BOARD facts at close
- main GREEN at fca8127 (static; #3756 36e73b3 also merged this session). building: #3753? (b, live — MC bonus-city,
  2 commits pushed). building-qa: #3749, #3648. game-queue: empty.
  `next`: #1712 (waiting-jon). halt: 0. Filed: #3755 (pacmandrive,
  lane:forge), #3761 (`feedback`, QA's job: hammer re-price vs
  arcade 300/800 claims, score popups, flame/timer, art rung).
- Rule 4 satisfied: game code merged (#3759 + #3756 data marks).

## PLAYABLE on main right now
- DONKEY KONG — every barrel you clear pays: leap 100, walk past 50:
  https://jalfern.com/retrogames/donkeykong
- CENTIPEDE kill-pop garden (#3736), MC fairness trail/shimmer/attract ad
  (#3739), ASTEROIDS kiting bounty (#3717/#3737), FROGGER duel-seat (#3721),
  ROGUE cart laws (#3710/#3715), TIDEPOOL field guide (#3752).

## Open questions (links only — #605)
- #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. #3755 pacmandrive — small, well-specified harness job (lane:forge).
2. Never-dry after this session's closes: `weakestStage` names PAC-MAN only
   while #3755 stays open (then via the drive gap again — take gameplay
   anyway: DK fireballs/electric-floor + timer-zero capture is the next true
   rung); Pinball's #3446-residue bullet still lists live sub-items; Frogger's
   remaining bullet is the driver-horizon note (not closable, not buildable —
   leave it).
3. QA: #3749 + the new DK polish issue; MC #3753 belongs to b.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh` at close.
- Worktrees `~/Dev/retrogames-forge-phantom-filter` PRUNED (#3756 merged);
  `~/Dev/retrogames-forge-dk-walkpast` pruned after #3759 merged.
- STATE parked via `statepark.mjs park a`; shift report pushed.
