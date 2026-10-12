// LODE RUNNER-LITE — vault construction. Levels are ASCII the way the original
// maps read; every row is built by `row(fn)` so a width bug is impossible, and
// `scripts/lodecheck.mjs` proves each vault with the REAL autopilot (guards
// hunting live) before the game ships.
//
//   =  concrete (never diggable)      #  brick (diggable floor)
//   ~  rope (you hang ONE CELL UNDER it)  |  ladder
//   *  gold                          .  air
//   P  spawn   G  guard   E  exit    (their cells parse to air)
//
// Construction contracts (lodecheck fails the build on any violation):
//   1. Nothing supports a rope: the cell under every rope is air or a ladder
//      column — a guard must never be able to walk into a hanging runner.
//   2. Every rope line is reachable: a ladder's TOP cell sits in the hang
//      row directly under a rope, so you climb it and step sideways onto the
//      line (and climb back down through the line onto another ladder).
//   3. Spawn, exit, gold and guards all stand on something.
//   4. No cell is walled in on all four sides (nothing can be entombed).

import { W, H, EMPTY, BRICK, SOLID, ROPE, LADDER, GOLD } from './sim.js'

const CH = { '=': SOLID, '#': BRICK, '~': ROPE, '|': LADDER, '*': GOLD, '.': EMPTY }

const row = (fn) => '=' + Array.from({ length: W - 2 }, (_, i) => fn(i + 1)).join('') + '='
const wall = () => row(() => '=')
const air = () => row(() => '.')
const floor = () => row(() => '#')
const marks = (m) => row((x) => m[x] || '.')
const ropeRow = (x0, x1) => row((x) => x >= x0 && x <= x1 ? '~' : '.')
const cols = (xs, ch) => row((x) => (xs.includes(x) ? ch : '.'))

function parse(rows, name, extra) {
    const grid = new Uint8Array(W * H)
    const guards = []
    let spawn = null, exit = null
    rows.forEach((r, y) => {
        if (r.length !== W) throw new Error(`${name}: row ${y} is ${r.length} wide, want ${W}:\n${r}`)
        for (let x = 0; x < W; x++) {
            const c = r[x]
            if (c === 'P') { spawn = { x, y }; grid[y * W + x] = EMPTY }
            else if (c === 'E') { exit = { x, y }; grid[y * W + x] = EMPTY }
            else if (c === 'G') { guards.push({ x, y }); grid[y * W + x] = EMPTY }
            else if (CH[c] !== undefined) grid[y * W + x] = CH[c]
            else throw new Error(`${name}: '${c}' at (${x},${y}) is not a tile`)
        }
    })
    if (!spawn || !exit) throw new Error(`${name}: needs P and E`)
    let need = 0
    for (let i = 0; i < grid.length; i++) if (grid[i] === GOLD) need++
    return {
        name,
        need,
        timeTicks: extra.timeTicks,
        lives: extra.lives ?? 3,
        spawn, exit, guards,
        proves: extra.proves,
        build: () => grid,
    }
}

export const LEVELS = [
    // ------------------------------------------------------------- level 1 ----
    // Teach the rope. The ground floor is honest but slow — a guard patrols
    // it. The rope line hangs over the middle of the hall: a guard cannot
    // follow a hanger, and three nuggets dangle from the line. Down the east
    // ladder: two more nuggets and the gate. Proves swing + pursuit.
    {
        ...parse([
            wall(),
            air(),
            ropeRow(2, 19),
            marks({ 2: '|', 5: '*', 10: '*', 16: '*' }),
            ...Array.from({ length: 12 }, () => cols([2, 19], '|')),
            marks({ 1: 'P', 9: 'G', 21: '*', 23: '*', 25: 'E' }),
            floor(),
            wall(),
        ], 'FIRST ROPE', { timeTicks: 1400, proves: ['swing', 'pursued'] }),
    },
    // ------------------------------------------------------------- level 2 ----
    // Teach the hole. The top corridor carries the easy nuggets and its
    // ENTIRE floor is brick; the gate lives BELOW and the only door is a hole
    // you dig with your own feet. Under the lower corridor's brick there is
    // SOLID rock with three shafts punched through it: a guard who walks over
    // a collapsing trap at x=4/16/27 falls off the bottom of the vault and is
    // gone for good; anywhere else he lands in a one-cell niche he can never
    // climb out of (no ladder, no step-up — the niche IS the grave). The same
    // holes kill you if you forget them: jump the gaps or lose a life.
    // NOTE on `proves`: it lists what the AUTOPILOT's witness actually shows.
    // Riding a collapsing trap ('drop') cannot be pinned there — the jump arc
    // drifts sideways while it falls, so no arrangement of openings forces
    // the solver to stand still on its own trap. 'drop' and the shaft burials
    // are pinned by scripted scenarios in lodecheck instead.
    {
        ...parse([
            wall(),
            air(),
            air(),
            marks({ 2: 'P', 7: '*', 13: '*' }),
            floor(),
            marks({ 5: 'G', 18: '*', 23: '*', 28: 'E' }),
            floor(),
            row((x) => x === 4 || x === 16 || x === 27 ? '.' : '='),
            ...Array.from({ length: 10 }, () => row((x) => x === 4 || x === 16 || x === 27 ? '.' : '=')),
            row((x) => x === 4 || x === 16 || x === 27 ? '.' : '='),
        ], 'THE DIGGER', { timeTicks: 1600, proves: ['dig', 'trap', 'pursued'] }),
    },
    // ------------------------------------------------------------- level 3 ----
    // The vault: three tiers. One BIG LADDER (col 3, floor to top) is the
    // only way to the top rope of three nuggets — the middle rope cannot be
    // climbed through (a jump rises exactly one cell and catches ropes only
    // at the top of its rise, so climbing THROUGH a line is a myth this
    // physics engine does not grant; the first cut of this vault made its
    // top gold unreachable and the solver proved it by timing out). A middle
    // rope of three more nuggets is reached from the x=14 ladder; a
    // bottomless shaft (x=16) cuts the lower ledge in half, and a guard
    // lured over a collapsing trap there is gone for good.
    {
        ...parse([
            wall(),
            ropeRow(2, 19),
            marks({ 3: '|', 7: '*', 11: '*', 16: '*' }),
            cols([3], '|'),
            cols([3], '|'),
            row((x) => x === 3 ? '|' : x >= 10 && x <= 22 ? '~' : '.'),
            marks({ 3: '|', 14: '|', 12: '*', 16: '*', 19: '*' }),
            cols([3, 14], '|'),
            cols([3, 14], '|'),
            cols([3, 14], '|'),
            marks({ 3: '|', 6: '|', 14: '|', 23: '|' }),
            row((x) => (x >= 3 && x <= 15 ? (x === 3 || x === 6 ? '|' : '#') : x === 16 ? '.' : x >= 17 && x <= 28 ? (x === 23 ? '|' : '#') : '.')),
            marks({ 3: '|', 6: '|', 16: '.', 23: '|' }),
            marks({ 3: '|', 6: '|', 16: '.', 23: '|' }),
            marks({ 3: '|', 6: '|', 16: '.', 23: '|' }),
            marks({ 2: 'P', 3: '|', 6: '|', 13: 'G', 16: '.', 23: '|', 26: 'G', 29: 'E' }),
            row((x) => x === 16 ? '.' : '#'),
            row((x) => x === 16 ? '.' : '='),
        ], 'THE VAULT', { timeTicks: 2200, proves: ['swing', 'pursued'] }),
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    return { meta: lv, grid: lv.build() }
}
