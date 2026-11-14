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

## horse.html engine notes (#2147 — STRIDELINE)

A procedural low-poly thoroughbred at a seamless rotary gallop, rendered by a
hand-written perspective painter on Canvas 2D — no WebGL, no Three.js, no
imported meshes. The horse is ~35 tapered cuboids + prisms hung on gallop
kinematics; every visual is a pure function of the stride phase φ, and the
ground pattern period is 8 strides (48 m), so the loop closes exactly.

Gallop laws: rotary footfall LF·RF·LH·RH + a ~35% suspension phase; stance
hooves are solved **ground-locked** (in ground frame their position is
constant — measured slip is 0.000 mm), while the body heaves/pitches over the
planted feet via 2-bone IK per limb; the swing curve reaches the exact
touchdown point (seam continuity < 1 µm). Mane, tail, dust puffs and the
hoofbeat sounds all ride φ, so the whole scene — picture *and* audio — loops
with the stride. Renderer: view-space near-plane clipping, painter depth sort,
flat Lambert faces with sky/ground bounce and distance haze.
Known art simplifications: stylised anatomy (block torso, bead crest),
procedural mane/tail flutter rather than hair sim, hooves are boxes.

Verified by `npm run horsecheck` (32 gates: boots, footfall order, suspension,
zero-slip audit, seam equality + touchdown continuity, sprite↔state pixel
probes incl. a control-window dust test, phone viewport, demo law) — two
by-hand mutants (slack stance lock; fore pair landing after hind pair) each
kill exactly their intended gates. Credits card `assist: 'solo'`.

## Files

