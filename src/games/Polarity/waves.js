// THE STAGE SCRIPTS — three stages of POLARITY. Everything hostile is
// LIGHT ('L') or DARK ('D'), and every stage ships BOTH colors in both
// roles (gunners AND divers), because "kill the opposite color" is only a
// rule that forces the flip if the fleet is mixed — polarcheck pins that.
//
// The wall rows and storm columns are SCRIPTED (fixed tick/x, no player
// aim, no randomness), which is what lets the fairness scan replay them
// exactly and lets the harness state a numeric contract:
//   - no two opposite-colour wall volleys inside flipGap ticks
//   - every stage scripts a storm within |x - spawn| <= 12  (a pilot that
//     never moves must meet it — movement is load-bearing, not decoration)
//   - a gap is reachable on foot before its wall arrives (>= 12 ticks of
//     lead at full sprint)

export const COLS = 8
export const colX = (c) => 28 + c * 24            // 28..196, centre 112
export const rowY = (r) => 96 + r * 26             // darter rows
export const WEAVER_Y = 54
export const CORE = { x: 112, y: 64 }

// fixed spawn column of every stage — storms aim at it
export const SPAWN_X = 112

const dart = (c, r, color) => ({ kind: 'dart', col: c, row: r, color })
const wea = (c, color) => ({ kind: 'weaver', col: c, row: 0, color })

export const WAVES = [
    {
        name: 'CALM WATERS',
        time: 2100,
        shell: false,
        rows: [
            dart(2, 0, 'L'), dart(4, 0, 'D'), dart(6, 0, 'L'),
            dart(1, 1, 'D'), dart(3, 1, 'L'), dart(5, 1, 'D'), dart(7, 1, 'L'),
            dart(0, 2, 'L'), dart(2, 2, 'D'), dart(4, 2, 'L'), dart(6, 2, 'D'),
        ],
        walls: [
            { t: 560, color: 'D', gap: 184 }, { t: 584, color: 'D', gap: 184 },
            { t: 1130, color: 'L', gap: 40 }, { t: 1154, color: 'L', gap: 40 },
            { t: 1700, color: 'D', gap: 112 }, { t: 1724, color: 'D', gap: 112 },
        ],
        storms: [
            { t: 430, x: 112 }, { t: 700, x: 60 }, { t: 980, x: 164 },
            { t: 1300, x: 112 }, { t: 1650, x: 88 }, { t: 1900, x: 140 },
        ],
    },
    {
        name: 'STORMFRONT',
        time: 2600,
        shell: false,
        rows: [
            wea(1, 'L'), wea(4, 'D'), wea(7, 'L'),
            dart(2, 0, 'D'), dart(5, 0, 'L'),
            dart(1, 1, 'L'), dart(3, 1, 'D'), dart(6, 1, 'D'), dart(4, 2, 'L'),
        ],
        walls: [
            { t: 600, color: 'D', gap: 60 }, { t: 624, color: 'D', gap: 60 },
            { t: 1120, color: 'L', gap: 160 }, { t: 1144, color: 'L', gap: 160 },
            { t: 1640, color: 'D', gap: 112 }, { t: 1664, color: 'D', gap: 112 },
            { t: 2160, color: 'L', gap: 60 }, { t: 2184, color: 'L', gap: 60 },
        ],
        storms: [
            { t: 480, x: 112 }, { t: 900, x: 52 }, { t: 1350, x: 112 },
            { t: 1800, x: 172 }, { t: 2250, x: 112 },
        ],
    },
    {
        name: 'REACTOR',
        time: 3200,
        shell: true,
        rows: [
            { kind: 'core', col: 0, row: 0, color: 'L' },
            wea(2, 'D'), wea(6, 'L'),
            dart(1, 1, 'L'), dart(3, 1, 'D'), dart(5, 1, 'L'), dart(7, 1, 'D'),
        ],
        walls: [
            { t: 600, color: 'D', gap: 40 }, { t: 624, color: 'D', gap: 40 },
            { t: 1150, color: 'L', gap: 184 }, { t: 1174, color: 'L', gap: 184 },
            { t: 1700, color: 'D', gap: 40 }, { t: 1724, color: 'D', gap: 40 },
            { t: 2250, color: 'L', gap: 184 }, { t: 2274, color: 'L', gap: 184 },
            { t: 2800, color: 'D', gap: 40 }, { t: 2824, color: 'D', gap: 40 },
        ],
        storms: [
            { t: 420, x: 112 }, { t: 900, x: 140 }, { t: 1350, x: 60 },
            { t: 1800, x: 112 }, { t: 2350, x: 160 }, { t: 2820, x: 92 },
        ],
    },
]

export const entryName = (e) => {
    if (e.kind === 'weaver') return e.col % 2 ? 'entryWeaverR' : 'entryWeaverL'
    return e.col % 2 ? 'entryDartR' : 'entryDartL'
}

// stage roster: slots + entry order. The core has no entry path — it is
// bolted to the reactor from tick zero.
export function buildStage(w) {
    const meta = WAVES[w]
    const list = meta.rows.map((e) => ({ ...e }))
    const byRow = [...new Set(list.map((e) => e.row))].sort((a, b) => a - b)
    return list.filter((e) => e.kind !== 'core').map((e, i) => ({
        ...e,
        id: `${w}-${i}`,
        y: e.kind === 'weaver' ? WEAVER_Y : rowY(e.row),
        startTick: 8 + byRow.indexOf(e.row) * 40 + (i % 8) * 7,
        entry: entryName(e),
    }))
}
