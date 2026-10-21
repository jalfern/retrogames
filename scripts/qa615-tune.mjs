// throwaway: re-aim OFFS.grab so the reaching hand lands on the nose-edge band
// usage: node scripts/qa615-tune.mjs '<json: array of full OFFS.grab tables>'
import { launch, requireDevServer } from './lib/harness.mjs'

const URL = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5174}/retrogames/ssx?lite=1`
const cands = JSON.parse(process.argv[2] || '[]')
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1400)
const pressQ = async () => {
    await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift')
}
await pressQ()
await page.waitForTimeout(400)
await page.evaluate(() => window.__ssxTest.setPose('grab'))
await page.waitForTimeout(2500)

const settle = async () => {
    let prev = null
    for (let i = 0; i < 30; i++) {
        const s = await page.evaluate(() => {
            const g = window.__ssxTest.grabReach()
            return JSON.stringify([g.l?.hand, g.r?.hand])
        })
        if (prev === s) return
        prev = s
        await page.waitForTimeout(250)
    }
}

const readAll = () => page.evaluate(() => ({
    j: window.__ssxTest.joints(),
    g: window.__ssxTest.grabReach(),
    b: window.__ssxTest.bootClear(),
}))

if (cands.length === 0) {
    const s = await readAll()
    console.log(JSON.stringify(s))
} else {
    for (const [i, t] of cands.entries()) {
        await page.evaluate((t) => window.__ssxTest.retune('grab', t), t)
        await settle()
        const s = await readAll()
        console.log(`c${i}`, JSON.stringify(s))
    }
}
await page.evaluate(() => window.__ssxTest.setPose(null))
await pressQ()
await browser.close()
