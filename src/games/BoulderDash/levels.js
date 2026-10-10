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

import { W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL } from './sim.js'

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
        // the safe side of that glowing partition, and the exit beyond it. The
        // only thing the fire asks of you is that you do not stand in its room.
        name: 'FLY PIT', timeTicks: 2200, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 3 },
        flies: [{ x: 12, y: 5, dir: 0 }],
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
            // the harvest: a supported seam along the START row, east of the
            // steel cell — the player tunnels along it laterally and never digs
            // beneath a gem, so nothing of the paydirt ever drains away.
            c.seam(18, 20, 26)
            return c.g
        },
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    const { build: _build, ...meta } = lv                // functions must not ride in cloneable state
    return { meta, grid: lv.build() }
}
