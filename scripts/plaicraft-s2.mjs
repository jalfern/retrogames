// PLAICRAFT S2 (#1712) — one command on the Studio that pulls the S1 store and
// writes the versioned dataset the RL hand-off (jalfern/retrogames-rl, #1713)
// trains on. Jon's decision (Nov 14): the export lives in retrogames; this
// directory is the hand-off artifact.
//
//   npm run plaicraft:s2                     # pull the production store
//   npm run plaicraft:s2 -- --store <base> --out <dir> --limit <n>
//
// Output — <out>/v1-<digest>/  (digest = sha256 over the sorted per-file
// digests; same store contents + same build => byte-identical rebuild, the
// issue's determinism line):
//   manifest.json        version, per-file sha256s, counts per split
//   card.json            the dataset card: games, players, hours, sessions with
//                        voice, and EVERY acceptance line of #1712 reported
//                        honestly (a line the store cannot meet today says so,
//                        with the number behind it — the audit's "don't narrow
//                        the line")
//   takes.json           per-take ledger: key, game, player, decision, reason
//   splits/train.jsonl            one row per tick per human seat
//   splits/heldout-players.jsonl  whole people held out (the split a learner
//   splits/heldout-seeds.jsonl    must never train on)
//   audio/<key>-seat<n>.<ext>    voice decoded verbatim from v2 tracks, plus
//   audio/manifest.json          tick-alignment: clock trace, drift (reported,
//                               not assumed away — #2058), voiceCmd calls mapped
//                               onto the audio clock via tickToMs
//   dev/synthetic/       bot / harness / relabeled-only / anon takes — a
//   dev/rejected/        flagged pile that NEVER feeds train or held-out
//                        (audit 2026-11-20); rejected = failed replay-verify,
//                        with the divergence tick on the ledger
//
// Row shape (human seats only; replay-verified first for games that have a
// Node sim — Gauntlet since #1625):
//   { game, player, legacy?, seat, seed, t, lvl?, f|f:null, p, raw, a? }
//   f  = THE 31 features recomputed from the exact replayed sim
//        (src/games/Gauntlet/model.js featurize — one definition across
//        export, trainer and live seat; null where no featurizer exists yet,
//        honestly flagged in card.games[game].featurizer)
//   p  = the seat's normalized one-pad that tick (#420), raw = the pre-zone
//        analog the recorder kept (#495), a = the seat's swing button as the
//        thumb actually pressed it (human rows carry the human's own pulse;
//        intent reconstruction is partner-lane semantics, not a human's)
//
// Provenance law (audit 2026-11-20, enforced mechanically — never narrowed):
//  - human seats come from relay/core.js countsAsHumanSource: kind 'human'
//    WITHOUT a relabeledFrom stamp. A repaired seat is an audit trace, not a
//    thumb (#2142), so relabeled-only takes sit in dev/ and contribute no rows.
//  - player identity: rec.player (audit-1 stamp) else the envelope label,
//    normalized by playerId(). The legacy fixed label 'player' predates named
//    consent; per the audit ("today every human take is jalfern's") it maps to
//    'jalfern' with legacy:true on every row — it never counts as a SECOND
//    player: unverified provenance cannot inflate the 2-people line.
//  - 'qabot'/'anon' and takes with no native human seat => dev/synthetic.
//  - claptest is a sync instrument, not a game (audit) => ignored, counted.
//  - splits are by WHOLE PEOPLE and WHOLE SEEDS: fnv1a(player)%4===0 holds a
//    person out; fnv1a(seed)%4===0 holds a seed out (players split wins when
//    both apply — every row lands in exactly one file). Degenerate folds are
//    fixed by rule, not by luck, and the fix is stated on the card.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { listSessions, storeFromQuery } from '../src/utils/sessionStore.js'
import { validate, decodePad } from '../src/utils/recording.js'
import { tickToMs, voiceDrift, bytesFromB64, containerDurationMs } from '../src/utils/voice.js'
import { playerId } from '../src/utils/player.js'
import { countsAsHumanSource } from '../relay/core.js'
import { readKey } from './lib/localkey.mjs'
import { newGame, seatedPartner, heroFromPad, p2FromPad } from './plaicraft-export.mjs'
import { makeGame, step as gStep, stateHash as gHash } from '../src/games/Gauntlet/sim.js'
import { featurize } from '../src/games/Gauntlet/model.js'

