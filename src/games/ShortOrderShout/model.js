// SHORT ORDER SHOUT MODEL (#1712 S2) — the cook's own senses at THIS seat, the
// same doctrine as Gauntlet's model.js (#2299 lineage), FloorBoss's (#2805) and
// BombDefuse's (#2849): features are what a line cook AT THIS SEAT can notice
// on the shared kitchen. SOS splits EFFORT across up to four cooks but the
// kitchen is one shared board — every cook sees every ticket, burner, the pot
// and the floor — so the seat facts are the body (where am I, what do I hold)
// plus the crew (where is the nearest other cook).
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['short-order-shout']), a trainer eats these
// rows, and a seat agent that drops in later runs the same senses — a model can
// never train on one world and play on another (the silent-teacher bug class).
// The advisory lists (needs/actionable) are THE engine's own, the same ones
// cpuPlan reads: the model reads what the CPU reads, what the HUD advises.
//
// `seat` is 0..3 (SOS seats up to four cooks). `mem.pa` is the seat's own pad
// last tick (the autoregressive lane), same discipline as the other titles —
// the caller banks it AFTER the label.
//
// Hash-clean: pure reads of gs only — no rng, no writes. All advisory helpers
// (needs/actionable) are pure over gs; nothing here mutates the sim.

import {
    GRID_W, GRID_H, SHIFT_TICKS, QUOTA, MAX_STRIKES, SPEED,
    SEAR_OK, TAP_REFILL, STIR_GAP, SEAR_TICKS,
    STATION, needs, actionable,
} from './engine.js'

export const FEAT_NAMES = [
    'shiftFrac', 'scoreFrac', 'strikesFrac', 'done', 'win',
    'ticketCount', 'ticketRipe', 'soupOldest', 'soupOpen',
    'needBun', 'needTom', 'needPot', 'needPatty',
    'actBun', 'actTom', 'actPot', 'actPatty', 'actWater',
    'myX', 'myY', 'faceUp', 'faceDown', 'faceLeft', 'faceRight',
    'heldIdx', 'dirty', 'heldDish', 'moveCdFrac',
    'distWindow', 'distTap', 'distCooler', 'distBoard', 'distPot', 'distBurner',
    'tapCdFrac', 'boardIdx', 'potIdx', 'potStirFrac',
    'heat0', 'heat1', 'fireCount', 'spills', 'projs',
    'partnerDx', 'partnerDy', 'partnerHeldDish', 'partnerDirty',
    'solo', 'seatId',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
]
export const N_FEAT = FEAT_NAMES.length // 55
export const N_ACT = 6 // left, right, up, down, A, B — the dpad six

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const MAXD = (GRID_W - 1) + (GRID_H - 1) // 18 — the longest kitchen walk

// Held-item ledger, engine vocabulary (/10): none|bun|tom|pot|patty|water|
// pattyC|ruin|soup|melt|meltG.
const HELD_N = { '-': 0, bun: 1, tom: 2, pot: 3, patty: 4, water: 5, pattyC: 6, ruin: 7, soup: 8, melt: 9, meltG: 10 }
const BOARD_N = { none: 0, bun: 1, buntom: 2, melt: 3 }
const POT_N = { empty: 0, veg: 1, boiling: 2, ready: 3, ruined: 4, soaked: 1 }
const DISHES = { soup: 1, melt: 1, meltG: 1 }

// how hot is a burner, 0..1 — the read a cook eyeballs: cooking counts toward
// the sear, ready counts toward the scorch, burnt/fire is maxed.
function heatOf(b) {
    if (b.state === 'cooking') return clamp01(b.t / SEAR_TICKS)
    if (b.state === 'ready') return clamp01(b.t / SEAR_OK)
    if (b.state === 'burnt' || b.state === 'fire') return 1
    return 0
}

const mdist = (x0, y0, x, y) => Math.abs(x - x0) + Math.abs(y - y0)
const nearestCell = (cells, x, y) => {
    let best = Infinity
    for (const c of cells) best = Math.min(best, mdist(x, y, c[0], c[1]))
    return best
}

