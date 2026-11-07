// plaicraftcheck — Node gates for the PLAICRAFT pipeline (#1625):
// export -> trained policy -> seat. Proves the shipped numbers, and proves
// it can fail: the same agreement gate run against zeroed weights must
// collapse (mutant, last gate). Runs in seconds on the practice seeds;
// NEVER touches held-out seeds 100..107 — those were scored once, in
// scripts/plaicraft-train.mjs, and live in data/plaicraft/results.json.
//
// Usage: npm run plaicraftcheck

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { step, makeGame, stateHash } from '../src/games/Gauntlet/sim.js'
import { partnerPad, decide } from '../src/games/Gauntlet/planner.js'
import { createModelPolicy, featurize, forward, N_FEAT, seatSources } from '../src/games/Gauntlet/model.js'
import { POLICY } from '../src/games/Gauntlet/policy.js'
import { collectRun, makeHeroPadCodec, heroFromPad, p2FromPad, newGame, makeReplayDriver } from './plaicraft-export.mjs'
import { createRecorder, verifyRecording } from '../src/utils/recording.js'
import { makeSlot, setSlotKind, padFor, pushPad } from '../src/utils/slotSources.js'

const ok = []
const check = (name, cond, info = '') => { ok.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); return cond }

// 1 — shipped policy is real, shaped, finite
check('policy shipped & shaped', POLICY.arch && POLICY.arch[0] === N_FEAT && POLICY.w.length === 32 * 24 + 24 * 24 + 24 * 5 && POLICY.b.length === 24 + 24 + 5
    && POLICY.w.every(Number.isFinite) && POLICY.b.every(Number.isFinite) && !POLICY.meta?.zero,
`${POLICY.meta?.name || '?'} arch=${(POLICY.arch || []).join('-')}`)

// 2 — a recording made by the export verifier replays exactly (fast window)
{
    const r = collectRun(5, { maxTicks: 1200, noRows: true })
    check('rec/v1 recording replays exact (seed 5, 1200t)', r.stats.verified, r.stats.mismatch ? JSON.stringify(r.stats.mismatch) : '')
}

// 2b — #1793: a SOLO take replays SOLO. The consent-gate run (the #1711 S6
// acceptance line "100% of them replay-verify") recorded a lone hero, but the
// seat count is HARDCODED: Gauntlet's contract is always players:2, so a solo
// run lands in the file as two seats with an 'off' partner seat — the seat
// count cannot tell the replay "no partner." The replay must read the file's
// seat-1 kind, not players. Seating a phantom partner puts an inert ally at the
// start cell, monsters aggro it instead of the hero, the hero's hp (a hashed
// field) drifts, and the file diverges at a seed-INVARIANT tick (~570). If
// makeReplayDriver keys the partner off the seat count this gate goes red at
// ~tick 570.
{
    const seed = 86
    const gs = makeGame(seed, 'warrior', { partner: false, topDown: true })
    gs.partnerOn = false; gs.partnerMode = 'off'
    // record exactly the way the live solo capture does: the game's two seats,
    // seat 1 = 'off' (never a pad), and no partner input reaches the sim.
    const rec = createRecorder({ gameId: 'gauntlet', method: 'stick', seed, players: 2, sources: [{ kind: 'human' }, { kind: 'off' }] })
    const CAP = 1200
    let t = 0
    while (!gs.end && t < CAP) {
        t++
        const inp = { left: false, right: t > 5 && t <= 35, fwd: false, back: false, sword: false, arrow: false }
        step(gs, inp, null)
        gs.events.length = 0
        rec.addTick([
            { left: inp.left, right: inp.right, up: inp.fwd, down: inp.back, a: inp.sword, b: inp.arrow },
            {},
        ], null, gs.tick % 30 === 0 ? stateHash(gs) : null)
    }
    const file = rec.finish(stateHash(gs))
    const ver = verifyRecording(file, makeReplayDriver(file))
    check('SOLO take (players=2, seat-1=off) replays solo — no phantom partner shields the hero (#1793)', ver.ok, ver.mismatch ? `diverged at tick ${ver.mismatch.tick}` : ver.error || '')
}

