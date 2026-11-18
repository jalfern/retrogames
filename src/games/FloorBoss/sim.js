// FLOOR BOSS — the shift engine (pure, seeded, deterministic).
//
// A robot warehouse management sim (issue #1144): intake conveyor feeds a stow
// arm, hauler robots stock racks and answer orders, the outbound dock packs and
// ships. Throughput over one 150 s shift is the score; three expired orders and
// the boss fires you. The originals in the issue's own words are SimCity /
// theme-park sims — layout, dispatch and triage are the game, not finger speed.
//
// Determinism law (#1141 lineage): mulberry32 RNG, BFS with fixed neighbor
// order, integer tick clocks. Same seed + same pads = identical hash in Node
// and Chrome; floorbosscheck proves it and proves the autopilot makes quota.
//
// The kinematic grid sim is deliberate: top-down dispatch does not need the
// kit's cannon world (that is bench manipulation) — but the episode recorder,
// asset manifest and hashing discipline all come from the kit unchanged.

import { mulberry32, hashString } from '../../utils/robot/physics.js'

export const COLS = 26
export const ROWS = 15
export const SHIFT = 9000 // 150 s @ 60 fps
export const QUOTA = 1000
export const STRIKES = 3

// Shift ladder (#2346): the night shift becomes a career. Clearing a shift
// advances to the next one instead of ending the run, and each rung is an
// honest level-design step, not dice: quota climbs +200, the order wire
// tightens, deadlines shorten, drive-wear accrues sooner. Pure in n (no rng),
// so Node and Chrome book the same ladder — and shift 1 lands exactly on the
// pre-ladder constants (orderBase 540 / orderRush 320 / dueMult 1 / wearCut 0
// / quota QUOTA), so single-shift play is bit-for-bit the old floor (#1917
// zero-footprint law).
export const LADDER_QUOTA_STEP = 200
export function shiftParams(n) {
    const k = Math.max(1, n | 0)
    return {
        quota: QUOTA + LADDER_QUOTA_STEP * (k - 1),
        orderBase: Math.max(380, 540 - 20 * (k - 1)),
        orderRush: Math.max(220, 320 - 20 * (k - 1)),
        dueMult: Math.max(0.72, 1 - 0.04 * (k - 1)),
        wearCut: Math.min(70, 15 * (k - 1)),
        // #2352: the rush clock is now rung-PARAMETERISED (rushOn/rushLen ride the
        // params; lamp, wash, scan and stamps all ask rushNow). Measured at QA, two
        // rung-shaped attempts re-rolled the autopilot ramp — late-biased waves cost
        // 4242 a banked night (rush freight can't get home before the whistle),
        // early-biased waves fired 1337 at shift 5 — so the wave ships pinned on the
        // classic clock: the ladder law (#2346) outranks polish. The mechanism is
        // live and proof-tested; one line varies it once a shape is measured to hold.
        rushOn: 2700,
        rushLen: 1200,
    }
}

// How much tighter rung n is than the classic floor — the clock-in card prices
// the tightening so the ladder reads on screen, not just in the feet (#2352).
// Pure in n, derived from shiftParams; rung 1 is free of charge (0/0/0).
export function rungPrice(n) {
    const p = shiftParams(n)
    return {
        wire: Math.round((shiftParams(1).orderBase / p.orderBase - 1) * 100),
        due: Math.round((1 - p.dueMult) * 100),
        wear: p.wearCut,
    }
}

export const CELL = {
    FLOOR: 0, WALL: 1, CONVEYOR: 2, ARM: 3, OUT: 4, INTAKE: 5,
}
export const ARM_CELL = { x: 16, y: 1 }

export const KINDS = ['crate', 'can', 'coil']
export const BASE_PAY = { crate: 20, can: 15, coil: 25 }
export const STOW_PAY = 5
export const LATE_PAY = 8
export const ONTIME_BONUS = 25
export const EXPIRE_FINE = 20
export const BREAK_FINE = 10
export const OVERFLOW_FINE = 2
export const RACK_COST = 60
export const ROBOT_COST = 150
export const RACK_CAP = 4
export const MAX_ROBOTS = 4

const STEP_TICKS = 6 // one cell per 0.1 s
const CONV_TICKS = 8 // conveyor advances every 0.133 s
const PICK_TICKS = 30
const BAY_TICKS = 15
const DROP_TICKS = 20
// Servo arm (#1872): the arm is a worker, not a weathervane. When cargo sits
// in the gripper and no bot is detailed to fetch it, the arm rotates and loads
// an in-reach rack itself — a slow, free lane that keeps the belt moving when
// the floor is saturated. The bay handoff always wins (see the swing gate).
export const ARM_REACH = 4 // Manhattan cells the gantry can touch from its post
export const ARM_PATIENCE = 90 // held-ticks the servo waits for a bot first
const ARM_SWING_PER = 6 // rotation ticks per cell of reach
const ARM_DROP = 20 // settle ticks before the gripper opens
// Load-out (#1911): shipping gets physical. A packed order stages a parcel on the
// dock pad; the truck returns on law (pad full or oldest parcel aged) or on a
// manager tap, loads box by box, and drives off LOADED. Truck x is px in the fixed
// 800-px logical canvas (index.jsx never rescales logical units — TRUCK_PARK equals
// its PX(23)+5 dock lane), so the drawn truck IS the logical truck.
export const PAD_CAP = 3 // parcels the pad holds before the next packed ship waits
export const PAD_AGE = 240 // oldest parcel ages out after 4 s — the truck is called
const TRUCK_LOAD = 14 // ticks to load one box into the trailer
const TRUCK_MIN = 40 // min dwell after the pad empties (tap sends early)
// Freight line (#1921): pack BOOKS the money, the trailer PAYS it. A parcel's
// payout rides the parcel as escrow and lands on the tick its LAST box is
// loaded aboard; a haul that physically carries FULL_TRAILER or more boxes pays
// FREIGHT_PER_BOX per box — full trailers earn, dribbles ride free of bonus.
// Scheduled pickups (the cap/age law) are free; a MANAGER tap that calls the
// trailer early pays DISPATCH_FEE — impatience is the taxed dribble. The ledger
// rides sim truth: escrow in the hash, per-parcel escrow on the pad.
export const FREIGHT_PER_BOX = 6
export const FULL_TRAILER = 3 // boxes aboard at send-off that make a haul "full"
export const DISPATCH_FEE = 5
// Freight tiers (#1927): distance classes ride the parcel — far posts pay more
// freight, and the road is what it costs. Dest rolls at pack time on a
// SIDE-STREAM rng (gs.destRng): the module stream (orders, conveyor, rush)
// generates byte-identically to the pre-tier floor (#1917 law). A full trailer
// (FULL_TRAILER law untouched) pays FREIGHT_PER_BOX × FREIGHT_MULT per box by
// the destination of the box actually aboard; dribbles still ride free. At
// send-off the haul commits TRIP_TICKS by its FARTHEST loaded class, and the
// truck answers neither the call law nor a tap-call while away — a tap on the
// road is a silent wait, never an express fee for a truck that cannot come.
export const DEST_LOCAL = 0, DEST_REGIONAL = 1, DEST_LONGHAUL = 2
export const DEST_NAMES = ['LOCAL', 'REGIONAL', 'LONG HAUL']
export const FREIGHT_MULT = [1, 2, 3]
export const TRIP_TICKS = [0, 750, 1650]
export const DEST_ODDS = [0.58, 0.28, 0.14] // LOCAL / REGIONAL / LONG HAUL
// Load-weight classes (#1931): the sibling rate-card to distance. The heavier
// the crate, the higher the freight — and the longer it stays on the dock.
// Weight rolls at pack time on a THIRD side-stream rng (gs.weightRng): the
// module stream AND #1927's destination stream generate byte-identically.
// A full trailer pays FREIGHT_PER_BOX × FREIGHT_MULT × WEIGHT_MULT per box by
// the class of each box aboard (dribbles still ride free), and one box rides
// aboard after TRUCK_LOAD × WEIGHT_LOAD ticks — heavy freight pays more but
// holds the trailer longer, so a late-shift send of heavies costs a pickup.
export const WEIGHT_LIGHT = 0, WEIGHT_STANDARD = 1, WEIGHT_HEAVY = 2
export const WEIGHT_NAMES = ['LIGHT', 'STANDARD', 'HEAVY']
export const WEIGHT_MULT = [1, 2, 3] // freight rate multiplier by weight class
export const WEIGHT_LOAD = [1, 1, 2] // ticks-per-box multiplier (heavies are manhandled)
export const WEIGHT_ODDS = [0.52, 0.30, 0.18] // LIGHT / STANDARD / HEAVY
export const TRUCK_HOME = -90, TRUCK_PARK = 613, TRUCK_EXIT = 830
const TRUCK_BACK = 2.6, TRUCK_FWD = 3.2
const JAM_WAIT = 60 // waited this long next to another waiter -> JAM
const JAM_AUTO = 300 // self-resolve after 5 s
export const REPAIR_TICKS = 1200 // idle repair length; the painter shows it as a ring (#2254)
const TURBO_CUT = 15
const CURSOR_STEP = 4 // keyboard/mobile cursor: one cell per 4 ticks
export const BAY_CELL = { x: 16, y: 2 }
export const OUT_CELLS = [{ x: 23, y: 13 }, { x: 24, y: 13 }]
export const INTAKE_CELL = { x: 0, y: 1 }
export const CONV_ROW = 1
export const CONV_X0 = 1
export const CONV_X1 = 15

// Where an autopilot/boss wants racks: between the arm and the dock, so trips
// are short. Seeded layout starts with two racks already standing.
export const RACK_SPOTS = [
    { x: 14, y: 3 }, { x: 18, y: 3 }, { x: 20, y: 3 }, { x: 22, y: 3 },
    { x: 14, y: 5 }, { x: 16, y: 5 }, { x: 18, y: 5 }, { x: 20, y: 5 },
    { x: 22, y: 5 }, { x: 16, y: 7 }, { x: 20, y: 7 }, { x: 12, y: 7 },
]
const HOME_PADS = [{ x: 23, y: 12 }, { x: 24, y: 12 }, { x: 22, y: 12 }, { x: 21, y: 12 }]

const RUSH_ON = 2700
const RUSH_LEN = 1200

