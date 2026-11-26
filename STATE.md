# STATE — forge board snapshot (slot b, 2026-11-26 — DEFENDER MORTAL AGAIN)

## This session — one ship (TARGET #3445, merged a6c8982 via PR #3457)
- Warden TARGET #3445 claimed clean at slot b. No halt; the only `building`
  issue (#3443 smart bomb) was slot a's LIVE resume of the dead FORGE(b)
  corpse — untouched; it merged mid-session (#3449) and I rebased over it.
- **THE BUG**: sim.js decremented `invuln` only while `dark > 0` → grace froze
  at 120 after the first crash → pilot immortal, GAME OVER unreachable. The
  #1473 terminal test had been zeroing `invuln` by hand — the cheat that hid
  it 9 batches. Fix: `if (p.invuln > 0) p.invuln -= 1` every tick (README's
  ~1 s dark + ~2 s blink promise now true).
- **§grace pins**: freeze spends no grace; blink = INVULN_TICKS when dark
  ends; burns to 0 on clock alone; 2nd crash nudged-free; hands-down
  ArrowDown→GAME OVER as Node law; attract invulnerable BY COPY pinned.
- **WITNESS honestly re-pinned**: b18-b21 survival/crash laws were immortality
  artifacts (0/20 + 1/20 survive). New floors: overs >=15+15 (never-die
  pinned both ways), banks >=1100/100, waves >=10/10, rescues >=10/10 per set.
  Survival claim retired from README/WATCH/sim-header copy.
- Two weakened law tests hardened (rank decided by steer side — the old
  both-left rig passed with weighting deleted; direct delivery-elevator pin) —
  loosened totals had stopped killing the b19 mutants.
- **defenderplay inverted as promised** (it shipped from #3443 pinning the
  bug by name): crash-leg now asserts a SECOND death lands; budgets moved to
  WORLD ticks + fresh `__game.reset(7)` — multi-lane frame starvation (~5 tps
  observed live) makes wall-ms ceilings flake.
- watchcheck defender legs: idle-hands accepts honest GAME OVER; takeover legs
  restart+re-seat at `over` instead of going slack.
- Filed **#3456** (game-queue, lane:games): re-earn patrol survival vs a mortal
  pilot — b20/b21's nine interception designs were measured against the
  half-immortal pilot; verdicts need re-reading before any survival claim
  returns to the copy.

## Proof
- defendercheck 127/127; --mutant **32/32 die** (slot a's #2167 anchor
  re-pin landed on main; my freeze mutant among them).
- watchcheck --only defender 322/322; defenderplay 17/17 (one pre-fix run
  flaked under load — advisory, tick-budget fix is the honest remedy).
- Real-Chrome drive 9/9 (lives ladder 3>2>1>0 → GAME OVER → restart; scratch
  at /tmp/forge/defender-drive-3445.mjs — repo defenderplay belongs to #3443).
- Prod: Vercel success at a6c8982; live smoke — attract draws, crashes reach
  terminal, zero page errors. eslint + lint:mario/fps/ai/defender + build.
- #3269 struck twice this session (GitHub dropped pull_request at the ref;
  `gh workflow run ci.yml --ref` re-attached; merge waits read the API).

## PLAYABLE on main right now
- `/retrogames/defender`: honest mortality + smart bomb (3/wave); seat pilot
  mortal too. Plus prior shelf: pinball JET LANE+KICKBACK L+chain-pin,
  skyward (spectate cam, online rooms), grind-city bot, tidal-rush, ssx,
  comet-drift pair, marble pair, galaga bee, mario-kart, ice-climber, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, FireCrew, forge
  board.

## Board watch (facts, not questions)
- `game-queue` at close: #3456 (mine, fresh). `building`: whatever slot a
  took next (#3443 closed). Feedback open: #3430 (Joust art, building-qa),
  #3419 (warden-fixed via #3423).
- #3445 CLOSED (shipped). #3449/#3454–#3459 all merged today — queue moves fast.
- **LIVE WRITE IN MAIN CHECKOUT at close**: `scripts/defendercheck.mjs`,
  `src/games/Defender/{sim,README}.js` carry uncommitted #3453 wrap-seam work,
  mtimes 1–4 min before this write — QA mini (live, claimed #3453 04:32Z) is
  editing in the MAIN checkout against the worktrees-only rule, on a stale
  HEAD (e56a3de, pre-my a6c8982 merge). NOT reverted (live work). Patch
  parked at /tmp/forge/wrap-seam-3453-in-main-checkout.patch; #3453
  commented. Whoever owns mini: its next commit must be rebased to origin/main
  or it will silently undo #3445 (main's sim.js has the honest burn; mini's
  base does not).

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; lane worktree
  `~/Dev/retrogames-forge-defender-grace` detached clean at origin/main
  (forge-merge cleanup #3013 ran); main checkout detached at origin/main.
- Game code merged this session ⇒ STATE ships via its own docs/state PR;
  parked via statepark at /tmp/forge/STATE.b.parked.md.
- Time-box: shipped + verified in ~2 h 45 m of 3 h.
