// ADVENTURE route (Atari 2600, 1979) — #1637 batch 11 WATCH driver.
//
// The proven route from adventurecheck's route adapter (winRunV3), ported to a
// generator that emits ONE input { dx, dy, drop } per tick. Node gates run this
// exact file (seeds 1..10 x cart variants 1..3, 30/30 wins) and the browser
// seats it live — the seat IS the proof, never a separate scripted replay.
//
// Reactive by construction: every step re-reads the live sim (item shuffle,
// the bat's steals, magnet drift, which gates are open, which walls the bridge
// has opened), so Y seats mid-run and the guide walks from HERE.
//
// The route (classic solve order):
//   blackKey -> black gate rite (drop the key at the threshold)
//   -> bridge -> whiteKey (through the Red Maze, bridge law respected)
//   -> white gate rite -> chalice -> home to the Gold Castle.
// Dragon lairs are avoided on the preferred graph; the plain graph is the
// retry. No sword, no dot rite, no teleports — legal player inputs only.

import { ROOMS, EXITS, CASTLE_INSIDES, R, GW, GH, PLAYER_SPEED as S, SIDE_GAP_Y, SIDE_GAP_H } from './sim.js'

// ---- cell-grid pathing inside a room (#1560 law: sign-steering dies in the
// mazes; plan on 4px cells, hop cell-to-cell one axis at a time) ----
const CELL = 4
const GWc = Math.ceil(GW / CELL)
const GHc = Math.ceil(GH / CELL)
const gridCache = new Map()
const freeGrid = (room) => {
    if (!gridCache.has(room)) {
        const walls = ROOMS[room].walls
        const g = new Array(GWc * GHc)
        for (let cy = 0; cy < GHc; cy++) for (let cx = 0; cx < GWc; cx++) {
            const px = cx * CELL + CELL / 2 - 3, py = cy * CELL + CELL / 2 - 5
            g[cy * GWc + cx] = !walls.some((w) => px < w.x + w.w && px + 6 > w.x && py < w.y + w.h && py + 10 > w.y)
        }
        gridCache.set(room, g)
    }
    return gridCache.get(room)
}

const cellPath = (sim, fx, fy, tx, ty) => {
    const g = freeGrid(sim.room)
    const cc = (v, n) => Math.max(0, Math.min(n - 1, v))
    const gx = cc(Math.floor(tx / CELL), GWc), gy = cc(Math.floor(ty / CELL), GHc)
    const sx0 = cc(Math.floor(fx / CELL), GWc), sy0 = cc(Math.floor(fy / CELL), GHc)
    let starts = [[sx0, sy0]]
    if (!g[sy0 * GWc + sx0]) {
        starts = []
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cc(sx0 + dx, GWc), ny = cc(sy0 + dy, GHc)
            if (g[ny * GWc + nx]) starts.push([nx, ny])
        }
    }
    const prev = new Map()
    const order = []
    for (const [cx, cy] of starts) { const k = cy * GWc + cx; if (!prev.has(k)) { prev.set(k, -1); order.push(k) } }
    for (let i = 0; i < order.length; i++) {
        const s = order[i], cx = s % GWc, cy = (s - cx) / GWc
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= GWc || ny >= GHc) continue
            const k = ny * GWc + nx
            if (prev.has(k) || !g[k]) continue
            prev.set(k, s); order.push(k)
        }
    }
    const goal = gy * GWc + gx
    if (!prev.has(goal)) return []
    const path = []
    let k = goal
    while (k !== -1) { path.unshift([k % GWc, (k - (k % GWc)) / GWc]); k = prev.get(k) }
    return path
}

