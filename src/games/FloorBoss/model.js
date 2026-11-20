// FLOOR BOSS MODEL (#2805) — the seat's own senses for a manager seat, the
// same doctrine as Gauntlet's model.js (#2299 lineage): entity-relative
// features only — what a player at this seat can NOTICE, no absolute board
// knowledge. Rays from the cursor (structure and neighbours block, exactly
// like the sim's own blocked()), the nearest robot/rack/belt box as
// bearing+range, the quota clock, and the autoregressive prev-pad.
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-s2.mjs GAME_ENGINES['floor-boss']), a trainer eats these rows,
// and a seat that drops in later runs the same senses — a model can never
// train on one world and play on another (the silent-teacher bug class).
//
// `who` is the seat's manager channel: { x, y, tool } — seat 0 is gs.cursor
// (+ gs.tool); seat 1 (duel, #2555) is gs.m. `mem` is the caller's
// tick-history (the autoregressive last pad), same discipline as Gauntlet.
//
// The pad vocabulary is the dpad six ({left,right,up,down,a,b}): arrows move
// the cursor, A places/clicks the cell, B cycles the tool. N_ACT is 6.

import {
    blocked, rushNow,
    STRIKES, SHIFT, RACK_CAP, PAD_CAP, PAD_AGE, ARM_CELL,
    CONV_X0, CONV_X1, TRUCK_PARK, TRUCK_EXIT,
} from './sim.js'

export const FEAT_NAMES = [
    'rayN', 'rayNE', 'rayE', 'raySE', 'rayS', 'raySW', 'rayW', 'rayNW',
    'quotaFrac', 'strikesFrac', 'rush', 'nightT',
    'ordersOpen', 'dueTight', 'prioAny',
    'armHeld', 'armDx', 'armDy',
    'botDx', 'botDy', 'botCarry', 'botBroken',
    'rackDx', 'rackDy', 'rackLoad',
    'padFill', 'padOldest', 'truckNear', 'beltNear',
    'toolRack', 'toolHire',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
]
export const N_FEAT = FEAT_NAMES.length
export const N_ACT = 6 // left, right, up, down, click, cycle-tool

const RAY_MAX = 8
const RAY_STEP = 0.5
// the eight range-finder directions, clockwise from north (screen y grows down)
const RAYS = [[0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071]]

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const clamp8 = (v) => Math.max(-1, Math.min(1, v / RAY_MAX))

// featurize(gs, who, mem) — see header. mem.pa = the seat's own pad last
// tick (the caller banks it after the label), the autoregressive lane.
export function featurize(gs, who, mem) {
    const f = new Array(N_FEAT)
    const x = who.x
    const y = who.y
    for (let i = 0; i < 8; i++) {
        const [dx, dy] = RAYS[i]
        let t = 0.5
        while (t < RAY_MAX && !blocked(gs, Math.floor(x + dx * t), Math.floor(y + dy * t))) t += RAY_STEP
        f[i] = Math.min(RAY_MAX, t) / RAY_MAX
    }
    // the quota clock — the score line a manager is always doing in their head
    f[8] = clamp01((gs.score - gs.shiftBase) / gs.params.quota)
    f[9] = clamp01(gs.strikes / STRIKES)
    f[10] = rushNow(gs) ? 1 : 0
    f[11] = clamp01(gs.tick / SHIFT)
    // orders (neighbours in time)
    const open = gs.orders.filter((o) => !o.shipped && !o.expired)
    f[12] = clamp01(open.length / 4)
    let due = Infinity
    let prio = 0
    for (const o of open) {
        if (o.due < due) due = o.due
        if (o.prio) prio = 1
    }
    f[13] = open.length ? clamp01((due - gs.tick) / 2400) : 1
    f[14] = prio
    // the servo arm — is it loaded (a load waiting to be placed = money idle)
    f[15] = gs.arm.held ? 1 : 0
    f[16] = clamp8(ARM_CELL.x - x)
    f[17] = clamp8(ARM_CELL.y - y)
    // nearest robot: bearing, range, whether it carries, whether it's broken
    let bd = Infinity
    let br = null
    for (const r of gs.robots) {
        const d2 = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y)
        if (d2 < bd) { bd = d2; br = r }
    }
    f[18] = br ? clamp8(br.x - x) : 0
    f[19] = br ? clamp8(br.y - y) : 0
    f[20] = br && br.carry ? 1 : 0
    f[21] = br && br.broken ? 1 : 0
    // nearest rack: bearing, range, load
    let rd = Infinity
    let rk = null
    for (const k of gs.racks) {
        const d2 = (k.x - x) * (k.x - x) + (k.y - y) * (k.y - y)
        if (d2 < rd) { rd = d2; rk = k }
    }
    f[22] = rk ? clamp8(rk.x - x) : 0
    f[23] = rk ? clamp8(rk.y - y) : 0
    f[24] = rk ? clamp01(rk.items.length / RACK_CAP) : 0
    // the outbound line: pad fill, oldest parcel age, the truck, the belt mouth
    f[25] = clamp01(gs.pad.length / PAD_CAP)
    f[26] = gs.pad.length ? clamp01((gs.tick - Math.min(...gs.pad.map((p) => p.since))) / PAD_AGE) : 0
    f[27] = clamp01(1 - Math.abs(gs.truck.x - TRUCK_PARK) / (TRUCK_EXIT - TRUCK_PARK))
    const beltX = gs.conv.length ? Math.max(...gs.conv.map((c) => c.x)) : CONV_X0
    f[28] = gs.conv.length ? clamp01((beltX - CONV_X0) / (CONV_X1 - CONV_X0)) : 0
    // the tool in hand (readable from the HUD)
    f[29] = who.tool === 'rack' ? 1 : 0
    f[30] = who.tool === 'hire' ? 1 : 0
    // autoregressive: the last emitted pad — intent continues across ticks
    if (mem && mem.pa) {
        const pa = mem.pa
        f[31] = pa.left ? 1 : 0
        f[32] = pa.right ? 1 : 0
        f[33] = pa.up ? 1 : 0
        f[34] = pa.down ? 1 : 0
        f[35] = pa.a ? 1 : 0
        f[36] = pa.b ? 1 : 0
    } else { f.fill(0, 31, N_FEAT) }
    return f
}

// the seat's manager channel: seat 0 rides gs.cursor/tool; seat 1 (duel)
// rides gs.m (#2555). Returns null only when the seat has no channel (no duel
// seat 1) — the end state still reads (a replay may feature the closing tick).
export function seatChannel(gs, seat) {
    if (seat === 0) return { x: gs.cursor.x, y: gs.cursor.y, tool: gs.tool }
    if (seat === 1 && gs.duel && gs.m) return { x: gs.m.cursor.x, y: gs.m.cursor.y, tool: gs.m.tool }
    return null
}
