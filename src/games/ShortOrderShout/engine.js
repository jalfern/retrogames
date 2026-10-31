// SHORT ORDER SHOUT — deterministic co-op kitchen sim (#1248).
//
// Pure module: Node + browser, no DOM, no React. All randomness comes from the
// seed (mulberry32). The sim is a small 13x7 grid with few actions so a trained
// model can take a seat later; seed + per-seat pad streams ⇒ identical hashes
// (#494 determinism law).
//
// THE KITCHEN (grid [col,row], 13 wide x 7 tall):
//   row 0   COOLER(0-1)  BOARD(4)  BURNER(6,7)  POT(9)  TAP(11)   <- stations
//   row 1-2 the LINE walkway
//   row 3   the PASS COUNTER, cols 0..10 solid; the gap is cols 11-12
//   row 4-6 the PASS side walkway, service WINDOW at (0,5)
// Cooks walk everywhere except solid cells; the window serves from its own cell.
// Tosses fly OVER the counter — that is the shout: line cooks fling ingredients
// south, the runner catches them on the pass side.
//
// ITEMS: BUN TOM POT PATTY (raw) / pattyC (seared) / ruin / water(cup) /
// tomS (spare slice — unused slot kept for stage 2) / soup / melt / meltG.
// A cook carries ONE item. Menu: SOUP (pot: potato+tomato+2 stirs -> bowl),
// MELT (bun on board, tomato sliced on it, seared patty -> carried melt;
// tomato garnish pays +25).
//
// TROUBLE (seeded): a patty left past its sear burns -> the burner catches FIRE
// (douse with cup water, else it spreads); anything dropped on the floor is
// DIRTY and stations refuse it until rinsed at the tap; the soup pot boils over
// unattended (rinse before the next batch).
//
// SHIFT: 150 s, tickets print every ~10-16 s (3 open max), serve pays
// base + time-tip (+garnish). 3 expired tickets = fired. Quota = clean shift.

export const GRID_W = 13
export const GRID_H = 7
export const SHIFT_TICKS = 9000 // 150 s at 60 Hz
export const QUOTA = 900
export const MAX_STRIKES = 3
export const MAX_TICKETS = 3
export const SPEED = 7 // ticks per grid cell walked
export const TOSS_SPEED = 5 // ticks per cell a tossed item flies
export const TOSS_MAX = 6

// --- solid layout ------------------------------------------------------------
export const STATION = {
    cooler: [[0, 0], [1, 0]],
    board: [4, 0],
    burner: [[6, 0], [7, 0]],
    pot: [9, 0],
    tap: [11, 0],
    window: [0, 5],
}

const CELL = {} // "x,y" -> kind
for (const [x, y] of STATION.cooler) CELL[`${x},${y}`] = 'cooler'
CELL[`4,0`] = 'board'
CELL[`6,0`] = 'burner'
CELL[`7,0`] = 'burner'
CELL[`9,0`] = 'pot'
CELL[`11,0`] = 'tap'
CELL[`0,5`] = 'window'
// row 0 leftovers between stations are wall; the counter fills row 3 cols 0..10
for (let x = 0; x < GRID_W; x++) {
    if (CELL[`${x},0`] === undefined) CELL[`${x},0`] = 'wall'
    if (CELL[`${x},3`] === undefined && x <= 10) CELL[`${x},3`] = 'counter'
}

export function cellKind(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 'void'
    return CELL[`${x},${y}`] || 'floor'
}

export function walkable(gs, x, y, ignoreCook = -1) {
    const k = cellKind(x, y)
    if (k === 'void' || k === 'counter' || k === 'wall') return false
    if (k !== 'floor' && k !== 'window') return false // stations are solid
    for (let i = 0; i < gs.cooks.length; i++) {
        if (i !== ignoreCook && gs.cooks[i].alive && gs.cooks[i].x === x && gs.cooks[i].y === y) return false
    }
    return true
}

