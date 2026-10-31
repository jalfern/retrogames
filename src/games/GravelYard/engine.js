// GRAVEL YARD — deterministic co-op heavy-metal sandbox (#1253).
//
// Pure module: Node + browser, no DOM, no React. Every random comes from the
// seed (mulberry32); seed + per-seat pad streams => identical hashes (#494).
//
// THE YARD (grid [col,row], 16 wide x 9 tall, TILE px):
//   row 0        fence line
//   rows 1-3     GRAVEL PILE cols 2-4 (dig from any side; wet seams inside)
//   rows 1-2     SCREEN PLANT cols 7-9 (the shaker). South face: hopper feed
//                at (8,3) and console at (9,3) — pull in facing north.
//   col 11       COARSE bay (11,1) and FINES bay (11,2); load from col 12 lane
//   col 14       ORDER BOARD (14,4) + customer trailer/dock at (14,7)
//   row 8        fence; everything else is open yard
//
// THE CHAIN: pile -> digger bucket (3) -> screen hopper (6) -> gate -> graded
// bays (8 each) -> truck bed (4) -> tip at the dock against an order -> credit.
//
// THE SPLIT (design rule #1253): moisture is only visible at the pile (digger),
// the grade chart is only painted on the plant (operator), orders live on the
// truck's board — the crew has to SHOUT. Radio callouts (fx `radio`) are the
// in-game channel; a solo crew obeys the voice it can hear.
//
// TROUBLE: wet gravel in a batch can JAM the screen (jog it B). Bays overflow
// and waste loads. Tipping the wrong grade at the dock is REFUSED — three
// refusals ruins the shift. Orders that lapse cost credit. Machines block each
// other on the grid: route around your crew.
//
// SHIFT: 180 s. Orders print every ~20-30 s (2 open max). Quota 600C = CLEAN
// SHIFT. Rates: coarse 30C/u, fines 22C/u + a punctuality bonus per order.
//
// SEATS (#494): 0 DIGGER (you), 1 TRUCK, 2 SCREEN OPERATOR. Unfilled seats run
// CPU emitters that emit ONLY pads — the same keys a human presses.

export const GRID_W = 16
export const GRID_H = 9
export const SHIFT_TICKS = 10800 // 180 s at 60 Hz
export const QUOTA = 600
export const MAX_STRIKES = 3
export const MAX_ORDERS = 2
export const BUCKET_CAP = 3
export const HOPPER_CAP = 6
export const BED_CAP = 4
export const BAY_CAP = 8
export const SPEED_DIG = 10 // ticks per cell the digger crawls
export const SPEED_TRUCK = 7
export const DIG_TICKS = 40
export const DUMP_TICKS = 30
export const LOAD_TICKS = 24
export const RATE = { coarse: 30, fines: 22 }

// --- layout --------------------------------------------------------------------
export const PILE = [[2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2]]
export const PLANT = [[7, 1], [8, 1], [9, 1], [7, 2], [8, 2], [9, 2]]
export const HOPPER_FRONT = [8, 3] // face north into the plant, B dumps
export const CONSOLE_FRONT = [9, 3] // face north: A cycles gate, B starts/jogs
export const HOPPER_STAND = [8, 4] // open yard south of the hopper feed
export const CONSOLE_STAND = [9, 4] // open yard south of the console
export const BAY = { coarse: [11, 1], fines: [11, 2] }
export const BAY_LOAD = { coarse: [12, 1], fines: [12, 2] } // face west at bay
export const DOCK = [14, 7]
export const DOCK_SPOTS = [[13, 7], [14, 6]] // face the trailer, B tips
export const BOARD = [14, 4]

const CELL = {}
for (const [x, y] of PILE) CELL[`${x},${y}`] = 'pile'
for (const [x, y] of PLANT) CELL[`${x},${y}`] = 'plant'
CELL['11,1'] = 'bay'
CELL['11,2'] = 'bay'
CELL['8,3'] = 'hopper' // plant feed face — solid; stand south at (8,4)
CELL['9,3'] = 'console' // plant console face — solid; stand south at (9,4)
CELL['14,7'] = 'dock'
CELL['14,4'] = 'board'
for (let x = 0; x < GRID_W; x++) {
    CELL[`${x},0`] = 'fence'
    CELL[`${x},8`] = 'fence'
}
for (let y = 1; y <= 7; y++) {
    CELL[`0,${y}`] = 'fence'
    CELL[`15,${y}`] = 'fence'
}

