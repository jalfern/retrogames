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
- **CLOSED by #2606:** **ABANDON on the pad** — a test ride is now a phone's
  too. While a draft is seated the pad grows a third button (`data-vc="c"`,
  sky, labelled ABANDON) that fires the SAME Escape law `endTestRide` already
  honored — zero new exit logic: the seat owns the button, so it appears exactly
  on `play && testRide.active` and leaves with the seat (the badge reads
  "ABANDON OR ESC TO BAY"). The prop rides a component-state mirror (`testing`)
  because `testRide` lives in the effect closure the JSX cannot read. The bay
  never grows it (EXIT already lives in the tool strip, reachable by cursor+A).
  Proven: exciteplay +6 — no C in the bay, C grows seated, label+code law
  (`Escape`), thumb-tap lands in the bay draft-intact, C leaves with the seat,
  no C in a league race — 90/90 on :5176, excitecheck 336/336 untouched.
  Harness catch: the pad hides on keyboard use (Step 5 feel) — gates wake it
  with `touchstart` after keyboard legs or they measure the hide, not the law.
- **CLOSED by #2603:** OWN TERRAIN — the same third button, generalized.
  `ownTerrain(i)` (levels.js): the bay's TEST draft (TRANSIENT) and every
  registered custom are YOURS, and a ride on your own terrain owes you an exit
  (this supersedes #2606's decline of candidate 8, which #2603 — the README
  gap idle-kick filed — ships): the pad's third button rides on ALL own
  terrain — ABANDON where the badge teaches it (#2606), **EXIT** on a
  splash-seated saved design — and `Esc` mid-race on a registered custom
  abandons the race back into the bay with the design loaded from the seated
  entry's own `stamps` (the compile output rides inside it; `compileCustom`
  re-sorts, so the draft is byte-identical to the terrain you were riding; no
  storage round trip). Abandoning submits nothing: `doFrameSim` stops the tick
  the screen leaves `play`, and `finish()` is the only writer of the
  leaderboard. League tracks 1–6 keep the full-race commitment — mid-race
  Escape stays a dead key THERE (the shipped pin stands, league-only) — and a
  storage-off session still loses its designs at page reload (the existing
  storage law, untouched). Proven by the `excitecheck` OWN EXIT block
  (law ×13, reload byte-identity ×2 customs, structural submit-nothing; two
  by-hand structural mutants die by name) and driven by `exciteplay` with real
  Esc, a real EXIT thumb-tap, and a bay→splash→re-seat loop (97/97 merged).
- **CLOSED by #2625 (stage 1): YOUR LAPS** — the designer sets the race length.
  A `LAP` tool joined the bay strip (after TEST, before ERASE — EXIT stays last,
  backward wrap still lands on EXIT; the law is tested, not assumed): Space cycles
  the count 1→8→1 and the tool's face wears its state (`LAP 3` — the only tool
  that shows its number), NES orange. Default 2 is the house book, so every design
  saved BEFORE this law rides byte-identical. The number travels with the design
  everywhere: the codec stores `laps` (validated by `lapsOf` — old-format or
  garbage values fall back to the book, never drop the design), a deviating splash
  row labels itself (`★ YOURS · 3 LAPS`), and the seat hands the stored number to
  `makeGame` — gated behind `ownTerrain`, so league 0–5 gets no option and the
  two-lap book with every match receipt stands untouched. Esc-abandon carries the
  number you rode back into the bay with the stamps; a deviating seat toasts
  `N LAPS — BY YOUR LAW`. Fidelity: the original's edit mode lets you choose the
  lap count; its exact VS-mode range is operator lore we don't model, so 1–8 is
  the port's book. Proven by excitecheck YOUR LAPS (+22: law/book, config-not-
  terrain (compile output carries no laps — every geometry pin holds by
  construction), codec round-trip/legacy/garbage/clamp, one draft registered at
  1 and 3 laps racing provably different distances at WOT with determinism, and
  source pins for the wiring excitecheck can't drive). Re-recorded pin: strip is
  11 tools, TEST 6 · LAP 7 · ERASE 8, EXIT last.
