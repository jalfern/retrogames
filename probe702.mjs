import { chromium } from 'playwright-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const b = await chromium.launch({ executablePath: CHROME, args: ['--enable-unsafe-swiftshader', '--use-angle=metal'] })
const p = await b.newPage()
p.on('console', m => console.log('[console]', m.type(), m.text()))
p.on('pageerror', e => console.log('[pageerror]', e.message))
await p.addInitScript(() => {
  const orig = GPU.prototype.requestAdapter
  GPU.prototype.requestAdapter = async function (...a) {
    const ad = await orig.apply(this, a)
    const od = ad.requestDevice.bind(ad)
    ad.requestDevice = async (...d) => { const dev = await od(...d); dev.addEventListener('uncapturederror', e => console.log('[uncaptured]', e.error.message)); return dev }
    return ad
  }
})
await p.goto('file://' + process.argv[2], { waitUntil: 'load' })
await p.waitForFunction(() => window.__shoreTest && window.__shoreTest.ready, null, { timeout: 30000 }).catch(e => console.log('NO READY', e.message))
await p.waitForTimeout(6000)
console.log('state', JSON.stringify(await p.evaluate(() => ({ f: window.__shoreTest.frames, dt: window.__shoreTest.dtSense(), perf: window.__shoreTest.perf(), sw: window.__shoreTest.swashMean(), px: window.__shoreTest.probe() ? window.__shoreTest.probe().length : null }))))
await b.close()
