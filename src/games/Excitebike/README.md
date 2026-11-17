# EXCITEBIKE (`/excitebike`)

The 1984 motocross, rebuilt toward the NES original: side view, a carved
heightmap course, one throttle, one jump, and the two rules that made the
game — **lean your bike in the air or eat dirt**, and **pump the button in
the mud or sink**. Everything (terrain, bikes, HUD dials, engine notes) is
synthesized at runtime; the attract demo is the autopilot's own proven run
replayed tick-for-tick through the same `step()` the harness audits.

## Design (issue #176)

Core loop: pick one of six carved circuits at the splash, then hold gas
through a 2-lap course of ramps, whoops, mud, water and boost arrows against
a countdown the lap line extends. Speed is bought with heat — redline too long
and the engine bogs until it cools. Every big jump
asks the same question: nose attitude at landing. Lean back too far you
backflip; too far forward you agency-plant; both put you on the ground
counting seconds while the field rides over you — unless you mash A, which
is also how you crawl out of a stalled water hole. The one harness we
demand: `excitecheck` in Node — terrain audited as data (every up-step
clearable at wide-open throttle, every launch landable, features only on
real ground), the autopilot (which rolls the REAL sim per candidate, the
Spy Hunter lesson) clearing every course in the roster in first, and the **slack rule**:
the campaign re-wins with less clock at every lap line, with thicker mud and
faster heat.

## File boundaries

- `levels.js` — the course **as data**: heightmap control points, feature
  bands (mud/water/whoops/boost/up-step), and the five rivals' pace lines
  (piecewise speed-vs-distance) plus rider skill tiers. The skill tiers make
  the CRASH LEAGUE: lagged stabilisation + the player's landing law in a
  skill-scaled window (sim.js `rivalTick`), receipts pinned by
  `excitecheck`. `groundY/slopeAt/featureAt` are the only readers. Node-safe.
