# /retrogames/demos/

Self-contained technology demos (Jon, 2026-10-19: demos live only here — no
registry entries, no arcade links). Each demo is one HTML file; the only
permitted sibling files are shared generators (`ocean.stars.js`, `credits.js`)
loaded by relative `<script src>` — never absolute URLs (the per-demo `*check`
"self-contained" gates enforce that).

## Adding a demo — checklist

1. `public/demos/<name>.html` — self-contained, zero libraries, synthesized
   audio only (unlock on first click), drag-to-look, a `__<name>Test` DEV hook
   (`ready`, `frames`, `setPose`, …) so the harness can sense it.
2. Credits card (#674) — mandatory, two tags before `</body>`:

   ```html
   <script>
   window.DEMO_CREDITS = {
     name: 'NAME', accent: '#rrggbb',        // accent = the demo's own key color
     issues: [123], span: '~Nh', shipped: 'YYYY-MM-DD',
     assist: 'solo',                        // solo = goal only | guided = methods spelled out
     note: 'one honest line about the brief',
   };
   </script>
   <script src="credits.js"></script>
   ```

   `credits.js` renders the bottom-right `BUILT BY QWEN ▸` tag and the card
   (model + Mac Studio, issue link, issue→ship span, help level). Keep the
   facts honest: `assist` must match the wording of the source issue;
   `span` is the issue-opened→shipped span, labelled as such on the card.
   Builder model is centralized in `credits.js` (`MODEL`).
3. Link it from `index.html`: a card with `id="<name>"`, href resolved from
   `base` in the page script, an entry in `window.DEMO_INDEX` (same four
   facts), and the card stays inside `.wrap`.
4. `npm run creditscheck` — proves every demo + the index carry complete,
   consistent credit cards (and opens one card in headless Chrome).
5. `scripts/<name>check.mjs` + npm alias — the demo's own pixel gate.

## Files

- `credits.js` — shared credits injector (#674), configured via
  `window.DEMO_CREDITS` (demos) / `window.DEMO_INDEX` (the index page).
- `ocean.stars.js` — Yale BSC star data for OCEAN/MOUNTAINS skies
  (`node scripts/build-ocean-stars.mjs` regenerates).
- `physicswalk.core.js` — PHYSICS WALK engine (#1204), below.

## physicswalk.core.js engine notes (#1204)

PHYSICS WALK is the dynamics rung under STICK WALK: an 18-particle XPBD rig
(torso brace + two knee-ankle-heel-toe legs + two shoulder-pinned arm
pendulums) with stiff distance constraints,
hip/knee/ankle motors applied as momentum-conserving virtual-work torque pairs,
and penalty ground contact (spring-damper normal + Coulomb friction bounded by
the true per-point normal force, so the foot rolls heel-to-toe instead of
gluing). Balance = torso-pitch PD through hip+ankle, a hip-height lift reflex,
and margin/trailing-based step triggers that place the swing foot ahead of the
CoM. Arms (#1218) are honest pendulums: the shoulder torque reaches the hand
*opposite* the same-side foot's travel (`target = CoM − armG·(foot−CoM)`,
clamped), still a virtual-work couple closed at the joint — searched gains give
8–9 cm carry swing with hand-vs-foot correlation ≈ −0.9 and inter-hand
anti-phase ≈ −0.67 (they windmill when over-driven: the search rejected
30–60 cm candidates). Controller gains were searched (60k+ candidates in Node);
arm gains too (~400 valid candidates; the ladder is rounding-sensitive at the
1.5 m/s topple boundary — keep full float precision when editing).
Determinism is guaranteed (no RNG). Gated by `npm run physicswalkcheck`
(34 gates incl. a balance mutant and an arm gait-coupling mutant).
Honest gaps: planar balance only (no lateral DOF); sustained steady walking
settles into a stagger, not a stride cycle; collision uses point feet
(no toe-ramp mesh).

## blackhole.html engine notes

Schwarzschild flyby + plunge + probes as before; key `K` (or `?spin=1/-1`)
switches to a Kerr black hole (a* = 0.9): a separated null-geodesic integrator
(Bardeen r/theta/phi with Carter constants from a static-tetrad launch) makes
the D-shaped shadow, Lense-Thirring bend asymmetry and frame-dragged disk
emerge from physics. Honest gaps (also on the QA pass issue #1082): the
photon-ring glow uses the Schwarzschild b_crit locus; the plunge cone/Doppler
formulas and the probe-beacon integrators stay Schwarzschild; the disk inner
edge stays at 3rs rather than the Kerr ISCO (2.32M prograde).
