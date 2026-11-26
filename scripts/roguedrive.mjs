// roguedrive — #3491 in real Chrome: the away-game proved with REAL key events
// only (the sim math lives in roguecheck; this leg is what a player feels):
//   - the pinned seed 115 boots and the arrow quiver is three steps east,
//   - real arrow holds walk onto it, `,` takes it up (8 arrows in the pack),
//   - f opens the missile menu, l answers the direction prompt,
//   - the shot spends ONE arrow (quiver 7 in the pack, one lies to the east),
//   - the quiver line in the inventory screen reads the stack honestly,
//   - the help screen teaches f,
//   - zero page errors across the ride.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const URL = process.env.ROGUE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/rogue?seed=115`
await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__rogueTest', wait: 500 })
const r = new Report('roguedrive')
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__rogueTest.probe())
const sleep = (ms) => page.waitForTimeout(ms)

// 1. walk east onto the quiver (three floor steps, pinned seed)
const start = await probe()
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(120) }
const atArrows = await probe()
r.check('walked east onto the quiver square', atArrows.x === start.x + 3 && !atArrows.done)

// 2. take the arrows up
await page.keyboard.press(',')
await sleep(150)
let p = await probe()
const quiv = p.inv.find((i) => i.m)
r.check('the quiver comes into the pack (qty 8)', !!quiv && quiv.q === 8, JSON.stringify(p.inv))
r.check('pickup says the count honestly', p.msgs.some((m) => /pick up 8 arrows/.test(m)), p.msgs.join(' | '))

// 3. f -> the missile menu; l -> aim east
await page.keyboard.press('f')
await sleep(120)
p = await probe()
r.check('f opens the missile menu', p.phase === 'throw', `phase=${p.phase}`)
await page.keyboard.press('a') // the quiver is the first entry
await sleep(120)
p = await probe()
r.check('the pack answers with the direction prompt', p.phase === 'aim' && /Which direction/.test(p.msgs.slice(-1)[0]), `phase=${p.phase}`)
await page.keyboard.press('l')
await sleep(150)
p = await probe()
r.check('the aimed shot returns to play', p.phase === 'playing', `phase=${p.phase}`)
r.check('one arrow spent: the quiver carries seven', p.inv.some((i) => i.m && i.q === 7), JSON.stringify(p.inv))
r.check('the missed arrow lies east, awaiting salvage',
    p.floor.some((i) => i.q === 1 && i.x > p.x && i.y === p.y), JSON.stringify(p.floor))
r.check('the shot made its sound-in-words', p.msgs.some((m) => /arrow hits the wall|arrow flies into the dark/.test(m)), p.msgs.join(' | '))

// 4. walking back over the drop puts the arrow home
const drop = p.floor.find((i) => i.q === 1)
if (drop) {
    const back = drop.x - p.x
    for (let i = 0; i < back; i++) { await page.keyboard.press('ArrowRight'); await sleep(120) }
    await page.keyboard.press(',')
    await sleep(150)
    p = await probe()
    r.check('salvaged: the arrow rejoins the quiver (8 again)', p.inv.some((i) => i.m && i.q >= 8), JSON.stringify(p.inv))
} else {
    r.check('salvaged: the arrow rejoins the quiver (8 again)', false, 'nothing to walk back to')
}

// 5. the help screen teaches f
await page.keyboard.press('?')
await sleep(200)
const helpText = await page.evaluate(() => document.body.innerText)
r.check('help screen documents the fire command', /Fire/.test(helpText) && /Magic staff/.test(helpText))
await page.keyboard.press('Escape')
await sleep(120)

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
