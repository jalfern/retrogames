// CLAP TEST PLAY (#2156) — drive the one-screen slap test end-to-end with REAL
// events: a synth mic bakes full-scale claps at known instants (only the sound
// source is synthetic — consent, recorder, tick clock, outbox, upload and the
// decode are the real production path), while the harness slaps the screen with
// trusted pointer events at the same instants. The phone must grade itself, the
// take must upload through the consent gate, and the studio must agree:
// plaicraft:clap --file=<the same bytes> lands the same verdict.
//
//   npm run dev -- --port 5173 --strictPort        (or DEV_PORT)
//   npm run claptestplay                            # clean run -> PASS everywhere
//   npm run claptestplay -- --mutant=shift          # taps +120 ms  -> FAIL both sides
//   npm run claptestplay -- --mutant=silent         # taps, no sound -> FAIL + hint
//   npm run claptestplay -- --mutant=few            # 2 slaps        -> FAIL minPairs
//
// The store is the production worker running in Node (relaysim #1711 S5), so
// the whole consent-gated path runs against the exact HTTP surface Jon's phone
// will hit.

import { requireDevServer, launch, Report } from './lib/harness.mjs'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validate } from '../src/utils/recording.js'
import { detectClaps, matchClapEdges, takeEdges, CLAP_TOL_MS } from '../src/utils/clapSync.js'
import { startRelaySim } from './lib/relaysim.mjs'

const argv = process.argv.slice(2)
const PORT = process.env.DEV_PORT || 5173
const MUTANT = (() => {
    const hit = argv.find((a) => a.startsWith('--mutant'))
    if (!hit) return null
    const v = hit.includes('=') ? hit.split('=')[1] : 'shift'
    if (!['shift', 'silent', 'few'].includes(v)) { console.error(`claptestplay: unknown --mutant=${v} (shift|silent|few)`); process.exit(2) }
    return v
})()

// clap schedule from mic-open (same shape plaicraft-clap uses); taps aim at the
// same instants. shift = the #2156 acceptance mutant (+120 ms: inside the
// ±250 ms search window, outside the ±50 ms line); silent = taps, no sound;
// few = only two slaps.
const SHIFT = MUTANT === 'shift' ? 120 : 0
const CLAP_MS = MUTANT === 'silent' ? [] : MUTANT === 'few' ? [1200, 2600] : [1200, 2600, 4000]
const TAPS_N = MUTANT === 'few' ? 2 : 3
const EXPECT_PASS = MUTANT === null

const r = new Report('claptest:play')
const sim = await startRelaySim()
const BASE = sim.base
const PAGE_URL = `http://localhost:${PORT}/retrogames/claptest?store=${encodeURIComponent(BASE)}`

const browser = await launch({ headless: !argv.includes('--headful'), extraArgs: ['--use-fake-ui-for-media-capture'] })
await requireDevServer(PAGE_URL)

// --- the synth mic (voicedrive's established trick, from plaicraft-clap) ----
const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
await context.addInitScript(() => {
    window.__CLAP = { clapMs: [] }
    const synth = async () => {
        const AC = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        try { await ctx.resume() } catch { /* autoplay flag covers this */ }
        const dest = ctx.createMediaStreamDestination()
        const sr = ctx.sampleRate
        const t0 = Date.now()
        const secs = 14, n = Math.round(secs * sr)
        const buf = ctx.createBuffer(1, n, sr)
        const ch = buf.getChannelData(0)
        let s = 12345
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x3fffffff) - 1 }
        const claps = (window.__CLAP.clapMs || []).map((ms) => Math.round((ms / 1000) * sr))
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
        src.buffer = buf
        src.loop = true
        src.connect(dest)
        src.start(0)
        window.__keepSynth = { ctx, src }
        window.__clapWall = claps.map((p) => t0 + (p / sr) * 1000)
        return dest.stream
    }
    navigator.mediaDevices.getUserMedia = () => synth()
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(PAGE_URL, { waitUntil: 'load' })

