// SONAR ABYSS — the simulation. No DOM, no React, no canvas, and no Math.random:
// a cave is a pure function of (seed, depth) and a run is a pure function of
// (seed, depth, command script). That is what lets `scripts/sonarcheck.mjs`
// import this file in plain Node and audit the INFORMATION PIPELINE — the thing
// this issue actually asked for — before a browser is ever opened.
//
// The muscle the issue names is the DEFERRED-REVEAL RENDERER, and the sim's one
// structural promise is that truth and knowledge are separate objects:
//
//   TRUTH   grid (rock/water), pearls, vent, eels. The eels move every tick,
//           whether or not anything is listening.
//   KNOWLEDGE `mem[cell]` — the tick a sound wavefront last reached that cell —
//           and `blips` — eel contacts recorded at the moment a wavefront
//           physically touched the eel. The renderer may draw ONLY knowledge;
//           a remembered eel stays where it was seen and fades, while the real
//           eel keeps swimming. Stale knowledge is the game.
//
// The wavefront is the reason occlusion is structural rather than cosmetic: a
// ping runs a BFS through WATER CELLS ONLY, and a cell lights exactly
// CFG.waveSpeed cells/tick into that distance field. Sound never crosses rock —
// a sealed pocket inside the ping radius stays black until the wavefront walks
// all the way around through its doorway. A "radius reveal" cheat (the
// `wavefront` mutant) lights that pocket instantly and the occlusion pin goes
// red, which is the check that makes this claim mean something.
//
// Geometry: cell (x,y), index y*W+x. A tick is 1/20 s. The player steps one
// cell every CFG.moveEvery ticks; an eel every CFG.eelEvery (depth-scaled), so
// a careful swimmer outruns anything — if he can see it, which he can't.

export const W = 49
export const H = 27
export const N = W * H

export const OPEN = 0
export const ROCK = 1

export const CFG = {
    waveSpeed: 2,        // cells per tick the sonar front travels (40 cells/s)
    fade: 90,            // ticks a lit cell stays known (4.5 s), then black
    pingCd: 30,          // ticks between pings (1.5 s) — silence is forced planning
    moveEvery: 3,        // ticks between player steps (~6.7 cells/s)
    eelBase: 8,          // ticks between eel steps at depth 1 (slower than you)
    lives: 3,
    invuln: 80,          // ticks of grace after a hit, so respawn isn't a chain
    // Engine switches. All true in play; `sonarcheck --mutate` silences one in
    // a child process and a named check MUST go red. Each one is a rule this
    // game's honesty rests on, in the dashcheck/lemcheck tradition.
    wavefront: true,     // reveal by BFS wavefront arrival (false = radius cheat through rock)
    decay: true,         // knowledge fades to black again (false = permanent map)
    blipOnly: true,      // eels exist in knowledge only as wavefront contacts
    carve: true,         // caves are carved all the way to the vent (false = plug it)
    eelKill: true,       // an eel that touches you takes a life
    descend: true,       // the vent takes you down a depth
}

export const DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
}

export const idx = (x, y) => y * W + x
export const cx = (i) => i % W
export const cy = (i) => (i - (i % W)) / W
export const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H
export const open = (g, x, y) => inB(x, y) && g.grid[idx(x, y)] === OPEN

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

// mulberry32 — the only entropy in the repo's line, and always seeded.
export function rng32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ------------------------------------------------------------------ BFS ----
// Distance field over open cells. The SAME primitive is the wavefront model,
// the reachability auditor and the planner's legs — so "what sound can reach"
// and "what the auditor claims sound reaches" cannot drift apart silently.
export function bfsField(grid, start) {
    const d = new Int16Array(N).fill(-1)
    if (grid[start] !== OPEN) return d
    d[start] = 0
    const q = [start]
    for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i - x) / W
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy
            if (!inB(nx, ny)) continue
            const j = idx(nx, ny)
            if (grid[j] === OPEN && d[j] === -1) { d[j] = d[i] + 1; q.push(j) }
        }
    }
    return d
}

