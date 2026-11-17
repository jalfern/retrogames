// plaicraftcheck — Node gates for the PLAICRAFT pipeline (#1625):
// export -> trained policy -> seat. Proves the shipped numbers, and proves
// it can fail: the same agreement gate run against zeroed weights must
// collapse (mutant, last gate). Runs in seconds on the practice seeds;
// NEVER touches held-out seeds 100..107 — those were scored once, by the
// trainer (retrogames-rl since stage 2, #2394), and live in data/plaicraft/results.json.
//
// Usage: npm run plaicraftcheck

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { step, stateHash, makeGame, LEVELS } from '../src/games/Gauntlet/sim.js'
import { partnerPad, decide } from '../src/games/Gauntlet/planner.js'
import { createModelPolicy, featurize, forward, N_FEAT, FEAT_NAMES, seatSources } from '../src/games/Gauntlet/model.js'
import { POLICY } from '../src/games/Gauntlet/policy.js'
import { collectRun, makeHeroPadCodec, heroFromPad, p2FromPad, newGame, makeReplayDriver } from './plaicraft-export.mjs'
import { createRecorder, verifyRecording, decodePad } from '../src/utils/recording.js'
import { makeSlot, setSlotKind, padFor, pushPad } from '../src/utils/slotSources.js'

const ok = []
const check = (name, cond, info = '') => { ok.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); return cond }

// 1 — shipped policy is real, shaped, finite (#2299: 31 senses — monReach is
// gone; if arch[0] ever equals N_FEAT+1 again, someone re-added the leak)
check('policy shipped & shaped', POLICY.arch && POLICY.arch[0] === N_FEAT && N_FEAT === 31 && !FEAT_NAMES.includes('monReach')
    && POLICY.w.length === 31 * 24 + 24 * 24 + 24 * 5 && POLICY.b.length === 24 + 24 + 5
    && POLICY.w.every(Number.isFinite) && POLICY.b.every(Number.isFinite) && !POLICY.meta?.zero,
`${POLICY.meta?.name || '?'} arch=${(POLICY.arch || []).join('-')}`)

// 2 — a recording made by the export verifier replays exactly (fast window)
{
    const r = collectRun(5, { maxTicks: 1200, noRows: true })
    check('rec/v1 recording replays exact (seed 5, 1200t)', r.stats.verified, r.stats.mismatch ? JSON.stringify(r.stats.mismatch) : '')
}

// 2b — #2621 (stage 3d): the hard-setting stamp rides export → replay → rows.
{
    const dflt = collectRun(5, { maxTicks: 1200, noRows: true })
    const hard = collectRun(5, { maxTicks: 1200, noRows: true, rules: { slack: true, hero: 'wizard' } })
    check('default corpus stamp unchanged (no phantom keys)',
        dflt.file.rules.hero === 'warrior' && dflt.file.rules.partnerKey === 'elf' && dflt.file.rules.slack === undefined,
        JSON.stringify(dflt.file.rules))
    check('stamped export records slack + wizard in rules',
        hard.file.rules.slack === true && hard.file.rules.hero === 'wizard', JSON.stringify(hard.file.rules))
    check('stamped recording verifies against its own stamp (seed 5, 1200t)', hard.stats.verified,
        hard.stats.mismatch ? JSON.stringify(hard.stats.mismatch) : '')
    const wrong = verifyRecording(hard.file, makeReplayDriver({}))
    check('replay at the WRONG stamp must NOT verify (the stamp rebuilds the real game)',
        !wrong.ok, wrong.ok ? 'a hard-stamp recording verified as default?!' : String(wrong.mismatch && wrong.mismatch.t))
    const again = collectRun(5, { maxTicks: 1200, noRows: true, rules: { slack: true, hero: 'wizard' } })
    check('hard stamp is deterministic (same seed + stamp → byte-identical file)',
        JSON.stringify(hard.file) === JSON.stringify(again.file), `${hard.stats.ticks} vs ${again.stats.ticks}`)
    check('the stamp CHANGES the game (wizard+slack ≠ warrior default at seed 5)',
        JSON.stringify(hard.file.hashes) !== JSON.stringify(dflt.file.hashes), '')
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
    check('dataset sample rows carry 31 features + label', row0.f.length === 31 && row0.p && 'a' in row0, `${sample.length} sample rows`)
    check('held-out results recorded once', h.wins.of > 0 && Number.isFinite(h.avgLevels.model),
        `held-out model ${h.wins.model}/${h.wins.of} wins, avg lvl ${h.avgLevels.model} (cpu ${h.avgLevels.cpu}), intent tf ${(results.teacherForcing?.practice?.intentAcc ?? NaN)}`)
}

// 7 — #1636 seat-stamp: a seat the trained net drove carries its modelId in
// the recording header; externally-driven contract seats stay anonymous.
{
    const S = seatSources({ seat2Kind: 'model', brainSeated: true, brainName: POLICY.meta.name })
    check('seat-stamp: brain seat carries modelId', S[1].kind === 'model' && S[1].modelId === 'plaicraft-bc/v2', JSON.stringify(S[1]))
    const E = seatSources({ seat2Kind: 'model', brainSeated: false })
    check('seat-stamp: external contract seat stays anonymous', E[1].kind === 'model' && !('modelId' in E[1]), JSON.stringify(E[1]))
    const O = seatSources({ seat2Kind: 'off' })
    check('seat-stamp: no brain, no stamp', O[1].kind === 'off' && !('modelId' in O[1]))
}

