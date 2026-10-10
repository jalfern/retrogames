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
// a third automaton: a fixed four-move cycle that touches everything it flies
// over into flame, so standing still near one is fatal and the clock is shared.
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
// - The firefly cycle is fixed (down, right, up, left): its path is therefore
//   knowable, and the level can be built so the planned route outruns it.

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
    fallKill: true,                     // a falling boulder crushes the player
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
    for (const f of g.flies) s += `|f${f.x},${f.y},${f.dir}`
    for (let i = 0; i < g.grid.length; i++) s += String.fromCharCode(48 + g.grid[i] + (g.grid[i] === FIRE ? g.burn[i] : 0))
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
        flies: (level.flies || []).map((f, i) => ({ id: i, x: f.x, y: f.y, dir: f.dir | 0 })),
        movingB: new Set(),                             // boulder cell-indices in motion last tick
        movingD: new Set(),                             // gem cell-indices in motion last tick
        cmds: [],                                       // recorded {tick,dir} — replay fuel
        events: [],
    }
    for (const f of g.flies) if (inBounds(f.x, f.y)) g.flyAt[idx(f.x, f.y)] = f.id
    return g
}

function killPlayer(g, cause) {
    if (!g.player.alive) return
    g.player.alive = false
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
    if (t === FIRE) { killPlayer(g, 'fire'); return false }

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
            if (t !== BOULDER && t !== DIAMOND) continue
            const moving = t === BOULDER ? g.movingB.has(i) : g.movingD.has(i)
            const below = cell(g, x, y + 1)
            if (below === EMPTY || below === FIRE) {
                g.grid[i] = EMPTY
                g.grid[idx(x, y + 1)] = t
                if (below === FIRE) g.burn[idx(x, y + 1)] = 0
                if (t === BOULDER) mvB.add(idx(x, y + 1)); else mvD.add(idx(x, y + 1))
                g.events.push({ type: 'fell', x, y: y + 1, kind: t })
                if (t === BOULDER && CFG.fallKill && g.player.alive && g.player.x === x && g.player.y === y + 1) {
                    killPlayer(g, 'boulder')
                }
                continue
            }
            // blocked straight down by another rock: try to level out sideways
            if (CFG.roll && (below === BOULDER || below === DIAMOND)) {
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

// ------------------------------------------------------------- CA: firefly ----
// Fixed four-move cycle; ignites whatever it flies onto (never steel). Because
// the cycle never varies, the planner can be built to outrun it — and if the
// cycle is disturbed the dashcheck firefly pin goes red.
function fireflies(g) {
    for (const f of g.flies) {
        g.flyAt[idx(f.x, f.y)] = -1
    }
    for (const f of g.flies) {
        const d = CFG.fireflyDirs[f.dir]
        const nx = f.x + d[0], ny = f.y + d[1]
        if (inBounds(nx, ny) && cell(g, nx, ny) !== STEEL) {
            f.x = nx; f.y = ny
            if (CFG.flyIgnite && g.grid[idx(nx, ny)] !== FIRE) {
                g.grid[idx(nx, ny)] = FIRE
                g.burn[idx(nx, ny)] = CFG.burn
                g.events.push({ type: 'ignite', x: nx, y: ny })
            }
            if (g.player.alive && g.player.x === nx && g.player.y === ny) killPlayer(g, 'fire')
        }
        f.dir = (f.dir + 1) % CFG.fireflyDirs.length
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