// ------------------------------------------------------------------ caves ----
// Seven fallback chambers are carved FIRST from solid rock in fixed positions,
// then seeded extra chambers are added where they fit. Because the fallbacks
// always exist, the chain of corridors that connects them (and therefore the
// vent) exists for EVERY seed — the audit can never be flaky about the shape,
// only about the extras. The vent is the chamber center farthest from spawn,
// so a run always crosses the whole map — in the dark, one ping at a time.
const FALLBACK = [
    [3, 3, 10, 7], [20, 2, 27, 6], [38, 3, 45, 7],
    [3, 19, 10, 23], [20, 20, 27, 24], [38, 19, 45, 23],
    [21, 11, 27, 15],
]

export function genCave(seed, depth) {
    const rng = rng32((seed ^ (depth * 0x9E3779B9)) >>> 0)
    const grid = new Uint8Array(N).fill(ROCK)
    const rooms = []
    const fits = (x0, y0, x1, y1) => {
        if (x0 < 1 || y0 < 1 || x1 > W - 2 || y1 > H - 2) return false
        for (const r of rooms) {
            if (x0 - 1 <= r[2] && r[0] <= x1 + 1 && y0 - 1 <= r[3] && r[1] <= y1 + 1) return false
        }
        return true
    }
    const carveRoom = (r) => {
        rooms.push(r)
        for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) grid[idx(x, y)] = OPEN
    }
    for (const r of FALLBACK) carveRoom(r)
    for (let t = 0; t < 6; t++) {
        const w = 3 + Math.floor(rng() * 5), h = 2 + Math.floor(rng() * 3)
        const x0 = 2 + Math.floor(rng() * (W - 5 - w)), y0 = 2 + Math.floor(rng() * (H - 5 - h))
        if (fits(x0, y0, x0 + w, y0 + h)) carveRoom([x0, y0, x0 + w, y0 + h])
    }
    const center = (r) => idx(Math.floor((r[0] + r[2]) / 2), Math.floor((r[1] + r[3]) / 2))
    // corridor chain: every room reaches the next (L-shaped, bend order seeded)
    for (let i = 1; i < rooms.length; i++) {
        const a = center(rooms[i - 1]), b = center(rooms[i])
        let x = cx(a), y = cy(a)
        const xEnd = cx(b), yEnd = cy(b)
        const horizFirst = rng() < 0.5
        const stepX = () => { while (x !== xEnd) { x += Math.sign(xEnd - x); grid[idx(x, y)] = OPEN } }
        const stepY = () => { while (y !== yEnd) { y += Math.sign(yEnd - y); grid[idx(x, y)] = OPEN } }
        if (horizFirst) { stepX(); stepY() } else { stepY(); stepX() }
    }
    const spawn = center(rooms[0])
    // vent = farthest room center by BFS in the fully connected cave
    const field = bfsField(grid, spawn)
    let vent = center(rooms[rooms.length - 1]), bestD = -1
    for (let i = 1; i < rooms.length; i++) {
        const c = center(rooms[i])
        if (field[c] > bestD) { bestD = field[c]; vent = c }
    }
    if (!CFG.carve) {
        // MUTANT (see the switch comment): plug the vent chamber entirely. The
        // reachability audit must catch a vent the player can never swim to.
        const r = rooms.find((r) => {
            const c = center(r); return c === vent
        }) || rooms[rooms.length - 1]
        for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) grid[idx(x, y)] = ROCK
    }
    // pearls: two unclaimed cells in each room past the spawn, never on routes
    const pearls = []
    for (let i = 1; i < rooms.length; i++) {
        const r = rooms[i]
        for (let k = 0; k < 2; k++) {
            for (let t = 0; t < 12; t++) {
                const x = r[0] + Math.floor(rng() * (r[2] - r[0] + 1))
                const y = r[1] + Math.floor(rng() * (r[3] - r[1] + 1))
                const c = idx(x, y)
                if (grid[c] === OPEN && c !== vent && c !== spawn && !pearls.includes(c)) { pearls.push(c); break }
            }
        }
    }
    return { seed: seed >>> 0, depth, grid, spawn, vent, rooms, centers: rooms.map(center), pearls }
}

