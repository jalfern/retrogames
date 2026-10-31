# STATE — session 50 (2026-10-30)

## Shipped this session
**CAMPFIRE fidelity trilogy (#670 follow-ons)** — Jon picked the order
(ground → flame → life layer) after a visual review; one PR each, all merged:
- **#1255 ground** (adedc8e): fwidth footprint-attenuated ground detail (kills
  the vertical moiré bars), bounce-lit shadow floor 0.22→0.55, softer
  penumbra, soot bowl + trodden sand ring, log char glow. New gate
  `lit ground graded` (meanR>55 of tight lit box): 47.5 pre → 63–76 post;
  mutant (floor→0.22) = 45.7 red.
- **#1261 flame** (847ed2a): anisotropic upward-licking wrinkles, higher-
  contrast lobes + upper tear = distinct tongues, propagating flicker
  (`sin(t·6.7 − h·5.5)` — tips lag base ~0.1 s), white confined to coal bed,
  gold body, blue base; solid near-field `fall` clamp 1.15 (was blowing logs
  to tan); irregular stone ring (even ring threw picket-fence shadows);
  grain octave 26→11 (26 beat near Nyquist in the bright pool).
- **#1264 life layer** (37b05fd): spark streak trails (analytic path drawn
  at 4 age-offsets), flare-coupled per-group spark pops, taller/warmer lit
  smoke plume, heat-haze wobble in composite (masked to plume column).
  Gate: `heat haze knob` hook round-trip (mutant: hooks removed = red).
Suite 21/21 green (was 19 pre-PRs), frame time unchanged at 16.7 ms
@1600x1000 (45 ms budget).

## Hard-won facts
- **Pixel gates cannot separate haze from flame self-flicker**: toggle-vs-
  baseline ratios 1.10–1.46 in normal runs fully overlap the wobble=0
  mutant (1.13); 6 averaging rounds don't help — the noise isn't variance,
  it's the flame evolving between screenshots. Recorded in the harness
  header rather than shipping a green-but-hollow gate.
- Same trap for spark-streak visibility: any plume box above the pit is
  dominated by flame-tip glow (dimming sparks 12× left box count 88→89).
  Spark correctness stays covered by burst-cluster invariants.
- Dark-fraction metrics swing ±0.07 with noise phase → use mean-R (or
  multi-frame averages) for grading checks.
- **sed mutants contaminate siblings**: `s/mix(0.22…5.2/…0.55…/` hit both
  ground and stone lines — PR1 shipped stone floor 0.55 (intended 0.25;
  gate evidence still consistent, corrected in PR2). Mutate via node
  replace on a unique anchor, not line-based sed.
- GitHub "8 files changed" diffstat printed under a merge can belong to a
  concurrent lane; verify squash commit content before worrying.

## Next goal
`game-queue` unchanged from session 49: #1141 stage 4 (robot-lab USD→GLB +
rigid-body chain) is the standing carry-over, claim deliberately next
session. No campfire follow-ups pending; #670 stays closed.

## Harness
campfirecheck now 21 gates (+graded-ground, +haze-knob), mutants 3 & 4
documented in its header. CI `static` green on all three merges; advisory
jobs not waited on (rule 3).

## Environment notes
- Main checkout detached at origin/main (37b05fd). Worktree
  `~/Dev/retrogames-forge-campfire-fidelity` detached at origin/main,
  branch merged+deleted, node_modules symlink removed — prune or reuse.
- Concurrent lanes merged during session: #1262 (demo FEEDBACK block,
  touched campfire.html too — verified coexistence with my changes),
  #1263 (voice layer).

## Open questions for Jon
- none new (visual-fidelity order + gate-honesty calls were made in-PR
  with data; happy to revisit the abandoned pixel gates if you see a
  deterministic design).

## Carry-over
- #1141 stage 4 (above). Prod: Vercel deploying 37b05fd; spot-check
  jalfern.com/retrogames/demos/campfire.html after deploy.
