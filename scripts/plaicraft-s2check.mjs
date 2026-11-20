// PLAICRAFT S2 CHECK (#1712) — proves the dataset pipeline boots, its rules
// hold, and it can be won, against a FAITHFUL store: relaysim runs the
// production worker (relay/worker.js) with the read lockdown and the relabel
// door live. Fixtures are real v1/v2 takes: Gauntlet runs replay-verified by
// construction (planner pads, #1625 codec), voice tracks carry clock traces,
// and every provenance class the audit names is present — bot, relabeled-only,
// legacy fixed label, claptest-not-a-game, tampered hashes.
//
//   npm run plaicraft:s2check            # green expected
//   npm run plaicraft:s2check -- --mutate  # red expected: the split line is
//                                          # broken in place (mutateguard), the
//                                          # held-out scan must bite
//
// The acceptance lines of #1712 are asserted against the FIXTURE (so they can
// all be green: 2 humans, 2 games, audio, deterministic, no held-out in
// train). Against Jon's live store the same lines honestly report SHORT
// coverage — that is the card's job, not this script's.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Report } from './lib/harness.mjs'
import { startRelaySim, SIM_WRITE_KEY } from './lib/relaysim.mjs'
import { plant, pull } from './lib/mutateguard.mjs'
import { createRecorder } from '../src/utils/recording.js'
import { relabelSession } from '../src/utils/sessionStore.js'
import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'
import { decide, partnerPad } from '../src/games/Gauntlet/planner.js'
import { makeHeroPadCodec, heroFromPad, p2FromPad } from './plaicraft-export.mjs'
import { fnv1a, playerFold, seedFold } from './plaicraft-s2.mjs'
import { N_FEAT } from '../src/games/Gauntlet/model.js'

const argv = process.argv.slice(2)
const MUTATE = argv.includes('--mutate')
const here = path.dirname(fileURLToPath(import.meta.url))
const r = new Report('plaicraft:s2check')
const sim = await startRelaySim({ writeKey: SIM_WRITE_KEY })

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const keySafe = (key) => String(key).replace(/[^a-z0-9._-]+/gi, '__')

// deterministic picks so the split asserts test their own subject:
// a TRAIN-fold person must carry the held-out SEED (else the seed split is
// shadowed by the player split), and a seed-train person carries the other.
const seedIn = (fold) => { for (let n = 101; n < 9000; n++) if (seedFold(n) === fold) return n; throw new Error('no seed found') }
const SEED_TRAIN = seedIn(1)
const SEED_HELD = seedIn(0)
const trainFoldName = (names) => names.find((n) => playerFold(n) !== 0)
const HELD_PERSON = 'jalfern' // legacy-merged owner carries the trainable seed
const CARRY_SEED_PERSON = trainFoldName(['aria', 'bram', 'cara', 'dov', 'eve'])

// --- fixture takes ---------------------------------------------------------------

const fakeVoice = (ticks) => ({
    tracks: [{
        slots: [0], consent: true, headset: false, mime: 'audio/webm;codecs=opus',
        ms: Math.round(ticks * 16.67) + 40,
        clock: [{ t: 1, ms: 0 }, { t: 60, ms: 997 }, { t: Math.max(61, ticks), ms: Math.round(ticks * 16.67) }],
        b64: 'QUJDRA==',
    }],
    declined: [],
})

function buildGauntlet(seed, { max = 150, player = null, seat0 = 'human', partnerSeat = true, voice = false, call = null, tamper = false } = {}) {
    const gs = makeGame(seed, 'warrior', { topDown: true, partner: partnerSeat })
    gs.partnerMode = 'cpu'
    const sources = partnerSeat ? [{ kind: seat0 }, { kind: 'cpu' }] : [{ kind: seat0 }]
    const rec = createRecorder({ gameId: 'gauntlet', method: 'stick', seed, players: sources.length, sources, ...(player ? { player } : {}) })
    const codec = makeHeroPadCodec()
    let prevA = false
    while (!gs.end && gs.tick < max) {
        const heroPad = codec.toPad(decide(gs))
        const cpuPad = partnerSeat ? partnerPad(gs, prevA) : {}
        prevA = !!cpuPad.a
        step(gs, heroFromPad(heroPad), p2FromPad(cpuPad))
        const pads = partnerSeat ? [heroPad, cpuPad] : [heroPad]
        rec.addTick(pads, null, gs.tick % 30 === 0 ? stateHash(gs) : null)
    }
    if (call) rec.addVoiceCmd({ t: Math.max(1, rec.ticks - 5), ...call })
    const file = rec.finish(stateHash(gs), voice ? fakeVoice(rec.ticks) : null)
    if (tamper) file.hashes[file.hashes.length - 1].h = 'cafebabe'
    return file
}

