// CONTRA MODEL (#1712 S2) — the jungle's own senses at THIS seat, the same
// doctrine as Gauntlet's model.js (#2299 lineage), DoubleDragon's (#1712),
// FloorBoss's (#2805) and Rally's: features are what a gunner AT THIS SEAT can
// notice. The screen is the crest: the jungle scrolls horizontally, the gorge
// and the base vertically, so every enemy/projectile read masks to the window
// this camera actually shows — off-screen steel is honest zero, never a phantom.
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['contra']), a trainer eats these rows, and a
// seat agent that drops in later runs the same senses — a model can never
// train on one world and play on another (the silent-teacher bug class).
//
// `seat` is 0 (the hero) or 1 (the blue wingman). A seat the run never had
// alive (`out`) reads HONEST ZEROS for its body — no phantom marine. The CPU
// ally is still a body in the world (mate lanes), but a CPU seat's HANDS never
// produce rows (#2058 law — that filter lives in the adapter, not here).
// `mem.pa` is the seat's own pad last tick (the autoregressive lane); the
// caller banks it AFTER the label.
//
// Hash-clean: pure reads of gs only — no rng, no writes.

import { W, H, CFG } from './sim.js'

export const FEAT_NAMES = [
    'progress', 'falls', 'boss', 'done', 'heat', 'scoreFrac', 'loopFrac',
    'myX', 'myY', 'onGround', 'faceRight', 'aimX', 'aimY', 'inv', 'weapon',
    'out', 'dead', 'livesFrac', 'vine',
    's1', 's1Dx', 's1Dy', 's1Toward', 's1Throw', 's1Hp',
    's2', 's2Dx', 's2Dy', 's2Toward', 's2Throw', 's2Hp',
    'turN', 'turDx', 'turDy', 'turHp',
    'snipe', 'snipeDx',
    'barN', 'barDx', 'capDx', 'capDy', 'capKind',
    'carN', 'carDx', 'carDy', 'airN', 'airDx', 'airDy',
    'ebN', 'ebDx', 'ebDy', 'nade',
    'core', 'coreHp', 'coreOpen', 'cascade',
    'mate', 'mateDx', 'mateDy', 'mateHuman',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
    'seatId',
]
export const N_FEAT = FEAT_NAMES.length // 67
export const N_ACT = 6 // left, right, up, down, A(jump), B(fire)

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const WEAPON_N = { rifle: 1, spread: 2, machine: 3, fire: 4, laser: 5 }
const CAP_KIND_N = { spread: 2, machine: 3, fire: 4, laser: 5 }

// what THIS camera shows: the jungle scrolls on x, the gorge/base on y.
const inX = (gs, x) => gs.phase === 'jungle'
    ? x >= gs.cam - 8 && x <= gs.cam + W + 8
    : x >= -8 && x <= W + 8
const inY = (gs, y) => gs.phase === 'jungle'
    ? y >= -8 && y <= H + 8
    : y >= gs.camY - 8 && y <= gs.camY + H + 8
const inView = (gs, x, y) => inX(gs, x) && inY(gs, y)

// signed, normalized deltas from the seat's screen position toward a world point
const sdx = (gs, gx, x) => {
    if (gs.phase === 'jungle') return clamp01(Math.abs(gx - x) / W) * Math.sign(gx - x)
    return clamp01(gx / W) * Math.sign(gx - x)
}
const sdy = (gs, gy, y) => {
    if (gs.phase === 'jungle') return clamp01(Math.abs(gy - y) / H) * Math.sign(gy - y)
    return clamp01(Math.abs(gy - gs.camY) / H) * Math.sign(gy - y)
}

// the two nearest VISIBLE soldiers (a sleeping one still counts — the run walks
// up on them, that's the jungle's whole law); dead/masked are zeroed.
function threatSlots(gs, x, y) {
    const cand = []
    for (const s of gs.soldiers) {
        if (s.dead || !inView(gs, s.x, s.y)) continue
        cand.push({ s, d: Math.abs(s.x - x) + Math.abs(s.y - y) * 0.6 })
    }
    cand.sort((a, b) => a.d - b.d)
    return [cand[0] && cand[0].s, cand[1] && cand[1].s]
}

