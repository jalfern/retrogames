// BOULDER DASH — the simulation. No DOM, no React, no canvas, and deliberately
// no Math.random anywhere: the whole cave is a pure function of
// (level, grid, move script). That is what lets `scripts/dashcheck.mjs` import
// this file in plain Node and prove a cave is winnable, a boulder kills, a gem
// turns to dirt and a fire chain burns out — BEFORE a browser is ever opened.
//
// The muscle this issue asked for is the CELLULAR AUTOMATON: gravity is not a
// player property, it is a per-cell rule stepped bottom-up every tick, so a
// boulder and a gem fall through the same empty column at the same rate and
// diverge only in what they do when they LAND (a boulder rests and can crush
// you; a gem gives up and becomes dirt). Fire is a second automaton with a
// timer: a burning cell ignites its flammable neighbours for a few ticks, then
// burns out to empty — a chain that consumes a whole dust pocket. A firefly is
// a third automaton: it flies with momentum on the fixed four-direction cycle
// (#2364), keeping its heading while the way is open and bouncing off obstacles
// in cycle order — so it patrols every cell it can reach and ignites everything
// it touches. Standing still near one is fatal, the clock is shared, and a pit
// with an open corridor (FLY PIT's bored seam) lets it out into the cavern.
//
// Geometry, so the fall math reads clearly: cell (col,row), row 0 at the top,
// gravity pulls toward larger row. A cell falls when the cell straight below it
// is EMPTY (fire is "empty enough" to fall into). A cell whose downward path is
// blocked by ANOTHER FALLING MATTER (boulder/gem) may roll into an empty
// shoulder (side and side-below both empty) — that is the "boulders pile into a
// heap and level off" behaviour, and the reason a heap under a vein eats the
// vein. Dirt and steel stop a fall dead; only a shoulder lets it sidestep.
//
// The rules that are load-bearing, and why each is the shape it is:
//
// - A FALLING boulder that moves into the player kills them; a RESTING boulder
//   touching the player does not. That asymmetry is the whole game: you live by
//   reading which rocks are actually moving. The dashcheck pin proves the
//   resting case stays survivable, or "fall kills" would just be "rock kills"
//   and digging beside a wall would be Russian roulette.
// - A gem that has fallen at least one cell and then LANDS converts to DIRT.
//   Greedy players dig the diamond veins out from underneath and watch the loot
//   turn to rubble — so the level's collectable quota is audited against a
//   planner that actually digs the route, not a diamond count.
// - Fire never lights STEEL. That is the one surface a chain reaction respects,
//   and it is what makes a wall a strategy rather than decoration.
// - The firefly's turn order is fixed (down, right, up, left) and its heading
//   holds while the way is open (#2364): its path is therefore knowable, and
//   the level can be built so the planned route outruns it — steel bounds its
//   whole patrol, down to the last cell of its corridor.

export const W = 40
export const H = 22
export const FIXED_DT = 1 / 60         // the shell's rAF accumulator; the sim is in ticks

export const EMPTY = 0
export const DIRT = 1
export const BOULDER = 2
export const DIAMOND = 3
export const STEEL = 4
export const FIRE = 5
export const FIREFLY = 6               // never stored in the grid; flies are entities
// #2411 — the later-variant elements. AMO_HEAD/AMO_BODY are the two amoeba
// cells (Boulder Dash II, Origin 1985): the wave paints new cells as HEAD and
// demotes them to BODY once the next generation leaves them behind, so the
// slime reads as a moving creature, not a stain. PUSHWALL (Super Boulder Dash
// lineage) is solid rock the digger can shove sideways one cell per move.
export const AMO_HEAD = 7
export const AMO_BODY = 8
export const PUSHWALL = 9
// #2428 — the Boulder Dash II amoeba FAMILY rides on the slime cells as variant
// codes (the wave is still ONE automaton, it just steps differently): 0 is the
// #2411 classic wave, 1 the two-phase gait (extend, then corner), 2 the dropper
// (down is always the first offer). A level says which family its slime is from.
export const AMO_CLASSIC = 0
export const AMO_TWOPHASE = 1
export const AMO_DROP = 2
// #2444 — the multi-head wave: a fork head advances AND plants a perpendicular
// sibling head at the same cell, so ONE origin grows several independently-
// cornering fingers that reach around obstacles and enclose space — the "rarer
// multi-head wave shape" the README said was missing. Still one automaton.
export const AMO_FORK = 3
export const AMO_VARIANT = { classic: AMO_CLASSIC, twophase: AMO_TWOPHASE, drop: AMO_DROP, fork: AMO_FORK }
// Direction order for slime heads: index 0..3 clockwise from east, so a left
// turn is +3 and a right turn is +1, and the 180° mirror of a wave is +2.
export const AMO_D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]]
export const amoDirIdx = ([dx, dy]) => AMO_D4.findIndex(([ax, ay]) => ax === dx && ay === dy)