export function cellKind(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 'void'
    return CELL[`${x},${y}`] || 'yard'
}

const SOLID = new Set(['void', 'fence', 'plant', 'pile', 'bay', 'dock', 'board', 'hopper', 'console'])

export function driveable(gs, x, y, ignoreSeat = -1) {
    const k = cellKind(x, y)
    if (k === 'pile') {
        const c = gs.pile.find((pc) => pc.x === x && pc.y === y)
        return !c || c.units === 0 // a dug-out cell is flat ground you can run over
    }
    if (SOLID.has(k)) return false
    for (let i = 0; i < gs.machines.length; i++) {
        if (i !== ignoreSeat && gs.machines[i].x === x && gs.machines[i].y === y) return false
    }
    return true
}

// --- seeded rng (mulberry32) ---------------------------------------------------
export function mulberry32(seed) {
    let a = seed >>> 0
    return function () {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Deterministic FNV-1a over the sim (never over fx/juice).
export function hashState(gs) {
    const p = []
    p.push(gs.tick, gs.score, gs.strikes, gs.done ? 1 : 0, gs.win ? 1 : 0, gs.rngState >>> 0)
    p.push(gs.nextOrder, gs.delivered, gs.wasted)
    for (const o of gs.orders) p.push(o.grade === 'coarse' ? 1 : 2, o.units, o.left)
    for (const m of gs.machines) p.push(m.x, m.y, FACE_N[m.face], m.job ? m.job.kind : '-', m.job ? m.job.t : 0, m.job && m.job.cell ? m.job.cell[0] * 16 + m.job.cell[1] : -1)
    p.push(gs.digger.bucket, gs.digger.wet)
    p.push(gs.truck.bed, gs.bedGrade === 'coarse' ? 1 : gs.bedGrade === 'fines' ? 2 : 0)
    p.push(gs.plant.gate, gs.plant.hopper, gs.plant.hopperWet, gs.plant.running ? 1 : 0, gs.plant.jammed ? 1 : 0, gs.plant.jamNeed, gs.plant.t, gs.plant.batch, gs.plant.batchWet)
    p.push(gs.bays.coarse, gs.bays.fines)
    for (const c of gs.pile) p.push(c.units, c.wet ? 1 : 0)
    p.push(gs.refillT)
    let h = 0x811c9dc5
    const s = p.join('|')
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}

const FACE_N = { up: 0, down: 1, left: 2, right: 3 }
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
export const GATES = ['wide', 'medium', 'narrow']
const GATE_RATIO = { wide: 0.75, medium: 0.5, narrow: 0.2 } // coarse fraction

// --- creation ------------------------------------------------------------------
export function createGame(seed = 1, players = 1) {
    const seats = Math.max(1, Math.min(3, players | 0))
    const rng = mulberry32((seed >>> 0) ^ 0x5eed)
    const pile = PILE.map(([x, y]) => ({ x, y, units: 4, wet: rng() < 0.34 }))
    // keep at least one dry cell so moisture is always survivable
    if (pile.every((c) => c.wet)) pile[Math.floor(rng() * pile.length)].wet = false
    const gs = {
        seed: seed >>> 0,
        rng,
        rngState: seed >>> 0,
        tick: 0,
        score: 0,
        strikes: 0,
        delivered: 0,
        wasted: 0,
        done: false,
        win: false,
        seats,
        orderSeq: 0,
        orders: [],
        nextOrder: 120,
        refillT: 900,
        pile,
        machines: [],
        digger: null,
        truck: null,
        bedGrade: null, // coarse | fines
        plant: {
            gate: 'medium', hopper: 0, hopperWet: 0,
            running: false, t: 0, batch: 0, batchWet: 0,
            jammed: false, jamNeed: 0, jamRoll: -1,
        },
        bays: { coarse: 0, fines: 0 },
        fx: [],
        log: [],
    }
    gs.digger = { seat: 0, kind: 'digger', x: 3, y: 5, face: 'up', moveCd: 0, job: null, prevA: false, prevB: false, bucket: 0, wet: 0 }
    gs.truck = { seat: 1, kind: 'truck', x: 12, y: 6, face: 'left', moveCd: 0, job: null, prevA: false, prevB: false, bed: 0 }
    gs.operator = { seat: 2, kind: 'operator', prevA: false, prevB: false, prevL: false, prevR: false }
    gs.machines = [gs.digger, gs.truck]
    pushOrder(gs)
    return gs
}

// --- orders --------------------------------------------------------------------
function pushOrder(gs) {
    if (gs.orders.length >= MAX_ORDERS) return
    const grade = gs.rng() < 0.5 ? 'coarse' : 'fines'
    const units = 3 + Math.floor(gs.rng() * 5) // 3..7
    const total = units * 140 + 1200
    gs.orders.push({ id: gs.orderSeq++, grade, units, left: total, total })
    gs.fx.push({ k: 'order', grade, units, tick: gs.tick })
    radio(gs, 'TRUCK', `ORDER ${grade === 'coarse' ? 'COARSE' : 'FINES'} x${units}`)
}

function radio(gs, who, text) { gs.fx.push({ k: 'radio', who, text, tick: gs.tick }) }

// --- helpers -------------------------------------------------------------------
const frontOf = (m) => [m.x + DIRS[m.face][0], m.y + DIRS[m.face][1]]
const pileAt = (gs, x, y) => gs.pile.find((c) => c.x === x && c.y === y)

// Demand across open orders, by grade.
export function demand(gs) {
    const d = { coarse: 0, fines: 0 }
    for (const o of gs.orders) d[o.grade] += o.units
    return d
}

// --- the plant -----------------------------------------------------------------
function cycleGate(gs) {
    const i = GATES.indexOf(gs.plant.gate)
    gs.plant.gate = GATES[(i + 1) % GATES.length]
    gs.fx.push({ k: 'gate', gate: gs.plant.gate, tick: gs.tick })
}

function startBatch(gs) {
    const p = gs.plant
    if (p.running || p.jammed || p.hopper < 2) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
    p.batch = p.hopper
    p.batchWet = p.hopperWet
    p.hopper = 0
    p.hopperWet = 0
    p.running = true
    p.t = 0
    p.jamRoll = p.batchWet > 0 ? 60 + Math.floor(gs.rng() * 30) : -1
    gs.fx.push({ k: 'batchStart', n: p.batch, tick: gs.tick })
    if (p.batchWet > 0) radio(gs, 'DIGGER', `${p.batchWet} WET ${p.batchWet === 1 ? 'UNIT' : 'UNITS'} IN!`)
}

function jog(gs) {
    const p = gs.plant
    if (!p.jammed) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
    p.jamNeed--
    gs.fx.push({ k: 'jog', n: p.jamNeed, tick: gs.tick })
    if (p.jamNeed <= 0) { p.jammed = false; radio(gs, 'SCREEN', 'JAM CLEARED') }
}

function stepPlant(gs) {
    const p = gs.plant
    if (!p.running) return
    if (p.jammed) return
    p.t++
    if (p.jamRoll >= 0 && p.t >= p.jamRoll) {
        p.jamRoll = -1
        if (gs.rng() < Math.min(0.9, 0.25 * p.batchWet)) {
            p.jammed = true
            p.jamNeed = 1 + p.batchWet
            gs.fx.push({ k: 'jam', tick: gs.tick })
            radio(gs, 'SCREEN', `JAMMED! JOG IT x${p.jamNeed}`)
            return
        }
    }
    const dur = 120 + 15 * p.batch
    if (p.t >= dur) {
        p.running = false
        p.t = 0
        const coarse = Math.max(0, Math.min(p.batch, Math.round(p.batch * GATE_RATIO[p.gate])))
        const fines = p.batch - coarse
        const spillC = Math.max(0, gs.bays.coarse + coarse - BAY_CAP)
        const spillF = Math.max(0, gs.bays.fines + fines - BAY_CAP)
        gs.bays.coarse = Math.min(BAY_CAP, gs.bays.coarse + coarse)
        gs.bays.fines = Math.min(BAY_CAP, gs.bays.fines + fines)
        gs.wasted += spillC + spillF
        gs.log.push({ b: p.batch, c: coarse, f: fines, s: spillC + spillF })
        gs.fx.push({ k: 'batchEnd', c: coarse, f: fines, tick: gs.tick })
        radio(gs, 'SCREEN', coarse > fines ? 'COARSE OUT' : fines > coarse ? 'FINES OUT' : 'HALF AND HALF')
        if (spillC + spillF > 0) { gs.fx.push({ k: 'spill', n: spillC + spillF, tick: gs.tick }); radio(gs, 'SCREEN', 'BAYS OVERFLOWING!') }
        p.batch = 0
        p.batchWet = 0
    }
}

// --- tip at the dock -----------------------------------------------------------
function tip(gs) {
    if (gs.truck.bed <= 0) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
    const match = gs.orders.find((o) => o.grade === gs.bedGrade)
    if (!match) {
        gs.strikes++
        gs.fx.push({ k: 'refuse', grade: gs.bedGrade, tick: gs.tick })
        radio(gs, 'BOARD', `NO ${gs.bedGrade === 'coarse' ? 'COARSE' : 'FINES'} ORDER — STRIKE!`)
        if (gs.strikes >= MAX_STRIKES) { gs.done = true; gs.win = false; gs.fx.push({ k: 'ruined', tick: gs.tick }) }
        return
    }
    const n = Math.min(gs.truck.bed, match.units)
    gs.score += n * RATE[gs.bedGrade]
    gs.truck.bed -= n
    if (gs.truck.bed === 0) gs.bedGrade = null
    match.units -= n
    gs.delivered += n
    gs.fx.push({ k: 'tip', n, grade: gs.bedGrade, tick: gs.tick })
    if (match.units <= 0) {
        const bonus = Math.round(40 * Math.max(0, match.left / match.total))
        gs.score += bonus
        gs.orders = gs.orders.filter((o) => o !== match)
        gs.fx.push({ k: 'orderDone', bonus, tick: gs.tick })
        radio(gs, 'TRUCK', `ORDER FILLED +${bonus}BONUS`)
    }
}

// --- contextual actions ----------------------------------------------------------
// pad semantics for ALL seats: a/b are edge-triggered; the operator seat also
// edge-triggers left/right (gate -/+).
function actSeatA(gs, seat) {
    if (seat === 2) { startBatch(gs); return }
    const m = gs.machines[seat]
    if (!m || m.job) return
    const [fx, fy] = frontOf(m)

    if (seat === 0) { // digger
        const c = pileAt(gs, fx, fy)
        if (c && c.units > 0 && gs.digger.bucket < BUCKET_CAP) {
            m.job = { kind: 'dig', cell: [c.x, c.y], t: DIG_TICKS }
            gs.fx.push({ k: 'digStart', x: c.x, y: c.y, tick: gs.tick })
            return
        }
        if (fx === CONSOLE_FRONT[0] && fy === CONSOLE_FRONT[1] && m.face === 'up') { cycleGate(gs); return }
    }
    if (seat === 1) { // truck
        for (const g of ['coarse', 'fines']) {
            const [bx, by] = BAY[g]
            if (fx === bx && fy === by) {
                if (gs.bays[g] <= 0) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
                if (gs.truck.bed >= BED_CAP) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
                if (gs.bedGrade && gs.bedGrade !== g) { gs.fx.push({ k: 'noMix', tick: gs.tick }); radio(gs, 'TRUCK', 'NO MIXING LOADS'); return }
                m.job = { kind: 'load', cell: [bx, by], g, t: LOAD_TICKS }
                gs.fx.push({ k: 'loadStart', g, tick: gs.tick })
                return
            }
        }
    }
    gs.fx.push({ k: 'deny', tick: gs.tick })
}

function actSeatB(gs, seat) {
    if (seat === 2) { jog(gs); return }
    const m = gs.machines[seat]
    if (!m || m.job) return
    const [fx, fy] = frontOf(m)

    if (seat === 0) { // digger
        if (fx === HOPPER_FRONT[0] && fy === HOPPER_FRONT[1] && m.face === 'up' && gs.digger.bucket > 0) {
            m.job = { kind: 'dump', t: DUMP_TICKS }
            gs.fx.push({ k: 'dumpStart', n: gs.digger.bucket, tick: gs.tick })
            return
        }
        if (fx === CONSOLE_FRONT[0] && fy === CONSOLE_FRONT[1] && m.face === 'up') {
            if (gs.plant.jammed) jog(gs)
            else startBatch(gs)
            return
        }
    }
    if (seat === 1) { // truck tip at dock
        if (DOCK_SPOTS.some(([sx, sy]) => sx === m.x && sy === m.y) && gs.truck.bed > 0) { tip(gs); return }
    }
    gs.fx.push({ k: 'deny', tick: gs.tick })
}

// --- machines -------------------------------------------------------------------
function stepMachine(gs, m, pad) {
    if (m.moveCd > 0) m.moveCd--
    const a = !!pad.a
    const b = !!pad.b
    if (a && !m.prevA) actSeatA(gs, m.seat)
    else if (b && !m.prevB) actSeatB(gs, m.seat)
    m.prevA = a
    m.prevB = b

    // working jobs occupy the machine
    if (m.job) {
        m.job.t--
        if (m.job.t <= 0) finishJob(gs, m)
        m.moveCd = 1 // cannot drive while working
        return
    }
    let dx = 0, dy = 0
    if (pad.up) { dy = -1; m.face = 'up' }
    else if (pad.down) { dy = 1; m.face = 'down' }
    else if (pad.left) { dx = -1; m.face = 'left' }
    else if (pad.right) { dx = 1; m.face = 'right' }
    if (!dx && !dy) return
    // #1306: steer now, move when the step is over. Holding a direction while
    // moveCd is still running used to be swallowed whole — facing never changed,
    // so a bump-then-act sequence (dump at the hopper) died on the face guard.
    if (m.moveCd > 0) return
    const speed = m.kind === 'truck' ? SPEED_TRUCK : SPEED_DIG
    if (driveable(gs, m.x + dx, m.y + dy, m.seat)) {
        m.x += dx; m.y += dy
        m.moveCd = speed
        gs.fx.push({ k: 'roll', x: m.x, y: m.y, big: m.kind === 'truck' ? 1 : 0, tick: gs.tick })
    } else {
        m.moveCd = 8 // bump — the yard is small, honk
        gs.fx.push({ k: 'bump', tick: gs.tick })
    }
}

function finishJob(gs, m) {
    const j = m.job
    m.job = null
    if (j.kind === 'dig') {
        const c = pileAt(gs, j.cell[0], j.cell[1])
        if (c && c.units > 0 && gs.digger.bucket < BUCKET_CAP) {
            c.units--
            gs.digger.bucket++
            if (c.wet) gs.digger.wet++
            gs.fx.push({ k: 'dig', wet: c.wet ? 1 : 0, x: c.x, y: c.y, tick: gs.tick })
            if (c.wet) radio(gs, 'DIGGER', 'WET SEAM!')
        }
    } else if (j.kind === 'dump') {
        const p = gs.plant
        const room = HOPPER_CAP - p.hopper
        const spill = Math.max(0, gs.digger.bucket - room)
        p.hopper += Math.min(room, gs.digger.bucket)
        p.hopperWet += gs.digger.wet // wet rides wherever it lands
        gs.digger.bucket = 0
        gs.digger.wet = 0
        gs.wasted += spill
        gs.fx.push({ k: 'dump', n: p.hopper, spill, tick: gs.tick })
        if (spill > 0) radio(gs, 'DIGGER', 'HOPPER FULL — SPILLED!')
    } else if (j.kind === 'load') {
        gs.bays[j.g]--
        gs.truck.bed++
        gs.bedGrade = j.g
        gs.fx.push({ k: 'load', g: j.g, n: gs.truck.bed, tick: gs.tick })
    }
}

// --- operator seat (no movement; the plant IS the machine) ----------------------
function stepOperator(gs, pad) {
    const op = gs.operator
    const a = !!pad.a, b = !!pad.b, l = !!pad.left, r = !!pad.right
    if (a && !op.prevA) startBatch(gs)
    if (b && !op.prevB) jog(gs)
    if (l && !op.prevL) { const i = GATES.indexOf(gs.plant.gate); gs.plant.gate = GATES[(i + GATES.length - 1) % GATES.length]; gs.fx.push({ k: 'gate', gate: gs.plant.gate, tick: gs.tick }) }
    if (r && !op.prevR) { const i = GATES.indexOf(gs.plant.gate); gs.plant.gate = GATES[(i + 1) % GATES.length]; gs.fx.push({ k: 'gate', gate: gs.plant.gate, tick: gs.tick }) }
    op.prevA = a; op.prevB = b; op.prevL = l; op.prevR = r
}

// --- world timers ----------------------------------------------------------------
function stepWorld(gs) {
    for (const o of gs.orders) o.left--
    const expired = gs.orders.filter((o) => o.left <= 0)
    if (expired.length) {
        gs.orders = gs.orders.filter((o) => o.left > 0)
        gs.score = Math.max(0, gs.score - 20 * expired.length)
        gs.fx.push({ k: 'lapse', n: expired.length, tick: gs.tick })
        radio(gs, 'BOARD', `${expired.length} ORDER${expired.length > 1 ? 'S' : ''} LAPSED -20C`)
    }
    if (gs.tick === gs.nextOrder) {
        pushOrder(gs)
        gs.nextOrder = gs.tick + 1200 + Math.floor(gs.rng() * 600)
    }
    gs.refillT--
    if (gs.refillT <= 0) {
        gs.refillT = 900
        // tip-in lands where nothing is parked — and never walls a parked machine in.
        // #1306 seed-5 freeze: spare tips filled every exit of a dug-out flat cell the
        // digger stood on; the cell itself was "protected" but the machine was entombed,
        // bfs found no path, and the CPU sat full-bucket for the rest of the shift.
        const entombs = (c) => gs.machines.some((mm) => {
            if (mm.x === c.x && mm.y === c.y) return true
            const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
                driveable(gs, mm.x + dx, mm.y + dy, mm.seat) && !(mm.x + dx === c.x && mm.y + dy === c.y))
            return exits.length === 0
        })
        const spare = gs.pile.filter((c) => c.units < 4 && !entombs(c))
        if (spare.length) {
            const c = spare[Math.floor(gs.rng() * spare.length)]
            c.units++
            gs.fx.push({ k: 'refill', x: c.x, y: c.y, tick: gs.tick })
        }
    }
    if (gs.tick >= SHIFT_TICKS) {
        gs.done = true
        gs.win = gs.score >= QUOTA
        gs.fx.push({ k: gs.win ? 'whistle' : 'shiftEnd', tick: gs.tick })
    }
}

// --- the one sim step -------------------------------------------------------------
// pads: per-seat array [digger, truck, operator]; missing seats idle.
export function stepGame(gs, pads) {
    if (gs.done) return gs
    gs.tick++
    gs.rngState = (Math.imul(gs.rngState ^ (gs.rngState >>> 15), 0x2545f491) >>> 0)
    stepMachine(gs, gs.digger, pads[0] || {})
    stepMachine(gs, gs.truck, pads[1] || {})
    stepOperator(gs, pads[2] || {})
    stepPlant(gs)
    stepWorld(gs)
    if (gs.fx.length > 40) gs.fx.splice(0, gs.fx.length - 40)
    return gs
}

// --- state for the contract ---------------------------------------------------------
export function simState(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        done: gs.done,
        win: gs.win,
        strikes: gs.strikes,
        delivered: gs.delivered,
        wasted: gs.wasted,
        seed: gs.seed,
        quota: QUOTA,
        orders: gs.orders.map((o) => ({ grade: o.grade, units: o.units, left: o.left, total: o.total })),
        digger: { x: gs.digger.x, y: gs.digger.y, face: gs.digger.face, bucket: gs.digger.bucket, wet: gs.digger.wet, job: gs.digger.job ? gs.digger.job.kind : null },
        truck: { x: gs.truck.x, y: gs.truck.y, face: gs.truck.face, bed: gs.truck.bed, grade: gs.bedGrade, job: gs.truck.job ? gs.truck.job.kind : null },
        plant: {
            gate: gs.plant.gate, hopper: gs.plant.hopper, hopperWet: gs.plant.hopperWet,
            running: gs.plant.running, jammed: gs.plant.jammed, jamNeed: gs.plant.jamNeed,
            frac: gs.plant.running ? Math.min(1, gs.plant.t / (120 + 15 * gs.plant.batch)) : 0,
        },
        bays: { coarse: gs.bays.coarse, fines: gs.bays.fines },
        pile: gs.pile.map((c) => ({ x: c.x, y: c.y, units: c.units, wet: c.wet })),
        hash: hashState(gs),
    }
}

