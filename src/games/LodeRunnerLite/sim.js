// LODE RUNNER-LITE — the simulation. No DOM, no React, no canvas, and no
// Math.random anywhere: the vault is a pure function of (level, input script).
// That is what lets `scripts/lodecheck.mjs` import this file in plain Node and
// prove a vault winnable BEFORE a browser is ever opened.
//
// The rules are the 1983 classic, and every one of them is load-bearing and
// pinned by lodecheck (a mutant that silences one must turn a check red):
//
// - NO JUMP. The runner moves by run, climb, hang on ropes and fall. There is
//   no arc, no leap, no mid-air steer — a rising body does not exist, because
//   nothing rises.
// - DIAGONAL DIG. Down digs the brick one cell diagonally below-left or
//   below-right, the way you are FACING (the last run direction). The brick
//   straight down is never dug. A dig opens a HOLE.
// - REFILLING HOLES. A hole is a pit that lasts about 5 s (CFG.refill ticks)
//   and then the brick grows back. Whatever is standing in the cell when it
//   refills dies: a guard respawns at the top of the vault, the runner loses a
//   life. So a dug hole is a trap with a fuse, not a permanent grave.
// - GUARDS FALL AND CLIMB. A guard that drops into a hole is pinned there for
//   a breath (CFG.guardTrap), then climbs out cell by cell. A shaft too deep
//   to climb before the fuse runs out buries the guard when the brick closes.
//   Guards also steal gold they walk over and drop it a moment later.
// - THE LADDER APPEARS. The vault's exit is a hidden ladder up to the top of
//   the screen. It is not climbable until every gold is in the runner's hands;
//   collect them all and the ladder reveals, and climbing off the top clears
//   the vault. There is no clock and no fixed gate cell.
//
// Geometry: cell (col,row), row 0 at the top, gravity toward larger row. An
// entity OCCUPIES one cell; standing means the cell straight below is a
// support (BRICK/SOLID/LADDER). HANGING means the cell straight ABOVE is ROPE
// (you dangle one cell under the rope line). Airborne is a fall: vy += 1/tick
// (cap 2), a falling body grabs any rope it passes under and any ladder it
// passes through. Mid-fall is committed.

export const W = 34
export const H = 19
export const SIM_HZ = 15                     // sim ticks per world second

export const EMPTY = 0
export const BRICK = 1                       // diggable floor
export const SOLID = 2                       // concrete: never diggable
export const ROPE = 3
export const LADDER = 4
export const GOLD = 5                        // enterable; collecting empties it

export const CFG = {
    moveEvery: 2,                            // ticks between player actions (pace)
    guardPace: 4,                            // ticks between guard decisions
    refill: 75,                              // ticks (~5 s) a hole holds before it refills
    guardTrap: 60,                           // ticks a guard is pinned in a hole before it climbs
    guardCarry: 30,                          // ticks a guard carries stolen gold before it drops
    lives: 3,
    dangerMargin: 8,                         // ticks of guard slack the solver refuses to burn
    // Engine switches. All normal in play; they exist ONLY so
    // `lodecheck --mutate` can prove each rule load-bearing (a child run
    // silences one and the matching check must go red).
    dig: true,                               // Down digs the diagonal brick
    guardChase: true,                        // guards replan toward the player
    ropeCatch: true,                         // a falling body grabs a rope overhead
    guardHole: true,                         // guards fall in holes, climb out / get buried
    goldSteal: true,                         // guards pick up gold and drop it
    ladderGate: true,                        // the exit ladder needs every gold
}

export const ACTS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

const idx = (x, y) => y * W + x
const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const solidT = (t) => t === BRICK || t === SOLID
const supportT = (t) => t === BRICK || t === SOLID || t === LADDER
const cellT = (g, x, y) => (!inB(x, y) ? SOLID : g.grid[idx(x, y)])

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

