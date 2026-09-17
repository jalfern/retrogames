// RACCOON HEIST — the jobs.
//
// Levels are *carved* out of solid rock rather than typed as ASCII art, for the reason
// IronKeep found: a map you carve cannot leak. Every cell starts as rubble and only the
// rooms/corridors you cut become walkable, so "a wall with a hole in it" is not a class
// of bug this file can produce. (Hand-typed ASCII maps produce exactly that bug, plus
// one that a screenshot cannot catch: a pit you cannot jump.)
//
// IMPORTANT: this module must stay importable from plain Node — no three.js, no DOM.
// scripts/heistcheck.mjs loads it to audit every job (reachability, patrol routes,
// guard sightlines onto the spawn) before a browser is ever opened.

// ------------------------------------------------------------------ cell types ----
export const T = {
    VOID: 0,      // outside the world: blocks movement and sight, renders nothing
    FLOOR: 1,
    MARBLE: 2,    // museum halls — lighter, squeakier underfoot
    WALL: 3,      // building mass
    FENCE: 4,     // blocks movement, NOT sight (chain-link)
    BUSH: 5,      // blocks sight, allows movement: cover
    DUMP: 6,      // dumpster: blocks both, and you can hide in it
    CRATE: 7,     // clutter: blocks both
    LAMP: 8,      // street lamp: no block, casts light
    WATER: 9,     // flooded: slows you, splashes loudly
}

export const blocksMove = (t) => t === T.VOID || t === T.WALL || t === T.FENCE || t === T.DUMP || t === T.CRATE
export const blocksSight = (t) => t === T.VOID || t === T.WALL || t === T.DUMP || t === T.CRATE

// For harness output: a stuck raccoon should print as "WALL", never as "3".
export const CELL_NAME = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]))

// Marker characters, stamped into `marks` (a Map of "x,y" -> {kind, ...}).
//   S crew/getaway cart   X getaway gate (locked until the job is done)
//   V vault door          P animal pound (where the cops park caught raccoons)
//   G guard waypoint      C cop spawn           A alarm pull
//   $ money  % painting  & gem  * big/heavy loot
//   N shiny (distraction ammo)   T trash can (knock it over)   @ cat NPC waypoint
//   L lamppost (light)    Z laser emitter       W washing line   I stair / decor
const MARKS = new Set(['S', 'X', 'V', 'P', 'G', 'C', 'A', '$', '%', '&', '*', 'N', 'T', '@', 'L', 'Z', 'W', 'I'])

// ------------------------------------------------------------------- builder ------
class Builder {
    constructor(w, h) {
        this.w = w
        this.h = h
        // Every cell starts as WALL. Rooms are cut, never drawn.
        this.grid = new Uint8Array(w * h).fill(T.WALL)
        this.height = new Uint8Array(w * h).fill(5)   // wall height in metres, for the skyline
        this.marks = new Map()
        this.seed = 1
    }

    idx(x, y) { return y * this.w + x }

    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h }

    carve(x, y, w, h, type = T.FLOOR) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (this.inBounds(i, j)) this.grid[this.idx(i, j)] = type
            }
        }
        return this
    }

    fill(x, y, w, h, type = T.WALL) { return this.carve(x, y, w, h, type) }

    /** A run of cells (fences, corridors, laser lines). */
    line(x0, y0, x1, y1, type = T.FLOOR) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
        for (let i = 0; i <= n; i++) {
            const x = Math.round(x0 + (x1 - x0) * i / n)
            const y = Math.round(y0 + (y1 - y0) * i / n)
            if (this.inBounds(x, y)) this.grid[this.idx(x, y)] = type
        }
        return this
    }

    /** Randomise wall heights so the skyline is not one flat brick slab. */    skyline(x, y, w, h, lo = 4, hi = 9, seed = 1) {
        let s = seed * 2654435761 >>> 0
        const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (!this.inBounds(i, j)) continue
                const k = this.idx(i, j)
                if (this.grid[k] === T.WALL) this.height[k] = Math.round(lo + r() * (hi - lo))
            }
        }
        return this
    }


    /**
     * Plant loot AND the cover it needs, in one call. The audit demands a bush or a
     * crate within 3.6 m of every pile (a target with no cover nearby teaches the
     * player that stealth is optional), so the thing that creates the requirement is
     * the thing that satisfies it — and the audit still checks the result.
     */
    loot(x, y, ch, cover = T.BUSH) {
        this.mark(x, y, ch)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]]) {
            const nx = x + dx, ny = y + dy
            if (!this.inBounds(nx, ny)) continue
            const t = this.grid[this.idx(nx, ny)]
            if (t !== T.FLOOR && t !== T.MARBLE) continue
            if (this.marks.has(nx + ',' + ny)) continue
            this.grid[this.idx(nx, ny)] = cover
            return this
        }
        return this
    }

    mark(x, y, ch) {
        if (!this.inBounds(x, y)) throw new Error(`mark(${x},${y}) out of bounds`)
        if (!MARKS.has(ch)) throw new Error(`unknown marker '${ch}'`)
        const key = x + ',' + y
        const prev = this.marks.get(key)
        // Multi-char stacks: "$N" is a loot pile with a shiny on top of it.
        this.marks.set(key, prev ? { kind: prev.kind + ch } : { kind: ch })
        return this
    }

}

