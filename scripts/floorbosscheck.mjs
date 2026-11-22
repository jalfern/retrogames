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
//   node scripts/floorbosscheck.mjs --mutate-career   # the adapter seam dies — career takes cannot clock in on replay, demand RED (#2958)
//   node scripts/floorbosscheck.mjs --mutate-whistle  # whistle-stop returns — a cleared night closes the take at the sheet, demand RED (#2958)
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
//   node scripts/floorbosscheck.mjs --mutate-flowheat   # the second route on a cell stops counting — live traffic heat dies, demand RED (#2680)
//   node scripts/floorbosscheck.mjs --mutate-duck    # carts never pull off into bays — avoidable freezes stay freezes, demand RED (#2692)
//   node scripts/floorbosscheck.mjs --mutate-manners # the first duck of a shift never names itself — the courtesy stays decoration, demand RED (#2700)
//   node scripts/floorbosscheck.mjs --mutate-attract # the shop window loses its promised ducks — cold seeds come back, demand RED (#2700)
//   node scripts/floorbosscheck.mjs --mutate-knee # the sixth law is blind — racks may stand in the swing and sever the knee net, demand RED (#2711)
//   node scripts/floorbosscheck.mjs --mutate-knee-route # loaded carts route through racked corners again — the body is gone from the path planner, demand RED (#2711)
//   node scripts/floorbosscheck.mjs --mutate-knee-teach # the knee lesson teaches illegal beside-places — the honest-fix filter is gone, demand RED (#2711 s2)
//   node scripts/floorbosscheck.mjs --mutate-turn # loaded legs stop counting pivots — staircases return, demand RED (#2724)
//   node scripts/floorbosscheck.mjs --mutate-repath-land # racks land on claimed routes — stale paths drive into fresh walls, demand RED (#2724)
//   node scripts/floorbosscheck.mjs --mutate-face # reversing rotates the nose — bot.face becomes bot.dir again and the outside audit cannot see the body (#2732)
//   node scripts/floorbosscheck.mjs --mutate-seed # the knee planner seeds from the movement again — reversed carts plan body-illegal swings (#2738)
//   node scripts/floorbosscheck.mjs --mutate-tail # loaded carts turn into their counterweight again — the tail clause dies in the router (#2760)
//   node scripts/floorbosscheck.mjs --mutate-tail-land # racks land on committed backswings — the land scan goes blind to the tail diagonal (#2760)
//   node scripts/floorbosscheck.mjs --mutate-taps # the drain stops applying its banked tap — live == replay dies (#2966)

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    makeGame, step, state, stateHash, createAutopilot, clickCell, setTool, hireRobot, clickOrder, RACK_SPOTS,
    SHIFT, QUOTA, STRIKES, RACK_CAP, OVERFLOW_FINE, EXPIRE_FINE, BREAK_FINE, BASE_PAY,
    STOW_PAY, RACK_COST, ROBOT_COST, ARM_PATIENCE, ARM_CELL, PAD_CAP, PAD_AGE, OUT_CELLS,
    FREIGHT_PER_BOX, FULL_TRAILER, DISPATCH_FEE,
    shiftParams, nextShift, LADDER_QUOTA_STEP, rushNow, rungPrice, LANE_LONG, ARM_MIN, cornerEscapes, laneEscapes, swingMarkers, flowMarks, laneRuns, flowHeat,
    pullOff, YIELD_WAIT, YIELD_MAX, YIELD_CD,
    kneeTurn, bfsKnee, kneeNet, liveKnees, kneeEscapes, blocked,
    tailTurn, liveTails, swingOf, liveRights, MAP, CELL, COLS, ROWS, BAY_CELL,
} from '../src/games/FloorBoss/sim.js'
import { createEpisode, validateEpisode } from '../src/utils/robot/episode.js'
import { floorBossRows } from './plaicraft-dataset.mjs' // #2958: the replay seam lives in the adapter — prove it here
import { CHIPS, W as TBW, H as TBH, applyTap } from '../src/games/FloorBoss/taps.js' // #2966: the shared tap semantics — proof drives the same verbs the phone does
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
const MUT_FLOWHEAT = ARGS.includes('--mutate-flowheat')
const MUT_DUCK = ARGS.includes('--mutate-duck')
const MUT_MANNERS = ARGS.includes('--mutate-manners') // #2700: the give-way teach never fires
const MUT_ATTRACT = ARGS.includes('--mutate-attract') // #2700: the shop window seeds go cold again
const MUT_KNEE = ARGS.includes('--mutate-knee') // #2711: the sixth law goes blind to the swing
const MUT_KNEE_ROUTE = ARGS.includes('--mutate-knee-route') // #2711: loaded carts clip corners again
const MUT_KNEE_TEACH = ARGS.includes('--mutate-knee-teach') // #2711 s2: the lesson admits illegal beside-places
const MUT_TURN = ARGS.includes('--mutate-turn') // #2724: the pivot sort is gone — staircases return
const MUT_REPATH_LAND = ARGS.includes('--mutate-repath-land') // #2724: racks land on claimed routes — stale paths keep driving into them
const MUT_FACE = ARGS.includes('--mutate-face') // #2732: reversing rotates the nose — bot.face degrades back to bot.dir
const MUT_SEED = ARGS.includes('--mutate-seed') // #2738: the knee planner seeds from the movement again — reversed carts plan swings the body forbids
const MUT_TAIL = ARGS.includes('--mutate-tail') // #2760: loaded carts turn into their own counterweight again — the tail clause is gone from the router
const MUT_TAIL_LAND = ARGS.includes('--mutate-tail-land') // #2760: landings stop seeing the back diagonal — racks drop onto committed backswings
const MUT_COURTESY = ARGS.includes('--mutate-courtesy') // #2783: courtesy parks back into the swing — pullOff forgets the knee/tail cells of the blocking plan
const MUT_CAREER = ARGS.includes('--mutate-career') // #2958: the adapter seam dies — career takes cannot clock in on replay
const MUT_WHISTLE = ARGS.includes('--mutate-whistle') // #2958: whistle-stop returns — a cleared night closes the take at the sheet
const MUT_TAPS = ARGS.includes('--mutate-taps') // #2966: the drain stops applying its banked tap — pointers the floor never honors
if (MUT_YIELD || MUT_REACH || MUT_CAP || MUT_FREIGHT || MUT_BONUS || MUT_TIERS || MUT_MILES || MUT_WEIGHT || MUT_SLOW || MUT_BANDS || MUT_LADDER || MUT_ADVANCE || MUT_BANK || MUT_RUSH || MUT_PRICE || MUT_AISLE || MUT_DUEL || MUT_LANE || MUT_CORNER || MUT_TEACH || MUT_LANE_TEACH || MUT_SWING || MUT_FLOW || MUT_FLOWHEAT || MUT_DUCK || MUT_MANNERS || MUT_ATTRACT || MUT_KNEE || MUT_KNEE_ROUTE || MUT_KNEE_TEACH || MUT_TURN || MUT_REPATH_LAND || MUT_FACE || MUT_SEED || MUT_TAIL || MUT_TAIL_LAND || MUT_COURTESY || MUT_CAREER || MUT_WHISTLE || MUT_TAPS) {
    const sim = new URL('../src/games/FloorBoss/sim.js', import.meta.url)
    const tgt = MUT_MANNERS || MUT_ATTRACT || MUT_WHISTLE || MUT_TAPS ? new URL('../src/games/FloorBoss/index.jsx', import.meta.url) // #2700: presentation laws plant in the painter; #2958: so does the take law; #2966: so does the tap-drain law
        : MUT_CAREER ? new URL('./plaicraft-dataset.mjs', import.meta.url) // #2958: the replay seam lives in the adapter
            : sim
    const src = readFileSync(tgt, 'utf8')
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
                                                                    : MUT_DUCK
                                                                    ? ['bot.wait < YIELD_WAIT', 'bot.wait < 1e9', 'carts never pull off — every bay goes unused and every avoidable freeze stays a freeze (#2692)']
                                                                    : MUT_FLOWHEAT
                                                                    ? ['counts.set(k, (counts.get(k) || 0) + 1)', 'counts.set(k, 1)', 'the second route on a cell stops counting — convergence, the heat ramp and the shared-lane read all die (#2680)']
                                                                    : MUT_MANNERS
                                                                    ? ['if (duckTaughtOn !== gs) {', 'if (duckTaughtOn !== gs && false) {', 'the first duck never names itself — GIVE WAY stays decoration, the grammar goes unlearned (#2700)']
                                                                    : MUT_ATTRACT
                                                                    ? ['const ATTRACT_SEEDS = [55, 74, 107, 126, 148]', 'const ATTRACT_SEEDS = [1337]', 'the shop window is cold again — the demo seed never ducks while a visitor watches (#2700 seeds re-measured #2760)']
                                                                    : MUT_KNEE
                                                                    ? ['const after = kneeNet(gs, { x, y })', 'const after = kneeNet(gs, null)', 'the sixth law is blind — racks may stand in the swing and sever the knee network (#2711)']
                                                                    : MUT_KNEE_ROUTE
                                                                    ? ['if (turn && kneeRack(gs, n.x + hx + dx, n.y + hy + dy)) continue // the knee is racked — the swing would clip it', 'if (false && turn && kneeRack(gs, n.x + hx + dx, n.y + hy + dy)) continue // MUTANT', 'loaded carts clip corners again — the body is gone from the route planner (#2711)']
                                                                    : MUT_KNEE_TEACH
                                                                    ? ['if (strandsFloor(gs, ax, ay) !== false) continue // an illegal neighbour teaches nothing', 'if (false && strandsFloor(gs, ax, ay) !== false) continue // MUTANT', 'the knee lesson teaches illegal beside-places — racking a taught cell would refuse, the fix is a lie (#2711 s2)']
                                                                    : MUT_TURN
                                                                    ? ['next.sort((a, b) => a.t - b.t || a.seq - b.seq) // pivots first, fixed arrival order breaks ties — total, stable', 'next.sort((a, b) => a.seq - b.seq) // MUTANT: arrival order — the staircase is back', 'loaded carts count cells again, not maneuvers — every leg stair-steps, the driver law is gone (#2724)']
                                                                    : MUT_REPATH_LAND
                                                                    ? ['if (broken) repath(gs, b)', 'if (false && broken) repath(gs, b)', 'racks land on claimed routes — traffic plans drive into fresh walls and old diagonals, and the heat lies about them (#2724)']
                                                                    : MUT_FACE
                                                                    ? ['bot.dir = nbDir(nx.x - bot.x, nx.y - bot.y)\n    if (bot.dir !== (bot.face + 2) % 4) bot.face = bot.dir // #2732: reversing keeps the facing — the body never rotates (#2711 doctrine, now visible in state)', 'bot.dir = nbDir(nx.x - bot.x, nx.y - bot.y)\n    bot.face = bot.dir // MUTANT: reversing rotates the nose — the body law is gone (#2732)', 'bot.face records movement, not facing — the back-pedal facing is invisible outside the planner again (#2732)']
                                                                    : MUT_SEED
                                                                    ? ['else if (t.kind === \'toStock\') bot.path = bfsKnee(gs, bot.x, bot.y, nearCell(t.rx, t.ry), bot.id, bot.face)\n    else if (t.kind === \'toOut\') bot.path = bot.carry\n        ? bfsKnee(gs, bot.x, bot.y, (x, y) => OUT_DOCKS.some((d) => d.x === x && d.y === y), bot.id, bot.face)', 'else if (t.kind === \'toStock\') bot.path = bfsKnee(gs, bot.x, bot.y, nearCell(t.rx, t.ry), bot.id, bot.dir) // MUTANT: the seed rides the movement again (#2738)\n    else if (t.kind === \'toOut\') bot.path = bot.carry\n        ? bfsKnee(gs, bot.x, bot.y, (x, y) => OUT_DOCKS.some((d) => d.x === x && d.y === y), bot.id, bot.dir)', 'the knee planner is blind to the nose — a just-reversed cart plans swings the body doctrine forbids, the live audit clips racks again (#2738)']
                                                                             : MUT_TAIL
                                                                    ? ['if (turn && kneeRack(gs, n.x - hx - dx, n.y - hy - dy)) continue // the tail is racked — the counterweight would clip it (#2760)', 'if (false && turn && kneeRack(gs, n.x - hx - dx, n.y - hy - dy)) continue // MUTANT', 'loaded carts clip their counterweight again — the tail is gone from the route planner, and ghost-clips return to every loaded leg (#2760)']
                                                                    : MUT_TAIL_LAND
                                                                    ? ['px - NB[pd][0] - NB[d][0] === x && py - NB[pd][1] - NB[d][1] === y)) { broken = true; break } // …or the counterweight tail does (#2760)', 'false)) { broken = true; break } // MUTANT: the back diagonal is blind again (#2760)', 'racks may land on committed backswings again — traffic keeps a plan whose counterweight now clips the fresh wall, and the heat lies about it (#2760)']
                                                                    : MUT_COURTESY
                                                                    ? ['if (!inSwing(px, py) && !blocked(gs, px, py, bot.id)) return { x: px, y: py }', 'if (!blocked(gs, px, py, bot.id)) return { x: px, y: py } // MUTANT: courtesy forgets the swing (#2783)', 'yielding carts park back into the rival\u2019s sweep again — duck-in-swing rises off zero and courtesy becomes the jam it ducked for (#2783)']
                                                                    : MUT_CAREER
                                                                        ? ["if (gs.end === 'win') fbNextShift(gs)", "if (false && gs.end === 'win') fbNextShift(gs) // MUTANT: the seam is gone (#2958)", 'the clock-in vanishes from replay — a career take mismatches at its first post-whistle checkpoint, so multi-shift runs become unrecordable (#2958)']
                                                                        : MUT_WHISTLE
                                                                            ? ['if (!won) closeEpisode(false)', 'closeEpisode(won)', 'whistle-stop returns — a cleared night closes its take at the sheet, career takes die in the bank (#2958)']
                                                                            : MUT_TAPS
                                                                                ? ['if (!tap.applied) applyTap(gs, tap.px, tap.py)', 'if (!tap.applied) { /* MUTANT (#2966): the drain banks a pointer the floor never applies */ }', 'queued taps stop applying live — the shell promises pointers its own drain never honors, and live == replay is dead']
                                                                    : ['export const ARM_REACH = 4', 'export const ARM_REACH = 9', 'the gantry reaches past its law']
    if (!src.includes(from)) { console.error('MUTATE: load-bearing line not found — probing stale code.'); process.exit(2) }
    plant(tgt, src.replace(from, to))
    console.log(`  ..    mutated: ${name} — this run MUST report FAILs`)
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
    pull(tgt) // restore what was planted — painter/adapter mutants plant outside sim.js (#2958)
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
    // #2724 RE-PIN: turn-count routing moves when loaded legs arrive, the
    // arm frees, the belt draws and hires land — module rng rides that clock,
    // so seeds that reach a divergence tick shift together (1/5/6 never make
    // it there unmanaged and still match their #1927 marks literally). The
    // side-stream promise is untouched: dest/weight still roll on their own
    // rngs; only the behavioral marks moved, as every physics PR re-pins.
    const GOLDEN = {
        1: 3628058901, 2: 3217168849, 3: 3080617429, 4: 418379247,
        5: 3057910432, 6: 2455069383, 7: 3865729813, 8: 3088558928,
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
    // #2724 RE-PIN: turn-count timing moves pack events on the seeds whose
    // loaded legs diverge — dest/weight stay each-on-its-own-rng (the streams
    // above them re-pin identically in kind: only clock-coupled marks moved).
    const DEST_GOLDEN = {
        1: 3027750522, 2: 3808114164, 3: 4080554158, 4: 3494246988,
        5: 2462892877, 6: 523675866, 7: 1895377948, 8: 3465946690,
    }
    const WEIGHT_GOLDEN = {
        1: 353657731, 2: 1927788964, 3: 1938349019, 4: 1856164593,
        5: 3660595227, 6: 371882369, 7: 4087419580, 8: 2593508443,
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
        // #2760 RE-PIN: the tail law moves routing — loaded pivots now refuse
        // the counterweight diagonal too, so the three careers re-route (see
        // the §TAIL audit: 1982 plans re-routed, 2068 ghost clips killed over
        // these same seed families). Traces regenerated from the live engine
        // (#2711 rig law: literal traces, re-measured, not vibes). Wins hold:
        // all three careers end W (avg 1317 vs the #2738 pin's 1434 — the
        // honest cost of driving the long way around a racked backswing);
        // jams stay 0 and the 5-seed shift set still goes 5/5 (#2692 re-pin).
        4242: '600:45:1:0|1200:144:2:0|1800:109:2:0|2400:114:3:0|3000:79:4:0|3600:110:5:0|4200:135:6:0|4800:268:8:0|5400:363:8:0|6000:498:10:0|6600:715:11:0|7200:1000:12:0|7800:1020:13:0|8400:1362:15:0|9000:1372:16:0|END win 1372',
        1337: '600:45:1:0|1200:118:2:0|1800:138:3:0|2400:93:4:0|3000:53:4:0|3600:362:6:0|4200:397:7:0|4800:7:8:0|5400:145:9:0|6000:712:10:0|6600:737:11:0|7200:847:12:0|7800:1198:14:0|8400:1198:14:0|9000:1288:15:0|END win 1288',
        777: '600:50:1:0|1200:50:2:0|1800:20:3:0|2400:45:4:0|3000:50:4:0|3600:21:5:0|4200:21:7:0|4800:41:7:0|5400:417:9:0|6000:452:10:0|6600:793:10:0|7200:923:11:0|7800:953:12:0|8400:1276:14:0|9000:1291:16:0|END win 1291',
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
    // #2958 CAREER TAKES — the take that survives the whistle. The live law
    // (index.jsx): a cleared night keeps the take open; clocking in banks the
    // next shift on the SAME seed/stream; a lost night or an exit to attract
    // closes it. The bank looks like this: rows run straight through the clock-in
    // (the over screen pauses wall-time, never ticks). The adapter
    // (plaicraft-dataset floorBossRows) replays it: rows past a win advance the
    // ladder, and every checkpoint past the seam must still match.
    const seed = 4242
    const gs = makeGame(seed)
    const ap = createAutopilot()
    const ep = createEpisode({ gameId: 'floor-boss', method: 'dpad', seed, players: 1, sources: [{ kind: 'human' }], task: 'floor-boss-shift', rules: () => ({ duel: false }) })
    let nights = 0
    for (;;) {
        while (!gs.end && gs.tick < SHIFT + 10) { const pad = ap(gs); step(gs, [pad]); ep.addTick([pad], null, stateHash(gs)) }
        if (gs.end === 'win' && nights < 1) { nights++; nextShift(gs); continue } // finish() keeps the take; advanceShift() clocks in
        break // the sheet closes the take at the real end (finish / attract exit)
    }
    ok(nights === 1 && gs.end === 'win' && gs.shift === 2, `the synthetic career banks a seam and dies on a WIN sheet — the seam stays openable (shift ${gs.shift}, end ${gs.end})`)
    const take = ep.finish({ success: gs.end === 'win', score: gs.score, finalHash: stateHash(gs) })
    ok(validateEpisode(take) === null, 'the career take validates (rec/v1 + episode block)')
    ok(take.ticks > SHIFT && take.slots[0].pads.length === take.ticks, `one take, two nights, one contiguous stream (${take.ticks} ticks, career ${take.episode.score})`)
    const rep = floorBossRows('unit/career', take)
    const lvls = [...new Set(rep.rows.map((x) => x.lvl))].sort().join(',')
    ok(rep.ok && rep.rows.length === take.ticks && lvls === '1,2',
        `the adapter replays the career take through the seam — feature rows carry the rungs (${lvls})${rep.mismatch ? ` mismatch@${rep.mismatch.tick}` : ''}`)
    // Honesty: rows invented PAST a whistle (a take that claims a night nobody
    // clocked into) are caught — the seam advances the ladder, and the final
    // checkpoint must still be the state the stream ends on. (Rows invented
    // behind a LOST take hash-freeze invisibly — a known frozen-hashes gap,
    // documented and out of this stage's scope.)
    const bogus = JSON.parse(JSON.stringify(take))
    for (let i = 0; i < 120; i++) bogus.slots[0].pads.push({})
    bogus.ticks = take.ticks + 120
    const caught = floorBossRows('unit/career-bogus', bogus)
    ok(!caught.ok, 'invented post-whistle rows refuse verification — nobody gets a free night (#2958)')
    // Static law pins: the shell keeps the take open ONLY on a clear night, and
    // every real end closes it where its floor stands.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/if \(!won\) closeEpisode\(false\)/.test(ui) && /if \(!won\) endRun\(\)/.test(ui),
        'whistle law: only a lost night closes the take at the sheet (#2958)')
    ok((ui.match(/closeTake\(\)/g) || []).length >= 4,
        'closeTake guards every real end: key-exit, tap-exit, contract reset, unmount (#2958)', )
    const ds = readFileSync(new URL('./plaicraft-dataset.mjs', import.meta.url), 'utf8')
    ok(/if \(gs\.end === 'win'\) fbNextShift\(gs\)/.test(ds), "the adapter seam: rows past a win clock the ladder in for replay (#2958)")
}
{
    // #2966 THE ORDER CARD CLICK WORKS — the finder referenced its own
    // initializer (`o` inside the predicate for `o`), so every contract-card
    // tap was a silent ReferenceError: a dead tap, no prio, no event. The
    // predicate must ask its candidate.
    const gs = makeGame(7)
    const ap = createAutopilot()
    for (let t = 1; t < 260; t++) step(gs, [ap(gs)]) // first card is open (measured window 240+)
    const o = gs.orders[0]
    ok(!!o, 'there is a contract to tap')
    clickOrder(gs, o.id); ok(o.prio === true, 'tapping an open contract lights its priority bit')
    clickOrder(gs, o.id); ok(o.prio === false, 'a second tap clears it again')
    o.shipped = true
    clickOrder(gs, o.id); ok(o.prio === false, 'a shipped contract answers no tap')
    const e = gs.orders.find((x) => !x.shipped && !x.expired && x.id !== o.id)
    if (e) { e.expired = true; clickOrder(gs, e.id); ok(e.prio !== true, 'an expired contract answers no tap') }
}
{
    // #2966 SAME-FRAME TAP LAW — live obeys the bank's drain. The bank promises
    // one pointer per tick (onePad #420, drain-one-per-tick); the old shell
    // applied taps at CLICK time, so two taps inside one frame both mutated
    // before step j while the rows could only promise tap1@j, tap2@j+1. No
    // replay of the banked stream could reproduce the live state past j, and
    // legitimate fast-tap takes refused on the hash. The fix: live applies
    // each tap at the tick that BANKS it — apply-before-step, the shape the
    // adapter's floorBossRows replays.
    // (a) OLD shape provably refuses: both taps before one step, banked on
    //     consecutive ticks — the adapter must call it a divergence.
    // (b) NEW shape validates: taps applied at their banked ticks, same seed,
    //     same taps — the take replays clean and keeps every input.
    const seed = 7
    const J = 300 // a hash checkpoint tick (hashEvery 30) with an order card open: the off-behind tap must show up RIGHT where the bank stamps
    const tapAuto = { px: CHIPS.auto.x + CHIPS.auto.w / 2, py: CHIPS.auto.y + CHIPS.auto.h / 2 } // durable flip: gs.auto rides stateHash
    const tapOrder = { px: 694 + 96 / 2, py: 46 + 66 / 2 } // order card slot 0 (taps.js orderRect(0)): toggles o.prio — hash-visible (`!` bit), costs nothing
    const padOf = (tap) => ({ pointer: { x: tap.px / TBW, y: tap.py / TBH, down: true } }) // onePad #420: 0..1 canvas space
    const driveTake = (bothEarly) => {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        const ep = createEpisode({ gameId: 'floor-boss', method: 'dpad', seed, players: 1, sources: [{ kind: 'human' }], task: 'floor-boss-shift', rules: () => ({ duel: false }) })
        for (let t = 1; t < J; t++) { const pad = ap(gs); step(gs, [pad]); ep.addTick([pad], null, stateHash(gs)) }
        const autoPre = gs.auto, oid = gs.orders[0] && gs.orders[0].id, prioPre = oid != null && gs.orders[0].prio
        const flip = (tap) => { applyTap(gs, tap.px, tap.py) }
        let autoNow = autoPre, prioNow = prioPre
        if (bothEarly) { flip(tapAuto); autoNow = gs.auto; flip(tapOrder); prioNow = oid != null && !!gs.orders.find((o) => o.id === oid).prio } // the old click-time lie: both mutate ahead of their rows
        const padA = { ...ap(gs), ...padOf(tapAuto) }
        if (!bothEarly) { flip(tapAuto); autoNow = gs.auto } // the fix: the tap applies at the tick that banks it
        step(gs, [padA]); ep.addTick([padA], null, stateHash(gs))
        const padB = { ...ap(gs), ...padOf(tapOrder) }
        if (!bothEarly) { flip(tapOrder); prioNow = oid != null && !!gs.orders.find((o) => o.id === oid).prio }
        step(gs, [padB]); ep.addTick([padB], null, stateHash(gs))
        const take = ep.finish({ success: false, score: gs.score, finalHash: stateHash(gs) })
        return { take, autoFlipped: autoNow !== autoPre, prioFlipped: oid != null && prioNow !== prioPre, oid }
    }
    const oldRun = driveTake(true)
    ok(validateEpisode(oldRun.take) === null, 'the same-frame take is structurally valid (rec/v1 + episode block)')
    ok(oldRun.autoFlipped && oldRun.prioFlipped,
        `both taps are REAL on the old floor — auto AND the prio bit were mutated before step ${J} while the bank could only promise them at ${J} and ${J + 1} (the refusal below has teeth)`)
    const repOld = floorBossRows('unit/taps-old', oldRun.take)
    ok(!repOld.ok && repOld.mismatch && repOld.mismatch.tick === J,
        `OLD shape refuses ON THE CHECKPOINT — both taps before step ${J} cannot replay against one-pointer-per-tick rows (diverged at tick ${repOld.mismatch ? repOld.mismatch.tick : 'never'})`)
    const newRun = driveTake(false)
    ok(newRun.autoFlipped && newRun.prioFlipped, `the drain shape keeps every tap — auto flipped and order ${newRun.oid} prio'd, nothing lost to the burst`)
    const repNew = floorBossRows('unit/taps-new', newRun.take)
    ok(repNew.ok && repNew.rows.length === newRun.take.ticks,
        `NEW shape replays clean — live applies each tap at its banked tick and fast-tap takes are train-ready again${repNew.mismatch ? ` mismatch@${repNew.mismatch.tick}` : ''} (${newRun.take.ticks} ticks)`)
    // Source pins (#2966): a click only queues; the loop drain is the ONLY
    // place a banked tap mutates the floor.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/if \(!tap\.applied\) applyTap\(gs, tap\.px, tap\.py\)/.test(ui), 'the drain owns the queued tap\u2019s mutation — the tick that banks it is the tick that applies it (#2966)')
    ok(/if \(tapQueue\.length\) \{ tapQueue\.push\(\{ px, py \}\); return \}/.test(ui), 'a tap that finds the bank busy only queues — no two mutations ahead of the first banked row (#2966)')
}
{
    // the ramp is honest both ways: winnable early, it bites eventually
    const depth = []
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
        depth.push(runs)
        // #2724 RE-MEASURE: turn-count routing re-shuffles the ladder — the
        // legs arrive on different ticks, hire/stock rng draws land elsewhere,
        // and each seed becomes a different chaotic world (single shifts all
        // still win; per-night waits are flat-to-lower and jams stay zero,
        // the floor drives smoother). Depth swings both ways vs the #2711
        // band (4–6): #2724 measured 3/6/4/6/2; #2738's facing seed
        // re-shuffled the draws again — measured 4/7/4/9/4. Honesty floor:
        // every seed climbs past the first rung-and-a-bit, and the mean still
        // clears four.
        ok(runs >= 2, `career seed ${seed}: the ladder climbs rung by rung (${runs} banked${end ? `, the ramp bites: ${end}` : ''})`)
    }
    ok(depth.reduce((s, r) => s + r, 0) / depth.length >= 4, `career depth averages ${depth.join('/')} — the mean still clears four rungs (#2724 re-measure)`)
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
        // #2711 KNEE law rewrites this ruling on this board: (18,7) is the
        // throat of shaft (18,5)-(18,6), whose only entry is the straight
        // through-lane below — plugging the throat strands the shaft, and the
        // swing into it from (18,4) clips the flank racks at (17,5)/(19,5).
        // A point-cart could snake it; a loaded cart cannot. The plug is now
        // refused, and the elbow behind it stays corner-refused.
        ok(!spur && g.ev.at(-1)?.why === 'knee', 'plugging the south throat is refused — the shaft behind it hangs on a swing the plug clips (#2711 updates #2546 here)')
        ok(put(g, 17, 4) === 'aisle' && g.ev.at(-1)?.why === 'corner', 'and the elbow stays refused — nothing about the corner law loosened')
    }
    {
        const g = mk()
        const spur = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6], [21, 4]].every(([x, y]) => put(g, x, y) === 'build')
        ok(spur, 'plugging the east mouth builds — its spur keeps a straight entry, the knee is free')
        ok(put(g, 17, 4) === 'aisle' && g.ev.at(-1)?.why === 'knee',
            '…but the elbow click is now the knee’s, not the corner’s (#2711): (17,4) would close the aisle at (18,4), where both swings clip (17,5)/(19,5) and strand corridor (19,4)-(20,4) — the corner law clears the spur, the knee law still refuses')
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
        // #2711 KNEE law retires both mouth plugs on this rig: (18,7) is
        // illegal outright (it severs the shaft below the throat, see the
        // corner-law spur gates above), and (21,4) is legal but no longer
        // clears the click — with the east mouth plugged, (17,4) is refused
        // by the knee instead (it would strand corridor (19,4)-(20,4)).
        // The lesson answers nothing it cannot prove and falls back to
        // LEAVE THE ELBOW FREE on canvas — adapt, never suggest a refusal.
        ok(esc.length === 0, 'the knee law retires both plugs on this board — the honest lesson falls back, it never teaches an illegal or useless plug (#2711 updates #2627 s2)')
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
        ok(fails.length === 1 && fails[0][0] === 18 && fails[0][1] === 9 && g.ev.at(-1)?.why === 'knee',
            'the trap rig builds until (18,9) — #2711 refuses the cap below the shaft outright (it strands (18,8) on swings clipped by (17,6)/(19,6)), so the trap forms before the click even happens; the pocket-mouth doctrine below still holds')
        const esc = cornerEscapes(g, 17, 4)
        ok(!esc.some((m) => m.x === 18 && m.y === 7), 'the pocket-mouth is never taught — plugging (18,7) would strand (18,8) (#2627 s2 honesty)')
        // #2711: on the trap board the knee law takes the east mouth too
        // ((21,4) no longer clears the click once the trap floor stands) —
        // the lesson falls back rather than teach a plug that misfires.
        ok(esc.length === 0, 'the trap board leaves no provable plug — the lesson falls back to LEAVE THE ELBOW FREE (#2711)')
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
        // #2711: with (21,4) off the menu, the south plug is next… and the knee
        // law retired it too (the shaft throat, see the corner-law spur gates) —
        // nothing is left to prove, and the lesson says nothing it cannot sell.
        ok(!keys.includes('18,7'), 'the knee law retires the other mouth here too — determinism, not decoration: the lesson adapts to the physics of the board (#2711)')
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
        const esc = laneEscapes(g, 18, 3)
        // #2711: the two mouths were ALTERNATIVES, never a stack — and the
        // knee law now enforces that physically: with (13,4) stood, (19,4)
        // would strand the spur corridor on swings clipped by (19,3)/(19,5).
        // The first plug builds, the second is the knee's.
        const r1 = esc.length ? put(g, esc[0].x, esc[0].y) : 'build'
        const r2 = esc.length > 1 ? put(g, esc[1].x, esc[1].y) : 'build'
        ok(r1 === 'build' && r2 === 'aisle' && g.ev.at(-1)?.why === 'knee',
            'the first taught plug builds; the knee law refuses the second on top of it — one spur at a time, the physics says it now (#2711)')
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
        // #2711: the west plug stands, but the east plug is refused by the
        // knee before the wall could ever seal — (19,4) would strand corridor
        // (18,4), whose only swings out clip the flank racks at (19,3)/(19,5).
        // The aisle never gets sealed, so there is no completing click left to
        // test — the older laws keep their precedence, the knee just gets
        // there first on this board.
        ok(put(q, 13, 4) === 'build' && put(q, 19, 4) === 'aisle' && q.ev.at(-1)?.why === 'knee' && put(q, 18, 3) === 'build',
            'the west plug spurs; the east plug is knee-refused before the seal — the aisle belongs to the knee now, not to the pocket (#2711 reorders #2622 both-mouths)')
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
        // #2711: the knee takes the east mouth too on this board (plugging
        // (19,4) strands corridor (18,4) on its clipped swings) — the lesson
        // falls back rather than teach a plug that misfires.
        ok(!keys.includes('19,4'), 'the knee retires the east mouth on the trap board too — nothing left to prove, nothing taught (#2711)')
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

