// MICPROBE (#2709) — the capture-shape battery, permanent.
//
// Headless Chrome 157 killed the WebAudio synth-mic trick (zero MediaRecorder
// chunks from a MediaStreamDestination stream — full matrix in the issue).
// This probe is what answers "is the voice machinery still alive on this
// engine?" in one command, BEFORE a suite burns twenty red lines rediscovering
// an engine break:
//
//   npm run dev -- --port 5173 --strictPort        (or DEV_PORT)
//   npm run micprobe            # fake-file capture must record + hear its claps
//
// PASS conditions (the shape #1711's line-3 witness runs depend on):
//   * the fake-file device delivers chunks (>0, real opus bytes);
//   * the baked claps come back at the expected clock positions, so the
//     constant device priming PRIME_MS (scripts/lib/fakemic.mjs) is sane —
//     the probe prints the measured value and the suggested correction;
//   * decode works on the recorded bytes.
// The legacy WebAudio-synth shape is probed too, but INFORMATIONALLY: while
// #2709 stands, 0 chunks there is the known engine state, not a suite failure.
// If it ever delivers chunks again on a future engine, the probe says so —
// that is the cue to revisit whether the workaround can retire.

import { requireDevServer, launch, Report } from './lib/harness.mjs'
import { bakeFakeMicWav, fakeMicArgs, fakeMicInit, PRIME_MS } from './lib/fakemic.mjs'
import { detectClaps } from '../src/utils/clapSync.js'

const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const CLAP_MS = [1200, 2600, 4000]
const RECORD_MS = 8500

const r = new Report('micprobe')
const wav = bakeFakeMicWav({ clapMs: CLAP_MS, secs: 14 })

async function recordRun(extraArgs, synth) {
    const browser = await launch({ extraArgs })
    await requireDevServer(`http://localhost:${PORT}/retrogames/`)
    const context = await browser.newContext({ viewport: { width: 900, height: 700 } })
    await context.addInitScript(synth ? `(() => {
        window.__CLAP = { clapMs: ${JSON.stringify(CLAP_MS)} }
        const synth = async () => {
            const AC = window.AudioContext || window.webkitAudioContext
            const ctx = new AC()
            try { await ctx.resume() } catch { /* autoplay flag covers this */ }
            const dest = ctx.createMediaStreamDestination()
            const sr = ctx.sampleRate
            const secs = 12, n = Math.round(secs * sr)
            const buf = ctx.createBuffer(1, n, sr)
            const ch = buf.getChannelData(0)
            let s = 12345
            const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
            const claps = window.__CLAP.clapMs.map((ms) => Math.round((ms / 1000) * sr))
            for (let i = 0; i < n; i++) {
                let v = 0.03 * Math.sin(2 * Math.PI * 220 * i / sr)
                for (const c of claps) {
                    const k = i - c
                    if (k >= 0 && k < 0.05 * sr) {
                        const env = Math.exp(-k / (0.012 * sr))
                        v = (0.55 * rnd() + 0.55 * Math.sin(k * 2 * Math.PI * 190 / sr) + 0.35 * Math.sin(k * 2 * Math.PI * 760 / sr)) * env
                    }
                }
                ch[i] = Math.max(-1, Math.min(1, v))
            }
            const src = ctx.createBufferSource()
            src.buffer = buf; src.loop = true; src.connect(dest); src.start(0)
            window.__keepSynth = { ctx, src }
            return dest.stream
        }
        navigator.mediaDevices.getUserMedia = (c) => synth(c)
    })()` : fakeMicInit)
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(`http://localhost:${PORT}/retrogames/mario`, { waitUntil: 'load' })
    const out = await page.evaluate(async (recMs) => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const tr = stream.getAudioTracks()[0]
        const trackState = { kind: tr.kind, readyState: tr.readyState, muted: tr.muted, enabled: tr.enabled }
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder.isTypeSupported(m)) || ''
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        const chunks = []
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
        const done = new Promise((res) => { rec.onstop = res })
        rec.start(500)
        await new Promise((res) => setTimeout(res, recMs))
        rec.stop()
        await done
        const blob = new Blob(chunks, { type: mime })
        const b64 = await new Promise((res) => {
            const fr = new FileReader()
            fr.onload = () => res(String(fr.result).split(',')[1] || '')
            fr.readAsDataURL(blob)
        })
        const resolveWall = window.__gumResolveWall || 0
        try { stream.getTracks().forEach((t) => t.stop()) } catch { /* gone */ }
        return { chunks: chunks.length, bytes: blob.size, mime, trackState, b64, resolveWall, errs: 0 }
    }, RECORD_MS)
    await browser.close()
    return { ...out, errs }
}

// Chrome build identity — the number that decides which capture shapes work.
{
    const browser = await launch({})
    r.info('chrome', `${browser.version()} (${process.platform})`)
    await browser.close()
}

