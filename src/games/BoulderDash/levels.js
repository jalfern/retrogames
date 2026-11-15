// BOULDER DASH — cave construction. Caves are CARVED out of solid rock in code
// (the IronKeep / Lemmings lesson): every builder starts from a mountain of
// dirt with a steel shell, then opens chambers and sets gems, boulders and a
// firefly with named ops. `scripts/dashcheck.mjs` proves each cave with the real
// planner — it actually digs the route to the quota and the exit, with every
// hazard live — and asserts each level's `proves` token was really observed:
//
//   dig      the planned route chewed dirt to get anywhere (level 1)
//   fell     a boulder dropped under its own gravity this run (level 2)
//   roll     a falling rock levelled out off a ledge (level 2)
//   convert  a gem fell and gave up, turning to dirt (level 3)
//   fly,burn a firefly ignited and a chain spread — and steel contained it (4)
//   push     the digger shoved a push wall sideways one cell (level 5, #2411)
//   crush    a shoved wall destroyed the rock in its path (level 5)
//   amoeba   the slime wave grew into open space (level 5)
//   dissolve the wave took a diamond down with it (level 5)
//
// Two construction rules keep an unattended CI gate honest:
//   1. the HARVEST gems (the quota) always sit on solid dirt with plain dirt
//      above, so the player's own digging can never dislodge a gem onto their
//      head or turn the paydirt to rubble. Reaching them is a lateral dig.
//   2. the DEMO hazards (the fell / roll / convert / burn the level `proves`)
//      live in isolated pockets that drain on their own at tick 0, away from
//      both the harvest and the route. So a mechanic is proven LIVE without the
//      win ever riding on dodging it — and a `--mutate` that silences the rule
//      silences the token, turning the gate red. Fire, in particular, is boxed
//      behind steel: the wall is the lesson, the chain never crosses it.

import { W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, AMO_HEAD, PUSHWALL } from './sim.js'

class Carve {
    constructor() { this.g = new Uint8Array(W * H).fill(DIRT) }
    set(x, y, t) { if (x >= 0 && x < W && y >= 0 && y < H) this.g[y * W + x] = t; return this }
    rect(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t); return this }
    row(y, x0, x1, t) { return this.rect(x0, y, x1, y, t) }
    col(x, y0, y1, t) { return this.rect(x, y0, x, y1, t) }
    shell() {
        this.row(0, 0, W - 1, STEEL); this.row(H - 1, 0, W - 1, STEEL)
        this.col(0, 0, H - 1, STEEL); this.col(W - 1, 0, H - 1, STEEL)
        return this
    }
    // a supported seam: every gem rests on dirt with dirt overhead — stable.
    seam(y, x0, x1) { for (let x = x0; x <= x1; x++) this.set(x, y, DIAMOND); return this }
    gems(spec) { for (const [x, y] of spec) this.set(x, y, DIAMOND); return this }
}

