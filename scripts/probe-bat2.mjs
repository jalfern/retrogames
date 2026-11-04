// Temporary probe #2 — reproduce the "no bridge" failure and trace the bat.
import { createSim, R, GW, GH, PLAYER_SPEED } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
const S = PLAYER_SPEED
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }

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

// replicate winRun up to the bridge pickup, logging bat position each tick
for (let sd = 1; sd <= 10; sd++) {
    const sim = createSim(seedRng(sd))
    const T = (tx, ty) => driveTo(sim, tx, ty)
    sim.player.x = 80
    cross(sim, 'down', R.OVERWORLD_1); cross(sim, 'down', R.OVERWORLD_2)
    sim.player.y = 90
    cross(sim, 'left', R.BLUE_LAB_1)
    T(140, 90); T(140, 170); T(80, 170)
    cross(sim, 'down', R.BLUE_LAB_2)
    T(76, 92)
    if (sim.carrying !== 'blackKey') { console.log(`seed ${sd}: no blackKey at first visit (bat=${sim.bat.room} carries=${sim.bat.carrying})`); continue }
    T(80, 16)
    cross(sim, 'up', R.BLUE_LAB_1)
    T(140, 168); T(140, 44); T(110, 16); T(80, 16)
    cross(sim, 'up', R.OVERWORLD_2)
    sim.player.y = 90
    cross(sim, 'right', R.OVERWORLD_4)
    sim.player.x = 80
    cross(sim, 'down', R.OVERWORLD_3)
    cross(sim, 'down', R.BLACK_CASTLE)
    sim.player.x = 80; sim.player.y = 32
    step(sim, { drop: true })
    for (let i = 0; i < 3 && !sim.gateOpen.blackKey; i++) step(sim, {})
    T(65, 24)
    cross(sim, 'down', R.OVERWORLD_3)
    cross(sim, 'up', R.OVERWORLD_2)
    sim.player.y = 70; sim.player.x = 95
    const bridge = sim.items.find((i) => i.id === 'bridge')
    T(96, 76)
    if (sim.carrying !== 'bridge') {
        console.log(`seed ${sd}: BRIDGE FAIL at t=${sim.tick} bat.room=${sim.bat.room} batCarries=${sim.bat.carrying} bridgeAt=(${bridge.room},${bridge.x.toFixed(0)},${bridge.y.toFixed(0)}) carried=${bridge.carried}`)
    } else {
        console.log(`seed ${sd}: ok (bridge at t=${sim.tick})`)
    }
}
