// VOICEDRIVE (#1247) — drive real voice capture end-to-end in headless Chrome.
// Advisory (like every browser suite): the format/protocol gates are voicecheck;
// THIS proves the browser half — a synthetic REC click activates the consent
// overlay, the fake-mic device records real opus bytes, the tick clock ticks
// alongside them, and the saved file validates as rec/v2 with a track.
//
//   npm run dev -- --port 5173 --strictPort   (or any port via DEV_PORT)
//   node scripts/voicedrive.mjs
//
// Chrome's fake media flags stand in for hardware: --use-fake-device-for-media-
// capture generates a tone, --use-fake-ui-for-media-capture pre-grants the
// browser permission bubble (our OWN consent overlay still appears and must be
// clicked — the bubble is not consent, and that law holds even under fakes).

import { opt, requireDevServer, launch, Report } from './lib/harness.mjs'

const PORT = process.env.DEV_PORT || 5173
const URL = opt(process.argv, 'url', `http://localhost:${PORT}/retrogames/gauntlet`)

const r = new Report('voicedrive')
const browser = await launch({ extraArgs: [
    '--use-fake-device-for-media-capture',
    '--use-fake-ui-for-media-capture',
] })
await requireDevServer(URL)
// Hardware gUM on macOS headless is dead at the TCC permission layer (raw
// getUserMedia hangs/crashes the renderer here), so the driver installs a
// WebAudio oscillator stream as getUserMedia — every layer under test (consent
// flow, the real MediaRecorder path, chunking, tick clock, v2 assembly) runs
// untouched; only the sound source is synthetic. VOICEDRIVE_HW=1 tries the
// hardware/fake-device path first (Linux CI).
const context = await browser.newContext({ viewport: { width: 900, height: 760 } })
await context.addInitScript(({ tryHw }) => {
    const synth = () => {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 440
        gain.gain.value = 0.25
        const dest = ctx.createMediaStreamDestination()
        osc.connect(gain)
        gain.connect(dest)
        osc.start()
        return dest.stream
    }
    const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null
    const gUM = async (c) => {
        window.__lastGum = c // #1257: assert the deviceId we asked for actually arrives
        if (tryHw && orig) { try { const s = await orig(c); if (s && s.getAudioTracks().length) return s } catch { /* fall through to synth */ } }
        return synth()
    }
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gUM
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gUM, enumerateDevices: async () => [] }, configurable: true })
}, { tryHw: !!process.env.VOICEDRIVE_HW })
const page = await context.newPage()
page.setDefaultTimeout(60000)
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight') // gesture: unlocks audio + leaves attract
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// settle into play
await page.waitForTimeout(900)

// Real user gesture (F1 shows DebugKit; a click on REC carries activation) —
// scripted recordStart() would (by design) skip voice entirely.
const recBtn = page.getByRole('button', { name: 'REC', exact: true })
// #1257: a saved device preference must reach getUserMedia as deviceId.exact.
await page.evaluate(() => localStorage.setItem('retrogames:voice-device', 'qa-stored-mic'))
await page.keyboard.press('F1')
await page.waitForTimeout(300)
await recBtn.click()
await page.waitForTimeout(400)

r.check('consent overlay appeared before any mic', await page.locator('#vc-yes').count() === 1)
r.check('consent overlay offers a mic picker', await page.locator('#vc-device').count() === 1)
r.check('no mic badge while consent is still pending', await page.locator('[data-voice-mic]').count() === 0)
await page.click('#vc-yes')
await page.waitForTimeout(300)
r.check('green mic badge while recording', await page.locator('[data-voice-mic][data-state="rec"]').count() === 1)
r.check('VU bar appears right after YES', await page.locator('#vc-vu').count() === 1)
const gum = await page.evaluate(() => window.__lastGum || null)
r.check('picked device reaches getUserMedia', !!(gum && gum.audio && gum.audio.deviceId && gum.audio.deviceId.exact), JSON.stringify(gum))

// play a moment so the tick clock accrues samples beside live audio
for (const code of ['ArrowRight', 'ArrowUp', 'Space']) {
    await page.keyboard.down(code)
    await page.waitForTimeout(700)
    await page.keyboard.up(code)
}

// the VU meter ran for ~1.2 s after YES — its peak is the "this mic hears
// you" proof, pinned on window.__voiceVu by voiceCapture.
r.check('VU meter saw signal from the fake mic', await page.evaluate(() => (window.__voiceVu || 0) > 0), await page.evaluate(() => JSON.stringify(window.__voiceVu || 0)))

await recBtn.click() // stop + save (download fires; we read the parked file)
await page.waitForTimeout(1200)
r.check('mic badge gone when the take ends', await page.locator('[data-voice-mic]').count() === 0)

