// PLAICRAFT EVIDENCE (#1711 S3) — the store's human sessions, replay-verified,
// in one command. When Jon's phone drives runs against the provisioned store
// (#1730 lands), this script is the acceptance evidence: every stored session
// is downloaded and replayed against its game's REAL sim — hash match at every
// checkpoint or it names the divergence tick.
//
//   npm run plaicraft:evidence                      # live store: verify all
//   npm run plaicraft:evidence -- --player jon --limit 3
//   npm run plaicraft:evidence -- --key gauntlet/2026-11-06-seed7-abcd123456.json
//   npm run plaicraft:evidence -- --json            # machine-readable report
//   npm run plaicraft:evidence -- --self-test       # offline proof (below)
//
// --self-test needs no bucket: it stands up the PRODUCTION worker in Node
// (#1711 S5: scripts/lib/relaysim.mjs — cfworkers shim + faithful R2 mock),
// synthesizes one session PER GAME through the same recorder
// the phones use — gauntlet (export planner route), talk-me-down (solvePad
// autopilot + v2 voice), short-order-shout (cpu emitter partner), and three
// rally files: rain stamping its weather via `rules`, rain LEGACY (no stamp —
// the verifier infers it from grip physics), and mist legacy (fog is visual:
// mist replays bit-exact as clear — documented physics identity). Plus three
// PHONE-shaped gauntlet takes (#2058): mic opens late (negative-drift clock),
// stop() flushes slow (settle-stamped ms), container is mp4 — healthy verify;
// tail-dropped and pre-flush-stamped mutants must go RED naming their ms. The
// verifier also splits replay and voice verdicts (#2058): a voice failure no
// longer headlines as a replay failure. Then it runs
// the full pipeline: ALL must verify, and every pad-flip mutant must go RED
// naming its divergence tick. Proof the evidence can fail — the shipped path
// keeps its verdicts. Phone takes cover BOTH containers (#2093 item 2): mp4
// (iOS) and webm (Android/Chrome) each travel store→verify end-to-end.
//
// Exit codes: 0 all verified, 1 any failure, 2 store not provisioned (live).

import { validate, verifyRecording, createRecorder, REC_FORMAT_V2 } from '../src/utils/recording.js'
import { tickToMs, voiceDrift, VOICE_CLOCK_EVERY, containerDurationMs, TICK_MS } from '../src/utils/voice.js'
import { probeStore, listSessions, storeFromQuery } from '../src/utils/sessionStore.js'
import { startRelaySim, SIM_READ_KEY } from './lib/relaysim.mjs'
import { collectRun, makeReplayDriver } from './plaicraft-export.mjs'
import { createGame as tmdCreate, step as tmdStep, hash as tmdHash, solvePad } from '../src/games/TalkMeDown/engine.js'
import { createGame as sosCreate, stepGame, hashState, makeCpuEmitter } from '../src/games/ShortOrderShout/engine.js'
import { createSim, tickSim, stateHash, cpuDriverPad, cpuCoDriverPad, WEATHER_ORDER } from '../src/games/RallyCoDriver/sim.js'
import { createGame as bdCreate, step as bdStep, hash as bdHash, solvePads as bdSolvePads } from '../src/games/BombDefuse/engine.js'

const argv = process.argv.slice(2)
const flagVal = (name, dflt) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    if (hit) return hit.split('=').slice(1).join('=')
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}

// --- per-game replay drivers -----------------------------------------------------
// Each driver mirrors the game shell's own pad fold, so the recorded file and
// the replay run the SAME semantics (the #494 determinism law). Rally weather:
// files from the rules-stamp era carry it; older files replay under each
// weather in turn — the first exact match is the verdict, and it's reported.

