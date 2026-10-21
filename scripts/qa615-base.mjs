// throwaway: read joint frames in stand (Idle base) and grab with ZERO offs (Jump_Idle base)
import { launch, requireDevServer } from './lib/harness.mjs'
const URL = `http://localhost:${process.env.DEV_PORT || 5174}/retrogames/ssx?lite=1`
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1400)
const pressQ = async () => { await page.keyboard.down('Shift'); await page.keyboard.press('Slash'); await page.keyboard.up('Shift') }
await pressQ(); await page.waitForTimeout(400)

const settle = async () => {
    let prev = null
    for (let i = 0; i < 30; i++) {
        const s = await page.evaluate(() => JSON.stringify(window.__ssxTest.joints()))
        if (prev === s) return
        prev = s
        await page.waitForTimeout(250)
    }
}

// add head to joints list at runtime
await page.evaluate(() => {
    const orig = window.__ssxTest.joints
    window.__ssxTest.joints = () => {
        const j = orig()
        if (j) {
            const rig = null
            return j
        }
        return j
    }
})

await page.evaluate(() => window.__ssxTest.setPose('stand'))
await settle()
console.log('STAND:', JSON.stringify(await page.evaluate(() => window.__ssxTest.joints())))

await page.evaluate(() => {
    // strip ALL grab offsets: keep only the air base + stance
    const rig = window.__ssxTest
    rig.retune('grab', {})
})
await page.evaluate(() => window.__ssxTest.setPose('grab'))
await settle()
console.log('GRAB-BASE (no offs):', JSON.stringify(await page.evaluate(() => window.__ssxTest.joints())))

await page.evaluate(() => window.__ssxTest.setPose(null))
await pressQ()
await browser.close()