// featurize(gs, seat, mem) — see header. The caller banks mem.pa with the
// seat's decoded pad after the label, so intent continues across ticks.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT)
    const c = gs.cooks[seat]
    f[0] = clamp01(gs.tick / SHIFT_TICKS)
    f[1] = clamp01(gs.score / QUOTA)
    f[2] = clamp01(gs.strikes / MAX_STRIKES)
    f[3] = gs.done ? 1 : 0
    f[4] = gs.done && gs.win ? 1 : 0
    // the rail: tickets are the whole point of the shift — how many, how ripe,
    // and what the oldest one wants
    f[5] = clamp01(gs.tickets.length / 3)
    const oldest = gs.tickets.length ? gs.tickets[0] : null
    f[6] = oldest ? clamp01(1 - oldest.left / oldest.total) : 0
    f[7] = oldest && oldest.dish === 'soup' ? 1 : 0
    f[8] = clamp01(gs.tickets.filter((t) => t.dish === 'soup').length / 2)
    // the engine's own advisory pair — what the tickets still need and what the
    // stations have room for right now (cpuPlan reads the same two lists)
    const want = needs(gs)
    const act = actionable(gs)
    f[9] = want.bun > 0 ? 1 : 0
    f[10] = want.tom > 0 ? 1 : 0
    f[11] = want.pot > 0 ? 1 : 0
    f[12] = want.patty > 0 ? 1 : 0
    f[13] = act.bun ? 1 : 0
    f[14] = act.tom ? 1 : 0
    f[15] = act.pot ? 1 : 0
    f[16] = act.patty ? 1 : 0
    f[17] = act.water ? 1 : 0
    // this cook's body — position, facing, hands (a seat out of range reads as
    // honest zeros: never a phantom cook)
    const x = c ? c.x : 0
    const y = c ? c.y : 0
    f[18] = c ? x / (GRID_W - 1) : 0
    f[19] = c ? y / (GRID_H - 1) : 0
    f[20] = c && c.face === 'up' ? 1 : 0
    f[21] = c && c.face === 'down' ? 1 : 0
    f[22] = c && c.face === 'left' ? 1 : 0
    f[23] = c && c.face === 'right' ? 1 : 0
    f[24] = c ? (HELD_N[c.holding || '-'] || 0) / 10 : 0
    f[25] = c && c.dirty ? 1 : 0
    f[26] = c && DISHES[c.holding] ? 1 : 0
    f[27] = c ? clamp01(c.moveCd / SPEED) : 0
    // the walk board — how far each station is from THIS cook, right now
    f[28] = c ? clamp01(mdist(x, y, STATION.window[0], STATION.window[1]) / MAXD) : 0
    f[29] = c ? clamp01(mdist(x, y, STATION.tap[0], STATION.tap[1]) / MAXD) : 0
    f[30] = c ? clamp01(nearestCell(STATION.cooler, x, y) / MAXD) : 0
    f[31] = c ? clamp01(mdist(x, y, STATION.board[0], STATION.board[1]) / MAXD) : 0
    f[32] = c ? clamp01(mdist(x, y, STATION.pot[0], STATION.pot[1]) / MAXD) : 0
    f[33] = c ? clamp01(nearestCell(STATION.burner, x, y) / MAXD) : 0
    // the shared board — soup, pans, the tap queue, mess and in-flight tosses
    f[34] = clamp01(gs.tapCd / TAP_REFILL)
    f[35] = (BOARD_N[gs.board] || 0) / 3
    f[36] = (POT_N[gs.pot.state] || 0) / 4
    f[37] = gs.pot.state === 'boiling'
        ? clamp01(Math.min(gs.pot.stir / Math.max(1, gs.pot.need), gs.pot.since / STIR_GAP))
        : clamp01(gs.pot.stir / 3)
    f[38] = heatOf(gs.burners[0])
    f[39] = heatOf(gs.burners[1])
    f[40] = clamp01(gs.burners.filter((b) => b.state === 'fire').length / 2)
    f[41] = clamp01(gs.floors.length / 8)
    f[42] = clamp01(gs.projs.length / 4)
    // the crew: nearest other living cook, their relative pose and their hands
    let mate = null
    let mateD = Infinity
    for (let i = 0; i < gs.cooks.length; i++) {
        const o = gs.cooks[i]
        if (i === seat || !o.alive) continue
        const d = mdist(x, y, o.x, o.y)
        if (d < mateD) { mateD = d; mate = o }
    }
    f[43] = mate ? clamp01(Math.abs(mate.x - x) / (GRID_W - 1)) * Math.sign(mate.x - x) : 0
    f[44] = mate ? clamp01(Math.abs(mate.y - y) / (GRID_H - 1)) * Math.sign(mate.y - y) : 0
    f[45] = mate && DISHES[mate.holding] ? 1 : 0
    f[46] = mate && mate.dirty ? 1 : 0
    // seat facts: solo changes what the crew features MEAN (nobody to hand to)
    f[47] = gs.seats === 1 ? 1 : 0
    f[48] = clamp01(seat / 3)
    // autoregressive: the last emitted pad
    if (mem && mem.pa) {
        const pa = mem.pa
        f[49] = pa.left ? 1 : 0
        f[50] = pa.right ? 1 : 0
        f[51] = pa.up ? 1 : 0
        f[52] = pa.down ? 1 : 0
        f[53] = pa.a ? 1 : 0
        f[54] = pa.b ? 1 : 0
    } else { f.fill(0, 49, N_FEAT) }
    return f
}
