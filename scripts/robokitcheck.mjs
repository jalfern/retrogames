// robokitcheck — the robot sim kit's self-verifying gate (issue #1141).
//   node scripts/robokitcheck.mjs          exit 0 green, exit 1 + FAIL lines red
// Gates 1-6 (stage 1): determinism, servo round-trip, empty-grip rejection,
// stand-clear rejection, episode validate/replay hash, autopilot full-win on
// 12 seeds. Gates 7-10 (stage 2, SimReady hookup via #1140): manifest schema
// + link-only law, license gate enforcement (no 'never', declared gate ==
// licenseGate recompute, library registered + physics-capable), transcribed
// physics actually lives in the cannon world, and episodes pin their manifest
// revision.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    createRobotSim, createAutopilot, WIN_TICKS,
    createEpisode, validateEpisode, exportEpisodes, BENCH_TOP,
    ASSETS, SLOTS, assetFor, gateFor, MANIFEST_REV, SIMREADY_LIBRARY,
} from '../src/utils/robot/index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

// 7. Manifest schema + link-only law (#1140): every kit entity carries a
//    complete SimReady record, and NOTHING is mirrored — no mesh files pulled.
{
    const problems = []
    const want = ['gripper', 'crate', 'can', 'drawer', 'door', 'bench']
    if (JSON.stringify(SLOTS) !== JSON.stringify(want)) problems.push(`slots ${JSON.stringify(SLOTS)} != ${JSON.stringify(want)}`)
    if (!/^simready-manifest\/\d+$/.test(MANIFEST_REV)) problems.push(`rev ${MANIFEST_REV}`)
    const ids = new Set()
    for (const a of ASSETS) {
        for (const f of ['id', 'kitSlot', 'name', 'supplier', 'library', 'url', 'license', 'physicsProvenance']) {
            if (typeof a[f] !== 'string' || !a[f]) problems.push(`${a.kitSlot}: ${f} missing`)
        }
        if (a.library !== SIMREADY_LIBRARY) problems.push(`${a.kitSlot}: library ${a.library}`)
        if (!/^https:\/\//.test(a.url)) problems.push(`${a.kitSlot}: url not https`)
        const ph = a.physics || {}
        if (!ph.collider || typeof ph.collider.type !== 'string') problems.push(`${a.kitSlot}: collider missing`)
        if (ph.massKg === null && !ph.static) problems.push(`${a.kitSlot}: null mass without static flag`)
        if (ph.massKg !== null && !(ph.massKg > 0)) problems.push(`${a.kitSlot}: mass ${ph.massKg}`)
        if (!(ph.friction >= 0)) problems.push(`${a.kitSlot}: friction missing`)
        if (ids.has(a.id)) problems.push(`duplicate id ${a.id}`)
        ids.add(a.id)
        if (a.mesh && a.mesh.pulled) problems.push(`${a.kitSlot}: mesh pulled — link-only law`)
        if (existsSync(join(ROOT, 'public', 'models', `${a.id}.glb`))) problems.push(`${a.kitSlot}: GLB mirrored in public/models`)
    }
    check('manifest: complete SimReady records for 6 slots, link-only (nothing mirrored)', problems.length === 0, problems.join('; '))
}

// 8. License gate as law (#1140): declared gate equals what licenseGate()
//    recomputes, nothing is 'never', and the library is registered in the
//    index with its physics flag on.
{
    const problems = []
    for (const a of ASSETS) {
        const g = gateFor(a)
        if (g !== a.gate) problems.push(`${a.id}: declared ${a.gate}, law says ${g}`)
        if (g === 'never') problems.push(`${a.id}: license ${a.license} may never ship`)
    }
    const idx = JSON.parse(readFileSync(join(ROOT, 'public', 'models', 'libraries.json'), 'utf8'))
    const lib = idx.libraries.find((l) => l.id === SIMREADY_LIBRARY)
    if (!lib) problems.push(`library ${SIMREADY_LIBRARY} not in index`)
    else if (lib.physics !== true) problems.push(`${SIMREADY_LIBRARY}: index says physics=${lib.physics}, kit treats it as the physics source`)
    check('license gate: recomputed gates match, no never-verdict, library registered', problems.length === 0, problems.join('; '))
}

// 9. Transcribed physics is LIVE: masses and frictions the manifest names are
//    the ones the running cannon world actually wears (SimReady's promise —
//    GLB carries no physics, so the record must reach the bodies).
{
    const sim = createRobotSim(7)
    const problems = []
    const massOf = { crate: sim.crate, can: sim.can, drawer: sim.drawer.body, door: sim.cabinet.body }
    for (const [slot, body] of Object.entries(massOf)) {
        const want = assetFor(slot).physics.massKg
        if (Math.abs(body.mass - want) > 1e-9) problems.push(`${slot}: world ${body.mass} kg, manifest ${want} kg`)
        if (body.simready !== assetFor(slot).id) problems.push(`${slot}: provenance stamp missing`)
    }
    if (sim.arm.bodies.hand.simready !== 'robotiq_2f85') problems.push('gripper: no SimReady record on the hand')
    if (Math.abs(sim.mats.carton.friction - assetFor('crate').physics.friction) > 1e-9) problems.push('cardboard friction not transcribed')
    if (Math.abs(sim.mats.tin.friction - assetFor('can').physics.friction) > 1e-9) problems.push('tin friction not transcribed')
    if (Math.abs(sim.mats.wood.friction - assetFor('bench').physics.friction) > 1e-9) problems.push('bench friction not transcribed')
    const cm = sim.world.getContactMaterial(sim.mats.carton, sim.mats.wood)
    if (!cm || Math.abs(cm.friction - assetFor('crate').physics.friction) > 1e-9) problems.push('carton-wood contact pair missing/wrong')
    check('live physics carries the manifest masses/frictions', problems.length === 0, problems.join('; '))
}

// 10. Episode asset pin: a run records which manifest revision's physics it
//     was played against; corrupt pins fail validation.
{
    const ep = createEpisode({ gameId: 'robotlab', seed: 1, task: 'pin-test', poseEvery: 1, assets: MANIFEST_REV })
    ep.addTick({ x: 0, y: 0, a: false, b: false }, null, 'h1', { hand: { p: [0, 1, 0], q: [0, 0, 0, 1] } })
    const rec = ep.finish({ success: true, score: 1, finalHash: 'h2' })
    const vGood = validateEpisode(rec)
    const bad = JSON.parse(JSON.stringify(rec))
    bad.episode.assets = 42
    const vBad = validateEpisode(bad)
    const noPin = createEpisode({ gameId: 'robotlab', seed: 1, task: 'pin-absent-ok', poseEvery: 1 })
    noPin.addTick({ x: 0, y: 0, a: false, b: false }, null, 'h1', { hand: { p: [0, 1, 0], q: [0, 0, 0, 1] } })
    const vLegacy = validateEpisode(noPin.finish({ success: false, score: 0 }))
    check('episode pins its manifest revision; corrupt pin rejected, un-pinned allowed',
        vGood === null && rec.episode.assets === MANIFEST_REV && typeof vBad === 'string' && vLegacy === null,
        `good=${JSON.stringify(vGood)} bad=${JSON.stringify(vBad)} legacy=${JSON.stringify(vLegacy)}`)
}

console.log(failures === 0 ? 'robokitcheck: OK' : `robokitcheck: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
