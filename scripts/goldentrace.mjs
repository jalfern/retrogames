// GOLDENTRACE (#2402) — per-tick golden traces for the native Apple TV ports.
//
// Given a game + seed + scenario, this records a REAL `retrogames-rec/v1`
// run (pad streams written through the same fold the tab runs) and re-plays
// that file through the pure sim in Node, writing the full flattened,
// quantized state at EVERY tick as `retrogames-trace/v1` (scripts/lib/trace.mjs).
// The web game IS the spec: a tvOS port replays the same seed + pad stream
// and diffs its own dumps — `diff` names the first differing tick and field.
//
//   node scripts/goldentrace.mjs record                # regenerate all committed traces
//   node scripts/goldentrace.mjs record joust          # one game
//   node scripts/goldentrace.mjs trace path/to/rec.json [--out t.json]
//   node scripts/goldentrace.mjs diff golden.json port.json
//
// The trace of a recording is always the PAD-ONLY replay — the bot/plan that
// produced the pads never runs during trace capture, so what a port sees is
// exactly seed + pads (the retrogames-rec determinism law, #494).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { createRecorder, validate, decodePad } from '../src/utils/recording.js'
import { TRACE_FORMAT, buildTrace, flattenState, diffTraces } from './lib/trace.mjs'
import { makeGame, step, stateHash } from '../src/games/Joust/sim.js'
import { plan, planRider } from '../src/games/Joust/planner.js'
import { createSim, stepSim, hashState } from '../src/games/Emberwood/sim.js'
import { padToInput } from '../src/games/Emberwood/input.js'
import { TS, SW, SH, SCREENS } from '../src/games/Emberwood/world.js'
import { tilePath } from '../src/games/Emberwood/solver.js'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(here, '..', 'public', 'traces')

// #527 item 5 stamp law: a committed stamp must name a fetchable commit; on a
// feature branch the capture's own commit dies with the PR, so those stamp `unknown`.
const gitOut = (cmd) => {
    try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null }
    catch { return null }
}
const onMainLine = (() => {
    try { execSync('git merge-base --is-ancestor HEAD origin/main', { stdio: 'ignore' }); return true }
    catch { return false }
})()
const buildStamp = () => (onMainLine ? gitOut('git rev-parse HEAD') || 'unknown' : 'unknown')

// ----------------------------------------------------------- game adapters ----
// Each adapter owns the seat-pad -> sim-input fold (mirroring index.jsx) and
// the state/hash accessors. `excludes` are top-level state keys a port does
// not reproduce — justified per game in its README's traces section.
const GAMES = {
    joust: {
        excludes: ['events'],
        create(seed, players) { return { gs: makeGame({ players }), seed } },
        stepAll(ctx, pads) {
            const p1 = pads[0] || {}
            const inp = { l: !!p1.left, r: !!p1.right, f: !!p1.a }
            if (ctx.gs.players2 && pads[1]) {
                inp.l2 = !!pads[1].left; inp.r2 = !!pads[1].right; inp.f2 = !!pads[1].a
            }
            step(ctx.gs, inp)
        },
        hash: (ctx) => stateHash(ctx.gs),
        tick: (ctx) => ctx.gs.tick,
        state: (ctx) => ctx.gs,
    },
    emberwood: {
        excludes: ['fx'],
        create(seed) {
            return { sim: createSim(seed), prev: { a: false, b: false, b2: false, up: false, down: false }, seed }
        },
        stepAll(ctx, pads) { stepSim(ctx.sim, padToInput(pads[0] || {}, ctx.prev)) },
        hash: (ctx) => hashState(ctx.sim),
        tick: (ctx) => ctx.sim.tick,
        state: (ctx) => ctx.sim,
    },
}

const rawOf = (pad) => ({
    x: (pad.right ? 1 : 0) - (pad.left ? 1 : 0),
    y: (pad.down ? 1 : 0) - (pad.up ? 1 : 0),
})

// ------------------------------------------------------------- scenarios ----
// A scenario is {seed, players, ticks, kinds, pad(ctx, t) -> pads[]}.
// kinds: 'cpu' = the game's own autopilot, 'model' = this file's steerer,
// 'human' = a scripted keyboard sequence (the pad stream is what matters).

const joustPads = (gs, extra = null) => {
    const a = plan(gs)
    const p1 = { left: !!a.l, right: !!a.r, a: !!a.f }
    if (!gs.players2) return extra ? extra(p1) : [p1]
    const p2 = { left: !!a.l2, right: !!a.r2, a: !!a.f2 }
    return [p1, p2]
}

