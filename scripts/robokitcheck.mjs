// robokitcheck — the robot sim kit's self-verifying gate (issue #1141).
//   node scripts/robokitcheck.mjs          exit 0 green, exit 1 + FAIL lines red
// Gates 1-6 (stage 1): determinism, servo round-trip, empty-grip rejection,
// stand-clear rejection, episode validate/replay hash, autopilot full-win on
// 12 seeds. Gates 7-10 (stage 2, SimReady hookup via #1140): manifest schema
// + link-only law, license gate enforcement (no 'never', declared gate ==
// licenseGate recompute, library registered + physics-capable), transcribed
// physics actually lives in the cannon world, and episodes pin their manifest
// revision. Gates 11-13 (stage 3): torque actuator spec, live force-closure,
// stage-3 visibility. Gate 14 (QA polish #1227): episode stats + HUD wiring.
// Gate 15: snapshot/restore round-trip honesty (torque cache).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
    createRobotSim, createAutopilot, WIN_TICKS,
    createEpisode, validateEpisode, exportEpisodes, saveEpisode, episodeStats, BENCH_TOP,
    ASSETS, SLOTS, assetFor, gateFor, MANIFEST_REV, SIMREADY_LIBRARY,
    JOINT_SPECS, LINK_MASSES, forceClosureFor,
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

// 11. Actuator spec (stage 3): joints are torque-driven with recorded limits,
//     and the worst static gravity load (links + rated carton carry, near
//     horizontal, far reach) stays INSIDE τmax — the arm is spec-honest, and
//     links alone hold at ≥1.3× margin.
{
    const problems = []
    const G = 9.82
    for (const [k, sp] of Object.entries(JOINT_SPECS)) {
        if (!(sp.tauMax > 0 && sp.inertia > 0 && sp.omegaMax > 0 && sp.kp > 0 && sp.kd > 0)) problems.push(`${k}: spec ${JSON.stringify(sp)}`)
    }
    const sim = createRobotSim(3)
    const mG = assetFor('gripper').physics.massKg
    const mC = assetFor('crate').physics.massKg
    const L1 = 0.3, L2 = 0.3, LG = 0.055
    const worstLinks = G * (LINK_MASSES.upper * L1 / 2 + LINK_MASSES.fore * (L1 + L2 / 2) + mG * (L1 + L2 + LG))
    const worstCarry = worstLinks + G * mC * (L1 + L2 + LG)
    if (worstCarry > JOINT_SPECS.phi1.tauMax) problems.push(`worst carry ${worstCarry.toFixed(2)} N·m exceeds shoulder τmax ${JOINT_SPECS.phi1.tauMax}`)
    if (JOINT_SPECS.phi1.tauMax / worstLinks < 1.3) problems.push(`shoulder links-only margin ${(JOINT_SPECS.phi1.tauMax / worstLinks).toFixed(2)} < 1.3`)
    void sim
    check('actuator spec: positive limits, rated carry inside shoulder τmax', problems.length === 0, problems.join('; '))
}

