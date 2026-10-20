// OUTPOST — the Node gate. No browser, no dev server.
//
//   npm run outpostcheck              # audit + pins + proven runs + slack
//   npm run outpostcheck -- --mutate  # re-break the load-bearing rules
//
// Sections: Math.random is banned at import · generator audit (every seed:
// the beacon room IS sealed, every bush is actionable, the walker's world is
// one component) · A* optimality == BFS · the deny matrix · job-queue
// integrity DURING a live run (claims unique, claims belong to working
// dwarves, resolved jobs leave the queue, a death RETURNS its claim) ·
// the food ledger to the unit every tick · starvation really kills inside
// its budget · the proven runs (attract replays these) with a PER-DEPTH
// dig probe — a stroll win is a failure, not a win · the SLACK RULE (one
// fewer dwarf, one fewer ration, every seed) · determinism · mutants.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { CFG, newRun, step, stateHash, astar, W, H, ROCK, FLOOR, STAIRS } from '../src/games/Outpost/sim.js'
import { gen, flood } from '../src/games/Outpost/cave.js'
import { plan, autopilot, rockDist } from '../src/games/Outpost/planner.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../src/games/Outpost')
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)
const idx = (x, y) => y * W + x
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const SIM_SEEDS = [0, 1, 2, 3, 4, 5, 6, 7]
const GEN_SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// ------------------------------------------------------------ math banned ----
section('MATH.RANDOM IS A SIM CRIME')
for (const f of ['sim.js', 'cave.js', 'planner.js']) {
    const raw = readFileSync(join(SRC, f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — the depths may never gamble`)
}
{
    const real = Math.random
    Math.random = () => { throw new Error('Math.random called — the cave is SEEDED') }
    let froze = false
    try {
        const gs = newRun(3)
        autopilot(gs, 2000)
        froze = true
    } catch (e) { fails.push(`frozen random hit: ${e.message}`) }
    Math.random = real
    ok(froze, 'a 2000-tick autopilot run survives with Math.random THROWN at the call site')
}

// --------------------------------------------------------- generator audit ----
section('GENERATOR AUDIT — every seed, every depth')
{
    let sealedOk = 0, bushyOk = 0
    for (const seed of GEN_SEEDS) {
        for (let depth = 1; depth <= 3; depth++) {
            const cave = gen(seed, depth)
            const tag = `seed ${seed} d${depth}`
            ok(cave.t[idx(cave.spawn[0], cave.spawn[1])] === FLOOR, `${tag}: spawn is not floor`)
            ok(cave.t[idx(cave.depot[0], cave.depot[1])] === FLOOR, `${tag}: depot buried`)
            ok(cave.t[idx(cave.stairs[0], cave.stairs[1])] === STAIRS, `${tag}: beacon is not STAIRS`)
            // THE SEAL: the beacon is unreachable until you dig. A stroll win
            // is dead code wearing a green test.
            const seen = flood(cave.t, cave.spawn)
            const sealed = !seen.has(idx(cave.stairs[0], cave.stairs[1]))
            ok(sealed, `${tag}: the beacon room is ALREADY WALKABLE — the dig would never run`)
            if (sealed) sealedOk++
            const bushes = []
            for (let i = 0; i < W * H; i++) if (cave.bush[i]) bushes.push(i)
            ok(bushes.length >= 3, `${tag}: only ${bushes.length} bushes — the colony starves by design`)
            // every bush actionable: reachable from spawn on foot
            const bad = bushes.filter((i) => !seen.has(i))
            ok(bad.length === 0, `${tag}: ${bad.length} bushes stand behind sealed rock — an un-actionable job`)
            if (bad.length === 0 && bushes.length >= 3) bushyOk++
            // every ore seam touches the walker's floor
            for (let i = 0; i < W * H; i++) {
                if (!cave.ore[i]) continue
                const x = i % W, y = (i - x) / W
                ok(N4.some(([dx, dy]) => seen.has(idx(x + dx, y + dy))), `${tag}: ore seam at ${x},${y} touches no reachable floor`)
            }
            // determinism: the same seed carves the same cave
            const again = gen(seed, depth)
            ok(Buffer.from(again.t).equals(Buffer.from(cave.t)), `${tag}: the seed carved twice differently`)
        }
    }
    ok(sealedOk === GEN_SEEDS.length * 3, `sealed beacons ${sealedOk}/${GEN_SEEDS.length * 3}`)
    console.log(`  ..    ${sealedOk}/${GEN_SEEDS.length * 3} beacons sealed, ${bushyOk}/${GEN_SEEDS.length * 3} depths stocked`)
}

// ---------------------------------------------------------------- A* truth ----
section("A* — OPTIMAL OR HONESTLY NOTHING (unit cost: length must equal BFS)")
{
    const cave = gen(5, 1)
    const gs = { cave }
    const seen = [...flood(cave.t, cave.spawn)]
    // BFS distance (the optimal answer) on the same graph
    const bfs = (si) => {
        const d = new Map([[si, 0]])
        const q = [si]
        while (q.length) {
            const i = q.shift()
            for (const [dx, dy] of N4) {
                const nx = i % W + dx, ny = ((i - (i % W)) / W) + dy
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
                const ni = ny * W + nx
                if (cave.t[ni] === ROCK || d.has(ni)) continue
                d.set(ni, d.get(i) + 1); q.push(ni)
            }
        }
        return d
    }
    let checks = 0
    for (let k = 0; k < 40; k++) {
        const si = seen[(k * 137) % seen.length]
        const ti = seen[(k * 89 + 31) % seen.length]
        const p = astar(gs, [si % W, (si - (si % W)) / W], [ti % W, (ti - (ti % W)) / W])
        const d = bfs(si).get(ti)
        checks++
        ok(p && p.length === d, `A* returned ${p ? p.length : 'null'} where BFS says ${d} — the path is a lie`)
        if (p) {
            // every step adjacent, start and end true
            let px = si % W, py = (si - (si % W)) / W, adj = true
            for (const [x, y] of p) {
                if (Math.abs(x - px) + Math.abs(y - py) !== 1) adj = false
                px = x; py = y
            }
            ok(adj && px === ti % W && py === ((ti - (ti % W)) / W), `A* path takes a diagonal or lands wrong (${checks})`)
        }
    }
    // sealed beacon: A* must say NULL, never a lie of a path
    ok(astar(gs, [cave.spawn[0], cave.spawn[1]], cave.stairs) === null, 'A* found a path through SEALED rock — it lies')
    // and the 0-1 tunnel BFS agrees the shortest dig is >= 1 for a sealed beacon
    const rd = rockDist(gs, cave.stairs)
    ok(rd[idx(cave.spawn[0], cave.spawn[1])] >= 1, 'rockDist says the sealed beacon needs zero digs')
    console.log(`  ..    ${checks} reachable pairs matched BFS exactly; the sealed beacon answered null`)
}

// ----------------------------------------------------------- deny matrix ----
section('THE DENY MATRIX — every wrong click answered by the SIM')
{
    const gs = newRun(0)
    const deny = (tool, x, y) => { step(gs, { tool, designate: [x, y] }); const e = gs.events.find((ev) => ev.type === 'deny'); return e ? e.why : null }
    ok(deny('dig', gs.cave.spawn[0], gs.cave.spawn[1]) === 'NOTROCK', 'digging a floor tile answered nothing')
    // a rock with no open neighbour: deep inside the sealed beacon room wall
    const cave = gs.cave
    const deep = []
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        if (cave.t[idx(x, y)] === ROCK && !N4.some(([dx, dy]) => cave.t[idx(x + dx, y + dy)] !== ROCK)) deep.push([x, y])
    }
    ok(deep.length > 0 && deny('dig', ...deep[0]) === 'SEALED', 'digging a rock with no open neighbour was accepted')
    const rock = []
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (cave.t[idx(x, y)] === ROCK && N4.some(([dx, dy]) => flood(cave.t, cave.spawn).has(idx(x + dx, y + dy)))) rock.push([x, y])
    }
    ok(rock.length > 0, 'this cave has no diggable rock next to open floor — audit is vacuous')
    ok(deny('dig', ...rock[0]) === null, 'the first legal dig was refused')
    ok(deny('dig', ...rock[0]) === 'DUP', 'the same rock was designated twice without a DUP')
    ok(deny('farm', ...rock[0]) === 'NOTGROUND', 'a farm was accepted on stone')
    ok(deny('farm', gs.cave.depot[0], gs.cave.depot[1]) === 'DEPOT', 'a farm was accepted on the depot')
    ok(deny('rally', gs.cave.spawn[0], gs.cave.spawn[1]) === 'NOTSTAIRS', 'rally accepted a floor tile')
    ok(deny('warp', 3, 3) === 'TOOL', 'an unknown tool was accepted')
    ok(deny('dig', -1, 5) === 'OFFMAP', 'the map accepted a designation outside itself')
    // a refusal the player cannot SEE is still silence: every deny event must
    // carry the position (and its reason) so the shell can flash the tile red
    {
        const gs2 = newRun(0)
        step(gs2, { tool: 'dig', designate: [gs2.cave.spawn[0], gs2.cave.spawn[1]] })
        const e = gs2.events.find((ev) => ev.type === 'deny')
        ok(!!e && e.why === 'NOTROCK' && e.x === gs2.cave.spawn[0] && e.y === gs2.cave.spawn[1],
            'a deny event arrived without a reason+position — the UI has nothing to flash')
    }
    step(gs, { tool: 'farm', designate: [gs.cave.spawn[0] + 1, gs.cave.spawn[1]] })
    ok(!gs.events.find((e) => e.type === 'deny' && e.why === 'TOOL'), 'a legal farm tool was rejected')
}

// ------------------------------------------------ job integrity (LIVE run) ----
section('JOB QUEUE INTEGRITY DURING A PROVEN RUN')
{
    const r = plan(2)
    ok(r.ok, `the integrity fixture seed did not win: ${r.receipts.why}`)
    const gs = newRun(2)
    let ticks = 0, seenClaim = 0
    let broken = null
    for (const inp of r.script) {
        step(gs, inp)
        ticks++
        const ids = new Set(gs.jobs.map((j) => j.id))
        if (ids.size !== gs.jobs.length) { broken = `duplicate job id at tick ${ticks}`; break }
        const where = new Map()
        for (const j of gs.jobs) {
            const key = `${j.kind}@${j.x},${j.y}`
            if (where.has(key)) { broken = `two live jobs ${key} (tick ${ticks})`; break }
            where.set(key, j.id)
            if (j.kind === 'dig' && j.claim === null && gs.cave.t[idx(j.x, j.y)] !== ROCK) { broken = `an unclaimed dig job points at a FLOOR cell (tick ${ticks})`; break }
            if (j.claim !== null) {
                seenClaim++
                const d = gs.dwarves.find((dd) => dd.id === j.claim)
                if (!d || !d.alive) broken = `job ${j.id} is claimed by a dwarf who is gone (tick ${ticks})`
                else if (d.jobId !== j.id) broken = `dwarf ${d.id} claims job ${j.id} but is on ${d.jobId} (tick ${ticks})`
                else if (d.act === 'idle') broken = `dwarf ${d.id} claims job ${j.id} while idle (tick ${ticks})`
                if (broken) break
            }
        }
        if (broken) break
    }
    ok(!broken, broken || 'integrity scan ended silently')
    ok(seenClaim > 30, `only ${seenClaim} claim-states observed — the scan never touched a working queue`)
    console.log(`  ..    ${ticks} ticks scanned live, ${seenClaim} claims all one-to-one`)
}

// ------------------------------------------------------------ food ledger ----
section('THE FOOD LEDGER BALANCES TO EVERY UNIT, EVERY TICK')
{
    for (const seed of [0, 1]) {
        const gs = newRun(seed, { dwarfCut: 1, foodCut: 1 })
        let breaks = 0
        for (let t = 0; t < 1400; t++) {
            step(gs, {})
            const carry = gs.dwarves.reduce((n, d) => n + (d.alive ? d.carryFood : 0), 0)
            if (gs.food + carry + gs.eaten + gs.rotten !== gs.food0 + gs.harvested) breaks++
            const cOre = gs.dwarves.reduce((n, d) => n + (d.alive ? d.carryOre : 0), 0)
            if (gs.minedOre !== gs.ore + cOre) breaks++
        }
        ok(breaks === 0, `seed ${seed}: the ledger broke on ${breaks} of 1400 ticks`)
    }
}

// ------------------------------------------------------ hunger and vacancy ----
section('HUNGER KILLS INSIDE ITS BUDGET — AND THE DEAD RETURN THEIR CLAIM')
{
    const gs = newRun(0)
    // a farm FAR from spawn: bushes are harvested in the first few hundred
    // ticks, so the walking-claim fixture must create its own long errand
    const seen0 = flood(gs.cave.t, gs.cave.spawn)
    let far = null
    for (const i of seen0) {
        const x = i % W, y = (i - (i % W)) / W
        const d = Math.abs(x - gs.cave.spawn[0]) + Math.abs(y - gs.cave.spawn[1])
        if (d >= 6 && gs.cave.t[i] === FLOOR && !gs.cave.bush[i]) { far = [x, y]; break }
    }
    ok(!!far, 'this cave has no reachable floor 6+ steps from spawn — walking fixture vacuous')
    let walker = null
    for (let t = 0; t < 900 && !walker; t++) {
        if (far && t % 30 === 0) step(gs, { tool: 'farm', designate: far })
        else step(gs, {})
        walker = gs.dwarves.find((d) => d.alive && d.act === 'walk' && d.jobId !== null && d.path && d.path.length > 2) || null
    }
    ok(!!walker, 'no dwarf ever walked a claimed job in 900 ticks — the queue is theatre')
    if (walker) {
        const jobId = walker.jobId
        const job = gs.jobs.find((j) => j.id === jobId)
        ok(job && job.claim === walker.id, 'the walking dwarf does not own its claim')
        // starve them dead: the claim must re-enter the queue, not rot with the body
        gs.food = 0
        for (const d of gs.dwarves) if (d.alive && d.id !== walker.id) d.hunger = 0
        walker.hunger = CFG.HUNGER_MAX + 1
        walker.starve = CFG.STARVE_MAX
        let died = -1
        for (let t = 1; t <= CFG.STARVE_MAX + 3; t++) {
            step(gs, {})
            if (!walker.alive) { died = t; break }
        }
        ok(died > 0 && died <= CFG.STARVE_MAX + 2, `the starving dwarf survived ${CFG.STARVE_MAX + 2}+ ticks past full hunger`)
        const back = gs.jobs.find((j) => j.id === jobId)
        ok(back && back.claim === null, 'the dead dwarf took its claim into the ground — the job is stranded')
        // and someone else finishes the job: the dig resolves
        const target = job && job.kind === 'dig' ? [job.x, job.y] : null
        let dugIt = false
        for (let t = 0; t < 4000 && !dugIt; t++) {
            step(gs, {})
            if (target && gs.cave.t[idx(target[0], target[1])] === FLOOR) dugIt = true
        }
        if (target) ok(dugIt, `nobody re-claimed and dug the returned job at ${target}`)
        else pass++
    }
}

// -------------------------------------------------------- doing nothing ----
section('DOING NOTHING LOSES (an unfed colony is a dead colony)')
{
    const gs = newRun(1)
    let t = 0
    while (!gs.end && t < 60 * 60 * 30) { step(gs, {}); t++ }
    ok(gs.end === 'lose', `an idle colony ended ${gs.end} — hunger must collect`)
    ok(gs.dwarves.every((d) => !d.alive), 'an idle colony lost while dwarves still walked — the lose rule is wrong')
}

// ------------------------------------------------------------ proven runs ----
section('THE PROVEN RUNS (attract replays these; every depth must DIG)')
{
    for (const seed of SIM_SEEDS) {
        const r = plan(seed)
        const x = r.receipts
        ok(r.ok, `seed ${seed} did NOT win: ${x.why} at d${x.depth}`)
        ok(x.alive === CFG.DWARVES, `seed ${seed} won with ${x.alive} of ${CFG.DWARVES} dwarves — the demo shows casualties`)
        // PER-DEPTH dig probe: replay and require dug>0 in EVERY depth. A
        // win with dug==0 means the beacon was never sealed — dead code.
        const gs = newRun(seed)
        const dugByDepth = {}
        let i = 0
        while (!gs.end && i < r.script.length) {
            step(gs, r.script[i++])
            dugByDepth[gs.depth] = (dugByDepth[gs.depth] || 0) + gs.events.filter((e) => e.type === 'dig').length
            const carry = gs.dwarves.reduce((n, d) => n + (d.alive ? d.carryFood : 0), 0)
            if (gs.food + carry + gs.eaten + gs.rotten !== gs.food0 + gs.harvested) ok(false, `seed ${seed}: ledger break at tick ${gs.tick}`)
        }
        const depths = [1, 2, 3]
        for (const d of depths) ok((dugByDepth[d] || 0) > 0, `seed ${seed} depth ${d}: ZERO digs — a stroll win, the tunnel was dead code`)
        const evs = []
        const gs2 = newRun(seed)
        i = 0
        while (!gs2.end && i < r.script.length) { step(gs2, r.script[i++]); for (const e of gs2.events) if (['rally', 'descend', 'win'].includes(e.type)) evs.push(e.type) }
        // three depths: rally+descend on each of the first two, and the
        // THIRD rally's descend is the win itself
        ok(evs.filter((e) => e === 'descend').length === 3 && evs[evs.length - 1] === 'win' && evs.filter((e) => e === 'rally').length === 3,
            `seed ${seed} ended without three rally->descend chains and a win: ${evs.join('>')}`)
        console.log(`  ..    seed ${seed} WIN d3 alive ${x.alive} dug ${x.dug} eaten ${x.eaten} ticks ${(x.ticks / 60) | 0}s`)
    }
}

// ------------------------------------------------------------ slack rule ----
section('SLACK RULE — one fewer dwarf AND one fewer ration, every seed')
{
    for (const seed of SIM_SEEDS) {
        const r = plan(seed, { dwarfCut: 1, foodCut: 1 })
        const x = r.receipts
        ok(r.ok, `seed ${seed} is NOT winnable with one fewer dwarf (${CFG.DWARVES - 1}) and one fewer ration (${CFG.FOOD0 - 1}) — zero slack is a build failure`)
        ok(x.alive <= CFG.DWARVES - 1, `seed ${seed} slack run had ${x.alive} dwarves — it cheated the roster`)
        ok(x.food0 === CFG.FOOD0 - 1, `seed ${seed} slack run started on ${x.food0} rations — it cheated the larder`)
        console.log(`  ..    seed ${seed} slack @D${CFG.DWARVES - 1}/F${CFG.FOOD0 - 1}: ${r.ok ? 'WINS' : 'LOSES'} d${x.depth} alive ${x.alive} dug ${x.dug}`)
    }
    // and a colony with NO rations must feel it immediately
    const gs = newRun(0, { foodCut: CFG.FOOD0 })
    ok(gs.food === 0, 'foodCut did not reach the depot')
    let hungry = false
    for (let t = 0; t < CFG.HUNGER_TICK * CFG.HUNGER_MAX + 20 && !hungry; t++) { step(gs, {}); hungry = gs.dwarves.some((d) => d.hunger >= CFG.HUNGER_MAX) }
    ok(hungry, 'the colony never felt the empty larder — hunger is theatre')
}

// ------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const a = plan(3), b = plan(3)
    ok(JSON.stringify(a.receipts) === JSON.stringify(b.receipts), 'two autopilots of seed 3 ended differently')
    ok(a.script.length === b.script.length && a.script.every((inp, i) => JSON.stringify(inp) === JSON.stringify(b.script[i])), 'two autopilots of seed 3 issued different commands')
    const g1 = newRun(2), g2 = newRun(2)
    for (let t = 0; t < 300; t++) { step(g1, {}); step(g2, {}) }
    ok(stateHash(g1) === stateHash(g2), 'two fresh identical worlds hash differently')
    g2.dwarves[0].hunger += 1
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores a hunger change')
    const g3 = newRun(2)
    step(g3, { tool: 'dig', designate: [g3.cave.spawn[0] + 1, g3.cave.spawn[1]] })
    const g4 = newRun(2)
    step(g4, { tool: 'farm', designate: [g4.cave.spawn[0] + 1, g4.cave.spawn[1]] })
    ok(stateHash(g3) !== stateHash(g4), 'stateHash ignores the job queue')
}

// ---------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')

    const tryMut = (name, apply, probe) => {
        const save = {}
        for (const k of Object.keys(apply)) save[k] = CFG[k]
        Object.assign(CFG, apply)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === true ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== true, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // 1. hunger never ticks: starvation becomes a myth
    tryMut('HUNGER_TICK 8 -> 100000 (nobody ever gets hungry)', { HUNGER_TICK: 100000 }, () => {
        const gs = newRun(1, { foodCut: CFG.FOOD0 })
        for (let t = 0; t < 1200; t++) step(gs, {})
        return gs.dwarves.some((d) => d.alive && d.hunger > 0)   // honest code: they DO
    })

    // 2. farms reap NOTHING: the renewable economy is a lie.
    //    (Survived its first life on a bush-rich fixture — so THIS fixture
    //    has no bushes and grades a full plant->ripen->pick->haul cycle.)
    tryMut('FARM_FOOD 2 -> 0 (a harvest yields nothing)', { FARM_FOOD: 0 }, () => {
        const gs = newRun(0)
        for (let i = 0; i < W * H; i++) if (gs.cave.bush[i]) gs.cave.bush[i] = 0
        gs.jobs = gs.jobs.filter((j) => j.kind !== 'pick')
        const f = [gs.cave.spawn[0] + 1, gs.cave.spawn[1]]
        gs.cave.t[idx(f[0], f[1])] = FLOOR
        gs.farm[idx(f[0], f[1])] = 1
        gs.farmAge[idx(f[0], f[1])] = CFG.FARM_GROW - 2
        const before = gs.harvested
        let ate = false
        for (let t = 0; t < 3000; t++) {
            step(gs, {})
            if (gs.harvested > before) ate = true
        }
        return ate
    })

    // 3. starve budget infinite: the starving never die, they just linger
    tryMut('STARVE_MAX 40 -> 100000 (starving dwarves are immortal)', { STARVE_MAX: 100000 }, () => {
        const gs = newRun(0)
        gs.food = 0
        const d = gs.dwarves[0]
        d.hunger = CFG.HUNGER_MAX + 1
        let died = false
        for (let t = 0; t < 5000; t++) { step(gs, {}); if (!d.alive) { died = true; break } }
        return died                              // honest code: death comes
    })

    // 4. farms never ripen: the renewable engine stalls, silently
    tryMut('FARM_GROW 520 -> 10^9 (plots never ripen)', { FARM_GROW: 1e9 }, () => {
        const gs = newRun(0)
        const f = [gs.cave.spawn[0] + 1, gs.cave.spawn[1]]
        gs.cave.t[idx(f[0], f[1])] = FLOOR
        gs.farm[idx(f[0], f[1])] = 1
        let ripened = false
        for (let t = 0; t < 2000; t++) {
            step(gs, {})
            if (gs.events.some((e) => e.type === 'job' && e.kind === 'pick' && e.x === f[0] && e.y === f[1])) ripened = true
        }
        return ripened                           // honest code: it ripens and summons
    })

    // --- structural mutants: edited copies of sim.js, imported fresh -------
    const dir = '/var/folders/41/gz22zd5d55g08jn448xnd90m0000gn/T/opencode/mutant-src'
    mkdirSync(dir, { recursive: true })
    const cavePath = join(SRC, 'cave.js').replace(/\\/g, '/')
    const mutSim = async (anchor, replacement) => {
        const orig = readFileSync(join(SRC, 'sim.js'), 'utf8')
        if (!orig.includes(anchor)) { ok(false, `mutant anchor not found: ${anchor} — a silent skip is a green suite that tested nothing`); return null }
        const f = join(dir, `sim-mut-${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}.mjs`)
        writeFileSync(f, orig.replace(anchor, replacement).replace("from './cave.js'", `from '${cavePath}'`))
        return import(pathToFileURL(f).href)
    }

    // 5. a resolved job never releases its claim: the queue clogs. (Survived
    //    its first life on the WIN condition — runs still won on leftover
    //    dig jobs — so the probe is the LIVE integrity scan.)
    {
        const mod = await mutSim("if (kind === 'dig' || kind === 'farm' || kind === 'pick') release(gs, d)", 'if (false) release(gs, d)')
        if (mod) {
            const gs = mod.newRun(1)
            let clogged = false
            for (let t = 0; t < 3000 && !clogged; t++) {
                mod.step(gs, {})
                for (const j of gs.jobs) {
                    if (j.claim === null) continue
                    const d = gs.dwarves.find((dd) => dd.id === j.claim)
                    if (!d || !d.alive || d.jobId !== j.id) { clogged = true; break }
                }
            }
            console.log(`  mut structural release-leak: ${clogged ? 'caught by the audit' : 'SURVIVED (BAD)'}`)
            ok(clogged, 'a resolved-claim leak survived the live integrity scan')
        }
    }

    // 6. A* goes GREEDY (heuristic without g) — BFS-equality must catch it.
    //    (An earlier version of this mutant replaced the heuristic with pure
    //    Dijkstra — which is OPTIMAL, so it survived by being a lie about
    //    being a mutation. This one actually drops g.)
    {
        const mod = await mutSim(
            'f: ng + Math.abs((ni % W) - (gi % W)) + Math.abs(((ni - (ni % W)) / W) - ((gi - (gi % W)) / W))',
            'f: Math.abs((ni % W) - (gi % W)) + Math.abs(((ni - (ni % W)) / W) - ((gi - (gi % W)) / W))')
        if (mod) {
            const cave = (await import(pathToFileURL(cavePath).href)).gen(9, 1)
            const gs = { cave }
            const seen = [...flood(cave.t, cave.spawn)]
            let worse = false
            for (let k = 0; k < 120 && !worse; k++) {
                const si = seen[(k * 137 + 5) % seen.length]
                const ti = seen[(k * 91 + 13) % seen.length]
                const p = mod.astar(gs, [si % W, (si - (si % W)) / W], [ti % W, (ti - (ti % W)) / W])
                const q = astar(gs, [si % W, (si - (si % W)) / W], [ti % W, (ti - (ti % W)) / W])
                if (p && q && p.length > q.length) worse = true
            }
            console.log(`  mut structural greedy-A*: ${worse ? 'caught by the audit' : 'SURVIVED (BAD)'}`)
            ok(worse, 'a greedy (non-optimal) A* survived the BFS-equality pin')
        }
    }

    // 7. deaths keep their claim: the job rots with the body
    {
        const mod = await mutSim('if (j && !j.done) j.claim = null', 'if (j && !j.done && false) j.claim = null')
        if (mod) {
            const gs = mod.newRun(0)
            const seen0 = flood(gs.cave.t, gs.cave.spawn)
            let far = null
            for (const i of seen0) {
                const x = i % W, y = (i - (i % W)) / W
                if (Math.abs(x - gs.cave.spawn[0]) + Math.abs(y - gs.cave.spawn[1]) >= 6 && gs.cave.t[i] === FLOOR && !gs.cave.bush[i]) { far = [x, y]; break }
            }
            let walker = null
            for (let t = 0; t < 900 && !walker; t++) {
                mod.step(gs, far && t % 30 === 0 ? { tool: 'farm', designate: far } : {})
                walker = gs.dwarves.find((d) => d.alive && d.act === 'walk' && d.jobId !== null && d.path && d.path.length > 2) || null
            }
            if (!walker) ok(false, 'claim-return mutant fixture never produced a walking claim')
            else {
                const wid = walker.id
                gs.food = 0
                walker.hunger = CFG.HUNGER_MAX + 1
                walker.starve = CFG.STARVE_MAX
                for (let t = 0; t < CFG.STARVE_MAX + 4 && walker.alive; t++) mod.step(gs, {})
                const stranded = gs.jobs.find((j) => j.claim === wid)
                console.log(`  mut structural claim-leak-on-death: ${stranded ? 'caught by the audit' : 'SURVIVED (BAD)'}`)
                ok(!!stranded, 'the mutant let the claim return — the harness never proved the return')
            }
        }
    }

    // 8. deny reasons go silent: the refusal still happens but the UI has
    //    nothing to show — the first-time player just watches nothing happen.
    {
        const mod = await mutSim("gs.events.push({ type: 'deny', why: bad, x, y })", "gs.events.push({ type: 'deny', x, y })")
        if (mod) {
            const gs = mod.newRun(0)
            mod.step(gs, { tool: 'dig', designate: [gs.cave.spawn[0], gs.cave.spawn[1]] })
            const whyless = gs.events.find((e) => e.type === 'deny' && !e.why)
            console.log(`  mut structural deny-without-reason: ${whyless ? 'caught by the audit' : 'SURVIVED (BAD)'}`)
            ok(!!whyless, 'a reasonless deny survived — the matrix never proves the reason arrives')
        }
    }
}

console.log(`\noutpostcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
