# STATE — forge board snapshot (slot a, 2026-11-26 — DONKEY KONG rivet finale SHIPPED `293cfd0`; QA pass #3615 filed)

## This session (slot a)
- TARGET #3592 (ROGUE Amulet) REFUSED at claim — slot b held it live (checkpoint
  38 min old). Normal ladder: steer/next/game-queue empty (#1712 waiting-jon,
  skip per #605); feedback-borrow blocked (live QA MASTER sessions) → flagship
  stage spent → never-dry `idle-kick`. First pick (INVADERS drop gap) went stale
  mid-selection: QA merged #3594 marking that row-scaled-drop gap **BLOCKED**
  ("UNVERIFIED in-repo, don't guess") — my own recollection WAS the forbidden
  guess, so filed + closed #3596 `not planned` with the full trail. Re-kicked →
  **KICK DONKEY KONG 0 weak** (score 4 = 4 unowned README gaps + 0 named
  feedback; registry-order tie-break vs CENTIPEDE/MISSILE COMMAND).
- Filed + claimed **#3598** → **SHIPPED PR #3609 (`293cfd0`): the rivet finale.**
  Reaching Pauline's girder arms the finale; walk onto 1 of 4 rivets → 30-tick
  pull freeze, +100, dark hole; last rivet → girders 5/6 tilt-fall, DK drops
  160 px, barrels clear, runner steps down (never crushed); 150 ticks later the
  lap banks +1000 and the board rebuilds. Shell: tilt/fall, rivet sprites,
  DK/Pauline drops, pull wobble, 4 new synth cues. `resetPlayer` rebuilds the
  finale (death resets the screen). Arcade's dedicated 25 m rivet screen stays
  an honest README gap (UNVERIFIED tables).
- Proof: sim finale rides the tick hash — 24/24 seeds win, zero deaths, minWin
  818, replays byte-identical. Kongcheck **99/0** (+9 gates, lap test rebuilt)
  and `--mutant` **128/0, 28/28 dead**. New `npm run kongdrive`: real Chrome
  **11/11** (keys, seat pulls all four + banks the lap, crash repaints pixels,
  death→restart). Note learned: restart goes straight into play (`makeRun`
  default attract:false), not attract — drive pins that honestly.
- Seat/WATCH lesson (#3598): the rollout must score `ev.collapse` at 1e11 —
  above the `maxP*900` shaping (~250M) — or the seat stalls after 2 pulls;
  greedy() needs a rivet branch gated to the top platform.
- QA handed **#3615** (finale polish: pull-freeze feel, crush-readability on
  phones, rivet pixel alignment, score-table sourcing, cue levels).

## BOARD facts at close
- main GREEN at `da24c65` (QA's #3614 landed after my merge; nightly quiet since
  `293cfd0`). building: **#3604** (CENTIPEDE menagerie — someone else's).
  game-queue: empty of claimables. New feedback this shift: #3615 (kong finale).
- Rule-4 satisfied: game code merged as #3609.

## PLAYABLE on main right now
- DONKEY KONG — climb, pull the four rivets, watch the girders drop out from
  under DK, bank the lap: https://jalfern.com/retrogames/donkeykong
- ROGUE — Amulet win (slot b) + per-kind trap weights (QA #3614). PONG phone
  tap-start. INVADERS machine-step. ASTEROIDS learning saucers.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, Nov 27).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3244 — (AWAITING, Nov 27). #2971 — contra polish. #1712 — PLAICRAFT S2.
- No new jonq questions this session (all calls were measured law/harness).

## Next claims (for whoever is free)
1. #3604 is being built; #3615 is feedback — QA lane's first grab unless idle.
2. Honest `idle-kick` next; if it names shipped history, mark CLOSED per the
   README-phantom rule, don't build.
3. DONKEY KONG remaining honest gaps: oil-drum flame kill, barrel-over-ladder
   falls, broken-ladder partial climb (smallest first: barrels-mid-air).

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-invaders-drop DONE (PR #3609 merged; branch
  gone; safe to prune — name is stale from the abandoned INVADERS pick).
- Main checkout detached at origin/main; STATE.md ships via this docs PR and
  parks with `statepark.mjs park a`.
