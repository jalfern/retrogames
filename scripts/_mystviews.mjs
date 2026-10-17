// TEMP audit driver (deleted before ship): prints the per-node views() audit.
import { launch, openGame } from './lib/harness.mjs'
const URL = process.env.MYST_URL || 'http://localhost:5174/retrogames/myst'
const browser = await launch({ headless: true })
const page = await openGame(browser, { url: URL, hook: '__mystTest', start: false, viewport: { width: 960, height: 540 } })
const v = await page.evaluate(() => window.__mystTest.views())
for (const [id, r] of Object.entries(v)) {
  const flag = r.pass ? 'ok  ' : 'FAIL'
  console.log(`${flag} ${id.padEnd(12)} buried=${r.buried}(${r.buriedMesh || '-'}) maxFrac=${r.maxFrac} dom=${r.dominant || '-'} landmark=${r.landmarkSeen ? 'seen' : 'MISSING'} expect=[${r.expect}]`)
}
await browser.close()
process.exit(0)
