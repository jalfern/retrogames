// BOMB DEFUSE MODEL (#1712 S2) — the seat's own senses, the same doctrine as
// Gauntlet's model.js (#2299 lineage) and FloorBoss's (#2805): features are
// what a player AT THIS SEAT can NOTICE on the shared panel. Bomb Defuse
// splits EFFORT, not information (engine header): both seats see the fuse, the
// gauge, the cutter lamps and the window bar — so both read the same board,
// plus their own seat facts (which role THIS step asks of them).
//
// One definition: the S2 dataset featurizes with THIS file (scripts/
// plaicraft-dataset.mjs ADAPTERS['bomb-defuse']), a trainer eats these rows,
// and a seat agent that drops in later runs the same senses — a model can
// never train on one world and play on another (the silent-teacher bug class).
//
// `seat` is 0|1 — the seats here are roles, not positions, so no entity
// argument is needed; everything else rides gs. `mem.pa` is the seat's own pad
// last tick (the autoregressive lane), same discipline as Gauntlet/FloorBoss.
//
// Hash-clean: pure reads of gs only — never gs.write, never rng. When the run
// is OVER (done), the live-step reads (kind, window, cutter, gauge) go quiet
// at 0 — gs.bomb may have walked past the last bomb on a win, and the closing
// row must not index it (the end state still reads: fuse, strikes, done bits).

import {
    BOMBS, COLORS, SYNC, CUT, VENT,
    curStep, curWindow, needleOf, ZONE_HALF, seatAsk,
} from './engine.js'

export const FEAT_NAMES = [
    'bombFrac', 'stepFrac', 'fuseFrac', 'strikesFrac',
    'kindSync', 'kindCut', 'kindVent', 'intro', 'stepWFrac', 'winTimer',
    'myKey', 'partnerKey', 'myArmed', 'partnerArmed', 'myAsk', 'partnerAsk',
    'targetRed', 'targetBlue', 'targetGreen', 'targetYellow', 'cutterDist', 'cutterDir',
    'needle', 'zone', 'inZone', 'held', 'holderIsMe', 'soloCrew', 'seatId',
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA', 'prevB',
]
export const N_FEAT = FEAT_NAMES.length // 35
export const N_ACT = 6 // left, right, up, down, A, B — the dpad six

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// featurize(gs, seat, mem) — see header. The caller banks mem.pa with the
// seat's decoded pad after the label, so intent continues across ticks.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT)
    const other = 1 - seat
    const over = !!gs.done
    // the case ledger — the numbers both seats read off the plate
    f[0] = clamp01(Math.min(gs.bomb, BOMBS) / BOMBS)
    f[1] = over ? 1 : clamp01(gs.step / gs.bombs[Math.min(gs.bomb, BOMBS - 1)].steps.length)
    f[2] = over ? (gs.won ? 1 : 0) : clamp01(gs.fuse / gs.bombs[Math.min(gs.bomb, BOMBS - 1)].fuse0)
    f[3] = clamp01(gs.strikes / 3)
    // the live step: kind one-hot, read-grace, window progress
    const st = over ? null : curStep(gs)
    f[4] = st && st.kind === SYNC ? 1 : 0
    f[5] = st && st.kind === CUT ? 1 : 0
    f[6] = st && st.kind === VENT ? 1 : 0
    f[7] = !over && gs.intro > 0 ? 1 : 0
    f[8] = over ? 0 : clamp01(gs.stepT / curWindow(gs))
    f[9] = over ? 0
        : st.kind === SYNC ? clamp01(gs.keyT / curWindow(gs))
            : st.kind === CUT ? clamp01(gs.armedT / curWindow(gs))
                : 0
    // the seat lamps on the plate (both seats' latches are visible to both)
    f[10] = gs.keys[seat] ? 1 : 0
    f[11] = gs.keys[other] ? 1 : 0
    f[12] = gs.armed[seat] ? 1 : 0
    f[13] = gs.armed[other] ? 1 : 0
    // whose debt is outstanding — THE law of this game (engine.seatAsk),
    // already the HUD's own chip logic; the model reads the same ask the crew reads
    const ask = seatAsk(gs)
    f[14] = ask && ask.ask[seat] ? 1 : 0
    f[15] = ask && ask.ask[other] ? 1 : 0
    // the CUT plate: target one-hot + the shortest walk from this seat's blade
    const d = st && st.kind === CUT ? (st.color - gs.sel[seat] + COLORS.length) % COLORS.length : 0
    for (let c = 0; c < COLORS.length; c++) f[16 + c] = st && st.kind === CUT && st.color === c ? 1 : 0
    f[20] = st && st.kind === CUT ? d / (COLORS.length - 1) : 0
    f[21] = st && st.kind === CUT ? (d === 0 ? 0 : d <= 2 ? 1 : -1) : 0 // +1 up-cycles, −1 down-cycles
    // the VENT gauge — the needle rides the same integer sine the sim hashes
    f[22] = over ? 0 : needleOf(gs) / 1000
    f[23] = gs.zone / 700
    f[24] = st && st.kind === VENT && Math.abs(needleOf(gs) - gs.zone) <= ZONE_HALF[gs.bomb] ? 1 : 0
    f[25] = gs.held ? 1 : 0
    f[26] = st && st.kind === VENT && st.holder === seat ? 1 : 0
    // crew facts: solo (CPU partner) vs two humans changes what the partner lamp MEANS
    f[27] = gs.players === 1 ? 1 : 0
    f[28] = seat === 1 ? 1 : 0
    // autoregressive: the last emitted pad
    if (mem && mem.pa) {
        const pa = mem.pa
        f[29] = pa.left ? 1 : 0
        f[30] = pa.right ? 1 : 0
        f[31] = pa.up ? 1 : 0
        f[32] = pa.down ? 1 : 0
        f[33] = pa.a ? 1 : 0
        f[34] = pa.b ? 1 : 0
    } else { f.fill(0, 29, N_FEAT) }
    return f
}
