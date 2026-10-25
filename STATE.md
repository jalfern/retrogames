# STATE — session 21 (2026-10-25)

## Shipped this session
- **BLACK HOLE plunge** (#1048 → PR #1076, squashed to main as e74433d):
  the flyby loop now ends by actually falling in. After the close pass the drone
  tips to a radial infall r(s) = rs·(1 + (R1/rs−1)(1−s)^3.5) and crosses r=rs.
  The outside sky compresses into the escape cone (sin²α = 27M²(1−rs/r)/r², given
  by the demo's own null-geodesic tracer) while the shadow fills the frame;
  infall Doppler D = √((1+β)/(1−β)), β=√(rs/r), beams the sky D³ and blueshifts
  it — a bright blue-white disc, hottest as the cone collapses. No flash at the
  crossing; the dark interior fades back to the loop start and probes clear.
  The drone holds its tip-over while dropped beacons (#1047) are still in view.
- **Real physics bug fixed on the way**: the tracer used Euclidean screen angles
  for the impact parameter; near the horizon the local-tetrad relation
  b = r·sinψ/√(1−rs/r) diverges, so escape/capture at depth was wrong (whole
  frame whitened). Launch conditions are now the correct local-frame ones
  (b, w from the radial equation) in the shader AND both JS mirrors. Photon ring
  gated to r>1.5rs (no limb glow inside the photon sphere); disk fades as the
  diver falls past it.
- Rebased onto QA's #1074 probe polish mid-flight (same files!); probe weights
  now ride the loop fade too.
- `blackholecheck` 75/75 (was 59 on main): +16 gates — cone-formula match,
  monotone r, blueshift rise, cone→0 at horizon, pixel gate (>50% dark frame +
  bright blue-white core), loop auto-restart, local-tetrad launcher. Fifth
  proven-fail mutant: pin uBeam=1 → disc pixel gate red, all physics gates green
  (the bright circle is computed, not painted). Verified live in prod.

## Playable now
- jalfern.com/retrogames/demos/blackhole.html — watch one loop: flyby, probe
  drops (tap), then the plunge with the shrinking blueshifted sky circle.

## Branches / harness
- forge/blackhole-plunge deleted by squash; worktree `~/Dev/retrogames-forge-
  blackhole-plunge` removable. Main checkout detached at e74433d.
- main's node_modules symlink in worktrees is a local convenience only.

## Next candidates (unclaimed)
1. Game-queue oldest: **#1049** BLACK HOLE spin (Kerr ergosphere — the plunge
   machinery + the now-correct local-tetrad launcher are the head start),
   then #1050 CORAL REEF GPU rebuild.
2. #1063 EMBERWOOD act-two polish stays QA-owned (`building-qa`) — don't touch.
3. New polish filed for QA lane: **#1077** (plunge audio, tidal shear on the
   sky disc, singularity light-show, dive telemetry HUD, tip-over cue).

## Open questions
- none filed this session.

## Watch-outs learned
- A camera looking AWAY from the hole exposes the tracer's far-field shortcut:
  Euclidean screen angles are NOT local physical angles near the horizon; use
  b = r·sinψ/√(1−rs/r) with w from the radial equation, in GLSL and every JS
  mirror, or deep-dive frames whiten out.
- The photon-ring term glows for ALL escaping rays (b<b_crit ⇒ ring=1); gate it
  to r>1.5rs or the deep plunge's radial center burns bright.
- QA lane can merge into the same files while you build (#1074 vs #1048 hit
  blackhole.html/index/blackholecheck all three) — expect to rebase and
  semantically re-apply, then re-prove mutants on the rebased tree.
- Screenshot-vs-jumpTo timing skew (~0.3–0.4s under headless) crosses short
  phase boundaries: keep money-shot windows ≥1s and capture at window mid.