const stepGauntlet = (gs, pads) => gStep(gs, heroFromPad(pads[0]), p2FromPad(pads[1] || {}))
const gsHash = (gs) => gHash(gs)

export const DS_VERSION = 'plaicraft-ds/v1'
const LEGACY_LABELS = new Set(['player']) // the pre-audit fixed label
const BOT_LABELS = new Set(['qabot'])    // harness players are never people
const NOT_GAMES = new Set(['claptest'])  // audit: /claptest is not a game
const LEGACY_OWNER = 'jalfern' // audit 2026-11-20: today, every legacy take is Jon's

// --- tiny deterministic helpers --------------------------------------------------

export function fnv1a(s) {
    let h = 0x811c9dc5
    const str = String(s)
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const keySafe = (key) => String(key).replace(/[^a-z0-9._-]+/gi, '__')
const j = (x) => JSON.stringify(x)
const hours = (ticks) => Math.round((ticks / 3600) * 1000) / 1000

// --- capability matrix -----------------------------------------------------------
// Games whose exact sim runs in Node, so a stored take can be replay-verified
// and re-featurized tick-for-tick. Everything else exports action rows with
// f:null and the card says so — honest capability, never a silent shortcut.
export const GAME_ENGINES = {
    gauntlet: { featurizer: 'gauntlet/model-v2 (#2299, 31 features)' },
}

// --- provenance ------------------------------------------------------------------

export function classifyTake(rec, envelopePlayer) {
    const bad = validate(rec)
    if (bad) return { decision: 'dev', reason: `stored file fails recording validation: ${bad}` }
    if (NOT_GAMES.has(rec.game)) return { decision: 'ignored', reason: `${rec.game} is a sync instrument, not a game (#1712 audit 2026-11-20)` }
    const rawLabel = rec.player || envelopePlayer || ''
    let player = playerId(rawLabel)
    let legacy = false
    if (LEGACY_LABELS.has(String(rawLabel).toLowerCase())) { legacy = true; player = LEGACY_OWNER }
    if (!player || player === 'anon' || BOT_LABELS.has(player)) {
        return { decision: 'dev', reason: `no named human identity (label: ${rawLabel || 'missing'})` }
    }
    const humanSeats = []
    const relabeledSeats = []
    rec.slots.forEach((s, i) => {
        if (countsAsHumanSource(s.source)) humanSeats.push(i)
        else if (s.source && s.source.kind === 'human') relabeledSeats.push(i) // human only via repair
    })
    if (!humanSeats.length) {
        const why = relabeledSeats.length ? 'human seats are relabeled-only (#2142 audit stamp — repaired provenance, not a thumb)' : 'no human seats'
        return { decision: 'dev', reason: why, player, legacy }
    }
    return { decision: 'human', reason: relabeledSeats.length ? `native human on ${humanSeats.join(',')}; relabeled-only seat(s) ${relabeledSeats.join(',')} contribute no rows` : '', player, legacy, humanSeats, relabeledSeats }
}

// --- gauntlet: replay + re-featurize (the #1625 lineage, #1793 100% line) -----

function liveSeat(gs, seat) {
    if (!gs || gs.end) return false
    if (seat === 0) return !!(gs.hero && gs.hero.deadT === 0)
    return !!(gs.partner && !gs.partner.down && gs.hero && gs.hero.deadT === 0)
}

export function replayRows(rec, seats, meta) {
    const gs = newGame(rec.seed, rec.rules || {}, seatedPartner(rec))
    const want = new Map(rec.hashes.map((x) => [x.t, x.h]))
    const mem = {}
    const rows = []
    let mismatch = null
    for (let t = 0; t < rec.ticks && !mismatch; t++) {
        const pads = rec.slots.map((s) => decodePad(s.pads[t], rec.method))
        for (const seat of seats) {
            if (!liveSeat(gs, seat)) continue
            const who = seat === 0 ? gs.hero : gs.partner
            if (!who) continue
            const m = mem[seat] || (mem[seat] = {})
            const f = featurize(gs, who, m).map((v) => +v.toFixed(3))
            m.pa = pads[seat]
            rows.push({ game: rec.game, player: meta.player, ...(meta.legacy ? { legacy: true } : {}), seat, seed: rec.seed, t: t + 1, lvl: gs.level, f, p: pads[seat], raw: rec.slots[seat].raw[t] || {}, a: pads[seat].a ? 1 : 0 })
        }
        stepGauntlet(gs, pads)
        const t1 = t + 1
        if (want.has(t1)) {
            const got = gsHash(gs)
            if (got !== want.get(t1)) mismatch = { tick: t1, want: want.get(t1), got }
        }
    }
    return { ok: !mismatch, mismatch, rows }
}

// action-only rows for games without a Node engine (f:null, flagged on card)
function actionRows(rec, seats, meta) {
    const rows = []
    for (let t = 0; t < rec.ticks; t++) {
        for (const seat of seats) {
            rows.push({ game: rec.game, player: meta.player, ...(meta.legacy ? { legacy: true } : {}), seat, seed: rec.seed, t: t + 1, f: null, p: decodePad(rec.slots[seat].pads[t], rec.method), raw: rec.slots[seat].raw[t] || {} })
        }
    }
    return rows
}

// --- voice ------------------------------------------------------------------------

export function voiceExtract(rec, meta) {
    const clips = []
    if (!rec.voice || !Array.isArray(rec.voice.tracks)) return clips
    for (const tr of rec.voice.tracks) {
        const ext = String(tr.mime || '').includes('ogg') ? 'ogg' : 'webm'
        const drift = voiceDrift(tr.clock || [])
        const cmds = (tr.slots || []).includes(0) ? (rec.voiceCmd || []).map((c) => ({ t: c.t, ms: tickToMs(tr.clock, c.t), said: c.said, intent: c.intent, ok: c.ok })) : []
        clips.push({
            file: `${keySafe(rec.game + '-' + (meta.key || '') + '-seat' + tr.slots.join('+'))}.${ext}`,
            game: rec.game, player: meta.player, seats: tr.slots, mime: tr.mime,
            ms: tr.ms, containerMs: containerDurationMs(tr), // honest: null when the bytes declare nothing (#2058)
            headset: !!tr.headset, partial: !!tr.partial, consent: tr.consent === true,
            clockSamples: (tr.clock || []).length, drift, voiceCmd: cmds,
            bytes: bytesFromB64(tr.b64),
        })
    }
    return clips
}

// --- splits ------------------------------------------------------------------------
// whole people, whole seeds, deterministic; degeneracies fixed by rule (stated).

export function playerFold(id) { return fnv1a('p:' + id) % 4 }
export function seedFold(seed) { return fnv1a('s:' + seed) % 4 }

export function planSplits(humanPlayers, seeds) {
    const heldoutPlayers = new Set(humanPlayers.filter((p) => playerFold(p) === 0))
    let note = null
    const sortedHumans = [...humanPlayers].sort()
    if (humanPlayers.length >= 2 && heldoutPlayers.size === 0) {
        heldoutPlayers.add(sortedHumans[sortedHumans.length - 1])
        note = `no player fell in fold 0; ${sortedHumans[sortedHumans.length - 1]} forced to held-out by rule (the player split must be exercised, not lucked)`
    } else if (heldoutPlayers.size === humanPlayers.length && humanPlayers.length >= 2) {
        heldoutPlayers.delete(sortedHumans[0]) // keep at least one person trainable
        note = `all players folded held-out; ${sortedHumans[0]} forced to train by rule`
    } else if (humanPlayers.length === 1) {
        heldoutPlayers.delete(humanPlayers[0])
        note = 'only 1 named human in the store — the players split is degenerate; "no held-out player appears in train" is vacuous-but-enforced until more people record (#1712 audit)'
    }
    const heldoutSeeds = new Set(seeds.filter((s) => seedFold(s) === 0))
    return { heldoutPlayers, heldoutSeeds, note }
}

// --- main --------------------------------------------------------------------------

export async function buildDataset({ base, out, limit = 500, key = null, log = console.log }) {
    const listed = await listSessions({ base, limit, key })
    if (!listed.ok) throw new Error(`store: ${listed.reason || 'unreachable'} (base ${base})`)
    const rowsBy = { train: [], 'heldout-players': [], 'heldout-seeds': [] }
    const collected = []
    const ledger = []
    const audioFiles = []
    const games = {}
    const humanPlayers = new Set()
    const seedsSeen = new Set()
    const humanVoiceSessions = new Set()
    let humanTicksTotal = 0
    let hasLegacy = false

    const sorted = [...listed.sessions].sort((a, b) => String(a.key).localeCompare(String(b.key)))
    for (const row of sorted) {
        let text
        try {
            const res = await fetch(`${base}/sessions/${encodeURIComponent(row.key)}`, key ? { headers: { 'x-session-key': key } } : undefined)
            if (!res.ok) { ledger.push({ key: row.key, decision: 'dev', reason: `read failed http ${res.status}` }); continue }
            text = await res.text()
        } catch (e) { ledger.push({ key: row.key, decision: 'dev', reason: `read unreachable: ${e}` }); continue }
        let rec
        try { rec = JSON.parse(text) } catch { ledger.push({ key: row.key, decision: 'dev', reason: 'stored object is not JSON' }); continue }
        const cls = classifyTake(rec, row.player)
        games[rec.game] = games[rec.game] || { takes: 0, humanTakes: 0, ticks: 0, humanTicks: 0, humanVoice: 0, engine: GAME_ENGINES[rec.game] ? GAME_ENGINES[rec.game].featurizer : null }
        games[rec.game].takes++
        games[rec.game].ticks += rec.ticks
        if (cls.decision === 'ignored') { ledger.push({ key: row.key, game: rec.game, decision: 'ignored', reason: cls.reason }); continue }
        if (cls.decision === 'dev') {
            ledger.push({ key: row.key, game: rec.game, decision: 'dev', reason: cls.reason })
            audioFiles.push({ dev: keySafe(row.key) + '.json', original: text })
            continue
        }        // human take — verify first where the engine exists (never trust silently)
        const meta = { player: cls.player, legacy: cls.legacy, key: row.key }
        let rows = null
        if (GAME_ENGINES[rec.game]) {
            const v = replayRows(rec, cls.humanSeats, meta)
            if (!v.ok) {
                ledger.push({ key: row.key, game: rec.game, player: cls.player, decision: 'dev', reason: `replay diverged at tick ${v.mismatch.tick} — corpus stays 100%-verifiable (#1793 line)`, mismatch: v.mismatch })
                audioFiles.push({ dev: keySafe(row.key) + '.json', original: text, rejected: true })
                continue
            }
            rows = v.rows
        } else {
            rows = actionRows(rec, cls.humanSeats, meta)
        }
        humanPlayers.add(cls.player)
        if (cls.legacy) hasLegacy = true
        seedsSeen.add(rec.seed)
        games[rec.game].humanTakes++
        games[rec.game].humanTicks += rec.ticks
        humanTicksTotal += rec.ticks
        if (rec.voice) humanVoiceSessions.add(row.key)
        const clips = voiceExtract(rec, meta)
        for (const c of clips) { c.key = row.key; audioFiles.push(c) }
        ledger.push({
            key: row.key, game: rec.game, player: cls.player, decision: 'human', reason: cls.reason || null,
            ticks: rec.ticks, rows: rows.length, seats: cls.humanSeats,
            relabeledSeats: cls.relabeledSeats.length ? cls.relabeledSeats : undefined,
            voice: clips.length ? clips.map((c) => c.file) : false,
        })
        for (const r of rows) collected.push({ ...r, __key: row.key })
    }

    const { heldoutPlayers, heldoutSeeds, note } = planSplits([...humanPlayers], [...seedsSeen])
    const splitOf = (r) => (heldoutPlayers.has(r.player) ? 'heldout-players' : heldoutSeeds.has(r.seed) ? 'heldout-seeds' : 'train')
    for (const r of collected) rowsBy[splitOf(r)].push(r)
    const order = (a, b) => String(a.__key).localeCompare(String(b.__key)) || a.seat - b.seat || a.t - b.t
    for (const k of Object.keys(rowsBy)) rowsBy[k].sort(order)

    // --- write the versioned dir (digest first: files are content, no clock) ---
    const files = {} // name -> string|Uint8Array
    const jsonl = (arr) => arr.map((r) => { const { __key, ...rest } = r; return j(rest) }).join('\n') + (arr.length ? '\n' : '')
    files['splits/train.jsonl'] = jsonl(rowsBy.train)
    files['splits/heldout-players.jsonl'] = jsonl(rowsBy['heldout-players'])
    files['splits/heldout-seeds.jsonl'] = jsonl(rowsBy['heldout-seeds'])
    for (const a of audioFiles.filter((x) => x.dev)) files['dev/' + (a.rejected ? 'rejected/' : 'synthetic/') + a.dev] = a.original
    const audioManifest = []
    for (const c of audioFiles.filter((a) => !a.dev)) {
        files['audio/' + c.file] = c.bytes
        const { bytes, ...m } = c
        audioManifest.push(m)
    }
    files['audio/manifest.json'] = JSON.stringify(audioManifest, null, 1)
    files['takes.json'] = JSON.stringify(ledger, null, 1)
    const digests = Object.keys(files).sort().map((name) => ({ name, sha256: sha256(files[name] instanceof Uint8Array ? files[name] : Buffer.from(files[name], 'utf8')) }))
    const digest = sha256(JSON.stringify(digests))
    const version = `${DS_VERSION}+${digest.slice(0, 12)}`

    const humanGames = Object.entries(games).filter(([, v]) => v.humanTakes > 0).map(([g]) => g)
    const card = {
        version,
        versionedAs: DS_VERSION,
        store: base,
        rebuiltBy: 'npm run plaicraft:s2',
        games: Object.fromEntries(Object.entries(games).map(([g, v]) => [g, { ...v, hours: hours(v.humanTicks), featurizer: v.engine }])),
        players: { namedHumans: [...humanPlayers].sort(), legacyMerged: hasLegacy ? LEGACY_OWNER : null },
        humanHours: hours(humanTicksTotal),
        sessionsWithVoice: humanVoiceSessions.size,
        rows: { train: rowsBy.train.length, heldoutPlayers: rowsBy['heldout-players'].length, heldoutSeeds: rowsBy['heldout-seeds'].length },
        heldoutPlayers: [...heldoutPlayers].sort(),
        splitsNote: note,
        acceptance: {
            rebuildsDeterministically: 'proven by plaicraft:s2check (double export, byte-compare); live rebuilds against an unchanged store answer the same digest',
            covers2PlusGames: humanGames.length >= 2,
            audioIncluded: humanVoiceSessions.size > 0,
            noHeldoutPlayerInTrain: !rowsBy.train.some((r) => heldoutPlayers.has(r.player)),
        },
        honestGaps: [],
    }
    if (humanPlayers.size < 2) card.honestGaps.push(`named humans = ${humanPlayers.size}; the 2-real-people line needs friends'/co-op takes (ask filed via jonq) — legacy 'player' merges to jalfern and never counts as a second player`)
    if (humanGames.length < 2) card.honestGaps.push(`human takes cover ${humanGames.length || 0} game(s) (${humanGames.join(', ') || 'none'}); "covers 2 or more games" means human takes in 2+ games (audit: claptest is not one)`)
    if (!humanVoiceSessions.size) card.honestGaps.push('no consenting-voice human take yet')

    const dir = `${out}/${version.replace(/\+/g, '-')}`
    rmSync(dir, { recursive: true, force: true })
    for (const [name, content] of Object.entries(files)) {
        const p = `${dir}/${name}`
        mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
        writeFileSync(p, content)
    }
    files['manifest.json'] = JSON.stringify({ version, sha256: digests }, null, 1)
    files['card.json'] = JSON.stringify(card, null, 1)
    writeFileSync(`${dir}/manifest.json`, files['manifest.json'])
    writeFileSync(`${dir}/card.json`, files['card.json'])
    writeFileSync(`${out}/latest.json`, JSON.stringify({ version, digest, dir, store: base, builtAt: new Date().toISOString() }, null, 1))
    log(`plaicraft:s2 ${version} -> ${dir}`)
    log(`  rows train=${card.rows.train} heldoutPlayers=${card.rows.heldoutPlayers} heldoutSeeds=${card.rows.heldoutSeeds}; humans=${card.players.namedHumans.length}; humanHours=${card.humanHours}; voice=${card.sessionsWithVoice}; gaps=${card.honestGaps.length}`)
    if (card.honestGaps.length) for (const g of card.honestGaps) log(`  GAP  ${g}`)
    return { version, digest, dir, card, ledger, files }
}

const isMain = process.argv[1] && process.argv[1].includes('plaicraft-s2.mjs')
if (isMain) {
    const argv = process.argv.slice(2)
    const flagVal = (name, dflt) => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`))
        if (hit) return hit.split('=').slice(1).join('=')
        const i = argv.indexOf(`--${name}`)
        return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
    }
    try {
        await buildDataset({
            base: flagVal('store', process.env.SESSION_STORE || storeFromQuery('')),
            out: flagVal('out', 'data/plaicraft-dataset'),
            limit: Number(flagVal('limit', 500)) || 500,
            key: readKey('JON_KEY'),
        })
    } catch (e) {
        console.error(`plaicraft:s2 FAILED: ${e.message}`)
        process.exit(1)
    }
}