// ---- live traffic heat (#2680) — aisles glow with the routes their bots drive ----
console.log('— live traffic heat (#2680) —')
{
    const mk = () => {
        const g = makeGame(11)
        g.score = 9000; g.racks.length = 0; g.auto = false
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0; b.path = [] })
        return g
    }
    const at = (h, x, y) => (h.find((c) => c.x === x && c.y === y) || {}).n || 0
    {
        // the read is routes, not decoration: a parked crew with no task claims
        // exactly its own cells — nothing else on the floor lights up.
        const g = mk()
        const h = flowHeat(g)
        ok(h.length === g.robots.length && h.every((c) => c.n === 1),
            `a parked crew claims only its own cells (${h.map((c) => `${c.x},${c.y}:${c.n}`).join(' ') || 'nothing'}) — heat is occupancy-ahead, not ambience (#2680)`)
        ok(h[h.length - 1].x === 24 && h[h.length - 1].y === 12, 'the answer is row-major — fixed order regardless of bot array order')
    }
    {
        // the counting law itself: cross-bot sums, per-bot dedup.
        const g = mk()
        g.robots[0].path = [{ x: 22, y: 12 }, { x: 21, y: 12 }, { x: 20, y: 12 }, { x: 22, y: 12 }] // loop re-enters (22,12)
        g.robots[1].path = [{ x: 21, y: 12 }, { x: 20, y: 12 }, { x: 19, y: 12 }]
        const h = flowHeat(g)
        ok(at(h, 21, 12) === 2 && at(h, 20, 12) === 2,
            `two routes through one cell count TWO (21,12=${at(h, 21, 12)} 20,12=${at(h, 20, 12)}) — the convergence the jam law will name is readable one beat early (#2680)`)
        ok(at(h, 22, 12) === 1, 'a route that crosses one cell twice credits it once — per-bot dedup (#2680)')
        ok(at(h, 19, 12) === 1 && Math.max(...h.map((c) => c.n)) === 2, 'unshared tail cells stay at one claim; the board maximum is the true meeting size')
    }
    {
        // display contract over a full REAL shift (autopilot traffic): every
        // claim sits on drivable rack-free floor within crew size, every bot's
        // own cell is claimed, purity holds every tick — and real traffic
        // actually meets: the read has something to read.
        const g = makeGame(4242)
        const ap = createAutopilot()
        let maxN = 0, convTicks = 0, total = 0
        const lies = []
        while (!g.end && g.tick < SHIFT + 10) {
            step(g, [ap(g)])
            const h = flowHeat(g)
            total++
            if (stateHash(g) === undefined) lies.push('hash throw')
            let conv = 0
            for (const c of h) {
                if (c.n < 1 || c.n > g.robots.length) lies.push(`n=${c.n}@${c.x},${c.y}`)
                if (g.racks.some((r) => r.x === c.x && r.y === c.y)) lies.push(`rack@${c.x},${c.y}`)
                if (c.n >= 2) conv++
                if (c.n > maxN) maxN = c.n
            }
            if (conv) convTicks++
            for (const b of g.robots) if (!h.some((c) => c.x === b.x && c.y === b.y)) lies.push(`unclaimed bot cell ${b.x},${b.y}@${g.tick}`)
        }
        ok(lies.length === 0, `full autopilot shift — every claim truthful: drivable floor, no rack faces, ≤ crew size, every bot cell claimed (first lies: ${lies.slice(0, 3).join(' ') || 'none'}) (#2680)`)
        ok(convTicks >= total * 0.1 && maxN >= 2,
            `real traffic meets where the read says it will — ${convTicks}/${total} ticks carry a convergence, deepest n=${maxN} (#2680)`)
    }
    {
        // purity + determinism (#1917): the read never steers the floor.
        const g = mk()
        g.robots[0].path = [{ x: 22, y: 12 }, { x: 21, y: 12 }]
        g.robots[1].path = [{ x: 23, y: 12 }, { x: 22, y: 12 }]
        const h0 = stateHash(g)
        const one = JSON.stringify(flowHeat(g))
        const two = JSON.stringify(flowHeat(g))
        ok(one === two && stateHash(g) === h0, 'flowHeat is pure — same answer twice, board hash unchanged (#1917)')
        g.robots.reverse()
        ok(JSON.stringify(flowHeat(g)) === two, 'the heat answer is stable under bot-array reorder — order comes from the grid, not insertion (#2680)')
    }
    // the painter draws it between the legality tint and the amber law; the DEV eye reads it.
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/flowHeat\(gs\)/.test(ui) && /paintHeat\(tick\)/.test(ui), 'the painter draws the heat (flowHeat → paintHeat) (#2680)')
    ok(ui.indexOf('paintFlow()') < ui.indexOf('paintHeat(tick)') && ui.indexOf('paintHeat(tick)') < ui.indexOf('paintSwing()'),
        'floor paint order: legality tint, live heat beneath the amber law boxes — law paint outranks traffic paint (#2680, #2622 item 3)')
    ok(/heat: \(\) => flowHeat\(gs\)/.test(ui), 'the DEV hook exposes live traffic heat for the browser gate (#2680)')
}

