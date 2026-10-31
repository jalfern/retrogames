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
const JAM_WAIT = 60 // waited this long next to another waiter -> JAM
const JAM_AUTO = 300 // self-resolve after 5 s
const REPAIR_TICKS = 1200
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

function outDocks() {
    const docks = []
    for (const o of OUT_CELLS) for (const [dx, dy] of NB) if (map[o.y + dy][o.x + dx] === CELL.FLOOR) docks.push({ x: o.x + dx, y: o.y + dy })
    return docks
}
const OUT_DOCKS = outDocks()

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

function cellClick(gs, x, y) {
    if (!inGrid(x, y)) return 'oor'
    const bot = gs.robots.find((r) => r.x === x && r.y === y)
    if (bot) {
        if (bot.broken) { bot.repair -= TURBO_CUT; gs.ev.push({ type: 'turbo', x, y }); return 'turbo' }
        if (bot.jam) { nudge(gs, bot); gs.ev.push({ type: 'jamclear', x, y }); return 'nudge' }
        gs.sel = bot.id
        gs.ev.push({ type: 'select', x, y })
        return 'select'
    }
    if (gs.tool === 'hire') {
        if (gs.robots.length >= MAX_ROBOTS || gs.score < ROBOT_COST) { gs.ev.push({ type: 'poor', x: gs.cursor.x, y: gs.cursor.y }); gs.tool = null; return 'poor' }
        hireRobot(gs)
        gs.tool = null
        return 'hire'
    }
    if (gs.tool === 'rack') {
        if (map[y][x] !== CELL.FLOOR) { gs.ev.push({ type: 'refuse', x, y }); return 'refuse' }
        if (gs.racks.length >= RACK_SPOTS.length + 4) { gs.ev.push({ type: 'refuse', x, y }); return 'refuse' }
        if (gs.score < RACK_COST) { gs.ev.push({ type: 'poor', x, y }); return 'poor' }
        gs.score -= RACK_COST
        gs.racks.push({ x, y, items: [] })
        gs.ev.push({ type: 'build', x, y })
        gs.tool = null
        return 'build'
    }
    const rk = rackAt(gs, x, y)
    if (rk) {
        if (gs.sel != null) {
            const bot = gs.robots.find((r) => r.id === gs.sel)
            if (bot && !bot.broken && !bot.carry && !bot.jam && rk.items.length) {
                assignRack(gs, bot, rk, rk.items[0])
                gs.ev.push({ type: 'dispatch', x, y })
                return 'dispatch'
            }
        }
        gs.ev.push({ type: 'peek', x, y })
        return 'peek'
    }
    if (map[y][x] === CELL.ARM) {
        if (gs.arm.held) {
            const bot = nearestIdle(gs, BAY_CELL.x, BAY_CELL.y)
            if (bot) { sendArm(gs, bot); gs.ev.push({ type: 'dispatch', x, y }); return 'dispatch' }
        }
        return 'idle-arm'
    }
    if (map[y][x] === CELL.OUT) {
        gs.ev.push({ type: 'peek', x, y })
        return 'peek'
    }
    return 'floor'
}
export const clickCell = cellClick

export function setTool(gs, tool) { gs.tool = gs.tool === tool ? null : tool }
// B cycles the build tool: none → rack → hire → none (pad/mouse parity).
export function cycleTool(gs) {
    gs.tool = gs.tool === null ? 'rack' : gs.tool === 'rack' ? 'hire' : null
    return gs.tool
}
export function toggleAuto(gs) { gs.auto = !gs.auto; gs.ev.push({ type: 'auto', on: gs.auto }); return gs.auto }
export function clickOrder(gs, id) {
    const o = gs.orders.find((x) => x.id === id && !o.shipped && !o.expired)
    if (o) { o.prio = !o.prio; gs.ev.push({ type: 'prio', id }) }
}
export function hireRobot(gs) {
    if (gs.robots.length >= MAX_ROBOTS) { gs.ev.push({ type: 'refuse', x: HOME_PADS[0].x, y: HOME_PADS[0].y }); return false }
    if (gs.score < ROBOT_COST) { gs.ev.push({ type: 'poor', x: 0, y: 0 }); return false }
    const pad = HOME_PADS.find((p) => !gs.robots.some((r) => r.x === p.x && r.y === p.y)) || HOME_PADS[gs.robots.length % HOME_PADS.length]
    gs.score -= ROBOT_COST
    gs.robots.push(newRobot(gs, pad.x, pad.y))
    gs.ev.push({ type: 'hire', x: pad.x, y: pad.y })
    return true
}

