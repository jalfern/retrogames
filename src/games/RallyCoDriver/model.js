// RALLY CO-DRIVER MODEL (#1712 S2) — the seat's own senses, the same doctrine
// as Gauntlet's model.js (#2299 lineage), FloorBoss's (#2805), BombDefuse's
// (#2849) and ShortOrderShout's (#1712): features are what a player AT THIS
// SEAT can notice. Rally is the one title here that splits INFORMATION, not
// effort: the driver sees the road through the headlights and hears the notes
// already called; the co-driver drives from the pace book (the stage truth,
// the notes ledger) and feels the car. So the feature vector carries three
// blocks — shared car facts, a DRIVER block (never anything the crest hides)
// and a CO-DRIVER block (never zeroed when the seat is 1, and zeroed when it
// is 0). The no-leak law of the shell (lapProgress) is honoured here too:
// a driver feature only ever rides what visibleAhead/lead already admit.
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['rally-co-driver']), a trainer eats these
// rows, and a seat agent that drops in later runs the same senses — a model
// can never train on one world and play on another (the silent-teacher bug
// class). The driver block mirrors exactly what cpuDriverPad reads (card note
// + visible corner); the co-driver block mirrors decideCoCall's corner ledger.
//
// `seat` is 0 = driver, 1 = co-driver. `mem.pa` is the seat's own pad last
// tick (the autoregressive lane); the caller banks it AFTER the label.
//
// Hash-clean: pure reads of gs only — no rng, no writes.

import { VMAX, LAPS, ROAD_HALF, FOG_RANGE, distAhead, cornerAhead } from './sim.js'

export const FEAT_NAMES = [
    'vFrac', 'latFrac', 'alignFrac', 'off', 'lapFrac', 'done', 'win', 'offRatio',
    'wxClear', 'wxMist', 'wxRain', 'visFrac', 'progressFrac',
    'noteCorrect', 'noteLate', 'noteMissed',
    'seenPresent', 'seenDir', 'seenSev', 'seenDist',
    'heardPresent', 'heardDir', 'heardSev', 'heardDist',
    'nextTrueDir', 'nextTrueSev', 'nextTrueDist', 'nextCalled',
    'lastCallDir', 'lastCallSev', 'ticksSinceCall',
    'seatId', 'coOff', 'coCpu', 'coHuman',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
]
export const N_FEAT = FEAT_NAMES.length // 41
export const N_ACT = 6 // left, right, up, down, A, B — the dpad six

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// featurize(gs, seat, mem) — see header.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT)
    const car = gs.car
    const st = gs.stage
    // --- shared: the car and the sky (both seats ride it) --------------------
    f[0] = clamp01(car.v / VMAX)
    f[1] = car.lat / (ROAD_HALF * 1.7) // ~50 on the ribbon, ±1 deep in the rough
    f[2] = car.align / 1.35
    f[3] = car.off ? 1 : 0
    f[4] = clamp01(gs.lapsDone / LAPS)
    f[5] = gs.done ? 1 : 0
    f[6] = gs.done && gs.win ? 1 : 0
    f[7] = clamp01(gs.stats.offTicks / (gs.tick + 1))
    f[8] = gs.weather === 'clear' ? 1 : 0
    f[9] = gs.weather === 'mist' ? 1 : 0
    f[10] = gs.weather === 'rain' ? 1 : 0
    f[11] = clamp01(gs.vis / FOG_RANGE)
    f[12] = clamp01(car.s / st.L)
    // --- the notes ledger (the HUD shows it to both seats) -------------------
    const judged = gs.stats.correct + gs.stats.late + gs.stats.missed
    f[13] = judged ? gs.stats.correct / judged : 0
    f[14] = judged ? gs.stats.late / judged : 0
    f[15] = judged ? gs.stats.missed / judged : 0
    // --- DRIVER block: headlights + heard notes, nothing the crest hides ------
    const drive = seat === 0
    let seen = null
    if (drive) {
        for (const c of cornerAhead(st, car.s, gs.vis)) {
            if (!seen || c.d < seen.d) seen = c
        }
        f[16] = seen ? 1 : 0
        f[17] = seen ? seen.dir : 0
        f[18] = seen ? clamp01(seen.sev / 3) : 0
        f[19] = seen ? clamp01(seen.d / FOG_RANGE) : 0
        // what the co-driver already called that is still ahead: the nearest
        // linked card note (what the driver EARNS via the notes channel)
        let heard = null
        for (const n of gs.card) {
            if (n.atS == null) continue
            const d = distAhead(st, car.s, n.atS)
            if (d > 0 && d < 700 && (!heard || d < heard.d)) heard = { ...n, d }
        }
        f[20] = heard ? 1 : 0
        f[21] = heard ? heard.dir : 0
        f[22] = heard ? clamp01(heard.sev / 3) : 0
        f[23] = heard ? clamp01(heard.d / 700) : 0
    } else {
        f.fill(0, 16, 24)
    }
    // --- CO-DRIVER block: the pace book (the seat's own page of truth) -------
    if (seat === 1) {
        const ni = gs.co.nextIdx % st.corners.length
        const nc = st.corners[ni]
        const d = ((nc.s - car.s) % st.L + st.L) % st.L
        f[24] = nc.dir
        f[25] = clamp01(nc.sev / 3)
        f[26] = clamp01(d / 700)
        f[27] = gs.co.called[ni] ? 1 : 0
        f[28] = gs.co.lastCall ? gs.co.lastCall.dir : 0
        f[29] = gs.co.lastCall ? clamp01(gs.co.lastCall.sev / 3) : 0
        f[30] = gs.card.length ? clamp01((gs.tick - gs.card[gs.card.length - 1].t) / 120) : 1
    } else {
        f.fill(0, 24, 31)
    }
    // --- seat facts -------------------------------------------------------------
    f[31] = seat === 1 ? 1 : 0
    f[32] = gs.co.kind === 'off' ? 1 : 0
    f[33] = gs.co.kind === 'cpu' ? 1 : 0
    f[34] = gs.co.kind === 'human' ? 1 : 0
    // --- autoregressive: the last emitted pad ------------------------------------
    if (mem && mem.pa) {
        const pa = mem.pa
        f[35] = pa.left ? 1 : 0
        f[36] = pa.right ? 1 : 0
        f[37] = pa.up ? 1 : 0
        f[38] = pa.down ? 1 : 0
        f[39] = pa.a ? 1 : 0
        f[40] = pa.b ? 1 : 0
    } else { f.fill(0, 35, N_FEAT) }
    // clamp lat/align to signed 1 (deep rough / full lock read as pinned)
    f[1] = Math.max(-1, Math.min(1, f[1]))
    f[2] = Math.max(-1, Math.min(1, f[2]))
    return f
}