// --- seeded rng (mulberry32) ---------------------------------------------------
export function mulberry32(seed) {
    let a = seed >>> 0
    const f = function () {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    // peek exposes the raw state so snapshotGame/restoreGame can resume the
    // exact stream (#1291 online resync). mulberry32(a) continues from state a.
    f.peek = () => a
    return f
}

// --- snapshot / restore (#1291 online resync) -----------------------------------
// JSON-safe full sim state. Deliberately additive: hashState never reads rng/fx/
// log, so ticking, hashing and every existing gate are byte-identical with these
// in the module. The rng closure's raw state rides as rngA; restore rebuilds the
// continuation with mulberry32(rngA). fx/log are render/diag sugar — dropped.
export function snapshotGame(gs) {
    const snap = {
        seed: gs.seed, rngA: gs.rng.peek(), rngState: gs.rngState,
        tick: gs.tick, score: gs.score, strikes: gs.strikes, served: gs.served,
        done: gs.done, win: gs.win, seats: gs.seats,
        nextTicket: gs.nextTicket, dishSeq: gs.dishSeq,
        cooks: JSON.parse(JSON.stringify(gs.cooks)),
        tickets: JSON.parse(JSON.stringify(gs.tickets)),
        burners: JSON.parse(JSON.stringify(gs.burners)),
        pot: JSON.parse(JSON.stringify(gs.pot)),
        board: gs.board,
        floors: JSON.parse(JSON.stringify(gs.floors)),
        projs: JSON.parse(JSON.stringify(gs.projs)),
    }
    return snap
}

export function restoreGame(snap) {
    const { rngA, ...rest } = snap
    const gs = JSON.parse(JSON.stringify(rest))
    gs.rng = mulberry32(rngA >>> 0)
    gs.fx = []
    gs.log = []
    return gs
}

// Deterministic FNV-1a over the sim (no juice fields).
export function hashState(gs) {
    const p = []
    p.push(gs.tick, gs.score, gs.strikes, gs.done ? 1 : 0, gs.win ? 1 : 0, gs.rngState >>> 0)
    for (const t of gs.tickets) p.push(t.dish === 'soup' ? 1 : 2, t.left, t.total)
    p.push(gs.nextTicket, gs.dishSeq)
    for (const c of gs.cooks) p.push(c.x, c.y, FACE_N[c.face], c.holding || '-', c.moveCd, c.dirty ? 1 : 0, c.alive ? 1 : 0)
    for (const b of gs.burners) p.push(b.state, b.t)
    p.push(gs.pot.state, gs.pot.t, gs.pot.stir, gs.pot.need)
    p.push(gs.board)
    for (const f of gs.floors) p.push(f.x, f.y, f.item, f.dirty ? 1 : 0)
    for (const pr of gs.projs) p.push(pr.x, pr.y, pr.dx, pr.dy, pr.n, pr.item)
    let h = 0x811c9dc5
    const s = p.join('|')
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}

const FACE_N = { up: 0, down: 1, left: 2, right: 3 }
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

const SOUP_TICKS = 150 // rolling boil
const STIR_GAP = 80 // stir every <80f or it boils over
const SEAR_TICKS = 210
const SEAR_OK = 180 // window before it burns
const FIRE_SPREAD = 360
const RINSE_TICKS = 30
const TICKET_FIRST = 120

// --- creation ------------------------------------------------------------------
export function createGame(seed = 1, players = 2) {
    const seats = Math.max(1, Math.min(4, players | 0))
    const rng = mulberry32((seed >>> 0) ^ 0x5eed)
    const gs = {
        seed: seed >>> 0,
        rng,
        rngState: seed >>> 0,
        tick: 0,
        score: 0,
        strikes: 0,
        served: 0,
        done: false,
        win: false,
        seats,
        cooks: [],
        tickets: [],
        nextTicket: TICKET_FIRST,
        dishSeq: 0,
        burners: [
            { state: 'empty', t: 0 }, // empty|cooking|ready|burnt|fire
            { state: 'empty', t: 0 },
        ],
        pot: { state: 'empty', t: 0, since: 0, stir: 0, need: 2 }, // empty|veg|boiling|ready|ruined|soaked
        board: 'none', // none|bun|buntom|melt
        floors: [], // {x,y,item,dirty}
        projs: [], // in-flight tosses {x,y,dx,dy,n,item}
        fx: [], // transient events for the renderer/audio (never hashed)
        log: [],
    }
    for (let i = 0; i < seats; i++) {
        gs.cooks.push({ seat: i, x: i % 2 === 0 ? 2 : 3, y: 2, face: 'up', holding: null, moveCd: 0, dirty: false, alive: true, prevA: false })
    }
    pushTicket(gs)
    return gs
}

// --- tickets -------------------------------------------------------------------
const MENU = ['soup', 'melt']

function pushTicket(gs) {
    if (gs.tickets.length >= MAX_TICKETS) return
    const dish = MENU[Math.floor(gs.rng() * MENU.length) % MENU.length]
    const late = gs.tick / SHIFT_TICKS // orders speed up as the shift wears on
    const total = Math.round((dish === 'soup' ? 2700 : 2400) * (1 - late * 0.35))
    gs.tickets.push({ id: gs.dishSeq++, dish, left: total, total })
    gs.fx.push({ k: 'print', tick: gs.tick })
}

// --- items ---------------------------------------------------------------------
const RAW = ['bun', 'tom', 'pot', 'patty']
const DISH = ['soup', 'melt', 'meltG']
const isDish = (it) => DISH.includes(it)
const isRaw = (it) => RAW.includes(it)
const dishOf = (it) => (it === 'soup' ? 'soup' : 'melt') // meltG serves a melt ticket

// What raw ingredients the open tickets still need, oldest first, accounting for
// what is already in flight (held, station-bound, cooking, on the board).
export function needs(gs) {
    const want = { bun: 0, tom: 0, pot: 0, patty: 0 }
    const inflight = { bun: 0, tom: 0, pot: 0, patty: 0 }
    for (const c of gs.cooks) if (c.holding && isRaw(c.holding)) inflight[c.holding]++
    for (const f of gs.floors) if (isRaw(f.item)) inflight[f.item]++
    for (const pr of gs.projs) if (isRaw(pr.item)) inflight[pr.item]++
    if (gs.burners.some((b) => b.state === 'cooking' || b.state === 'ready')) inflight.patty++
    if (gs.board === 'bun') inflight.bun++
    if (gs.board === 'buntom') { inflight.bun++; inflight.tom++ }
    // One pot cooks one soup at a time: during veg only the tomato is actionable;
    // while boiling/ready nothing soup-related can start.
    const ps = gs.pot.state
    for (const t of gs.tickets) {
        if (t.dish === 'soup') {
            if (ps === 'empty' || ps === 'ruined') { want.pot++; want.tom++ }
            else if (ps === 'veg') want.tom++
        } else { want.bun++; want.tom++; want.patty++ }
    }
    for (const k of RAW) want[k] = Math.max(0, want[k] - inflight[k])
    return want
}

// Whether each raw need is ACTIONABLE right now (stations have capacity). Without
// this gate cooks stockpile ingredients that every station refuses, jam themselves
// and watch the patties burn.
export function actionable(gs) {
    const w = needs(gs)
    const ps = gs.pot.state
    return {
        pot: w.pot > 0 && (ps === 'empty' || ps === 'ruined'),
        tom: w.tom > 0 && (ps === 'veg' || gs.board === 'bun'),
        bun: w.bun > 0 && gs.board === 'none',
        patty: w.patty > 0 && gs.burners.some((b) => b.state === 'empty'),
    }
}

// --- the A button: every contextual action ---------------------------------------
function front(gs, c) {
    const d = DIRS[c.face]
    return [c.x + d[0], c.y + d[1]]
}

function toast(gs, msg) { gs.fx.push({ k: 'toast', msg, tick: gs.tick }) }

function dropOnFloor(gs, x, y, item) {
    gs.floors.push({ x, y, item, dirty: true })
    gs.fx.push({ k: 'drop', x, y, tick: gs.tick })
}

// Try to serve the held dish at the window. Returns true when consumed.
function serve(gs, c) {
    const want = dishOf(c.holding)
    const t = gs.tickets.find((tk) => tk.dish === want)
    if (!t) { toast(gs, want === 'soup' ? 'NO SOUP TICKET!' : 'NO MELT TICKET!'); gs.fx.push({ k: 'deny', tick: gs.tick }); return false }
    const tip = Math.round((t.left / t.total) * 100)
    const garnish = c.holding === 'meltG' ? 25 : 0
    gs.score += (want === 'soup' ? 120 : 100) + tip + garnish
    gs.served++
    gs.tickets = gs.tickets.filter((tk) => tk !== t)
    c.holding = null
    gs.fx.push({ k: 'serve', x: STATION.window[0], y: STATION.window[1], pts: tip + garnish, tick: gs.tick })
    if (gs.served % 5 === 0) gs.fx.push({ k: 'streak', tick: gs.tick })
    return true
}

function actA(gs, c) {
    const [fx, fy] = front(gs, c)
    const fk = cellKind(fx, fy)

    // cup water douses the burner we face
    if (c.holding === 'water' && fk === 'burner') {
        const b = gs.burners[fx === 6 ? 0 : 1]
        if (b.state === 'fire') { b.state = 'empty'; b.t = 0; b.spread = false; c.holding = null; gs.fx.push({ k: 'douse', x: fx, y: fy, tick: gs.tick }); return }
    }
    // rinse a dirty item at the tap
    if (c.dirty && fk === 'tap') { c.dirty = false; gs.fx.push({ k: 'rinse', tick: gs.tick }); return }

    // POT -------------------------------------------------------------
    if (fk === 'pot') {
        const p = gs.pot
        if (c.dirty && (c.holding === 'pot' || c.holding === 'tom')) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
        if (p.state === 'empty' && c.holding === 'pot') { p.state = 'veg'; p.t = 0; c.holding = null; gs.fx.push({ k: 'potAdd', n: 1, tick: gs.tick }); return }
        if (p.state === 'veg' && c.holding === 'tom') { p.state = 'boiling'; p.t = 0; p.since = 0; p.stir = 0; p.need = 2; c.holding = null; gs.fx.push({ k: 'boil', tick: gs.tick }); return }
        if (p.state === 'boiling') { p.stir++; p.since = 0; gs.fx.push({ k: 'stir', n: p.stir, tick: gs.tick }); return }
        if (p.state === 'ready' && !c.holding) { c.holding = 'soup'; p.state = 'empty'; p.t = 0; gs.fx.push({ k: 'ladle', tick: gs.tick }); return }
        if (p.state === 'ruined' && !c.holding) { p.state = 'empty'; p.t = 0; gs.fx.push({ k: 'rinsePot', tick: gs.tick }); return }
    }

    // BURNERS -----------------------------------------------------------
    if (fk === 'burner') {
        const bi = fx === 6 ? 0 : 1
        const b = gs.burners[bi]
        if (c.holding === 'patty' && b.state === 'empty') {
            if (c.dirty) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
            b.state = 'cooking'; b.t = 0; c.holding = null; gs.fx.push({ k: 'sear', n: bi, tick: gs.tick }); return
        }
        if (b.state === 'ready' && !c.holding) { c.holding = 'pattyC'; b.state = 'empty'; b.t = 0; gs.fx.push({ k: 'take', tick: gs.tick }); return }
        if (b.state === 'burnt' && !c.holding) { c.holding = 'ruin'; b.state = 'empty'; b.t = 0; gs.fx.push({ k: 'take', tick: gs.tick }); return }
    }

    // BOARD ------------------------------------------------------------
    if (fk === 'board') {
        if (c.dirty && (c.holding === 'bun' || c.holding === 'tom' || c.holding === 'pattyC')) { gs.fx.push({ k: 'deny', tick: gs.tick }); return }
        if (c.holding === 'bun' && gs.board === 'none') { gs.board = 'bun'; c.holding = null; gs.fx.push({ k: 'board', s: 'bun', tick: gs.tick }); return }
        if (c.holding === 'tom' && (gs.board === 'bun' || gs.board === 'none')) { gs.board = gs.board === 'bun' ? 'buntom' : 'none'; c.holding = null; if (gs.board === 'buntom') gs.fx.push({ k: 'chop', tick: gs.tick }); return }
        if (c.holding === 'pattyC' && (gs.board === 'bun' || gs.board === 'buntom')) {
            c.holding = gs.board === 'buntom' ? 'meltG' : 'melt'
            gs.board = 'none'
            gs.fx.push({ k: 'build', g: c.holding === 'meltG', tick: gs.tick })
            return
        }
        if (!c.holding && gs.board === 'melt') { c.holding = 'melt'; gs.board = 'none'; gs.fx.push({ k: 'take', tick: gs.tick }); return }
        if (!c.holding && gs.board === 'bun') { c.holding = 'bun'; gs.board = 'none'; return }
    }

    // WINDOW --------------------------------------------------------------
    if (c.x === STATION.window[0] && c.y === STATION.window[1] && isDish(c.holding)) { serve(gs, c); return }

    // TAP — fill the cup ----------------------------------------------------
    if (fk === 'tap' && !c.holding) { c.holding = 'water'; gs.fx.push({ k: 'fill', tick: gs.tick }); return }

    // COOLER — take the oldest open ticket's next ACTIONABLE ingredient
    if (fk === 'cooler' && !c.holding) {
        const want = needs(gs)
        const act = actionable(gs)
        const order = []
        for (const t of gs.tickets) {
            if (t.dish === 'soup') order.push('pot', 'tom')
            else order.push('bun', 'patty', 'tom')
        }
        for (const k of order) { if (want[k] > 0 && act[k]) { c.holding = k; gs.fx.push({ k: 'take', item: k, tick: gs.tick }); return } }
        for (const k of RAW) { if (want[k] > 0 && act[k]) { c.holding = k; gs.fx.push({ k: 'take', item: k, tick: gs.tick }); return } }
        for (const k of RAW) { if (want[k] > 0) { c.holding = k; gs.fx.push({ k: 'take', item: k, tick: gs.tick }); return } }
        c.holding = 'bun'; gs.fx.push({ k: 'take', item: 'bun', tick: gs.tick }) // pantry idle pick
        return
    }

    // pick up a floor item standing on it
    const fi = gs.floors.findIndex((f) => f.x === c.x && f.y === c.y)
    if (fi >= 0 && !c.holding) {
        const f = gs.floors[fi]
        gs.floors.splice(fi, 1)
        c.holding = f.item
        c.dirty = f.dirty
        gs.fx.push({ k: 'pick', tick: gs.tick })
    }
}

// --- the B button: toss / discard -----------------------------------------------
function actB(gs, c) {
    if (!c.holding) return
    const it = c.holding
    if (it === 'ruin') { c.holding = null; gs.fx.push({ k: 'trash', tick: gs.tick }); return } // ruined items trash on toss
    c.holding = null
    const d = DIRS[c.face]
    gs.projs.push({ x: c.x, y: c.y, dx: d[0], dy: d[1], n: 0, item: it, dirty: c.dirty })
    c.dirty = false
    gs.fx.push({ k: 'toss', tick: gs.tick })
}

function stationDeliver(gs, x, y, item, dirty) {
    const k = cellKind(x, y)
    if (dirty) return false // dirty items refuse stations
    if (k === 'burner') {
        const bi = x === 6 ? 0 : 1
        const b = gs.burners[bi]
        if (item === 'patty' && b.state === 'empty') { b.state = 'cooking'; b.t = 0; gs.fx.push({ k: 'sear', n: bi, tick: gs.tick }); return true }
        return false
    }
    if (k === 'board') {
        if (item === 'bun' && gs.board === 'none') { gs.board = 'bun'; gs.fx.push({ k: 'board', s: 'bun', tick: gs.tick }); return true }
        if (item === 'tom' && gs.board === 'bun') { gs.board = 'buntom'; gs.fx.push({ k: 'chop', tick: gs.tick }); return true }
        if (item === 'pattyC' && (gs.board === 'bun' || gs.board === 'buntom')) {
            gs.board = 'melt'
            gs.fx.push({ k: 'buildToss', g: true, tick: gs.tick }) // melt (garnished) waits on the board
            return true
        }
        return false
    }
    if (k === 'pot') {
        const p = gs.pot
        if (p.state === 'empty' && item === 'pot') { p.state = 'veg'; p.t = 0; gs.fx.push({ k: 'potAdd', n: 1, tick: gs.tick }); return true }
        if (p.state === 'veg' && item === 'tom') { p.state = 'boiling'; p.t = 0; p.stir = 0; p.need = 2; gs.fx.push({ k: 'boil', tick: gs.tick }); return true }
        return false
    }
    return false
}

function stepProjectiles(gs) {
    const keep = []
    for (const pr of gs.projs) {
        pr.n++
        if (pr.n % TOSS_SPEED !== 0) { keep.push(pr); continue }
        const nx = pr.x + pr.dx
        const ny = pr.y + pr.dy
        // caught?
        const catcher = gs.cooks.find((c) => c.alive && c.x === nx && c.y === ny && !c.holding && !(c.x === pr.x && c.y === pr.y))
        if (catcher && pr.n >= TOSS_SPEED) {
            catcher.holding = pr.item
            catcher.dirty = pr.dirty
            gs.fx.push({ k: 'catch', x: nx, y: ny, tick: gs.tick })
            continue
        }
        if (pr.n >= TOSS_MAX * TOSS_SPEED) {
            if (!stationDeliver(gs, nx, ny, pr.item, pr.dirty)) dropOnFloor(gs, nx, ny, pr.item)
            continue
        }
        const k = cellKind(nx, ny)
        const blocked = k === 'void' || k === 'wall' || k === 'window' || k === 'tap' || k === 'cooler'
        // counters are waist-high: ingredients sail over; only walls stop them
        if (blocked) {
            if (!stationDeliver(gs, pr.x, pr.y, pr.item, pr.dirty)) dropOnFloor(gs, pr.x, pr.y, pr.item)
            continue
        }
        // landing on a solid station cell that accepts a delivery
        if (k === 'burner' || k === 'board' || k === 'pot') {
            if (stationDeliver(gs, nx, ny, pr.item, pr.dirty)) continue
            dropOnFloor(gs, pr.x, pr.y, pr.item) // bounced off an occupied station
            continue
        }
        pr.x = nx; pr.y = ny
        keep.push(pr)
    }
    gs.projs = keep
}

// --- world timers ---------------------------------------------------------------
function stepWorld(gs) {
    // tickets
    for (const t of gs.tickets) t.left--
    const expired = gs.tickets.filter((t) => t.left <= 0)
    if (expired.length) {
        gs.tickets = gs.tickets.filter((t) => t.left > 0)
        gs.strikes += expired.length
        gs.fx.push({ k: 'expire', n: expired.length, tick: gs.tick })
        if (gs.strikes >= MAX_STRIKES) { gs.done = true; gs.win = false; gs.fx.push({ k: 'fired', tick: gs.tick }) }
    }
    if (gs.tick >= SHIFT_TICKS) { gs.done = true; gs.win = gs.score >= QUOTA; gs.fx.push({ k: 'whistle', tick: gs.tick }) }
    if (gs.tick === gs.nextTicket) {
        pushTicket(gs)
        const late = gs.tick / SHIFT_TICKS
        gs.nextTicket = gs.tick + Math.round((600 + gs.rng() * 360) * (1 - late * 0.3))
    }
    // burners
    for (const b of gs.burners) {
        b.t++
        if (b.state === 'cooking' && b.t >= SEAR_TICKS) { b.state = 'ready'; b.t = 0; gs.fx.push({ k: 'seared', tick: gs.tick }) }
        else if (b.state === 'ready' && b.t >= SEAR_OK) { b.state = 'burnt'; b.t = 0; gs.fx.push({ k: 'smoke', tick: gs.tick }) }
        else if (b.state === 'burnt' && b.t === 1) { b.state = 'fire'; b.t = 0; gs.fx.push({ k: 'fire', tick: gs.tick }) }
        else if (b.state === 'fire' && b.t >= FIRE_SPREAD && !b.spread) {
            b.spread = true
            const other = gs.burners[b === gs.burners[0] ? 1 : 0]
            if (other.state !== 'fire') { other.state = 'fire'; other.t = 0; other.spread = true; gs.fx.push({ k: 'fire', spread: 1, tick: gs.tick }) }
        }
    }
    // pot: t counts total boil time; since counts ticks since the last stir.
    // Needs `need` stirs spaced < STIR_GAP apart; after the last stir it simmers
    // the remainder of SOUP_TICKS and becomes ready.
    const p = gs.pot
    if (p.state === 'boiling') {
        p.t++
        p.since++
        if (p.stir < p.need && p.since >= STIR_GAP) { p.state = 'ruined'; p.t = 0; gs.fx.push({ k: 'boilover', tick: gs.tick }) }
        else if (p.stir >= p.need && p.t >= SOUP_TICKS) { p.state = 'ready'; gs.fx.push({ k: 'ready', tick: gs.tick }) }
    }
}

// --- cook movement ---------------------------------------------------------------
function stepCook(gs, c, pad) {
    if (!c.alive) return
    if (c.moveCd > 0) c.moveCd--
    // edge-triggered actions (one action per press; A wins ties)
    const a = !!pad.a
    const b = !!pad.b
    if (a && !c.prevA) actA(gs, c)
    else if (b && !c.prevA) actB(gs, c)
    c.prevA = a || b

    if (c.moveCd > 0) return
    let dx = 0, dy = 0
    if (pad.up) { dy = -1; c.face = 'up' }
    else if (pad.down) { dy = 1; c.face = 'down' }
    else if (pad.left) { dx = -1; c.face = 'left' }
    else if (pad.right) { dx = 1; c.face = 'right' }
    if (!dx && !dy) return
    if (walkable(gs, c.x + dx, c.y + dy, c.seat)) {
        c.x += dx; c.y += dy
        c.moveCd = SPEED
    } else {
        c.moveCd = 2 // bump — nudge again soon
    }
}

// --- the one sim step -----------------------------------------------------------
// pads: array of per-seat one-pads (length >= seats). Missing seats idle.
export function stepGame(gs, pads) {
    if (gs.done) return gs
    gs.tick++
    gs.rngState = (Math.imul(gs.rngState ^ (gs.rngState >>> 15), 0x2545f491) >>> 0)
    for (let i = 0; i < gs.cooks.length; i++) stepCook(gs, gs.cooks[i], pads[i] || {})
    stepProjectiles(gs)
    stepWorld(gs)
    // prune stale fx (keep the buffer small; renderer drains it)
    if (gs.fx.length > 40) gs.fx.splice(0, gs.fx.length - 40)
    return gs
}

// --- state for the contract -------------------------------------------------------
export function simState(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        done: gs.done,
        win: gs.win,
        strikes: gs.strikes,
        served: gs.served,
        seed: gs.seed,
        quota: QUOTA,
        tickets: gs.tickets.map((t) => ({ dish: t.dish, left: t.left, total: t.total })),
        pot: gs.pot.state,
        board: gs.board,
        burners: gs.burners.map((b) => b.state),
        cooks: gs.cooks.map((c) => ({ x: c.x, y: c.y, face: c.face, holding: c.holding, dirty: c.dirty })),
        hash: hashState(gs),
    }
}