async function post(rec, player, voice) {
    const res = await fetch(`${sim.base}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recording: rec, player, consent: { motion: true, voice: !!voice, at: 'fixture' } }),
    })
    const jj = await res.json()
    if (!jj.ok) throw new Error(`fixture upload (${player}): ${jj.err}`)
    return jj.key
}

const keys = {}
const built = {}
try {
    built.aria = buildGauntlet(SEED_TRAIN, { player: CARRY_SEED_PERSON, voice: true, call: { said: 'left door', intent: 'left', ok: true } })
    keys.aria = await post(built.aria, CARRY_SEED_PERSON, true)

    built.heldSeed = buildGauntlet(SEED_HELD, { player: CARRY_SEED_PERSON, max: 120 })
    keys.heldSeed = await post(built.heldSeed, CARRY_SEED_PERSON, false)

    built.legacy = buildGauntlet(7, { max: 90 }) // no rec.player stamp — the pre-audit file shape
    keys.legacy = await post(built.legacy, 'player', false)

    built.qabot = buildGauntlet(11, { max: 60, player: 'qabot', seat0: 'model' })
    keys.qabot = await post(built.qabot, 'qabot', false)

    { // claptest — never a game
        const rec = createRecorder({ gameId: 'claptest', method: 'pointer', seed: 5, players: 1, sources: [{ kind: 'human' }], player: 'jalfern' })
        for (let t = 0; t < 40; t++) rec.addTick([{ pointer: { down: t % 8 === 0, x: 0.5, y: 0.5 } }], null, null)
        built.clap = rec.finish()
        built.clap.hashes = [{ t: built.clap.ticks, h: 'clap-mock' }]
        keys.clap = await post(built.clap, 'jalfern', false)
    }

    { // relabel-only take: model seat repaired to human by the ONE allowed write
        built.relabel = buildGauntlet(21, { max: 60, player: 'aria', seat0: 'model', partnerSeat: false })
        keys.relabel = await post(built.relabel, 'aria', false)
        const rl = await relabelSession(keys.relabel, { seat: 0, base: sim.base, key: SIM_WRITE_KEY })
        r.check('fixture: relabel door applied (seat0 model->human, audit stamp in the file)', rl.ok, rl.reason || rl.key)
    }

    built.corrupt = buildGauntlet(31, { max: 90, player: CARRY_SEED_PERSON, tamper: true })
    keys.corrupt = await post(built.corrupt, CARRY_SEED_PERSON, false)

    { // floorboss — a game with no Node engine yet: human take, action rows only
        const rec = createRecorder({ gameId: 'floorboss', method: 'dpad', seed: 3, players: 1, sources: [{ kind: 'human' }], player: HELD_PERSON })
        for (let t = 0; t < 50; t++) rec.addTick([{ left: t % 4 === 0, right: t % 4 === 2, a: t % 7 === 0 }], null, null)
        built.floorboss = rec.finish()
        keys.floorboss = await post(built.floorboss, HELD_PERSON, false)
    }
} catch (e) {
    r.check('fixtures uploaded to the store', false, String(e))
    sim.close()
    process.exit(1)
}

const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plaicraft-s2-out-'))
// async spawn on purpose: relaysim's HTTP server lives in THIS process, so a
// blocking execFileSync would freeze the store the child is calling — the
// one-driver-per-loop law, server edition.
const runExport = (out) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(here, 'plaicraft-s2.mjs'), '--store', sim.base, '--out', out, '--limit', '100'], { env: { ...process.env, JON_KEY: 'test-jon-key' } })
    let buf = ''
    p.stdout.on('data', (d) => { buf += d })
    p.stderr.on('data', (d) => { buf += d })
    p.on('exit', (code) => (code === 0 ? resolve(buf) : reject(new Error(`export exit ${code}: ${buf.slice(0, 400)}`))))
    p.on('error', reject)
})

const walk = (dir, base = dir) => {
    const out = {}
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) Object.assign(out, walk(p, base))
        else out[path.relative(base, p)] = sha(fs.readFileSync(p))
    }
    return out
}

const runChecks = async () => {
    const a = path.join(outRoot, 'a')
    const b = path.join(outRoot, 'b')
    const logA = await runExport(a)
    const logB = await runExport(b)
    r.check('export runs (exit 0, prints its version line)', /plaicraft:s2 plaicraft-ds\/v1/.test(logA) && /plaicraft:s2 plaicraft-ds\/v1/.test(logB))
    const latA = JSON.parse(fs.readFileSync(`${a}/latest.json`, 'utf8'))
    const latB = JSON.parse(fs.readFileSync(`${b}/latest.json`, 'utf8'))
    r.check('determinism: same store => same digest twice', latA.digest === latB.digest, `${latA.digest.slice(0, 12)} vs ${latB.digest.slice(0, 12)}`)
    const dir = latA.dir
    const tree = walk(dir)
    const treeB = walk(latB.dir)
    r.check('determinism: byte-identical file trees', JSON.stringify(tree) === JSON.stringify(treeB), `${Object.keys(tree).length} files`)
    const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'))
    r.check('manifest digests match the bytes on disk', manifest.sha256.every((f) => tree[f.name] === f.sha256))

    const ledger = JSON.parse(fs.readFileSync(`${dir}/takes.json`, 'utf8'))
    const by = Object.fromEntries(ledger.map((l) => [l.key, l]))
    const rows = (f) => fs.readFileSync(`${dir}/splits/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x))
    const train = rows('train.jsonl')
    const heldP = rows('heldout-players.jsonl')
    const heldS = rows('heldout-seeds.jsonl')

    r.check('claptest ignored and named on the ledger', by[keys.clap] && by[keys.clap].decision === 'ignored' && /not a game/.test(by[keys.clap].reason), by[keys.clap] && by[keys.clap].reason)
    r.check('bot (qabot) take lands in dev/synthetic, flagged', by[keys.qabot] && by[keys.qabot].decision === 'dev' && fs.existsSync(`${dir}/dev/synthetic/${keySafe(keys.qabot)}.json`))
    r.check('relabeled-only take: dev + relabel reason + audit trace preserved verbatim', (() => {
        const e = by[keys.relabel]
        if (!e || e.decision !== 'dev' || !/relabeled/.test(e.reason)) return false
        const p = `${dir}/dev/synthetic/${keySafe(keys.relabel)}.json`
        if (!fs.existsSync(p)) return false
        const stored = JSON.parse(fs.readFileSync(p, 'utf8'))
        return stored.slots[0].source.relabeledFrom === 'model'
    })())
    r.check('tampered take REJECTED at replay (divergence tick on the ledger, bytes kept)', (() => {
        const e = by[keys.corrupt]
        return !!e && e.decision === 'dev' && /replay diverged at tick \d+/.test(e.reason) && fs.existsSync(`${dir}/dev/rejected/${keySafe(keys.corrupt)}.json`)
    })(), by[keys.corrupt] && by[keys.corrupt].reason)

    r.check('legacy fixed label merges to jalfern and is flagged on rows', (() => {
        const all = [...train, ...heldP, ...heldS]
        const leg = all.find((x) => x.player === 'jalfern' && x.legacy === true)
        const card = JSON.parse(fs.readFileSync(`${dir}/card.json`, 'utf8'))
        return !!leg && card.players.legacyMerged === 'jalfern' && card.players.namedHumans.includes('jalfern')
    })())
    r.check('players split: whole people held out, held-out players absent from train', (() => {
        const card = JSON.parse(fs.readFileSync(`${dir}/card.json`, 'utf8'))
        if (!heldP.length) return false
        const held = new Set(heldP.map((x) => x.player))
        if (held.size !== card.heldoutPlayers.length) return false
        return train.every((x) => !held.has(x.player)) && card.heldoutPlayers.length >= 1
    })(), `heldout=[${[...new Set(heldP.map((x) => x.player))].join(',')}] train=${train.length} rows`)
    r.check('seeds split: whole seeds held out, held-out seeds absent from train, seed-train present', (() => {
        const held = new Set(heldS.map((x) => x.seed))
        return heldS.length > 0 && held.has(SEED_HELD) && train.every((x) => !held.has(x.seed)) && train.some((x) => x.seed === SEED_TRAIN)
    })(), `heldSeeds=[${[...new Set(heldS.map((x) => x.seed))].join(',')}]`)

    r.check('the corpus covers the 2 games with human takes (gauntlet + floorboss)', (() => {
        const g = new Set([...train, ...heldP, ...heldS].map((x) => x.game))
        return g.has('gauntlet') && g.has('floorboss')
    })())
    r.check(`gauntlet rows carry THE ${N_FEAT} features; no-engine games carry f:null`, (() => {
        const all = [...train, ...heldP, ...heldS]
        const gt = all.filter((x) => x.game === 'gauntlet')
        const fb = all.filter((x) => x.game === 'floorboss')
        return gt.length > 0 && gt.every((x) => Array.isArray(x.f) && x.f.length === N_FEAT) && fb.length > 0 && fb.every((x) => x.f === null)
    })())
    r.check('every row carries the seat action (pad), raw channel, seed and tick', (() => {
        const all = [...train, ...heldP, ...heldS]
        return all.length > 0 && all.every((x) => x.p && typeof x.seed === 'number' && Number.isInteger(x.t) && x.t >= 1 && x.raw !== undefined)
    })())

    const am = JSON.parse(fs.readFileSync(`${dir}/audio/manifest.json`, 'utf8'))
    r.check('audio: consenting track decoded to a real file, bytes verbatim', (() => {
        if (am.length !== 1) return false
        const m = am[0]
        const p = `${dir}/audio/${m.file}`
        if (!fs.existsSync(p)) return false
        const orig = Buffer.from(built.aria.voice.tracks[0].b64, 'base64')
        return Buffer.compare(orig, fs.readFileSync(p)) === 0 && m.ms > 0 && m.clockSamples >= 2
    })(), `files=${am.map((m) => m.file).join(',')}`)
    r.check('audio alignment: clock trace + drift reported (number, not assumed away)', (() => {
        const m = am[0]
        return m && typeof m.drift.maxLagMs === 'number' && typeof m.drift.totalTicks === 'number' && m.drift.totalTicks >= 60
    })())
    r.check('spoken-call trace rides the dataset: voiceCmd mapped onto the audio clock', (() => {
        const m = am[0]
        return !!m && m.voiceCmd.length === 1 && m.voiceCmd[0].said === 'left door' && typeof m.voiceCmd[0].ms === 'number'
    })())

    const card = JSON.parse(fs.readFileSync(`${dir}/card.json`, 'utf8'))
    r.check('card lines: covers 2+ games / audio included / no held-out player in train', card.acceptance.covers2PlusGames === true && card.acceptance.audioIncluded === true && card.acceptance.noHeldoutPlayerInTrain === true)
    r.check('card: named humans >= 2 and human hours recomputed', (() => {
        const humanTicks = built.aria.ticks + built.heldSeed.ticks + built.legacy.ticks + built.floorboss.ticks
        const want = Math.round((humanTicks / 3600) * 1000) / 1000
        return card.players.namedHumans.length >= 2 && card.humanHours === want
    })(), `hours=${card.humanHours} humans=${card.players.namedHumans.join(',')}`)
    r.check('card: honest gaps empty on a fixture that meets every line', card.honestGaps.length === 0, card.honestGaps.join(' | '))
    r.check('dev pile never feeds train or held-out (dev keys absent from human decisions)', (() => {
        const devKeys = [keys.qabot, keys.relabel, keys.corrupt, keys.clap]
        return ledger.filter((l) => l.decision === 'human').every((l) => !devKeys.includes(l.key))
    })())
    return dir
}