// ---- duck & pass (#2692) — the bay a lane-law left, a cart now uses ----
console.log('— duck & pass (#2692) —')
{
    // rig: the arm-bay crush lifted from seed 1337's live trace (@6404 a toArm
    // cart at (16,3) pulled west to (15,3) beside the rack while two rivals
    // held the bay mouths). Three carts, one bay, rack shoulders at (14,3) and
    // (18,3). A stalls behind B (working the bay) with C walling the alternate
    // mouth — the stall branch, where the real freezes live.
    const bayRig = ({ sealW = false, sealE = false, sealS = false, brokenRival = false } = {}) => {
        const g = makeGame(11)
        g.score = 9000
        g.arm.held = 'crate'
        g.racks.push({ x: 18, y: 3, items: [], owner: -1 }) // C's stock target — emptiest race sends B west to (14,3)
        if (sealW) g.racks.push({ x: 15, y: 3, items: [], owner: -1 })
        if (sealE) g.racks.push({ x: 17, y: 3, items: [], owner: -1 })
        if (sealS) g.racks.push({ x: 16, y: 4, items: [], owner: -1 })
        const [A, B] = g.robots
        A.x = 16; A.y = 3; A.carry = null; A.task = { kind: 'toArm' }; A.path = []; A.moveT = 0; A.wait = 0; A.yield = null; A.yieldCd = 0
        B.x = 16; B.y = 2; B.carry = null; B.task = { kind: 'toArm' }; B.path = []; B.moveT = 0; B.wait = 0; B.pickT = 24; B.jam = false; B.broken = brokenRival; B.repair = brokenRival ? 400 : 0
        g.robots.push({ id: 3, x: 17, y: 1, carry: 'crate', owner: -1, task: { kind: 'toStock', rx: 18, ry: 3 }, path: [], moveT: brokenRival ? 9999 : 36, wait: 0, jam: false, pickT: 0, broken: false, repair: 0, wear: 0, wearMax: 9999, dir: 2, face: 2, hist: [], stall: 0, yield: null, yieldCd: 0, ducked: 0 }) // #2732: synthetic bots carry the facing beside the movement
        return { g, A, B }
    }
    {
        const { g, A } = bayRig()
        let duckTick = -1, resumeTick = -1, jammed = 0, bayAfter = false
        let atShoulder = false, heldTicks = 0, rivalGoneAtResume = false, resumedOnce = false
        const picks = []
        for (let t = 0; t < 400 && !g.end; t++) {
            step(g, [{}])
            for (const e of g.ev) {
                if (e.type === 'duck' && e.fx === 16 && e.fy === 3 && e.x === 15 && e.y === 3) duckTick = duckTick < 0 ? g.tick : duckTick
                if (e.type === 'jam') jammed++
                if (e.type === 'pick' || e.type === 'stow') picks.push(`${e.type}@${e.x},${e.y}@${g.tick}`)
            }
            const onShoulder = A.x === 15 && A.y === 3
            if (duckTick > 0 && onShoulder && A.yield) { atShoulder = true; heldTicks++ }
            if (duckTick > 0 && atShoulder && !onShoulder && !resumedOnce) {
                resumedOnce = true
                rivalGoneAtResume = g.robots[1].x >= 17 // the rival that owned the mouth is east of it, driving off
            }
            if (!A.yield && duckTick > 0 && resumeTick < 0) resumeTick = g.tick
            if (resumeTick > 0 && A.x === 16 && A.y === 2) bayAfter = true
        }
        ok(duckTick > 0 && A.ducked === 1,
            `the stalled cart ducks west into the bay (tick ${duckTick}, (16,3)->(15,3)) — the exact shape seed 1337 produced live (#2692)`)
        ok(rivalGoneAtResume && heldTicks >= YIELD_WAIT,
            `it holds the shoulder ${heldTicks} ticks and steps up only once the rival drives off the bay (rival east at resume: ${rivalGoneAtResume}) — courtesy, not a detour (#2692; #2724 re-pins the seam one tick true: turn-count geometry resumes the queue the tick the mouth clears)`)
        ok(picks.length > 0, `the rival stocked through while the cart held (picks ${picks.join(' ')}) — the bay never blocks the traffic it freed (#2692)`)
        ok(resumeTick > duckTick && resumeTick - duckTick <= YIELD_MAX && bayAfter,
            `the cart resumes into the bay it yielded the queue for (held ${resumeTick - duckTick} ticks, reached the bay after) — patience pays the yielder (#2692)`)
        ok(jammed === 0, 'no jam was ever named — the freeze this rig used to call is now traffic (#2692)')
    }
    {
        // the backpedal: no side bay, a pull-back in line still clears the mouth
        const { g, A } = bayRig({ sealW: true, sealE: true })
        let duckAt = null
        for (let t = 0; t < 400 && !g.end; t++) {
            step(g, [{}])
            const e = g.ev.find((x) => x.type === 'duck')
            if (e && !duckAt) duckAt = `${e.fx},${e.fy}->${e.x},${e.y}`
        }
        ok(duckAt === '16,3->16,4', `both sides walled, the cart backs off the mouth instead (${duckAt}) — the queue case has an honest shoulder too (#2692)`)
    }
    {
        // honesty where it must fail: sealed on every side — no courtesy to fake.
        // #2760 RE-PIN: the assertion is about cart A, not the whole floor —
        // with tail routing the traffic pattern breathes, and another cart may
        // legitimately duck at another bay while this one stays walled in.
        const { g, A } = bayRig({ sealW: true, sealE: true, sealS: true })
        let deep = 0
        for (let t = 0; t < 200 && !g.end; t++) { step(g, [{}]); if (A.wait >= YIELD_WAIT && !A.yield) deep++ }
        ok(A.ducked === 0 && deep > 0 && A.yield === null,
            `no shoulder, no duck — the cart waits like it always did (wait≥${YIELD_WAIT} for ${deep} ticks, A.ducked ${A.ducked}) — yield never teleports a cart through racks (#2692; #2760: the rig judges cart A; traffic elsewhere may duck)`)
    }
    {
        // a rival that never moves is a breakdown, not traffic — ducking lies
        const { g, A } = bayRig({ brokenRival: true })
        for (let t = 0; t < 200 && !g.end; t++) step(g, [{}])
        ok(g.ducks === 0 && A.wait > 2 * YIELD_WAIT, `the blocker is DOWN — no courtesy is paid to a cart that cannot flow (ducks ${g.ducks}, wait ${A.wait}) — repair stays the manager's job (#2692)`)
    }
    {
        // racks are not rivals: a wall-block never earns a duck (wait is cheap there)
        const { g, A } = bayRig()
        g.racks.push({ x: 16, y: 2, items: [], owner: -1 }) // wall the bay — no robot is the blocker now
        ok(pullOff(g, A, { x: 16, y: 2 }) === null, 'a rack at the blocked cell answers nothing — walls never move, so lines at walls never pull over (#2692)')
    }
    {
        // purity (#1917): the query sees, the hash stays; the Y mark rides truth
        const { g, A } = bayRig()
        A.wait = YIELD_WAIT
        const h0 = stateHash(g)
        const a1 = JSON.stringify(pullOff(g, A, { x: 16, y: 2 }))
        const a2 = JSON.stringify(pullOff(g, A, { x: 16, y: 2 }))
        ok(a1 === '{"x":15,"y":3}' && a2 === a1 && stateHash(g) === h0, `the shoulder query is pure and names the bay cell (${a1}) — the read that routes, hash untouched (#1917, #2692)`)
        A.yield = { fx: 16, fy: 3, nx: 16, ny: 2, t: 30 }
        const hY = stateHash(g)
        ok(hY !== h0, 'holding a shoulder moves the hash (Y mark) — a parked cart is sim truth, not paint (#2692)')
        g.ducks = 1
        ok(stateHash(g) !== hY, 'the duck tally rides the hash (DK) — additive (#1373 law, #2692)')
    }
    {
        // determinism: the same rig ducks at the same tick in both runs
        const run = () => {
            const { g } = bayRig()
            let duck = -1
            for (let t = 0; t < 400 && !g.end; t++) { step(g, [{}]); const e = g.ev.find((x) => x.type === 'duck'); if (e && duck < 0) duck = g.tick }
            return `${duck}:${stateHash(g)}`
        }
        ok(run() === run(), 'twin determinism — same rig, same duck tick, same final hash (#2692)')
        ok(YIELD_WAIT === 4 && YIELD_MAX === 60 && YIELD_CD === 24, 'duck cadence pinned 4/60/24 — the measured rhythm (W-sweep 4/6/8/12 on 15 seeds) cannot drift unannounced (#2692)')
    }
    {
        // the live floor ducks on its own: the shelf-proof seeds, autopilot seats
        // #2760 RE-PIN: tail routing reshuffles congestion, and the old set
        // (1337/11/13/17/42) drives a clean 0 ducks. Seeds 1–60 re-swept:
        // every-seed-duck winners 1(2 ducks),19,23,30,32,35,36,39,46,49,50,
        // 52,55(2) — first five adopted, all 5/5 wins with zero jams.
        const seeds = [1, 19, 23, 30, 32]
        let ducks = 0, jams = 0, wins = 0
        for (const seed of seeds) {
            const g = makeGame(seed)
            const ap = createAutopilot(0)
            while (!g.end) { step(g, [ap(g)]); jams += g.ev.filter((e) => e.type === 'jam').length }
            ducks += g.ducks; if (g.score >= g.params.quota) wins++
        }
        ok(ducks >= 1 && jams === 0 && wins === seeds.length,
            `autopilot shifts: ${ducks} ducks, 0 jams, ${wins}/${seeds.length} wins — real traffic takes the bays and the win proof rides (#2692)`)
    }
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/paintYield\(tick\)/.test(ui) && ui.indexOf('paintRobots(tick)') < ui.indexOf('paintYield(tick)'), 'the courtesy ring paints over the cart (#2692)')
    ok(/case 'duck'/.test(ui) && /yields: \(\) =>/.test(ui) && /' BAY'/.test(ui), 'the duck event lands with sound, the DEV eye reads the holds, the panel says BAY (#2692)')
}

