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
  Holding nothing at an open container + B retrieves.
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

## Verify
```
npm run tidycheck            # 56 Node gates + browser gates (needs npm run dev)
npm run tidycheck -- --node  # Node-only
npm run tidycheck -- --mutate   # door mutant (TIDY_MUT=door|glass|run|tidy|order)
CONTRACT_ONLY=tidy-bot npm run contractcheck
```
Mutants: `door` (open doors stop blocking), `glass` (plates stop shattering),
`run` (empty washer starts), `tidy` (wrong stows stop costing),
`order` (carry queue flips FIFO→LIFO) — each turns NAMED gates red; restore
after.

## Honest gaps
- **CLOSED by #2250**: GLIDE TO IT — tap the floor and the bot BFS-routes
  there (`routeDir`), re-planning per door state, refused honestly when the
  spot has no road. The human is always the driver (any key/verb/tap cancels).
- **CLOSED by #2266**: TWO-SLOT CARRY — two arms, FIFO release, tray drag
  (see §Two-slot carry above). What stays open: tray physics with fragile
  juggle risk (turning too hard spilling the tray), and a two-at-a-time
  place at the container mouth.
- Retrieval takes the last-wrong item, not an aimed pick from the rack.
- No looping wash-cycle hum (START fires a one-shot sweep); attract restarts
  the demo game rather than looping level 2+.
- Glide walks but never acts — tap-to-open/place would collapse the chore loop
  into single taps; held back until the verbs feel as good one-handed.
