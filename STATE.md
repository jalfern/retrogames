# STATE — session 22 (2026-10-25)

## Shipped this session
- **BLACK HOLE spin (#1049 → PR #1080, squashed to main as 4620cf5)**: the hole
  can now spin. A separated Kerr null-geodesic tracer (Bardeen r/θ/φ, Carter
  constants ξ,q from a static-tetrad launch incl. the g_tφ cross term, RK4,
  capture at r+ = M+√(M²−a²), disk crossings at θ=π/2) engages under `uSpin≠0`.
  Everything lopsided EMERGES from the geodesics, nothing painted:
  D-shaped shadow (prograde capture 0.157 vs retrograde 0.375 at a*=0.9,
  flips with spin sign, symmetric-and-exactly-Schwarzschild at a=0),
  Lense–Thirring bend asymmetry 2.27 vs 1.35 rad, frame-dragged Keplerian
  disk Ω=√M/(r^1.5+a√M) + ZAMO Doppler (beamed side reverses with spin),
  GR constants verified: r+ 0.718, photon orbits 1.56M/3.91M, ISCO 2.32M/8.71M.
  Toggle: key `K` cycles off/prograde/retrograde; `?spin=1`/`?spin=-1` links.
  Default a=0 keeps all 75 legacy gates bit-identical.
- `blackholecheck` 75→87 green; sixth proven-fail mutant: dropping the
  frame-shift (ξ−a)² term from the JS mirror's radial potential turns the
  bend gate red while every Schwarzschild gate stays green. Verified live in prod.
- Bugs squashed on the way: static-tetrad launch initially dropped the g_tφ
  covariant conversion (mirrors showed impossible R(r0)<0 — the clue); the
  escape-direction reconstruction gave a zero-length final segment (wPrev
  updated before the break) — now derived from the geodesic velocity.

## Playable now
- jalfern.com/retrogames/demos/blackhole.html — press K (or open with
  ?spin=1): disk drags prograde with the hole, one sky side brightens and the
  shadow sits visibly lopsided. K again reverses.

## Branches / harness
- forge/blackhole-spin deleted by squash; worktree `~/Dev/retrogames-forge-
  blackhole-spin` removable. Main checkout `~/Dev/retrogames` is detached at
  the OLD main (0ef54e6) — next lane's step-1 fetch fixes it.

## Next candidates (unclaimed)
1. Game-queue oldest: **#1050** CORAL REEF GPU rebuild (WebGL2/WebGPU, from
   scratch). Then the queue is empty — flagship polish stage (#841) per rules.
2. **#1082** BLACK HOLE spin polish stays QA-owned (`feedback`, don't touch).
3. #1063 EMBERWOOD act-two polish stays QA-owned (`building-qa`) — don't touch.

## Open questions
- none filed this session.

## Watch-outs learned
- Regex source gates are rename-fragile: when refactoring shader variables
  (b→bb0, ring condition), update the gate regexes in the same commit.
- Adding screenshot time to a suite shifts loop phases; gates whose margins were
  ~0.1 sat on the edge and flaked. Fix physically (probe-trail break 1.3→1.06
  = deeper freeze) rather than by loosening thresholds.
- `perl -pi` with a space-mismatched pattern no-ops SILENTLY — always grep for
  the mutation after applying it (bit two mutant attempts).
- `jalfern.com` (bare) 308-redirects to `www.jalfern.com`; prod-verify polls
  must use www or `-L`.
- Static-tetrad Kerr launch: constants are covariant (E=−p_t, Lz=p_φ include
  g_tφ·p^φ, p^t=1/√(−g_tt)·E_loc); skipping the cross term passes most gates
  and fails only on near-horizon physics.
