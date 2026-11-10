// floorbosscheck.mjs — FLOOR BOSS is real without a browser (issue #1144).
//
// Proves three things plus the Plaicraft spine:
//   BOOTS  — seeded sims tick with a stable state shape on many seeds
//   RULES  — robots never share a cell (blocked() is asked), a stalled pair
//            becomes a JAM and a click backs one off, wear causes a DOWN that
//            clicks shorten but never skip, a covered order ships and pays,
//            a full floor overflows the belt, three expirations end the shift,
//            and the autopilot clears quota (the WIN proof, several seeds)
//   HONEST — same seed + same pads = identical hashes twice; different seed
//            differs; the kit episode recorder validates a recorded shift.
//   SERVO  — (#1872) the gantry self-stows in-reach racks when no bot is
//            detailed, yields the bay to any detailed bot, never races the
//            handoff mid-swing, and stays inside ARM_REACH.
//
// Run: node scripts/floorbosscheck.mjs
//   node scripts/floorbosscheck.mjs --mutate-yield  # break the bay-yield law, demand RED
//   node scripts/floorbosscheck.mjs --mutate-reach  # widen reach past the law, demand RED

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell,
    SHIFT, QUOTA, STRIKES, RACK_CAP, OVERFLOW_FINE, EXPIRE_FINE, BASE_PAY,
    STOW_PAY, ARM_REACH, ARM_PATIENCE, ARM_CELL,
} from '../src/games/FloorBoss/sim.js'
import { createEpisode, validateEpisode } from '../src/utils/robot/episode.js'

const ARGS = process.argv.slice(2)
let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`  ok  ${msg}`); else { console.error(`FAIL  ${msg}`); fails++ } }

// ---- mutant mode: plant one load-bearing lie, a child run must go red ----
const MUT_YIELD = ARGS.includes('--mutate-yield')
const MUT_REACH = ARGS.includes('--mutate-reach')
if (MUT_YIELD || MUT_REACH) {
    const sim = new URL('../src/games/FloorBoss/sim.js', import.meta.url)
    const src = readFileSync(sim, 'utf8')
    const [from, to, name] = MUT_YIELD
        ? ['if (gs.arm.heldT >= ARM_PATIENCE && !bayClaimed(gs)) {', 'if (gs.arm.heldT >= ARM_PATIENCE) {', 'the servo ignores detailed bots and swings anyway']
        : ['export const ARM_REACH = 4', 'export const ARM_REACH = 9', 'the gantry reaches past its law']
    if (!src.includes(from)) { console.error('MUTATE: load-bearing line not found — probing stale code.'); process.exit(2) }
    plant(sim, src.replace(from, to))
    console.log(`  ..    mutated: ${name} — this run MUST report FAILs`)
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
    pull(sim)
    const red = /FAIL/.test((r.stdout || '') + (r.stderr || ''))
    console.log(red ? '  ok  mutant killed (servo laws went red)' : 'FAIL  MUTANT SURVIVED — the servo laws cannot fail')
    process.exit(red ? 0 : 1)
}

console.log('— boots —')
for (const seed of [7, 1337, 4242, 99]) {
    const gs = makeGame(seed)
    const hashes = new Set()
    let threw = null
    try {
        for (let i = 0; i < 600; i++) { step(gs, [{}]); hashes.add(stateHash(gs)) }
    } catch (e) { threw = e }
    ok(!threw && gs.tick === 600 && hashes.size > 50, `seed ${seed}: 600 ticks, world moves (${hashes.size} hashes)${threw ? ' — ' + threw.message : ''}`)
}
{
    const s = state(makeGame(7))
    const keys = ['tick', 'score', 'quota', 'strikes', 'done', 'robots', 'racks', 'orders', 'staging', 'conveyor', 'armHeld', 'auto', 'cursor', 'hash', 'seed']
    ok(keys.every((k) => k in s), 'state shape complete')
}