/**
 * Turn a spec into the runtime level object: grid arrays plus plain data the renderer
 * and the sim both read. Everything downstream of here is derived — the renderer never
 * re-reads the spec, so the audit and the game cannot disagree about the map.
 */
function build(spec) {
    const b = new Builder(spec.w, spec.h)
    spec.build(b)
    const marks = []
    for (const [key, v] of b.marks) {
        const [x, y] = key.split(',').map(Number)
        for (const ch of v.kind) {
            marks.push({ ch, x, y, wx: x - (spec.w - 1) / 2, wz: y - (spec.h - 1) / 2 })
        }
    }
    const level = {
        name: spec.name,
        sub: spec.sub,
        brief: spec.brief,
        par: spec.par,
        rain: spec.rain ?? 500,
        fog: spec.fog ?? 0.022,
        theme: spec.theme ?? 'street',
        w: spec.w,
        h: spec.h,
        grid: b.grid,
        height: b.height,
        marks,
        routes: spec.routes.map((r, i) => ({
            id: i,
            kind: r.kind,
            speed: r.speed,
            cone: r.cone ?? 0.72,
            range: r.range ?? 9,
            hear: r.hear ?? 5,
            wait: r.wait ?? 0.6,
            pts: r.pts.map(([x, y]) => ({ x, y, wx: x - (spec.w - 1) / 2, wz: y - (spec.h - 1) / 2 })),
        })),
        ox: -(spec.w - 1) / 2,
        oz: -(spec.h - 1) / 2,
    }
    return level
}

// ------------------------------------------------------------------- THE JOBS -----
// Three jobs, each with a route the audit can walk and a lock that matters. Read them
// as architecture, not decoration — every corridor below exists because some piece of
// content needs to be reachable (or NOT reachable) through it:
//
//   1. THE CORNER BANK   the tutorial in disguise: one guard sweep, one vault door,
//                        a cut onto the street with a dumpster to duck behind.
//   2. MUSEUM OF SHINY THINGS  two ways to the gem: the laser aisle (short, bright)
//                        or the conservation crawl (long, dark). Your choice, not ours.
//   3. THE MOONSTONE MANOR  a dog, two cop spawns, and a storm worth more than any
//                        plan we have ever had.