// static map ---------------------------------------------------------------
const map = []
for (let y = 0; y < ROWS; y++) {
    const row = []
    for (let x = 0; x < COLS; x++) {
        let c = CELL.FLOOR
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) c = CELL.WALL
        if (y === CONV_ROW && x >= CONV_X0 && x <= CONV_X1) c = CELL.CONVEYOR
        if (x === ARM_CELL.x && y === ARM_CELL.y) c = CELL.ARM
        if (OUT_CELLS.some((o) => o.x === x && o.y === y)) c = CELL.OUT
        if (x === INTAKE_CELL.x && y === INTAKE_CELL.y) c = CELL.INTAKE
        row.push(c)
    }
    map.push(row)
}
export const MAP = map

const inGrid = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS
const NB = [[0, -1], [1, 0], [0, 1], [-1, 0]] // fixed neighbor order — determinism

// Anything that moves must ask blocked(). Racks are physical obstacles too.
export function blocked(gs, x, y, ignoreId = null) {
    if (!inGrid(x, y)) return true
    const c = map[y][x]
    if (c !== CELL.FLOOR) return true
    if (gs.racks.some((r) => r.x === x && r.y === y)) return true
    for (const r of gs.robots) if (r.id !== ignoreId && r.x === x && r.y === y) return true
    return false
}

// #2546 aisle-clearance law — the forklift network stays serviceable. Real
// warehouses forbid racking that strands a lane: a forklift never enters an
// aisle it cannot leave (turn radii), and every rack face must be reachable.
// On this kinematic grid the honest analogue is three reachability laws,
// judged on a HYPOTHETICAL rack before anything is charged:
//   'self'   — the new rack has no drivable service side on the network
//   'rack'   — an existing rack loses its last reachable service side
//   'pocket' — a drivable cell that was reachable becomes unreachable
//              (a dead-end aisle behind the new rack)
// Anchors: shipping docks, home pads, and the arm bay's open sides — the
// places freight actually flows between (the same cells the dispatch engine
// lives on). Curated RACK_SPOTS satisfy all three by construction; only
// hand-built walls hit the refusal.
function serviceNet(gs, extra) {
    const isRack = (x, y) => (extra && extra.x === x && extra.y === y) || gs.racks.some((r) => r.x === x && r.y === y)
    const seen = new Set()
    let frontier = []
    const seed = (x, y) => {
        const k = `${x},${y}`
        if (!seen.has(k) && inGrid(x, y) && map[y][x] === CELL.FLOOR && !isRack(x, y)) { seen.add(k); frontier.push({ x, y }) }
    }
    for (const d of OUT_DOCKS) seed(d.x, d.y)
    for (const p of HOME_PADS) seed(p.x, p.y)
    for (const [dx, dy] of NB) seed(BAY_CELL.x + dx, BAY_CELL.y + dy)
    while (frontier.length) {
        const next = []
        for (const n of frontier) for (const [dx, dy] of NB) seed(n.x + dx, n.y + dy)
        frontier = next
    }
    return seen
}
// #2614 NO-PASS LANES — the two-way-width half of #2546's tail ("true turn
// radii / two-way lane widths stay future work"). Aisles here are one cell;
// the only way two bots pass head-on is a BAY — an open cell beside the run
// where a waiter pulls off. Without one, a long open-ended run is a one-way
// trap: two bots entering from opposite mouths refuse each other (occupancy
// law) and jam with nowhere to go. The warehouse rule, at the click point:
// completing a straight TIGHT run of >= LANE_LONG open cells — tight meaning
// both perpendicular neighbours blocked — whose mouths at BOTH ends stay open,
// is refused. LANE_LONG 5 is the trap's physical floor: the jam law fires at
// Manhattan distance 2, so the shortest lane that can hold a head-on meeting
// ENTIRELY inside tight walls — neither bot at a mouth, both committed — is
// 1 + 2 + 1 = 5 cells; on a shorter lane every meeting still has a bot at an
// open mouth to reverse into. Runs of 1..4 stay legal
// two-way (short enough to keep an exit visible); a bay splits a long run
// because its cell stops being tight; a run with a closed mouth is a dead-end
// spur, legal by the #2546 ruling (one-way by choice — you reverse before the
// meeting). Pure map+racks scan, fixed order (rows then columns, ascending),
// no rng: click-point only, movers and BFS never consult it.
export const LANE_LONG = 5
// Rich records of the same scan — the mouths ride along so #2622 TEACH THE LANE
// can name the honest fixes; laneRuns stays the law's identical string output
// (same scan, same order).
function laneChokes(gs, extra) {
    const open = (x, y) => inGrid(x, y) && map[y][x] === CELL.FLOOR
        && !(extra && extra.x === x && extra.y === y)
        && !gs.racks.some((r) => r.x === x && r.y === y)
    const runs = []
    for (let y = 1; y < ROWS - 1; y++) { // horizontal lanes
        let x = 1
        while (x < COLS - 1) {
            if (open(x, y) && !open(x, y - 1) && !open(x, y + 1)) {
                let x1 = x
                while (open(x1 + 1, y) && !open(x1 + 1, y - 1) && !open(x1 + 1, y + 1)) x1++
                if (x1 - x + 1 >= LANE_LONG && open(x - 1, y) && open(x1 + 1, y)) runs.push({ k: `h${y}:${x}-${x1}`, mouths: [{ x: x - 1, y }, { x: x1 + 1, y }] })
                x = x1 + 1
            } else x++
        }
    }
    for (let x = 1; x < COLS - 1; x++) { // vertical lanes
        let y = 1
        while (y < ROWS - 1) {
            if (open(x, y) && !open(x - 1, y) && !open(x + 1, y)) {
                let y1 = y
                while (open(x, y1 + 1) && !open(x - 1, y1 + 1) && !open(x + 1, y1 + 1)) y1++
                if (y1 - y + 1 >= LANE_LONG && open(x, y - 1) && open(x, y1 + 1)) runs.push({ k: `v${x}:${y}-${y1}`, mouths: [{ x, y: y - 1 }, { x, y: y1 + 1 }] })
                y = y1 + 1
            } else y++
        }
    }
    return runs
}
function laneRuns(gs, extra) {
    return laneChokes(gs, extra).map((r) => r.k)
}
// #2627 NO CORNER STACKS — the turn-radii tail of #2546/#2614: nothing at the
// click point stopped you racking the SWING of a corner. Real warehouses
// legislate corner clearances ("keep aisle bends free of stored goods") because
// an obstruction at an elbow blocks TWO aisles at once and kills the sightline
// into both. The mechanism here: a cart servicing a rack PARKS ON THE CELL
// FACING IT (Manhattan distance 1, held PICK_TICKS — atTarget in step()). Put
// the rack opposite a tight elbow and that work-stop lands on the one cell both
// arms must pass: through traffic on either arm stalls for the whole pick, and
// two waiting bots meeting ACROSS the elbow (B+d and B+d2 — Manhattan 2) trip
// the jam law (distance ≤ 2, both waits past JAM_WAIT) with no bay and no
// mouth-adjacent escape — the choke is created by the click. So on the
// hypothetical rack R, refuse the click that completes a tight elbow whose rack
// faces the corner:
//   B = R + d drivable, exactly two open neighbours d and d2, perpendicular;
//   both arms run TIGHT (both flanks blocked) for ARM_MIN cells from B;
//   both far ends stay OPEN MOUTHS (the cell past each tight run is open —
//   through traffic on both arms; a run ending at a wall is a dead-end spur,
//   legal by the #2546 ruling, and a bay mid-arm stops the tight run and
//   blesses the pull-off, same exemption #2614 carries).
// ARM_MIN 2 is the trap's physical floor, mirrored from LANE_LONG's 1+2+1:
// the jam pair sits one cell into each arm, and an arm of 1 leaves its bot at
// the mouth to reverse out of — the same exit #2614 keeps for lanes of 1..4.
// Escapes stay honest: plug either mouth, open a bay on either arm, or leave
// the facing cell unbuilt. Pure map+racks geometry, fixed order, no rng, no
// movers, zero footprint (#1917): the refusal charges nothing, lands no rack
// and changes no hash. Curated RACK_SPOTS never trip it (floorbosscheck pins
// the autopilot win proof transfers).
export const ARM_MIN = 2
// Rich records of the same scan — the mouths ride along so stage 2 (#2627 s2
// TEACH THE ELBOW) can name the honest fixes; cornerChokes stays the law's
// identical string output (same scan, same order).
function cornerRecords(gs, extras) {
    const ex = extras || []
    const open = (x, y) => inGrid(x, y) && map[y][x] === CELL.FLOOR
        && !ex.some((e) => e.x === x && e.y === y)
        && !gs.racks.some((r) => r.x === x && r.y === y)
    const chokes = []
    if (!ex.length) return chokes // only a rack can be the one that faces the corner
    const R = ex[0] // the hypothetical facing rack — every choke hangs off it
    for (const [dx, dy] of NB) { // d = the arm the rack faces; B = R + d
        const bx = R.x + dx, by = R.y + dy
        if (!open(bx, by)) continue
        for (const [px, py] of [[dy, dx], [-dy, -dx]]) { // d2 candidates (a perpendicular pair)
            // exact elbow: arms open along d and p; the two back cells closed
            // (d's back cell is the rack R itself; p's back cell must be shut).
            // The d-arm's first cell B+d is forced open by the run below; if
            // either arm's first cell is a bay or wall the run fails and the
            // corner keeps its escape.
            const d2open = open(bx + px, by + py)
            const backD2 = open(bx - px, by - py) // must be closed (wall or rack)
            if (!d2open || backD2) continue
            // tight-run along axis a from B; flanks are the perpendicular pair f/f'
            const run = (ax, ay, fx, fy) => {
                let k = 0
                while (open(bx + (k + 1) * ax, by + (k + 1) * ay)
                    && !open(bx + (k + 1) * ax + fx, by + (k + 1) * ay + fy)
                    && !open(bx + (k + 1) * ax - fx, by + (k + 1) * ay - fy)) k++
                const m = { x: bx + (k + 1) * ax, y: by + (k + 1) * ay } // past the tight run: an open mouth, or a wall/spur
                return k >= ARM_MIN && open(m.x, m.y) ? m : null
            }
            const m1 = run(dx, dy, px, py), m2 = run(px, py, dx, dy)
            if (m1 && m2) chokes.push({ bx, by, dx, dy, px, py, mouths: [m1, m2] })
        }
    }
    return chokes
}
function cornerChokes(gs, extra) {
    return cornerRecords(gs, extra ? [extra] : null).map((c) => `e${c.bx},${c.by}:${c.dx},${c.dy}`)
}
// #2627 stage 2 TEACH THE ELBOW — the refusal banner names the law; this
// answers "what would clear it?". Pure query for the painter, which lights
// these cells at the refusal (show the escape, don't tell). Honest fixes only:
// a mouth counts as a PLUG iff racking it would be a legal click in its own
// right (all five reach laws hold, so the lesson never suggests a refusal),
// AND with the plug stood the original click would build clean. The check
// stands the plug on a scratch cell pushed onto gs.racks and popped again —
// no charge, no landed rack, no event: state identical after the call
// (#1917 zero footprint). Fixed scan order, no rng — same board, same
// answer. A click that isn't refused answers nothing.
export function cornerEscapes(gs, x, y) {
    const chokes = cornerRecords(gs, [{ x, y }])
    if (!chokes.length) return []
    const out = []
    const seen = new Set()
    for (const c of chokes) for (const m of c.mouths) {
        const k = `${m.x},${m.y}`
        if (seen.has(k)) continue
        seen.add(k)
        if (strandsFloor(gs, m.x, m.y) !== false) continue // an illegal plug teaches nothing
        gs.racks.push({ x: m.x, y: m.y, items: [], owner: -1 })
        let clears = false
        try { clears = strandsFloor(gs, x, y) === false } finally { gs.racks.pop() }
        if (clears) out.push({ x: m.x, y: m.y })
    }
    return out
}
// #2622 TEACH THE LANE — the fourth law's refusal shows its honest exit, in the
// same green language the elbow lesson speaks (#2627 s2). The lane law bites the
// click that COMPLETES a ≥5-cell tight two-way run; the actionable fix is the
// mouth: racking either mouth turns the aisle into a dead-end spur — one-way by
// choice, legal by #2546. A bay (a notch left in the wall) is the better layout,
// but by refusal time the wall already stands and demolition is not a verb — so
// the lesson teaches the plug it can prove. Honest only: a mouth counts iff
// racking it is a legal click in its own right (all five laws hold) AND with the
// plug stood the refused click builds clean — the check stands the plug on a
// scratch rack pushed and popped: no charge, no landed rack, no event, state
// identical after the call (#1917 zero footprint). Fixed scan order, no rng —
// same board, same answer. A click that isn't lane-refused answers nothing.
export function laneEscapes(gs, x, y) {
    if (strandsFloor(gs, x, y) !== 'lane') return []
    const was = new Set(laneRuns(gs, null))
    const out = []
    const seen = new Set()
    for (const c of laneChokes(gs, { x, y })) {
        if (was.has(c.k)) continue // an existing run — this click did not complete it
        for (const m of c.mouths) {
            const k = `${m.x},${m.y}`
            if (seen.has(k)) continue
            seen.add(k)
            if (strandsFloor(gs, m.x, m.y) !== false) continue // illegal plug teaches nothing
            gs.racks.push({ x: m.x, y: m.y, items: [], owner: -1 })
            let clears = false
            try { clears = strandsFloor(gs, x, y) === false } finally { gs.racks.pop() }
            if (clears) out.push({ x: m.x, y: m.y })
        }
    }
    return out
}
// #2627 stage 3 SWING PAINT — the grammar made glanceable. Stages 1–2 made
// the elbow law bite and teach on refusal; this answers "where does the
// grammar live?" at a glance: a paint-query for LIVE elbows — cells where a
// cart parks IN the aisle mid-pick while traffic swings past. A live elbow is
// an open floor cell B with exactly two open neighbours, perpendicular arms,
// faced by an EXISTING rack R (R = B − arm, so B is R's service cell — the
// atTarget Manhattan-1 work-stop): every pick of R halts a cart on the turn.
// The exactly-two + perpendicular tests are the corridor skip in disguise: a
// rack facing a straight aisle leaves ±p open-neighbours — opposite, never a
// swing (#2614's lane country) — and a T-junction leaves three. `hard` =
// both arms see through traffic: the stage-1 tight-run per arm (tight for
// ARM_MIN cells, open mouth beyond) — the double-sightline case real yards
// paint strongest, and the one the click-point law can miss when arms
// tighten AFTER the facing rack landed (each flank click judged on its own).
// Pure map+racks geometry, fixed order, no rng, no movers, zero footprint
// (#1917) — the same scan family as cornerRecords; the painter draws it.
export function swingMarkers(gs) {
    const open = (x, y) => inGrid(x, y) && map[y][x] === CELL.FLOOR
        && !gs.racks.some((r) => r.x === x && r.y === y)
    const out = []
    const at = new Map() // `x,y` -> marker; two racks can face one elbow — merge, hard wins
    for (const R of gs.racks) {
        for (const [dx, dy] of NB) {
            const bx = R.x + dx, by = R.y + dy
            if (!open(bx, by)) continue
            const arms = NB.filter(([ax, ay]) => open(bx + ax, by + ay))
            if (arms.length !== 2) continue
            const [a1, a2] = arms
            if (a1[0] * a2[0] + a1[1] * a2[1] !== 0) continue // perpendicular only — a straight face doesn't swing
            // stage-1's run per arm: tight for ARM_MIN with an open mouth past it.
            const sees = (ax, ay, fx, fy) => {
                let k = 0
                while (open(bx + (k + 1) * ax, by + (k + 1) * ay)
                    && !open(bx + (k + 1) * ax + fx, by + (k + 1) * ay + fy)
                    && !open(bx + (k + 1) * ax - fx, by + (k + 1) * ay - fy)) k++
                return k >= ARM_MIN && open(bx + (k + 1) * ax, by + (k + 1) * ay)
            }
            const hard = sees(dx, dy, dy, dx) && sees(dy, dx, dx, dy)
            const key = `${bx},${by}`
            const prev = at.get(key)
            if (prev) prev.h = prev.h || (hard ? 1 : 0)
            else at.set(key, { x: bx, y: by, h: hard ? 1 : 0, arms: [a1, a2] })
        }
    }
    for (const m of at.values()) out.push(m)
    return out
}
function strandsFloor(gs, x, y) {
    if (map[y][x] !== CELL.FLOOR || gs.racks.some((r) => r.x === x && r.y === y)) return false // other laws refuse first
    const before = serviceNet(gs, null)
    const after = serviceNet(gs, { x, y })
    if (!NB.some(([dx, dy]) => after.has(`${x + dx},${y + dy}`))) return 'self'
    for (const r of gs.racks) if (!NB.some(([dx, dy]) => after.has(`${r.x + dx},${r.y + dy}`))) return 'rack'
    for (const k of before) if (k !== `${x},${y}` && !after.has(k)) return 'pocket'
    // #2614 the fourth law, judged on the same hypothetical rack: a click
    // that COMPLETES a no-pass lane is refused (see laneRuns above).
    const was = new Set(laneRuns(gs, null))
    for (const r of laneRuns(gs, { x, y })) if (!was.has(r)) return 'lane'
    // #2627 the fifth law, same hypothetical rack: a click whose rack FACES a
    // tight elbow is refused (see cornerChokes above).
    if (cornerChokes(gs, { x, y }).length) return 'corner'
    return false
}

