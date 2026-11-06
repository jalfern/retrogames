// PLAICRAFT MODEL (#1625) — the trained behaviour-cloning policy, as a seat.
//
// Everything the pipeline needs to put a trained net in a player seat lives
// HERE, pure and shared: the export script labels with these same features,
// the trainer eats them, and the seat runs them live — one definition, so a
// model can never train on one world and play on another (the silent-teacher
// bug class). THE one pad out; the sim never learns a model exists.
//
// Features are ENTITY-RELATIVE (the seat's own senses, no absolute board
// knowledge): health, 8 short range-finder rays at 1/8-cell steps (walls,
// unopened locked doors and blocks stop the ray, exactly like the CPU's own
// padPassable), the hero as a bearing+range with both headings, the nearest
// monster (+ whether it drains, + whether it is inside blade reach) and the
// nearest food. That is what a player can NOTICE; it is all the net gets.
//
// The `a` output is a sustained SWING INTENT; the seat pulses it like a
// thumb (`a = intent && !prev`), matching how the CPU emits its cut pulse —
// the pad codec and the sim's sword cooldown do the rest.

import { POLICY } from './policy.js'
import { MONSTERS } from './levels.js'

export const FEAT_NAMES = [
    'hpFrac',
    'rayN', 'rayNE', 'rayE', 'raySE', 'rayS', 'raySW', 'rayW', 'rayNW',
    'heroDx', 'heroDy', 'heroSin', 'heroCos',
    'selfSin', 'selfCos',
    'monDx', 'monDy', 'monDrain', 'monReach',
    'foodDx', 'foodDy', 'foodHere',
    'predDx', 'predDy', 'heroSpeed',
    'selfDx', 'selfDy',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevSwing',
]
export const N_FEAT = FEAT_NAMES.length
export const N_ACT = 5 // left, right, up, down, swing

const RAY_MAX = 8
const RAY_STEP = 0.25
// the eight range-finder directions, clockwise from north (screen y grows down)
const RAYS = [[0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071]]

const clamp8 = (v) => Math.max(-1, Math.min(1, v / 8))

// the CPU's own walk rule (planner.padPassable, mirrored so look matches
// doctrine): stone/blocks/traps stop; a locked cell opens only when the door
// is open or broken. Kept local: model.js must import nothing but policy.js.
const rayOpen = (gs, c, r) => {
    const row = gs.levelData.grid[r]
    if (!row) return false
    const ch = row[c]
    if (ch === '#' || ch === 'B' || ch === 'T') return false
    if (ch === 'L') {
        const d = gs.doors.find((x) => x.x === c && x.y === r)
        return !!d && (d.open || d.broken)
    }
    return true
}

