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
//   DISTANCE CUE contacts carry the ring (wavefront delay) that touched them;
//                heat/pitch maps it monotonically near→hot (#2365), and the
//                paint path still cannot reach a live eel cell.
//   VENT SIGNAL  #2367: the swirl ripples only while vent knowledge is FRESH
//                (a front landed within CFG.swirlFresh ticks), sits as a dim
//                ghost while merely remembered, and the painter gates the whole
//                thing through ventSignal(); a faint expanding ring per ping
//                teaches ring→distance in pixels.
//   PEARL MEMORY #2594: the same fixed-feature doctrine applied to the prize —
//                a pearl once heard stays a dim ghost past the fade until taken,
//                never-heard pearls stay dark, and re-hearing refreshes.
//   FRESH START  #2589: mode flips BEFORE loadDepth at both entry points —
//                called the other way, a seed shaped like the fallback layout
//                inherits the attract replay (pre-lit map, tick ≈ join).
//   DEATH/DESCEND  a touching eel takes a life; the vent takes you down.
//   DETERMINISM  replays match, a dropped command does not (tamper probe).
//   MUTATIONS    ten rules silenced in children, each must turn a NAMED check
//                red, or a check has stopped touching its rule.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import * as s from '../src/games/Sonar/sim.js'
import { plant, pull } from './lib/mutateguard.mjs'

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
    cue: 'distance cue frozen — every contact reads the same nearness; the ring→heat map is dead',
    ventRipple: 'the vent swirl ignores freshness — remembered exits ripple forever and the front stops teaching',
    attractJoin: 'the attract showcase join disabled — the demo starts cold at tick 0 and a five-second viewer never sees a hot mark (#2383)',
    pearlGhost: 'remembered pearls fade to black — the prize is forgotten while the exit is not; fixed-feature recall is dead (#2594)',
    pearlEcho: 're-hearing a ghosted pearl is silent — the audio channel drops the fresh/remembered distinction the pixels make (#2601)',
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

