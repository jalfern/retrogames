# STATE.md — The Forge (rewritten at close of session 356, slot a — 2026-11-19;
# session 355's reports are on main and in git history.)

## SHIPPED THIS SESSION — CONTRA S2 MERGED (`8ada95b`, PR #2786)
**CONTRA — the waterfall + boss gate.** #2779 stage 2 (stage 1 shipped by slot a as
#2781). `static` SUCCESS, squash merged via rule-5. Issue #2779 stays OPEN with `next`
(multi-stage commission #1530; S3 = the hangar run is the next slice).

**What landed** (`src/games/Contra/{sim,art,index}.js(x)` + `contracheck.mjs`):
- Phases `jungle → falls → boss` through one `step()` law: ratchet camera (never
  retreats past the gate view), water drowns (life + safe-point respawn), one-way
  shelves with honest geometry (rise ≤ 44, gap ≤ 55 — inside the jump envelope),
  vertical wake law (off-screen enemies sleep until they can see you).
- Boss gate: armored core (8 hp) behind a shutter (opens 70 frames every 120),
  two cannons (aimed rounds + steep drop-shots), spawn door capped at 1 soldier.
  Core break → doors open, cascade +5000, `won`.
- Autopilot wins in-game, no warps: 40/40 seeds, 0 deaths. Tactics (zigzag
  patrol, hop flats, sidestep drops, face the charger, never turn into an inbound
  round) + the tuning trail are in `src/games/Contra/README.md` — including a
  reverted rule that measured *worse* (back-pedal to dodge: 0/12).
- Gates: `contracheck` 52/52 (S1 battery + QA #2784's checks + 12 S2 laws);
  `--mutant` names two harms (spawn-shield; sealed-core "0/6 seeds can finish");
  `contractcheck` contra 15/15; lint mario/fps/ai; build.
- Live: https://jalfern.com/retrogames/contra (prod bundle carries S2 strings).

## PLAYABLE
`/retrogames/contra` is now a full two-stage run: jungle, waterfall climb, boss
gate, win screen. Everything else on the shelf unchanged (floor-boss #2783 by slot b).

## BOARD
- **#2779 (open, `next`, lane:games)** — S3: the hangar run (final stage of #1530).
  Design notes + stage specs live on the issue; sim already has the phase machine
  and ratchet to extend.
- **#1711 (open, `next`)** — waits ONLY on Jon's clap take (jonq #2652 AWAITING,
  deadline 2026-11-20 01:36Z). No lane-side work left; sweep at claim.

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main`, `node scripts/idle-kick.mjs`,
   then the #1045 ladder. CONTRA S3 (#2779) is the obvious big slice; budget a
   full session (third phase + finale art + a new check section + autopilot end).
2. #1711 — check the store for Jon's clap take; if #2652 defaulted, follow its
   recorded default.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2652 (AWAITING, lane:platform, deadline 2026-11-20 01:36Z) — Jon's phone-clap
  take or waive the phone shape.
- #2751 (AWAITING, lane:qa, deadline 2026-11-21 03:40Z) — QA focus.
- Nothing filed from slot a this session — tuning and stage design followed spec.

## HARNESS NOTES FOR THE NEXT LANE
- **Foreign-rebase incident:** this worktree was found mid-`git rebase -i` started
  by another process (replaying our pre-rebase tip `e70c141` onto slot b's main).
  Aborted it, redid the rebase deliberately, verified `git status` before touching
  anything. If you find rebase state you did not start: abort, verify PR head,
  then act. `git rebase --continue` hangs without `GIT_EDITOR=true`.
- **Mid-build merges of shared files are the cost of two lanes on one game.**
  QA #2784 rewrote the same three Contra files; resolve as UNION, not side-pick:
  the harness file kept both check suites (union = 52 checks); `--theirs`/`--ours`
  side-picks silently drop the other lane's tests. (`checkout --theirs` also
  no-op'd once mid-conflict — recover authoritative content via
  `git show <sha>:<path>`.)
- QA's world-tick msg-rotation and blue-sea pixel checks pass unchanged on S2:
  attract paint stays jungle-phase and `drawWater` keeps the bottom band blue in
  every phase — keep that invariant if S3 re-works the palette.
- Core-window tuning that shipped (README has the full trail): hp 8, window
  open 120/190, gun cadence 170+rnd·110 @ speed 2.0, hero patrol band
  x∈[136,158]. Initial hp 20 was provably unwinnable by the honest-percept
  autopilot — that number is the floor to re-measure, not to re-guess.
- Mutant runs rewrite tracked files in place: never `git add` while one is live
  (mutateguard stamps `.mutant-running`; check `node scripts/lib/mutateguard.mjs --check`).

## SLOT A LOG
Warden target #2783 refused (slot b held it — they shipped it as #2785 while we
watched). Ladder → #2779 (`next`). Built S2 sim → art → shell → harness; tuning
loop moved autopilot from 4/12 to 40/40 (levers + reverted rule, all on #2779
ck1/ck2). Collision-rebased onto main mid-session after #2784/#2785 landed;
all gates re-run green at the rebased tip; merged via rule-5; STATE committed
directly to main (established pattern); slot parked (`statepark park a`).
Dev server for slot a was on :5173 (stopped at close). Worktree
`~/Dev/retrogames-forge-contra-waterfall` left detached at main — purge when idle.
