# STATE — session 343 slot b close-out

## Shipped this session
- **FLOOR BOSS #2711 knee law — loaded carts sweep the outer diagonal —
  PR #2717 merged `f5f9059`.** A loaded cart turning 90° moves its body
  through the outer diagonal cell (`kneeTurn`); routing refuses turns whose
  swing is racked (`bfsKnee`, to-stock/to-out legs); sixth placement law in
  `strandsFloor`: a click that cuts a cell off the `kneeNet` service side
  dies `why:'knee'` (NO KNEE — RACKED THE SWING, zero footprint #1917).
  Tells: amber keep-clear after `paintTeach`, amber nose on loaded carts,
  duel seat-stamp sixth law, DEV eye `knees`. ATTRACT_SEEDS re-measured
  `[20, 42, 29, 40, 30]` (first ducks 4804–5721, all wins).
  Proof: `scripts/floorbosscheck.mjs` all green; throat rigs (plug (18,7)
  refused, net strands exactly `18,5 18,6`; shaft-from-below (18,9) refused
  too — one cell both directions); trip-by-trip path purity; autopilot wins
  curated seeds with 0 jams and 0 knee refusals (defense, not tax); legacy
  gates re-pinned to measured new truth (#1931 precedent); mutants
  `--mutate-knee` + `--mutate-knee-route` killed; contract 14/14; build
  green. Prod verified: `NO KNEE` in `index-MaYSugAQ.js`.

## Next queued (slot b)
- No TARGET claim pending. Idle-kick's weak pick was PickRush — DECLINED on
  #2712 (only real gap is episode-export wiring, not feel work; a polish
  stage there would be made-up work). Next-weakest taken instead (done).
- FloorBoss polish backlog can take one more stage: teach the knee at the
  click like #2627/#2622 teaches corner/lane (the refusal exists but has no
  teach banner yet) — natural s2 of #2711; file it before claiming.
- #1711 (TARGET) was held live by slot a all session — check its state at
  step 1 before re-picking; idle-kick still phantom-lists games whose held
  dirs match by title (#2706 fixed the class; verify with
  `node scripts/idlekick.mjs` rather than trusting memory).

## Catches learned (durable)
- **Walls are not knees.** A rack in the swept diagonal is a traffic law; a
  wall there is a dead-end spur, legal by the #2546 ruling. `kneeTurn`/
  `kneeBlocked` check `gs.racks` only — counting walls made the plug refuse
  and pocket rules misfire everywhere.
- **Backpedals are free.** Forklifts drive both ways, load trailing; the knee
  never sweeps a reversal (same doctrine as #2546 spurs). A no-reverse
  variant passed every rig but collapsed the career economy (seed 99 banked
  2 vs 4–6). Re-measure careers before tightening kinematics, ever.
- **New MUT_ flags must be added to the plant-guard `if (...)` list** —
  a flag defined but missing there falls through to a normal run that looks
  green. mutateguard's dirty-tree refusal is what caught it here; commit
  before running mutants.
- **Legacy gates blessing old kinematics get re-pinned, not worked around**
  (#1931 precedent): spur/teach/lane/trace/career/attract/duel-chrome all
  moved to measured new truth in the same PR.
- Probe hygiene: `clickCell` needs `g.tool='rack'` set before EVERY put —
  a nulled tool between puts silently returns `'floor'` and poisons the
  measurement.

## Lane state
- Worktree `~/Dev/Retrogames-forge-floorboss-knee` + branch removed post-merge;
  main checkout detached at `f5f9059`; port 5178 freed.
- Slot a's session-343 report preserved at `/tmp/forge/STATE.a.parked.md`
  (their working copy was uncommitted in the main checkout at re-detach).
- QA MASTER live (pid 3203) — feedback issues untouched this session.
- Rule 4: game code changed this PR streak ✓.
- Open questions for Jon: none filed this session (#2711 was self-assigned
  ladder work; taste-free).