// 8 — #1793 seat-faithful replay: a take recorded with seat 2 `off` must
// rebuild WITHOUT a partner. The outbox kill-test found the consent-gate run
// (partner off, sources {model,off}) diverging at seed-invariant tick ~570:
// the replay driver force-seated a CPU partner from `players >= 2` alone, and
// the ghost — set by the level layout, not the pads — swung at monsters the
// recording never fought until its interference crossed the hash.
{
    const seed = 5
    const capture = (cap) => {
        const gs = newGame(seed, {}, false)
        const codec = makeHeroPadCodec()
        const rec = createRecorder({ gameId: 'gauntlet', method: 'stick', seed, players: 2, sources: [{ kind: 'model' }, { kind: 'off' }] })
        while (!gs.end && gs.tick < cap) {
            const pad = codec.toPad(decide(gs))
            step(gs, heroFromPad(pad), null)
            rec.addTick([pad, {}], null, gs.tick % 30 === 0 ? stateHash(gs) : null)
        }
        return rec.finish(stateHash(gs))
    }
    const take = capture(1200)
    const v = verifyRecording(take, makeReplayDriver())
    check('seat-off take replays exact — no ghost partner (#1793)', v.ok, v.mismatch ? JSON.stringify(v.mismatch) : `${v.ticks} ticks`)
    // MUTANT: the pre-#1793 driver seated the partner from `players` alone.
    // The ghost must break exactness — proof this gate can actually fail.
    let ghost = null
    const gv = verifyRecording(take, {
        reset: () => { ghost = newGame(seed, {}, true) },
        step: (pads) => step(ghost, heroFromPad(decodePad(pads[0], 'stick')), p2FromPad(decodePad(pads[1], 'stick'))),
        state: () => ({ hash: stateHash(ghost), tick: ghost.tick }),
    })
    check('MUTANT: ghost-partner driver breaks the seat-off replay (#1793)', !gv.ok && !!gv.mismatch,
        gv.mismatch ? `ghost diverged at tick ${gv.mismatch.tick}` : 'ghost never interfered — pick a livelier seed')
}

// 9 — MUTANT: zeroed weights must collapse the agreement gate (the proof
// this check can fail — same code, dead brain).
{
    const dead = { arch: POLICY.arch, w: POLICY.w.map(() => 0), b: POLICY.b.map(() => 0) }
    const a = agreement(3, 1200, dead)
    check('MUTANT: dead weights fall below the gate', a < 0.9, `dead-brain agreement ${(a * 100).toFixed(1)}%`)
}

// 10 — #2299 NO-LABEL-LEAK gate. v1 shipped monReach bit-identical to the
// swing-intent label (audit #2277): intentAcc 1.000 was the net copying an
// input, not learning. Freshly collected rows must contain NO input column
// equal to the label on every row — structurally, the copy cannot exist.
// The mutant injects exactly that column and must be caught: the proof this
// gate can fail.
{
    const leakCols = (rows) => {
        const cols = rows[0].f.length
        const out = []
        for (let c = 0; c < cols; c++) if (rows.every((r) => (r.f[c] ? 1 : 0) === r.a)) out.push(c)
        return out
    }
    const rows = [...collectRun(3, { maxTicks: 2500 }).rows, ...collectRun(7, { maxTicks: 2500 }).rows]
    const cols = rows[0].f.length
    const clean = leakCols(rows)
    check(`no feature equals the intent label (${rows.length} live rows)`, clean.length === 0 && cols === N_FEAT,
        clean.length ? `label copies: ${clean.map((c) => FEAT_NAMES[c] || `col${c}`).join(',')}` : `${cols} senses, none equals a`)
    const leaky = rows.map((r) => ({ f: [...r.f, r.a], a: r.a }))
    const caught = leakCols(leaky)
    check('MUTANT: re-adding the reach copy trips the leak gate', caught.includes(cols),
        caught.length ? `injected copy caught at col ${caught.join(',')}` : 'injected leak went UNDETECTED')
}

// 11 — #2516 difficulty-rules threading: newGame passes EXPLICIT difficulty opts
// (levelCount, slack) to THE sim, absent keeps every historical default (no
// recording has ever stamped these). The mutant builds the game the way the
// pre-#2516 wrapper did — knobs dropped — and must NOT match the stamped game:
// the proof this gate can fail.
{
    const plain = newGame(7)
    const stamped = newGame(7, { partnerKey: 'elf', levelCount: 6, slack: true })
    check('difficulty rules thread to the sim (#2516)',
        plain.levelCount === LEVELS.length && !plain.slack && stamped.levelCount === 6 && stamped.slack === true,
        `plain lc=${plain.levelCount} slack=${!!plain.slack} | stamped lc=${stamped.levelCount} slack=${stamped.slack}`)
    const dropped = makeGame(7, 'warrior', { topDown: true, partner: true, partnerKey: 'elf' }) // pre-#2516 form
    check('MUTANT: dropped threading is caught (#2516)',
        dropped.levelCount !== stamped.levelCount || !dropped.slack,
        `dropped lc=${dropped.levelCount} slack=${!!dropped.slack} vs stamped lc=${stamped.levelCount} slack=${stamped.slack}`)
}

console.log(ok.join('\n'))
process.exit(ok.some((l) => l.startsWith('FAIL')) ? 1 : 0)
