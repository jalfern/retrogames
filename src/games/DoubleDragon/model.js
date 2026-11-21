// DOUBLE DRAGON MODEL (#1712 S2) — the brawler's own senses at THIS seat, the
// same doctrine as Gauntlet's model.js (#2299 lineage), FloorBoss's (#2805),
// BombDefuse's (#2849) and ShortOrderShout's (#2861): features are what a
// fighter AT THIS SEAT can notice on Walnuts Street. The street is shared, but
// THE CAMERA is the crest: a thug marching in beyond the visible window is not
// in the world a seat can see, so every enemy/projectile/barrel read masks to
// [camX, camX+W] — the honest-zero law the rally crest pin teaches.
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['double-dragon']), a trainer eats these
// rows, and a seat agent that drops in later runs the same senses — a model
// can never train on one world and play on another (the silent-teacher bug
// class).
//
// `seat` is 0 (Billy) or 1 (Jimmy). Seat 1 on a solo file, a seat whose pool
// is empty (`out`), or a seat index the run never had, all read HONEST ZEROS
// for body parts — never a phantom dragon. `mem.pa` is the seat's own pad last
// tick (the autoregressive lane); the caller banks it AFTER the label.
//
// Hash-clean: pure reads of gs only — no rng, no writes.

import { W, DEEP_TOP, DEEP_BOT, STAGE_W, CFG, ENEMY_DEF } from './sim.js'

export const FEAT_NAMES = [
    'progress', 'stage2', 'done', 'cleared', 'cheer', 'scoreFrac',
    'myX', 'myY', 'myZ', 'faceRight', 'sWalk', 'sJump', 'sAttack', 'sGrabbed',
    'sDown', 'inv', 'weapon', 'out', 'livesFrac',
    'e1', 'e1Dx', 'e1Dy', 'e1Toward', 'e1Tel', 'e1Charge', 'e1Hp', 'e1Armed', 'e1Kind',
    'e2', 'e2Dx', 'e2Dy', 'e2Toward', 'e2Tel', 'e2Charge', 'e2Hp', 'e2Armed', 'e2Kind',
    'barN', 'barDx', 'barDy', 'projN', 'projDx', 'projDy',
    'mate', 'mateDx', 'mateDy', 'mateAttack', 'mateCpu',
    'marian', 'mDx', 'mDy', 'mFreed',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB', 'prevBoost',
    'seatId',
]
export const N_FEAT = FEAT_NAMES.length // 60
export const N_ACT = 7 // left, right, up, down, A(jump), B(kick), boost(punch)

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const BAND = DEEP_BOT - DEEP_TOP

// the states where a thug is winding up something that hurts: the read a
// player blocks on — and the CPU reads in its own plan.
const TEL = new Set(['windup', 'chargewind', 'aim', 'cast', 'attack', 'grab'])
const KIND_N = { williams: 1, amon: 2, abobo: 3, duel: 4 }
const WEAPON_N = { stick: 1, knife: 2, whip: 3 }
const ATTACK = new Set(['punch', 'kick', 'spin', 'throw', 'whip'])

const inView = (gs, x) => x >= gs.camX - 8 && x <= gs.camX + W + 8

// signed, normalized delta toward a world x from the seat's x
const sdx = (gx, x) => clamp01(Math.abs(gx - x) / W) * Math.sign(gx - x)
const sdy = (gy, y) => clamp01(Math.abs(gy - y) / BAND) * Math.sign(gy - y)

// the two nearest VISIBLE, street-active thugs (enter/getup/down still count —
// a downed Abobo matters for positioning; only OFF-CAMERA is masked to zero).
function threatSlots(gs, x, y) {
    const cand = []
    for (const e of gs.enemies) {
        if (!inView(gs, e.x)) continue
        const d = Math.abs(e.x - x) + Math.abs(e.y - y) * 0.6 + (e.state === 'down' ? 1000 : 0)
        cand.push({ e, d })
    }
    cand.sort((a, b) => a.d - b.d)
    return [cand[0] && cand[0].e, cand[1] && cand[1].e]
}

function putEnemy(f, base, gs, e, x, y) {
    if (!e) { f.fill(0, base, base + 9); return }
    f[base] = 1
    f[base + 1] = sdx(e.x, x)
    f[base + 2] = sdy(e.y, y)
    f[base + 3] = (e.face > 0 ? e.x < x : e.x > x) ? 1 : 0 // facing this dragon
    f[base + 4] = TEL.has(e.state) ? 1 : 0
    f[base + 5] = e.state === 'charge' ? 1 : 0
    const def = ENEMY_DEF[e.kind]
    f[base + 6] = def ? clamp01(e.hp / def.hp) : 0
    f[base + 7] = e.hasStick || e.hasKnife ? 1 : 0
    f[base + 8] = (KIND_N[e.kind] || 0) / 4
}