export const CFG = {
    burn: 5,                            // ticks a FIRE cell lives before emptying
    moveEvery: 4,                       // CA ticks between scripted moves (plan + replay cadence)
    caHz: 12,                           // CA ticks per second of world time (classic BD pace)
    fireflyDirs: [[0, 1], [1, 0], [0, -1], [-1, 0]],   // down, right, up, left
    // Engine switches. All true in play and never touched by the shell; they
    // exist ONLY so `dashcheck --mutate` can prove each rule is load-bearing
    // (a child run silences one and the matching check must go red). These are
    // the same idea as Lemmings' CFG numbers — a single, honest, documented
    // surface for the gate — just expressed as the on/off rules gravity is.
    gravity: true,                      // rocks/gems fall
    roll: true,                         // a blocked rock levels out sideways
    convert: true,                      // a fallen gem gives up and becomes dirt
    fireSpread: true,                   // fire lights flammable neighbours
    flyIgnite: true,                    // the firefly sets what it touches alight
    flyTravel: true,                    // #2364: the fly holds its heading and bounces — it can leave the pit
    flyDrift: true,                     // #2453: the butterfly flap — in OPEN air the fly turns on its own
    flyDriftOdds: 4,                   // …1 in this many open-air ticks — the flit rate of the originals
    fallKill: true,                     // a falling boulder crushes the player
    amoeba: true,                       // #2411: the slime wave grows (Boulder Dash II)
    amoEvery: 3,                      // CA ticks between amoeba growth passes — the wave reads as motion
    amoGens: 8,                       // generations a body cell survives — the wave's length
    amoTurn: true,                    // #2428: the two-phase gait — heads corner 90° on the off phase
    amoDrop: true,                    // #2428: the dropper variant — down is the head's first offer
    amoFork: true,                    // #2444: the fork variant — a head plants a perpendicular sibling
    amoForkMax: 4,                  // …but at most this many live heads per wave (containment, see dashcheck)
    push: true,                       // #2411: push walls slide sideways one cell per shove
    pushCrush: true,                  // …and crush whatever rock stands in the way
}

export const DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
}

export const cell = (g, x, y) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return STEEL       // world edges are steel
    return g.grid[y * W + x]
}
const idx = (x, y) => y * W + x
const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

// Every observable that the planner or driver can depend on. There is no RNG, so
// two identical command scripts MUST produce identical hashes — and a script
// with one move dropped MUST NOT (see dashcheck's tamper probe).
export function stateHash(g) {
    let s = `${g.tick}|${g.have}|${g.score}|${g.end}|${g.win}|${g.player.x},${g.player.y},${g.player.alive ? 1 : 0}`
    for (const f of g.flies) s += `|f${f.x},${f.y},${f.dir}${g.flyExt ? `~${f.flaps}` : ''}`
    for (let i = 0; i < g.grid.length; i++) {
        const t = g.grid[i]
        // FIRE carries its burn timer, amoeba cells their generation — each in a
        // character range the other cannot reach, so no two distinct states fold
        // to the same char (#2411). On #2428 VARIANT caves the amoeba char also
        // carries head direction, variant and wave id (bases 8/32/96 above the
        // generation) — states that could diverge must hash differently. Levels
        // without variants take the #2411 branch unchanged: byte-identical.
        let adj = 0
        if (t === FIRE) adj = g.burn[i]
        else if (t === AMO_HEAD || t === AMO_BODY) {
            adj = g.amoExt
                ? g.amoGen[i] + 8 * (g.amoHead[i] + 1) + 32 * g.amoVar[i] + 96 * g.amoWave[i]
                : 11 + g.amoGen[i]
        }
        s += String.fromCharCode(48 + t + adj)
    }
    s += '|' + [...g.movingB].join(',') + ';' + [...g.movingD].join(',')
    return hash(s)
}