function driverFor(rec) {
    if (rec.game === 'gauntlet') {
        // #1711 S6: honor the hero stamp — files without it replay as the
        // historical warrior/elf defaults.
        return { driver: makeReplayDriver((rec.rules && typeof rec.rules === 'object') ? rec.rules : {}), note: rec.rules && rec.rules.hero ? `hero:${rec.rules.hero}` : '' }
    }
    if (rec.game === 'talk-me-down') {
        let g = null
        return {
            note: '',
            driver: {
                reset: (seed, players) => { g = tmdCreate(seed >>> 0 || 1, Math.max(1, Math.min(2, players | 0 || 1))) },
                step: (pads) => { if (!g.done) tmdStep(g, pads) },
                state: () => ({ tick: g.tick, hash: tmdHash(g) }),
            },
        }
    }
    if (rec.game === 'short-order-shout') {
        let g = null
        return {
            note: '',
            driver: {
                reset: (seed, players) => { g = sosCreate(seed >>> 0 || 1, Math.max(1, Math.min(4, players | 0 || 2))) },
                step: (pads) => { if (!g.done) stepGame(g, pads) },
                state: () => ({ tick: g.tick, hash: hashState(g) }),
            },
        }
    }
    if (rec.game === 'rally-co-driver') {
        const build = (weather) => {
            let g = null
            return {
                reset: (seed, players) => { g = createSim(((seed ?? 1) >>> 0) % 997 || 1, players, weather) },
                step: (pads) => { if (!g.done) tickSim(g, pads) },
                state: () => ({ tick: g.tick, hash: stateHash(g) }),
            }
        }
        const stamped = rec.rules && typeof rec.rules.weather === 'string' ? rec.rules.weather : null
        if (stamped) return { driver: build(stamped), note: `weather:${stamped}` }
        return { legacyInfer: true, build, note: 'weather:inferred' }
    }
    if (rec.game === 'bomb-defuse') {
        // #1800: the fifth title. Solo files record ONE slot — the engine's
        // partner pads are re-emitted from the seed at replay, exactly as the
        // capture produced them (partner logic is rng-free at tick time).
        let g = null
        return {
            note: '',
            driver: {
                reset: (seed, players) => { g = bdCreate(seed >>> 0 || 1, Math.max(1, Math.min(2, players | 0 || 1))) },
                step: (pads) => { if (!g.done) bdStep(g, pads) },
                state: () => ({ tick: g.tick, hash: bdHash(g) }),
            },
        }
    }
    return null
}

// --- one session's verdict -------------------------------------------------------
// ok = structurally sound AND replay-verified (100% checkpoints) AND, for v2,
// the voice clock is sane: samples monotonic and reaching the end of the run,
// track length at least as long as the clock claims, and the container not
// declaring less audio than the clock reaches (#2058: iOS can drop the tail at
// stop — the container's own duration is what proves it). The (±50 ms) clap
// proof itself lives in scripts/plaicraft-clap.mjs — opus bytes decode in the
// browser; here we prove the clock the clap rides on is intact, and clapSync.js,
// the verdict both share, is pinned by recordcheck.
// #2058: replay and voice are reported SEPARATELY (a file whose replay passed
// but whose voice failed was headlined "0/3 replay-verified" — false). The
// exit code stays strict: any failure still leaves the run red.

// Container rounding allowance: opus/mp4 frame boundaries and seek padding put
// the declared duration a few ms off the wall clock. 150 ms is generous and
// still catches iOS tail-drops, which run in hundreds of ms (Jon's took −900).
const VOICE_CONTAINER_TOL_MS = 150

