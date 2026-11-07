// PLAICRAFT EXPORT (#1625) — recorded Gauntlet play -> clean dataset.
//
// One command, pure Node, deterministic: it plays real games at real speed
// (THE sim, THE one pads per seat — seat 1 follows the proven planner route
// through the pad lane, seat 2 is the game's own CPU partner), banks each
// run as a `retrogames-rec/v1` recording (the house format, issue #495),
// verifies every recording replays EXACTLY (verifyRecording vs the same pad
// driver — hash match at every checkpoint), then converts them into a JSONL
// training set: one row per tick —
//
//   { s: seed, t: tick, lvl: level, f: [27 features], p: cpuPad, a: swingIntent }
//
// f = the seat's own senses (src/games/Gauntlet/model.js featurize — ONE
// definition shared by export, trainer and the live seat). p = what the CPU
// seat actually emitted that tick. a = sustained swing intent (the raw `a` is
// a thumb pulse; the seat rebuilds the pulse from intent, so the label the
// net learns is the intent, not the thumb's tick-phase).
//
// Seeds: practice 0..11 (the model may see these), held-out 100..107 (it
// never does; the issue's discipline: choose on practice, score once).
//
// Usage: node scripts/plaicraft-export.mjs [--out data/plaicraft] [--fast]
//        --fast caps every run at 4000 ticks (a quick corpus for the check).

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'
import { decide, partnerPad } from '../src/games/Gauntlet/planner.js'
import { featurize } from '../src/games/Gauntlet/model.js'
import { createRecorder, verifyRecording, decodePad } from '../src/utils/recording.js'

export const PRACTICE_SEEDS = Array.from({ length: 12 }, (_, i) => i)
export const HELDOUT_SEEDS = Array.from({ length: 8 }, (_, i) => 100 + i)

const here = dirname(fileURLToPath(import.meta.url))

// --- pad lane ------------------------------------------------------------------
// decide() answers on the pilot lane (absolute aim + level buttons); a thumb
// answers on THE one pad. heroToPad is the codec for seat 1: direction bits
// carry the movement, ax/ay carry the absolute aim (the twin-stick lane the
// one-pad already has), and the buttons are LEVELS passed straight to the
// sim — exactly the cpu lane the game itself runs (index.jsx feeds raw.a as
// sword), where the sim's own cooldown paces the hammer. Capture AND replay
// drive the sim through heroFromPad below, so a recording verifies against
// precisely the semantics it was written with.

export function makeHeroPadCodec() {
    return {
        toPad(inp) {
            const pad = {}
            if (typeof inp.aim === 'number') { pad.ax = Math.cos(inp.aim); pad.ay = Math.sin(inp.aim) }
            if (inp.fwd) pad.up = true
            if (inp.back) pad.down = true
            if (inp.left) pad.left = true
            if (inp.right) pad.right = true
            pad.a = !!inp.sword
            pad.b = !!inp.arrow
            return pad
        },
    }
}

// The seat-1 reading of THE one pad: aim comes from the aim lane; the
// buttons are levels (cpu-lane semantics — the sim's cooldown sets pace).
export function heroFromPad(pad) {
    const ax = Number(pad.ax) || 0
    const ay = Number(pad.ay) || 0
    const inp = {
        left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down,
        sword: !!pad.a,
        arrow: !!pad.b,
    }
    if (ax !== 0 || ay !== 0) inp.aim = Math.atan2(ay, ax)
    return inp
}

// Seat 2: the cpu lane the game itself uses (index.jsx padToInp) — the `a`
// pulse passes through as a swing attempt; the sim's cooldown paces it.
export const p2FromPad = (pad) => ({
    left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down, sword: !!pad.a,
})

export function newGame(seed, rules = {}, partner = true) {
    // #1711 S6: recorded files may carry { hero, partnerKey } (rules stamp) —
    // replay rebuilds THAT hero; files without the stamp keep the historical
    // defaults the export planner was proven on.
    // #1793: `partner` is whether seat 2 was OCCUPIED when the take was made.
    // A seat-2 `off` recording must rebuild WITHOUT a partner: a ghost CPU
    // partner nobody played still walks, swings at monsters, and its
    // interference leaks into the hash (the #1793 divergence at ~tick 570 —
    // the ghost's path is set by the level layout, hence seed-invariant).
    const gs = makeGame(seed, rules.hero || 'warrior', { topDown: true, partner, partnerKey: rules.partnerKey || 'elf' })
    gs.partnerOn = partner
    gs.partnerMode = 'cpu'
    return gs
}

