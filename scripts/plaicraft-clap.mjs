// PLAICRAFT CLAP TEST (#1711 S3) — the acceptance line "Audio lines up with
// the frames to within ±50 ms (prove it with a clap test)" as one command:
//
//   npm run dev -- --port 5173 --strictPort        (or DEV_PORT)
//   npm run plaicraft:clap
//   npm run plaicraft:clap -- --mutate             # presses land 500 ms from
//                                                  # their claps — must go RED
//
// How it works: a stub store (relay/core rules, like recordcheck) stands in for
// the R2 bucket, so the whole consent-gated auto-capture path runs TODAY even
// though #1730 has not provisioned the real one. Gauntlet gets `?store=`, the
// gate goes up YES+YES, and a synth mic stream (voicedrive's established trick
// — only the sound source is synthetic; consent, MediaRecorder, the tick clock,
// v2 assembly and the upload are the real code) fires full-scale CLAPS at known
// wall-times while the harness presses ArrowRight at the SAME instant, like the
// physical clap test: clap + button together. The run ends, uploads to the
// stub, downloads back, decodes the opus in the browser (WebAudio), and the
// pure clapSync verdict pairs every detected onset with its recorded press tick
// through the track's own clock. |offset| <= 50 ms for all three.
//
// Nothing here needs Jon's phone; when the real store lands, --store= reuses
// the identical driver against it.

import http from 'node:http'
import { requireDevServer, launch, Report } from './lib/harness.mjs'
import { validate } from '../src/utils/recording.js'
import { detectClaps, clapVerdict, CLAP_TOL_MS } from '../src/utils/clapSync.js'
import { validateSessionEnvelope, sessionKey, sessionMeta, sessionRow } from '../relay/core.js'

const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const MUTATE = argv.includes('--mutate')
// Clap schedule: from mic-open (wall). First clap >= 1.2 s after YES so the
// seed-birth + recorder-open storm settles; spacing > minGap for the detector.
const CLAP_MS = [1200, 2600, 4000]
// --mutate: the hand presses HALF A SECOND late against the clap — the exact
// desync the acceptance line exists to catch.
const PRESS_OFFSET_MS = MUTATE ? 500 : 0

const r = new Report('plaicraft:clap')

// --- stub store ---------------------------------------------------------------
const bucket = new Map()
const server = http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(obj)) }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end() }
    const url = new URL(req.url, 'http://x')
    if (req.method === 'GET' && url.pathname === '/status') return send(200, { ok: true, service: 'clap-stub', sessions: true })
    if (req.method === 'POST' && url.pathname === '/sessions') {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
            let env
            try { env = JSON.parse(body) } catch { return send(400, { ok: false, err: 'bad json' }) }
            const v = validateSessionEnvelope(env)
            if (!v.ok) return send(400, { ok: false, err: v.err })
            const key = sessionKey(env.recording, new Date().toISOString(), crypto.randomUUID().replace(/-/g, ''))
            bucket.set(key, { text: JSON.stringify(env.recording), meta: { ...sessionMeta(env.recording, env.player), uploadedAt: new Date().toISOString() } })
            return send(200, { ok: true, key })
        })
        return
    }
    if (req.method === 'GET' && url.pathname === '/sessions') return send(200, { ok: true, sessions: [...bucket.entries()].map(([key, v]) => sessionRow(key, v.meta)) })
    if (req.method === 'GET' && url.pathname.startsWith('/sessions/')) {
        const v = bucket.get(decodeURIComponent(url.pathname.slice('/sessions/'.length)))
        if (!v) return send(404, { ok: false, err: 'not found' })
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(v.text)
    }
    send(404, { ok: false, err: 'no route' })
})
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const BASE = `http://127.0.0.1:${server.address().port}`
const PAGE_URL = `http://localhost:${PORT}/retrogames/gauntlet?store=${encodeURIComponent(BASE)}`

const browser = await launch({ headless: !argv.includes('--headful'), extraArgs: ['--use-fake-ui-for-media-capture'] })
await requireDevServer(PAGE_URL)

