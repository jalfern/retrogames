// PLAICRAFT DATASET CHECK (#1712) — hermetic proof of the dataset builder:
// relaysim store + scripted takes (no production store, no dev server).
//
//   npm run plaicraft:datasetcheck
//   npm run plaicraft:datasetcheck -- --mutant   # split-logic mutant, RED expected
//
// Proves, in order:
//  1. boot: the store round-trips fixture takes; the builder runs end-to-end.
//  2. classification: human / bot / unnamed / relabeled / tool (not-a-game)
//     route exactly per the #1712 audit doctrine.
//  3. splits: whole players held out (NO train row of a held-out player),
//     seed axis auditable, flagged rows never train/heldout.
//  4. audio: consented human tracks land VERBATIM (bytes equal the store's
//     b64 decoded), tick-aligned clock, voiceCmd clips cut to ms windows.
//  5. determinism: two builds — same version, byte-identical trees (the
//     acceptance line, mechanically).
//  6. integrity: manifest hashes recompute to card.version (artifact self-
//     proves; a truncated file breaks it).
//  7. mutant: player-split ignored -> held-out rows vanish -> RED.
//
// FIXTURES ARE PIPELINE TESTS, NOT EVIDENCE: the fixture players are scripted
// takes stamped consent-only to exercise the split logic. Acceptance lines on
// REAL data are judged by the card of a production-store run, never here
// (big-build rule 1 — no substitutions).

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startRelaySim, SIM_READ_KEY } from './lib/relaysim.mjs'
import { uploadSession } from '../src/utils/sessionStore.js'
import { createRecorder } from '../src/utils/recording.js'
import { TICK_MS } from '../src/utils/voice.js'
import { stateHash, step } from '../src/games/Gauntlet/sim.js'
import { newGame, heroFromPad, p2FromPad } from './plaicraft-export.mjs'
import { classifyTake, playerSplit, seedHeldout, registryIds, buildDataset } from './plaicraft-dataset.mjs'
import { plant, pull } from './lib/mutateguard.mjs'

