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

## Shift ladder — the night shift becomes a career (#2346)

- `sim.js`: `shiftParams(n)` is the whole ladder, pure in n — quota `1000 +
  200(n−1)`, the order wire tightens 540→380 (rush 320→220), deadlines shorten
  −4%/rung to a 0.72 floor, drive-wear cuts 15/rung to −70. Shift 1 lands
  exactly on the pre-ladder constants, so single-shift play is bit-for-bit the
  old floor (#1917 zero-footprint law — proven against git HEAD's engine with
  literal behavior traces, not vibes). `nextShift(gs)` clocks the career into
  the next night: the floor persists (hires stay hired, racks keep stock,
  freight caught in a gripper rides morning dispatch), bots come out
  wear-reset, the strike sheet is new, orders/pad/belt/truck wipe clean,
  escrow follows the parcels out (#1921 law) — and the quota is now measured
  against what THIS shift earns (`score − shiftBase`); on shift 1 (`shiftBase
  0`) that is bit-identical to the old absolute law.
- The run ends when a night is LOST (fired mid-shift, or short at the
  whistle); every cleared night banks (`cleared++`) and the over screen names
  the next rung and its price. The HUD carries the rung (`SHIFT n` + a green
  bank tally), the quota bar tracks earnings-vs-rung, the first-night lesson
  does not repeat on shift 2, and the leaderboard renamed BEST SHIFT → BEST
  RUN (runs now span the ladder). Contract: pad A on a cleared night advances
  (QA bots / replays / RL can climb it); `shiftInfo` is the DEV eye.
- Honest shape of the ramp (measured, autopilot): seeds 4242/1337/777/7/99
  bank 5–8 nights before the ladder out-earns the proven manager — winnable
  early, it bites late. Nothing here is scripted difficulty: the same
  determinism law (seeded streams, fixed BFS, integer clocks) covers every
  rung, and the shift bits join `stateHash` additively (#1373 law).
- Proof: `floorbosscheck` +31 gates (params law + caps + clamp, three HEAD
  parity traces, earnings-not-score quota, the full nextShift carry-over law,
  hash/state rungs, five career ramps, ten UI pins); mutants
  `--mutate-ladder` (quota stops climbing), `--mutate-advance` (advance
  without a cleared night), `--mutate-bank` (career resets to zero) — each
  dies, tree restores green. `floorbossplay` drives the ladder with real
  keys: win → Enter → shift 2 live (career 1689, quota 1200), a short night
  ends the run, restart lands a clean shift 1, zero page errors.

## Ladder polish — the clock-in reads the rung (#2352)

- **Clock-in ceremony** (#2352): advancing used to be instant — the sim stamped
  `shiftstart` and the painter ignored it. Now `advanceShift` hands the stamp to
  `handleEvents` and the floor gets a ~2 s ceremony: NIGHT n slams in over the
  rush-style wash, the quota reprices on a card, the carry-over is said out loud
  (`BOTS MAINTAINED · STRIKES WIPED · FREIGHT STAYS` — exactly what `nextShift`
  does), and the rung prices itself: `WIRE +n% · DEADLINES −n% · WEAR −n` from
  `rungPrice(n)` — pure in n, derived from `shiftParams`, zero at rung 1.
  Painter-only: no sim state, no hash change, non-blocking (inputs steer during the
  wash; the ceremony never paints over attract or over).
- **DEEPEST SHIFT** (#2352): board entries carry the rung the run reached and the
  attract board shows `BEST RUN n · DEEPEST SHIFT n` (`floorboss.deep`) — the
  ladder itself is the scoreboard. Old entries without a rung read as shift 1.
- **Rung-parameterised rush clock, measured-pinned** (#2352): `rushOn/rushLen`
  ride `gs.params`; `rushNow`, the rush-event stamp, the HUD lamp, the wash and
  the scan all ask the rung clock instead of hardcoding 2700/1200. Two rung-shaped
  variants were MEASURED against the career ramp and rejected: late-biased waves
  cost seed 4242 a banked night (rush freight can't get home before the whistle),
  early-biased waves fired seed 1337 at shift 5. The #2346 ladder law outranks
  polish, so the values ship pinned at the classic and `--mutate-rush` kills any
  un-measured nudge. The mechanism is proof-tested with an artificial rung clock
  (2500/1400); one line varies it once a shape survives 5-seed careers.
- Proof: `floorbosscheck` +24 gates (rung-clock literals + pin law + mechanism,
  `rungPrice` laws 0/0/0 · 4/4/15 · 42/28/70 monotone, ceremony/carry-over/board
  source pins, no-hardcode guard); mutants `--mutate-rush` (clock drifts without a
  re-measure), `--mutate-price` (the card claims a free rung) — each dies.

## Duel seats — model vs human at one console (#2555)

- One console, two seats: **seat H** is the existing human channel (mouse/touch/
  pad); **seat M** is the model manager — the quota-proven autopilot driving its
  own cursor/tool channel from `pads[1]` (AGENTS.md: a CPU opponent is the
  default; there is no second on-screen pad). Entry: `D` at the attract or the
  cyan DUEL chip.
- One budget stays the floor's: `gs.score` and every purchase/fee/fine/quota law
  are untouched, so the autopilot plays an economically identical game at either
  seat and the win proof transfers (#1917 zero footprint — solo hashes are
  byte-identical). What the duel adds is **production credit** on three laws:
  a stow pays the RACK owner (bot or gantry); a packed order's escrow rides the
  parcel to the seat that staged MORE of its crates (no strict majority → the
  HOUSE); the full-trailer freight bonus accrues per box onto the loading ledger
  (`truck.bonus[0..2]`) and pays at drive-off. Ownership stamps: racks/robots
  carry `owner` (0 you, 1 model, −1 the house legacy fleet); staged crates
  remember their bot's seat in `stOwn`. Conservation law (gated every tick):
  `score = 100 + Σcredits − spent`.
- Verdict at any end: the richer seat-till is **MANAGER OF THE NIGHT**, named on
  the over screen; the house is not a manager. Career shifts carry the ledgers
  (credit persists; the freight tally resets with the trailer like the pad).
- Seat marks: racks wear owner frames (green you / cyan model / classic house
  orange), hired bots wear an employer dot, seat M steers a cyan bracket; the
  twin till rides the HUD between the escrow chip and the tool chips.
- The Plaicraft episode finally seats the model: duels record
  `players: 2, sources: ['human','model']`, slot 1 carrying the model's own pad
  states per tick — the second slot the #1144 format always pinned.
- Duel hash segment `D[...]` (credits, spent, verdict, owners, seat-M channel) is
  duel-only — additive (#1373) and absent from every solo hash.

## Verify
```bash
npm run floorbosscheck          # Node: boots/rules/win/determinism/episode (mutant-proven) + servo presentation source pins (#1877) + load-out (#1911) + freight-line conservation/bonus/express laws (#1921) + freight tiers: side-stream golden, tiered bonus, road law, dest spread (#1927) + load weight: dest+weight goldens, mix sentinels, rate literals 60/54, dock speed 14/14/28 (#1931) + tail law: pivot geometry ×8 bearings, whole-net≡kneeNet dead-code proof (6543 boards), career clip-audit (pre-PR planner clips 2009, live 0), repath back-diagonal rig + control, liveTails eye, twin determinism (#2760)
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
node scripts/floorbosscheck.mjs --mutate-tail    # loaded carts turn into their own counterweight — the tail clause dies in the router, ghost-clips return (#2760)
node scripts/floorbosscheck.mjs --mutate-tail-land # the land scan goes blind to the back diagonal — racks drop onto committed backswings (#2760)
node scripts/floorbosscheck.mjs --mutate-duel    # bot stows cannot bypass the rack-owner credit law (#2555)
node scripts/floorbosscheck.mjs --mutate-lane    # long tight aisles cannot be sealed into one-way traps (#2614)
node scripts/floorbosscheck.mjs --mutate-corner   # racks cannot choke a tight elbow at its swing (#2627)
node scripts/floorbosscheck.mjs --mutate-flow     # dead-end spurs cannot claim two-way arrows (#2622 item 3)
node scripts/floorbosscheck.mjs --mutate-flowheat # the second route on a cell cannot stop counting — live heat dies (#2680)
node scripts/floorbosscheck.mjs --mutate-duck   # carts stop yielding into bays — the avoidable freeze comes back (#2692)
node scripts/floorbosscheck.mjs --mutate-manners # the first duck never names itself — courtesy stays decoration (#2700)
node scripts/floorbosscheck.mjs --mutate-attract # the shop window goes cold — the demo seed stops ducking on screen (#2700)
npm run floorbossplay           # headless Chrome, real keys/taps: start→play→end→restart, pixels track the sim; servo carry ghost + loaded-diamond pulse gates; truck waits budgeted in WORLD ticks (#1877); real-tap pad call/send + drawn-truck-is-sim-truck gates (#1911); escrow-books-at-pack + freight-paid-at-drive-off gates (#1921); violet far-post tag pixels + road-commit + tap-on-road-silence gates (#1927 — verb gates run with auto-dispatch off and settle dock+truck+road together); steel heavy-tag pixel [154,215,255] + padWeight simState eye (#1931); DUEL live drive: D enters the duel, cyan model cursor moves on its own, twin till updates, verdict banner lands (#2555); yield holds on live traffic — the dashed cyan courtesy ring sampled atomically with the yields eye (#2692)
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
- ~~Only one shift template; difficulty varies by seed, not by level ladder~~
  **CLOSED by #2346**: the career ladder — clearing a shift clocks into the next
  with an honest, pure ramp (see "Shift ladder" below).
- ~~Two-player manager seats (model vs human, one slot each) are the #1144
  follow-up: the episode format already pins `sources`~~ **CLOSED by #2555**:
  DUEL seats — the model manager (autopilot) drives its own slot beside the
  human; credit follows work (rack-owner stows, shipper escrow, per-box freight
  bonus), the whistle names MANAGER OF THE NIGHT, and episodes record
  `players: 2, sources: ['human','model']` (see "Duel seats" above). Hot-seat
  two-*human* managers (a second keyboard channel) stay a future idea — the gap
  as written asked for model vs human, and that is what shipped.
- **DISCLAIMER** — Point-plus-diagonal body model — DECIDED state (#2787 audit
  closed the question 2026-11-19; #2488 doctrine: a documented judgement is not
  work). Carts are points that sweep a nose knee (#2711) and a tail
  counterweight diagonal (#2760) through loaded pivots; overhang beyond those
  diagonals and forklift-lane widths stay unmodelled. Every fix design was
  measured, not assumed, and the audits refused them all: radius-2 placement
  (curated blueprints are already non-compliant — netdiff −2,230 over 500
  boards; that half needs floor re-authoring), straight-line tip-space (49/10
  careers; collides with the jam-distance doctrine), turn-hold at the pivot
  (seed 107 ran 97 holds, jam-escalation over-called ×56), and plan-time
  body-reservation (`qa/floorboss-plan-reserve` @ `ccfec75`: zero cadence cost
  but −1.6% net on the violation tally, +21 on seed 55 — the residual is
  post-plan drift, prediction error on stalling rivals, which no plan-time view
  can see). Turn rights (#2783's swing-aware duck) remain the shipped
  courtesy. Salvage kept: `rivalTimeline`/`planRight`/`sweepTimeline` +
  `scripts/lib/rights-baseline.mjs`. For the record, what IS law on this
  floor: stranding (#2546), no-passing lane (#2614), corner stack (#2627),
  two-way flow marks (#2622), knee (#2711) and tail (#2760) sweeps,
  turn-count routing + repath-on-land (#2724), swing-aware courtesy (#2783),
  with the traffic read (#2680) and seat-stamped refusals (#2622) carrying it
  to the screen — the point-plus-diagonal body is the deliberate edge of that
  grammar, and nothing beyond it is scheduled.