// featurize(gs, who, mem) — who is the seated entity (gs.partner today; the
// hero tomorrow). The hero is context a seat player can see, never the seat
// itself. `mem` (optional) is the caller's tick-history — the same hero-motion
// EMA the CPU doctrine runs on (its look-ahead prediction), plus the seat's
// own velocity. A stateless net can't remember; the features carry the memory.
export function featurize(gs, who, mem) {
    const f = new Array(N_FEAT)
    const h = gs.hero
    f[0] = who.hp / (who.maxHp || 1)
    for (let i = 0; i < 8; i++) {
        const [dx, dy] = RAYS[i]
        let t = 0.5
        while (t < RAY_MAX && rayOpen(gs, Math.floor(who.x + dx * t), Math.floor(who.y + dy * t))) t += RAY_STEP
        f[1 + i] = Math.min(RAY_MAX, t) / RAY_MAX
    }
    f[9] = clamp8(h.x - who.x)
    f[10] = clamp8(h.y - who.y)
    f[11] = Math.sin(h.a)
    f[12] = Math.cos(h.a)
    f[13] = Math.sin(who.a)
    f[14] = Math.cos(who.a)
    let bd = 64, bm = null
    for (const m of gs.monsters) {
        const d2 = (m.x - who.x) * (m.x - who.x) + (m.y - who.y) * (m.y - who.y)
        if (d2 < bd) { bd = d2; bm = m }
    }
    if (bm) {
        f[15] = clamp8(bm.x - who.x)
        f[16] = clamp8(bm.y - who.y)
        f[17] = MONSTERS[bm.kind] && MONSTERS[bm.kind].drain ? 1 : 0
        f[18] = bd <= 1.25 * 1.25 ? 1 : 0
    } else { f[15] = 0; f[16] = 0; f[17] = 0; f[18] = 0 }
    let fd = 1e9, fi = null
    for (const it of gs.items) {
        if (it.taken || it.t !== 'food') continue
        const d = Math.abs(it.x - who.x) + Math.abs(it.y - who.y)
        if (d < fd) { fd = d; fi = it }
    }
    if (fi && fd <= 12) {
        f[19] = clamp8(fi.x - who.x)
        f[20] = clamp8(fi.y - who.y)
        f[21] = 1
    } else { f[19] = 0; f[20] = 0; f[21] = 0 }
    // motion memory (mem = {hx,hy,vx,vy,wx,wy}): hero velocity EMA (0.4 old +
    // 0.6 new, the CPU's own smoothing) -> a look-ahead target up to 1.8 cells
    // down the hero's line; when the hero stands, the target is one cell BEHIND
    // him — exactly the doctrine the seat is imitating, made visible to a
    // stateless net. Plus the seat's own last-tick delta.
    if (mem) {
        const vx = h.x - (mem.hx ?? h.x)
        const vy = h.y - (mem.hy ?? h.y)
        mem.hx = h.x; mem.hy = h.y
        mem.vx = (mem.vx ?? 0) * 0.4 + vx * 0.6
        mem.vy = (mem.vy ?? 0) * 0.4 + vy * 0.6
        const vs = Math.hypot(mem.vx, mem.vy)
        let tx, ty
        if (vs > 0.012) {
            const look = Math.min(1.8, vs * 24)
            tx = h.x + (mem.vx / vs) * look
            ty = h.y + (mem.vy / vs) * look
        } else {
            tx = h.x - Math.cos(h.a) * 1.0
            ty = h.y - Math.sin(h.a) * 1.0
        }
        f[22] = clamp8(tx - who.x)
        f[23] = clamp8(ty - who.y)
        f[24] = Math.min(1, vs / 0.06)
        f[25] = Math.max(-1, Math.min(1, (who.x - (mem.wx ?? who.x)) / 0.06))
        f[26] = Math.max(-1, Math.min(1, (who.y - (mem.wy ?? who.y)) / 0.06))
        mem.wx = who.x; mem.wy = who.y
        // autoregressive: the last emitted pad. Momentum of intent — the
        // teacher's lane is a path, and a path continues.
        const pa = mem.pa
        f[27] = pa && pa.left ? 1 : 0
        f[28] = pa && pa.right ? 1 : 0
        f[29] = pa && pa.up ? 1 : 0
        f[30] = pa && pa.down ? 1 : 0
        f[31] = pa && pa.a ? 1 : 0
    } else { f.fill(0, 22, 32) }
    return f
}

// forward pass over { arch, w, b } — tanh hidden layers, sigmoid outputs.
export function forward(policy, x) {
    const { arch, w, b } = policy
    let a = x
    let off = 0, bOff = 0
    for (let l = 0; l < arch.length - 1; l++) {
        const ni = arch[l], no = arch[l + 1]
        const out = new Array(no)
        for (let j = 0; j < no; j++) {
            let s = b[bOff + j]
            for (let i = 0; i < ni; i++) s += w[off + j * ni + i] * a[i]
            out[j] = l < arch.length - 2 ? Math.tanh(s) : 1 / (1 + Math.exp(Math.max(-35, Math.min(35, -s))))
        }
        off += ni * no
        bOff += no
        a = out
    }
    return a // N_ACT sigmoids
}

// Make a seat policy: decide(gs) -> THE one pad. `policy` defaults to the
// shipped weights; the harness injects mutants through the argument.
export function createModelPolicy(policy = POLICY) {
    let prev = false
    const mem = {}
    return {
        name: policy.meta ? policy.meta.name : 'model/v1',
        meta: policy.meta || null,
        reset() { prev = false; for (const k of Object.keys(mem)) delete mem[k] },
        decide(gs) {
            const p = gs.partner
            const pad = { left: false, right: false, up: false, down: false, a: false }
            if (!p || p.down || gs.end || !gs.hero || gs.hero.deadT > 0) { prev = false; return pad }
            const pr = forward(policy, featurize(gs, p, mem))
            pad.left = pr[0] > 0.5
            pad.right = pr[1] > 0.5
            pad.up = pr[2] > 0.5
            pad.down = pr[3] > 0.5
            const intent = pr[4] > 0.5
            pad.a = intent && !prev // thumb pulse, like the cpu's cut
            prev = pad.a
            mem.pa = pad
            return pad
        },
    }
}

// #1636: recording seat-stamp. A seat the trained net drove carries its id
// (recorder sources take `modelId`); externally-driven contract seats stay
// anonymous `model` — we cannot name a net we did not train.
export const seatSources = ({ seat2Kind = 'off', brainSeated = false, brainName = 'model/v1' }) => [
    { kind: 'model' },
    brainSeated && seat2Kind === 'model' ? { kind: 'model', modelId: brainName } : { kind: seat2Kind },
]
