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
await page.keyboard.press('F1')
await page.waitForTimeout(300)
await recBtn.click()
await page.waitForTimeout(400)

r.check('consent overlay appeared before any mic', await page.locator('#vc-yes').count() === 1)
await page.click('#vc-yes')
await page.waitForTimeout(300)

// play a moment so the tick clock accrues samples beside live audio
for (const code of ['ArrowRight', 'ArrowUp', 'Space']) {
    await page.keyboard.down(code)
    await page.waitForTimeout(700)
    await page.keyboard.up(code)
}

await recBtn.click() // stop + save (download fires; we read the parked file)
await page.waitForTimeout(1200)

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
r.check('zero page errors', errors.length === 0, errors.join(' | '))

r.exit(browser)
