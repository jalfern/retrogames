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
- **Rush hour**: a 20-second wave every 65 s doubles intake and order rate,
  tightens deadlines and pays ×1.5.
- **Autopilot** (attract demo + harness win-proof) drives only the pad — the
  same interface a Plaicraft model slot will use — triaging repairs/jams and
  buying racks.
- `snapshot/restore` are intentionally absent from the contract: the seeded
  rng is a closure JSON cannot copy (#391 family).

## Verify
```bash
npm run floorbosscheck          # Node: boots/rules/win/determinism/episode (mutant-proven)
npm run floorbossplay           # headless Chrome, real keys/taps: start→play→end→restart, pixels track the sim
CONTRACT_ONLY=floor-boss npm run contractcheck
node scripts/floorboss-smoke.mjs [seed]   # quick one-shift print
```

## Honest gaps
- The stow arm is decorative physics — it poses toward the bay but the robot
  does the transfer (real arm-on-bay manipulation is #1141 territory).
- No trucks/visual departures; shipping is a dock pulse + payout.
- Only one shift template; difficulty varies by seed, not by level ladder.
- Two-player manager seats (model vs human, one slot each) are the #1144
  follow-up: the episode format already pins `sources`.
- Rack placement is 1-cell blocks; real warehouse aisle-clearance rules
  (turn radii, forklift lanes) are faked by BFS.
