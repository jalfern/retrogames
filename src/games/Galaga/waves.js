// The wave scripts. Rows of kinds on a fixed slot grid — the entry
// choreography names and the dive roster all live here so the behavior
// tree stays a general mind and the waves stay a readable script.

export const COLS = 8
export const ROWS = 4

export const colX = (c) => 25 + c * 22
export const rowY = (r) => 56 + r * 30

// captives park in the bottom row, in this column order
export const CAPTIVE_COLS = [3, 4, 1, 6, 0, 7]

const row = (kind, r, c0, c1) => {
    const out = []
    for (let c = c0; c <= c1; c++) out.push({ kind, col: c, row: r })
    return out
}

// escorts: [{col, row, aboard}] fighters taken in earlier stages
export const WAVES = [
    {
        name: 'SWARM',
        rows: [...row('bee', 0, 2, 5), ...row('bee', 1, 1, 6), ...row('bee', 2, 0, 7)],
        time: 2400,
    },
    {
        name: 'BOSSES',
        rows: [
            { kind: 'flag', col: 3, row: 0 }, { kind: 'flag', col: 4, row: 0 },
            ...row('boss', 1, 2, 5), ...row('bee', 2, 1, 6),
        ],
        time: 2600,
    },
    {
        name: 'GUARD',
        rows: [
            { kind: 'flag', col: 2, row: 0 }, { kind: 'flag', col: 5, row: 0 },
            ...row('boss', 1, 1, 6), ...row('bee', 2, 0, 7),
        ],
        time: 2800,
    },
]

export const entryName = (e) => {
    if (e.kind === 'captive') return e.col % 2 ? 'entryBeeR' : 'entryBeeL'
    if (e.kind === 'flag') return 'entryFlag'
    if (e.kind === 'boss') return e.col % 2 ? 'entryBossR' : 'entryBossL'
    return e.col % 2 ? 'entryBeeR' : 'entryBeeL'
}

// stage roster: slots, entry order. Group order = row, then column.
export function buildStage(w, escorts = []) {
    const meta = WAVES[w]
    const list = meta.rows.map((e) => ({ ...e }))
    for (const [i, esc] of escorts.entries()) {
        const c = CAPTIVE_COLS[i % CAPTIVE_COLS.length]
        list.push({ kind: 'captive', col: c, row: ROWS - 1, aboard: !!esc.aboard })
    }
    const byRow = [...new Set(list.map((e) => e.row))].sort((a, b) => a - b)
    return list.map((e, i) => ({
        ...e,
        id: `${w}-${i}`,
        y: rowY(e.row),
        startTick: 6 + byRow.indexOf(e.row) * 45 + (i % 8) * 6,
        entry: entryName(e),
    }))
}