// Everything the future can depend on. Two scripts that drive the vault must
// produce identical hashes; a stream with one action dropped must not.
export function stateHash(g) {
    let s = `${g.tick}|${g.have}|${g.score}|${g.lives}|${g.end}|${g.win ? 1 : 0}|${g.unlocked ? 1 : 0}`
    for (const e of g.ents) s += `|e${e.x},${e.y},${e.mode[0]},${e.alive ? 1 : 0},${e.vx},${e.vy},${e.face},${e.trapCount},${e.carry ? 1 : 0}`
    for (let i = 0; i < g.grid.length; i++) {
        s += String.fromCharCode(48 + g.grid[i])
        if (g.holeAge[i]) s += `:${g.holeAge[i]}`
    }
    return hash(s)
}

function push(g, e) { if (!g.search) g.events.push(e) }

// Compute the hidden exit-ladder cells from the raw level grid BEFORE they are
// concealed: the run of LADDER cells in the exit column from the top exit cell
// down to the floor. Reveal = set them back to LADDER once every gold is held.
export function makeGame(meta, grid) {
    const mk = (x, y, isGuard, id, home) => ({ x, y, mode: 'stand', vx: 0, vy: 0, face: 1, alive: true, isGuard, id, home, trapCount: 0, carry: false, carryCount: 0 })
    const g = {
        meta,
        grid: Uint8Array.from(grid),
        holeAge: new Int16Array(W * H),
        tick: 0,
        end: null,                                    // null|'clear'|'dead'
        win: false,
        score: 0,
        have: 0,
        need: meta.need,
        unlocked: false,
        lives: meta.lives ?? CFG.lives,
        exit: { ...meta.exit },
        player: mk(meta.spawn.x, meta.spawn.y, false, -1, null),
        guards: (meta.guards || []).map((gd, i) => mk(gd.x, gd.y, true, i, { x: gd.x, y: gd.y })),
        guardDist: (meta.guards || []).map(() => Infinity),
        cmds: [],                                     // recorded {tick,act}
        events: [],
    }
    g.ents = [g.player, ...g.guards]
    g.exitLadder = []
    if (g.exit) {
        for (let y = 0; y < H; y++) {
            const i = idx(g.exit.x, y)
            if (grid[i] === LADDER) g.exitLadder.push(i)
        }
        if (g.exitLadder.length) for (const i of g.exitLadder) g.grid[i] = EMPTY   // hide it until the gold is all in
    }
    return g
}

function goldCollect(g, e) {
    if (g.search || cellT(g, e.x, e.y) !== GOLD) return
    g.grid[idx(e.x, e.y)] = EMPTY
    g.have++
    g.score += 500
    push(g, { type: 'gold', have: g.have })
    if (g.have >= g.need && !g.unlocked) { g.unlocked = true; revealLadder(g); push(g, { type: 'unlock' }) }
}

function revealLadder(g) {
    if (!g.unlocked || !g.exitLadder.length) return
    for (const i of g.exitLadder) g.grid[i] = LADDER
}

// A hole opens a pit: the brick becomes air and its fuse starts running.
function digHole(g, x, y) {
    g.grid[idx(x, y)] = EMPTY
    g.holeAge[idx(x, y)] = 1
    push(g, { type: 'dig', x, y })
}

function checkExit(g, e) {
    if (e.isGuard || g.end) return
    if (e.x === g.exit.x && e.y === g.exit.y && (!CFG.ladderGate || g.have >= g.need)) {
        g.end = 'clear'; g.win = true
        g.score += 1000
        push(g, { type: 'win' })
    }
}

function loseLife(g, cause) {
    g.lives--
    push(g, { type: 'life', lives: g.lives, cause })
    if (g.lives <= 0) {
        g.end = 'dead'; g.win = false
        push(g, { type: 'die', cause })
        return
    }
    // the vault keeps its holes, gold and nerve — only the runner (and the
    // guards' positions) reset. That is what makes the vault recoverable
    // without a page reload, and what makes lives a real supply.
    const p = g.player
    p.x = g.meta.spawn.x; p.y = g.meta.spawn.y
    p.mode = 'stand'; p.vx = 0; p.vy = 0; p.alive = true; p.face = 1; p.trapCount = 0
    for (const gd of g.guards) {
        if (!gd.alive) continue
        gd.x = gd.home.x; gd.y = gd.home.y; gd.mode = 'stand'; gd.vx = 0; gd.vy = 0; gd.trapCount = 0
    }
}