// ---------------------------------------------------------------- eels ----
// A patrol is a BFS path between two room centers, walked ping-pong. Fully
// deterministic: the ROUTE array fixes the eel's whole future, so the planner
// can read the truth to survive the attract replay while the PLAYER only ever
// learns where the eel was when a wavefront last touched it.
export function makeEels(cave, depth, rngSeed) {
    const rng = rng32((rngSeed ^ 0x51ed270b) >>> 0)
    const n = Math.min(1 + depth, 5)
    const every = Math.max(4, CFG.eelBase - depth)
    const eels = []
    const L = cave.centers.length
    for (let i = 0; i < n; i++) {
        const a = cave.centers[(i * 2 + 1) % L]
        const b = cave.centers[(i * 2 + 4) % L]
        if (a === cave.spawn || b === cave.spawn) continue
        const route = findRoute(cave.grid, a, b)
        if (!route || route.length < 4) continue
        // fairness: never wake an eel on top of the spawn
        if (Math.abs(cx(route[0]) - cx(cave.spawn)) + Math.abs(cy(route[0]) - cy(cave.spawn)) < 6) {
            for (let s = 0; s < route.length; s++) {
                const d = Math.abs(cx(route[s]) - cx(cave.spawn)) + Math.abs(cy(route[s]) - cy(cave.spawn))
                if (d >= 6) { route.splice(0, s); break }
            }
            if (route.length < 2) continue
        }
        eels.push({ id: eels.length, route, pos: Math.floor(rng() * route.length), dir: rng() < 0.5 ? 1 : -1, every })
    }
    return eels
}

function findRoute(grid, a, b) {
    const d = bfsField(grid, a)
    if (d[b] < 0) return null
    const route = [b]
    let c = b
    while (c !== a) {
        const x = cx(c), y = cy(c)
        let nxt = -1
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const j = idx(x + dx, y + dy)
            if (inB(x + dx, y + dy) && d[j] === d[c] - 1) { nxt = j; break }
        }
        if (nxt < 0) return null
        route.push(nxt); c = nxt
    }
    return route.reverse()
}

export const eelCell = (e) => e.route[e.pos]
export function eelNext(e) {
    let p = e.pos + e.dir
    if (p >= e.route.length) p = e.pos - 1
    if (p < 0) p = e.pos + 1
    return e.route[p]
}

// --------------------------------------------------------------- the game ----
export function makeGame(cave, opts = {}) {
    const g = {
        seed: cave.seed,
        depth: cave.depth,
        grid: Uint8Array.from(cave.grid),
        spawn: cave.spawn,
        vent: cave.vent,
        pearls: [...cave.pearls],
        taken: new Uint8Array(cave.pearls.length),
        have: 0,
        score: opts.score || 0,
        lives: opts.lives ?? CFG.lives,
        tick: 0,
        end: null,
        win: false,
        player: { c: cave.spawn },
        invuln: CFG.invuln,
        alive: true,
        eels: makeEels(cave, cave.depth, (cave.seed ^ 0xABCD) >>> 0),
        pings: [],
        lastPing: -999,
        mem: new Int32Array(N).fill(-1),   // KNOWLEDGE: tick the front last reached a cell, -1 never
        blips: [],                        // KNOWLEDGE: {x,y,t,id} — eel contacts, fading
        cmds: [],
        events: [],
    }
    return g
}

const pi = (p) => p.c

export function stateHash(g) {
    let s = `${g.seed}|${g.depth}|${g.tick}|${g.player.c}|${g.lives}|${g.score}|${g.have}|${g.end}|${g.invuln}`
    for (const e of g.eels) s += `|e${e.route[e.pos]},${e.pos},${e.dir}`
    for (let i = 0; i < g.pearls.length; i++) s += g.taken[i] ? 'P' : '.'
    for (let i = 0; i < N; i++) s += String(ROCK - g.grid[i])
    let mh = 0x811c9dc5
    for (let i = 0; i < N; i++) { mh ^= (g.mem[i] + 1); mh = Math.imul(mh, 0x01000193) }
    return s + '|' + (mh >>> 0).toString(16)
}

// --------------------------------------------------------------- act ----
export function playerMove(g, dir) {
    if (g.end || !g.alive) return false
    const d = DIRS[dir]
    if (!d) return false
    const x = cx(g.player.c) + d[0], y = cy(g.player.c) + d[1]
    if (!open(g, x, y)) return false
    g.player.c = idx(x, y)
    g.cmds.push({ tick: g.tick, action: 'move', dir })
    touchCell(g)
    return true
}

