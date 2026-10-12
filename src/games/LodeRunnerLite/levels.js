// LODE RUNNER-LITE — vault construction, 1983 rules. Levels are ASCII the way
// the original maps read; every row is built by `row(fn)` so a width bug is
// impossible, and `scripts/lodecheck.mjs` proves each vault winnable by the
// REAL no-jump, no-dig autopilot (guards hunting live) before a browser ships.
//
//   =  concrete (never diggable)      #  brick (diggable floor)
//   ~  rope (you hang ONE CELL under it)  |  ladder
//   *  gold                    .  air
//   P  spawn   G  guard        (their cells parse to air)
//
// The EXIT is the hidden ladder in column EXIT_X: a run of `|` from the exit
// cell (the top rung, `extra.exit`) down toward the floor. `sim.js` conceals
// it until every gold is in the runner's hands, and the vault clears when the
// runner climbs off its top. There is no clock and no fixed gate cell.
//
// Construction contracts (lodecheck fails the build on any violation):
//   1. Nothing supports a rope: the cell under every rope is air, a ladder or
//      a hanging gold — a guard must never be able to walk into a hanger.
//   2. Every rope line is reachable: a ladder's TOP cell sits in the hang row
//      directly under a rope, so you climb it and dangle onto the line.
//   3. Spawn, gold and guards all stand on something; the exit cell sits at
//      the top of its ladder run.
//   4. No cell is walled in on all four sides (nothing can be entombed).

import { W, H, EMPTY, BRICK, SOLID, ROPE, LADDER, GOLD } from './sim.js'

const CH = { '=': SOLID, '#': BRICK, '~': ROPE, '|': LADDER, '*': GOLD, '.': EMPTY }
const EXIT_X = 2

const row = (fn) => '=' + Array.from({ length: W - 2 }, (_, i) => fn(i + 1)).join('') + '='
const wall = () => row(() => '=')
const air = () => row(() => '.')
const floor = () => row(() => '#')
const marks = (m) => row((x) => m[x] || '.')
// a row that also carries the hidden exit ladder in column EXIT_X
const ex = (fn) => row((x) => (x === EXIT_X ? '|' : fn(x)))
const ladderCol = (cols, fn) => row((x) => (x === EXIT_X || cols.includes(x) ? '|' : fn(x)))

function parse(rows, name, extra) {
    const grid = new Uint8Array(W * H)
    const guards = []
    let spawn = null
    rows.forEach((r, y) => {
        if (r.length !== W) throw new Error(`${name}: row ${y} is ${r.length} wide, want ${W}:\n${r}`)
        for (let x = 0; x < W; x++) {
            const c = r[x]
            if (c === 'P') { spawn = { x, y }; grid[y * W + x] = EMPTY }
            else if (c === 'G') { guards.push({ x, y }); grid[y * W + x] = EMPTY }
            else if (CH[c] !== undefined) grid[y * W + x] = CH[c]
            else throw new Error(`${name}: '${c}' at (${x},${y}) is not a tile`)
        }
    })
    if (!spawn || !extra.exit) throw new Error(`${name}: needs P and an exit`)
    let need = 0
    for (let i = 0; i < grid.length; i++) if (grid[i] === GOLD) need++
    return {
        name,
        need,
        lives: extra.lives ?? 3,
        spawn,
        exit: { ...extra.exit },
        guards,
        proves: extra.proves,
        build: () => grid,
    }
}

// 19 rows: wall, air, 14 vault rows (2-15), floor level, brick, wall.
// `top` must be exactly 14 rows and already carry the exit ladder in col 2.
const vault = (top, floorMarks) => [
    wall(),
    air(),
    ...top,
    marks(floorMarks),
    floor(),
    wall(),
]

// n plain rows, exit ladder only
const plain = (n) => Array.from({ length: n }, () => ex(() => '.'))

export const LEVELS = [
    // --------------------------------------------------------- level 1 ----
    // FIRST LADDER — run, climb, and the hidden exit. Two nuggets on the
    // floor, a guard pacing the far end, and the exit ladder by the spawn.
    // Collect the gold, come back to the ladder, climb off the top.
    parse(vault(plain(14), { 1: 'P', 8: '*', 14: '*', 26: 'G' }), 'FIRST LADDER',
        { exit: { x: EXIT_X, y: 2 }, lives: 3, proves: ['pursued'] }),

    // --------------------------------------------------------- level 2 ----
    // THE ROPE — three nuggets dangle from a line over the middle hall. The
    // col-8 ladder climbs to the hang row: dangle, swing, and take them, plus
    // one on the floor. A guard paces the floor below the line.
    parse(vault(
        [
            ex(() => '.'),                                                    // 2
            ex(() => '.'),                                                    // 3
            ex(() => '.'),                                                    // 4
            ex((x) => (x >= 6 && x <= 18 ? '~' : '.')),                       // 5: the line
            ex((x) => (x === 8 ? '|' : (x === 10 || x === 13 || x === 16 ? '*' : '.'))),  // 6: ladder top + gold
            ...Array.from({ length: 9 }, () => ladderCol([8], () => '.')),    // 7-15: col-8 ladder
        ],
        { 1: 'P', 4: '*', 29: 'G' },
    ), 'THE ROPE',
        { exit: { x: EXIT_X, y: 2 }, lives: 3, proves: ['swing', 'pursued'] }),

    // --------------------------------------------------------- level 3 ----
    // THE VAULT — a long line over the middle, gold on each floor tier, and a
    // guard that must be crossed on the way to the exit ladder. Take every
    // gold, then the exit ladder is the only way off the top of the screen.
    parse(vault(
        [
            ex(() => '.'),                                                    // 2
            ex(() => '.'),                                                    // 3
            ex((x) => (x >= 5 && x <= 20 ? '~' : '.')),                       // 4: the line
            ex((x) => (x === 5 ? '|' : (x === 8 || x === 12 || x === 16 ? '*' : '.'))),  // 5: ladder top + gold
            ...Array.from({ length: 11 }, () => ladderCol([5], () => '.')),   // 6-15: col-5 ladder
        ],
        { 1: 'P', 4: '*', 24: '*', 15: 'G' },
    ), 'THE VAULT',
        { exit: { x: EXIT_X, y: 2 }, lives: 3, proves: ['swing', 'pursued'] }),
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    return { meta: lv, grid: lv.build() }
}
