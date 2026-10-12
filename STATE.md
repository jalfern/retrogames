# STATE — 2026-10-12 (forge session END, ~13:30 PDT)

## SHIPPED: SPY HUNTER (#169 → PR #174 → squash 80a9f4b — LIVE in production)
jalfern.com/retrogames/spy-hunter — verified live in real Chrome (real keys,
oil spin in the browser, gunboat, zero errors, DEV hooks absent). The 1984
highway at 256x224: two hand-scripted stages, overheat cannon, river
gunboat that only missiles can reach, oil spins, Sweeper shoves, crate-
dropping Supporter, 2000-point bonus crossing. All art+audio runtime;
attract = the autopilot's own proven run, live.

Gates (static CI): `huntercheck --mutate` 51 checks + 6/6 mutants die. Its
spine: the stage scripts are projected as DATA before anyone drives them
(oil never seals 3 lanes, nothing spawns off-road, every scripted car
reaches the row); the score ledger is recomputed from booked events; the
road cannon provably cannot touch the river. SLACK: campaign re-wins at
missile-tax 1, 2, ZERO missiles, lives-1, and lives-2+tax-1. `hunterplay`
19/19 in smoke: real keys only — pixels land at the sim's coordinates
before/after a real steer.

## Playable now
Full arcade incl. Spy Hunter, Wizardry, Lode Runner palette, Paperboy,
Minesweeper, Raccoon Heist, Galaga, Dogfight, IronKeep, Mario, Zork+AI.

## Session report (rule 7)
**Playable now:** Spy Hunter, live on the site, phone-playable (tap pad with
MSL button).
**What changed:** +5 game files (sim/script/planner are the harness's own
modules), huntercheck + hunterplay, `lint:hunter` + huntercheck --mutate in
the static gate, hunterplay in smoke. Mid-session the planner got rewritten:
hand-drawn threat rings lost twice (lane-tie oscillation run over standing
still; a bomb through a lane-change's transit) — it now rolls the REAL sim
1.3 s per candidate lane, and that is also why the attract demo is honest.
One rebase conflict (main grew the builtby gate #173 mid-ship): resolved,
builtBy added, re-verified.

## Lessons this session (already baked into the code comments)
- The harness found a REAL bug the run hides: the boat had no `type` field,
  so its kills booked `kind:undefined` — the campaign made boat kills while
  every consumer said it hadn't.
- Two mutants survived first probes; both were probes reading the EVENT
  instead of the BEHAVIOR (spin event fires even with spin=0; a dead gun
  still sputters one shot). Probes now grade duration and burst.
- A test that floods player invulnerability cannot see oil spin — immune
  car, "dead road". Immunity is a lever to set deliberately per probe.

## Queue / next session
1. **The queue is EMPTY** (no `game-queue`, no `next`, no unlabeled
   `GAME —` issues). Per FORGE step 2: nothing to forge — next session
   should say so and exit, unless Jon files more or re-opens one.
2. The law: only `static` blocks merges; one merge command; 3 non-game PRs
   in a row ⇒ stop and report. (This session shipped game code — counter 0.)

## Open questions for Jon
1. Spy Hunter was scoped to two stages per the issue. Arcade-authentic
   next step would be looping stage 1-2 faster; a third stage is a
   bigger script. Which do you want queued?
2. The D-pad shows dead up/down buttons on driving games. Add a
   `padMode="drive"` to VirtualControls (shared component, every title
   sees the change) or leave it?
3. The /forge board fed issue #169 into the queue and the loop shipped it
   in one session. Any other requests the board should be submitting?