const SCENARIOS = {
    'joust-1p': {
        seed: 1, players: 1, ticks: 1300, kinds: ['cpu'],
        why: 'autopilot clears wave 1 and crosses the wave-2 banner (the level-change shape)',
        pad: (ctx) => joustPads(ctx.gs),
    },
    'joust-2p': {
        seed: 1, players: 2, ticks: 1100, kinds: ['cpu', 'cpu'],
        why: 'both seats on the planner — the two-seat pad contract; includes a seat-1 KO and the wave-2 banner',
        pad: (ctx) => joustPads(ctx.gs),
    },
    'joust-death': {
        seed: 1, players: 1, ticks: 900, kinds: ['human'],
        why: 'real-input glide off the ledge into lava: death, respawn, and the plan resuming',
        pad: (ctx, t) => {
            if (t >= 240 && t < 330) return [{ left: false, right: true, a: false }] // tilt + fall, no flap
            return joustPads(ctx.gs)
        },
    },
    'emberwood-roam': {
        seed: 7, players: 1, ticks: 900, kinds: ['model'],
        why: 'steered overworld travel across screen edges (the level-change shape)',
        pad: roamPad,
    },
    'emberwood-death': {
        seed: 7, players: 1, ticks: 1000, kinds: ['human'],
        why: 'walked into the vale until HP hit zero, then the A-press revive (death + revive contract)',
        pad: deathPad,
    },
}

// --- emberwood steerers (pure readers of sim state; they only emit pads) ---
const solveSt = (sim) => ({
    cracked: sim.flags.cracked, doors: sim.flags.doorsOpen, switches: sim.flags.switchesOn,
    chests: sim.flags.chestsOpen, flags: sim.flags, killed: sim.flags.killed,
})
const tileOf = (v) => Math.floor(v / TS)
const steerTo = (h, tx, ty, dz = 2) => ({
    right: h.x < tx - dz, left: h.x > tx + dz, down: h.y < ty - dz, up: h.y > ty + dz,
})
// an edge-exit tile must be pushed to: aim past the border so the sim's
// threshold (h.x <= 8 etc., #781) trips — a waypoint-center dead-zone can
// otherwise park the hero 1px short of the warp, forever.
const edgePush = (dir) => ({
    w: [2, null], e: [SW * TS - 2, null], n: [null, 2], s: [null, SH * TS - 2],
})[dir]
const DIRS = ['e', 'w', 'n', 's']
const BORDER = { e: SW - 1, w: 0, n: null, s: null }

function roamPad(ctx) {
    const sim = ctx.sim
    const s = SCREENS[sim.screen]
    const st = solveSt(sim)
    const h = sim.hero
    if (!ctx.route || ctx.route.screen !== sim.screen) {
        ctx.visited = ctx.visited || new Set()
        ctx.visited.add(sim.screen)
        // pick an exit direction not just used, whose border tile is walkable —
        // fresh destinations first so the chain actually roams, not ping-pongs
        const order = DIRS.filter((d) => s.exits && s.exits[d])
        order.sort((a, b) => (ctx.visited.has(s.exits[a].to) ? 1 : 0) - (ctx.visited.has(s.exits[b].to) ? 1 : 0))
        for (const dir of order) {
            if (ctx.lastDir === dir && order.length > 1) continue
            const targets = borderTiles(s, dir, st)
            for (const [bx, by] of targets) {
                const p = tilePath(sim.screen, [tileOf(h.x), tileOf(h.y)], [bx, by], st)
                if (p && p.length > 1 && p.length < 60) { ctx.route = { screen: sim.screen, dir, target: [bx, by] }; ctx.lastDir = dir; break }
            }
            if (ctx.route && ctx.route.screen === sim.screen) break
        }
    }
    if (!ctx.route || ctx.route.screen !== sim.screen) return [{}]
    const [bx, by] = ctx.route.target
    const p = tilePath(sim.screen, [tileOf(h.x), tileOf(h.y)], [bx, by], st)
    const wp = p && p.length > 1 ? p[1] : [bx, by]
    let tx = wp[0] * TS + TS / 2, ty = wp[1] * TS + TS / 2
    const [ex, ey] = edgePush(ctx.route.dir)
    if (ex !== null && tileOf(h.x) === bx) tx = ex
    if (ey !== null && tileOf(h.y) === by) ty = ey
    return [{ ...steerTo(h, tx, ty, 1) }]
}