- **CLOSED by #2642:** **GRADED PACK** — customs learn the league grammar
  (#2573) at build time. `buildTrack` grades every drawn course (registered and
  TRANSIENT): `H` = what the lap takes from the pack — the mean pace-line speed
  loss to slope/mud/water (`rivalSpeed`'s own penalties sampled across the lap)
  plus whoop coverage, which rivals do not feel but the player lands through —
  then `pace = clamp(0.06 − 0.10·H, 0, 0.06)`, capped at #2573's measured
  ceiling (+0.06 survives every SLACK tax). Terrain gives back what it took: a
  clean lap rides the pack at the cap, a full whoop slab refunds it all to the
  baseline. Pure and deterministic (same stamps, same grade); league tracks keep
  their table value (`pace ?? grade`, never `||` — a true table zero survives,
  gated); the compiler still emits geometry only. Visible: custom splash rows
  wear pack pips (`data-pack`, 0–3 pips of the cap) beside ★ YOURS. Proven by
  the excitecheck GRADED PACK block (+12: cap law, exact receipts for a clean
  and a crowded reference draft, monotone under every stamp kind, [0,cap]
  range, slab→0, TRANSIENT grading, PACK_TIER seat receipts with ranks intact,
  a WOT ride still wins its own crowded course twice identically, source pin
  for the seat pips) + `paceK=0` mutant caught.
- **CLOSED by #2647:** **ATTRACT RIDES YOUR DESIGNS** — the marquee honours
  the garage (and stopped lying). Ground truth before the stage: the MOTOCROSS
  replay reached its finish line at t2561 and `doSim` called `finish(true)` —
  the BOT's score 14300 went into `excitebike.board` and the attract froze on
  the over screen until a key was touched. Two laws now: **VIEWER SEATS** (a
  demo end while the screen is `attract`/`tracks` submits nothing and never
  leaves the screen — `play`, TEST and WATCH receipts untouched) and **SEAT
  ROTATION** (`demoSeats`, pure in attract.js: MOTOCROSS first, then your
  saved designs in roster order, wrapping; zero designs → `[0]`, the shipped
  demo byte-honest). Each design is planned once lazily by the SAME autopilot,
  `plan({track, laps:1})` — one lap is the whole draft in a breath — cached on
  the compiled terrain's OBJECT identity, so a re-save swaps the object (the
  registerCustom law) and the demo re-plans instead of riding stale dirt. The
  screen wears a `DEMO · MOTOCROSS` / `DEMO · CUSTOM k` badge (a caption; the
  #365 one-message rule holds). Proven: excitecheck ATTRACT DESIGN (+19: seat
  law, roster mapping, one-lap autopilot completes a design twice byte-identical,
  identity-invalidation, viewer-guard source pins; mutants — guard removed,
  seats frozen at MOTOCROSS — both die by name) and exciteplay 137/137 (+6:
  real frames drive the finish line via `demoSkip`, board stays empty across
  both line-crossings, badge text == probe label, real 46 s marquee cycles).
