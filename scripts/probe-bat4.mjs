// Temporary probe #4 — find the no-blackKey seed and measure the true drop time.
import { createSim, R, GW, GH, PLAYER_SPEED, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H } from '../src/games/Adventure/sim.js'
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

// Replicate trip 1 up to the blackKey checkpoint for seeds 1..100; report bat state.
for (let sd = 1; sd <= 100; sd++) {
    const sim = createSim(seedRng(sd))
    sim.player.x = 80
    cross(sim, 'down', R.OVERWORLD_1); cross(sim, 'down', R.OVERWORLD_2)
    sim.player.y = 90
    cross(sim, 'left', R.BLUE_LAB_1)
    driveTo(sim, 140, 90); driveTo(sim, 140, 170); driveTo(sim, 80, 170)
    cross(sim, 'down', R.BLUE_LAB_2)
    driveTo(sim, 76, 92)
    if (sim.carrying === 'blackKey') continue
    console.log(`seed ${sd}: checkpoint t=${sim.tick} room=${sim.room} bat.room=${sim.bat.room} batCarries=${sim.bat.carrying} swapTimer=${sim.bat.swapTimer} blackKey=(${sim.items.find(i => i.id === 'blackKey').room}, carried=${sim.items.find(i => i.id === 'blackKey').carried})`)
    // Now simulate the recovery wait: walk BL2 -> BL1 -> OW2, then wait for the drop.
    driveTo(sim, 80, 16)
    cross(sim, 'up', R.BLUE_LAB_1)
    driveTo(sim, 80, 16)
    cross(sim, 'up', R.OVERWORLD_2)
    const t0 = sim.tick
    let dropped = -1, restolen = 0
    for (let i = 0; i < 30000; i++) {
        step(sim, {})
        if (sim.bat.carrying === 'blackKey' && dropped > 0) restolen++
        if (sim.bat.carrying !== 'blackKey' && dropped < 0) {
            dropped = sim.tick - t0
            // try the pickup
            const bk = sim.items.find((i) => i.id === 'blackKey')
            driveTo(sim, bk.x, bk.y)
            console.log(`  waited ${dropped} ticks in OW2; pickup ok=${sim.carrying === 'blackKey'} blackKey=(${bk.room},${bk.x.toFixed(0)},${bk.y.toFixed(0)}) restolenLater=${restolen}`)
            break
        }
        if (sim.dead) { console.log(`  player DIED at t=${sim.tick - t0}`); break }
    }
    if (dropped < 0) console.log('  no drop within 30000 ticks')
}
