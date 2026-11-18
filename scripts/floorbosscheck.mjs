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
//   node scripts/floorbosscheck.mjs --mutate-ladder   # the quota stops climbing (one flat rung), demand RED (#2346)
//   node scripts/floorbosscheck.mjs --mutate-advance  # a cleared night refuses to clock in (one night ever), demand RED (#2346)
//   node scripts/floorbosscheck.mjs --mutate-bank     # the career score resets each night, demand RED (#2346)
//   node scripts/floorbosscheck.mjs --mutate-rush     # the measured-pinned rush clock shifts without a re-measure, demand RED (#2352)
//   node scripts/floorbosscheck.mjs --mutate-price     # the clock-in card claims a free rung, demand RED (#2352)
//   node scripts/floorbosscheck.mjs --mutate-duel      # bot stows pay the house, not the rack owner — credit law dies, demand RED (#2555)
//   node scripts/floorbosscheck.mjs --mutate-lane      # no-pass lanes allowed — racks may seal a long tight aisle, demand RED (#2614)
//   node scripts/floorbosscheck.mjs --mutate-teach     # (implied) corner teach ignores legality, demand RED (#2627 s2)
//   node scripts/floorbosscheck.mjs --mutate-lane-teach # the lane teach lights a mouth that would strand a served rack, demand RED (#2622)
//   node scripts/floorbosscheck.mjs --mutate-corner    # corner stacks allowed — racks may choke a tight elbow, demand RED (#2627)
//   node scripts/floorbosscheck.mjs --mutate-swing     # swing sweep paints corridor faces as elbows, demand RED (#2627 s3)
//   node scripts/floorbosscheck.mjs --mutate-flow      # flow paint claims two-way traffic for spurs/too-long runs, demand RED (#2622 item 3)

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell, setTool, hireRobot, RACK_SPOTS,
    SHIFT, QUOTA, STRIKES, RACK_CAP, OVERFLOW_FINE, EXPIRE_FINE, BREAK_FINE, BASE_PAY,
    STOW_PAY, RACK_COST, ROBOT_COST, ARM_PATIENCE, ARM_CELL, PAD_CAP, PAD_AGE, OUT_CELLS,
    FREIGHT_PER_BOX, FULL_TRAILER, DISPATCH_FEE,
    shiftParams, nextShift, LADDER_QUOTA_STEP, rushNow, rungPrice, LANE_LONG, ARM_MIN, cornerEscapes, laneEscapes, swingMarkers, flowMarks, laneRuns,
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
const MUT_LADDER = ARGS.includes('--mutate-ladder')
const MUT_ADVANCE = ARGS.includes('--mutate-advance')
const MUT_BANK = ARGS.includes('--mutate-bank')
const MUT_RUSH = ARGS.includes('--mutate-rush')
const MUT_PRICE = ARGS.includes('--mutate-price')
const MUT_AISLE = ARGS.includes('--mutate-aisle')
const MUT_DUEL = ARGS.includes('--mutate-duel')
const MUT_LANE = ARGS.includes('--mutate-lane')
const MUT_CORNER = ARGS.includes('--mutate-corner')
const MUT_TEACH = ARGS.includes('--mutate-teach')
const MUT_LANE_TEACH = ARGS.includes('--mutate-lane-teach')
const MUT_SWING = ARGS.includes('--mutate-swing')
const MUT_FLOW = ARGS.includes('--mutate-flow')
if (MUT_YIELD || MUT_REACH || MUT_CAP || MUT_FREIGHT || MUT_BONUS || MUT_TIERS || MUT_MILES || MUT_WEIGHT || MUT_SLOW || MUT_BANDS || MUT_LADDER || MUT_ADVANCE || MUT_BANK || MUT_RUSH || MUT_PRICE || MUT_AISLE || MUT_DUEL || MUT_LANE || MUT_CORNER || MUT_TEACH || MUT_LANE_TEACH || MUT_SWING || MUT_FLOW) {
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
                                        : MUT_LADDER
                                            ? ['quota: QUOTA + LADDER_QUOTA_STEP * (k - 1)', 'quota: QUOTA', 'the ladder stops climbing — every night stays 1000 (#2346)']
                                            : MUT_ADVANCE
                                                ? ['if (gs.end !== \'win\') return false', 'if (gs.end !== \'win\') return true', 'nextShift claims it advanced without a cleared night (#2346)']
                                                : MUT_BANK
                                                    ? ['gs.shiftBase = gs.score', 'gs.shiftBase = 0', 'banked money evaporates — the career resets to zero each night (#2346)']
                                                    : MUT_RUSH
                                                        ? ['rushOn: 2700,', 'rushOn: 2500,', 'the measured-pinned rush clock shifts without a re-measure — unannounced difficulty drift (#2352)']
                                                        : MUT_PRICE
                                                            ? ['due: Math.round((1 - p.dueMult) * 100)', 'due: 0', 'the clock-in card claims the deadlines stayed put — the pricing lies (#2352)']
                                                            : MUT_DUEL
                                                                ? ["credit(gs, rk.owner, STOW_PAY) // #2555 law: the stow pays the rack owner", 'credit(gs, -1, STOW_PAY)', 'bot stows pay the house — the rack owner loses their credit (#2555)']
                                                                : MUT_AISLE
                                                                ? ["if (strand) { gs.ev.push({ type: 'aisle', x, y, why: strand }); return 'aisle' }", "if (strand && false) { gs.ev.push({ type: 'aisle', x, y, why: strand }); return 'aisle' }", 'aisle clearance off — racks may wall out lanes and pocket the floor (#2546)']
                                                                : MUT_LANE
                                                                    ? ["for (const r of laneRuns(gs, { x, y })) if (!was.has(r)) return 'lane'", "for (const r of laneRuns(gs, { x, y })) if (!was.has(r) && false) return 'lane'", 'the no-pass lane law is off — racks may seal long tight aisles into one-way traps (#2614)']
                                                                    : MUT_CORNER
                                                                    ? ["if (cornerChokes(gs, { x, y }).length) return 'corner'", "if (cornerChokes(gs, { x, y }).length && false) return 'corner'", 'the corner-stack law is off — racks may choke a tight elbow (#2627)']
                                                                    : MUT_TEACH
                                                                    ? ['if (strandsFloor(gs, m.x, m.y) !== false) continue // an illegal plug teaches nothing', 'if (false) continue // MUTANT: legality check off', 'the teach ignores legality — a plug that would strand floor lights up as the fix (#2627 s2)']
                                                                    : MUT_LANE_TEACH
                                                                    ? ['if (strandsFloor(gs, m.x, m.y) !== false) continue // illegal plug teaches nothing', 'if (false) continue // MUTANT: legality check off', 'the lane teach ignores legality — a plug that would strand floor behind a mouth lights up as the fix (#2622)']
                                                                    : MUT_SWING
                                                                    ? ['if (a1[0] * a2[0] + a1[1] * a2[1] !== 0) continue // perpendicular only — a straight face doesn\'t swing', 'if (false) continue // MUTANT: perpendicular check off', 'the sweep paints straight corridor faces as elbows — the corridor skip is gone (#2627 s3)']
                                                                    : MUT_FLOW
                                                                    ? ["if (n < LANE_LONG && open(x - 1, y) && open(x1 + 1, y)) {", 'if (true) {', 'the flow paint claims two-way traffic for dead-end spurs and ignores the length law (#2622 item 3)']
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
    const keys = ['tick', 'score', 'quota', 'strikes', 'done', 'robots', 'racks', 'orders', 'staging', 'conveyor', 'armHeld', 'auto', 'cursor', 'hash', 'seed', 'pad', 'truck', 'carry', 'escrow', 'freight', 'fees', 'padAge', 'shift', 'cleared', 'earned']
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

console.log('— shift ladder (#2346) —')
{
    // the pure ladder books itself: night one IS the classic floor, every rung
    // an honest step, and each tighten lands on a cap and stays
    const p1 = shiftParams(1)
    ok(p1.quota === QUOTA && p1.orderBase === 540 && p1.orderRush === 320 && p1.dueMult === 1 && p1.wearCut === 0,
        'shift 1 params land exactly on the pre-ladder constants — zero footprint')
    let mono = true, capped = true, prev = p1
    for (let n = 2; n <= 14; n++) {
        const p = shiftParams(n)
        if (!(p.quota === prev.quota + LADDER_QUOTA_STEP && p.orderBase <= prev.orderBase && p.orderRush <= prev.orderRush && p.dueMult <= prev.dueMult && p.wearCut >= prev.wearCut)) mono = false
        if (!(p.orderBase >= 380 && p.orderRush >= 220 && p.dueMult >= 0.72 && p.wearCut <= 70)) capped = false
        prev = p
    }
    ok(mono, 'every rung an honest step — quota +200, wire/deadlines/wear only tighten')
    ok(capped, 'tightening lands on caps and stays (380/220/0.72/70) — the ladder cannot compress to zero')
    ok(shiftParams(0).quota === QUOTA && shiftParams(-3).orderBase === 540, 'clamped at n<1 — never books below night one')
}
{
    // Zero-footprint against the PRE-PR engine: literal behavior traces recorded
    // from git HEAD's sim (seed 359e062, autopilot; score/shipped/expired at
    // every 600-tick mark plus the whistle). The live engine must match at the
    // comma — the hash may differ only by the documented additive shift bits.
    const TRACE = {
        4242: '600:45:1:0|1200:144:2:0|1800:109:2:0|2400:114:3:0|3000:79:4:0|3600:110:5:0|4200:135:7:0|4800:273:8:0|5400:373:9:0|6000:503:10:0|6600:533:11:0|7200:823:12:0|7800:948:13:0|8400:968:15:0|9000:1395:15:0|END win 1395',
        1337: '600:45:1:0|1200:118:2:0|1800:138:3:0|2400:93:4:0|3000:53:4:0|3600:122:6:0|4200:147:7:0|4800:2:8:0|5400:130:9:0|6000:697:10:0|6600:727:11:0|7200:1104:13:0|7800:1134:14:0|8400:1397:14:0|9000:1577:16:0|END win 1577',
        777: '600:50:1:0|1200:50:2:0|1800:20:3:0|2400:45:4:0|3000:50:4:0|3600:21:5:0|4200:26:6:0|4800:46:7:0|5400:427:9:0|6000:457:10:0|6600:798:11:0|7200:913:11:0|7800:938:13:0|8400:1291:15:0|9000:1301:16:0|END win 1301',
    }
    let bad = null
    for (const seed of Object.keys(TRACE)) {
        const gs = makeGame(+seed)
        const ap = createAutopilot()
        const got = []
        while (!gs.end && gs.tick < SHIFT + 10) { step(gs, [ap(gs)]); if (gs.tick % 600 === 0) got.push(`${gs.tick}:${gs.score}:${gs.shipped}:${gs.expired}`) }
        got.push(`END ${gs.end} ${gs.score}`)
        if (got.join('|') !== TRACE[seed]) bad = bad || `seed ${seed} diverges (${got.slice(-2).join(' ')})`
    }
    ok(!bad, 'shift 1 replays the pre-PR engine at the comma — 3 autopilot careers, marks literal-exact vs HEAD (#2346)')
}
{
    // quota is EARNINGS-based, not raw score: a banked fortune still goes short
    const gs = makeGame(7)
    gs.shift = 2; gs.params = shiftParams(2); gs.shiftBase = gs.score + 5000
    while (!gs.end && gs.tick < SHIFT + 10) step(gs, [{}])
    ok(gs.end === 'short' && !gs.quotaHit, 'a pre-banked fortune ends SHORT — the rung is measured by what THIS shift earns')
}
{
    // nextShift law
    const gs = makeGame(4242)
    ok(!nextShift(gs), 'nextShift refuses while the night is still running')
    const ap = createAutopilot()
    while (!gs.end && gs.tick < SHIFT + 10) step(gs, [ap(gs)])
    ok(gs.end === 'win' && gs.cleared === 1, 'night one banks on clearing')
    const scoreAt = gs.score, racksAt = JSON.stringify(gs.racks), robotsAt = gs.robots.length
    gs.robots[0].carry = 'crate' // caught mid-haul at the whistle
    ok(nextShift(gs) === true, 'a cleared night clocks into the next')
    ok(gs.shift === 2 && gs.params.quota === 1200 && gs.tick === 0 && gs.strikes === 0 && gs.end === null && !gs.quotaHit,
        'shift 2 books quota 1200 on a fresh clock and a new strike sheet')
    ok(gs.shiftBase === scoreAt && gs.score === scoreAt, 'the career score carries — banked money stays banked')
    ok(gs.robots.length === robotsAt && JSON.stringify(gs.racks) === racksAt, 'hires stay hired and racks keep their stock — the floor persists')
    ok(gs.robots.every((b) => !b.broken && !b.jam && b.wear === 0 && b.repair === 0), 'bots come out of the maintenance bay wear-reset')
    ok(gs.robots.every((b) => !b.carry || b.task.kind === 'toOut'), 'freight caught in a gripper rides morning dispatch, not the trash')
    ok(gs.orders.length === 0 && gs.pad.length === 0 && gs.staging.length === 0 && gs.conv.length === 0 && gs.escrow === 0 && gs.truck.mode === 'out' && gs.truck.carry === 0,
        'orders, pad, staging, belt, escrow and truck wipe clean for a fresh night (escrow follows freight out)')
    ok(gs.ev.some((e) => e.type === 'shiftstart' && e.shift === 2 && e.quota === 1200), 'the clock-in rings a shiftstart event')
}
{
    // hash + state carry the rung (additive, #1373 law)
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(/SH\$\{gs\.shift\}/.test(simSrc), 'hash carries the shift bits (#2346, additive)')
    const a = makeGame(7), b = makeGame(7)
    for (let i = 0; i < 300; i++) { step(a, [{}]); step(b, [{}]) }
    b.shift = 2
    ok(stateHash(a) !== stateHash(b), 'a floor booked at shift 2 hashes apart from shift 1')
    const s = state(a)
    ok(s.quota === QUOTA && s.shift === 1 && s.cleared === 0 && s.earned === s.score, 'state exposes the rung (params quota, earned vs base)')
    const c = makeGame(7); c.params = shiftParams(3)
    ok(state(c).quota === 1400, 'state.quota rides the params — shift 3 reads 1400')
}
{
    // the ramp is honest both ways: winnable early, it bites by shift ~9
    for (const seed of [4242, 1337, 777, 7, 99]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        let runs = 0, end = null
        while (runs < 12) {
            while (!gs.end && gs.tick < SHIFT + 10) step(gs, [ap(gs)])
            if (gs.end !== 'win') { end = `${gs.end}@shift ${gs.shift}`; break }
            runs++
            nextShift(gs)
        }
        ok(runs >= 5, `career seed ${seed}: the ladder climbs rung by rung (${runs} banked${end ? `, the ramp bites: ${end}` : ''})`)
    }
}
{
    // UI wiring pins (#2346)
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/const advanceShift = \(\) => \{/.test(ui), 'the shell owns one clock-in verb every over-screen path shares')
    ok(/if \(advanceShift\(\)\) return/.test(ui), 'key AND tap on a cleared night clock into the next shift')
    ok(/gs\.end === 'win' && pad && pad\.a/.test(ui), 'contract tick: pad A advances the ladder (QA bots / replays / RL)')
    ok(/`SHIFT \$\{gs\.shift\}`/.test(ui), 'the HUD clock carries the rung number every shift')
    ok(/PRESS ANY KEY FOR SHIFT \$\{gs\.shift \+ 1\} — QUOTA \$\{gs\.params\.quota \+ 200\}/.test(ui), 'the win screen names the next rung and its price')
    ok(/NIGHTS BANKED \$\{gs\.cleared\} · CAREER \$\{gs\.score\}/.test(ui), 'the over screen reports the career, not just the night')
    ok(/gs\.tick > 900 \|\| gs\.shift > 1/.test(ui), 'the first-night lesson does not repeat on shift 2')
    ok(/CLEAR THE QUOTA AND THE NEXT SHIFT RUNS HOTTER/.test(ui), 'the attract marquee teaches the ladder before the first clock-in')
    ok(/BEST RUN: \$\{board\[0\]\.score\}/.test(ui), 'the leaderboard renamed for runs that span the ladder')
    ok(/shiftInfo: \(\) =>/.test(ui), 'the DEV harness eye exposes the rung, base, bank and params')
}

console.log('— ladder polish: rung-parameterised rush clock + clock-in ceremony + depth board (#2352) —')
{
    // the wave is rung-PARAMETERISED but measured-pinned flat (#2352): the clock
    // rides the params; the values stay classic until a shape survives the ramp.
    const p1 = shiftParams(1), p9 = shiftParams(9)
    ok(p1.rushOn === 2700 && p1.rushLen === 1200, 'shift 1 keeps the classic rush clock 2700/1200 — zero footprint (#2352)')
    ok(p9.rushOn === 2700 && p9.rushLen === 1200 && shiftParams(99).rushLen === 1200,
        'the wave is measured-pinned at the classic on every rung — late-biased shapes cost freight home, early-biased ones fired the ramp (#2352)')
    // the mechanism is live: an artificial rung clock steers lamp, stamps and sim
    const gs = makeGame(7)
    gs.tick = 2700
    ok(rushNow(gs), 'shift 1 still opens the wave at tick 2700')
    gs.params = { ...shiftParams(3), rushOn: 2500, rushLen: 1400 }
    gs.tick = 2499
    ok(!rushNow(gs), 'a rung clock holds the floor quiet until its own start (#2352 mechanism)')
    gs.tick = 2500
    ok(rushNow(gs), 'rushNow answers the rung clock, not a hardcoded classic (#2352 mechanism)')
    gs.tick = 3899
    ok(rushNow(gs), 'the rung clock keeps its own longer wave open')
    gs.tick = 3900
    ok(!rushNow(gs), 'and closes on its own clock')
    // and stepped sim stamps the rush event at the rung's own tick
    const s3 = makeGame(4242)
    s3.params = { ...shiftParams(3), rushOn: 2500, rushLen: 1400 }
    let stamps = []
    while (s3.tick <= 2501) { step(s3, [{}]); if (s3.ev.some((e) => e.type === 'rush')) stamps.push(s3.tick) }
    ok(stamps.length === 1 && stamps[0] === 2500, `stepped sim rings rush at the rung's own tick (${stamps.join(',')})`)
}
{
    // rungPrice: the tightening the ceremony prices — pure, free at rung 1, honest after
    const p1 = rungPrice(1)
    ok(p1.wire === 0 && p1.due === 0 && p1.wear === 0, 'rung 1 is priced free — the classic floor charges nothing extra (#2352)')
    const p2 = rungPrice(2)
    ok(p2.wire === 4 && p2.due === 4 && p2.wear === 15, 'rung 2 is literally +4% wire, −4% deadlines, −15 wear (#2352)')
    const p9 = rungPrice(9)
    ok(p9.wire === 42 && p9.due === 28 && p9.wear === 70, 'deep rung 9 reads the clamped price 42/28/70 (#2352)')
    let mono = true
    for (let n = 2; n <= 12; n++) {
        const a = rungPrice(n - 1), b = rungPrice(n)
        if (b.wire < a.wire || b.due < a.due || b.wear < a.wear) mono = false
    }
    ok(mono, 'the price never falls with the rung — the ladder stays honest in both engine and card (#2352)')
}
{
    // presentation pins: the ceremony says what nextShift actually does
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/case 'shiftstart':/.test(ui) && /clockIn = \{ shift: e\.shift, quota: e\.quota/.test(ui),
        'the painter reacts to the sim shiftstart stamp — the rung number comes from the sim (#2352)')
    ok(/handleEvents\(gs\.ev, gs\.tick\) \/\/ #2352/.test(ui), 'advanceShift hands the stamp to the painter (#2352)')
    ok(/`NIGHT \$\{clockIn\.shift\}`/.test(ui), 'the clock-in slams NIGHT n onto the floor (#2352)')
    ok(/QUOTA \$\{clockIn\.quota\}/.test(ui), 'the ceremony reprices the quota at the desk (#2352)')
    ok(/BOTS MAINTAINED · STRIKES WIPED · FREIGHT STAYS/.test(ui),
        'the carry-over is said out loud at clock-in — the persistence is taught, not silent (#2352)')
    ok(/WIRE \+\$\{price\.wire\}% · DEADLINES −\$\{price\.due\}% · WEAR −\$\{price\.wear\}/.test(ui),
        'the HUD prices the rung at clock-in so the tightening is legible (#2352)')
    ok(/rungPrice\(clockIn\.shift\)/.test(ui), 'the card prices itself from the pure rung law, not a painter guess (#2352)')
    ok(/if \(screenRef\.current === 'play' && clockIn\) paintClockIn\(\)/.test(ui),
        'the ceremony paints on the live floor, never over attract or over (#2352)')
    ok(!/gs\.tick % \(2700 \+ 1200\)/.test(ui), 'the painter cannot hardcode the classic rush clock again (#2352)')
    ok(/rushNow\(gs\)/.test(ui), 'lamp, wash and scan all ask the rung clock — never a hardcoded classic (#2352)')
    // the depth board
    ok(/shift: gs\.shift, date:/.test(ui), 'board entries remember how deep the run climbed (#2352)')
    ok(/floorboss\.deep/.test(ui) && /DEEPEST SHIFT \$\{deep\}/.test(ui),
        'the career board names the deepest rung, so the ladder itself is the scoreboard (#2352)')
    ok(/clockIn = null \/\/ #2352: a fresh run gets no stale ceremony/.test(ui), 'a fresh run clocks in clean — no stale NIGHT card (#2352)')
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

// ---- #2546 aisle-clearance rack law — forklift lanes stay serviceable ----
console.log('— aisle clearance (#2546) —')
{
    const g = makeGame(11)
    g.score = 5000
    // curated spots are legal by construction — autopilot must never meet a refusal
    let spotFails = 0
    for (const sp of RACK_SPOTS) { g.tool = 'rack'; if (clickCell(g, sp.x, sp.y) !== 'build') spotFails++ }
    ok(spotFails === 0, 'every curated RACK_SPOT still builds — autopilot expansion never meets the new refusal')
    // strand law: close the last open side of a stocked rack
    const g2 = makeGame(11)
    g2.score = 5000
    g2.racks.length = 0
    g2.racks.push({ x: 14, y: 3, items: ['crate'] })
    for (const [x, y] of [[13, 3], [15, 3], [14, 4]]) { g2.tool = 'rack'; if (clickCell(g2, x, y) !== 'build') spotFails++ }
    const scoreBefore = g2.score
    g2.tool = 'rack'
    const rr = clickCell(g2, 14, 2)
    ok(rr === 'aisle' && g2.ev.at(-1)?.why === 'rack', 'walling out a stocked rack is refused (why=rack)')
    ok(g2.score === scoreBefore, 'the refusal charges nothing — money back for a lane you cannot drive')
    ok(g2.racks.length === 4 && !g2.racks.some((r) => r.x === 14 && r.y === 2), 'the stranding rack never lands')
    // pocket law: sealing the last throat of a reachable pocket is refused
    const g3 = makeGame(11)
    g3.score = 5000
    g3.racks.length = 0
    for (const [x, y] of [[11, 7], [13, 7], [12, 8]]) g3.racks.push({ x, y, items: [] })
    g3.tool = 'rack'
    const rp = clickCell(g3, 12, 6)
    ok(rp === 'aisle' && g3.ev.at(-1)?.why === 'pocket', 'a rack that would strand the (12,7) pocket is refused (why=pocket)')
    // named refusal on screen: the painter teaches WHICH law broke
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/case 'aisle'/.test(ui) && /DEAD-END AISLE/.test(ui) && /STRANDED A RACK/.test(ui) && /NO SERVICE LANE/.test(ui),
        'the aisle refusal names the broken law on screen (#2546)')
}

// ---- no-pass lanes (#2614) — a long tight aisle needs a bay to be two-way ----
console.log('— no-pass lanes (#2614) —')
{
    ok(LANE_LONG === 5, 'LANE_LONG pinned at 5 — the jam law (distance 2) needs 1+2+1 to hold a meeting fully inside a lane')
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    // horizontal: a 4-cell tight run builds; the click that completes LANE_LONG is refused
    const g = mk()
    let building = true
    for (let x = 14; x <= 18; x++) if (put(g, x, 5) !== 'build') building = false
    for (let x = 14; x <= 17; x++) if (put(g, x, 3) !== 'build') building = false
    ok(building, 'the lane under construction (tight run of 4, mouths open) builds — law bites at completion, not before')
    const score0 = g.score, hash0 = stateHash(g)
    const rr = put(g, 18, 3)
    ok(rr === 'aisle' && g.ev.at(-1)?.why === 'lane', 'the click that completes a 5-cell tight open-ended lane is refused (why=lane)')
    ok(g.score === score0 && stateHash(g) === hash0, 'the refusal charges nothing and adds no state — click-point law only (#1917)')
    ok(!g.racks.some((r) => r.x === 18 && r.y === 3), 'the lane-closing rack never lands')
    // a bay splits the run: the same lane with one notch off the corridor builds
    const gb = mk()
    let bayLegal = true
    for (let x = 14; x <= 18; x++) if (x !== 16 && put(gb, x, 5) !== 'build') bayLegal = false
    for (let x = 14; x <= 18; x++) if (put(gb, x, 3) !== 'build') bayLegal = false
    ok(bayLegal && gb.racks.some((r) => r.x === 15 && r.y === 5) && !gb.racks.some((r) => r.x === 16 && r.y === 5),
        'the same long lane builds once (16,5) is left open — the notch is the pull-off bay')
    // a plugged mouth makes it a dead-end spur — one-way by choice, legal by #2546
    const gc = mk()
    let spurLegal = put(gc, 13, 4) === 'build'
    for (let x = 14; x <= 18; x++) if (put(gc, x, 5) !== 'build') spurLegal = false
    for (let x = 14; x <= 18; x++) if (put(gc, x, 3) !== 'build') spurLegal = false
    ok(spurLegal, 'the same five-cell run with its west mouth plugged builds — dead spurs stay legal')
    // vertical mirror
    const gv = mk()
    let vLegal = true
    for (let y = 3; y <= 6; y++) { if (put(gv, 14, y) !== 'build') vLegal = false; if (put(gv, 16, y) !== 'build') vLegal = false }
    if (put(gv, 16, 7) !== 'build') vLegal = false
    ok(vLegal, 'the vertical lane under construction (tight run of 4) builds — columns mirror rows')
    ok(put(gv, 14, 7) === 'aisle' && gv.ev.at(-1)?.why === 'lane', 'the vertical completion is refused too (why=lane)')
    const gm = mk()
    let spurV = put(gm, 15, 8) === 'build'
    for (let y = 3; y <= 7; y++) { if (put(gm, 14, y) !== 'build') spurV = false; if (put(gm, 16, y) !== 'build') spurV = false }
    ok(spurV, 'the vertical run with its south mouth plugged builds — the law is about two-way traffic, not length alone')
    // determinism of the refusal: identical rig, identical hashes
    const refusalHash = () => { const q = mk(); for (let x = 14; x <= 18; x++) put(q, x, 5); for (let x = 14; x <= 17; x++) put(q, x, 3); put(q, 18, 3); return stateHash(q) }
    ok(refusalHash() === refusalHash(), 'two identical refused builds land on identical hashes — no rng touched')
    // the painter names the fourth law
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/why === 'lane'/.test(ui) && /NO PASSING LANE/.test(ui), 'the painter names NO PASSING LANE on screen (#2614)')
}

// ---- no corner stacks (#2627) — a rack that faces a tight elbow chokes TWO aisles ----
console.log('— no corner stacks (#2627) —')
{
    ok(ARM_MIN === 2, 'ARM_MIN pinned at 2 — the jam pair sits one cell into each arm (Manhattan 2); an arm of 1 leaves its bot at the mouth to reverse out (#2614 carries the same exit)')
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    // elbow rig: R=(17,4) faces corner B=(18,4); east arm y=4 (tight 19..20, open mouth at 21),
    // south arm x=18 (tight (18,5)..(18,6), open mouth at (18,7)); back cells (18,3),(19,5),(17,5) shut it tight.
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    const rig = (skip = {}) => {
        const g = mk()
        const fails = []
        for (const [x, y] of NEED) { if (skip[`${x},${y}`]) continue; if (put(g, x, y) !== 'build') fails.push([x, y]) }
        return { g, fails }
    }
    {
        const { g, fails } = rig()
        ok(fails.length === 0, 'the elbow under construction builds clean — the law bites only at the rack that faces the corner')
        const score0 = g.score, hash0 = stateHash(g)
        ok(put(g, 17, 4) === 'aisle' && g.ev.at(-1)?.why === 'corner', 'the click whose rack faces a tight elbow is refused (why=corner)')
        ok(g.score === score0 && stateHash(g) === hash0, 'the refusal charges nothing and adds no state — click-point law only (#1917)')
        ok(!g.racks.some((r) => r.x === 17 && r.y === 4), 'the corner-facing rack never lands')
    }
    // escapes, honest and mirrored from #2546/#2614
    ok(rig({ '17,6': true }).fails.length === 0 && (() => { const { g } = rig({ '17,6': true }); return put(g, 17, 4) === 'build' })(),
        'a bay on the south arm (the notch at (17,6)) clears the elbow — the same pull-off #2614 blesses')
    {
        const { g, fails } = rig({ '19,3': true })
        ok(fails.length === 0 && put(g, 17, 4) === 'build', 'a bay on the east arm (open (19,3)) clears the elbow too')
    }
    {
        const g = mk()
        const spur = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6], [18, 7]].every(([x, y]) => put(g, x, y) === 'build')
        ok(spur && put(g, 17, 4) === 'build', 'plugging the south mouth makes it a dead-end spur — one-way by choice, legal (#2546)')
    }
    {
        const g = mk()
        const spur = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6], [21, 4]].every(([x, y]) => put(g, x, y) === 'build')
        ok(spur && put(g, 17, 4) === 'build', 'plugging the east mouth clears it too — a corner with one way through cannot meet two aisles')
    }
    {
        const g = mk()
        const legal = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5]].every(([x, y]) => put(g, x, y) === 'build')
        ok(legal && put(g, 17, 4) === 'build', 'the same corner with a 1-cell south arm builds — short arms keep the mouth-adjacent exit')
    }
    // the law is axis-symmetric: mirror the elbow through the diagonal
    {
        const g = mk()
        const need = [[21, 2], [20, 2], [21, 4], [23, 4], [20, 4], [21, 5], [23, 5], [23, 3]]
        const fails = need.filter(([x, y]) => put(g, x, y) !== 'build')
        ok(fails.length === 0, 'the vertical mirror rig builds clean — columns mirror rows')
        ok(put(g, 22, 2) === 'aisle' && g.ev.at(-1)?.why === 'corner', 'the mirrored elbow refuses too (why=corner)')
    }
    // determinism: identical refused builds land on identical hashes — no rng, no movers
    const refusalHash = () => { const q = mk(); for (const [x, y] of NEED) put(q, x, y); put(q, 17, 4); return stateHash(q) }
    ok(refusalHash() === refusalHash(), 'two identical refused elbows land on identical hashes — pure geometry, fixed order')
    // curated expansion never meets the refusal: the autopilot win proof transfers untouched
    {
        const g = mk()
        let fails = 0
        for (const sp of RACK_SPOTS) { g.tool = 'rack'; if (clickCell(g, sp.x, sp.y) !== 'build') fails++ }
        ok(fails === 0, 'every curated RACK_SPOT still builds — autopilot expansion never trips the corner law')
    }
    // the painter names the fifth law
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/why === 'corner'/.test(ui) && /NO CORNER STACK/.test(ui), 'the painter names NO CORNER STACK on screen (#2627)')
}