// Drive to a point in the current room, one input per tick. Diagonal first,
// then each axis alone (a side-biting wall can kill one axis mid-hop; the
// other still gets its tick). True on arrival, false on death/win/exhaustion.
function* driveTo(sim, tx, ty, stop = 1.2) {
    const p = sim.player
    const txc = tx + p.w / 2, tyc = ty + p.h / 2
    let path = [], stuck = 0
    const plan = () => { path = cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, txc, tyc); stuck = 0 }
    plan()
    for (let i = 0; i < 5000; i++) {
        const ddx = tx - p.x, ddy = ty - p.y
        if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
        let wx = txc, wy = tyc
        while (path.length) {
            const [cx, cy] = path[0]
            // advance only once the player's center is inside the waypoint cell
            if (Math.floor((p.x + p.w / 2) / CELL) === cx && Math.floor((p.y + p.h / 2) / CELL) === cy) { path.shift(); continue }
            wx = cx * CELL + CELL / 2; wy = cy * CELL + CELL / 2
            break
        }
        const dpx = wx - (p.x + p.w / 2), dpy = wy - (p.y + p.h / 2)
        const ux = Math.abs(dpx) > 0.3 ? Math.min(S, Math.abs(dpx)) * Math.sign(dpx) : 0
        const uy = Math.abs(dpy) > 0.3 ? Math.min(S, Math.abs(dpy)) * Math.sign(dpy) : 0
        const r0 = sim.room, px = p.x, py = p.y
        yield { dx: ux, dy: uy }
        if (sim.room !== r0) return true
        if (sim.dead || sim.won) return false
        let moved = p.x !== px || p.y !== py
        if (!moved && (ux !== 0 || uy !== 0)) {
            yield { dx: ux, dy: 0 }
            if (sim.room !== r0) return true
            if (sim.dead || sim.won) return false
            moved = p.x !== px || p.y !== py
        }
        if (!moved && uy !== 0) {
            yield { dx: 0, dy: uy }
            if (sim.room !== r0) return true
            if (sim.dead || sim.won) return false
            moved = p.x !== px || p.y !== py
        }
        if (!moved) { if (++stuck > 6) { if (!path.length) return false; plan() } } else stuck = 0
    }
    return false
}

// Push toward a room edge until the transition lands in `want`.
function* cross(sim, dir, want, maxTicks = 400) {
    const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
    for (let i = 0; i < maxTicks && sim.room !== want && !sim.won; i++) yield { dx: v[0], dy: v[1] }
    return sim.room === want
}

// Room graph obeying the player's own laws: portcullis only through an open
// gate, sealed sides only once the bridge is laid, the secret door only after
// the dot rite.
const sideSolid = (room, dir) => ROOMS[room].walls.some((w) => dir === 'up' ? w.y === 0 && w.w === GW
    : dir === 'down' ? w.y + w.h === GH && w.w === GW
    : dir === 'left' ? w.x === 0 && w.h === GH
    : w.x + w.w === GW && w.h === GH)

const neighbors = (sim, room) => {
    const es = []
    for (const d of ['up', 'down', 'left', 'right']) {
        let to = -1
        if (d === 'up' && ROOMS[room].gate && CASTLE_INSIDES[room] !== undefined) {
            if (sim.gateOpen[ROOMS[room].gateKey]) to = CASTLE_INSIDES[room]
        } else {
            const ex = EXITS[room]
            if (ex && ex[d] !== undefined && ex[d] >= 0) to = ex[d]
        }
        if (to < 0) continue
        if (sideSolid(room, d) && !sim.bridged.has(`${room}:${d}`)) continue
        if (!sim.secretOpen && ((room === R.DRAGON_LAIR && to === R.SECRET) || (room === R.SECRET && to === R.DRAGON_LAIR))) continue
        es.push([d, to])
    }
    return es
}

const ANCHORS = {
    up: [[80, 16], [70, 16], [90, 16]],
    down: [[80, GH - 24], [70, GH - 24], [90, GH - 24]],
    left: [[16, SIDE_GAP_Y + SIDE_GAP_H / 2], [16, SIDE_GAP_Y], [16, SIDE_GAP_Y + SIDE_GAP_H]],
    right: [[GW - 24, SIDE_GAP_Y + SIDE_GAP_H / 2], [GW - 24, SIDE_GAP_Y], [GW - 24, SIDE_GAP_Y + SIDE_GAP_H]],
}

// Walk one room edge: an anchor that reaches, then push through the gap.
function* hop(sim, from, to) {
    const edge = neighbors(sim, from).find(([, n]) => n === to)
    if (!edge) return false
    const d = edge[0]
    for (const [ax, ay] of ANCHORS[d]) {
        if (yield* driveTo(sim, ax, ay)) return yield* cross(sim, d, to, 400)
    }
    return false
}

