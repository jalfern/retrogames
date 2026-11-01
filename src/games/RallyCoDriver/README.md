# RALLY CO-DRIVER — engine notes (#1251)

Original 2P night rally: the road hides itself behind crests, and the
co-driver's pace notes are the only thing that tells you what is over the
next hill. Closest original: V-RALLY's talking co-driver, rebuilt as an
information-split co-op. Pure sim: `sim.js` / `stage.js` / `calls.js`
(Node-importable, zero DOM, zero Math.random — the seed drives everything
the sim consumes).

## Track space

The stage is a CLOSED loop in arc length `s ∈ [0, L)` (L = 9000, 1800
samples). The car's state is `(s, lat, v, align)` — progress along the
ribbon, cross position (+ right), speed, steering angle. No win-by-reach
to game: the stage ends when two laps are done and the only score is the
clock. Curvature `k(s)` is smoothed (9-sample window); corners are local
|k| maxima above an 86th-percentile gate with a descending flatness floor
and a L/40 minimum gap, severity by magnitude thirds. Every seed has
>= 10 corners (rallycheck pins it for 5 seeds; seeds 1..40 measured 10-15).

Two detail harmonics (freq 6..9 and 10..13, small amplitude) are added to
the three base shape harmonics (2..5) so no seed can coast under the
corner floor — the base harmonics alone give only ~7-9 corner zones per
loop (seed-proven 2026-10-31).

## Crests are honest

`visibleAhead(st, s)` marches the sightline from the driver's eye
(elevation + EYE=14) against every intermediate sample; the road simply
does not exist on screen past the first hill that eats the line of sight
(hard fog wall FOG_RANGE=430 as the flat-ground ceiling). rallycheck
proves per seed that at least one crest hides the NEXT corner — the
co-driver's notes are load-bearing, not decoration.

## The co-driver's job

A CALL is `{ dir: -1|0|1, sev: 1|2|3 }`. Three sources, one judge:

- **cpu** — `decideCoCall`: calls the next corner it hasn't called for,
  once, at a lead of `170 + 95·sev` units. Honest by construction.
- **human keys** (seat 2, desktop) — QWE = left 1/2/3, ASD = right 1/2/3,
  Z = straight; a rising edge on the pad through `coCallFromPad` (the same
  detector the CPU's pads flow through).
- **voice** (V opens the mic, #1247 consent) — `parseCoCall`:
  "left two", "hard right", "straight on" → call.

Every call is LINKED to the next un-called corner it names (within 700
units) and stamped in the ledger; when the car passes the corner it is
graded: called before LATE_WINDOW=45 → correct, inside it → late, never
→ missed. The pace card (top-left HUD) is all the driver knows.

## The driver's physics (per tick at 60 Hz)

- throttle ACCEL=0.055 to VMAX=4.6, DRAG=0.995, brake 0.09; handbrake
  (A) looser turn, slower.
- `DRIFT_K=1.8`: a curve of curvature κ flings the car outward
  (`lat += v·sin(align) − v²·κ·K`) — corners are real; the autopilot
  counter-steers proportionally to lat (a human keeps the line honest
  without knowing the radius).
- off the ribbon (|lat| > ROAD_HALF=26): OFF_DRAG=0.965, speed cap
  OFF_CAP=2.5, every tick counted for the stage report.

## CPU pair (attract demo, the harness's fair play, the RL seat)

`cpuDriverPad` obeys HUMAN rules: it reads ONLY the pace card and the
visible road (`visibleAhead` + `cornerAhead`), never the stage truth past
the crests. rallycheck's win gate is this function: the CPU pair finishes
two laps on seeds 7/11/23/42 (~124-145 s stage time, ~4% off-track,
co-driver calls 100% correct).

## Determinism

`state.hash` = FNV-1a over the quantized sim state (the same digest the
recorder banks). rallycheck: same seed + same pads → same digest;
different seed → different state.

## Harness

- `npm run rallycheck` — pure Node, 86 gates: stage sanity + crest
  honesty, co-driver honesty + ledger, note grammar, determinism,
  off-track penalty, win gate (every curated stage), the #1365 feel signals
  (stepped-RPM gears via `gearOf`, crest `slopeAt` crossings per seed, lap
  splits that sum to the stage time), and the #1407 variety signals (the
  weather presets only ever take away — fog ≤ 1, grip ≥ 1; rain flings a
  hands-off corner wider; fair play holds in mist+rain; the NOTES lap strip
  shows only the corners already driven). No dev server needed. Wired into
  CI: the `rally` scope in `scripts/checks.mjs` + the KEYS-gated step in
  ci.yml (the alias existed but nothing ran it — #1395's lesson).
- contractcheck (browser, advisory): `rally-co-driver` is wired in
  `scripts/lib/contractGames.mjs` (2 seats; the pattern holds throttle
  with brief steering).
- The shell (`index.jsx`) renders 480x270, `imageSmoothingEnabled=false`
  at the ribbon's native scale; LITE mode (?lite=1) halves the sample
  step and drops the headlight gradient.

## Stages / follow-ups

- #1365 polish shipped: 3-2-1-GO start lights, lap-line banner + per-lap split,
  gravel roost off-track, body lean into turn-in + brake-flare tails, headlight
  bloom down a crest, chevron pop-in, seeded roadside silhouettes + start-line
  grandstand, stepped-RPM gears, tyre chatter at the grip limit, crest thud.
  The shell owns the fx; the provable parts (`gearOf`, `slopeAt`, lap splits)
  live in the pure sim and rallycheck pins them.
- #1407 stage variety shipped: curated stages (R on the attract cycles five
  named, rallycheck-proven seeds — LAKE/PINE/TARN/MIRE/FELL), weather presets
  (T cycles clear/mist/rain: mist shortens the fog wall, rain also loosens the
  `DRIFT_K` grip law so a hands-off corner flings wider), and the NOTES-card
  lap-progress strip (corners already driven, colored by dir; the rest stay
  dim — it shows progress, never what is ahead). B on the over screen returns
  to stage select; `?stage=PINE&wx=rain` lands a shared URL on a named stage
  in the rain. The provable parts (`WEATHERS`, `CURATED`, `lapProgress`) live
  in the pure sim and rallycheck pins them, including the no-leak law and
  CPU fair play in both wet presets.
- Lobby seats (online co-driver over the relay) — the sim already treats
  the co seat as pads, lockstep-ready; file when Jon wants it.
- Remaining polish (carved to a follow-up feedback issue): model-seat sensor
  arm for the nightly/RL soak, voice field QA + #1263 mic-badge parity,
  checkpoint-clock format alongside the two-lap run, and reflector-post
  variation beyond the amber corner mouths.
- A `rallyplay` browser-drive gate could mirror sosplay if the lane needs
  a second surface.