// ---- teach the elbow (#2627 s2) — the corner refusal shows its honest escape ----
console.log('— teach the elbow (#2627 stage 2) —')
{
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    const rig = () => { const g = mk(); for (const [x, y] of NEED) if (put(g, x, y) !== 'build') return null; return g }
    ok(cornerEscapes(mk(), 17, 4).length === 0, 'an open floor answers nothing — no choke, no lesson')
    {
        const g = rig()
        ok(g !== null, 'rig builds clean (fresh mk) — refused click comes next')
        const esc = cornerEscapes(g, 17, 4)
        const keys = esc.map((m) => `${m.x},${m.y}`)
        ok(esc.length === 2 && keys.includes('21,4') && keys.includes('18,7'),
            'the refused elbow teaches its mouths as plugs — (21,4) east, (18,7) south (plugging either spurs the arm, #2546)')
    }
    {
        const g = rig()
        const esc = cornerEscapes(g, 17, 4)
        // honesty #1: every taught cell is a legal click on the live board
        let bad = 0
        for (const m of esc) if (put(g, m.x, m.y) !== 'build') bad++
        ok(bad === 0, 'every taught plug actually builds — the lesson never recommends a refusal')
        // the escapes are alternatives, not a recipe: plugging BOTH mouths
        // walls the elbow itself into a sealed pocket — the older laws
        // (rack/pocket) refuse the second plug's follow-up, and that is right.
        // The canvas tail says PLUG A MOUTH, singular, because one wins.
        ok(put(g, 17, 4) !== 'build', 'plugging both mouths then facing the corner is still refused — the pocket the self-made spur leaves behind is the rack/pocket law’s, not the elbow’s; the lesson names one mouth on purpose (#2627 s2)')
    }
    {
        const g = rig()
        // single-plug clears: taking EITHER taught mouth alone must clear it
        for (const m of cornerEscapes(g, 17, 4)) {
            const q = rig()
            ok(put(q, m.x, m.y) === 'build' && put(q, 17, 4) === 'build', `plugging (${m.x},${m.y}) alone clears the elbow — the teach was specific`)
        }
    }
    {
        const g = rig()
        // determinism: the query is pure — repeated calls agree, state untouched
        const h0 = stateHash(g)
        const one = JSON.stringify(cornerEscapes(g, 17, 4))
        const two = JSON.stringify(cornerEscapes(g, 17, 4))
        ok(one === two && stateHash(g) === h0, 'cornerEscapes is pure — same answer twice, board hash unchanged (#1917)')
    }
    {
        // pocket-trap: a mouth with an open cell behind it, reachable ONLY
        // through that mouth — plugging it strands floor. The clears-check
        // cannot see it (the before-net computes with the plug already
        // stood, so the stranded cell was never reachable to begin with);
        // only the legality check excludes it. This rig is what kills the
        // --mutate-teach mutant.
        const g = mk()
        const seq = [...NEED, [17, 8], [19, 8], [18, 9]]
        const fails = []
        for (const [x, y] of seq) if (put(g, x, y) !== 'build') fails.push([x, y])
        ok(fails.length === 0, 'pocket-trap rig builds clean — (18,8) hangs behind south mouth (18,7), reachable only through it')
        const esc = cornerEscapes(g, 17, 4)
        ok(!esc.some((m) => m.x === 18 && m.y === 7), 'the pocket-mouth is never taught — plugging (18,7) would strand (18,8) (#2627 s2 honesty)')
        ok(esc.some((m) => m.x === 21 && m.y === 4), 'the clean east mouth is still taught — the lesson adapts cell by cell')
    }
    {
        // the teacher never teaches a refusal: a mouth that is some rack's
        // last service face is a TRAP, not a lesson — racking it would strand
        // that rack (the rack law). Wall (22,4) in except toward the mouth.
        const g = mk()
        const seq = [...NEED, [22, 4], [23, 4], [22, 3], [22, 5]]
        const fails = []
        for (const [x, y] of seq) if (put(g, x, y) !== 'build') fails.push([x, y])
        ok(fails.length === 0, 'service-trap rig builds clean — rack (22,4) sits behind the east mouth, served only through (21,4)')
        const esc = cornerEscapes(g, 17, 4)
        const keys = esc.map((m) => `${m.x},${m.y}`)
        ok(!keys.includes('21,4'), 'the mouth served-rack guards is never taught — plugging (21,4) would strand (22,4) (#2627 s2 honesty)')
        ok(keys.includes('18,7'), 'the other mouth is still taught — the lesson adapts to the board, not a canned pair')
    }
    {
        // bay escape mirrors #2614: skip a flank rack and there is no elbow
        const g = mk()
        const seq = NEED.filter(([x, y]) => !(x === 17 && y === 6))
        ok(seq.every(([x, y]) => put(g, x, y) === 'build'), 'bay rig builds — the notched south arm stays legal…')
        ok(put(g, 17, 4) === 'build', '…and its elbow builds two clicks later (no refusal to teach about)')
        ok(cornerEscapes(g, 17, 4).length === 0, 'a bay-legal elbow answers nothing — the lesson only fires with a choke')
    }
    {
        // zero footprint on the real click: a refused click then escapes then
        // re-refused clicks land the SAME hash (nothing was learned from the
        // query except by the painter).
        const g = mk()
        for (const [x, y] of NEED) put(g, x, y)
        ok(put(g, 17, 4) === 'aisle', 'elbow refuses (control)')
        const a = JSON.stringify(cornerEscapes(g, 17, 4))
        ok(put(g, 17, 4) === 'aisle' && stateHash(g) === (() => { const q = mk(); for (const [x, y] of NEED) put(q, x, y); put(q, 17, 4); return stateHash(q) })(),
            'query between two refusals changes nothing — same board, same hash (#1917)')
        void a
    }
    // determinism: identical seeds answer identically across processes of the rig
    const escOf = () => { const g = rig(); return JSON.stringify(cornerEscapes(g, 17, 4)) }
    ok(escOf() === escOf(), 'the teacher is deterministic — same rig, same lesson, fixed order')
    // the painter lights the lesson
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/cornerEscapes\(gs/.test(ui) && /paintTeach/.test(ui), 'the painter draws the elbow lesson (cornerEscapes → paintTeach) (#2627 s2)')
    ok(/PLUG/.test(ui) && /SPUR IT/.test(ui), 'the lesson names itself on canvas — PLUG cells, SPUR IT tail (#2627 s2)')
    ok(/why === 'corner'/.test(ui) && /cornerEscapes\(gs, e\.x, e\.y\)/.test(ui), 'the lesson keys off the refused click itself — drain-time derivation (#2627 s2)')
}

