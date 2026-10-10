// LEMMINGS-LITE — level construction. Levels are CARVED out of solid rock in
// code (the IronKeep lesson), not typed as ASCII and hoped leak-free: every
// builder starts from solid dirt and steel and opens the world with named
// ops. `scripts/lemcheck.mjs` proves each level with the real solver, and
// proves each skill is LOAD-BEARING: solve the level with that skill's supply
// set to zero, and the solver must lose. A puzzle whose skill you can take
// away is not a puzzle, it is a walk.
//
// Coordinates: cell (col, row), row 0 at top. A lemming standing on a surface
// has feet y = the surface row; its chest is the cell above (see sim.js).

import { W, H, AIR, DIRT, STEEL } from './sim.js'

class Carve {
    constructor(fill = DIRT) { this.g = new Uint8Array(W * H).fill(fill) }
    set(x, y, t) { if (x >= 0 && x < W && y >= 0 && y < H) this.g[y * W + x] = t; return this }
    rect(x0, y0, x1, y1, t) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t)
        return this
    }
    // open sky above a floor line y=f(x): rows above become AIR
    sky(f = () => 23) {
        for (let x = 0; x < W; x++) for (let y = 0; y < f(x); y++) this.set(x, y, AIR)
        return this
    }
    column(x, y0, y1, t) { return this.rect(x, y0, x, y1, t) }
    floor(row = 23, t = STEEL) { return this.rect(0, row, W - 1, H - 1, t) }
}

export const LEVELS = [
    {
        name: 'THE SPIRE', time: 120,
        spawn: { x: 4.5, y: 23 }, exit: { x: 42, y: 22 },
        spawnCount: 9, spawnEvery: 44, need: 4,
        skills: { block: 0, bomb: 0, climb: 4, dig: 0 },
        proves: ['climb'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(24)
            // the spire: sheer dirt face on the west (a climber's ladder and
            // nothing else — climb 0 supplies, and the walkers just pace),
            // a stepped descent on the east so survivors get down alive
            for (let x = 18; x <= 22; x++) c.column(x, 6 + Math.abs(x - 19), 23, DIRT)
            for (let x = 23; x <= 33; x++) c.column(x, x - 15, 23, DIRT)
            // exit plinth
            c.rect(40, 23, 44, 23, DIRT)
            return c.g
        },
    },
    {
        name: 'THE MASSIF', time: 170,
        spawn: { x: 3.5, y: 23 }, exit: { x: 43, y: 22 },
        spawnCount: 10, spawnEvery: 55, need: 5,
        skills: { block: 1, bomb: 1, climb: 0, dig: 3 },
        proves: ['dig'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(24)
            // a massif wall-high to the sky: no way over, nothing to bomb but
            // dirt that takes 21 tiles — the route is a chest-high tunnel and
            // the swarm walks it single file behind one digger
            c.rect(14, 2, 32, 23, DIRT)
            c.rect(41, 23, 45, 23, DIRT)
            return c.g
        },
    },
    {
        name: 'THE DOOR', time: 170,
        spawn: { x: 24.5, y: 23, dir: -1 }, exit: { x: 3, y: 22 },
        spawnCount: 10, spawnEvery: 80, need: 6,
        skills: { block: 1, bomb: 2, climb: 0, dig: 0 },
        proves: ['bomb'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(25)
            // a corridor on the edge of a void: spawn walks WEST to a steel
            // door plugged with one dirt brick (only a bomb opens it), and
            // every bounce off that door until it opens tosses a lemming
            // EAST toward the void at col 31 — a blocker at the rim is the
            // only thing standing between the crowd and a very tall drop.
            c.rect(31, 0, W - 1, H - 1, AIR)
            c.column(20, 0, 21, STEEL)
            c.set(20, 22, DIRT)
            return c.g
        },
    },
    {
        name: 'THE LEDGE', time: 150,
        spawn: { x: 20.5, y: 23, dir: 1 }, exit: { x: 3, y: 22 },
        spawnCount: 9, spawnEvery: 55, need: 5,
        skills: { block: 2, bomb: 2, climb: 0, dig: 0 },
        proves: ['block', 'bomb'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(25)
            // the crowd shuffles EAST straight toward the void at col 27,
            // and its only way out — the plugged steel door at col 8 — is
            // behind them. The first command cannot be the bomb: it has to
            // be the blocker who stops the first walker from walking off
            // the edge. Take the blocker away and the ledge just drains
            // lemmings into the dark one shuffle at a time.
            c.rect(27, 0, W - 1, H - 1, AIR)
            c.column(8, 0, 21, STEEL)
            c.set(8, 22, DIRT)
            return c.g
        },
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    const { build: _build, ...meta } = lv            // functions must not ride in cloneable state
    return { meta, grid: lv.build() }
}
