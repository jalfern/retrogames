// PLAICRAFT DATASET (#1712, big build S2) — one command that pulls the S1
// store and writes a VERSIONED dataset of human play, audio included.
//
//   npm run plaicraft:dataset                       # the production store (JON_KEY via localkey)
//   npm run plaicraft:dataset -- --store <base> --out <dir>
//
// What it writes into --out (all deterministic — same store bytes twice,
// byte-identical files twice; that is acceptance line 1):
//
//   dataset.jsonl   one row per (take, tick, seat): game-state features +
//                   that seat's action that tick. feat comes from THE game's
//                   featurizer during a replay that must verify every stored
//                   checkpoint (S1's law: unverified rows are never shipped);
//                   games without a featurizer adapter carry feat:null honestly.
//   audio/<file>    every consented voice track, decoded VERBATIM (voice.js:
//                   re-export is decode-and-write, nothing to transcode).
//   audio/index.jsonl  per track: seats, player, mime, wall ms, the tick->ms
//                   clock, and clips — voiceCmd calls cut to tick-aligned ms
//                   windows of the track file.
//   card.json       the dataset card: games, players, hours, sessions with
//                   voice — plus the honest coverage block: which acceptance
//                   lines the STORE can meet today and which are blocked.
//   manifest.json   version + per-file sha256. version = sha256 over the
//                   sorted (path, hash) lines of the content files
//                   (dataset.jsonl + audio/**). No build timestamps anywhere:
//                   a rebuild of the same store yields the same version — the
//                   determinism acceptance line, mechanically.
//
// Honesty doctrine (the #1712 audit, Claude for Jon, 2026-11-20):
//  - train/heldout are fed by HUMAN takes only: a named player (not the
//    pre-audit fixed 'player', not a bot handle), a NATIVE human seat
//    (kind 'human' WITHOUT relabeledFrom — relay/core.js auditTakeSources
//    semantics: a relabeled seat is an audit stamp, never a counted player),
//    and a real game (a registry id — /claptest is a calibration tool, not a
//    game). Everything else lands split 'flagged' with a reason and NEVER
//    feeds train or held-out.
//  - Player split: whole people held out (sha256-ranked; held-out players
//    appear in NO train row). Seed split: sha256(seed) % 100 >= 80 is a
//    seed-held-out row — an axis auditable from the seed alone.
//  - Fewer than 2 human players means the player split cannot honestly
//    hold anyone out: the card says holdoutBlocked, it does NOT fake a
//    split by carving one person's sessions.
//  - Legacy fold (#1712, ruling ask #2844): pre-audit takes labeled 'player'
//    with native human seats are attributed to LEGACY_OWNER (declared
//    constant, anchor-proven) so the store owner's own pre-audit play reaches
//    train, flagged lg on every row. Relabeled/model seats never fold; splits
//    and coverage lines judge native named humans only — the fold adds
//    volume, never a second player and never a new human game.
//  - Trainable gate (#1712, this pass): consent puts a take on the board; the
//    ADAPTER puts it in train. A take whose game has no replay adapter cannot
//    be verified tick-for-tick (S1's law: unverified rows are never shipped)
//    and carries feat:null (acceptance line 1 wants features per tick) — so it
//    lands split 'flagged' (reason no-adapter), stays out of the player split
//    and the coverage lines, and its count rides card.totals.unadaptedHumanTakes.
//    Consented HUMAN audio still lands: consent and replayability are separate
//    gates, and voice data keeps its value even when the actions must wait for
//    an adapter.

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { listSessions, fetchSession, tickSeconds } from '../src/utils/sessionStore.js'
import { readKey } from './lib/localkey.mjs'
import { decodePad, encodePad } from '../src/utils/recording.js'
import { voiceReexport, tickToMs, containerDurationMs } from '../src/utils/voice.js'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'
import { featurize } from '../src/games/Gauntlet/model.js'
import { makeGame as fbMakeGame, step as fbStep, stateHash as fbHash, nextShift as fbNextShift } from '../src/games/FloorBoss/sim.js'
import { featurize as fbFeaturize, seatChannel } from '../src/games/FloorBoss/model.js'
import { applyTap as fbTap, W as FB_W, H as FB_H } from '../src/games/FloorBoss/taps.js'
import { createGame as bdMakeGame, step as bdStep, hash as bdHash } from '../src/games/BombDefuse/engine.js'
import { featurize as bdFeaturize } from '../src/games/BombDefuse/model.js'
import { createGame as sosMakeGame, stepGame as sosStep, hashState as sosHash } from '../src/games/ShortOrderShout/engine.js'
import { featurize as sosFeaturize } from '../src/games/ShortOrderShout/model.js'
import { createSim as rcMakeSim, tickSim as rcStep, stateHash as rcHash } from '../src/games/RallyCoDriver/sim.js'
import { featurize as rcFeaturize } from '../src/games/RallyCoDriver/model.js'
import { makeGame as ddMakeGame, step as ddStep, stateHash as ddHash } from '../src/games/DoubleDragon/sim.js'
import { featurize as ddFeaturize } from '../src/games/DoubleDragon/model.js'
import { makeGame as contraMakeGame, step as contraStep, stateHash as contraHash, dropIn as contraDropIn, arcadeLoop as contraArcadeLoop } from '../src/games/Contra/sim.js'
import { featurize as contraFeaturize } from '../src/games/Contra/model.js'
import { createGame as tmdMakeGame, step as tmdStep, hash as tmdHash } from '../src/games/TalkMeDown/engine.js'
import { featurize as tmdFeaturize } from '../src/games/TalkMeDown/model.js'
import { newGame, heroFromPad, p2FromPad, seatedPartner } from './plaicraft-export.mjs'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    if (hit) return hit.split('=').slice(1).join('=')
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

