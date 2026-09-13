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
        args: ['--autoplay-policy=no-user-gesture-required'],
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
await page.keyboard.press('ArrowRight') // gesture -> start game -> intro
await page.waitForTimeout(2200)         // wait out intro -> play (music starts)

const s1 = await page.evaluate(() => window.__marioTest.musicState())
await page.waitForTimeout(600)
const s2 = await page.evaluate(() => window.__marioTest.musicState())

// Sample the analyser peak a few times to catch the waveform regardless of phase.
let maxPeak = 0
for (let i = 0; i < 8; i++) {
    const p = await page.evaluate(() => window.__marioTest.musicPeak())
    maxPeak = Math.max(maxPeak, p)
    await page.waitForTimeout(80)
}

console.log('musicState t0:', JSON.stringify(s1))
console.log('musicState t1:', JSON.stringify(s2))
console.log('step advanced:', s1.step !== s2.step, `(${s1.step} -> ${s2.step})`)
console.log('max analyser peak (0-128):', maxPeak)

const playing = s2.playing === true
const advancing = s1.step !== s2.step
const audible = maxPeak > 3
const pass = playing && advancing && audible
console.log('\nRESULT:', pass ? 'PASS — audio engine running + producing signal' : 'CHECK', { playing, advancing, audible })

await browser.close()
process.exit(pass ? 0 : 1)