// 3 — teacher-forcing agreement on practice seeds (the seat, predicting the
// expert at the expert's OWN states): regenerate labels live for two seeds.
function agreement(seed, cap, policy) {
    const gs = newGame(seed)
    const codec = makeHeroPadCodec()
    const hst = { prevA: false, prevB: false }
    const model = createModelPolicy(policy)
    const mem = {}
    let prevPad = null, prevA = false, mv = 0, tot = 0
    while (!gs.end && gs.tick < cap) {
        const cpuPad = partnerPad(gs, prevA)
        prevA = !!cpuPad.a
        const heroPad = codec.toPad(decide(gs))
        if (gs.partner && !gs.partner.down && gs.hero.deadT === 0) {
            mem.pa = prevPad
            const f = featurize(gs, gs.partner, mem)
            const o = forward(policy, f)
            const DIRS = ['left', 'right', 'up', 'down']
            for (let j = 0; j < 4; j++) { if ((o[j] > 0.5) === !!cpuPad[DIRS[j]]) mv++; tot++ }
            prevPad = cpuPad
        }
        step(gs, heroFromPad(heroPad, hst), p2FromPad(cpuPad))
    }
    return mv / Math.max(1, tot)
}
{
    const a = (agreement(3, 2500, POLICY) + agreement(7, 2500, POLICY)) / 2
    check('seat predicts expert >= 90% moves (practice)', a >= 0.9, (a * 100).toFixed(1) + '%')
}

// 4 — seated behavior: with the brain in slot 2 of a real game the partner
// actually follows (moves a long way, stays near the hero, survives).
{
    const model = createModelPolicy(POLICY)
    const gs = newGame(4)
    const codec = makeHeroPadCodec()
    const hst = { prevA: false, prevB: false }
    let dist = 0, px = gs.partner.x, py = gs.partner.y, near = 0, tot = 0
    while (!gs.end && gs.tick < 2500) {
        const pad = model.decide(gs)
        step(gs, heroFromPad(codec.toPad(decide(gs)), hst), p2FromPad(pad))
        dist += Math.hypot(gs.partner.x - px, gs.partner.y - py); px = gs.partner.x; py = gs.partner.y
        if (!gs.partner.down) { if (Math.hypot(gs.partner.x - gs.hero.x, gs.partner.y - gs.hero.y) < 6) near++; tot++ }
    }
    check('seated brain follows the hero (moves + proximity + survives)', dist > 25 && gs.partner.hp > 0 && (!gs.partner.down || tot === 0) && near / Math.max(1, tot) > 0.6,
        `moved ${dist.toFixed(0)} cells, near-hero ${(100 * near / Math.max(1, tot)).toFixed(0)}%`)
}

// 5 — the slot machinery treats the brain like any source (makeSlot('model'))
{
    const slot = makeSlot('model')
    pushPad(slot, { up: true, a: true })
    const pad = padFor(slot, { method: 'stick' })
    setSlotKind(slot, 'cpu')
    check('model slot emits its pad; kind switch clears queue', !!pad.up && !!pad.a && slot.queue.length === 0)
}

// 6 — dataset + results exist where the README says (format is reviewable)
{
    const sample = readFileSync(resolve('data/plaicraft/sample.jsonl'), 'utf8').trim().split('\n')
    const row0 = JSON.parse(sample[0])
    const results = JSON.parse(readFileSync(resolve('data/plaicraft/results.json'), 'utf8'))
    const h = results.rollout.heldout
    check('dataset sample rows carry 32 features + label', row0.f.length === 32 && row0.p && 'a' in row0, `${sample.length} sample rows`)
    check('held-out results recorded once', h.wins.of > 0 && Number.isFinite(h.avgLevels.model),
        `held-out model ${h.wins.model}/${h.wins.of} wins, avg lvl ${h.avgLevels.model} (cpu ${h.avgLevels.cpu})`)
}

// 7 — #1636 seat-stamp: a seat the trained net drove carries its modelId in
// the recording header; externally-driven contract seats stay anonymous.
{
    const S = seatSources({ seat2Kind: 'model', brainSeated: true, brainName: POLICY.meta.name })
    check('seat-stamp: brain seat carries modelId', S[1].kind === 'model' && S[1].modelId === 'plaicraft-bc/v1', JSON.stringify(S[1]))
    const E = seatSources({ seat2Kind: 'model', brainSeated: false })
    check('seat-stamp: external contract seat stays anonymous', E[1].kind === 'model' && !('modelId' in E[1]), JSON.stringify(E[1]))
    const O = seatSources({ seat2Kind: 'off' })
    check('seat-stamp: no brain, no stamp', O[1].kind === 'off' && !('modelId' in O[1]))
}

// 8 — MUTANT: zeroed weights must collapse the agreement gate (the proof
// this check can fail — same code, dead brain).
{
    const dead = { arch: POLICY.arch, w: POLICY.w.map(() => 0), b: POLICY.b.map(() => 0) }
    const a = agreement(3, 1200, dead)
    check('MUTANT: dead weights fall below the gate', a < 0.9, `dead-brain agreement ${(a * 100).toFixed(1)}%`)
}

console.log(ok.join('\n'))
process.exit(ok.some((l) => l.startsWith('FAIL')) ? 1 : 0)
