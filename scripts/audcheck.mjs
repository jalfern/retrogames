// Self-verifying audio harness (vendored).
//
// Launches Chrome, starts the game, and asserts the chiptune engine is actually
// producing output (AnalyserNode peak) and that its scheduler is stepping.
// Exits non-zero on failure so it can gate CI / a pre-push check.
//
// Usage:
//   npm run audcheck
//   node scripts/audcheck.mjs [url]
//
// Prereqs: `npm install`, a running `npm run dev`, and Google Chrome.

const url = process.argv[2] || 'http://localhost:5173/retrogames/mario'

let chromium
try {
    ({ chromium } = await import('playwright-core'))
} catch {
    console.error('playwright-core is not installed. Run `npm install` in the repo root first.')
    process.exit(1)
}

let browser
try {
    browser = await chromium.launch({
        channel: process.env.SHOT_CHANNEL || 'chrome',
        headless: true,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        ],
    })
} catch (e) {
    console.error('Could not launch Chrome. Install Google Chrome or set SHOT_CHANNEL.')
    console.error(e.message)
    process.exit(1)
}

const page = await browser.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()) })

await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(400)

// Baseline first: on the attract screen no music is playing, so the analyser should
// read silence. The real assertion is relative to this - an absolute threshold on a
// chiptune peak is sampling luck, because the engine plays discrete notes with gaps
// (measured while playing: 1 1 1 2 1 1 1 3 1 3 1 5 1 5 1 12 1 11 1 3). A fixed
// "> 3" passed on a Mac and failed on a Linux CI runner that read exactly 3.
let silencePeak = 0
for (let i = 0; i < 10; i++) {
    silencePeak = Math.max(silencePeak, await page.evaluate(() => window.__marioTest.musicPeak()))
    await page.waitForTimeout(60)
}

await page.keyboard.press('ArrowRight') // gesture -> start game -> intro
await page.waitForTimeout(2400)         // wait out intro -> play (music starts)

const s1 = await page.evaluate(() => window.__marioTest.musicState())
await page.waitForTimeout(600)
const s2 = await page.evaluate(() => window.__marioTest.musicState())

// Sample the analyser peak across a full bar to catch the waveform regardless of phase.
let maxPeak = 0
const peaks = []
for (let i = 0; i < 24; i++) {
    const p = await page.evaluate(() => window.__marioTest.musicPeak())
    peaks.push(p)
    maxPeak = Math.max(maxPeak, p)
    await page.waitForTimeout(60)
}

console.log('musicState t0:', JSON.stringify(s1))
console.log('musicState t1:', JSON.stringify(s2))
console.log('step advanced:', s1.step !== s2.step, `(${s1.step} -> ${s2.step})`)
console.log('silence peak (attract):', silencePeak)
console.log('playing peaks:', peaks.join(' '))
console.log('max playing peak (0-128):', maxPeak)

const playing = s2.playing === true
const advancing = s1.step !== s2.step
// Needs a real signal above the silence baseline AND at least a couple of distinct
// voiced samples, so "the analyser is connected and notes are happening" is proven
// rather than one lucky frame. A dead engine (suspended ctx, stalled scheduler,
// disconnected analyser) reads 0 and still fails.
const voiced = peaks.filter(p => p > 0).length
const audible = maxPeak > silencePeak && maxPeak >= 1 && voiced >= 2
const pass = playing && advancing && audible
console.log('\nRESULT:', pass ? 'PASS — audio engine running + producing signal' : 'CHECK',
    { playing, advancing, audible, maxPeak, silencePeak, voiced })

await browser.close()
process.exit(pass ? 0 : 1)
