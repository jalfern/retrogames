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
//   LOAD-OUT — (#1911) ships stage parcels on the pad, the pad caps the pack
//            line, trucks are called by law (cap/age) or by a manager tap, load
//            box by box, and drive off carrying exactly what they loaded.
//   FREIGHT  — (#1921) pack BOOKS money as escrow on the parcel; the till rings
//            when the trailer physically hauls the last box; hauls of
//            FULL_TRAILER+ boxes earn FREIGHT_PER_BOX per box; manager tap-calls
//            pay the DISPATCH_FEE (law pickups are free); across autopilot
//            shifts the books balance — every credit has a ledger line.
//
// Run: node scripts/floorbosscheck.mjs
//   node scripts/floorbosscheck.mjs --mutate-yield    # break the bay-yield law, demand RED
//   node scripts/floorbosscheck.mjs --mutate-reach    # widen reach past the law, demand RED
//   node scripts/floorbosscheck.mjs --mutate-cap      # let the dock pack past the pad, demand RED
//   node scripts/floorbosscheck.mjs --mutate-freight  # pay at pack again (old till), demand RED
//   node scripts/floorbosscheck.mjs --mutate-bonus    # dribbles earn freight too, demand RED
//   node scripts/floorbosscheck.mjs --mutate-tiers    # far posts pay the LOCAL rate, demand RED (#1927)
//   node scripts/floorbosscheck.mjs --mutate-miles    # the truck never leaves the depot on the road, demand RED (#1927)
//   node scripts/floorbosscheck.mjs --mutate-weight   # heavy crates pay the LIGHT rate, demand RED (#1931)
//   node scripts/floorbosscheck.mjs --mutate-slow     # heavies load at light speed, demand RED (#1931)
//   node scripts/floorbosscheck.mjs --mutate-bands    # the inverted dest band returns, demand RED (#1931)

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell,
    SHIFT, QUOTA, STRIKES, RACK_CAP, OVERFLOW_FINE, EXPIRE_FINE, BREAK_FINE, BASE_PAY,
    STOW_PAY, RACK_COST, ROBOT_COST, ARM_PATIENCE, ARM_CELL, PAD_CAP, PAD_AGE,
    FREIGHT_PER_BOX, FULL_TRAILER, DISPATCH_FEE,
} from '../src/games/FloorBoss/sim.js'
import { createEpisode, validateEpisode } from '../src/utils/robot/episode.js'
import { hashString } from '../src/utils/robot/physics.js'

const ARGS = process.argv.slice(2)
let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`  ok  ${msg}`); else { console.error(`FAIL  ${msg}`); fails++ } }