function killFall(g, e) {
    if (e.isGuard) { e.alive = false; push(g, { type: 'guardGone', id: e.id }); return }
    e.alive = false
    loseLife(g, 'fall')
}

// Guard gold: a guard that steps onto a nugget pockets it, then drops it a
// moment later — the runner must recover it before the exit opens.
// Steal: a guard that steps onto a nugget pockets it. Dropping is on the clock
// in step() (a guard that stands still still drops it), so a carried gold can
// never wedge a vault shut.
function guardGold(g, gd) {
    if (gd.carry || !CFG.goldSteal) return
    if (cellT(g, gd.x, gd.y) === GOLD) {
        g.grid[idx(gd.x, gd.y)] = EMPTY
        gd.carry = true; gd.carryCount = 0
        push(g, { type: 'goldPickup', id: gd.id, x: gd.x, y: gd.y })
    }
}

// One place an entity lands in a cell: the runner pockets gold and the exit
// is tested; a guard pockets gold it can drop later. Keeps goldCollect from
// ever crediting a guard, and guardGold from ever touching the runner.
function arrive(g, e) {
    if (e.isGuard) guardGold(g, e)
    else { goldCollect(g, e); checkExit(g, e) }
}

// ------------------------------------------------------------- the move rules ----
// ONE generator drives everyone: the player, every guard, and — through the
// snapshot walk below — the autopilot's search. That is the honesty contract:
// a solver that cheated with phantom moves would win vaults a human cannot.
// act: 'ArrowLeft|ArrowRight|ArrowUp|ArrowDown'.
// Returns true when the action changed the world (input was legal).
export function applyAction(g, e, act, opts = {}) {
    if (!act || g.end || !e.alive || e.mode === 'air') return false
    const allowDig = opts.dig !== false && !g.search
    const D = act === 'ArrowLeft' ? -1 : act === 'ArrowRight' ? 1 : undefined

    if (e.mode === 'stand') {
        if (D !== undefined) {
            e.face = D                                  // the way you run is the way you face
            const nx = e.x + D
            const t = cellT(g, nx, e.y)
            if (t === LADDER) { e.x = nx; e.mode = 'climb'; arrive(g, e); return true }
            if (t === EMPTY || t === GOLD) {
                if (supportT(cellT(g, nx, e.y + 1))) { e.x = nx; arrive(g, e); return true }
                return false                              // a hole: you cannot walk into a pit from the side
            }
            return false                                // brick/concrete/rope: blocked
        }
        if (act === 'ArrowUp') {
            if (cellT(g, e.x, e.y - 1) === LADDER) { e.y--; e.mode = 'climb'; arrive(g, e); return true }
            if (cellT(g, e.x, e.y - 1) === ROPE) { e.mode = 'hang'; push(g, { type: 'grab', x: e.x, y: e.y }); return true }
            return false
        }
        if (act === 'ArrowDown') {
            const b = cellT(g, e.x, e.y + 1)
            if (b === LADDER) { e.y++; e.mode = 'climb'; return true }
            if (b === EMPTY || b === GOLD) { e.mode = 'air'; e.vy = 0; return true }   // step off into a hole
            if (allowDig && CFG.dig) {
                const tx = e.x + e.face                   // the diagonal brick below the way you face
                if (cellT(g, tx, e.y + 1) === BRICK) { digHole(g, tx, e.y + 1); return true }
            }
            return false
        }
        return false
    }

    if (e.mode === 'hang') {
        if (D !== undefined) {
            const nx = e.x + D
            if (cellT(g, nx, e.y - 1) !== ROPE) return false
            const t = cellT(g, nx, e.y)
            if (solidT(t)) return false
            e.x = nx; e.face = D; push(g, { type: 'swing', x: nx, y: e.y }); arrive(g, e)
            return true
        }
        if (act === 'ArrowUp') {
            if (cellT(g, e.x, e.y - 1) !== ROPE) return false
            e.y--
            if (cellT(g, e.x, e.y - 1) === ROPE) { e.mode = 'hang' }
            else { e.mode = 'air'; e.vy = 0 }            // climbed to the top of the line: let go
            return true
        }
        if (act === 'ArrowDown') {
            if (cellT(g, e.x, e.y + 1) === LADDER) { e.y++; e.mode = 'climb'; return true }
            e.mode = 'air'; e.vy = 0                     // let go and fall
            return true
        }
        return false
    }

    if (e.mode === 'climb') {
        if (act === 'ArrowUp') {
            const up = cellT(g, e.x, e.y - 1)
            if (up === LADDER) { e.y--; arrive(g, e); return true }
            if (up === ROPE) { e.mode = 'hang'; push(g, { type: 'grab', x: e.x, y: e.y }); return true }   // top rung under a line: dangle
            e.mode = 'air'; e.vy = 0                     // climbed off the top of a ladder
            return true
        }
        if (act === 'ArrowDown') {
            if (cellT(g, e.x, e.y + 1) === LADDER) { e.y++; return true }
            const b = cellT(g, e.x, e.y + 1)
            if (b === EMPTY || b === GOLD) { e.mode = 'air'; e.vy = 0; return true }
            return false
        }
        if (D !== undefined) {
            const nx = e.x + D
            const t = cellT(g, nx, e.y)
            if (t === LADDER) { e.x = nx; e.face = D; return true }
            if ((t === EMPTY || t === GOLD) && supportT(cellT(g, nx, e.y + 1))) {
                e.x = nx; e.face = D; e.mode = 'stand'; arrive(g, e); return true
            }
            if (t === EMPTY && cellT(g, nx, e.y - 1) === ROPE) {
                e.x = nx; e.face = D; e.mode = 'hang'; return true   // step sideways onto a rope line
            }
            return false
        }
        return false
    }

    return false        // airborne: physics owns you, not input
}