const errors = []
// The synth mic: getUserMedia returns a WebAudio stream — one LOOPING buffer
// (hum floor + full-scale claps baked at exact sample offsets) started at t=0.
// Looped + held on window: no future scheduling, no GC-before-start — both
// silently ate the clicks in this headless shell (shell+sp, #1622) until the
// shape and scheduling were fixed (measured pipeline priming: ~+7 ms).
// __clapWall translates each baked clap back to wall-ms so the keyboard press
// aims at the same instant a human's clap-and-tap would.
const context = await browser.newContext({ viewport: { width: 900, height: 760 } })
await context.addInitScript(() => {
    window.__CLAP = { clapMs: [] }
    const synth = async () => {
        const AC = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        try { await ctx.resume() } catch { /* autoplay flag covers this */ }
        const dest = ctx.createMediaStreamDestination()
        const sr = ctx.sampleRate
        const t0 = Date.now()
        const secs = 12, n = Math.round(secs * sr)
        const buf = ctx.createBuffer(1, n, sr)
        const ch = buf.getChannelData(0)
        let s = 12345
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
        const claps = (window.__CLAP.clapMs || []).map((ms) => Math.round((ms / 1000) * sr))
        for (let i = 0; i < n; i++) {
            let v = 0.03 * Math.sin(2 * Math.PI * 220 * i / sr) // hum floor: proof the take is live, far below any clap
            for (const c of claps) {
                const k = i - c
                if (k >= 0 && k < 0.05 * sr) {
                    const env = Math.exp(-k / (0.012 * sr)) // low-frequency noise + low sines, fast decay — what survives opus
                    v = (0.55 * rnd() + 0.55 * Math.sin(k * 2 * Math.PI * 190 / sr) + 0.35 * Math.sin(k * 2 * Math.PI * 760 / sr)) * env
                }
            }
            ch[i] = Math.max(-1, Math.min(1, v))
        }
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.connect(dest)
        src.start(0)
        window.__keepSynth = { ctx, src } // GC must not eat the take
        window.__clapWall = claps.map((p) => t0 + (p / sr) * 1000)
        return dest.stream
    }
    navigator.mediaDevices.getUserMedia = () => synth()
})
const page = await context.newPage()
page.setDefaultTimeout(60000)
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(PAGE_URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })

// arm the claps BEFORE the mic opens (the gate is still up; the wrapper reads
// __CLAP when the real recorder asks for the device)
await page.evaluate((clapMs) => { window.__CLAP = { clapMs } }, CLAP_MS)
await page.keyboard.press('ArrowRight') // gesture: unlock audio, attract -> select
await page.waitForTimeout(400)
await page.keyboard.press('Space') // human start -> the consent gate goes up
try {
    await page.waitForSelector('[data-consent-gate]', { timeout: 5000 })
    r.check('consent gate goes up before any capture (store live)', true)
} catch {
    r.check('consent gate goes up before any capture (store live)', false)
    await r.exit(browser)
}
r.check('voice is its own switch and the fake mic makes it available',
    await page.locator('#consent-voice').isEnabled())
await page.click('#consent-motion')
await page.click('#consent-voice')
await page.click('#consent-yes')

// recorder + mic open at seed-birth
let micOpen = false
try {
    await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording), null, { timeout: 5000 })
    micOpen = true
} catch { /* gate below reports it */ }
r.check('recorder opens at seed-birth after YES+YES', micOpen, await page.evaluate(() => JSON.stringify(window.__autoCapture || null)))
if (!micOpen) await r.exit(browser)

const clapWall = await page.evaluate(() => window.__clapWall || [])
r.check('claps scheduled from mic-open', clapWall.length === CLAP_MS.length, JSON.stringify(clapWall.map((w) => w - clapWall[0])))
r.check('green mic badge while the take is live', await page.locator('[data-voice-mic][data-state="rec"]').count() === 1)

// play + clap-and-press: real key events aimed at the clap instants (offset
// for the mutant). Between claps, keep it visibly a run with a couple of taps.
for (let i = 0; i < clapWall.length; i++) {
    const aim = clapWall[i] + PRESS_OFFSET_MS
    await new Promise((res) => setTimeout(res, Math.max(0, aim - Date.now())))
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(130)
    await page.keyboard.up('ArrowRight')
}
await page.waitForTimeout(500)
// end the take like the cabinet does — the sim declares the loss, the game's
// own over-transition closes the recorder and uploads.
await page.evaluate(() => { const gs = window.__gauntletTest.state(); if (!gs.end) gs.end = 'lose' })
let uploaded = null
try {
    await page.waitForFunction(() => !!(window.__autoRecord && window.__autoRecord.last), null, { timeout: 15000 })
    uploaded = await page.evaluate(() => window.__autoRecord.last)
} catch { /* gate below */ }
r.check('the take uploaded through the consent gate', !!(uploaded && uploaded.uploaded), JSON.stringify(uploaded))
if (!(uploaded && uploaded.uploaded)) await r.exit(browser)

