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
//     bomb-defuse adapter bypassed / trainable-gate reopened / SOS adapter
//     bypassed / rally adapter bypassed / double-dragon adapter bypassed /
//     floor-boss tap-replay skipped / contra adapter bypassed / contra
//     rules.seat2 claims ignored / contra arcade-loop rebuild skipped /
//     talk-me-down adapter bypassed — each must go RED (each line is
//     load-bearing).
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
import { applyTap as fbTap, W as FB_W, H as FB_H } from '../src/games/FloorBoss/taps.js'
import { N_FEAT as FB_N_FEAT } from '../src/games/FloorBoss/model.js'
import { createGame as bdMakeGame, step as bdStep, hash as bdHash } from '../src/games/BombDefuse/engine.js'
import { N_FEAT as BD_N_FEAT } from '../src/games/BombDefuse/model.js'
import { createGame as sosMakeGame, stepGame as sosStep, hashState as sosHash } from '../src/games/ShortOrderShout/engine.js'
import { N_FEAT as SOS_N_FEAT, featurize as sosFeaturize } from '../src/games/ShortOrderShout/model.js'
import { createSim as rcMakeSim, tickSim as rcStep, stateHash as rcHash, cpuDriverPad, cpuCoDriverPad, FOG_RANGE, cornerAhead } from '../src/games/RallyCoDriver/sim.js'
import { N_FEAT as RC_N_FEAT, featurize as rcFeaturize } from '../src/games/RallyCoDriver/model.js'
import { makeGame as ddMakeGame, step as ddStep, stateHash as ddHash } from '../src/games/DoubleDragon/sim.js'
import { N_FEAT as DD_N_FEAT, featurize as ddFeaturize } from '../src/games/DoubleDragon/model.js'
import { makeGame as contraMakeGame, step as contraStep, stateHash as contraHash, dropIn as contraDropIn, autopilot as contraAutopilot, arcadeLoop as contraArcadeLoop } from '../src/games/Contra/sim.js'
import { N_FEAT as CONTRA_N_FEAT } from '../src/games/Contra/model.js'
import { createGame as tmdMakeGame, step as tmdStep, hash as tmdHash } from '../src/games/TalkMeDown/engine.js'
import { N_FEAT as TMD_N_FEAT, PANEL as TMD_PANEL, MANUAL as TMD_MANUAL, BLOCK_INDEX as TMD_BI, featurize as tmdFeaturize } from '../src/games/TalkMeDown/model.js'
import { newGame, heroFromPad, p2FromPad } from './plaicraft-export.mjs'
import { classifyTake, playerSplit, seedHeldout, registryIds, buildDataset, floorBossRows, bombDefuseRows, shortOrderShoutRows, rallyCoDriverRows, doubleDragonRows, contraRows, talkMeDownRows, foldDecision, LEGACY_OWNER } from './plaicraft-dataset.mjs'
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