// Job 1 — the yard behind the corner bank.
const CORNER_BANK = {
    name: 'THE CORNER BANK',
    sub: 'Job 01 · ten minutes past midnight',
    theme: 'street',
    brief: 'The watchman walks the yard. The bank’s own boiler room is warmer than he'
        + ' is, and the vault door is soft aluminium and a hope. Two sacks in the'
        + ' antechamber, one cart at the kerb. Nobody ever sees a raccoon.',
    par: 95,
    w: 30,
    h: 22,
    routes: [
        { kind: 'guard', speed: 1.5, range: 9.5, cone: 0.72, hear: 5.5, pts: [[11, 10], [20, 10], [20, 15], [11, 15]] },
        { kind: 'guard', speed: 1.2, range: 8, cone: 0.62, hear: 5, pts: [[12, 5], [19, 5]] },
    ],
    build(b) {
        // street → yard, and the y=17 wall row between them, pierced once
        b.carve(1, 18, 28, 4)
        b.carve(6, 8, 18, 9)                        // x=6..23 y=8..16
        b.carve(8, 16, 2, 3)                         // the cut: x=8..9 y=16..18
        // Two dumpsters plug the cut. You walk past them down the x=8 column; a
        // watchman standing in the yard cannot see the cart, because the only sight
        // channel onto the street is now two metres of galvanised steel.
        b.fill(9, 16, 1, 2, T.DUMP)
        // bank mass: vault hall (left) + boiler room (right), separated by x=22
        b.carve(10, 2, 12, 5)                        // x=10..21 y=2..6
        b.carve(23, 2, 4, 5)                         // x=23..26 y=2..6
        b.carve(22, 5, 1, 1)                         // service hatch
        b.carve(15, 7, 1, 1)                         // the vault door itself
        // the cat's court off the street, chain-link to the yard so you can read the
        // guard's position from inside it without ever stepping out
        b.carve(2, 12, 4, 5)
        b.carve(3, 17, 1, 1)
        b.line(6, 12, 6, 16, T.FENCE)
        // cover
        b.fill(12, 11, 2, 2, T.BUSH)
        b.fill(19, 13, 2, 1, T.BUSH)
        b.fill(23, 9, 1, 2, T.CRATE)
        b.fill(16, 20, 1, 1, T.CRATE)
        // a flooded corner: paddling is loud, and the audit knows it
        b.fill(21, 15, 2, 2, T.WATER)
        b.skyline(0, 0, 30, 22, 4, 9, 7)

        b.mark(9, 19, 'S')                           // cart + crew, in the mouth of the cut
        b.mark(6, 20, 'P')                           // the pound: a cage, by the kerb
        b.mark(1, 21, 'X')                           // the storm drain you escape down
        b.mark(15, 7, 'V')                           // vault door
        b.loot(15, 4, '$')
        b.loot(17, 3, '$')
        b.loot(24, 3, '%', T.CRATE)                  // the lobby oil, worth far too much
        b.loot(4, 13, '&', T.CRATE)                  // the cat's stash
        b.mark(12, 19, 'N')
        b.mark(22, 12, 'N')
        b.mark(2, 14, 'N')
        b.mark(23, 13, 'T')
        b.mark(7, 10, 'T')
        b.mark(12, 12, 'L')
        b.mark(20, 9, 'L')
        b.mark(4, 19, 'L')
        b.mark(18, 4, 'L')
        b.mark(12, 20, '@')                          // the cat arrives down the street…
    },
}

