# STATE — session 240 (2026-11-12, slot b)

## What shipped
**HOMEBODY — SPATS & MAKE-UPS** merged as `c224a4d` (PR #2074, Closes #2070,
never-dry stage filed+claimed by this session).
- The sim's first negative relationship law: an idle pair within reach (≤2
  tiles) both under needs-avg 0.4 (`moodOf` 0) **spats** — house −8, −0.12
  social each, grudge sets, `spats++`, ≤1 per 40 s window; crossing an edge
  down fires new `rel-down`. While the grudge holds: **cold war** — proximity
  builds nothing, only absence cools. Same reach, both `moodOf` 2 → **make-up**
  +6 house, +1 content, grudge cleared, once per spat. No rng in triggers;
  seeds stay deterministic. (Fidelity: The Sims *orders* insults — we ship
  none of that; README says the law is neglect-shaped, romance stays open.)
- Tells: banner + sour two-tone + red sparks + jolt on the spat; warm chord +
  sparkles on the thaw; panel BONDS heart runs ash-dark (#8c3b34) for the
  grudge's life. `spats`/`grudge` ride `stateHash`.
- peoplecheck 124→148 (SPATS section, 24 gates: gating laws, exact −8/+6,
  cold-war silence, rel-down only at demoted edges, zero floor, cooldown even
  with grudge cleared, hash+determinism, pins). Mutant (neuter trigger) →
  exactly the 14 law gates red, restored byte-clean, 148/148 x2.
- homebodydrive 25→29: LIVE Chrome gates — spat docks 50→42, heart pixel-
  delta to ash-dark, thaw clears + ember returns. Zero page errors. New DEV
  hooks `foul()`/`thaw()` for QA to rig the scenario. lint:mario/fps/ai +
  eslint + contractcheck(homebody) + build green.
- Prod verified: marker "OTTO AND MIRA SPAT" live in chunk `index-Dwzn3-vU.js`
  at jalfern.com/retrogames/homebody; #2070 shipped-labelled + closed.
- Filed QA polish pass #2076 (no sprite-level spat tell, cold war invisible on
  the people, generic sparkle for the thaw, fade-demotions silent while
  spat-demotions announce, no teaching line) — all claims verified against the
  shipped code first.

## The session's catches
- **WeakestStage input shape matters:** gh returns `labels` as objects;
  `heldDirs`/`qaIssues` match on label *strings*. Object-shaped labels make
  `heldDirs=[]` — a QA-held game looked free. Flatten `labels` to names at the
  fetch. (An impossible `heldDirs` was the clue, per rule 8.)
- **Exact-value asserts in live drives collide with the resumed climb:** the
  make-up tick returns before the co-presence climb, so “exactly +6” only holds
  if the drive stops the loop the tick the event lands; and a 40 s sim window
  spans hour boundaries — refresh needs per tick or the pair starves into a
  faint and “miserable house cracks again” can never fire.
- **Pixel tells need delta-not-absolute scans:** the panel's resident name dot
  shares the heart's ember rgb, so absolutes mis-ranked; compare calm→hurt→
  healed deltas across the same scan band instead.
- **Shell greps die on ♥ under C locale** (“character not in range”, exit 1
  per iteration, loop still LOOKS like polls) — prod-marker scans with non-ASCII
  go in Node, not zsh grep.

## Ladder trail
TARGET #2065 REFUSED honestly (slot a held it, 32 min fresh — and their CivV
ship completed mid-my-session as `d6ef8b5`, slot a's session 239 fixed
its ship tail). No halt/steer/next; game-queue empty; QA MASTER live (pid
49867) → no feedback borrow; flagshipStage null (all four flagship READMEs
gap-free, parseGaps-verified live). Never-dry: `weakestStage` → HOMEBODY
score 4 (4 unowned README gaps, 0 named feedback; oldest of the score-4
titles; CivV + PPM skipped as held). Filed #2070 with the why-weakest line,
claimed clean, shipped one stage. No jonq filed.

## Open questions
- none (see waiting-jon issues).

## Next
- #2076 is the QA lane's HOMEBODY job; slot lanes unaffected.
- Slot a next session: their STATE queued the CivV Ark-parts never-dry stage
  (score 5, gap 0 “The Ark parts are one program, not city industry”). Slot b
  next session: re-run `weakestStage` — HOMEBODY's score dropped (4 gaps→3
  after this stage's README update; #2076 now names it, adding feedback —
  recompute honestly, don't copy this line).
- `viperpitcheck` still red-on-main, wired into NO CI job (flagged since 235)
  — re-file on a QA issue if nobody owns it.
- Dev servers at exit: slot b 5178 STOPPED; slot a 5173; QA studio 5176 (not
  mine — untouched). Worktrees: this session removed its merged
  `retrogames-forge-homebody-spats` registration after the squash; session-235
  candidates (ppm-portrait, ppm-bulletin, papers-photo) still stand.
