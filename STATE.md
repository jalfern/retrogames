# STATE — forge board snapshot (slot a, 2026-11-22 — shipped)

## This session shipped
- **R-TYPE wing shell initiative** (#2972 POLISH → PR **#2975** → main `50ab086`,
  prod-verified: deployments API `success` at the merge sha; `/retrogames/r-type`
  attract re-shot live — co-op seat flying).
  - `wingBrain` now commits its own seed: launch when attached + FIRE-breathable
    (`incoming >= 12`, the cargo-law number) + a SOFT body in lane (turret/gun-pod/
    carrier/duelist — armour never bait); recall when the source line clears
    (keep-window 170/±14 vs launch 150/±10 hysteresis). Hand-off (`pd.hand`)
    outranks initiative; human veto untouched; zero rng, no new persistent state
    (stateHash/streams byte-untouched). Solo autopilot still never throws (new pin).
  - Verdicts: rtypecheck **255/255** (8 new laws) · mutant run **256/256**
    (`shell-deaf` red by design) · lint×3 + build green · winnability solo **8/12**
    (floor 4) · co-op **12/12** — throw live, floors hold.
  - **Kinematics lesson (the run's real catch):** the hull's own pace (~2 px/tick
    world) overtakes world-fixed guns *before a 3.6 px/tick throw reaches them*,
    and proximity re-docks the shell mid-flight. A ceremony law must target a
    HELD carrier (stays put; hp 12 so the ram, not the vulcan stream, lands the
    kill) and assert **away-at-kill** — else it proves the nose killed, not the
    throw. Also: a hunting duelist wanders out of the keep window onto the other
    hull — recall-then-nose-ram is correct partner behaviour, so the LAW must
    stage a lane-fixed target, not bend the rule.
- Remaining R-Type honest gap: dark-seat free life (README gap, unowned — next
  idle-kick for R-Type names it).

## #1712 status (TARGET, open on purpose — human-data-gated, unchanged)
- `gamesCovered>=2` still needs the first real Contra take through a phone;
  holdout needs takes from 2 live players. Check the store before any new
  #1712 code (big-build rule 1: no faked human data).

## Nightly / freeze at write-time
- Tip `61c5c5f` (#2977 FloorBoss seams, slot b) nightly pending; #601 clear at
  every main-ok this session. If tip nightly goes RED → 5a first.

## PLAYABLE on main right now (prod-verified)
- `/retrogames/r-type` — seat two now THROWS: the wing solves duelists and
  carriers on its lane at the stand-off, plugs the right edge, brings it home.
- `/retrogames/contra` — trainable (consent gates RECORDING only; play never).
- `/retrogames/floor-boss` — career takes + seam markers (#2977).

## Board at close
- `building`: **#1712** (research, human data). `game-queue` empty.
- `feedback`: **#2978** (talk-me-down trainable polish — new, QA's to claim),
  **#2971** (contra trainable polish), **#2964** (FloorBoss; item 2 shipped via
  #2977, remainder stands).

## Open questions for Jon (links only, #605)
- **#2846** promote flagships? — due 11-23 (tomorrow; warden takes default
  "keep private" at deadline — fine), **#2908**, **#2930** (QA DD seat laws),
  **#2953** (consumed 11-22, default recorded on-thread).

## Harness notes (carry-overs)
- **`gh pr merge` dies on local cleanup while ANY worktree holds `main`** (#2975
  hit it again): merge lands remotely — VERIFY `gh pr view --json state,mergedAt`
  before retrying anything. This session freed main: `retrogames-fix-smallmodel`
  is now detached at `1d4dda1` — safe to `git worktree remove` it (see Slots).
- **Fresh installs now work clean**: `allowScripts` pinned a stale `esbuild@0.27.3`
  while the lockfile carries 0.28.2 (npm ≥11 blocks postinstall by default →
  silent half-install). Fixed in #2975 (`25995be`). After any dep bump, run
  `node patches/fix-ifvms.cjs` manually if install-scripts were skipped, and
  keep the allow-list pin matching the lockfile.
- Prod grep recipes unchanged: deployments API sha = merge→prod proof; the
  feature itself may have NO new string literals (minified) — fall back to
  `npm run shot -- --url <prod> ` attract capture as boot proof.
- Consent gate in harness: seed stored decline (`openGame({decline:true})`);
  gate RECORDING, never arcade play (#2969 law).

## Slots / ops
- Slot a port 5173: dev server stopped by `scripts/devstop.sh` (by port).
- Worktrees this lane left: `retrogames-forge-rtype-shell` (merged, detached at
  origin/main — safe to remove) + old cleanables from prior STATE
  (`fix-smallmodel` [main now released], `forge-plaicraft-s2-contra`,
  `forge-rtype-volley`, `forge-watchcheck-fb-window`, `forge-red-main-2h`).
- Main checkout detached `origin/main` `61c5c5f`; STATE committed+pushed to main
  (game merged, rule 9) and parked via `statepark.mjs park a`.

## Next lane starting here
- Nothing claimable is code: queue empty, feedback (#2978/#2971/#2964) is the
  QA lane's while a QA MASTER session is live; a free builder runs the
  idle-kick ladder (flagship order — R-Type gap 0 now = dark-seat free life).
- If tip nightly goes RED → 5a first (harness-only calibration, no asking).
