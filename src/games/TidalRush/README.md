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
  at any point (behind the front 1, ahead 0, smoothstep inside), and
  `frontGains(w)` = {√(1−w), √w} (#3323) scales the two tables' Gerstner slots
  PER WAVE before one sum — `mixHeight`/`mixVy`/`mixWater` cross-fade equal
  power at own phases, so the band BEATS like a real crossing sea (stacked
  crests, glassy counter-phase patches); edges stay byte-exact tables.
  `seaGLSL()` emits four fully-unrolled Gerstner slots fed by uniforms;
  `seaGLSLFront()` emits TWO gain-scaled slot sets (A ×√(1−w) = outgoing,
  B ×√w = incoming, in the CPU's term order) plus
  `frontWeight` — the byte-twin of `frontW` — so the GPU mixes exactly what
  the CPU rides, across the front, every frame (unrolled because array
  constructors are not GLSL ES 1.00 — SwiftShader, #3134 lesson).
- `sim.js` — pure, seeded, 60 Hz, zero Math.random (mulberry32 rides as an
  integer on `gs.rngS`, snapshot/restore byte-exact; the sea table is plain
  JSON too). Hull matched to surface vy; falling faces at speed launch
  (kickers); A spins a 360 (+250), **full-lock steer airborne rolls a BARREL
  (+200)**, **brake ALONE airborne winds a BACK FLIP (+300)**, and **gas+brake
  holds the nose down inverted — HANDSTAND, +150 per 0.5 s, cap 3/air (#3276)**
  — one trick per air: whichever completes first claims it (a paid handstand
  lands the other verbs inert). Buoy gates alternate RED (pass right) /
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
  by the SAME autopilot the harness wins with (`autoPad`, wrapped by
  `attractPad` — one scripted BACK FLIP per lap so the preview advertises the
  five verbs; the harness stream, win-pins and DEV hooks stay `autoPad`
  byte-identical), **bay picker**
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
npm run tidalcheck                     # 186 gates: boot, rules, win (both bays), determinism,
                                       #   sea-bridge parity, lightning, barrel, swell re-roll,
                                       #   squall-front spatial law + GLSL twin + air-bonus math,
                                       #   per-wave band cross-fade — equal power, d/dt twin,
                                       #   byte-exact edges, live-band BEAT search (#3323),
                                       #   rain field/drift/drag/dim laws (#3191), gulls &
                                       #   beach caustics (#3218), online: wire bits, seat rng
                                       #   law, 2P/3P hash parity, desync referee, dropout
                                       #   takeover (#3220)
node scripts/tidalcheck.mjs --mutate=judge   # red-side judgement muted — must go red
node scripts/tidalcheck.mjs --mutate=swell   # per-lap re-roll pinned — must go red
node scripts/tidalcheck.mjs --mutate=front   # squall front frozen — must go red
node scripts/tidalcheck.mjs --mutate=beats   # band flattens back to convex mix — must go red (#3323)
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
  freezes on desync (never silent). See `net.js`.
 - **Survivable rejoin (#3244 item 3)** — a drop starts an 8 s HOLD, not a
   coast: lockstep stalls every sea at the dropped seat's first missing pad,
   the field frozen at one identical state, roster unchanged. Pads are a
   rider's proof of life AND identity — when they resume at the stalled tick
   the race continues with the hull back (`RIDER BACK — GO`). The droppee
   climbs the #546 backoff ladder under the same code; its welcome (same room,
   same seat) rides straight back in. Both sides replay the pads the dead wire
   swallowed — a window of PAD_DELAY+1 ticks each way around the stall,
   absolute per tick so late bytes are harmless. Past the window the old
   takeover fires (ski coasts / solo finish, unchanged). Honest gap: the
   deployed relay mints a fresh id per connection, so reclaiming the same seat
   needs it still free — a rejoin onto another seat is not you: the hold
   expires and the ski coasts as before.
 - ~~**Desync carries receipts (#3244 item 5)**~~ **CLOSED by #3247** — every
  30-tick boundary records tick + my hash + every peer hash into an 8-row ring
  (`createEvidence`, `net.js`); when the referee bites, the diverged row is
  marked and the block + COPY REPORT button appear under the
  banner, so a reported freeze ships with numbers. Ring wipes at kickoff.
  (Shipped the day #3276 began; the entry was left unstruck and phantom-kicked
  an idle session — rule 8 caught it.)
 - ~~**Room finish + rematch (#3244 item 4)**~~ **CLOSED by #3253** — when
  every hull crosses, the host broadcasts `pod` (SSX precedent): seat/time/
  score/rider rows; every cabinet paints a ROOM PODIUM and the host calls the
  rematch from the line. The rooms other tails closed too: spectate #3265,
  survivable rejoin #3257.
- **BLOCKED** — not builder work (#3280, rule 8): the wire is digital by
  design (six lockstep bits): local analog stick/lean feel stays local —
  remote riders' skis carry committed leans, not fractional ones.
  Analog-over-wire needs a pad-shape change to the SHARED pipeline, and
  #3244 item 6 is the standing law: "do NOT half-mitigate inside this game
  alone." The pad-shape discussion lives on #3244 (waiting-jon); a game lane
  cannot honestly build this gap, so it declines rather than phantom-kick.
- **BLOCKED** — QA's job, not builder work (#3280): three-hull rooms are
  proven in Node over an in-memory pipe (tidalcheck); the open item is a real
  three-human relay run — phones on the QR code, live dropout. That needs
  physical devices (QA lane territory, #3244 item 1).
- FIVE airborne verbs since #3276 (flat 360 +250, barrel +200, BACK FLIP +300 —
  brake ALONE airborne winds the nose over the tail and banks the biggest charge,
  HANDSTAND — gas+brake holds the nose past vertical for +150 per 0.5 s inverted,
  cap 3/air). A fully-charged handstand (3/3 pays) banks the same 0.34 sprint
  charge the flip pays — the hardest commit pays the meter, not just points. The pitch verbs ride the SAME six bits the wire already carries
  (flip = d, handstand = u+d) — zero pad-shape change (#3244 item 6 law), so the
  lockstep hash referee covers them for free; autopilots never brake, so a flip
  is always a committed input. ~~Honest gaps: no grab poses (the hull just
  pitches), an inverted splash equals a flat one, and CPUs flip (armed 2,
  ~45 % of their tricks) but never handstand — the autopilot holds gas in the
  air by design.~~ **CLOSED by #3280:** riders GRAB while a pitch verb turns —
  brake alone takes the rail (flip), brake+gas reaches the bow (handstand),
  derived from the commit bit the wire already carries (zero pad-shape change,
  #3244 item 6 law), released on the water; CPU flips grab too. Landings now
  read BY TRICK: a flip sprays corkscrew bursts off both rails with a deep
  thunk, a handstand drives a narrow column + expanding ring, flat keeps the
  wide sheet. That stage also caught a real #3276 bug: rival skills hold gas
  ≥0.94 in the air, so armed-2 was ALWAYS a handstand commit under the law
  (68 pays, zero flips across six seeds) — the rival pad now lifts the
  throttle (≤0.4) under flip-arm, so CPU flips wind over for real. And the
  drive leg caught the anchor trap: brake (10 m/s²) outruns THRUST (7.5), so
  holding the handstand commit across a landing dead-stopped the hull — under
  throttle the anchor now caps just below the thrust line and the dual-commit
  settles at a ~11 km/h crawl (coasting brake keeps its full anchor).
  ~~Honest gap: CPUs still never handstand — armed 2 is flip intent~~ **CLOSED
  by #3281:** armed 3 is handstand intent — brake+gas, the gas stays on
  (never eased like a flip), so the commit IS the handstand verb (~25 % of
  CPU tricks). The old flip share (~45 %) and the spin head (~30 %) stay.
  **CLOSED by #3281 again (bullets 4 + 5):** bullet 4 — a fully-charged
  handstand banks the send's sprint charge, same 0.34 the flip pays (pinned
  by tidalcheck, mutant handstcharge); bullet 5 — the attract preview
  commits one scripted back-flip per lap (brake alone, gas ≤0.4) through
  `attractPad`, one lap per flip, persistence handled by a lap marker + armed
  flag, with the harness stream untouched (mutant attractflip).
- **CLOSED by #3191** — rain is gameplay now: extra drag in the band
  (v_term −10 %), seeded crosswind drift along the new swell, spatial drops
  at Kai's hull, gates dimmed toward storm fog, wind cue at the band edges.
- ~~The squall front mixes two whole-bay tables linearly across the band~~
  **CLOSED by #3323** — the band now cross-fades PER WAVE: `frontGains(w)` =
  {√(1−w), √w} scales every outgoing/incoming Gerstner slot before the sum
  (equal power, ga²+gb²≡1), both swell trains ride at their OWN phases and
  BEAT — stacked crests and glassy patches the convex blend physically could
  not make; edges stay byte-exact tables, GLSL twin mirrors the term order
  (mutant `beats` proves the pins bite).
- ~~The front is swell-only weather: sky darkening and rain ramp at the GO of a
  re-roll, not as the front passes overhead (sea first, sky later).~~
  **CLOSED by #3348:** weather is the sea you ride. `rainAt` now answers the
  outgoing table's storm-ness cross-faded into the incoming one by the SAME
  `frontW` the sea mix and shader ride (`gs.seaWas` books which stage the
  outgoing table was rolled under): storm→storm re-rolls keep the bay wet on
  both sides of the front — no rain snap at GO, no mid-lap drag release — and
  a future sunny↔storm flip rides in WITH the front instead of at the stage
  flag. The sky/fog/light dimming (`wantStorm`) keys to that same hull-side
  weather mix, so sea and sky cross together. Pinned by 4 new tidalcheck
  pins + `rainfront`/`skyflag` mutants.
- ~~Wake ribbon is flat-shaded additive; the WR64 trail also darkens the water
  beside it (open — #3218 tail).~~ **CLOSED by #3337:** the ribbon is a shaded
  **FOAM V** — five lanes per section: bright crest LINES at the arms (spreading
  with age), shoulders falling inward, a quiet channel between; brightness rides
  the emit-time width (speed + boost read in the trail), crests cool white→cyan
  as the bubbles die, and a deterministic per-point twinkle breaks the
  along-trail banding (seq-assigned phase, no Math.random downstream — buffers
  byte-identical across replay). The darkening strip is **gone**: the
  disturbed-water hint is now a slightly wider, very faint **additive** glow, so
  the wake can only ever add light to the bay, never stain it (pinned: both
  ribbons AdditiveBlending + depthWrite false; mutants `foamflat`/`glowdark`
  prove the pins bite). **Emphasised by #3342:** at the shallow chase angle the
  cross-section compresses to pixels, so the shoulder falls off harder (0.34→0.22
  of crest) and the channel is quieter (0.10→0.07) — and the long-life wake SPRAY
  now rides the V arms instead of stitching the centreline (`wakeSpray`, ±arm
  toggle on the spray pool, heading math — placement deterministic, only the
  churn jitter random). Two foam lines resolve from the drive seat and at
  `?lite=1` (mutants `shoulderwash`/`centrestitch`). Honest gap: the V is geometry
  shading, not per-pixel
  foam texture — crests ride the stern path, they don't sample the swell they
  cut through.
- ~~Rider has no separate jump/land poses beyond crouch + lean/jolt with
  head-lag (open — #3218 tail). The flat 360 landing does carry a whoosh-in
  now (#3218).~~ **CLOSED by #3351:** the two MOMENTS have poses. At launch
  the sim records the **crest kick** — `(vy − surfVy)/2.5`, how much faster
  than the falling face the hull springs (vy alone is often NEGATIVE at
  launch; the face drops faster still — the early vy-based read zeroed most
  honest crests and the every-launch-pops pin caught it). The rider answers
  with a TAKEOFF pop: legs extend off the hip hinge, the body springs up the
  heels, the head lags behind the rise; the window decays ~0.4 s. At
  touchdown the sim captures the **sink** in the tick where `vy` is wiped
  (the #3280 lastLand reason): `clamp(−vy/6)` — knees take the slap, torso
  and scale compress, the head dips and recovers; hard 6 m/s drops absorb
  fully, a kiss barely bends, and trick poses/grabs/jolt/spray all still read
  on top. Both windows are cosmetic sim state (#3280 kind): pads, wire, hash,
  tables, rng untouched — pinned by hand-set-and-rehash. **Honest gap:** the
  limbs are two-bone hinges with fixed angles — a fast pop and a big drop
  share the same knee geometry, only its depth varies.
- In-bounds scenery shipped with #3159: seeded moored sloops and a bell buoy
  ride the drawn sea (no colliders — decorations never touch the rules).
  **CLOSED by #3218** — a seeded flock of three gulls now wheels over the
  anchorage (flap, glide, bank, dim in the squall), and the outer bay carries
  beach caustics + a warm sand push toward the headlands. Hulls still have no
  reflection on the water plane (open).
- Score HUD sits under the shared chrome pill at ?lite=1 widths (chrome overlap,
  not game layout) — flagged for the QA polish pass.

## Spectate (#3244 item 2) — no seat, all sea

`?net=watch&room=CODE` joins a live room as a **watcher**: it takes none of
the three racing seats (room cap 4 = 3 riders + 1 watch slot), sends no pads
and referees nothing. It rides the truth instead: on `spec` the host answers
with `sv0` (seed, bay, tick, rider roster) plus `sh` history chunks — every
pad byte applied since kickoff, packed 1/seat/tick in the pump window
(pads k..k+D ride along, so the join tick itself has no hole). The watcher
fast-forwards its own deterministic sim to the live tick and continues on the
relay's pad flood — bit-identical to the race, proving tidalcheck's spectate
gates (149/149, incl. replay-hashes-equal and the pump-window hole gate).
Honest gaps: one watcher per room; the live-follow step in the cabinet gates
on pads exactly like a rider (10 s coast on a dead seat) but tidalcheck's
in-memory mock only proves replay + buffer equality, not a full live race
against the relay; a watcher that drops just watches no more (no rejoin ring).
