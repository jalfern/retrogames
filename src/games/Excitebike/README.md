# EXCITEBIKE (`/excitebike`)

The 1984 motocross, rebuilt toward the NES original: side view, a carved
heightmap course, one throttle, one jump, and the two rules that made the
game — **lean your bike in the air or eat dirt**, and **pump the button in
the mud or sink**. Everything (terrain, bikes, HUD dials, engine notes) is
synthesized at runtime; the attract demo is the autopilot's own proven run
replayed tick-for-tick through the same `step()` the harness audits.

## Design (issue #176)

Core loop: hold gas through a 2-lap course of ramps, whoops, mud, water and
boost arrows against a countdown the lap line extends. Speed is bought with
heat — redline too long and the engine bogs until it cools. Every big jump
asks the same question: nose attitude at landing. Lean back too far you
backflip; too far forward you agency-plant; both put you on the ground
counting seconds while the field rides over you — unless you mash A, which
is also how you crawl out of a stalled water hole. The one harness we
demand: `excitecheck` in Node — terrain audited as data (every up-step
clearable at wide-open throttle, every launch landable, features only on
real ground), the autopilot (which rolls the REAL sim per candidate, the
Spy Hunter lesson) clearing both tracks in first, and the **slack rule**:
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

## Controls (faithful to the NES mapping)

- `↑` gas on the ground, **lean back in the air** · `↓` brake, **lean nose
  down in the air** · `SPACE` jump (hold = longer), and **pump it** in mud,
  water and after a crash · `G` gear High/Low at the title · `?` pause.
- `←`/`→` steer ACROSS the track (#2457, full authority on the ground, half
  in the air): pass on the open line — same-line traffic is solid, and
  matched speed in the same line is a RUB.
- Touch pad: up/down arrows are the throttle and brake (and lean), the
  stick's left/right are the lines, the A button is jump/pump. Tap anywhere
  to start.

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
- Rivals never INITIATE a line change: they ride line 0 and only spread when
  a rub shoves them. Active pack bargaining — dive-bombing a gap, defending
  a lane, choosing the outside into a corner — remains open; the axis made
  the PLAYER's line choices real, the pack's are still pace-line politics.
- The NES splash screen (EDIT TRACK / 6 tracks) is not here: two carved
  tracks, 2 laps each, which is where the fidelity muscle (controls,
  feel, terrain) actually lives.

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
