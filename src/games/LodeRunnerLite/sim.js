// LODE RUNNER-LITE — the simulation. No DOM, no React, no canvas, and no
// Math.random anywhere: the vault is a pure function of (level, input script).
// That is what lets `scripts/lodecheck.mjs` import this file in plain Node and
// prove a vault winnable — with guards hunting on the real pathfinder —
// BEFORE a browser is ever opened.
//
// The muscles this issue asked for are "destructible floors, enemy
// pathfinding, ghost replay of your own runs — determinism + recorded-input
// harness". All four live here, and each is load-bearing in a specific way:
//
// - DESTRUCTIBLE FLOOR: a brick dug out becomes a TRAP that holds its occupant
//   for CFG.trapHold ticks and then collapses to a PERMANENT hole. Anyone
//   standing there — you or a guard — falls through. A guard that lands in a
//   hole it cannot climb out of is buried for the rest of the vault: digging
//   is the player's only weapon, and holes are forever.
// - PATHFINDING: every entity (player and guards) is moved by the SAME
//   `applyAction` rules — stand, climb, hang, airborne. A guard replans a
//   breadth-first route through that state graph toward the player every
//   CFG.guardPace ticks, but it can NEVER jump and never catches a rope.
//   So the escape language is exact: ropes, jump-gaps, and holes are things
//   a guard simply cannot follow. The autopilot exploits the same
//   asymmetry and the harness audits it: the proven replay must never share
//   a cell with a live guard, ever.
// - GHOST REPLAY: every action is stamped {tick, act} into g.cmds. A replay
//   of that stream on a fresh game reproduces the vault exactly — attract
//   mode IS that replay, and in the browser your previous attempt's ghost is
//   a second sim instance fed the recorded stream, so the page itself proves
//   replay == recording.
//
// Geometry: cell (col,row), row 0 at the top, gravity toward larger row. An
// entity OCCUPIES one cell; standing means the cell straight below is a
// support (BRICK/SOLID/TRAP/LADDER). HANGING means the cell straight ABOVE is
// ROPE (you dangle one cell under the rope line). Airborne is ballistic:
// vy += 1/tick (cap 2), a jump rises exactly one cell, a rising body catches
// any rope above it, a falling body grabs any ladder it passes through.
// Mid-air is committed — the classic "you cannot steer a jump".

export const W = 34
export const H = 19
export const SIM_HZ = 15                     // sim ticks per world second

export const EMPTY = 0
export const BRICK = 1                       // diggable floor
export const SOLID = 2                       // concrete: never diggable
export const ROPE = 3
export const LADDER = 4
export const GOLD = 5                        // enterable; collecting empties it
export const TRAP = 6                        // dug brick: holds, then collapses

export const CFG = {
    moveEvery: 2,                            // ticks between player actions (pace)
    guardPace: 4,                            // ticks between guard decisions — slack erodes this
    trapHold: 24,                            // ticks a TRAP holds before it collapses
    lives: 3,
    dangerMargin: 8,                         // ticks of guard slack the solver refuses to burn
    // Engine switches. All normal in play; they exist ONLY so
    // `lodecheck --mutate` can prove each rule load-bearing (a child run
    // silences one and the matching check must go red).
    trapCollapse: true,                      // traps eventually drop their rider
    dig: true,                               // DOWN at a brick (or opposite-foot) digs it
    guardChase: true,                        // guards replan toward the player
    ropeCatch: true,                         // a rising body catches a rope
    jump: true,                              // the player may jump
    quota: true,                             // the exit needs every gold nugget
}

export const ACTS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'JUMP:-1', 'JUMP:0', 'JUMP:1']

const idx = (x, y) => y * W + x
const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const solidT = (t) => t === BRICK || t === SOLID
const supportT = (t) => t === BRICK || t === SOLID || t === TRAP || t === LADDER
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
    for (const e of g.ents) s += `|e${e.x},${e.y},${e.mode[0]},${e.alive ? 1 : 0},${e.vx},${e.vy}`
    for (let i = 0; i < g.grid.length; i++) {
        s += String.fromCharCode(48 + g.grid[i])
        if (g.grid[i] === TRAP) s += `:${g.trap[i]}`
    }
    return hash(s)
}

function push(g, e) { if (!g.search) g.events.push(e) }

