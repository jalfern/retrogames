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
//  7. legacy fold (#1712): pre-audit unnamed take attributes to the anchor
//     owner, rows carry lg, player set and coverage lines stay native-only.
//  8. mutants: player-split ignored / floor-boss hash-skip / fold disabled /
//     bomb-defuse adapter bypassed / trainable-gate reopened —
//     each must go RED (each line is load-bearing).
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
import { makeGame as fbMakeGame, step as fbStep, stateHash as fbHash } from '../src/games/FloorBoss/sim.js'
import { N_FEAT as FB_N_FEAT } from '../src/games/FloorBoss/model.js'
import { createGame as bdMakeGame, step as bdStep, hash as bdHash } from '../src/games/BombDefuse/engine.js'
import { N_FEAT as BD_N_FEAT } from '../src/games/BombDefuse/model.js'
import { newGame, heroFromPad, p2FromPad } from './plaicraft-export.mjs'
import { classifyTake, playerSplit, seedHeldout, registryIds, buildDataset, floorBossRows, bombDefuseRows, foldDecision, LEGACY_OWNER } from './plaicraft-dataset.mjs'
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
// #2805 item 5: hand-crafted EBML/WebM skeleton declaring a Duration (the
// parser's lineage, #2058) — real enough that containerDurationMs answers >0;
// the fake bytes could never prove the reader works. micprobe keeps recording
// the true-mic spot checks; this pins the PARSER.
const craftWebm = (durationMs) => {
    const d = Buffer.alloc(8)
    d.writeDoubleBE(durationMs, 0)
    return Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]), // EBML header (empty)
        Buffer.from([0x18, 0x53, 0x80, 0x67, 0x92]), // Segment, 18 bytes
        Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x8d]), // Info, 13 bytes
        Buffer.from([0x44, 0x89, 0x88]), // Duration, float64
        d,
    ]).toString('base64')
}