section('DISTANCE CUE (the ring that touched the eel reads as nearness, #2365)')
{
    // The pure mapping first: hot near, cold far, strictly monotonic across the
    // whole cue range, clamped at both ends. Under SONAR_MUT=cue the map is
    // frozen at 0.5 and the strict check goes red BY NAME.
    ok(CFG.cueRange > 2, `cueRange=${CFG.cueRange} too small to read a gradient`)
    ok(s.contactHeat(0) === 1, 'ring 0 (touched at the source) is not max heat — the map does not top out hot')
    ok(Math.abs(s.contactHeat(CFG.cueRange) - 0.12) < 1e-9, 'farthest ring is not the floor — the map does not bottom out cold')
    let mono = true, strict = true
    for (let r = 0; r <= CFG.cueRange + 6; r++) {
        const a = s.contactHeat(r), z = s.contactHeat(r + 1)
        if (z > a) mono = false
        if (r < CFG.cueRange && !(z < a)) strict = false
    }
    ok(mono, 'heat grows with ring distance — a far eel would read hotter than a near one')
    ok(strict, 'heat is flat somewhere inside cueRange — the cue does not actually read distance')
    ok(Math.abs(s.contactHeat(9999) - 0.12) < 1e-9, 'past-range rings escape the floor — the scale is unbounded')
    ok(Math.abs(s.contactHeat(null) - 0.5) < 1e-9 && Math.abs(s.contactHeat(-1) - 0.5) < 1e-9, 'ringless contacts do not read neutral')

    // Ring CAPTURE: every fresh blip carries the same wavefront delay an
    // independent BFS from the emitting ping recomputes — the same grading the
    // INTEGRITY section applies to cell lighting, now applied to nearness.
    const cave = s.genCave(0xC0FFEE, 2)
    const plan = s.planRun(cave).cmds
    const pings = []
    let ringBad = 0, ringSeen = 0, evtBad = 0, evtsSeen = 0
    const grids = new Map()
    s.replay(cave, plan, {
        onTick: (gg) => {
            for (const p of gg.pings) if (!pings.includes(p)) pings.push(p)
            for (const b of gg.blips) {
                if (b.t !== gg.tick) continue
                ringSeen++
                if (typeof b.ring !== 'number' || b.ring < 0) { ringBad++; continue }
                const c = s.idx(b.x, b.y)
                if (!grids.has(pings.length)) grids.set(pings.length, pings.map(p => s.bfsField(gg.grid, p.src)))
                const fields = grids.get(pings.length)
                const match = pings.some((p, pi) => gg.tick - p.t0 === b.ring
                    && fields[pi][c] >= 0 && Math.ceil(fields[pi][c] / CFG.waveSpeed) === b.ring)
                if (!match) ringBad++
            }
            // the echo event rides with the blip: a fresh contact must also
            // appear as a 'contact' event with the same ring (sound channel).
            const fresh = gg.blips.filter(b => b.t === gg.tick)
            for (const ev of gg.events.filter(e => e.type === 'contact')) {
                evtsSeen++
                if (!fresh.some(b => b.ring === ev.ring)) evtBad++
            }
        },
    })
    ok(ringSeen > 4, `only ${ringSeen} contacts sampled — the ring-capture pin never ran (vacuous)`)
    ok(ringBad === 0, `${ringBad} contacts carry a ring that disagrees with the recomputed wavefront arrival — the distance cue is lying about physics`)
    ok(evtsSeen > 4, `only ${evtsSeen} contact events fired — the echo channel never ran`)
    ok(evtBad === 0, `${evtBad} contact events disagree with their blip's ring — sound and heat would disagree about nearness`)

    // Painter law (#2365): the shell derives heat from the CONTACT's ring and
    // still cannot reach a live eel cell from the draw path.
    const cueJsx = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    const paintAt = cueJsx.indexOf('const paint = ')
    const paintSrc = cueJsx.slice(paintAt, paintAt + cueJsx.slice(paintAt).indexOf('const hud ='))
    ok(paintSrc.length > 500, 'paint source slice found')
    ok(/contactHeat\(b\.ring\)/.test(paintSrc), 'painter does not derive mark heat from the contact ring — the cue is decoration elsewhere')
    ok(!/eelCell\(|gs\.eels\b/.test(paintSrc), 'the paint path reaches a LIVE eel cell — knowledge law broken')
}

section('VENT SIGNAL (fresh knowledge ripples, remembered knowledge ghosts, #2367)')
{
    ok(CFG.swirlFresh >= 3, `swirlFresh=${CFG.swirlFresh} too short to read as a ripple at 60 fps`)
    ok(CFG.swirlFresh < CFG.fade, `swirlFresh=${CFG.swirlFresh} outlives the fade window — ghost state unreachable`)

    // deterministic corridor: spawn at one end, vent at the other, no eels.
    // The wavefront arrival tick is computable, so the three vent states and
    // their exact boundaries are pinned, not sampled.
    const grid = new Uint8Array(N).fill(ROCK)
    for (let x = 4; x <= 30; x++) grid[s.idx(x, 13)] = OPEN
    const cave = { seed: 4, depth: 1, grid, spawn: s.idx(4, 13), vent: s.idx(30, 13), rooms: [], centers: [], pearls: [] }
    const arrival = Math.ceil(s.bfsField(grid, s.idx(4, 13))[s.idx(30, 13)] / CFG.waveSpeed)

    const g = s.makeGame(cave)
    g.eels = []
    ok(s.ventSignal(g) === 0, 'the swirl lights for an exit no sound has ever reached — the vent leaks truth')
    s.ping(g, { noCd: true })
    let firstRipple = -1, firstGhost = -1, wentDark = -1
    for (let t = 0; t <= arrival + CFG.fade + 8; t++) {
        s.step(g)
        const sig = s.ventSignal(g)
        if (sig === 2 && firstRipple < 0) firstRipple = g.tick
        if (sig === 1 && firstRipple >= 0 && firstGhost < 0) firstGhost = g.tick
        if (firstGhost >= 0 && sig === 0 && wentDark < 0) wentDark = g.tick
    }
    ok(firstRipple === arrival, `ripple began at tick ${firstRipple}, wavefront says ${arrival} — the swirl does not ride the front`)
    ok(firstGhost === arrival + CFG.swirlFresh + 1, `ghost began at tick ${firstGhost}, freshness law says ${arrival + CFG.swirlFresh + 1} — remembered exits still ripple (or never settle)`)
    ok(wentDark === arrival + CFG.fade + 1, `vent went dark at tick ${wentDark}, fade law says ${arrival + CFG.fade + 1} — the ghost outlived its memory`)

    // re-hearing: a second ping, fired while the vent is GHOST, must lift it
    // back to rippling — the exit teaches again every time sound confirms it.
    const g2 = s.makeGame(cave)
    g2.eels = []
    s.ping(g2, { noCd: true })
    for (let t = 0; t < arrival + CFG.swirlFresh + 2; t++) s.step(g2)
    ok(s.ventSignal(g2) === 1, `expected ghost before the re-ping, got signal ${s.ventSignal(g2)} — fixture drifted`)
    s.ping(g2, { noCd: true })
    let reheard = false
    for (let t = 0; t <= arrival + 1; t++) { s.step(g2); if (s.ventSignal(g2) === 2) reheard = true }
    ok(reheard, 'a second wavefront never revived the swirl — re-confirmation is dead, the ghost never ripples again')

    // painter law (#2367): the swirl gates through ventSignal(), the old
    // always-on known(gs, vent) call is gone, and the ping ring draws from the
    // live ping list. Static like the #2365 cue law above; a planted mutant
    // below proves the regex actually bites.
    const jsx = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    const paintAt = jsx.indexOf('const paint = ')
    const pSrc = jsx.slice(paintAt, paintAt + jsx.slice(paintAt).indexOf('const hud ='))
    ok(/ventSignal\(gs\)/.test(pSrc), 'the painter does not gate the swirl through ventSignal — freshness is decoration elsewhere')
    ok(!/known\(gs, gs\.vent\)/.test(pSrc), 'the painter still draws the swirl straight off known() — the old always-on vent is back')
    ok(/gs\.pings/.test(pSrc) && /p\.maxK/.test(pSrc), 'no expanding wavefront ring is drawn from the live pings — the ring→distance teach is missing')
    ok(/arc\(sx, sy, lead \* CFG\.waveSpeed \* TS/.test(pSrc), 'the live ping ring never strokes an arc at the wavefront radius — the ring is declared but not drawn')
    ok(!/eelCell\(|gs\.eels\b/.test(pSrc), 'the paint path reaches a LIVE eel cell — knowledge law broken')
}

section('FRESH START (the order law, #2589)')
{
    // #2589 fingerprint, computed: the nightlybot's seed joins the demo replay
    // at exactly tick 152 — the reported "started at tick 152" was NOT phantom
    // time, it was the attract state leaking into a fresh start because the
    // shell called loadDepth while the screen ref still said 'attract'. The
    // order law (mode BEFORE depth) is pinned statically below; this pin
    // records that the hazard is real sim geometry, so the fix has a number.
    ok(s.attractJoinAt(s.genCave(20261135 >>> 0, 1), s.planRun(s.genCave(0xC0FFEE, 1)).cmds) === 152,
        '#2589 fingerprint moved — seed 20261135 no longer joins at tick 152; re-read the order-law comment before trusting fresh-start checks')

    // order law, statically pinned: both entry points must set mode BEFORE
    // loadDepth, or loadDepth's attract branch re-seats the demo replay.
    const jsxO = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    const sp = jsxO.slice(jsxO.indexOf('const startPlay'), jsxO.indexOf('const onDown'))
    ok(sp.indexOf("setMode('play')") >= 0 && sp.indexOf("setMode('play')") < sp.indexOf('loadDepth(1, true)'),
        "startPlay calls loadDepth while the screen ref still says attract — #2589's pre-lit fresh start is back")
    const rb = jsxO.slice(jsxO.indexOf('reset: (s) =>'), jsxO.indexOf('tick: (pad) =>'))
    ok(rb.indexOf("setMode('play')") >= 0 && rb.indexOf("setMode('play')") < rb.indexOf('loadDepth(1, true)'),
        "exposeGame reset calls loadDepth while the screen ref still says attract — reset(seed) no longer starts at tick 0")
}

section('PEARL MEMORY (heard pearls stay remembered until taken, #2594)')
{
    // same deterministic corridor as the vent section: spawn (4,13), pearl on
    // the route, vent at the far end (never stood on here). Arrival ticks are
    // computed, so every state boundary is pinned, not sampled.
    const grid = new Uint8Array(N).fill(ROCK)
    for (let x = 4; x <= 30; x++) grid[s.idx(x, 13)] = OPEN
    const pearl = s.idx(22, 13)
    const cave = { seed: 40, depth: 1, grid, spawn: s.idx(4, 13), vent: s.idx(30, 13), rooms: [], centers: [], pearls: [pearl] }
    const arrival = Math.ceil(s.bfsField(grid, s.idx(4, 13))[pearl] / CFG.waveSpeed)

    // never-heard: the pearl is in the game object at tick 0 (truth) and on
    // the canvas must be NOTHING (knowledge) — the ghost cannot leak.
    const g = s.makeGame(cave)
    g.eels = []
    ok(g.pearls[0] === pearl, 'pearl fixture drifted')
    ok(s.pearlSignal(g, 0) === 0, 'a pearl glows for an ear no sound ever carried to it — pearl memory leaks truth')

    let firstFresh = -1, firstGhost = -1, wentDark = -1, firstRunEcho = false
    s.ping(g, { noCd: true })
    for (let t = 0; t <= arrival + CFG.fade * 3 + 8; t++) {
        s.step(g)
        if (g.events.some(e => e.type === 'pearlEcho')) firstRunEcho = true
        const sig = s.pearlSignal(g, 0)
        if (sig === 2 && firstFresh < 0) firstFresh = g.tick
        if (sig === 1 && firstFresh >= 0 && firstGhost < 0) firstGhost = g.tick
        if (firstGhost >= 0 && sig === 0 && wentDark < 0) wentDark = g.tick
    }
    ok(!firstRunEcho, 'the FIRST hearing rang the low-memory tone — the tone is for the ghost coming back, not the first glimpse (#2601)')
    ok(firstFresh === arrival, `pearl painted fresh at tick ${firstFresh}, wavefront says ${arrival} — freshness does not ride the front`)
    ok(firstGhost === arrival + CFG.fade + 1, `ghost began at tick ${firstGhost}, fade law says ${arrival + CFG.fade + 1} — remembered treasure flickers at the wrong boundary`)
    ok(wentDark < 0, `remembered pearl went black at tick ${wentDark} — the exit keeps its ghost but the prize forgets itself (#2594 persistence is dead)`)

    // re-hearing revives: while GHOST, a fresh ping must paint it bright again.
    const g2 = s.makeGame(cave)
    g2.eels = []
    s.ping(g2, { noCd: true })
    for (let t = 0; t < arrival + CFG.fade + 2; t++) s.step(g2)
    ok(s.pearlSignal(g2, 0) === 1, `expected ghost before the re-ping, got signal ${s.pearlSignal(g2, 0)} — fixture drifted`)
    s.ping(g2, { noCd: true })
    let revived = false, echoTick = -1
    for (let t = 0; t <= arrival + 1; t++) { s.step(g2); if (echoTick < 0 && g2.events.some(e => e.type === 'pearlEcho')) echoTick = g2.tick; if (s.pearlSignal(g2, 0) === 2) revived = true }
    ok(revived, 'a second wavefront never refreshed the pearl mark — re-confirmation is dead for the prize')
    // #2601 — the audio channel carries the dim→bright flip: ONE low-memory
    // tone, on the re-arrival front's tick. Computed, not sampled: the second
    // ping fires at tick arrival+fade+2 (the ghost is one tick past the fade
    // edge), and the front walks the same `arrival` rings to the pearl.
    const reArrival = (arrival + CFG.fade + 2) + arrival
    ok(echoTick === reArrival, `pearlEcho rang at tick ${echoTick}, the re-arrival front says ${reArrival} — the low-memory tone does not ride the front (#2601)`)

    // a ghost is still a prize: walk into a remembered pearl and it banks.
    const g3 = s.makeGame(cave)
    g3.eels = []
    s.ping(g3, { noCd: true })
    for (let t = 0; t < arrival + CFG.fade + 2; t++) s.step(g3)
    ok(s.pearlSignal(g3, 0) === 1, 'fixture drifted before the ghost-collection walk')
    let walked = true
    for (let k = 0; k < 18; k++) if (!s.playerMove(g3, 'ArrowRight')) walked = false
    ok(walked && g3.player.c === pearl, 'the ghost-collection walk never reached the remembered cell')
    // pickup banks +50 and all-collect +150 (pre-existing rules); the ghost
    // must clear at any memory state.
    ok(g3.have === 1 && g3.score === 200 && s.pearlSignal(g3, 0) === 0, `ghost pickup wrong: have=${g3.have} score=${g3.score} sig=${s.pearlSignal(g3, 0)} — taken must clear at any memory state (50 pickup + 150 completion, unchanged)`)

    // #2601 — and never on an ordinary re-light: a pearl that is STILL fresh
    // when a second front lands is re-confirmed, not revived.
    const g4 = s.makeGame(cave)
    g4.eels = []
    s.ping(g4, { noCd: true })
    for (let t = 0; t < arrival + 1; t++) s.step(g4)
    ok(s.pearlSignal(g4, 0) === 2, 'g4 fixture drifted — the pearl is not still fresh when the second front arrives')
    s.ping(g4, { noCd: true })
    let freshEcho = false
    for (let t = 0; t <= arrival + 1; t++) { s.step(g4); if (g4.events.some(e => e.type === 'pearlEcho')) freshEcho = true }
    ok(!freshEcho, 'a FRESH pearl rang the low-memory tone — the tone must mark the dim→bright flip, not an ordinary re-light (#2601)')

    // #2601 — static: the shell must ring the tone. A sim event nobody plays
    // is a silence the pixels pretend to explain.
    const jsxP = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    ok(/pearlEcho[\s\S]{0,80}playTone\(155/.test(jsxP), 'the ghost-revive tone is not wired in the shell — pearlEcho events go unplayed (#2601)')

    // knowledge law, replayed live: across the full demo every pearl that
    // lights does so as FRESH (sig 2), the ghost never sits on a never-heard
    // cell, and two replays agree tick for tick. Why no ghosts in the demo:
    // sound outruns the diver — greedy-route pearls are banked well inside
    // the fade, and the descent restarts memory. Organic ghosting is the
    // wait-and-return scenario pinned deterministically below.
    const cave2 = s.genCave(0xC0FFEE, 2)
    const gg0 = s.makeGame(cave2)
    const fresh0 = gg0.pearls.map((c, i) => s.pearlSignal(gg0, i))
    ok(fresh0.every(v => v === 0), 'some pearl is visible before the first ping on a real cave — the dark is leaking')
    let ghostBad = 0, ghostsSeen = 0, sigBad = 0, freshSeen = 0
    const traceA = [], traceB = []
    const traceTick = (acc) => (gg) => {
        const sig = gg.pearls.map((c, i) => s.pearlSignal(gg, i))
        acc.push(sig.join(''))
        for (let i = 0; i < gg.pearls.length; i++) {
            const c = gg.pearls[i]
            if (sig[i] === 1) { ghostsSeen++; if (gg.mem[c] < 0) ghostBad++ }
            if (sig[i] === 2) freshSeen++
            if (sig[i] === 2 && !s.known(gg, c)) sigBad++
        }
    }
    s.replay(cave2, s.planRun(cave2).cmds, { onTick: traceTick(traceA) })
    s.replay(cave2, s.planRun(cave2).cmds, { onTick: traceTick(traceB) })
    ok(freshSeen > 100, `only ${freshSeen} fresh-pearl ticks across the demo — pearls barely light on the run (vacuous coverage)`)
    ok(ghostsSeen === 0, `${ghostsSeen} ghost-pearl ticks in the greedy demo — a remembered pearl outlived its fade here, breaking the attract determinism claim (re-measure before believing)`)
    ok(ghostBad === 0, `${ghostBad} ghost pearls sit on cells no sound ever reached — the glint is inventing knowledge`)
    ok(sigBad === 0, `${sigBad} fresh pearls were painted where knowledge says dark — fresh gate broken`)
    ok(traceA.join('|') === traceB.join('|'), 'two replays disagree about pearl memory — the ghost is not deterministic')

    // painter law: the shell gates the prize through pearlSignal, keeps a
    // distinct remembered rendering, and still cannot reach live eel truth.
    const jsx = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    const paintAt = jsx.indexOf('const paint = ')
    const pSrc = jsx.slice(paintAt, paintAt + jsx.slice(paintAt).indexOf('const hud ='))
    ok(/pearlSignal\(gs, ?i\)/.test(pSrc), 'the painter does not gate pearls through pearlSignal — #2594 is decoration elsewhere')
    ok(/sig === 2/.test(pSrc) && /rgba\(255,190,225/.test(pSrc), 'the painter has no distinct remembered rendering — fresh and ghost would look identical')
    ok(!/gs\.taken\[i\] \|\| !known\(gs, ?c\)/.test(pSrc), 'the old known()-only pearl draw is back — remembered prizes vanish at the fade again')
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

// ------------------------------------------------------------ showcase #2383 ----
// The attract joins its proven replay ATTRACT_LEAD ticks before the first
// NEAR (ring ≤ 5) contact, so a five-second viewer sees what a hot mark is.
// The join is only honest if the contact it aims at is real: pin that every
// demo depth has one, that the join sits before it (never after — no aiming
// at a contact already consumed), and that on the shallow depths the gap the
// join covers was real (nothing near happens in the first three seconds).
section('ATTRACT SHOWCASE (a near contact within seconds, honestly)')
{
    ok(s.NEAR_RING <= 5, `NEAR_RING=${s.NEAR_RING} — marks that hot paint red, the cue must match the painter`)
    for (let depth = 1; depth <= 4; depth++) {
        const cave = s.genCave(0xC0FFEE, depth)
        const cmds = s.planRun(cave).cmds
        const hot = s.firstNearContact(cave, cmds)
        ok(hot > 0, `d${depth}: the demo route never touches an eel on a NEAR ring — the showcase has nothing to show`)
        const join = s.attractJoinAt(cave, cmds)
        ok(join >= 0 && join < hot, `d${depth}: join ${join} does not sit before the near contact at ${hot}`)
        ok(hot - join <= s.ATTRACT_LEAD, `d${depth}: near contact lands ${hot - join} ticks after the join — more than ${s.ATTRACT_LEAD}, a five-second viewer misses it`)
        if (depth <= 2) {
            // On the shallow demo depths nothing near happens in the first
            // ATTRACT_LEAD ticks from tick 0 — this is exactly the gap the
            // join exists to cover. If this goes false, the route changed and
            // the join's raison d'être must be re-measured, not assumed.
            ok(hot > s.ATTRACT_LEAD, `d${depth}: a near contact already lands at tick ${hot} without the join — re-measure why it leads ${s.ATTRACT_LEAD}`)
        }
    }
    // the join changes no commands: the script it fast-forwards through is
    // still the full proven route, ending in the same descent.
    const cave = s.genCave(0xC0FFEE, 1)
    const cmds = s.planRun(cave).cmds
    const join = s.attractJoinAt(cave, cmds)
    const g = s.replay(cave, cmds, { maxTicks: join })
    ok(!g.end && g.tick === join, `fast-forwarding to the join ended the demo early (end=${g.end} tick=${g.tick}/${join})`)
    ok(s.known(g, g.player.c), 'the diver cell was not known at the join — the view would start in ground')
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


// ------------------------------------------------------------- attract rule 6 ----
// ART.md rule 6 (#365): the attract shows ONE informational message at a
// time, cycling, over a dimmed demo — never a stacked tagline + rules wall.
// attract.js is the copy the shell actually renders, so this audit cannot rot
// away from the pixels.
section('attract (rule 6)')
{
    const { MESSAGES, PRESS } = await import('../src/games/Sonar/attract.js')
    ok(MESSAGES.length >= 2, 'attract cycles through more than one message')
    ok(new Set(MESSAGES).size === MESSAGES.length, 'attract messages are unique')
    ok(MESSAGES.every((m) => m.length <= 44), 'no attract message wraps a narrow pane')
    ok(!!PRESS, 'attract keeps its press prompt')
    const jsx = readFileSync(new URL('../src/games/Sonar/index.jsx', import.meta.url), 'utf8')
    const block = jsx.slice(jsx.indexOf("{screen === 'attract'"), jsx.indexOf("{screen === 'over'"))
    ok(block.length > 0, 'the attract block exists')
    ok(!/<br/.test(block), 'the attract stacks no hard line breaks')
    // #1637 batch 14: the attract also carries the shared #1654 WATCH hint —
    // as a <div>, so the press-prompt-stays-alone law still bites.
    ok((block.match(/<p\b/g) || []).length === 1, 'the attract draws exactly one <p> (the press prompt)')
    ok(/WATCH_ATTRACT_HINT/.test(block), 'the attract carries the shared WATCH hint line')
    ok(/<AttractMessage\b[^>]*messages=\{MESSAGES\}/.test(block), 'rules ride the cycling <AttractMessage>')
    ok(/bg-black\/[45]\d/.test(block), 'the attract dims the demo')
}
if (MUT) {
    const jsxPath = new URL('../src/games/Sonar/index.jsx', import.meta.url).pathname
    const copyPath = new URL('../src/games/Sonar/attract.js', import.meta.url).pathname
    const jsxOrig = readFileSync(jsxPath, 'utf8')
    const copyOrig = readFileSync(copyPath, 'utf8')
    const attractMutants = [
        ['attract stacks a second message', jsxPath, jsxOrig,
            'animate-pulse">{PRESS}</p>',
            'animate-pulse">{PRESS}</p>\n                    <p>ANOTHER RULE LINE STACKED</p>'],
        ['an attract message wraps the pane', copyPath, copyOrig,
            "'PEARLS SCORE · THE TEAL SWIRL DESCENDS',",
            "'PEARLS SCORE, THE TEAL SWIRL IS THE VENT TO THE NEXT DEPTH, EELS ARE REAL',"],
        ['the attract stops dimming the demo', jsxPath, jsxOrig,
            'bg-black/55 flex flex-col',
            'bg-transparent flex flex-col'],
    ]
    for (const [name, path, orig, from, to] of attractMutants) {
        if (!orig.includes(from)) { ok(false, `attract mutant anchor: ${name}`); continue }
        plant(path, orig.replace(from, to))
        try {
            const child = spawnSync(process.execPath, [process.argv[1]], { encoding: 'utf8' })
            ok(child.status !== 0, `attract mutant SURVIVED: ${name}`)
        } finally {
            pull(path)
        }
    }
}

if (MUT) {
    const simPath = new URL('../src/games/Sonar/sim.js', import.meta.url).pathname
    const simOrig = readFileSync(simPath, 'utf8')
    const cueMutants = [
        ['contacts forget which ring lit them — heat reads constant', simPath, simOrig,
            'g.blips.push({ x, y, t, id: e.id, ring })',
            'g.blips.push({ x, y, t, id: e.id, ring: 0 })'],
        ['the per-contact echo stops firing — sound stops carrying nearness', simPath, simOrig,
            "g.events.push({ type: 'contact', ring })",
            'void 0'],
    ]
    for (const [name, path, orig, from, to] of cueMutants) {
        if (!orig.includes(from)) { ok(false, `cue mutant anchor: ${name}`); continue }
        plant(path, orig.replace(from, to))
        try {
            const child = spawnSync(process.execPath, [process.argv[1]], { encoding: 'utf8' })
            ok(child.status !== 0, `cue mutant SURVIVED: ${name}`)
        } finally {
            pull(path)
        }
    }
}

if (MUT) {
    const jsxPath = new URL('../src/games/Sonar/index.jsx', import.meta.url).pathname
    const jsxOrig = readFileSync(jsxPath, 'utf8')
    const ringMutants = [
        ['the ping wavefront ring stops being drawn — ring→distance is sound-only again', jsxPath, jsxOrig,
            'ctx.beginPath(); ctx.arc(sx, sy, lead * CFG.waveSpeed * TS + 4, 0, Math.PI * 2); ctx.stroke()',
            'void 0'],
        ['the vent swirl reverts to always-on for any known cell (#2367 gap)', jsxPath, jsxOrig,
            'const sig = ventSignal(gs)',
            'const sig = known(gs, gs.vent) ? 2 : 0'],
        ['startPlay loads depth before flipping the mode — attract state leaks into fresh runs (#2589)', jsxPath, jsxOrig,
            "setMode('play')\n            loadDepth(1, true)",
            "loadDepth(1, true)\n            setMode('play')"],
        ['contract reset loads depth before flipping the mode — reset(seed) starts mid-replay (#2589)', jsxPath, jsxOrig,
            "setMode('play')\n                    loadDepth(1, true)",
            "loadDepth(1, true)\n                    setMode('play')"],
    ]
    for (const [name, path, orig, from, to] of ringMutants) {
        if (!orig.includes(from)) { ok(false, `vent-ring mutant anchor: ${name}`); continue }
        plant(path, orig.replace(from, to))
        try {
            const child = spawnSync(process.execPath, [process.argv[1]], { encoding: 'utf8' })
            ok(child.status !== 0, `vent-ring mutant SURVIVED: ${name}`)
        } finally {
            pull(path)
        }
    }
}

if (MUT) {
    const jsxPath = new URL('../src/games/Sonar/index.jsx', import.meta.url).pathname
    const jsxOrig = readFileSync(jsxPath, 'utf8')
    const pearlMutants = [
        ['the painter ignores pearlSignal — remembered pearls go black at the fade again (#2594 gap)', jsxPath, jsxOrig,
            'const sig = pearlSignal(gs, i)',
            'const sig = known(gs, gs.pearls[i]) ? 2 : 0'],
        ['the remembered glint stops being drawn — fresh and ghost collapse to one look', jsxPath, jsxOrig,
            "ctx.fillStyle = 'rgba(255,190,225,0.34)'",
            "ctx.fillStyle = 'rgba(255,220,240,0.85)'"],
        ['the ghost-revive tone goes silent — the shell drops the pearlEcho handler (#2601)', jsxPath, jsxOrig,
            "e.type === 'pearlEcho') audioController.playTone(155",
            "e.type === 'pearlEcho') /* silenced */"],
    ]
    for (const [name, path, orig, from, to] of pearlMutants) {
        if (!orig.includes(from)) { ok(false, `pearl mutant anchor: ${name}`); continue }
        plant(path, orig.replace(from, to))
        try {
            const child = spawnSync(process.execPath, [process.argv[1]], { encoding: 'utf8' })
            ok(child.status !== 0, `pearl mutant SURVIVED: ${name}`)
        } finally {
            pull(path)
        }
    }
}

console.log(`\nsonarcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