- `sim.js` — pure `step(state, input)`, zero `Math.random`. Heightmap
  ground, ballistic air with pitch/lean, heat, mud pump, water stall,
  boost, crash/recover, laps, clock, rivals, ledger, the CONTACT law
  (#2391): a downed rival is solid (wipeout above `wreckV`, a hold below —
  never a ride-through), a close onto a riding back ≥ `contactBump` bumps
  with two-way momentum transfer (`contactSwap`; over `contactCrash` it is
  over the bars), a rival catching your back swerves (jolt), crossing a
  body with ≥ `contactClear` of air pays a once-per-pass `flybyPts` — and
  the PACK law (#2420): the same body law mirrored onto rival-vs-rival
  pairs (`pack()`), so chain wrecks pile the tail behind a crash, `rbump`
  transfers momentum between rivals, and a blocked lane LATCHES the brake
  (`held`) until the body moves; plus hazard hops — a grounded rival reads
  a downed or held body within `v·(hazBase + hazSkill·skill)` px and
  commits the player's own jump law, so skill grades who flies it clean
  and who arrives nose-low and chains. One drama per pair per
  `contactCool` (the `pk` matrix; `held` is the rival-side brake, the
  player's hold is untouched); `contactK`/`packK` are the harness mutant
  knobs. The LANE axis (#2457): every bike carries a lateral line `lane`
  0 (near) .. 1 (far), steered by ←/→ (full `laneRate` on the ground, half
  in the air). Every contact law is now SAME-LANE gated (`laneTouch`) —
  crossing a body on another line is a clean draft, no flyby, no hold — and
  the old silent matched-speed ghost (|relV| ≤ 0.3) became the RUB: the
  player pays `laneScrape` per bite (`rubCool` cadence) and the rival is
  shoved `laneW` aside; rival-vs-rival rub (`rrub`) is lateral-only and
  never touches v or d, so the CRASH LEAGUE receipts stand untouched, and
  `laneHome` walks shoved rivals back to line 0 before the next lap's
  chain. `laneK` is the master knob (0 = the pinned single-line league,
  byte-identical — MOTOCROSS never engages the axis). Node-safe.
- `planner.js` — the autopilot. Decisions every few ticks; each candidate
  (gas/brake × jump now/later × lean × far/near line) is **rolled through
  the real sim** before it is allowed to drive. The attract demo is its
  output. Since #2391 a DOWNED rival ahead stretches the horizon past the
  remount and adds a coast candidate plus a delayed-hop sweep — the planner
  discovers the flyby over the wreck instead of braking to a stop behind it.
  Since #2457 it also chooses LINES when a body is in range — SUPERCROSS
  re-learned five forced passes as clean cross-line drafts (witnesses
  re-recorded); MOTOCROSS still rides its five air-bys untouched.
- `index.jsx` — the shell. Renderer draws the heightmap column-by-column,
  the HUD (speed dial with needle, heat gauge, position, course bar) and
  the bikes rotated by pitch; lanes render as NES depth (far line sits
  higher and ~10% smaller, riders paint far-to-near). DEV hook
  `__bikeTest` for `exciteplay`.
- `custom.js` — EDIT TRACK (#2576): the stamp vocabulary + footprints, the
  base lap template, the deterministic splicing compiler, the ONE legality law
  (`auditCustomData`, read by cursor/SAVE/harness), `fitsAt` for the live
  cursor, and the localStorage codec (garbage-in, empty-shelf-out). Pure —
  no DOM, no localStorage access in this file. `levels.js` gained
  `buildTrack/registerCustom/customCount`: customs join CACHE after the six
  (index 6+slot) so every index-driven reader rides them untouched;
  `TRACK_COUNT` still means SIX (the shipped roster is pinned). #2587 adds the
  TEST verb to the strip and `TRANSIENT` (-1) to `levels.js` — a seat resolved
  by `track()` before the CACHE wrap (`setTestTrack/clearTestTrack/
  hasTestTrack`), so an unsaved draft drives every course-reader without ever
  appearing in CACHE.

## Controls (faithful to the NES mapping)

- Any key/tap at the marquee opens the **splash**: `↑/↓` (or `←/→`) walk the
  six-course roster, `ENTER`/`SPACE`/a tap off the pad rides, digits `1-6`
  fast-seat, `G` sets gear here too, `Esc` steps back to the marquee.
- `↑` gas on the ground, **lean back in the air** · `↓` brake, **lean nose
  down in the air** · `SPACE` jump (hold = longer), and **pump it** in mud,
  water and after a crash · `G` gear High/Low · `?` pause.
- `←`/`→` steer ACROSS the track (#2457, full authority on the ground, half
  in the air): pass on the open line — same-line traffic is solid, and
  matched speed in the same line is a RUB.
- Touch pad: up/down arrows are the throttle and brake (and lean), the
  stick's left/right are the lines, the A button is jump/pump. Tap anywhere
  to start. On the splash the same pad steers the cursor and A rides; a tap
  outside the pad seats the picked course (one pad, always).
- **EDIT TRACK (#2576)**: `0` at the splash (or the EDIT row / pad cursor +
  tap) opens the design bay — `←/→` walk a 40px stamp cursor, `↑/↓` walk the
  tool strip (RAMP STEP WHOOPS MUD WATER BOOST TEST ERASE SAVE EXIT, both
  wrap), `SPACE`/A executes the tool under the cursor, `1`/`2`/`3` save a legal
  draft into CUSTOM slots, `Esc` exits. A draft that fails the audit (overlap, the
  start/finish seam, blank) refuses to save. Saved customs ride at TRACK 7+.
- **TEST RIDE (#2587)**: with a draft drawn, select TEST and press `SPACE`/A —
  the bay audits it exactly like SAVE, then seats one unsaved lap of your own
  terrain. `Esc` (or the finish line) walks you back to the bay, draft intact.
  Nothing is stored, nothing joins the roster, no leaderboard.

## Honest gaps

- **CLOSED by #2457:** the lane axis landed — ←/→ steer a continuous lateral
  line, every contact law is same-line gated (crossing a body on another
  line is a clean draft, and flyby only pays when you cross THEIR body),
  and the silent matched-speed ghost became the RUB: same line, relV ≤ 0.3
  is handlebars — the player pays scrape, the rival is shoved aside;
  rival-vs-rival `rrub` separates the pack laterally without ever touching
  v or d (the CRASH LEAGUE receipts stand). Proven by the `excitecheck`
  LANE block + 6 lane mutants; SUPERCROSS witnesses re-recorded (the
  autopilot re-learned five forced passes as clean line choices), MOTOCROSS
  pinned byte-identical (maxLane 0 — the axis never engages there).
- **CLOSED by #2460:** PACK BARGAINING — rivals now INITIATE line changes.
  A grounded rival behind you at matched speed (the rub band) that sees you
  settled off the league home LATCHES onto your line and walks onto it
  (skill-scaled: MARIO crowds, IVAN rides his line), stopping AT it and
  tracking you there. The duel pauses (no motion, no cool-down) while either
  rider flies or a wreck sits in the hazard read — ground before lines, and
  bumpy ground never ends a duel for three seconds; a real break (out-pace,
  slide-past, line-back) cools it (`bargCool`) before the rider dares again.
  Lateral only: v and d never move (pin: bargK=0 trace-identical), and
  engaging needs the rub band, so a bargained pass can only end in a rub or a
  clean line break — the CRASH LEAGUE receipts stand. Proven by the
  excitecheck BARGAIN block (engage/monitor/hazard-refusal/release-cooldown/
  skill-grade/receipts) + 4 bargain mutants.
- **CLOSED by #2563:** THE SPLASH — the NES track catalogue landed. Six
  hand-carved circuits (MOTOCROSS, SUPERCROSS + SAND CROSS, SLALOM CROSS,
  BIG AIR, K.O. CROSS), a marquee→splash→race flow, a cursor law (`nextSel`,
  wrap) shared by shell and harness, grade pips, digits 1-6 fast-seat, G gear
  at the splash, Esc back, and the pad steering the menu on phones (a tap
  outside the pad seats; still one pad, per the multiplayer law). The two
  shipped courses are BYTE-PINNED (ground fingerprint + auditor step record
  in `excitecheck` SPLASH) so witnesses can never be reshaped by a menu PR.
  Proven: SPLASH block + terrain/WOT/campaign/determinism/slack extended to
  all six (autopilot clears every new course in first: SAND 2585t,
  SLALOM 2698t, BIG AIR 2529t, K.O. 2672t), nextSel mutant reddens the gate;
  exciteplay drives marquee→splash→cursor→tap→race in real keys/touch.
  Balance note: SLALOM rides dry — its knuckle rhythm plus the long boost
  home; water lives on BIG AIR and K.O. CROSS.
- **CLOSED by #2576:** THE SPLASH's other half — **EDIT TRACK** — landed.
  A stamp compiler (`custom.js`) turns a draft of obstacles (RAMP, STEP,
  WHOOPS, MUD, WATER, BOOST + ERASE/SAVE/EXIT) into the same `{cps,bands}`
  data the shipped six ride on: stamps splice into a rolling base lap (the
  template cps inside a span are replaced, edges seated on the base line, so
  terrain stays continuous and the compile is order-independent/deterministic)
  and every obstacle is REAL geometry — the RAMP's lip is a +52 crest the
  auditor sees as a step, WATER stamps its own bowl. `auditCustomData` is ONE
  legality law read by the live cursor (FIT yellow / NO red), by SAVE (an
  illegal track refuses to store) and by the Node gate: blank, overlap, seam
  margin, off-lap, and HOLES (a flipped splice filter once deleted the world
  outside the stamps and passed every LOCAL check — the law now samples the
  whole lap). Three localStorage save slots; customs enter the roster at
  TRACK 7+ (splash rows grow, cursor law wraps the grown n), ride the same
  engine/rivals/WATCH unchanged. Digit `0` opens the bay; the pad reaches it
  too (cursor + A executes the tool under the cursor). Proven: excitecheck
  EDIT block (+37: determinism byte pins, refusal-by-name, live-law==save-law,
  codec garbage-in/empty-out, shipped-six fingerprints unmoved, WOT finish +
  deterministic rides of two saved drafts) and exciteplay 76/76 designing,
  refusing, saving, reloading and racing CUSTOM 1 in real keys/touch. Mutant:
  flatten the RAMP rise → the step-geometry gate reddens.
- **CLOSED by #2587:** **TEST RIDE** — the bay's missing esc-to-the-bay. A
  TEST tool (between BOOST and ERASE, so the strip's backward wrap pins hold)
  compiles the CURRENT draft through the SAME compiler and the SAME legality law
  SAVE reads (illegal draft → refusal by name, the bay never leaves), then seats
  it for one lap: `makeGame(TRANSIENT, { laps: 1 })`. `TRANSIENT` (-1) is a
  levels.js alias resolved by `track()` BEFORE the CACHE wrap — the draft never
  enters CACHE, so the splash roster never grows a phantom row, while
  sim/planner/renderer/rival pace ride it honestly (they all read the course
  through `track(gs.track)`). `Esc` — or the lap line — walks you back to the
  bay with stamps/cursor/tool exactly as left; the over screen and the
  leaderboard stay the league's. Proven: excitecheck TEST RIDE block (+12:
  refusal-before-seating, SAVE-byte-identity, one-lap WOT finish + determinism,
  roster-leak check, alias wrap restored on clear) and exciteplay (+8 real
  keys: TEST seats, Esc returns, lap finishes to the bay, empty draft refuses
  by name, rows stay 8); flatten-the-transient-branch mutant reddens the
  identity gates.
- **Test rides are keyboard-escapable only** — a phone ends a test lap by
  riding it (one lap is short); there is no on-screen Esc. And a SAVED track
  chosen at the splash still uses the save-and-race gate — esc-to-the-bay is
  the TEST path's, not every custom entry's.
- **Custom laps are fixed at 2** and the rivals ride their GENERIC pace line
  over your terrain (`rivalSpeed` is terrain-computed, never per-custom
  tuned): a well-drawn course beats the pack on pace, a crowded one may be
  a slab of whoops — there is no "difficulty grade" beyond what you draw.
  The attract demo still flies MOTOCROSS only; saved designs never enter it.
- **PER-COURSE LEAGUE (#2573 items 5+6):** every course carries a `pace`
   (MOTOCROSS/SUPERCROSS 0 — calibration, all receipts byte-honest; then
   +0.02/+0.03/+0.04, K.O. CROSS +0.06) and `PACK_TIER` [1,2/3,1/3,0,0] rides
   it on the front ranks (K.O.: MARIO 5.36, KATO 5.22, GORDON 5.07; SONJA and
   IVAN baseline). The cap is measured: the pass-spec's +0.15 ate the
   autopilot's FIRST margin to 3.1px and died on every SLACK tax, and even
   +0.01 at SUPERCROSS broke its CONTACT phase pins — the bite tops out where
   a taxed win survives. Customs/TEST drafts carry no `pace` key, so they ride
   the baseline pack. The lap book is UNIFORM two laps: the original's
   lap-count variation is VS-mode options this port does not model. Both laws
   pinned by excitecheck's PER-COURSE LEAGUE section (336 checks).
- The bay's ghost preview is a silhouette + colour bar, not the animated
  NES stamp cursor; palette labels are text (see also open polish #2573).

## Juice layer (#2387)

All presentation, zero sim state — `excitecheck` receipts are untouched by
design and re-ran 103/103 after the pass:

- **Flyby** pays its pop at the RIVAL's position (`+150` floats off their
  position with a white ring flash + gold sparkle), not just your nose.
- **Rank churn** flashes like the NES: every net position gained/lost pops
  `+n POS` / `-n POS` over your bike with a rising/falling tone.
- **Per-rival engines**: every rival in earshot gets a synth hum — volume
  from the probe gap (`r.d - g.total`), pitch from ITS speed — and a rival
  closing on your back winds its pitch UP as the jolt pre-tell, paired with
  a flashing amber rear chevron.
- **Hit riders lean**: a bumped rival tips a decaying sinewave a few frames
  (`leans[name]`); the jolted player snaps their own wheel (`leanYou`).
- **Wreck scars**: a wipeout (rival or you) leaves a dirt mound + oiled skid
  mark ON THE TERRAIN (world-x pinned, lap-wrapped) while the rider walks
  the bike back; it dries out after the remount (`rup`).
- **Tumble is a story, not a flicker**: rider comes OFF and flips a few
  frames, bike parks nose-in-dirt while they walk it back, then a hop and
  they're on. The `#2391` amber chevron stays through all three phases.
- **Landing dust for everyone**: player and rivals puff on a firm touchdown
  (pre-step `vy < -1.4`; rivals also on a nose-high `|pitch| > 0.2` slap).