function borderTiles(s, dir, st) {
    const { tileAt, isSolidTile } = worldFns
    const out = []
    if (dir === 'e' || dir === 'w') {
        const x = dir === 'e' ? SW - 1 : 0
        for (let y = 1; y < SH - 1; y++) {
            const ch = tileAt(s, x, y)
            if (!isSolidTile(ch) && ch !== 'C' && ch !== 'v') out.push([x, y])
        }
    } else {
        const y = dir === 'n' ? 0 : SH - 1
        for (let x = 1; x < SW - 1; x++) {
            const ch = tileAt(s, x, y)
            if (!isSolidTile(ch) && ch !== 'C' && ch !== 'v') out.push([x, y])
        }
    }
    void st
    // prefer tiles near the middle of the screen (the exit gap tends to be there)
    return out.sort((a, b) => (dir === 'e' || dir === 'w' ? Math.abs(a[1] - (SH / 2)) - Math.abs(b[1] - (SH / 2)) : Math.abs(a[0] - (SW / 2)) - Math.abs(b[0] - (SW / 2))))
}

// imported lazily to keep the world module single-source
import { tileAt as _tileAt, isSolidTile as _isSolid } from '../src/games/Emberwood/world.js'
const worldFns = { tileAt: _tileAt, isSolidTile: _isSolid }

function deathPad(ctx) {
    const sim = ctx.sim
    const h = sim.hero
    if (sim.death) {
        ctx.deathSeen = true
        if (sim.deathT > 95) return [{ a: true }] // revive (stepSim wants aPressed after 90)
        return [{}]
    }
    const st = solveSt(sim)
    let best = null, bd = 1e9
    for (const e of sim.enemies) {
        if (e.dead || e.hidden || e.boss) continue
        const d = Math.hypot(e.x - h.x, e.y - h.y)
        if (d < bd) { bd = d; best = e }
    }
    if (!best) return [{}] // stand and take an enemy's approach
    return [{ ...steerTo(h, best.x, best.y) }]
}

// ------------------------------------------------------- record + replay ----
function recordRun(name) {
    const sc = SCENARIOS[name]
    const gameName = name.split('-')[0]
    const game = GAMES[gameName]
    const ctx = game.create(sc.seed, sc.players)
    const rec = createRecorder({
        gameId: gameName, method: 'stick', seed: sc.seed, players: sc.players,
        build: buildStamp(), hashEvery: 30,
        sources: sc.kinds.map((k) => ({ kind: k })),
    })
    const notes = {}
    for (let t = 1; t <= sc.ticks; t++) {
        const pads = sc.pad(ctx, t) || []
        game.stepAll(ctx, pads)
        rec.addTick(pads.map((p) => p || {}), pads.map((p) => rawOf(p || {})), game.hash(ctx))
        observe(name, ctx, notes)
    }
    const file = rec.finish(game.hash(ctx))
    const bad = validate(file)
    if (bad) throw new Error(`${name}: recorder produced invalid file: ${bad}`)
    return { file, notes }
}

// Replay a recording pad-only and capture the full flattened state every tick.
function traceRun(gameName, file) {
    const game = GAMES[gameName]
    const bad = validate(file)
    if (bad) throw new Error(`invalid recording: ${bad}`)
    const ctx = game.create(file.seed, file.players)
    const perTick = []
    const hashes = []
    const want = new Map(file.hashes.map((x) => [x.t, x.h]))
    let divergence = null
    for (let t = 0; t < file.ticks; t++) {
        const pads = file.slots.map((s) => decodePad(s.pads[t], file.method))
        game.stepAll(ctx, pads)
        const flat = flattenState(game.state(ctx), game.excludes)
        const h = game.hash(ctx)
        flat.hash = h // the game's own hash rides every row: cheap divergence detection for ports
        perTick.push(flat)
        hashes.push(h)
        const t1 = t + 1
        if (!divergence && want.has(t1) && want.get(t1) !== hashes[t]) divergence = t1
    }
    if (divergence) throw new Error(`${gameName}: pad-only replay diverged from the recorded hash at tick ${divergence}`)
    return { perTick, hashes }
}

// scenario assertions — a committed trace must show the shape its name promises.
function observe(name, ctx, notes) {
    if (name === 'joust-1p' || name === 'joust-2p') {
        if (ctx.gs.wave > 0 && notes.waveBefore === undefined) notes.wave = ctx.gs.wave
    }
    if (name === 'joust-death') {
        if (ctx.gs.players[0].lives < 3) notes.lostLife = true
        if (ctx.gs.players[0].rider && ctx.gs.players[0].lives < 3) notes.respawned = true
    }
    if (name === 'emberwood-roam') {
        notes.screens = notes.screens || new Set()
        notes.screens.add(ctx.sim.screen)
    }
    if (name === 'emberwood-death') {
        if (ctx.sim.death) notes.death = true
        if (ctx.deathSeen && !ctx.sim.death && ctx.sim.hero.hp > 0) notes.revived = true
    }
}

