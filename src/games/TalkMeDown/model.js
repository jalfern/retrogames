// TALK ME DOWN MODEL (#1712 S2) — the seat's own senses, the same doctrine as
// Gauntlet's model.js (#2299 lineage), FloorBoss's (#2805) and BombDefuse's
// (#1712): features are what a player AT THIS SEAT can NOTICE.
//
// This game splits INFORMATION, not effort (the reverse of Bomb Defuse, whose
// header says both seats read the same board): seat 0 (DEFUSER) owns the bomb
// and the verbs but no rulebook; seat 1 (MANUAL) owns the printed rules and the
// live-stamp rail (#1880) but no eyes on the bomb. The online law plates those
// views by role (#1880); the featurizer keeps that law for the dataset too
// (rally's driver/co-driver partition, #1712, is the precedent): a model that
// trains at a seat may only know what that seat sees, or it learns a world it
// will never sit in (the silent-teacher bug class). Honest zero: seat-0 rows
// carry NO rulebook facts; seat-1 rows carry NO panel facts.
//
// Two legitimate cross-currents, because the game itself carries them:
//  - the CPU manual (solo) PRINTS the order onto the defuser's LCD rail
//    (partnerSay, engine.js) — seat 0 on a solo take sees the answer text, so
//    the order rail rides seat 0's features (kind + color + digit, gated
//    `solo && gs.order`). A 2P crew's words live in voiceCmd/audio, not pads.
//  - the live-stamp rail rides the PAGE-holder (#1880): seat 1 sees WHICH
//    stamp is live (one-hot) but never the wires/dials it depends on — a page
//    cannot compute a target it has no eyes for. Seat 0 sees the stamp
//    physically printed on the module (its own block), which is the same fact
//    by a different route — the game's whole design is that route.
//
// The back plate gates the eye the way #1797 gates the verbs: batteries, tray
// and hand read zero while the bomb sits face-up; `held`/`pulls` always read
// (the hand and the drain are visible from the bench).
//
// `seat` is 0|1 — roles, not positions; everything rides gs. `mem.pa` is the
// seat's own pad last tick (the autoregressive lane); the ADAPTER banks it
// after the label, same discipline as Gauntlet/FloorBoss/BombDefuse.
//
// Hash-clean: pure reads of gs only — never rng, never writes.

import { WIRE_COLORS, RULEBOOK } from './engine.js'

export const STAMPS = [
    ...RULEBOOK.N.map((x) => x.id),
    ...RULEBOOK.D.map((x) => x.id),
    ...RULEBOOK.G.map((x) => x.id),
] // 17: N1..N6, D1..D6, G1..G5 — the whole printed rulebook

const WIRE_SLOTS = [0, 1, 2, 3, 4]

export const FEAT_NAMES = [
    // crew ledger — both seats know how the shift is going
    'roundFrac', 'bombsFrac', 'done', 'won', 'soloCrew', 'seatId',
    // ---- seat 0 panel block (seat 1 reads zero here) ----
    'strikesFrac', 'flipped', 'cursorModFrac', 'cursorSubFrac',
    ...STAMPS.map((s) => 'modStamp' + s), // the stamp printed on the cursor module
    ...WIRE_SLOTS.map((i) => 'modSolved' + i), // panel lamps, module slots 0..4
    ...WIRE_SLOTS.map((i) => 'modLocked' + i),
    ...WIRE_SLOTS.flatMap((w) => [...WIRE_COLORS.map((c) => `wire${w}_${c}`), `wire${w}_lit`, `wire${w}_cut`]),
    'dialFrac', 'seqProgFrac',
    'serialDigitFrac', 'ledsFrac',
    ...WIRE_COLORS.map((c) => 'bolt' + c), // the bolt color the plate screws match
    'batteriesFrac', 'tray0', 'tray1', 'tray2', 'sel0', 'sel1', 'sel2', // the back plate — flipped only
    'held', 'pullsAny', // the hand always shows
    'orderCut', 'orderDial', 'orderGlyph', 'orderPull', // the LCD order rail (solo): kind one-hot
    ...WIRE_COLORS.map((c) => 'orderColor' + c),
    'orderDigitFrac',
    // ---- seat 1 manual block (seat 0 reads zero here) ----
    ...STAMPS.map((s) => 'liveStamp' + s), // the rail rides the page-holder (#1880)
    'pageN', 'pageD', 'pageG', 'lineFrac',
    ...STAMPS.map((s) => 'flagStamp' + s), // the rule the manual clipped (READ N3)
    'flagTicksFrac',
    // autoregressive lane — the seat's own last pad
    'prevLeft', 'prevRight', 'prevUp', 'prevDown', 'prevA',
]
export const N_FEAT = FEAT_NAMES.length
export const N_ACT = 5 // left, right, up, down, A — the verb five (B is a shell rail-toggle)