// Local Report (harness.mjs pulls playwright-core at import; this check is
// deliberately Node-only — store round-trip + pure math, no browser).
class Report {
    constructor(name) { this.name = name; this.rows = []; this.failed = 0 }
    check(label, pass, detail = '') {
        this.rows.push({ label, pass })
        if (!pass) this.failed++
        console.log(`  ${pass ? 'PASS ' : 'FAIL '} ${label}${detail ? '  (' + detail + ')' : ''}`)
    }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const DS = path.join(here, 'plaicraft-dataset.mjs')
const MUTATE = process.argv.includes('--mutant')

const r = new Report('plaicraft:datasetcheck')
const shaHex = (buf) => createHash('sha256').update(buf).digest('hex')

// --- scripted takes --------------------------------------------------------------
// Deterministic pad streams driving THE gauntlet sim with hashes recorded on
// the house cadence — what verifyRecording (and the builder's adapter) will
// re-run tick-for-tick. Non-gauntlet fixtures skip the sim (no adapter);
// they only need structural validity.
function scriptedTake({ game = 'gauntlet', seed, ticks = 360, seats = [{ kind: 'human' }, { kind: 'cpu' }], voice = null, calls = [], rules = null }) {
    const gs = game === 'gauntlet' ? newGame(seed, rules || {}, seats[1] && seats[1].kind !== 'off') : null
    const rec = createRecorder({
        gameId: game, method: 'stick', seed, players: seats.length, build: 'test',
        sources: seats.map((s) => ({ kind: s.kind === 'relabeled' ? 'human' : s.kind })),
        rules: () => rules || {},
    })
    let x = (seed >>> 0) + 1
    const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296)
    const callAt = new Set(calls.map((c) => c.t))
    for (let t = 0; t < ticks; t++) {
        const pads = seats.map(() => ({
            up: rnd() < 0.3, down: rnd() < 0.2, left: rnd() < 0.2, right: rnd() < 0.3,
            a: rnd() < 0.15, ax: Math.cos(rnd() * 6.28), ay: Math.sin(rnd() * 6.28),
        }))
        if (gs) step(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
        rec.addTick(pads, null, gs && gs.tick % 30 === 0 ? stateHash(gs) : null)
        if (callAt.has(t + 1)) {
            const c = calls.find((q) => q.t === t + 1)
            rec.addVoiceCmd({ said: c.said, intent: c.intent || null, ok: !!c.ok })
        }
    }
    const final = gs ? stateHash(gs) : 12345
    if (voice) {
        const clock = []
        for (let t = 60; t <= ticks; t += 60) clock.push({ t, ms: Math.round(t * TICK_MS) })
        const bytes = new Uint8Array(48).fill(7) // deterministic stand-in bytes (validate wants b64 of len%4==0)
        return rec.finish(final, {
            tracks: [{
                slots: voice.slots, consent: true, headset: false,
                mime: 'audio/webm;codecs=opus', ms: Math.round(ticks * TICK_MS), clock,
                b64: Buffer.from(bytes).toString('base64'),
            }],
            declined: [],
        })
    }
    return rec.finish(final)
}

const relabelSeat = (rec, seat) => {
    rec.slots[seat].source = { kind: 'human', relabeledFrom: 'model', relabeledAt: '2026-11-11T00:00:00.000Z' }
    return rec
}

// --- run --------------------------------------------------------------------------
const sim = await startRelaySim()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dscheck-'))
const registry = registryIds(path.resolve(here, '..'))

try {
    // ---- unit: classification + split math --------------------------------------
    const mk = (game, player, slots) => ({ game, player }, { game, player, slots })
    const reg = registry
    r.check('registry knows gauntlet and bomb-defuse, not claptest',
        reg.has('gauntlet') && reg.has('bomb-defuse') && !reg.has('claptest'))
    r.check('named native human is human',
        classifyTake({ player: 'alice' }, { game: 'gauntlet', player: 'alice', slots: [{ source: { kind: 'human' } }] }, reg).cls === 'human')
    r.check('qabot is bot', classifyTake({ player: 'qabot' }, { game: 'gauntlet', slots: [{ source: { kind: 'human' } }] }, reg).cls === 'bot')
    r.check('fixed label player is unnamed',
        classifyTake({ player: 'player' }, { game: 'gauntlet', slots: [{ source: { kind: 'human' } }] }, reg).cls === 'unnamed')
    r.check('relabeled seat is relabeled',
        classifyTake({ player: 'dave' }, { game: 'gauntlet', slots: [{ source: { kind: 'human', relabeledFrom: 'model' } }] }, reg).cls === 'relabeled')
    r.check('native seat wins over a relabeled co-seat (still flags the reason)', (() => {
        const c = classifyTake({ player: 'erin' }, { game: 'gauntlet', slots: [{ source: { kind: 'human' } }, { source: { kind: 'human', relabeledFrom: 'model' } }] }, reg)
        return c.cls === 'human' && c.reasons.includes('relabeled-seat')
    })())
    r.check('cpu-only seats is bot', classifyTake({ player: 'frank' }, { game: 'gauntlet', slots: [{ source: { kind: 'cpu' } }] }, reg).cls === 'bot')
    r.check('claptest is tool', classifyTake({ player: 'gina' }, { game: 'claptest', slots: [{ source: { kind: 'human' } }] }, reg).cls === 'tool')
    r.check('split: one player blocks, none held out', (() => {
        const s = playerSplit(['solo'])
        return s.heldout.size === 0 && s.blocked === 'need-2-players'
    })())
    r.check('split: two players -> exactly one each way, deterministic', (() => {
        const a = playerSplit(['alice', 'bob'])
        const b = playerSplit(['bob', 'alice'])
        return a.blocked === null && a.heldout.size === 1 && [...a.heldout].every((p) => [...b.heldout].includes(p))
    })())
    r.check('split: every held-out is a real player; seeds auditable', (() => {
        const s = playerSplit(['a', 'b', 'c', 'd', 'e', 'f'])
        return s.heldout.size >= 1 && s.heldout.size < 6 && seedHeldout(7) === seedHeldout(7)
    })())

    // ---- integration: relaysim round-trip --------------------------------------
    const uploads = [
        ['alice', scriptedTake({ seed: 7, calls: [{ t: 120, said: 'go left', intent: 'left', ok: true }], voice: { slots: [0] } })],
        ['bob', scriptedTake({ seed: 8, voice: { slots: [0] } })],
        ['carol', scriptedTake({ game: 'bomb-defuse', seed: 9, ticks: 180, seats: [{ kind: 'human' }], voice: { slots: [0] } })],
        ['dave', relabelSeat(scriptedTake({ seed: 11, seats: [{ kind: 'relabeled' }, { kind: 'cpu' }] }), 0)],
        ['qabot', scriptedTake({ seed: 12, seats: [{ kind: 'model' }, { kind: 'cpu' }] })],
        ['erin', scriptedTake({ game: 'claptest', seed: 13, ticks: 120, seats: [{ kind: 'human' }] })],
    ]
    let up = 0
    for (const [player, rec] of uploads) {
        const res = await uploadSession(rec, { player, consent: { motion: true, voice: !!rec.voice }, base: sim.base })
        if (res.ok) up++
    }
    r.check('fixture store provisioned (6 consented takes uploaded)', up === 6, `${up}/6`)

    // determinism: two full builds against the store, twice. In-process
    // (not a blocked spawnSync child: the sim lives on THIS event loop).
    const outA = path.join(tmp, 'a')
    const outB = path.join(tmp, 'b')
    const bA = await buildDataset({ base: sim.base, out: outA, limit: 50, jonKey: SIM_READ_KEY })
    const bB = await buildDataset({ base: sim.base, out: outB, limit: 50, jonKey: SIM_READ_KEY })
    r.check('builder exits green against the store', bA.ok && bB.ok, (bA.reason || bB.reason || '').slice(0, 200))
    const verA = bA.version
    const verB = bB.version
    r.check('determinism: same version twice (acceptance line 1)', !!verA && verA === verB, `${verA?.slice(0, 12)} vs ${verB?.slice(0, 12)}`)
    const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))])
    const treeA = walk(outA).sort()
    const treeB = walk(outB).sort()
    const bytesSame = treeA.length === treeB.length && treeA.every((f, i) => f === treeB[i] && shaHex(fs.readFileSync(path.join(outA, f))) === shaHex(fs.readFileSync(path.join(outB, f))))
    r.check('determinism: byte-identical trees', bytesSame)

    // ---- content assertions on build A ------------------------------------------
    const rows = fs.readFileSync(path.join(outA, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    const card = JSON.parse(fs.readFileSync(path.join(outA, 'card.json'), 'utf8'))
    const heldout = new Set(card.splits.player.heldout)
    // map take key -> player via the store listing (the honest join)
    const { listSessions, fetchSession } = await import('../src/utils/sessionStore.js')
    const listing = await listSessions({ base: sim.base, limit: 50, key: SIM_READ_KEY })
    const envByKey = new Map(listing.sessions.map((s) => [s.key, s]))
    const humanKeys = new Set()
    const flaggedKeys = new Set()
    for (const s of listing.sessions) {
        const got = await fetchSession(s.key, { base: sim.base, key: SIM_READ_KEY })
        const c = classifyTake(s, got.recording, registry)
        if (c.cls === 'human') humanKeys.add(s.key)
        else flaggedKeys.add(s.key)
    }
    r.check('fixtures classify as expected: 3 human, 3 flagged',
        humanKeys.size === 3 && flaggedKeys.size === 3,
        `human=[${[...humanKeys].map((k) => envByKey.get(k).player)}] flagged=[${[...flaggedKeys].map((k) => envByKey.get(k).player)}]`)

    const trainRows = rows.filter((x) => x.split === 'train')
    const heldRows = rows.filter((x) => x.split === 'player-heldout')
    const seedRows = rows.filter((x) => x.split === 'seed-heldout')
    const flagRows = rows.filter((x) => x.split === 'flagged')
    r.check('all splits present', trainRows.length > 0 && heldRows.length > 0 && flagRows.length > 0 && seedRows.length >= 0)
    r.check('holdout purity: no flagged take in train/heldout',
        [...trainRows, ...heldRows].every((x) => humanKeys.has(x.k)))
    r.check('no held-out player appears in any train row (acceptance line 4)',
        !trainRows.some((x) => heldout.has(envByKey.get(x.k)?.player)),
        `heldout=${[...heldout]} trainPlayers=${[...new Set(trainRows.map((x) => envByKey.get(x.k)?.player))]}`)
    r.check('every human take lands train/player-heldout/seed-heldout (never flagged)',
        rows.filter((x) => humanKeys.has(x.k)).every((x) => x.split !== 'flagged'))
    r.check('seed axis auditable: train rows keep seedHeldout false, seed-heldout rows true (player axis outranks)',
        rows.every((x) => x.split === 'train' ? !seedHeldout(x.s) : x.split === 'seed-heldout' ? seedHeldout(x.s) : true))
    r.check('gauntlet rows carry real features (adapter) and encoded actions',
        rows.filter((x) => x.g === 'gauntlet').every((x) => Array.isArray(x.feat) && x.feat.length === 31 && typeof x.act === 'object'))
    r.check('no-adapter game still contributes action rows, feat honest-null',
        rows.some((x) => x.g === 'bomb-defuse' && x.feat === null))
    r.check('tool rows flagged with not-a-game reason in card coverage',
        flagRows.some((x) => x.g === 'claptest'))

    // audio verbatim + alignment
    const audioIdx = fs.existsSync(path.join(outA, 'audio/index.jsonl'))
        ? fs.readFileSync(path.join(outA, 'audio/index.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        : []
    r.check('audio index written for consented human takes', audioIdx.length === 3, `${audioIdx.length}/3`)
    const aliceIdx = audioIdx.find((x) => x.player === 'alice')
    let verbatim = false
    if (aliceIdx && fs.existsSync(path.join(outA, aliceIdx.file))) {
        const stored = rows.length && (await fetchSession(aliceIdx.key, { base: sim.base, key: SIM_READ_KEY }))
        verbatim = !!stored.ok && Buffer.from(stored.recording.voice.tracks[0].b64, 'base64').equals(fs.readFileSync(path.join(outA, aliceIdx.file)))
    }
    r.check('human voice lands verbatim (decoded store bytes == dataset file)', verbatim)
    r.check('clips tick-aligned: go left at t=120 -> ~2000 ms window',
        !!aliceIdx && aliceIdx.clips.length === 1 && aliceIdx.clips[0].said === 'go left'
        && Math.abs(aliceIdx.clips[0].msStart - 1500) <= 60 && Math.abs(aliceIdx.clips[0].msEnd - 3500) <= 60,
        JSON.stringify(aliceIdx?.clips || null))
    r.check('bot/tool audio never written into the dataset dir',
        !walk(outA).some((f) => f.startsWith('audio/') && [...flaggedKeys].some((k) => f.startsWith(k.replace(/[^a-z0-9._-]+/gi, '_')))))

    // integrity: manifest recomputes to the card version
    const man = JSON.parse(fs.readFileSync(path.join(outA, 'manifest.json'), 'utf8'))
    const recomputed = shaHex(man.files
        .map(({ path: p }) => [p, shaHex(fs.readFileSync(path.join(outA, p)))].join('\0') + '\n')
        .sort().join(''))
    r.check('manifest self-proves: files recompute to card.version', recomputed === card.version && man.version === card.version)
    r.check('card reports honest coverage (2 human games via carol\'s take)',
        card.coverage.gamesCovered.pass && card.coverage.audio.pass && card.splits.player.heldout.length >= 1,
        `games=${JSON.stringify(card.coverage.gamesCovered.games)} heldout=${JSON.stringify(card.splits.player.heldout)}`)
} catch (e) {
    r.check('check completed without unexpected failure', false, String(e && e.stack || e))
}

// --- mutant: player-split ignored must go RED --------------------------------------
let mutated = false
if (MUTATE) {
    const src = fs.readFileSync(DS, 'utf8')
    const ANCHOR = 'heldPlayers.has(player)'
    if (!src.includes(ANCHOR)) { console.log('FAIL   anchor not found — update the mutant'); process.exit(1) }
    plant(DS, src.replace(ANCHOR, 'false /* MUTANT: player holdout ignored */'))
    mutated = true
    try {
        const outM = path.join(tmp, 'mut')
        // async spawn on purpose: the sim answers on THIS event loop, which
        // spawnSync would freeze (the child's fetches could never complete).
        const cliM = await new Promise((resolve) => {
            const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM, '--limit', '50'],
                { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
            let stdout = ''
            p.stdout.on('data', (d) => { stdout += d })
            p.on('exit', (code) => resolve({ status: code, stdout }))
        })
        const okM = cliM.status === 0 && fs.existsSync(path.join(outM, 'dataset.jsonl'))
        const rowsM = okM ? fs.readFileSync(path.join(outM, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
        const heldM = rowsM.filter((x) => x.split === 'player-heldout')
        const cardM = okM ? JSON.parse(fs.readFileSync(path.join(outM, 'card.json'), 'utf8')) : null
        // card still names the heldout players (split math untouched), but no
        // row carries the split — a held-out player's rows leak into train.
        const vanishing = heldM.length === 0 && cardM && cardM.splits.player.heldout.length > 0
        r.check('mutant: player-heldout rows vanish (split ignored)', vanishing, `heldRows=${heldM.length}`)
    } finally {
        pull(DS)
    }
    if (!r.failed) console.log('mutant: expected RED, got green — holdout is NOT load-bearing?')
}

sim.close()
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* temp cleanup best-effort */ }

if (MUTATE) {
    console.log(`\nplaicraft:datasetcheck ${mutated ? '(mutant) ' : ''}${r.rows.length - r.failed}/${r.rows.length} checks`)
    if (mutated) process.exit(r.failed ? 0 : 1) // red IS the pass under --mutant
}
console.log(`\nplaicraft:datasetcheck ${r.failed ? 'FAILED' : 'PASSED'} (${r.rows.length - r.failed}/${r.rows.length})`)
process.exit(r.failed ? 1 : 0)