async function verifyKey(key, base, readHeaders = {}) {
    const res = { key, ok: false, replayOk: false, voiceOk: null, error: null, ticks: 0, game: '?', player: '?', audio: false, humanSeats: 0, note: '', voice: null }
    let text
    try {
        const r = await fetch(`${base}/sessions/${encodeURIComponent(key)}`, { headers: readHeaders })
        if (!r.ok) { res.error = `download http ${r.status}`; return res }
        text = await r.text()
    } catch (e) { res.error = `download failed: ${e.message}`; return res }
    let rec
    try { rec = JSON.parse(text) } catch { res.error = 'not json'; return res }
    res.game = rec.game || '?'
    res.ticks = rec.ticks || 0
    res.audio = rec.voice !== undefined && (rec.voice.tracks || []).length > 0
    res.humanSeats = (rec.slots || []).filter((s) => s.source && s.source.kind === 'human').length
    const bad = validate(rec)
    if (bad) { res.error = `validate: ${bad}`; return res }
    const d = driverFor(rec)
    if (!d) { res.error = `no replay driver for game '${rec.game}'`; return res }
    let ver = null
    if (d.legacyInfer) {
        for (const w of WEATHER_ORDER) {
            const v = verifyRecording(rec, d.build(w))
            if (v.ok) { ver = v; res.note = `weather:inferred=${w}`; break }
            if (!ver || (v.mismatch && (!ver.mismatch || v.mismatch.tick > ver.mismatch.tick))) ver = v // report the deepest run
        }
        if (ver && !ver.ok) res.note = 'weather:inferred=FAILED'
    } else {
        res.note = d.note
        ver = verifyRecording(rec, d.driver)
    }
    if (!ver) { res.error = 'no verification ran'; return res }
    if (!ver.ok) {
        res.error = ver.mismatch ? `diverged at tick ${ver.mismatch.tick} (want ${ver.mismatch.want}, got ${ver.mismatch.got})` : `replay ran ${ver.ticks}/${rec.ticks} ticks`
        res.ticks = ver.ticks
        return res
    }
    res.replayOk = true
    if (rec.voice) {
        const tracks = []
        for (const tr of rec.voice.tracks || []) {
            const clk = tr.clock || []
            let mono = true
            for (let i = 1; i < clk.length; i++) if (clk[i].ms < clk[i - 1].ms) mono = false
            const covered = clk.length > 0 && clk[clk.length - 1].t >= rec.ticks - VOICE_CLOCK_EVERY
            const endMs = clk.length ? clk[clk.length - 1].ms : 0
            const containerMs = containerDurationMs(tr) // what the bytes themselves declare (null = unparseable)
            tracks.push({
                slots: tr.slots.join('+'),
                clockSamples: clk.length,
                monotonicMs: mono,
                coversRunEnd: covered,
                driftMs: clk.length >= 2 ? +voiceDrift(clk).maxLagMs.toFixed(1) : null,
                msAtLastClock: endMs,
                trackMs: tr.ms, // #2058: the track's claimed length, printed NEXT TO the clock it must cover
                containerMs,     // #2058: and the container-declared length
                audioLonger: tr.ms >= endMs, // audio at least as long as its own clock claims
                truncated: containerMs !== null && containerMs < endMs - VOICE_CONTAINER_TOL_MS, // bytes end before the clock does
            })
        }
        res.voice = tracks
        res.voiceOk = true
        const broken = tracks.find((t) => !t.monotonicMs || !t.coversRunEnd || !t.audioLonger || t.truncated)
        if (broken) {
            res.voiceOk = false
            res.error = broken.truncated
                ? `audio truncated at stop: container ${broken.containerMs} ms < clock ${broken.msAtLastClock} ms on slot ${broken.slots}`
                : `voice clock broken on slot ${broken.slots} (track ${broken.trackMs} ms vs clock ${broken.msAtLastClock} ms)`
            return res
        }
    }
    res.ok = true
    res.ticks = ver.ticks
    return res
}

function report(sessions) {
    const pad = (s, n) => String(s).padEnd(n)
    console.log(`${pad('VERDICT', 6)}${pad('GAME', 20)}${pad('PLAYER', 12)}${pad('LEN', 8)}${pad('HUM', 4)}${pad('AUDIO', 6)}NOTE / ERROR`)
    for (const s of sessions) {
        // VOICE = the replay verified but the audio clock did not (#2058: one
        // verdict per axis — a voice failure is not a replay failure).
        const verdict = s.ok ? 'PASS' : s.replayOk ? 'VOICE' : 'FAIL'
        console.log(`${pad(verdict, 6)}${pad(s.game, 20)}${pad(s.player, 12)}${pad(s.ticks, 8)}${pad(s.humanSeats, 4)}${pad(s.audio ? 'yes' : 'no', 6)}${s.ok ? s.note : s.error || s.note}`)
    }
    const good = sessions.filter((s) => s.ok).length
    const replayGood = sessions.filter((s) => s.replayOk).length
    console.log(`\nevidence: ${replayGood}/${sessions.length} replay-verified${replayGood === sessions.length && sessions.length ? ' — 100% (acceptance line #2 holds for these files)' : ''}`)
    const voiced = sessions.filter((s) => s.audio)
    if (voiced.length) {
        const voiceGood = voiced.filter((s) => s.voiceOk).length
        const worst = Math.max(...voiced.flatMap((s) => (s.voice || []).map((t) => Math.abs(t.driftMs || 0))))
        console.log(`voice: ${voiceGood}/${voiced.length} clock-sane${voiceGood === voiced.length ? `, worst clock drift ${worst.toFixed(1)} ms (clap ±50 ms rides this clock)` : ''}`)
        for (const s of voiced.filter((x) => !x.voiceOk)) {
            for (const t of s.voice || []) {
                console.log(`  voice ${s.key}: slot ${t.slots} track ${t.trackMs} ms vs clock ${t.msAtLastClock} ms${t.containerMs !== null ? `, container ${t.containerMs} ms` : ', container duration unknown'}`)
            }
        }
    }
    return good === sessions.length && sessions.length > 0
}

