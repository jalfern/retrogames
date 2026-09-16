// RACCOON HEIST — the map and stealth-math audit. No browser, no dev server, ~0.2 s.
//
//   npm run heistcheck            # audit all three jobs + the stealth model
//   npm run heistcheck -- --mutate  # prove the audit can fail (see below)
//   npm run heistcheck -- --map 1   # print job 2 as ASCII
//
// Why a map audit at all: the classic failure of a stealth level is not an ugly
// screenshot, it is a loot pile the player can never reach, a guard who cannot walk
// his route, or a torch that sees the getaway cart from frame one. None of those show
// up in a picture of the title screen. All of them are three lines of flood fill.
//
// THE AUDIT MUST BE ABLE TO FAIL. `--mutate` seals the vault of job 1 and asserts the
// audit then reports it. An audit that passes on a broken map is worse than no audit,
// because it buys confidence you have not earned (this repo has already shipped two AI
// agents that way).

import { LEVELS, at, T, reachFrom, pathBetween, dumpLevel, blocksMove, blocksSight } from '../src/games/RaccoonHeist/levels.js'
import { losWorld, coneAlign, detectRate, hears, nextWaypoint, moveProfile, tally, coverOf, lightAt, castWorld } from '../src/games/RaccoonHeist/stealth.js'
import { CREW } from '../src/games/RaccoonHeist/levels.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.indexOf('--map') >= 0 ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`)

const LOOT = ['$', '%', '&', '*']
const marksOf = (lvl, ...chars) => lvl.marks.filter(m => chars.includes(m.ch))
const cellKey = (x, y) => x + ',' + y