// ---- mutant mode: plant one load-bearing lie, a child run must go red ----
const MUT_YIELD = ARGS.includes('--mutate-yield')
const MUT_REACH = ARGS.includes('--mutate-reach')
const MUT_CAP = ARGS.includes('--mutate-cap')
const MUT_FREIGHT = ARGS.includes('--mutate-freight')
const MUT_BONUS = ARGS.includes('--mutate-bonus')
const MUT_TIERS = ARGS.includes('--mutate-tiers')
const MUT_MILES = ARGS.includes('--mutate-miles')
const MUT_WEIGHT = ARGS.includes('--mutate-weight')
const MUT_SLOW = ARGS.includes('--mutate-slow')
const MUT_BANDS = ARGS.includes('--mutate-bands')
if (MUT_YIELD || MUT_REACH || MUT_CAP || MUT_FREIGHT || MUT_BONUS || MUT_TIERS || MUT_MILES || MUT_WEIGHT || MUT_SLOW || MUT_BANDS) {
    const sim = new URL('../src/games/FloorBoss/sim.js', import.meta.url)
    const src = readFileSync(sim, 'utf8')
    const [from, to, name] = MUT_YIELD
        ? ['if (gs.arm.heldT >= ARM_PATIENCE && !bayClaimed(gs)) {', 'if (gs.arm.heldT >= ARM_PATIENCE) {', 'the servo ignores detailed bots and swings anyway']
        : MUT_CAP
            ? ['if (gs.pad.length >= PAD_CAP) break', 'if (gs.pad.length >= PAD_CAP + 1) break', 'the dock packs past the pad — parcels pile beyond the pipe']
            : MUT_FREIGHT
                ? ['gs.escrow += pay', 'gs.score += pay', 'the old till is back — pack pays cash and the trailer hauls free money']
                : MUT_TIERS
                    ? ['amt += FREIGHT_PER_BOX * FREIGHT_MULT[d] * WEIGHT_MULT[w] * (tr.grid[d][w] || 0)', 'amt += FREIGHT_PER_BOX * WEIGHT_MULT[w] * (tr.grid[d][w] || 0)', 'distance dies — far posts pay the LOCAL rate (#1927)']
                    : MUT_MILES
                        ? ['export const TRIP_TICKS = [0, 750, 1650]', 'export const TRIP_TICKS = [0, 0, 0]', 'the road shrinks — the truck answers instantly from any distance (#1927)']
                        : MUT_BONUS
                            ? ['if (tr.carry >= FULL_TRAILER) {', 'if (tr.carry >= 0) {', 'every dribble haul claims the freight bonus it did not earn']
                            : MUT_WEIGHT
                                ? ['amt += FREIGHT_PER_BOX * FREIGHT_MULT[d] * WEIGHT_MULT[w] * (tr.grid[d][w] || 0)', 'amt += FREIGHT_PER_BOX * FREIGHT_MULT[d] * (tr.grid[d][w] || 0)', 'weight dies — heavy crates pay the LIGHT rate (#1931)']
                                : MUT_SLOW
                                    ? ['export const WEIGHT_LOAD = [1, 1, 2]', 'export const WEIGHT_LOAD = [1, 1, 1]', 'the dock never slows for a heavy crate — free speed (#1931)']
                                    : MUT_BANDS
                                        ? ['dr < DEST_ODDS[DEST_LONGHAUL] + DEST_ODDS[DEST_REGIONAL] ? DEST_REGIONAL : DEST_LOCAL', 'dr < DEST_ODDS[DEST_LOCAL] + DEST_ODDS[DEST_REGIONAL] ? DEST_REGIONAL : DEST_LOCAL', 'the inverted band is back — REGIONAL hoards LOCAL\'s share (#1931 fix)']
                                        : ['export const ARM_REACH = 4', 'export const ARM_REACH = 9', 'the gantry reaches past its law']
    if (!src.includes(from)) { console.error('MUTATE: load-bearing line not found — probing stale code.'); process.exit(2) }
    plant(sim, src.replace(from, to))
    console.log(`  ..    mutated: ${name} — this run MUST report FAILs`)
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
    pull(sim)
    const red = /FAIL/.test((r.stdout || '') + (r.stderr || ''))
    console.log(red ? '  ok  mutant killed (named laws went red)' : 'FAIL  MUTANT SURVIVED — the named laws cannot fail')
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
    const keys = ['tick', 'score', 'quota', 'strikes', 'done', 'robots', 'racks', 'orders', 'staging', 'conveyor', 'armHeld', 'auto', 'cursor', 'hash', 'seed', 'pad', 'truck', 'carry', 'escrow', 'freight', 'fees', 'padAge']
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
    // freight line (#1921): a covered order is BOOKED at pack — the payout rides
    // the parcel as escrow and the score does NOT move; the credits land when the
    // trailer physically hauls the parcel's last box away (law call, so no fee)
    const gs = makeGame(7)
    gs.auto = false
    gs.staging.push('crate', 'can', 'coil')
    gs.orders.push({ id: 999, items: ['crate', 'coil'], due: gs.tick + 1200, prio: false, shipped: false, expired: false })
    const s0 = gs.score
    for (let i = 0; i < 40; i++) step(gs, [{}])
    const esc = gs.pad.length === 1 ? gs.pad[0].esc : 0
    const want = BASE_PAY.crate + BASE_PAY.coil + 50 // two-item on-time order: base + 2 × ONTIME_BONUS
    ok(gs.shipped === 1 && gs.score === s0 && gs.escrow === want && esc === want
        && gs.staging.length === 1 && gs.staging[0] === 'can',
        `a packed order escrows ${esc} instead of paying, staging drained exactly (score frozen at pack)`)
    let paidAt = 0, payEv = 0
    for (let i = 0; i < 1200 && !paidAt; i++) {
        step(gs, [{}])
        const f = gs.ev.find((e) => e.type === 'freight')
        if (f) { paidAt = gs.tick; payEv = f.pay }
    }
    ok(paidAt > 0 && gs.escrow === 0 && gs.paid === want && gs.score === s0 + want && payEv === want,
        `money follows freight: +${gs.paid} lands when the trailer hauls the last box (law pickup, no fee)`)
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
                    // legal reach pinned as a literal: widening the constant must
                    // not widen the law it is measured against (self-sealing pin)
                    if (Math.abs(e.x - ARM_CELL.x) + Math.abs(e.y - ARM_CELL.y) > 4) violReach++
                }
                if (e.type === 'armswing' && gs.arm.heldT < ARM_PATIENCE) violPatience++
            }
        }
    }
    ok(violYield === 0, 'swing never starts while a bot is detailed to the bay (3 autopilot shifts)')
    ok(violRace === 0, 'bay handoff never contested mid-swing')
    ok(violReach === 0, `every servo stow lands inside the legal reach 4 (${servoStows} servo stows seen)`)
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
    // #1877 item 3 — the docked gripper is never dead-still: slow wrist sway at
    // idle, fast micro-shudder while loaded cargo runs the patience clock. Both
    // must ride the paint tick (world-seconds law) and stay painter-only.
    ok(/const sway = gs\.arm\.held \|\| handing \? 0 : Math\.sin\(tick \* 0\.04\)/.test(ui),
        'docked gripper sways slowly at idle, from the paint tick')
    ok(/const shud = loadedHold \? Math\.sin\(tick \* 2\.3\)/.test(ui) && /const loadedHold = gs\.arm\.held && gs\.arm\.swing === 0/.test(ui),
        'loaded gripper shudders along the forearm while the hold runs')
    ok(/const hx = ex \+ Math\.cos\(a2\) \* \(L2 \+ shud\)/.test(ui),
        'the shudder telescopes the forearm (hx/hy), not the gripper-only paint')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(!/arcItems|ghost/i.test(simSrc), 'presentation never leaks into the sim (hash stays honest)')
    ok(!/gripSway|gripShud|loadedHold/.test(simSrc), 'gripper idle motion never leaks into the sim')
    // #1877 freight context — the ESCROW chip blinks only while money is actively
    // landing (recent growth window), steady when the number has sat still.
    ok(/if \(gs\.escrow > escLast\) escGrowAt = tick/.test(ui) && /tick - escGrowAt < 120/.test(ui),
        'ESCROW chip blinks only on recent growth, steady otherwise')
    ok(/growWin \? \(tick % 50 < 34 \? '#7ec8ff' : '#3d5f78'\) : '#5d94b6'/.test(ui),
        'settled escrow paints a steady readable mid-blue')
}