// one airborne tick: gravity, drift, landings, catches.
function airTick(g, e) {
    if (e.mode !== 'air') return
    e.vy = Math.min(e.vy + 1, 2)
    if (e.vx) {
        const nx = e.x + Math.sign(e.vx)
        if (inB(nx, e.y) && !solidT(g.grid[idx(nx, e.y)])) e.x = nx
        else e.vx = 0
    }
    for (let s = 0; s < Math.abs(e.vy); s++) {
        if (!inB(e.x, e.y)) { killFall(g, e); return }
        if (supportT(cellT(g, e.x, e.y + 1))) { e.mode = 'stand'; e.vy = 0; arrive(g, e); return }
        if (e.y + 1 >= H || g.grid[idx(e.x, e.y + 1)] === SOLID) { killFall(g, e); return }
        e.y++
        if (!inB(e.x, e.y)) { killFall(g, e); return }
        if (g.grid[idx(e.x, e.y)] === LADDER) { e.mode = 'climb'; e.vy = 0; arrive(g, e); return }
        if (CFG.ropeCatch && g.grid[idx(e.x, e.y - 1)] === ROPE) { e.mode = 'hang'; e.vx = 0; e.vy = 0; push(g, { type: 'grab', x: e.x, y: e.y }); return }
        arrive(g, e)
    }
    if (e.mode === 'air' && e.vy <= 0) {
        if (e.y + 1 < H && supportT(g.grid[idx(e.x, e.y + 1)])) e.mode = 'stand'
        else if (e.y >= H) killFall(g, e)
    }
}

