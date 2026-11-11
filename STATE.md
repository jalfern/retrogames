# STATE — session 231 (2026-11-11, slot a)

## What shipped
**SMASH TV — HEAT-SEEKER + FLAMER** — merged as `8e981db` (PR #2037, Closes
#2032; NEVER-DRY pick: weakestStage SMASH TV score 6; PPM 9 not re-pickable
under the drain law. TARGET #1637 claimed 18:53Z then RELEASED with a comment —
slot b was verifiably live in `forge-watch-rollout-b29`, its PR #2034 was
mid-review; #1711 REFUSED at claim — slot b holds, Jon's #1730 R2-bucket Hold
applies).
The original ladder completes at six guns. HEAT-SEEKER (`homing`): one missile
per shot, locked on the nearest heat at launch, bounded turn MISSILE_TURN 0.16
rad/tick at constant speed, re-acquire on dead lock, fizzle at MISSILE_LIFE
150, warhead splash MISSILE_BLAST 10 px on kill (primary pays direct+splash
once — no double-dip). FLAMER (`flame`): three-pellet fan ±FLAME_FAN 0.17 rad,
outer pellets ×FLAME_SLOW 0.88, pierce 1, hard cap FLAME_LIFE 20 ticks ≈ 45 px
reach. Drops: bonus-room-only — homing room 4, flame room 7 — so the combat
ladder stays byte-identical and every proven route/pickup order survives.
Seat-law: the autopilot wraps every seat decision with a dropped-flame keep-out
(16 px, perpendicular slide; lives in the brain, never the sim — humans get
the gun free; a 45 px stream loses THE ANNOUNCER fan fights, seed 4 proved
it). Full presentation: silhouettes, muzzle/icon tints, fire+whoosh timbres,
missile/detonation/fizzle visuals, heavier seeker kick. Gates: smashcheck
PASS 683 (new specials section, 24 pins), all 25 mutants die (7 new incl. the
first planner mutant), 9/9 seeds win, seed 1 deathless, co-op 9/9, determinism
holds; lint gates + eslint + build green.
Follow-ups merged the same evening: `c1d9bad` (#2042 — smashplay reads the
missile where it is actually drawn; loop-time 3x3 was a software-Chrome flake
by construction) and `6487a73` (#2043 — renderer snaps the warhead to the
pixel grid, killing the anti-alias coin-flip at its source).
Prod proof: live chunk `index-BWWyQr0O.js` carries `HEAT-SEEKER`. #2032
shipped+closed (auto `shipped` label).

## The session's catches
- **Rebuild from files, not memory.** A context-recovery summary described a
  planner API (`intent.buttons`, a dodge block) that was never real — edits
  "succeeded" against phantom content. Ground truth = read the file, run the
  trace, then edit.
- **Auto-equip makes placement a planner question.** Pickup radius 10 px +
  civilian-hunting stray fire breaking crates = any special crate near a proven
  route equips itself (seed 4 took the flamer to the boss fan). Fixed honestly:
  bonus-room placement + ONE seat-law, not per-seed tuning.
- **Rigs sit in rooms.** A test rig at x=10 stood ON the open left exit: the
  tick it fired, the room advanced and wiped the bullet (`clear,advance,room`
  in the events). Park rigs clear of exit cells.
- **Splash double-dip.** The blast loop re-damaged its own primary (hp 9→6 not
  7): skip the directly-hit enemy; neighbours take the point.
- **A squash-merge can't see post-push edits.** The smashplay hardening was
  still uncommitted when `8e981db` squashed; it (and later the warhead snap)
  needed clean follow-up PRs re-based at current main. Commit EVERYTHING
  related before starting the merge loop.

## Ladder trail
TARGET #1637: claim → release (b live, PR #2034 fix round 1) → filed+built
#2032 (NEVER-DRY, weakestStage 6) → merged. game-queue after this session
holds #1637 (b-owned in flight); no `next`, no open builder feedback.

## Open questions
- none filed this session (#2016 lane:qa AWAITING belongs to QA).

## Notes for the next slot-a session
- `~/Dev/retrogames-forge-smash-guns` worktree is fully merged — remove it
  (`git worktree remove`) after `git fetch --prune`.
- Dev server for slot a (port 5173) was killed at exit.
- If #1637 is still b-owned and the queue is empty, rerun the weakest-stage
  board for the next NEVER-DRY pick — SMASH TV's score moved up tonight.