console.log('— load-out (#1911) —')
{
    // a shipped order stages exactly one parcel of item-count boxes on the pad
    const gs = makeGame(7)
    gs.staging.push('crate', 'can', 'coil')
    gs.orders.push({ id: 999, items: ['crate', 'coil'], due: gs.tick + 1200, prio: false, shipped: false, expired: false })
    for (let i = 0; i < 40; i++) step(gs, [{}])
    ok(gs.shipped === 1 && gs.pad.length === 1 && gs.pad[0].n === 2,
        `a packed ship stages one parcel of ${gs.pad[0] && gs.pad[0].n} boxes (expected 2)`)
}
{
    // the pad is the pipe: at cap the pack line waits, and the blocked order
    // ships again the moment the trailer frees space
    const gs = makeGame(7)
    gs.pad.push({ n: 1, since: gs.tick }, { n: 1, since: gs.tick })
    gs.staging.push('crate', 'crate', 'crate', 'crate')
    gs.orders.push({ id: 301, items: ['crate'], due: gs.tick + 4000, prio: false, shipped: false, expired: false })
    gs.orders.push({ id: 302, items: ['crate'], due: gs.tick + 4000, prio: false, shipped: false, expired: false })
    gs.packT = 1
    step(gs, [{}])
    ok(gs.shipped === 1 && gs.pad.length === PAD_CAP && !gs.orders.find((o) => o.id === 302).shipped,
        `pad at cap ${PAD_CAP} holds the next packed order on the line`)
    let capViol = 0, secondShipped = 0
    for (let i = 0; i < 1200 && !secondShipped; i++) { step(gs, [{}]); if (gs.pad.length > PAD_CAP) capViol++; secondShipped = gs.orders.find((o) => o.id === 302).shipped ? 1 : 0 }
    ok(capViol === 0 && secondShipped, 'the pad never overfills and the waiting order ships after a load-out')
}
{
    // age law: a lone parcel calls the truck at PAD_AGE, it parks, loads every
    // box, dwells the minimum, and drives off carrying exactly what it loaded
    const gs = makeGame(7)
    gs.auto = false
    gs.orders = [] // isolate the forced parcel — no open orders, no bot deliveries, no extra staging
    gs.pad.push({ n: 2, since: gs.tick })
    let truckinAt = 0, parkAt = 0, loadAt = 0, leaveAt = 0, outAt = 0, carryAtLeave = -1, earlyCall = 0
    for (let i = 0; i < 1200; i++) {
        step(gs, [{}])
        if (gs.pad.length && gs.tick - gs.pad[0].since < PAD_AGE) earlyCall += gs.ev.filter((e) => e.type === 'truckin').length
        for (const e of gs.ev) {
            if (e.type === 'truckin' && !truckinAt) truckinAt = gs.tick
            if (e.type === 'loadout' && !loadAt) loadAt = gs.tick
            if (e.type === 'truckout' && !leaveAt) { leaveAt = gs.tick; carryAtLeave = e.carry }
        }
        if (gs.truck.mode === 'park' && !parkAt) parkAt = gs.tick
        if (leaveAt && gs.truck.mode === 'out' && !outAt) outAt = gs.tick
    }
    ok(truckinAt >= PAD_AGE && parkAt - truckinAt >= 260 && parkAt - truckinAt <= 280,
        `lone parcel calls at age ${truckinAt} (law ${PAD_AGE}), trailer backs in over ${parkAt - truckinAt} ticks`)
    ok(loadAt > parkAt && gs.truck.carry === 0 && carryAtLeave === 2 && outAt > leaveAt,
        `truck loads both boxes at the dock and drives off carrying exactly ${carryAtLeave}`)
    ok(earlyCall === 0, 'a fresh parcel never summons the truck before the age law')
}
{
    // the manager's verb: tap the pad to call early, tap again to send early —
    // and nothing loaded is ever lost by either tap
    const gs = makeGame(7)
    gs.auto = false
    gs.orders = [] // isolate: only the forced ship may stage parcels here
    gs.staging.push('crate', 'crate', 'crate')
    gs.orders.push({ id: 411, items: ['crate', 'crate', 'crate'], due: gs.tick + 4000, prio: false, shipped: false, expired: false })
    gs.packT = 1
    step(gs, [{}]) // ships, stages 3 boxes in one parcel
    gs.pad[0].d = 0 // #1927: pin this verb-isolating parcel LOCAL — the scenario times the truck cycle, not the road
    const t0 = gs.tick
    const cash0 = gs.score
    const call = clickCell(gs, 23, 13)
    ok(call === 'call' && gs.truck.mode === 'back', 'a tap on the shipping pad calls a waiting truck early')
    // #1921: the early call is IMPATIENCE — it pays the express fee; a pickup
    // the law summons on cap/age would have been free
    ok(gs.fees === DISPATCH_FEE && gs.score === cash0 - DISPATCH_FEE, `the express tap-call charges DISPATCH_FEE ${DISPATCH_FEE}`)
    let parked = 0
    while (gs.truck.mode !== 'park' && parked++ < 400) step(gs, [{}])
    const tapParkTick = gs.tick
    const send = clickCell(gs, 23, 13)
    ok(send === 'send' && gs.truck.mode === 'leave', 'a tap while parked sends the truck early')
    ok(gs.pad.length === 1 && gs.pad[0].n === 3, 'the early send leaves the un-loaded parcel staged, not lost')
    let outAt = 0
    while (gs.truck.mode !== 'out' && !outAt) { step(gs, [{}]); if (gs.truck.mode === 'out') outAt = gs.tick }
    ok(outAt - t0 < 360, `early call lands the trailer home in ${outAt - t0} ticks (the age law needs 619+)`)
    let backAgain = 0
    while (gs.truck.mode !== 'back' && backAgain++ < 800) step(gs, [{}])
    ok(gs.truck.mode === 'back' && gs.pad.length === 1, 'the leftover parcel calls the trailer back out')
    while (gs.pad.length) step(gs, [{}])
    ok(gs.truck.carry === 3, 'the second trip loads the forgotten parcel too (3 boxes carried in all)')
}
{
    // truck truth is sim truth: the painter holds no forked truck, the hash
    // carries the load-out, and autopilot shifts never overfill the pad
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(!/let truck =/.test(ui) && /const tr = gs\.truck/.test(ui), 'the painter draws gs.truck — no forked painter-local truck')
    ok(/T\[\$\{gs\.truck\.mode\}/.test(simSrc) && /P\[\$\{gs\.pad\.map/.test(simSrc), 'hash carries truck mode, carry and pad (additive, #1373 law)')
    let viol = 0, cycles = 0, seen = 0
    for (const seed of [7, 1337, 4242]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        while (!gs.end && gs.tick < SHIFT + 10) {
            step(gs, [ap(gs)])
            if (gs.pad.length > PAD_CAP) viol++
            if (gs.truck.mode === 'out' && gs.truck.carry !== 0) viol++ // carry only resets at home
            for (const e of gs.ev) {
                if (e.type === 'truckout') cycles++
                if (e.type === 'loadout') seen++
            }
        }
    }
    ok(viol === 0, `autopilot shifts keep the pad inside the pipe and the trailer honest (${cycles} departures, ${seen} boxes loaded, 3 shifts)`)
}

console.log('— freight line (#1921) —')
{
    // conservation across full autopilot shifts: every credit entering or leaving
    // score has a ledger line. Escrow booked == escrow paid + escrow held; score
    // reconciles against opening float + paid + freight + stow pay − fees − fines
    // − build/hire spend. Phantom money, double-pays and evaporating escrow all
    // fail these equations.
    let allTaps = 0
    for (const seed of [7, 1337, 4242]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        let escrowed = 0, fines = 0, spend = 0, taps = 0, feeSeen = 0
        while (!gs.end && gs.tick < SHIFT + 10) {
            step(gs, [ap(gs)])
            for (const e of gs.ev) {
                if (e.type === 'ship' || e.type === 'late') escrowed += e.pay
                if (e.type === 'truckin') { if (e.tap) taps++; feeSeen += e.fee || 0 }
                if (e.type === 'expire') fines += EXPIRE_FINE
                if (e.type === 'break') fines += BREAK_FINE
                if (e.type === 'overflow') fines += OVERFLOW_FINE
                if (e.type === 'build') spend += RACK_COST
                if (e.type === 'hire') spend += ROBOT_COST
            }
        }
        const books = 100 + gs.paid + gs.freight + gs.stows * STOW_PAY - gs.fees - fines - spend
        // #1927: a far haul keeps the truck on the road, so one seed may never
        // need an express tap — prove the tap path across the set, not per seed
        allTaps += taps
        ok(gs.paid + gs.escrow === escrowed && gs.fees === feeSeen && gs.score === books,
            `seed ${seed}: the books balance — ${gs.paid} paid + ${gs.escrow} held == ${escrowed} booked; score ${gs.score} reconciles (taps ${taps}, freight +${gs.freight}, express −${gs.fees})`)
    }
    ok(allTaps > 0, `the express tap-call path still earns its keep across the set (${allTaps} taps)`)
}
{
    // freight bonus law (#1921, tiered by #1927): a haul earns the bonus ONLY
    // when it physically carries FULL_TRAILER or more boxes, and pays exactly
    // 6 × the multiplier of each box aboard. Multipliers pinned as LITERALS
    // (#204 lesson: never measure a law against the tunable it guards).
    let viol = 0, bonuses = 0, dribbles = 0, farSeen = 0
    for (const seed of [7, 1337, 4242, 99, 555]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        while (!gs.end && gs.tick < SHIFT + 10) {
            step(gs, [ap(gs)])
            for (const e of gs.ev) {
                if (e.type === 'bonus') {
                    bonuses++
                    const t = e.tiers.split('').map(Number)
                    const boxes = t.reduce((a, b) => a + b, 0)
                    // #1931: the till pays by dest AND weight — the grid is the
                    // manifest, and tiers must agree with it box-for-box
                    const g = e.grid.split('').map(Number)
                    const want = 6 * g.reduce((a, c, i) => a + c * (Math.floor(i / 3) + 1) * ((i % 3) + 1), 0)
                    const gridBoxes = g.reduce((a, b) => a + b, 0)
                    if (e.carry < FULL_TRAILER || e.carry !== boxes || boxes !== gridBoxes || e.amt !== want) viol++
                    if ((e.far | 0) > 0) farSeen++
                }
                if (e.type === 'truckout' && e.carry < FULL_TRAILER) dribbles++
            }
        }
    }
    ok(viol === 0 && bonuses > 0 && dribbles > 0 && farSeen > 0,
        `full trailers (≥${FULL_TRAILER} boxes) earn 6x[1,2,3]dest x[1,2,3]weight per box, dribbles never do (${bonuses} bonuses, ${farSeen} far, ${dribbles} dribbles, 0 violations, 5 shifts)`)
}
{
    // the till never lies: escrow/paid/freight/fees ride sim state and the hash
    // (two identical-prefix worlds with different escrow must hash apart)
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(/E\[\$\{gs\.escrow\}:\$\{gs\.paid\}:\$\{gs\.freight\}:\$\{gs\.fees\}\]/.test(simSrc),
        'hash carries the freight ledger (additive, #1373 law)')
    ok(/\$\{p\.n\}:\$\{p\.esc \|\| 0\}/.test(simSrc), 'hash carries the per-parcel escrow on the pad')
    const a = makeGame(7), b = makeGame(7)
    b.escrow += 50 // a world identical except for booked-but-unshipped money
    ok(stateHash(a) !== stateHash(b), 'escrow differences hash apart (the never-lies sweep catches a hidden till)')
    const s = state(a)
    ok(['escrow', 'paid', 'freight', 'fees', 'padAge'].every((k) => k in s), 'state shape carries the freight ledger')
    ok(['padDest', 'truckAway', 'truckFar'].every((k) => k in s), 'state shape carries the freight tiers (#1927)')
}

console.log('— freight tiers (#1927) —')
{
    // side-stream law: destination rolls live on their own rng — the module
    // stream (orders) generates byte-identically to the pre-tier floor. The
    // golden signatures were captured from origin/main at the fork point.
    const GOLDEN = {
        1: 3628058901, 2: 1865761932, 3: 2534453316, 4: 248822077,
        5: 3057910432, 6: 2455069383, 7: 2962844918, 8: 3088558928,
    }
    let viol = 0
    for (const seed of Object.keys(GOLDEN)) {
        const gs = makeGame(Number(seed))
        let sig = '', seen = 0
        for (let i = 0; i < 9000; i++) {
            step(gs, [{}])
            for (; seen < gs.orders.length; seen++) {
                const o = gs.orders[seen]
                sig += `${o.id}{${o.items.join(',')}}${o.due};`
            }
        }
        if (hashString(sig) !== GOLDEN[seed]) viol++
    }
    ok(viol === 0, 'module stream byte-identical — 8 seeds order signatures match the pre-tier golden (side-stream law)')
}
{
    // dest determinism + honest spread across the shelf
    const dests = (seed) => {
        const gs = makeGame(seed)
        const seq = []
        while (!gs.end && gs.tick < SHIFT + 10) { step(gs, [{}]); for (const e of gs.ev) if (e.type === 'ship' || e.type === 'late') seq.push(e.d) }
        return seq
    }
    const a = dests(7), b = dests(7)
    let local = 0, long = 0
    const union = new Set()
    for (const seed of [7, 1337, 4242, 99, 555, 1, 2, 3]) for (const d of dests(seed)) { union.add(d); if (d === 0) local++; if (d === 2) long++ }
    ok(JSON.stringify(a) === JSON.stringify(b) && a.length > 0, 'dest rolls replay identically on a fixed seed')
    ok(union.size === 3 && local > long, 'all three classes appear across the shelf and LOCAL leads (odds law)')
}
{
    // road law: a far send commits its trip and the truck answers NOTHING on
    // the road — neither the cap/age call law nor a manager tap (no fee for a
    // truck that cannot come). Trip ticks pinned as LITERALS.
    const gs = makeGame(7)
    gs.auto = false
    gs.orders = []
    gs.pad.push({ n: 3, since: gs.tick - 240 }) // aged LOCAL parcel calls the truck by law
    let guard = 0
    while (gs.truck.mode !== 'park' && guard++ < 600) step(gs, [{}])
    gs.pad[0].d = 2 // re-route at the dock: LONG HAUL rides
    guard = 0
    while (gs.truck.mode === 'park' && guard++ < 400) step(gs, [{}])
    ok(gs.truck.away === 1650 && gs.truck.mode === 'leave', 'a LONG HAUL send commits TRIP_TICKS 1650 and drives off (literal pin)')
    // stage three LOCAL parcels past the cap and age them: the law wants the
    // truck, the road says no
    gs.pad.push({ n: 1, since: gs.tick - 240 }, { n: 1, since: gs.tick - 240 }, { n: 1, since: gs.tick - 240 })
    let callsOnRoad = 0, tapFee = 0
    const scoreOnRoad = gs.score
    while (gs.truck.away > 100) {
        step(gs, [{}])
        callsOnRoad += gs.ev.filter((e) => e.type === 'truckin').length
        if (clickCell(gs, 23, 13) === 'call') tapFee++
    }
    ok(callsOnRoad === 0 && tapFee === 0 && gs.score === scoreOnRoad, 'on the road the truck answers no call law and no tap — and no fee is charged')
    guard = 0
    while (gs.truck.mode !== 'back' && guard++ < 300) step(gs, [{}])
    ok(gs.truck.mode === 'back', 'home from the road, the waiting pad gets its truck at once')
}
{
    // hash carries the tiers, the road and the far class (additive, #1373 law)
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(/\$\{gs\.truck\.away\}:\$\{gs\.truck\.tiers\.join\(''\)\}/.test(simSrc), 'hash carries road-wait and per-class load (#1927, additive)')
    ok(/\$\{p\.n\}:\$\{p\.esc \|\| 0\}:\$\{p\.d \|\| 0\}/.test(simSrc), 'hash carries the per-parcel destination on the pad (#1927, additive)')
    const a = makeGame(7), b = makeGame(7)
    for (let i = 0; i < 900; i++) { step(a, [{}]); step(b, [{}]) }
    if (a.pad.length) { b.pad[0].d = a.pad[0].d === 2 ? 0 : 2; ok(stateHash(a) !== stateHash(b), 'a re-routed parcel hashes apart (the road cannot hide in the hash)') }
}

console.log('— load weight (#1931) —')
{
    // side-stream law, third stream: weight rolls ride their own rng and never
    // touch the module order stream (golden above, #1927) NOR #1927's dest
    // stream. Both signatures are goldens measured at the #1931 fork point —
    // dest with the CORRECTED 58/28/14 ladder (the shipped ladder tested LONG
    // first then up to 0.86, which gave REGIONAL the LOCAL band; corrected —
    // the mix gates below now prove the documented odds, not a 72% surprise).
    const DEST_GOLDEN = {
        1: 3027750522, 2: 1073219832, 3: 1273724707, 4: 1424484639,
        5: 2013266659, 6: 523675866, 7: 1895377948, 8: 269283601,
    }
    const WEIGHT_GOLDEN = {
        1: 353657731, 2: 1664899872, 3: 1533065207, 4: 2849410918,
        5: 1895356120, 6: 371882369, 7: 4087419580, 8: 430015594,
    }
    let viol = 0
    for (const seed of Object.keys(DEST_GOLDEN)) {
        const gs = makeGame(Number(seed))
        let dsig = '', wsig = ''
        for (let i = 0; i < 9000; i++) {
            step(gs, [{}])
            for (const e of gs.ev) if (e.type === 'ship' || e.type === 'late') { dsig += `d${e.d};`; wsig += `w${e.w};` }
        }
        if ((hashString(dsig) >>> 0) !== DEST_GOLDEN[seed]) viol++
        if ((hashString(wsig) >>> 0) !== WEIGHT_GOLDEN[seed]) viol++
    }
    ok(viol === 0, 'weight rolls replay identically AND never disturb the dest stream — 8 seeds, both sigs pinned (third side-stream law)')
}
{
    // odds law measured, both rate-cards read bottom-up across the shelf —
    // dest 58/28/14 (#1927 law, now honestly) and weight 52/30/18.
    // 16 shifts (≈200 parcels): adjacent bands ~12 points apart need the
    // sample — an 8-seed draw once flipped STANDARD/HEAVY by pure noise.
    const d = [0, 0, 0], w = [0, 0, 0]
    for (const seed of [7, 1337, 4242, 99, 555, 1, 2, 3, 4, 5, 6, 8, 11, 13, 17, 21]) {
        const gs = makeGame(seed)
        while (!gs.end && gs.tick < SHIFT + 10) { step(gs, [{}]); for (const e of gs.ev) if (e.type === 'ship' || e.type === 'late') { d[e.d]++; w[e.w]++ } }
    }
    ok(d[0] > d[1] && d[1] > d[2], `dest mix reads LOCAL > REGIONAL > LONG across the shelf (${d.join('/')}) — the documented 58/28/14 ladder, not the inverted one`)
    ok(w[0] > w[1] && w[1] > w[2], `weight mix reads LIGHT > STANDARD > HEAVY across the shelf (${w.join('/')}) — heavy freight is rare freight`)
}
{
    // rate law as LITERALS: a hand-packed trailer pays exactly the rate-card
    // product 6 x dest x weight. 0w2+1w1+2w0 = 6(3+4+3) = 60 with one heavy
    // box named; three LOCAL heavies = 3x18 = 54 — a LOCAL×HEAVY crate pays
    // exactly what a LONG×LIGHT crate pays (18), the whole point of the card.
    const pack = (spec) => {
        const gs = makeGame(7)
        gs.auto = false
        gs.orders = []
        gs.pad.push(...spec.map(([d, w]) => ({ n: 1, since: gs.tick - 240, d, w })))
        let guard = 0
        while (gs.truck.mode !== 'park' && guard++ < 600) step(gs, [{}])
        guard = 0
        while (gs.truck.mode === 'park' && guard++ < 600) step(gs, [{}])
        return gs.ev.filter((e) => e.type === 'bonus').pop()
    }
    const b1 = pack([[0, 2], [1, 1], [2, 0]])
    ok(b1 && b1.amt === 60 && b1.heavy === 1 && b1.carry === 3, 'a LOCAL-heavy + REGIONAL-standard + LONG-light trailer pays exactly 60 and names its one heavy box (literal pin)')
    const b2 = pack([[0, 2], [0, 2], [0, 2]])
    ok(b2 && b2.amt === 54 && b2.heavy === 3 && b2.far === 0, 'three LOCAL heavies pay exactly 54 — heavy freight earns far-post money on near roads (#1931)')
}
{
    // dock speed law measured: heavy crates are manhandled aboard.
    // light and standard ride in TRUCK_LOAD 14 ticks; heavy takes 28.
    const loadTicks = (w) => {
        const gs = makeGame(7)
        gs.auto = false
        gs.orders = []
        gs.pad.push({ n: 1, since: gs.tick - 240, d: 0, w })
        let guard = 0
        while (gs.truck.mode !== 'park' && guard++ < 600) step(gs, [{}])
        let t = 0
        while (!gs.ev.some((e) => e.type === 'loadout') && t++ < 200) step(gs, [{}])
        return t
    }
    const lt = loadTicks(0), st = loadTicks(1), ht = loadTicks(2)
    ok(lt === 14 && st === 14 && ht === 28, `one box rides aboard in 14/14/28 ticks by class — the dock slows ONLY for heavies (literal pin, measured ${lt}/${st}/${ht})`)
}
{
    // hash + state carry weight (additive, #1373 law)
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(/\$\{gs\.truck\.grid\.map/.test(simSrc), 'hash carries the dest x weight manifest (#1931, additive)')
    ok(/\$\{p\.d \|\| 0\}:\$\{p\.w \|\| 0\}/.test(simSrc), 'hash carries the per-parcel weight on the pad (#1931, additive)')
    const a = makeGame(7), b = makeGame(7)
    for (let i = 0; i < 900; i++) { step(a, [{}]); step(b, [{}]) }
    if (a.pad.length) { b.pad[0].w = (a.pad[0].w || 0) === 2 ? 0 : 2; ok(stateHash(a) !== stateHash(b), 'a re-weighed parcel hashes apart (the till cannot hide the scale)') }
    ok(['padWeight', 'truckWeights'].every((k) => k in state(a)), 'state shape carries the weight classes (#1931)')
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

console.log('— first-time-player readability pass (#2254, source pins) —')
{
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    // dock messages overprinted into a smear — they must stack per lane at the anchor
    ok(/lane = Math\.max\(lane, f\.lane \+ 1\)/.test(ui) && /laneKey: key/.test(ui),
        'fx messages stack one per lane at a shared anchor — no dock smear (#2254 item 2)')
    ok(/rgba\(4,8,12,0\.78\)/.test(ui), 'floating messages ride a dark plate for contrast (#2254 item 1)')
    // the budget law is said out loud: spend lands in the footer, spelled with costs
    ok(/SPEND COMES OUT OF THROUGHPUT/.test(ui) && /RACK −\$\$\{RACK_COST\}/.test(ui) && /BOT −\$\$\{ROBOT_COST\}/.test(ui),
        'throughput-as-budget is stated on screen, at the moment of spend (#2254 item 3)')
    ok(/AUTO ROUTES THE BOTS — BREAKDOWNS, JAMS, BUILDING AND PAD CALLS ARE YOURS/.test(ui),
        'the footer states the manager role beside AUTO (#2254 item 3)')
    ok(/AUTO-DISPATCH ROUTES THE BOTS — YOU RUN THE FLOOR/.test(ui),
        'first 15 s of play teaches the division of labour on the floor (#2254 item 3)')
    // repair progress: ring from the sim clock + a pulse per turbo click
    ok(/1 - b\.repair \/ REPAIR_TICKS/.test(ui) && /export const REPAIR_TICKS/.test(simSrc),
        'broken bots show a repair ring driven by the sim repair clock (#2254 item 4)')
    ok(/repairPulse\.set\(/.test(ui) && /case 'turbo'/.test(ui),
        'every turbo-repair click lands a visible pulse ring (#2254 item 4)')
    ok(/t\.kind === 'toRack' \|\| t\.kind === 'toStock'/.test(ui) && /\(dx \/ len\) \* 14/.test(ui),
        'a selected bot draws a guide line to its target, started outside its own cell (#2254 item 4)')
    // attract marquee anchored to the canvas, above the footer band
    ok(/bottom-\[20%\]/.test(ui) && /bottom-\[15%\]/.test(ui), 'attract marquee and watch line are anchored to the stage, clear of the footer (#2254 item 5)')
    ok(!/bottom-8 inset-x-0 flex justify-center pointer-events-none"/.test(ui),
        'the wrapper-bottom marquee (footer overlap) cannot come back (#2254 item 5)')
}

console.log(fails ? `\nFLOOR BOSS CHECK: ${fails} FAILED` : '\nFLOOR BOSS CHECK: all green')
process.exit(fails ? 1 : 0)