// ---- teach the lane (#2622) — the NO PASSING LANE refusal shows its honest exit ----
console.log('— teach the lane (#2622) —')
{
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    const ROW5 = [[14, 5], [15, 5], [16, 5], [17, 5], [18, 5]]
    const ROW3 = [[14, 3], [15, 3], [16, 3], [17, 3]]
    const rig = () => { const g = mk(); for (const [x, y] of [...ROW5, ...ROW3]) if (put(g, x, y) !== 'build') return null; return g }
    ok(laneEscapes(mk(), 18, 3).length === 0, 'an open floor answers nothing — no completed lane, no lesson')
    {
        const g = rig()
        ok(g !== null, 'the lane rig builds clean — the refused completing click comes next')
        ok(put(g, 18, 3) === 'aisle' && g.ev.at(-1)?.why === 'lane', 'the completing click refuses (control)')
        const esc = laneEscapes(g, 18, 3)
        const keys = esc.map((m) => `${m.x},${m.y}`)
        ok(esc.length === 2 && keys.includes('13,4') && keys.includes('19,4'),
            'the refused lane teaches its mouths as plugs — (13,4) west, (19,4) east (plugging either spurs the aisle, #2546)')
    }
    {
        const g = rig()
        put(g, 18, 3)
        let bad = 0
        for (const m of laneEscapes(g, 18, 3)) if (put(g, m.x, m.y) !== 'build') bad++
        ok(bad === 0, 'every taught plug actually builds — the lesson never recommends a refusal')
    }
    {
        // single-plug clears: taking EITHER taught mouth alone must clear the click
        for (const [mx, my] of [[13, 4], [19, 4]]) {
            const q = rig()
            ok(put(q, mx, my) === 'build' && put(q, 18, 3) === 'build', `plugging (${mx},${my}) alone clears the lane — the teach was specific`)
        }
    }
    {
        const q = mk()
        for (const [x, y] of [...ROW5, ...ROW3]) put(q, x, y)
        ok(put(q, 13, 4) === 'build' && put(q, 19, 4) === 'build' && put(q, 18, 3) === 'aisle' && q.ev.at(-1)?.why === 'pocket',
            'plugging BOTH mouths then completing the wall is refused by the pocket law — the sealed aisle belongs to the older laws, so the lesson names one mouth on purpose (#2622)')
    }
    {
        // pocket-trap: open cell (12,4) hangs behind the west mouth, reachable
        // ONLY through (13,4) — plugging it strands floor. The clears-check
        // cannot see it (its before-net computes with the plug already stood,
        // so the stranded cell was never reachable to begin with); only the
        // legality check excludes it. This rig is what kills --mutate-lane-teach.
        const g = mk()
        const seq = [...ROW5, ...ROW3, [12, 3], [12, 5], [11, 4]] // (12,4) stays open floor
        const fails = []
        for (const [x, y] of seq) if (put(g, x, y) !== 'build') fails.push([x, y])
        ok(fails.length === 0, 'pocket-trap rig builds clean — (12,4) hangs behind the west mouth (13,4), reachable only through it')
        const keys = laneEscapes(g, 18, 3).map((m) => `${m.x},${m.y}`)
        ok(!keys.includes('13,4'), 'the pocket-mouth is never taught — plugging (13,4) would strand (12,4) (#2622 honesty)')
        ok(keys.includes('19,4'), 'the other mouth is still taught — the lesson adapts to the board, not a canned pair')
    }
    {
        // purity + determinism: same answer twice, board hash unchanged
        const g = rig()
        put(g, 18, 3)
        const h0 = stateHash(g)
        const one = JSON.stringify(laneEscapes(g, 18, 3))
        const two = JSON.stringify(laneEscapes(g, 18, 3))
        ok(one === two && stateHash(g) === h0, 'laneEscapes is pure — same answer twice, board hash unchanged (#1917)')
    }
    {
        // the bay beats the lesson: leave a notch in the wall and there is no
        // refusal to teach about — the doctrine stays bay-first, plug-second.
        const g = mk()
        const seq = [[14, 5], [15, 5], [17, 5], [18, 5], ...ROW3]
        ok(seq.every(([x, y]) => put(g, x, y) === 'build'), 'the notched wall builds — an open bay cell at (16,5)…')
        ok(put(g, 18, 3) === 'build' && laneEscapes(g, 18, 3).length === 0, '…keeps the aisle bayed — the same completing click builds and answers nothing')
    }
    {
        // vertical mirror
        const g = mk()
        let okV = true
        for (let y = 3; y <= 6; y++) { if (put(g, 14, y) !== 'build') okV = false; if (put(g, 16, y) !== 'build') okV = false }
        okV = put(g, 16, 7) === 'build' && okV
        ok(okV && put(g, 14, 7) === 'aisle' && g.ev.at(-1)?.why === 'lane', 'the vertical completing click refuses too (control)')
        const keys = laneEscapes(g, 14, 7).map((m) => `${m.x},${m.y}`)
        ok(keys.length === 2 && keys.includes('15,2') && keys.includes('15,8'), 'the vertical lane teaches its mouths — (15,2) north, (15,8) south; columns mirror rows')
    }
    // the painter lights the lane lesson too
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/why === 'lane'/.test(ui) && /laneEscapes\(gs, e\.x, e\.y\)/.test(ui), 'the painter keys the bay lesson off the refused lane click — drain-time derivation (#2622)')
    ok(/LEAVE A BAY/.test(ui), 'the lane lesson names the doctrine when even the mouths are traps (#2622)')
}