// --------------------------------------------------------------- the guards ----
// BFS over cells the guard can occupy, derived from the SAME physics the
// player obeys — minus dig (guards never dig) and rope-hang (a guard can only
// fall onto a rope, never climb it), so a hanging runner is a cell no guard
// can file a route through. A guard replans every CFG.guardPace ticks toward
// the player.
function guardField(g, from) {
    const dist = new Int32Array(W * H).fill(-1)
    const start = from.y * W + from.x
    dist[start] = 0
    const q = [start]
    for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i - x) / W, d = dist[i]
        const here = g.grid[i]
        const hereStand = supportT(cellT(g, x, y + 1)) || here === LADDER
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx, ny = y + dy
            if (!inB(nx, ny)) continue
            const j = idx(nx, ny)
            if (dist[j] !== -1) continue
            const t = g.grid[j]
            if (solidT(t)) continue
            const standable = supportT(cellT(g, nx, ny + 1))
            if (standable || t === LADDER) { dist[j] = d + 1; q.push(j); continue }
            // stepping DOWN off a standable cell (or a ladder) into open air is
            // a fall the guard will take — the column below is walkable at its
            // bottom, and the hole is waiting.
            if (dy === 1 && t === EMPTY && hereStand) { dist[j] = d + 1; q.push(j) }
        }
    }
    return dist
}

function guardAct(g, gd) {
    if (gd.mode === 'air' || !CFG.guardChase) return false
    // pinned in a hole: step() runs its clock and the climb-out; it just stands
    if (CFG.guardHole && g.holeAge[idx(gd.x, gd.y)] > 0) return false
    const p = g.player
    if (!p.alive) return false
    const field = guardField(g, p)
    const pd = field[idx(gd.x, gd.y)]
    if (pd < 0) return false                       // cannot reach the player: stand post
    if (pd < g.guardDist[gd.id] - 0.5) push(g, { type: 'pursued', id: gd.id, d: pd })
    g.guardDist[gd.id] = pd
    const cand = [[gd.x - 1, gd.y, 'ArrowLeft'], [gd.x + 1, gd.y, 'ArrowRight'], [gd.x, gd.y - 1, 'ArrowUp'], [gd.x, gd.y + 1, 'ArrowDown']]
    let best = null, bestD = field[idx(gd.x, gd.y)]
    for (const [nx, ny, act] of cand) {
        if (!inB(nx, ny)) continue
        const d = field[idx(nx, ny)]
        if (d >= 0 && d < bestD) { bestD = d; best = act }
    }
    if (!best) return false
    return applyAction(g, gd, best, { dig: false })
}

// ---------------------------------------------------------------- the tick ----
export function step(g) {
    g.events.length = 0
    if (g.end) return g
    g.tick++

    // 1) holes age; a refilled hole grows its brick back and kills its rider
    for (let i = 0; i < g.holeAge.length; i++) {
        if (!g.holeAge[i]) continue
        g.holeAge[i]++
        if (g.holeAge[i] < CFG.refill) continue
        const tx = i % W, ty = (i - tx) / W
        g.holeAge[i] = 0
        g.grid[i] = BRICK
        push(g, { type: 'refill', x: tx, y: ty })
        for (const e of g.ents) {
            if (!e.alive || e.mode !== 'stand' || e.x !== tx || e.y !== ty) continue
            if (e.isGuard) {
                // dies in the hole and re-enters at the top of the vault
                e.x = e.home.x; e.y = e.home.y; e.mode = 'stand'; e.trapCount = 0; e.carry = false; e.carryCount = 0
                push(g, { type: 'guardBuried', id: e.id })
            } else {
                push(g, { type: 'refillDeath', x: tx, y: ty })
                loseLife(g, 'refill')
            }
        }
    }

    // 2) a guard that has carried stolen gold long enough drops it where it stands
    for (const gd of g.guards) {
        if (!gd.alive || !gd.carry) continue
        if (++gd.carryCount < CFG.guardCarry) continue
        if (cellT(g, gd.x, gd.y) === EMPTY) {
            g.grid[idx(gd.x, gd.y)] = GOLD
            push(g, { type: 'goldDrop', id: gd.id, x: gd.x, y: gd.y })
        }
        gd.carry = false; gd.carryCount = 0
    }

    // 3) a guard in a hole sits it out on its own clock, then climbs back to the floor
    for (const gd of g.guards) {
        if (!gd.alive || gd.mode !== 'stand') continue
        const inHole = CFG.guardHole && g.holeAge[idx(gd.x, gd.y)] > 0
        if (!inHole) { gd.trapCount = 0; continue }
        gd.trapCount++
        if (gd.trapCount >= CFG.guardTrap && cellT(g, gd.x, gd.y - 1) === EMPTY) {
            gd.y--; gd.trapCount = 0
            push(g, { type: 'climbOut', id: gd.id })
        }
    }

    // 3) the player's stamped action was applied by the shell/replay at this
    //    tick (exactly as a held key reaches the loop); guards act on pace
    if (g.tick % CFG.guardPace === 0) {
        for (const gd of g.guards) if (gd.alive) guardAct(g, gd)
    }

    // 4) physics for anything airborne
    for (const e of g.ents) if (e.alive && e.mode === 'air') airTick(g, e)

    // 5) capture: a guard in your cell takes you
    const p = g.player
    if (p.alive) {
        for (const gd of g.guards) {
            if (gd.alive && gd.x === p.x && gd.y === p.y) { push(g, { type: 'capture', id: gd.id }); loseLife(g, 'caught'); break }
        }
    }

    return g
}

