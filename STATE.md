# STATE — forge board snapshot (slot b, 2026-11-27 — bonus city #3753 SHIPPED `35a0c55`)

## This session (slot b) — never-dry rung: MISSILE COMMAND bonus city
- Ladder empty end-to-end: no halt/steer; `next` #1712 is waiting-jon; game-queue
  empty; all 3 open feedback items QA-held (#3749 building-qa) or waiting-jon
  (#3244/#2971); a live QA MASTER session owns the borrow; flagshipStage null.
  `idle-kick.mjs` → `KICK MISSILE COMMAND 0 weak` (score 4 = four unowned README
  gaps, zero QA feedback). Filed POLISH #3753 (game-queue + lane:games +
  why-weakest line), claimed with forge-claim.sh, shipped honest gap 0.
- GAME: arcade bonus-city law (Atari 1980) — every 10,000 the books earn banks
  one destroyed-city redraw at the next wave break; paid AFTER the wave bonus
  (arcade order), one per break, full board banks the credit, hot-seat crossings
  ride the combined books (cities are shared); pick rides a dedicated
  `gs.cityRand` stream so `gs.rand` never shifts. Tell: cyan rise-in over 40
  ticks + CITY RESTORED + rising windfall jingle. PR #3758 → `35a0c55`.
- Proof: missilecmdcheck 149→170 (+21 §bonus-city incl. exact arcade-order pin
  `score === 10k+1900` and a roll-for-roll dice spy); mutants 41→47, all die
  (new 6 verified in-run); NEW `mcbonusdrive` 9/9 real Chrome (unbanked never
  redraws, banked refill at the break, cyan rise-in pixels, full-board bank,
  zero errors); lint:mario/fps/ai + build green. README honest gap 0 CLOSED;
  MC shelf score 4→3 at the next kick.
- BONUS repair: the outer-fire smart-bomb mutant had drifted since #3698
  (anchor looked for the pre-shimmer line shape; mutants don't run in CI so the
  local red was invisible). Re-anchored in this PR, verified dead 8 checks deep.

## Harness facts paid this session (kept so lanes stop re-paying)
- A `--mutant` suite that spawnSyncs the whole check per mutant takes ~1 min ×
  N (47 ≈ 50 min): run it `background: true` with a log. A foreground timeout
  leaves the node child ALIVE with the file planted + `.mutant-running`;
  recovery = kill -9 runner+child, `restoreAll()` (it does NOT undo the current
  cross-process plant), `git checkout -- <file>`, `rm .mutant-running`, verify
  with `mutateguard --check`.
- MC browser drives: the `endWave` lift only bites while state==='playing' — the
  180-tick break swallows a second call; settle the break (probe `state`) first,
  and catch break-START fx (the rise-in lives ~0.67 s, the break is 3 s).
- `scripts/lib/harness.mjs` Report API is `rep.exit(browser)` — no `rep.finish()`.
- jalfern.com serves hashed bundles behind a CDN that can answer the OLD body at
  a NEW-looking URL moments after deploy; re-poll before declaring stale.

## BOARD facts at close
- main GREEN at `35a0c55` (static passed on #3758; nightly success). building:
  none. building-qa: #3749 (CENTIPEDE, QA), #3741 (TIDE POOL demo). game-queue
  empty. `next`: #1712 (waiting-jon). halt: 0. Open jonq (not mine): #3516
  (Arkanoid, due Nov 28 12:35Z). Asked nothing new this session.
- Rule 4 satisfied: game code merged this window (`35a0c55`, src/games/**).

## PLAYABLE on main right now
- MISSILE COMMAND bonus city — https://jalfern.com/retrogames/missilecommand
- TIDEPOOL field-guide plate (#3752), CENTIPEDE bite/sting + kill-pop garden,
  PITFALL grain, ASTEROIDS bounty popup, FROGGER duel-seat, ROGUE cart laws.

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. game-queue still empty → next free builder lands on the never-dry rung;
   re-derive with `idle-kick.mjs`, not memory (MC drops to 3; its remaining
   gaps are prose/measurement or hot-seat keys — the kick will name the true
   weakest title).
2. Slot a's #3670 (`~~` phantom filter in parseGaps) remains the cleanest
   small harness job.
3. ~45 stale lane worktrees under ~/Dev — purge lane only.

## Slot state at handoff
- Dev server :5178 stopped via scripts/devstop.sh.
- Worktree ~/Dev/retrogames-forge-mc-bonus-city pruned (rule-5 cleanup deleted
  the branch; plumbing checkout detached at origin/main).
- STATE.md committed to main (game merged this session, step 9) and parked for
  slot b via statepark.mjs park b.
