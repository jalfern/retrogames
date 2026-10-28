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
npm run tidycheck            # 35 Node gates + 9 browser gates (needs npm run dev)
npm run tidycheck -- --node  # Node-only
npm run tidycheck -- --mutate   # door mutant (TIDY_MUT=door|glass|run|tidy)
CONTRACT_ONLY=tidy-bot npm run contractcheck
```
Mutants: `door` (open doors stop blocking), `glass` (plates stop shattering),
`run` (empty washer starts), `tidy` (wrong stows stop costing) — each turns
NAMED gates red; restore after.

## Honest gaps
- No pathfinding improvement for human players — the BFS lives only in the
  autopilot; a player can walk into the open door and must step around.
- Single task at a time (one held item); the real BEHAVIOR/Plaicraft robots
  juggle trays — a two-slot carry + tray physics would be the obvious stage 2.
- Retrieval takes the last-wrong item, not an aimed pick from the rack.
- No looping wash-cycle hum (START fires a one-shot sweep); attract restarts
  the demo game rather than looping level 2+.