// the store saw it, with audio
const listed = await (await fetch(`${BASE}/sessions`)).json()
const row = (listed.sessions || []).find((s) => s.key === uploaded.key)
r.check('stub store lists the session with audio', !!(row && row.audio === true && row.game === 'gauntlet'), JSON.stringify(row))

// download back and read the take
const text = await (await fetch(`${BASE}/sessions/${encodeURIComponent(uploaded.key)}`)).text()
const rec = JSON.parse(text)
r.check('stored file validates', validate(rec) === null, validate(rec) || '')
r.check('v2 file with one voice track', rec.format === 'retrogames-rec/v2' && rec.voice && rec.voice.tracks.length === 1, rec.format)
const track = rec.voice && rec.voice.tracks[0]
r.check('voice track carries a clock trace', !!(track && Array.isArray(track.clock) && track.clock.length >= 2), track && JSON.stringify(track.clock))

// the press ticks the pads banked: rising edges of `right` (exactly one per
// tap — 3 taps, 3 edges, nothing else presses during the window)
const pads = (rec.slots[0] && rec.slots[0].pads) || []
const pressTicks = []
for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].right && !(i && pads[i - 1] && pads[i - 1].right)) pressTicks.push(i + 1)
r.check('three clap-coincident presses banked in the pad stream', pressTicks.length === CLAP_MS.length, JSON.stringify(pressTicks))

// decode the opus IN the browser (the container only lives there) and run the
// pure verdict over real recorded bytes
let pcm = null
try {
    pcm = await page.evaluate(async (b64) => {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const AC = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        const buf = await ctx.decodeAudioData(bytes.buffer)
        const ch0 = buf.getChannelData(0)
        const out = new Array(ch0.length)
        for (let i = 0; i < ch0.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767))) // int16 keeps verdict precision
        const sr = buf.sampleRate
        ctx.close()
        return { sr, samples: out }
    }, track.b64)
} catch (e) { /* gate below */ }
r.check('opus bytes decode back to PCM in the browser', !!(pcm && pcm.samples.length > 1000), pcm ? `${pcm.samples.length} samples @ ${pcm.sr} Hz` : 'decode failed')
if (!(pcm && track)) { server.closeAllConnections(); server.close(); await r.exit(browser) }

const onsets = detectClaps(Float32Array.from(pcm.samples, (v) => v / 32767), { sampleRate: pcm.sr })
const f32 = Float32Array.from(pcm.samples, (v) => v / 32767)
let peak = 0
for (let i = 0; i < f32.length; i++) peak = Math.max(peak, Math.abs(f32[i]))
r.info('decoded audio', `peak ${peak.toFixed(3)}, ${(peak > 0.35 ? 1 : 0)} samples over clap threshold, ${(peak > 0.1 ? 1 : 0)} over 0.1`)
const verdict = clapVerdict({ sampleRate: pcm.sr, onsets, pressTicks, clock: track.clock })
r.info('clap pairs', JSON.stringify(verdict.pairs))
if (MUTATE) {
    r.check(`MUTANT presses 500 ms from their claps -> verdict RED`, !verdict.ok, verdict.why)
    r.check('mutant run still recorded and uploaded (alignment, not plumbing, caught it)', !!(uploaded && uploaded.uploaded && onsets.length === CLAP_MS.length), `onsets ${onsets.length}`)
} else {
    r.check(`every clap lands within ±${CLAP_TOL_MS} ms of its frame`, verdict.ok, `${verdict.why} (worst ${verdict.worstMs} ms)`)
    r.check('onsets heard: exactly one clap per press', onsets.length === CLAP_MS.length, `${onsets.length}/${CLAP_MS.length}`)
}
r.check('zero page errors', errors.length === 0, errors.join(' | '))

server.closeAllConnections()
server.close()
if (MUTATE && r.failed === 0) console.log('  ..    (run was expected RED-on-mutant: green here means the alignment gate caught the planted desync)')
r.exit(browser)