// --- registry ids (src/config/games.js is the single source of truth) ---------
// Node cannot import the registry (it pulls the .jsx components), so read the
// ids from the file text: a route path is the game id. Deterministic.
export function registryIds(root = repoRoot) {
    const text = fs.readFileSync(path.join(root, 'src/config/games.js'), 'utf8')
    const ids = new Set()
    for (const m of text.matchAll(/path:\s*'\/([a-z0-9-]+)'/g)) ids.add(m[1])
    return ids
}

// --- classification ---------------------------------------------------------------
export const BOT_HANDLES = new Set(['qabot', 'qabot2', 'harness', 'bot', 'rlbot'])

// A take's class from the envelope + the file's own seat provenance.
// Order: tool (not a game) > bot handle > unnamed player > relabeled-only
// human seats > human. `reasons` carries every flag seen, in audit order.
export function classifyTake(envelope, rec, registry) {
    const reasons = []
    const game = rec && typeof rec.game === 'string' ? rec.game : String(envelope.game || '')
    const tool = !registry.has(game)
    if (tool) reasons.push('not-a-game')
    const player = String(envelope.player || rec?.player || '')
    if (BOT_HANDLES.has(player)) reasons.push('bot-handle')
    const unnamed = player === 'player' || !player
    if (unnamed && !BOT_HANDLES.has(player)) reasons.push('unnamed-player')
    let native = 0
    let relabeled = 0
    for (const s of (rec && rec.slots) || []) {
        const src = s && s.source
        if (src && src.kind === 'human') {
            if (src.relabeledFrom !== undefined) relabeled++
            else native++
        }
    }
    if (relabeled > 0) reasons.push('relabeled-seat')
    let cls
    if (tool) cls = 'tool'
    else if (BOT_HANDLES.has(player)) cls = 'bot'
    else if (unnamed) cls = 'unnamed'
    else if (native === 0) cls = relabeled > 0 ? 'relabeled' : 'bot'
    else cls = 'human'
    return { cls, reasons, native, relabeled }
}

// --- splits ----------------------------------------------------------------------
const SEED_HELDOUT_MOD = 100
const SEED_HELDOUT_FROM = 80

const shaHex = (s) => createHash('sha256').update(s).digest('hex')
const shaOf = (s) => BigInt('0x' + shaHex(s))

// Whole-player holdout: deterministic sha256 ranking over the human players.
// ~1/4 of players held out; degenerate cases fixed so BOTH splits stay
// non-empty whenever 2+ players exist (a split that holds out everyone or
// nobody proves nothing).
export function playerSplit(players) {
    const heldout = new Set()
    const sorted = [...players].sort()
    if (sorted.length < 2) return { heldout, blocked: sorted.length < 1 ? 'no-players' : 'need-2-players' }
    const rank = sorted.map((p) => ({ p, r: shaOf('plaicraft-player-split-v1:' + p) }))
    for (const { p, r } of rank) if (r % 4n === 0n) heldout.add(p)
    const min = rank.slice().sort((a, b) => (a.r < b.r ? -1 : 1))[0].p
    const max = rank.slice().sort((a, b) => (a.r > b.r ? -1 : 1))[0].p
    if (heldout.size === sorted.length) heldout.delete(min) // keep someone in train
    if (heldout.size === 0) heldout.add(max) // keep someone held out
    return { heldout, blocked: null }
}

export const seedHeldout = (seed) => shaOf('plaicraft-seed-split-v1:' + seed) % BigInt(SEED_HELDOUT_MOD) >= BigInt(SEED_HELDOUT_FROM)

// --- legacy fold (#1712, this session) ---------------------------------------------
// The store's pre-audit-1 takes carry the fixed 'player' label: recorded by the
// device's human before identity existed, all with consented voice. The #1712
// audit (Claude for Jon, 2026-11-20) states as fact: "today every human take is
// jalfern's". So anonymity here is a labeling gap, not an unknown person — the
// fold attributes those takes to the owner so honest human play reaches train
// (rule: relabeled/bot/tool stays out — foldDecision below).
//   LEGACY_OWNER is a DECLARED attribution, printed on the card with its anchor
//   proof, so the claim is reviewable rather than inferred. Ruling ask: #2844
//   (default A: keep fold; revert = one constant + deterministic rebuild).
//   The fold NEVER touches an acceptance line: playerSplit and coverage judge
//   native named humans only; folded takes can add volume, never a second
//   player, never a new human game.
export const LEGACY_OWNER = 'jalfern'

