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
- **Freight line** (#1921): the truck is the till. A packed order BOOKS its
  payout into escrow that rides the parcel (`{n, since, esc}`); the credits land
  when the trailer loads the parcel's LAST box (`freight` event). A haul that
  physically carries `FULL_TRAILER` (3) or more boxes pays `FREIGHT_PER_BOX` (6)
  per box — full trailers earn, dribbles ride free of bonus. Scheduled pickups
  (cap/age law) are free; a MANAGER tap-call is impatience and pays
  `DISPATCH_FEE` (5) — the only tax on the floor. Stranded escrow pays nothing:
  money follows freight, so late-shift parcels must be recalled home. Ledger
  (`E[escrow:paid:freight:fees]`) and per-parcel escrow ride `stateHash`
  (additive, #1373 law) and `state()`. Autopilot freight economics: escrow
  counts as money-in-transit for purchases, expansion freezes after
  `SHIFT - 1500` (a late rack never earns back), and the last 20 s reel every
  parcel in. Measured: autopilot wins 14/15 seeds, avg ≈1197 (main ≈1160) —
  thin seed 12 lands ~60 short, an honest variance of the shifted cash flow.
  Two law repairs surfaced on the way: a refused purchase (poor) once wedged
  the autopilot's held `pad.b` (no rising edge could re-arm the tool — it now
  steps off the spot and retries), and a bot that went DOWN while detailed to
  the bay and repaired mid-swing raced the gantry (it now stands down; the
  servo's cargo is already landing).
- **Freight tiers** (#1927): distance prices the haul. Every parcel rolls a
  destination class when it packs — LOCAL 0.58 / REGIONAL 0.28 / LONG HAUL 0.14 —
  on a **side-stream rng** (`seed ^ 0x9e3779b9`); the module stream (orders,
  conveyor, rush) generates byte-identically to the pre-tier floor, pinned by
  golden order-signatures for 8 seeds. A full trailer (`FULL_TRAILER` 3, law
  unchanged) pays `FREIGHT_PER_BOX` (6) × `[1,2,3]` per box by the destination
  of each box actually aboard; dribbles ride free as ever. The road is the
  cost: at send-off the haul commits `TRIP_TICKS` `[0,750,1650]` by its
  farthest loaded class, and a truck on the road answers neither the cap/age
  call law nor a manager tap — a tap on the road is a silent wait, never an
  express fee for a truck that cannot come. The pad tags far posts (amber ×2,
  violet ×3), the dock counts the trip home in world seconds (`ON THE ROAD`),
  and the haul-out fx names the class. Dest, away and the per-class load ride
  `stateHash` (additive, #1373 law) and `simState` (`padDest`, `truckAway`,
  `truckFar`). The autopilot skips pad steps while the truck is away; economy
  measured at merge: autopilot wins 13/15 seeds (main 13/15, same thin seeds
  2/12), avg 1337 vs main 1268 — far hauls buy their multiplier with pickups
  the floor never gets back, so late-shift freight is a decision.
- **Load weight** (#1931): weight is the sibling rate-card to distance. Every
  parcel rolls a weight class when it packs — LIGHT 0.52 / STANDARD 0.30 /
  HEAVY 0.18 — on a THIRD side-stream rng (`seed ^ 0x5f356495`): the module
  stream AND #1927's destination stream generate byte-identically (dest and
  weight sigs both pinned for 8 seeds). A full trailer (law unchanged, dribbles
  free) pays `FREIGHT_PER_BOX × FREIGHT_MULT × WEIGHT_MULT` per box by each
  box's dest×weight cell (`tr.grid[d][w]` is the manifest) — so a LOCAL×HEAVY
  crate pays exactly what a LONG-HAUL×LIGHT crate pays (18), and the rare
  LONG×HEAVY box is the floor's richest cargo at 54. The dock is the cost: one
  box rides aboard after `TRUCK_LOAD × WEIGHT_LOAD` ticks (`[1,1,2]` — heavies
  are manhandled, 28 ticks), so a late-shift send of heavies holds the trailer
  and costs a pickup. The pad tags classes: heavies wear a steel bar + H badge,
  standard a grey bar (light rides bare, same no-label law as LOCAL); heavy
  boxes land with a low thud, and a heavy aboard names itself on the till
  (`HEAVY xN`). Weight joins `stateHash` (pad `w`, T `grid`; additive #1373)
  and `simState` (`padWeight`, `truckWeights`). **Surfacing fix:** #1927's dest
  ladder tested LONG first, then up to 0.86 — that gave REGIONAL ~72% and LOCAL
  ~14%, not the documented 58/28/14 (its spread gate only asserted LOCAL>LONG
  and passed at 18>16). Bands corrected; mix gates now demand LOCAL > REGIONAL >
  LONG and LIGHT > STANDARD > HEAVY across 16 shifts, and `--mutate-bands`
  proves the sentinel can fail. Measured 15-seed autopilot vs the live
  pre-weight main in one process: wins 14/15 vs main 13/15 (same thin seed 2,
  seed 12 recovers 853→1009), avg 1401 vs live main 1337 (baseline re-measured
  in the same process per the session-206 drift note) — heavies buy
  their multiplier with dock time, and the honest dest mix pays less than the
  inverted one did.
- **Rush hour**: a 20-second wave every 65 s doubles intake and order rate,
  tightens deadlines and pays ×1.5.
- **Autopilot** (attract demo + harness win-proof) drives only the pad — the
  same interface a Plaicraft model slot will use — triaging repairs/jams and
  buying racks.
- `snapshot/restore` are intentionally absent from the contract: the seeded
  rng is a closure JSON cannot copy (#391 family).

## Verify
```bash
npm run floorbosscheck          # Node: boots/rules/win/determinism/episode (mutant-proven) + servo presentation source pins (#1877) + load-out (#1911) + freight-line conservation/bonus/express laws (#1921) + freight tiers: side-stream golden, tiered bonus, road law, dest spread (#1927) + load weight: dest+weight goldens, mix sentinels, rate literals 60/54, dock speed 14/14/28 (#1931)
node scripts/floorbosscheck.mjs --mutate-yield   # servo bay-yield law can fail
node scripts/floorbosscheck.mjs --mutate-reach   # servo reach law can fail
node scripts/floorbosscheck.mjs --mutate-cap     # the dock cannot pack past the pad (#1911)
node scripts/floorbosscheck.mjs --mutate-freight # the old pack-line till cannot come back (#1921)
node scripts/floorbosscheck.mjs --mutate-bonus   # dribbles cannot claim the freight bonus (#1921)
node scripts/floorbosscheck.mjs --mutate-tiers   # far posts cannot pay the LOCAL rate (#1927)
node scripts/floorbosscheck.mjs --mutate-miles   # the truck cannot answer instantly from any distance (#1927)
node scripts/floorbosscheck.mjs --mutate-weight  # heavy crates cannot claim their rate (#1931)
node scripts/floorbosscheck.mjs --mutate-slow    # heavies cannot cost the dock their ticks (#1931)
node scripts/floorbosscheck.mjs --mutate-bands   # the inverted dest band (REGIONAL 72%) cannot return (#1931)
npm run floorbossplay           # headless Chrome, real keys/taps: start→play→end→restart, pixels track the sim; servo carry ghost + loaded-diamond pulse gates; truck waits budgeted in WORLD ticks (#1877); real-tap pad call/send + drawn-truck-is-sim-truck gates (#1911); escrow-books-at-pack + freight-paid-at-drive-off gates (#1921); violet far-post tag pixels + road-commit + tap-on-road-silence gates (#1927 — verb gates run with auto-dispatch off and settle dock+truck+road together); steel heavy-tag pixel [154,215,255] + padWeight simState eye (#1931)
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
  exactly what it loaded (see Engine notes). ~~Payout timing is still at pack.~~
- ~~Truck economy is thin: shipping still pays at pack, the haul costs nothing
  and arrives free~~ **CLOSED by #1921**: the freight line — pack escrows the
  payout onto the parcel, money lands when the trailer hauls the last box, full
  trailers (3+ boxes) earn 6/box, and manager tap-calls pay an express fee (see
  Engine notes).
- ~~Freight tiers are unexplored: distance or load-weight classes beyond the
  box-count bonus could price the haul further~~ **CLOSED by #1927**: distance
  classes price the haul (LOCAL/REGIONAL/LONG HAUL at 58/28/14 on a
  side-stream rng, freight 6x[1,2,3] per box aboard, road-wait
  [0,750,1650] blocks call law and tap — see Engine notes). The
  stranded-escrow half of the old gap stays accepted law (#1921: money
  follows freight, refunds would be counterfeit).
- ~~Load-weight classes remain unexplored: #1927 priced distance only; heavy
  parcels (slower to load, higher rate per box) are the sibling idea left on
  the shelf~~ **CLOSED by #1931**: weight classes price the haul beside
  distance (LIGHT/STANDARD/HEAVY at 52/30/18 on a third side-stream rng, full
  trailers pay 6x[1,2,3]dest x[1,2,3]weight per box, heavies load at 2x
  TRUCK_LOAD — see Engine notes). The rate ladder stays flat on LOCAL dribbles:
  dribbles ride free, distance AND weight only pay aboard a full trailer.
- Only one shift template; difficulty varies by seed, not by level ladder.
- Two-player manager seats (model vs human, one slot each) are the #1144
  follow-up: the episode format already pins `sources`.
- Rack placement is 1-cell blocks; real warehouse aisle-clearance rules
  (turn radii, forklift lanes) are faked by BFS.
