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

Verified by `npm run horsecheck` (44 gates: boots, footfall order, suspension,
zero-slip audit, seam equality + touchdown continuity, sprite↔state pixel
probes incl. a control-window dust test, phone viewport, demo law) — two
by-hand mutants (slack stance lock; fore pair landing after hind pair) each
kill exactly their intended gates. Credits card `assist: 'solo'`.

Polish pass 2 (#2220): mane/forelock/tail flutter carries cross-stride noise
seeded on stride-index mod 8 with a smoothed crossfade — the gallop loop stays
bitwise exact while no two strides flutter alike. The ground gained sage tufts
and two worn ruts; ruts are tiled INTO the ground grid as z-strips (coplanar
overlay quads lose the painter sort to the big cell triangles — the tufts
hug the track but never inside the camera's blow-up corridor). Six subtle
speed streaks whip backward every stride; the muzzle grew a jaw step and the
ears got taller. Proven by law hooks (`maneCoeff(n)`, `tufts()`, `ruts()`,
`streaks(p)`, `setTravel(m)`) plus pixel bands pinned at a deterministic
travel; mutants (flat mane noise, no rut strips) each kill exactly their gates.

## Files

- `credits.js` — shared credits injector (#674), configured via
  `window.DEMO_CREDITS` (demos) / `window.DEMO_INDEX` (the index page).
- `ocean.stars.js` — Yale BSC star data for OCEAN/MOUNTAINS skies
  (`node scripts/build-ocean-stars.mjs` regenerates).
- `physicswalk.core.js` — PHYSICS WALK engine (#1204), below.
- `learnedwalk.core.js` + `learnedwalk.policy.js` + `learnedwalk.html` —
  LEARNED WALK, the rig steered by a trained MLP (#1205), below.
- `fox-gemini.html` — FROSTBRUSH, procedural 3D red fox rotary gallop in WebGL2  (#2261, guest Gemini 4 Carbon build), below.
- `fox.html` — RENARD, procedural red fox rotary gallop on Canvas 2D (#2261, the Qwen corner of the fox battle), below.
- `horse-gemini-hd.html` — THOROUGHBRED, procedural smooth-skinned HD 3D
  thoroughbred transverse gallop in WebGL2 (guest Gemini 4 Carbon build), below.

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

## fox-gemini.html engine notes (#2261 — FROSTBRUSH)

Guest Gemini 4 Carbon entry for #2261: a procedural 3D red fox (*Vulpes vulpes*)
running a rotary double-suspension gallop down a frosted boreal silver-birch
glade at dawn in raw WebGL2 (zero external libraries, zero imported meshes or
image/audio assets; design note in `docs/fox-gemini-design.md`).

Anatomy & lofting: a single continuous 15-station elliptical tube spans rump to
chest ruff, diamond cheek flares, narrow rostrum and glossy nose button with
zero neck seam (`cross([0,0,1], T)` sagittal frame completion avoids parallel
roll flips across +X, -X and -Y chains); paired with slanted amber eyes,
black-backed / cream-inner pinnae, an 8-station 50 cm snow-tipped brush riding
a phase-lagged S-wave, and four digitigrade limbs with black stockings solved
by analytical 2-bone IK (`maxIkRatio = 0.974 < 1.0`).

Gait & loop laws (`window.__foxTest`): 4-beat carnivore rotary footfall order
`LH -> RH -> RF -> LF` with two suspension phases per stride — extended flight
(~19% of stride, 0.84 m paw span) after hind pushoff and gathered coiled flight
(~25% of stride, wider-tracking hindpaws crossing ahead of forepaws under the
arched lumbar spine) after fore pushoff. Stance paws lock to world touchdown
anchors (measured slip 0.000 mm analytic and live rAF) with C1 Hermite swing
curves over an 18.0 m (12-stride) periodic terrain + birch glade (0.000 mm
seam). Rendered with a 1024² `DEPTH_COMPONENT24` 3×3 PCF sun shadow map,
guard-hair rim sheen, four-toed frost pawprints, kick-up clods, warm breath
plumes, and Web Audio cushioned paw strikes + hoarfrost crunch.

Verified by `npm run foxgeminicheck` (34/34 gates across demo law, index href,
boot, rotary gait, double suspension, zero-slip, IK reach, loop seam, pixels,
pointer orbit, mute toggle, and 390×844 phone layout; stance-slip and
transverse-swap mutants proven red and restored).

## fox.html engine notes (#2261 — RENARD)

The Qwen corner of the fox battle: a procedural red fox at a true four-beat
rotary gallop (LH·RH·LF·RF) across a golden-hour snowfield, rendered by a
hand-written perspective painter on Canvas 2D — no WebGL, no libraries, no
assets. Where FROSTBRUSH is geometry-processing (WebGL2, depth-texture PCF),
RENARD is arithmetic-only: every face is a flat-shaded projected polygon and
every pixel comes from two lambert wraps + snow bounce + sun rim computed in JS.

Anatomy: ~380 quads — an 11-station lofted elliptical spine (hips → poll) with
a deep chest, tucked waist and flat running neckline; wedge head with dark nose
cap, amber eye slivers and dark pinnae that pitch with the head; four limbs as
tapered 6-sided tubes on 2-bone rearward-pole IK (near pair dark, far pair
hazied); a 13-station bushy tail swelling to a broad white tip, driven by a
S-wave plus per-stride noise seeded on stride mod 6 (loop-safe wander).

Gait laws (`__foxTest`): stride 2.6 m @ 0.55 s (≈4.7 m/s — a real fox gallop,
sized so stance travel never exceeds the limb chord: hind 0.44 ≤ 0.61 m, fore
0.42 ≤ 0.65 m). Onsets LH 0 · RH 0.20 · LF 0.58 · RF 0.78, suspension 0.34 of
stride (two flight gaps: extended and gathered). Stance paws are world-pinned
touchdown anchors (measured slip 0.000 mm) — the IK works FROM the fixed anchor
as the body travels over it; swing is a smootherstep ground-track arc from the
just-left anchor to the next. The back cracks: dorsal arch ±0.05 m peaking just
before the hind gather, with the neck counter-flexed so the gaze stays steady.
All pose is a pure function of φ (+ stride-mod-6 noise), so 6 strides = 15.6 m
close the seam exactly (measured 3.6e-15). Scenery lives in fixed world space
periodic with the loop (ground lattice 1.3 m × 12 slots, ridge harmonics
m·2π/LOOP, spruce/cloud jitter hashed on slot mod 3 — twin-slot rule) so every
parallax difference between sky, ridges, trees and snow is physical AND
seam-closed by construction. Snow keeps a fading paw-print trail (life 2.4 s <
loop), snow-puffs burst at each landing, sparkle twinkles on φ; audio is
layered paw thumps (heavier hind pair), wind, and a descending vixie call.

Verified by `npm run foxcheck` (29 gates: boot/paint/sky/snow, footfall order,
suspension band, slip, 6-stride seam, arch range, chord budget, mid-swing
clearance, footfalls exactly on-plane, sprite↔state coat/head/tail-tip/shadow
pixel probes, print accumulation + trail pixels, horizon spruces, phone
390×844, demo law). By-hand mutants proven red then restored: stance anchor
+20 mm (only slip gate red — the lock is load-bearing), LF onset 0.58→0.30
(order + chord red), flex amplitude 0 (only arch gate red).
Honest gaps: stylised low-poly coat (no fur, no ruff fluff), face detail is
silhouette-grade at default zoom, breath visible only as the coat swell, and
the tail wave is kinematic rather than flocked.

## horse-gemini-hd.html engine notes (THOROUGHBRED)

Guest Gemini 4 Carbon showcase horse: a procedural smooth-skinned HD 3D
thoroughbred running a seamless four-beat transverse gallop down a sunlit
highland meadow track in raw WebGL2 (zero external libraries, zero imported
meshes or image/audio assets; design note in `docs/horse-gemini-hd-design.md`).

Anatomy & lofting: a continuous Catmull-Rom axial spline mesh (`muzzle -> head
-> neck -> withers -> barrel -> flank -> croup`) lofted with polar-harmonic
cross-sections, breathing ribcage, and stride-driven muscle bulge, paired with
four continuous high-resolution limb skins whose shoulder and haunch skirts
blend normals into the trunk, cupped pinnae, glossy eyes, 24 curved 3D
mane/forelock ribbons, and a 28-plume wind-streamed tail (~8k+ horse tris).

Gait & loop laws (`window.__horsegeminihdTest`): 4-beat right-lead transverse
gallop (`LH -> RH -> LF -> RF`) with ~30% gathered suspension flight, terminal
swing retraction matching ground speed at touchdown, world-pinned stance hooves
(`0.000 mm` slip across analytic sweeps and live rAF frames), suspensory pastern
hyperextension under vertical load, toe-pinned breakover, analytical 2-bone IK
strictly within reach (`maxIkRatio <= 1.0`), and exact `pose(0) === pose(1)`
loop closure across the periodic highland track.

Rendering & audio: 2048² PCF directional shadow map (horse self-shadows +
ground), dual-lobe satin/velvet equine coat shading across 4 selectable coats
(`C` / `#coatbtn`), Kajiya-Kay anisotropic horsehair, Rayleigh/Mie sky, GPU-
instanced wind-swaying fescue grass, damp horseshoe prints, turf clods, ACES HDR
bloom, and synthesized Web Audio four-beat turf impacts, gravel crunch, nostril
exhalations, and valley wind.

Verified by `npm run horsegeminihdcheck` (34/34 gates across demo law, README
inventory, live index card href, boot, 4-beat transverse gait, flight phase,
analytic + live rAF zero-slip, IK reach, loop seam, WebGL2 coat/meadow/shadow
pixels, coat cycling, pointer orbit, mute toggle, and 390×844 phone layout;
stance-slip mutant proven red and restored).
