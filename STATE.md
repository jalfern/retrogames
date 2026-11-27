# STATE — forge board snapshot (slot a, 2026-11-27 — PINBALL rescue chase SHIPPED `9d35638`)

## This session (slot a) — shipped once
- **TARGET #3760 REFUSED at claim** (held live by b — b's mc-p2batt checkpoint 6 min
  old; b shipped it as #3765→`4dc509c` while I ran). Normal ladder: halt none; steer
  none; `next` #1712 is waiting-jon (research lane); game-queue empty; all feedback
  QA-held (#3761 building-qa, #3244/#2971 waiting-jon) → QA-borrow blocked (live QA
  mini+studio) → flagship null → NEVER-DRY (#1571).
- **Honest never-dry audit** (kick said `KICK PAC-MAN 0 weak`, tied at 1: Pacman/
  Frogger/Adventure/Rogue/Pinball). Excluded with evidence: Pacman's only gap is the
  drive-script harness job already filed #3755 (check-only ≠ gameplay, #1571);
  Frogger's bullet self-closes in its own prose (driver-horizon note — leave);
  **Adventure** "gate rite keeps no written manual" was STALE — the #1572 guidance
  tab teaches the rite (registry `guide:`, nine adventurecheck pins) → marked CLOSED
  by audit; **Rogue** lamp/oil unsourced (Wikipedia §Gameplay items list 2026-11-27;
  torches/oil are the Moria/Hack lineage) → marked **BLOCKED** (#3695 precedent).
  Both marks rode my PR.
- **Shipped #3766** (PR #3776, squash `9d35638`): **PINBALL — the rescue shows**.
  `gs.kbSweep` (18 ticks, decays with the flash, cleared by resetBall) + `gs.kbSweepL`
  ride the sim; the renderer chases a white head + fading tail + hot lane-bed up the
  SAVE'S OWN COLUMN (`gs.kbSweepL ? tb.kbL : tb.kb`) — one device-selected law, both
  saves, both cabinets (replaces #3468's left-only outlane-guide sweep; the right
  save flashed alone and nothing was gated). Grapple voice (clunk+snap+ring, #3468)
  kept and pinned static vs the ramp blip. Display-only: a sim pin proves `stateHash`
  never sees the signal.
- **Proof:** pinballcheck §8c +10 pins → 342/342; +6 named mutants
  (kbSweepR/L/Sticky/Squat/Side/Whoosh) → ALL 31 die; pinballplay live pixel leg
  (kbDrop('L') after the SET re-arm, white head/tail sampled mid-sweep) 2/2 runs;
  lint:mario/fps/ai + build green; adventurecheck 231/0, roguecheck 210/0 (the
  README marks touched grep'd prose). Filed `QA — PINBALL: polish pass after the
  rescue chase (#3776)` (#3800, feedback) owning lite-size legibility, grapple
  phone-mix, chase length (lit-hierarchy + re-dress already owned #3793/#3794).
- jonq: nothing ANSWERED/DEFAULTED to execute; asked nothing new.

## Harness facts paid this session (kept so lanes stop re-paying)
- **Red main #2176 while a PR waits:** the fix (#3772, roster-regex tolerating extra
  entry fields) merged after my fork — rebase onto it, then main-ok needs a NEW green
  nightly: `gh workflow run nightly.yml --ref main`. **nightly.yml concurrency
  CANCELS in-flight dispatches** — two lanes waiting on green main cancel each
  other; watch the NEWEST run id and stop re-dispatching (mine got cancelled twice).
- **`import` of nightlybot.mjs runs the whole bot** (no import guard) — diff rosters
  with regex over both sources, never by importing.
- **pinballcheck's mutant flag is `--mutate`** (not `--mutant`); `--mutate=<rule>`
  per rule; RULES must name every anchor or the walk under-counts.
- A sim signal set inside the physics phase is decayed by the SAME tick's tail —
  kbSweep reads 17 right after the fire step, not 18. Pin post-decay values.
- pinballplay §8b's proven left-save drop is (165, 556); canvas backing store is raw
  W×H so `getImageData` works in table coords directly.
- Jalfern prod verify: SPA rewrite answers `/retrogames/*` with index HTML, so
  grepping an asset URL can hit stub HTML ("index-*.js" = 15 bytes) — that is NOT
  staleness proof; Vercel check on the merge head + `git grep` on origin/main is.

## BOARD facts at close
- main `7627de7`: today merged #3765 (MC seat-2), #3772 (regex fix), #3776 (mine),
  #3787/#3795 (pinball DMD ring, ghosts), #3792 (DK fuse — parallel slot-a session),
  #3799 (EMBER INFERNO dress), docs #3764/#3797. building: none. building-qa:
  #3793, #3779. game-queue: empty. idle-kick `KICK DONKEY KONG -1 weak` (named-only;
  #3796 owns the flame gap — do NOT re-file). halt/steer: 0.
- Rule 4 satisfied: game code merged (#3776).

## PLAYABLE on main right now
- PINBALL — arm a kickback, drain fast: the chase climbs the save's column, grapple
  speaks — https://jalfern.com/retrogames/pinball
- DK bonus fuse (`e63faf2`) + walk-past 50; MC seat-2 Z/X/C batteries + bonus city;
  speed-graded ghosts (#3795); CENTIPEDE kill-pop; FROGGER duel-seat; ROGUE cart
  laws; TIDEPOOL field guide.

## Open questions (links only — #605)
- #3791, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. Dry by ownership: DK -1 weak is QA-named (#3796); Pinball's residuals are owned
   (#3793 lit-hierarchy live, #3800 filed fresh). Check QA is alive — else #3796
   (DK fireball kill) is the concrete borrow.
2. #3755 pacmandrive (lane:forge harness job) stays open and claimable but is
   check-only — take it only as a secondary, never as the session's ship.
3. Dry-shelf flagship question #3791 AWAITING Jon (deadline 2026-11-29) — the only
   dry-queue question; file no second.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh` at close; no other port touched.
- Worktree `~/Dev/retrogames-forge-pinball-kbsweep` pruned after #3776 merged
  (it was already gone — a parallel cleanup took it; entry pruned clean).
- STATE parked via `statepark.mjs park a`; shift report pushed. STATE commit to main
  rides the docs PR opened with this report (game merged this session); merge only
  via `scripts/forge-merge.sh`.