// Job 2 — the museum. Marble, lasers, and a docent who is definitely up to something.
const MUSEUM = {
    name: 'MUSEUM OF SHINY THINGS',
    sub: 'Job 02 · the gala ended an hour ago',
    theme: 'museum',
    brief: 'Three halls of things nobody is allowed to touch, one laser aisle, and a'
        + ' security officer who has read the same page of his paperback for two hours.'
        + ' The Moonstone of Verdantis is at the far end. Take it. Take the rest too.',
    par: 140,
    rain: 240,
    fog: 0.013,
    w: 34,
    h: 24,
    routes: [
        { kind: 'guard', speed: 1.5, range: 10.5, cone: 0.66, hear: 6, pts: [[5, 4], [28, 4]] },
        { kind: 'guard', speed: 1.35, range: 10, cone: 0.6, hear: 5.5, pts: [[5, 17], [27, 17], [27, 13], [5, 13]] },
        { kind: 'guard', speed: 1.6, range: 9.5, cone: 0.58, hear: 6, pts: [[24, 13], [30, 13], [30, 17], [22, 17]] },
    ],
    build(b) {
        b.carve(1, 20, 32, 3)                        // service lane
        b.carve(3, 12, 28, 7, T.MARBLE)              // entrance hall
        b.carve(4, 2, 26, 4, T.MARBLE)               // gem hall
        b.carve(15, 6, 4, 6, T.MARBLE)               // the laser aisle
        // the alternative: a conservation crawl up the west wall. The lasers are a
        // shortcut, never a gate — a locked door you cannot refuse is not a choice.
        b.carve(1, 6, 2, 6)
        b.carve(2, 5, 2, 2)
        b.carve(2, 12, 1, 1)
        // the manager's office, behind a real wall and a real door
        b.carve(29, 12, 4, 6, T.MARBLE)
        b.fill(28, 12, 1, 7, T.WALL)
        b.carve(28, 15, 1, 1)
        b.mark(28, 15, 'V')                           // the manager's office: locked. The urn is in there.
        // Two holes in the wall row between lane and hall, and the difference between
        // them is the whole level: (8,19) is the propped staff door the crew walks in
        // through, (16,19) is the front alarm-door that only opens when the job is done.
        // An audit caught the first version having ONLY the escape — which meant the
        // map had one door, and it was the one you are not allowed to use yet.
        b.carve(8, 19, 1, 1)
        b.carve(16, 19, 1, 1)
        // plinths and palms: the cover this map is built out of
        b.fill(9, 15, 1, 1, T.CRATE)
        b.fill(13, 16, 1, 1, T.CRATE)
        b.fill(20, 15, 1, 1, T.CRATE)
        b.fill(24, 16, 1, 1, T.CRATE)
        b.fill(6, 3, 1, 1, T.CRATE)
        b.fill(11, 14, 1, 2, T.BUSH)
        b.fill(19, 17, 2, 1, T.BUSH)
        b.fill(12, 3, 1, 1, T.BUSH)
        b.fill(26, 4, 1, 1, T.BUSH)
        b.skyline(0, 0, 34, 24, 5, 11, 11)

        b.mark(4, 21, 'S')
        b.mark(2, 21, 'P')
        b.mark(16, 19, 'X')
        b.mark(14, 7, 'Z')
        b.mark(19, 7, 'Z')                            // beam one, across the aisle
        b.mark(14, 10, 'Z')
        b.mark(19, 10, 'Z')                           // beam two
        b.loot(16, 3, '&', T.BUSH)                    // the Moonstone
        b.loot(8, 3, '%', T.CRATE)
        b.loot(25, 3, '%', T.BUSH)
        b.loot(7, 15, '$', T.BUSH)
        b.loot(22, 13, '$', T.CRATE)
        b.loot(31, 14, '*', T.CRATE)                  // the donation urn. Heavy.
        b.mark(2, 8, 'N')
        b.mark(12, 21, 'N')
        b.mark(27, 18, 'N')
        b.mark(6, 5, 'N')
        b.mark(20, 16, 'T')
        b.mark(30, 21, 'T')
        b.mark(2, 10, '@')                            // the cat comes in through conservation
        b.mark(6, 20, 'L')
        b.mark(17, 16, 'L')
        b.mark(24, 14, 'L')
        b.mark(16, 8, 'L')
    },
}