console.log('— rules —')
{
    // conveyor runs
    const gs = makeGame(7)
    while (!gs.conv.length && gs.tick < SHIFT) step(gs, [{}])
    const before = gs.conv[0].x
    for (let i = 0; i < 8; i++) step(gs, [{}])
    ok(gs.conv[0] && gs.conv[0].x > before, `belt moves cargo (x ${before} -> ${gs.conv[0] && gs.conv[0].x})`)
}
{
    // never share a cell — hard occupancy watch across a long autopilot shift
    const gs = makeGame(4242)
    const ap = createAutopilot()
    let collide = 0
    while (!gs.end && gs.tick < SHIFT + 10) {
        step(gs, [ap(gs)])
        const seen = new Set()
        for (const b of gs.robots) { if (seen.has(`${b.x},${b.y}`)) collide++; seen.add(`${b.x},${b.y}`) }
    }
    ok(collide === 0, `robots never occupy one cell across a full shift (${gs.tick} ticks)`)
}
{
    // JAM: two robots deadlocked head-on in a capped aisle, click clears one.
    // The floor is wide open, so prove the honest way — build the aisle with
    // racks (racks are obstacles), park the pair nose to nose, task them at
    // each other's exit. No path exists for either; both stall; jam.
    const gs = makeGame(7)
    for (const x of [10, 11, 12, 13, 14, 15]) { gs.racks.push({ x, y: 8, items: [] }); gs.racks.push({ x, y: 10, items: [] }) }
    gs.racks.push({ x: 10, y: 9, items: [] }, { x: 15, y: 9, items: [] })
    const [a, b] = gs.robots
    a.x = 12; a.y = 9
    b.x = 13; b.y = 9
    a.task = { kind: 'toOut' }; b.task = { kind: 'toRack', rx: 5, ry: 9, item: 'crate' }
    a.path = []; b.path = []
    gs.auto = false
    let jammed = false
    for (let i = 0; i < 200 && !jammed; i++) { step(gs, [{}]); jammed = a.jam && b.jam }
    ok(jammed, 'two stalled neighbors escalate to JAM')
    clickCell(gs, a.x, a.y)
    ok(!a.jam, 'clicking a JAM bot backs it off')
}
{
    // breakdown: clicks shorten the fix but the clock also fixes it, slowly
    const gs = makeGame(7)
    const b = gs.robots[0]
    gs.auto = false
    b.wear = b.wearMax - 1
    b.task = { kind: 'toRack', rx: 14, ry: 3, item: 'crate' }
    b.x = 18; b.y = 7 // start off the home pads so it must actually walk
    b.path = [{ x: 18, y: 6 }]
    b.hist = []
    while (gs.tick < 10) step(gs, [{}])
    step(gs, [{}]) // lands the step that trips wear
    ok(b.broken, 'wear trips a DOWN')
    const before = b.repair
    for (let i = 0; i < 8; i++) clickCell(gs, b.x, b.y)
    ok(b.repair < before - 8 * 10, `turbo clicks chew the repair (${before} -> ${b.repair})`)
    let waited = 0
    while (b.broken && waited < 1400) { step(gs, [{}]); waited++ }
    ok(!b.broken && b.wear === 0, `unattended fix completes (idle ~${waited} ticks)`)
}
{
    // shipping: a covered order pays base + on-time bonus and frees staging
    const gs = makeGame(7)
    gs.staging.push('crate', 'can', 'coil')
    gs.orders.push({ id: 999, items: ['crate', 'coil'], due: gs.tick + 1200, prio: false, shipped: false, expired: false })
    const s0 = gs.score
    for (let i = 0; i < 40; i++) step(gs, [{}])
    // on-time bonus is per item (two-item order pays base + 2 × 25)
    ok(gs.shipped === 1 && gs.score - s0 === BASE_PAY.crate + BASE_PAY.coil + 50, `order packed and shipped (+${gs.score - s0})`)
    ok(gs.staging.length === 1 && gs.staging[0] === 'can', 'staging consumed exactly the shipped kinds')
}
{
    // overflow: a full floor refuses the belt
    const gs = makeGame(7)
    gs.auto = false
    for (const r of gs.racks) r.items = new Array(RACK_CAP).fill('crate')
    const s0 = gs.score
    let fined = false
    for (let i = 0; i < SHIFT; i++) { step(gs, [{}]); if (gs.ev.some((e) => e.type === 'overflow')) { fined = true; break } }
    ok(fined && gs.score === s0 - OVERFLOW_FINE, 'a full floor overflows the belt (fine paid)')
}
{
    // three expirations end the shift early
    const gs = makeGame(7)
    gs.auto = false
    for (const r of gs.racks) r.items = []
    gs.orders = []
    for (let i = 0; i < STRIKES; i++) gs.orders.push({ id: 990 + i, items: ['crate'], due: gs.tick + 30 + i, prio: false, shipped: false, expired: false })
    for (let i = 0; i < 80 && !gs.end; i++) step(gs, [{}])
    ok(gs.end === 'fired' && gs.expired === STRIKES, `strike ${STRIKES} fires the boss`)
}