const fetchAndVerify = async (rows, base, readHeaders = {}) => {
    const out = []
    for (const row of rows) {
        const s = await verifyKey(row.key, base, readHeaders)
        s.player = row.player || s.player
        out.push(s)
    }
    return out
}

// --- live mode -------------------------------------------------------------------

async function runLive() {
    const base = flagVal('store', process.env.SESSION_STORE || storeFromQuery(''))
    const probe = await probeStore(base)
    if (!probe.ok || !probe.sessions) {
        console.log(`store not provisioned (${probe.err || 'sessions:false'} @ ${base}) — the R2 bucket awaits #1730; run --self-test to prove the pipeline meanwhile`)
        return 2
    }
    const key = process.env.JON_KEY || null // read lockdown (#1711 S8): sends x-session-key
    const listed = await listSessions({ base, limit: Number(flagVal('limit', 50)) || 50, key })
    if (!listed.ok) { console.log(`list failed: ${listed.reason}${listed.reason === 'unauthorized' ? ' — set JON_KEY (reads are locked, #1711 S8)' : ''}`); return 1 }
    let rows = listed.sessions
    const player = flagVal('player', null)
    const game = flagVal('game', null)
    const keys = []
    for (let i = 0; i < argv.length; i++) if (argv[i] === '--key' && argv[i + 1] && !argv[i + 1].startsWith('--')) keys.push(argv[++i])
    if (keys.length) rows = rows.filter((r) => keys.includes(r.key))
    if (player) rows = rows.filter((r) => (r.player || '') === player)
    if (game) rows = rows.filter((r) => r.game === game)
    if (!rows.length) { console.log(`no sessions matched (store ${base})`); return argv.includes('--key') ? 1 : 0 }
    const sessions = await fetchAndVerify(rows, base, key ? { 'x-session-key': key } : {})
    if (argv.includes('--json')) { console.log(JSON.stringify({ base, sessions }, null, 2)); return sessions.every((s) => s.ok) ? 0 : 1 }
    return report(sessions) ? 0 : 1
}

// --- self-test: stub store + synthesized sessions + mutants ----------------------

const mkVoice = (ticks, startTick, simMs) => {
    // a clock trace like the phone's: sampled ~1/s from mic-open, ms drifting
    // slightly from realtime (the throttled-box case)
    const clock = []
    for (let t = startTick; t <= ticks; t += VOICE_CLOCK_EVERY) clock.push({ t, ms: Math.round(t * 16.67 * simMs) })
    if (!clock.length || clock[clock.length - 1].t !== ticks) clock.push({ t: ticks, ms: Math.round(ticks * 16.67 * simMs) })
    return { slots: [0], consent: true, headset: false, mime: 'audio/webm;codecs=opus', ms: Math.round(ticks * 16.67 * simMs) + 40, clock, b64: 'QUJD' }
}

// --- phone-shaped takes (#2058) --------------------------------------------------
// Jon's first iPhone takes failed evidence with audioLonger:false and
// humanSeats 0 while the synth-mic harness above stayed green — the harness
// knew nothing of what a phone does differently. Three behaviours baked in here:
//   1. the mic opens ~1.5 s AFTER seed birth (getUserMedia + iOS audio-session
//      start), so the clock trace rides NEGATIVE drift against t*16.67 — its
//      ms are measured from mic-open, not from tick 1;
//   2. MediaRecorder.stop() flushes hundreds of ms after the run ends; the
//      honest track `ms` is stamped after that flush (pre-fix captures stamped
//      it before -> audioLonger false on every phone take);
//   3. iOS records `audio/mp4` (none of our webm/ogg candidates is supported)
//      and can DROP the tail past the 5 s flush bound — the mvhd duration then
//      declares less audio than the clock reaches.
// And the human seat: the capture must label slot 0 `human` at origin.

// Minimal walkable EBML: EBML header + Segment{Info{TimecodeScale=1e6 ns,
// Duration=f64 ms}}. Sizes here are always < 128, so one-byte vints suffice.
function fakeWebmB64(durationMs) {
    const b = []
    b.push(0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0xf2, 0x81, 0x01) // EBML{EBMLVersion=1}
    b.push(0x18, 0x53, 0x80, 0x67, 0x80 | 24)                       // Segment{Info}
    b.push(0x15, 0x49, 0xa9, 0x66, 0x80 | 19)                       // Info (8 B scale + 11 B duration)
    b.push(0x2a, 0xd7, 0xb1, 0x84, 0x00, 0x0f, 0x42, 0x40)          // TimecodeScale=1e6 ns
    b.push(0x44, 0x89, 0x88)                                        // Duration, f64
    const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, durationMs)
    for (let i = 0; i < 8; i++) b.push(d.getUint8(i))
    return Buffer.from(b).toString('base64')
}