export function ping(g, opts = {}) {
    if (g.end) return false
    const src = g.player.c
    if (opts.noCd || g.tick - g.lastPing >= CFG.pingCd) {
        g.lastPing = g.tick
        g.cmds.push({ tick: g.tick, action: 'ping' })
        const dist = bfsField(g.grid, src)
        // BUCKET by arrival delay: reveal per tick is then O(cells arriving),
        // and "when" is decided once, here, by the SAME distance field the
        // auditor recomputes. The wavefront mutant changes this one block:
        // straight-line distance through rock — pockets light instantly.
        const maxD = Math.ceil(Math.sqrt(N) * 1.5)
        const buckets = []
        if (CFG.wavefront) {
            for (let i = 0; i < N; i++) {
                if (dist[i] < 0) continue                       // rock-shadowed: NEVER lights
                const k = Math.ceil(dist[i] / CFG.waveSpeed)
                ;(buckets[k] || (buckets[k] = [])).push(i)
            }
        } else {
            const px = cx(src), py = cy(src)
            for (let i = 0; i < N; i++) {
                const k = Math.ceil(Math.hypot(cx(i) - px, cy(i) - py) / CFG.waveSpeed)
                ;(buckets[k] || (buckets[k] = [])).push(i)
            }
        }
        g.pings.push({ src, t0: g.tick, buckets, maxK: buckets.length - 1 })
        g.events.push({ type: 'ping' })
        return true
    }
    return false
}

// one cell entering knowledge: light it, light the ROCK faces standing in the
// already-heard water, and touch every eel that is physically in that cell.
function light(g, c, t) {
    g.mem[c] = t
    if (g.grid[c] === ROCK) return
    const x = cx(c), y = cy(c)
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (inB(x + dx, y + dy) && g.grid[idx(x + dx, y + dy)] === ROCK) g.mem[idx(x + dx, y + dy)] = t
    }
    for (const e of g.eels) {
        if (eelCell(e) === c) g.blips.push({ x, y, t, id: e.id })
    }
}

// whether a cell is still KNOWN at g.tick — the renderer and every check
// about "what the player can see" must go through this, never through mem.
export function known(g, c) {
    if (c === g.player.c) return true            // you always know your own lungs
    if (g.mem[c] < 0) return false
    return CFG.decay ? g.tick - g.mem[c] <= CFG.fade : true
}

// where knowledge thinks an eel is: the fresh blips, NOT the truth. If
// `blipOnly` is off (mutant) the truth leaks straight through — the exact
// "eye the game does not have" failure this repo has died twice over.
export function eelContacts(g) {
    if (!CFG.blipOnly) {
        return g.eels.map(e => ({ x: cx(eelCell(e)), y: cy(eelCell(e)), t: g.tick, id: e.id, live: true }))
    }
    return g.blips.filter(b => g.tick - b.t <= CFG.fade)
}

function touchCell(g) {
    const c = g.player.c
    let took = -1
    for (let i = 0; i < g.pearls.length; i++) {
        if (g.pearls[i] === c && !g.taken[i]) {
            g.taken[i] = 1; g.have++; g.score += 50
            g.events.push({ type: 'pearl', have: g.have })
            took = i
        }
    }
    if (took >= 0 && g.have >= g.pearls.length) g.score += 150
    for (const e of g.eels) {
        if (eelCell(e) === c) hit(g, e)
    }
    if (c === g.vent && CFG.descend) {
        g.end = 'descend'; g.win = true
        g.score += 200 + g.lives * 75
        g.events.push({ type: 'descend', depth: g.depth })
    }
}

function hit(g, e) {
    if (!CFG.eelKill || g.invuln > 0 || g.end) return
    g.lives--
    g.events.push({ type: 'hit', id: e.id, lives: g.lives })
    if (g.lives <= 0) {
        g.alive = false
        g.end = 'dead'
        g.events.push({ type: 'die' })
    } else {
        g.player.c = g.spawn
        g.invuln = CFG.invuln
    }
}

// ---------------------------------------------------------------- tick ----
export function step(g) {
    g.events.length = 0
    if (g.end) return g
    g.tick++
    if (g.invuln > 0) g.invuln--

    for (const p of g.pings) {
        const k = g.tick - p.t0
        if (k > p.maxK) continue
        const list = p.buckets[k]
        if (list) for (const c of list) light(g, c, g.tick)
    }
    g.pings = g.pings.filter(p => g.tick - p.t0 <= p.maxK)

    for (const e of g.eels) {
        if (g.tick % e.every !== 0) continue
        let np = e.pos + e.dir
        if (np >= e.route.length) { e.dir = -1; np = e.pos - 1 }
        if (np < 0) { e.dir = 1; np = e.pos + 1 }
        e.pos = np
        const c = e.route[e.pos]
        if (c === g.player.c) hit(g, e)
    }
    return g
}