console.log('— servo arm (#1872) —')
{
    // self-stow with the bots idle and untouched: racks emptied so the
    // gantry has room, auto off so no bot is ever detailed
    const gs = makeGame(7)
    gs.auto = false
    for (const r of gs.racks) r.items = []
    const pos0 = gs.robots.map((r) => `${r.x},${r.y}`).join(' ')
    const cargo0 = gs.racks.reduce((s, r) => s + r.items.length, 0)
    const s0 = gs.score
    let servoStows = 0
    for (let i = 0; i < 6000 && servoStows < 3; i++) {
        step(gs, [{}])
        servoStows += gs.ev.filter((e) => e.type === 'armstow').length
    }
    const pos1 = gs.robots.map((r) => `${r.x},${r.y}`).join(' ')
    ok(servoStows >= 3 && pos0 === pos1
        && gs.racks.reduce((s, r) => s + r.items.length, 0) - cargo0 >= 3
        && gs.stows >= 3 && gs.score >= s0 + 3 * STOW_PAY,
        `servo loads in-reach racks while bots idle and unmoved (${servoStows} stows, counter and pay banked)`)
}
{
    // bay-first yield: detail a bot the tick the arm loads; the servo waits
    // out its patience anyway (travel > patience) yet must never swing.
    const gs = makeGame(7)
    gs.auto = false
    for (const r of gs.racks) r.items = []
    let swungWhileDetailed = false, bayServed = false, heldTAtBay = 0
    for (let i = 0; i < 3000 && !bayServed; i++) {
        step(gs, [{}])
        if (gs.arm.held && gs.arm.swing === 0 && !gs.robots.some((b) => b.task.kind === 'toArm')) clickCell(gs, ARM_CELL.x, ARM_CELL.y)
        if (gs.arm.swing > 0 && gs.robots.some((b) => b.task.kind === 'toArm' && !b.broken)) swungWhileDetailed = true
        if (gs.ev.some((e) => e.type === 'bay')) { bayServed = true; heldTAtBay = gs.arm.heldT }
    }
    ok(bayServed && !swungWhileDetailed && heldTAtBay > ARM_PATIENCE,
        `detailed bot owns the bay past patience (served at heldT ${heldTAtBay} > ${ARM_PATIENCE}, zero swings)`)
}
{
    // invariants across full autopilot shifts: swing never starts contested,
    // handoff never races a swing, stows stay in reach, patience always honored
    let violYield = 0, violRace = 0, violReach = 0, violPatience = 0, servoStows = 0
    for (const seed of [7, 1337, 4242]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        while (!gs.end && gs.tick < SHIFT + 10) {
            step(gs, [ap(gs)])
            if (gs.arm.swing > 0) {
                if (gs.robots.some((b) => b.task.kind === 'toArm' && !b.broken)) violYield++
                if (gs.ev.some((e) => e.type === 'bay')) violRace++
            }
            for (const e of gs.ev) {
                if (e.type === 'armstow') {
                    servoStows++
                    if (Math.abs(e.x - ARM_CELL.x) + Math.abs(e.y - ARM_CELL.y) > ARM_REACH) violReach++
                }
                if (e.type === 'armswing' && gs.arm.heldT < ARM_PATIENCE) violPatience++
            }
        }
    }
    ok(violYield === 0, 'swing never starts while a bot is detailed to the bay (3 autopilot shifts)')
    ok(violRace === 0, 'bay handoff never contested mid-swing')
    ok(violReach === 0, `every servo stow lands inside ARM_REACH ${ARM_REACH} (${servoStows} servo stows seen)`)
    ok(violPatience === 0, 'no swing before ARM_PATIENCE held-ticks')
}