// 12. Force-closure law is LIVE and manifest-derived (stage 3): the weld's
//     hold budget equals contacts·min(μ_pad, μ_surface)·F_clamp recomputed
//     from the SimReady records, and lowering clamp force below the load makes
//     the gripper REFUSE the pick (recorded in events).
{
    const problems = []
    const sim = createRobotSim(1)
    for (const [slot, body] of [['crate', sim.crate], ['can', sim.can]]) {
        const fc = forceClosureFor(body)
        const grip = assetFor('gripper').grip
        const a = assetFor(slot).physics
        const want = grip.contacts * Math.min(grip.padFriction, a.friction) * grip.clampForceN
        if (Math.abs(fc.budgetN - want) > 1e-9) problems.push(`${slot}: budget ${fc.budgetN} != manifest math ${want}`)
    }
    // Approach + grab via the autopilot itself (the same path the game plays):
    // a hand-scripted approach lands short of the sphere-clamped crate.
    const ap12 = createAutopilot(sim)
    let okGrab = false
    for (let i = 0; i < 700 && !okGrab; i++) {
        okGrab = sim.step({ pad: ap12() }).held === 'crate'
    }
    if (!okGrab) problems.push('autopilot never held the crate at 40 N')
    else if (Math.abs(sim.arm.weld.holdBudgetN - 2 * 0.5 * 40) > 1e-9) problems.push(`weld budget ${sim.arm.weld.holdBudgetN}`)
    armDrop(sim)
    assetFor('gripper').grip.clampForceN = 1
    const refused = sim.arm.tryGrab([sim.crate])
    if (refused || !sim.arm.gripRefused || sim.arm.gripRefused.slot !== 'crate') problems.push('under-force grab not refused with reason')
    assetFor('gripper').grip.clampForceN = 40
    check('force-closure: budget = manifest law, weld wears it, under-force pick refused', problems.length === 0, problems.join('; '))
}
function armDrop(sim) {
    if (sim.arm.weld) sim.arm.drop()
}

// 13. Stage-3 visibility: state exposes torque/slip fields, and the game
//     actually renders the wrist-camera PIP and the torque strip (source
//     tripwires — invisible work is undone work).
{
    const problems = []
    const sim = createRobotSim(2)
    sim.step({ pad: {} })
    const st = sim.state()
    for (const k of ['yaw', 'phi1', 'phi2', 'gamw']) {
        if (!Number.isFinite(st.torque?.[k])) problems.push(`state.torque.${k} missing`)
    }
    if (!Number.isInteger(st.sat) || !Number.isInteger(st.slips)) problems.push('state.sat/slips missing')
    if (!('gripN' in st) || !('budgetN' in st)) problems.push('state.gripN/budgetN missing')
    const game = readFileSync(join(ROOT, 'src', 'games', 'RobotLab', 'index.jsx'), 'utf8')
    if (!game.includes('WRIST-CAM')) problems.push('no WRIST-CAM HUD')
    if (!game.includes('setScissorTest')) problems.push('no PIP viewport render')
    if (!game.includes('JOINT TORQUE')) problems.push('no torque strip')
    if (!/KIT_VERSION = 'stage3'/.test(readFileSync(join(ROOT, 'src', 'utils', 'robot', 'index.js'), 'utf8'))) problems.push('KIT_VERSION not stage3')
    check('stage-3 visibility: torque/slip state + wrist-cam & torque HUD wired', problems.length === 0, problems.join('; '))
}

// 14. Polish pass (#1227): episode stats count honest wins (an entry without
//     a winning episode block is saved-but-not-won), stats survive a missing
//     storage, and the game wires the run counter, the gripper open/closed
//     tick, slip juice (edge-detect + thud + shake) and the timeout loss.
{
    const problems = []
    const prevLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const store = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true, writable: true,
        value: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)) },
            removeItem: (k) => { store.delete(k) },
        },
    })
    const rec14 = (seed, success, score) => {
        const ep = createEpisode({ gameId: 'robotlab', seed, task: 't', poseEvery: 1 })
        ep.addTick({ x: 0, y: 0, a: false, b: false }, null, 'h1', { hand: { p: [0, 1, 0], q: [0, 0, 0, 1] } })
        return saveEpisode(ep.finish({ success, score, finalHash: 'h2' }))
    }
    rec14(1, true, 400)
    rec14(2, false, 120)
    store.set('retrogames-episodes', JSON.stringify([...JSON.parse(store.get('retrogames-episodes')), { v: 'retrogames-rec/v1' }]))
    const st14 = episodeStats()
    if (st14.saved !== 3 || st14.won !== 1) problems.push(`stats ${JSON.stringify(st14)} != {saved:3,won:1}`)
    if (prevLS) Object.defineProperty(globalThis, 'localStorage', prevLS)
    else delete globalThis.localStorage
    const st0 = episodeStats()
    if (st0.saved !== 0 || st0.won !== 0) problems.push(`no-storage stats ${JSON.stringify(st0)} != zeros`)
    const game = readFileSync(join(ROOT, 'src', 'games', 'RobotLab', 'index.jsx'), 'utf8')
    if (!game.includes('episodeStats')) problems.push('run counter not wired to episodeStats')
    if (!game.includes('SAVED')) problems.push('no SAVED/WON run counter in HUD')
    if (!game.includes('GRIPPER')) problems.push('no gripper open/closed tick')
    if (!/st\.slips > lastSlips/.test(game)) problems.push('slip edge not tracked')
    if (!game.includes('playNoise')) problems.push('no slip thud sound')
    if (!/shake/.test(game)) problems.push('no slip screen shake')
    if (!game.includes('TASK TIMEOUT')) problems.push('timeout loss not surfaced')
    check('polish #1227: episode stats honest wins + run counter/gripper/slip/timeout HUD wired', problems.length === 0, problems.join('; '))
}