function outDocks() {
    const docks = []
    for (const o of OUT_CELLS) for (const [dx, dy] of NB) if (map[o.y + dy][o.x + dx] === CELL.FLOOR) docks.push({ x: o.x + dx, y: o.y + dy })
    return docks
}
const OUT_DOCKS = outDocks()

// #2555 DUEL SEATS — a second manager (the model seat) sits at one console
// beside the human, one slot each, running the SAME floor. One budget is the
// floor's (gs.score and every spend — solo laws, purchases, quota — stay
// bit-identical, so the autopilot's win proof transfers to either seat); what
// a duel adds is PRODUCTION CREDIT: every asset carries an owner and every
// payout's credit lands on the seat that built or staged it. Three laws:
// (1) a stow pays the RACK owner, bot or gantry; (2) a packed order's escrow
// rides the parcel to the seat that staged MORE of its crates (no strict
// majority → the HOUSE); (3) the full-trailer freight bonus accrues per box
// onto the loading ledger at park and pays at drive-off. Ownership: 0 = seat H
// (human), 1 = seat M (model), −1 = the HOUSE — the legacy floor (opening
// racks and bots) earns for the house. Spending never touches credit (capex,
// fees and fines are the floor's budget, tallied on gs.spent so conservation
// closes: score = 100 + Σcredits − spent). At the whistle the richer till is
// MANAGER OF THE NIGHT — the manager whose assets ran the floor (the house is
// not a manager). Direction stays shared: either seat may steer any bot — the
// aisles are the floor's; the credit is private.
// Zero footprint (#1917): seat 1, the credit ledgers and every duel hash/state
// segment exist only while gs.duel; gs.score math never learns about seats, so
// solo play is bit-identical.
const ci = (owner) => (owner < 0 ? 2 : owner) // credit index: seat 0 → 0, seat 1 → 1, house → 2
function chan(gs, seat) { return seat === 0 ? gs : gs.m }
// credits are a PRODUCTION ledger — stows, order escrow, freight bonuses.
// Spending (capex, fees, fines) is the floor's budget: it moves gs.score and
// gs.spent, never a manager's credit. Conservation law: score = 100 + Σcredits − spent.
function credit(gs, owner, amt) { gs.score += amt; if (gs.duel) gs.credits[ci(owner)] += amt }
function debit(gs, amt) { gs.score -= amt; if (gs.duel) gs.spent += amt }

// BFS from (fx,fy) to nearest cell satisfying pred; robots are walls unless
// they are the mover itself. Returns path (excluding start) or null.
function bfs(gs, fx, fy, pred, ignoreId) {
    if (pred(fx, fy)) return []
    const seen = new Set([`${fx},${fy}`])
    let frontier = [{ x: fx, y: fy, path: [] }]
    while (frontier.length) {
        const next = []
        for (const n of frontier) {
            for (const [dx, dy] of NB) {
                const x = n.x + dx, y = n.y + dy
                const k = `${x},${y}`
                if (!inGrid(x, y) || seen.has(k)) continue
                if (blocked(gs, x, y, ignoreId)) continue
                const p = n.path.concat([{ x, y }])
                if (pred(x, y)) return p
                seen.add(k)
                next.push({ x, y, path: p })
            }
        }
        frontier = next
    }
    return null
}

const rackAt = (gs, x, y) => gs.racks.find((r) => r.x === x && r.y === y) || null