// #1793: seat occupancy is recorded in slots[i].source.kind (a kind lives on
// every seat even when its pads are empty). The replay must rebuild the SAME
// seats the live run had — 'off' seat = no partner in the sim.
export function seatedPartner(rec) {
    const s = rec && rec.slots && rec.slots[1]
    return s ? !!(s.source && s.source.kind !== 'off') : false // single-seat take: nobody stood in seat 2
}

// The replay driver for verifyRecording: rebuild the game from the seed and
// feed it the recorded pads through THE pad lane. Same code path the capture
// used — a hash mismatch here means the codec is lying, not the game.
// reset takes (seed, players, rec): verifyRecording passes the recording
// through, so a seat-`off` take replays without the ghost partner (#1793).
export function makeReplayDriver(rules = {}) {
    let gs = null
    const st = { prevA: false, prevB: false }
    return {
        reset: (seed, players = 2, rec = null) => { gs = newGame(seed, rules, rec ? seatedPartner(rec) : players > 1); st.prevA = false; st.prevB = false },
        step: (pads) => {
            const heroPad = decodePad(pads[0], 'stick')
            const p2 = decodePad(pads[1], 'stick')
            step(gs, heroFromPad(heroPad, st), p2FromPad(p2))
        },
        state: () => ({ hash: stateHash(gs), tick: gs.tick }),
    }
}

// Play one recorded game and convert it. `seat2` may replace the CPU expert
// (the scoring loop seats the trained model here); rows are only written for
// the expert run (opts.noRows for scoring runs).
export function collectRun(seed, opts = {}) {
    const maxTicks = opts.maxTicks || 30000
    const gs = newGame(seed)
    const rec = createRecorder({ gameId: 'gauntlet', method: 'stick', seed, players: 2, sources: [{ kind: 'model' }, { kind: opts.seatKind || 'cpu' }] })
    const codec = makeHeroPadCodec()
    const hst = { prevA: false, prevB: false }
    const featMem = {}
    if (opts.seat2 && opts.seat2.reset) opts.seat2.reset()
    const rows = []
    let prevA = false
    let prevPad = null
    let kills = 0, partnerDeaths = 0, goldTaken = 0, levelStart = 0
    while (!gs.end && gs.tick < maxTicks) {
        const inp = decide(gs)
        const cpuPad = opts.seat2 ? opts.seat2.decide(gs) : partnerPad(gs, prevA)
        prevA = !!cpuPad.a
        const heroPad = codec.toPad(inp)
        const liveTick = !!(gs.partner && !gs.partner.down && gs.hero && gs.hero.deadT === 0 && !gs.end)
        const rowsHere = !opts.noRows && liveTick
        let row = null
        if (rowsHere) {
            featMem.pa = prevPad
            const f = featurize(gs, gs.partner, featMem).map((v) => +v.toFixed(3))
            const intent = gs.monsters.some((m) => Math.hypot(m.x - gs.partner.x, m.y - gs.partner.y) < 1.25) ? 1 : 0
            row = { s: seed, t: gs.tick, lvl: gs.level, f, p: cpuPad, a: intent }
            prevPad = cpuPad
        }
        step(gs, heroFromPad(heroPad, hst), p2FromPad(cpuPad))
        // the hash rides AFTER the step — the state the recorder stamps at t
        // must be the state replay holds after feeding t pads (verifyRecording
        // compares post-step), so checkpoint on gs.tick % 30 === 0.
        rec.addTick([heroPad, cpuPad], null, gs.tick % 30 === 0 ? stateHash(gs) : null)
        if (row) rows.push(row)
        for (const e of gs.events) {
            if (e.type === 'kill') kills++
            if (e.type === 'pickup' && e.t === 'gold' && e.partner) goldTaken++
            if (e.type === 'partnerDown') partnerDeaths++
        }
        gs.events.length = 0
    }
    const file = rec.finish(stateHash(gs))
    const v = verifyRecording(file, makeReplayDriver())
    return {
        seed, file, rows,
        stats: {
            ticks: gs.tick, won: gs.end === 'win', levels: gs.level + (gs.end === 'win' ? 1 : 0),
            score: gs.score, kills, partnerDeaths, goldTaken,
            verified: v.ok, mismatch: v.mismatch || null, startLevel: levelStart,
        },
    }
}

export function collectAll(seeds, opts = {}) {
    const out = []
    for (const s of seeds) {
        const r = collectRun(s, opts)
        process.stderr.write(`seed ${s}: ${r.stats.won ? 'WON' : 'lost'} lvl${r.stats.levels} score ${r.stats.score} ticks ${r.stats.ticks} verified=${r.stats.verified}\n`)
        out.push(r)
    }
    return out
}