// Where an eel WILL be for the next `ticks` of world time — the route is a
// fixed ping-pong, so this is arithmetic, not a guess. The planner blocks
// these cells rather than reading them: standing in a corridor and trusting
// the eel to turn at the far end is how the first version got eaten.
export function eelForecast(e, ticks) {
    const cells = new Set()
    let pos = e.pos, dir = e.dir
    const n = Math.max(1, Math.ceil(ticks / e.every))
    for (let k = 0; k < n; k++) {
        pos += dir
        if (pos >= e.route.length) { dir = -1; pos = e.route.length - 1 }
        if (pos < 0) { dir = 1; pos = 0 }
        cells.add(e.route[pos])
    }
    return cells
}

// ------------------------------------------------------------- the planner ----
// The gate's witness and the attract demo's script. It reads the TRUTH (eels,
// routes, all pearls) — it is a replay proven in Node, not a player — but it
// still only ever emits arrows and pings on the player's own cadence, so the
// attract demo it scripts is an honestly-lit cave: every wall on its route was
// lit by a wavefront at the tick the demo reaches it.
// Safety is SPACE-TIME, not a threat blob: the eels' routes are fixed
// ping-pongs, so the next ~3 seconds of every eel's position is arithmetic.
// The planner runs a BFS over (cell, move#) states and a step is legal only if
// the eel timeline leaves that cell empty for the whole window the player will
// stand in it. That is what removed the corridor standoffs a "block the eel's
// next cell" heuristic could only ever deadlock on.
export function planStep(g, opts = {}) {
    if (g.end) return null
    const me = CFG.moveEvery
    const K = opts.k || 64
    const maxK = Math.max(K, 300)            // the escalated search horizon the timeline must cover
    const maxT = maxK * me + me + 2
    // EXACTLY step()'s ping-pong transition — the first version bounced
    // differently at the endpoints, so at a length-2 route the shadow froze
    // while the real eel oscillated, and the planner walked into a cell the
    // shadow had promised was empty. A timeline that disagrees with the sim is
    // a collision model written by a liar.
    const occ = []
    const sim = g.eels.map(e => ({ e, pos: e.pos, dir: e.dir }))
    for (let t = 0; t <= maxT; t++) {
        const s = new Set()
        for (const st of sim) {
            s.add(st.e.route[st.pos])                        // touches you standing here
            // the move INTO g.tick already ran (last step()); the shadow's
            // future transitions are t>=1. Starting at t=0 double-steps every
            // eel whose period hits now — the shadow runs ahead and promises
            // cells its own truth still occupies. (This was the real death.)
            if (t > 0 && (g.tick + t) % st.e.every === 0) {  // and steps onto you
                let np = st.pos + st.dir
                if (np >= st.e.route.length) { st.dir = -1; np = st.pos - 1 }
                if (np < 0) { st.dir = 1; np = st.pos + 1 }
                st.pos = np
                s.add(st.e.route[st.pos])
            }
        }
        occ[t] = s
    }
    const here = g.player.c
    const stat = bfsField(g.grid, here)
    let target = -1, td = Infinity
    for (let i = 0; i < g.pearls.length; i++) {
        const c = g.pearls[i]
        if (!g.taken[i] && stat[c] >= 0 && stat[c] < td) { td = stat[c]; target = c }
    }
    if (target < 0 && stat[g.vent] >= 0) target = g.vent

    // BFS over (cell, move#): a state is legal only if the eel timeline keeps
    // the cell empty for the whole window the player stands in it — including
    // the tick the player arrives (touchCell sees the pre-step position too).
    const search = (K2) => {
        const Wk = K2 + 1
        const key = (c, k) => c * Wk + k
        const V = new Uint8Array(N * Wk)
        const par = new Int32Array(N * Wk).fill(-1)
        const q = [key(here, 0)]
        V[q[0]] = 1
        for (let h = 0; h < q.length; h++) {
            const kk = q[h], c = (kk - (kk % Wk)) / Wk, k = kk % Wk
            if (target >= 0 && c === target && k >= 1) return { kk, Wk, par }
            if (k >= K2) continue
            const x = cx(c), y = cy(c)
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = x + dx, ny = y + dy
                if (!inB(nx, ny) || g.grid[idx(nx, ny)] !== OPEN) continue
                const j = idx(nx, ny)
                if (V[key(j, k + 1)]) continue
                // move #m executes at offset (m-1)*me (the first move is THIS
                // tick), and the player stands the cell through the step-end
                // one me-tick before departing — so cell entered at move k+1
                // must be eel-free over [k*me .. (k+1)*me]. A window starting
                // a move late walked the first step into the eel's arms.
                let okw = true
                for (let t = k * me; t <= (k + 1) * me && okw; t++) {
                    if (t <= maxT && occ[t].has(j)) okw = false
                }
                if (!okw) continue
                V[key(j, k + 1)] = 1
                par[key(j, k + 1)] = kk
                q.push(key(j, k + 1))
            }
        }
        return null
    }
    let r = search(K)
    // deep routes: a patrol's full period can exceed K*me, so a cross-map dash
    // may need to wait mid-route for the cycle to open. Widen the horizon
    // rather than deadlock waiting for a safe 64-move dash it can never see.
    if (!r && target >= 0) r = search(300)
    const dirTo = (a, b) => {
        const ax = cx(b) - cx(a), ay = cy(b) - cy(a)
        if (ax === 1) return 'ArrowRight'
        if (ax === -1) return 'ArrowLeft'
        if (ay === 1) return 'ArrowDown'
        if (ay === -1) return 'ArrowUp'
        return null
    }
    if (r) {
        let cur = r.kk
        const start = here * r.Wk
        while (r.par[cur] !== start && r.par[cur] >= 0) cur = r.par[cur]
        return dirTo(here, (cur - (cur % r.Wk)) / r.Wk)
    }
    // No safe route inside the horizon. If the timeline has reached the cell we
    // stand in, this tick's step is survival, not progress.
    const safeNow = (cell) => {
        for (let t = 0; t <= me; t++) if (occ[t].has(cell)) return false
        return true
    }
    if (!safeNow(here)) {
        let best = null, bestD = -1
        for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
            const nx = cx(here) + dx, ny = cy(here) + dy
            if (!inB(nx, ny) || g.grid[idx(nx, ny)] !== OPEN) continue
            const j = idx(nx, ny)
            let d = 99
            for (const e of g.eels) d = Math.min(d, Math.abs(cx(eelCell(e)) - nx) + Math.abs(cy(eelCell(e)) - ny))
            const rank = (safeNow(j) ? 100 : 0) + d
            if (rank > bestD) { bestD = rank; best = dir }
        }
        return best
    }
    return null     // wait it out — the patrol walks its route and opens the door
}