// Job 3 — the manor. A dog, two cop spawns, and a storm doing half the work.
const MANOR = {
    name: 'THE MOONSTONE MANOR',
    sub: 'Job 03 · thunder, and no moon at all',
    theme: 'manor',
    brief: 'Last job. The courtyard has a dog, the study has a safe, and the storm out'
        + ' west is worth more than any plan we have ever had: when lightning cracks,'
        + ' nobody hears a raccoon run. Time it, and be ghosts.',
    par: 175,
    rain: 1000,
    fog: 0.03,
    w: 32,
    h: 26,
    routes: [
        { kind: 'dog', speed: 2.4, range: 7.5, cone: 1.9, hear: 8, wait: 0.2, pts: [[8, 18], [22, 18], [22, 13], [8, 13]] },
        { kind: 'guard', speed: 1.5, range: 10.5, cone: 0.66, hear: 6, pts: [[6, 16], [25, 16]] },
        { kind: 'guard', speed: 1.35, range: 9.5, cone: 0.6, hear: 5.5, pts: [[10, 6], [21, 6], [21, 4], [10, 4]] },
        { kind: 'guard', speed: 1.55, range: 10, cone: 0.6, hear: 6, pts: [[2, 16], [9, 21], [21, 21]] },
    ],
    build(b) {
        b.carve(1, 20, 30, 5)                        // drive
        b.carve(5, 12, 22, 8)                        // the dog's courtyard
        b.carve(1, 14, 4, 5)                         // stables, west
        b.carve(8, 3, 16, 6, T.MARBLE)               // gallery
        b.carve(14, 9, 3, 3)                         // gallery stair
        b.carve(26, 3, 5, 6, T.MARBLE)               // the study (= the vault)
        b.carve(24, 5, 2, 1)                         // …reached only through the vault door
        b.carve(1, 5, 5, 6)                          // west range
        b.carve(2, 11, 2, 3)                         // service stair west range <-> stables
        b.line(11, 12, 13, 12, T.FENCE)              // railings across the courtyard
        b.line(18, 12, 21, 12, T.FENCE)              // (the stair mouth stays open)
        // The east junction between courtyard and drive is walled, and the drive is
        // walled again two cells short of the cart. Two blind corners do what no
        // amount of "the guard happens to be looking away" ever will: they make the
        // getaway cart un-observable until you are already beside it.
        b.fill(23, 19, 4, 1, T.WALL)
        b.fill(24, 20, 1, 3, T.WALL)
        b.carve(30, 23, 1, 1)                        // the gatehouse drain
        // hedges, urns, statuary
        b.fill(18, 15, 3, 2, T.BUSH)
        b.fill(9, 16, 2, 2, T.BUSH)
        b.fill(24, 14, 1, 3, T.BUSH)
        b.fill(6, 21, 3, 2, T.BUSH)
        b.fill(11, 5, 1, 2, T.BUSH)
        b.fill(20, 7, 2, 1, T.BUSH)
        b.fill(16, 15, 1, 1, T.CRATE)
        b.fill(21, 17, 1, 1, T.CRATE)
        b.fill(13, 4, 1, 1, T.CRATE)
        b.fill(19, 5, 1, 1, T.CRATE)
        b.fill(1, 17, 1, 1, T.CRATE)          // off the patrol route, unlike the cart
        b.fill(20, 22, 4, 2, T.WATER)
        b.skyline(0, 0, 32, 26, 5, 12, 3)

        b.mark(27, 22, 'S')                          // cart at the east gate: watched, and worth it
        b.mark(25, 22, 'P')
        b.mark(30, 23, 'X')
        b.mark(25, 5, 'V')
        b.loot(28, 4, '*', T.CRATE)                   // the safe
        b.loot(28, 7, '&', T.CRATE)
        b.loot(10, 3, '%', T.CRATE)
        b.loot(21, 3, '%', T.BUSH)
        b.loot(7, 17, '$', T.BUSH)
        b.loot(4, 16, '$', T.BUSH)
        b.mark(2, 7, 'N')
        b.mark(22, 14, 'N')
        b.mark(16, 21, 'N')
        b.mark(20, 4, 'N')
        b.mark(24, 18, 'T')
        b.mark(4, 9, 'T')
        b.mark(1, 22, 'C')                            // cop spawn: west drive
        b.mark(30, 20, 'C')                           // cop spawn: right behind the cart. Of course it is.
        b.mark(3, 8, '@')                             // the cat knows the vault door
        b.mark(8, 14, 'L')
        b.mark(23, 18, 'L')
        b.mark(3, 6, 'L')
        b.mark(15, 5, 'L')
        b.mark(28, 21, 'L')
        b.mark(14, 10, 'L')
    },
}

// The runtime list. `build` is what turns a spec into derived grid + marks + routes,
// so nothing downstream ever re-reads a spec and disagrees with the audit.
export const LEVELS = [CORNER_BANK, MUSEUM, MANOR].map(build)

// ----------------------------------------------------------------- grid reads -----
export function at(level, x, y) {
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return T.VOID
    return level.grid[y * level.w + x]
}

/** Cell type at a WORLD position (world units, level-centred). */
export function atWorld(level, wx, wz) {
    return at(level, Math.round(wx - level.ox), Math.round(wz - level.oz))
}

export function cellOf(level, wx, wz) {
    return [Math.round(wx - level.ox), Math.round(wz - level.oz)]
}

export const worldOf = (level, x, y) => [x + level.ox, y + level.oz]

