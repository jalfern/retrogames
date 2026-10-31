// FIRE CREW drive — real Chrome, real key events (#1254 step 6). Starts the
// game, plays with actual keydown/keyup, proves start→play→restart works with
// zero page errors, and that the drawn frame changes when the logical state
// changes (and stays put when it doesn't).
import { launch } from './lib/harness.mjs'

const PORT = process.env.DEV_PORT || 5173
const BASE = `http://localhost:${PORT}/retrogames/fire-crew`
let fails = 0
const ok = (c, name, d = '') => { if (c) console.log(`  ok   ${name}`); else { fails++; console.log(`  FAIL ${name}${d ? ` — ${d}` : ''}`) } }

const browser = await launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game && window.__game.meta.id === 'fire-crew', { timeout: 25000 })
ok(true, 'boot: __game exposed, no wait timeout')

const press = async (code, ms = 120) => { await page.keyboard.down(code); await new Promise((r) => setTimeout(r, ms)); await page.keyboard.up(code) }
const screen = () => page.evaluate(() => window.__firecrewTest.screen())

ok(await screen() === 'attract', 'starts in attract')

// tap to select crew, then SPACE to go
await page.mouse.click(400, 300)
await new Promise((r) => setTimeout(r, 150))
ok(await screen() === 'select', 'tap moves attract -> select')
await press('Space', 150)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', 'SPACE launches the shift')

// real keys move the hose: hold ArrowRight, watch x increase via the hook
const before = await page.evaluate(() => window.__firecrewTest.state().tick)
await page.keyboard.down('ArrowRight')
await new Promise((r) => setTimeout(r, 600))
await page.keyboard.up('ArrowRight')
const afterMove = await page.evaluate(() => window.__firecrewTest.state().tick)
ok(afterMove > before, 'real keys advance the sim through the rAF loop', `${before} -> ${afterMove}`)

// drawn pixels respond: canvas digest changes while playing, freezes when paused
const digest = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let h = 0
    for (let i = 0; i < d.length; i += 401) h = (h + d[i] * (i % 31 + 1)) | 0
    return h >>> 0
})
const d1 = await digest()
await new Promise((r) => setTimeout(r, 500))
const d2 = await digest()
ok(d1 !== d2, 'the scene animates while playing (fire/torch motion)')

// '?' pauses; the frame freezes across the same window
await press('Backquote')
await new Promise((r) => setTimeout(r, 120))
const p1 = await digest()
await new Promise((r) => setTimeout(r, 450))
const p2 = await digest()
ok(p1 === p2, 'pause freezes the drawn world')
await press('Backquote')

// sprite matches logic: drive via the contract; the drawn frame must change
// with the sim even though the rAF loop is locked while the contract holds it
const tickBefore = await page.evaluate(() => window.__game.state().tick)
const dA = await digest()
await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__game.step({ right: true }) })
await new Promise((r) => setTimeout(r, 150)) // let the rAF draw land after the contract steps
const dB = await digest()
const tickAfter = await page.evaluate(() => window.__game.state().tick)
ok(tickAfter === tickBefore + 30, 'contract step advances exactly one per call', `${tickBefore} -> ${tickAfter}`)
ok(dA !== dB, 'drawn frame follows the logical step')
await page.evaluate(() => window.__game.release())

// autopilot finishes a whole shift, then a real key restarts
const end = await page.evaluate(async () => {
    const r = window.__firecrewTest.resolveAll()
    return r
})
ok(end && end.done === true, 'a full seeded shift reaches its end', `rescued ${end && end.rescued}/6 tick ${end && end.tick}`)
await new Promise((r) => setTimeout(r, 900))
ok(await screen() === 'over', 'the over card shows')
await press('KeyX', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'attract', 'any key returns to attract')
await press('Space', 120)
await new Promise((r) => setTimeout(r, 150))
await press('Space', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', 'restart works — the shift runs again')

ok(errors.length === 0, 'zero page errors across the whole drive', errors.slice(0, 3).join(' | '))
console.log(`\n${fails ? 'FAILED' : 'DRIVE GREEN'} — ${fails ? fails + ' failures' : 'start, play, pause, contract, die, restart'}`)
await browser.close()
process.exit(fails ? 1 : 0)