// --- attract: one screen, one START ------------------------------------------------
await page.waitForSelector('[data-clap-test]', { timeout: 15000 })
r.check('the clap test screen mounts', await page.locator('[data-clap-phase="attract"]').count() === 1)
await page.evaluate((clapMs) => { window.__CLAP = { clapMs } }, CLAP_MS)
await page.click('[data-clap-start]')

// the SAME consent gate as the game takes, before anything records
try {
    await page.waitForSelector('[data-consent-gate]', { timeout: 5000 })
    r.check('the game-take consent gate goes up at START (nothing checked by default)', true)
} catch {
    r.check('the game-take consent gate goes up at START (nothing checked by default)', false)
    await r.exit(browser)
}
const offByDefault = await page.evaluate(() => {
    const m = document.querySelector('#consent-motion')
    const v = document.querySelector('#consent-voice')
    return m && v && m.getAttribute('aria-checked') === 'false' && v.getAttribute('aria-checked') === 'false'
})
r.check('both switches default OFF (Jon\'s rule)', !!offByDefault)
await page.click('#consent-motion')
await page.click('#consent-voice')
await page.click('#consent-yes')

let armed = false
try {
    await page.waitForFunction(() => !!(window.__autoCapture && window.__autoCapture.recording) && window.__clapTest && window.__clapTest.phase === 'testing', null, { timeout: 5000 })
    armed = true
} catch { /* gate below */ }
r.check('recorder + mic open at seed-birth after YES+YES', armed, await page.evaluate(() => JSON.stringify({ ac: window.__autoCapture || null, ct: (window.__clapTest || {}).phase })))
if (!armed) { sim.close(); await r.exit(browser) }

const clapWall = await page.evaluate(() => window.__clapWall || [])
r.check('mic stream is live (claps scheduled from mic-open)', CLAP_MS.length === 0 || clapWall.length === CLAP_MS.length, JSON.stringify(clapWall.map((w) => w - clapWall[0])))

// --- the slaps: trusted pointer events on the whole-face target --------------
for (let i = 0; i < TAPS_N; i++) {
    const aim = (CLAP_MS.length ? clapWall[i] : Date.now() + 1200 + i * 1400) + SHIFT
    await new Promise((res) => setTimeout(res, Math.max(0, aim - Date.now())))
    await page.mouse.down()
    await page.waitForTimeout(130)
    await page.mouse.up()
}
try {
    await page.waitForFunction(() => window.__clapTest && window.__clapTest.phase === 'graded', null, { timeout: 25000 })
} catch { /* gate below */ }
const graded = await page.evaluate(() => window.__clapTest || null)
r.check('the screen graded itself and left the target', !!(graded && graded.phase === 'graded'), graded && graded.phase)
if (!(graded && graded.phase === 'graded')) { sim.close(); await r.exit(browser) }
const v = graded.verdict || null
r.check('a verdict is on screen in big text', ['PASS', 'FAIL'].includes(await page.getAttribute('[data-clap-test]', 'data-clap-verdict')), await page.getAttribute('[data-clap-test]', 'data-clap-verdict'))
r.info('phone verdict', JSON.stringify(v))

if (EXPECT_PASS) {
    r.check(`PASS: ${TAPS_N} slaps matched within ±${CLAP_TOL_MS} ms on the phone`, !!(v && v.ok && v.matched === 3), v && v.why)
    r.check('PASS carries no hint', !!(v && v.hint === null))
} else if (MUTANT === 'shift') {
    r.check('MUTANT taps +120 ms -> FAIL on the phone (measured, not ungradeable)', !!(v && !v.ok && v.matched === 3 && v.pairs.every((p) => Math.abs(p.offsetMs) > CLAP_TOL_MS)), v && `${v.why} worst ${v.worstMs}`)
    r.check('shift hint names the sound-vs-touch gap', !!(v && /sound and the touch/i.test(v.hint || '')), v && v.hint)
} else if (MUTANT === 'silent') {
    r.check('MUTANT taps with no sound -> FAIL', !!(v && !v.ok && v.claps === 0), v && v.why)
    r.check('silent hint is the verbatim "didn\'t hear the slaps, try louder"', !!(v && v.hint === "didn't hear the slaps, try louder"), v && v.hint)
} else if (MUTANT === 'few') {
    r.check('MUTANT 2 slaps -> FAIL (minPairs 3)', !!(v && !v.ok && v.matched === 2), v && v.why)
}

