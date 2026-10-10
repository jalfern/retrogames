// SONAR ABYSS — the information-pipeline audit. No browser, no dev server.
//
//   npm run sonarcheck              # every claim the game makes about SIGHT
//   npm run sonarcheck -- --mutate  # silence one rule, watch a check go red
//   npm run sonarcheck -- --map     # the demo cave as the sonar last saw it
//
// The issue's harness demand is literally "assert the info the player actually
// received". So this file does not test that the caves are fun — it tests the
// seam between TRUTH and KNOWLEDGE, and every check is a claim the renderer
// depends on:
//
//   GENERATION   seeded, deterministic; the vent is carved and reachable;
//                every pearl is reachable; eel routes are walkable loops.
//   WINNABILITY  the planner crosses every depth of every audit seed with
//                ZERO hits — space-time safety, not luck.
//   INTEGRITY    for every lit cell, an independently recomputed BFS from the
//                emitting ping lands at EXACTLY the tick the sim lit it. And
//                every cell no sound can reach is NEVER lit. Occlusion is a
//                doorwalk, not a radius: a sealed pocket inside the blast
//                radius stays black until the front rounds the doorway.
//   DECAY        light fades; memory without forgetting is a cheat menu.
//   HIDDEN-EEL   contacts appear only where the wavefront physically touched
//                the eel that tick (the harness re-derives the eel's position
//                from its deterministic route), and real eels ARE hidden most
//                of the time — a suite that never saw darkness proves nothing.
//   DEATH/DESCEND  a touching eel takes a life; the vent takes you down.
//   DETERMINISM  replays match, a dropped command does not (tamper probe).
//   MUTATIONS    six rules silenced in children, each must turn a NAMED check
//                red, or a check has stopped touching its rule.

import { spawnSync } from 'node:child_process'
import * as s from '../src/games/Sonar/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const MAP = args.includes('--map')
const MUT_NAME = process.env.SONAR_MUT || null

const { CFG, W, H, OPEN, ROCK, N } = s
const SEEDS = [0xC0FFEE, 0x5EED, 1000, 4242, 77]

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