// Drive a fresh game to the vent with the planner, auto-pinging on cooldown.
// Returns the full command script (moves + pings) that attract mode replays.
export function planRun(cave, opts = {}) {
    const g = makeGame(cave, opts)
    const max = opts.maxTicks || 3200
    while (!g.end && g.tick < max) {
        if (g.tick - g.lastPing >= CFG.pingCd && (opts.pings ?? true)) ping(g, { noCd: g.lastPing < 0 })
        if (g.tick % CFG.moveEvery === 0) {
            const dir = planStep(g)
            if (dir) playerMove(g, dir)
        }
        step(g)
    }
    return { cmds: g.cmds.map(c => ({ ...c })), g, have: g.have, win: g.win, end: g.end, score: g.score }
}

// Replay a recorded script on a fresh cave. Attract mode IS this replay and
// sonarcheck proves it: same script → identical hash, one dropped command →
// different hash (the tamper probe, so "deterministic" cannot go vacuous).
export function replay(cave, cmds, opts = {}) {
    const g = makeGame(cave, opts)
    const byTick = new Map()
    for (const c of cmds) {
        if (!byTick.has(c.tick)) byTick.set(c.tick, [])
        byTick.get(c.tick).push(c)
    }
    const max = opts.maxTicks || 3000
    while (!g.end && g.tick < max) {
        const todo = byTick.get(g.tick)
        if (todo) for (const c of todo) {
            if (c.action === 'ping') ping(g, { noCd: true })
            else playerMove(g, c.dir)
        }
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}