function scriptedTake({ game = 'gauntlet', seed, ticks = 360, seats = [{ kind: 'human' }, { kind: 'cpu' }], voice = null, calls = [], rules = null, tamper = false, weather = null, seat2At = -1, taps = null }) {
    const method = game === 'floor-boss' || game === 'bomb-defuse' || game === 'short-order-shout' || game === 'rally-co-driver' || game === 'double-dragon' || game === 'contra' || game === 'talk-me-down' ? 'dpad' : 'stick'
    const wx = weather || 'clear'
    const contraClaims = [] // #2953: bank ticks of successful blue-seat drops — rides rules.seat2 (see contra block below)
    let gs = game === 'gauntlet' ? newGame(seed, rules || {}, seats[1] && seats[1].kind !== 'off')
        : game === 'floor-boss' ? fbMakeGame(seed, { duel: seats.length >= 2 })
            : game === 'bomb-defuse' ? bdMakeGame(seed, seats.length >= 2 ? 2 : 1)
                : game === 'short-order-shout' ? sosMakeGame(seed, Math.max(1, Math.min(4, seats.length)))
                    : game === 'rally-co-driver' ? rcMakeSim(seed, seats.length >= 2 ? 2 : 1, wx)
                        : game === 'double-dragon' ? ddMakeGame(seed, { coop: seats.length >= 2 })
                            : game === 'contra' ? contraMakeGame(seed)
                                : game === 'talk-me-down' ? tmdMakeGame(seed, seats.length >= 2 ? 2 : 1)
                                    : null
    const hashOf = game === 'gauntlet' ? stateHash
        : game === 'floor-boss' ? fbHash
            : game === 'bomb-defuse' ? bdHash
                : game === 'short-order-shout' ? sosHash
                    : game === 'rally-co-driver' ? rcHash
                        : game === 'double-dragon' ? ddHash
                            : game === 'contra' ? contraHash
                                : game === 'talk-me-down' ? tmdHash : null
    const rec = createRecorder({
        gameId: game, method, seed, players: seats.length, build: 'test',
        sources: seats.map((s) => ({ kind: s.kind === 'relabeled' ? 'human' : s.kind })),
        rules: () => (game === 'rally-co-driver' ? { weather: wx }
            : game === 'double-dragon' ? { seat2At }
                : game === 'contra' ? (contraClaims.length ? { seat2: contraClaims.join(',') } : {})
                    : rules || {}),
    })
    let x = (seed >>> 0) + 1
    const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296)
    const callAt = new Set(calls.map((c) => c.t))
    for (let t = 0; t < ticks; t++) {
        const pads = seats.map(() => ({
            up: rnd() < 0.3, down: rnd() < 0.2, left: rnd() < 0.2, right: rnd() < 0.3,
            a: rnd() < 0.15, b: rnd() < 0.15, ax: Math.cos(rnd() * 6.28), ay: Math.sin(rnd() * 6.28),
            // DD drives its punch on the boost channel; the rnd() is consumed
            // only for double-dragon so every other game's dice stay frozen.
            ...(game === 'double-dragon' ? { boost: rnd() < 0.12 } : {}),
        }))
        if (game === 'gauntlet') step(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
        if (game === 'floor-boss') {
            // #1712: scripted canvas taps ride the same channel the phone banks
            // (pointer{down} in 0..1 canvas space) and hit the sim apply→step,
            // byte for byte the way the live shell runs them.
            const q = taps && taps.find((z) => z.t === t + 1)
            if (q) { pads[0].pointer = { x: q.px / FB_W, y: q.py / FB_H, down: true }; fbTap(gs, q.px, q.py) }
            fbStep(gs, pads)
        }
        if (game === 'bomb-defuse') bdStep(gs, pads)
        if (game === 'short-order-shout') sosStep(gs, pads)
        if (game === 'rally-co-driver') rcStep(gs, pads)
        if (game === 'double-dragon') {
            if (seat2At >= 0 && t === seat2At - 1) gs.jimmy.human = true
            const toSim = (p) => ({ left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, a: !!p.a, b: !!p.b, punch: !!p.boost })
            ddStep(gs, toSim(pads[0]), toSim(pads[1] || {}))
        }
        if (game === 'contra') {
            // #2953: the honest autopilot seats the hero (the calibration standard
            // — it clears stage 1, dies fairly, wins the loop). The blue seat is
            // scripted like a friend at a second keyboard: silent until seat2At,
            // one press (the drop), silence long past seatIdle (the idle handback
            // the sim enforces), then a press again — the RE-CLAIM whose edge the
            // pad LEVEL cannot carry, so successful drops latch on rules.seat2.
            const ap = contraAutopilot(gs)
            pads[0] = { left: !!ap.left, right: !!ap.right, up: !!ap.up, down: !!ap.down, a: !!ap.a, b: !!ap.b }
            const bt = t + 1
            pads[1] = { left: false, right: false, up: false, down: false, a: false, b: false }
            if (seat2At >= 0 && (bt === seat2At || bt >= seat2At + 720)) pads[1].b = true
            if (pads[1].b && !gs.p2.human && !gs.p2.out && !gs.end) { contraDropIn(gs); contraClaims.push(bt) }
            contraStep(gs, pads[0], pads[1])
        }
        if (game === 'talk-me-down') {
            // #1712: the engine consumes the pad ARRAY it banks (seat 0 defuser
            // keys; seat 1 manual keys on a couch take) — padFrom-shape pads are
            // byte-what-the-sim-heard, so the scripted stream replays exactly.
            tmdStep(gs, pads.map((p) => ({ left: !!p.left, right: !!p.right, up: !!p.up, down: !!p.down, a: !!p.a, b: !!p.b })))
        }
        rec.addTick(pads, null, gs && gs.tick % 30 === 0 ? hashOf(gs) : null)
        if (callAt.has(t + 1)) {
            const c = calls.find((q) => q.t === t + 1)
            rec.addVoiceCmd({ said: c.said, intent: c.intent || null, ok: !!c.ok, ...(Number.isInteger(c.seat) ? { seat: c.seat } : {}) }) // #2805 seat stamp
        }
        // #1712: one take spans the arcade loop — after a win the stage returns
        // hotter via the sim's own carry (mirrors contraRows exactly; the clear
        // screen banks nothing, so the tick stream crosses the rebuild seamless).
        if (game === 'contra' && gs.end === 'win' && t + 1 < ticks) gs = contraArcadeLoop(gs)
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
        // no split, no player slot, no coverage credit. (Was talk-me-down —
        // #1712 gave it an adapter; gravel-yard is the next registry title off
        // the trainable shelf.)
        ['hank', scriptedTake({ game: 'gravel-yard', seed: 44, ticks: 150, seats: [{ kind: 'human' }], voice: { slots: [0] } })],
        // #1712 co-op adapters: a named human kitchen (SOS seat 0 + CPU cook
        // stream) and a named human night stage (driver + CPU co-driver calls,
        // rain). These stand for the friends' takes the coverage lines wait on.
        ['carla', scriptedTake({ game: 'short-order-shout', seed: 71, ticks: 240, seats: [{ kind: 'human' }, { kind: 'cpu' }], voice: { slots: [0] } })],
        ['otto', scriptedTake({ game: 'rally-co-driver', seed: 72, ticks: 300, seats: [{ kind: 'human' }, { kind: 'cpu' }], voice: { slots: [0] }, weather: 'rain' })],
        // #1712 street take: Billy human, Jimmy the CPU until tick 30, when a
        // friend drops into the blue seat (rules.seat2At) — the shape a real
        // two-friend run ships from /retrogames/join.
        ['sam', scriptedTake({ game: 'double-dragon', seed: 73, ticks: 300, seats: [{ kind: 'human' }, { kind: 'cpu' }], voice: { slots: [0] }, seat2At: 30 })],
        // #2953 run-and-gun take: the autopilot drives the hero through stage 1,
        // clears and carries into loop 2; a friend drops into the blue seat at 30,
        // walks away (idle handback at ~661), and rappels back in at 750 — the
        // claims ship on rules.seat2 exactly as the phone's shell latches them.
        ['vera', scriptedTake({ game: 'contra', seed: 74, ticks: 2600, seats: [{ kind: 'human' }, { kind: 'cpu' }], voice: { slots: [0] }, seat2At: 30 })],
        // #1712 split-info takes: a solo defuser (the CPU manual speaks on the
        // LCD rail — seat-0 order features come alive) and a couch pair (both
        // seats human from seed-birth; the manual's A flags rules, so the
        // flag-stamp lane lights). These are the shape an autoRecorded phone
        // take ships: seats chosen before seed-birth, no drop-in ceremony.
        ['ivy', scriptedTake({ game: 'talk-me-down', seed: 4242, ticks: 150, seats: [{ kind: 'human' }], voice: { slots: [0] } })],
        ['kai', scriptedTake({ game: 'talk-me-down', seed: 45, ticks: 180, seats: [{ kind: 'human' }, { kind: 'human' }], voice: { slots: [0] }, calls: [{ t: 80, said: 'cut red', intent: null, ok: true }] })],
    ]
    let up = 0
    for (const [player, rec] of uploads) {
        const res = await uploadSession(rec, { player, consent: { motion: true, voice: !!rec.voice }, base: sim.base })
        if (res.ok) up++
    }
    r.check('fixture store provisioned (16 consented takes uploaded)', up === 16, `${up}/16`)

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
    r.check('fixtures classify as expected: 12 human, 1 legacy-folded, 3 flagged',
        humanKeys.size === 12 && foldedKeys.size === 1 && flaggedKeys.size === 3,
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
        rows.some((x) => x.g === 'gravel-yard') && rows.filter((x) => x.g === 'gravel-yard').every((x) => x.split === 'flagged' && x.feat === null)
        && !card.players.hank && !card.coverage.humanPlayers.includes('hank')
        && card.totals.unadaptedHumanTakes === 1 && !card.coverage.gamesCovered.games.includes('gravel-yard')
        && card.games['gravel-yard'].featureAdapter === false && card.games['gravel-yard'].humanTakes === 0)
    r.check('bomb-defuse rows carry THE 35 seat features + encoded actions (#1712 adapter)',
        rows.filter((x) => x.g === 'bomb-defuse').every((x) => Array.isArray(x.feat) && x.feat.length === BD_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && rows.some((x) => x.g === 'bomb-defuse' && x.split !== 'flagged'),
        `rows=${rows.filter((x) => x.g === 'bomb-defuse').length}`)
    r.check('seed axis auditable: train rows keep seedHeldout false, seed-heldout rows true (player axis outranks)',
        rows.every((x) => x.split === 'train' ? !seedHeldout(x.s) : x.split === 'seed-heldout' ? seedHeldout(x.s) : true))
    r.check('gauntlet rows carry real features (adapter) and encoded actions',
        rows.filter((x) => x.g === 'gauntlet').every((x) => Array.isArray(x.feat) && x.feat.length === 31 && typeof x.act === 'object'))
    r.check('no-adapter game still contributes action rows, feat honest-null (flagged at the gate above)',
        rows.some((x) => x.g === 'gravel-yard' && x.feat === null))
    r.check('tool rows flagged with not-a-game reason in card coverage',
        flagRows.some((x) => x.g === 'claptest'))

    // audio verbatim + alignment
    const audioIdx = fs.existsSync(path.join(outA, 'audio/index.jsonl'))
        ? fs.readFileSync(path.join(outA, 'audio/index.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        : []
    r.check('audio index written for consented human takes (gina host+guest; jalfern + legacy-folded + no-adapter-consented hank + carla kitchen + otto stage + sam street + vera jungle + ivy defusal + kai couch carry voice)', audioIdx.length === 14, `${audioIdx.length}/14`)
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
    r.check('card reports honest coverage (8 human games: gauntlet, bomb-defuse, floor-boss, short-order-shout, rally-co-driver, double-dragon, contra, talk-me-down)',
        card.coverage.gamesCovered.pass && card.coverage.gamesCovered.games.includes('floor-boss') && card.coverage.gamesCovered.games.includes('short-order-shout') && card.coverage.gamesCovered.games.includes('rally-co-driver')
        && card.coverage.gamesCovered.games.includes('double-dragon') && card.coverage.gamesCovered.games.includes('contra') && card.coverage.gamesCovered.games.includes('talk-me-down') && card.coverage.audio.pass && card.splits.player.heldout.length >= 1,
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
    { // unit: floor-boss canvas taps (#1712) — a phone tap banks on the pad
        // (pointer{down}, 0..1 canvas space) and replay re-applies it at its
        // tick: a clean tap take verifies; deleting a tap from the stream must
        // break the rebuild (the take the phone played is the law).
        const clean = scriptedTake({
            game: 'floor-boss', seed: 77, ticks: 240, seats: [{ kind: 'human' }],
            // AUTO is in the state hash: tapping the auto chip at t=40 and t=150
            // leaves a deterministic, hash-visible signature on the rebuild
            // (order-card/floor taps fire too but their effect rides world state).
            taps: [{ t: 40, px: 539, py: 20 }, { t: 90, px: 740, py: 80 }, { t: 150, px: 539, py: 20 }],
        })
        const good = floorBossRows('unit/fb-taps', clean)
        const tampered = JSON.parse(JSON.stringify(clean))
        tampered.slots[0].pads[39] = {} // tick 40's AUTO tap, unmade
        const bad = floorBossRows('unit/fb-tapgone', tampered)
        r.check('floor-boss taps: banked pointer taps replay clean; a deleted tap fails verification (#1712)',
            good.ok && good.rows.length === 240 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
        const tapRows = good.rows.filter((x) => x.act && x.act.pointer && x.act.pointer.down)
        r.check('floor-boss taps: the tap ticks carry their pointer in the act column (3 rows, #1712)',
            tapRows.length === 3 && tapRows.every((x) => Number.isFinite(x.act.pointer.x) && Number.isFinite(x.act.pointer.y)),
            `tap-rows=${tapRows.length}`)
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

    // ---- #1712 co-op adapters: SOS + Rally rows, seat partition, crest honesty
    const sosRows = rows.filter((x) => x.g === 'short-order-shout')
    r.check('short-order-shout rows carry THE 55 seat features + encoded actions, never flagged (#1712)',
        sosRows.length === 480 && sosRows.every((x) => Array.isArray(x.feat) && x.feat.length === SOS_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && sosRows.every((x) => x.split !== 'flagged'),
        `rows=${sosRows.length}`)
    r.check('SOS prev-pad lane banked: some row carries a nonzero prev-pad feature (#1712)',
        sosRows.some((x) => x.feat.slice(SOS_N_FEAT - 6).some((v) => v === 1)) && SOS_N_FEAT === 55)
    const rcRows = rows.filter((x) => x.g === 'rally-co-driver')
    r.check('rally-co-driver rows carry THE 41 seat features + encoded actions, never flagged (#1712)',
        rcRows.length === 600 && rcRows.every((x) => Array.isArray(x.feat) && x.feat.length === RC_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && rcRows.every((x) => x.split !== 'flagged'),
        `rows=${rcRows.length}`)
    r.check('rally prev-pad lane banked too (#1712)',
        rcRows.some((x) => x.feat.slice(RC_N_FEAT - 6).some((v) => v === 1)) && RC_N_FEAT === 41)
    // ---- #1712 street adapter: DOUBLE DRAGON rows, drop-in seat law, camera crest
    const ddRows = rows.filter((x) => x.g === 'double-dragon')
    r.check('double-dragon rows carry THE 60 seat features + encoded actions, never flagged (#1712)',
        ddRows.length === 571 && ddRows.every((x) => Array.isArray(x.feat) && x.feat.length === DD_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && ddRows.every((x) => x.split !== 'flagged'),
        `rows=${ddRows.length}`)
    r.check('DD prev-pad lane banked incl boost->punch: some row carries a nonzero prev-pad feature (#1712)',
        ddRows.some((x) => x.feat.slice(DD_N_FEAT - 8, DD_N_FEAT - 1).some((v) => v === 1)) && DD_N_FEAT === 60)
    r.check('DD seat-1 rows begin AT the drop-in tick, never before — nobody drives an un-taken seat (#1712)',
        ddRows.filter((x) => x.seat === 1).length === 271 && ddRows.filter((x) => x.seat === 1).every((x) => x.t >= 30)
        && ddRows.some((x) => x.seat === 1 && x.t === 30))
    const ctraRows = rows.filter((x) => x.g === 'contra')
    r.check('contra rows carry THE 67 seat features + encoded actions, never flagged (#2953)',
        ctraRows.length > 0 && ctraRows.every((x) => Array.isArray(x.feat) && x.feat.length === CONTRA_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && ctraRows.every((x) => x.split !== 'flagged') && CONTRA_N_FEAT === 67,
        `rows=${ctraRows.length}`)
    { // #2953 seat law end-to-end: claims ride rules.seat2 exactly as the shell latched —
        // drop at 30; idle handback ~661 (seatIdle 600 + the descent); re-claim at 750;
        // and after the arcade-loop rebuild (~1782) the friend's held seat re-drops into
        // stage 2 — the third claim, which a post-step edge check would MISS (that's why
        // the shell latches at the call site). seat-1 rows exist ONLY while a person
        // holds the seat (#2058).
        const veraHit = [...envByKey].find(([, e]) => String(e.player) === 'vera')
        const veraRec = veraHit ? await fetchSession(veraHit[0], { base: sim.base, key: SIM_READ_KEY }) : { ok: false }
        const claims = String((veraRec.ok && veraRec.recording.rules && veraRec.recording.rules.seat2) || '').split(',').map(Number)
        const c1 = ctraRows.filter((x) => x.seat === 1).map((x) => x.t)
        r.check('contra claims ride rules.seat2 (drop 30, re-claim 750 after the idle handback, loop-up re-drop past 1500) and seat-1 rows exist ONLY while the seat is a person\'s (#2058)',
            claims.length === 3 && claims[0] === 30 && claims[1] === 750 && claims[2] > 1500
            && c1.length > 0 && c1[0] === 30 && c1.includes(750) && c1.includes(claims[2])
            && !c1.some((t) => t > 661 && t < 750),
            `claims=${JSON.stringify(claims)} seat1first=${c1[0]} seat1=${c1.length}`)
    }
    r.check('contra take spans the arcade loop: jungle rows resume AFTER the boss phase (stage 1 returns hotter, sim-side arcadeLoop verified by checkpoints + final hash) and loopFrac proves loop 2 (#2894/#1712)',
        ctraRows.some((x) => x.lvl === 'boss')
        && ctraRows.some((x) => x.lvl === 'jungle' && x.t > ctraRows.filter((r2) => r2.lvl === 'boss').reduce((a, r2) => Math.max(a, r2.t), 0))
        && ctraRows.some((x) => x.feat[6] >= 0.25),
        `phases=${JSON.stringify([...new Set(ctraRows.map((x) => x.lvl))])}`)
    { // the camera is the crest: a thug beyond the visible window reads ZERO —
        // the honest-zero law pinned directly on the featurizer.
        const g = ddMakeGame(5, { coop: true })
        g.enemies.push({ id: 900, kind: 'williams', x: g.camX + 320 + 200, y: 170, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999, tgt: 'billy', attackCooldown: 60, inv: 0, spinHit: false })
        g.projectiles.push({ id: 901, x: g.camX + 320 + 120, y: 170, vx: -3, spin: 0, side: 'goon' })
        const off = ddFeaturize(g, 0, {})
        g.enemies[0].x = g.camX + 60
        g.projectiles[0].x = g.camX + 300
        const on = ddFeaturize(g, 0, {})
        r.check('DD camera crest: enemy and blade beyond the window read zero, inside read true (#1712 — the honest-zero law)',
            off[19] === 0 && off[28] === 0 && off[40] === 0
            && on[19] === 1 && on[20] !== 0 && on[40] > 0)
    }
    { // unit: DD adapter verifies clean, refuses tampered at its tick
        const clean = scriptedTake({ game: 'double-dragon', seed: 93, ticks: 240, seats: [{ kind: 'human' }, { kind: 'cpu' }], seat2At: 60 })
        const good = doubleDragonRows('unit/dd-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = doubleDragonRows('unit/dd-tamper', badRec)
        r.check('DD adapter: clean drop-in take verifies (421 rows), tampered refuses at its tick (#1712)',
            good.ok && good.rows.length === 421 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
    }
    r.check('rally seat blocks are partitioned: driver rows never carry pace-book features, co rows never carry headlight features (#1712 — the split-information law survives the dataset)',
        rcRows.filter((x) => x.seat === 0).every((x) => x.feat.slice(24, 31).every((v) => v === 0))
        && rcRows.filter((x) => x.seat === 1).every((x) => x.feat.slice(16, 24).every((v) => v === 0)))
    r.check('rally weather rides rules -> replay: the rain take reads rain in every row (hashes verified it rebuilt wet, #1712)',
        rcRows.length > 0 && rcRows.every((x) => x.feat[10] === 1 && x.feat[8] === 0))
    r.check('card games block names both new adapters honestly (featureAdapter true, humanTakes 1 each, #1712)',
        card.games['short-order-shout'] && card.games['short-order-shout'].featureAdapter === true && card.games['short-order-shout'].humanTakes === 1
        && card.games['rally-co-driver'] && card.games['rally-co-driver'].featureAdapter === true && card.games['rally-co-driver'].humanTakes === 1
        && card.games['double-dragon'] && card.games['double-dragon'].featureAdapter === true && card.games['double-dragon'].humanTakes === 1
        && card.games.contra && card.games.contra.featureAdapter === true && card.games.contra.humanTakes === 1
        && card.games['talk-me-down'] && card.games['talk-me-down'].featureAdapter === true && card.games['talk-me-down'].humanTakes === 2)
    { // crest honesty on the source side: a pure-CPU night stage, the driver block
        // may only name corners the fog + crests admit (visibleAhead truth).
        const g = rcMakeSim(11, 2, 'rain')
        let checked = 0
        let leaked = 0
        while (!g.done && g.tick < 9000) {
            rcStep(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
            const f = rcFeaturize(g, 0, {})
            if (f[16] === 1) {
                checked++
                const dd = f[19] * FOG_RANGE
                const visible = cornerAhead(g.stage, g.car.s, g.vis)
                if (dd > g.vis + 1 || !visible.some((c) => Math.abs(c.d - dd) < 2)) leaked++
            }
        }
        r.check('rally driver block never names a corner the crest hides (rain stage, pure-CPU race, #1712)',
            leaked === 0 && checked > 50, `checked=${checked} leaked=${leaked}`)
    }
    { // unit: SOS adapter verifies clean, refuses tampered at the exact tick
        const clean = scriptedTake({ game: 'short-order-shout', seed: 91, ticks: 180, seats: [{ kind: 'human' }] })
        const good = shortOrderShoutRows('unit/sos-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = shortOrderShoutRows('unit/sos-tamper', badRec)
        r.check('SOS adapter: clean solo take verifies (180 rows), tampered refuses at its tick (#1712)',
            good.ok && good.rows.length === 180 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
    }
    { // unit: rally adapter — duel take, tampered refuses
        const clean = scriptedTake({ game: 'rally-co-driver', seed: 92, ticks: 240, seats: [{ kind: 'human' }, { kind: 'cpu' }] })
        const good = rallyCoDriverRows('unit/rc-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = rallyCoDriverRows('unit/rc-tamper', badRec)
        r.check('rally adapter: clean take verifies (480 rows), tampered refuses at its tick (#1712)',
            good.ok && good.rows.length === 480 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
    }
    { // unit: contra adapter (#2953) — clean verifies; tampered refuses; and DROPPING
        // the rules.seat2 claims loses the re-claim at 750 — the checkpoint past it
        // refuses. The claim list is load-bearing, not decoration.
        const clean = scriptedTake({ game: 'contra', seed: 95, ticks: 900, seats: [{ kind: 'human' }, { kind: 'cpu' }], seat2At: 30 })
        const good = contraRows('unit/contra-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = contraRows('unit/contra-tamper', badRec)
        const lostReclaim = JSON.parse(JSON.stringify(clean))
        lostReclaim.rules = { seat2: '30' } // the drop survives; the 750 re-claim is gone
        const dropped = contraRows('unit/contra-reclaimlost', lostReclaim)
        r.check('contra adapter: clean take verifies (900 ticks), tampered refuses at its tick, a lost re-claim refuses at the checkpoint past 750 (#2953 — rules.seat2 load-bearing)',
            good.ok && good.rows.filter((x) => x.seat === 0).length === 900 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0
            && !dropped.ok && !!dropped.mismatch && dropped.mismatch.tick >= 750,
            `clean=${good.ok ? good.rows.length : 'FAIL'} tamper=${bad.mismatch ? bad.mismatch.tick : '-'} noclaim=${dropped.mismatch ? dropped.mismatch.tick : 'ESCAPED'}`)
    }
    // ---- #1712 split-info adapter: TALK ME DOWN rows, seat shape, honest zero
    const tmdRows = rows.filter((x) => x.g === 'talk-me-down')
    r.check('talk-me-down rows carry THE 151 seat features + encoded actions, never flagged (#1712)',
        tmdRows.length === 510 && tmdRows.every((x) => Array.isArray(x.feat) && x.feat.length === TMD_N_FEAT && x.feat.every((v) => Number.isFinite(v)) && typeof x.act === 'object')
        && tmdRows.every((x) => x.split !== 'flagged') && TMD_N_FEAT === 151,
        `rows=${tmdRows.length}`)
    r.check('TMD honest zero: defuser rows carry no rulebook block, manual rows no panel block — the game\'s split-info law survives the dataset (#1712 — rally\'s partition, this time for real)',
        tmdRows.filter((x) => x.seat === 0).every((x) => x.feat.slice(TMD_MANUAL.start, TMD_MANUAL.end).every((v) => v === 0))
        && tmdRows.filter((x) => x.seat === 1).every((x) => x.feat.slice(TMD_PANEL.start, TMD_PANEL.end).every((v) => v === 0)))
    r.check('TMD seat shape: couch take rows BOTH seats from tick 1 (seats chosen at seed-birth), solo take one slot; seat-1 rows exist exactly in the couch take (#1712)',
        tmdRows.filter((x) => x.seat === 1).length === 180
        && tmdRows.filter((x) => x.seat === 1).every((x) => x.s === 45) // kai's couch seed; ivy's solo take has no seat-1 rows
        && tmdRows.filter((x) => x.seat === 0).length === 330)
    r.check('TMD couch manual flags rules on the store rows: flag-stamp one-hot lights on kai seat-1 (#1712)',
        tmdRows.filter((x) => x.seat === 1).some((x) => x.feat.slice(TMD_BI.flagStamp, TMD_BI.flagStamp + 17).some((v) => v === 1)))
    { // deterministic lanes the random fixtures cannot guarantee (strike locks eat
        // the CPU's 90-tick think slot): pin the order rail and the flip gate on
        // the featurizer directly, over a hand-driven sim.
        const g = tmdMakeGame(7, 1)
        const fFace = tmdFeaturize(g, 0, {})
        for (let t = 0; t < 120; t++) tmdStep(g, [{}]) // idle: no strikes; the CPU thinks 90 ticks and speaks
        const fLive = tmdFeaturize(g, 0, {})
        g.flip = 1 // the back plate: batteries/tray/hand become visible
        const fBack = tmdFeaturize(g, 0, {})
        r.check('TMD order rail + flip gate on the featurizer: idle solo sim falls silent (honest zero), after the CPU think-delay exactly one orderKind + its color lights, and the back-plate block reads zero face-up / the hand one-hot flipped (#1712)',
            !fFace.slice(TMD_BI.orderCut, TMD_BI.orderCut + 4).some((v) => v === 1)
            && fLive.slice(TMD_BI.orderCut, TMD_BI.orderCut + 4).filter((v) => v === 1).length === 1 && fLive.slice(TMD_BI.orderColor, TMD_BI.orderColor + 6).some((v) => v === 1)
            && fFace.slice(TMD_BI.batteries, TMD_BI.sel + 3).every((v) => v === 0)
            && fBack.slice(TMD_BI.sel, TMD_BI.sel + 3).filter((v) => v === 1).length === 1,
            `order=${fLive.slice(TMD_BI.orderCut, TMD_BI.orderCut + 4).join('')} faceZero=${fFace.slice(TMD_BI.batteries, TMD_BI.sel + 3).every((v) => v === 0)}`)
    }
    r.check('TMD prev-pad lane banked: some row carries a nonzero prev-pad feature (#1712)',
        tmdRows.some((x) => x.feat.slice(TMD_N_FEAT - 5).some((v) => v === 1)) && TMD_N_FEAT === 151)
    { // source pin (#1415 one-source law): the rail is written structured in the
        // engine (setOrder beside the string) and consumed structured by the
        // featurizer — no reader may regex the rail's words. Legacy snapshots
        // rebuild the field via the engine's own text->structure helper.
        const modelSrc = fs.readFileSync(path.join(here, '..', 'src', 'games', 'TalkMeDown', 'model.js'), 'utf8')
        const engineSrc = fs.readFileSync(path.join(here, '..', 'src', 'games', 'TalkMeDown', 'engine.js'), 'utf8')
        const netSrc = fs.readFileSync(path.join(here, '..', 'src', 'games', 'TalkMeDown', 'net.js'), 'utf8')
        r.check('TMD rail source pin: partnerSay writes orderKind beside the string, the featurizer reads it (never the rail words) (#1415)',
            engineSrc.includes('function setOrder(gs, text, kind)')
            && engineSrc.includes('gs.orderKind = kind')
            && engineSrc.includes('export function orderKindFromText(text)')
            && modelSrc.includes('gs.orderKind')
            && !/\.exec\(gs\.order\)/.test(modelSrc)
            && !/startsWith\('(?:PULL|CUT|DIAL|PRESS)'\)/.test(modelSrc)
            && netSrc.includes('gs.orderKind'))
    }
    { // unit: TMD adapter — couch take verifies clean, tampered refuses at its tick
        const clean = scriptedTake({ game: 'talk-me-down', seed: 96, ticks: 240, seats: [{ kind: 'human' }, { kind: 'human' }] })
        const good = talkMeDownRows('unit/tmd-clean', clean)
        const badRec = JSON.parse(JSON.stringify(clean))
        badRec.hashes[Math.max(0, badRec.hashes.length - 2)].h = 'cafebabe'
        const bad = talkMeDownRows('unit/tmd-tamper', badRec)
        r.check('TMD adapter: clean couch take verifies (480 rows), tampered refuses at its tick (#1712)',
            good.ok && good.rows.length === 480 && !bad.ok && !!bad.mismatch && bad.mismatch.tick > 0,
            bad.mismatch ? `tick ${bad.mismatch.tick}` : (good.ok ? `${good.rows.length} rows` : 'no mismatch?!'))
    }
    { // integration: ONE tampered take per new engine must fail the WHOLE build
        // (the S1 100%-verifiable line, engines four and five).
        const sim3 = await startRelaySim()
        try {
            const tS = scriptedTake({ game: 'short-order-shout', seed: 81, ticks: 150, seats: [{ kind: 'human' }], tamper: true })
            const tR = scriptedTake({ game: 'rally-co-driver', seed: 82, ticks: 180, seats: [{ kind: 'human' }, { kind: 'cpu' }], tamper: true })
            const tD = scriptedTake({ game: 'double-dragon', seed: 83, ticks: 180, seats: [{ kind: 'human' }, { kind: 'cpu' }], seat2At: 40, tamper: true })
            const tC = scriptedTake({ game: 'contra', seed: 85, ticks: 400, seats: [{ kind: 'human' }, { kind: 'cpu' }], seat2At: 30, tamper: true })
            const tM = scriptedTake({ game: 'talk-me-down', seed: 86, ticks: 180, seats: [{ kind: 'human' }, { kind: 'human' }], tamper: true })
            const upS = await uploadSession(tS, { player: 'nina', consent: { motion: true, voice: false }, base: sim3.base })
            const upR = await uploadSession(tR, { player: 'omar', consent: { motion: true, voice: false }, base: sim3.base })
            const upD = await uploadSession(tD, { player: 'pat', consent: { motion: true, voice: false }, base: sim3.base })
            const upC = await uploadSession(tC, { player: 'quin', consent: { motion: true, voice: false }, base: sim3.base })
            const upM = await uploadSession(tM, { player: 'rosa', consent: { motion: true, voice: false }, base: sim3.base })
            const b3 = await buildDataset({ base: sim3.base, out: path.join(tmp, 'tamper-sos-rc'), limit: 50, jonKey: SIM_READ_KEY })
            r.check('tampered SOS + rally + double-dragon + contra + talk-me-down takes fail the whole build, all ticks named (#1712 — unverified rows are never shipped)',
                upS.ok && upR.ok && upD.ok && upC.ok && upM.ok && !b3.ok && Array.isArray(b3.rejected) && b3.rejected.length === 5 && b3.rejected.every((x) => x.mismatch && x.mismatch.tick > 0),
                b3.reason || 'build was GREEN with tampered takes?!')
        } finally { sim3.close() }
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
    r.check('fold never enlarges the player set: humans stay native-11, label "player" is no player, volume separate (#1712)',
        card.coverage.humanPlayers.length === 11 && !card.coverage.humanPlayers.includes('player') && card.totals.humanTakes === 11
        && card.totals.legacyTakes === 1 && card.totals.humanTakesIncludingLegacy === 12
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
        card.coverage.gamesCovered.games.length === 8 && !card.coverage.gamesCovered.games.includes('player')
        && !card.coverage.gamesCovered.games.includes('gravel-yard'),
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
    const ANCHOR4 = "'bomb-defuse': bombDefuseRows,"
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
            const leaked = rowsM5.some((x) => x.g === 'gravel-yard' && x.split !== 'flagged')
            r.check('trainable gate is load-bearing: no-adapter rows never ride a split (RED under the leak-reopen mutant, #1712)',
                !leaked, leaked ? 'no-adapter take LEAKED into a split' : 'gate held')
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src5) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 gate)'); r.failed++ }
        }
    }

    // mutant 6 (#1712 adapter): short-order-shout removed from ADAPTERS — its
    // rows lose THE 55 features and carla falls back to flagged. If the
    // feature rows still appear, the registration is not load-bearing.
    const src6 = fs.readFileSync(DS, 'utf8')
    const ANCHOR6 = "'short-order-shout': shortOrderShoutRows,"
    if (!src6.includes(ANCHOR6)) {
        console.log('FAIL   SOS adapter anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src6.replace(ANCHOR6, '/* MUTANT: SOS adapter bypassed */'))
        try {
            const outM6 = path.join(tmp, 'sos-adapter-mut')
            const cli6 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM6, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout6 = ''
                p.stdout.on('data', (d) => { stdout6 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout6 }))
            })
            const rowsM6 = cli6.status === 0 && fs.existsSync(path.join(outM6, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM6, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featSos = rowsM6.some((x) => x.g === 'short-order-shout' && Array.isArray(x.feat) && x.feat.length === SOS_N_FEAT)
            r.check('SOS adapter is load-bearing: 55-feature rows exist (RED under the SOS adapter-bypass mutant, #1712)',
                featSos, `featRows=${featSos ? 'yes' : 'no'}${cli6.status !== 0 ? ' build exit ' + cli6.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src6) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 SOS adapter)'); r.failed++ }
        }
    }

    // mutant 7 (#1712 adapter): rally-co-driver removed from ADAPTERS — same
    // contract for the pace-note engine.
    const src7 = fs.readFileSync(DS, 'utf8')
    const ANCHOR7 = "'rally-co-driver': rallyCoDriverRows,"
    if (!src7.includes(ANCHOR7)) {
        console.log('FAIL   rally adapter anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src7.replace(ANCHOR7, '/* MUTANT: rally adapter bypassed */'))
        try {
            const outM7 = path.join(tmp, 'rc-adapter-mut')
            const cli7 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM7, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout7 = ''
                p.stdout.on('data', (d) => { stdout7 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout7 }))
            })
            const rowsM7 = cli7.status === 0 && fs.existsSync(path.join(outM7, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM7, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featRc = rowsM7.some((x) => x.g === 'rally-co-driver' && Array.isArray(x.feat) && x.feat.length === RC_N_FEAT)
            r.check('rally adapter is load-bearing: 41-feature rows exist (RED under the rally adapter-bypass mutant, #1712)',
                featRc, `featRows=${featRc ? 'yes' : 'no'}${cli7.status !== 0 ? ' build exit ' + cli7.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src7) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 rally adapter)'); r.failed++ }
        }
    }

    // mutant 8 (#1712 adapter): double-dragon removed from ADAPTERS — its rows
    // fall back to flagged. The registration is load-bearing.
    const src8 = fs.readFileSync(DS, 'utf8')
    const ANCHOR8 = "'double-dragon': doubleDragonRows,"
    if (!src8.includes(ANCHOR8)) {
        console.log('FAIL   double-dragon adapter anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src8.replace(ANCHOR8, '/* MUTANT: double-dragon adapter bypassed */'))
        try {
            const outM8 = path.join(tmp, 'dd-adapter-mut')
            const cli8 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM8, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout8 = ''
                p.stdout.on('data', (d) => { stdout8 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout8 }))
            })
            const rowsM8 = cli8.status === 0 && fs.existsSync(path.join(outM8, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM8, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featDd = rowsM8.some((x) => x.g === 'double-dragon' && Array.isArray(x.feat) && x.feat.length === DD_N_FEAT)
            r.check('double-dragon adapter is load-bearing: 60-feature rows exist (RED under the double-dragon adapter-bypass mutant, #1712)',
                featDd, `featRows=${featDd ? 'yes' : 'no'}${cli8.status !== 0 ? ' build exit ' + cli8.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src8) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 double-dragon adapter)'); r.failed++ }
        }
    }

    // mutant 9 (#1712 tap replay): the banked-tap re-application skipped — a
    // floor-boss take whose phone ran taps can no longer rebuild to its hashed
    // states, so the whole build must go red (unverified rows are never
    // shipped, S1's law). If the tap take still verifies, the tap line is
    // decoration.
    const src9 = fs.readFileSync(DS, 'utf8')
    const ANCHOR9 = 'if (tp && tp.down) fbTap(gs, tp.x * FB_W, tp.y * FB_H)'
    if (!src9.includes(ANCHOR9)) {
        console.log('FAIL   tap-replay anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src9.replace(ANCHOR9, 'if (false && tp && tp.down) fbTap(gs, tp.x * FB_W, tp.y * FB_H) /* MUTANT: tap replay skipped */'))
        try {
            const sim9 = await startRelaySim()
            try {
                const tTap = scriptedTake({ game: 'floor-boss', seed: 31, ticks: 180, seats: [{ kind: 'human' }], taps: [{ t: 40, px: 539, py: 20 }] })
                await uploadSession(tTap, { player: 'tessa', consent: { motion: true, voice: false }, base: sim9.base })
                const outM9 = path.join(tmp, 'tap-mut')
                const cli9 = await new Promise((resolve) => {
                    const p = spawn(process.execPath, [DS, '--store', sim9.base, '--out', outM9, '--limit', '50'],
                        { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                    let stdout9 = ''
                    p.stdout.on('data', (d) => { stdout9 += d })
                    p.on('exit', (code) => resolve({ status: code, stdout: stdout9 }))
                })
                r.check('floor-boss banked-tap take verifies and builds green (RED under the tap-skip mutant — the replay line is load-bearing, #1712)',
                    cli9.status === 0, cli9.status !== 0 ? 'build refused without the tap replay' : 'clean build')
            } finally { sim9.close() }
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src9) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 tap replay)'); r.failed++ }
        }
    }

    // mutant 10 (#2953 adapter): contra removed from ADAPTERS — vera's jungle
    // rows lose THE 65 features and fall back to flagged. The registration is
    // load-bearing.
    const src10 = fs.readFileSync(DS, 'utf8')
    const ANCHOR10 = 'contra: contraRows,'
    if (!src10.includes(ANCHOR10)) {
        console.log('FAIL   contra adapter anchor not found — update the mutant (#2953)')
        r.failed++
    } else {
        plant(DS, src10.replace(ANCHOR10, '/* MUTANT: contra adapter bypassed */'))
        try {
            const outM10 = path.join(tmp, 'contra-adapter-mut')
            const cli10 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM10, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout10 = ''
                p.stdout.on('data', (d) => { stdout10 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout10 }))
            })
            const rowsM10 = cli10.status === 0 && fs.existsSync(path.join(outM10, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM10, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featContra = rowsM10.some((x) => x.g === 'contra' && Array.isArray(x.feat) && x.feat.length === CONTRA_N_FEAT)
            r.check('contra adapter is load-bearing: 67-feature rows exist (RED under the contra adapter-bypass mutant, #2953)',
                featContra, `featRows=${featContra ? 'yes' : 'no'}${cli10.status !== 0 ? ' build exit ' + cli10.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src10) { console.log('FAIL   mutant restore: exact original bytes not back (#2953 contra adapter)'); r.failed++ }
        }
    }

    // mutant 11 (#2953 seat law): the rules.seat2 claims ignored — the blue
    // seat never seats its person, replay diverges at the first drop, the whole
    // build must refuse. If vera still verifies, the claim line is decoration.
    const src11 = fs.readFileSync(DS, 'utf8')
    const ANCHOR11 = 'if (claims.has(t1)) contraDropIn(gs)'
    if (!src11.includes(ANCHOR11)) {
        console.log('FAIL   contra claims anchor not found — update the mutant (#2953)')
        r.failed++
    } else {
        plant(DS, src11.replace(ANCHOR11, 'if (false && claims.has(t1)) contraDropIn(gs) /* MUTANT: seat-2 claims ignored */'))
        try {
            const outM11 = path.join(tmp, 'contra-claims-mut')
            const cli11 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM11, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout11 = ''
                p.stdout.on('data', (d) => { stdout11 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout11 }))
            })
            const rowsM11 = cli11.status === 0 && fs.existsSync(path.join(outM11, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM11, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const seatRowsM11 = rowsM11.some((x) => x.g === 'contra' && x.seat === 1)
            r.check('contra claims are load-bearing: verified seat-1 rows exist (RED under the claims-ignored mutant, #2953)',
                seatRowsM11, `seat1Rows=${seatRowsM11 ? 'yes' : 'no'}${cli11.status !== 0 ? ' build exit ' + cli11.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src11) { console.log('FAIL   mutant restore: exact original bytes not back (#2953 contra claims)'); r.failed++ }
        }
    }

    // mutant 12 (#2953 arcade loop): the loop-up rebuild skipped in contraRows —
    // a take that cleared stage 1 can no longer rebuild loop 2, so the hash
    // stream diverges past the win and the build refuses. The loop carry is
    // load-bearing for any take that reaches loop 2.
    const src12 = fs.readFileSync(DS, 'utf8')
    const ANCHOR12 = "if (gs.end === 'win' && t1 < rec.ticks) gs = contraArcadeLoop(gs)"
    if (!src12.includes(ANCHOR12)) {
        console.log('FAIL   contra loop-rebuild anchor not found — update the mutant (#2953)')
        r.failed++
    } else {
        plant(DS, src12.replace(ANCHOR12, "if (false && gs.end === 'win' && t1 < rec.ticks) gs = contraArcadeLoop(gs) /* MUTANT: arcade loop rebuild skipped */"))
        try {
            const outM12 = path.join(tmp, 'contra-loop-mut')
            const cli12 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM12, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout12 = ''
                p.stdout.on('data', (d) => { stdout12 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout12 }))
            })
            r.check('contra arcade-loop carry is load-bearing: the loop-crossing take verifies (RED under the rebuild-skip mutant, #2953)',
                cli12.status === 0, cli12.status !== 0 ? 'build refused without the loop rebuild' : 'clean build')
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src12) { console.log('FAIL   mutant restore: exact original bytes not back (#2953 contra loop carry)'); r.failed++ }
        }
    }
    // mutant 13 (#1712 adapter): talk-me-down removed from ADAPTERS — ivy's and
    // kai's rows lose THE 151 features and fall back to flagged. The
    // registration is load-bearing.
    const src13 = fs.readFileSync(DS, 'utf8')
    const ANCHOR13 = "'talk-me-down': talkMeDownRows,"
    if (!src13.includes(ANCHOR13)) {
        console.log('FAIL   talk-me-down adapter anchor not found — update the mutant (#1712)')
        r.failed++
    } else {
        plant(DS, src13.replace(ANCHOR13, '/* MUTANT: talk-me-down adapter bypassed */'))
        try {
            const outM13 = path.join(tmp, 'tmd-adapter-mut')
            const cli13 = await new Promise((resolve) => {
                const p = spawn(process.execPath, [DS, '--store', sim.base, '--out', outM13, '--limit', '50'],
                    { env: { ...process.env, JON_KEY: SIM_READ_KEY } })
                let stdout13 = ''
                p.stdout.on('data', (d) => { stdout13 += d })
                p.on('exit', (code) => resolve({ status: code, stdout: stdout13 }))
            })
            const rowsM13 = cli13.status === 0 && fs.existsSync(path.join(outM13, 'dataset.jsonl'))
                ? fs.readFileSync(path.join(outM13, 'dataset.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
                : []
            const featTmd = rowsM13.some((x) => x.g === 'talk-me-down' && Array.isArray(x.feat) && x.feat.length === TMD_N_FEAT)
            r.check('talk-me-down adapter is load-bearing: 151-feature rows exist (RED under the talk-me-down adapter-bypass mutant, #1712)',
                featTmd, `featRows=${featTmd ? 'yes' : 'no'}${cli13.status !== 0 ? ' build exit ' + cli13.status : ''}`)
        } finally {
            pull(DS)
            if (fs.readFileSync(DS, 'utf8') !== src13) { console.log('FAIL   mutant restore: exact original bytes not back (#1712 talk-me-down adapter)'); r.failed++ }
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
