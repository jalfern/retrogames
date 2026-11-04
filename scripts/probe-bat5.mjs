// Temporary probe #5 — trace seed 30 through the exact recover() stages.
import { createSim, R, GW, GH, PLAYER_SPEED, ROOMS, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
const S = PLAYER_SPEED
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }
const log = (...a) => console.log(...a)
const CELL = 4
const GWc = Math.ceil(GW / CELL), GHc = Math.ceil(GH / CELL)
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
function driveTo(sim, tx, ty, stop = 1.2) {
    const p = sim.player
    // (tx,ty) is the player's corner (as before); the grid plans on centers
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
            if (Math.floor((p.x + p.w / 2) / CELL) === cx && Math.floor((p.y + p.h / 2) / CELL) === cy) { path.shift(); continue }
            wx = cx * CELL + CELL / 2; wy = cy * CELL + CELL / 2
            break
        }
        const dpx = wx - (p.x + p.w / 2), dpy = wy - (p.y + p.h / 2)
        const ux = Math.abs(dpx) > 0.3 ? Math.min(S, Math.abs(dpx)) * Math.sign(dpx) : 0
        const uy = Math.abs(dpy) > 0.3 ? Math.min(S, Math.abs(dpy)) * Math.sign(dpy) : 0
        const r0 = sim.room
        const px = p.x, py = p.y
        const moved = (dx, dy) => {
            if (dx === 0 && dy === 0) return false
            step(sim, { dx, dy })
            return sim.room !== r0 || Math.abs(p.x - px) > 0.01 || Math.abs(p.y - py) > 0.01
        }
        const m = moved(ux, uy) || moved(ux, 0) || moved(0, uy)
        if (sim.room !== r0) return true
        if (sim.dead || sim.won) return false
        if (!m) { if (++stuck > 6) { if (!path.length) return false; plan() } } else stuck = 0
    }
    return false
}
const cross = (sim, dir, want, maxTicks = 400) => {
    const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
    for (let i = 0; i < maxTicks && sim.room !== want && !sim.won; i++) step(sim, { dx: v[0], dy: v[1] })
    return sim.room === want
}
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
    const hop = (sim, from, to) => {  // walk one room edge: anchor, then push
        const edge = neighbors(sim, from).find(([, n]) => n === to)
        if (!edge) return false
        const d = edge[0]
        // maze rooms don't always reach a single anchor — try the gap's points
        const okA = ANCHORS[d].some(([ax, ay]) => driveTo(sim, ax, ay))
        if (!okA) { console.log(`  hop ${from}->${to} dir=${d}: ALL ANCHORS FAILED, player now (${sim.player.x.toFixed(0)},${sim.player.y.toFixed(0)}) room=${sim.room} dead=${sim.dead}`); return false }
        const okC = cross(sim, d, to, 400)
        if (!okC) console.log(`  hop ${from}->${to} dir=${d}: cross FAILED, room=${sim.room} dead=${sim.dead}`)
        return okC
    }
    const walkTo = (sim, to, avoidDragons = true) => {
        // prefer paths that never cross a dragon's home room (the shelters
        // already exclude them, but the route between can — a smart player
        // detours around Yorgle when the map allows); if a preferred path's
        // hops fail (maze dead-end), retry on the plain graph.
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
            for (let i = 0; i + 1 < path.length && ok; i++) ok = hop(sim, path[i], path[i + 1])
            if (ok) return sim.room === to
        }
        return false
    }

// ---- replicate trip 1 to the blackKey checkpoint, seed 30 ----
const sim = createSim(seedRng(30))
sim.player.x = 80
cross(sim, 'down', R.OVERWORLD_2)
sim.player.y = 90
cross(sim, 'left', R.BLUE_LAB_1)
driveTo(sim, 140, 90); driveTo(sim, 140, 170); driveTo(sim, 80, 170)
cross(sim, 'down', R.BLUE_LAB_2)
driveTo(sim, 76, 92)
console.log(`checkpoint t=${sim.tick} carrying=${sim.carrying} bat=${sim.bat.room}/${sim.bat.carrying} swapTimer=${sim.bat.swapTimer}`)
console.log(`dragons: ${sim.dragons.map((d) => `${d.id}@${d.room}(${d.x.toFixed(0)},${d.y.toFixed(0)})alive=${d.alive}`).join(' ')}`)

// ---- recover() stages ----
const id = 'blackKey'
const item = sim.items.find((i) => i.id === id)
const startRoom = sim.room
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
console.log(`shelter order [${order.slice(0, 8).join(',')}] shelter=${shelter}`)
if (!walkTo(sim, shelter)) console.log('walkTo shelter FAILED')
else {
    const t0 = sim.tick
    let waited = 0
    const visits = {7:0, 3:0, overlaps: 0}
    for (let i = 0; i < 60000 && sim.bat.carrying === id; i++) {
        if (sim.bat.room === 3) { visits[3]++; const b = sim.bat, br = sim.items.find(i2 => i2.id === 'bridge'); if (b.x < br.x + br.w && b.x + 10 > br.x && b.y < br.y + br.h && b.y + 10 > br.y) visits.overlaps++ }
        step(sim, {})
        waited++
        if (sim.dead || sim.won) break
    }
    console.log(`wait: ${waited} ticks; bat now carries=${sim.bat.carrying} bat.room=${sim.bat.room} player.room=${sim.room} dead=${sim.dead}`)
    if (sim.bat.carrying !== id) {
        console.log(`item at (${item.room},${item.x.toFixed(0)},${item.y.toFixed(0)}) carried=${item.carried}`)
        const okw = walkTo(sim, item.room, true)
        if (okw) {
            const okd = driveTo(sim, item.x, item.y)
            console.log(`driveTo drop spot ok=${okd} carrying=${sim.carrying} dead=${sim.dead}`)
        }
    }
}
