# STATE — session 274 (2026-11-14, slot b)

## Playable now / what shipped
- **RENARD** (merge `044be3d`, PR #2271, closes #2261): a running red fox —
  the Qwen corner of the model battle. Canvas 2D perspective painter, no
  WebGL, one file: /retrogames/demos/fox.html (prod-verified: RENARD code in
  the served page). Four-beat rotary gallop LH·RH·LF·RF at 2.6 m stride /
  0.55 s — sized so stance travel fits the limb chord (hind 0.44 ≤ 0.61,
  fore 0.42 ≤ 0.65), the precondition for ground-locked paws (measured slip
  0.000 mm). Cracking back ±0.05 m, bushy white-tip tail (wave + noise seed
  stride mod 6), 6-stride seam measured 3.6e-15. Golden-hour snow: fading
  print trail, puffs, sparkle, contact shadow, sun on the ridge; paw thumps
  + wind + vixie call on first click. foxcheck **30/30**, three mutants each
  kill exactly one gate; credits/index/README wired; lint gates + build green.
- The battle: Gemini's **FROSTBRUSH** (WebGL2 + PCF, #2269) landed mid-session
  while my branch was open; rebased onto it, resolved the index keep-both
  (both cards + DEMO_INDEX entries live), my PR closed #2261 for both corners
  (theirs said `Part of`, mine `Closes`). QA polish pass filed as **#2270**.
- Hygiene PR **#2274**: removed `scripts/.scratch-fox*.mjs` I had accidentally
  swept into main via `git add -A -- scripts` (see catches).

## Ladder (this session's path)
- Warden target #2261 claimed CLEAN on slot b before Gemini's lane filed
  theirs — both ships coexist (the issue title IS the battle).

## BOARD at exit
- #2261 closed (+prod comment with both live URLs). #2270 `feedback lane:qa`
  (RENARD polish); #2264/#2258/#2256 remain QA-open from earlier sessions.
- game-queue: EMPTY. No `building`, no `steer`/`next`, no `halt`.
- jonq: nothing open from lane:games. Nightly green; main-ok clean at exit.
- creditscheck on main: 198/202 — the 4 reds (weightsurgery ×2, horse index
  agreement, built-by count) are IDENTICAL to the pre-fox baseline (proved
  189/193 on `5cd3434` in a throwaway worktree). Not mine; not mine to fix.

## Next (slot a or b, in order)
1. Queue is empty → ladder: steer/none → #1711 skip (Jon-side) →
   QA-borrow only if no `QA MASTER` live → flagship stages (SSX, Emberwood,
   COMET DRIFT HD, Myst) via `idle.mjs`, skipping QA-held gaps → weakestStage.
   Don't duplicate QA #2270/#2264/#2258/#2256.
2. If a lane wants the fox battle graded, both demos + their harnesses
   (foxcheck 30/30, foxgeminicheck 34/34) are on the board and in prod.

## The session's catches
- **A name-order gait gate cannot see a collapsed gait.** Mutant `LF c
  0.58→0.30` passed order AND suspension — the letters stay in sequence, only
  the gaps change. Added a timing-signature gate (tight pairs ≤0.25, wide
  inter-pair ≥0.30) and the mutant died. Mutants are the gate's test, not a
  formality.
- **Two stride-index bugs hid in the swing arc** (target = previous anchor → a
  2 m leg-spike; then liftoff point needing the just-left anchor). Numerical
  probes (rel-x per phase vs chord budget) found both in minutes; squinting at
  frames cost two rounds first. Measure first.
- **Densifying the ring array left `poll = spts[6]` stale** — the head hung off
  the withers and vanished. Derived indices: `spts[spts.length-1]`.
- **Flat-card normals must flip skyward, not camera-ward** — flipping the snow
  quads toward the camera aimed their normals into the earth: no sun, no
  bounce, night at golden hour. Rule now: horizontal cards keep n up.
- **ctx-drawn overlays must run AFTER the painter-sort loop** — prints were
  pushed straight to canvas before the sorted ground cells painted over them.
- **`git add -A -- <dir>` sweeps untracked scratch** — my dotfile probes went
  into the branch and squash-merged to main despite being deleted from disk
  before the push (the deletion was never committed). Delete-then-COMMIT, or
  stage explicit paths. Cleaned in #2274.
- **mid-session merges of the same issue**: rebase keep-both, and let the
  multi-corner issue's Closes keyword sit with the last ship.

## Hygiene at exit
- Dev server :5178 (mine) STOPPED; no other lane's port touched.
- Worktree `~/Dev/retrogames-forge-running-fox` re-detached at origin/main
  (`f799c86`). Tidy-candidate (branch deleted upstream by squash). Same for
  the chore worktree (already removed).
- STATE.md committed to main legitimately (game merged this session — rule 9)
  + parked at slot-b path and shared path.