// Minimal ISO-BMFF: ftyp + moov{mvhd v0: timescale 1000, duration ms}.
function fakeMp4B64(durationMs) {
    const b = []
    const str = (s) => b.push(...[...s].map((c) => c.charCodeAt(0)))
    const u32 = (v) => b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)
    u32(8 + 12); str('ftyp'); str('M4A '); u32(0); str('M4A ')
    const mvhd = []
    const mp = (...vs) => mvhd.push(...vs)
    const mu32 = (v) => mp((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)
    mp(0, 0, 0, 0); mp(0, 0, 0, 0); mp(0, 0, 0, 0) // version+flags, created, modified
    mu32(1000); mu32(Math.round(durationMs))         // timescale, duration
    while (mvhd.length < 100) mvhd.push(0)            // real v0 payloads are 100 B
    u32(8 + 8 + mvhd.length); str('moov')            // moov{mvhd}
    u32(8 + mvhd.length); str('mvhd')
    b.push(...mvhd)
    return Buffer.from(b).toString('base64')
}

// The phone-shaped voice track. Geometry (all ms since MIC OPEN, which is
// micDelayMs after tick 1):
//   clock end   = ticks*16.67 - micDelay + flush   (stamped at settle)
//   ms (fixed)  = same                              (settle-stamped, #2058 fix)
//   ms (buggy)  = clock end - flush                 (pre-stop stamp, shipped bug)
//   container   = clock end - dropTail              (iOS tail-drop past the bound)
function mkPhoneVoice(ticks, { micDelayMs = 1600, flushMs = 700, stamp = 'settle', dropTailMs = 0, webm = false } = {}) {
    const clock = []
    // first sample = first tick processed AFTER the mic opened. Its offset o
    // is NOT a multiple of 60 (mic-open lands between ticks), so the loop
    // samples never hit the final tick exactly — clock.finish() must add the
    // closing sample at settle time, post-flush. That finish sample is what
    // the pre-stop stamp lost against on Jon's phone (3600 ticks, o≈98:
    // loop ends at 3578, finish adds {t:3600, ms:58380}).
    const first = Math.max(2, Math.floor(micDelayMs / TICK_MS) + 1)
    for (let t = first; t <= ticks; t += VOICE_CLOCK_EVERY) clock.push({ t, ms: Math.round(t * TICK_MS - micDelayMs) })
    const endMs = Math.round(ticks * TICK_MS - micDelayMs + flushMs)
    if (clock[clock.length - 1].t !== ticks) clock.push({ t: ticks, ms: endMs })
    const ms = stamp === 'pre-stop' ? endMs - flushMs : endMs
    const containerMs = endMs - dropTailMs
    return { slots: [0], consent: true, headset: false, mime: webm ? 'audio/webm;codecs=opus' : 'audio/mp4', ms, clock, b64: webm ? fakeWebmB64(containerMs) : fakeMp4B64(containerMs) }
}

// Attach a phone-shaped take to a synthesized gauntlet file the way the fixed
// CAPTURE would: v2 tag, seat 0 stamped human at origin, honest voice track.
function attachPhoneVoice(file, opts) {
    file.format = REC_FORMAT_V2
    if (file.slots && file.slots[0]) file.slots[0].source = { kind: 'human' }
    file.voice = { tracks: [mkPhoneVoice(file.ticks, opts)], declined: [] }
    return file
}

