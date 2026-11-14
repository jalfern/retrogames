// PLAICRAFT GRADE (#2157) — lanes grade new takes, not Jon.
//
//   npm run plaicraft:grade                     # live: grade every take without a
//                                             #   `PLAIGRADE <key>` marker on #1711
//   npm run plaicraft:grade -- --dry-run      # print verdicts, post nothing
//   npm run plaicraft:grade -- --key=<k> [--key=<k2>]  # force specific takes
//   npm run plaicraft:grade -- --self-test    # offline proof (relaysim, no gh)
//
// For each NEW take in the store a lane runs the same two commands Jon used to
// run himself — plaicraft:evidence (replay + voice verdict) and plaicraft:clap
// (the ±50 ms audio proof) — and posts ONE short verdict comment on #1711:
// take key, replay PASS/FAIL, voice PASS/FAIL/n-a, clap PASS/FAIL or why not,
// and the seat line (native human vs #2142 relabel). The `PLAIGRADE <key>`
// first line is the idempotence marker: the next run reads #1711's comments and
// skips every key already graded, so re-runs are cheap and never double-post.
//
// The store key resolves via scripts/lib/localkey.mjs (env first, then the
// gitignored .env.local at the worktree or shared repo root — #2157). The key
// VALUE never appears in output: the self-test asserts its absence from every
// posted body (acceptance line: `git grep` and the posted comments contain no
// key). Clap needs a browser + dev server (DEV_PORT); when no server answers,
// the clap line says so instead of pretending.
//
// Exit codes: 0 every new take graded (or nothing new), 1 a grading or posting
// failed, 2 key/store missing (live).

import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSessions, probeStore, storeFromQuery } from '../src/utils/sessionStore.js'
import { readKey, keySource, resetLocalKeyCache } from './lib/localkey.mjs'
import { startRelaySim, SIM_READ_KEY } from './lib/relaysim.mjs'
import { collectRun } from './plaicraft-export.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flagVal = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    if (hit) return hit.split('=').slice(1).join('=')
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const ISSUE = 1711
const PORT = process.env.DEV_PORT || 5173

// --- the verdict comment builder (pure; self-tested both directions) ---------

export function verdictBody(ev, clap, gradedBy) {
    const replay = ev.replayOk
        ? `PASS (${ev.ticks} ticks${ev.note ? `, ${ev.note}` : ''})`
        : `FAIL — ${ev.error || 'not verified'}`
    const voice = ev.audio
        ? (ev.voiceOk
            ? `PASS (worst clock drift ${Math.max(0, ...ev.voice.map((t) => Math.abs(t.driftMs || 0))).toFixed(1)} ms)`
            : `FAIL — ${ev.error || 'voice clock broken'}`)
        : 'n-a (no audio)'
    const clapLine = !ev.audio
        ? 'n-a (no audio)'
        : (!clap || clap.ran === false)
            ? `not run (${clap ? clap.why : 'clap unavailable'})`
            : clap.ok
                ? `PASS — worst ${clap.worstMs === null ? '?' : clap.worstMs} ms${clap.seat === null ? '' : ` (seat ${clap.seat})`}`
                : `FAIL — ${clap.why}`
    const seats = ev.relabeledSeats > 0
        ? `${ev.humanSeats} native human + ${ev.relabeledSeats} relabeled (#2142 — relabeled seats are NOT human evidence)`
        : ev.humanSeats > 0 ? `${ev.humanSeats} native human` : 'no human seat'
    const graded = clap && clap.ran && !clap.ok
        ? 'FAIL'
        : ev.ok && (!ev.audio || ev.voiceOk) ? 'PASS' : 'FAIL'
    const lines = [
        `PLAIGRADE ${ev.key} — ${graded}`,
        `- replay: ${replay}`,
        `- voice: ${voice}`,
        `- clap: ${clapLine}`,
        `- seats: ${seats}`,
        `graded by ${gradedBy} — #2157 (the lanes grade takes; replay + voice + clap proof in one comment)`,
    ]
    return lines.join('\n')
}

// --- store + sub-run plumbing ---------------------------------------------------

async function devServerUp(port) {
    try {
        const r = await fetch(`http://localhost:${port}/retrogames/`, { method: 'HEAD', signal: AbortSignal.timeout(1500) })
        return r.ok
    } catch { return false }
}

function spawnAsync(args, { env, timeoutMs = 240000 } = {}) {
    // NOT spawnSync: the self-test store is an IN-PROCESS server (relaysim) —
    // blocking the event loop starves it and the child waits forever on a
    // server that can no longer answer. Async keeps the loop turning.
    return new Promise((resolve) => {
        const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = '', stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (d) => { stdout += d })
        child.stderr.on('data', (d) => { stderr += d })
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
        child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }) })
        child.on('error', () => { clearTimeout(timer); resolve({ status: -1, stdout, stderr }) })
    })
}

