# STATE — session 18 (2026-10-25)

## Shipped this session
- **NEON RAIN demo** (#1042 → PR #1064, squashed to main as 6258e8b): WebGL2
  raymarched neon city at night in the rain — procedural towers (lit windows, neon
  bands, storefront strips, rooftop rims), fog-extincted LOS canyon glow,
  puddle-masked wet mirror (two pitched mirror rays), 3-layer screen-space rain
  streaks + splashes, steam vents, deterministic traffic point-sprites, bloom+ACES.
  Synthesized rain/rumble/horns/whoosh. Live: jalfern.com/retrogames/demos/neonrain.html
- Resumed a **corpse**: previous session died with an unpushed, unwired neonrain.html.
  Its washed-out render had one root cause: the camera right vector was the left
  hand (`[f.z,0,-f.x]`) — the whole frame rendered upside-down. Fixed; re-tuned
  glow/fog/steam budgets from debug views (dbg=1..5 pass added, then trimmed).
- `neonraincheck` (npm alias) 25/25 green: pixels + deterministic JS mirrors;
  mirror load-bearing proven via **in-frame readPixels** differential (screenshots
  lied: the compositor and camZ/drift drift between shots swamped the Δ; the
  frozen-scene grab gate is deterministic). Proven-fail: mirror→0 mutant red.
- `creditscheck` extended to 8 demos (83/83) + fixed a pre-existing blackhole
  index/config issues mismatch ([903] vs [903,956]).
- Polish pass filed for QA lane: **#1066** (rain-neon interplay, mullions, beacons,
  car light shapes, big plumes, siren doppler, 390px portrait).

## Playable now
- NEON RAIN on the demos shelf and live — drag to look, tap for sound, credits card.

## Branches / harness
- forge/neon-rain branch deleted by squash; worktree `~/Dev/retrogames-forge-neon-rain`
  can be removed (`git worktree remove` after detach — done for main checkout).
- DEV hooks on the demo: setSpeed/setFreeze/setMirror/grab (readPixels) — spec'd
  for future demo harnesses; other demos could adopt `grab()` for determinism.
- Demo check gotchas learned (see #1066 context): screen-space rain is the only
  reliable look (two volumetric attempts read as static); a mirror gate needs a
  frozen scene + readPixels, not page screenshots.

## Next candidates (unclaimed)
1. **#1066** — NEON RAIN polish (lane:qa — QA lane picks; builders stay on games).
2. Game-queue: **#1050** DEMO CORAL REEF GPU rebuild; **#1047/#1048/#1049** BLACK
   HOLE stages (tap-probe / plunge / spin); **#1043** DEMO volcano at night.
   Oldest next — #1043 volcano at night.

## Open questions
- none filed this session.

## Watch-outs learned
- Never `git checkout -- <file>` to undo a probe-mutant while other uncommitted
  edits live in the same file — it silently reverted an hour of tuning; restore
  mutants by hand (sed the exact token) or stash.
- `reflK`, glow-rate and steam-integration are *visual* choices — a pixel gate
  cannot find a contribution the shader barely makes; make the feature loud first,
  then gate it (mirror Δ lum 1.6→3 by 0.30→0.55 wet floor, refl 0.9→1.15).
- A camera basis is right-handed only one way: r = normalize(cross(f, up)) with
  u = r×f; a flipped r produces a plausible-looking but 180°-rotated city.