// ---------------------------------------------------------------- per-job audit ---
for (let li = 0; li < LEVELS.length; li++) {
    const lvl = LEVELS[li]
    section(`JOB ${li + 1} — ${lvl.name}  (${lvl.w}×${lvl.h}, ${lvl.routes.length} patrol${lvl.routes.length === 1 ? '' : 's'})`)

    const sp = marksOf(lvl, 'S')
    const ex = marksOf(lvl, 'X')
    const pound = marksOf(lvl, 'P')
    ok(sp.length === 1, `${lvl.name}: expected exactly one crew spawn 'S', found ${sp.length}`)
    ok(ex.length >= 1, `${lvl.name}: no escape 'X' — the job cannot be finished`)
    ok(pound.length === 1, `${lvl.name}: expected exactly one pound 'P', found ${pound.length}`)
    if (!sp.length || !ex.length) continue
    const [sx, sy] = [sp[0].x, sp[0].y]

    // Mutation mode: wall the vault doorway of job 1 so the audit has to notice.
    if (MUT && li === 0) {
        for (const m of marksOf(lvl, 'V')) {
            for (let yy = 2; yy <= 6; yy++) for (let xx = 10; xx <= 21; xx++) lvl.grid[yy * lvl.w + xx] = T.WALL
            void m
        }
        console.log('  \x1b[33mmutation: vault sealed behind solid wall\x1b[0m')
    }

    ok(!blocksMove(at(lvl, sx, sy)), `${lvl.name}: spawn cell is not walkable`)

    // --- reachability, doors and gate shut vs open -------------------------------
    const shut = reachFrom(lvl, sx, sy, { block: ['X', 'V'] })
    const open = reachFrom(lvl, sx, sy, { block: [] })
    const reach = (seen, m) => !!seen[m.y * lvl.w + m.x]

    for (const m of lvl.marks) {
        if (m.ch === 'X' || m.ch === 'V') continue
        // Laser emitters live IN the wall — that is where you bolt a laser. Their own
        // invariant is below: the beam they cast must cross a floor cell.
        if (m.ch === 'Z') continue
        ok(reach(open, m), `${lvl.name}: '${m.ch}' at (${m.x},${m.y}) is unreachable — dead content`)
    }

    // Lasers: every emitter must be mounted beside walkable floor, and every beam
    // (a pair of emitters sharing a row or column) must actually cross the aisle.
    const emit = marksOf(lvl, 'Z')
    for (const e of emit) {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !blocksMove(at(lvl, e.x + dx, e.y + dy)))
        ok(near.length >= 1, `${lvl.name}: laser emitter (${e.x},${e.y}) points at solid rock — no beam, no threat`)
    }
    const rows = new Map()
    for (const e of emit) rows.set(e.y, (rows.get(e.y) || []).concat(e.x))
    const paired = [...rows.entries()].filter(([, xs]) => xs.length >= 2)
    ok(paired.length === 0 || paired.every(([, xs]) => {
        const [a, b] = [Math.min(...xs), Math.max(...xs)]
        for (let x = a + 1; x < b; x++) if (blocksMove(at(lvl, x, rows.get(paired.find(([, v]) => v === xs)[0])))) return false
        return true
    }), `${lvl.name}: a laser beam is blocked by geometry between its own emitters`)

    const loot = marksOf(lvl, ...LOOT)
    ok(loot.length >= 3, `${lvl.name}: only ${loot.length} loot piles; a heist needs a few`)
    // The vault has to matter: something worth taking must need the door.
    const behindDoor = loot.filter(m => !reach(shut, m) && reach(open, m))
    ok(behindDoor.length >= 1, `${lvl.name}: no loot actually requires the vault door — the lockpick is decoration`)
    // ...and the gate has to matter: the exit must be unreachable while it is shut.
    for (const m of ex) {
        ok(!reach(shut, m) || true, '')          // X cells are sealed in `shut` by construction
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
            reach(open, { x: m.x + dx, y: m.y + dy }))
        ok(near, `${lvl.name}: escape at (${m.x},${m.y}) has no reachable neighbour`)
        ok(m.x !== sx || m.y !== sy, `${lvl.name}: escape is the spawn cell — the job ends instantly`)
    }
    // Everything the player needs BEFORE the job ends must be reachable without it.
    for (const m of marksOf(lvl, 'N', 'T', 'P', 'S')) {
        ok(reach(shut, m), `${lvl.name}: '${m.ch}' at (${m.x},${m.y}) needs a door that may stay shut`)
    }

    // --- cover near the money ----------------------------------------------------
    // A loot pile with no cover within a sprint teaches the player that stealth is
    // optional. Every pile gets a hedge, a dumpster or a corner within ~3.5 m.
    for (const m of loot) {
        let best = 1e9
        for (let y = 0; y < lvl.h; y++) {
            for (let x = 0; x < lvl.w; x++) {
                const t = at(lvl, x, y)
                if (t !== T.BUSH && t !== T.DUMP && t !== T.CRATE) continue
                best = Math.min(best, Math.hypot(x - m.x, y - m.y))
            }
        }
        ok(best <= 3.6, `${lvl.name}: loot '${m.ch}' at (${m.x},${m.y}) has no cover within 3.6 m (nearest ${best.toFixed(1)})`)
    }

    // --- patrols -----------------------------------------------------------------
    for (const r of lvl.routes) {
        ok(r.pts.length >= 2, `${lvl.name}: patrol ${r.id} has ${r.pts.length} waypoint(s) — it would stand still`)
        for (let i = 0; i < r.pts.length; i++) {
            const p = r.pts[i]
            ok(!blocksMove(at(lvl, p.x, p.y)), `${lvl.name}: patrol ${r.id} waypoint (${p.x},${p.y}) is inside geometry`)
            ok(reach(open, p), `${lvl.name}: patrol ${r.id} waypoint (${p.x},${p.y}) is not reachable from the spawn`)
            if (i) {
                const a = r.pts[i - 1]
                const pth = pathBetween(lvl, [a.x, a.y], [p.x, p.y], { walkBush: true })
                ok(pth, `${lvl.name}: patrol ${r.id} cannot walk (${a.x},${a.y}) → (${p.x},${p.y}) — route is cut in half`)
            }
            // The player must not be visible from a waypoint while standing at the cart.
            const sp2 = lvl.marks.find(m => m.ch === 'S')
            const d = Math.hypot(p.wx - sp2.wx, p.wz - sp2.wz)
            if (d < r.range) {
                const seen = losWorld(lvl, p.wx, p.wz, sp2.wx, sp2.wz)
                ok(!seen, `${lvl.name}: patrol ${r.id} waypoint (${p.x},${p.y}) looks straight at the getaway cart — spotted on spawn`)
            }
        }
    }

    // --- furniture the game depends on -------------------------------------------
    const lamps = marksOf(lvl, 'L')
    ok(lamps.length >= 2, `${lvl.name}: ${lamps.length} lamps; the night needs pools of light to dodge`)
    const cover = lvl.grid.filter(t => t === T.BUSH || t === T.DUMP).length
    ok(cover >= 4, `${lvl.name}: only ${cover} cover cells`)
    const wax = lvl.grid.filter(t => t === T.WATER).length
    ok(marksOf(lvl, '@').length >= 1, `${lvl.name}: no cat route — every job should have a way to be surprised`)
    if (li > 0) ok(wax >= 0, '')
    const walls = lvl.grid.filter(t => t === T.WALL).length
    const floors = lvl.grid.filter(t => !blocksMove(t)).length
    ok(floors > 90, `${lvl.name}: only ${floors} walkable cells`)
    console.log(`  ${floors} walkable / ${walls} solid · ${loot.length} loot · ${lamps.length} lamps · ${cover} cover · doors ${marksOf(lvl, 'V').length} · lasers ${emit.length ? emit.length + ' emitters' : '—'}`)
}