export function makeGame(level, grid) {
    const g = {
        level,
        grid: Uint8Array.from(grid),
        burn: new Int8Array(W * H),                     // FIRE lifetime per cell
        flyAt: new Int8Array(W * H).fill(-1),           // cell -> fly id (or -1)
        tick: 0,
        end: null,                                      // null | 'clear' | 'dead' | 'time'
        win: false,
        score: 0,
        have: 0,
        need: level.need,
        player: { x: level.spawn.x, y: level.spawn.y, alive: true },
        exit: { ...level.exit },
        flies: [...(level.flies || []), ...((level.butterflies || []).map((b) => ({ ...b, drift: true, digs: false, ignites: false })))].map((f, i) => ({ id: i, x: f.x, y: f.y, dir: f.dir | 0, drift: f.drift ? 1 : 0, digs: f.digs === false ? 0 : 1, ignites: f.ignites === false ? 0 : 1, flaps: 0 })),
        // #2453: drift state rides the hash ONLY when a level actually has a
        // drifting fly (the #2428 amoExt pattern) — caves without drift replay
        // byte-identical.
        flyExt: !!(level && ((level.flies || []).some((f) => f.drift) || (level.butterflies || []).length > 0)),
        movingB: new Set(),                             // boulder cell-indices in motion last tick
        movingD: new Set(),                             // gem cell-indices in motion last tick
        amoGen: new Int8Array(W * H),                   // #2411 amoeba: generation born (0 = seeded)
        amoPass: 0,                                     // growth passes so far (the wave's clock)
        amoDir: (level && level.amoebaDir) || [1, 0],   // which way the wave travels this cave
        // #2428 — per-cell amoeba state for the BD II FAMILY: which wave a cell
        // belongs to, which way that head points, and which variant of the
        // creature it is. Levels that use none of it leave these arrays at zero
        // and the hash keeps its #2411 shape (byte-identity for old caves).
        amoWave: new Int8Array(W * H),                  // wave id (0 = the grid-seeded primary)
        amoVar: new Uint8Array(W * H),                  // AMO_CLASSIC / AMO_TWOPHASE / AMO_DROP
        amoHead: new Int8Array(W * H).fill(-1),         // head direction index into AMO_D4 (-1 = not a head)
        amoExt: !!(level && ((level.amoebas && level.amoebas.length) ||
            (level.amoebaVariant && level.amoebaVariant !== 'classic'))),
        deathCause: null,
        cmds: [],                                       // recorded {tick,dir} — replay fuel
        events: [],
    }
    for (const f of g.flies) if (inBounds(f.x, f.y)) g.flyAt[idx(f.x, f.y)] = f.id
    const pVar = AMO_VARIANT[(level && level.amoebaVariant) || 'classic'] || 0
    const pDir = amoDirIdx(g.amoDir)
    for (let i = 0; i < g.grid.length; i++) {
        const t = g.grid[i]
        if (t === AMO_HEAD || t === AMO_BODY) {
            g.amoGen[i] = 0                                   // seeded slime starts at generation 0
            g.amoVar[i] = pVar
            g.amoHead[i] = t === AMO_HEAD ? pDir : -1
        }
    }
    // extra waves the level declares: { cells:[[x,y]…], dir:[dx,dy], variant }
    for (let w = 0; w < ((level && level.amoebas) || []).length; w++) {
        const a = level.amoebas[w]
        const d = amoDirIdx(a.dir || [1, 0])
        const v = AMO_VARIANT[a.variant || 'classic'] || 0
        for (const [x, y] of a.cells) {
            if (!inBounds(x, y)) continue
            const i = idx(x, y)
            g.grid[i] = AMO_HEAD
            g.amoGen[i] = 0
            g.amoWave[i] = w + 1                    // the primary wave owns id 0
            g.amoVar[i] = v
            g.amoHead[i] = d
        }
    }
    return g
}

function killPlayer(g, cause) {
    if (!g.player.alive) return
    g.player.alive = false
    g.deathCause = cause
    g.end = 'dead'
    g.win = false
    g.events.push({ type: 'die', cause })
}

// --------------------------------------------------------------- player act ----
// A move is one cell, applied at the start of a tick (live input or a replayed
// cmd). Solid cells (steel, boulder) block; dirt is dug; gems are collected;
// fire and a firefly are fatal. Nothing about a move is stochastic.
export function playerMove(g, dir) {
    if (g.end || !g.player.alive) return false
    const d = DIRS[dir]
    if (!d) return false
    const p = g.player
    const nx = p.x + d[0], ny = p.y + d[1]
    if (!inBounds(nx, ny)) return false

    const flyId = inBounds(nx, ny) ? g.flyAt[idx(nx, ny)] : -1
    if (flyId >= 0) { killPlayer(g, 'fly'); return false }

    const t = cell(g, nx, ny)
    if (t === STEEL || t === BOULDER) return false                 // solid: blocked
    if (t === AMO_HEAD || t === AMO_BODY) { killPlayer(g, 'amoeba'); return false }  // slime is death (#2411)
    if (t === FIRE) { killPlayer(g, 'fire'); return false }
    if (t === PUSHWALL) {
        // A push wall slides sideways one cell per shove — BD's law is that
        // nothing is ever lifted, so vertical shoves just fail. The cell the
        // wall lands in must give: empty space or fire (doused) slides; a rock
        // is crushed — a crushed gem is LOST, not collected (haste costs).
        if (!CFG.push || d[0] === 0) return false
        const bx = nx + d[0], by = ny + d[1]
        const b = cell(g, bx, by)
        if (b === EMPTY || b === FIRE) {
            g.grid[idx(nx, ny)] = EMPTY
            g.grid[idx(bx, by)] = PUSHWALL
            if (b === FIRE) g.burn[idx(bx, by)] = 0
            g.events.push({ type: 'push', x: bx, y: by })
        } else if ((b === BOULDER || b === DIAMOND) && CFG.pushCrush) {
            g.grid[idx(nx, ny)] = EMPTY
            g.grid[idx(bx, by)] = PUSHWALL
            g.events.push({ type: 'crush', x: bx, y: by, kind: b })
            g.events.push({ type: 'push', x: bx, y: by })
        } else return false
    }

    if (t === DIRT) { g.grid[idx(nx, ny)] = EMPTY; g.events.push({ type: 'dig' }) }
    else if (t === DIAMOND) {
        g.grid[idx(nx, ny)] = EMPTY
        g.have++
        g.score += 100
        g.events.push({ type: 'gem', have: g.have })
    }

    p.x = nx; p.y = ny
    g.cmds.push({ tick: g.tick, dir })

    if (nx === g.exit.x && ny === g.exit.y) {
        if (g.have >= g.need) {
            g.end = 'clear'; g.win = true
            g.score += 250 + Math.max(0, g.level.timeTicks - g.tick) * 2
            g.events.push({ type: 'win' })
        } else {
            g.events.push({ type: 'locked', have: g.have })
        }
    }
    return true
}