// bases derived from the name list — layout and count can never drift apart
const I = {
    modStamp: FEAT_NAMES.indexOf('modStamp' + STAMPS[0]),
    modSolved: FEAT_NAMES.indexOf('modSolved0'),
    modLocked: FEAT_NAMES.indexOf('modLocked0'),
    wire: FEAT_NAMES.indexOf('wire0_RED'),
    dial: FEAT_NAMES.indexOf('dialFrac'),
    serial: FEAT_NAMES.indexOf('serialDigitFrac'),
    bolt: FEAT_NAMES.indexOf('boltRED'),
    batteries: FEAT_NAMES.indexOf('batteriesFrac'),
    sel: FEAT_NAMES.indexOf('sel0'),
    held: FEAT_NAMES.indexOf('held'),
    orderCut: FEAT_NAMES.indexOf('orderCut'),
    orderColor: FEAT_NAMES.indexOf('orderColorRED'),
    orderDigit: FEAT_NAMES.indexOf('orderDigitFrac'),
    liveStamp: FEAT_NAMES.indexOf('liveStamp' + STAMPS[0]),
    page: FEAT_NAMES.indexOf('pageN'),
    line: FEAT_NAMES.indexOf('lineFrac'),
    flagStamp: FEAT_NAMES.indexOf('flagStamp' + STAMPS[0]),
    flagTicks: FEAT_NAMES.indexOf('flagTicksFrac'),
    prev: FEAT_NAMES.indexOf('prevLeft'),
}

// honest-zero partition (datasetcheck pins both directions against these)
export const PANEL = { start: 6, end: I.liveStamp } // seat 1 rows: zero across this half-open range
export const MANUAL = { start: I.liveStamp, end: I.prev } // seat 0 rows: zero across this half-open range
// bases for the harness (datasetcheck) — single source for block geometry
export const BLOCK_INDEX = I

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const stampIdx = (s) => STAMPS.indexOf(s)

// featurize(gs, seat, mem) — see header.
export function featurize(gs, seat, mem) {
    const f = new Array(N_FEAT).fill(0)
    f[0] = clamp01(gs.round / 5)
    f[1] = clamp01(gs.bombsCleared / 5)
    f[2] = gs.done ? 1 : 0
    f[3] = gs.won ? 1 : 0
    f[4] = gs.players === 1 ? 1 : 0
    f[5] = seat === 1 ? 1 : 0

    if (seat === 1) {
        // THE MANUAL — ears, not eyes: rulebook position + the live-stamp rail.
        const live = gs.modules[gs.cursor.mod]
        const li = live ? stampIdx(live.stamp) : -1
        if (li >= 0) f[I.liveStamp + li] = 1
        f[I.page + gs.manual.page] = 1
        f[I.line] = clamp01(gs.manual.line / 5)
        const fi = gs.manual.flag ? stampIdx(gs.manual.flag) : -1
        if (fi >= 0) f[I.flagStamp + fi] = 1
        f[I.flagTicks] = clamp01(gs.manual.flagTicks / 180)
    } else {
        // THE DEFUSER — eyes, not ears: panel facts, back plate, order rail.
        f[6] = clamp01(gs.strikes / 3)
        f[7] = gs.flip ? 1 : 0
        f[8] = clamp01(gs.cursor.mod / 3)
        f[9] = clamp01(gs.cursor.sub / 5)
        const mods = gs.modules
        for (let i = 0; i < 5 && i < mods.length; i++) {
            if (mods[i].solved) f[I.modSolved + i] = 1
            if (mods[i].locked > 0) f[I.modLocked + i] = 1
        }
        const m = mods[gs.cursor.mod]
        if (m) {
            const si = stampIdx(m.stamp)
            if (si >= 0) f[I.modStamp + si] = 1
            if (m.type === 'N' && m.wires) {
                for (let w = 0; w < 5 && w < m.wires.length; w++) {
                    const wr = m.wires[w]
                    const base = I.wire + w * 8
                    f[base + wr.color] = 1
                    if (wr.lit) f[base + 6] = 1
                    if (wr.cut) f[base + 7] = 1
                }
            }
            f[I.dial] = m.type === 'D' ? clamp01((m.dial ?? 0) / 9) : 0
            const pressed = gs.seqInput[gs.cursor.mod] || []
            f[I.dial + 1] = m.type === 'G' ? clamp01(pressed.length / 3) : 0
        }
        f[I.serial] = clamp01(gs.features.serialDigit / 9)
        f[I.serial + 1] = clamp01(gs.features.leds / 8)
        f[I.bolt + gs.features.bolt] = 1
        // the back plate reads only while flipped — the face shows none of it
        if (gs.flip) {
            f[I.batteries] = clamp01(gs.features.batteries / 2)
            for (let i = 0; i < 3; i++) if (gs.tray[i]) f[I.batteries + 1 + i] = 1
            f[I.sel + gs.sel] = 1
        }
        f[I.held] = gs.held ? 1 : 0
        f[I.held + 1] = gs.pulls > 0 ? 1 : 0
        // the CPU manual's rail (solo): words become visible, that is the law
        if (gs.players === 1 && gs.order) {
            if (gs.order.startsWith('PULL')) f[I.orderCut + 3] = 1
            else if (gs.order.startsWith('CUT')) f[I.orderCut] = 1
            else if (gs.order.startsWith('DIAL')) f[I.orderCut + 1] = 1
            else f[I.orderCut + 2] = 1 // PRESS <glyphs>
            const cm = /CUT (\w+)/.exec(gs.order)
            if (cm) {
                const ci = WIRE_COLORS.indexOf(cm[1])
                if (ci >= 0) f[I.orderColor + ci] = 1
            }
            const dm = /DIAL (?:TO )?(\d)/.exec(gs.order)
            if (dm) f[I.orderDigit] = clamp01(Number(dm[1]) / 9)
        }
    }

    if (mem && mem.pa) {
        const pa = mem.pa
        f[I.prev] = pa.left ? 1 : 0
        f[I.prev + 1] = pa.right ? 1 : 0
        f[I.prev + 2] = pa.up ? 1 : 0
        f[I.prev + 3] = pa.down ? 1 : 0
        f[I.prev + 4] = pa.a ? 1 : 0
    }
    return f
}
