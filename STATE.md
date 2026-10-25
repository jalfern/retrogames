# STATE — session 20 (2026-10-25)

## Shipped this session
- **BLACK HOLE probe drop** (#1047 → PR #1073, squashed to main as abfea68):
  quick tap releases a glowing beacon onto a real Schwarzschild timelike
  geodesic (proper-time integration; e² = f0²/(f0−v²); tangential
  inheritance capped at capture threshold L≈2.3). Observer sees the textbook
  signature: slows in coordinate time (Δr 0.5→0.16 per sample), reddens
  (blackbody T0·g), dims (g³), freezes above the horizon, fades to black —
  never visibly crosses. Screen position solved per-frame from null geodesics
  (golden-section over one in-plane launch angle through the demo's own RK4
  bender; primary image by reflection symmetry). Additive HDR composite so
  beacons bloom; retire below visibility; ≤6 live. Audio unchanged (drone).
- `blackholecheck` 51/51 (was 41): 6 static laws gates + live fall/slow/
  red+dim/never-cross/freeze-image gates + retire + real-tap pixel gate
  (3–4k newly-lit px over the shadow) + phone quick-tap gate. Third
  proven-fail mutant: skipping the HDR beacon pass → pixel gate red, all
  physics gates green (probe is simulated, not painted). Restored by hand-sed,
  re-ran green.

## Playable now
- jalfern.com/retrogames/demos/blackhole.html — tap to drop probes during
  the flyby (drops during the close pass are the money shot).

## Branches / harness
- forge/blackhole-probe deleted by squash; worktree `~/Dev/retrogames-forge-
  blackhole-probe` removable. Main checkout detached at abfea68.
- creditscheck unaffected (card issues list extended to 903/956/1047).

## Next candidates (unclaimed)
1. Game-queue oldest: **#1048** BLACK HOLE plunge (fall through the horizon —
   same integrator + probe machinery is the head start), then #1049 spin,
   #1050 CORAL REEF GPU rebuild.
2. #1063 EMBERWOOD act-two polish stays QA-owned (`building-qa`) — don't touch.
3. New polish filed for QA lane: **#1074** (probe launch puff, motion trail,
   probe audio, Doppler hue, off-screen fade).

## Open questions
- none filed this session.

## Watch-outs learned
- A scripted camera is not an inertial frame: inheriting its velocity verbatim
  launched probes at superluminal local speed (e² blow-up). Correct local
  binding is e² = f0²/(f0 − v²), and tangential inherit must be clamped by
  angular momentum (L ≤ ~2.3 rs here) or probes ride centrifugal orbits
  instead of falling in.
- Coordinate-time freeze makes any fixed-length harness trail timing-flaky —
  fall duration depends on release radius. Sample until `r < 1.3` (adaptive),
  and gate the freeze phase on r-bucketed samples, not "last 3".
- jalfern.com serves `/retrogames/demos/…` with a 308 (canonical redirect) —
  prod-poll with `curl -L`; a bare grep reads the redirect body as "missing".
