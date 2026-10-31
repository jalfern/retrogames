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
//
// Run: node scripts/floorbosscheck.mjs

import {
    makeGame, step, state, stateHash, createAutopilot, clickCell,
    SHIFT, QUOTA, STRIKES, RACK_CAP, OVERFLOW_FINE, EXPIRE_FINE, BASE_PAY,
} from '../src/games/FloorBoss/sim.js'
import { createEpisode, validateEpisode } from '../src/utils/robot/episode.js'

let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`  ok  ${msg}`); else { console.error(`FAIL  ${msg}`); fails++ } }

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
