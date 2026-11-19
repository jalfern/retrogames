// PLAICRAFT EXPORT — PICK RUSH (#2734): labelled grasp-and-place episodes.
//
// One command, pure Node, deterministic: it runs the authored line at sim
// rate on THE sim with a jitter-free variant of the game's crane law (the
// planner below — see its note for why the corpus brain must draw no RNG),
// banks each shift as a Plaicraft episode (the #1141 kit: retrogames-rec/v1
// + the `episode` block), verifies every recording replays EXACTLY
// (verifyRecording vs the same pad lane — hash match at every checkpoint),
// and converts them into labelled datasets:
//
//   episodes.jsonl — one validateEpisode-clean episode per line
//   drops.jsonl    — one row per drop: { s, game, t, kind, seat, outcome,
//                    why, bin?, pts? } — outcome `hit` = the tagged bin caught
//                    it; `miss` = wrong bin, shattered glass, or jaws slipped
//   summary.json   — per-seed stats + the corpus verdict
//
// Seeds: practice 0..11 (the model may see these), held-out 100..107 (it
// never does; the issue's discipline: choose on practice, score once — the
// same split plaicraft-export pins for Gauntlet).
//
// The sim's events already carry the judging truth (#2734 completed slip/
// miss/shatter/wrong/drop with kind+seat); this script maps terminal events
// to labels and NOTHING ELSE gets to call a drop a hit — pickcheck's
// EXPORT-LABELS-TRUTH re-derives every row against an independently written
// verdict and EXPORT-HITS-CORRECT pins Σhits ≡ gs.correct.
//
// Usage: node scripts/pickrush-export.mjs [--out data/pickrush] [--fast]
//        --fast caps every run at 4000 ticks (a quick corpus for the check).

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeGame, step, stateHash, beltV, BINS, KINDS, ARM_MIN, BELT_END, CLAW_DOWN, CLAW_SPEED } from '../src/games/PickRush/sim.js'
import { createEpisode, validateEpisode, exportEpisodes } from '../src/utils/robot/episode.js'
import { verifyRecording } from '../src/utils/recording.js'

export const PRACTICE_SEEDS = Array.from({ length: 12 }, (_, i) => i)
export const HELDOUT_SEEDS = Array.from({ length: 8 }, (_, i) => 100 + i)

// The corpus brain: the autopilot's LAW without its seeded habits. The
// shipped autopilot draws gs.rng at every retarget (±3 px aim jitter, a rare
// 3 % skip) — those draws advance the SHARED stream that paces the spawns,
// and a recorded pad stream carries pads, not RNG draws. Captured with the
// autopilot, replay would respawn the line differently (caught at tick 210
// on seed 0: the first retarget shifted every later spacing roll). So the
// export planner is RNG-free BY LAW: same lead timing, no jitter, no skips,
// no target memo — the same discipline #1184 demands of motion carriers.
// verifyRecording is the enforcement: any accidental draw reopens the gap.
export function planner(gs, seat) {
    const arm = gs.arms[seat]
    const pad = {}
    if (gs.end) return pad

    if (arm.held !== null) {
        const it = gs.items.find((i) => i.id === arm.held)
        const bin = BINS[it ? KINDS[it.kind].bin : 0]
        const cx = bin.x + bin.w / 2
        if (Math.abs(arm.x - cx) > 12) { pad[it && arm.x < cx ? 'right' : 'left'] = true; return pad }
        if (it && it.fragile && arm.tip < CLAW_DOWN - 12) { pad.down = true; return pad }
        if (arm.prevA) pad.a = false
        else pad.a = true
        return pad
    }

    if (arm.mode === 'low') {
        if (arm.prevA) pad.a = false
        else pad.a = true
        return pad
    }
    if (arm.mode !== 'up') return pad
    if (arm.prevA) { pad.a = false; return pad }

    const home = gs.players > 1 ? (it) => (it.n ?? 0) % 2 === seat : () => true
    let best = null
    for (const it of gs.items) {
        if (it.carriedBy !== -1 || !it.onBelt) continue
        if (it.x > BELT_END - 24) continue
        if (!home(it)) continue
        if (it.x < arm.x - 40) continue
        if (!best || it.x < best.x) best = it
    }
    if (!best) {
        if (seat === 0) {
            const behind = gs.items.filter((it) => it.onBelt && it.carriedBy === -1 && it.x < arm.x - 30 && home(it))
            if (behind.length) pad.left = true
            else if (arm.x > 110) pad.left = true
        } else if (arm.x > 250) pad.left = true
        else if (arm.x < 250) pad.right = true
        return pad
    }
    const lead = beltV(gs) * Math.ceil((CLAW_DOWN - arm.tip) / CLAW_SPEED)
    const tx = Math.min(Math.max(best.x + lead, ARM_MIN), BELT_END - 8)
    if (tx > arm.x + 1.5) pad.right = true
    else if (tx < arm.x - 1.5) pad.left = true
    else pad.a = true
    return pad
}

// The label law: which sim events END a drop, and what verdict they carry.
// `drop` is the sim's own correct-bin land — a HIT by the judging law.
// wrong/shatter/slip end a grasp attempt without a landing — MISS. A piece
// that rides off the belt end untouched was never a drop: no label, no row.
// (pickcheck mutates THIS table for PICK_MUT=rec — the named gates go red.)
export const OUTCOME_BY_EVENT = {
    drop: { ok: true, why: 'drop' },
    wrong: { ok: false, why: 'wrong' },
    shatter: { ok: false, why: 'shatter' },
    slip: { ok: false, why: 'slip' },
}