export const LEVELS = [
    {
        // Teach the cut: dig, gather the quota, find the way out. No hazards.
        name: 'FIRST CUT', timeTicks: 1600, need: 5,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 3 },
        proves: ['dig'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start chamber
            c.rect(34, 2, 37, 5, EMPTY)                 // exit chamber
            c.seam(18, 8, 13)                           // supported harvest seam
            return c.g
        },
    },
    {
        // Gravity is real and unattended: a stacked pair of boulders drains into
        // an open pocket the moment the cave wakes, lands and levels off over the
        // ledge. The harvest seam sits low and stable, far from that drama.
        name: 'THE CHUTE', timeTicks: 1800, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 37, y: 2 },
        proves: ['fell', 'roll'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)
            c.rect(34, 1, 38, 3, EMPTY)
            // the demo: two boulders stacked above an open pocket — the lower
            // lands, the upper is blocked by it and rolls to level out. The
            // shaft above the pocket is open so they actually drain at tick 0.
            c.rect(15, 6, 19, 9, EMPTY)
            c.col(14, 4, 9, STEEL)
            c.set(17, 5, EMPTY)
            c.set(17, 3, BOULDER); c.set(17, 4, BOULDER)
            c.seam(18, 8, 14)                           // stable harvest
            return c.g
        },
    },
    {
        // The cost of greed: a gem lip over an open cavity gives up and turns to
        // dirt the instant the cave wakes — a demonstration you cannot buy back.
        // The real harvest is a supported seam along the floor, long before you
        // would ever think to cut up under the pretty diamonds in the roof.
        name: 'RICH SEAM', timeTicks: 1800, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 37, y: 18 },
        proves: ['convert'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)
            c.rect(34, 16, 38, 20, EMPTY)
            // the demo: three gems on the lip of an empty cavity -> they fall and
            // convert (gemlost) on the cavity floor at the very start
            c.rect(16, 8, 20, 10, EMPTY)
            c.gems([[17, 7], [18, 7], [19, 7]])
            c.seam(18, 8, 13)                           // stable harvest
            return c.g
        },
    },
    {
        // Respect the walls. A param crucium — the firefly automaton — burns in a
        // steel-lined dirt cell, turning everything it touches into a spreading
        // chain. Steel is the one surface the chain respects: the harvest lies on
        // the safe side of that glowing partition, and the exit beyond it. Since
        // #2364 the pit also has a door: a two-cell DUST SEAM in the east wall
        // catches fire the moment the fly first bores through it (the ring still
        // contains the chain — steel is the surface fire respects), and beyond
        // lies a steel-lined flight corridor across the cavern roof with a steel
        // dead end at col 29. The fly only ever turns against steel, so its
        // patrol shuttles pit<->corridor forever and can never dive into dust:
        // the harvest at row 18 provably stays cool. The gap in the tube floor at
        // col 22 is the invitation — climb into the corridor and it becomes a
        // game of chicken with the fire line.
        name: 'FLY PIT', timeTicks: 2200, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 3 },
        flies: [{ x: 11, y: 8, dir: 1 }],
        // #2374 readability: the two seam cells are still plain DIRT in the CA
        // (behaviour unchanged), but the painter tints cells listed here so the
        // dust door reads differently from ordinary rock BEFORE it ignites.
        // dashcheck pins that this list stays exactly the bored seam.
        dust: [[15, 8], [16, 8]],
        proves: ['fly', 'burn'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 2, 37, 5, EMPTY)                 // exit, top-right
            // sealed firefly cell: a solid steel block, then a dirt core carved
            // back inside it — the fly burns the core, the ring holds the fire in
            c.rect(9, 2, 16, 10, STEEL)
            c.rect(11, 4, 14, 8, DIRT)
            // the escape seam (#2364): dust through the east wall, opening onto
            // a roof corridor lined top and bottom with steel and dead-ended at
            // col 29. Fire never crosses steel, so the chain stays in pit+seam;
            // the fly turns only when blocked, so the patrol stays in air.
            c.set(15, 8, DIRT); c.set(16, 8, DIRT)
            c.rect(17, 7, 29, 7, STEEL)                 // corridor ceiling
            c.rect(17, 9, 29, 9, STEEL)                 // corridor floor
            c.set(29, 8, STEEL)                        // dead end — the turn-around
            c.set(22, 9, EMPTY)                        // the gap — the climb-in point
            // the harvest: a supported seam along the START row, east of the
            // steel cell — the player tunnels along it laterally and never digs
            // beneath a gem, so nothing of the paydirt ever drains away.
            c.seam(18, 20, 26)
            return c.g
        },
    },
    {
        // The later variants come home (#2411). A full-height steel divide cuts
        // the cavern — the ONLY way east is a tube carved through it, and the
        // tube is bolted by a push wall. Shove the bolt east and it slides over
        // the pit in the floor and drops out of the way: push + gravity, the
        // classic vault crack. Deeper east, a second wall slams a boulder out
        // of the corridor (crush — the rock is gone, the wall follows it into
        // the next pit, and the tube opens again). Both walls and their pits
        // are load-bearing: dashcheck's `push`/`crush` mutants strand the
        // planner in this cave, and the every-cave-winnable gate goes red.
        // Below the tube, a slime pocket (Boulder Dash II's amoeba) crawls
        // east across its chamber and DISSOLVES the bait vein at its far wall
        // in front of anyone who digs down to watch. Containment is a law, not
        // a hope: the wave claims only EMPTY and DIAMOND, and uncarved DIRT
        // never qualifies — so the pocket, ringed by solid rock, cannot reach
        // the tube, the harvest at row 18 west of the divide, or the exit.
        name: 'SLIME VAULT', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 10 },
        amoebaDir: [1, 0],
        proves: ['dig', 'push', 'fell', 'crush', 'amoeba', 'dissolve'],
        // #2417 readability data (painter-only — the grid is untouched, the
        // sim never sees it). bolts: every pushwall and the way it gives, so
        // the painter can shade a one-cell arrow on the give side — the
        // mechanic teaches itself, no tutorial. dashcheck pins both lists to
        // the grid: if the vault is re-carved and the data lags, red.
        bolts: [[22, 10, 'E'], [26, 10, 'E']],
        // lids: the dirt row directly above the slime pocket — two cells under
        // the tube. A green grain telegraph reads "danger below" BEFORE the
        // player digs in (the pocket was invisible until the second dig).
        lids: [[24, 12], [25, 12], [26, 12], [27, 12], [28, 12]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left (west side)
            c.seam(18, 8, 13)                           // supported harvest — the whole quota, west of the divide
            c.rect(20, 1, 21, 20, STEEL)                // the divide: full height, no way around but the tube
            c.rect(18, 10, 32, 10, EMPTY)               // the tube, straight through it
            c.row(9, 18, 29, STEEL)                     // tube roof — the corridor reads as a tunnel
            c.set(23, 11, EMPTY); c.set(29, 11, EMPTY)  // the two pits the bolts drop into
            c.rect(33, 8, 37, 12, EMPTY)                // exit chamber, east
            c.set(22, 10, PUSHWALL)                     // the vault bolt (floor holds it; the pit is one cell east)
            c.set(26, 10, PUSHWALL)                     // the choke: shove east, the boulder is next
            c.set(28, 10, BOULDER)
            c.rect(24, 13, 28, 16, EMPTY)               // the slime pocket, sealed by untouched dirt
            c.set(24, 14, AMO_HEAD); c.set(24, 15, AMO_HEAD); c.set(25, 15, AMO_HEAD)
            // the bait vein sits ON the pocket floor with nothing above it —
            // loose gems over open space would fall and greed-turn to dirt long
            // before the wave arrives (construction rule 1, learned the sharp way).
            c.set(27, 16, DIAMOND); c.set(28, 16, DIAMOND)
            return c.g
        },
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    const { build: _build, ...meta } = lv                // functions must not ride in cloneable state
    return { meta, grid: lv.build() }
}