// --------------------------------------------------------------- CA: gravity ----
// One falling pass, bottom row first, so a body claimed at (x,y+1) is not
// re-processed this tick (one cell of fall per tick — the classic pace). Every
// move is recorded so the shell can kill the player on an impact.
function gravity(g) {
    if (!CFG.gravity) return
    const mvB = new Set(), mvD = new Set()
    for (let y = H - 2; y >= 0; y--) {
        for (let x = 0; x < W; x++) {
            const i = idx(x, y)
            const t = g.grid[i]
            if (t !== BOULDER && t !== DIAMOND && t !== PUSHWALL) continue
            const moving = t === BOULDER ? g.movingB.has(i) : t === DIAMOND ? g.movingD.has(i) : false
            const below = cell(g, x, y + 1)
            if (below === EMPTY || below === FIRE) {
                g.grid[i] = EMPTY
                g.grid[idx(x, y + 1)] = t
                if (below === FIRE) g.burn[idx(x, y + 1)] = 0
                if (t === BOULDER) mvB.add(idx(x, y + 1)); else if (t === DIAMOND) mvD.add(idx(x, y + 1))
                g.events.push({ type: 'fell', x, y: y + 1, kind: t })
                if ((t === BOULDER || t === PUSHWALL) && CFG.fallKill && g.player.alive && g.player.x === x && g.player.y === y + 1) {
                    killPlayer(g, t === PUSHWALL ? 'pushwall' : 'boulder')
                }
                continue
            }
            // blocked straight down by another rock: try to level out sideways.
            // Push walls never roll — a wall that leans is not a wall (#2411).
            if (CFG.roll && t !== PUSHWALL && (below === BOULDER || below === DIAMOND)) {
                let rolled = false
                for (const dx of [-1, 1]) {
                    if (cell(g, x + dx, y) === EMPTY && cell(g, x + dx, y + 1) === EMPTY) {
                        g.grid[i] = EMPTY
                        g.grid[idx(x + dx, y)] = t
                        ;(t === BOULDER ? mvB : mvD).add(idx(x + dx, y))
                        g.events.push({ type: 'roll', x: x + dx, y, kind: t })
                        rolled = true
                        break
                    }
                }
                if (rolled) continue
            }
            // resting. A gem that fell at least one cell gives up and becomes dirt.
            if (moving && t === DIAMOND && CFG.convert) {
                g.grid[i] = DIRT
                g.events.push({ type: 'gemlost', x, y })
            }
        }
    }
    g.movingB = mvB
    g.movingD = mvD
}

// --------------------------------------------------------------- CA: fire ----
// A proper automaton: read a snapshot, write next state. A burning cell lives a
// few ticks then empties; each tick it lights flammable neighbours (never steel,
// never empty). That is the chain + the timer in one pass.
function fire(g) {
    const burning = []
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i] === FIRE) burning.push(i)
    for (const i of burning) {
        if (g.burn[i] > 0) g.burn[i]--
        else { g.grid[i] = EMPTY; g.burn[i] = 0 }
    }
    const ignite = []
    if (CFG.fireSpread) for (const i of burning) {
        if (g.grid[i] !== FIRE) continue                            // just emptied
        const x = i % W, y = (i - x) / W
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const j = idx(x + dx, y + dy)
            if (!inBounds(x + dx, y + dy)) continue
            const t = g.grid[j]
            if (t === DIRT || t === DIAMOND || t === BOULDER) ignite.push(j)
        }
    }
    for (const j of ignite) {
        if (g.grid[j] === FIRE) continue
        g.grid[j] = FIRE
        g.burn[j] = CFG.burn
        g.events.push({ type: 'spread', i: j })
        const fx = j % W, fy = (j - fx) / W
        if (g.player.alive && g.player.x === fx && g.player.y === fy) killPlayer(g, 'fire')
    }
}