export function drainFx(gs) {
    const out = gs.fx
    gs.fx = []
    return out
}

// --- CPU emitters: plans by pads only (#494 — no cheats) ----------------------------
function bfs(gs, from, to, parity = 0) {
    if (from[0] === to[0] && from[1] === to[1]) return []
    const order = parity ? ['up', 'down', 'left', 'right'] : ['left', 'right', 'up', 'down']
    const key = (x, y) => `${x},${y}`
    const prev = new Map()
    const q = [[from[0], from[1]]]
    prev.set(key(from[0], from[1]), null)
    const target = key(to[0], to[1])
    while (q.length) {
        const [x, y] = q.shift()
        for (const name of order) {
            const d = DIRS[name]
            const nx = x + d[0], ny = y + d[1]
            if (prev.has(key(nx, ny))) continue
            if (!driveable(gs, nx, ny)) continue
            prev.set(key(nx, ny), [x, y])
            if (key(nx, ny) === target) {
                const path = []
                let cur = [nx, ny]
                while (cur && !(cur[0] === from[0] && cur[1] === from[1])) {
                    const p = prev.get(key(cur[0], cur[1]))
                    path.push(cur[0] > p[0] ? 'right' : cur[0] < p[0] ? 'left' : cur[1] > p[1] ? 'down' : 'up')
                    cur = p
                }
                return path.reverse()
            }
            q.push([nx, ny])
        }
    }
    return null
}