// --- the take left the phone through the consent gate -------------------------
const last = await page.evaluate(() => window.__autoRecord && window.__autoRecord.last)
r.check('the take uploaded through the consent gate', !!(last && last.uploaded), JSON.stringify(last))
if (!(last && last.uploaded)) { sim.close(); await r.exit(browser) }
const listed = await (await fetch(`${BASE}/sessions`, { headers: sim.readHeaders })).json()
const row = (listed.sessions || []).find((s) => s.key === last.key)
r.check('the store lists the take with audio, game=claptest', !!(row && row.audio === true && row.game === 'claptest'), JSON.stringify(row))

// --- the studio agrees: same bytes, same code, same verdict --------------------
const text = await (await fetch(`${BASE}/sessions/${encodeURIComponent(last.key)}`, { headers: sim.readHeaders })).text()
const rec = JSON.parse(text)
r.check('stored take validates as rec/v2 with one voice track', validate(rec) === null && rec.format === 'retrogames-rec/v2' && rec.voice.tracks.length === 1, validate(rec) || rec.format)
const track = rec.voice && rec.voice.tracks[0]
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
        for (let i = 0; i < ch0.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767)))
        const sr = buf.sampleRate
        ctx.close()
        return { sr, samples: out }
    }, track.b64)
} catch { /* gate below */ }
r.check('opus bytes decode back to PCM in the browser', !!(pcm && pcm.samples.length > 1000), pcm ? `${pcm.samples.length} samples @ ${pcm.sr} Hz` : 'decode failed')
if (pcm && track) {
    const onsets = detectClaps(Float32Array.from(pcm.samples, (x) => x / 32767), { sampleRate: pcm.sr })
    const studio = takeEdges(rec)
        .map((c) => matchClapEdges({ sampleRate: pcm.sr, onsets, edges: c.edges, clock: track.clock }))
        .sort((a, b) => (b.ok - a.ok) || ((a.worstMs ?? 1e9) - (b.worstMs ?? 1e9)))[0]
    r.check('studio verdict == phone verdict on the same bytes (shared takeEdges/clapSync)', !!studio && studio.ok === v.ok && studio.worstMs === v.worstMs, studio ? `${studio.why} (worst ${studio.worstMs}) vs phone ${v && v.worstMs}` : 'no seats')
}

// --- the literal acceptance: `plaicraft:clap` re-grades the take ------------
const dump = path.join(fs.realpathSync(os.tmpdir()), `claptest-take-${last.key.replace(/[^a-z0-9._-]/gi, '_')}.json`)
fs.writeFileSync(dump, text)
const studioCode = await new Promise((res) => {
    const child = spawn(process.execPath, ['scripts/plaicraft-clap.mjs', `--file=${dump}`], { cwd: process.cwd(), env: { ...process.env, DEV_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('close', (code) => { res({ code, out }) })
})
fs.rmSync(dump, { force: true })
if (EXPECT_PASS) {
    r.check('plaicraft:clap --file= PASSes the same take (the studio command, verbatim)', studioCode.code === 0, `exit ${studioCode.code}: ${(studioCode.out.match(/within ±50 ms[^\n]*|outside[^\n]*/) || [''])[0].trim()}`)
} else {
    r.check(`plaicraft:clap --file= REFUSES the mutated take (studio sees ${MUTANT} too)`, studioCode.code !== 0, `exit ${studioCode.code}`)
}

r.check('zero page errors', errors.length === 0, errors.join(' | '))
sim.close()
await r.exit(browser)