const rec = await page.evaluate(async () => {
    if (window.__voiceFlush) { try { await window.__voiceFlush } catch { /* noop */ } }
    const R = window.__lastRecording
    return R ? JSON.parse(JSON.stringify(R)) : null
})
r.info('voice debug', JSON.stringify(await page.evaluate(() => window.__voiceDebug || null)))

r.check('recording exists', !!rec)
if (rec) {
    r.check('format bumped to v2', rec.format === 'retrogames-rec/v2', rec.format)
    r.check('one local track on slot 0', !!(rec.voice && rec.voice.tracks.length === 1 && rec.voice.tracks[0].slots[0] === 0), JSON.stringify(rec.voice && rec.voice.tracks.map((t) => t.slots)))
    const tr = rec.voice && rec.voice.tracks[0]
    r.check('consent saved on the track', !!(tr && tr.consent === true))
    r.check('fake mic produced real audio bytes', !!(tr && tr.b64.length > 500), tr ? `${tr.b64.length} b64 chars` : '')
    r.check('opus/webm container', !!(tr && /webm|ogg|opus/.test(tr.mime)), tr && tr.mime)
    r.check('tick clock aligned the track', !!(tr && tr.clock.length >= 2 && tr.clock[0].t >= 1 && tr.clock[tr.clock.length - 1].ms > 500), tr && JSON.stringify(tr.clock))
    r.check('track ms matches wall time played', !!(tr && tr.ms > 1500), tr && String(tr.ms))
    const { validate } = await import('../src/utils/recording.js')
    r.check('the live-captured file validates', validate(rec) === null, validate(rec) || '')
}
// #2093 item 5 — THE PHONE SHAPE: iPhone Safari's encoder settles its final
// chunk HUNDREDS OF ms after stop(); that flush latency is what #2058's
// settle-stamp fix had to absorb, and until now the law (track ms >= its own
// clock trace end) was only pinned on Node synth. This page wraps the REAL
// MediaRecorder in a fence that delivers every post-stop event 500 ms late —
// chunking, clock, blob assembly, finalize: all production plumbing, only the
// latency is synthetic. The gates: the fence actually delayed (trace), the
// take still captured (flushed bytes), and finalize's stamp waited for the
// flush — the honest length, proven in Chrome.
const flushCtx = await browser.newContext({ viewport: { width: 900, height: 760 } })
const FLUSH_MS = 500
await flushCtx.addInitScript(({ tryHw, flushMs }) => {
    const synth = () => {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 440
        gain.gain.value = 0.25
        const dest = ctx.createMediaStreamDestination()
        osc.connect(gain)
        gain.connect(dest)
        osc.start()
        return dest.stream
    }
    const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null
    const gUM = async (c) => {
        if (tryHw && orig) { try { const s = await orig(c); if (s && s.getAudioTracks().length) return s } catch { /* fall through to synth */ } }
        return synth()
    }
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gUM
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gUM, enumerateDevices: async () => [] }, configurable: true })
    if (window.MediaRecorder) {
        const Native = window.MediaRecorder
        const trace = []
        window.__recFlushTrace = trace
        class FlushingRecorder {
            constructor(stream, opts) {
                this._n = opts === undefined ? new Native(stream) : new Native(stream, opts)
                this._user = {}
                this._stoppedAt = 0
                this._openAbs = performance.now()
                trace.push({ ev: 'open', abs: Math.round(this._openAbs) })
                this._n.addEventListener('dataavailable', (ev) => {
                    const fire = () => {
                        if (this._stoppedAt) trace.push({ ev: 'dataavailable', sinceStop: Math.round(performance.now() - this._stoppedAt), abs: Math.round(performance.now()) })
                        const h = this._user.ondataavailable
                        if (h) h({ data: ev.data })
                    }
                    if (this._stoppedAt) setTimeout(fire, flushMs)
                    else fire()
                })
                this._n.addEventListener('stop', () => {
                    const fire = () => {
                        if (this._stoppedAt) trace.push({ ev: 'onstop', sinceStop: Math.round(performance.now() - this._stoppedAt), abs: Math.round(performance.now()) })
                        const h = this._user.onstop
                        if (h) h()
                    }
                    if (this._stoppedAt) setTimeout(fire, flushMs)
                    else fire()
                })
            }
            set ondataavailable(fn) { this._user.ondataavailable = fn }
            get ondataavailable() { return this._user.ondataavailable || null }
            set onstop(fn) { this._user.onstop = fn }
            get onstop() { return this._user.onstop || null }
            get mimeType() { return this._n.mimeType }
            get state() { return this._n.state }
            get stream() { return this._n.stream }
            start(...a) { return this._n.start(...a) }
            stop() { this._stoppedAt = performance.now(); trace.push({ ev: 'stop-called', sinceStop: 0, abs: Math.round(this._stoppedAt) }); return this._n.stop() }
        }
        FlushingRecorder.isTypeSupported = (m) => Native.isTypeSupported(m)
        window.MediaRecorder = FlushingRecorder
    }
}, { tryHw: !!process.env.VOICEDRIVE_HW, flushMs: FLUSH_MS })
const page3 = await flushCtx.newPage()
page3.setDefaultTimeout(60000)
page3.on('pageerror', (e) => errors.push(String(e)))
await page3.goto(URL, { waitUntil: 'load' })
await page3.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
await page3.keyboard.press('ArrowRight')
await page3.waitForTimeout(900)
await page3.keyboard.press('F1')
await page3.waitForTimeout(300)
await page3.getByRole('button', { name: 'REC', exact: true }).click()
await page3.waitForTimeout(400)
await page3.click('#vc-yes')
for (const code of ['ArrowRight', 'ArrowUp']) {
    await page3.keyboard.down(code)
    await page3.waitForTimeout(700)
    await page3.keyboard.up(code)
}
await page3.getByRole('button', { name: 'REC', exact: true }).click() // stop — fence holds the flush open
await page3.waitForTimeout(2000)
const ftrace = await page3.evaluate(() => window.__recFlushTrace || [])
const fenced = ftrace.filter((e) => e.ev === 'dataavailable' || e.ev === 'onstop')
r.check('the flush fence delayed the post-stop events ~500 ms', fenced.length >= 1 && fenced.every((e) => e.sinceStop >= FLUSH_MS - 50) && fenced.some((e) => e.sinceStop <= FLUSH_MS + 500), JSON.stringify(ftrace.slice(-4)))
const frec = await page3.evaluate(async () => {
    if (window.__voiceFlush) { try { await window.__voiceFlush } catch { /* noop */ } }
    const R = window.__lastRecording
    return R ? JSON.parse(JSON.stringify(R)) : null
})
const ftr = frec && frec.voice && frec.voice.tracks && frec.voice.tracks[0]
r.check('the flushed take still captured — the delay loses nothing', !!(ftr && ftr.b64.length > 500 && ftr.ms > 1000), ftr ? `${ftr.b64.length} b64, ms ${ftr.ms}` : JSON.stringify(await page3.evaluate(() => window.__voiceDebug || null)))
const fClockEnd = ftr && ftr.clock.length ? ftr.clock[ftr.clock.length - 1].ms : 0
r.check('#2058 law on real recorder plumbing: track ms >= clock trace end', !!(ftr && ftr.ms >= fClockEnd), ftr ? `ms ${ftr.ms} vs clockEnd ${fClockEnd}` : '')
// The discriminator: the stored b64 CONTAINS the fenced bytes, so the honest
// stamp must reach at least the byte-arrival time measured from mic-open. A
// pre-#2058 stamp (taken at stop()) sits ~flush ms BELOW that floor.
const fOpenAbs = (ftrace.find((e) => e.ev === 'open') || {}).abs ?? 0
const fByteAbs = Math.max(0, ...ftrace.filter((e) => e.ev === 'dataavailable').map((e) => e.abs || 0))
const fStopAbs = (ftrace.find((e) => e.ev === 'stop-called') || {}).abs ?? 0
const floorMs = fByteAbs && fOpenAbs ? fByteAbs - fOpenAbs : 0
const stopStampMs = fStopAbs && fOpenAbs ? fStopAbs - fOpenAbs : 0
r.check('settle-stamp covers the fenced bytes (ms >= byte arrival from open)', !!(ftr && floorMs && ftr.ms >= floorMs - 10), ftr ? `ms ${ftr.ms} vs floor ${floorMs}` : '')
r.check('the discriminator has teeth: a stop-click stamp would fail the law by ~flush', floorMs - stopStampMs >= FLUSH_MS - 50, `floor ${floorMs} - stop ${stopStampMs} = ${floorMs - stopStampMs}`)
if (frec) {
    const { validate } = await import('../src/utils/recording.js')
    r.check('the flushed-late file validates', validate(frec) === null, validate(frec) || '')
}

// #1257 declined path: fresh page (consent cache is per page), NO MIC must
// leave a grey badge so the player knows their recording will be silent.
const page2 = await context.newPage()
page2.setDefaultTimeout(60000)
page2.on('pageerror', (e) => errors.push(String(e)))
await page2.goto(URL, { waitUntil: 'load' })
await page2.waitForFunction(() => !!window.__gauntletTest, null, { timeout: 15000 })
await page2.keyboard.press('ArrowRight')
await page2.waitForTimeout(900)
await page2.keyboard.press('F1')
await page2.waitForTimeout(300)
await page2.getByRole('button', { name: 'REC', exact: true }).click()
await page2.waitForTimeout(400)
await page2.click('#vc-no')
await page2.waitForTimeout(300)
r.check('grey mic badge after declining', await page2.locator('[data-voice-mic][data-state="off"]').count() === 1)

r.check('zero page errors', errors.length === 0, errors.join(' | '))

r.exit(browser)