// Room-to-room walk: prefer paths that never cross a living dragon's room,
// retry on the plain graph when a preferred hop dead-ends.
function* walkTo(sim, to, avoidDragons = true) {
    const bfs = (skipDragons, from) => {
        const prev = new Map([[from, null]])
        const order = [from]
        for (let i = 0; i < order.length; i++) {
            for (const [, n] of neighbors(sim, order[i])) {
                if (prev.has(n)) continue
                if (skipDragons && n !== to && sim.dragons.some((dg) => dg.alive && dg.room === n)) continue
                prev.set(n, order[i]); order.push(n)
            }
        }
        return prev.has(to) ? prev : null
    }
    for (const skip of (avoidDragons ? [true, false] : [false])) {
        const prev = bfs(skip, sim.room)
        if (!prev) continue
        const path = [to]
        while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]))
        let ok = true
        for (let i = 0; i + 1 < path.length && ok; i++) ok = yield* hop(sim, path[i], path[i + 1])
        if (ok) return sim.room === to
    }
    return false
}

// Fetch an item wherever it currently is (the shuffle moved it, the bat may
// hold it): walk to its room, drive onto it, retry; when the bat carries it,
// wait in a shelter room holding a loose partner (the swap law) and re-walk.
function* fetchItem(sim, id) {
    const item = sim.items.find((i) => i.id === id)
    for (let attempt = 0; attempt < 6; attempt++) {
        if (sim.carrying === id) return true
        if (sim.dead || sim.won) return sim.carrying === id
        if (sim.carrying) yield { drop: true }
        if (sim.bat.carrying === id) {
            const prev = new Map([[sim.room, null]])
            const order = [sim.room]
            for (let i = 0; i < order.length; i++) {
                for (const [, n] of neighbors(sim, order[i])) {
                    if (!prev.has(n)) { prev.set(n, order[i]); order.push(n) }
                }
            }
            const shelter = order.find((room) =>
                sim.items.some((i) => i.id !== id && i.room === room && !i.carried) &&
                !sim.dragons.some((dg) => dg.alive && dg.room === room))
            if (shelter === undefined) continue
            if (!(yield* walkTo(sim, shelter))) continue
            for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
                yield {}
                if (sim.dead || sim.won) return sim.carrying === id
            }
            if (sim.bat.carrying === id) continue
        }
        if (!(yield* walkTo(sim, item.room))) continue
        if (!(yield* driveTo(sim, item.x, item.y))) continue
        if (sim.carrying === id) return true
    }
    return sim.carrying === id
}

// Drop the carried key at its castle threshold and wait for the portcullis.
function* openGate(sim, keyId) {
    yield { drop: true }
    for (let i = 0; i < 4 && !sim.gateOpen[keyId]; i++) yield {}
    return sim.gateOpen[keyId] === true
}

// The full quest, start to finish. Returns { ok, why } — the honest verdict
// the seat reports when the guide runs out of proven road.
function* runRoute(sim) {
    if (!(yield* fetchItem(sim, 'blackKey'))) return { ok: false, why: 'blackKey' }
    if (!(yield* walkTo(sim, R.BLACK_CASTLE))) return { ok: false, why: 'to black gate' }
    if (!(yield* driveTo(sim, 80, 32))) return { ok: false, why: 'black threshold' }
    if (!(yield* openGate(sim, 'blackKey'))) return { ok: false, why: 'gateB' }
    if (!(yield* fetchItem(sim, 'bridge'))) return { ok: false, why: 'bridge' }
    if (!(yield* walkTo(sim, R.BLACK_FOYER))) return { ok: false, why: 'to black foyer' }
    if (!(yield* cross(sim, 'down', R.RED_LAB_1))) return { ok: false, why: 'red floor' }
    if (!(yield* fetchItem(sim, 'whiteKey'))) return { ok: false, why: 'whiteKey' }
    if (!(yield* walkTo(sim, R.WHITE_CASTLE))) return { ok: false, why: 'to white gate' }
    if (!(yield* driveTo(sim, 80, 32))) return { ok: false, why: 'white threshold' }
    if (!(yield* openGate(sim, 'whiteKey'))) return { ok: false, why: 'gateW' }
    if (!(yield* fetchItem(sim, 'chalice'))) return { ok: false, why: 'chalice' }
    if (!sim.won && !(yield* walkTo(sim, R.GOLD_CASTLE))) return { ok: false, why: 'home' }
    for (let i = 0; i < 200 && !sim.won; i++) {
        yield { dx: 0, dy: -S }
        if (sim.dead) return { ok: false, why: 'died at home' }
    }
    return sim.won
        ? { ok: true, why: 'won' }
        : { ok: false, why: `end room=${sim.room} carry=${sim.carrying}` }
}

