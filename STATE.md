# STATE.md — The Forge (rewritten at slot b close, 2026-11-21; COMMITTED: game
# code merged this session — R-TYPE Options pods, PR #2920 → 4ddb325.)

## PLAYABLE (main)
- /retrogames/r-type — the OPTIONS pods are live (#2919 → PR #2920 → 4ddb325):
  authored O capsule on leg 1 (camX 500, riding the slab lip at y 92); two gold
  orbs fly in (~2 s ceremony, zero rng) and dock at (x−14, y∓11); while docked
  every vulcan press mirrors one round per orb (symmetric ∓11) and `double`
  mirrors the twin stack — the arcade's six-round shield-gun wall. Inbound orbs
  never fire; spares pay 1000; the wreck strips orbs with the arm (power-armour
  law) — per hull, seat two included (S4). stateHash covers the pair + run.
  rtypecheck 174 laws + 18 named mutants (new: `mirror-deaf`, `opts-leak`), all
  green locally incl. the mutant run; winnability re-measured: solo 8/12, co-op
  11/12 — floors (≥4 / ≥6) hold. Prod verified (optdock in index-BYrC7k1l.js).
- /retrogames/contra — hangar sorties at the gate (#2918 → c5f239e), + the
  Double/Speed Up fixed-spot pods (#2915 → 9b68fac).
- /retrogames/double-dragon — opening movie (#2897 → dd067eb), plus everything
  before it (SSE: full R-TYPE, DD, Contra loops on the shelf, private until Jon
  promotes — #379).

## WHAT THIS SESSION DID (slot b)
- NEVER-DRY pick shipped the normal way: board empty, warden tick saw R-TYPE 0 →
  filed POLISH #2919 (game-queue + lane:games), claimed via forge-claim.sh, built
  in `forge/rtype-options`, gated (eslint, 3 scoped lint gates, build, rtypecheck
  sim+browser 174/174, mutants 169/169), merged with the rule-5 command, verified
  prod, shipped label, closed #2919 on its stated scope (Options = capsule-list
  Part 2 per #2915's own part plan).
- Fidelity interpretation recorded on the issue (#237): arcade `O` is a fixed
  spot (not a cycle step); options mirror the vulcan lineage and die with the
  hull. Cycle V→L→W pins and every #2915 pin stand byte-identical.
- #2797 evidence posted (mirrored recurrence): the warden targeted #2919 to slot
  a while slot b held it live; self-corrected at claim (issue now closed). Fix
  landed mid-session: 72e6cca (#2921 idle-holds — kick_slot holder-skip,
  idle-kick fail-closed, flagship rung honors builder-held titles).
- QA/never-idle lanes verified live throughout (mini :5174, mini2 :5179); port
  discipline kept: this lane only ever touched :5178.

## OPEN
- No `building` issue at close; game-queue empty. The shelf is NOT dry:
  idle-kick will answer R-TYPE again — the README's capsule line now names only
  Half-Capsule (part 3), and Options-launch (throw the orbs as drones; B is the
  shell verb here) joined the honest gaps. Both unowned, both real gameplay.
- building-qa: #2889 + #2863 (DD polish) still with QA.

## NOTES for the next lane
- Half-Capsule spec sketch: shrink pod — hull halves, hit-box AND art together
  (#2915 part-3 wording); it touches every collision radius, budget for it.
- Options laws worth keeping when you touch orbs (README #2919 paragraph): orbs
  are guns only — no collision, no orbit; px/py are sim-written once per tick
  (the bits' discipline); `optAnn` is juice, never hashed. Mutant anchors
  `twin-collapse`/`speed-deaf` re-verified after #2920 — the seat-1 hull twin
  push line is still the first occurrence, don't disturb the order.
- The 308: jalfern.com redirects `/retrogames/<route>` without trailing content —
  use `curl -L`. Lazy chunks are named `index-*`/`art-*`, not `RType-*`; grep
  chunk bodies for event strings (e.g. `optdock`) to prove a deploy carries a
  feature.
- Dry-shelf jonq ask unlocks ~11-27 (#2795 answered 11-20; 7-day rule).
- Winnability moved up with the orbs (4→8 solo, 6→11 co-op runs). The pinned
  floors stay low on purpose; the extra firepower is the point of the stage.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main @ 72e6cca, this STATE.md
  committed on top (game merged → allowed) and pushed.
- ~/Dev/retrogames-forge-rtype-options: this lane's worktree, branch
  `forge/rtype-options` squash-merged and deleted on remote; worktree can be
  pruned (`git worktree remove ~/Dev/retrogames-forge-rtype-options`).
- Port 5178 stopped with scripts/devstop.sh at close. Other lanes' ports
  (5173/5174/5179) untouched all session.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON to public? (default keep private,
  due 11-23 — Jon.)
- #2908 (QA lane) — DD idle-P2 seat law (not ours, linked for the board).
- No new question filed this session — the board had work; nothing taste-level
  needed Jon.