export function makeGame(meta, grid) {
    const mk = (x, y, isGuard, id, home) => ({ x, y, mode: 'stand', vx: 0, vy: 0, alive: true, isGuard, id, home })
    const g = {
        meta,
        grid: Uint8Array.from(grid),
        trap: new Int16Array(W * H),
        tick: 0,
        end: null,                                    // null|'clear'|'dead'|'time'
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
    return g
}

function goldCollect(g, e) {
    if (g.search || cellT(g, e.x, e.y) !== GOLD) return
    g.grid[idx(e.x, e.y)] = EMPTY
    g.have++
    g.score += 500
    push(g, { type: 'gold', have: g.have })
    if (g.have >= g.need && !g.unlocked) { g.unlocked = true; push(g, { type: 'unlock' }) }
}

function checkExit(g, e) {
    if (e.isGuard || g.end) return
    if (e.x === g.exit.x && e.y === g.exit.y && (!CFG.quota || g.have >= g.need)) {
        g.end = 'clear'; g.win = true
        g.score += 1000 + Math.max(0, g.meta.timeTicks - g.tick) * 2
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
    // the vault keeps its dug floors and its remaining gold — only you (and
    // the guards' nerve) reset. That is what makes the vault recoverable
    // without a page reload, and what makes lives a real supply.
    const p = g.player
    p.x = g.meta.spawn.x; p.y = g.meta.spawn.y
    p.mode = 'stand'; p.vx = 0; p.vy = 0; p.alive = true
    for (const gd of g.guards) {
        if (!gd.alive) continue
        gd.x = gd.home.x; gd.y = gd.home.y; gd.mode = 'stand'; gd.vx = 0; gd.vy = 0
    }
}

function killFall(g, e) {
    if (e.isGuard) { e.alive = false; push(g, { type: 'guardGone', id: e.id }); return }
    e.alive = false
    loseLife(g, 'fall')        // respawn (or game over) happens inside loseLife
}

// ------------------------------------------------------------- the move rules ----
// ONE generator drives everyone: the player, every guard, and — through the
// snapshot walk below — the autopilot's search. That is the honesty contract:
// a solver that cheated with phantom moves would win vaults a human cannot.
// act: 'ArrowLeft|ArrowRight|ArrowUp|ArrowDown' or 'JUMP:-1|0|1'.
// Returns true when the action changed the world (input was legal).
export function applyAction(g, e, act, opts = {}) {
    if (!act || g.end || !e.alive || e.mode === 'air') return false
    const allowJump = opts.jump !== false
    const allowDig = opts.dig !== false && !g.search
    const D = act === 'ArrowLeft' ? -1 : act === 'ArrowRight' ? 1 : undefined

    if (act.startsWith('JUMP')) {
        if (!CFG.jump || !allowJump || (e.mode !== 'stand' && e.mode !== 'hang')) return false
        e.vx = +act.split(':')[1] || 0
        e.vy = -2              // airTick adds +1 before moving: -2 rises exactly one cell
        e.mode = 'air'
        push(g, { type: 'jump', x: e.x, y: e.y, isGuard: !!e.isGuard })
        return true
    }

    if (e.mode === 'stand') {
        if (D !== undefined) {
            const nx = e.x + D
            const t = cellT(g, nx, e.y)
            if (t === LADDER) { e.x = nx; e.mode = 'climb'; goldCollect(g, e); return true }
            if (solidT(t) || t === TRAP || t === ROPE) {
                // blocked: the classic opposite-foot dig — the brick one cell
                // below the direction you pushed, if it is diggable at all.
                if (allowDig && CFG.dig && cellT(g, nx, e.y + 1) === BRICK) {
                    g.grid[idx(nx, e.y + 1)] = TRAP
                    g.trap[idx(nx, e.y + 1)] = 0
                    push(g, { type: 'dig', x: nx, y: e.y + 1 })
                    return true
                }
                return false
            }
            // EMPTY / GOLD: legal only with something to stand on. Gold is
            // entered ONLY as a target (see the solver contract) — live
            // gameplay collects on entry, so "walk through" is fine here.
            if (supportT(cellT(g, nx, e.y + 1))) {
                e.x = nx; goldCollect(g, e); checkExit(g, e)
                return true
            }
            return false
        }
        if (act === 'ArrowUp') {
            if (cellT(g, e.x, e.y - 1) === LADDER) { e.y--; e.mode = 'climb'; return true }
            return false
        }
        if (act === 'ArrowDown') {
            const b = cellT(g, e.x, e.y + 1)
            if (b === LADDER) { e.y++; e.mode = 'climb'; return true }
            if (b === BRICK && allowDig && CFG.dig) {
                g.grid[idx(e.x, e.y + 1)] = TRAP
                g.trap[idx(e.x, e.y + 1)] = 0
                push(g, { type: 'dig', x: e.x, y: e.y + 1 })
                return true
            }
            if (b === EMPTY || b === GOLD) { e.mode = 'air'; e.vy = 0; return true }
            return false
        }
        return false
    }

    if (e.mode === 'hang') {
        if (D !== undefined) {
            const nx = e.x + D
            if (cellT(g, nx, e.y - 1) !== ROPE) return false
            const t = cellT(g, nx, e.y)
            if (solidT(t) || t === TRAP) return false
            e.x = nx; push(g, { type: 'swing', x: nx, y: e.y }); goldCollect(g, e); checkExit(g, e)
            return true
        }
        if (act === 'ArrowUp') {
            if (cellT(g, e.x, e.y - 1) !== ROPE) return false
            e.y--
            if (cellT(g, e.x, e.y - 1) === ROPE) { e.mode = 'hang' }
            else { e.mode = 'air'; e.vy = 0 }
            return true
        }
        if (act === 'ArrowDown') {
            if (cellT(g, e.x, e.y + 1) === LADDER) { e.y++; e.mode = 'climb'; return true }
            e.mode = 'air'; e.vy = 0
            return true
        }
        return false
    }

    if (e.mode === 'climb') {
        if (act === 'ArrowUp') {
            if (cellT(g, e.x, e.y - 1) === LADDER) { e.y--; return true }
            return false
        }
        if (act === 'ArrowDown') {
            if (cellT(g, e.x, e.y + 1) === LADDER) { e.y++; return true }
            const b = cellT(g, e.x, e.y + 1)
            if (b === BRICK && allowDig && CFG.dig) {
                g.grid[idx(e.x, e.y + 1)] = TRAP; g.trap[idx(e.x, e.y + 1)] = 0
                push(g, { type: 'dig', x: e.x, y: e.y + 1 })
                return true
            }
            if (b === EMPTY || b === GOLD) { e.mode = 'air'; e.vy = 0; return true }
            return false
        }
        if (D !== undefined) {
            const nx = e.x + D
            const t = cellT(g, nx, e.y)
            if (t === LADDER) { e.x = nx; return true }
            if ((t === EMPTY || t === GOLD) && supportT(cellT(g, nx, e.y + 1))) {
                e.x = nx; e.mode = 'stand'; goldCollect(g, e); checkExit(g, e); return true
            }
            // step off the top of a ladder sideways INTO a rope: you let go
            // of one rung and catch the next — the only way onto a rope line
            // from a ladder (climbing up the rope itself was never a thing).
            if (t === EMPTY && cellT(g, nx, e.y - 1) === ROPE && !supportT(cellT(g, nx, e.y + 1))) {
                e.x = nx; e.mode = 'hang'; return true
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
        if (e.vy > 0) {
            if (!inB(e.x, e.y)) { killFall(g, e); return }
            if (supportT(cellT(g, e.x, e.y + 1))) { e.mode = 'stand'; e.vy = 0; goldCollect(g, e); checkExit(g, e); return }
            e.y++
            if (!inB(e.x, e.y)) { killFall(g, e); return }
            if (e.y === H - 1 && g.grid[idx(e.x, e.y)] !== SOLID) { killFall(g, e); return }
            if (g.grid[idx(e.x, e.y)] === LADDER) { e.mode = 'climb'; e.vy = 0; goldCollect(g, e); return }
            goldCollect(g, e)
        } else {
            const up = cellT(g, e.x, e.y - 1)
            if (up === SOLID || up === BRICK) { e.vy = 0; break }
            e.y--
            if (!inB(e.x, e.y)) { killFall(g, e); return }
            if (CFG.ropeCatch && !e.isGuard && g.grid[idx(e.x, e.y - 1)] === ROPE) {
                e.mode = 'hang'; e.vx = 0; e.vy = 0; push(g, { type: 'grab', x: e.x, y: e.y }); return
            }
            if (g.grid[idx(e.x, e.y)] === LADDER) { e.mode = 'climb'; e.vx = 0; e.vy = 0; goldCollect(g, e); return }
            goldCollect(g, e)
        }
    }
    if (e.mode === 'air' && e.vy <= 0) {
        if (e.y + 1 < H && supportT(g.grid[idx(e.x, e.y + 1)])) e.mode = 'stand'
        else if (e.y >= H) killFall(g, e)
    }
}

// --------------------------------------------------------------- the guards ----
// BFS over cells the guard can occupy, derived from the SAME physics the
// player obeys — minus jump, rope-catch and dig. A guard falls into holes
// (there is no climbing back out without a ladder — that is the whole trap
// economy), walks trap floors until they collapse (also the whole trap
// economy), and replans every CFG.guardPace ticks toward the player.
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
            // stepping DOWN off a standable cell (or a ladder) into open
            // air is a fall the guard will take — the column below is walkable
            // at its bottom, and the trap is waiting.
            if (dy === 1 && t === EMPTY && hereStand) { dist[j] = d + 1; q.push(j) }
        }
    }
    return dist
}

function guardAct(g, gd) {
    if (gd.mode === 'air' || !CFG.guardChase) return false
    const p = g.player
    if (!p.alive) return false
    const field = guardField(g, gd)
    const pd = field[idx(p.x, p.y)]
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
    return applyAction(g, gd, best, { jump: false, dig: false })
}

// ---------------------------------------------------------------- the tick ----
export function step(g) {
    g.events.length = 0
    if (g.end) return g
    g.tick++

    // 1) traps age; a collapsed trap drops whoever stood on it
    for (let i = 0; i < g.grid.length; i++) {
        if (g.grid[i] !== TRAP) continue
        g.trap[i]++
        if (!CFG.trapCollapse || g.trap[i] < CFG.trapHold) continue
        const tx = i % W, ty = (i - tx) / W
        g.grid[i] = EMPTY
        push(g, { type: 'trap', x: tx, y: ty })
        for (const e of g.ents) {
            if (e.alive && e.mode === 'stand' && e.x === tx && e.y + 1 === ty) {
                e.mode = 'air'; e.vy = 0
                push(g, { type: 'drop', x: e.x, y: e.y, isGuard: e.isGuard })
            }
        }
    }

    // 2) the player's stamped action was applied by the shell/replay at this
    //    tick (exactly as a held key reaches the loop); guards act on pace
    if (g.tick % CFG.guardPace === 0) {
        for (const gd of g.guards) if (gd.alive) guardAct(g, gd)
    }

    // 3) physics for anything airborne
    for (const e of g.ents) if (e.alive && e.mode === 'air') airTick(g, e)

    // 4) capture: a guard in your cell takes you
    const p = g.player
    if (p.alive) {
        for (const gd of g.guards) {
            if (gd.alive && gd.x === p.x && gd.y === p.y) { push(g, { type: 'capture', id: gd.id }); loseLife(g, 'caught'); break }
        }
    }

    if (g.end) return g
    if (g.tick >= g.meta.timeTicks) { g.end = 'time'; g.win = false; push(g, { type: 'time' }) }
    return g
}

// ------------------------------------------------------------------ solver ----
// The gate's witness and the attract demo's source. It speaks ONLY as a
// player does — one legal action every CFG.moveEvery ticks — and its
// breadth-first search walks the SAME state graph applyAction defines. Two
// contracts keep the search honest without cloning the grid per node:
//   1. GOLD is a door the route ENTERS AND STOPS AT (never a corridor), so a
//      branch can be inconsistent about an already-collected gold only at the
//      moment it terminates — which is exactly when the run re-plans anyway.
//   2. the solver NEVER digs. A vault whose gold needs a dig must therefore
//      hand the dig to a special edge (below) whose landing cell is computed
//      from the real gravity rules — the autopilot digs only the one brick a
//      human dig would be, and lands where the human would land.
// Guards enter the search as a danger field (their own reachable set at
// their real pace); the solver will not arrive at a cell later than a guard
// minus the margin, unless it hangs on a rope (guards cannot hang).

const MODE_ID = { stand: 0, climb: 1, hang: 2 }

function miniGrid(g) {
    return { search: true, grid: g.grid, meta: g.meta, have: g.have, need: g.need, exit: g.exit, events: [], unlocked: true, lives: 1, player: { x: 0, y: 0, mode: 'stand', alive: true }, guards: [] }
}

function stepEdge(g, mini, e, act) {
    const n = { ...e, isGuard: false }
    return applyAction(mini, n, act, { jump: false, dig: false }) ? n : null
}

function arcEdge(mini, e, vx) {
    const n = { ...e, isGuard: false }
    n.vx = vx; n.vy = -2; n.mode = 'air'
    for (let t = 0; t < 14 && n.mode === 'air' && n.alive && !mini.end; t++) airTick(mini, n)
    if (n.mode === 'air' || !n.alive) return null
    return n
}

// dig-down edge: stand above a brick. Once the trap collapses you fall
// through the old brick row and land one cell above the first standable
// floor below it. The level contract is that this pocket is a pocket —
// gold may sit on its floor, ladders must not pass through it.
function digEdge(g, e) {
    if (!CFG.dig) return null
    if (cellT(g, e.x, e.y + 1) !== BRICK) return null
    let y = e.y + 1
    while (y + 1 < H && !supportT(cellT(g, e.x, y + 1))) y++
    if (!supportT(cellT(g, e.x, y + 1))) return null
    const t = cellT(g, e.x, y)
    if (t !== EMPTY && t !== GOLD && !(t === BRICK && y === e.y + 1)) return null
    if (cellT(g, e.x, y - 1) === LADDER) return null      // ladder column: not a dig pocket
    return { x: e.x, y, mode: 'stand', vx: 0, vy: 0, alive: true }
}

function successors(g, mini, e, targets) {
    const out = []
    for (const act of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const n = stepEdge(g, mini, e, act)
        if (!n) continue
        const cell = idx(n.x, n.y)
        if (targets.has(cell)) { out.push({ act, e: n, goal: true }); continue }
        if (g.grid[cell] === GOLD) continue               // gold is a door-to-stop-at, not a corridor
        out.push({ act, e: n })
    }
    if (CFG.jump && (e.mode === 'stand' || e.mode === 'hang')) {
        for (const v of [-1, 0, 1]) {
            const n = arcEdge(mini, e, v)
            if (!n) continue
            const cell = idx(n.x, n.y)
            if (targets.has(cell)) { out.push({ act: `JUMP:${v}`, e: n, goal: true }); continue }
            if (g.grid[cell] === GOLD) continue
            out.push({ act: `JUMP:${v}`, e: n })
        }
    }
    if (e.mode === 'stand') {
        const n = digEdge(g, e)
        if (n) {
            const cell = idx(n.x, n.y)
            if (targets.has(cell)) out.push({ act: 'ArrowDown', e: n, goal: true, digs: true })
            else if (g.grid[cell] !== GOLD) out.push({ act: 'ArrowDown', e: n, digs: true })
        }
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

export function planStep(g) {
    const p = g.player
    if (g.end || !p.alive) return null
    const danger = dangerField(g)
    const targets = new Set()
    if (g.have < g.need) {
        for (let i = 0; i < g.grid.length; i++) if (g.grid[i] === GOLD) targets.add(i)
    } else {
        targets.add(idx(g.exit.x, g.exit.y))
    }
    if (!targets.size) return null
    const mini = miniGrid(g)
    const key = (e) => (e.y * W + e.x) * 4 + (MODE_ID[e.mode] ?? 3)
    const start = { x: p.x, y: p.y, mode: p.mode, vx: 0, vy: 0, alive: true }
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
            if (dk !== -1 && dk <= arriveTick + (s.e.mode === 'hang' ? 0 : CFG.dangerMargin)) continue
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

export function planRun(g, opts = {}) {
    const maxTicks = opts.maxTicks || g.meta.timeTicks
    while (!g.end && g.tick < maxTicks) {
        if (g.tick % CFG.moveEvery === 0) {
            const act = planStep(g)
            if (act && applyAction(g, g.player, act, { jump: true, dig: true })) {
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
    const max = opts.maxTicks || meta.timeTicks + 30
    while (!g.end && g.tick < max) {
        const todo = byTick.get(g.tick)
        if (todo) for (const c of todo) applyAction(g, g.player, c.act, { jump: true, dig: true })
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}
