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

- `npm run rallycheck` — pure Node, 152 gates: stage sanity + crest
  honesty, co-driver honesty + ledger, note grammar, determinism,
  off-track penalty, win gate (every curated stage), the #1365 feel signals
  (stepped-RPM gears via `gearOf`, crest `slopeAt` crossings per seed, lap
  splits that sum to the stage time), the #1407 variety signals (the
  weather presets only ever take away — fog ≤ 1, grip ≥ 1; rain flings a
  hands-off corner wider; fair play holds in mist+rain; the NOTES lap strip
  shows only the corners already driven), the #1427 depth signals (the
  checkpoint clock stamps one S-split per lap inside its lap and rides the
  determinism digest; reflector posts vary beyond the studs — severity-scaled
  amber mouths, inside exit count-markers, crest pairs only on true
  reversals), and the #1427 model-seat signals (the pace-card sensor never
  reports a corner past `vis`, crests provably bite the spine too, the brain
  only names `pad` with contract keys, its progress currency is monotonic and
  stalls with a stuck car, and the spine finishes two laps on every curated
  seed with a digest-stable repeat). No dev server needed. Wired into
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
- #1427 depth shipped: a checkpoint clock (one time-control mark per lap at
  the midpoint of the stage's longest straight — `controlS` is pure geometry,
  far from any corner, weather-stable; crossings stamp S-splits, echoed as a
  `S1 IN nnn` countdown in the HUD, a banner at the mark, and `S1 · S2` lines
  on the over screen) and reflector-post variation (`postsFor`: severity-scaled
  amber mouth warns — sev 3 gets a third post, inside white exit count-markers
  past hard apexes, and matched crest pairs at true slope reversals). Both are
  pure sim data, rallycheck-pinned (86 → 127): S-splits sit inside their laps,
  the clock rides the determinism digest, exit markers live on the inside,
  crest posts only on real terrain reversals.
- #1427 model seat shipped: seat 1 runs the docs/AI.md spine —
  `sensors/pacecard.js` (`senseRally` → Percept: pace card as the message
  channel, corners only through `vis`, ego pose, laps) and `agent/pacebrain.js`
  (`createPaceBrain` — AgentLoop contract: sense/step/skills/progress; one
  skill `pad` emitting the contract's driver keys). `?seat=model` hands the
  seat to the spine in the browser; `__rallyTest.modelSeat()/sense()/modelPad()`
  expose it for nightly/RL soak. rallycheck proves honesty and 2-lap wins.
- #1427 voice field QA shipped: the spoken grammar takes the accent mis-hears
  a recognizer produces ("left tree"=L3, "right free"=R3, "write two"=R2,
  "too left"=L2, "won"=1); NEGATION is silence ("no left", "not right three",
  "no three" fire nothing — a negated note played as a note is worse than
  none; mutant-proven: dropping the rule reddens 3 gates); "caution"/"crest"/
  "blind" is a warning word — alone it is a CAUTION card (dir 0, sev 2,
  amber, low double beat, links to no corner), with a side it floors severity
  at 2 and stamps the call `crest`. #1263 mic-badge parity: voiceCapture now
  exports `acquireListenBadge()` — the shared refcounted dot shows LISTEN
  (blue) while speech recognition holds the mic, LISTEN ≠ REC because
  recognition is not recording. Rally takes it on V-after-consent, releases
  on stop/unmount; `__rallyTest.micBadge()` exposes the state. rallycheck
  152 → 169.
- Honest gaps still on #1427: the #1257 VU bar proves level from a recorder
  stream, and speechListen exposes no stream (recorder-backed VU belongs with
  the lobby take); online through the lobby.
- A `rallyplay` browser-drive gate could mirror sosplay if the lane needs
  a second surface.