// The approach cell to face a target cell from a preferred side list.
function approach(gs, m, tx, ty, prefer) {
    let best = null
    for (const side of prefer) {
        const d = DIRS[side]
        const ax = tx - d[0], ay = ty - d[1]
        if (!driveable(gs, ax, ay, m.seat)) continue
        const path = bfs(gs, [m.x, m.y], [ax, ay], m.seat)
        if (path && (!best || path.length < best.path.length)) best = { path, face: side, ax, ay }
    }
    return best
}

// plan -> { path, thenFace, act } — consumed by the emitter below.
export function cpuPlan(gs, seat) {
    if (seat === 0) return diggerPlan(gs)
    if (seat === 1) return truckPlan(gs)
    return operatorPlan(gs)
}

function diggerPlan(gs) {
    const m = gs.digger
    if (m.job) return {}
    if (m.bucket >= BUCKET_CAP || m.bucket > 0 && gs.plant.hopper >= HOPPER_CAP - BUCKET_CAP) {
        // HOPPER_STAND is open yard directly south of the hopper feed cell
        if (m.x === HOPPER_STAND[0] && m.y === HOPPER_STAND[1]) {
            if (m.face !== 'up') return { thenFace: 'up', act: 'b' }
            return { act: 'b' }
        }
        if (gs.plant.hopper <= HOPPER_CAP - m.bucket) {
            const path = bfs(gs, [m.x, m.y], HOPPER_STAND, 0)
            if (path) return { path, thenFace: 'up', act: 'b' }
        }
        return {}
    }
    // pick a pile cell with capacity; prefer dry seams, but only ones this
    // machine can actually reach — an unreachable dry seam must not starve the
    // crew (fall back to the wet pool, which the plant can jog through).
    const open = gs.pile.filter((c) => c.units > 0)
    if (!open.length) return {}
    const dry = open.filter((c) => !c.wet)
    const bestFrom = (pool) => {
        let best = null
        for (const c of pool) {
            const a = approach(gs, m, c.x, c.y, ['down', 'up', 'left', 'right'])
            if (a && (!best || a.path.length < best.path.length)) best = { ...a, cell: c }
        }
        return best
    }
    const best = bestFrom(dry) || bestFrom(open)
    if (!best) return {}
    if (m.x === best.ax && m.y === best.ay) {
        if (m.face !== best.face) return { thenFace: best.face, act: 'a' }
        return { act: 'a' }
    }
    return { path: best.path, thenFace: best.face, act: 'a' }
}