export function harvestLabels(ev) {
    const out = []
    for (const e of ev) {
        const o = OUTCOME_BY_EVENT[e.type]
        if (!o) continue
        const l = { ok: o.ok, why: o.why }
        if (e.kind !== undefined) l.kind = e.kind
        if (typeof e.seat === 'number' && e.seat >= 0) l.seat = e.seat
        if (e.bin !== undefined) l.bin = e.bin
        if (e.pts !== undefined) l.pts = e.pts
        out.push(l)
    }
    return out
}

// The replay driver for verifyRecording: rebuild the seeded line and feed it
// the recorded pads through THE pad lane — PICK RUSH pads ARE the lane
// (plain dpad pads go straight into step), so capture and replay share one
// codec and a hash mismatch here means the recorder lied, not the game.
export function makeReplayDriver() {
    let gs = null
    return {
        reset: (seed, players = 2) => { gs = makeGame(seed >>> 0, players) },
        step: (pads) => { step(gs, pads) },
        state: () => ({ tick: gs.tick, hash: gs.hash }),
    }
}

export function collectRun(seed, opts = {}) {
    const maxTicks = opts.maxTicks || 20000 // a full 4-shift contract is 16800
    const gs = makeGame(seed >>> 0, 2)
    const episode = createEpisode({
        gameId: 'pick-rush', method: 'dpad', seed: gs.seed, players: 2,
        // corpus honesty: both cranes are the game's own autopilot, not hands
        sources: [{ kind: 'model' }, { kind: 'model' }], // the corpus brain, not hands
        task: 'pick-rush-shift',
    })
    const rows = []
    let hits = 0, misses = 0
    while (!gs.end && gs.tick < maxTicks) {
        const pads = [planner(gs, 0), planner(gs, 1)]
        step(gs, pads)
        const labels = harvestLabels(gs.ev)
        // the hash rides AFTER the step — checkpoint t must hold the state
        // replay arrives at after feeding t pads (the #1625 lesson).
        episode.addTick(pads, null, stateHash(gs), null, null, labels)
        for (const l of labels) { if (l.ok) hits++; else misses++ }
        for (const e of gs.ev) {
            const o = OUTCOME_BY_EVENT[e.type]
            if (!o) continue
            const row = { s: seed, game: 'pick-rush', t: gs.tick, kind: e.kind ?? null, seat: e.seat ?? -1, outcome: o.ok ? 'hit' : 'miss', why: o.why }
            if (e.bin !== undefined) row.bin = e.bin
            if (e.pts !== undefined) row.pts = e.pts
            rows.push(row)
        }
        gs.ev.length = 0
    }
    const won = gs.end === 'win'
    const file = episode.finish({ success: won, score: gs.score, finalHash: stateHash(gs) })
    const v = verifyRecording(file, makeReplayDriver())
    return {
        seed, file, rows,
        stats: {
            ticks: gs.tick, won, score: gs.score, correct: gs.correct,
            hits, misses, verified: v.ok, mismatch: v.mismatch || null,
        },
    }
}

export function collectAll(seeds, opts = {}) {
    const out = []
    for (const s of seeds) {
        const r = collectRun(s, opts)
        process.stderr.write(`seed ${s}: ${r.stats.won ? 'WON' : 'ended'} score ${r.stats.score} hits ${r.stats.hits} miss ${r.stats.misses} verified=${r.stats.verified}\n`)
        out.push(r)
    }
    return out
}

const args = process.argv.slice(2)
if (import.meta.url === `file://${process.argv[1]}`) {
    const outArg = args.indexOf('--out')
    const OUT = resolve(outArg >= 0 ? args[outArg + 1] : 'data/pickrush')
    const fast = args.includes('--fast')
    mkdirSync(OUT, { recursive: true })
    const seeds = [...PRACTICE_SEEDS, ...HELDOUT_SEEDS]
    const runs = collectAll(seeds, { maxTicks: fast ? 4000 : undefined })
    const files = runs.map((r) => r.file)
    const badFile = files.map((f, i) => [f, seeds[i]]).find(([f]) => validateEpisode(f) !== null)
    const ep = exportEpisodes(files)
    const drops = runs.flatMap((r) => r.rows)
    const summary = {
        game: 'pick-rush', task: 'pick-rush-shift', method: 'dpad',
        seeds: { practice: PRACTICE_SEEDS, heldout: HELDOUT_SEEDS },
        episodes: files.length,
        drops: drops.length,
        hits: drops.filter((r) => r.outcome === 'hit').length,
        misses: drops.filter((r) => r.outcome === 'miss').length,
        won: runs.filter((r) => r.stats.won).length,
        verifiedAll: runs.every((r) => r.stats.verified),
        episodeValid: badFile ? `seed ${badFile[1]}: ${validateEpisode(badFile[0])}` : 'all',
        perSeed: runs.map((r) => ({ seed: r.seed, ...r.stats })),
    }
    writeFileSync(resolve(OUT, 'episodes.jsonl'), ep.text)
    writeFileSync(resolve(OUT, 'drops.jsonl'), drops.map((r) => JSON.stringify(r)).join('\n') + (drops.length ? '\n' : ''))
    writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
    console.log(`\n${ep.filename} -> ${OUT}/episodes.jsonl`)
    console.log(`${drops.length} drop rows (${summary.hits} hit / ${summary.misses} miss) -> ${OUT}/drops.jsonl`)
    console.log(`${summary.won}/${seeds.length} contracts completed, replay-verified: ${summary.verifiedAll ? 'ALL' : 'NO'} (${OUT}/summary.json)`)
    if (!summary.verifiedAll || badFile) process.exit(1)
}
