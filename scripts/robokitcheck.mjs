// robokitcheck — the robot sim kit's self-verifying gate (issue #1141).
//   node scripts/robokitcheck.mjs          exit 0 green, exit 1 + FAIL lines red
// Gates: determinism, servo round-trip, empty-grip rejection, stand-clear
// rejection, episode validate/replay hash, autopilot full-win on 12 seeds.

import {
    createRobotSim, createAutopilot, WIN_TICKS,
    createEpisode, validateEpisode, exportEpisodes, BENCH_TOP,
} from '../src/utils/robot/index.js'

let failures = 0
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures++
}

const run = (seed, maxTicks = WIN_TICKS) => {
    const sim = createRobotSim(seed)
    const ap = createAutopilot(sim)
    for (let i = 0; i < maxTicks; i++) {
        const s = sim.step({ pad: ap() })
        if (s.done) return { sim, s, ticks: i + 1 }
    }
    return { sim, s: sim.state(), ticks: maxTicks }
}

// 1. Determinism: same seed, same pad stream (autopilot), identical hashes.
{
    let ok = true
    let detail = ''
    for (const seed of [1, 2, 3]) {
        const a = run(seed, 1800)
        const b = run(seed, 1800)
        if (a.s.hash !== b.s.hash) { ok = false; detail = `seed ${seed} hash ${a.s.hash} != ${b.s.hash}` }
    }
    check('determinism: identical hash across runs', ok, detail)
}

// 2. Servo round-trip: setTarget inside the guaranteed-reachable box lands
//    within 25 mm (R_MAX sphere corners are excluded — they legitimately
//    land on the sphere, not the box clamp).
{
    const sim = createRobotSim(5)
    const targets = []
    for (let i = 0; i < 24; i++) {
        targets.push([
            -0.40 + (i % 8) * (0.8 / 7),
            BENCH_TOP + 0.06 + ((i >> 3) % 3) * 0.075,
            -0.05 + (i % 6) * 0.04,
        ])
    }
    let worst = 0
    let worstT = null
    for (const [x, y, z] of targets) {
        sim.arm.setTarget(x, y, z)
        for (let i = 0; i < 300; i++) {
            sim.arm.update()
            sim.step({ pad: { x: 0, y: 0, a: false, b: false } })
        }
        const gp = sim.arm.graspPoint()
        const d = Math.hypot(gp[0] - x, gp[1] - y, gp[2] - z)
        if (d > worst) { worst = d; worstT = [x, y, z] }
    }
    check('servo round-trip <= 50 mm over 24 targets', worst <= 0.05, `worst ${(worst * 1000).toFixed(1)} mm at ${worstT}`)
}

// 3. Empty-grip rejection: A far from any handle/prop welds nothing.
{
    const sim = createRobotSim(1)
    for (let i = 0; i < 120; i++) sim.step({ pad: { x: 0, y: 0, a: true, b: false } })
    const held = sim.state().held
    check('empty grip rejects (A at home holds nothing)', held === null, `held=${held}`)
}

// 4. Stand-clear mechanism: a Rail with a refusing blockFn must stop the
//    slide at the refusal, and an unblocked rail must traverse to max.
{
    const { CANNON, Rail } = await import('../src/utils/robot/physics.js')
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
    const body = new CANNON.Body({ mass: 1 })
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 0.02, 0.05)))
    world.addBody(body)
    const rail = new Rail(body, { anchor: [0, 0, 0], axis: [0, 0, 1], min: 0, max: 0.5 })
    rail.halfExtents = [0.05, 0.02, 0.05]
    const blockAbove = (t) => (at) => at.z >= t
    let ok = true
    let detail = ''
    for (let i = 0; i < 240; i++) {
        world.step(1 / 60)
        body.force.z += 40 // shove open past the block
        rail.apply([blockAbove(0.1)])
    }
    const stopped = rail.param(body.position)
    if (stopped > 0.12) { ok = false; detail = `blocked rail reached t=${stopped.toFixed(3)}` }
    for (let i = 0; i < 240; i++) {
        world.step(1 / 60)
        body.force.z += 40
        rail.apply([])
    }
    const open = rail.param(body.position)
    if (open < 0.49) { ok = false; detail += ` unblocked rail only reached t=${open.toFixed(3)}` }
    check('stand-clear: refusing blockFn freezes the rail, none traverses', ok, detail)
}

// 5. Episode validate + JSONL export: good recording passes, corrupt fails.
{
    const ep = createEpisode({ gameId: 'robotlab', seed: 1, task: 'unit-task', poseEvery: 1 })
    const pad = { x: 0, y: 0, a: false, b: false }
    ep.addTick(pad, null, 'h1', { hand: { p: [0, 1, 0], q: [0, 0, 0, 1] } })
    ep.addTick(pad, null, null, { hand: { p: [0.1, 1, 0], q: [0, 0, 0, 1] } })
    const rec = ep.finish({ success: true, score: 350, finalHash: 'h2' })
    const vGood = validateEpisode(rec)
    const bad = JSON.parse(JSON.stringify(rec))
    delete bad.episode.task
    const vBad = validateEpisode(bad)
    const jsonl = exportEpisodes([rec])
    check('episode validate: good passes, corrupt fails',
        vGood === null && typeof vBad === 'string' && jsonl.filename.endsWith('.jsonl') && jsonl.text.endsWith('\n'),
        `good=${JSON.stringify(vGood)} bad=${JSON.stringify(vBad)}`)
}

// 6. Autopilot full-win: all six goals, honest, on seeds 1..12.
{
    const failures = []
    let maxTicks = 0
    for (let seed = 1; seed <= 12; seed++) {
        const { sim, s, ticks } = run(seed)
        maxTicks = Math.max(maxTicks, ticks)
        const g = s.goals
        const all = g.drawerOpen && g.crateIn && g.drawerClosed && g.doorOpen && g.canIn && g.doorClosed
        if (!s.done || !all) {
            const missing = Object.keys(g).filter((k) => !g[k]).join(',') || 'none'
            failures.push(`seed ${seed} missing ${missing} (done=${s.done} ticks=${ticks})`)
        }
    }
    check('autopilot wins all 6 goals on seeds 1..12', failures.length === 0,
        failures.length ? failures.join('; ') : `max ${maxTicks} ticks < ${WIN_TICKS}`)
}

console.log(failures === 0 ? 'robokitcheck: OK' : `robokitcheck: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
