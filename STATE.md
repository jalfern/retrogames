# STATE — session 23 (2026-10-25)

## Shipped this session
- **MAGIC CARPET HD (#1083 → PR #1089, squashed to main as 6de6ed8)**: resumed
  the #1083 corpse (worktree on current main, 879-line renderer.js + shell edits
  uncommitted, never pushed). Fresh WebGL2 world pass (three.js, COMET DRIFT HD
  house pattern); #1059 sim rules byte-identical:
  - terrain heights sampled in the vertex shader from a live RGBA8 data texture
    (R=height, G=lava glow, B=scorch) re-uploaded every tick — blasts visibly
    tear the ground, low craters flood; geometric sea + shader ripples/glitter/
    foam; gradient sky dome with sun glow + fbm clouds; three per-world PALs.
  - instanced fire/smoke/embers, fireball/bolt trails, jagged additive lightning,
    carried-mana halo motes; bright-pass bloom + vignette; bank/pitch/FOV-stretch
    camera; HUD stays the crisp 320×200 blue-stone overlay.
  - **The corpse bug**: `uOrigin` subtracted HALF twice (geometry already spans
    ±HALF) → camera flew 288u outside its own terrain; only the sky dome drew.
    Found by rendering the terrain alone in a red MeshBasicMaterial and splitting
    shader-vs-geometry — not by staring at the black frame. Fixed origin snap.
  - tap-to-start fixed too: pointer listeners were attached to the
    pointer-events:none HUD canvas (and removed from glCanvas).
- `carpetcheck` 30→44 gates. Load-bearing new gate: dig a hot crater 70u ahead,
  near ground must light up (camera-on-grid proof). Proven-fail mutant = the
  corpse bug: reintroducing the double-offset turns it red, all sim gates green.
  Headless drive (boot/attract/key+tap start/steer/deny-cast/death/restart),
  contractcheck, lint×3, build — all green. Prod verified (index-BGCiZhc4.js).

## Playable now
- jalfern.com/retrogames/magic-carpet — fly the GPU world; craters form under
  you, lava glows then cools, three worlds, three skies.

## Branches / harness
- forge/magic-carpet-hd deleted by squash; worktree `~/Dev/retrogames-
  forge-magic-carpet-hd` removable (its stale :5173 dev server was reused this
  session — kill it before the next lane starts its own dev server).
- **CORAL REEF corpse checkpointed**: the dead session's uncommitted
  reef.html/reefcheck draft (743+/827-) now pushed as `forge/coral-reef-gpu`
  (tip WIP, never run/gated, syntax-parse-clean; base predates main — resume
  with `git rebase --onto origin/main d0a473b forge/coral-reef-gpu` in the
  worktree, per #1050's latest comment).

## Next candidates (unclaimed)
1. **#1050 CORAL REEF GPU rebuild** — resume the pushed corpse (step 1b),
   rebase onto main, then the issue's five-feature spec stands (raymarched reef,
   boids, Beer–Lambert water, caustics, god rays).
2. Queue is otherwise empty → flagship polish stage (#841) next if coral is
   blocked; QA holds #1090 (carpet polish), #1082, #1063 — don't touch those.

## Open questions
- none filed this session.

## Watch-outs learned
- A "terrain" pixel sample can be the sky dome: gates that compare ground-vs-sky
  colors pass on a camera stranded outside its grid. Tie terrain gates to an
  action at the feet (dig → pixels must change), not to color alone.
- readPixels y grows UPWARD: sampling "ground at 0.8" actually sampled the top
  of the screen. Two probes lost to this before it clicked.
- Fine noise texture (grain) is finer than the pixel footprint at cruise
  altitude — variance gates must sample at feature scale (horizon band, crater
  reaction), not per-pixel sd over flat grass.
- Resumed corpses: finish the pointer-events audit — listener target vs
  removal target and CSS pointer-events must agree on which canvas eats taps.
- A dead session's uncommitted work is only as durable as its disk: step-1b
  finds pushed branches; this lane pushed the coral corpse so it now exists.