function synthSessions() {
    const out = []
    // gauntlet — the export's planner route (verified against its own driver)
    {
        const r = collectRun(2, { noRows: true, maxTicks: 1500 })
        out.push({ rec: r.file, expect: r.stats.verified, label: 'gauntlet (planner route)' })
    }
    // gauntlet — PHONE-shaped takes (#2058): the shape Jon's iPhone files have.
    // The synth-mic case above knew none of this, so real phone bytes failed
    // while the harness stayed green — the issue's "add whatever the phone does
    // differently so it fails here first".
    {
        // healthy post-fix take: mic lag + slow flush, mp4 container, human seat
        const r = collectRun(2, { noRows: true, maxTicks: 1500 })
        out.push({ rec: attachPhoneVoice(r.file, { micDelayMs: 1600, flushMs: 700 }), expect: true, label: 'gauntlet (PHONE take — mic lag + slow flush, mp4, human seat)' })
    }
    {
        // #2093 item 2: BOTH containers travel the full store→verify pipeline.
        // Android/Chrome phones file webm; until now the EBML duration path was
        // pinned only in voicecheck. Same healthy shape as the mp4 take above.
        const r = collectRun(2, { noRows: true, maxTicks: 1500 })
        out.push({ rec: attachPhoneVoice(r.file, { micDelayMs: 1600, flushMs: 700, webm: true }), expect: true, label: 'gauntlet (PHONE take — webm container, human seat)' })
    }
    {
        // iOS dropped the tail past the flush bound: bytes end before the clock
        const r = collectRun(2, { noRows: true, maxTicks: 1500 })
        out.push({ rec: attachPhoneVoice(r.file, { micDelayMs: 1600, flushMs: 300, dropTailMs: 1200 }), expect: false, label: 'gauntlet (PHONE take — iOS dropped the tail)' })
    }
    {
        // the shipped #2058 capture bug shape: ms stamped before stop() flushed
        const r = collectRun(2, { noRows: true, maxTicks: 1500 })
        out.push({ rec: attachPhoneVoice(r.file, { micDelayMs: 1638, flushMs: 700, stamp: 'pre-stop' }), expect: false, label: 'gauntlet (PHONE take — pre-flush ms stamp)' })
    }
    // talk-me-down — solo, solvePad autopilot, v2 voice with a realistic clock
    {
        const seed = 11
        const g = tmdCreate(seed, 1)
        const rec = createRecorder({ gameId: 'talk-me-down', method: 'dpad', seed, players: 1, build: 'selftest', sources: [{ kind: 'cpu' }] })
        while (!g.done && g.tick < 6000) {
            const pad = solvePad(g) // the pad is what the hand SENT — captured
            tmdStep(g, [pad])       // BEFORE the step, and fed to both
            g.events.length = 0
            rec.addTick([pad], null, tmdHash(g))
        }
        const file = rec.finish(tmdHash(g), { tracks: [mkVoice(rec.ticks, 1, 1.05)], declined: [] })
        out.push({ rec: file, expect: true, label: `talk-me-down (solvePad, won=${g.won}, v2 voice)` })
    }
    // short-order-shout — seat 1 band pads, seat 2 the engine's own cpu emitter
    {
        const seed = 4
        const g = sosCreate(seed, 2)
        const cpu = makeCpuEmitter(1)
        const rec = createRecorder({ gameId: 'short-order-shout', method: 'dpad', seed, players: 2, build: 'selftest', sources: [{ kind: 'cpu' }, { kind: 'cpu' }] })
        const DIRS = ['right', 'right', 'up', 'left', 'down', 'a']
        for (let t = 0; t < 1200 && !g.done; t++) {
            const p1 = { [DIRS[Math.floor(t / 11) % DIRS.length]]: true }
            const p2 = cpu({ gs: g, tick: g.tick })
            stepGame(g, [p1, p2])
            g.fx.length = 0
            rec.addTick([p1, p2], null, hashState(g))
        }
        out.push({ rec: rec.finish(hashState(g)), expect: true, label: 'short-order-shout (cpu partner)' })
    }
    // rally-co-driver — cpu driver seat, WEATHER STAMPED ('rain')
    {
        const seed = 42
        const g = createSim(seed % 997 || 1, 2, 'rain')
        const rec = createRecorder({ gameId: 'rally-co-driver', method: 'dpad', seed: g.seed, players: 2, build: 'selftest', sources: [{ kind: 'cpu' }, { kind: 'cpu' }], rules: () => ({ weather: g.weather }) })
        while (!g.done && g.tick < 3000) {
            const d = cpuDriverPad(g), c = cpuCoDriverPad(g)
            tickSim(g, [d, c])
            g.events.length = 0
            rec.addTick([d, c], null, stateHash(g))
        }
        out.push({ rec: rec.finish(stateHash(g)), expect: true, label: 'rally-co-driver (rain, rules-stamped)' })
    }
    // rally — LEGACY file: no rules stamp. Rain changes grip physics, so the
    // inference must land on rain (clear/mist diverge from its hashes).
    {
        const seed = 77
        const g = createSim(seed % 997 || 1, 2, 'rain')
        const rec = createRecorder({ gameId: 'rally-co-driver', method: 'dpad', seed: g.seed, players: 2, build: 'selftest', sources: [{ kind: 'cpu' }, { kind: 'cpu' }] })
        while (!g.done && g.tick < 3000) {
            const d = cpuDriverPad(g), c = cpuCoDriverPad(g)
            tickSim(g, [d, c])
            g.events.length = 0
            rec.addTick([d, c], null, stateHash(g))
        }
        out.push({ rec: rec.finish(stateHash(g)), expect: true, label: 'rally-co-driver (rain, legacy — inferred)' })
    }
    // rally — LEGACY mist file: fog is visual only (gs.vis stays out of the
    // hash), so mist replays EXACTLY as clear. Documented physics identity:
    // inference may answer clear — the run is still bit-verifiable either way.
    {
        const seed = 91
        const g = createSim(seed % 997 || 1, 2, 'mist')
        const rec = createRecorder({ gameId: 'rally-co-driver', method: 'dpad', seed: g.seed, players: 2, build: 'selftest', sources: [{ kind: 'cpu' }, { kind: 'cpu' }] })
        while (!g.done && g.tick < 3000) {
            const d = cpuDriverPad(g), c = cpuCoDriverPad(g)
            tickSim(g, [d, c])
            g.events.length = 0
            rec.addTick([d, c], null, stateHash(g))
        }
        out.push({ rec: rec.finish(stateHash(g)), expect: true, label: 'rally-co-driver (mist, legacy — fog is cosmetic)' })
    }
    // bomb-defuse — solo: solver plays seat 1, the ENGINE emits the partner
    // pads internally; v2 voice on a realistic clock (#1800, fifth title).
    {
        const seed = 21
        const g = bdCreate(seed, 1)
        const rec = createRecorder({ gameId: 'bomb-defuse', method: 'dpad', seed, players: 1, build: 'selftest', sources: [{ kind: 'cpu' }] })
        while (!g.done && g.tick < 6000) {
            const pads = bdSolvePads(g)
            bdStep(g, [pads[0]])
            g.events.length = 0
            rec.addTick([pads[0]], null, bdHash(g))
        }
        const file = rec.finish(bdHash(g), { tracks: [mkVoice(rec.ticks, 1, 1.02)], declined: [] })
        out.push({ rec: file, expect: true, label: `bomb-defuse (solo solver + internal partner, won=${g.won}, v2 voice)` })
    }
    // bomb-defuse 2P — both seats solver-driven, both streams recorded
    {
        const seed = 33
        const g = bdCreate(seed, 2)
        const rec = createRecorder({ gameId: 'bomb-defuse', method: 'dpad', seed, players: 2, build: 'selftest', sources: [{ kind: 'cpu' }, { kind: 'cpu' }] })
        while (!g.done && g.tick < 6000) {
            const pads = bdSolvePads(g)
            bdStep(g, pads)
            g.events.length = 0
            rec.addTick(pads, null, bdHash(g))
        }
        out.push({ rec: rec.finish(bdHash(g)), expect: true, label: 'bomb-defuse (2P solver pair)' })
    }
    return out
}