try {
    await runChecks()
} catch (e) {
    r.check('pipeline completed', false, String(e))
}

if (MUTATE) {
    const FILE = path.join(here, 'plaicraft-s2.mjs')
    const SRC = fs.readFileSync(FILE, 'utf8')
    const ANCHOR = "const splitOf = (r) => (heldoutPlayers.has(r.player) ? 'heldout-players'"
    if (!SRC.includes(ANCHOR)) {
        console.log('FAIL   split-line anchor moved — update plaicraft-s2check ANCHOR')
        r.failed++
    } else {
        plant(FILE, SRC.replace(ANCHOR, "const splitOf = (r) => (false ? 'heldout-players'"))
        const greenBefore = r.failed
        r.rows.length = 0; r.failed = 0; r.skipped = 0
        let threw = false
        try { await runChecks() } catch { threw = true }
        pull(FILE)
        const intact = fs.readFileSync(FILE, 'utf8') === SRC
        const red = threw || r.failed > 0
        r.rows.length = 0; r.failed = 0
        r.check('mutant restore: exact original bytes back', intact)
        if (!red) { console.log('mutate: expected RED, got green — the player-split scan is NOT load-bearing?'); r.failed++ }
        else console.log('RED BY DESIGN (--mutate): with the split line broken, the held-out scan bites — it is load-bearing.')
        void greenBefore
    }
    console.log(`\nplaicraft:s2check --mutate: ${r.rows.filter((x) => x.pass).length}/${r.rows.length} green after the mutant section`)
    sim.close()
    fs.rmSync(outRoot, { recursive: true, force: true })
    process.exit(r.failed ? 1 : 0)
}

console.log(`\nplaicraft:s2check: ${r.rows.filter((x) => x.pass).length}/${r.rows.length} checks passed`)
sim.close()
fs.rmSync(outRoot, { recursive: true, force: true })
process.exit(r.failed ? 1 : 0)