function truckPlan(gs) {
    const m = gs.truck
    if (m.job) return {}
    const atDock = DOCK_SPOTS.some(([sx, sy]) => sx === m.x && sy === m.y)
    const toDock = () => {
        let best = null
        for (const spot of DOCK_SPOTS) {
            if (m.x === spot[0] && m.y === spot[1]) return { path: [] }
            const p = bfs(gs, [m.x, m.y], spot, 1)
            if (p && (!best || p.length < best.path.length)) best = { path: p }
        }
        return best || {}
    }
    if (m.bed > 0) {
        const match = gs.orders.find((o) => o.grade === gs.bedGrade)
        if (match) return atDock ? { act: 'b' } : toDock()
        return atDock ? {} : toDock() // wait at the board for an order that fits
    }
    if (!gs.orders.length) return atDock ? {} : toDock()
    const oldest = [...gs.orders].sort((x, y) => x.left - y.left)[0]
    const [bx, by] = BAY[oldest.grade]
    if (gs.bays[oldest.grade] <= 0) return atDock ? {} : toDock()
    if (m.x === bx - 1 && m.y === by) {
        if (m.face !== 'left') return { thenFace: 'left', act: 'a' }
        return { act: 'a' }
    }
    const a = approach(gs, m, bx, by, ['left'])
    return a ? { path: a.path, thenFace: 'left', act: 'a' } : {}
}