- **CLOSED by #2651:** THE BADGE RIDES THE NAME. The bay gained a **NAME**
  tool (index 9, before the verbs): ←/→ walk a 27-glyph wheel (A–Z + space,
  wrapping — the wheel is STATE, it keeps its letter between commits), A/SPACE
  commits, Backspace (the pad's new DEL button) takes one back, and the 12-char
  cap refuses the thirteenth letter BY NAME (`designName` uppercases/collapses/
  caps at save, so storage sees one grammar). `abandonToBay` carries the name
  with the stamps (#2603 promise extended — re-saving never silently renames),
  splash rows speak saved names, and the attract badge calls a design by its
  own name (`demoSeatName`, pure: MOTOCROSS untouchable; empty/whitespace or a
  `CUSTOM`/`CUSTOM k` placeholder keeps byte-honest roster grammar). The strip
  grew to 12 — type steps down to 6px with a 4px gutter (SAVE/EXIT were already
  running off the 256px canvas at 11 tools and 8px/10). Proven: excitecheck
  451/451 (+25 NAME block: wheel/push-pop/cap/placeholder law, end-to-end
  seat naming, source pins; mutants — fallback removed, cap removed — die by
  name) and exciteplay 151/151 (+14: real keys name a draft, cap refuses, DEL
  trims, save speaks it, the marquee flies `DEMO · KU` over its own dirt with
  `data-demo-name` in the DOM). Honest remainder: the keyboard has no direct
  TYPE shortcut (the wheel is the law; KeyX/KeyG keep their jobs), and the
  saved-name column shares the JALFERN watermark row at 7px.
- **CLOSED by #2632 (your-laps polish):** the four view-layer tells the QA
  pass asked for, all as PURE helpers in custom.js (the law lives once; the
  page paints it): (1) the over screen announces the book — a custom off the
  house book ends on `CUSTOM 1 · 5 LAPS` (`overBookLabel`; league seats and
  default-book runs stay the plain line byte-honest), like the NES edit runs
  that said their distance; (2) the LAP bump tells at the ends of the book —
  arriving at 8 and wrapping to 1 flinch the tool cell white (5-frame decay)
  and the step tone becomes a double-note, a rising fifth home / a falling
  drop off the wrap (`lapCycle` names the ends); (3) the splash badge has a
  compact form under `sm` (`★ 3L`, default-book silent `★`) so a deviating row
  clears the pack-pip column at 375px — a clearance law in exciteplay in the
  wordmark-law grammar (#2573 item 2), with the full `★ YOURS · 3 LAPS`
  unchanged from sm up and one `[data-custom-laps]` holder either way; (4) the
  first default-book SAVE teaches the tool once per storage (`TIP: LAP SETS
  YOUR RACE LENGTH`, flag `excitebike.lap-tip.v1`; a designer who sets their
  own length never sees it, and the lesson line belongs to the SAVE that
  earned it — a later receipt replaces it). Proven: excitecheck 469/469
  (+18 pins; hand-mutant `>=`→`>` on the wrap condition dies on 2 named
  lines) and exciteplay 160/160 (+9: top/wrap flinch live in the probe, a
  mid-book press earns none, 375px badge geometry clears the pips, the
  over-book DOM line, tip fires-once / stays-quiet / not-for-lapsed /
  flag-unspent). Honest remainder: the tip is bay-canvas text (no DOM mirror —
  the probe carries it instead), the flash decays on draw frames so a
  background-tab bay skips its tell, and the compact badge at phone widths is
  the star without the word "YOURS" (the aria-label carries it).
- **PER-COURSE LEAGUE (#2573 items 5+6):** every course carries a `pace`
   (MOTOCROSS/SUPERCROSS 0 — calibration, all receipts byte-honest; then
   +0.02/+0.03/+0.04, K.O. CROSS +0.06) and `PACK_TIER` [1,2/3,1/3,0,0] rides
   it on the front ranks (K.O.: MARIO 5.36, KATO 5.22, GORDON 5.07; SONJA and
   IVAN baseline). The cap is measured: the pass-spec's +0.15 ate the
   autopilot's FIRST margin to 3.1px and died on every SLACK tax, and even
   +0.01 at SUPERCROSS broke its CONTACT phase pins — the bite tops out where
   a taxed win survives. Customs/TEST drafts carried no `pace` key (baseline pack)
   until #2642 taught them to grade — see GRADED PACK above. The lap book is UNIFORM two laps: the original's
   lap-count variation is VS-mode options this port does not model. Both laws
   pinned by excitecheck's PER-COURSE LEAGUE and GRADED PACK sections.
- **CLOSED by #2573 (splash feel):** the last three items of the splash pass.
  (2) The wordmark no longer crowds the app chrome at phone widths — it shrinks
  with the viewport (`clamp`), sitting clear between ARCADE/PAUSE/the speaker,
  proven by a clearance law in exciteplay (wordmark rect keeps ≥4px from every
  visible button, attract and splash, at 375x380). (3) The roster cursor is the
  NES catalogue's little bike, not a `▶`: a 16px sprite in the RIDE palette
  (red body, white helmet, yellow wheels) bobbing two frames (`bikebob`,
  `steps(1)`); `data-on` exposes WHICH row wears it, so the walk and the wrap
  over a grown roster are graded from the DOM against the cursor law. (4)
  Seating a course revs the engine once before the countdown, keyed to the
  gear you seated in — LOW grinds 160→480 Hz, HIGH winds 220→760 Hz — with
  `revLog` receipts on the probe so the tie is provable, not vibes.
- The bay's ghost preview is a silhouette + colour bar, not the animated
  NES stamp cursor; palette labels are text.

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