console.log('— servo presentation (#1877, source pins) —')
{
    // Painter-only law: the servo carry must ride the SHARED ghost-arc painter
    // (no forked second ghost list), timed off the sim's own swing so the arc
    // can never lie about how long the cargo is in the air. The reach diamond
    // must pulse (not sit static) while cargo waits loaded. Functional proof
    // of both is in floorbossplay; these pins keep the choice from rotting.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    const swingCase = ui.match(/case 'armswing':[\s\S]*?break/)
    ok(!!swingCase && /arcItems\.push\(\{[\s\S]*?servo:\s*true/.test(swingCase[0]),
        'servo carry pushes a ghost onto the shared arcItems painter (no fork)')
    ok(!!swingCase && /n:\s*gs\.arm\.swingT0/.test(swingCase[0]),
        'the carry ghost duration is the sim swing (arc cannot lie about the carry)')
    ok(!!swingCase && /kind:\s*gs\.arm\.held/.test(swingCase[0]),
        'the carry ghost carries the cargo the gripper actually holds')
    ok(/const n = a\.n \|\| 15/.test(ui), 'the shared arc painter honours per-arc durations (bay keeps 15)')
    ok(/gs\.arm\.held && gs\.arm\.swing === 0/.test(ui) && /Math\.sin\(gs\.arm\.heldT/.test(ui),
        'reach diamond pulses on the sim patience counter while loaded-and-waiting')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(!/arcItems|ghost/i.test(simSrc), 'presentation never leaks into the sim (hash stays honest)')
}

console.log('— win —')
for (const seed of [7, 1337, 4242]) {
    const gs = makeGame(seed)
    const ap = createAutopilot()
    while (!gs.end && gs.tick < SHIFT + 10) step(gs, [ap(gs)])
    ok(gs.end === 'win' && gs.score >= QUOTA, `autopilot clears quota on seed ${seed}: ${gs.score}/${QUOTA} (${gs.shipped} shipped)`)
}

console.log('— determinism —')
{
    const run = (seed) => {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        const samples = []
        while (!gs.end && gs.tick < 1200) { step(gs, [ap(gs)]); if (gs.tick % 150 === 0) samples.push(stateHash(gs)) }
        return { end: gs.end, samples, json: JSON.stringify(state(gs)) }
    }
    const a = run(7), b = run(7), c = run(1337)
    ok(a.json === b.json && a.samples.join() === b.samples.join(), 'seed 7 replays identical (state + 8 checkpoint hashes)')
    ok(a.json !== c.json, 'seed 1337 differs')
}

console.log('— plaicraft episode —')
{
    const gs = makeGame(7)
    const ap = createAutopilot()
    const ep = createEpisode({ gameId: 'floor-boss', method: 'dpad', seed: 7, players: 1, sources: ['human'], task: 'floor-boss-shift' })
    while (!gs.end && gs.tick < SHIFT + 10) {
        const pad = ap(gs)
        step(gs, [pad])
        ep.addTick([pad], null, stateHash(gs))
    }
    const file = ep.finish({ success: gs.end === 'win', score: gs.score, finalHash: stateHash(gs) })
    ok(validateEpisode(file) === null, `episode validates (${file.episode.poseCount} poses, ${file.ticks} ticks, success=${file.episode.success})`)
}

console.log(fails ? `\nFLOOR BOSS CHECK: ${fails} FAILED` : '\nFLOOR BOSS CHECK: all green')
process.exit(fails ? 1 : 0)