export function markAt(level, x, y, ch) {
    return level.marks.filter(m => m.x === x && m.y === y && (ch ? m.ch === ch : true))
}

/**
 * Flood fill over cells a raccoon can walk, from a start cell.
 *
 * `block` names MARKER chars whose cells are impassable for this pass — the audit runs
 * it twice, once with the vault door and the escape gate shut and once open, and the
 * DIFFERENCE is the proof that those doors are load-bearing rather than decorative.
 * Used by the audit and, via the engine, as the guard pathfinder (a 900-cell BFS is
 * nothing; this game does not need A*).
 */
export function reachFrom(level, sx, sy, { block = [] } = {}) {
    const sealed = new Set()
    for (const ch of block) for (const m of level.marks) if (m.ch === ch) sealed.add(m.x + ',' + m.y)
    const seen = new Uint8Array(level.w * level.h)
    if (blocksMove(at(level, sx, sy)) || sealed.has(sx + ',' + sy)) return seen
    const q = [[sx, sy]]
    seen[sy * level.w + sx] = 1
    while (q.length) {
        const [x, y] = q.shift()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue
            const k = ny * level.w + nx
            if (seen[k] || sealed.has(nx + ',' + ny)) continue
            if (blocksMove(at(level, nx, ny))) continue
            seen[k] = 1
            q.push([nx, ny])
        }
    }
    return seen
}

/** BFS path (cell centres) between two walkable cells, or null.
 *  `opts.sealed` is a Set of "x,y" keys treated as solid even though the grid says
 *  otherwise — that is how a shut vault door keeps guards out of the steel. */
export function pathBetween(level, from, to, opts = {}) {
    const sealed = opts.sealed || new Set()
    const key = (x, y) => x + ',' + y
    if (blocksMove(at(level, from[0], from[1])) || blocksMove(at(level, to[0], to[1]))) return null
    if (sealed.has(key(to[0], to[1]))) return null
    const prev = new Int32Array(level.w * level.h).fill(-1)
    const start = from[1] * level.w + from[0]
    const goal = to[1] * level.w + to[0]
    const q = [start]
    prev[start] = start
    while (q.length) {
        const cur = q.shift()
        if (cur === goal) break
        const cx = cur % level.w, cy = (cur / level.w) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue
            const k = ny * level.w + nx
            if (prev[k] !== -1) continue
            if (sealed.has(key(nx, ny))) continue
            const t = at(level, nx, ny)
            if (blocksMove(t) && !(opts.walkBush && t === T.BUSH)) continue
            prev[k] = cur
            q.push(k)
        }
    }
    if (prev[goal] === -1) return null
    const out = []
    for (let k = goal; ; k = prev[k]) {
        out.push([k % level.w, (k / level.w) | 0])
        if (k === start) break
    }
    return out.reverse()
}

/** ASCII dump for the DEV hook and for failure output in heistcheck. */
export function dumpLevel(level) {
    const glyph = { 0: ' ', 1: '.', 2: '=', 3: '#', 4: ':', 5: '*', 6: 'D', 7: 'C', 8: '!', 9: '~' }
    const rows = []
    for (let y = 0; y < level.h; y++) {
        let row = ''
        for (let x = 0; x < level.w; x++) {
            const mk = level.marks.find(m => m.x === x && m.y === y)
            row += mk ? mk.ch : glyph[level.grid[y * level.w + x]] || '?'
        }
        rows.push(row)
    }
    return rows.join('\n')
}

/** The three crew, in order. Traits are modifiers, never keys — no job can soft-lock. */
export const CREW = [
    { id: 0, name: 'BANDIT', bandana: 0xd8433c, speed: 1.0, noise: 1.0, grab: 1.0, sight: 1.0, note: 'the idea raccoon' },
    { id: 1, name: 'TINKER', bandana: 0x3d7fd6, speed: 0.94, noise: 0.85, grab: 1.55, sight: 1.05, note: 'chews locks in half the time' },
    { id: 2, name: 'SCOUT', bandana: 0x4bb46a, speed: 1.16, noise: 0.7, grab: 0.8, sight: 1.15, note: 'fast, quiet, small' },
]