// Pure fold gate: a take folds iff it is the legacy unnamed label, carries a
// NATIVE human seat with NO relabeled seat anywhere in it (the audit's
// relabeled exclusion outranks the fold), and the owner has a native named take
// in the same store — the attribution anchor. No anchor, no fold: anonymity is
// never attributed to a person the store cannot independently prove.
export function foldDecision(cls, native, relabeled, nativeHumans) {
    return cls === 'unnamed' && native > 0 && relabeled === 0 && nativeHumans.has(LEGACY_OWNER)
}

// --- game adapters ---------------------------------------------------------------
// A game adapter replays a stored take against THE sim (every recorded
// checkpoint must match — S1's 100% line) and emits one row per tick per seat
// with real features. Games without an adapter still contribute rows (the
// actions and seeds are real play) but feat stays null, and the card names
// the missing adapter.
function gauntletRows(key, rec) {
    const rules = rec.rules || {}
    const gs = newGame(rec.seed, rules, seatedPartner(rec))
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        step(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
        const t1 = t + 1
        if (want.has(t1)) {
            const got = stateHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            const ent = i === 0 ? gs.hero : i === 1 ? gs.partner : null
            let feat = null
            if (ent && gs.hero && gs.partner) {
                if (!mems[i]) mems[i] = {}
                feat = featurize(gs, ent, mems[i]).map((v) => +v.toFixed(3))
            }
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.level, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === stateHash(gs)
    return { ok, mismatch: null, rows }
}

// floor-boss adapter (#2805): the sim is Node-clean (floorbosscheck runs it
// here), so takes replay-verify against their checkpoints and carry THE
// model.js seat features (37, src/games/FloorBoss/model.js). A duel take
// (#2555, 2 seats) re-runs with its model seat; every slot keeps its action
// row (the house's hands are data too), feat null only where no channel exists.
export function floorBossRows(key, rec) {
    const gs = fbMakeGame(rec.seed, { duel: rec.players >= 2 })
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        // #2958 career take: rows that survive a whistle mean the player clocked
        // into the next shift — the over-screen key/tap itself banks nothing (the
        // tick clock freezes while the sheet holds the floor), so the stream's
        // continuation IS the clock-in. Advance the night with the game's own
        // ladder (same seeded stream; the shift bits ride stateHash, #2346 law),
        // and every checkpoint past the seam must still match — invented
        // post-whistle rows stay caught.
        if (gs.end === 'win') fbNextShift(gs)
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        // #1712: canvas taps bank on seat 0's pad as pointer{down} in 0..1
        // canvas space (onePad #420) — re-apply HERE, before the step, so
        // replay runs the exact tick sequence the phone ran (apply → step).
        const tp = pads[0] && pads[0].pointer
        if (tp && tp.down) fbTap(gs, tp.x * FB_W, tp.y * FB_H)
        fbStep(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = fbHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            const who = seatChannel(gs, i)
            let feat = null
            if (who) {
                if (!mems[i]) mems[i] = {}
                feat = fbFeaturize(gs, who, mems[i]).map((v) => +v.toFixed(3))
                mems[i].pa = pads[i] // #1712: bank the autoregressive lane AFTER the label —
                // model.js documents this contract; without it the prev-pad features rode zero forever.
            }
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.shift, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === fbHash(gs)
    return { ok, mismatch: null, rows }
}

// bomb-defuse adapter (#1712): engine.js is Node-clean and integer-only (the
// #1793 lesson applied at its birth), so takes replay-verify against their
// checkpoints and carry THE 35 seat features (src/games/BombDefuse/model.js).
// Solo takes record ONE slot — seat 2 lives inside the sim (engine.partnerPad);
// its hands are visible to the player through the partner lamps, which ride
// the features (this game splits EFFORT, not information).
export function bombDefuseRows(key, rec) {
    const gs = bdMakeGame(rec.seed, rec.players >= 2 ? 2 : 1)
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        bdStep(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = bdHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            if (!mems[i]) mems[i] = {}
            const feat = bdFeaturize(gs, i, mems[i]).map((v) => +v.toFixed(3))
            mems[i].pa = pads[i] // bank the autoregressive lane after the label
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.bomb, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === bdHash(gs)
    return { ok, mismatch: null, rows }
}

// short-order-shout adapter (#1712): engine.js is Node-clean (soscheck runs it
// here) and hashState is integer-only FNV, so takes replay-verify against their
// checkpoints and carry THE 55 seat features (src/games/ShortOrderShout/
// model.js). The shell banks the MERGED pad stream — human keys AND the CPU
// cook emitters (liveTick records exactly what stepGame consumed) — so replay
// needs no emitter re-run: the stored streams ARE the run. Solo takes record
// one seat; the other cooks exist only in files whose players say so.
export function shortOrderShoutRows(key, rec) {
    const gs = sosMakeGame(rec.seed, Math.max(1, Math.min(4, (rec.players || 1) | 0)))
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        sosStep(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = sosHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            if (!mems[i]) mems[i] = {}
            const feat = sosFeaturize(gs, i, mems[i]).map((v) => +v.toFixed(3))
            mems[i].pa = pads[i] // bank the autoregressive lane after the label
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: null, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === sosHash(gs)
    return { ok, mismatch: null, rows }
}

// rally-co-driver adapter (#1712): sim.js is Node-clean and quantized (the
// stateHash rounds its floats — the cross-platform determinism law), so takes
// replay-verify against their checkpoints and carry THE 41 seat features
// (src/games/RallyCoDriver/model.js). Weather is NOT seed-fixed (#1711 S3
// stamped rules.weather into the file for exactly this); seat 0 drives, seat 1
// reads the pace book — and the model keeps that information split honest, so
// a train row can never teach a driver what the crest hides. The shell banks
// the pad pair it consumed (CPU co-driver calls included), like SOS.
export function rallyCoDriverRows(key, rec) {
    const weather = rec.rules && typeof rec.rules.weather === 'string' ? rec.rules.weather : 'clear'
    const gs = rcMakeSim(rec.seed, (rec.players || 1) >= 2 ? 2 : 1, weather)
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        rcStep(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = rcHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            if (!mems[i]) mems[i] = {}
            const feat = rcFeaturize(gs, i, mems[i]).map((v) => +v.toFixed(3))
            mems[i].pa = pads[i] // bank the autoregressive lane after the label
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.lapsDone, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === rcHash(gs)
    return { ok, mismatch: null, rows }
}

// double-dragon adapter (#1712): sim.js is Node-clean and seed-pure (every
// die rides mulberry32 — ddragoncheck replays byte-equal), so takes
// replay-verify against their checkpoints and carry THE 60 seat features
// (src/games/DoubleDragon/model.js). The shell banks the pad PAIR it consumed
// (Jimmy's CPU personality lives inside the sim, like SOS's cook emitters),
// and rules.seat2At stamps the tick the drop-in law handed the blue seat to a
// person — the seed cannot know when a friend reached for WASD. Seat-1 rows
// begin AT that tick: before the seat is taken its stream is nobody's, and
// rows must never teach the CPU's habits as a person's. The camera is the
// crest: model features mask to the visible window (the honest-zero law).
export function doubleDragonRows(key, rec) {
    const players = Math.max(1, Math.min(2, (rec.players || 1) | 0))
    const gs = ddMakeGame(rec.seed, { coop: players >= 2 })
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    const seat2At = rec.rules && Number.isInteger(rec.rules.seat2At) ? rec.rules.seat2At : -1
    for (let t = 0; t < rec.ticks; t++) {
        if (gs.jimmy && seat2At >= 0 && t === seat2At - 1) gs.jimmy.human = true
        const decoded = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        const p1 = decoded[0] || {}
        const p2 = decoded[1] || {}
        ddStep(gs,
            { left: !!p1.left, right: !!p1.right, up: !!p1.up, down: !!p1.down, a: !!p1.a, b: !!p1.b, punch: !!p1.boost },
            { left: !!p2.left, right: !!p2.right, up: !!p2.up, down: !!p2.down, a: !!p2.a, b: !!p2.b, punch: !!p2.boost })
        const t1 = t + 1
        if (want.has(t1)) {
            const got = ddHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            if (i === 1 && (seat2At < 0 || t1 < seat2At)) continue // seat-1 rows begin when a person took it
            if (!mems[i]) mems[i] = {}
            const feat = ddFeaturize(gs, i, mems[i]).map((v) => +v.toFixed(3))
            mems[i].pa = decoded[i] // bank the autoregressive lane after the label
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.stage, seat: i, act: encodePad(decoded[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === ddHash(gs)
    return { ok, mismatch: null, rows }
}

// CONTRA adapter (#1712, #2953 default — widen the trainable shelf). The bank
// carries the pad PAIR the shell consumed; two facts ride with it:
//  - rules.seat2: the bank ticks of every SUCCESSFUL blue-seat drop-in. Pad
//    LEVEL alone cannot carry the ceremony (auto-repeat is blocked at the
//    keyboard, so a re-claim after the idle handback is a fresh keydown whose
//    edge the stream can't show) — the shell latches at the call site.
//  - the arcade loop: after `end:'win'` the stage returns hotter via the
//    sim's own arcadeLoop() (#2894 law, lifted into sim.js so this rebuild is
//    byte-identical). The clear screen banks nothing, so the tick stream passes
//    through the rebuild without a seam; a take whose win tick IS its last bank
//    (tab closed mid-clear) must NOT rebuild — the final hash is the win state.
// Rows: seat 0 always (the thumb, by autoStart's #2058 construction); seat 1
// only while a HUMAN holds it — the wingman's CPU brain never produces rows.
export function contraRows(key, rec) {
    let gs = contraMakeGame(rec.seed)
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    const claims = new Set(String((rec.rules && rec.rules.seat2) || '').split(',').filter((s) => s !== '').map(Number))
    for (let t = 0; t < rec.ticks; t++) {
        const t1 = t + 1
        if (claims.has(t1)) contraDropIn(gs) // self-guarded: out/end/human already-seated no-op, and live no-op'd too
        const decoded = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        const p1 = decoded[0] || {}
        const p2 = decoded[1] || {}
        const p2human = !!gs.p2.human
        contraStep(gs,
            { left: !!p1.left, right: !!p1.right, up: !!p1.up, down: !!p1.down, a: !!p1.a, b: !!p1.b },
            { left: !!p2.left, right: !!p2.right, up: !!p2.up, down: !!p2.down, a: !!p2.a, b: !!p2.b })
        if (want.has(t1)) {
            const got = contraHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        const seats = [{ p: p1, idx: 0 }]
        if (p2human) seats.push({ p: p2, idx: 1 })
        for (const s of seats) {
            if (!mems[s.idx]) mems[s.idx] = {}
            const feat = contraFeaturize(gs, s.idx, mems[s.idx]).map((v) => +v.toFixed(3))
            mems[s.idx].pa = s.p
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.phase, seat: s.idx, act: encodePad(s.p, rec.method), feat })
        }
        if (gs.end === 'win' && t1 < rec.ticks) gs = contraArcadeLoop(gs)
    }
    const ok = !finalT || finalT.h === contraHash(gs)
    return { ok, mismatch: null, rows }
}

// TALK ME DOWN adapter (#1712, #2953-default continued — the last autoRecord-
// wired game without one). engine.js is Node-clean and seed-pure (every die
// rides mulberry32 — bombcheck replays determinism), so takes replay-verify
// against their checkpoints and carry THE 151 seat features (src/games/
// TalkMeDown/model.js). Offline semantics: seats are chosen at seed-birth (the
// select screen, before seed-birth per #1711) and online lockstep runs are not
// auto-recorded at S2 — so there is no drop-in ceremony to carry (unlike DD/
// Contra): solo takes bank ONE slot (the CPU manual lives in the sim as
// partnerSay, state not pads), couch takes bank TWO human slots. Rows: one per
// banked seat per tick; the model keeps the game's split-information law
// (defuser rows carry no rulebook facts, manual rows no panel facts).
export function talkMeDownRows(key, rec) {
    const players = Math.max(1, Math.min(2, (rec.players || 1) | 0))
    const gs = tmdMakeGame(rec.seed, players)
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mems = {}
    const rows = []
    const finalT = rec.hashes.length ? rec.hashes[rec.hashes.length - 1] : null
    for (let t = 0; t < rec.ticks; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        tmdStep(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = tmdHash(gs)
            if (got !== want.get(t1)) return { ok: false, mismatch: { tick: t1, want: want.get(t1), got }, rows }
        }
        for (let i = 0; i < rec.slots.length; i++) {
            if (!mems[i]) mems[i] = {}
            const feat = tmdFeaturize(gs, i, mems[i]).map((v) => +v.toFixed(3))
            mems[i].pa = pads[i] // bank the autoregressive lane after the label
            rows.push({ k: key, g: rec.game, s: rec.seed, t: t1, lvl: gs.round, seat: i, act: encodePad(pads[i]), feat })
        }
    }
    const ok = !finalT || finalT.h === tmdHash(gs)
    return { ok, mismatch: null, rows }
}

const ADAPTERS = {
    gauntlet: gauntletRows,
    'floor-boss': floorBossRows,
    'bomb-defuse': bombDefuseRows,
    'short-order-shout': shortOrderShoutRows,
    'rally-co-driver': rallyCoDriverRows,
    'double-dragon': doubleDragonRows,
    contra: contraRows,
    'talk-me-down': talkMeDownRows,
}

// --- audio -----------------------------------------------------------------------
// Clips: voiceCmd calls (what was SAID, on the tick clock) cut to ms windows
// of the verbatim track via the track's own clock trace. Windows are clamped
// into the track; ±-bounds are the documented constants, so rebuilds match.
const CLIP_BEFORE_MS = 500
const CLIP_AFTER_MS = 1500

export function trackClips(rec, track) {
    const calls = (rec.voiceCmd || []).filter((c) => c && Number.isInteger(c.t))
    const clips = []
    for (const c of calls) {
        // #2805 per-seat attribution: a recorder-stamped call (voiceCmd.seat)
        // belongs to that mic's track ONLY. Un-stamped calls are the host-mic
        // law (slot 0) — honest default, never a guess onto another seat.
        const owner = Number.isInteger(c.seat) ? c.seat : 0
        if (!(track.slots || []).includes(owner)) continue
        const ms = tickToMs(track.clock, c.t)
        if (ms === null) continue
        const start = Math.max(0, Math.round(ms - CLIP_BEFORE_MS))
        const end = Math.min(Math.round(track.ms), Math.round(ms + CLIP_AFTER_MS))
        const clip = { t: c.t, msStart: start, msEnd: end, said: c.said }
        if (c.intent) clip.intent = c.intent
        clip.ok = c.ok
        if (Number.isInteger(c.seat)) clip.seat = c.seat
        clips.push(clip)
    }
    return clips
}

const safeFile = (key) => key.replace(/[^a-z0-9._-]+/gi, '_')

// --- the build -------------------------------------------------------------------
export async function buildDataset({ base, out, limit = 500, jonKey = null, registry = null }) {
    registry = registry || registryIds()
    const listed = await listSessions({ base, limit, key: jonKey })
    if (!listed.ok) return { ok: false, reason: listed.reason }

    const takes = []
    for (const row of listed.sessions) {
        const got = await fetchSession(row.key, { base, key: jonKey })
        if (!got.ok) return { ok: false, reason: `fetch ${row.key}: ${got.reason}` }
        takes.push({ envelope: row, rec: got.recording })
    }
    takes.sort((a, b) => (a.envelope.key < b.envelope.key ? -1 : 1))

    const humans = new Set()
    const pre = takes.map((t) => {
        const c = classifyTake(t.envelope, t.rec, registry)
        if (c.cls === 'human') humans.add(String(t.envelope.player || t.rec.player))
        return { ...t, cls: c.cls, reasons: c.reasons, native: c.native, relabeled: c.relabeled }
    })
    // Legacy fold (see LEGACY_OWNER note): unnamed native takes attribute to
    // the owner, whose anchor must be a native named human in THIS store.
    // Decided after classification so the anchor fact (humans) exists; `humans`
    // itself is never enlarged by the fold — splits and coverage stay native.
    let legacyTakes = 0
    let legacyTicks = 0
    for (const t of pre) {
        t.folded = foldDecision(t.cls, t.native, t.relabeled, humans)
        if (t.folded) { legacyTakes++; legacyTicks += t.rec.ticks }
    }
    // Trainable doctrine (#1712): CONSENT routes a take out of 'flagged' (the
    // audit classes above), and the ADAPTER gate routes it into train/heldout —
    // an adapter-less take cannot be replay-verified here (S1's law: unverified
    // rows are never shipped) and its feat:null rows cannot meet acceptance
    // line 1 ("game state features per tick"). Named humans on unadapted games
    // keep their consent (audio lands, identity is on the card's games block)
    // but never a split, never a player slot, never a coverage line.
    const trainableHumans = new Set()
    for (const t of pre) {
        if (t.cls === 'human' && ADAPTERS[t.rec.game]) trainableHumans.add(String(t.envelope.player || t.rec.player))
    }
    const { heldout: heldPlayers, blocked: holdoutBlocked } = playerSplit(trainableHumans)

    const lines = []
    const audioIndex = []
    const audioFiles = []
    const rejected = []
    const perGame = {}
    const perPlayer = {}
    let sessionsWithVoice = 0
    let sessionsWithPartialVoice = 0 // #2805: human sessions whose voice track cut before the run ended
    let humanRows = 0
    let flaggedRows = 0
    let legacyRows = 0

    for (const t of pre) {
        const { envelope, rec, cls } = t
        const folded = t.folded === true
        const game = rec.game
        const player = folded ? LEGACY_OWNER : String(envelope.player || rec.player || '')
        const human = cls === 'human' || folded
        const trainable = human && !!ADAPTERS[game] // consent AND replay-verified features (see trainable doctrine above)
        if (rec.voice && Array.isArray(rec.voice.tracks) && rec.voice.tracks.length) sessionsWithVoice++
        if (human && rec.voice && Array.isArray(rec.voice.tracks) && rec.voice.tracks.some((tr) => tr.partial)) sessionsWithPartialVoice++
        const stats = perGame[game] || (perGame[game] = { takes: 0, humanTakes: 0, ticks: 0 })
        stats.takes++
        stats.ticks += rec.ticks
        if (trainable) {
            stats.humanTakes++
            const pp = perPlayer[player] || (perPlayer[player] = { takes: 0, games: new Set(), ticks: 0, voiceSessions: 0, rows: 0, legacyTakes: 0 })
            pp.takes++
            pp.games.add(game)
            pp.ticks += rec.ticks
            if (folded) pp.legacyTakes++
            if (rec.voice && rec.voice.tracks.length) pp.voiceSessions++
        }

        let res
        if (ADAPTERS[game]) {
            res = ADAPTERS[game](envelope.key, rec)
        } else {
            // no adapter: rows for the actions, feat:null honestly — but an
            // adapter-less game cannot be replay-proven here, so its take
            // carries reason 'no-adapter' (flagged split regardless of class).
            res = { ok: true, mismatch: null, rows: [] }
            for (let tt = 0; tt < rec.ticks; tt++) {
                const pads = rec.slots.map((s) => decodePad(s.pads[tt], rec.method))
                for (let i = 0; i < rec.slots.length; i++) {
                    res.rows.push({ k: envelope.key, g: game, s: rec.seed, t: tt + 1, lvl: null, seat: i, act: encodePad(pads[i]), feat: null })
                }
            }
            t.reasons = [...t.reasons, 'no-adapter']
        }
        if (!res.ok) {
            rejected.push({ key: envelope.key, cls, mismatch: res.mismatch })
            continue
        }
        const splitOf = !trainable
            ? 'flagged'
            : heldPlayers.has(player)
                ? 'player-heldout'
                : seedHeldout(rec.seed)
                    ? 'seed-heldout'
                    : 'train'
        for (const row of res.rows) {
            row.split = splitOf
            if (trainable) { humanRows++; perPlayer[player].rows++ }
            else flaggedRows++
            if (folded) { legacyRows++; row.lg = 1 } // fold marker rides every row: an RL loader can filter on it
            lines.push(JSON.stringify(row))
        }

        // Audio is written for HUMAN takes only (S3-readiness): flagged
        // tracks keep their clock+clips metadata in audio/index.jsonl, but
        // bot/tool audio bytes never sit in the dataset dir where a naive
        // loader could glob them into training.
        for (const track of (rec.voice && human) ? rec.voice.tracks : []) {
            const re = voiceReexport(track, safeFile(envelope.key) + '.seat' + track.slots.join('-'))
            const file = `audio/${re.filename}`
            audioFiles.push({ file, bytes: re.bytes })
            const containerMs = containerDurationMs(track)
            audioIndex.push({
                key: envelope.key, file, seats: track.slots, player: player || null,
                human, mime: re.mime, ms: track.ms, containerMs,
                // #2805 mirror of #2058: when the container disagrees with the
                // declared ms by >10%, name which clock is the longer one.
                ...(containerMs !== null && track.ms > 0 && Math.abs(containerMs - track.ms) > track.ms * 0.1 ? { audioLonger: containerMs >= track.ms } : {}),
                // #2805: partial tracks (guest mic cut before end of run) ride
                // the index honestly — audio may be short of the take.
                ...(track.partial ? { partial: true } : {}),
                clock: track.clock,
                clips: trackClips(rec, track),
            })
        }
    }

    if (rejected.length) return { ok: false, reason: `${rejected.length} take(s) failed replay-verify`, rejected }

    const datasetText = lines.length ? lines.join('\n') + '\n' : ''
    const audioIndexText = audioIndex.length ? audioIndex.map((x) => JSON.stringify(x)).join('\n') + '\n' : ''

    // version = hash over sorted (path,sha) of CONTENT files. card/manifest
    // are derived views: deterministic given the same store, but not inputs.
    const contentHashes = [['dataset.jsonl', shaHex(datasetText)], ['audio/index.jsonl', shaHex(audioIndexText)]]
    for (const a of audioFiles) contentHashes.push([a.file, shaHex(a.bytes)])
    contentHashes.sort((x, y) => (x[0] < y[0] ? -1 : 1))
    const version = shaHex(contentHashes.map(([p, h]) => `${p}\0${h}\n`).join(''))

    const hours = (ticks) => Math.round((ticks / 60 / 3600) * 10000) / 10000
    // Coverage lines judge NATIVE named humans with replay-verified (adapted)
    // takes only — the fold adds train volume, never a second player and never
    // a new human game (#1712 lines are closed by friends' takes, not by
    // attributing old labels), and an unadapted game cannot close the games
    // line because its rows carry no features (trainable doctrine, above).
    const humanTakes = pre.filter((t) => t.cls === 'human' && ADAPTERS[t.rec.game])
    const unadaptedHumanTakes = pre.filter((t) => t.cls === 'human' && !ADAPTERS[t.rec.game])
    const gamesWithHuman = [...new Set(humanTakes.map((t) => t.rec.game))].sort()
    const legacyAnchored = humans.has(LEGACY_OWNER)
    const card = {
        dataset: 'plaicraft-human-v1',
        version,
        source: { store: base, listed: listed.sessions.length },
        // Legacy fold record (#1712, ruling ask #2844): declared attribution,
        // anchor proof, and volume — reviewable, reversible, line-neutral.
        legacy: {
            owner: LEGACY_OWNER,
            anchored: legacyAnchored,
            takes: legacyTakes,
            rows: legacyRows,
            hours: hours(legacyTicks),
            note: 'pre-audit unnamed-player takes with native human seats, attributed per the #1712 audit ("today every human take is jalfern\'s"); relabeled/model seats and everything unnamed without an anchor stay flagged',
        },
        games: Object.fromEntries(Object.entries(perGame).map(([g, s]) => [g, {
            takes: s.takes, humanTakes: s.humanTakes, hours: hours(s.ticks),
            featureAdapter: !!ADAPTERS[g], inRegistry: registry.has(g),
        }])),
        players: Object.fromEntries(Object.entries(perPlayer).map(([p, s]) => [p, {
            takes: s.takes, games: [...s.games].sort(), hours: hours(s.ticks), voiceSessions: s.voiceSessions,
            rows: s.rows, // #2805 (#1713 hand-off): holdout accounting per person, not just totals
            ...(s.legacyTakes ? { legacyTakes: s.legacyTakes } : {}),
            split: heldPlayers.has(p) ? 'heldout' : 'train',
        }])),
        totals: {
            takes: pre.length,
            humanTakes: humanTakes.length, // native named humans with adapted takes (fold counted separately)
            unadaptedHumanTakes: unadaptedHumanTakes.length, // consented humans held out of train by the adapter gate (flagged, reason no-adapter)
            legacyTakes,
            legacyHours: hours(legacyTicks),
            humanTakesIncludingLegacy: humanTakes.length + legacyTakes,
            hours: hours(pre.reduce((a, t) => a + t.rec.ticks, 0)),
            humanHours: hours(humanTakes.reduce((a, t) => a + t.rec.ticks, 0)),
            sessionsWithVoice,
            sessionsWithPartialVoice, // #2805: RL lane — these sessions' audio may run short of the take
            rows: lines.length,
            humanRows,
            flaggedRows,
            audioTracks: audioFiles.length,
        },
        splits: {
            player: { heldout: [...heldPlayers].sort(), blocked: holdoutBlocked },
            seed: { rule: `sha256(seed) % ${SEED_HELDOUT_MOD} >= ${SEED_HELDOUT_FROM}`, heldoutSeeds: [...new Set(humanTakes.map((t) => t.rec.seed))].filter(seedHeldout).sort((a, b) => a - b) },
        },
        // Acceptance lines (#1712), judged honestly against THIS dataset:
        coverage: {
            deterministic: 'proven by plaicraft:datasetcheck (byte-identical rebuild)',
            gamesCovered: { need: 2, have: gamesWithHuman.length, games: gamesWithHuman, pass: gamesWithHuman.length >= 2 },
            audio: { tracks: audioFiles.length, pass: audioFiles.length > 0 },
            heldoutClean: {
                playersHeldout: heldPlayers.size,
                pass: trainableHumans.size >= 2 ? heldPlayers.size >= 1 : null, // null = not yet judgeable
                blocked: trainableHumans.size < 2 ? 'need-2-human-players' : null,
            },
            humanPlayers: [...trainableHumans].sort(), // trainable natives (consent AND adapter) — an unadapted-only friend is named in card.games players, not here
        },
    }

    fs.mkdirSync(path.join(out, 'audio'), { recursive: true })
    fs.writeFileSync(path.join(out, 'dataset.jsonl'), datasetText)
    fs.writeFileSync(path.join(out, 'audio/index.jsonl'), audioIndexText)
    for (const a of audioFiles) fs.writeFileSync(path.join(out, a.file), a.bytes)
    fs.writeFileSync(path.join(out, 'card.json'), JSON.stringify(card, null, 1) + '\n')
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
        version,
        builder: gitSha(repoRoot),
        files: contentHashes.map(([p, h]) => ({ path: p, sha256: h })),
    }, null, 1) + '\n')

    // reviewable sample + pointer (committed; the full corpus stays local/R2)
    const sampleLines = lines.filter((l) => JSON.parse(l).split === 'train').slice(0, 100)
    if (sampleLines.length) fs.writeFileSync(path.join(out, 'sample.jsonl'), sampleLines.join('\n') + '\n')
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ latest: version }, null, 1) + '\n')

    return { ok: true, version, card }
}

function gitSha(root) {
    try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

// ---- CLI ------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('plaicraft-dataset.mjs')) {
    const { STORE_DEFAULT } = await import('../src/utils/sessionStore.js')
    const base = opt('store', process.env.SESSION_STORE || STORE_DEFAULT)
    const out = opt('out', path.join(repoRoot, 'data/plaicraft-dataset'))
    const limit = Number(opt('limit', 500)) || 500
    const jonKey = readKey('JON_KEY')
    const res = await buildDataset({ base, out, limit, jonKey })
    if (!res.ok) {
        console.error(`plaicraft:dataset FAILED: ${res.reason}`)
        if (res.rejected) for (const r of res.rejected) console.error(`  ${r.key} (${r.cls}) diverged at tick ${r.mismatch && r.mismatch.tick}`)
        process.exit(1)
    }
    const c = res.card
    console.log(`version ${res.version}`)
    console.log(`takes ${c.totals.takes} (human ${c.totals.humanTakes} + legacy-folded ${c.totals.legacyTakes}) rows ${c.totals.rows} (flagged ${c.totals.flaggedRows}) audio tracks ${c.totals.audioTracks} sessions-with-voice ${c.totals.sessionsWithVoice}`)
    console.log(`games human ${c.coverage.gamesCovered.games.join(',') || '(none)'} — need ${c.coverage.gamesCovered.need}: ${c.coverage.gamesCovered.pass ? 'PASS' : 'NOT YET'}`)
    console.log(`players ${Object.keys(c.players).join(',') || '(none)'} | heldout ${c.splits.player.heldout.join(',') || '(none)'}${c.splits.player.blocked ? ` [blocked: ${c.splits.player.blocked}]` : ''}`)
    console.log(`out ${out}`)
}
