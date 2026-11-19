# STATE — session 346 slot a close-out

## Shipped this session
- **FLOOR BOSS — TURN-COUNT ROUTING + REPATH-ON-LAND (#2724) — PR #2731 merged `85985c3`**
  (rule-5 loop on `static`; verified via `git log origin/main` + content grep, not exit code).
  Prod verified: the live FloorBoss chunk carries the re-measured attract seeds
  `[48,94,6,72,3]` — https://jalfern.com/retrogames/floor-boss is the shipped sim.
  Loaded legs (and the knee-eye) now take, among knee-legal paths of MINIMAL hops, the
  one with the FEWEST 90° pivots, ties by fixed NB order; empty legs byte-identical
  (#1917 discipline), refusal semantics (#2711) untouched. A rack landing across a
  planned route (crossing or turn-sweep diagonal) repaths the tick it lands — closes the
  #2680 heat stale-path lie.
  Proof: floorbosscheck **397/0** (12 new gates); both mutants killed (`--mutate-turn`,
  `--mutate-repath-land`); marks re-pinned from live measurement (order/dest/weight
  golden sigs, career traces per-seed ≥2 + mean ≥4 — measured 2–6 after repath chaos;
  attract seeds win AND show first courtesy at 4947/4719/5238/5117/5283); single-shift
  wins 14/15 (seed 12 thin ~814, knee floor 6/7, zero jams); eslint + lint:mario/fps/ai
  + build green. `floorbossplay` (step 6 live drive) NOT run this session — residual.

## Board
- Warden target #2721 was REFUSED at claim (slot b held it; it shipped as #2728 before this
  session opened). Ladder: #1711 skipped (needs a quiet box + Jon's phone), steer/game-queue/
  feedback/flagship empty → never-dry rung. `weakestStage` scored PICK RUSH and FLOOR BOSS
  tied at 1 (registry order); PICK RUSH's only gap is an episode-pipeline task, so the rung
  deviated to FLOOR BOSS (gameplay-rule gap) — justified in #2724/#2731 why-weakest lines.
- Filed + shipped #2724 (`lane:games`, now `shipped`). Filed feedback **#2732**:
  `bot.dir` records movement, not facing, so an external audit can't reconstruct planner
  back-pedal facing — the live knee-audit gate was removed pre-merge for that reason.
- Open PR **#2733** (QA lane): HOMEBODY garden-jar live readout (#2729). Not slot a's.

## Next queue
- **#1711 line 3**: the strict clap witness now runs nightly on a quiet runner (#2730);
  the human-witness half still waits on Jon's phone recording — #2652 AWAITING.
- FLOOR BOSS candidates: #2732 (facing audit — needs `bot.face` in the harness state);
  human win-rate gap (~20% vs autopilot at 14/15 single shifts) traces to blind-corner
  knee wins — a POLISH "telegraph the knee" pass is the honest next feel task; README
  residuals list the rest.
- PICK RUSH: revisit only after #1711 pipeline work (its sole gap is episode plumbing).

## Catches learned
- **Remote is the source of truth.** mutateguard's abort rewound the LOCAL worktree
  (even past a pushed commit — detached it at old origin/main); the merge still succeeded.
  Verify ships with `git log origin/main` + content grep, never local files. Commit+push
  before ANY `--mutate` run (AGENTS law, re-confirmed the hard way).
- **jalfern.com asset fetches need `curl -L`** — the redirect stub ("Redirecting…", 15 B)
  silently defeats every grep-and-verify sweep (false "stale prod").
- **Vite chunk hashes drift between machines** — verify prod by CONTENT markers (seed
  arrays, literals), not hash equality with a local build.
- `ATTRACT_SEEDS` is duplicated in floorbosscheck's `--mutate-attract` plant — change both
  or the mutant plants a stale string and the gate lies.
- `gh pr merge --repo X --squash` needs the explicit PR number; and only `static` is
  waited — advisory `smoke` must never gate (rule 5 command unchanged, worked as written).

## Housekeeping
- Slot b's session-346 STATE close-out was found uncommitted in the MAIN checkout while
  their lane was still running; preserved in `git stash` ("slot b session 346 close-out
  STATE") — pop it (or copy from /tmp/forge/STATE.b.session346.md) and land it if their
  close-out didn't commit it.
- Open questions for Jon: #2652 (phone witness recording) — all else answered.
