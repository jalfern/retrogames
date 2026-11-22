# STATE — forge board snapshot (slot a, 2026-11-22 late — shipped)

## This session shipped
- **R-TYPE dark-seat fare** (#2980 POLISH → PR **#2982** → main `c548973`,
  prod-verified: production deployment `success` at the merge sha; live attract
  re-shot via `shot.mjs`). The idle-kick pick: `KICK R-TYPE 0` — flagship
  ladder in Jon's order, all others gap-free, and this was R-TYPE's last open
  honest gap.
  - Law: the stage-clear loop returns each spent seat with **one free life** —
    the partner's carry pays the fare. Symmetric per seat (S4), naked hull,
    fresh mercy, human flag kept; the carrier's pool never tops up, the
    returned pool is exactly one, and BOTH pools burning pays nothing (the
    curtain still falls). Zero rng; `seatAnn`/`seatIn` are juice, hash-pinned
    invisible. Voice: `p1back`/`wingback` chimes + `SEAT IN`/`PILOT IN` winks.
  - Verdicts: rtypecheck **263/263** (8 new laws) · mutant run **264/264**
    (`dark-deaf`, `fare-blind` red by design) · winnability solo **8/12**
    (floor 4), co-op **12/12** · lint×3 + build green.
  - R-Type honest gaps now ZERO (`parseGaps` []) — idle-kick no longer names
    R-TYPE; next kick falls through the ladder to `weakestStage`.
  - **Harness lesson (the run's real catch):** late in a long browser leg,
    real-time Space pulses starve (rAF throttling) and never reach the
    walk-in gate. Stage-clear browser laws must drive with deterministic
    `__game.step(pad, n)` batches — first attempt failed `cleared=0`; the
    batches fixed it. Same recipe for any future loop-leg law.

## Flagships went PUBLIC (#2846 answered 11-22, landed #2979)
- Jon (chat): "promote all 3" — CONTRA, DOUBLE DRAGON, R-TYPE are
  `visibility: 'public'` on main; `visibilitycheck` pins the exact allowlist.
  Future sessions: new titles stay private (#379); don't re-ask, don't widen.

## #1712 status (TARGET, open on purpose — human-data-gated, unchanged)
- `gamesCovered>=2` still needs the first real Contra/TMD take through a phone;
  holdout needs takes from 2 live players. Check the store before any new
  #1712 code (big-build rule 1: no faked human data).

## Jon's Q&A sweep at 21:53 (all answered, records on-thread)
- **#2908/#2930** — DD idle-seat laws: answered 11-22; executing Jon's reply
  is lane work — QA lane owns #2930's sheet-law family (don't re-ask).
- **#2953** — S2 invite flow: answered (default had been recorded 11-22, then
  Jon replied). **#2846** — shipped via #2979 (see above).

## Nightly / freeze at write-time
- Tip `c548973` (#2982) nightly pending; #601 clear at every main-ok this
  session (also over #2981/#2979). If tip nightly goes RED → 5a first
  (harness-only calibration, no asking).

## PLAYABLE on main right now (prod-verified)
- `/retrogames/r-type` — now PUBLIC; a seat whose tickets burned comes home at
  every stage clear with one free life, `SEAT IN` blinking its return.
- `/retrogames/contra` — PUBLIC; trainable (consent gates RECORDING only).
- `/retrogames/floor-boss` — career takes + seam markers + close-flush stress
  (#2977/#2981).

## Board at close
- `building`: **#1712** (research, human data). `game-queue`/`steer`/`next`
  empty. `feedback`: **#2978**, **#2971** — both `building-qa` (QA holds).
  #2964 and #2952 shipped/closed during this session.

## Open questions for Jon (links only, #605)
- None open — the 21:53 sweep answered them all (see records above).

## Harness notes (carry-overs)
- Rule-5 merge loop this session merged cleanly and the worktree released;
  the "verify PR state before believing local exit codes" law stands (#2975).
- Prod grep recipes unchanged: deployments API sha = merge→prod proof (`success`
  status now also checked); feature strings may be minified — attract capture
  via `npm run shot -- --url <prod>` is the boot proof.
- Consent gate in harness: seed stored decline (`openGame({decline:true})`);
  gate RECORDING, never arcade play (#2969 law).

## Slots / ops
- Slot a port 5173: dev server stopped by `scripts/devstop.sh` (by port) ✓.
- Worktrees this lane left: `retrogames-forge-rtype-darkseat` (merged, now
  detached at origin/main — safe to remove) + old cleanables from prior STATE
  (`rtype-shell`, `fix-smallmodel`, `forge-plaicraft-s2-contra`,
  `forge-rtype-volley`, `forge-watchcheck-fb-window`, `forge-red-main-2h`).
- Main checkout detached `origin/main` `c548973`; STATE committed+pushed to
  main (game merged, rule 9) and parked via `statepark.mjs park a`.

## Next lane starting here
- Nothing claimable is code: queue empty, feedback is QA-held while QA MASTER
  is live. A free builder runs the idle-kick: flagship ladder is spent (all
  flagship gaps zero/unowned-free), so expect the `weakestStage` rung — run
  `node scripts/idle-kick.mjs`, file the POLISH it names, claim, ship.
- Execute Jon's #2908/#2930 replies if the QA lane hasn't already.
- If tip nightly goes RED → 5a first.