// candidates for pad-flip mutants: direction presses after tick 100, spaced
// at least 45 ticks apart (checkpoint granularity is 30) so each flip tests
// a separate stretch of the run.
function tamperedCandidates(rec) {
    const out = []
    rec.slots[0].pads.forEach((p, i) => {
        if (i < 100) return
        for (const f of ['left', 'right', 'up', 'down']) if (p[f]) out.push({ idx: i, field: f })
    })
    const spaced = []
    for (const c of out) if (!spaced.length || c.idx - spaced[spaced.length - 1].idx >= 45) spaced.push(c)
    return spaced.slice(0, 4)
}

async function runSelfTest() {
    // #1711 S5: the self-test store is now the PRODUCTION worker running in
    // Node (scripts/lib/relaysim.mjs — cfworkers shim + faithful R2 mock), not
    // a hand-written duplicate of the routes. What this table verifies today
    // is the exact HTTP surface Jon's phone will meet when #1730 binds the
    // bucket: routes, keys, metadata rows, CORS-free loopback transport.
    const sim = await startRelaySim()
    const base = sim.base

    let pass = 0, fail = 0
    const ok = (cond, name, info = '') => { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) } }

    const synth = synthSessions()
    const labels = new Map()
    for (const { rec, expect, label } of synth) {
        const env = { recording: rec, player: 'selftest', consent: { motion: true, voice: rec.voice !== undefined } }
        const r = await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(env) })
        const j = await r.json()
        ok(j.ok && j.key, `synthesized upload: ${label}`, j.err || '')
        if (j.key) labels.set(j.key, { label, expect })
    }

    // tampered mutants: FLIP direction pads mid-run in the gauntlet file (a
    // dropped pad can hide behind a wall for one tick — a reversal cannot hold
    // its line). A single flip may still be absorbed before the next 30-tick
    // checkpoint; the gate is that at least one forks the run, and one names
    // its divergence tick.
    const gKey = [...labels].find(([, l]) => l.label.startsWith('gauntlet'))[0]
    const gText = await (await fetch(`${base}/sessions/${encodeURIComponent(gKey)}`, { headers: sim.readHeaders })).text()
    const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' }
    const cand = tamperedCandidates(JSON.parse(gText))
    ok(cand.length >= 1, `found direction pads to flip (${cand.length})`)
    let mutantKeys = 0
    for (const c of cand) {
        const m = JSON.parse(gText)
        const p = m.slots[0].pads[c.idx]
        delete p[c.field]
        p[OPP[c.field]] = true
        const tEnv = { recording: m, player: 'selftest', consent: { motion: true } }
        const tr = await (await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tEnv) })).json()
        if (tr.ok && tr.key) { labels.set(tr.key, { label: `MUTANT flip@${c.idx + 1}`, expect: false, mutant: true }); mutantKeys++ }
    }

    const rows = await listSessions({ base, key: SIM_READ_KEY })
    ok(rows.ok && rows.sessions.length === labels.size, `listing sees every synthetic session (${labels.size})`)
    const sessions = await fetchAndVerify(rows.sessions, base, sim.readHeaders)
    let caught = 0
    const caughtAt = []
    for (const s of sessions) {
        const want = labels.get(s.key)
        if (want.mutant) {
            if (!s.ok) { caught++; caughtAt.push(s.error) }
            continue
        }
        ok(s.ok === want.expect, `${want.expect ? 'verified' : 'CAUGHT'}: ${want.label}`, s.ok ? s.note : s.error)
        if (want.label.includes('rain, legacy')) ok(s.note.includes('inferred=rain'), 'legacy rain file inferred the physics-true weather', s.note)
        if (want.label.includes('v2 voice')) ok(s.voice && s.voice[0].coversRunEnd && s.voice[0].monotonicMs, 'voice clock sane on the v2 session', JSON.stringify(s.voice))
        if (want.label.includes('mic lag + slow flush')) ok(
            s.ok && s.voiceOk && s.humanSeats === 1 && s.voice && s.voice[0].containerMs !== null &&
            s.voice[0].driftMs < 0 && s.voice[0].audioLonger && s.voice[0].coversRunEnd,
            'phone-shaped take verifies: negative-drift clock, settle-stamped ms, parsed mp4 duration, human seat',
            `${s.error || ''} ${JSON.stringify(s.voice)}`)
        if (want.label.includes('webm container')) ok(
            s.ok === want.expect && s.voiceOk && s.voice && s.voice[0].containerMs !== null && s.voice[0].coversRunEnd,
            'webm take verifies end-to-end: parsed EBML duration through store→verify (#2093 item 2)',
            `${s.error || ''} ${JSON.stringify(s.voice)}`)
        if (want.label.includes('dropped the tail')) ok(!s.ok && s.replayOk && s.voiceOk === false && /truncated/.test(s.error || ''), 'container-declared tail-drop is CAUGHT, naming container vs clock ms', s.error)
        if (want.label.includes('pre-flush ms stamp')) ok(!s.ok && s.replayOk && s.voiceOk === false && /voice clock broken .*track \d+ ms vs clock \d+ ms/.test(s.error || ''), 'pre-stop-stamped ms fails audioLonger — the #2058 phone shape reproduces in the harness now', s.error)
    }
    ok(caught >= 1 && caught === mutantKeys, `every pad-flip mutant was CAUGHT (${caught}/${mutantKeys})`, caughtAt.join(' | '))
    if (caughtAt.length) ok(caughtAt.some((e) => /diverged at tick/.test(e)), 'a mutant names its divergence tick', caughtAt[0])

    sim.close()
    console.log(`\nevidence self-test: ${pass}/${pass + fail} — ${fail ? 'FAILED' : 'OK (and the mutant proved it can fail)'}`)
    return fail ? 1 : 0
}

const code = argv.includes('--self-test') ? await runSelfTest() : await runLive()
process.exit(code)