// featurize(gs, seat, mem) — see header.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT)
    const me = seat === 0 ? gs.billy : gs.jimmy
    const x = me ? me.x : gs.camX + W / 2
    const y = me ? me.y : (DEEP_TOP + DEEP_BOT) / 2
    f[0] = clamp01(gs.camX / STAGE_W)
    f[1] = gs.stage === 2 ? 1 : 0
    f[2] = gs.mode !== 'play' ? 1 : 0
    f[3] = gs.cleared ? 1 : 0
    f[4] = gs.rescueT > 0 ? 1 : 0
    f[5] = clamp01(gs.score / 20000)
    // the body at this seat — honest zeros for a seat the run never had
    if (me) {
        f[6] = clamp01((me.x - gs.camX) / W)
        f[7] = clamp01((me.y - DEEP_TOP) / BAND)
        f[8] = clamp01(me.z / 40)
        f[9] = me.face > 0 ? 1 : 0
        f[10] = me.state === 'walk' ? 1 : 0
        f[11] = me.state === 'jump' ? 1 : 0
        f[12] = ATTACK.has(me.state) ? 1 : 0
        f[13] = me.state === 'grabbed' ? 1 : 0
        f[14] = me.state === 'dying' ? 1 : 0
        f[15] = me.inv > 0 ? 1 : 0
        f[16] = (WEAPON_N[me.weapon] || 0) / 3
        f[17] = me.out ? 1 : 0
        f[18] = clamp01(me.lives / CFG.lives)
    } else { f.fill(0, 6, 19) }
    const [e1, e2] = threatSlots(gs, x, y)
    putEnemy(f, 19, gs, e1, x, y)
    putEnemy(f, 28, gs, e2, x, y)
    // the street's hardware: barrels/crates in view and thrown steel
    let bar = null; let barD = Infinity
    for (const b of gs.barrels) {
        if (!inView(gs, b.x) || b.hp <= 0) continue
        const d = Math.abs(b.x - x) + Math.abs(b.y - y)
        if (d < barD) { barD = d; bar = b }
    }
    f[37] = clamp01(gs.barrels.filter((b) => b.hp > 0 && inView(gs, b.x)).length / 3)
    f[38] = bar ? sdx(bar.x, x) : 0
    f[39] = bar ? sdy(bar.y, y) : 0
    let pr = null; let prD = Infinity
    for (const q of gs.projectiles) {
        if (!inView(gs, q.x)) continue
        const d = Math.abs(q.x - x)
        if (d < prD) { prD = d; pr = q }
    }
    f[40] = clamp01(gs.projectiles.filter((q) => inView(gs, q.x)).length / 2)
    f[41] = pr ? sdx(pr.x, x) : 0
    f[42] = pr ? sdy(pr.y, y) : 0
    // the other dragon (Jimmy for Billy, Billy for Jimmy) — position and temper
    const mate = seat === 0 ? gs.jimmy : gs.billy
    if (mate && !mate.out) {
        f[43] = 1
        f[44] = sdx(mate.x, x)
        f[45] = sdy(mate.y, y)
        f[46] = ATTACK.has(mate.state) ? 1 : 0
        f[47] = seat === 0 && gs.jimmy && !gs.jimmy.human ? 1 : 0 // the blue seat is still the CPU's
    } else { f.fill(0, 43, 48) }
    // Marian — the reason the street burns (stage 2 only)
    if (gs.marian) {
        f[48] = 1
        f[49] = sdx(gs.marian.x, x)
        f[50] = sdy(gs.marian.y, y)
        f[51] = gs.marian.freed ? 1 : 0
    } else { f.fill(0, 48, 52) }
    // autoregressive: the last emitted pad
    if (mem && mem.pa) {
        const pa = mem.pa
        f[52] = pa.left ? 1 : 0
        f[53] = pa.right ? 1 : 0
        f[54] = pa.up ? 1 : 0
        f[55] = pa.down ? 1 : 0
        f[56] = pa.a ? 1 : 0
        f[57] = pa.b ? 1 : 0
        f[58] = pa.boost ? 1 : 0
    } else { f.fill(0, 52, N_FEAT) }
    f[59] = seat === 1 ? 1 : 0 // seatId last
    return f
}