function operatorPlan(gs) {
    const p = gs.plant
    if (p.jammed) return { act: 'b' }
    if (p.running) return {}
    if (p.hopper < 2) return {}
    const d = demand(gs)
    const want = d.coarse > d.fines ? 'wide' : d.fines > d.coarse ? 'narrow' : 'medium'
    if (p.gate !== want) return { act: 'r' }
    return { act: 'a' }
}

// pad emitter for a cpu seat. Same rules as makeCpuEmitter in the kitchen: holds
// a direction press until the move LANDS, bumps to face, then taps. The operator
// seat has no position; it pulses its buttons.
export function makeCpuEmitter(seat) {
    let plan = null
    let pi = 0
    let phase = 'walk'
    let expect = null
    let tries = 0
    let pulse = 0
    let want = null
    return (ctx) => {
        const gs = ctx.gs
        if (!gs || gs.done) { plan = null; phase = 'walk'; expect = null; tries = 0; return {} }
        const m = seat === 2 ? gs.operator : gs.machines[seat]
        if (!m) return {}

        if (seat === 2) {
            // operator: plan returns gate/start/jog acts; pulse to give edges room
            if (pulse > 0) { pulse--; return {} }
            const r = operatorPlan(gs)
            if (!r.act) return {}
            if (r.act === 'b' && !gs.plant.jammed) return {}
            pulse = 8
            if (r.act === 'a') return { a: true }
            if (r.act === 'b') return { b: true }
            if (r.act === 'r') return { right: true }
            if (r.act === 'l') return { left: true }
            return {}
        }

        if (plan && expect) {
            if (m.x === expect[0] && m.y === expect[1]) { pi++; tries = 0 }
            else {
                tries++
                if (tries > 20) { plan = null; expect = null; tries = 0; return {} } // stuck: replan
            }
        }
        expect = null
        if (!plan) {
            const r = cpuPlan(gs, seat)
            plan = { path: r.path || [], act: r.act || null, thenFace: r.thenFace || null }
            pi = 0
            phase = plan.path.length ? 'walk' : plan.act ? (plan.thenFace ? 'face' : 'aim') : 'idle'
        }
        if (phase === 'walk') {
            if (pi >= plan.path.length) { phase = plan.act ? (plan.thenFace ? 'face' : 'aim') : 'idle' }
            else {
                const dir = plan.path[pi]
                const d = DIRS[dir]
                expect = [m.x + d[0], m.y + d[1]]
                const pad = {}
                pad[dir] = true
                return pad
            }
        }
        if (phase === 'face') {
            // bump into the target sets facing (blocked moves still steer)
            phase = 'aim'
            const pad = {}
            pad[plan.thenFace] = true
            return pad
        }
        if (phase === 'aim') {
            // one button edge, then idle ticks so the engine sees a clean edge
            want = plan.act
            phase = 'press'
            return want === 'a' ? { a: true } : want === 'b' ? { b: true } : {}
        }
        if (phase === 'press') { phase = 'idle'; return {} }
        plan = null
        pi = 0
        tries = 0
        want = null
        return {}
    }
}

// --- reachability (the harness's win proof) ----------------------------------------
// Fast-forward the sim with CPU partners on every seat (the human seat included)
// and report the finish. Used by gravelcheck to prove the shift CAN be won and
// with one less of every supply (the slack rule).
export function simulate(seed, players, { seatsCpu = null, dropBeds = 0 } = {}) {
    const gs = createGame(seed, players)
    // slack: shrink supplies by `dropBeds` before the sim starts
    for (let i = 0; i < dropBeds && gs.pile.length; i++) {
        const c = gs.pile[gs.pile.length - 1 - i]
        c.units = Math.max(0, c.units - 1)
    }
    const emitters = [makeCpuEmitter(0), makeCpuEmitter(1), makeCpuEmitter(2)]
    const cpuSet = seatsCpu || [0, 1, 2]
    while (!gs.done) {
        const pads = [{}, {}, {}]
        for (const s of cpuSet) pads[s] = emitters[s]({ gs, tick: gs.tick })
        stepGame(gs, pads)
    }
    return { score: gs.score, win: gs.win, strikes: gs.strikes, delivered: gs.delivered, wasted: gs.wasted, batches: gs.log.length }
}
