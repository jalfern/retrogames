// Temporary probe #7 — full winRun route for seed 1 with the grid driver,
// logging each stage so the "lab1 climb" failure is visible.
import { createSim, R, GW, GH, PLAYER_SPEED, ROOMS } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
const S = PLAYER_SPEED
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }

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
let dbg = false
function driveTo(sim, tx, ty, stop = 1.2) {
    const p = sim.player
    const txc = tx + p.w / 2, tyc = ty + p.h / 2
    let path = [], stuck = 0
    const plan = () => {
        path = cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, txc, tyc)
        stuck = 0
        if (dbg) console.log(`    plan(${tx},${ty}): ${path.length} cells room=${sim.room} from=(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
    }
    plan()
    for (let i = 0; i < 5000; i++) {
        const ddx = tx - p.x, ddy = ty - p.y
        if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) { if (dbg) console.log(`    ok at iter ${i} t=${sim.tick}`); return true }
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
        if (sim.room !== r0) { if (dbg) console.log(`    room -> ${sim.room}`); return true }
        if (sim.dead) { if (dbg) console.log(`    DEAD iter ${i} t=${sim.tick} pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) yorgle=(${sim.dragons[0].x.toFixed(0)},${sim.dragons[0].y.toFixed(0)})`); return false }
        if (sim.won) return false
        if (!m) {
            if (++stuck > 6) { if (dbg) console.log(`    STUCK iter ${i} pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) wp=(${wx},${wy}) left=${path.length}`); if (!path.length) return false; plan() }
        } else stuck = 0
    }
    if (dbg) console.log(`    5000-iter cap, pos=(${p.x.toFixed(1)},${p.y.toFixed(1)}) dead=${sim.dead}`)
    return false
}
const cross = (sim, d, want, maxTicks = 400) => {
    const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[d]
    for (let i = 0; i < maxTicks && sim.room !== want && !sim.won; i++) step(sim, { dx: v[0], dy: v[1] })
    return sim.room === want
}

const SD = Number(process.argv[2] || 1)
const sim = createSim(seedRng(SD))
const T = (x, y) => { dbg = true; const r = driveTo(sim, x, y); dbg = false; if (!r) console.log(`    !! T(${x},${y}) FAILED, now room=${sim.room} pos=(${sim.player.x.toFixed(1)},${sim.player.y.toFixed(1)}) dead=${sim.dead}`); return r }
const stage = (name, r) => console.log(`${name}: ${r ? 'ok' : 'FAILED'}  t=${sim.tick} room=${sim.room}`)

sim.player.x = 80
stage('down OW2', cross(sim, 'down', R.OVERWORLD_2))
sim.player.y = 90
stage('left BL1', cross(sim, 'left', R.BLUE_LAB_1))
stage('T(140,90)', T(140, 90))
stage('T(140,170)', T(140, 170))
stage('T(80,170)', T(80, 170))
stage('down BL2', cross(sim, 'down', R.BLUE_LAB_2))
stage('T(76,92)', T(76, 92))
console.log(`blackKey? carrying=${sim.carrying} bat.carrying=${sim.bat.carrying} bat.room=${sim.bat.room}`)
stage('T(80,16)', T(80, 16))
stage('up BL1', cross(sim, 'up', R.BLUE_LAB_1))
stage('T(140,168)', T(140, 168))
stage('T(140,44)', T(140, 44))
stage('T(110,16)', T(110, 16))
stage('T(80,16)', T(80, 16))
stage('up OW2', cross(sim, 'up', R.OVERWORLD_2))
sim.player.y = 90
stage('right OW4', cross(sim, 'right', R.OVERWORLD_4))
sim.player.x = 80
stage('down OW3', cross(sim, 'down', R.OVERWORLD_3))
stage('down BLACK_CASTLE', cross(sim, 'down', R.BLACK_CASTLE))
sim.player.x = 80; sim.player.y = 32
step(sim, { drop: true })
for (let i = 0; i < 3 && !sim.gateOpen.blackKey; i++) step(sim, {})
stage('gateB open', sim.gateOpen.blackKey)
stage('T(65,24)', T(65, 24))
stage('down OW3 (out)', cross(sim, 'down', R.OVERWORLD_3))
stage('up OW2', cross(sim, 'up', R.OVERWORLD_2))
sim.player.y = 70; sim.player.x = 95
stage('T(96,76)', T(96, 76))
console.log(`bridge? carrying=${sim.carrying} bat.carrying=${sim.bat.carrying} bat.room=${sim.bat.room} item.room=${sim.items.find((i) => i.id === 'bridge').room}`)

// ---- recover() stages for the bridge ----
const SIDE_GAP_Y = 70, SIDE_GAP_H = 50
const CASTLE_INSIDES = { 10: 11, 14: 15 }
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
            const ex = { 0: { down: 2, right: 1 }, 1: { up: 0, down: 2 }, 2: { up: 1, right: 3, down: 7 }, 3: { left: 2, right: 5, down: 4 }, 4: { up: 3, down: 10 }, 5: { left: 3, down: 6 }, 6: { up: 5 }, 7: { up: 2, right: 8 }, 8: { left: 7, down: 9 }, 9: { up: 8, left: 4 }, 10: { up: 4 }, 11: { down: 10, up: 12 }, 12: { down: 11, right: 13 }, 13: { left: 12, up: 16 }, 14: { up: 15, down: 6 }, 15: { down: 14 }, 16: { left: 13, up: 17 } }[room]
            if (ex && ex[d] !== undefined && ex[d] >= 0) to = ex[d]
        }
        if (to < 0) continue
        if (sideSolid(room, d) && !sim.bridged.has(`${room}:${d}`)) continue
        if (!sim.secretOpen && ((room === 16 && to === 17) || (room === 17 && to === 16))) continue
        es.push([d, to])
    }
    return es
}
const EXITS = { 0: { down: 2, right: 1 }, 1: { up: 0, down: 2 }, 2: { up: 1, right: 3, down: 7 }, 3: { left: 2, right: 5, down: 4 }, 4: { up: 3, down: 10 }, 5: { left: 3, down: 6 }, 6: { up: 5 }, 7: { up: 2, right: 8 }, 8: { left: 7, down: 9 }, 9: { up: 8, left: 4 }, 10: { up: 4 }, 11: { down: 10, up: 12 }, 12: { down: 11, right: 13 }, 13: { left: 12, up: 16 }, 14: { up: 15, down: 6 }, 15: { down: 14 }, 16: { left: 13, up: 17 } }
const ANCHORS = {
    up: [[80, 16], [70, 16], [90, 16]],
    down: [[80, GH - 24], [70, GH - 24], [90, GH - 24]],
    left: [[16, SIDE_GAP_Y + SIDE_GAP_H / 2], [16, SIDE_GAP_Y], [16, SIDE_GAP_Y + SIDE_GAP_H]],
    right: [[GW - 24, SIDE_GAP_Y + SIDE_GAP_H / 2], [GW - 24, SIDE_GAP_Y], [GW - 24, SIDE_GAP_Y + SIDE_GAP_H]],
}
const hop = (sim, from, to) => {
    const edge = neighbors(sim, from).find(([, n]) => n === to)
    if (!edge) { console.log(`  hop ${from}->${to}: no edge (neighbors ${JSON.stringify(neighbors(sim, from))})`); return false }
    const d = edge[0]
    const okA = ANCHORS[d].some(([ax, ay]) => driveTo(sim, ax, ay))
    if (!okA) { console.log(`  hop ${from}->${to} dir=${d}: ALL ANCHORS FAILED, player now (${sim.player.x.toFixed(0)},${sim.player.y.toFixed(0)}) room=${sim.room} dead=${sim.dead}`); return false }
    const okC = cross(sim, d, to, 400)
    if (!okC) console.log(`  hop ${from}->${to} dir=${d}: cross FAILED, room=${sim.room} dead=${sim.dead}`)
    return okC
}
const walkTo = (sim, to, avoidDragons = true) => {
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
        console.log(`  walkTo ${sim.room}->${to} skip=${skip}: path [${path.join('->')}]`)
        let ok = true
        for (let i = 0; i + 1 < path.length && ok; i++) ok = hop(sim, path[i], path[i + 1])
        if (ok) return sim.room === to
    }
    return false
}

const id = 'bridge'
const item = sim.items.find((i) => i.id === id)
const startRoom = sim.room
const prev2 = new Map([[startRoom, null]])
const order2 = [startRoom]
for (let i = 0; i < order2.length; i++) {
    for (const [, n] of neighbors(sim, order2[i])) {
        if (!prev2.has(n)) { prev2.set(n, order2[i]); order2.push(n) }
    }
}
const loose = sim.items.filter((i) => i.id !== id && !i.carried).map((i) => `${i.id}@${i.room}`)
console.log(`loose items: ${loose.join(' ')}`)
const dragons = sim.dragons.map((d) => `${d.id}@${d.room} alive=${d.alive}`)
console.log(`dragons: ${dragons.join(' ')}`)
const shelter = order2.find((room) =>
    sim.items.some((i) => i.id !== id && i.room === room && !i.carried) &&
    !sim.dragons.some((dg) => dg.alive && dg.room === room))
console.log(`shelter order [${order2.join(',')}] shelter=${shelter}`)
if (shelter === undefined) { console.log('NO SHELTER'); process.exit(0) }
if (!walkTo(sim, shelter)) { console.log('walkTo shelter FAILED'); process.exit(0) }
console.log(`at shelter, waiting (t=${sim.tick})...`)
const t0 = sim.tick
let waited = 0
const batTrail = []
for (let i = 0; i < 20000 && sim.bat.carrying === id; i++) {
    if (i % 500 === 0) batTrail.push(`t+${i}: bat@${sim.bat.room}(${sim.bat.x.toFixed(0)},${sim.bat.y.toFixed(0)})`)
    step(sim, {})
    waited++
    if (sim.dead || sim.won) break
}
console.log(batTrail.join(' | '))
console.log(`waited ${waited} ticks; bat now carries=${sim.bat.carrying} bat.room=${sim.bat.room} player.room=${sim.room} dead=${sim.dead} won=${sim.won}`)
if (sim.bat.carrying !== id) {
    console.log(`bridge dropped at room=${item.room} (${item.x.toFixed(0)},${item.y.toFixed(0)})`)
    const okw = walkTo(sim, item.room, true)
    console.log(`walkTo drop ok=${okw} (t=${sim.tick})`)
    if (okw) {
        const okd = driveTo(sim, item.x, item.y)
        console.log(`driveTo drop ok=${okd} carrying=${sim.carrying} dead=${sim.dead} (t=${sim.tick})`)
    }
}