function newRobot(gs, x, y) {
    return {
        id: gs.nextBotId++, x, y, carry: null,
        task: { kind: 'idle' }, path: [], moveT: 0, wait: 0, jam: false,
        pickT: 0, broken: false, repair: 0, wear: 0,
        wearMax: 260 + Math.floor(gs.rng() * 180), dir: 0, hist: [], stall: 0,
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
    // stow in the slack: a full arm stalls the conveyor
    if (gs.arm.held && gs.racks.some((r) => r.items.length < RACK_CAP)) {
        const bot = nearestIdle(gs, BAY_CELL.x, BAY_CELL.y)
        if (bot) sendArm(gs, bot)
    }
}

export function makeGame(seed = 1337) {
    const rng = mulberry32((seed * 2654435761 >>> 0) ^ 0x1b873593)
    const gs = {
        seed: seed >>> 0, rng, tick: 0,
        score: 100, // opening float — SimCity lets you lay pipe before the tax base exists
        strikes: 0, auto: true,
        tool: null, sel: null, cursor: { x: 12, y: 7 }, cursorT: 0,
        prevA: false, prevB: false,
        robots: [], racks: [], staging: [], orders: [], conv: [],
        arm: { held: null, pose: 0 }, // pose 0 docked, ramps to 1 while loading
        shipped: 0, expired: 0, stows: 0, quotaHit: false,
        spawnT: 60, orderT: 240, convT: 0, packT: 30,
        nextBotId: 1, nextOrderId: 1,
        end: null, endReason: '',
        fx: [], ev: [],
    }
    gs.racks.push({ x: RACK_SPOTS[0].x, y: RACK_SPOTS[0].y, items: ['crate', 'crate', 'can', 'can'] })
    gs.racks.push({ x: RACK_SPOTS[5].x, y: RACK_SPOTS[5].y, items: ['can', 'coil', 'crate', 'coil'] })
    gs.robots.push(newRobot(gs, HOME_PADS[0].x, HOME_PADS[0].y))
    gs.robots.push(newRobot(gs, HOME_PADS[1].x, HOME_PADS[1].y))
    return gs
}

export function rushNow(gs) { return (gs.tick % (RUSH_ON + RUSH_LEN)) >= RUSH_ON }

function spawnOrder(gs) {
    const rush = rushNow(gs)
    const n = gs.tick > 3000 || gs.rng() < 0.4 ? (gs.rng() < 0.22 ? 3 : 2) : 1
    const items = []
    for (let i = 0; i < n; i++) items.push(KINDS[Math.floor(gs.rng() * KINDS.length)])
    const due = gs.tick + Math.round((items.length === 1 ? 1800 : 2400) * (rush ? 0.85 : 1))
    gs.orders.push({ id: gs.nextOrderId++, items, due, prio: false, shipped: false, expired: false })
    gs.ev.push({ type: 'order' })
}

function tryShip(gs) {
    const open = gs.orders.filter((o) => !o.shipped && !o.expired).sort((a, b) => (b.prio - a.prio) || (a.due - b.due) || (a.id - b.id))
    for (const o of open) {
        const pool = gs.staging.slice()
        let ok = true
        for (const k of o.items) {
            const i = pool.indexOf(k)
            if (i < 0) { ok = false; break }
            pool.splice(i, 1)
        }
        if (!ok) continue
        gs.staging = pool
        o.shipped = true
        const rush = rushNow(gs)
        const base = o.items.reduce((s, k) => s + BASE_PAY[k], 0)
        const onTime = gs.tick <= o.due
        const pay = Math.round(base * (rush ? 1.5 : 1) * (onTime ? 1 : 0.4)) + (onTime ? ONTIME_BONUS * o.items.length : LATE_PAY)
        gs.score += pay
        gs.shipped++
        gs.ev.push({ type: onTime ? 'ship' : 'late', pay, o: o.id })
        if (!gs.quotaHit && gs.score >= QUOTA) { gs.quotaHit = true; gs.ev.push({ type: 'quota' }) }
    }
}

function stepRobot(gs, bot) {
    if (bot.broken) {
        bot.repair--
        if (bot.repair <= 0) {
            bot.broken = false; bot.wear = 0
            bot.jam = false; bot.wait = 0
            repath(gs, bot)
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
                if (gs.arm.held) {
                    bot.carry = gs.arm.held
                    gs.arm.held = null
                    bot.task = { kind: 'toStock' }
                    repath(gs, bot) // stock target chosen below when it moves
                    gs.ev.push({ type: 'bay', x: bot.x, y: bot.y, k: bot.carry })
                } else if (!gs.arm.held) { bot.task = { kind: 'idle' }; bot.path = [] }
            } else if (t.kind === 'toStock') {
                const rk = rackAt(gs, t.rx, t.ry)
                if (rk && bot.carry && rk.items.length < RACK_CAP) {
                    rk.items.push(bot.carry)
                    bot.carry = null
                    gs.stows++
                    gs.score += STOW_PAY
                    gs.ev.push({ type: 'stow', x: rk.x, y: rk.y })
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
                    bot.carry = null
                    gs.ev.push({ type: 'deliver', x: bot.x, y: bot.y })
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
        gs.score -= BREAK_FINE
        gs.ev.push({ type: 'break', x: bot.x, y: bot.y })
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
    if (pad.a && !gs.prevA) cellClick(gs, gs.cursor.x, gs.cursor.y)
    if (pad.b && !gs.prevB) cycleTool(gs)
    gs.prevA = !!pad.a
    gs.prevB = !!pad.b

    // clocked world: rush siren at the front edge of each wave
    if (rush && (gs.tick % (RUSH_ON + RUSH_LEN)) === RUSH_ON) gs.ev.push({ type: 'rush' })

    // intake
    gs.spawnT--
    if (gs.spawnT <= 0) {
        gs.spawnT = rush ? 70 : 130
        if (!gs.conv.some((c) => c.x <= CONV_X0 + 1)) gs.conv.push({ kind: KINDS[Math.floor(gs.rng() * KINDS.length)], x: CONV_X0 })
        else { gs.score -= OVERFLOW_FINE; gs.ev.push({ type: 'overflow', x: CONV_X0, y: CONV_ROW }) }
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

    // orders
    gs.orderT--
    if (gs.orderT <= 0) {
        gs.orderT = (rush ? 320 : 540) + Math.floor(gs.rng() * 200)
        spawnOrder(gs)
    }
    for (const o of gs.orders) {
        if (!o.shipped && !o.expired && gs.tick > o.due) {
            o.expired = true
            gs.expired++
            gs.strikes++
            gs.score -= EXPIRE_FINE
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

    // shift end
    if (!gs.end && gs.tick >= SHIFT) {
        gs.end = gs.score >= QUOTA ? 'win' : 'short'
        gs.endReason = gs.score >= QUOTA
            ? 'quota cleared — the floor hums'
            : `shift over, ${QUOTA - gs.score} units short of quota`
    }
    return gs
}

// --- state / hash ----------------------------------------------------------
export function stateHash(gs) {
    let s = `${gs.tick}:${gs.score}:${gs.strikes}:${gs.auto ? 1 : 0}|${gs.arm.held || '-'}|`
    for (const b of gs.robots) s += `${b.id}@${b.x},${b.y}c${b.carry || '-'}${b.broken ? 'B' : ''}${b.jam ? 'J' : ''}t${b.task.kind};`
    for (const r of gs.racks) s += `${r.x},${r.y}[${r.items.join('')}];`
    s += `S[${gs.staging.join('')}]|`
    for (const o of gs.orders) s += `${o.id}{${o.items.join(',')}}${o.due - gs.tick}${o.prio ? '!' : ''};`
    for (const c of gs.conv) s += `${c.kind}@${c.x};`
    return hashString(s)
}

export function state(gs) {
    return {
        tick: gs.tick,
        score: gs.score,
        quota: QUOTA,
        strikes: gs.strikes,
        done: !!gs.end,
        players: 1,
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
        shipped: gs.shipped,
        expired: gs.expired,
        stows: gs.stows,
        end: gs.end,
        endReason: gs.endReason,
    }
}

// --- autopilot -------------------------------------------------------------
// The CPU floor manager. Drives ONLY the pad (cursor + A/B), the same
// interface a human or a Plaicraft model slot uses. It turbo-repairs broken
// robots, backs jammed ones off, and buys racks near the flow while cash
// allows — the dispatch itself runs on auto. floorbosscheck proves this makes
// quota; the attract demo runs it live.
export function createAutopilot() {
    let flip = false
    return function autopilot(gs) {
        const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
        if (gs.end) return pad
        const s = state(gs)
        flip = !flip

        // triage first: broken (turbo — alternating A so every other press is
        // a rising edge) then jams (one click clears)
        const target = s.robots.find((r) => r.broken) || s.robots.find((r) => r.jam)

        // expand: keep the floor ahead of the flow — racks within the belt-to-
        // dock corridor, whenever there is spare cash beyond a reserve; hire a
        // third robot once the racks are worth more hands.
        let goal = null
        const wantHire = s.robots.length < 3 && s.racks.length >= 8 && s.score > ROBOT_COST + 220
        if (!target && s.score > RACK_COST + 80 && s.racks.length < RACK_SPOTS.length) {
            goal = RACK_SPOTS.find((sp) => !s.racks.some((r) => r.x === sp.x && r.y === sp.y)) || null
        }
        if (!target && !goal && wantHire) {
            if (s.tool !== 'hire') pad.b = flip
            else pad.a = flip
            return pad
        }
        if (!target && !goal) return pad

        const tx = target ? target.x : goal.x
        const ty = target ? target.y : goal.y
        const cx = gs.cursor.x, cy = gs.cursor.y
        if (cx !== tx) { pad.left = tx < cx; pad.right = tx > cx; return pad }
        if (cy !== ty) { pad.up = ty < cy; pad.down = ty > cy; return pad }

        if (target) { pad.a = flip; return pad } // turbo: press/release/press
        if (gs.tool !== 'rack') pad.b = true
        else pad.a = true
        return pad
    }
}
