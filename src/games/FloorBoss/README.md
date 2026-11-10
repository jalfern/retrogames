# FLOOR BOSS — robot warehouse management sim (issue #1144)

An original management sim on the Plaicraft robot sim kit: you run a 150-second
night shift on a fulfillment floor. Intake conveyor → stow arm → pallet racks →
hauler robots → shipping dock. Orders pour in with deadlines; throughput is the
score; three expired orders and you're fired. Quota: 1000.

## Files
- `sim.js` — pure, seeded, deterministic engine (no DOM, no React, no three).
  `makeGame(seed)`, `step(gs, pads)`, `state/hash`, `clickCell/setTool/
  cycleTool/toggleAuto/clickOrder/hireRobot`, `createAutopilot()`.
- `index.jsx` — canvas painter + shell (attract/play/over, HUD, orders panel,
  audio, pad, contract, DebugKit, Plaicraft episode recording).

## Engine notes
- **Kinematic grid, not cannon.** Top-down dispatch doesn't need the kit's
  rigid-body world (that's bench manipulation, #1141 stage 1). What the kit
  does provide: `mulberry32` + `hashString` (determinism), the episode
  recorder (`utils/robot/episode.js`) and the SimReady asset manifest
  (`utils/robot/assets.js`, `MANIFEST_REV` pinned into every saved episode).
- **Determinism**: integer tick clock, BFS with fixed neighbor order
  (N,E,S,W), everything seeded. Same seed + same pads → identical hash in
  Node and Chrome (`floorbosscheck` proves both sides).
- **Occupancy law**: anything that moves asks `blocked()` before entering a
  cell — walls, racks, arm, dock and every other robot are hard refusals.
- **Jams** are emergent from congestion, not scripted: two robots stalled
  within Manhattan distance 2 for >1 s escalate to JAM; a click backs one off,
  otherwise self-resolve at 5 s.
- **Breakdowns**: drive-wear accrues per cell; a worn robot stops for 1200
  ticks of idle repair, ~15 ticks shorter per turbo-click — triage is the
  manager's job, ignoring it is a decision with a cost.
- **Belt pressure**: the stow arm holds one item; if no rack has space the
  belt queues up and overflows at the intake (fine). Racks ($60) and robots
  ($150) come out of the score — capacity competes with quota.
- **Servo arm** (#1872): the gantry is a worker. Cargo waits `ARM_PATIENCE`
  (90) ticks in the gripper; if no non-broken bot is detailed to the bay, the
  arm rotates and loads the nearest in-reach rack (`ARM_REACH` 4 cells, ties
  x then y) itself, paying `STOW_PAY` and counting `gs.stows`. The swing costs
  `6 ticks/cell + 20 settle` — a slow, free lane beside the fast bot lane. The
  bay handoff always wins: no swing starts while a bot is tasked `toArm`,
  dispatch (auto and arm-click) refuses mid-swing, and the bay pickup retries
  while the gantry is over a rack — so no cargo is ever contested. Servo bits
  (`swing`, `target`) join `stateHash`; the painter draws the boom rotating and
  the reach diamond in rack mode.
- **Servo presentation** (#1877): the carry rides the same ghost-item arc
  painter as the bay handoff (`arcItems`, duration pinned to `swingT0` so the
  arc cannot lie about the carry); the reach diamond pulses on `heldT` while
  cargo waits loaded (teaches the patience rule before the swing); and ALL
  painter clocks (truck back-in/park/drive-off, ghost arcs) advance in WORLD
  ticks (`gs.tick` deltas per paint, clamp 8), never display frames — software
  Chrome paints ~11 fps and wall-frame waits flaked `floorbossplay` on main.
- **Load-out** (#1911): shipping is physical. A packed order stages a parcel
  (`{n: item count}`) on the dock pad; the pad caps at `PAD_CAP` 3 and a full
  pad holds the next ship on the line (silent wait, never a fine). Call law:
  the truck backs in when the pad is full or the oldest parcel ages past
  `PAD_AGE` 240 — or when the MANAGER taps the pad (and a tap while parked
  sends it early, losing nothing: the un-loaded parcel stays staged and recalls
  the trailer). Parked, it loads one box per `TRUCK_LOAD` 14 ticks, dwells
  `TRUCK_MIN` 40 once clear, and drives off carrying exactly what it loaded.
  Truck truth (mode, x, carry) and the pad are SIM state — the painter holds no
  forked truck, it draws `gs.truck`; `T[..]P[..]` joined `stateHash` (additive,
  #1373 law). Payouts and pack cadence are untouched — the truck is the pipe,
  not the till. The autopilot calls the trailer like an attentive manager (two
  waiting, trailer away), so attract shows staging and loaded departures.
- **Rush hour**: a 20-second wave every 65 s doubles intake and order rate,
  tightens deadlines and pays ×1.5.
- **Autopilot** (attract demo + harness win-proof) drives only the pad — the
  same interface a Plaicraft model slot will use — triaging repairs/jams and
  buying racks.
- `snapshot/restore` are intentionally absent from the contract: the seeded
  rng is a closure JSON cannot copy (#391 family).

## Verify
```bash
npm run floorbosscheck          # Node: boots/rules/win/determinism/episode (mutant-proven) + servo presentation source pins (#1877) + load-out (#1911)
node scripts/floorbosscheck.mjs --mutate-yield   # servo bay-yield law can fail
node scripts/floorbosscheck.mjs --mutate-reach   # servo reach law can fail
node scripts/floorbosscheck.mjs --mutate-cap     # the dock cannot pack past the pad (#1911)
npm run floorbossplay           # headless Chrome, real keys/taps: start→play→end→restart, pixels track the sim; servo carry ghost + loaded-diamond pulse gates; truck waits budgeted in WORLD ticks (#1877); real-tap pad call/send + drawn-truck-is-sim-truck gates (#1911)
CONTRACT_ONLY=floor-boss npm run contractcheck
node scripts/floorboss-smoke.mjs [seed]   # quick one-shift print
```

## Honest gaps
- ~~The stow arm is decorative physics~~ **CLOSED by #1872**: the servo arm
  rotates and self-stows in-reach racks when no bot is detailed to the bay
  (see Engine notes); full arm-on-bay *pick* from the belt is still the
  scripted handoff, but the transfer is now real gantry work with a swing cost.
- ~~No trucks/visual departures; shipping is a dock pulse + payout~~ **CLOSED
  by #1911**: the truck is sim-truth — ships stage parcels on the pad, the pad
  caps the pack line, taps call and send the trailer, and it leaves carrying
  exactly what it loaded (see Engine notes). Payout timing is still at pack.
- Truck economy is thin: shipping still pays at pack, the haul costs nothing
  and arrives free — a trucking budget or freight bonuses are unexplored.
- Only one shift template; difficulty varies by seed, not by level ladder.
- Two-player manager seats (model vs human, one slot each) are the #1144
  follow-up: the episode format already pins `sources`.
- Rack placement is 1-cell blocks; real warehouse aisle-clearance rules
  (turn radii, forklift lanes) are faked by BFS.
