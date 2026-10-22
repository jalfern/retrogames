import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=metal'] })
const p = await b.newPage()
await p.goto('file://' + process.argv[2], { waitUntil: 'load' })
await p.waitForFunction(() => window.__shoreTest?.ready, null, { timeout: 30000 })
for (let i = 0; i < 120; i++) { const s = await p.evaluate(() => window.__shoreTest.swashMean()); process.stdout.write(s.run.toFixed(2) + ' '); await p.waitForTimeout(150) }
console.log()
await b.close()