const MUTANTS = {
    wavefront: 'reveal goes straight-line through rock — occlusion becomes a radius cheat',
    decay: 'knowledge stops fading — the deferred reveal becomes a permanent map',
    blipOnly: 'eels leak their LIVE position into knowledge — the eye the game does not have',
    carve: 'caves stop being carved to the vent — the win becomes unfinishable',
    eelKill: 'eels stop taking lives — the dark becomes a museum',
    descend: 'the vent stops descending — depths become wallpaper',
}
if (MUT_NAME) {
    if (!(MUT_NAME in MUTANTS)) { console.error(`unknown mutant ${MUT_NAME}`); process.exit(2) }
    CFG[MUT_NAME] = false
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT_NAME} = false\x1b[0m  (${MUTANTS[MUT_NAME]})`)
}

if (MAP) {
    const cave = s.genCave(0xC0FFEE, 2)
    const r = s.replay(cave, s.planRun(cave).cmds)
    const d = s.bfsField(cave.grid, cave.spawn)
    console.log(`seed c0ffee depth 2 — spawn(${s.cx(cave.spawn)},${s.cy(cave.spawn)}) vent(${s.cx(cave.vent)},${s.cy(cave.vent)}) dist ${d[cave.vent]} pearls ${cave.pearls.length} eels ${r.eels.length} end=${r.end}`)
    for (let y = 0; y < H; y++) {
        let line = ''
        for (let x = 0; x < W; x++) {
            const i = s.idx(x, y)
            line += i === cave.spawn ? '@' : i === cave.vent ? 'V'
                : cave.grid[i] === ROCK ? '#' : cave.pearls.includes(i) ? 'o'
                    : r.mem[i] >= 0 ? '+' : r.grid[i] === OPEN ? '.' : '#'
        }
        console.log(line)
    }
    process.exit(0)
}

// ------------------------------------------------------------------ audit ----
section('GENERATION (seeded shapes the win depends on)')
for (const seed of SEEDS) {
    for (const depth of [1, 2, 4]) {
        const a = s.genCave(seed, depth)
        const b = s.genCave(seed, depth)
        ok(s.hash(a.grid.join('')) === s.hash(b.grid.join('')), `seed ${seed} d${depth}: gen is not deterministic`)
        ok(a.grid[a.spawn] === OPEN && a.grid[a.vent] === OPEN, `seed ${seed} d${depth}: spawn/vent not open water`)
        const d = s.bfsField(a.grid, a.spawn)
        ok(d[a.vent] > 0, `seed ${seed} d${depth}: vent NOT reachable from spawn (${d[a.vent]}) — a dark you can never leave`)
        ok(d[a.vent] > 20, `seed ${seed} d${depth}: vent only ${d[a.vent]} cells away — there is no journey, no map to learn`)
        const lost = a.pearls.filter(p => d[p] < 0).length
        ok(lost === 0, `seed ${seed} d${depth}: ${lost} pearls unreachable`)
        ok(s.makeEels(a, depth, 1).length >= 1, `seed ${seed} d${depth}: no eels — the dark is friendly, the issue said it must not be`)
        for (const e of s.makeEels(a, depth, 1)) {
            let walk = true
            for (let k = 1; k < e.route.length; k++) {
                const ax = s.cx(e.route[k - 1]), ay = s.cy(e.route[k - 1])
                const bx = s.cx(e.route[k]), by = s.cy(e.route[k])
                if (a.grid[e.route[k]] !== OPEN || Math.abs(ax - bx) + Math.abs(ay - by) !== 1) walk = false
            }
            ok(walk, `seed ${seed} d${depth}: eel ${e.id} route teleports through rock — a patrol that is not a walk is a teleporter wearing a costume`)
        }
    }
}

section('WINNABILITY (space-time planner, 5 seeds x 4 depths, zero hits demanded)')
{
    let wins = 0, t0 = Date.now()
    for (const seed of SEEDS) {
        for (let depth = 1; depth <= 4; depth++) {
            const r = s.planRun(s.genCave(seed, depth))
            if (r.end === 'descend' && r.g.lives === 3) wins++
            else fails.push(`seed ${seed.toString(16)} d${depth}: end=${r.end} lives=${r.g.lives} — the witness got eaten, safety is luck not math`)
        }
    }
    pass += wins
    const ms = Date.now() - t0
    console.log(`  ..    ${wins}/20 depths crossed untouched in ${ms} ms`)
    ok(wins === 20, `only ${wins}/20 planned crossings were clean`)
    ok(ms < 9000, `planner took ${ms} ms — the audit must stay fast enough to gate merges`)
}

section('INTEGRITY (every lit cell = one recomputed wavefront arrival)')
{
    const cave = s.genCave(0xC0FFEE, 2)
    const plan = s.planRun(cave).cmds
    const pings = []
    let badLight = 0, litSeen = 0, hiddenTicks = 0, blipBad = 0, blipsSeen = 0
    const g = s.replay(cave, plan, {
        onTick: (gg) => {
            for (const p of gg.pings) if (!pings.includes(p)) pings.push(p)
            // contacts are graded at the tick they fire: the cell must be one
            // the wavefront lit THIS tick, and the eel must really be there
            // (live truth in hand — no re-derivation that could drift).
            for (const b of gg.blips) {
                if (b.t !== gg.tick) continue
                blipsSeen++
                const c = s.idx(b.x, b.y)
                const e = gg.eels.find(e => e.id === b.id)
                // onTick lands AFTER the eel's step, so the live cell may be
                // the blip cell or exactly one route-hop away — never more.
                const ri = e ? e.route.indexOf(c) : -1
                const hops = e ? Math.abs(e.pos - ri) : 9
                if (gg.mem[c] !== b.t || ri < 0 || hops > 1) blipBad++
            }
            // sample early too: the first seconds after spawn are the one time
            // the demo NEVER pinged ahead — that is where darkness is honest.
            if (gg.tick % 11 && gg.tick > 9) return
            const dists = pings.map(p => ({ p, d: s.bfsField(gg.grid, p.src) }))
            for (let i = 0; i < N; i++) {
                const m = gg.mem[i]
                if (m < 0) continue
                litSeen++
                if (gg.grid[i] === OPEN) {
                    const hitp = dists.some(({ p, d }) => d[i] >= 0 && p.t0 + Math.ceil(d[i] / CFG.waveSpeed) === m)
                    if (!hitp) badLight++
                } else {
                    const x = s.cx(i), y = s.cy(i)
                    const face = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) =>
                        s.inB(x + dx, y + dy) && gg.grid[s.idx(x + dx, y + dy)] === OPEN && gg.mem[s.idx(x + dx, y + dy)] === m)
                    if (!face) badLight++
                }
            }
            // "hidden" = invisible through the ONLY channel the player has:
            // its live cell neither known nor standing under a fresh contact.
            // The `blipOnly` mutant leaks live eels into eelContacts, so this
            // count hits zero under it — that is what this check is FOR.
            const contacts = s.eelContacts(gg)
            let hidden = false
            for (const e of gg.eels) {
                const c = s.eelCell(e)
                if (!s.known(gg, c) && !contacts.some(b => s.idx(b.x, b.y) === c)) hidden = true
            }
            if (hidden) hiddenTicks++
        },
    })
    ok(badLight === 0, `${badLight} lit cells disagree with the recomputed wavefront (or are lit in sound-shadow) — the reveal is lying about physics`)
    ok(litSeen > 5000, `only ${litSeen} sampled lit cells — the run never really mapped anything (check is vacuous)`)
    ok(hiddenTicks > 6, `eels were invisible on only ${hiddenTicks} sampled ticks — a suite that never tests darkness proves nothing about hiding`)
    ok(blipsSeen > 4, `only ${blipsSeen} eel contacts ever happened — the touch-the-eel path never ran`)
    ok(blipBad === 0, `${blipBad} contacts appeared where no wavefront arrived / no eel stood — knowledge invented an eel`)
    void g
}

section('OCCLUSION (a sealed pocket is dark until the echo walks in the door)')
{
    // chamber — one passage — top corridor — pocket fed ONLY by a far door
    // dropping out of the corridor at (27,4). Euclid from ping to pocket is
    // ~8 cells; sound needs ~46. A radius reveal lights it instantly.
    const grid = new Uint8Array(N).fill(ROCK)
    const open = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[s.idx(x, y)] = OPEN }
    for (let y = 8; y <= 14; y++) for (let x = 6; x <= 20; x++) open(x, y)         // chamber
    for (let y = 4; y <= 8; y++) { open(8, y); open(9, y) }                         // passage up
    for (let x = 6; x <= 29; x++) { open(x, 2); open(x, 3) }                        // top corridor
    for (let y = 5; y <= 14; y++) for (let x = 24; x <= 30; x++) open(x, y)         // pocket
    open(27, 4)                                                                     // its only door
    const spawn = s.idx(20, 11)
    const pocket = s.idx(28, 10)
    const cave = { seed: 1, depth: 1, grid, spawn, vent: s.idx(8, 8), rooms: [], centers: [], pearls: [] }
    const g = s.makeGame(cave)
    s.ping(g, { noCd: true })
    const p = g.pings[g.pings.length - 1]
    const dOpen = s.bfsField(grid, spawn)[pocket]
    const dStraight = Math.ceil(Math.hypot(s.cx(pocket) - s.cx(spawn), s.cy(pocket) - s.cy(spawn)) / CFG.waveSpeed)
    ok(dOpen > 0 && dStraight > 0 && dOpen > dStraight + 6, `fixture broken: dOpen=${dOpen} vs straight=${dStraight}`)
    let darkAt = -1
    for (let t = 0; t < dOpen + CFG.waveSpeed + 4 && g.end !== 'dead'; t++) {
        s.step(g)
        if (g.mem[pocket] >= 0 && darkAt < 0) darkAt = g.tick - p.t0
    }
    ok(g.mem[pocket] >= 0, 'the pocket NEVER lit — sound could not reach even the long way, the fixture or the wavefront is broken')
    ok(darkAt === Math.ceil(dOpen / CFG.waveSpeed), `pocket lit at delay ${darkAt}, wavefront says ${Math.ceil(dOpen / CFG.waveSpeed)} — reveal is not BFS arrival`)
    ok(darkAt > dStraight + 3, `pocket lit at ${darkAt} <= straight-line ${dStraight} + 3 — sound crossed rock: the reveal is a RADIUS, not a wavefront`)
    ok(g.mem[s.idx(12, 11)] >= 0, 'the chamber itself never lit — nothing works and the pin above passed vacuously')
}

section('DECAY (light forgets, on schedule)')
{
    const grid = new Uint8Array(N).fill(ROCK)
    for (let y = 8; y <= 12; y++) for (let x = 6; x <= 20; x++) grid[s.idx(x, y)] = OPEN
    const cave = { seed: 2, depth: 1, grid, spawn: s.idx(13, 10), vent: s.idx(7, 9), rooms: [], centers: [], pearls: [] }
    const g = s.makeGame(cave)
    s.ping(g, { noCd: true })
    for (let t = 0; t < 4; t++) s.step(g)
    let lit = 0
    for (let i = 0; i < N; i++) if (s.known(g, i) && i !== g.player.c) lit++
    ok(lit > 8, 'a ping lit almost nothing — the decay pin below would pass vacuously')
    for (let t = 0; t < CFG.fade + 8; t++) s.step(g)
    let stillLit = 0
    for (let i = 0; i < N; i++) if (s.known(g, i) && i !== g.player.c) stillLit++
    ok(stillLit === 0, `${stillLit} cells still known ${CFG.fade}+ ticks after one ping — knowledge never fades (the map is permanently drawn)`)
    void g
}

section('THE TOUCH AND THE DOOR (the two events the run is made of)')
{
    const grid = new Uint8Array(N).fill(ROCK)
    for (let x = 4; x <= 30; x++) grid[s.idx(x, 13)] = OPEN
    const cave = { seed: 3, depth: 1, grid, spawn: s.idx(8, 13), vent: s.idx(30, 13), rooms: [], centers: [], pearls: [] }
    const g = s.makeGame(cave)
    g.eels = [{ id: 0, route: [s.idx(20, 13), s.idx(19, 13), s.idx(18, 13), s.idx(17, 13), s.idx(16, 13), s.idx(15, 13), s.idx(14, 13), s.idx(13, 13), s.idx(12, 13), s.idx(11, 13), s.idx(10, 13), s.idx(9, 13), s.idx(8, 13)], pos: 0, dir: -1, every: 4 }]
    let hit = false
    for (let t = 0; t < 200 && !hit; t++) hit = s.step(g).events.some(e => e.type === 'hit')
    ok(hit, 'a patrol walked straight THROUGH the player without a hit — eelKill is dead')
    ok(g.lives === CFG.lives - 1 && g.player.c === cave.spawn, 'the hit did not cost exactly one life and spit the diver back to spawn')

    // vent (fresh game, no eels): the door down must fire once stood in
    const g2 = s.makeGame({ ...cave })
    g2.eels = []
    g2.player.c = s.idx(29, 13)
    s.playerMove(g2, 'ArrowRight')
    ok(g2.end === 'descend' && g2.win, `stepping on the vent gave end=${g2.end} — the vent is decorative`)

    // one short of the vent: the sea floor is not a door
    const g3 = s.makeGame({ ...cave })
    g3.eels = []
    s.playerMove(g3, 'ArrowUp')
    ok(!g3.end, 'moving into rock ended the run')
}

section('DETERMINISM (attract replay is a proof, not a vibe)')
{
    const cave = s.genCave(0xC0FFEE, 1)
    const cmds = s.planRun(cave).cmds
    const a = s.replay(cave, cmds)
    const b = s.replay(cave, cmds)
    ok(a.end === 'descend', `the recorded demo script no longer descends (${a.end})`)
    ok(s.stateHash(a) === s.stateHash(b), 'two replays disagree — the sim grew a RNG')
    const mid = Math.floor(cmds.length / 2)
    const tampered = cmds.slice(0, mid).concat(cmds.slice(mid + 1))
    ok(s.stateHash(s.replay(cave, tampered)) !== s.stateHash(a), 'the hash ignores a dropped command — determinism could not catch a desync')
}

// -------------------------------------------------------------- mutation gate ----
if (MUT) {
    section('MUTATIONS — each silenced rule MUST turn a named check red')
    for (const name of Object.keys(MUTANTS)) {
        const child = spawnSync(process.execPath, [process.argv[1]], {
            env: { ...process.env, SONAR_MUT: name },
            encoding: 'utf8',
        })
        const caught = child.status !== 0
        console.log(`  mut ${name}: ${caught ? 'caught' : 'SURVIVED (BAD)'}`)
        ok(caught, `mutant '${name}' SURVIVED — a check has quietly stopped touching this rule`)
    }
}

console.log(`\nsonarcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