async function runEvidence(key, base, jonKey) {
    // exit != 0 is a verdict too (a FAIL take) — parse the JSON either way.
    // NB: `--key <k>` spaced, not `--key=`: that is what evidence's argv loop reads.
    const r = await spawnAsync([path.join(HERE, 'plaicraft-evidence.mjs'), '--key', key, '--json', `--store=${base}`, '--limit=500'],
        { env: { JON_KEY: jonKey } })
    try {
        const j = JSON.parse(r.stdout)
        return (j.sessions && j.sessions[0]) || null
    } catch { return null }
}

async function runClap(key, base, jonKey) {
    const r = await spawnAsync([path.join(HERE, 'plaicraft-clap.mjs'), '--key', key, `--store=${base}`],
        { env: { JON_KEY: jonKey }, timeoutMs: 300000 })
    const out = `${r.stdout || ''}\n${r.stderr || ''}`
    const worst = /worst (-?[\d.]+) ms/.exec(out)
    const seat = /seat (\d+)/.exec(out)
    const failLine = (out.split('\n').find((l) => /FAIL/.test(l)) || 'clap grading failed').trim()
    return { ran: true, ok: r.status === 0, worstMs: worst ? Number(worst[1]) : null, seat: seat ? Number(seat[1]) : null, why: failLine }
}

function extractMarkers(text) {
    const out = new Set()
    for (const m of String(text).matchAll(/^PLAIGRADE (\S+)/gm)) out.add(m[1])
    return out
}

function scanSeen() {
    const r = spawnSync('gh', ['api', `repos/jalfern/retrogames/issues/${ISSUE}/comments`, '--paginate', '--jq', '.[].body'],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 })
    if (r.status !== 0) return null
    return extractMarkers(r.stdout || '')
}

function postComment(body) {
    const f = path.join(os.tmpdir(), `plaigrade-${process.pid}-${Date.now()}.md`)
    fs.writeFileSync(f, body)
    const r = spawnSync('gh', ['issue', 'comment', String(ISSUE), '--body-file', f], { encoding: 'utf8', timeout: 60000 })
    fs.unlinkSync(f)
    return { ok: r.status === 0, url: (r.stdout || '').trim() }
}

// --- the grading loop (shared by live mode and self-test) ----------------------

async function gradeRows(rows, base, jonKey, opts = {}) {
    const out = []
    const clapPossible = opts.noClap ? false : await devServerUp(PORT)
    for (const row of rows) {
        const ev = await runEvidence(row.key, base, jonKey) || {
            key: row.key, ok: false, replayOk: false, voiceOk: null, error: 'evidence run produced no report',
            ticks: 0, game: row.game || '?', player: row.player || '?', audio: false, humanSeats: 0, relabeledSeats: 0, note: '', voice: null,
        }
        if (row.player) ev.player = row.player
        let clap = null
        if (ev.audio) clap = clapPossible ? await runClap(row.key, base, jonKey) : { ran: false, why: `no dev server on :${PORT} — start npm run dev -- --port ${PORT} to grade the clap` }
        const body = verdictBody(ev, clap, opts.gradedBy || 'FORGE (b)')
        out.push({ key: row.key, ev, clap, body })
        console.log(body + '\n')
        if (!opts.dry) {
            const p = postComment(body)
            out[out.length - 1].posted = p.url || (p.ok ? 'posted' : 'POST FAILED')
            if (!p.ok) out[out.length - 1].postError = true
        }
    }
    return out
}

// --- live mode ------------------------------------------------------------------