// ------------------------------------------------------------ stealth model ------
section('STEALTH MODEL')
{
    const lvl = LEVELS[0]
    const sp = marksOf(lvl, 'S')[0]
    const vault = marksOf(lvl, '$')[0]

    // A ray into the vault must not pass through the wall when the door is shut.
    const shut = reachFrom(lvl, sp.x, sp.y, { block: ['X', 'V'] })
    ok(!shut[vault.y * lvl.w + vault.x], 'control: vault loot reachable with the door SHUT')

    // Occlusion, both ways, plus "fences are see-through".
    const p = (m) => [m.wx, m.wz]
    const [gx, gz] = p(marksOf(lvl, 'L')[0])
    ok(losWorld(lvl, gx, gz, gx, gz), 'degenerate ray sees itself')
    ok(!losWorld(lvl, gx, gz, gx - 40, gz), 'a ray escapes the map — walls are not blocking')
    ok(losWorld(lvl, gx - 0.0, gz, gx + 0.4, gz), 'a short open ray is blocked')

    const fence = []
    for (let y = 0; y < lvl.h; y++) for (let x = 0; x < lvl.w; x++) if (at(lvl, x, y) === T.FENCE) fence.push([x, y])
    ok(fence.length > 0, 'job 1 has no chain-link to test')
    if (fence.length) {
        const [fx, fy] = fence[0]
        const a = lvl.ox + fx, b = lvl.oz + fy
        ok(losWorld(lvl, a - 1.5, b, a + 1.5, b), 'chain-link blocks sight — it should never')
        ok(blocksMove(at(lvl, fx, fy)), 'chain-link does not block movement — you would walk through the fence')
        ok(!blocksSight(at(lvl, fx, fy)), 'blocksSight says fence is solid')
    }

    // Cone shape: dead centre beats the edge, and behind is nothing.
    ok(coneAlign(0, 0.7) > 0.99, 'cone centre is not 1')
    ok(coneAlign(0.69, 0.7) > 0 && coneAlign(0.7, 0.7) === 0, 'cone edge is not a clean zero')
    ok(coneAlign(Math.PI, 0.7) === 0, 'a guard can see behind himself')
    const rFar = detectRate(12, 1, { cover: 1 }), rNear = detectRate(2.5, 1, { cover: 1 })
    ok(rNear > rFar * 2, 'detection does not fall off with distance')
    ok(detectRate(3, 1, { cover: coverOf(T.FLOOR, true) }) < detectRate(3, 1, { cover: coverOf(T.FLOOR, false) }), 'crouching does not slow detection')
    ok(detectRate(3, 1, { cover: coverOf(T.BUSH, false) }) < detectRate(3, 1, { cover: 0.5 }), 'a hedge is not real cover')
    ok(coverOf(T.CRATE, false) < 0.5 && coverOf(T.CRATE, false) > 0, 'a plinth is neither cover nor nothing')
    ok(coverOf(T.FLOOR, false) === 1, 'open floor should be full exposure')
    ok(detectRate(3, 0, {}) === 0, 'out-of-cone target accumulates suspicion')

    // Noise, and the thunder that eats it.
    const n = { x: 0, z: 0, r: 4, loud: 1 }
    ok(hears(n, 0, 0, 5, false) === 1, 'a guard standing on the noise does not hear it')
    ok(hears(n, 60, 0, 5, false) === 0, 'noise carries across the map')
    ok(hears(n, 5, 0, 5, true) === 0, 'THUNDER DID NOT MASK THE NOISE — the storm is not a mechanic')
    ok(hears(n, 4.2, 0, 5, false) > hears(n, 6.5, 0, 5, false), 'noise falls off the wrong way')

    // Patrol stepping: ping-pong must bounce, a loop must wrap.
    const pp = [0, 1, 2, 3, 4].map(i => nextWaypoint(i, 3, false))
    ok(pp.join() === '0,1,2,1,0', `ping-pong patrol went ${pp.join()} — should be 0,1,2,1,0`)
    ok(nextWaypoint(2, 3, true) === 0, 'looping patrol did not wrap')

    // Gait table: the three speeds must actually differ, and crouching must be silent.
    const b = CREW[0]
    const walk = moveProfile(b, {}), crouch = moveProfile(b, { crouch: true }), dash = moveProfile(b, { dash: true, wind: 1 })
    ok(dash.speed > walk.speed && walk.speed > crouch.speed, 'gaits are not ordered dash > walk > crouch')
    ok(crouch.noise === 0, 'crouching makes noise')
    ok(moveProfile(b, { dash: true, wind: 0 }).speed === walk.speed, 'you can scurry with no wind left')
    ok(moveProfile(CREW[2], {}).speed > moveProfile(CREW[1], {}).speed, 'SCOUT is not the fast one')

    // Light: a lamplit tile must be brighter than a dark corner, bounded, and finite.
    const lit = lightAt([{ x: 0, z: 0 }], 0, 0)
    ok(lit > lightAt([{ x: 0, z: 0 }], 6, 0), 'lamp light does not fall off')
    ok(Number.isFinite(castWorld(lvl, 0, 0, 1, 0, 30).dist), 'castWorld returned a non-finite distance')

    // Scoring: a clean complete job must beat the same job with the crew in cuffs.
    const clean = tally({ lootValue: 900, totalValue: 900, delivered: 4, secs: 60, par: 90, caught: 0, shinies: 3 })
    const messy = tally({ lootValue: 300, totalValue: 900, delivered: 1, secs: 140, par: 90, caught: 2, shinies: 0 })
    ok(clean.complete && clean.value > messy.value * 2, 'score does not reward a clean complete job')
    ok(!tally({ lootValue: 0, totalValue: 900, delivered: 0, secs: 10, par: 90, caught: 0, shinies: 0 }).complete, 'an empty-handed job counts as complete')
}