// ---- fixed-map script (V1 CLASSIC / V2 FAST): the waypoint route from
// adventurecheck's winRun, ported one-for-one. Teleports became real drives —
// the guide never jumps the sprite; the script only emits legal inputs.
// (V3 SHUFFLE re-homes the loot, where this script cannot look, so those runs
// dispatch to the adaptive runRoute below instead.)
function* scriptRun(sim) {
    const P = sim.player
    const R1 = (tx, ty) => driveTo(sim, tx, ty)
    // trip 1: blackKey into front of the black gate
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'castle align' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_1))) return { ok: false, why: 'castle exit' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_2))) return { ok: false, why: 'ow2' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow2 align' }
    if (!(yield* cross(sim, 'left', R.BLUE_LAB_1))) return { ok: false, why: 'lab1a' }
    if (!(yield* R1(140, 90)) || !(yield* R1(140, 170)) || !(yield* R1(80, 170))) return { ok: false, why: 'lab1 descent' }
    if (!(yield* cross(sim, 'down', R.BLUE_LAB_2))) return { ok: false, why: 'lab2' }
    if (!(yield* R1(76, 92))) return { ok: false, why: 'blackKey spot' }
    if (sim.carrying !== 'blackKey') {
        if (!(yield* recover(sim, 'blackKey', 76, 92))) return { ok: false, why: 'no blackKey' }
    }
    if (!(yield* R1(80, 16))) return { ok: false, why: 'lab2 exit' }
    if (!(yield* cross(sim, 'up', R.BLUE_LAB_1))) return { ok: false, why: 'lab1b' }
    if (!(yield* R1(140, 168)) || !(yield* R1(140, 44)) || !(yield* R1(110, 16)) || !(yield* R1(80, 16))) return { ok: false, why: 'lab1 climb' }
    if (!(yield* cross(sim, 'up', R.OVERWORLD_2))) return { ok: false, why: 'ow2b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow2b align' }
    if (!(yield* cross(sim, 'right', R.OVERWORLD_4))) return { ok: false, why: 'ow4' }
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'ow4 align' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3' }
    if (!(yield* cross(sim, 'down', R.BLACK_CASTLE))) return { ok: false, why: 'castleB' }
    if (!(yield* R1(80, 32))) return { ok: false, why: 'black threshold' }
    if (!(yield* openGate(sim, 'blackKey'))) return { ok: false, why: 'gateB' }
    if (!(yield* R1(65, 24))) return { ok: false, why: 'key dodge' }
    // trip 2: bridge through the black foyer floor, into the Red Maze
    if (!(yield* cross(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'castleB out' }
    if (!(yield* cross(sim, 'up', R.OVERWORLD_2))) return { ok: false, why: 'ow2c' }
    if (!(yield* R1(95, 70))) return { ok: false, why: 'bridge corner' }
    if (!(yield* R1(96, 76))) return { ok: false, why: 'bridge spot' }
    if (sim.carrying !== 'bridge') {
        if (!(yield* recover(sim, 'bridge', 96, 76))) return { ok: false, why: 'no bridge' }
    }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow3 align' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3c' }
    if (!(yield* cross(sim, 'down', R.BLACK_CASTLE))) return { ok: false, why: 'castleB2' }
    if (!(yield* cross(sim, 'up', R.BLACK_FOYER))) return { ok: false, why: 'foyerB' }
    if (!(yield* cross(sim, 'down', R.RED_LAB_1))) return { ok: false, why: 'red floor' }
    if (!(yield* R1(140, 12))) return { ok: false, why: 'red enter' }
    if (!(yield* R1(140, 86))) return { ok: false, why: 'red right column' }
    yield { drop: true }                       // no-op: the bridge placed itself at the crossing
    if (sim.carrying !== null) return { ok: false, why: 'bridge drop failed' }
    if (!(yield* R1(66, 86))) return { ok: false, why: 'red lower corridor' }
    if (sim.carrying !== 'whiteKey') {
        if (!(yield* recover(sim, 'whiteKey', 66, 86))) return { ok: false, why: 'no whiteKey' }
    }
    if (!(yield* R1(140, 86))) return { ok: false, why: 'red lower right' }
    if (!(yield* R1(140, 12))) return { ok: false, why: 'red right column up' }
    if (!(yield* R1(80, 12))) return { ok: false, why: 'red top exit' }
    if (!(yield* cross(sim, 'up', R.BLACK_FOYER))) return { ok: false, why: 'foyer out red' }
    if (!(yield* R1(65, 24))) return { ok: false, why: 'key dodge 2' }
    // trip 3: white key to its gate, chalice, and the ride home
    if (!(yield* cross(sim, 'up', R.BLACK_CASTLE))) return { ok: false, why: 'castleB3' }
    if (!(yield* R1(P.x, 150))) return { ok: false, why: 'castleB3 align' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow3b align' }
    if (!(yield* cross(sim, 'right', R.OVERWORLD_4))) return { ok: false, why: 'ow4b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow4b align' }
    if (!(yield* cross(sim, 'right', R.WHITE_CASTLE))) return { ok: false, why: 'castleW' }
    if (!(yield* R1(80, 32))) return { ok: false, why: 'white threshold' }
    if (!(yield* openGate(sim, 'whiteKey'))) return { ok: false, why: 'gateW' }
    if (!(yield* cross(sim, 'up', R.WHITE_FOYER))) return { ok: false, why: 'foyerW' }
    if (!(yield* R1(80, 88))) return { ok: false, why: 'chalice spot' }
    if (sim.carrying !== 'chalice') {
        if (!(yield* recover(sim, 'chalice', 80, 88))) return { ok: false, why: 'no chalice' }
    }
    if (!(yield* R1(80, 12))) return { ok: false, why: 'foyerW exit' }
    if (!(yield* cross(sim, 'up', R.WHITE_CASTLE))) return { ok: false, why: 'castleW out' }
    if (!(yield* R1(P.x, 150))) return { ok: false, why: 'castleW align' }
    if (!(yield* cross(sim, 'down', R.OVERWORLD_4))) return { ok: false, why: 'ow4 home' }
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'ow4 home align' }
    if (!sim.won && !(yield* cross(sim, 'up', R.OVERWORLD_1))) return { ok: false, why: 'ow1 home' }
    for (let i = 0; i < 200 && !sim.won; i++) {
        yield { dx: 0, dy: -S }
        if (sim.dead) return { ok: false, why: 'died at home' }
    }
    return sim.won
        ? { ok: true, why: 'won' }
        : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
}

// Bat-theft recovery (the #1560 law, ported): a drop always lands in the
// player's room, so wait where a loose partner sits (the swap), walk to the
// drop spot, and come back to the route's continuation point.
function* recover(sim, id, backX, backY) {
    if (sim.carrying === id) return true
    const item = sim.items.find((i) => i.id === id)
    const startRoom = sim.room
    if (item.carried) {
        const prev = new Map([[startRoom, null]])
        const order = [startRoom]
        for (let i = 0; i < order.length; i++) {
            for (const [, n] of neighbors(sim, order[i])) {
                if (!prev.has(n)) { prev.set(n, order[i]); order.push(n) }
            }
        }
        const shelter = order.find((room) =>
            sim.items.some((i) => i.id !== id && i.room === room && !i.carried) &&
            !sim.dragons.some((dg) => dg.alive && dg.room === room))
        if (shelter === undefined) return false
        if (!(yield* walkTo(sim, shelter))) return false
        for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
            yield {}
            if (sim.dead || sim.won) return false
        }
        if (sim.bat.carrying === id) return false
    }
    if (!(yield* walkTo(sim, item.room))) return false
    if (!(yield* driveTo(sim, item.x, item.y))) return false
    if (sim.carrying !== id) return false  // re-stolen mid-walk
    if (!(yield* walkTo(sim, startRoom))) return false
    return yield* driveTo(sim, backX, backY)
}

// Seat factory: makeRoute(sim) -> { next() }. The seat feeds the LIVE sim
// every tick; next() returns { done, value: input } while the guide drives,
// and { done: true, value: verdict } when the route is finished or given up.
// V1/V2 (fixed maps) run the proven waypoint script; V3 (shuffle) runs the
// adaptive route — both ported from the drivers adventurecheck proves with.
export function makeRoute(sim) {
    const gen = sim.variant >= 3 ? runRoute(sim) : scriptRun(sim)
    let result = { ok: false, why: 'not started' }
    return {
        next() {
            const r = gen.next()
            if (r.done) result = r.value || result
            return r
        },
        result: () => result,
    }
}
