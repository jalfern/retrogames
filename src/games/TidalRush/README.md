# TIDAL RUSH — jetski slalom on the forge ocean (#3104, rungs 1–3)

Wave Race 64 (Nintendo 64, 1996) in spirit, our own IP: riders KAI vs MAKO
and TUNDRA, one venue in two weathers — SUNNY BAY and STORM BAY. The issue's
core demand: *the water is the game*. One analytic Gerstner table is the single
surface of truth:

- `water.js` — the sea is a VALUE, not a constant. `WAVES` (4 waves, deep-
  water dispersion ω=√(gk)) still defines the sunny bay; `stormSea(seed, lap)`
  re-rolls a seeded swell per lap (WR64's storm signature, main swell +12 %
  per lap, dirs wander ±26°, overhang-guarded). Rung 3 replaced the whole-bay
  blend with a TRAVELLING squall front: `makeFront` aims a band (`FRONT_BAND`
  34 m) along the new swell's direction, `frontW(x,z,fr)` weighs NEW-sea-ness
  at any point (behind the front 1, ahead 0, smoothstep inside), `mixHeight`/
  `mixVy`/`mixWater` blend the two EVALUATED tables by that weight.
  `seaGLSL()` emits four fully-unrolled Gerstner slots fed by uniforms;
  `seaGLSLFront()` emits TWO slot sets (A = outgoing, B = incoming) plus
  `frontWeight` — the byte-twin of `frontW` — so the GPU mixes exactly what
  the CPU rides, across the front, every frame (unrolled because array
  constructors are not GLSL ES 1.00 — SwiftShader, #3134 lesson).
- `sim.js` — pure, seeded, 60 Hz, zero Math.random (mulberry32 rides as an
  integer on `gs.rngS`, snapshot/restore byte-exact; the sea table is plain
  JSON too). Hull matched to surface vy; falling faces at speed launch
  (kickers); A spins a 360 (+250), **full-lock steer airborne rolls a BARREL
  (+200)** — one trick per air. Buoy gates alternate RED (pass right) /
  YELLOW (pass left) judged by heading at the buoy. Miss-policing is
  progress-based (rung 2): past the gate line unjudged — geometrically *or*
  by course arc, at ANY lateral distance — is a miss; the rung-1 18 m corridor
  loophole is closed, and gates only judge in order (no shortcut pre-judging).
  3 laps; standings on unwrapped course progress. **STORM BAY** re-rolls
  `gs.seaTarget` on every lap crossing (`SWELL SHIFT`) and raises a squall
  front `gs.front` that sweeps at `FRONT_SPEED` (26 m/s — deliberately faster
  than physical group velocity so the shift resolves inside a lap); the new
  sea takes over when the band clears the far side, and a re-roll during a
  live front snaps it closed first (never two fronts). `stateOf` reports the
  swell MIXED at Kai's point plus `frontPct`. A landed trick banks an
  **air-time bonus** (+50/s, cap +100, computed from the reported rounded
  air-time so event and score are byte-consistent). Lightning stays seeded;
  rivals split lateral lines (MAKO tight inside, TUNDRA wider). **RAIN IS
  GAMEPLAY (#3191):** `rainAt(gs,x,z)` = stage gate × `frontW` (the same
  weight the sea mix and the shader ride — rain ≡ sea ≡ drawn, spatially);
  inside the band the hull eats extra quadratic drag (`RAIN_DRAG`, v_term
  19→~16.9 m/s) and drifts world-space along the new swell at
  `RAIN_PUSH`·rain·gust (two-sine gusting on `gs.t` — rng untouched, replays
  byte-exact); crossing the band edge pushes a `rain` event; `stateOf.rain`
  carries Kai's rain and the hash mixes it. Gates dim toward storm fog by
  rain at THEIR point (`RAIN_VIS`=0.72 ceiling, art.js `buoyDim`). Sunny and
  unreached water: exact zero everywhere.
- `art.js` — MODERN bar within a phone budget (the SHORE demo's weak spot):
  one 96×96 sea mesh, fresnel + sun glitter + crest foam, gradient sky with a
  low sun and headland silhouettes, procedural ski + leaning rider, pooled
  additive Points for spray/carves/wake (+ a small rain pool), NO shadow maps,
  pixel ratio ≤2. Storm mode: bruised sky colors, thicker fog, wind-slanted
  rain, whole-bay lightning flash (uniform-driven, no extra passes). Rung 3:
  `pushSea(mat, gs)` is the whole bridge — A slots = outgoing table, B slots =
  incoming, `uF*` = live front; and each hull drags a **ribbon wake**
  (`makeWake`): a stitched triangle-strip of stern points that widens and
  fades over ~2.4 s — WR64's solid white trail, additive, no depth write.
- `net.js` — online rooms (#3220) on the shared plumbing: `src/utils/lobby.js`
  (#1039 waiting room + 4-letter code, deployed relay) and `src/utils/
  lockstep.js` (#531 sample-once-D-ahead law, #1705 N-peer referee). Wire pad
  = six bits {l,r,u,d,s,a}; hull i consumes seat i's wire bytes on EVERY box
  (hull 0 rides its mirror, never local analog — the divergence trap). Human
  seats skip `rivalPad` entirely, so the seeded rng stream stays room-wide.
  The sim's only online-facing state: `c.human` (pad source), `c.score` (own
  bank; hull 0 also fills the hero bank `gs.score`), hull-tagged events — all
  inert when nobody joins, which is what keeps offline bytes untouched.
- `index.jsx` — the shell: fixed-timestep loop (one driver), attract driven
  by the SAME autopilot the harness wins with (`autoPad`), **bay picker**
  (◀ ▶ keys or tap the chips; the attract preview re-rolls live), tap-to-
  start on the root pointer (phones), pause card, VirtualControls (method
  `stick`, analog; B = BOOST), DOM HUD, contract hooks. Buoys bob with the
  full Gerstner motion (height + horizontal flow), staying glued to the drawn
  surface.

Play: up/stick = throttle, steer = lean, SPACE/A in the air = spin, full-lock
steer in the air = barrel, SHIFT/B = sprint. Any key or tap starts; `?`
pauses; ◀ ▶ on the menu picks SUNNY or STORM BAY.

## Verify

```
npm run tidalcheck                     # 122 gates: boot, rules, win (both bays), determinism,
                                       #   sea-bridge parity, lightning, barrel, swell re-roll,
                                       #   squall-front spatial law + GLSL twin + air-bonus math,
                                       #   rain field/drift/drag/dim laws (#3191), gulls &
                                       #   beach caustics (#3218), online: wire bits, seat rng
                                       #   law, 2P/3P hash parity, desync referee, dropout
                                       #   takeover (#3220)
node scripts/tidalcheck.mjs --mutate=judge   # red-side judgement muted — must go red
node scripts/tidalcheck.mjs --mutate=swell   # per-lap re-roll pinned — must go red
node scripts/tidalcheck.mjs --mutate=front   # squall front frozen — must go red
node scripts/tidalcheck.mjs --mutate=gullfreeze  # gulls stop wheeling — must go red (#3218)
node scripts/tidalcheck.mjs --mutate=causticoff  # beach shimmer disabled — must go red (#3218)
node scripts/tidalcheck.mjs --mutate=trickdry    # flat-360 lands without a whoosh — must go red (#3218)
node scripts/tidalcheck.mjs --mutate=rainoff # rain wallpaper again — must go red
node scripts/tidalcheck.mjs --mutate=push    # crosswind drift zeroed — must go red
node scripts/tidalcheck.mjs --mutate=wirefeed # hull 0 fed local analog — must go red (#3220)
node scripts/tidalcheck.mjs --mutate=evidoff # desync keeps no receipts — must go red (#3244)
npm run dev -- --port 5178 --strictPort   # then:
CONTRACT_ONLY=tidal-rush npm run contractcheck
DEV_PORT=5178 npm run tidaldrive         # headless Chrome: real keys/taps start-steer-
                                         #   pause-restart, front live, HUD≡state, win P1
```

CI: `tidal` scope (scripts/checks.mjs) runs tidalcheck in the browser-free
static job; every pushed commit is commented on #3104.

## Honest gaps (rung 3)

- ~~No online rooms~~ **CLOSED by #3220** — `?net=host` / `?net=join&room=CODE`
  on the shared lobby (#1039, deployed relay): seat i rides hull i (KAI/MAKO/
  TUNDRA), open seats fly the autopilot, the host's bay pick rides the start
  payload. Wire pads are six bits (throttle/lean×2/brake/spin/boost) on the
  #531 sampling law with #1705 N-peer roster; hash referee every 30 ticks
  freezes on desync (never silent); a dropped rider's ski coasts while peers
  remain and returns to the autopilot when you're alone. See `net.js`.
- **Desync carries receipts (#3244 item 5)** — every 30-tick boundary records
  tick + my hash + every peer hash into an 8-row ring (`createEvidence`,
  `net.js`); when the referee bites, the diverged row is marked
  `← MISMATCH seatN` and the block + COPY REPORT button appear under the
  banner, so a reported freeze ships with numbers. Ring wipes at kickoff.
- **Room finish + rematch (#3244 item 4)** — when every hull crosses, the host
  broadcasts `pod` (SSX's precedent): seat/time/score/rider rows. Every cabinet
  paints a ROOM PODIUM in place of the lone sheet; the host calls the rematch
  from the line (any key → fresh seed, seated guests ride the `go`, nobody
  re-enters a code). A guest reads the host's sheet instead of trusting its own
  sort. What the room still owes: mid-race spectate and a survivable rejoin
  (#3244 items 2–3).
- The wire is digital by design (six lockstep bits): local analog stick/lean
  feel stays local — remote riders' skis carry committed leans, not fractional
  ones. Analog-over-wire would need a pad-shape change to the shared pipeline.
- Three-hull rooms are proven in Node over an in-memory pipe (tidalcheck); a
  real three-human relay run (phones on the QR code) is the QA pass.
- Three airborne verbs (flat 360, barrel, air-time bonus); flips/handstands
  would ride the same airborne spin budget.
- **CLOSED by #3191** — rain is gameplay now: extra drag in the band
  (v_term −10 %), seeded crosswind drift along the new swell, spatial drops
  at Kai's hull, gates dimmed toward storm fog, wind cue at the band edges.
- The squall front mixes two whole-bay tables linearly across the band — real
  seas beat and interfere; a per-wave cross-fade (phase-matched slot swaps) is
  the next fidelity step.
- The front is swell-only weather: sky darkening and rain ramp at the GO of a
  re-roll, not as the front passes overhead (sea first, sky later).
- Wake ribbon is flat-shaded additive; the WR64 trail also darkens the water
  beside it (open — #3218 tail).
- Rider has no separate jump/land poses beyond crouch + lean/jolt with
  head-lag (open — #3218 tail). The flat 360 landing does carry a whoosh-in
  now (#3218).
- In-bounds scenery shipped with #3159: seeded moored sloops and a bell buoy
  ride the drawn sea (no colliders — decorations never touch the rules).
  **CLOSED by #3218** — a seeded flock of three gulls now wheels over the
  anchorage (flap, glide, bank, dim in the squall), and the outer bay carries
  beach caustics + a warm sand push toward the headlands. Hulls still have no
  reflection on the water plane (open).
- Score HUD sits under the shared chrome pill at ?lite=1 widths (chrome overlap,
  not game layout) — flagged for the QA polish pass.