// ------------------------------------------------------------- CA: amoeba ----
// The wave from Boulder Dash II (#2411), extended into the amoeba FAMILY by
// #2428. Every CFG.amoEvery ticks one growth pass runs. Growth only claims
// EMPTY and DIAMOND — a diamond the slime touches dissolves (`dissolve`), and
// uncarved DIRT, steel, boulders and fire are walls to it, which is what keeps
// every cave's harvest provably out of reach. Bodies age: a cell older than
// CFG.amoGens generations empties, so the wave ADVANCES down the corridor
// instead of filling the cave — the classic look of heads chasing a tail that
// is dissolving behind them. Heads paint as AMO_HEAD and demote to AMO_BODY
// once the next pass leaves them behind. Growing onto the player engulfs them.
//
// The three behaviours a level can choose per wave (AMO_VARIANT):
//  - classic (#2411): extend along the head's dir; when shut in, branch out
//    perpendicular on both sides at once.
//  - twophase (the BD II two-phase gait): each head has two modes — DRIVE
//    while the way ahead is open, and CORNER when shut in: it rotates to the
//    first open offer (right turn first, then left) and the new heading
//    PERSISTS into the children. Where classic leaks both perpendiculars and
//    children keep pointing the old way, the two-phase wave turns as one
//    creature — square corner after square corner, a walk you can read.
//  - drop: DOWN is always the head's first offer — poured over a shelf the
//    slime falls into open space; when the floor is reached it resumes its
//    lateral dir, and turns perpendicular when that too is shut.
// Mirror twins are a LEVEL fact, not a law: two waves seeded at opposite walls
// with dirs 180° apart close like a vise; the shared claim law makes their
// fronts advance symmetrically, which is what the gate pins.
function amoeba(g) {
    if (!CFG.amoeba) return
    const grow = g.tick % CFG.amoEvery === 0
    const isAmo = (t) => t === AMO_HEAD || t === AMO_BODY
    // age: decay the old tail, and on a growth tick demote last pass's heads
    for (let i = 0; i < g.grid.length; i++) {
        const t = g.grid[i]
        if (!isAmo(t)) continue
        if (g.amoPass - g.amoGen[i] > CFG.amoGens) { g.grid[i] = EMPTY; if (t === AMO_HEAD) g.amoHead[i] = -1; continue }
        if (grow && t === AMO_HEAD && g.amoGen[i] < g.amoPass) { g.grid[i] = AMO_BODY; g.amoHead[i] = -1 }
    }
    if (!grow) return
    g.amoPass++
    const pass = g.amoPass
    const turn = CFG.amoTurn
    const drop = CFG.amoDrop
    const fork = CFG.amoFork
    // Live front heads per wave entering this pass — the fork cap reads this so
    // a wave that has reached its head budget advances only (containment law).
    const fronts = new Map()
    if (fork) for (let i = 0; i < g.grid.length; i++) {
        if (g.grid[i] === AMO_HEAD && g.amoGen[i] === pass - 1) { const w = g.amoWave[i]; fronts.set(w, (fronts.get(w) || 0) + 1) }
    }
    // one fork per wave per pass — a wave climbs toward its head budget one
    // finger at a time, so the cap is a hard ceiling, not a soft target.
    const forked = new Set()
    const claimsByWave = new Map()
    for (let i = 0; i < g.grid.length; i++) {
        if (!isAmo(g.grid[i]) || g.amoGen[i] !== pass - 1) continue   // heads only
        const x = i % W, y = (i - x) / W
        const k = g.amoHead[i] >= 0 ? g.amoHead[i] : amoDirIdx(g.amoDir)
        const v = g.amoVar[i]
        const w = g.amoWave[i]
        const claim = (tx, ty, nd, ev) => {
            const tt = cell(g, tx, ty)
            if (tt !== EMPTY && tt !== DIAMOND) return false
            const j = idx(tx, ty)
            g.grid[j] = AMO_HEAD
            g.amoGen[j] = pass
            g.amoWave[j] = w
            g.amoVar[j] = v
            g.amoHead[j] = nd
            g.events.push({ type: 'amoeba', x: tx, y: ty, w })
            if (ev) g.events.push({ type: ev, x: tx, y: ty, w })
            if (tt === DIAMOND) g.events.push({ type: 'dissolve', x: tx, y: ty })
            if (g.player.alive && g.player.x === tx && g.player.y === ty) killPlayer(g, 'amoeba')
            claimsByWave.set(w, (claimsByWave.get(w) || 0) + 1)
            return true
        }
        const perpOf = (kk) => [(kk + 1) % 4, (kk + 3) % 4]     // right-turn, left-turn (clockwise order)
        if (v === AMO_DROP && drop) {
            // down first, then the head's own heading, then whichever side opens
            const d = AMO_D4[k]
            if (claim(x, y + 1, k, 'amoDrop')) continue
            if (claim(x + d[0], y + d[1], k)) continue
            for (const pk of [3, 1]) if (claim(x + AMO_D4[pk][0], y + AMO_D4[pk][1], k)) break
            continue
        }
        if (v === AMO_TWOPHASE && turn) {
            // Two-phase gait: heads drive while the way is open, but a head
            // shut in CORNERS — right first, then left — and the new heading
            // PERSISTS into the children (this is where it parts from classic,
            // which leaks both perpendiculars and keeps pointing the old way:
            // the two-phase wave turns as one creature, square corner after
            // square corner). Only when even the corners are taken does it leak
            // perpendiculars like classic, and then it dies out with the tail.
            const d = AMO_D4[k]
            const free = (dx, dy) => { const tt = cell(g, x + dx, y + dy); return tt === EMPTY || tt === DIAMOND }
            let use = k
            if (!free(d[0], d[1])) {
                for (const pk of perpOf(k)) {
                    const p = AMO_D4[pk]
                    if (free(p[0], p[1])) { use = pk; break }
                }
                if (use !== k) g.events.push({ type: 'amoTurn', x, y, w })
            }
            const u = AMO_D4[use]
            if (claim(x + u[0], y + u[1], use)) continue
            // shut in every direction (all offers taken by bodies): as classic,
            // up then down, children inherit the parent's heading
            claim(x + AMO_D4[3][0], y + AMO_D4[3][1], k)
            claim(x + AMO_D4[1][0], y + AMO_D4[1][1], k)
            continue
        }
        if (v === AMO_FORK && fork) {
            // MULTI-HEAD — the BD amoeba that FORKS. The head advances on the
            // same persisted-corner rule as the two-phase gait, THEN plants one
            // perpendicular sibling head at THIS cell (right offer first, then
            // left) so a single origin sprouts fingers that reach around a pillar
            // and enclose space. Each head carries its own heading and corners on
            // its own next pass, so the blob grows several fronts at once — the
            // "rarer multi-head wave shape". Honest containment: growth claims
            // only EMPTY/DIAMOND, and a wave caps its live fronts at
            // CFG.amoForkMax, so past the budget it ADVANCES without forking and
            // the tail dissolves behind it (#2411's never-fills law, multi-head).
            const d = AMO_D4[k]
            const free = (dx, dy) => { const tt = cell(g, x + dx, y + dy); return tt === EMPTY || tt === DIAMOND }
            let use = k
            if (!free(d[0], d[1])) {
                for (const pk of perpOf(k)) { const p = AMO_D4[pk]; if (free(p[0], p[1])) { use = pk; break } }
                if (use !== k) g.events.push({ type: 'amoTurn', x, y, w })
            }
            const u = AMO_D4[use]
            claim(x + u[0], y + u[1], use)
            // then fork one perpendicular sibling from THIS cell — even on a pass
            // where the front also advanced (that is what makes it multi-headed).
            // One fork per wave per pass, and none past the head budget, so the
            // wave climbs to CFG.amoForkMax fingers and holds there (hard ceiling).
            if ((fronts.get(w) || 0) < CFG.amoForkMax && !forked.has(w)) {
                for (const pk of perpOf(use)) { const p = AMO_D4[pk]; if (claim(x + p[0], y + p[1], pk)) { g.events.push({ type: 'amoFork', x, y, w }); forked.add(w); break } }
            }
            continue
        }
        // classic (and any variant whose switch is silenced — the wave falls
        // back to the #2411 law rather than freezing, so mutants read as the
        // rule dying, not the cave breaking). Branch children keep the PARENT'S
        // heading — the #2411 semantics, byte for byte: try ahead, else up,
        // then down, each inheriting dir.
        const d = k >= 0 ? AMO_D4[k] : g.amoDir
        if (claim(x + d[0], y + d[1], k)) continue
        claim(x + AMO_D4[3][0], y + AMO_D4[3][1], k)
        claim(x + AMO_D4[1][0], y + AMO_D4[1][1], k)
    }
    // two waves claiming the SAME pass is the vise closing — worth an event so
    // the gate can pin the mirrored twins as a mechanic, not a layout coincidence
    if (claimsByWave.size >= 2) g.events.push({ type: 'mirror', waves: [...claimsByWave.keys()] })
}