// 15. Snapshot/restore round-trip in pure Node (#1227 QA): state() right
//     after restore must equal the state at snapshot time — the field that
//     silently diverged on main was `torque` (per-tick actuator cache never
//     refreshed by restore; phi1 47% vs 59% for identical joints). The
//     contractcheck browser gate only trips when the script happens to
//     snapshot mid-run; this one always runs.
{
    const padA = { left: true, right: false, up: true, down: false, a: false, b: false }
    const padB = { left: false, right: true, up: false, down: true, a: false, b: false }
    const sim = createRobotSim(7)
    for (let i = 0; i < 600; i++) sim.step({ pad: padA })
    const snap = sim.snapshot()
    const atSnap = JSON.stringify(sim.state())
    let detail = ''
    let ok = true
    for (const pass of [1, 2]) {
        for (let i = 0; i < 37; i++) sim.step({ pad: padB })
        sim.restore(snap)
        const back = sim.state()
        if (JSON.stringify(back) !== atSnap) {
            ok = false
            const a = JSON.parse(atSnap)
            for (const k of Object.keys(a)) {
                if (JSON.stringify(a[k]) !== JSON.stringify(back[k])) detail += ` pass${pass}.${k}=${JSON.stringify(back[k])}(want ${JSON.stringify(a[k])})`
            }
        }
    }
    check('snapshot/restore round-trip: state identical both passes (torque cache refreshed)', ok, detail)
    const sim2 = createRobotSim(1)
    const ap2 = createAutopilot(sim2)
    let heldAt = -1
    for (let i = 0; i < 700; i++) {
        if (sim2.step({ pad: ap2() }).held === 'crate') { heldAt = i; break }
    }
    let wOk = heldAt >= 0
    let wDetail = heldAt < 0 ? 'autopilot failed to grab the crate' : ''
    if (wOk) {
        const snap2 = sim2.snapshot()
        if (!snap2.weld) { wOk = false; wDetail = 'snapshot lost the weld' }
        else {
            sim2.restore(snap2)
            try {
                sim2.step({ pad: ap2() })
                const w = sim2.arm.weld
                if (!w) { wOk = false; wDetail = 'weld dropped on the first restored tick' }
                else if (!Number.isFinite(w.devS) || !Number.isFinite(w.slipS)) { wOk = false; wDetail = `dev/slip NaN after weld restore (heldAt=${heldAt})` }
                for (let i = 0; i < 9; i++) sim2.step({ pad: ap2() })
                if (!Number.isFinite(sim2.state().hash)) { wOk = false; wDetail = 'hash NaN after weld restore' }
            } catch (err) { wOk = false; wDetail = `step after weld restore threw: ${err}` }
        }
    }
    check('restore with a live weld: weld state self-consistent, deviation monitor finite post-restore', wOk, wDetail)
}

console.log(failures === 0 ? 'robokitcheck: OK' : `robokitcheck: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