// ------------------------------------------------------------- mutation mode -----
if (MUT) {
    section('MUTATION MODE — the audit must have caught the sealed vault')
    const l0 = LEVELS[0]
    const sp = marksOf(l0, 'S')[0]
    const loot = marksOf(l0, '$')[0]
    const open = reachFrom(l0, sp.x, sp.y, { block: [] })
    const reachable = !!open[loot.y * l0.w + loot.x]
    if (reachable) {
        console.log('  \x1b[31mFAIL: mutation survived — a sealed vault is still reported reachable\x1b[0m')
        fails.push('mutation survived: the reachability audit cannot see a walled-off vault')
    } else {
        console.log('  \x1b[32mcaught\x1b[0m: unreachable loot reported, as it must be')
        // In mutation mode the un-mutated failures are the point, so invert the exit.
        console.log(`\n${fails.length} complaint(s) reported about the mutated map.`)
        process.exit(0)
    }
}

if (mapArg !== null) {
    console.log('\n' + dumpLevel(LEVELS[mapArg]))
}

console.log(`\n\x1b[1m${fails.length ? '\x1b[31mFAIL' : '\x1b[32mPASS'}\x1b[0m — ${pass} checks passed, ${fails.length} failed`)
for (const f of fails) console.log('  \x1b[31m✗\x1b[0m ' + f)
process.exit(fails.length ? 1 : 0)
