import { launch, requireDevServer } from './scripts/lib/harness.mjs'
const base = 'http://localhost:5173/retrogames/raccoon-heist'
await requireDevServer(base)
const soft = process.argv.includes('--soft')
const pw = await import('playwright-core')
const browser = await pw.default.chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--no-sandbox', ...(soft ? ['--disable-gpu'] : [])],
})
for (const [w, h] of [[900, 600], [800, 534], [640, 426], [512, 342], [420, 280]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    page.on('pageerror', e => console.log('   [pageerror]', e.message))
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__heistTest, null, { timeout: 30000 })
    await page.evaluate(() => { window.__f = 0; (function t(){ window.__f++; requestAnimationFrame(t) })() })
    await page.evaluate(() => window.__heistTest.press()); await page.waitForTimeout(500)
    await page.evaluate(() => window.__heistTest.press()); await page.waitForTimeout(1500)
    const a = await page.evaluate(() => ({ f: window.__f, w: performance.now() / 1000, t: window.__heistTest.engine().st.t }))
    await page.waitForTimeout(3000)
    const b = await page.evaluate(() => ({ f: window.__f, w: performance.now() / 1000, t: window.__heistTest.engine().st.t }))
    const fps = (b.f - a.f) / (b.w - a.w)
    const rate = (b.t - a.t) / (b.w - a.w)
    const info = await page.evaluate(() => window.__heistTest.info())
    console.log(`  ${String(w).padStart(4)}x${h}  ${fps.toFixed(1)} fps  ${rate.toFixed(2)}x world   ${info.calls} calls ${info.progs} progs  render ${info.frameMs} ms`)
    await page.close()
}
await browser.close()