function scriptedTake({ game = 'gauntlet', seed, ticks = 360, seats = [{ kind: 'human' }, { kind: 'cpu' }], voice = null, calls = [], rules = null, tamper = false }) {
    const method = game === 'floor-boss' || game === 'bomb-defuse' ? 'dpad' : 'stick'
    const gs = game === 'gauntlet' ? newGame(seed, rules || {}, seats[1] && seats[1].kind !== 'off')
        : game === 'floor-boss' ? fbMakeGame(seed, { duel: seats.length >= 2 })
            : game === 'bomb-defuse' ? bdMakeGame(seed, seats.length >= 2 ? 2 : 1)
                : null
    const hashOf = game === 'gauntlet' ? stateHash : game === 'floor-boss' ? fbHash : game === 'bomb-defuse' ? bdHash : null
    const rec = createRecorder({
        gameId: game, method, seed, players: seats.length, build: 'test',
        sources: seats.map((s) => ({ kind: s.kind === 'relabeled' ? 'human' : s.kind })),
        rules: () => rules || {},
    })
    let x = (seed >>> 0) + 1
    const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296)
    const callAt = new Set(calls.map((c) => c.t))
    for (let t = 0; t < ticks; t++) {
        const pads = seats.map(() => ({
            up: rnd() < 0.3, down: rnd() < 0.2, left: rnd() < 0.2, right: rnd() < 0.3,
            a: rnd() < 0.15, b: rnd() < 0.15, ax: Math.cos(rnd() * 6.28), ay: Math.sin(rnd() * 6.28),
        }))
        if (game === 'gauntlet') step(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
        if (game === 'floor-boss') fbStep(gs, pads)
        if (game === 'bomb-defuse') bdStep(gs, pads)
        rec.addTick(pads, null, gs && gs.tick % 30 === 0 ? hashOf(gs) : null)
        if (callAt.has(t + 1)) {
            const c = calls.find((q) => q.t === t + 1)
            rec.addVoiceCmd({ said: c.said, intent: c.intent || null, ok: !!c.ok, ...(Number.isInteger(c.seat) ? { seat: c.seat } : {}) }) // #2805 seat stamp
        }
    }
    const final = gs ? hashOf(gs) : 12345
    if (voice) {
        const clock = []
        for (let t = 60; t <= ticks; t += 60) clock.push({ t, ms: Math.round(t * TICK_MS) })
        const bytes = new Uint8Array(48).fill(7) // deterministic stand-in bytes (validate wants b64 of len%4==0)
        const tracks = [{
            slots: voice.slots, consent: true, headset: false,
            mime: 'audio/webm;codecs=opus', ms: Math.round(ticks * TICK_MS), clock,
            b64: Buffer.from(bytes).toString('base64'),
        }]
        // #2805 guest mic: covers seat 1, cuts early (partial), and its
        // container DECLARES a duration that disagrees with ms by >10% —
        // audioLonger + sessionsWithPartialVoice + per-seat clips must all bite.
        if (voice.guest) tracks.push({
            slots: [1], consent: true, headset: false,
            mime: 'audio/webm;codecs=opus', ms: 500, partial: true,
            clock: [{ t: 1, ms: 0 }, { t: 30, ms: 498 }],
            b64: craftWebm(1234.5),
        })
        const file = rec.finish(final, { tracks, declined: [] })
        // tamper a MID-RUN checkpoint (not the final hash — the end-of-run
        // compare would catch that even if the in-loop check is skipped, and a
        // mutant must prove the line it plants is load-bearing) (#2805)
        if (tamper && file.hashes.length) file.hashes[Math.max(0, file.hashes.length - 2)].h = 'cafebabe'
        return file
    }
    const file = rec.finish(final)
    if (tamper && file.hashes.length) file.hashes[Math.max(0, file.hashes.length - 2)].h = 'cafebabe'
    return file
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
        // #2805: floor-boss duel take — model seat replays too; host + stamped
        // guest calls; guest mic partial + container disagreement.
        ['gina', scriptedTake({ game: 'floor-boss', seed: 21, ticks: 240, seats: [{ kind: 'human' }, { kind: 'model' }], voice: { slots: [0], guest: true }, calls: [{ t: 100, said: 'rack two', intent: null, ok: true }, { t: 120, said: 'watch the fork', intent: null, ok: true, seat: 1 }] })],
        // #1712 fold fixtures: an owner anchor (named native) + a legacy
        // pre-audit take (envelope label 'player', native human seat, consented
        // voice). The fold must route the legacy take's rows to jalfern.
        ['jalfern', scriptedTake({ seed: 61, voice: { slots: [0] } })],
        ['player', scriptedTake({ seed: 62, ticks: 200, voice: { slots: [0] } })],
        // #1712 trainable-gate fixture: named human on an ADAPTER-LESS game —
        // consented voice lands, but the take must stay flagged (no-adapter):
        // no split, no player slot, no coverage credit.
        ['hank', scriptedTake({ game: 'talk-me-down', seed: 44, ticks: 150, seats: [{ kind: 'human' }], voice: { slots: [0] } })],
    ]
    let up = 0
    for (const [player, rec] of uploads) {
        const res = await uploadSession(rec, { player, consent: { motion: true, voice: !!rec.voice }, base: sim.base })
        if (res.ok) up++
    }
    r.check('fixture store provisioned (10 consented takes uploaded)', up === 10, `${up}/10`)

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
    const foldedKeys = new Set()
    const infos = []
    for (const s of listing.sessions) {
        const got = await fetchSession(s.key, { base: sim.base, key: SIM_READ_KEY })
        const c = classifyTake(s, got.recording, registry)
        infos.push([s, c])
        if (c.cls === 'human') humanKeys.add(s.key)
    }
    // fold decision mirrors the builder: anchor = native named humans (never
    // enlarged by folds); relabeled/bot/tool can never fold.
    const nativeHumans = new Set([...humanKeys].map((k) => String(envByKey.get(k).player)))
    for (const [s, c] of infos) {
        if (foldDecision(c.cls, c.native, c.relabeled, nativeHumans)) foldedKeys.add(s.key)
        else if (!humanKeys.has(s.key)) flaggedKeys.add(s.key)
    }
    r.check('fixtures classify as expected: 6 human, 1 legacy-folded, 3 flagged',
        humanKeys.size === 6 && foldedKeys.size === 1 && flaggedKeys.size === 3,
        `human=[${[...humanKeys].map((k) => envByKey.get(k).player)}] folded=[${[...foldedKeys].map((k) => envByKey.get(k).player)}] flagged=[${[...flaggedKeys].map((k) => envByKey.get(k).player)}]`)

    const trainRows = rows.filter((x) => x.split === 'train')
    const heldRows = rows.filter((x) => x.split === 'player-heldout')
    const seedRows = rows.filter((x) => x.split === 'seed-heldout')
    const flagRows = rows.filter((x) => x.split === 'flagged')
    r.check('all splits present', trainRows.length > 0 && heldRows.length > 0 && flagRows.length > 0 && seedRows.length >= 0)
    r.check('holdout purity: no flagged take in train/heldout (adapter-gate included — a human take on an unadapted game may not ride a split)',
        [...trainRows, ...heldRows].every((x) => (humanKeys.has(x.k) && card.games[x.g].featureAdapter === true) || foldedKeys.has(x.k)))
    r.check('no held-out player appears in any train row (acceptance line 4; folded takes judged by their OWNER)',
        !trainRows.some((x) => heldout.has(foldedKeys.has(x.k) ? LEGACY_OWNER : envByKey.get(x.k)?.player)),
        `heldout=${[...heldout]} trainPlayers=${[...new Set(trainRows.map((x) => foldedKeys.has(x.k) ? LEGACY_OWNER + '(folded)' : envByKey.get(x.k)?.player))]}`)
    r.check('every TRAINABLE take (human/folded on an adapted game) lands train/player-heldout/seed-heldout — never flagged',
        rows.filter((x) => humanKeys.has(x.k) && card.games[x.g].featureAdapter === true).every((x) => x.split !== 'flagged'))
    r.check('no-adapter gate (#1712): named human on an unadapted game lands flagged and stays out of players/coverage',
        rows.some((x) => x.g === 'talk-me-down') && rows.filter((x) => x.g === 'talk-me-down').every((x) => x.split === 'flagged' && x.feat === null)
        && !card.players.hank && !card.coverage.humanPlayers.includes('hank')
        && card.totals.unadaptedHumanTakes === 1 && !card.coverage.gamesCovered.games.includes('talk-me-down')
        && card.games['talk-me-down'].featureAdapter === false && card.games['talk-me-down'].humanTakes === 0)
    r.check('bomb-defuse rows carry THE 35 seat features + encoded actions (#1712 adapter)',
        rows.filter((x) => x.g === 'bomb-defuse').every((x) => Array.isArray(x.feat) && x.feat.length === BD_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && rows.some((x) => x.g === 'bomb-defuse' && x.split !== 'flagged'),
        `rows=${rows.filter((x) => x.g === 'bomb-defuse').length}`)
    r.check('seed axis auditable: train rows keep seedHeldout false, seed-heldout rows true (player axis outranks)',
        rows.every((x) => x.split === 'train' ? !seedHeldout(x.s) : x.split === 'seed-heldout' ? seedHeldout(x.s) : true))
    r.check('gauntlet rows carry real features (adapter) and encoded actions',
        rows.filter((x) => x.g === 'gauntlet').every((x) => Array.isArray(x.feat) && x.feat.length === 31 && typeof x.act === 'object'))
    r.check('no-adapter game still contributes action rows, feat honest-null (flagged at the gate above)',
        rows.some((x) => x.g === 'talk-me-down' && x.feat === null))
    r.check('tool rows flagged with not-a-game reason in card coverage',
        flagRows.some((x) => x.g === 'claptest'))

    // audio verbatim + alignment
    const audioIdx = fs.existsSync(path.join(outA, 'audio/index.jsonl'))
        ? fs.readFileSync(path.join(outA, 'audio/index.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        : []
    r.check('audio index written for consented human takes (gina host+guest; jalfern + legacy-folded + no-adapter-consented hank carry voice)', audioIdx.length === 8, `${audioIdx.length}/8`)
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
    r.check('card reports honest coverage (3 human games: gauntlet, bomb-defuse, floor-boss)',
        card.coverage.gamesCovered.pass && card.coverage.gamesCovered.games.includes('floor-boss') && card.coverage.audio.pass && card.splits.player.heldout.length >= 1,
        `games=${JSON.stringify(card.coverage.gamesCovered.games)} heldout=${JSON.stringify(card.splits.player.heldout)}`)

    // ---- #2805: floor-boss engine, per-seat attribution, container truth, card lines
    const fbRows = rows.filter((x) => x.g === 'floor-boss')
    r.check('floor-boss rows carry THE 37 seat features + encoded actions (#2805)',
        fbRows.length > 0 && fbRows.every((x) => Array.isArray(x.feat) && x.feat.length === FB_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object'),
        `rows=${fbRows.length}`)
    const ginaIdx = audioIdx.filter((x) => x.player === 'gina')
    const gHost = ginaIdx.find((x) => (x.seats || []).includes(0))
    const gGuest = ginaIdx.find((x) => (x.seats || []).includes(1))
    r.check('per-seat voice attribution (#2805): a stamped call rides its mic only, never the host track',
        ginaIdx.length === 2 && gGuest && gGuest.clips.length === 1 && gGuest.clips[0].said === 'watch the fork' && gGuest.clips[0].seat === 1
        && gHost && gHost.clips.some((c) => c.said === 'rack two') && gHost.clips.every((c) => c.said !== 'watch the fork'))
    r.check('container truth (#2805): crafted WebM parses >0; >10% disagreement mirrors audioLonger; partial surfaces',
        !!gGuest && gGuest.containerMs === 1235 && gGuest.audioLonger === true && gGuest.partial === true
        && !!gHost && gHost.containerMs === null && gHost.audioLonger === undefined && gHost.partial === undefined,
        `guest containerMs=${gGuest && gGuest.containerMs} ms=${gGuest && gGuest.ms}`)
    r.check('card counts partial-voice sessions (RL lane short-audio warning, #2805)', card.totals.sessionsWithPartialVoice === 1, `=${card.totals.sessionsWithPartialVoice}`)
    r.check('card per-player rows accounting (#2805, #1713 hand-off)',
        Object.values(card.players).every((p) => Number.isInteger(p.rows)) && (card.players.gina?.rows || 0) > 0
        && Object.values(card.players).reduce((a, p) => a + p.rows, 0) === card.totals.humanRows,
        JSON.stringify(Object.fromEntries(Object.entries(card.players).map(([k, v]) => [k, `${v.rows}rows/${v.voiceSessions}v`]))))
    { // unit: the adapter verifies clean, refuses tampered at the exact tick
        const clean = scriptedTake({ game: 'floor-boss', seed: 41, ticks: 180, seats: [{ kind: 'human' }] })
        const good = floorBossRows('unit/clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[badRec.hashes.length - 1].h = 'cafebabe'
        const bad = floorBossRows('unit/tamper', badRec)
        r.check('floor-boss adapter: clean take verifies (180 rows), tampered refuses at its tick (#2805)',
            good.ok && good.rows.length === 180 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : 'no mismatch?!')
    }
    { // unit: bomb-defuse adapter (#1712) — same contract, and solo takes verify
        const clean = scriptedTake({ game: 'bomb-defuse', seed: 51, ticks: 240, seats: [{ kind: 'human' }] })
        const good = bombDefuseRows('unit/bd-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = bombDefuseRows('unit/bd-tamper', badRec)
        r.check('bomb-defuse adapter: clean solo take verifies (240 rows), tampered refuses at its tick (#1712)',
            good.ok && good.rows.length === 240 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
        // the autoregressive lane: the model.js contract says the caller banks
        // mem.pa after the label — prev-pad features must be LIVE, not zero-forever.
        const anyPrev = good.rows.some((x) => x.feat.slice(BD_N_FEAT - 6).some((v) => v === 1))
        r.check('bomb-defuse prev-pad lane banked: some row carries a nonzero prev-pad feature (#1712)',
            anyPrev && BD_N_FEAT === 35)
    }
    r.check('floor-boss prev-pad lane banked too (model.js contract, was riding zero forever, #1712)',
        fbRows.some((x) => x.feat.slice(FB_N_FEAT - 6).some((v) => v === 1)))
    { // integration: on a live store, ONE tampered floor-boss take must fail the
        // whole build — the S1 100%-verifiable line, engine two (#2805).
        const sim2 = await startRelaySim()
        try {
            const tT = scriptedTake({ game: 'floor-boss', seed: 55, ticks: 150, seats: [{ kind: 'human' }], tamper: true })
            const upT = await uploadSession(tT, { player: 'mallory', consent: { motion: true, voice: false }, base: sim2.base })
            const bT = await buildDataset({ base: sim2.base, out: path.join(tmp, 'tamper'), limit: 50, jonKey: SIM_READ_KEY })
            r.check('tampered floor-boss take fails the whole build, tick named (#2805 — unverified rows are never shipped)',
                upT.ok && !bT.ok && Array.isArray(bT.rejected) && bT.rejected.length === 1 && bT.rejected[0].mismatch.tick > 0,
                bT.reason || 'build was GREEN with a tampered take?!')
        } finally { sim2.close() }
    }

    // ---- #1712 legacy fold -------------------------------------------------------
    r.check('fold gate units: named/bot/tool never fold; relabeled never folds; no-anchor never folds',
        foldDecision('unnamed', 1, 0, new Set(['jalfern'])) === true
        && foldDecision('human', 1, 0, new Set(['jalfern'])) === false
        && foldDecision('bot', 1, 0, new Set(['jalfern'])) === false
        && foldDecision('tool', 1, 0, new Set(['jalfern'])) === false
        && foldDecision('relabeled', 0, 1, new Set(['jalfern'])) === false
        && foldDecision('unnamed', 0, 1, new Set(['jalfern'])) === false
        && foldDecision('unnamed', 1, 1, new Set(['jalfern'])) === false
        && foldDecision('unnamed', 1, 0, new Set(['alice'])) === false)
    const lgRows = rows.filter((x) => x.lg === 1)
    const foldedKey = [...foldedKeys][0]
    const wantFoldSplit = heldout.has(LEGACY_OWNER) ? 'player-heldout' : seedHeldout(62) ? 'seed-heldout' : 'train'
    r.check('legacy take folds into the corpus: rows exist, never flagged, carry lg, mirror the owner split rule (#1712)',
        lgRows.length === 400 && foldedKey && lgRows.every((x) => x.k === foldedKey && x.split !== 'flagged' && x.split === wantFoldSplit && x.g === 'gauntlet'),
        `rows=${lgRows.length} want=${wantFoldSplit}`)
    r.check('fold never enlarges the player set: humans stay native-5, label "player" is no player, volume separate (#1712)',
        card.coverage.humanPlayers.length === 5 && !card.coverage.humanPlayers.includes('player') && card.totals.humanTakes === 5
        && card.totals.legacyTakes === 1 && card.totals.humanTakesIncludingLegacy === 6
        && card.splits.player.heldout.length >= 1 && !card.splits.player.heldout.includes('player'),
        `humans=${JSON.stringify(card.coverage.humanPlayers)} legacy=${card.totals.legacyTakes}`)
    r.check('folded volume lands in the owner ledger + card legacy block (anchor declared, rows match)',
        card.players.jalfern && card.players.jalfern.legacyTakes === 1 && card.players.jalfern.takes === 2
        && card.legacy.owner === LEGACY_OWNER && card.legacy.anchored === true && card.legacy.rows === lgRows.length
        && card.totals.humanRows >= lgRows.length,
        JSON.stringify(card.legacy && { ...card.legacy, note: undefined }))
    r.check('folded take audio written under the owner (consented human data, #1712)',
        audioIdx.some((x) => x.key === foldedKey && x.player === LEGACY_OWNER && x.human === true))
    r.check('coverage lines stay native-only and adapter-only: fold cannot add a human game, unadapted games cannot (#1712)',
        card.coverage.gamesCovered.games.length === 3 && !card.coverage.gamesCovered.games.includes('player')
        && !card.coverage.gamesCovered.games.includes('talk-me-down'),
        JSON.stringify(card.coverage.gamesCovered.games))
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
        r.check('player-heldout rows exist (RED under the split mutant)', !vanishing, `heldRows=${heldM.length}`)
    } finally {
        pull(DS)
    }
    if (!r.failed) console.log('mutant: expected RED, got green — holdout is NOT load-bearing?')

    // mutant 2 (#2805): the floor-boss checkpoint-compare skipped in place —
    // the tampered take must ESCAPE the build for the check to bite; if it is
    // still refused, the new engine's replay-verify is not load-bearing.
    const src2 = fs.readFileSync(DS, 'utf8')
    const ANCHOR2 = 'if (want.has(t1)) {\n            const got = fbHash(gs)'
    if (!src2.includes(ANCHOR2)) {
        console.log('FAIL   floor-boss hash-check anchor not found — update the mutant (#2805)')
        r.failed++
    } else {
        plant(DS, src2.replace(ANCHOR2, 'if (false && want.has(t1)) {\n            const got = fbHash(gs)'))
        try {
            const sim2 = await startRelaySim()
            try {
                const tT = scriptedTake({ game: 'floor-boss', seed: 55, ticks: 150, seats: [{ kind: 'human' }], tamper: true })
                await uploadSession(tT, { player: 'mallory', consent: { motion: true, voice: false }, base: sim2.base })
                const cli = await new Promise((resolve) => {
                    const p = spawn(process.execPath, [DS, '--store', sim2.base, '--out', path.join(tmp, 'tamper-mut'), '--limit', '50'],
                        { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                    let stdout = ''
                    p.stdout.on('data', (d) => { stdout += d })
                    p.on('exit', (code) => resolve({ status: code, stdout }))
                })
                const escaped = cli.status === 0
                r.check('tampered floor-boss take refused by the engine (RED under the hash-skip mutant, #2805)', !escaped, escaped ? 'tamper ESCAPED the build' : 'still refused')
            } finally { sim2.close() }
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src2) { console.log('FAIL   mutant restore: exact original bytes not back'); r.failed++ }
        }
    }

    // mutant 3 (#1712 fold): fold decision disabled — the legacy take falls
    // back to flagged and its lg rows vanish. If they still land, the fold
    // decision is not load-bearing.
    const src3 = fs.readFileSync(DS, 'utf8')
    const ANCHOR3 = 't.folded = foldDecision('
    if (!src3.includes(ANCHOR3)) {
        console.log('FAIL   fold anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src3.replace(ANCHOR3, 't.folded = false && foldDecision('))
        try {
            const outM3 = path.join(tmp, 'fold-mut')
            const cli3 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM3, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout = ''
                p.stdout.on('data', (d) => { stdout += d })
                p.on('exit', (code) => resolve({ status: code, stdout }))
            })
            const rowsM3 = cli3.status === 0 && fs.existsSync(path.join(outM3, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM3, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const lgMut = rowsM3.filter((x) => x.lg === 1)
            r.check('legacy fold is load-bearing: lg rows exist (RED under the fold-disable mutant, #1712)', lgMut.length > 0,
                `lgRows=${lgMut.length}${cli3.status !== 0 ? ' build exit ' + cli3.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src3) { console.log('FAIL   mutant restore: exact original bytes not back (#1712)'); r.failed++ }
        }
    }
    // mutant 4 (#1712 adapter): bomb-defuse removed from ADAPTERS — its rows
    // lose THE features and its human (carol) falls back to flagged. If the
    // 35-feature rows still appear, the adapter registration is not load-bearing.
    const src4 = fs.readFileSync(DS, 'utf8')
    const ANCHOR4 = "'bomb-defuse': bombDefuseRows"
    if (!src4.includes(ANCHOR4)) {
        console.log('FAIL   adapter anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src4.replace(ANCHOR4, '/* MUTANT: bomb-defuse adapter bypassed */'))
        try {
            const outM4 = path.join(tmp, 'adapter-mut')
            const cli4 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM4, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout = ''
                p.stdout.on('data', (d) => { stdout += d })
                p.on('exit', (code) => resolve({ status: code, stdout }))
            })
            const rowsM4 = cli4.status === 0 && fs.existsSync(path.join(outM4, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM4, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featBd = rowsM4.some((x) => x.g === 'bomb-defuse' && Array.isArray(x.feat) && x.feat.length === BD_N_FEAT)
            r.check('bomb-defuse adapter is load-bearing: 35-feature rows exist (RED under the adapter-bypass mutant, #1712)',
                featBd, `featRows=${featBd ? 'yes' : 'no'}${cli4.status !== 0 ? ' build exit ' + cli4.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src4) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 adapter)'); r.failed++ }
        }
    }

    // mutant 5 (#1712 trainable gate): adapter gate reopened — the consented
    // human on the adapter-less game (hank) leaks into train with feat:null
    // rows. If it still lands flagged, the gate is load-bearing.
    const src5 = fs.readFileSync(DS, 'utf8')
    const ANCHOR5 = 'const trainable = human && !!ADAPTERS[game]'
    if (!src5.includes(ANCHOR5)) {
        console.log('FAIL   trainable-gate anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src5.replace(ANCHOR5, 'const trainable = human /* MUTANT: no-adapter leak reopened */'))
        try {
            const outM5 = path.join(tmp, 'gate-mut')
            const cli5 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM5, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout = ''
                p.stdout.on('data', (d) => { stdout += d })
                p.on('exit', (code) => resolve({ status: code, stdout }))
            })
            const rowsM5 = cli5.status === 0 && fs.existsSync(path.join(outM5, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM5, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const leaked = rowsM5.some((x) => x.g === 'talk-me-down' && x.split === 'train')
            r.check('trainable gate is load-bearing: no feat:null row in train (RED under the leak-reopen mutant, #1712)',
                !leaked, leaked ? 'no-adapter take LEAKED into train' : 'gate held')
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src5) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 gate)'); r.failed++ }
        }
    }
}

sim.close()
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* temp cleanup best-effort */ }

if (MUTATE) {
    console.log(`\nplaicraft:datasetcheck (mutant) ${r.rows.length - r.failed}/${r.rows.length} checks`)
    if (r.failed) { console.log('RED BY DESIGN (--mutant): ignoring the player split empties the held-out rows — the line is load-bearing.'); process.exit(0) }
    console.log('mutant: expected RED, got green — the split is NOT load-bearing?'); process.exit(1)
}
console.log(`\nplaicraft:datasetcheck ${r.failed ? 'FAILED' : 'PASSED'} (${r.rows.length - r.failed}/${r.rows.length})`)
process.exit(r.failed ? 1 : 0)