// ------------------------------------------------------------------ solver ----
// The gate's witness and the attract demo's source. It speaks ONLY as a
// player does — one legal action every CFG.moveEvery ticks — and its
// breadth-first search walks the SAME state graph applyAction defines, minus
// dig: digging is the player's defensive tool (a hole for a guard to fall
// in), never a route the runner takes, so the solver reaches every gold and
// the exit by run, climb and rope alone. If a vault needs a dig to clear,
// that vault is unclassic and lodecheck's winnability gate fails it.
// Guards enter the search as a danger field (their own reachable set at their
// real pace); the solver will not arrive at a cell later than a guard minus
// the margin, unless it hangs on a rope (guards cannot hang).

const MODE_ID = { stand: 0, climb: 1, hang: 2 }

function miniGrid(g) {
    return { search: true, end: null, grid: g.grid, meta: g.meta, have: g.have, need: g.need, exit: g.exit, events: [], unlocked: g.unlocked, lives: 1, player: { x: 0, y: 0, mode: 'stand', alive: true }, guards: [] }
}

function stepEdge(g, mini, e, act) {
    const n = { ...e, isGuard: false }
    return applyAction(mini, n, act, { dig: false }) ? n : null
}

// Letting go of a rope, stepping off a ladder or dropping into a hole puts the
// runner airborne — a state applyAction will not expand. So the search settles
// the fall with the SAME airTick the sim runs, and reports where it lands.
// A fall that kills the runner (off the bottom of the vault) is a dead end.
function settleAir(mini, n) {
    for (let t = 0; t < 40 && n.mode === 'air' && n.alive && !mini.end; t++) airTick(mini, n)
    return (n.mode === 'air' || !n.alive) ? null : n
}

function successors(g, mini, e, targets) {
    const out = []
    const clean = () => { mini.end = null; mini.lives = 1 }
    for (const act of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        let n = stepEdge(g, mini, e, act); clean()
        if (!n) continue
        if (n.mode === 'air') { n = settleAir(mini, n); clean(); if (!n) continue }
        const cell = idx(n.x, n.y)
        if (targets.has(cell)) { out.push({ act, e: n, goal: true }); continue }
        if (g.grid[cell] === GOLD) continue               // gold is a door-to-stop-at, not a corridor
        out.push({ act, e: n })
    }
    return out
}

function dangerField(g) {
    const danger = new Int32Array(W * H).fill(-1)
    for (const gd of g.guards) {
        if (!gd.alive) continue
        const f = guardField(g, gd)
        for (let i = 0; i < W * H; i++) {
            if (f[i] < 0) continue
            const t = g.tick + f[i] * CFG.guardPace
            danger[i] = danger[i] === -1 ? t : Math.min(danger[i], t)
        }
    }
    return danger
}

