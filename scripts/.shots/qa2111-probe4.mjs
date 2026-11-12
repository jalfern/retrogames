// #2111 fast repro: fresh 1-3 as Fire Mario, 8ms trace cols 16..44 for the next session.
import { openMario, launch, requireDevServer, URL_DEFAULT } from '../lib/harness.mjs'
await requireDevServer(URL_DEFAULT)
const browser = await launch()
const page = await openMario(browser, { url: URL_DEFAULT })
await page.evaluate(() => { window.__marioTest.gotoLevel(1); window.__marioTest.setPower('fire'); window.__marioTest.autoplay() })
const rows = []
const t0 = Date.now()
while ((Date.now() - t0) / 1000 < 90) {
    const s = await page.evaluate(() => window.__marioTest.getState())
    rows.push([s.level, s.col, Math.round(s.x), Math.round(s.y), s.h, s.power, s.lives, s.state].join(','))
    if (s.state === 'gameover' || (s.level === '1-4')) break
    await page.waitForTimeout(8)
}
const { writeFileSync } = await import('node:fs')
writeFileSync('scripts/.shots/qa2111-fast.csv', rows.join('\n') + '\n')
// dedup print cols 16..44
const seen = new Set()
for (const r of rows) {
    const f = r.split(',')
    if (f[0] !== '1-3' || +f[1] < 16 || +f[1] > 44) continue
    const k = f[1] + '|' + f[2] + '|' + f[6] + '|' + f[7]
    if (seen.has(k)) continue; seen.add(k)
    console.log(r)
}
await browser.close()
