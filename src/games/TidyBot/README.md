# TIDY BOT — engine notes (issue #1143)

An original chores game: a household robot works a printed chore list in a
dollhouse cutaway at 320×240. The issue framed it on the robot sim kit (#1141);
the kit isn't merged, so everything — physics, props, art, audio — is
synthesized in this folder (AGENTS.md law). RETRO bar (ART.md): the issue
didn't say MODERN.

## Files
- `sim.js` — pure, seeded sim. One `step(gs, pads)` per tick; all rules live
  here; `autopilot(gs)` is the attract demo AND the harness win-proof;
  `playthrough(seed)` runs the whole game in Node.
- `index.jsx` — painter + shell: fixed-timestep loop, attract, pause, pad,
  contract + DEV hooks. `screen = world` (no camera) is the renderer's only
  spatial contract — tidycheck samples canvas pixels at sim coords.
- `art.js` — the two SKINS (#3078): `classic` (the shipped dollhouse, moved
  verbatim) and `reimagined` (PAPERCRAFT DIORAMA — construction-paper tiles,
  kraft walls, coral dining sheet, sticky-note tags, popsicle-stick bot; cut
  cards with hard offset shadows, dashed cut-lines, fold creases, marker ink).
  Selectable via `?style=reimagined`, the STYLE pill or the T key; persisted
  in `localStorage('tidybot.skin')`; classic is the default. The skins are
  presentation-only — `sim.js` never sees one — and both keep the signatures
  the pixel laws read (bot core reads teal, apple reads tomato red).

## Skins (#3078)
- The shell holds `let skin` + `let PA = PAINTERS[skin]`; every paint call
  goes through `PA`, and markers/particles/dust read `PA.chrome` colors, so a
  toggle repaints live with zero reload and zero sim impact.
- `quiet()` (DEV hook) pins a draw-deterministic frame — resets + sim hold
  freeze the sim; quiet clears the presentation transients that keep decaying
  per draw frame (dust, sparks, shake, flash, reach arc, arrival ring, and the
  attract flourish, whose old item id can alias a fresh stow after a reset).
- tidycheck's skin gates freeze both looks at load with a downsampled
  perceptual signature (classic `f947d5dc`, papercraft `17152d53` since #3086,
  was `33dfb942`) — raw bytes are deliberately NOT compared: Chromium's GPU
  canvas drifts ±1 on curved strokes with surface history, which reds byte
  goldens without any code change. Spatial truth is proven behaviorally:
  teal-at-bot and red-at-tray pixel laws run on BOTH skins, plus state-level
  toggle checks.

## Glide routing (#2250) — the BFS is the players' too
- Tap/click a floor tile during play and the bot routes itself there on the
  same 8px-grid BFS the autopilot uses. `routeDir(gs, tx, ty)` is pure — it
  reads the state and answers with the next press; the shell merges that into
  pads, so seed + pads determinism and every hash gate are untouched.
- The tapped point snaps to the nearest walkable cell (≤3 cells); anything
  deeper is refused with `NO WAY` — a tap is never a wedge.
- The roads TRACK the doors: `walkBit` re-keys per door state, so a route
  computed at the sink re-plans the instant the rack slides out mid-walk.
- Cancel law (the human is the driver): any keyboard/arrow direction, any A/B
  press, a new tap, WATCH, level change, reset or finish ends the glide.
- Autopilot and glide share one steering brain (`steerTo`): collision-aware
  axis choice, escape step, arrive radius 3.5px.

## Two-slot carry + tray (#2266) — stage 2 of the chores kit
- Two arms: `gs.held` is the FRONT arm (first grabbed), `gs.held2` the TRAY
  arm (second). `A` fills an empty slot with the nearest litter; a third grab
  refuses with `ARMS FULL` (named, never silent) and consumes nothing.
- **FIFO release**: placements, throws and drops empty the front arm first —
  the order you grabbed is the order that leaves, so a double-pickup never
  hides a surprise WRONG STOW. One press releases exactly one item.
- **Tray drag**: carrying two walks at `ROBOT_SPEED × 0.82` — the tray rides
  out front and tilts with every step. Double-carry is a trade-off, not a
  free upgrade.
- `finishable` now requires BOTH arms empty; the hash carries both slots
  (determinism unchanged — seed + pads still replay identically).
- The autopilot double-loads: it takes a second item only when its container
  matches what it already carries, so the attract demo and the win-proof run
  WRONG-STOW-free and visibly use the mechanic (~800 two-carry ticks/seed).
- Retrieve (B at an open container) still requires empty arms and lands in
  the front arm — the wrong-stow rescue law is untouched.

## Aimed retrieve (#2338) — name it, then pull it
- **Rack slots are engine state**: `it.slot` is assigned at stow (lowest free
  in the container), cleared while carried, and the freed slot is the next one
  filled. The cavity paints items at THEIR slot — retrieving a neighbour never
  shifts the rack, and all nine washer dwellers stay visible (the old
  index-based paint clipped row three; level 3's nine-dweller worst case could
  hide one). Slots ride `stateHash`, and `in`-states without a slot (cheats,
  pre-#2338 snapshots) heal deterministically at the tick boundary.
- **Tap-the-rack**: `aimAt(gs, tx, ty)` is pure like `routeDir` — a tap inside
  an OPEN cavity near a stowed item names it. The shell marks it (teal corner
  brackets pulsing at the slot, `AIMED` + a double ping) and glides to the rack
  front, but never fires the verb itself: the #2250 two-step law stands. While
  marked, B retrieves THAT item — the mark outranks the wrong-stow-first default.
- **Keyboard parity**: B + a held direction retrieves the stow furthest along
  that direction from the cavity centre (ties to the lowest slot). No aim, no
  direction: the wrong-stow-first default, byte-for-byte — the autopilot never
  aims, so every attract demo and win-proof rides the unchanged law.
- **Cancel law mirrors the glide**: any movement key, any verb landing, a new
  tap, WATCH, a level change or a reset clears the mark; B consumes it. The aim
  rides the pads (`pad.aim` = item id), so seed + pads replays stay identical.
  B is the COMMIT gesture — it must never clear the mark at keydown (a harness
  bug the browser gate caught by name).

## Tap-to-act (#2537) — the chore collapses into one tap
- **`tapAct(gs, tx, ty)` (pure, `sim.js`)** judges a tap into one order:
  carrying + matching container → PLACE (a mismatched carry simply refuses —
  one tap is never a blind WRONG STOW); an `aimAt` hit → RETRIEVE THE NAMED
  item (mark + order in the same tap); shut body → OPEN; open cavity with
  things in → RETRIEVE the default stow; open + empty → the tap stays a plain
  #2250 glide. Ordering mirrors the A/B verbs (place, aim, body, cavity).
- **The order rides the pad, not the keyboard.** The shell parks a pending
  chore and its fire-block in `doSim` synthesizes the press once the bot is
  at the spot (`pendingFire`: OPEN by the body, PLACE in the zone — a place
  aimed at a shut body fires the OPEN first and survives until it lands,
  RETRIEVE when the cavity is open and still holds its item). A refusal
  (STAND CLEAR / ARMS FULL) sets a 20-tick back-off instead of spamming.
  Because it lands in the merged pad, seed + pads determinism, replays and
  every hash gate are untouched; `contractHoldsLoop()` keeps the pending
  dormant while a contract driver owns the clock.
- **Cancel law mirrors glide+mark** (§Glide, §Aimed retrieve): any key, any
  new tap, WATCH, level change, reset or a human verb clears the order. It
  fires at most once.
- Supersedes the #2338 clause "the two-step law stands" — taps now carry
  their verb; the autopilot still emits plain pads (purity gates unchanged).
- Gates: `tidycheck` Node 109 — tapAct purity (each act, mismatch refusal,
  open+empty miss), fire/aliveness rules, determinism through the pending —
  plus live gates (real tap on the shut washer orders OPEN and ONE tap walks
  over and opens it; one tap on a far plate marks AND pulls; an arrow press
  mid-order cancels both). Mutant `tapact` (tapAct always misses) turns 4
  named gates red.

## Polish pass (#3086): the papercraft sells the MATERIAL
- Six item brief from QA, `reimagined` painter only (`art.js`), classic untouched
  (its golden `f947d5dc` proves it): gingham checks 8px/0.85 → 6px/0.6 with a
  scissors-WAVY cut cloth edge (`wavyRect`, deterministic sin-waves, checks clipped
  to the card); the attract title sign is now a cut CARD (r4 corners, fold crease,
  curl-shadow nicks) and its PRESS strip is torn (`torn`, 2px zigzag); the robot
  gets a corrugation peek (3 flute holes at the chassis cut edge) and washi tape
  over the antenna joint; the stove front gets two brass dial dots matching the
  fridge badge. `index.jsx`: papercraft-only confetti (2×3 tilted rects replacing
  2×2 pixels in `paintParticles`) and material audio — a two-tick paper crinkle at
  glide arrival, a 92 Hz cardboard thud + noise at close (classic keeps machine
  clacks). `GOLDEN_PAPER` moved `33dfb942 → 17152d53` in the same PR (approved
  restyle, #3085 policy).
- Harness lesson: two fixed-`waitForTimeout(80)` double-press sequences swallow
  the second press edge while software-rendered rAF catches up — they now
  `waitForFunction` on `held`/`held2`. Fixed sleeps between presses are a flake
  generator on cold pages; assert the STATE the press must cause.

## Polish pass (#2343): the demo sells the aim, the pull shows the reach- **Attract flourish (overlay, not autopilot).** `flourishPick(gs)` (pure, in
  `sim.js`) names the lowest-slot stow in an open cavity; the attract loop
  overlays its id on the pad (`p.aim`), so the demo MARKS the stow (teal
  brackets + AIMED) and the autopilot's own B pulls it. The autopilot itself
  still never emits an aim (the #2338 purity gate protects that law), so WATCH,
  contracts and every win-proof ride the unchanged pads byte-for-byte. A
  900-tick watchdog re-picks when a loop misses; level changes reset the mark.
- **Reach arc + vacated-slot flash (presentation-only, shell).** The `retrieve`
  ev now carries `c` (the cavity) AND fixes a latent bug: `slot` was read AFTER
  `takeInto` cleared it — every ev said `-1`. The shell arcs the item from the
  slot into the front arm over 8 draw ticks (with a fading tail + amber blink on
  the empty slot); the sim still resolves the pull in one tick. QA hooks
  `pullAnim()` / `flourish()` / `attractNow()` drive the gates.
- **Rack glyphs 0.62 → 0.78** — slots guarantee spacing since #2338, and small
  glyphs read poorly (GardenGuard #2331 precedent).
- Gates: `tidycheck` 103→113 (picker purity/determinism/shut-door, ev
  cavity+slot plumbing, overlay source-pin, live arc lifecycle, attract marks
  the cup by itself); mutants `overlay-stripped` and `ev-c-dropped` die by name.

## Core rules (what the harness proves)
- Containers really open: the washer rack / fridge door slide (`door` 0→1,
  ~22 ticks) and BLOCK the floor while open. A door that finds the robot on
  its footprint refuses to open ("STAND CLEAR") — that check is load-bearing:
  without it the door entombs the robot (strict-overlap can't step out).
  Pinched robots may still take shrinking-overlap escape steps.
- Order is enforced: shut washer refuses cargo (the A verb opens instead);
  START (B) only fires beside a shut + loaded washer; food in the washer is a
  WRONG STOW (−20, stored) that must be rescued with B (wrong kinds first)
  and re-stowed — level 3 ships one pre-loaded.
- Verbs: A = grab / place / open / close. B = throw / retrieve / start.
  Empty-handed B at an open container retrieves — which item leaves the rack is
  yours to name (#2338, above); the wrong-stow rescue still leads the default.
- Throw physics: fixed launch speed with decay; lands inside an open body
  rect → JAM (+6); on floor a PLATE SMASHES (−40, `gone`) else SPILL (−5).
  Smashed dishes count as cleared — the game can never brick.
- Level clear: nothing loose/held, nothing stowed wrong, both doors shut,
  washer started iff dishes exist. Time bonus = ceil(clockLeft/6) + 200.
- Determinism: layout is fixed per level (seed only enters `hash`), so
  seed + pads = identical hashes trivially and robustly.

## Layout invariants (hard-won — see issue #1143 comments)
1. Items may NEVER spawn beyond GRAB_R (26px) of any standable tile. The
   washer body + open door eat the whole front of the counter span (x34..68),
   so counter litter lives at x≥76 or is flank-reachable within 26px.
2. The autopilot steers with BFS over an 8px grid cached per door state;
   collision-aware axis choice (press what actually moves) so a corner graze
   can't wedge it; sticky pick (hysteresis) so nearest-target flip-flops
   can't stall it.
3. A press cadence of 14 ticks/press is global (`auto.cd`) — the shipped
   autopilot wins all seeds in ~8.3k ticks against a 33.6k-tick total budget,
   leaving humans huge slack.
4. Every container is flanked by real standable zones on both sides (#2284).
   The fridge sat flush (x=304 edge vs wall x=312): an 8px sliver no 12px bot
   could stand in, so it had one work zone while DW had two. It moved to
   x=254 — the right flank is a 20px lane with a mirrored zone (DW's pattern:
   zones sit 2px off the body, w18 h52). The tidycheck gate "fridge flank is
   two zones" goes named-red if any zone is painted onto furniture, into a
   dead sliver, or loses its road.

## Verify
```
npm run tidycheck            # Node 109 + browser gates, 145 green (needs npm run dev)
npm run tidycheck -- --node  # Node-only
npm run tidycheck -- --mutate   # door mutant (TIDY_MUT=door|glass|run|tidy|order|aim|tapact)
CONTRACT_ONLY=tidy-bot npm run contractcheck
```
Mutants: `door` (open doors stop blocking), `glass` (plates stop shattering),
`run` (empty washer starts), `tidy` (wrong stows stop costing),
`order` (carry queue flips FIFO→LIFO), `aim` (#2338 aiming ignored — the three
aimed-retrieve clauses go NAMED-red) — each turns NAMED gates red; restore
after. `tapact` (#2537 tap-to-act neutered to a plain glide) kills the four
one-tap chore gates by name.

## Honest gaps
- **CLOSED by #2250**: GLIDE TO IT — tap the floor and the bot BFS-routes
  there (`routeDir`), re-planning per door state, refused honestly when the
  spot has no road. The human is always the driver (any key/verb/tap cancels).
- **CLOSED by #2266**: TWO-SLOT CARRY — two arms, FIFO release, tray drag
  (see §Two-slot carry above). What stays open: tray physics with fragile
  juggle risk (turning too hard spilling the tray), and a two-at-a-time
  place at the container mouth.
- **CLOSED by #2338**: AIMED RETRIEVE — every stow owns a rack slot (engine
  state, lowest-free, freed slot reused, heal for slotless states), taps on an
  open cavity name the item (`aimAt`, pure), B + a held direction pulls the stow
  furthest that way, and both outrank the wrong-stow-first default; with no aim
  given the old law is byte-for-byte, so the autopilot and every win-proof ride
  unchanged. See §Aimed retrieve below.
- No looping wash-cycle hum (START fires a one-shot sweep); attract restarts
  the demo game rather than looping level 2+. — **CLOSED by #2283** (merge
  `014135b`: `feel()` runs a looping hum while `dwRun` — a 84 Hz wash tone
  every 36 ticks plus bubble ticks — and a cleared attract shift clocks into the
  NEXT room instead of hard-rebooting; marker added by #2488, the work shipped
  then and the bullet lacked it, #961 pattern).
- **CLOSED by #2537**: TAP-TO-ACT — a tap now carries its verb (open/place/
  aimed retrieve/default retrieve, judged by pure `tapAct`); the chore loop is
  one tap end to end, refusals stay honest (mismatched carry = no order).
  See §Tap-to-act above.