// --- shape A: fake-file capture (the #2709 fix route; MUST work) ------------
{
    const out = await recordRun(fakeMicArgs(wav), false)
    r.check('fake-file capture delivers recorder chunks', out.chunks > 0 && out.bytes > 5000,
        `${out.chunks} chunks / ${out.bytes} B ${out.mime}${out.errs ? ` | errors: ${out.errs.join(' | ')}` : ''}`)
    r.check('the fake-file track is live and unmuted', out.trackState && out.trackState.readyState === 'live' && !out.trackState.muted, JSON.stringify(out.trackState))
    let pcm = null
    if (out.b64) {
        const browser = await launch({})
        const page = await (await browser.newContext()).newPage()
        await page.goto(`http://localhost:${PORT}/retrogames/`, { waitUntil: 'load' })
        pcm = await page.evaluate(async (b64) => {
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const buf = await ctx.decodeAudioData(bytes.buffer)
            const ch0 = buf.getChannelData(0)
            const out2 = { sr: buf.sampleRate, samples: Array.from(ch0).map((v) => Math.round(v * 32767)) }
            ctx.close()
            return out2
        }, out.b64)
        await browser.close()
    }
    r.check('recorded bytes decode back to PCM', !!(pcm && pcm.samples.length > pcm.sr), pcm ? `${(pcm.samples.length / pcm.sr).toFixed(1)} s @ ${pcm.sr} Hz` : 'decode failed')
    if (pcm) {
        const onsets = detectClaps(Float32Array.from(pcm.samples, (v) => v / 32767), { sampleRate: pcm.sr })
        r.check('all three baked claps come back through the fake device', onsets.length === CLAP_MS.length, `${onsets.length}/${CLAP_MS.length} at ${onsets.map((o) => Math.round(o / pcm.sr * 1000)).join(',')} ms`)
        if (onsets.length === CLAP_MS.length) {
            // Priming = heard(ms from device audio start) - baked(ms). The file
            // starts AT device-open; the recorder's clock zero is the same open,
            // so this constant is exactly what drivers fold into PRIME_MS.
            const errs = onsets.map((o, i) => o / pcm.sr * 1000 - CLAP_MS[i])
            const med = errs.slice().sort((a, b) => a - b)[1]
            r.info('measured device priming (heard - baked)', `${errs.map((e) => e.toFixed(1)).join(', ')} ms (PRIME_MS currently ${PRIME_MS}; suggested ${Math.round(med)})`)
            r.check('priming is a stable constant within a ±150 ms aiming budget', Math.abs(med) <= 150 && Math.max(...errs.map((e) => Math.abs(e - med))) <= 25,
                `median ${med.toFixed(1)} ms, spread ${(Math.max(...errs) - Math.min(...errs)).toFixed(1)} ms`)
        }
    }
}

// --- shape A2: per-gUM file replay (#2709 contract for multi-take suites) ---
// claptestplay drives several takes through ONE launch (retries, the re-arm
// second take, silent takes). That only holds while the fake-file device
// replays the WAV from file position 0 at every getUserMedia — pin it, or the
// suite goes mysteriously red when Chrome starts treating the device as a
// continuous stream.
{
    const browser = await launch({ extraArgs: fakeMicArgs(wav) })
    await requireDevServer(`http://localhost:${PORT}/retrogames/`)
    const context = await browser.newContext({ viewport: { width: 900, height: 700 } })
    await context.addInitScript(fakeMicInit)
    const page = await context.newPage()
    await page.goto(`http://localhost:${PORT}/retrogames/`, { waitUntil: 'load' })
    const second = await page.evaluate(async () => {
        const record = async (recMs) => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => window.MediaRecorder.isTypeSupported(m)) || ''
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
            const chunks = []
            rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
            const done = new Promise((res) => { rec.onstop = res })
            rec.start(500)
            await new Promise((res) => setTimeout(res, recMs))
            rec.stop(); await done
            const b64 = await new Promise((res) => {
                const fr = new FileReader()
                fr.onload = () => res(String(fr.result).split(',')[1] || '')
                fr.readAsDataURL(new Blob(chunks, { type: mime }))
            })
            stream.getTracks().forEach((t) => t.stop())
            return { bytes: 0, b64 }
        }
        await record(5000) // first session drains to 5 s…
        await new Promise((res) => setTimeout(res, 500))
        return await record(5000) // …second gUM in the SAME launch must hear them again
    })
    let pcm2 = null
    if (second.b64) {
        pcm2 = await page.evaluate(async (b64) => {
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const buf = await ctx.decodeAudioData(bytes.buffer)
            const o = { sr: buf.sampleRate, samples: Array.from(buf.getChannelData(0)) }
            ctx.close()
            return o
        }, second.b64)
    }
    const onsets2 = pcm2 ? detectClaps(Float32Array.from(pcm2.samples), { sampleRate: pcm2.sr }) : []
    const ms2 = onsets2.map((o) => Math.round(o / pcm2.sr * 1000))
    r.check('fake-file replays from file-0 at every gUM (one launch, two takes)', onsets2.length === CLAP_MS.length,
        ms2.length ? `${onsets2.length}/${CLAP_MS.length} at ${ms2.join(',')} ms` : `no claps in second session (bytes ${second.b64.length})`)
    await browser.close()
}

// --- shape B: legacy WebAudio synth (informational while #2709 stands) ------
{
    const out = await recordRun([], true)
    if (out.chunks > 0) r.info('WebAudio-synth shape (#2709 legacy)', `chunks ${out.chunks} / ${out.bytes} B — engine RECOVERED; consider retiring the fake-file route for suites that want live synth`)
    else r.info('WebAudio-synth shape (#2709 legacy)', '0 chunks — the known M157 breakage stands (fake-file capture is the line-3 shape)')
}

r.exit(null)