// drain visual/audio events (never part of the hash)
export function drainFx(gs) {
    const out = gs.fx
    gs.fx = []
    return out
}

// --- CPU cook: plans by pads only (#494 — no cheats) -----------------------------
// BFS on walkable cells; seat parity rotates the neighbour order so two CPU
// cooks never mirror-plan into a mutual deadlock in the same corridor.
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
            const k = cellKind(nx, ny)
            const ok = (k === 'floor' || k === 'window') && !gs.cooks.some((c) => c.alive && c.x === nx && c.y === ny)
            if (!ok) continue
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

// Choose this CPU cook's job for the trip. Returns {path, thenFace, act}.
// With a partner (seats > 1) seat 0 works the LINE and the rest run the PASS:
// dishes are thrown south over the counter to the runner at the post, exactly
// the human coordination the kitchen is designed around. Solo, the line cook
// walks dishes around the counter itself.
export const RUNNER_POST = [6, 4]

export function cpuPlan(gs, seat) {
    return seat > 0 && gs.seats > 1 ? runnerPlan(gs, seat) : linePlan(gs, seat)
}

function runnerPlan(gs, seat) {
    const c = gs.cooks[seat]
    if (!c || !c.alive) return {}
    const at = (x, y) => c.x === x && c.y === y
    // 1) a dish in hand: straight to the window
    if (isDish(c.holding)) {
        const win = STATION.window
        if (at(win[0], win[1])) return { act: 'a' }
        const path = bfs(gs, [c.x, c.y], win, seat)
        if (path) return { path }
    }
    // 2) line cook about to throw? hold the post
    const line = gs.cooks[0]
    if (line && isDish(line.holding) && !c.holding) {
        if (at(...RUNNER_POST)) return {}
        const pp = bfs(gs, [c.x, c.y], RUNNER_POST, seat)
        return pp ? { path: pp } : {}
    }
    // 3) mind the pot from the pass side: stirs and the ready ladle
    const p = gs.pot
    const potCell = STATION.pot
    if ((p.state === 'boiling' && p.stir < p.need) || (p.state === 'ready' && !c.holding)) {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    // 4) ruined pot: a quick rinse keeps the line flowing
    if (p.state === 'ruined' && !c.holding) {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    // 5) back to the post
    if (at(...RUNNER_POST)) return {}
    const back = bfs(gs, [c.x, c.y], RUNNER_POST, seat)
    return back ? { path: back } : {}
}

function linePlan(gs, seat) {
    const c = gs.cooks[seat]
    if (!c || !c.alive) return {}
    const at = (x, y) => c.x === x && c.y === y
    const fire = gs.burners.findIndex((b) => b.state === 'fire')

    // 1) carry a dish home — with a runner at the post, throw it over the
    // counter from (6,2); otherwise walk it around to the window
    if (isDish(c.holding)) {
        const win = STATION.window
        if (at(win[0], win[1])) return { act: 'a' }
        if (gs.seats > 1) {
            const runner = gs.cooks.find((cc, i) => i > 0 && cc.alive && !cc.holding && cc.y >= 4 && Math.abs(cc.x - RUNNER_POST[0]) <= 1)
            if (runner) {
                if (at(6, 2)) return { thenFace: 'down', act: 'b' }
                const pp = bfs(gs, [c.x, c.y], [6, 2], seat)
                if (pp) return { path: pp, thenFace: 'down', act: 'b' }
            }
        }
        const path = bfs(gs, [c.x, c.y], win, seat)
        if (path) return { path }
    }
    // 2) fight fires
    if (fire >= 0) {
        const bcell = STATION.burner[fire]
        if (c.holding === 'water') {
            if (cellKind(...front(gs, c)) === 'burner') return { act: 'a' }
            const p = bfs(gs, [c.x, c.y], [bcell[0], 1], seat)
            if (p) return { path: p, thenFace: 'up', act: 'a' }
        } else if (!c.holding || c.holding === 'water') {
            const p = bfs(gs, [c.x, c.y], [STATION.tap[0], 1], seat)
            if (p) return { path: p, thenFace: 'up', act: 'a' }
        }
    }
    // 3) mind the pot
    const p = gs.pot
    const potCell = STATION.pot
    if (p.state === 'boiling' && p.stir < p.need) {
        if (front(gs, c)[0] === potCell[0] && front(gs, c)[1] === 1 && c.face === 'up') return { act: 'a' }
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (p.state === 'ready' && !c.holding) {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (p.state === 'ruined' && !c.holding) {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    // 4) grab seared patty before it burns
    const readyB = gs.burners.findIndex((b) => b.state === 'ready')
    if (readyB >= 0 && !c.holding) {
        const pp = bfs(gs, [c.x, c.y], [STATION.burner[readyB][0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    // 5) take a melt off the board
    // 6) carry ingredients to the station that accepts them
    if (c.holding === 'pot' && p.state === 'empty') {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (c.holding === 'tom' && p.state === 'veg') {
        const pp = bfs(gs, [c.x, c.y], [potCell[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (gs.board === 'melt' && !c.holding) {
        const pp = bfs(gs, [c.x, c.y], [STATION.board[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (c.holding === 'bun' && gs.board === 'none') {
        const pp = bfs(gs, [c.x, c.y], [STATION.board[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (c.holding === 'tom' && gs.board === 'bun') {
        const pp = bfs(gs, [c.x, c.y], [STATION.board[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    if (c.holding === 'pattyC' && (gs.board === 'bun' || gs.board === 'buntom')) {
        const pp = bfs(gs, [c.x, c.y], [STATION.board[0], 1], seat)
        if (pp) return { path: pp, thenFace: 'up', act: 'a' }
    }
    // 7) start a sear carrying a raw patty, if a burner is free
    if (c.holding === 'patty' && gs.burners.some((b) => b.state === 'empty')) {
        for (const bc of STATION.burner) {
            if (gs.burners[bc[0] === 6 ? 0 : 1].state === 'empty') {
                const pp = bfs(gs, [c.x, c.y], [bc[0], 1], seat)
                if (pp) return { path: pp, thenFace: 'up', act: 'a' }
            }
        }
    }
    // 8) empty-handed: restock only when some need is actionable right now
    if (!c.holding) {
        const act = actionable(gs)
        if (act.pot || act.tom || act.bun || act.patty) {
            const pp = bfs(gs, [c.x, c.y], [0, 1], seat)
            if (pp) return { path: pp, thenFace: 'up', act: 'a' }
        }
    }
    // nothing actionable for this cook right now: hold position (a cook that
    // drifts across the map strands itself when the next task pops open)
    return {}
}

// pad emitter for a cpu slot. Plans fresh when the previous plan completes;
// holds each direction press until the cook ACTUALLY moves (the engine ignores
// presses during a step cooldown), nudges to face the station, then presses A.
export function makeCpuEmitter(seat) {
    let plan = null
    let pi = 0
    let phase = 'walk'
    let expect = null
    let tries = 0
    return (ctx) => {
        const gs = ctx.gs
        if (!gs || gs.done) { plan = null; phase = 'walk'; expect = null; tries = 0; return {} }
        const c = gs.cooks[seat]
        if (!c) return {}
        // observe the previous press: advance only when the move landed
        if (plan && expect) {
            if (c.x === expect[0] && c.y === expect[1]) { pi++; tries = 0 }
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
                const want = plan.path[pi]
                const d = DIRS[want]
                expect = [c.x + d[0], c.y + d[1]]
                const pad = {}
                pad[want] = true
                return pad
            }
        }
        if (phase === 'face') {
            phase = 'aim'
            const pad = {}
            pad[plan.thenFace] = true // bump into the station sets facing
            return pad
        }
        if (phase === 'aim') {
            phase = 'idle'
            return plan.act === 'a' ? { a: true } : plan.act === 'b' ? { b: true } : {}
        }
        plan = null
        pi = 0
        tries = 0
        return {}
    }
}