async function runLive() {
    const base = flagVal('store', process.env.SESSION_STORE || storeFromQuery(''))
    const jonKey = readKey('JON_KEY')
    if (!jonKey) { console.error(`grade: JON_KEY required (source: ${keySource('JON_KEY') || 'unset'}) — inline or .env.local at the repo root (#2157)`); return 2 }
    const probe = await probeStore(base)
    if (!probe.ok || !probe.sessions) { console.log(`store not reachable/provisioned (${probe.err || 'sessions:false'} @ ${base})`); return 2 }
    const force = []
    for (let i = 0; i < argv.length; i++) if (argv[i] === '--key' && argv[i + 1] && !argv[i + 1].startsWith('--')) force.push(argv[++i])
    else if (argv[i].startsWith('--key=')) force.push(argv[i].split('=').slice(1).join('='))
    let rows
    if (force.length) {
        rows = force.map((k) => ({ key: k, player: null, game: null }))
    } else {
        const listed = await listSessions({ base, limit: Number(flagVal('limit', 50)) || 50, key: jonKey })
        if (!listed.ok) { console.log(`list failed: ${listed.reason}${listed.reason === 'unauthorized' ? ' — JON_KEY rejected or unset (#1711 S8)' : ''}`); return 1 }
        const seenFile = flagVal('seen-file', null)
        let seen
        if (seenFile) seen = new Set(fs.readFileSync(seenFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
        else {
            const s = scanSeen()
            if (!s) { console.error('grade: cannot read #1711 comments via gh (auth?) — refusing to guess what is already graded'); return 1 }
            seen = s
        }
        rows = listed.sessions.filter((r) => !seen.has(r.key))
    }
    const max = Number(flagVal('max', 10)) || 10
    rows = rows.slice(0, max)
    if (!rows.length) { console.log(`grade: nothing new to grade (${base})`); return 0 }
    console.log(`grade: ${rows.length} new take(s) @ ${base}`)
    const results = await gradeRows(rows, base, jonKey, { dry: argv.includes('--dry-run'), noClap: argv.includes('--no-clap') })
    const bad = results.filter((x) => x.postError).length
    if (bad) { console.error(`grade: ${bad} verdict comment(s) failed to post`); return 1 }
    console.log(`grade: ${results.length} verdict(s) ${argv.includes('--dry-run') ? 'printed (dry-run)' : 'posted on #' + ISSUE}`)
    return 0
}

// --- self-test: relaysim + synth takes; no gh, no network beyond loopback -----

const synthVoice = (ticks) => {
    const clock = []
    for (let t = 1; t <= ticks; t += 60) clock.push({ t, ms: Math.round(t * 16.67) })
    if (!clock.length || clock[clock.length - 1].t !== ticks) clock.push({ t: ticks, ms: Math.round(ticks * 16.67) })
    return { slots: [0], consent: true, headset: false, mime: 'audio/webm;codecs=opus', ms: Math.round(ticks * 16.67) + 40, clock, b64: 'QUJD' }
}

function synthHumanTake(seed) {
    const r = collectRun(2, { noRows: true, maxTicks: 1500, seed })
    const file = r.file
    file.format = 'retrogames-rec/v2'
    if (file.slots && file.slots[0]) file.slots[0].source = { kind: 'human' }
    file.voice = { tracks: [synthVoice(file.ticks)], declined: [] }
    return file
}

async function runSelfTest() {
    let pass = 0, fail = 0
    const ok = (cond, name, info = '') => { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) } }

    // 1) localkey resolution (#2157): .env.local parsing, precedence, no leaks.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plaigrade-lk-'))
    fs.writeFileSync(path.join(tmp, '.env.local'), "# local store secrets\nJON_KEY=local-test-key\nOTHER='quoted val'\nBARE\n")
    const savedKey = process.env.JON_KEY
    const savedCwd = process.cwd()
    delete process.env.JON_KEY
    process.chdir(tmp)
    resetLocalKeyCache()
    ok(readKey('JON_KEY') === 'local-test-key', 'localkey: JON_KEY resolves from .env.local', String(readKey('JON_KEY')))
    ok(String(keySource('JON_KEY') || '').endsWith('.env.local'), 'localkey: source names the FILE, never the value', keySource('JON_KEY') || '')
    ok(readKey('OTHER') === 'quoted val', 'localkey: quotes stripped, comments/BARE lines handled', JSON.stringify(readKey('OTHER')))
    ok(readKey('BARE') === null && readKey('ABSENT_NAME') === null, 'localkey: keyless lines and absent names answer null')
    process.env.JON_KEY = 'env-beats-file'
    ok(readKey('JON_KEY') === 'env-beats-file' && keySource('JON_KEY') === 'env', 'localkey: process.env beats the file')
    delete process.env.JON_KEY
    process.chdir(savedCwd)
    resetLocalKeyCache()
    fs.rmSync(tmp, { recursive: true, force: true })
    void savedKey // (env restored at exit with the process)

    // 2) verdict builder: PASS and FAIL shapes, relabel flag, clap n-a.
    const goodEv = { key: 'gauntlet/2026-11-14-seed7-aabbccddeeff.json', ok: true, replayOk: true, voiceOk: true, error: null, ticks: 1500, game: 'gauntlet', player: 'jon', audio: true, humanSeats: 1, relabeledSeats: 0, note: 'hero:warrior', voice: [{ driftMs: 1.23 }] }
    const good = verdictBody(goodEv, null, 'FORGE (b)')
    ok(/^PLAIGRADE gauntlet\/2026-11-14-seed7-aabbccddeeff\.json — PASS$/m.test(good), 'builder: marker line keys the comment and PASS headlines')
    ok(/replay: PASS \(1500 ticks, hero:warrior\)/.test(good) && /voice: PASS \(worst clock drift 1\.2 ms\)/.test(good) && /clap: not run/.test(good) && /seats: 1 native human/.test(good), 'builder: all four axes + seats line', JSON.stringify(good))
    const badEv = { ...goodEv, ok: false, replayOk: false, error: 'diverged at tick 120 (want 5, got 9)' }
    const badb = verdictBody(badEv, { ran: false, why: 'no dev server on :5178' }, 'FORGE (b)')
    ok(/— FAIL$/.test(badb.split('\n')[0]) && /replay: FAIL — diverged at tick 120/.test(badb) && /clap: not run \(no dev server on :5178\)/.test(badb), 'builder: FAIL names its axis; clap states why')
    const clapFail = verdictBody(goodEv, { ran: true, ok: false, worstMs: 512, seat: 0, why: 'worst 512 ms over tolerance' }, 'FORGE (b)')
    ok(/clap: FAIL — worst 512 ms \(seat 0\)|clap: FAIL/.test(clapFail) && /— FAIL$/.test(clapFail.split('\n')[0]), 'builder: a failed clap flips the headline FAIL even with replay+voice green', clapFail.split('\n')[0])
    const relabeled = verdictBody({ ...goodEv, humanSeats: 0, relabeledSeats: 1 }, null, 'FORGE (b)')
    ok(/relabeled seats are NOT human evidence/.test(relabeled), 'builder: #2142 relabel flag is loud in the seats line')

    // 3) end-to-end on the production worker in Node: new-take detection,
    //    marker idempotence, force, and the no-secret assert.
    const sim = await startRelaySim()
    const keys = []
    for (const seed of [7, 8]) {
        const rec = synthHumanTake(seed)
        const up = await (await fetch(`${sim.base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recording: rec, player: 'jon', consent: { motion: true, voice: true } }) })).json()
        if (up.ok && up.key) keys.push(up.key)
    }
    ok(keys.length === 2, `synthesized two stored takes (${keys.length})`)
    process.env.JON_KEY = SIM_READ_KEY
    const listed = await listSessions({ base: sim.base, key: SIM_READ_KEY })
    ok(listed.ok && listed.sessions.length === 2, 'store lists both takes keyed')

    const all = await gradeRows(listed.sessions, sim.base, SIM_READ_KEY, { dry: true, noClap: true, gradedBy: 'self-test' })
    ok(all.length === 2, 'grading grades both new takes')
    ok(all.every((x) => x.ev.ok === true && x.ev.replayOk === true && x.ev.voiceOk === true && x.ev.humanSeats === 1), 'synth human takes verify replay + voice with a native human seat', all.map((x) => x.ev.error || '').join(' | '))
    ok(all.every((x) => /^PLAIGRADE \S+ — PASS$/m.test(x.body)), 'every posted body carries its PLAIGRADE marker + PASS')
    const leaky = all.map((x) => x.body).filter((b) => b.includes(SIM_READ_KEY))
    ok(leaky.length === 0, 'NO BODY CONTAINS THE STORE KEY (#2157 acceptance: comments contain no key)', leaky.join(' | '))

    // same parser live scanSeen() uses, run over the real posted bodies
    const scanned = extractMarkers(all.map((x) => x.body).join('\n---\n'))
    ok(scanned.size === 2 && [...scanned].every((k) => keys.includes(k)), 'marker scan parses PLAIGRADE keys from posted comment text', [...scanned].join(','))
    const seenFile = path.join(os.tmpdir(), `plaigrade-seen-${process.pid}.txt`)
    fs.writeFileSync(seenFile, keys[0] + '\n')
    const seen = new Set(fs.readFileSync(seenFile, 'utf8').split(/\r?\n/).filter(Boolean))
    fs.unlinkSync(seenFile)
    const second = await gradeRows(listed.sessions.filter((r) => !seen.has(r.key)), sim.base, SIM_READ_KEY, { dry: true, noClap: true, gradedBy: 'self-test' })
    ok(second.length === 1 && second[0].key === keys[1], 'already-marked take is SKIPPED — idempotence via the marker line', second.map((x) => x.key).join(','))
    const forced = await gradeRows([{ key: keys[0], player: 'jon', game: 'gauntlet' }], sim.base, SIM_READ_KEY, { dry: true, noClap: true, gradedBy: 'self-test' })
    ok(forced.length === 1 && forced[0].key === keys[0] && forced[0].ev.ok, '--key= forces one take regardless of markers')

    delete process.env.JON_KEY
    sim.close()
    console.log(`\nplaicraft:grade self-test: ${pass}/${pass + fail} — ${fail ? 'FAILED' : 'OK'}`)
    return fail ? 1 : 0
}

const code = argv.includes('--self-test') ? await runSelfTest() : await runLive()
process.exit(code)