// Racks the gantry can reach from its post with room on a shelf, deterministic
// order: nearest first, ties by x then y (#1872).
const armReach = (gs) => gs.racks
    .filter((r) => r.items.length < RACK_CAP && Math.abs(r.x - ARM_CELL.x) + Math.abs(r.y - ARM_CELL.y) <= ARM_REACH)
    .sort((a, b) => (Math.abs(a.x - ARM_CELL.x) + Math.abs(a.y - ARM_CELL.y)) - (Math.abs(b.x - ARM_CELL.x) + Math.abs(b.y - ARM_CELL.y)) || (a.x - b.x) || (a.y - b.y))

// A bot detailed to the bay makes the servo hold still — handoff is the fast
// lane and never races the gantry.
const bayClaimed = (gs) => gs.robots.some((b) => b.task.kind === 'toArm' && !b.broken)

// #1921 freight line — the two trailer verbs with their money attached. A
// scheduled pickup (law) is free; a manager tap that calls early pays the
// dispatch fee (the express tax on dribbles); a send pays freight when the
// trailer hauls FULL_TRAILER boxes or more (see sendTruck).
function callTruck(gs, via, seat = 0) {
    gs.truck.mode = 'back'
    if (via === 'tap') {
        debit(gs, DISPATCH_FEE) // the express tax is the floor's bill — #2555: the tapping manager is named in the event
        gs.fees += DISPATCH_FEE
    }
    gs.ev.push({ type: 'truckin', tap: via === 'tap', fee: via === 'tap' ? DISPATCH_FEE : 0, s: seat }) // #2555: the tap that paid the tax is named
}

function sendTruck(gs, tap, seat = 0) {
    const tr = gs.truck
    if (tr.carry >= FULL_TRAILER) {
        // freight tiers (#1927): each box pays by its own destination class —
        // LOCAL hauls ride the flat rate, far posts multiply the freight.
        // Load weight (#1931): weight multiplies on top — 6 × [1,2,3] × [1,2,3],
        // so a LOCAL×HEAVY crate pays what a LONG-HAUL×LIGHT crate pays.
        let amt = 0
        for (let d = 0; d < FREIGHT_MULT.length; d++) for (let w = 0; w < WEIGHT_MULT.length; w++) amt += FREIGHT_PER_BOX * FREIGHT_MULT[d] * WEIGHT_MULT[w] * (tr.grid[d][w] || 0)
        // #2555: the full-trailer bonus accrues per box onto the shipper's tally
        // during park and pays at drive-off — the three-tally sum is exactly the
        // old floor total (a conservation gate proves it).
        gs.score += amt
        if (gs.duel) for (let i = 0; i < 3; i++) gs.credits[i] += tr.bonus[i]
        gs.freight += amt
        const heavy = tr.grid.reduce((s, row) => s + (row[WEIGHT_HEAVY] || 0), 0)
        gs.ev.push({ type: 'bonus', amt, carry: tr.carry, far: tr.far, tiers: tr.tiers.join(''), heavy, grid: tr.grid.map((r) => r.join('')).join(''), s0: tr.bonus ? tr.bonus[0] : amt, s1: tr.bonus ? tr.bonus[1] : 0 })
    }
    if (gs.duel) { tr.bonus = [0, 0, 0] }
    // the road is the cost (#1927): the trip commits by the farthest class
    // aboard — an empty dribble still drives home LOCAL-cadenced
    tr.away = tr.far >= 0 ? TRIP_TICKS[tr.far] : 0
    tr.mode = 'leave'
    gs.ev.push({ type: 'truckout', tap, carry: tr.carry, far: tr.far, s: seat }) // #2555: the manager who sent it
}

function cellClick(gs, x, y, seat = 0) {
    if (!inGrid(x, y)) return 'oor'
    const me = chan(gs, seat)
    const bot = gs.robots.find((r) => r.x === x && r.y === y)
    if (bot) {
        if (bot.broken) { bot.repair -= TURBO_CUT; gs.ev.push({ type: 'turbo', x, y, s: seat }); return 'turbo' }
        if (bot.jam) { nudge(gs, bot); gs.ev.push({ type: 'jamclear', x, y, s: seat }); return 'nudge' }
        me.sel = bot.id
        gs.ev.push({ type: 'select', x, y, s: seat })
        return 'select'
    }
    if (me.tool === 'hire') {
        if (gs.robots.length >= MAX_ROBOTS || gs.score < ROBOT_COST) { gs.ev.push({ type: 'poor', x: me.cursor.x, y: me.cursor.y, s: seat }); me.tool = null; return 'poor' }
        hireRobot(gs, seat)
        me.tool = null
        return 'hire'
    }
    if (me.tool === 'rack') {
        if (map[y][x] !== CELL.FLOOR) { gs.ev.push({ type: 'refuse', x, y }); return 'refuse' }
        if (gs.racks.length >= RACK_SPOTS.length + 4) { gs.ev.push({ type: 'refuse', x, y }); return 'refuse' }
        const strand = strandsFloor(gs, x, y)
        if (strand) { gs.ev.push({ type: 'aisle', x, y, why: strand }); return 'aisle' } // #2546: nothing is charged for a lane you cannot drive
        if (gs.score < RACK_COST) { gs.ev.push({ type: 'poor', x, y, s: seat }); return 'poor' }
        debit(gs, RACK_COST)
        gs.racks.push({ x, y, items: [], owner: seat })
        gs.ev.push({ type: 'build', x, y, s: seat })
        me.tool = null
        return 'build'
    }
    const rk = rackAt(gs, x, y)
    if (rk) {
        if (me.sel != null) {
            const bot = gs.robots.find((r) => r.id === me.sel)
            if (bot && !bot.broken && !bot.carry && !bot.jam && rk.items.length) {
                assignRack(gs, bot, rk, rk.items[0])
                gs.ev.push({ type: 'dispatch', x, y, s: seat })
                return 'dispatch'
            }
        }
        gs.ev.push({ type: 'peek', x, y })
        return 'peek'
    }
    if (map[y][x] === CELL.ARM) {
        // #1872: arm-click calls a bot only while the gantry is not mid-swing
        if (gs.arm.held && gs.arm.swing === 0) {
            const bot = nearestIdle(gs, BAY_CELL.x, BAY_CELL.y)
            if (bot) { sendArm(gs, bot); gs.ev.push({ type: 'dispatch', x, y, s: seat }); return 'dispatch' }
        }
        return 'idle-arm'
    }
    if (map[y][x] === CELL.OUT) {
        // #1911 load-out verb: tapping the shipping pad calls a waiting truck
        // early (before cap/age) or sends a parked one before its dwell ends.
        const tr = gs.truck
        if (tr.mode === 'out' && gs.pad.length) {
            if (tr.away > 0) { gs.ev.push({ type: 'peek', x, y }); return 'peek' } // on the road — silent wait, no fee for a truck that cannot come (#1927)
            callTruck(gs, 'tap', seat); return 'call'
        }
        if (tr.mode === 'park') { sendTruck(gs, true, seat); return 'send' }
        gs.ev.push({ type: 'peek', x, y })
        return 'peek'
    }
    return 'floor'
}
export const clickCell = cellClick

export function setTool(gs, tool, seat = 0) { const me = chan(gs, seat); me.tool = me.tool === tool ? null : tool }
// B cycles the build tool: none → rack → hire → none (pad/mouse parity).
export function cycleTool(gs, seat = 0) {
    const me = chan(gs, seat)
    me.tool = me.tool === null ? 'rack' : me.tool === 'rack' ? 'hire' : null
    return me.tool
}
export function toggleAuto(gs) { gs.auto = !gs.auto; gs.ev.push({ type: 'auto', on: gs.auto }); return gs.auto }
export function clickOrder(gs, id) {
    const o = gs.orders.find((x) => x.id === id && !o.shipped && !o.expired)
    if (o) { o.prio = !o.prio; gs.ev.push({ type: 'prio', id }) }
}
export function hireRobot(gs, seat = 0) {
    if (gs.robots.length >= MAX_ROBOTS) { gs.ev.push({ type: 'refuse', x: HOME_PADS[0].x, y: HOME_PADS[0].y }); return false }
    if (gs.score < ROBOT_COST) { gs.ev.push({ type: 'poor', x: 0, y: 0, s: seat }); return false }
    const pad = HOME_PADS.find((p) => !gs.robots.some((r) => r.x === p.x && r.y === p.y)) || HOME_PADS[gs.robots.length % HOME_PADS.length]
    debit(gs, ROBOT_COST)
    gs.robots.push(newRobot(gs, pad.x, pad.y, seat))
    gs.ev.push({ type: 'hire', x: pad.x, y: pad.y, s: seat })
    return true
}

function newRobot(gs, x, y, owner = -1) {
    return {
        id: gs.nextBotId++, x, y, carry: null, owner, // #2555: who hired it — −1 is the house (legacy floor)
        task: { kind: 'idle' }, path: [], moveT: 0, wait: 0, jam: false,
        pickT: 0, broken: false, repair: 0, wear: 0,
        wearMax: 260 + Math.floor(gs.rng() * 180) - gs.params.wearCut, dir: 0, hist: [], stall: 0,
    }
}

function assignRack(gs, bot, rk, item) {
    bot.task = { kind: 'toRack', rx: rk.x, ry: rk.y, item }
    bot.path = bfs(gs, bot.x, bot.y, (x, y) => nearCell(rk.x, rk.y)(x, y), bot.id) || []
    bot.wait = 0
}

