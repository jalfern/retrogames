// Temporary probe #5 — trace seed 30 through the exact recover() stages.
import { createSim, R, GW, GH, PLAYER_SPEED, ROOMS, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
const S = PLAYER_SPEED
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }
const log = (...a) => console.log(...a)
function driveTo(sim, tx, ty, stop = 1.2) {
    const p = sim.player
    for (let i = 0; i < 5000; i++) {
        const ddx = tx - p.x, ddy = ty - p.y
        if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
        const r0 = sim.room
        const ux = Math.sign(ddx) * S, uy = Math.sign(ddy) * S
        const attempt = (dx, dy) => {
            const px = p.x, py = p.y
            step(sim, { dx, dy })
            if (sim.room !== r0) return true
            return Math.abs(p.x - px) > 0.01 || Math.abs(p.y - py) > 0.01
        }
        let moved = false
        if (Math.abs(ddx) > stop && Math.abs(ddy) > stop) moved = attempt(ux, uy) || attempt(ux, 0) || attempt(0, uy)
        else if (Math.abs(ddx) > stop) moved = attempt(ux, 0)
        else moved = attempt(0, uy)
        if (!moved) return false
        if (sim.dead || sim.won) return false
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
const hop = (sim, from, to) => {
    const edge = neighbors(sim, from).find(([, n]) => n === to)
    if (!edge) { log(`  hop ${from}->${to}: no edge`); return false }
    const d = edge[0]
    if (d === 'up' && !driveTo(sim, 80, 16)) { log(`  hop ${from}->${to}: anchor up failed (dead=${sim.dead})`); return false }
    if (d === 'down' && !driveTo(sim, 80, GH - 24)) { log(`  hop ${from}->${to}: anchor down failed (dead=${sim.dead})`); return false }
    if (d === 'left' && !driveTo(sim, 16, SIDE_GAP_Y + SIDE_GAP_H / 2)) { log(`  hop ${from}->${to}: anchor left failed (dead=${sim.dead})`); return false }
    if (d === 'right' && !driveTo(sim, GW - 24, SIDE_GAP_Y + SIDE_GAP_H / 2)) { log(`  hop ${from}->${to}: anchor right failed (dead=${sim.dead})`); return false }
    const okc = cross(sim, d, to, 400)
    if (!okc) log(`  hop ${from}->${to}: cross ${d} failed, now room=${sim.room} dead=${sim.dead}`)
    return okc
}
const walkTo = (sim, from, to, avoidDragons = true, tag = '') => {
    const bfs = (skipDragons) => {
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
    const prev = bfs(avoidDragons) || bfs(false)
    if (!prev) { log(`  walkTo ${tag}: no path ${from}->${to}`); return false }
    const path = [to]
    while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]))
    log(`  walkTo ${tag}: path [${path.join('->')}]`)
    for (let i = 0; i + 1 < path.length; i++) if (!hop(sim, path[i], path[i + 1])) return false
    return sim.room === to
}

// ---- replicate trip 1 to the blackKey checkpoint, seed 30 ----
const sim = createSim(seedRng(30))
sim.player.x = 80
cross(sim, 'down', R.OVERWORLD_1); cross(sim, 'down', R.OVERWORLD_2)
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
if (!walkTo(sim, startRoom, shelter, true, 'to-shelter')) console.log('walkTo shelter FAILED')
else {
    const t0 = sim.tick
    let waited = 0
    for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
        step(sim, {})
        waited++
        if (sim.dead || sim.won) break
    }
    console.log(`wait: ${waited} ticks; bat now carries=${sim.bat.carrying} bat.room=${sim.bat.room} player.room=${sim.room} dead=${sim.dead}`)
    if (sim.bat.carrying !== id) {
        console.log(`item at (${item.room},${item.x.toFixed(0)},${item.y.toFixed(0)}) carried=${item.carried}`)
        const okw = walkTo(sim, sim.room, item.room, true, 'to-item')
        if (okw) {
            const okd = driveTo(sim, item.x, item.y)
            console.log(`driveTo drop spot ok=${okd} carrying=${sim.carrying} dead=${sim.dead}`)
        }
    }
}