const README = `# PLAICRAFT dataset (#1625) — recorded play the studio can learn from

Generated by \`npm run plaicraft:export\` (= \`node scripts/plaicraft-export.mjs\`).
Deterministic: same commit + same seeds -> byte-identical files.

## What a run is
Each seed is a REAL game: seat 1 (hero) walks the proven planner route
through THE pad lane, seat 2 is the game's own CPU partner. Both seats emit
THE one pad (\`#420\`) every tick, so this is play, not a video: the
per-tick pads are what a thumb would send, and every recording is replayed
against the sim by \`verifyRecording\` — hash match at every 30-tick
checkpoint or the export fails.

## Files
- \`rec/practice-<seed>.json\`, \`rec/heldout-<seed>.json\` — full
  \`retrogames-rec/v1\` recordings (see src/utils/recording.js): seed, pads
  per seat, raw channel, state hashes.
- \`dataset.jsonl\` — the clean training set, one JSON row per tick:

| field | meaning |
|-------|---------|
| \`s\`   | seed of the run this row came from |
| \`t\`   | tick within that run |
| \`lvl\` | maze index |
| \`f\`   | 27 features — THE seat's senses: hp frac; 8 range-finder rays (N..NW, 1/8-cell steps, capped 8 cells); hero bearing (dx, dy /8-clamped) + both headings as sin/cos; nearest monster bearing + drain flag + inside-blade-reach flag; nearest food bearing + present flag; motion memory — the hero's smoothed-velocity look-ahead target (the CPU doctrine's own prediction) + hero speed + the seat's own last-tick velocity |
| \`p\`   | the expert pad emitted this tick: \`{left,right,up,down,a}\` (a is a thumb pulse) |
| \`a\`   | sustained swing intent (0/1) — the label the net trains on; the seat rebuilds the pulse from intent so the net never has to learn a thumb's tick-phase |

Features are entity-relative (the partner's own senses; one definition,
\`featurize()\` in src/games/Gauntlet/model.js, shared by export, trainer and
the live seat) — the net sees what a player can notice, never the board.

## Seed discipline
practice seeds 0..11 -> training + tuning. held-out seeds 100..107 -> never
trained on; scored ONCE for the write-up (the weight-surgery discipline).
\`results.json\` (committed) is that single held-out score.

\`sample.jsonl\` is the first 100 rows of practice seed 0, committed so the
format is reviewable without the (regenerable, large) full corpus.
`

// ---- CLI ----------------------------------------------------------------------

const args = process.argv.slice(2)
const opt = (name, dft) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dft }

if (process.argv[1] && process.argv[1].endsWith('plaicraft-export.mjs')) {
    const out = resolve(opt('--out', 'data/plaicraft'))
    const fast = args.includes('--fast')
    const maxTicks = fast ? 4000 : 30000
    mkdirSync(resolve(out, 'rec'), { recursive: true })
    const runs = collectAll([...PRACTICE_SEEDS, ...HELDOUT_SEEDS], { maxTicks })
    const rows = []
    const stats = {}
    for (const r of runs) {
        const kind = HELDOUT_SEEDS.includes(r.seed) ? 'heldout' : 'practice'
        writeFileSync(resolve(out, `rec/${kind}-${r.seed}.json`), JSON.stringify(r.file))
        rows.push(...r.rows)
        stats[r.seed] = r.stats
    }
    writeFileSync(resolve(out, 'dataset.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n')
    writeFileSync(resolve(out, 'sample.jsonl'), rows.slice(0, 100).map((x) => JSON.stringify(x)).join('\n') + '\n')
    writeFileSync(resolve(out, 'README.md'), README)
    const allVerified = runs.every((r) => r.stats.verified)
    const wonPractice = runs.filter((r) => PRACTICE_SEEDS.includes(r.seed) && r.stats.won).length
    const wonHeld = runs.filter((r) => HELDOUT_SEEDS.includes(r.seed) && r.stats.won).length
    writeFileSync(resolve(out, 'export-stats.json'), JSON.stringify({ allVerified, wonPractice, wonHeld, rows: rows.length, stats }, null, 1))
    console.log(`exported ${rows.length} rows, ${runs.length} recordings; verified=${allVerified}; won practice ${wonPractice}/${PRACTICE_SEEDS.length}, heldout ${wonHeld}/${HELDOUT_SEEDS.length}`)
    if (!allVerified) { console.error('EXPORT FAILED: a recording did not verify'); process.exit(1) }
    void here
}