// ---- two-way flow paint (#2622 item 3) — legal two-way aisles carry arrows ----
console.log('— two-way flow paint (#2622 item 3) —')
{
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    const onRow = (g, y) => flowMarks(g).filter((m) => m.cells.some((c) => c.y === y))
    const onCol = (g, x) => flowMarks(g).filter((m) => m.cells.some((c) => c.x === x))
    const TOP = [[9, 6], [10, 6], [11, 6]]
    const BOT = [[9, 8], [10, 8], [11, 8]]
    {
        const g = mk()
        ok(flowMarks(g).length === 0, 'the bare opening floor paints no flow — the grammar appears with the racks (#2614 country)')
    }
    {
        const g = mk()
        const fails = [...TOP, ...BOT].filter(([x, y]) => put(g, x, y) !== 'build')
        ok(fails.length === 0, 'the 3-cell aisle rig builds clean — legal two-way by the length law')
        const ms = onRow(g, 7)
        ok(ms.length === 1 && ms[0].axis === 'h' && ms[0].flow === 3 && ms[0].cells.map((c) => `${c.x},${c.y}`).join(' ') === '9,7 10,7 11,7',
            `a tight run of 3 with open mouths marks two-way once (${ms.map((m) => `${m.axis}${m.flow}`).join(' ') || 'nothing'})`)
        ok(ms[0].mouths.map((c) => `${c.x},${c.y}`).join(' ') === '8,7 12,7', 'the mark carries both mouths — the arrows ride the mouths the traffic comes from')
    }
    {
        // one-way by choice: plugging a mouth spurs the aisle (#2546) — the
        // arrows must go with the second mouth, or the paint lies about traffic.
        const g = mk()
        for (const [x, y] of [...TOP, ...BOT]) put(g, x, y)
        ok(put(g, 8, 7) === 'build', 'the mouth plug builds')
        ok(onRow(g, 7).length === 0, 'a spurred dead-end carries no arrows — one-way by choice stays bare (#2546 ruling)')
    }
    {
        // a bay notch stops the tight scan: the long aisle splits into two
        // two-way segments instead of one lie.
        const g = mk()
        const seq = [[9, 6], [11, 6], [12, 6], [9, 8], [10, 8], [12, 8]] // (10,6),(11,8) stay open — bay notches
        const fails = seq.filter(([x, y]) => put(g, x, y) !== 'build')
        ok(fails.length === 0, 'the bay-notch rig builds clean')
        const ms = onRow(g, 7).filter((m) => m.cells.every((c) => c.x >= 9 && c.x <= 12))
        ok(ms.length === 2 && ms.every((m) => m.flow === 1),
            `a notched aisle paints its two tight segments, not a phantom run (${ms.map((m) => `${m.axis}${m.flow}@${m.cells[0].x},${m.cells[0].y}`).join(' ') || 'nothing'}) — the bay cell is its own mark`)
    }
    {
        // vertical mirror
        const g = mk()
        const seq = [[6, 9], [6, 10], [6, 11], [8, 9], [8, 10], [8, 11]]
        const fails = seq.filter(([x, y]) => put(g, x, y) !== 'build')
        ok(fails.length === 0, 'the vertical 3-run rig builds clean')
        const ms = onCol(g, 7).filter((m) => m.cells.every((c) => c.y >= 9 && c.y <= 11))
        ok(ms.length === 1 && ms[0].axis === 'v' && ms[0].flow === 3, 'the vertical aisle marks two-way like its horizontal twin')
    }
    // the law's own truth on every board: only honest two-way segments mark.
    {
        for (const seed of [7, 11]) {
            const g = makeGame(seed)
            const lies = flowMarks(g).filter((m) => m.flow < 1 || m.flow >= LANE_LONG
                || m.cells.some((c) => g.racks.some((r) => r.x === c.x && r.y === c.y)))
            ok(lies.length === 0, `opening seed ${seed}: ${flowMarks(g).length} flow mark(s), every one a legal 1..${LANE_LONG - 1}-cell run on open floor`)
        }
        const g = mk()
        for (const [x, y] of [...TOP, ...BOT]) put(g, x, y)
        ok(laneRuns(g).length === 0 && flowMarks(g).length >= 1,
            'no no-pass lane stands on the marked floor — the paint and the refusal law cannot both speak on one aisle (#2614 complement)')
    }
    {
        // purity + determinism (#1917): same answer twice, board hash unchanged
        const g = mk()
        for (const [x, y] of [...TOP, ...BOT]) put(g, x, y)
        const h0 = stateHash(g)
        const one = JSON.stringify(flowMarks(g))
        const two = JSON.stringify(flowMarks(g))
        ok(one === two && stateHash(g) === h0, 'flowMarks is pure — same answer twice, board hash unchanged (#1917)')
    }
    {
        // the autopilot invariant shape: a full shift of bought racks, then the
        // sweep — presentation never breaks a shift, and the law complement holds
        // on whatever floor the bot builds.
        const g = makeGame(4242)
        const ap = createAutopilot()
        while (!g.end && g.tick < SHIFT + 10) step(g, [ap(g)])
        const ms = flowMarks(g)
        ok(Array.isArray(ms) && ms.every((m) => m.flow >= 1 && m.flow < LANE_LONG),
            `a full autopilot shift, then the sweep — ${ms.length} flow mark(s), no throw, none past the length law (#2622 item 3)`)
    }
    // the painter draws it, under the louder lesson; the DEV eye reads it.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/flowMarks\(gs\)/.test(ui) && /paintFlow\(\)/.test(ui), 'the painter draws the flow paint (flowMarks → paintFlow) (#2622 item 3)')
    ok(ui.indexOf('paintFlow()') < ui.indexOf('paintSwing()') && ui.indexOf('paintSwing()') < ui.indexOf('paintTeach(tick)'), 'floor paint order: traffic arrows as the base coat, the amber law boxes above them, the louder refusal lesson on top (#2622 item 3, #2627 s3)')
    ok(/elbows\.has\(/.test(ui), 'the flow paint yields to the amber keep-clear box — law paint outranks traffic paint (#2622 item 3)')
    ok(/flow: \(\) => flowMarks\(gs\)/.test(ui), 'the DEV hook exposes the two-way grammar for the browser gate (#2622 item 3)')
}

// ---- duel refusal seat stamp (#2622 item 4) — a banner names WHOSE click died ----
console.log('— duel refusal seat stamp (#2622 item 4) —')
{
    const ROW5 = [[14, 5], [15, 5], [16, 5], [17, 5], [18, 5]]
    const ROW3 = [[14, 3], [15, 3], [16, 3], [17, 3]]
    const rig = (duel) => {
        const g = makeGame(11, { duel })
        g.score = 9000; g.racks.length = 0
        for (const [x, y] of [...ROW5, ...ROW3]) { g.tool = 'rack'; if (clickCell(g, x, y, 0) !== 'build') return null }
        return g
    }
    {
        const g = rig(false)
        ok(g !== null, 'the lane rig builds clean (solo control)')
        g.tool = 'rack'
        ok(clickCell(g, 18, 3, 0) === 'aisle' && g.ev.at(-1)?.s === 0, 'a solo refusal names seat 0 — the event carries its seat (#2622 item 4)')
    }
    {
        const g = rig(true)
        g.m.tool = 'rack'
        const r = clickCell(g, 18, 3, 1)
        const ev = g.ev.at(-1)
        ok(r === 'aisle' && ev?.why === 'lane' && ev?.s === 1, 'seat M meets NO PASSING LANE mid-duel and the refusal names the MODEL seat (#2622 item 4)')
        ok(g.racks.length === ROW5.length + ROW3.length && g.m.tool === 'rack', 'the refusal charges nothing and keeps seat M armed — law unchanged, seat added (#1917)')
    }
    {
        const g = rig(true)
        const h0 = stateHash(g)
        g.tool = 'rack'; clickCell(g, 18, 3, 0)
        ok(stateHash(g) === h0, 'refusal events stay out of stateHash — the seat stamp is chrome, the hash law is untouched (#1373)')
    }
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/type: 'aisle', x, y, why: strand, s: seat/.test(readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')), 'the sim stamps every aisle refusal with its seat (#2622 item 4)')
    ok(/gs\.duel && \(e\.why === 'lane' \|\| e\.why === 'corner'\)/.test(ui) && /e\.s === 1 \? 'MODEL' : 'YOU'/.test(ui), 'the painter stamps the refusal seat in the duel chrome — YOU vs MODEL under the amber law (#2622 item 4)')
}

// ---- swing paint (#2627 s3) — live elbows carry faint keep-clear paint ----
console.log('— swing paint (#2627 stage 3) —')
{
    const mk = () => { const g = makeGame(11); g.score = 9000; g.racks.length = 0; return g }
    const put = (g, x, y) => { g.tool = 'rack'; return clickCell(g, x, y) }
    const key = (m) => `${m.x},${m.y}`
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    // a LIVE elbow: the stage-1 rig minus the facing rack's bite — a bay notch
    // on the south arm keeps the click legal (#2614 pull-off escape), so the
    // elbow EXISTS on the live board: rack (17,4) faces corner B=(18,4), whose
    // exactly-two open neighbours (19,4),(18,5) are perpendicular.
    const live = () => {
        const g = mk()
        for (const [x, y] of NEED) { if (x === 19 && y === 6) continue; if (put(g, x, y) !== 'build') return null }
        if (put(g, 17, 4) !== 'build') return null
        return g
    }
    {
        const g = live()
        ok(g !== null, 'the live-elbow rig builds clean — bay escape keeps the facing rack legal (#2614)')
        const ms = swingMarkers(g)
        // two live elbows: B=(18,4) faces (17,4); and (17,3) — the corner where
        // the west aisle (x<17) meets the north aisle (y<3), itself a service
        // cell of racks (17,4)/(18,3). Two corners, one rig; the sweep names both.
        const keys = ms.map(key).sort().join(' ')
        ok(keys === '17,3 18,4', `the rack row paints its two live corners (${keys})`)
        const b = ms.find((m) => key(m) === '18,4')
        const arms = b && b.arms.map(([ax, ay]) => `${ax},${ay}`).sort().join(' ')
        ok(arms === '0,1 1,0', 'the marker carries the two perpendicular arms — east and south (#2627 s3)')
        ok(b && b.h === 0, 'the bay-notched arm is quiet — only through-traffic arms raise the tier (#2627 s3)')
    }
    // hard tier: arms tightened AFTER the facing rack landed — every click legal
    // on its own, yet the rig now meets the stage-1 shape live. This is the
    // case the click-point law cannot catch and the paint exists for.
    {
        const g = mk()
        ok(put(g, 17, 4) === 'build', 'the rack facing open floor builds — no elbow yet')
        const fails = NEED.filter(([x, y]) => put(g, x, y) !== 'build')
        ok(fails.length === 0, 'tightening both arms around the landed rack is legal click-by-click — no single click completes a corner choke')
        const ms = swingMarkers(g)
        const b = ms.find((m) => key(m) === '18,4')
        ok(b && b.h === 1, 'the order-made elbow paints HARD — both arms run tight to open mouths, the double-sightline case (#2627 s3)')
        ok(ms.length === 3, `the tightened rig paints its corners, tiered (${ms.map((m) => `${key(m)}:h${m.h}`).join(' ')})`)
        ok(ms.every((m) => key(m) === '17,3' || key(m) === '18,4' || key(m) === '20,6'),
            'the third corner (20,6) is real — the (19,6)+(20,5) rack step turns the south-east floor; the sweep sees every elbow the row creates (#2627 s3)')
    }
    // negatives: the shapes that are NOT elbows
    {
        const g = mk()
        ok(put(g, 10, 6) === 'build' && put(g, 10, 8) === 'build', 'corridor rig builds — rack above, plug below, aisle straight through y=7')
        ok(!swingMarkers(g).some((m) => key(m) === '10,7'), 'a rack facing a STRAIGHT corridor paints nothing — ±p neighbours are opposite, not a swing (#2614 country)')
        ok(swingMarkers(g).length === 0, 'the corridor rig carries no markers at all (#2627 s3)')
    }
    {
        const g = mk()
        ok(put(g, 12, 6) === 'build', 'T-junction rig builds')
        ok(!swingMarkers(g).some((m) => key(m) === '12,7'), 'a rack facing a T-junction paints nothing — three open neighbours is a fork, not a corner')
    }
    // purity + determinism (#1917)
    {
        const g = live()
        const h0 = stateHash(g)
        const one = JSON.stringify(swingMarkers(g))
        const two = JSON.stringify(swingMarkers(g))
        ok(one === two && stateHash(g) === h0, 'swingMarkers is pure — same answer twice, board hash unchanged (#1917)')
        ok(JSON.stringify(live() && swingMarkers(live())) === JSON.stringify(swingMarkers(live())), 'the sweep is deterministic — identical rigs, identical paint lists')
    }
    // the opening floor and the autopilot expansion: the sweep never throws,
    // and every painted cell satisfies the grammar's own truth (open floor,
    // a rack facing it, perpendicular arms)
    {
        for (const seed of [7, 11]) {
            const g = makeGame(seed)
            const ms = swingMarkers(g)
            const lies = ms.filter((m) => {
                if (g.racks.some((r) => r.x === m.x && r.y === m.y)) return true
                const faces = g.racks.some((r) => Math.abs(r.x - m.x) + Math.abs(r.y - m.y) === 1)
                const perp = m.arms[0][0] * m.arms[1][0] + m.arms[0][1] * m.arms[1][1] === 0
                return !faces || !perp
            })
            ok(lies.length === 0, `opening seed ${seed}: ${ms.length} live elbow(s), every marker on open floor facing a rack with perpendicular arms`)
        }
        const g = makeGame(4242)
        const ap = createAutopilot()
        while (!g.end && g.tick < SHIFT + 10) step(g, [ap(g)])
        const ms = swingMarkers(g)
        ok(Array.isArray(ms), `a full autopilot shift, then the sweep — ${ms.length} markers, no throw; presentation never breaks a shift (#2627 s3)`)
    }
    // curated expansion never crashes the sweep either (autopilot invariant shape)
    {
        const g = mk()
        let fails = 0
        for (const sp of RACK_SPOTS) { g.tool = 'rack'; if (clickCell(g, sp.x, sp.y) !== 'build') fails++ }
        ok(fails === 0 && swingMarkers(g).length >= 0, 'every curated RACK_SPOT builds, then the sweep runs clean on the full curated floor')
    }
    // the painter draws it — under the racks' layer and below the teach lesson
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/swingMarkers\(gs\)/.test(ui) && /paintSwing\(\)/.test(ui), 'the painter draws the swing paint (swingMarkers → paintSwing) (#2627 s3)')
    ok(ui.indexOf('paintRacks()') < ui.indexOf('paintSwing()') && ui.indexOf('paintSwing()') < ui.indexOf('paintTeach(tick)'), 'floor paint order: racks, then the faint floor-markings, then the louder lesson on top (#2627 s3)')
    ok(/swing: \(\) => swingMarkers\(gs\)/.test(ui), 'the DEV hook exposes the live elbow list for the browser gate (#2627 s3)')
}

// ---- duel seats (#2555) — two managers, one floor, credit follows work ----
console.log('— duel seats (#2555) —')
{
    // zero footprint (#1917): the duel overlay must not nudge the floor's own
    // economy — same seed, same pads, score identical tick-for-tick solo vs duel.
    let drift = 0
    for (const seed of [7, 4242]) {
        const a = makeGame(seed)
        const b = makeGame(seed, { duel: true })
        for (let t = 0; t < 1200; t++) {
            step(a, [{ a: t % 90 === 0 }])
            step(b, [{ a: t % 90 === 0 }, {}])
            if (a.score !== b.score) { drift++; break }
        }
    }
    ok(drift === 0, 'duel overlay is economically invisible — solo and duel score tick-for-tick (#1917 law)')

    // seat M drives: cursor, tool and purchases route to seat 1.
    const g = makeGame(11, { duel: true })
    g.score = 5000
    setTool(g, 'rack', 1)
    ok(state(g).toolM === 'rack' && g.tool === null, 'B/tool lands on the seat asked for, not the human cursor')
    g.m.cursor.x = RACK_SPOTS[3].x; g.m.cursor.y = RACK_SPOTS[3].y
    const built = clickCell(g, RACK_SPOTS[3].x, RACK_SPOTS[3].y, 1)
    const ownedRack = g.racks.find((r) => r.x === RACK_SPOTS[3].x && r.y === RACK_SPOTS[3].y)
    ok(built === 'build' && ownedRack && ownedRack.owner === 1, 'seat M buys a rack and it wears the model stamp')
    ok(hireRobot(g, 1) && g.robots.some((b) => b.owner === 1), 'seat M hires a bot the ledger can see')

    // law 1: a stow pays the RACK owner — bot labor stowed onto a model rack.
    const g2 = makeGame(11, { duel: true })
    g2.racks.length = 0
    g2.racks.push({ x: 16, y: 5, items: [], owner: 1 })
    const bot = g2.robots[0]
    bot.carry = 'crate'; bot.task = { kind: 'toStock', rx: 16, ry: 5 }
    bot.x = 16; bot.y = 4; bot.path = []; bot.moveT = 0; bot.wait = 0; bot.jam = false; bot.broken = false
    const before = g2.credits[1]
    for (let t = 0; t < 60 && g2.credits[1] === before; t++) step(g2, [{}])
    ok(g2.credits[1] === before + STOW_PAY, `law 1 — a bot stow credits the rack owner (+${STOW_PAY}), not the floor`)

    // law 2: escrow rides the parcel to the shipper majority; ties go house.
    const g3 = makeGame(11, { duel: true })
    g3.orders = [{ id: 999, items: ['crate', 'crate'], due: g3.tick + 9000, prio: false, shipped: false, expired: false }]
    g3.staging = ['crate', 'crate']; g3.stOwn = [1, 1]
    g3.packT = 1
    for (let t = 0; t < 4 && !g3.pad.length; t++) step(g3, [{}])
    ok(g3.pad.length === 1 && g3.pad[0].o === 1, 'law 2 — crates staged by seat M pack into an M parcel')
    const g4 = makeGame(11, { duel: true })
    g4.orders = [{ id: 999, items: ['crate', 'crate'], due: g4.tick + 9000, prio: false, shipped: false, expired: false }]
    g4.staging = ['crate', 'crate']; g4.stOwn = [1, 0]
    g4.packT = 1
    for (let t = 0; t < 4 && !g4.pad.length; t++) step(g4, [{}])
    ok(g4.pad.length === 1 && g4.pad[0].o === -1, 'no majority splits to the house')

    // taps name the tapper; the fee still rides the floor budget.
    const g5 = makeGame(11, { duel: true })
    g5.pad.push({ n: 1, since: g5.tick, esc: 0, d: 0, w: 0, o: -1 })
    g5.truck.mode = 'out'
    const feeBefore = g5.score
    clickCell(g5, OUT_CELLS[0].x, OUT_CELLS[0].y, 1)
    ok(g5.ev.some((e) => e.type === 'truckin' && e.s === 1) && g5.score === feeBefore - DISPATCH_FEE,
        'a seat M tap calls the truck — named in the event, the tax paid from the floor')

    // a live duel shift: conservation every tick, the model out-credits an idle
    // human, and the verdict matches the richer till.
    let consOk = true, mWins = 0, verdictOk = true
    for (const seed of [4242, 1337, 777]) {
        const apM = createAutopilot(1)
        const d = makeGame(seed, { duel: true })
        for (let t = 0; t < SHIFT && !d.end; t++) {
            step(d, [{}, apM(d)])
            if (d.score !== 100 + d.credits[0] + d.credits[1] + d.credits[2] - d.spent) { consOk = false; break }
        }
        if (d.duelWinner !== 1) verdictOk = false
        if (d.credits[1] > d.credits[0]) mWins++
    }
    ok(consOk, 'conservation closes every tick: score = 100 + Σcredits − spent')
    ok(mWins === 3, 'the model manager out-credits an idle human 3/3 seeds — seat M really works')
    ok(verdictOk, 'the whistle verdict names the richer till (MODEL beats a seat that never built)')

    // hash honesty: the duel segment moves with the ledgers; solo never carries it.
    const dhA = makeGame(5, { duel: true }); const dhB = makeGame(5, { duel: true })
    for (let t = 0; t < 600; t++) { step(dhA, [{}]); step(dhB, [{}]) }
    ok(stateHash(dhA) === stateHash(dhB), 'duel determinism: same seed, same pads, same hash')
    const soloS = state(makeGame(7))
    const duelS = state(makeGame(7, { duel: true }))
    ok(!('duel' in soloS) && duelS.duel === true && duelS.tills.length === 2, 'the duel eye opens only in the duel; solo state stays solo')

    // presentation pins: the seat entry, twin till, verdict line, owner tints,
    // and the episode finally seats the model.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/startPlay\(e\.code === 'KeyD'\)/.test(ui), "D at the attract seats the model manager")
    ok(/MODEL \$\{mm\}/.test(ui) && /MANAGER OF THE NIGHT/.test(ui), 'twin till and the verdict line ride the canvas')
    ok(/owner === 1 \? '#57c7ff'/.test(ui), 'racks wear their owner tint — cyan is the model\'s')
    ok(/players: duel \? 2 : 1/.test(ui) && /\['human', 'model'\]/.test(ui), "the episode records players:2, sources ['human','model'] (#1144 slot two)")
}

console.log(fails ? `\nFLOOR BOSS CHECK: ${fails} FAILED` : '\nFLOOR BOSS CHECK: all green')
process.exit(fails ? 1 : 0)
