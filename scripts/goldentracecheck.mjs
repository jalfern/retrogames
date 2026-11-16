// GOLDENTRACECHECK (#2402) — the traces that spec the Apple TV ports stay true.
//
// For every committed (recording, golden trace) pair in public/traces/:
//   validate the rec, honor the #527 stamp law, replay the pad stream through
//   the pure sim, and re-derive the trace — the fresh rows must be byte-equal
//   to the committed ones. A behaviour change in Joust or Emberwood goes RED
//   naming the first differing tick and field, so the shelf's traces stay a
//   trustworthy spec while the forge keeps polishing the web games.
//
//   node scripts/goldentracecheck.mjs              # green = traces fresh
//   node scripts/goldentracecheck.mjs --mutate    # plant a sim bug per game;
//                                                 # the freshness gate MUST go red
//
// Child mode (used by --mutate after planting a tracked file):
//   GOLDENCHECK_CHILD=1 node scripts/goldentracecheck.mjs   # replay+compare only

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validate, decodePad } from '../src/utils/recording.js'
import { buildTrace, flattenState, diffTraces, TRACE_FORMAT, QUANT } from './lib/trace.mjs'
import { Report } from './lib/harness.mjs'
import { plant, pull } from './lib/mutateguard.mjs'
import { makeGame, step, stateHash } from '../src/games/Joust/sim.js'
import { createSim, stepSim, hashState } from '../src/games/Emberwood/sim.js'
import { padToInput } from '../src/games/Emberwood/input.js'
import { step as gStep, stateHash as gHash } from '../src/games/Gauntlet/sim.js'
import { heroFromPad, p2FromPad, newGame as gNewGame } from './plaicraft-export.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DIR = join(here, '..', 'public', 'traces')
const r = new Report('goldentracecheck')
const MUTATE = process.argv.includes('--mutate')
const CHILD = process.env.GOLDENCHECK_CHILD === '1'

const EXPECT = [
    { rec: 'joust-1p.json', trace: 'joust-1p.trace.json', shape: 'autopilot wave-1 clear + wave-2 banner' },
    { rec: 'joust-2p.json', trace: 'joust-2p.trace.json', shape: 'two seats + seat-1 KO + wave-2 banner' },
    { rec: 'joust-death.json', trace: 'joust-death.trace.json', shape: 'lava death, respawn, planner resume' },
    { rec: 'emberwood-roam.json', trace: 'emberwood-roam.trace.json', shape: 'four screens incl. a dungeon entry' },
    { rec: 'emberwood-death.json', trace: 'emberwood-death.trace.json', shape: 'HP-zero death + A-press revive' },
    { rec: 'gauntlet-1p.json', trace: 'gauntlet-1p.trace.json', shape: 'planner clears hall 1 (level change)' },
    { rec: 'gauntlet-2p.json', trace: 'gauntlet-2p.trace.json', shape: 'two seats clear hall 1 together' },
    { rec: 'gauntlet-death.json', trace: 'gauntlet-death.trace.json', shape: 'swarm death + respawn' },
]

const GAMES = {
    joust: {
        excludes: ['events'],
        create: (seed, players) => ({ gs: makeGame({ players }), seed }),
        stepAll: (ctx, pads) => {
            const p1 = pads[0] || {}
            const inp = { l: !!p1.left, r: !!p1.right, f: !!p1.a }
            if (ctx.gs.players2 && pads[1]) { inp.l2 = !!pads[1].left; inp.r2 = !!pads[1].right; inp.f2 = !!pads[1].a }
            step(ctx.gs, inp)
        },
        hash: (ctx) => stateHash(ctx.gs),
        state: (ctx) => ctx.gs,
    },
    emberwood: {
        excludes: ['fx'],
        create: (seed) => ({ sim: createSim(seed), prev: { a: false, b: false, b2: false, up: false, down: false }, seed }),
        stepAll: (ctx, pads) => { stepSim(ctx.sim, padToInput(pads[0] || {}, ctx.prev)) },
        hash: (ctx) => hashState(ctx.sim),
        state: (ctx) => ctx.sim,
    },
    gauntlet: {
        excludes: ['events', 'levelData'],
        // #1711 S1: pin the pairing EXPLICITLY (see scripts/goldentrace.mjs —
        // the frozen spec names its own partner; absent now means the sim's
        // live default valkyrie per #2446, which is for human takes, not
        // this spec).
        create: (seed, players) => ({ gs: gNewGame(seed, { partnerKey: 'elf' }, players > 1), seed }),
        stepAll: (ctx, pads) => { gStep(ctx.gs, heroFromPad(pads[0] || {}), p2FromPad(pads[1] || {})) },
        hash: (ctx) => gHash(ctx.gs),
        state: (ctx) => ctx.gs,
    },
}

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))

// #527 item 5 — a committed stamp must name a fetchable commit; `unknown` is
// honest for captures taken on a branch whose commit will not survive the squash.
function stampOk(stamp) {
    if (stamp === 'unknown') return true
    try { execFileSync('git', ['cat-file', '-e', `${stamp}^{commit}`], { cwd: join(here, '..'), stdio: 'ignore' }); return true }
    catch { return false }
}

function replay(file) {
    const game = GAMES[file.game]
    const ctx = game.create(file.seed, file.players)
    const perTick = []
    const hashes = []
    const want = new Map(file.hashes.map((x) => [x.t, x.h]))
    let mismatch = null
    for (let t = 0; t < file.ticks; t++) {
        const pads = file.slots.map((s) => decodePad(s.pads[t], file.method))
        game.stepAll(ctx, pads)
        const h = game.hash(ctx)
        hashes.push(h)
        const t1 = t + 1
        if (!mismatch && want.has(t1) && want.get(t1) !== h) mismatch = { tick: t1, want: want.get(t1), got: h }
        perTick.push({ ...flattenState(game.state(ctx), game.excludes), hash: h })
    }
    return { mismatch, ticks: file.ticks, perTick }
}

