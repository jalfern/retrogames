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

import { W, H, AIR, DIRT, STEEL, WATER } from './sim.js'

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
        // SLACK RULE (lemcheck): the winning script must leave one supply to
        // spare. Shipped originally with climb:4 = need exactly 4 — winnable
        // by the perfect solver, and Jon watched one climber die and a
        // "winnable" level become mathematically lost. A tutorial must be
        // losable-ly winnable: six climbers, four needed, two to burn.
        // #3864 one blocker, the original's answer at a pond edge: the spawn
        // lane bounces off the spire back toward the west water, and holding
        // the bounce short of the drown is a tool the player now has. The
        // block is one-shot like the original — climb over your own blocker
        // and the line opens (see sim wakeCheck). Unused supply still scores.
        // defaultSkill: the tutorial arm stays CLIMB even though BLOCKER now
        // outscores it in SKILLS order (see sim defaultSkill).
        defaultSkill: 'climb',
        skills: { block: 1, bomb: 0, climb: 6, dig: 0, float: 2, build: 12 },
        proves: ['climb'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(24)
            // the spire: sheer dirt face on the west (a climber's ladder and
            // nothing else — climb 0 supplies, and the walkers just pace),
            // a stepped descent on the east so survivors get down alive.
            // #3849: with maxFall at the original's 3 the stair must not end
            // 6 tiles above the ground floor — walked off, that last step was
            // a splat the old forgiving value hid. Stepped all the way down:
            // the original's descents are always stepped.
            for (let x = 18; x <= 22; x++) c.column(x, 6 + Math.abs(x - 19), 23, DIRT)
            for (let x = 23; x <= 38; x++) c.column(x, x - 15, 23, DIRT)
            // exit plinth
            c.rect(40, 23, 44, 23, DIRT)
            // #3828 the pond: the original's first level had one, and the
            // drown rule is its most famous hazard. At the spire's west foot
            // it converts the tutorial's old free-for-all — bounced, unclimbed
            // walkers pacing west forever — into a drain: dawdle and the
            // stragglers walk into the water instead of pacing for free.
            // The spawn→spire route (cols 4+ ground) never touches it.
            for (let x = 0; x <= 3; x++) c.rect(x, 23, x, 24, WATER)
            // #3859 the bay: the original's boards had ponds EVERYWHERE, and
            // a level with one pond still lets half the crowd pace dry land.
            // East of the exit plinth the ground is walk-over-then-drown dead
            // space — overshoot the door at col 42 without exiting (a bump,
            // a mis-click, a floater carried past) and the bay takes you.
            for (let x = 45; x <= 47; x++) c.rect(x, 23, x, 24, WATER)
            return c.g
        },
    },
    {
        name: 'THE MASSIF', time: 170,
        spawn: { x: 3.5, y: 23 }, exit: { x: 43, y: 22 },
        spawnCount: 10, spawnEvery: 55, need: 5,
        // #3859: the west-foot pond taxes the bounce lane, and holding the
        // crowd short of the rim is now real work — the solver spends a
        // blocker there in its winning script, so the level ships two
        // blockers (one to burn): slack rule, not decoration.
        skills: { block: 2, bomb: 1, climb: 0, dig: 3, float: 2, build: 12 },
        proves: ['dig'],
        build() {
            const c = new Carve()
            c.sky(); c.floor(24)
            // a massif wall-high to the sky: no way over, nothing to bomb but
            // dirt that takes 21 tiles — the route is a chest-high tunnel and
            // the swarm walks it single file behind one digger
            c.rect(14, 2, 32, 23, DIRT)
            // #3859 the west foot: the pace-ground west of the massif was
            // free — bounced walkers shuffle 13 tiles and back forever and
            // pay nothing. The original's ponds sit on the flat precisely to
            // tax that dawdle: water at the western wall puts a cost on the
            // bounce lane (the solver keeps the crowd earning the tunnel
            // instead of pacing — lemcheck proves its script still delivers
            // need with slack).
            for (let x = 0; x <= 2; x++) c.rect(x, 23, x, 24, WATER)
            c.rect(41, 23, 45, 23, DIRT)
            return c.g
        },
    },
    {
        name: 'THE DOOR', time: 170,
        spawn: { x: 24.5, y: 23, dir: -1 }, exit: { x: 3, y: 22 },
        spawnCount: 10, spawnEvery: 80, need: 6,
        skills: { block: 1, bomb: 2, climb: 0, dig: 0, float: 2, build: 12 },
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
            // #3859 the shore: the void's floor was silent dark — a bounced
            // lemming walked off the rim and splatted unseen below the map.
            // The original's pits answer with the drown: fill the void from
            // the walking row down with open water, so every eastward bounce
            // pays with the drown's splash, sink and tone at the lip. The
            // blocker line at col 30 stands on dry steel, unchanged.
            c.rect(31, 23, W - 1, 26, WATER)
            c.column(20, 0, 21, STEEL)
            c.set(20, 22, DIRT)
            return c.g
        },
    },
    {
        name: 'THE LEDGE', time: 150,
        spawn: { x: 20.5, y: 23, dir: 1 }, exit: { x: 3, y: 22 },
        spawnCount: 9, spawnEvery: 55, need: 5,
        skills: { block: 2, bomb: 2, climb: 0, dig: 0, float: 2, build: 12 },
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
            // #3859 the shore (same law as THE DOOR): the
            // shuffle off col 27 used to end in a splat below the map, felt
            // as a dull thud in the dark. Open water from the walking row
            // down turns every unblocked shuffle into the original's
            // signature drown — splash, sink, tone — and the blockers' job
            // at the rim becomes saving lemmings from the pond, exactly as
            // the original's ledge-with-water levels read.
            c.rect(27, 23, W - 1, 26, WATER)
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
