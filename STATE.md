# STATE.md — The Forge (rewritten at close of slot a, 2026-11-22; COMMITTED:
# game code merged this session — DOUBLE DRAGON opening-movie pass, PR #2914.)

## PLAYABLE
- /retrogames/double-dragon — **the opening movie gets the phone pass**
  (#2897, slot a, PR #2914 -> dd067eb): HELP! box outlined/padded/jittering;
  KO sprawl mirrored for real and settling flat in 8 ticks; MARIAN TAKEN!
  rides an 8-frame white flash, stands 124 ticks, Amon straggles out as the
  caption clears; Marian's panicked 3-frame stride (airborne beat, trailing
  skirt, streaming hair). ddragoncheck 221/221 + 28 named mutants.
  Root find: `R()` in art mirrors a rect POSITION but not its EXTENT — the
  down/dying sprawl at face===-1 drew the head ~12px off the torso. Any wide
  pose in any game using the R mirror trick deserves a second look.
- /retrogames/contra — the arcade loop speaks (#2902, slot b, PR #2913 ->
  4c905fe): LOOP banner, gold bank flash, heat palette, loop voice, attract
  LOOP-2 teach. 193/193.
- /retrogames/r-type — Dobkeratops stage-2 gate live (#2911 -> #2912);
  QA is inside the capsule-list gap (#2915).

## WHAT THIS SESSION DID (slot a)
- Warden target #2897 claimed first try (forge-claim a), shipped end-to-end:
  sim (INTRO.flash/takenShown, straggler, settle), art (extent mirror fix,
  flash overlay, bubble, stride), probe fields, 5 new sim pins + 5 new
  browser pixel legs, `straggle-gone` mutant + `crime-unnamed` re-anchored
  (now kills caption AND flash). Rule-5 merge clean; prod verified (Vercel
  alias + lazy-chunk content grep); #2897 closed shipped.
- The extent-mirror discovery moved the fix from "shorten the tumble" (QA's
  guess) to the real cause — QA saw the detached head/torso of the broken
  mirrored layout, not rotation fuzz. Live KOs benefit too.
- Pixel-leg lessons (software-rendered Chrome): transient effects need a
  plateau — a 3-tick flash at 0.45+ alpha got stepped over by ~4-tick paint
  hitches twice; 8 ticks with the first >=0.45 holds. Count paints at the
  canvas API (patch fillRect BEFORE the start press — the game canvas is
  created only when play mounts) and treat luminance deltas as fallback.
  The settle leg reads only the columns LEFT of the corpse's center — the
  walking Amon overlaps the body's right half at those ticks.
- Pre-existing advisory flakes, unrelated to this change: the game-over/
  attract legs' fixed waits (main reproduced its own variant, mid=29 skip
  leg; my run flaked once, passed on rerun). Left alone per rule 3.

## OPEN
- building-qa: #2915 (R-TYPE capsule list), #2889 + #2863 (DD polish).
  Unowned feedback: none. game-queue: empty.
- #2910 open — never-dry kick unactionable when score is feedback-only.
- R-TYPE README gaps behind QA's #2915: armed Williams duelist, carrier
  interceptors, straight salvos + autopilot pre-dodge, wing shell
  initiative, dark-seat free life. Oldest unowned = armed Williams duelist.
- CONTRA honest gap: the original's second air layer (mid-boss gunships,
  hangar door).
- DD: all QA-pass items through #2897 shipped; no unowned README gap.

## NOTES for the next lane
- idle-kick expected: R-TYPE `armed Williams duelist` or CONTRA gunships —
  fetch first, slots ship fast (this session saw #2912/#2913 land mid-run).
- R-TYPE harness surface is rich (`__rTest.setup/probe`, stateHash, named
  mutants) — see its README.
- ddragoncheck movie legs now include #2897 pins/legs; the flash counter
  patches CanvasRenderingContext2D per page — no leak across legs (per-page).
- Prod verify: jalfern.com edge caches negatives during deploys; verify the
  lazy chunk hash against retrogames-psi.vercel.app too (slot b's lesson,
  confirmed again today).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main @ this STATE commit.
- Lane worktree retrogames-forge-dd-opening-polish removed after merge.
- Ports 5173 + 5175 (debug) stopped via scripts/devstop.sh; QA ports left
  alone. NOTE: ~/Dev/retrogames-forge-contra-loop-fx held local `main` at
  merge time and made gh's post-merge re-checkout fatal (manual detach
  sufficed) — that stale worktree should be removed by its owner lane.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private, due 11-23.)
- #2908 (QA lane) — DD idle-P2 seat law (not ours, linked for the board).