// ------------------------------------------------------------- CA: firefly ----
// Momentum (#2364): the fly HOLDS its heading while the way is open, and when
// an obstacle — steel, boulder, diamond, the world edge — blocks it, it turns
// in the fixed cycle order (down, right, up, left) until a heading opens. So
// it patrols every cell it can reach, and escapes through any corridor the
// player opens into its pit, igniting whatever it flies onto (never steel).
// The turn order never varies, so the planner can still be built to outrun it;
// if travel is silenced the dashcheck FLY RELEASE scenario goes red.
// CFG.flyTravel = false reverts to the original net-zero orbit (rotate every
// tick, steel-only block) — a firefly that could never leave a sealed box.
//
// THE BUTTERFLY FLAP (#2453) — the README's oldest actionable gap said the fly
// "never weaves into the cavern proper the way an original butterfly could":
// momentum-only turning happens exclusively against obstacles, so in a corridor
// the patrol is a fixed shuttle. The originals' butterflies flapped — they
// changed direction on their own in open ground and swept the whole cavern.
// `drift: true` flies therefore ALSO turn on their own, but only where a flap
// can read as one:
//   - the roll is offered only when the way straight ahead is OPEN (EMPTY/FIRE)
//     — mid-bore the fly keeps drilling, so seams and lanes stay honest;
//   - the flap is offered only into cells that are not blocked — in a 1-cell
//     corridor both sides are wall, the flap cannot land, and shuttle patrols
//     stay byte-predictable BY LAW (the FLY PIT chicken-game can never be made
//     unfair by drift);
//   - right first, then left — reversals are a flap the butterfly never makes.
// Zero RNG: the roll is a deterministic hash of (fly id, tick, cell), so the
// whole cave stays a pure function of (level, grid, script) — dashcheck replays
// it twice and demands identical hashes. CFG.flyDrift=false mutes the flaps
// (mutant proof); the flap count rides stateHash only when a level opts in.
const flyRoll = (id, tick, x, y) => {
    let r = Math.imul(id + 0x9e3779b1, 0x85ebca6b) ^ Math.imul(tick + 0x165667b1, 0xc2b2ae35) ^ Math.imul(x * 7919 + y + 0x27d4eb2f, 0x27d4eb2f)
    r ^= r >>> 15; r = Math.imul(r, 0x2545f491); r ^= r >>> 13
    return r >>> 0
}
function fireflies(g) {
    for (const f of g.flies) {
        g.flyAt[idx(f.x, f.y)] = -1
    }
    // obstacles stop the fly dead; open space (air, fire) and dust let it pass.
    // #2411: push walls and live slime are obstacles too — the fly turns off
    // them like steel (SLIME VAULT ships no fly; existing caves have neither).
    // #2453: a BUTTERFLY (digs:false) also treats dust as wall — it never bores
    // or ignites, only flits. Same automaton, different permissions.
    const blockedFor = (f) => (x, y) => {
        if (!inBounds(x, y)) return true
        const t = g.grid[idx(x, y)]
        if (t === STEEL || t === BOULDER || t === DIAMOND || t === PUSHWALL || t === AMO_HEAD || t === AMO_BODY) return true
        return t === DIRT && f.digs === 0
    }
    // dust ahead = the fly is about to bore; #2453 keeps the flap off mid-bore
    // so seam lanes and drilled lines stay honest (see the drift note above).
    const boring = (x, y) => g.grid[idx(x, y)] === DIRT
    for (const f of g.flies) {
        let nx, ny
        const bf = blockedFor(f)
        if (CFG.flyTravel) {
            let d = CFG.fireflyDirs[f.dir]
            for (let tries = 1; bf(f.x + d[0], f.y + d[1]) && tries < CFG.fireflyDirs.length; tries++) {
                f.dir = (f.dir + 1) % CFG.fireflyDirs.length
                d = CFG.fireflyDirs[f.dir]
            }
            nx = f.x + d[0]; ny = f.y + d[1]
            if (bf(nx, ny)) { nx = f.x; ny = f.y }          // boxed on all sides: wait it out
            // #2453 the flap: only with open ground ahead (never mid-bore), and
            // only onto ground that is open too — right first, then left. Both
            // sides wall (any 1-cell corridor) means the flap cannot land.
            if (CFG.flyDrift && f.drift && (nx !== f.x || ny !== f.y) && !boring(nx, ny)) {
                if (flyRoll(f.id, g.tick, f.x, f.y) % CFG.flyDriftOdds === 0) {
                    for (const turn of [1, 3]) {
                        const cd = (f.dir + turn) % CFG.fireflyDirs.length
                        const cdd = CFG.fireflyDirs[cd]
                        if (!bf(f.x + cdd[0], f.y + cdd[1])) {
                            f.dir = cd; f.flaps++
                            g.events.push({ type: 'drift', x: f.x, y: f.y, dir: cd })
                            break
                        }
                    }
                    d = CFG.fireflyDirs[f.dir]
                    nx = f.x + d[0]; ny = f.y + d[1]
                }
            }
        } else {
            const d = CFG.fireflyDirs[f.dir]
            nx = f.x + d[0]; ny = f.y + d[1]
            if (!inBounds(nx, ny) || g.grid[idx(nx, ny)] === STEEL) { nx = f.x; ny = f.y }
            f.dir = (f.dir + 1) % CFG.fireflyDirs.length
        }
        if (nx !== f.x || ny !== f.y) {
            f.x = nx; f.y = ny
            if (CFG.flyIgnite && f.ignites !== 0 && g.grid[idx(nx, ny)] !== FIRE) {
                g.grid[idx(nx, ny)] = FIRE
                g.burn[idx(nx, ny)] = CFG.burn
                g.events.push({ type: 'ignite', x: nx, y: ny })
            }
            if (g.player.alive && g.player.x === nx && g.player.y === ny) killPlayer(g, 'fly')
        }
    }
    for (const f of g.flies) if (inBounds(f.x, f.y)) g.flyAt[idx(f.x, f.y)] = f.id
}