- `credits.js` — shared credits injector (#674), configured via
  `window.DEMO_CREDITS` (demos) / `window.DEMO_INDEX` (the index page).
- `ocean.stars.js` — Yale BSC star data for OCEAN/MOUNTAINS skies
  (`node scripts/build-ocean-stars.mjs` regenerates).
- `physicswalk.core.js` — PHYSICS WALK engine (#1204), below.
- `learnedwalk.core.js` + `learnedwalk.policy.js` + `learnedwalk.html` —
  LEARNED WALK, the rig steered by a trained MLP (#1205), below.

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

## learnedwalk.html engine notes (#1205)

LEARNED WALK puts a trained network at the controls of the PHYSICS WALK rig
(#1204): the hand-written balance/step controller is *not* used — instead one
23→16→16→3 MLP (mirrored to both legs, 707 params, motors as virtual-work torque
pairs through `sim.extra`) emits hip/knee/ankle torques from 23 sensor
readings (pitch, pitch rate, heights, leg phases, contact flags, CoM velocity).
Training is in-repo, deterministic Node: `node scripts/learnedwalk-train.mjs`
reproduces `learnedwalk.policy.js` byte-for-byte (mulberry32 seed 3). Method:
(1+1)-ES with Cauchy mutation (heavy tails reach the O(1..5) reflex gains;
uniform mutation was tried first — every uniform sample fell faster than the
zero net), 1/5-success breathing + stagnation bounce, stand→walk→refine
curriculum (A: survive+hip height; B: + metres with random pushes; C:
metres-weighted hill-climb at tight sigma on fresh seeds). Fitness seeds are
disjoint from the 5-seed report eval. The zero-torque net (bare rig) ships as
the baseline: it holds ~118 ticks and goes nowhere; the trained policy walks
~3.4 m net in 10 s and survives longer on every seed.
Honest gaps (also shown in the demo's HONESTY panel): the gait is a
forward-lurch, not a striding cycle — uprightFrac stays low and the policy
still topples on every test seed after a few seconds; planar only (#1204's
2D rig); no lateral DOF, no recovery steps; arms stay unactuated pendulums;
~3.4 m in 10 s is far from the scripted controller's pace. Learning happened
on metres+survival reward only — no imitation of the scripted controller.
Candidates are searched in rounded (4-decimal) space because serialization
rounding flips knife-edge gaits: an unrounded 2.98 m policy face-planted at
tick 35 once written to disk, so the trainer quantizes before scoring and
re-checks the serialized bytes against the bare rig.
The demo scrubber replays real checkpoints (gen 0 flails, falls faster than
the final policy). Gated by `npm run learnedwalkcheck` (30 gates incl. a
mirror mutant — flip `hipR: a[0] * CAP` to `hipR: 0` in learnedwalk.core.js
torquesOf and six gates go RED — demonstrated 2026-10-31, then restored).

## furlong.html engine notes (#2182 — FURLONG)

The no-limit sibling of STRIDELINE: a golden-hour thoroughbred at a true four-beat
rotary gallop in raw WebGL2 (no libraries, no imported meshes, no image assets).

Anatomy: smooth lofted elliptical tubes along curved spines (~3.6k tris) — barrel,
hindquarters, curved neck, skull/muzzle, jaw, ears, eyes — CPU-skinned over 25 bones
(bind pose = authored constants; v(t) = F(t)·inv(F0)·v0). CPU skinning is deliberate:
integer vertex attributes + mat4 uniform arrays proved unreliable on software GL
(SwiftShader INVALID_OPERATION), and 3.6k verts/frame is free.

Gait (the provable part): footfalls LH·RH·LF·RF with per-leg stance (hind 0.18,
fore 0.26) chosen so body travel over a planted hoof never exceeds the limb chord;
forward speed pulses ±30% via closed-form X(t) (fast off the hind push, absorbed
under the fore landing) so net advance is exactly V·T per stride; planted hooves are
ground-locked through pole-constrained FABRIK ending on the anchor; swing arcs run
from the lift-off point to the exact next touchdown anchor. Mane/tail/tufts/dust are
pure functions of phase. `__furlongTest`: slip measured 0 m, seam 1.4e-14 m
(8-stride loop), suspension ≈0.36 of stride.

Rendering: Blinn wrap-light + hemisphere fill + rim, 512² depth sun shadow with 3×3
PCF (horse self-shadows + ground), gradient dusk sky with sun disc and cloud band,
tileable procedural turf (period = 8 strides, seamless in-shader), distance haze.
Synthesized hoof strikes (distinct fore/hind timbres) + wind, unlock on first tap.

Two column-major math traps ate a full session — worth keeping as law:
`mat4invert` must dot R's COLUMNS (a[4i..4i+2]) with t, not its rows; and bone
frames must be completed by a continuous function of the bone axis (here X ↦
(−Xy, Xx, 0)), not Gram-Schmidt against a fixed hint (collapses on
near-parallel bones, flips 180° across the switch). Both passed every numeric
gait gate while the render was spider-legs — the render proofs in
`scripts/furlongcheck.mjs` exist because of it.

Verified by `npm run furlongcheck` — 28/28: boots + sky/ground palette,
temporal footfall order (up to phase origin) + diagonal-timing gate, suspension
0.36, slip 0 mm, seam 1.7e-14, stance/swing hoof heights, skinning matrices
rigid + bind-joints landing on runtime joints to <1 µm, chestnut/dark/sun-glint
pixels, centre occupancy, demo law, phone 390×844. Mutants proven red (then
restored, 2026-11-13): grounded target `X(tTd)`→`X(t)` (hoof rides body) —
exactly the slip gate goes RED (1439 mm); `LF td 0.48→0.05` — temporal-order
and diagonal-timing gates go RED (plus slip/stance collateral).

## blackhole.html engine notes


Schwarzschild flyby + plunge + probes as before; key `K` (or `?spin=1/-1`)
switches to a Kerr black hole (a* = 0.9): a separated null-geodesic integrator
(Bardeen r/theta/phi with Carter constants from a static-tetrad launch) makes
the D-shaped shadow, Lense-Thirring bend asymmetry and frame-dragged disk
emerge from physics. Honest gaps (also on the QA pass issue #1082): the
photon-ring glow uses the Schwarzschild b_crit locus; the plunge cone/Doppler
formulas and the probe-beacon integrators stay Schwarzschild; the disk inner
edge stays at 3rs rather than the Kerr ISCO (2.32M prograde).
