# STATE — forge board snapshot (slot a, 2026-11-27 — DONKEY KONG bonus fuse SHIPPED `e63faf2`)

## This session (slot a) — never-dry stage shipped
- **Claimed #3786** (POLISH — DONKEY KONG, filed here from `KICK DONKEY KONG 0
  weak`): the README gap "No score bonus timers; the timer-zero capture law is
  unmodelled" → shipped as PR #3792, squash `e63faf2`, prod-verified (deployment
  sha `e63faf2`, bundle `index-9oVheL4q.js` carries the `BONUS` HUD).
- **The law (Wikipedia DK §Gameplay):** `BONUS_START` 5000 lights every board,
  −100 every real second while live; the rescue banks what remains (flat
  `WIN_SCORE` 1000 deleted, payout pops `+<counter>` at her perch); zero arms
  `captured`/`captureTimer` — 90 ticks of the ape lifting Pauline (HELP cuts
  off mid-grab), then life spent, board rebuilt fresh-fuse, honest terminal.
  Frozen during death/win/capture/collapse; never runs in attract (title demo
  must not gamble lives). Counter rides `stateHash` + `cloneWorld`; watch seat
  treats the grab as an honest wait.
- **Proof:** kongcheck 174 green (new §bonus-timer; lap-bank rewritten to
  counter semantics; fleet floors `capsAll===0` — lap ≈850 of 3000 ticks;
  README-honesty pin). Hand mutation (`if (gs.bonus <= 0)`→false) red 3,
  restore green. kongdrive 18/18 real Chrome: real-second countdown, live
  grab, life paid, fresh fuse, 0 page errors. Screens verified attract-at-5000
  and mid-grab.
- Filed `QA — DONKEY KONG: oil-drum flame kill + capture-grab polish` (#3796,
  feedback) owning the last honest gap; its body quotes the gap verbatim so
  `ownsGap` suppresses it (idle-kick moved 0 weak → -1 weak: named-only).

## Harness facts paid this session (kept so lanes stop re-paying)
- **`__game.step()` closes the loop lock until `__game.release()`.** Any
  wall-clock assertion after a scripted drive (fuse rates, timers) must call
  `window.__game.release()` first or rAF never resumes and the clock stands still.
- **A run-wide fuse touches every long rig.** kongcheck barrel-law scans
  (360 s, attract:false) now capture+reset mid-scan and measure a frozen world;
  physics rigs top the counter via `noFuse(gs)` (kongcheck-local). Keep the
  fuse LIVE only where laps bank (it resets) and prove `caps===0` there.
- **`parseGaps` filters whole bullets by `CLOSED by #N`.** Closing half a
  multi-law bullet while the other half stays open requires SPLITTING the
  bullets, or the open half silently leaves the gaps list.
- No golden hashes are pinned in contractcheck/kongcheck — `stateHash` format
  changes self-replay clean (grep for `samples.push` only compares runs).
- 3000-tick budget: a watch lap here is ~850 ticks, so a 50 s fuse has 3.5×
  margin — measure lap time before picking any run-wide timer.

## BOARD facts at close
- main `e63faf2`: today merged #3792 (DK fuse, mine), #3795 (pinball ghosts),
  #3790 (gap-notes retire + word-boundary naming), #3787 (pinball DMD ring),
  #3785 (fireflies), #3781/#3783/#3784 (earlier). building: none. building-qa:
  #3794, #3793 (pinball dress/hierarchy), #3779 (koi demo). game-queue: empty.
- idle-kick at close: `KICK DONKEY KONG -1 weak` — no unowned gap left on the
  shelf; the point is QA-backlog naming (#3796), and its gap is owned.
- halt/steer: 0. jonq: AWAITING #3791 (dry-shelf flagship question, filed by
  another lane today — do NOT file a second dry-queue question), #3516, #3244,
  #2971; #1712 waiting-jon `next` (research lane, not claimable here).

## PLAYABLE on main right now
- DONKEY KONG beats a fuse: yellow BONUS counter counts 5000.down while you
  climb; saving her banks the remainder; dawdle 50 s and the ape takes her —
  https://jalfern.com/retrogames/donkeykong
- PINBALL speed-graded ghosts (#3795) + DMD ring fix (#3787); MC seat-2
  batteries (`4dc509c`); PAC-MAN human-loop drive (#3781); DK walk-past 50.

## Open questions (links only — #605)
- #3791, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. Board is dry by ownership: DONKEY KONG -1 weak is QA-named (#3796 owns the
   flame gap). A builder kick naming DK index -1 has NO unowned gap — do not
   re-file the flame gap; check the QA lane is alive, else it is the QA
   borrow's job (#3796 is the concrete fix: fireball kills).
2. QA lane holds #3793/#3794/#3779.
3. Dry-shelf flagship question #3791 is AWAITING Jon — that is the only
   dry-queue question on the board until its 2026-11-29 deadline.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh` at close; no other port touched.
- Worktree `retrogames-forge-dk-timer-capture` pruned after the STATE docs PR.
- STATE parked via `statepark.mjs park a`; shift report pushed.
- STATE commit to main goes through the docs PR opened with this report
  (game merged this session, so the STATE fold-in is allowed; merge only via
  `scripts/forge-merge.sh`).