const REQUIRED = {
    'joust-1p': (n) => n.wave !== undefined || 'never reached wave 2 (level change)',
    'joust-2p': (n) => n.wave !== undefined || 'never reached wave 2 (level change)',
    'joust-death': (n) => (n.lostLife && n.respawned) || 'no death + respawn observed',
    'emberwood-roam': (n) => n.screens.size >= 3 || `only visited ${n.screens.size} screens`,
    'emberwood-death': (n) => (n.death && n.revived) || 'no death + revive observed',
}

// --------------------------------------------------------------- drivers ----
function recordOne(name) {
    const { file, notes } = recordRun(name)
    const gameName = name.split('-')[0]
    const { perTick } = traceRun(gameName, file)
    const trace = buildTrace({
        game: gameName, rec: `${name}.json`, build: buildStamp(),
        seed: file.seed, players: file.players, ticks: file.ticks,
        excludes: GAMES[gameName].excludes,
    }, perTick)
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(file) + '\n')
    writeFileSync(join(OUT_DIR, `${name}.trace.json`), JSON.stringify(trace) + '\n')
    const req = REQUIRED[name](notes)
    if (req !== true) throw new Error(`${name}: shape assertion failed — ${req}`)
    const kb = (s) => (s.length / 1024).toFixed(0)
    console.log(`  wrote ${name}.json (${kb(JSON.stringify(file))}KB) + ${name}.trace.json (${kb(JSON.stringify(trace))}KB)`)
}

function traceFile(path, outPath) {
    const file = JSON.parse(readFileSync(path, 'utf8'))
    const { perTick } = traceRun(file.game, file)
    const trace = buildTrace({
        game: file.game, rec: basename(path), build: buildStamp(),
        seed: file.seed, players: file.players, ticks: file.ticks,
        excludes: GAMES[file.game].excludes,
    }, perTick)
    const out = outPath || path.replace(/\.json$/, '.trace.json')
    writeFileSync(out, JSON.stringify(trace) + '\n')
    console.log(`  wrote ${out} (${(JSON.stringify(trace).length / 1024).toFixed(0)}KB, ${trace.ticks} ticks, ${trace.fields.length} fields)`)
}

function diffFiles(aPath, bPath) {
    const a = JSON.parse(readFileSync(aPath, 'utf8'))
    const b = JSON.parse(readFileSync(bPath, 'utf8'))
    if (b.format !== TRACE_FORMAT || a.format !== TRACE_FORMAT) {
        console.error('both files must be retrogames-trace/v1')
        process.exit(2)
    }
    const d = diffTraces(a, b)
    if (d.ok) { console.log(`MATCH — ${a.game} ${a.ticks} ticks, every field every tick identical`); return }
    if (d.tick) {
        console.log(`DIVERGE at tick ${d.tick}, field "${d.field}": golden=${JSON.stringify(d.golden)} port=${JSON.stringify(d.port)}`)
    } else {
        console.log(`DIVERGE — ${d.why}`)
    }
    process.exit(1)
}

const argv = process.argv.slice(2)
const cmd = argv[0]
if (cmd === 'record') {
    const want = argv[1]
    const names = Object.keys(SCENARIOS).filter((n) => !want || n.startsWith(want))
    if (!names.length) { console.error(`unknown game/scenario: ${want}`); process.exit(2) }
    for (const n of names) recordOne(n)
    console.log('goldentrace: records + traces written')
} else if (cmd === 'trace') {
    if (!argv[1]) { console.error('usage: goldentrace.mjs trace <rec.json> [--out file]'); process.exit(2) }
    const oi = argv.indexOf('--out')
    traceFile(argv[1], oi >= 0 ? argv[oi + 1] : null)
} else if (cmd === 'diff') {
    if (!argv[1] || !argv[2]) { console.error('usage: goldentrace.mjs diff <golden.trace.json> <port.trace.json>'); process.exit(2) }
    diffFiles(argv[1], argv[2])
} else {
    console.log('usage: goldentrace.mjs record [game|scenario] | trace <rec.json> [--out f] | diff <golden> <port>')
    process.exit(cmd ? 2 : 0)
}
