# STATE — 2026-10-15 (forge session, PoP Stage 4: sound & feel shipped)

## Shipped this session
**PoP deep pass — Stage 4: sound & feel** (#316, branch `forge/pop-stage4`,
PR squash-landed as #325): https://jalfern.com/retrogames/prince-of-persia
- **Silence-first like 1989**: attract screen and death are silent; the hour
  rides a bed. `music.js` (new, pure) decides the bed — `trackFor(state)` →
  `pop` (dungeon) / `popThrone` (palace) / `popJaffar` (vizier in your room) /
  null (attract, dying, win, lost).
- **Three original Hijaz-mode tracks** (D Eb F# G A Bb C#) in AudioController;
  engine grew a `perc` lane (1=dum 2=tek darbuka). Tempo ladder pop > throne > Jaffar.
- **`SFX` contract**: one synth recipe per sim event; popcheck pins the table
  against sim.js BOTH ways — an event without a voice fails the gate. All 31
  events voiced (5 flasks flavoured apart; parry ring; mirror sweep; merge fold).
- **sim (audio-only events, physics untouched)**: `foot` (stride accumulator,
  42px/footfall, run/soft flags), `land` thud, `chain` while gates travel
  (direction-aware, first-tick click). Shell adds deterministic torch-crackle
  ambience (denser per room torch count) + playDeath/playFanfare stings;
  music stops on pause/unmount. Fixed probe `vy` bug.
- Gates: `popcheck` **191/191** (25 Stage-4 clauses; champion run still 12
  levels 0 deaths). Mutant proof: drop `parry` from SFX → 2 failures; restored.
  `lint:pop`+3 scoped lints+build green. `popplay` **17/17** (new: attract
  silence peak 0 → live bed over it, twelve levels × right bed, win drops bed).
- Filed **QA polish pass #326** (mix ducking, room-flip cue, footstep variety,
  chomper whir telegraph, clock-pressure tempo riser, per-cause death stings).

## GOAL — next session
**#316 Stage 5 — guards escort you through doors** (the issue box's remaining
signature: in the original guards follow you between rooms; ours patrol their
own). Requires `syncRoom`/`stepGuards` engagement carry-over + level audit of
champion run. If #316 is gone/retired by Jon, oldest `game-queue` is #295
Civ V — STILL do NOT build without Jon (7 sessions).
#326 (PoP polish) is the QA lane's; forge only takes it if the queue is empty.

## Board (last read)
- Labels on #316: `shipped` (+ `game-queue` still attached). Re-label `next`
  if Stage 5 is a go; retire the issue if Jon says the deep pass is done.
- Queue: #295 Civ V only. QA: new #326, plus open #312 (absorbed by #316?),
  #310 SSX, #304 MYST, #302 Gauntlet/FourHalls, #298 Tempest, #287
  LunarLander, #283 OutRun, #280 SmashTV, #275 Gauntlet, #270 SimCity,
  #269/#220 Kart, #265 Marble, #263/#258 Bubble Bobble.

## Notes for whoever picks this up
- Sound spine: `music.js` (`trackFor`, `SFX`, `TRACKS`) + AudioController
  (`MUSIC` now exported; `_perc` in `_schedule`; `setMusicStep` exists —
  #326 item 5 wants the clock to tighten the bed via it).
- Any NEW sim event must also get an `SFX` voice or popcheck goes red — that is
  by design; add both sides together.
- Sim spine files now: sim.js, levels.js, planner.js, **music.js** (all
  Math.random-free, pinned).
- Autopilot tuning is data-sensitive: any levels.js edit → re-run
  `node scripts/popcheck.mjs` (champion clause) before pushing.
- Worktree `~/Dev/retrogames-forge-pop-stage4` done (detached); stage worktrees
  pop-deep/stage2/stage3 can be pruned.
- Rule-4 watch: last 3 merged PRs all touched `src/games/**` — not stalled.

## Three questions for Jon
1. #295 Civ V has sat alone in `game-queue` seven sessions. Retire it, or name
   a cabinet-scope 4X you'd accept?
2. Is Stage 4 the end of #316's deep pass (rules+look+levels+sound all in)?
   If so I'll close it and let #326 carry the remaining feel work. If not,
   Stage 5 = door-escorting guards — OK to claim?
3. OK to close #312 as done-by-#316 so the QA board stops counting it?