function putSoldier(f, base, gs, s, x, y) {
    if (!s) { f.fill(0, base, base + 6); return }
    f[base] = 1
    f[base + 1] = sdx(gs, s.x, x)
    f[base + 2] = sdy(gs, s.y, y)
    f[base + 3] = (s.walkDir || 0) !== 0 && ((s.walkDir > 0) === (s.x < x)) ? 1 : 0 // marching toward this seat
    f[base + 4] = s.throwT > 0 ? 1 : 0 // nade windup — the tell before the arc
    f[base + 5] = clamp01((s.hp || 1) / 2)
}

// featurize(gs, seat, mem) — see header.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT)
    const me = seat === 0 ? gs.p : gs.p2
    const x = me ? (gs.phase === 'jungle' ? me.x - gs.cam : me.x) : W / 2
    const y = me ? (gs.phase === 'jungle' ? me.y : me.y - gs.camY) : H / 2
    // the world this run is running: jungle progress on the scroll axis, the
    // gorge/base flagged by phase, heat is the loop pressure the cabinet adds
    f[0] = gs.phase === 'jungle' ? clamp01(gs.cam / (CFG.worldW - W)) : 1
    f[1] = gs.phase === 'falls' ? 1 : 0
    f[2] = gs.phase === 'boss' ? 1 : 0
    f[3] = gs.end !== null ? 1 : 0
    f[4] = clamp01((gs.lk - 1) / 2)
    f[5] = clamp01(gs.score / 50000)
    f[6] = clamp01(gs.loop / 8)
    // the body at this seat — honest zeros for a seat the pool spent
    if (me) {
        f[7] = clamp01(x / W)
        f[8] = clamp01(y / H)
        f[9] = me.onGround ? 1 : 0
        f[10] = me.face > 0 ? 1 : 0
        f[11] = clamp01((me.ax + 1) / 2)
        f[12] = clamp01((me.ay + 1) / 2)
        f[13] = me.inv > 0 ? 1 : 0
        f[14] = (WEAPON_N[me.weapon] || 0) / 5
        f[15] = me.out ? 1 : 0
        f[16] = me.dead > 0 ? 1 : 0
        f[17] = clamp01(gs.lives / 5)
        f[18] = me.vine >= 0 ? 1 : 0
    } else { f.fill(0, 7, 19) }
    const [s1, s2] = threatSlots(gs, me ? me.x : CFG.worldW / 2, me ? me.y : CFG.ground)
    putSoldier(f, 19, gs, s1, me ? me.x : 0, me ? me.y : CFG.ground)
    putSoldier(f, 25, gs, s2, me ? me.x : 0, me ? me.y : CFG.ground)
    // the jungle's hardware: sand turrets, the ridge sniper (a scoped glint the
    // original tells you before it kills you — the read a player learns on)
    let tur = null; let turD = Infinity
    for (const t of gs.turrets) {
        if (t.dead || !inView(gs, t.x, t.y)) continue
        const d = Math.abs(t.x - (me ? me.x : 0))
        if (d < turD) { turD = d; tur = t }
    }
    f[31] = clamp01(gs.turrets.filter((t) => !t.dead && inView(gs, t.x, t.y)).length / 3)
    f[32] = tur ? sdx(gs, tur.x, me ? me.x : 0) : 0
    f[33] = tur ? sdy(gs, tur.y, me ? me.y : CFG.ground) : 0
    f[34] = tur ? clamp01(tur.hp / 2) : 0
    let sn = null; let snD = Infinity
    for (const s of gs.snipers) {
        if (s.dead || !s.awake || !inView(gs, s.x, s.y)) continue
        const d = Math.abs(s.x - (me ? me.x : 0))
        if (d < snD) { snD = d; sn = s }
    }
    f[35] = sn ? 1 : 0
    f[36] = sn ? sdx(gs, sn.x, me ? me.x : 0) : 0
    // barrels (chain-reaction TNT), the wheel capsule riding toward you
    let bar = null; let barD = Infinity
    for (const b of gs.barrels) {
        if (b.gone || !inView(gs, b.x, b.y)) continue
        const d = Math.abs(b.x - (me ? me.x : 0))
        if (d < barD) { barD = d; bar = b }
    }
    f[37] = clamp01(gs.barrels.filter((b) => !b.gone && inView(gs, b.x, b.y)).length / 4)
    f[38] = bar ? sdx(gs, bar.x, me ? me.x : 0) : 0
    let cap = null; let capD = Infinity
    const caps = gs.capsule ? [gs.capsule, ...gs.vc, ...gs.pods] : [...gs.vc, ...gs.pods]
    for (const c of caps) {
        if (!inView(gs, c.x, c.y)) continue
        const d = Math.abs(c.x - (me ? me.x : 0)) + Math.abs(c.y - (me ? me.y : CFG.ground))
        if (d < capD) { capD = d; cap = c }
    }
    f[39] = cap ? sdx(gs, cap.x, me ? me.x : 0) : 0
    f[40] = cap ? sdy(gs, cap.y, me ? me.y : CFG.ground) : 0
    f[41] = cap ? (CAP_KIND_N[cap.kind] || 1) / 5 : 0
    // the sky: courier gunships and the base's sortie hulls
    let car = null; let carD = Infinity
    for (const c of gs.carriers) {
        if (c.dead || !inX(gs, c.x)) continue
        const d = Math.abs(c.x - (me ? me.x : 0))
        if (d < carD) { carD = d; car = c }
    }
    f[42] = clamp01(gs.carriers.filter((c) => !c.dead && inX(gs, c.x)).length / 2)
    f[43] = car ? sdx(gs, car.x, me ? me.x : 0) : 0
    f[44] = car ? clamp01(car.y / H) : 0
    let gs0 = null; let gsD = Infinity
    for (const s of gs.gunships) {
        if (s.dead || !inX(gs, s.x)) continue
        const d = Math.abs(s.x - (me ? me.x : 0))
        if (d < gsD) { gsD = d; gs0 = s }
    }
    f[45] = clamp01(gs.gunships.filter((s) => !s.dead && inX(gs, s.x)).length / 2)
    f[46] = gs0 ? sdx(gs, gs0.x, me ? me.x : 0) : 0
    f[47] = gs0 ? clamp01((gs0.y - (gs.phase === 'jungle' ? 0 : gs.camY)) / H) : 0
    // enemy steel in the air: the nearest round and whether any of it is a
    // lobbed grenade (the arc the lane law can duck)
    let eb = null; let ebD = Infinity; let nade = 0
    for (const b of gs.eb) {
        if (!inView(gs, b.x, b.y)) continue
        if (b.gr) nade = 1
        const d = Math.abs(b.x - (me ? me.x : 0)) + Math.abs(b.y - (me ? me.y : CFG.ground)) * 0.6
        if (d < ebD) { ebD = d; eb = b }
    }
    f[48] = clamp01(gs.eb.filter((b) => inView(gs, b.x, b.y)).length / 6)
    f[49] = eb ? sdx(gs, eb.x, me ? me.x : 0) : 0
    f[50] = eb ? sdy(gs, eb.y, me ? me.y : CFG.ground) : 0
    f[51] = nade
    // the fortress: the core's armored cycle is the boss fight's whole timing law
    if (gs.boss) {
        f[52] = 1
        f[53] = clamp01(gs.boss.core / CFG.coreHp)
        f[54] = (gs.boss.coreT % CFG.coreCycle) < CFG.coreOpen ? 1 : 0
        f[55] = gs.boss.dying ? 1 : 0
    } else { f.fill(0, 52, 56) }
    // the wingman (or the hero, from seat 1) — presence, distance, whose hands
    const mate = seat === 0 ? gs.p2 : gs.p
    if (mate && !mate.out && mate.dead === 0) {
        f[56] = 1
        f[57] = sdx(gs, mate.x, me ? me.x : 0)
        f[58] = sdy(gs, mate.y, me ? me.y : CFG.ground)
        f[59] = seat === 0 ? (gs.p2.human ? 1 : 0) : 1 // the hero's seat is a thumb by construction
    } else { f.fill(0, 56, 60) }
    // autoregressive: the last emitted pad
    if (mem && mem.pa) {
        const pa = mem.pa
        f[60] = pa.left ? 1 : 0
        f[61] = pa.right ? 1 : 0
        f[62] = pa.up ? 1 : 0
        f[63] = pa.down ? 1 : 0
        f[64] = pa.a ? 1 : 0
        f[65] = pa.b ? 1 : 0
    } else { f.fill(0, 60, N_FEAT - 1) }
    f[N_FEAT - 1] = seat === 1 ? 1 : 0 // seatId last
    return f
}