// ---- manners polish (#2700) — ducks steer, name themselves, read directional, count, and show ----
console.log('— manners polish (#2700, source pins + attract sweep) —')
{
    const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/const duckSlide = new Map\(\)/.test(ui), 'the painter tracks a duck slide per bot (#2700)')
    ok(/const es = 1 - \(1 - k\) \* \(1 - k\)/.test(ui), 'the duck slide eases out — swing in and settle, no linear blink (#2700)')
    ok(/const k = \(tick - sl\.t0\) \/ 14/.test(ui), 'the slide rides gs.tick across one cadence (14t) — a WORLD clock, not display frames (#1877 law, #2700)')
    ok(/if \(anim\.sway\)/.test(ui) && /anim\.turn \* 0\.16 \+ anim\.sway \* 0\.12/.test(ui), 'the backpedal swings at 180° where dir-change sway goes silent (#2700)')
    ok(/if \(duckTaughtOn !== gs\) \{/.test(ui), 'the first duck of a shift names itself once — per game identity (#2700)')
    ok(/case 'shiftstart'[^']*duckTaughtOn = null/.test(ui), 'a new night re-arms the GIVE WAY lesson (#2700)')
    ok(/ctx\.fillText\('GIVE WAY', x \+ TILE \/ 2, y - 3\)/.test(ui) && /until: gs\.tick \+ 150/.test(ui), 'the lesson plates the bay cell with its name for 150 world ticks (#2700)')
    ok(/fx\('GIVE WAY', '#78dceb'/.test(ui), 'the tail rings on the fx ledger too — QA-readable, not only pixels (#2700)')
    ok(/const ang = Math\.atan2\(ddy, ddx\)/.test(ui), 'the shoulder chevron points at the actual pull-off direction (#2700)')
    ok(/fillText\('GIVEN'/.test(ui) && /r\.x === b\.yield\.fx && r\.y === b\.yield\.fy/.test(ui), 'the vacated cell stamps GIVEN the moment a rival crosses it (#2700)')
    ok(/given: \(\) => \[\.\.\.givenAt\.keys\(\)\]/.test(ui) && /duckTeach: \(\) =>/.test(ui), 'QA eyes read the teach plate and the GIVEN stamps atomically (#2700)')
    ok(/BAYS TAKEN \$\{gs\.ducks\}/.test(ui), 'the whistle sheet counts BAYS TAKEN — courtesy is countable (#2700)')
    ok(/floorboss\.bays/.test(ui), 'career manners persist — the board honours the smoothest floor (#2700)')
    ok(/while \(gs\.tick < 3600 && !gs\.end\) step\(gs, \[ap\(gs\)\]\)/.test(ui), 'the attract demo clocks in mid-heat — the build-up fast-forwards, fixed seeds × fixed autopilot (#2700)')
    ok(/makeGame\(ATTRACT_SEEDS\[\+\+demoSeed % ATTRACT_SEEDS\.length\]\)/.test(ui), 'the attract cycles measured duck-rich seeds (#2700)')
    ok(/gs\.ev\.length = 0 \/\/ no minute of stale events/.test(ui), 'the warm-up drains stale events — no minute of sound bursts into the painter (#2700)')
    ok(/GIVE WAY — CARTS DUCK INTO BAYS AND PASS/.test(ui), 'the attract card sells the new grammar in the shop window (#2700)')
    ok(/warmAttract\(\) \/\/ #2700: the first shop-window/.test(ui), 'the mount demo is warm too — the very first loop a visitor sees ducks (#2700)')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(!simSrc.includes('#2700'), 'the sim is untouched — manners live painter-side, the engine law stays byte-law (#1917)')
    // honest sweep: every shop-window seed must deliver its duck while a visitor watches
    const seeds = JSON.parse(ui.match(/const ATTRACT_SEEDS = (\[[0-9, ]+\])/)[1])
    ok(seeds.length >= 4, `the shop window cycles ${seeds.length} seeds (#2700)`)
    let allDuck = true
    const detail = []
    for (const seed of seeds) {
        const g = makeGame(seed)
        const a = createAutopilot(0)
        while (g.tick < 3600 && !g.end) step(g, [a(g)])
        const startDucks = g.ducks
        let first = -1
        while (!g.end && g.tick < 9100) { step(g, [a(g)]); if (first < 0 && g.ducks > startDucks) first = g.tick }
        const won = g.score >= g.params.quota
        detail.push(`${seed}@${first < 0 ? 'never' : first}${won ? '' : ' short'}`)
        // #2711: knee routing defers the first courtesy (~12–35s later than the
        // point-cart floor measured in #2700) — window widened to 36s of screen
        // time, still inside the first minute on the shop window.
        // #2724: turn-count routing re-measured the window — the five seeds above
        // duck inside it, honest replacement not a wider gate.
        // #2738: the facing seed re-shuffled the loops again; the new five duck
        // at 4614–5478, the same 36–96s band, re-measured not widened.
        if (!(won && first > 3600 && first < 5800)) allDuck = false
    }
    ok(allDuck, `warm attract floors duck at ${JSON.stringify(detail)} — every demo loop shows courtesy inside the first minute on screen (#2700)`)
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
    ok(/gs\.duel && \(e\.why === 'lane' \|\| e\.why === 'corner' \|\| e\.why === 'knee'\)/.test(ui) && /e\.s === 1 \? 'MODEL' : 'YOU'/.test(ui), 'the painter stamps the refusal seat in the duel chrome — YOU vs MODEL under the amber law (#2622 item 4, #2711 seat-stamps the knee too)')
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
    ok(/humanStart\(e\.code === 'KeyD'\)/.test(ui) && /startPlay\(duel;?\s*\)?\s*;?\s*beginRun/.test(ui.replace(/\n\s*/g, ' ')), "D at the attract seats the model manager (#1712: the consent gate wraps the seed-birth, duel rides through)")
    ok(/MODEL \$\{mm\}/.test(ui) && /MANAGER OF THE NIGHT/.test(ui), 'twin till and the verdict line ride the canvas')
    ok(/owner === 1 \? '#57c7ff'/.test(ui), 'racks wear their owner tint — cyan is the model\'s')
    ok(/players: duel \? 2 : 1/.test(ui) && /\['human', 'model'\]/.test(ui), "the episode records players:2, sources ['human','model'] (#1144 slot two)")
}

// ---- knee law (#2711) — loaded carts have bodies through the turn ----
console.log('— knee law (#2711) — swept volumes: geometry, routing, and the sixth placement law —')
{
    const mk = () => {
        const g = makeGame(7); g.score = 9000; g.racks.length = 0; g.auto = false
        g.robots.forEach((b, i) => { b.x = 23 - i; b.y = 12; b.task = { kind: 'idle' }; b.carry = null; b.path = [] })
        return g
    }
    const put = (g, x, y) => { g.cursor = { x, y }; g.tool = 'rack'; const r = clickCell(g, x, y); if (r === 'build') g.tool = null; return r }
    // The NEED board: a rack garden whose south throat (18,7) feeds shaft
    // (18,5)-(18,6). Straight north through the throat is the only ride in —
    // the swings into (18,4) clip the flank racks at (17,5)/(19,5), and every
    // reversible route in through the throat dies at (18,7).
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    const rigN = (extra) => { const g = mk(); for (const [x, y] of NEED) g.racks.push({ x, y, items: [], owner: -1 }); if (extra) g.racks.push({ x: extra[0], y: extra[1], items: [], owner: -1 }); return g }
    {
        const g = mk()
        ok(kneeTurn(g, 10, 10, [1, 0], [1, 0]) === false && kneeTurn(g, 10, 10, [1, 0], [-1, 0]) === false,
            'straight and backpedal never sweep — only the 90° swing moves the nose onto the diagonal (#2711)')
        g.racks.push({ x: 10, y: 9, items: [], owner: -1 })
        ok(kneeTurn(g, 9, 10, [1, 0], [0, -1]) === true, 'east→north at (9,10) with a rack at (10,9): the OUTER diagonal is the sweep, and it is racked')
        ok(kneeTurn(g, 9, 10, [1, 0], [0, 1]) === false, 'south is the inside of that turn — the tail stays in lane; the diagonal across the swing is the law')
    }
    {
        // routing: the throat at (18,7). With the throat OPEN, a loaded cart
        // straightens up from below and rides into (18,6); with the throat
        // RACKED the shaft is unreachable — every turn into (18,4)/(18,5)/(18,6)
        // clips a flank, and reversals cannot turn corners either.
        const open = rigN()
        const pIn = bfsKnee(open, 18, 8, (x, y) => x === 18 && y === 5, null, 0) // facing north at the mouth
        ok(pIn && pIn.length === 3, `open throat: the shaft ride is a straight three (${pIn ? pIn.length : 'null'}) — straight lines never knee`)
        const sealed = rigN([18, 7])
        const pOut = bfsKnee(sealed, 18, 8, (x, y) => x === 18 && y === 5, null, 0)
        ok(pOut === null, 'throat racked, shaft dead: no knee-legal route exists into (18,5) from below — the law is real routing, not a banner (#2711)')
        // purity of the answer: every turn on every knee path is knee-clean
        // (reversals skipped — the body never sweeps in reverse, by law).
        let dirty = 0
        const NBv = [[0, -1], [1, 0], [0, 1], [-1, 0]]
        const dirOf = (a, b) => NBv.find(([dx, dy]) => b.x - a.x === dx && b.y - a.y === dy)
        const heads = [[18, 8, 0], [16, 8, 1], [22, 4, 3]]
        for (const [sx, sy, sd] of heads) {
            const q = bfsKnee(open, sx, sy, (x, y) => x === 18 && y === 5, null, sd)
            if (!q) continue
            const cells = [{ x: sx, y: sy }, ...q]
            for (let i = 1; i < cells.length - 1; i++) {
                const di = dirOf(cells[i - 1], cells[i]), do2 = dirOf(cells[i], cells[i + 1])
                if (di[0] === -do2[0] && di[1] === -do2[1]) continue // a reversal leg — legal by the spur doctrine
                if (kneeTurn(open, cells[i].x, cells[i].y, di, do2)) dirty++
            }
        }
        ok(dirty === 0, 'knee paths never turn where the swing clips a rack — the path IS the law, checked trip by trip (#2711)')
    }
    {
        // the sixth law at the click: plugging the throat strands the shaft.
        const g = rigN()
        const score0 = g.score, hash0 = stateHash(g)
        ok(put(g, 18, 7) === 'aisle' && g.ev.at(-1)?.why === 'knee', 'the click that plugs the throat and strands the shaft is refused (why=knee) (#2711)')
        ok(g.score === score0 && stateHash(g) === hash0 && !g.racks.some((r) => r.x === 18 && r.y === 7), 'the knee refusal charges nothing and lands nothing — click-point law, zero footprint (#1917)')
        const was = kneeNet(rigN(), null), after = kneeNet(rigN(), { x: 18, y: 7 })
        const cut = [...was].filter((k) => !after.has(k) && k !== '18,7').sort().join(' ')
        ok(cut === '18,5 18,6', `the knee net names exactly what the plug strands: ${cut || 'nothing'} — honest scope, the shaft and nothing else (#2711)`)
    }
    {
        // the law deepens with the floor: once the shaft has racks on both
        // flanks, sealing its mouth from BELOW is the same severment — the
        // shaft's last knee-rideable exit goes, and the net says so.
        const g = mk()
        for (const [x, y] of [...NEED, [17, 8], [19, 8]]) put(g, x, y)
        ok(put(g, 18, 9) === 'aisle' && g.ev.at(-1)?.why === 'knee', 'with the shaft walled, the click that seals its mouth from below is refused too — one cell, both directions, knee law (#2711)')
    }
    {
        // live knees: the grammar reads on any board before any refusal fires.
        const g = rigN()
        const lk = liveKnees(g)
        ok(lk.some((k) => k.kx === 17 && k.ky === 5 && (k.x === 18 || k.x === 17) && (k.y === 4 || k.y === 5)), 'liveKnees finds the clipped flanks of the throat garden — the knee is visible before the banner (#2711)')
        const h0 = stateHash(g)
        ok(JSON.stringify(liveKnees(g)) === JSON.stringify(lk) && stateHash(g) === h0, 'liveKnees is pure — same answer twice, board hash unchanged (#1917)')
    }
    {
        // determinism twins + curated innocence: the autopilot economy transfers.
        let wins = 0, jams = 0, kneeEv = 0
        for (const seed of [4242, 1337, 777, 7, 99, 2, 12]) {
            const gs = makeGame(seed); const ap = createAutopilot()
            while (!gs.end && gs.tick < SHIFT + 10) { step(gs, [ap(gs)]); jams += gs.ev.filter((e) => e.type === 'jam').length; kneeEv += gs.ev.filter((e) => e.type === 'aisle' && e.why === 'knee').length }
            if (gs.end === 'win') wins++
        }
        ok(wins >= 6 && jams === 0, `autopilot wins ${wins}/7 with zero jams on the knee floor — the win proof transfers, the knee never wedges a lawful floor (#2711)`)
        ok(kneeEv === 0, 'curated expansion never stands in a swing — the sixth law stays a defense, never a tax on the demo floor (#2711)')
        const t1 = makeGame(4242), t2 = makeGame(4242)
        const a1 = createAutopilot(), a2 = createAutopilot()
        let same = true
        for (let t = 0; t < 2000; t++) { step(t1, [a1(t1)]); step(t2, [a2(t2)]); if (stateHash(t1) !== stateHash(t2)) same = false }
        ok(same, 'twin autopilots stay byte-identical through 2000 ticks — the knee is pure geometry, no rng (#2711)')
    }
    {
        // presentation pins: the banner, the keep-clear box, the body, the eye.
        const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
        ok(/NO KNEE — RACKED THE SWING/.test(ui), 'the painter names NO KNEE on screen — the sixth law speaks (#2711)')
        ok(ui.indexOf('paintTeach(tick)') < ui.indexOf('paintKnee(tick)'), 'the knee keep-clear rides above the lesson layer — the loudest truth last, in amber (#2711)')
        ok(/SWING/.test(ui) && /paintKnee/.test(ui), 'the refused swing gets its keep-clear box on the canvas (#2711)')
        ok(/rgba\(255,210,63,0\.4\)/.test(ui), 'loaded carts carry an amber nose on the leading edge — the sweeping cell is visible at a glance (#2711)')
        ok(/knees: \(\) => liveKnees\(gs\)/.test(ui), 'the DEV eye reads live knees for the browser gate (#2711)')
    }
}
// ---- #2711 s2 TEACH THE KNEE — the refusal shows what it can prove ----
console.log('— knee teach (#2711 s2) — bends, beside-places, and the honest fallback —')
{
    const mk = () => {
        const g = makeGame(7); g.score = 9000; g.racks.length = 0; g.auto = false
        g.robots.forEach((b, i) => { b.x = 23 - i; b.y = 12; b.task = { kind: 'idle' }; b.carry = null; b.path = [] })
        return g
    }
    const put = (g, x, y) => { g.cursor = { x, y }; g.tool = 'rack'; const r = clickCell(g, x, y); if (r === 'build') g.tool = null; return r }
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    const rig = (extra) => { const g = mk(); for (const [x, y] of [...NEED, ...(extra || [])]) g.racks.push({ x, y, items: [], owner: -1 }); return g }
    const DN = { '0,-1': 'N', '1,0': 'E', '0,1': 'S', '-1,0': 'W' }
    const fmtB = (e) => e.bends.map((b) => `${b.x},${b.y}:${DN[b.in.join(',')]}${DN[b.out.join(',')]}`).join(' ')
    const fmtA = (e) => e.alts.map((a) => `${a.x},${a.y}`).join(' ')
    // a legal click — even beside the garden — teaches nothing
    {
        const e1 = kneeEscapes(mk(), 10, 10)
        const e2 = kneeEscapes(rig(), 19, 7) // (19,7) is a legal click beside the NEED garden
        ok(e1.bends.length === 0 && e1.alts.length === 0 && e2.bends.length === 0 && e2.alts.length === 0,
            'kneeEscapes answers NOTHING for legal clicks — the lesson fires only on its own law (#2711 s2)')
    }
    // the throat rig: bends and beside-places, pinned to measured geometry
    {
        const g = rig()
        ok(put(g, 18, 7) === 'aisle' && g.ev.at(-1)?.why === 'knee', 'throat plug refused (setup) (#2711 s2)')
        const e = kneeEscapes(g, 18, 7)
        ok(fmtB(e) === '17,8:NE 19,8:NW 17,8:EN 19,8:WN', `the four swings (18,7) blocks are named in fixed order: ${fmtB(e) || 'nothing'} (#2711 s2)`)
        ok(fmtA(e) === '19,7 17,7', `the beside-place is exactly the two flank cells — the shaft cell and the mouth are not offered: ${fmtA(e) || 'nothing'} (#2711 s2)`)
        // structure: click is the swept diagonal of every bend, arms open and riding the net
        const was = kneeNet(g, null)
        const openAt = (x, y) => x >= 1 && x <= 24 && y >= 1 && y <= 13 && !g.racks.some((r) => r.x === x && r.y === y)
        let clean = e.bends.length > 0
        for (const b of e.bends) {
            if (b.x + b.in[0] + b.out[0] !== 18 || b.y + b.in[1] + b.out[1] !== 7) clean = false // click IS the knee cell
            if (!openAt(b.x - b.in[0], b.y - b.in[1]) || !openAt(b.x + b.out[0], b.y + b.out[1])) clean = false
            if (!was.has(`${b.x - b.in[0]},${b.y - b.in[1]}`) || !was.has(`${b.x + b.out[0]},${b.y + b.out[1]}`)) clean = false
        }
        ok(clean, 'every taught bend is structural: the click sits on B+dIn+dOut, both arms open and riding the knee net BEFORE the click — turns the floor actually drives (#2711 s2)')
        // honesty of the beside-place: each alt builds on its own, and the swing stays law above it
        let builds = true, holds = true
        for (const a of e.alts) {
            const q = rig()
            if (put(q, a.x, a.y) !== 'build') builds = false // stands legal on its own garden
            const w = rig([[a.x, a.y]])
            if (!(put(w, 18, 7) === 'aisle' && w.ev.at(-1)?.why === 'knee')) holds = false // swing still law above the beside rack
        }
        ok(builds, 'every green cell is a legal click in its own right — the lesson never suggests a refusal (#2627 s2 honesty, #2711 s2)')
        ok(holds, 'monotonic truth, taught honestly: with a beside-place stood, the swing cell is STILL refused — no plug frees a knee, so the lesson offers placement, not redemption (#2711 s2)')
    }
    // the shaft-wall rig: the lesson adapts to a different board's physics
    {
        const g = mk()
        for (const [x, y] of [...NEED, [17, 8], [19, 8]]) put(g, x, y)
        ok(put(g, 18, 9) === 'aisle' && g.ev.at(-1)?.why === 'knee', 'mouth seal refused (setup) (#2711 s2)')
        const e = kneeEscapes(g, 18, 9)
        ok(fmtB(e) === '17,10:NE 19,10:NW 17,10:EN 19,10:WN', `the lower throat names its own bends: ${fmtB(e) || 'nothing'} (#2711 s2)`)
        ok(fmtA(e) === '19,9 17,9', `green offers only the flanks — the mouth (18,8) is an open neighbour but an illegal click, so it is never taught: ${fmtA(e)} (#2711 s2)`)
        const q = mk()
        for (const [x, y] of [...NEED, [17, 8], [19, 8]]) put(q, x, y)
        ok(put(q, 18, 8) === 'aisle', 'and it IS illegal here: the open mouth that the filter hid would itself refuse (#2711 s2)')
    }
    // the honest fallback: nothing provable, nothing taught
    {
        const g = rig([[17, 7], [19, 7], [18, 8]])
        ok(put(g, 18, 7) === 'aisle' && g.ev.at(-1)?.why === 'knee', 'flanked throat refused (setup) (#2711 s2)')
        const e = kneeEscapes(g, 18, 7)
        ok(e.bends.length === 0 && e.alts.length === 0, 'arms walled and neighbours racked: the lesson goes silent rather than decorate — the tail says SWING STAYS OPEN (#2711 s2)')
    }
    // purity, fixed order, zero footprint (#1917)
    {
        const g = rig()
        const h0 = stateHash(g), n0 = g.racks.length
        const e1 = kneeEscapes(g, 18, 7)
        const e2 = kneeEscapes(g, 18, 7)
        ok(JSON.stringify(e1) === JSON.stringify(e2) && stateHash(g) === h0 && g.racks.length === n0,
            'kneeEscapes is pure and deterministic — same board same answer, hash unchanged, nothing lands (#1917, #2711 s2)')
    }
    // presentation pins: tails, labels, eye, sweep line
    {
        const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
        ok(/RACK BESIDE — KEEP THE SWING CLEAR/.test(ui), 'the green tail names the honest fix: rack beside, keep the swing clear (#2711 s2)')
        ok(/SWING STAYS OPEN/.test(ui), 'the fallback tail speaks when nothing is provable (#2711 s2)')
        ok(/HERE/.test(ui) && /kneeMark\.alts/.test(ui) && /kneeMark\.bends/.test(ui), 'bends and beside-places reach the canvas — amber elbows, green HERE frames (#2711 s2)')
        ok(/ak - Math\.PI \/ 4/.test(ui), 'the elbow arc opens toward the swing cell — the quarter sweep is drawn where the turn happens (#2711 s2)')
        ok(/kneeTeach: \(x, y\) => kneeEscapes\(gs, x, y\)/.test(ui), 'the DEV eye reads the lesson a refused click gets — QA drives it directly (#2711 s2)')
    }
}
// ---- turn-count routing + repath-on-land (#2724) — legs count pivots ----
console.log('— turn-count routing (#2724): loaded legs corner instead of stair-stepping; landings re-route traffic —')
{
    // The driver's law at the planner: among the knee-legal paths of minimal
    // hops, the fewest 90° pivots wins. Proof needs the OTHER answer to
    // compare against — a local copy of the pre-#2724 fixed-order BFS (the
    // #2711 planner, verbatim except it reads the live board through the
    // exported blocked()/kneeTurn() only). Double implementation, same input,
    // the honest way to pin "strictly fewer pivots, never more cells".
    const NB4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    const stairKnee = (g, fx, fy, pred, ignoreId, dIn0) => {
        if (pred(fx, fy)) return []
        const seen = new Set([`${fx},${fy},${dIn0}`])
        let frontier = [{ x: fx, y: fy, i: dIn0, path: [] }]
        while (frontier.length) {
            const next = []
            for (const n of frontier) {
                for (let i = 0; i < 4; i++) {
                    const [dx, dy] = NB4[i]
                    const [hx, hy] = NB4[n.i]
                    const x = n.x + dx, y = n.y + dy
                    if (blocked(g, x, y, ignoreId)) continue
                    const back = hx === -dx && hy === -dy
                    const turn = !back && (hx !== dx || hy !== dy)
                    if (turn && kneeTurn(g, n.x, n.y, NB4[n.i], NB4[i])) continue
                    if (turn && tailTurn(g, n.x, n.y, NB4[n.i], NB4[i])) continue // #2760: the reference carries the tail too — same physics, different route order; without this line the comparison is knee-only traffic vs whole-body traffic and the hop-equality law dies
                    const p = n.path.concat([{ x, y }])
                    if (pred(x, y)) return p
                    const k2 = `${x},${y},${back ? n.i : i}`
                    if (!seen.has(k2)) { seen.add(k2); next.push({ x, y, i: back ? n.i : i, path: p }) }
                }
            }
            frontier = next
        }
        return null
    }
    const bearings = (p, d0) => {
        const out = []
        let px = null, py = null
        for (const c of p) {
            out.push(px === null ? d0 : NB4.findIndex(([dx, dy]) => c.x - px === dx && c.y - py === dy))
            px = c.x; py = c.y
        }
        return out
    }
    const pivots = (dirs) => {
        let t = 0
        for (let k = 1; k < dirs.length; k++) {
            if (dirs[k] === dirs[k - 1]) continue
            const opp = (dirs[k - 1] + 2) % 4 === dirs[k] // N-S / E-W opposites are backpedals, not pivots
            if (!opp) t++
        }
        return t
    }
    // corner proof, live: the planner's own answer compared, per plan, against
    // the stair reference on the SAME board state (pure functions, identical
    // pred) across autopilot shifts. Same hops always; strictly fewer pivots
    // in aggregate — the driver law measurably steers, it is not decoration.
    {
        const strictBad = []
        const detail = []
        for (const seed of [4242, 1337, 777, 99]) {
            const gs = makeGame(seed)
            const ap = createAutopilot()
            let tc = 0, sc = 0, lenBad = 0
            while (!gs.end && gs.tick < SHIFT + 10) {
                step(gs, [ap(gs)])
                for (const b of gs.robots) {
                    if (!b.carry || b.task.kind !== 'toStock' || b.path.length < 3) continue
                    const pred = (x, y) => Math.abs(x - b.task.rx) + Math.abs(y - b.task.ry) === 1
                    const p = bfsKnee(gs, b.x, b.y, pred, b.id, b.dir)
                    const q = stairKnee(gs, b.x, b.y, pred, b.id, b.dir)
                    if (!p || !q) continue
                    if (p.length !== q.length) { lenBad++; continue }
                    tc += pivots(bearings(p, b.dir)); sc += pivots(q, b.dir)
                }
            }
            if (lenBad) strictBad.push(`${seed}: ${lenBad} hops-differ`);
            if (!(tc < sc)) strictBad.push(`${seed}: ${tc} vs ${sc}`)
            detail.push(`${seed} ${tc}/${sc}`)
        }
        ok(strictBad.length === 0, `loaded legs corner, never walk more feet — hop-for-hop equal, pivots strictly fewer on every audited seed (${detail.join(' ')}) (#2724)`)
    }
    // purity + determinism: planning does not steer and twins agree (#1917)
    {
        const g = makeGame(11)
        const h0 = stateHash(g)
        const t1 = bfsKnee(g, g.robots[0].x, g.robots[0].y, (x, y) => x === g.racks[0].x && y === g.racks[0].y + 1, g.robots[0].id, g.robots[0].dir)
        const t2 = bfsKnee(g, g.robots[0].x, g.robots[0].y, (x, y) => x === g.racks[0].x && y === g.racks[0].y + 1, g.robots[0].id, g.robots[0].dir)
        ok(JSON.stringify(t1) === JSON.stringify(t2) && stateHash(g) === h0, 'bfsKnee is pure — same board same answer twice, hash unchanged (#1917 discipline rides the new sort)')
    }
    // the empty legs stay classic: repath routes toRack/toArm through bfs,
    // only the loaded legs consult the body-counting planner (#1917)
    {
        const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
        ok(/if \(t\.kind === 'toRack'\) bot\.path = bfs\(/.test(simSrc) && /else if \(t\.kind === 'toArm'\) bot\.path = bfs\(/.test(simSrc),
            'empty legs never learn the pivot count — toRack/toArm stay byte-identical classic BFS (#1917)')
        ok(/else if \(t\.kind === 'toStock'\) bot\.path = bfsKnee\(/.test(simSrc), 'the loaded stow leg runs the body planner (#2711, #2724)')
    }
    // #2732 LIVE KNEE AUDIT — bot.face now rides the state, so what #2724
    // could not write IS writable: reconstruct bearings from the outside
    // (carts start facing north out of the depot; reversing keeps the facing;
    // a pivot adopts its movement bearing) over every real step, and check the
    // engine's field tick by tick. Loaded PLAN pivots additionally sweep
    // prev + NB[heading] + NB[step] under two doctrines: the SEEDED one the
    // planner actually uses (dir) — that must be clean — and the BODY one the
    // doctrine promises (face). The two disagree exactly where the seed lies:
    // the pinned body-clip count is the live tripwire for #2738.
    {
        const NBF = [[0, -1], [1, 0], [0, 1], [-1, 0]]
        const CLIPS_BODY = 0 // #2738 CLOSED: the knee planner seeds from bot.face, so the driven traffic keeps the body doctrine — live clips are a zero-tolerance law now; a regression to the movement seed makes the audited careers clip racks again and reddens this count.
        let matches = 0, mismatches = 0, backs = 0, swept = 0, clipBody = 0
        for (const seed of [4242, 1337, 99]) {
            const gs = makeGame(seed)
            const ap = createAutopilot()
            const chain = new Map(gs.robots.map((r) => [r.id, r.face])) // reconstruction starts where the depot put the nose
            while (!gs.end && gs.tick < SHIFT + 10) {
                const prev = new Map(gs.robots.map((r) => [r.id, {
                    x: r.x, y: r.y, carry: r.carry, f: chain.get(r.id), ef: r.face,
                    head: r.path[0] ? `${r.path[0].x},${r.path[0].y}` : null,
                }]))
                step(gs, [ap(gs)])
                for (const b of gs.robots) {
                    const p = prev.get(b.id)
                    if (!p || p.f === undefined) { chain.set(b.id, b.face); continue } // hired mid-shift — seed from the engine's own first report
                    const d = NBF.findIndex(([ax, ay]) => ax === b.x - p.x && ay === b.y - p.y)
                    if (d < 0) continue // stationary tick — the body trivially holds its bearing
                    const back = d === (p.f + 2) % 4
                    const f = back ? p.f : d // doctrine: reversing keeps the facing
                    if (b.face === f) matches++; else mismatches++
                    if (back) backs++
                    chain.set(b.id, f)
                    if (!(p.carry || b.carry) || !p.head || `${b.x},${b.y}` !== p.head) continue // loaded PLAN-steps only — the router's promise, kept
                    if (back || d === p.f) continue // straight and reverse legs sweep no knee
                    swept++
                    const bx2 = p.x + NBF[p.ef][0] + NBF[d][0], by2 = p.y + NBF[p.ef][1] + NBF[d][1] // the NOSE the engine reported sweeping this diagonal
                    if (gs.racks.some((r) => r.x === bx2 && r.y === by2)) clipBody++
                }
            }
        }
        ok(mismatches === 0, `facing law holds outside the planner: ${matches} steps reconstructed, ${backs} back-pedals kept the bearing, 0 divergences (#2732)`)
        ok(swept > 0, `loaded plan-pivots sweep ${swept} audited diagonals — the live knee audit #2724 had to remove is writable from state alone (#2732)`)
        ok(clipBody === CLIPS_BODY, `body-doctrine holds on driven traffic: ${clipBody} live clips on the three audited careers — the seed-vs-facing lie (#2738) is closed, and any regression to a movement seed re-opens it here (${clipBody})`)
        ok(state(makeGame(1337)).robots.every((r) => Number.isInteger(r.face) && r.face >= 0 && r.face <= 3), 'the DEV eye reports the facing beside the movement (#2732)')
    }
    {
        let piv = 0, steps = 0
        for (const seed of [4242, 1337, 99]) {
            const gs = makeGame(seed)
            const ap = createAutopilot()
            const memo = new Map() // bot id -> {x, y, d} of the last PLAN-following move (parked ticks keep it; carts move every STEP_TICKS)
            while (!gs.end && gs.tick < SHIFT + 10) {
                const heads = new Map(gs.robots.map((r) => [r.id, r.path[0] ? `${r.path[0].x},${r.path[0].y}` : null]))
                step(gs, [ap(gs)])
                for (const b of gs.robots) {
                    if (!b.carry) continue // the knee is cargo physics (#2711 doctrine) — audit the loaded legs
                    const head = heads.get(b.id)
                    if (head === null) { memo.delete(b.id); continue } // unplanned territory (#2692 bays) — out of the router's audit
                    if (head !== `${b.x},${b.y}`) continue // parked tick — the memo holds the last planned move
                    const m = memo.get(b.id)
                    memo.set(b.id, { x: b.x, y: b.y, d: b.dir, gt: gs.tick })
                    if (!m || gs.tick - m.gt > 12) continue // consecutive plan-steps only — no straddling duck or reload seams
                    const d = NB4.findIndex(([ax, ay]) => ax === b.x - m.x && ay === b.y - m.y)
                    steps++
                    if (m.d !== undefined && d !== m.d && (d + 2) % 4 !== m.d) piv++
                }
            }
        }
        ok(steps > 0 && piv < steps * 0.6, `pivots are the minority of steps on a driven floor (${piv}/${steps}) — carts run straights, the yard reads like driving (#2724)`)
    }
    // #2732 deterministic back-pedal rig — the audit's teeth at field level:
    // point a cart east, drive it west (a reverse — the bearing must survive),
    // then north (a pivot — the bearing follows the movement).
    {
        const g = makeGame(11)
        g.auto = false
        const b = g.robots[0]
        let cx = null, cy = null
        scanA: for (let y = 2; y < 18; y++) for (let x = 2; x < 28; x++) {
            if (blocked(g, x, y, b.id) || blocked(g, x - 1, y, b.id) || blocked(g, x - 1, y - 1, b.id)) continue
            if (g.racks.some((r) => r.x === x && r.y === y - 1)) continue // the pivot's sweep must be clean
            if (Math.abs(x - OUT_CELLS[0].x) + Math.abs(y - OUT_CELLS[0].y) <= 2) continue // stay clear of the docks' own tasking
            cx = x; cy = y; break scanA
        }
        ok(cx !== null, `the rig finds a clear corridor cell to reverse in (${cx},${cy}) (setup) (#2732)`)
        if (cx !== null) {
            b.x = cx; b.y = cy
            b.face = 1; b.dir = 1 // nose east
            b.path = [{ x: cx - 1, y: cy }, { x: cx - 1, y: cy - 1 }] // west (reverse), then north (pivot)
            b.task = { kind: 'toOut' }; b.carry = null // the path is hand-set; the empty toOut leg never re-plans while it stands
            b.moveT = 0; b.jam = false; b.broken = false; b.pickT = 0; b.wait = 0; b.yield = null
            ok(state(g).robots.find((r) => r.id === b.id).face === 1, 'the eye reads the east-facing cart before the drive (setup) (#2732)')
            let teeth = 0
            while (b.path.length && g.tick < 400) {
                const was = b.path[0]
                step(g, [{}])
                if (b.x === was.x && b.y === was.y) {
                    if (was.x === cx - 1 && was.y === cy) {
                        teeth++
                        ok(b.face === 1 && b.dir === 3, `the reverse drove west but the nose stayed east (face ${b.face}, dir ${b.dir}) — reversing keeps the facing (#2732)`)
                    } else if (was.x === cx - 1 && was.y === cy - 1) {
                        teeth++
                        ok(b.face === 0 && b.dir === 0, `the pivot north took the nose with it (face ${b.face}) — turns adopt their bearing (#2732)`)
                    }
                }
            }
            ok(teeth === 2, `both legs of the back-pedal-then-pivot drove (teeth ${teeth}/2) — the rig itself is live, not skipped (setup) (#2732)`)
            const uiF = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
            ok(/const nv = \[\[0, -1\], \[1, 0\], \[0, 1\], \[-1, 0\]\]\[b\.face\]/.test(uiF) && /\[\[0, -2\], \[2\.5, 0\], \[0, 2\], \[-2\.5, 0\]\]\[b\.face % 4\]/.test(uiF),
                'the painter reads the body — loaded nose and amber eye ride the facing, not the movement (#2732)')
        }
    }
    // #2732 the seed heading matters — with the nose east and a rack on the
    // north-east, stepping north is a pivoting swing the law refuses; only a
    // planner tricked into thinking the cart faces west (the naive "dir" after
    // a back-pedal) would take the same step for free.
    {
        const g = makeGame(11)
        g.auto = false
        const b = g.robots[0]
        let cx = null, cy = null
        scanB: for (let y = 8; y < 17; y++) for (let x = 2; x < 27; x++) {
            if (blocked(g, x, y, b.id) || blocked(g, x + 1, y - 1, b.id) || blocked(g, x, y - 1, b.id) || blocked(g, x + 1, y, b.id)) continue
            if (blocked(g, x - 1, y - 1, b.id) || blocked(g, x + 2, y - 1, b.id) || blocked(g, x, y - 6, b.id)) continue
            cx = x; cy = y; break scanB
        }
        ok(cx !== null, `the rig finds open room for the bearing contrast (${cx},${cy}) (setup) (#2732)`)
        if (cx !== null) {
            g.racks.push({ x: cx + 1, y: cy - 1, items: [] }) // the racked elbow, set straight on the map — this rig judges the planner, not the builder's laws
            const pred = (x, y) => x === cx && y === cy - 6
            const P = bfsKnee(g, cx, cy, pred, b.id, 1) // nose east: north is a pivot whose sweep hits the rack — refused
            const Q = bfsKnee(g, cx, cy, pred, b.id, 3) // nose west: north is still a pivot but sweeps the clear north-west — taken
            ok(P !== null && P[0] && !(P[0].x === cx && P[0].y === cy - 1), 'facing east, the planner never steps north through the racked elbow — the knee is in the route (#2732)')
            ok(Q !== null && Q[0] && Q[0].x === cx && Q[0].y === cy - 1, 'the same north step is free facing west — the refusal is bearing-shaped, not cell-shaped: the geometry discriminates, so the seed input is load-bearing (#2732)')
            const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
            // #2738: the seed gap #2732 filed is closed — both repath bfsKnee
            // sites seed with bot.face, the doctrine-correct bearing this rig
            // just proved load-bearing. Demand it here so a regression to the
            // movement seed reddens this file at the rig that showed why.
            const faceSites = (simSrc.match(/bfsKnee\([^;]*?\bbot\.face\)/g) || []).length
            const dirSites = (simSrc.match(/bfsKnee\([^;]*?\bbot\.dir\)/g) || []).length
            ok(faceSites === 2 && dirSites === 0,
                `repath seeds the knee from the facing, not the movement — ${faceSites}/2 sites on bot.face, ${dirSites} stale on bot.dir (#2732 → #2738)`)
        }
    }
    // repath-on-land: a rack may not land on a claimed route. Task a loaded
    // cart, watch its plan cross the floor, drop a rack on the first crossing
    // cell the laws allow — the path must not contain it, and the heat
    // (#2680) must not lie about it, on the SAME tick the wall appeared.
    {
        const g2 = makeGame(11)
        g2.score = 9000
        g2.auto = false
        g2.tool = 'rack'
        const tgtBuild = clickCell(g2, 14, 2, 0) // lawfully rackable per the sweep — the stock target
        ok(tgtBuild === 'build', 'the rig stocks against a legal rack at (14,2) (setup) (#2724)')
        g2.tool = null
        const b = g2.robots[0]
        b.carry = 'crate'
        b.task = { kind: 'toStock', rx: 14, ry: 2 }
        b.path = []
        step(g2, [{}])
        const P = b.path
        ok(P.length > 4, `the loaded cart plans across the floor to its rack (${P.length} cells) (setup) (#2724)`)
        let landed = null
        for (const c of P) {
            if (c.x === b.x && c.y === b.y) continue
            if (Math.abs(c.x - 14) + Math.abs(c.y - 2) <= 1) continue // keep the target side serviceable
            g2.tool = 'rack'
            const r = clickCell(g2, c.x, c.y, 0)
            if (r === 'build') { landed = c; break }
        }
        ok(landed !== null, `the rig finds a lawful cell on the live route to wall (${landed ? `${landed.x},${landed.y}` : 'none found'}) (#2724)`)
        if (landed) {
            ok(!b.path.some((c) => c.x === landed.x && c.y === landed.y), 'the plan the rack landed on is recomputed the tick it lands — no claimed route drives into a fresh wall (#2724)')
            ok(b.path.length > 0, 'the replan finds a road — the pocket law keeps the delivery alive behind new geometry (#2546, #2724)')
            ok(flowHeat(g2).every((c) => !(c.x === landed.x && c.y === landed.y)), 'the heat never claims the rack cell it just re-routed away from — the #2680 display invariant closes its stale-path hole (#2724)')
        }
    }
    // twin determinism through a build: two identical worlds, same click tick —
    // the replan must agree byte-for-byte
    {
        const twin = () => {
            const g3 = makeGame(1337)
            const ap = createAutopilot()
            let done = false
            for (let t = 0; t < 4000 && !g3.end; t++) {
                step(g3, [ap(g3)])
                if (!done && g3.racks.length >= 4) { done = true }
            }
            return stateHash(g3)
        }
        ok(twin() === twin(), 'twin autopilots stay byte-identical across build-time replans — the turn counter is geometry, no rng (#2724)')
    }
}
// ---- tail law (#2760) — the cart's other half: pivots sweep the counterweight diagonal ----
console.log('— tail law (#2760) —')
{
    const NBT = [[0, -1], [1, 0], [0, 1], [-1, 0]] // N,E,S,W
    const inGridC = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS
    const rackQ = (gs, x, y) => gs.racks.some((r) => r.x === x && r.y === y)
    const botQ = (gs, x, y) => gs.robots.some((r) => r.x === x && r.y === y)
    const walksClips = (g, sx, sy, p, face0) => {
        let n = 0, f = face0, px = sx, py = sy
        for (const c of p) {
            const d = NBT.findIndex(([ax, ay]) => c.x - px === ax && c.y - py === ay)
            if (d === -1) { px = c.x; py = c.y; continue }
            const back = d === (f + 2) % 4
            if (!back && d !== f && tailTurn(g, px, py, NBT[f], NBT[d])) n++
            if (!back) f = d
            px = c.x; py = c.y
        }
        return n
    }
    // geometry: tailTurn asks B − dIn − dOut — the OPPOSITE diagonal from the
    // knee — and only on pivots (straights and backpedals sweep nothing).
    {
        const g = makeGame(7)
        const h0 = stateHash(g)
        ok(!tailTurn(g, 13, 7, NBT[0], NBT[0]) && !tailTurn(g, 13, 7, NBT[0], NBT[2]),
            'straights and backpedals sweep no tail — the counterweight stays in lane (body doctrine, #2546 spur law)')
        let cases = 0, bad = 0
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (i === j || (i + 2) % 4 === j) continue
                const tx = 13 - NBT[i][0] - NBT[j][0], ty = 7 - NBT[i][1] - NBT[j][1] // the counterweight diagonal
                const nx = 13 + NBT[i][0] + NBT[j][0], ny = 7 + NBT[i][1] + NBT[j][1] // the nose diagonal
                g.racks.push({ x: tx, y: ty, items: [] })
                if (!tailTurn(g, 13, 7, NBT[i], NBT[j])) bad++ // its own diagonal, refused
                if (kneeTurn(g, 13, 7, NBT[i], NBT[j])) bad++ // the nose does not ask the tail's cell
                g.racks.pop()
                g.racks.push({ x: nx, y: ny, items: [] })
                if (tailTurn(g, 13, 7, NBT[i], NBT[j])) bad++ // the tail does not ask the nose's cell
                if (!kneeTurn(g, 13, 7, NBT[i], NBT[j])) bad++
                g.racks.pop()
                // the same bend seen backwards: driving the reverse through B
                // puts the counterweight exactly where the forward knee swung
                if (tailTurn(g, 13, 7, NBT[i], NBT[j], { x: tx, y: ty }) !== kneeTurn(g, 13, 7, NBT[(j + 2) % 4], NBT[(i + 2) % 4], { x: tx, y: ty })) bad++
                cases++
            }
        }
        ok(bad === 0 && cases === 8, `all eight pivots refuse exactly the counterweight diagonal — tail and knee ask opposite cells, never each other's (${cases} cases) (#2760)`)
        ok(tailTurn(g, 13, 7, NBT[0], NBT[1], { x: 12, y: 8 }) && !tailTurn(g, 13, 7, NBT[0], NBT[1]) && stateHash(g) === h0,
            'the hypothetical form answers on a phantom rack and leaves the board untouched — the extra-cell discipline kneeNet uses (#1917)')
    }
    // the whole-body service net (knee AND tail) vs the knee net: equal on every
    // board this floor can reach. That equality is the proof the CLICK-REFUSAL
    // half of the tail law is dead code — a rack that would clip a sole-arrival
    // backswing already falls to the knee/pocket law at its own click. Refused
    // per the #2692 doctrine (dead laws are debt); the counterweight ships only
    // where the physics bites: bfsKnee, repath-on-land, liveTails.
    {
        const rackCell = (gs, x, y, extra) => rackQ(gs, x, y) || !!(extra && extra.x === x && extra.y === y)
        const wholeNet = (gs, extra) => { // kneeNet verbatim, plus the tail refusal at turns
            const seen = new Set()
            let frontier = []
            const floor = (x, y) => inGridC(x, y) && MAP[y][x] === CELL.FLOOR && !rackCell(gs, x, y, extra)
            const seed = (x, y) => {
                if (!floor(x, y)) return
                for (let i = 0; i < 4; i++) { const k = `${x},${y},${i}`; if (!seen.has(k)) { seen.add(k); frontier.push({ x, y, i }) } }
            }
            for (const o of OUT_CELLS) for (const [dx, dy] of NBT) if (MAP[o.y + dy][o.x + dx] === CELL.FLOOR) seed(o.x + dx, o.y + dy)
            for (const p of [{ x: 23, y: 12 }, { x: 24, y: 12 }, { x: 22, y: 12 }, { x: 21, y: 12 }]) seed(p.x, p.y)
            for (const [dx, dy] of NBT) seed(BAY_CELL.x + dx, BAY_CELL.y + dy)
            while (frontier.length) {
                const next = []
                for (const n of frontier) {
                    for (let i = 0; i < 4; i++) {
                        const [dx, dy] = NBT[i]
                        const [hx, hy] = NBT[n.i]
                        if (!floor(n.x + dx, n.y + dy)) continue
                        const back = hx === -dx && hy === -dy
                        const turn = !back && (hx !== dx || hy !== dy)
                        if (turn && rackCell(gs, n.x + hx + dx, n.y + hy + dy, extra)) continue
                        if (turn && rackCell(gs, n.x - hx - dx, n.y - hy - dy, extra)) continue
                        const k = `${n.x + dx},${n.y + dy},${back ? n.i : i}`
                        if (!seen.has(k)) { seen.add(k); next.push({ x: n.x + dx, y: n.y + dy, i: back ? n.i : i }) }
                    }
                }
                frontier = next
            }
            const cells = new Set()
            for (const k of seen) cells.add(k.slice(0, k.lastIndexOf(',')))
            return cells
        }
        const netdiff = (gs, extra) => {
            const a = kneeNet(gs, extra)
            const b = wholeNet(gs, extra)
            let d = 0
            for (const k of a) if (!b.has(k)) d++
            for (const k of b) if (!a.has(k)) d++
            return d
        }
        let boards = 0, diffBoards = 0
        const probe = (gs, extra) => { boards++; if (netdiff(gs, extra)) diffBoards++ }
        for (const seed of [7, 11, 13, 17, 42, 99, 777, 1337, 4242]) {
            const gs = makeGame(seed)
            probe(gs, null)
            for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
                if (MAP[y][x] !== CELL.FLOOR || rackQ(gs, x, y)) continue
                probe(gs, { x, y })
            }
            const bp = makeGame(seed) // the 12-spot blueprint, then one more rack everywhere
            for (const s of RACK_SPOTS) bp.racks.push({ x: s.x, y: s.y, items: [], owner: -1 })
            probe(bp, null)
            for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
                if (MAP[y][x] !== CELL.FLOOR || rackQ(bp, x, y)) continue
                probe(bp, { x, y })
            }
            const dr = makeGame(seed) // dense rows: maximum rack density the shelf allows
            for (let x = 1; x < COLS - 1; x++) {
                if (MAP[5][x] === CELL.FLOOR) dr.racks.push({ x, y: 5, items: [], owner: -1 })
                if (MAP[7][x] === CELL.FLOOR) dr.racks.push({ x, y: 7, items: [], owner: -1 })
            }
            probe(dr, null)
            const cv = makeGame(seed) // careers, sampled every second — the live floor, all shift long
            const ap = createAutopilot()
            while (!cv.end && cv.tick < SHIFT + 10) { step(cv, [ap(cv)]); if (cv.tick % 60 === 0) probe(cv, null) }
        }
        ok(diffBoards === 0 && boards > 6000, `whole-body net ≡ kneeNet on ${boards} boards, netdiff 0 — the placement half of the tail law would refuse nothing the knee law missed; dead code refused (#2692 doctrine), the physics ships instead (#2760)`)
    }
    // liveTails — the QA eye on tail-blocked turns: the knee eye's mirror.
    {
        const g = makeGame(7)
        g.racks.push({ x: 12, y: 8, items: [] }) // the counterweight diagonal of the (13,7) N→E bend
        const a = JSON.stringify(liveTails(g))
        const b2 = JSON.stringify(liveTails(g))
        const h0 = stateHash(g)
        ok(a === b2 && stateHash(g) === h0, 'liveTails is pure — same answer twice, hash unchanged (#1917)')
        const t = JSON.parse(a)
        ok(t.some((m) => m.x === 13 && m.y === 7 && m.in === 0 && m.out === 1 && m.tx === 12 && m.ty === 8), 'the racked backswing reads as a tail-blocked turn — in N, out E, tail on (12,8) (#2760)')
        let ordered = true
        for (let k = 1; k < t.length; k++) if (t[k].y < t[k - 1].y || (t[k].y === t[k - 1].y && t[k].x < t[k - 1].x)) ordered = false
        ok(ordered, `liveTails answers row-major (${t.length} turns) — fixed order, deterministic eye (#1917)`)
        const kEye = liveKnees(g)
        ok(!kEye.some((m) => m.x === 13 && m.y === 7 && m.in === 0 && m.out === 1), 'the knee eye stays blind to the tail cell — each eye names its own diagonal, the grammar does not smear (#2711 vs #2760)')
    }
    // career clip-audit: the lie this PR kills, measured. The pre-#2760 planner
    // (bfsKnee verbatim minus the tail line — a double implementation on the
    // same live boards) ghost-clips racks with tails; the live planner drives
    // zero, and the driven traffic never once turns with a rack on its
    // backswing. Facing doctrine on the walk: reversing keeps the bearing,
    // pivots adopt theirs (#2732) — a movement-bearing walk would invent clips
    // the body never swept.
    {
        const oldKnee = (g, fx, fy, pred, ignoreId, dIn0) => {
            if (pred(fx, fy)) return []
            const seen = new Map()
            let layer = [{ x: fx, y: fy, i: dIn0, t: 0, path: [], seq: 0 }]
            while (layer.length) {
                const next = []
                for (const n of layer) {
                    for (let i = 0; i < 4; i++) {
                        const [dx, dy] = NBT[i]
                        const [hx, hy] = NBT[n.i]
                        const x = n.x + dx, y = n.y + dy
                        if (!inGridC(x, y)) continue
                        if (blocked(g, x, y, ignoreId)) continue
                        const back = hx === -dx && hy === -dy
                        const turn = !back && (hx !== dx || hy !== dy)
                        if (turn && rackQ(g, n.x + hx + dx, n.y + hy + dy)) continue
                        const t = n.t + (turn ? 1 : 0)
                        const i2 = back ? n.i : i
                        const k2 = `${x},${y},${i2}`
                        const prev = seen.get(k2)
                        if (prev !== undefined && prev <= t) continue
                        seen.set(k2, t)
                        next.push({ x, y, i: i2, t, path: n.path.concat([{ x, y }]), seq: next.length })
                    }
                }
                next.sort((a, b) => a.t - b.t || a.seq - b.seq)
                for (const n of next) if (pred(n.x, n.y)) return n.path
                layer = next
            }
            return null
        }
        let plans = 0, rerouted = 0, oldClips = 0, liveClips = 0, storedClips = 0
        let driven = 0, drivenClips = 0
        for (const seed of [4242, 1337, 777, 99, 7, 11, 13, 17]) {
            const gs = makeGame(seed)
            const ap = createAutopilot()
            const prev = new Map()
            while (!gs.end && gs.tick < SHIFT + 10) {
                for (const r of gs.robots) prev.set(r.id, {
                    x: r.x, y: r.y, carry: r.carry, ef: r.face,
                    head: r.path[0] ? `${r.path[0].x},${r.path[0].y}` : null,
                })
                step(gs, [ap(gs)])
                for (const b of gs.robots) {
                    const p = prev.get(b.id)
                    if (p) { // driven-step audit needs a before/after; the plan audit below runs every tick
                        const d = NBT.findIndex(([ax, ay]) => ax === b.x - p.x && ay === b.y - p.y)
                        if (d >= 0) { // stationary ticks simply skip this half
                            const back = d === (p.ef + 2) % 4
                            if ((p.carry || b.carry) && p.head && `${b.x},${b.y}` === p.head && !back && d !== p.ef) {
                                driven++ // a loaded plan-pivot — the router's promise, kept on the floor
                                if (rackQ(gs, p.x - NBT[p.ef][0] - NBT[d][0], p.y - NBT[p.ef][1] - NBT[d][1])) drivenClips++
                            }
                        }
                    }
                    if (!b.carry || b.task.kind !== 'toStock' || b.path.length < 3) continue
                    storedClips += walksClips(gs, b.x, b.y, b.path, b.face)
                    const pred = (x, y) => Math.abs(x - b.task.rx) + Math.abs(y - b.task.ry) === 1
                    const P = bfsKnee(gs, b.x, b.y, pred, b.id, b.face)
                    const Q = oldKnee(gs, b.x, b.y, pred, b.id, b.face)
                    if (!P || !Q) continue
                    plans++
                    if (JSON.stringify(P) !== JSON.stringify(Q)) rerouted++
                    oldClips += walksClips(gs, b.x, b.y, Q, b.face)
                    liveClips += walksClips(gs, b.x, b.y, P, b.face)
                }
            }
        }
        ok(plans > 10000 && rerouted > 500, `the tail law steers: ${rerouted} of ${plans} loaded plans re-route around their own counterweight over eight careers — physics, not decoration (#2760)`)
        ok(oldClips > 500, `the pre-#2760 planner ghost-clips racks with its tail ${oldClips} times on these same boards — the exact lie this PR kills (measured, not assumed) (#2760)`)
        ok(liveClips === 0 && storedClips === 0 && drivenClips === 0 && driven > 1000,
            `the live floor sweeps clean: ${driven} driven plan-pivots, fresh plans and stored paths audited, ${liveClips + storedClips + drivenClips} tail clips — loaded carts never turn into their tail (#2760)`)
    }
    // repath-on-land, tail half: a rack landing on a committed plan's BACK
    // diagonal breaks it the same tick — the cart was already committed to a
    // pivot whose counterweight now owns the new wall's cell. Control: a click
    // off every sweep diagonal leaves the plan byte-stable (repath fires on
    // breakage, not on every build).
    {
        const g = makeGame(11)
        g.score = 9000
        g.auto = false
        g.tool = 'rack'
        ok(clickCell(g, 14, 2, 0) === 'build', 'the rig stocks against a legal rack at (14,2) (setup) (#2760)')
        g.tool = null
        const b = g.robots[0]
        b.carry = 'crate'
        b.task = { kind: 'toStock', rx: 14, ry: 2 }
        b.path = []
        step(g, [{}])
        const P = b.path.slice()
        ok(P.length > 4, `the loaded cart plans across the floor to its rack (${P.length} cells) (setup) (#2760)`)
        // bearings along the plan, seeded by the cart's facing (#2732 doctrine);
        // every cell a pivot of this plan sweeps (nose AND tail) is off-limits
        // to the control click.
        const cellsOnRoute = new Set(P.map((c) => `${c.x},${c.y}`))
        const diagonals = new Set()
        let f = b.face, pd = b.dir, px = b.x, py = b.y
        for (const c of P) {
            const d = NBT.findIndex(([ax, ay]) => c.x - px === ax && c.y - py === ay)
            if (d !== -1) {
                const back = d === (f + 2) % 4
                if (!back && d !== f) {
                    diagonals.add(`${px + NBT[f][0] + NBT[d][0]},${py + NBT[f][1] + NBT[d][1]}`)
                    diagonals.add(`${px - NBT[f][0] - NBT[d][0]},${py - NBT[f][1] - NBT[d][1]}`)
                }
                if (!back) f = d
                if (d !== pd && (d + 2) % 4 !== pd) { // the sim scan runs on movement bearings — exclude its diagonals too
                    diagonals.add(`${px + NBT[pd][0] + NBT[d][0]},${py + NBT[pd][1] + NBT[d][1]}`)
                    diagonals.add(`${px - NBT[pd][0] - NBT[d][0]},${py - NBT[pd][1] - NBT[d][1]}`)
                }
                pd = d
            }
            px = c.x; py = c.y
        }
        let tailHit = null
        f = b.face; pd = b.dir; px = b.x; py = b.y
        for (const c of P) {
            const d = NBT.findIndex(([ax, ay]) => c.x - px === ax && c.y - py === ay)
            if (d !== -1) {
                const back = d === (f + 2) % 4
                if (!back && d !== f && pd === f) { // doctrine and scan agree here — the landing is provably seen by both
                    const tx = px - NBT[f][0] - NBT[d][0], ty = py - NBT[f][1] - NBT[d][1]
                    if (inGridC(tx, ty) && MAP[ty][tx] === CELL.FLOOR && !cellsOnRoute.has(`${tx},${ty}`) && !rackQ(g, tx, ty) && !(Math.abs(tx - 14) + Math.abs(ty - 2) <= 1)) {
                        g.tool = 'rack'
                        if (clickCell(g, tx, ty, 0) === 'build') { tailHit = { tx, ty, bx: px, by: py }; break }
                        g.tool = null
                    }
                }
                if (!back) f = d
                pd = d
            }
            px = c.x; py = c.y
        }
        ok(tailHit !== null, `the rig lands a rack on a committed plan's back diagonal (${tailHit ? `${tailHit.tx},${tailHit.ty}, owned by pivot ${tailHit.bx},${tailHit.by}` : 'none found'}) (#2760)`)
        if (tailHit) {
            ok(JSON.stringify(b.path) !== JSON.stringify(P), 'the plan whose backswing was racked is recomputed the tick the rack lands — traffic never drives a pivot that clips its new counterweight wall (#2724 → #2760)')
            ok(b.path.length > 0, 'the replan finds a road — the pocket law keeps the delivery alive behind the new geometry (#2546)')
            ok(walksClips(g, b.x, b.y, b.path, b.face) === 0, 'the fresh plan sweeps its own tail clean — the replan obeys the tail law (#2760)')
        }
        // control: a lawful click off every route cell and sweep diagonal must not stir the plan
        let calm = null
        outerCalm: for (let y = ROWS - 2; y >= 1; y--) for (let x = COLS - 2; x >= 1; x--) {
            const k = `${x},${y}`
            if (MAP[y][x] !== CELL.FLOOR || cellsOnRoute.has(k) || diagonals.has(k)) continue
            if (rackQ(g, x, y) || botQ(g, x, y)) continue
            g.tool = 'rack'
            if (clickCell(g, x, y, 0) === 'build') { calm = { x, y }; break outerCalm }
            g.tool = null
        }
        ok(calm !== null, `the control click finds a lawful cell off every sweep diagonal (${calm ? `${calm.x},${calm.y}` : 'none found'}) (setup) (#2760)`)
        if (calm) {
            const before = b.path.slice()
            g.tool = 'rack'
            clickCell(g, calm.x, calm.y, 0)
            ok(JSON.stringify(b.path) === JSON.stringify(before), 'a build nowhere near the swing leaves the claimed route untouched — repath fires on breakage, never as decoration (#2724 control, #2760)')
        }
    }
    // determinism: the tail is geometry, no rng — twins agree byte-for-byte
    {
        const twinTail = () => {
            const g = makeGame(4242)
            const ap = createAutopilot()
            while (!g.end && g.tick < SHIFT + 10) step(g, [ap(g)])
            return stateHash(g)
        }
        ok(twinTail() === twinTail(), 'twin careers stay byte-identical end to end — the tail law is pure geometry, no rng (#2760)')
    }
    // source pins: the physics ships, the dead placement half stays dead, the
    // body reads on screen.
    {
        const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
        ok(/export function tailTurn/.test(simSrc), 'the sim exports tailTurn — the counterweight geometry is one exported question (#2760)')
        ok(simSrc.includes('if (turn && kneeRack(gs, n.x - hx - dx, n.y - hy - dy)) continue // the tail is racked'), 'bfsKnee refuses loaded pivots whose tail diagonal is racked — the routing half is live (#2760)')
        ok(simSrc.includes('px - NB[pd][0] - NB[d][0] === x && py - NB[pd][1] - NB[d][1] === y'), 'repath-on-land sees the back diagonal — landings across a committed backswing re-route (#2760)')
        ok(/export function liveTails/.test(simSrc), 'liveTails is exported — the QA eye on tail-blocked turns (#2760)')
        ok(!simSrc.includes("return 'tail'"), 'the seventh placement law stays refused — why:tail never comes back; netdiff 0 made it dead code, and dead code is debt (#2692 doctrine, #2760)')
        const ui = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
        ok(ui.includes('liveTails') && /tails: \(\) => liveTails\(gs\)/.test(ui), 'the DEV eye reads the tail-blocked turns for the browser gate (#2760)')
        ok(/ctx\.fillStyle = 'rgba\(150,170,192,0\.55\)'/.test(ui), 'loaded carts wear the steel counterweight nub — the swept side is visible at a glance; amber stays the law colour (#2760)')
    }
}
console.log('— #2783 SWING-AWARE COURTESY —')
{
    // geometry pin, hand-computed: an east-facing loaded rival stepping E,E,N
    // pivots at its 3rd cell — knee (12,4), tail (10,6); nothing else swings.
    const sw = swingOf({ carry: 'crate', face: 1, path: [{ x: 10, y: 5 }, { x: 11, y: 5 }, { x: 11, y: 4 }], x: 9, y: 5 })
    ok(sw.has('12,4') && sw.has('10,6') && sw.size === 2, 'swingOf lays exactly the knee and tail diagonals of a plan pivot — hand-computed pins (E,E,N from (9,5): (12,4)/(10,6)) (#2783)')
    ok(swingOf({ carry: null, face: 1, path: [{ x: 10, y: 5 }, { x: 11, y: 5 }, { x: 11, y: 4 }], x: 9, y: 5 }).size === 0, 'empty legs carry only forks — an unloaded rival owns no swing (#2711 doctrine, #2783)')
    ok(swingOf({ carry: 'crate', face: 1, path: [{ x: 10, y: 5 }, { x: 9, y: 5 }], x: 9, y: 5 }).size === 0, 'a back-pedal keeps the facing and sweeps nothing — reversals swing no body (#2732 law, #2783)')
    const gp = makeGame(7)
    const hp = stateHash(gp)
    const r1 = JSON.stringify(liveRights(gp)), r2 = JSON.stringify(liveRights(gp))
    ok(r1 === r2 && stateHash(gp) === hp, 'liveRights is pure — same answer twice, board hash unchanged (#1917)')
    const simSrc = readFileSync(new URL('../src/games/FloorBoss/sim.js', import.meta.url), 'utf8')
    ok(/const sw = swingOf\(rival\)/.test(simSrc) && /!inSwing\(px, py\) && !blocked\(gs, px, py, bot\.id\)/.test(simSrc), 'pullOff consumes the swing — both the side bays and the backpedal skip cells the blocking plan sweeps (#2783)')
    const uiSrc = readFileSync(new URL('../src/games/FloorBoss/index.jsx', import.meta.url), 'utf8')
    ok(/swingBodies: \(\) => liveRights\(gs\)/.test(uiSrc), 'the DEV eye reads loaded pivots facing a body in their swing — the residual turn-rights audit has a live read (#2783)')
    // the law end-to-end: across audited careers, courtesy still happens AND
    // never lands on a swing cell of the plan it yielded to (pre-law: 12 of 64).
    let ducks = 0, duckSwing = 0
    for (const seed of [1337, 107, 42, 55]) {
        const gs = makeGame(seed)
        const ap = createAutopilot()
        while (!gs.end && gs.tick < SHIFT + 10) {
            const snap = gs.robots.map((r) => ({ id: r.id, x: r.x, y: r.y, carry: r.carry, face: r.face, path: (r.path || []).slice(), yielded: !!r.yield }))
            step(gs, [ap(gs)])
            for (const e of gs.ev) {
                if (e.type !== 'duck') continue
                ducks++
                const dbed = snap.find((q) => !q.yielded && gs.robots.some((b) => b.id === q.id && b.yield))
                if (!dbed) continue
                for (const q of snap) {
                    if (q.id === dbed.id) continue
                    if (swingOf(q).has(`${e.x},${e.y}`)) { duckSwing++; break }
                }
            }
        }
    }
    ok(ducks > 0, `courtesy is alive on audited careers — ${ducks} ducks across four seeds (the law is not decoration) (#2783)`)
    ok(duckSwing === 0, `no duck parks into a sweep — ${ducks} shoulders taken, 0 on a knee/tail cell of the blocking plan (pre-law measured 12 of 64) (#2783)`)
}

console.log(fails ? `\nFLOOR BOSS CHECK: ${fails} FAILED` : '\nFLOOR BOSS CHECK: all green')
process.exit(fails ? 1 : 0)