const nearCell = (tx, ty) => (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1

function sendArm(gs, bot) {
    bot.task = { kind: 'toArm' }
    bot.path = bfs(gs, bot.x, bot.y, nearCell(ARM_CELL.x, ARM_CELL.y), bot.id) || []
    bot.wait = 0
}

function nearestIdle(gs, tx, ty) {
    let best = null, bd = 1e9
    for (const b of gs.robots) {
        if (b.broken || b.carry || b.task.kind !== 'idle' || b.jam) continue
        const d = Math.abs(b.x - tx) + Math.abs(b.y - ty)
        if (d < bd) { bd = d; best = b }
    }
    return best
}

function nudge(gs, bot) {
    // back off along where it came from, else any free neighbor
    const back = bot.hist[bot.hist.length - 1]
    const cands = back ? [back, ...NB.map(([dx, dy]) => ({ x: bot.x + dx, y: bot.y + dy }))] : NB.map(([dx, dy]) => ({ x: bot.x + dx, y: bot.y + dy }))
    for (const c of cands) {
        if (!blocked(gs, c.x, c.y, bot.id)) {
            bot.hist.pop()
            bot.x = c.x; bot.y = c.y
            bot.jam = false; bot.wait = 0
            repath(gs, bot)
            return true
        }
    }
    return false
}

function repath(gs, bot) {
    const t = bot.task
    if (t.kind === 'toRack') bot.path = bfs(gs, bot.x, bot.y, nearCell(t.rx, t.ry), bot.id)
    else if (t.kind === 'toArm') bot.path = bfs(gs, bot.x, bot.y, nearCell(ARM_CELL.x, ARM_CELL.y), bot.id)
    else if (t.kind === 'toStock') bot.path = bfs(gs, bot.x, bot.y, nearCell(t.rx, t.ry), bot.id)
    else if (t.kind === 'toOut') bot.path = bfs(gs, bot.x, bot.y, (x, y) => OUT_DOCKS.some((d) => d.x === x && d.y === y), bot.id)
    else bot.path = []
    if (bot.path == null) { bot.path = []; bot.stall++ } else bot.stall = 0
}

function autoAssign(gs) {
    // order demand first — deadlines kill the shift; stow only in the slack
    const open = gs.orders.filter((o) => !o.shipped && !o.expired).sort((a, b) => (b.prio - a.prio) || (a.due - b.due) || (a.id - b.id))
    const demand = {}
    for (const o of open) for (const k of o.items) demand[k] = (demand[k] || 0) + 1
    for (const b of gs.robots) {
        if (b.carry) demand[b.carry] -= 1
        if (b.task.kind === 'toRack') demand[b.task.item] -= 1
        if (b.task.kind === 'toOut' && b.carry) demand[b.carry] -= 0 // carry already counted
    }
    for (const k of gs.staging) demand[k] = (demand[k] || 0) - 1
    for (const k of KINDS) {
        while ((demand[k] || 0) > 0) {
            let best = null, bd = 1e9
            for (const r of gs.racks) {
                if (!r.items.includes(k)) continue
                const bot = nearestIdle(gs, r.x, r.y)
                if (!bot) break
                const d = Math.abs(bot.x - r.x) + Math.abs(bot.y - r.y)
                if (d < bd) { bd = d; best = { bot, r } }
            }
            if (!best) break
            assignRack(gs, best.bot, best.r, k)
            demand[k] -= 1
        }
    }
    // stow in the slack: a full arm stalls the conveyor — but the servo's own
    // swing counts as slack too, and dispatch never races it (#1872)
    if (gs.arm.held && gs.arm.swing === 0 && gs.racks.some((r) => r.items.length < RACK_CAP)) {
        const bot = nearestIdle(gs, BAY_CELL.x, BAY_CELL.y)
        if (bot) sendArm(gs, bot)
    }
}

export function makeGame(seed = 1337, opts = {}) {
    const duel = !!opts.duel // #2555: seat M — the model manager sits beside the human
    const rng = mulberry32((seed * 2654435761 >>> 0) ^ 0x1b873593)
    const gs = {
        seed: seed >>> 0, rng, tick: 0,
        score: 100, // opening float — SimCity lets you lay pipe before the tax base exists
        strikes: 0, auto: true,
        duel,
        credits: duel ? [0, 0, 0] : null, // #2555 production ledgers [seat H, seat M, house]; gs.score stays the floor total (solo law untouched)
        spent: duel ? 0 : null, // #2555: capex + fees + fines, so conservation closes: score = 100 + Σcredits − spent
        m: duel ? { cursor: { x: 22, y: 7 }, cursorT: 0, tool: null, sel: null, prevA: false, prevB: false } : null, // seat M's channel — the model's own cursor/tool
        stOwn: duel ? [] : null, // #2555: parallel to staging — which seat's bot staged each crate (−1 = house fleet)
        duelWinner: null,
        shift: 1, params: shiftParams(1), shiftBase: 0, cleared: 0, // ladder (#2346): quota is measured against shiftBase, cleared counts the nights banked
        tool: null, sel: null, cursor: { x: 12, y: 7 }, cursorT: 0,
        prevA: false, prevB: false,
        robots: [], racks: [], staging: [], orders: [], conv: [],
        arm: { held: null, pose: 0, swing: 0, swingT0: 0, target: null, heldT: 0 }, // pose 0 docked, ramps to 1 while loading; swing/target = servo self-stow (#1872)
        truck: { x: TRUCK_HOME, mode: 'out', dwell: 0, loadT: 0, carry: 0, away: 0, far: -1, tiers: [0, 0, 0], grid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bonus: duel ? [0, 0, 0] : null }, // load-out (#1911): mode out | back | park | leave; away/far/tiers = freight tiers (#1927); grid[d][w] = boxes by dest×weight (#1931); bonus[ledger] = per-seat freight tally (#2555)
        destRng: mulberry32((seed ^ 0x9e3779b9) >>> 0), // freight-tier side stream (#1927): dest rolls never touch the module stream
        weightRng: mulberry32((seed ^ 0x5f356495) >>> 0), // load-weight side stream (#1931): the third rng — dest and module streams stay byte-identical too
        pad: [], // staged parcels awaiting a trailer, { n: boxes, since: tick, esc: escrowed pay, d: destination class, w: weight class } (#1911/#1921/#1927/#1931)
        escrow: 0, paid: 0, freight: 0, fees: 0, // freight-line ledger (#1921)
        shipped: 0, expired: 0, stows: 0, quotaHit: false,
        spawnT: 60, orderT: 240, convT: 0, packT: 30,
        nextBotId: 1, nextOrderId: 1,
        end: null, endReason: '',
        fx: [], ev: [],
    }
    gs.racks.push({ x: RACK_SPOTS[0].x, y: RACK_SPOTS[0].y, items: ['crate', 'crate', 'can', 'can'], owner: -1 })
    gs.racks.push({ x: RACK_SPOTS[5].x, y: RACK_SPOTS[5].y, items: ['can', 'coil', 'crate', 'coil'], owner: -1 }) // #2555: the legacy floor is the HOUSE's
    gs.robots.push(newRobot(gs, HOME_PADS[0].x, HOME_PADS[0].y))
    gs.robots.push(newRobot(gs, HOME_PADS[1].x, HOME_PADS[1].y))
    return gs
}

// #2352: the wave is rung-shaped (rushOn/rushLen ride gs.params); the fallbacks
// keep pre-ladder states honest to the classic clock.
const rushClock = (gs) => [gs.params.rushOn ?? RUSH_ON, gs.params.rushLen ?? RUSH_LEN]
export function rushNow(gs) { const [on, len] = rushClock(gs); return (gs.tick % (on + len)) >= on }

function spawnOrder(gs) {
    const rush = rushNow(gs)
    const n = gs.tick > 3000 || gs.rng() < 0.4 ? (gs.rng() < 0.22 ? 3 : 2) : 1
    const items = []
    for (let i = 0; i < n; i++) items.push(KINDS[Math.floor(gs.rng() * KINDS.length)])
    const due = gs.tick + Math.round((items.length === 1 ? 1800 : 2400) * (rush ? 0.85 : 1) * gs.params.dueMult)
    gs.orders.push({ id: gs.nextOrderId++, items, due, prio: false, shipped: false, expired: false })
    gs.ev.push({ type: 'order' })
}

function tryShip(gs) {
    // #1911: the pad is the pipe — with three parcels waiting on a trailer there
    // is no dock space for a fourth, and the packed order waits (a silent hold,
    // never a fine: waiting is congestion, not a mistake)
    if (gs.pad.length >= PAD_CAP) return
    const open = gs.orders.filter((o) => !o.shipped && !o.expired).sort((a, b) => (b.prio - a.prio) || (a.due - b.due) || (a.id - b.id))
    for (const o of open) {
        if (gs.pad.length >= PAD_CAP) break // pad filled mid-cycle — the rest wait for the trailer (#1911)
        // consume left-greedy, tracking staging indices (deterministic; the
        // multiset of crates is unchanged from the pool splice walk)
        const need = o.items.slice()
        const taken = []
        const own = [] // #2555: whose bot staged each crate this parcel packs from
        for (let si = 0; si < gs.staging.length && need.length; si++) {
            const ni = need.indexOf(gs.staging[si])
            if (ni < 0) continue
            need.splice(ni, 1)
            taken.push(si)
            if (gs.duel) own.push(gs.stOwn[si])
        }
        if (need.length) continue
        const drop = new Set(taken)
        gs.staging = gs.staging.filter((_, si) => !drop.has(si))
        if (gs.duel) gs.stOwn = gs.stOwn.filter((_, si) => !drop.has(si))
        o.shipped = true
        // #2555 shipper law: the packed order's credit rides the parcel to the
        // seat that staged MORE of its crates; without a strict majority the
        // HOUSE keeps it (the legacy fleet works for the floor, not a manager).
        const seat1 = gs.duel ? own.filter((s) => s === 1).length : 0
        const seat0 = gs.duel ? own.filter((s) => s === 0).length : 0
        const shipper = gs.duel ? (seat1 * 2 > own.length ? 1 : seat0 * 2 > own.length ? 0 : -1) : -1
        const rush = rushNow(gs)
        const base = o.items.reduce((s, k) => s + BASE_PAY[k], 0)
        const onTime = gs.tick <= o.due
        const pay = Math.round(base * (rush ? 1.5 : 1) * (onTime ? 1 : 0.4)) + (onTime ? ONTIME_BONUS * o.items.length : LATE_PAY)
        gs.escrow += pay // #1921 freight line: the pack books it, the trailer pays it
        gs.shipped++
        // freight tiers (#1927): the parcel gets its destination when it packs —
        // rolled on the side stream so the module stream stays byte-identical.
        // Cumulative bands per the documented law LOCAL 58 / REGIONAL 28 /
        // LONG 14 (#1931 surfacing: the shipped ladder tested LONG first, then
        // up to 0.86, which gave REGIONAL the LOCAL band — the odds were
        // inverted on the page-vs-code bar; corrected, spread gate tightened).
        const dr = gs.destRng()
        const d = dr < DEST_ODDS[DEST_LONGHAUL] ? DEST_LONGHAUL : dr < DEST_ODDS[DEST_LONGHAUL] + DEST_ODDS[DEST_REGIONAL] ? DEST_REGIONAL : DEST_LOCAL
        // load weight (#1931): the parcel's heaviest crate sets its class —
        // rolled on the weight side stream, cumulative bands HEAVY 18 /
        // STANDARD 30 / LIGHT 52
        const wr = gs.weightRng()
        const w = wr < WEIGHT_ODDS[WEIGHT_HEAVY] ? WEIGHT_HEAVY : wr < WEIGHT_ODDS[WEIGHT_HEAVY] + WEIGHT_ODDS[WEIGHT_STANDARD] ? WEIGHT_STANDARD : WEIGHT_LIGHT
        gs.pad.push({ n: o.items.length, since: gs.tick, esc: pay, d, w, o: shipper }) // stage the parcel for a trailer (#1911); escrow rides the parcel (#1921), destination joins it (#1927), weight joins it (#1931) — and the shipper's seat rides it too (#2555)
        gs.ev.push({ type: onTime ? 'ship' : 'late', pay, o: o.id, d, w, s: shipper })
    }
}

function stepRobot(gs, bot) {
    if (bot.broken) {
        bot.repair--
        if (bot.repair <= 0) {
            bot.broken = false; bot.wear = 0
            bot.jam = false; bot.wait = 0
            // #1921 surfacing: a bot that went DOWN while detailed to the bay
            // stops owning the bay (the servo may swing with its cargo mid-
            // outage). On recovery, if the gantry is swinging, that cargo is
            // already landing on a rack — stand down instead of racing the arm.
            if (bot.task.kind === 'toArm' && gs.arm.swing > 0) { bot.task = { kind: 'idle' }; bot.path = [] }
            else repath(gs, bot)
            gs.ev.push({ type: 'repaired', x: bot.x, y: bot.y })
        }
        return
    }
    // arrival / work states
    if (bot.pickT > 0) {
        bot.pickT--
        if (bot.pickT === 0) {
            const t = bot.task
            if (t.kind === 'toRack') {
                const rk = rackAt(gs, t.rx, t.ry)
                const i = rk ? rk.items.indexOf(t.item) : -1
                if (rk && i >= 0) {
                    rk.items.splice(i, 1)
                    bot.carry = t.item
                    bot.task = { kind: 'toOut' }
                    repath(gs, bot)
                    gs.ev.push({ type: 'pick', x: bot.x, y: bot.y, k: t.item })
                } else { bot.task = { kind: 'idle' }; bot.path = [] }
            } else if (t.kind === 'toArm') {
                if (gs.arm.held && gs.arm.swing === 0) {
                    bot.carry = gs.arm.held
                    gs.arm.held = null
                    bot.task = { kind: 'toStock' }
                    repath(gs, bot) // stock target chosen below when it moves
                    gs.ev.push({ type: 'bay', x: bot.x, y: bot.y, k: bot.carry })
                } else if (gs.arm.swing > 0) {
                    bot.pickT = 4 // gantry is over a rack — hold at the bay, retry
                } else if (!gs.arm.held) { bot.task = { kind: 'idle' }; bot.path = [] }
            } else if (t.kind === 'toStock') {
                const rk = rackAt(gs, t.rx, t.ry)
                if (rk && bot.carry && rk.items.length < RACK_CAP) {
                    rk.items.push(bot.carry)
                    bot.carry = null
                    gs.stows++
                    credit(gs, rk.owner, STOW_PAY) // #2555 law: the stow pays the rack owner
                    gs.ev.push({ type: 'stow', x: rk.x, y: rk.y, s: rk.owner })
                    bot.task = { kind: 'idle' }; bot.path = []
                } else {
                    // target filled while en route — spread to emptiest rack, or
                    // wait at the bay if the whole floor is full (real pressure)
                    const cands = gs.racks.filter((r) => r.items.length < RACK_CAP)
                    if (cands.length) {
                        const pick = cands.sort((a, b) => (a.items.length - b.items.length) || (Math.abs(bot.x - a.x) + Math.abs(bot.y - a.y)) - (Math.abs(bot.x - b.x) + Math.abs(bot.y - b.y)))[0]
                        bot.task = { kind: 'toStock', rx: pick.x, ry: pick.y }
                        repath(gs, bot)
                    } else { bot.path = []; bot.wait++ }
                }
            } else if (t.kind === 'toOut') {
                if (bot.carry) {
                    gs.staging.push(bot.carry)
                    if (gs.duel) gs.stOwn.push(bot.owner) // #2555: staged freight remembers whose bot brought it
                    bot.carry = null
                    gs.ev.push({ type: 'deliver', x: bot.x, y: bot.y, s: bot.owner })
                }
                bot.task = { kind: 'idle' }; bot.path = []
            }
        }
        return
    }
    if (bot.task.kind === 'idle') return

    // choose stock destination once carrying comes off the arm
    if (bot.task.kind === 'toStock' && bot.carry) {
        const cands = gs.racks.filter((r) => r.items.length < RACK_CAP)
        if (cands.length) {
            const best = cands.sort((a, b) => (a.items.length - b.items.length) || (Math.abs(bot.x - a.x) + Math.abs(bot.y - a.y)) - (Math.abs(bot.x - b.x) + Math.abs(bot.y - b.y)))[0]
            bot.task = { kind: 'toStock', rx: best.x, ry: best.y }
            repath(gs, bot)
        } else {
            bot.task = { kind: 'toStock', rx: BAY_CELL.x, ry: BAY_CELL.y }
            repath(gs, bot)
            bot.stall++
        }
    }

    // arrived at target?
    const t = bot.task
    const atTarget =
        (t.kind === 'toRack' && Math.abs(bot.x - t.rx) + Math.abs(bot.y - t.ry) === 1)
        || (t.kind === 'toArm' && Math.abs(bot.x - ARM_CELL.x) + Math.abs(bot.y - ARM_CELL.y) === 1)
        || (t.kind === 'toStock' && Math.abs(bot.x - t.rx) + Math.abs(bot.y - t.ry) === 1)
        || (t.kind === 'toOut' && OUT_DOCKS.some((d) => d.x === bot.x && d.y === bot.y))
    if (atTarget) {
        bot.pickT = t.kind === 'toArm' ? BAY_TICKS : t.kind === 'toOut' ? DROP_TICKS : PICK_TICKS
        bot.wait = 0; bot.jam = false
        return
    }

    if (bot.jam) {
        bot.wait++
        if (bot.wait > JAM_AUTO) { nudge(gs, bot); gs.ev.push({ type: 'jamauto', x: bot.x, y: bot.y }) }
        return
    }

    // movement
    if (bot.moveT > 0) { bot.moveT--; return }
    if (!bot.path.length) repath(gs, bot)
    if (!bot.path.length) { bot.stall++; bot.wait++; tryJam(gs, bot, null); return }
    const nx = bot.path[0]
    if (blocked(gs, nx.x, nx.y, bot.id)) {
        // rival in the way — wait, and if BOTH are stuck, call it a jam
        bot.wait++
        bot.path = []
        tryJam(gs, bot, nx)
        return
    }
    bot.path.shift()
    bot.hist.push({ x: bot.x, y: bot.y })
    if (bot.hist.length > 6) bot.hist.shift()
    bot.dir = nbDir(nx.x - bot.x, nx.y - bot.y)
    bot.x = nx.x; bot.y = nx.y
    bot.wear += 1
    bot.moveT = STEP_TICKS
    bot.wait = 0
    if (bot.wear >= bot.wearMax) {
        bot.broken = true
        bot.repair = REPAIR_TICKS
        debit(gs, BREAK_FINE) // wear repair is the floor's bill; #2555 names the bot's employer in the event
        gs.ev.push({ type: 'break', x: bot.x, y: bot.y, s: bot.owner })
    }
}

// Congestion honesty: two robots stalled within an arm's reach of each other
// for longer than JAM_WAIT is a JAM — the aisles are the product. A click on
// either backs one off (or it self-resolves after JAM_AUTO, slowly).
function tryJam(gs, bot, nx) {
    if (bot.wait <= JAM_WAIT) return
    for (const r of gs.robots) {
        if (r.id === bot.id || r.broken || r.jam) continue
        if (r.wait <= JAM_WAIT) continue
        const d = Math.abs(r.x - bot.x) + Math.abs(r.y - bot.y)
        if (nx && !(r.x === nx.x && r.y === nx.y) && d > 2) continue
        if (d > 2) continue
        bot.jam = true
        r.jam = true
        gs.ev.push({ type: 'jam', x: bot.x, y: bot.y })
        return
    }
}

const nbDir = (dx, dy) => (dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3)

export function step(gs, pads = [{}]) {
    if (gs.end) { gs.ev.length = 0; return gs }
    const pad = pads[0] || {}
    gs.ev.length = 0
    gs.tick++
    const rush = rushNow(gs)

    // manager cursor (arrows held -> 1 cell / CURSOR_STEP ticks)
    gs.cursorT++
    if ((pad.left || pad.right || pad.up || pad.down) && gs.cursorT >= CURSOR_STEP) {
        gs.cursorT = 0
        if (pad.left) gs.cursor.x = Math.max(0, gs.cursor.x - 1)
        if (pad.right) gs.cursor.x = Math.min(COLS - 1, gs.cursor.x + 1)
        if (pad.up) gs.cursor.y = Math.max(0, gs.cursor.y - 1)
        if (pad.down) gs.cursor.y = Math.min(ROWS - 1, gs.cursor.y + 1)
    }
    if (pad.a && !gs.prevA) cellClick(gs, gs.cursor.x, gs.cursor.y, 0)
    if (pad.b && !gs.prevB) cycleTool(gs, 0)
    gs.prevA = !!pad.a
    gs.prevB = !!pad.b

    // #2555: seat M — the model manager drives its own cursor/tool channel from
    // pads[1] (the autopilot's pad, composed by the shell). Same verbs, same
    // CURSOR_STEP law, separate till.
    if (gs.duel) {
        const mp = pads[1] || {}
        const m = gs.m
        m.cursorT++
        if ((mp.left || mp.right || mp.up || mp.down) && m.cursorT >= CURSOR_STEP) {
            m.cursorT = 0
            if (mp.left) m.cursor.x = Math.max(0, m.cursor.x - 1)
            if (mp.right) m.cursor.x = Math.min(COLS - 1, m.cursor.x + 1)
            if (mp.up) m.cursor.y = Math.max(0, m.cursor.y - 1)
            if (mp.down) m.cursor.y = Math.min(ROWS - 1, m.cursor.y + 1)
        }
        if (mp.a && !m.prevA) cellClick(gs, m.cursor.x, m.cursor.y, 1)
        if (mp.b && !m.prevB) cycleTool(gs, 1)
        m.prevA = !!mp.a
        m.prevB = !!mp.b
    }

    // clocked world: rush siren at the front edge of each wave
    if (rush) { const [ron, rlen] = rushClock(gs); if (gs.tick % (ron + rlen) === ron) gs.ev.push({ type: 'rush' }) }

    // intake
    gs.spawnT--
    if (gs.spawnT <= 0) {
        gs.spawnT = rush ? 70 : 130
        if (!gs.conv.some((c) => c.x <= CONV_X0 + 1)) gs.conv.push({ kind: KINDS[Math.floor(gs.rng() * KINDS.length)], x: CONV_X0 })
        else { debit(gs, OVERFLOW_FINE); gs.ev.push({ type: 'overflow', x: CONV_X0, y: CONV_ROW }) } // #2555: the belt is house infrastructure — overflow is the house's bill
    }
    gs.convT++
    if (gs.convT >= CONV_TICKS) {
        gs.convT = 0
        gs.conv.sort((a, b) => b.x - a.x)
        for (const c of gs.conv) {
            if (c.x >= CONV_X1) {
                if (!gs.arm.held) { gs.arm.held = c.kind; c.x = -99; gs.ev.push({ type: 'armload', k: c.kind }) }
                continue
            }
            if (!gs.conv.some((o) => o !== c && o.x === c.x + 1)) c.x += 1
        }
        gs.conv = gs.conv.filter((c) => c.x > 0)
    }
    gs.arm.pose += ((gs.arm.held ? 1 : 0) - gs.arm.pose) * 0.08

    // servo self-stow (#1872): cargo waits ARM_PATIENCE ticks for a bot; if
    // none is detailed to the bay, the arm rotates and loads the nearest
    // in-reach rack itself. The bay handoff always wins — no swing starts
    // while a bot is on its way, and dispatch refuses while mid-swing.
    if (gs.arm.swing > 0) {
        gs.arm.swing--
        if (gs.arm.swing === 0 && gs.arm.held) {
            const rk = gs.arm.target ? rackAt(gs, gs.arm.target.x, gs.arm.target.y) : null
            if (rk && rk.items.length < RACK_CAP) {
                const kind = gs.arm.held
                rk.items.push(kind)
                gs.arm.held = null
                gs.arm.target = null
                gs.arm.heldT = 0
                gs.stows++
                credit(gs, rk.owner, STOW_PAY) // #2555 law: even the gantry's cargo pays the rack owner
                gs.ev.push({ type: 'armstow', x: rk.x, y: rk.y, k: kind, s: rk.owner })
            } else {
                // target filled while swinging — re-pick and pay the rotation again
                const t = armReach(gs)[0]
                if (t) {
                    gs.arm.target = { x: t.x, y: t.y }
                    gs.arm.swing = ARM_SWING_PER * (Math.abs(t.x - ARM_CELL.x) + Math.abs(t.y - ARM_CELL.y)) + ARM_DROP
                    gs.arm.swingT0 = gs.arm.swing
                } else gs.arm.target = null
            }
        }
    } else if (gs.arm.held) {
        gs.arm.heldT++
        if (gs.arm.heldT >= ARM_PATIENCE && !bayClaimed(gs)) {
            const t = armReach(gs)[0]
            if (t) {
                gs.arm.target = { x: t.x, y: t.y }
                gs.arm.swing = ARM_SWING_PER * (Math.abs(t.x - ARM_CELL.x) + Math.abs(t.y - ARM_CELL.y)) + ARM_DROP
                gs.arm.swingT0 = gs.arm.swing
                gs.ev.push({ type: 'armswing', x: t.x, y: t.y })
            }
        }
    }
    if (!gs.arm.held && gs.arm.swing === 0) gs.arm.heldT = 0

    // orders
    gs.orderT--
    if (gs.orderT <= 0) {
        gs.orderT = (rush ? gs.params.orderRush : gs.params.orderBase) + Math.floor(gs.rng() * 200)
        spawnOrder(gs)
    }
    for (const o of gs.orders) {
        if (!o.shipped && !o.expired && gs.tick > o.due) {
            o.expired = true
            gs.expired++
            gs.strikes++
            debit(gs, EXPIRE_FINE) // #2555: the strike sheet is the house's — the floor absorbs the fine, the manager eats the strike
            gs.ev.push({ type: 'expire', o: o.id })
            if (gs.strikes >= STRIKES) {
                gs.end = 'fired'
                gs.endReason = `${STRIKES} orders expired — the boss ends your shift early`
            }
        }
    }
    gs.orders = gs.orders.filter((o) => !o.shipped && !o.expired)

    // robots
    if (gs.auto) autoAssign(gs)
    for (const b of gs.robots) stepRobot(gs, b)

    // shipping
    gs.packT--
    if (gs.packT <= 0) { gs.packT = 30; tryShip(gs) }

    // load-out (#1911): one truck serves the pad. Call law: pad full, or the
    // oldest parcel aged out (a tap calls it early — see cellClick). Parked, it
    // loads one box per TRUCK_LOAD ticks; once the pad is empty it dwells the
    // minimum (a tap sends it early), then drives off LOADED. If parcels wait
    // when it gets home, the call law sends it right back out.
    // Freight tiers (#1927): a departed haul is ON THE ROAD — away ticks burn
    // every tick, and neither the call law nor a tap reaches a truck that is
    // not at home. Far hauls buy their rate with pickups the floor loses.
    const tr = gs.truck
    if (tr.away > 0) tr.away--
    if (tr.mode === 'out' && !tr.away && gs.pad.length) {
        const age = gs.tick - gs.pad[0].since
        if (gs.pad.length >= PAD_CAP || age >= PAD_AGE) callTruck(gs, 'law')
    }
    if (tr.mode === 'back') {
        tr.x += TRUCK_BACK
        if (tr.x >= TRUCK_PARK) { tr.x = TRUCK_PARK; tr.mode = 'park'; tr.dwell = 0; tr.loadT = 0 }
    } else if (tr.mode === 'park') {
        if (gs.pad.length) {
            const pw = gs.pad[0].w || 0 // load weight (#1931): heavy crates take WEIGHT_LOAD longer to ride aboard
            tr.loadT++
            if (tr.loadT >= TRUCK_LOAD * WEIGHT_LOAD[pw]) {
                tr.loadT = 0
                const p = gs.pad[0]
                p.n-- // box by box — a three-box parcel takes three cycles
                tr.carry++
                tr.tiers[p.d || 0]++ // freight tiers (#1927): the trailer knows what rides in it
                tr.grid[p.d || 0][pw]++ // weight joins the manifest (#1931)
                if (gs.duel) tr.bonus[ci(p.o)] += FREIGHT_PER_BOX * FREIGHT_MULT[p.d || 0] * WEIGHT_MULT[pw] // #2555: each box earns its rate onto its shipper's tally
                if ((p.d || 0) > tr.far) tr.far = p.d || 0 // the road stays distance-driven — weight prices the box, not the miles (#1931)
                if (p.n <= 0) {
                    gs.pad.shift()
                    // #1921 freight line: the last box aboard frees the parcel's
                    // escrow — money followed the freight off the dock
                    gs.escrow -= p.esc || 0
                    gs.paid += p.esc || 0
                    credit(gs, p.o, p.esc || 0) // #2555: the parcel pays its shipper (house parcels pay the house)
                    if (p.esc) gs.ev.push({ type: 'freight', pay: p.esc, x: OUT_CELLS[0].x, y: OUT_CELLS[0].y, s: p.o })
                }
                gs.ev.push({ type: 'loadout', x: OUT_CELLS[0].x, y: OUT_CELLS[0].y, w: pw })
            }
        } else tr.dwell++
        if (!gs.pad.length && tr.dwell >= TRUCK_MIN) sendTruck(gs, false)
    } else if (tr.mode === 'leave') {
        tr.x += TRUCK_FWD
        if (tr.x >= TRUCK_EXIT) { tr.x = TRUCK_HOME; tr.mode = 'out'; tr.carry = 0; tr.tiers = [0, 0, 0]; tr.grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; tr.far = -1 } // empty at the depot, ready for the next call (#1927/#1931)
    }

    // quota rings whenever the shift's EARNINGS cross it (the till now rings at
    // the trailer, not the pack line — #1921; the DebugKit budget cheat rings it
    // too). #2346: earnings, not the raw score — on shift 1 (shiftBase 0) this
    // is bit-for-bit the old absolute law.
    if (!gs.quotaHit && gs.score - gs.shiftBase >= gs.params.quota) { gs.quotaHit = true; gs.ev.push({ type: 'quota' }) }

    // shift end — a cleared shift banks the night (#2346) and the run advances
    // via nextShift; a short or fired night ends it.
    if (!gs.end && gs.tick >= SHIFT) {
        const earned = gs.score - gs.shiftBase
        if (earned >= gs.params.quota) {
            gs.end = 'win'
            gs.cleared++
            gs.endReason = gs.shift === 1
                ? 'quota cleared — the floor hums'
                : `shift ${gs.shift} cleared — the floor hums on`
        } else {
            gs.end = 'short'
            gs.endReason = gs.shift === 1
                ? `shift over, ${QUOTA - gs.score} units short of quota`
                : `shift ${gs.shift} over, ${gs.params.quota - earned} units short of quota`
        }
    }
    // #2555: the whistle names the richer till — MANAGER OF THE NIGHT (the
    // house is not a manager; only seats H and M are judged).
    if (gs.duel && gs.end) {
        gs.duelWinner = gs.credits[0] === gs.credits[1] ? 'TIE' : gs.credits[0] > gs.credits[1] ? 0 : 1
    }
    return gs
}

// Advance the career to the next night (#2346). The floor persists — hires stay
// hired, racks keep their stock, a bot that ended the night holding freight
// still carries it (morning dispatch takes it home) — and comes out of the
// maintenance bay wear-reset. The career score carries; the quota is now
// measured against what THIS shift earns (shiftBase). Orders, pad, belt and
// truck wipe clean for a fresh night, the strike sheet is new, and escrow
// follows the parcels out (#1921 law: money follows freight — the pad left with
// the night). The ladder params re-book from shiftParams(n), deterministic.
export function nextShift(gs) {
    if (gs.end !== 'win') return false
    gs.shift += 1
    gs.params = shiftParams(gs.shift)
    gs.shiftBase = gs.score
    gs.end = null
    gs.endReason = ''
    gs.quotaHit = false
    gs.tick = 0
    gs.strikes = 0
    gs.spawnT = 60
    gs.orderT = 240
    gs.convT = 0
    gs.packT = 30
    gs.orders = []
    gs.staging = []
    gs.stOwn = gs.duel ? [] : null // #2555: staging wiped for the fresh night — the crate-ledger too
    gs.conv = []
    gs.pad = []
    gs.escrow = 0
    gs.duelWinner = null // #2555: a new night, a new verdict
    gs.arm = { held: null, pose: 0, swing: 0, swingT0: 0, target: null, heldT: 0 }
    gs.truck = { x: TRUCK_HOME, mode: 'out', dwell: 0, loadT: 0, carry: 0, away: 0, far: -1, tiers: [0, 0, 0], grid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bonus: gs.duel ? [0, 0, 0] : null } // #2555: the freight tally resets with the trailer, the ledgers do not
    gs.fx.length = 0
    for (const b of gs.robots) {
        b.broken = false; b.repair = 0; b.wear = 0
        b.jam = false; b.wait = 0; b.pickT = 0; b.stall = 0; b.hist = []
        b.task = b.carry ? { kind: 'toOut' } : { kind: 'idle' }
        b.path = []
    }
    gs.ev.length = 0
    gs.ev.push({ type: 'shiftstart', shift: gs.shift, quota: gs.params.quota })
    return true
}

// --- state / hash ----------------------------------------------------------
export function stateHash(gs) {
    let s = `${gs.tick}:${gs.score}:${gs.strikes}:${gs.auto ? 1 : 0}|${gs.arm.held || '-'}|sw${gs.arm.swing}:${gs.arm.target ? gs.arm.target.x + ',' + gs.arm.target.y : '-'}|`
    for (const b of gs.robots) s += `${b.id}@${b.x},${b.y}c${b.carry || '-'}${b.broken ? 'B' : ''}${b.jam ? 'J' : ''}t${b.task.kind};`
    for (const r of gs.racks) s += `${r.x},${r.y}[${r.items.join('')}];`
    s += `S[${gs.staging.join('')}]|`
    s += `T[${gs.truck.mode}:${gs.truck.carry}:${Math.round(gs.truck.x)}:${gs.truck.away}:${gs.truck.tiers.join('')}:${gs.truck.grid.map((r) => r.join('')).join('')}]P[${gs.pad.map((p) => `${p.n}:${p.esc || 0}:${p.d || 0}:${p.w || 0}`).join(',')}]|` // load-out (#1911) + per-parcel escrow (#1921) + tiers/road (#1927) + weight manifest/classes (#1931), additive (#1373 law)
    s += `E[${gs.escrow}:${gs.paid}:${gs.freight}:${gs.fees}]|` // freight ledger, additive (#1373 law, #1921)
    if (gs.duel) {
        // #2555 duel segment — additive (#1373 law) and DUEL-ONLY: solo hashes
        // stay byte-identical to the pre-duel floor (#1917 zero footprint).
        s += `D[${gs.credits[0]}:${gs.credits[1]}:${gs.credits[2]}:X${gs.spent}:${gs.duelWinner ?? '-'}:B${gs.truck.bonus.join(',')}R[${gs.racks.map((r) => r.owner).join(',')}]K[${gs.robots.map((b) => b.owner).join(',')}]S[${gs.stOwn.join(',')}]M${gs.m.cursor.x},${gs.m.cursor.y}:${gs.m.tool || '-'}]|`
    }
    for (const o of gs.orders) s += `${o.id}{${o.items.join(',')}}${o.due - gs.tick}${o.prio ? '!' : ''};`
    for (const c of gs.conv) s += `${c.kind}@${c.x};`
    s += `|SH${gs.shift}:${gs.shiftBase}:${gs.cleared}:${gs.params.quota}:${gs.params.orderBase}:${gs.params.dueMult}:${gs.params.wearCut}` // ladder (#2346), additive (#1373 law)
    return hashString(s)
}

export function state(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        quota: gs.params.quota, // ladder (#2346): shift 1 reads the classic 1000
        shift: gs.shift,
        cleared: gs.cleared,
        earned: gs.score - gs.shiftBase,
        strikes: gs.strikes,
        done: !!gs.end,
        players: gs.duel ? 2 : 1, // #2555: two seats at one console
        seed: gs.seed >>> 0,
        hash: stateHash(gs),
        rush: rushNow(gs),
        auto: gs.auto,
        tool: gs.tool,
        cursor: [gs.cursor.x, gs.cursor.y],
        robots: gs.robots.map((b) => ({
            id: b.id, x: b.x, y: b.y, carry: b.carry, broken: b.broken, jam: b.jam,
            wear: Math.round((b.wear / b.wearMax) * 100), task: b.task.kind, dir: b.dir,
        })),
        racks: gs.racks.map((r) => ({ x: r.x, y: r.y, items: [...r.items] })),
        staging: [...gs.staging],
        orders: gs.orders.map((o) => ({ id: o.id, items: [...o.items], dueLeft: o.due - gs.tick, prio: o.prio })),
        conveyor: gs.conv.map((c) => ({ kind: c.kind, x: c.x })),
        armHeld: gs.arm.held,
        pad: gs.pad.map((p) => p.n),
        padDest: gs.pad.map((p) => p.d || 0), // freight tiers (#1927): the eye reads where each staged parcel is bound
        padWeight: gs.pad.map((p) => p.w || 0), // load weight (#1931): and how heavily
        truckAway: gs.truck.away,
        truckFar: gs.truck.far,
        truckWeights: gs.truck.grid.reduce((a, r) => a + (r[WEIGHT_HEAVY] || 0), 0), // heavy boxes aboard (#1931)
        escrow: gs.escrow, paid: gs.paid, freight: gs.freight, fees: gs.fees, // freight-line ledger (#1921)
        padAge: gs.pad.length ? gs.tick - gs.pad[0].since : 0,
        truck: gs.truck.mode,
        carry: gs.truck.carry,
        armSwing: gs.arm.swing > 0 ? { x: gs.arm.target.x, y: gs.arm.target.y, left: gs.arm.swing } : null, // #1872
        shipped: gs.shipped,
        expired: gs.expired,
        stows: gs.stows,
        end: gs.end,
        endReason: gs.endReason,
        ...(gs.duel ? {
            // #2555: the duel eye — credits, verdict, seat M's cursor and the
            // ownership stamp on every asset (only present while duelling).
            duel: true,
            tills: [gs.credits[0], gs.credits[1]],
            house: gs.credits[2],
            spent: gs.spent,
            duelWinner: gs.duelWinner,
            cursorM: [gs.m.cursor.x, gs.m.cursor.y],
            toolM: gs.m.tool,
            rackOwners: gs.racks.map((r) => r.owner),
            botOwners: gs.robots.map((b) => b.owner),
        } : {}),
    }
}