// `slack` is how many ticks of guard-arrival margin a cell must keep. The
// first pass demands CFG.dangerMargin; a SECOND pass at slack=-Infinity runs
// when the first maps nothing — because "no safe move" must not mean "stand
// still and be arrested". A runner with no safe route keeps heading for its
// target and takes its chances; only if even the unguarded search finds
// nothing does it stop.
function searchOnce(g, mini, start, targets, danger, slack) {
    const key = (e) => (e.y * W + e.x) * 4 + (MODE_ID[e.mode] ?? 3)
    const seen = new Set([key(start)])
    const parent = new Map()
    const q = [{ e: start, d: 0 }]
    let found = null
    for (let h = 0; h < q.length && !found; h++) {
        const { e: cur, d } = q[h]
        const arriveTick = g.tick + (d + 1) * CFG.moveEvery
        for (const s of successors(g, mini, cur, targets)) {
            const k = key(s.e)
            if (seen.has(k)) continue
            const cell = idx(s.e.x, s.e.y)
            const dk = danger[cell]
            if (dk !== -1 && dk <= arriveTick + (s.e.mode === 'hang' ? 0 : slack)) continue
            seen.add(k)
            parent.set(k, { pk: key(cur), act: s.act })
            if (s.goal) { found = k; break }
            q.push({ e: s.e, d: d + 1 })
        }
    }
    if (!found) return null
    let k = found
    while (true) {
        const par = parent.get(k)
        if (!par) break
        if (!parent.has(par.pk)) return par.act
        k = par.pk
    }
    return null
}

export function planStep(g) {
    const p = g.player
    if (g.end || !p.alive) return null
    const danger = dangerField(g)
    const targets = new Set()
    if (g.have < g.need) {
        for (let i = 0; i < g.grid.length; i++) if (g.grid[i] === GOLD) targets.add(i)
        if (!targets.size) {
            // every nugget is being carried — head for the nearest carrier,
            // whose drop point is the only place the last gold can be.
            let best = Infinity, bx = -1, by = -1
            for (const gd of g.guards) {
                if (!gd.alive || !gd.carry) continue
                const d = Math.abs(gd.x - p.x) + Math.abs(gd.y - p.y)
                if (d < best) { best = d; bx = gd.x; by = gd.y }
            }
            if (bx < 0) return null
            targets.add(idx(bx, by))
        }
    } else {
        targets.add(idx(g.exit.x, g.exit.y))
    }
    if (!targets.size) return null
    const mini = miniGrid(g)
    const start = { x: p.x, y: p.y, mode: p.mode, face: p.face, vx: 0, vy: 0, alive: true }
    let act = searchOnce(g, mini, start, targets, danger, CFG.dangerMargin)
    if (!act) act = searchOnce(g, mini, start, targets, danger, -Infinity)
    return act
}

export function planRun(g, opts = {}) {
    const maxTicks = opts.maxTicks || 6000
    while (!g.end && g.tick < maxTicks) {
        if (g.tick % CFG.moveEvery === 0) {
            const act = planStep(g)
            if (act && applyAction(g, g.player, act, { dig: true })) {
                g.cmds.push({ tick: g.tick, act })
            }
        }
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return { cmds: g.cmds.map(c => ({ ...c })), have: g.have, win: g.win, end: g.end, score: g.score }
}

// Re-apply a recorded stream to a fresh vault. Attract mode IS this.
export function replay(meta, grid, cmds, opts = {}) {
    const g = makeGame(meta, grid)
    const byTick = new Map()
    for (const c of cmds) {
        if (!byTick.has(c.tick)) byTick.set(c.tick, [])
        byTick.get(c.tick).push(c)
    }
    const max = opts.maxTicks || 6000
    while (!g.end && g.tick < max) {
        const todo = byTick.get(g.tick)
        if (todo) for (const c of todo) applyAction(g, g.player, c.act, { dig: true })
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}
