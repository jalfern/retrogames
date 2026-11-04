// #1506 browser proof: load the demo page over the dev server, real clicks only.
// Asserts: zero page/console errors, verdict leads with the plain answer, the six-row
// holdout table renders, a drill-down opens on click, and the superseded block toggles.
import { chromium } from 'playwright-core'
const url = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/weightsurgery.html`
const errs = []
async function launch() {
  const tries = [
    { channel: 'chrome' },
    { channel: 'chrome', args: ['--single-process'] },
    {}, // playwright headless shell — boots where full Chrome dies (#737-class nodes)
  ]
  for (const t of tries) {
    try {
      return await chromium.launch({ ...t, headless: true, args: [...(t.args || []), '--disable-background-timer-throttling', '--no-sandbox', '--disable-dev-shm-usage'] })
    } catch { /* next */ }
  }
  throw new Error('no browser channel could launch')
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 420, height: 820 }, hasTouch: true }) // phone viewport first
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
let fails = 0
const ok = (cond, name, detail = '') => {
  if (cond) console.log('  ok   ' + name)
  else { fails++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')) }
}
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(400)
ok(await page.locator('#verdictfair').isVisible(), 'verdict heading visible on load (phone)')
const lead = (await page.locator('#verdictlead').innerText()).replace(/\s+/g, ' ')
ok(/did not fix it/.test(lead) && /5\.0% → 20\.0%/.test(lead), 'plain-answer lead renders', lead.slice(0, 90))
ok(await page.locator('#verdictfairtbl tr').count() === 4, 'verdict table: header + base/penalty/edit rows')
ok(await page.locator('#h-k256_gsm, #h-edit_gsm').count() === 1, 'k256 gsm row present')
ok(!(await page.content()).includes('Loading model'), 'no banner contamination in rendered DOM')
const bugBox = await page.locator('h2:has-text("THE BUG")').boundingBox()
const verdBox = await page.locator('#verdictfair').boundingBox()
ok(verdBox && bugBox && verdBox.y < bugBox.y, 'verdict is above the story (leads)')
// tap the first drill-down summary — per-problem excerpts must open
await page.locator('details.dd summary').first().tap()
await page.waitForTimeout(200)
ok(await page.locator('details.dd').first().evaluate(d => d.open), 'tap opens per-problem drill-down')
ok((await page.locator('details.dd').first().locator('.ddp1').count()) === 10, 'drill-down shows 10 problems')
// superseded first-pass block toggles open on tap
await page.locator('details.fn summary:has-text("SUPERSEDED")').tap()
await page.waitForTimeout(150)
ok(await page.locator('details.fn').filter({ hasText: 'SUPERSEDED' }).first().evaluate(d => d.open), 'superseded first-pass verdict opens on tap')
// heat readout tap still works
await page.locator('#heat .cells i').first().tap()
await page.waitForTimeout(100)
ok((await page.locator('#heatreadout').innerText()).includes('layer'), 'heat-bar tap readout still works')
// desktop re-check of the table numbers
await page.setViewportSize({ width: 1280, height: 900 })
await page.waitForTimeout(200)
const vbase = (await page.locator('#v-base').innerText()).replace(/\s+/g, ' ')
ok(/4\.0%.*≥70\.0%.*4\.0%.*11\.0%.*≥15\.0%.*5\.0%/.test(vbase), 'verdict table numbers (base row)', vbase)
const ved = (await page.locator('#v-edit').innerText()).replace(/\s+/g, ' ')
ok(/8\.0%.*≥67\.0%.*2\.0%.*11\.0%.*≥12\.0%.*20\.0%/.test(ved), 'verdict table numbers (k256 row)', ved)
await page.screenshot({ path: '/tmp/forge/ws-1506.png', fullPage: false })
ok(errs.length === 0, 'zero page/console errors', errs.join(' | '))
await browser.close()
console.log(`\nwsplay(#1506): ${fails ? "FAILED" : "all checks passed"}, ${fails} failed`)
process.exit(fails ? 1 : 0)