// ---- 1. inventory + validation ------------------------------------------------
for (const pair of EXPECT) {
    const recPath = join(DIR, pair.rec)
    const tracePath = join(DIR, pair.trace)
    r.check(`${pair.rec} exists`, existsSync(recPath))
    r.check(`${pair.trace} exists`, existsSync(tracePath))
}
if (r.failed === 0) {
    for (const pair of EXPECT) {
        const file = readJSON(join(DIR, pair.rec))
        const bad = validate(file)
        r.check(`${pair.rec}: validates as ${file.format || '?'}`, bad === null, bad || '')
        const tr = readJSON(join(DIR, pair.trace))
        r.check(`${pair.trace}: format tag`, tr.format === TRACE_FORMAT, String(tr.format))
        r.check(`${pair.trace}: hash column at every tick`, tr.fields.includes('hash'))
        r.check(`${pair.trace}: pointers agree`, tr.rec === pair.rec && tr.game === file.game && tr.seed === file.seed && tr.players === file.players && tr.ticks === file.ticks)
        r.check(`${pair.trace}: quant`, tr.quant === QUANT)
        r.check(`${pair.trace}: stamp fetchable or honest-unknown`, stampOk(tr.build), tr.build)
        r.check(`${pair.rec}: stamp fetchable or honest-unknown`, stampOk(file.build), file.build)
    }
}

// ---- 2. replay determinism + trace freshness -----------------------------------
if (r.failed === 0) {
    for (const pair of EXPECT) {
        const file = readJSON(join(DIR, pair.rec))
        const committed = readJSON(join(DIR, pair.trace))
        const { mismatch, perTick } = replay(file)
        r.check(`${pair.rec}: pad-only replay matches recorded hashes (${pair.shape})`, !mismatch, mismatch ? `tick ${mismatch.tick}` : '')
        const fresh = buildTrace({
            game: file.game, rec: pair.rec, build: committed.build,
            seed: file.seed, players: file.players, ticks: file.ticks,
            excludes: GAMES[file.game].excludes,
        }, perTick)
        const same = ['game', 'rec', 'seed', 'players', 'ticks', 'quant'].every((k) => fresh[k] === committed[k]) &&
            JSON.stringify(fresh.fields) === JSON.stringify(committed.fields) &&
            JSON.stringify(fresh.consts) === JSON.stringify(committed.consts) &&
            JSON.stringify(fresh.rows) === JSON.stringify(committed.rows)
        let firstWhy = ''
        if (!same) {
            const d = diffTraces(committed, fresh)
            firstWhy = d.ok ? 'header/meta drift only' : (d.tick ? `tick ${d.tick} field ${d.field}` : d.why)
        }
        r.check(`${pair.trace}: fresh re-derivation is byte-equal`, same, firstWhy)
    }
}

// ---- 3. the diff primitive names a divergence precisely -----------------------
{
    const pair = EXPECT[0]
    if (existsSync(join(DIR, pair.trace))) {
        const golden = readJSON(join(DIR, pair.trace))
        const port = JSON.parse(JSON.stringify(golden))
        const targetTick = Math.floor(golden.rows.length / 3) // 1-based tick of the injected row
        const hi = golden.fields.indexOf('hash')
        const prevRow = golden.rows[targetTick - 2] || []
        let prevHash = 0
        for (let i = 0; i < prevRow.length; i += 2) if (prevRow[i] === hi) prevHash = prevRow[i + 1]
        port.rows[targetTick - 1] = [...port.rows[targetTick - 1], hi, prevHash + 7]
        const d = diffTraces(golden, port)
        r.check('diffTraces names the injected tick+field', !d.ok && d.tick === targetTick && d.field === 'hash', JSON.stringify(d))
    }
}

// ---- 4. it can fail: planted sim bugs must stale the traces -------------------
const MUTANTS = [
    ['joust gravity 0.045 -> 0.0449', '../src/games/Joust/sim.js', 'gravity: 0.045,', 'gravity: 0.0449,'],
    ['emberwood hero speed 1.45 -> 1.47', '../src/games/Emberwood/sim.js', 'speed: 1.45 }', 'speed: 1.47 }'],
    ['gauntlet walk 0.045 -> 0.0451', '../src/games/Gauntlet/sim.js', 'walk: 0.045,', 'walk: 0.0451,'],
]
if (!CHILD) {
    if (MUTATE) {
        let died = 0
        for (const [name, rel, from, to] of MUTANTS) {
            const file = join(here, rel)
            const orig = readFileSync(file, 'utf8')
            if (!orig.includes(from)) { r.check(`mutant anchor: ${name}`, false, file); continue }
            plant(file, orig.replace(from, to))
            const res = spawnSync(process.execPath, [join(here, 'goldentracecheck.mjs')], { encoding: 'utf8', env: { ...process.env, GOLDENCHECK_CHILD: '1' } })
            if (res.status !== 0) { died++; r.check(`mutant dies: ${name}`, true) } else r.check(`mutant dies: ${name}`, false, 'freshness passed despite the planted bug')
            pull(file)
        }
        r.check(`all ${MUTANTS.length} sim mutants die`, died === MUTANTS.length)
        const clean = spawnSync(process.execPath, [join(here, 'goldentracecheck.mjs')], { encoding: 'utf8', env: { ...process.env, GOLDENCHECK_CHILD: '1' } })
        r.check('restored sim is green again', clean.status === 0)
    }
    r.exit()
} else {
    // child mode: sections 1-2 only (the freshness gate), exit code = red/green
    process.exit(r.failed > 0 ? 1 : 0)
}