// --------------------------------------------------------------- the tick ----
export function step(g) {
    g.events.length = 0
    if (g.end) return g
    g.tick++

    gravity(g)
    fire(g)
    amoeba(g)
    fireflies(g)

    // a boulder could roll the very tick a gem converted, and a fire could burn
    // out from under a resting rock — settle the standing test after all CA
    if (g.player.alive && cell(g, g.player.x, g.player.y) === FIRE) killPlayer(g, 'fire')

    if (!g.player.alive) return g
    if (g.tick >= g.level.timeTicks) {
        g.end = 'time'
        g.win = g.have >= g.need ? g.win : false
        g.events.push({ type: 'time' })
    }
    return g
}

// ------------------------------------------------------------- the planner ----
// The gate's witness, and the attract demo. It speaks only like a player: at
// most one arrow move every CFG.moveEvery ticks, chosen by a breadth-first dig
// route to the nearest gem (then to the exit). No peeks at solutions, no RNG.
// If this cannot bring the quota home and reach the exit with the cave's own
// hazards live, the level is not winnable and dashcheck must fail the build.

// Cells the planner may occupy en route: empty, dirt (dig it), or a gem (its
// target, entered once). Boulders, fire, steel and fly cells are walls/void to
// a route that has to survive.
function bfsField(g, startCells) {
    const dist = new Int16Array(W * H).fill(-1)
    const q = []
    for (const i of startCells) { dist[i] = 0; q.push(i) }
    for (let head = 0; head < q.length; head++) {
        const i = q[head], x = i % W, y = (i - x) / W, d = dist[i]
        // a gem is a door the route enters and then stops at — never a corridor,
        // so the planner never tunnels THROUGH a vein (which is how gems fall
        // out from under themselves and turn to dirt).
        if (g.grid[i] === DIAMOND && dist[i] > 0) continue
        if (g.flyAt[i] >= 0) continue
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy
            if (!inBounds(nx, ny)) continue
            const j = idx(nx, ny); const t = g.grid[j]
            if (t === STEEL || t === BOULDER || t === FIRE || g.flyAt[j] >= 0) continue
            if (t === AMO_HEAD || t === AMO_BODY) continue                 // slime is void to a route
            if (t === PUSHWALL) {
                // #2411: a push wall is a DOOR the route can open — one shove
                // moves it and the player into its cell (j), and a second
                // clears the far cell (k). Only sideways (BD lifts nothing),
                // and only if the cell beyond gives: empty, fire, or — when
                // crushing is live — a rock the wall slams through.
                if (!CFG.push || dx === 0) continue
                const kx = nx + dx, ky = ny + dy
                const b = cell(g, kx, ky)
                const gives = b === EMPTY || b === FIRE || ((b === BOULDER || b === DIAMOND) && CFG.pushCrush)
                if (!gives) continue
                if (dist[j] === -1) { dist[j] = d + 1; q.push(j) }
                const kk = idx(kx, ky)
                if (inBounds(kx, ky) && dist[kk] === -1) { dist[kk] = d + 2; q.push(kk) }
                continue
            }
            if (dist[j] === -1) { dist[j] = d + 1; q.push(j) }
        }
    }
    return dist
}

