# STATE — 2026-10-24 forge session 3 (SSX Salis arm shipped; gap #0 closed whole)

## Shipped this session
- **#980 → main (PR #983 squash 00e55e2)** — **SSX: the Salis grab hand lands
  on the board**, live at `https://www.jalfern.com/retrogames/ssx`.
  - Flagship idle stage (#841): queue empty, QA lane live (borrow forbidden);
    `idle.mjs` picked SSX honest gaps #0 honestly. Issue filed first.
  - **Not the fix the gap guessed.** Salis (~0.41 off the nose-edge band) was
    never a reach/shoulder problem: `solveGrabHand`'s final quaternion block fed
    ROLL-space solved points straight into the bone parent's `worldToLocal`.
    100+ m down the mountain that mixes ~120 m-apart coordinates — fold
    directions collapse to parallel (live probe: |W-E| = 122.9 m, a0·d1 = 1.0),
    the guards read "nothing to do", and any correction living in the ELBOW
    freezes. The mirrored cross closes entirely at the elbow, so it stranded
    while other grabs hid the error in their shoulder term.
  - Fix = `roll.localToWorld()` before the parent transforms (art.js). A
    `SCAPULA_SLIDE` relocation knob was built, measured unnecessary after the
    space fix, and dropped.
  - Live numbers: Salis 0.41→0.125 (new `ssxmodelcheck` gate ≤0.2), Indy
    r 0.094→0.068, Method r 0.048→0.033, Nose l 0.075, Flat l 0.079.
  - Proof: mutant = pre-#980 conversions → all 5 reach gates red 0.26–0.35;
    restore → green. `ssxcheck` 334, `lint:ssx`/`mario`/`fps`/`ai`, build green.
    Prod verified by content marker (live SSX chunk index-BfsOwmgO.js has 9
    localToWorld sites vs 7 pre-fix) — hashes differ locally vs Vercel as usual.
  - README honest gaps #0 now **CLOSED by #980** (weld #883 + solve #967 +
    side-flex #971 + Salis #980 = the whole bullet).

## Next goal
- `game-queue` is EMPTY → #841 stages apply again. Honest `idle.mjs` pick is
  now **SSX honest gaps #1 (remaining open one): the blob contact shadow →
  real shadow casting** (README line ~557), unless a `steer`/`next` lands first.
- Never touch QA-held issues; QA holds #928, #891, #939, #947, #956.

## Board / harness status
- main = 00e55e2 (this ship). `main-ok` green at claim + merge; `static`
  SUCCESS; Vercel pass; prod content-verified.
- Advisory-only ssxmodelcheck noise (rule 3, one rerun, moved on):
  "paused scene stable" and grabFlat-vs-grabIndy distinctness flap on software
  GL (diff 12–90 between runs); pre-existing per last two STATE notes.
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.

## New harness lessons (this session)
- **Coordinate space is a correctness bug class, not a tuning surface.** The
  README "diagnosis" (needs shoulder relocation) nearly shipped a knob; the
  debug stash of raw vectors at the guard (|W-E| = 122.9 m is IMPOSSIBLE for a
  0.2 m forearm) named the real bug in one probe. When IK freezes at a guard,
  print the magnitudes, not just the stage.
- **A route-lazy game verifies by chunk-content markers** (method-call counts
  survive minification), not the entry hash — and find the chunk by grepping
  the lazy names for a game string (`grabSalis`).

## Housekeeping owed
- Prune when idle: `retrogames-forge-ssx-salis-arm` worktree (removed this
  session), plus standing list (momentum-courses, iphone-controller, ssx-*,
  emberwood-*, qa-863*, people-sim, campfire-670, forge-model-library,
  coral-reef, qa-973).
- STATE.md ships via its own PR (#920 convention) — a game merged, so this
  file goes out via its own PR + merge.

## Open questions
- None (#605: nothing filed this session).
