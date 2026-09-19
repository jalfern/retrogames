import { chromium } from '/Users/jon/Dev/retrogames/node_modules/playwright-core/index.mjs'
import { launch, openGame } from '../lib/harness.mjs'
const URL = 'http://localhost:5173/retrogames/raccoon-heist'
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: { width: 900, height: 620 } })
const api = (fn, ...a) => page.evaluate(fn, ...a)
await page.waitForTimeout(1500)
await api(() => window.__heistTest.goto('brief'))
await page.waitForTimeout(900)
const okp = await api(() => { const api = window.__heistTest; api.press(); api.goto('play'); return { press: typeof api.press, goto: typeof api.goto } })
console.log('hooks', JSON.stringify(okp))
await page.waitForTimeout(2000)
console.log(await api(() => {
    const e = window.__heistTest.engine()
    return { watchers: e.st?.watchers?.length, crew: e.st?.crew?.length, phase: e.st?.phase, free: typeof e.freeCam, crew0: !!e.activeCrew }
}))
trace2()
async function trace2() {
    console.log(await api(async () => {
        const e = window.__heistTest.engine()
        const c = e.activeCrew
        const w = window.__heistTest.watchers()[0]
        w.x = c.x + 2; w.z = c.z + 2; w.state = 'chase'
        const rows = []
        for (let i = 0; i < 60; i++) {
            e.update(1 / 60, { mx: 1, my: 0, crouch: false, dash: false, lookX: 0, lookY: 0, actions: [], hold: false })
            if (i % 30 === 0) rows.push([c.x.toFixed(2), c.z.toFixed(2), e.st.phase, 'guard@' + w.x.toFixed(1), 'd=' + Math.hypot(w.x - c.x, w.z - c.z).toFixed(1)])
        }
        return rows
    }))
}