// one arrow move toward the nearest target cell (gem while short, else exit).
// returns the dir string, or null when nothing is reachable.
export function planStep(g) {
    const p = g.player
    if (g.end || !p.alive) return null
    const wantGem = g.have < g.need
    const field = bfsField(g, [idx(p.x, p.y)])
    let best = -1, bestD = Infinity
    if (wantGem) {
        for (let i = 0; i < g.grid.length; i++) {
            if (g.grid[i] === DIAMOND && field[i] >= 0 && field[i] < bestD) { bestD = field[i]; best = i }
        }
    } else {
        const e = idx(g.exit.x, g.exit.y)
        if (field[e] >= 0) { best = e; bestD = field[e] }
    }
    if (best < 0) return null
    const d = field[best]
    const tx = best % W, ty = (best - tx) / W
    // walk downhill on the distance field back toward the player
    let cx = tx, cy = ty, cd = d
    while (cd > 1) {
        let found = false
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = cx + dx, ny = cy + dy
            if (!inBounds(nx, ny)) continue
            const j = idx(nx, ny)
            if (field[j] >= 0 && field[j] === cd - 1) { cx = nx; cy = ny; cd = field[j]; found = true; break }
        }
        if (!found) break
    }
    const ax = cx - p.x, ay = cy - p.y
    if (ax === 1) return 'ArrowRight'
    if (ax === -1) return 'ArrowLeft'
    if (ay === 1) return 'ArrowDown'
    if (ay === -1) return 'ArrowUp'
    return null
}

// Drive the live game with the planner to completion, recording the move
// script. Returns { cmds, have, win, end, score }.
export function planRun(g) {
    while (!g.end && g.tick < g.level.timeTicks) {
        if (g.tick % CFG.moveEvery === 0) {
            const dir = planStep(g)
            if (dir) playerMove(g, dir)
        }
        step(g)
    }
    return { cmds: g.cmds.map(c => ({ ...c })), have: g.have, win: g.win, end: g.end, score: g.score }
}

// Apply a recorded script to a fresh game — used by attract mode (a replay of
// the planner's proven route) and by dashcheck's determinism proof. A move with
// stamp `tick` takes effect at the START of that tick, exactly as planRun did.
export function replay(level, grid, cmds, opts = {}) {
    const g = makeGame(level, grid)
    const byTick = new Map()
    for (const c of cmds) {
        if (!byTick.has(c.tick)) byTick.set(c.tick, [])
        byTick.get(c.tick).push(c)
    }
    const max = opts.maxTicks || level.timeTicks + 30
    while (!g.end && g.tick < max) {
        const todo = byTick.get(g.tick)
        if (todo) for (const c of todo) playerMove(g, c.dir)
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}