// --- autopilot -------------------------------------------------------------
// The CPU floor manager. Drives ONLY the pad (cursor + A/B), the same
// interface a human or a Plaicraft model slot uses. It turbo-repairs broken
// robots, backs jammed ones off, and buys racks near the flow while cash
// allows — the dispatch itself runs on auto. floorbosscheck proves this makes
// quota; the attract demo runs it live.
export function createAutopilot(seat = 0) {
    let flip = false
    return function autopilot(gs) {
        const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
        if (gs.end) return pad
        const s = state(gs)
        const me = chan(gs, seat) // #2555: the autopilot drives a seat — its own cursor, tool and till
        flip = !flip

        // triage first: broken (turbo — alternating A so every other press is
        // a rising edge) then jams (one click clears)
        const target = s.robots.find((r) => r.broken) || s.robots.find((r) => r.jam)

        // expand: keep the floor ahead of the flow — racks within the belt-to-
        // dock corridor, whenever there is spare cash beyond a reserve; hire a
        // third robot once the racks are worth more hands. #1921: the freight
        // line delays the till, so an attentive manager counts escrow as money
        // in transit when sizing purchases — the trailer always pays.
        // #2555: purchases come out of the FLOOR budget in every mode — the
        // duel changes who gets the credit, never the economics (the autopilot
        // plays an identical game at either seat; the win proof transfers).
        let goal = null
        const cash = s.score + s.escrow
        // #1921: in the last quarter-shift a new rack or robot barely earns its
        // cost back — stand pat and run the floor instead (money follows freight).
        const expanding = s.tick <= SHIFT - 1500
        const wantHire = expanding && s.robots.length < 3 && s.racks.length >= 8 && cash > ROBOT_COST + 220
        if (expanding && !target && cash > RACK_COST + 80 && s.racks.length < RACK_SPOTS.length) {
            goal = RACK_SPOTS.find((sp) => !s.racks.some((r) => r.x === sp.x && r.y === sp.y)) || null
        }
        if (!target && !goal && wantHire) {
            if (me.tool !== 'hire') pad.b = flip
            else pad.a = flip
            return pad
        }
        // freight economics (#1921): keep #1911's attentive two-waiting call —
        // flow beats fees, and a trailer that leaves loaded with FULL_TRAILER
        // boxes earns freight anyway — step in just before the age law, and in
        // the last 10 s reel everything in: escrow stranded at the whistle pays
        // nothing, because money follows freight. #1927: a truck on the road
        // answers nothing — don't burn pad steps tapping at an empty dock.
        if (!target && !goal && s.truck === 'out' && !s.truckAway && s.pad.length
            && (s.pad.length >= 2 || s.padAge >= PAD_AGE - 20 || s.tick > SHIFT - 1200)) goal = OUT_CELLS[0]
        if (!target && !goal) return pad

        const tx = target ? target.x : goal.x
        const ty = target ? target.y : goal.y
        const cx = me.cursor.x, cy = me.cursor.y
        if (cx !== tx) { pad.left = tx < cx; pad.right = tx > cx; return pad }
        if (cy !== ty) { pad.up = ty < cy; pad.down = ty > cy; return pad }

        if (target) { pad.a = flip; return pad } // turbo: press/release/press
        if (goal === OUT_CELLS[0]) {
            // tap the pad with no build tool armed — cycle off first if one is
            if (me.tool) { pad.b = flip; return pad }
            pad.a = flip
            return pad
        }
        // #1921: a refused rack purchase (the freight line makes early cash dips
        // real) would wedge pad.b — held buttons never edge again and the floor
        // freezes. Step off the spot to release the pad, then re-approach and
        // retry until affordable — patience, not a hang.
        if (gs.ev.some((e) => e.type === 'poor')) {
            pad.left = cx > 0; pad.right = !pad.left
            return pad
        }
        if (me.tool !== 'rack') pad.b = true
        else pad.a = true
        return pad
    }
}
