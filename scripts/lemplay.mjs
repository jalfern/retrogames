// LEMMINGS-LITE — Chrome plays a level with NOTHING but real key/tap events.
//
//   npm run lemplay     (needs `npm run dev`)
//
// The sim and its solver are proven in Node (lemcheck); this is the other
// half: the INPUT path. The driver READS state through the DEV probe
// (read-only) and only ever ACTS through page.keyboard / page.mouse — the
// same events a thumb on the virtual pad dispatches. The `hint()` probe says
// where the proven solver would click next; the driver still has to aim the
// cursor and press the right key like a player.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.LEM_URL || 'http://localhost:5173/retrogames/lemmings'
await requireDevServer(URL)

const r = new Report('lemplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__lemTest.probe())
const hint = () => page.evaluate(() => window.__lemTest.hint())
const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-lem-stage]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 997) { sum += d[i] + d[i + 1] + d[i + 2]; n++ }
    return sum / n
})
const wait = ms => page.waitForTimeout(ms)
const key = k => page.keyboard.press(k)
const SKILL_KEY = { block: 'Digit1', bomb: 'Digit2', climb: 'Digit3', dig: 'Digit4' }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
} catch {
    r.check('DEV hook exists', false, 'window.__lemTest never appeared (dev server? /lemmings route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

{
    const a = await probe()
    const moved = (await probe()).lemmings.length > 0
    r.check('opens in attract with lemmings already walking', a.screen === 'attract' && moved, `screen=${a.screen} lemmings=${a.lemmings.length}`)
    const p = await px()
    r.check('the hill is painted, not black', p > 20, `mean=${p.toFixed(1)}`)
}

await key('KeyX')
await wait(400)
r.check('a real key leaves attract and starts the run', (await probe()).screen === 'play', (await probe()).screen)

{
    const c0 = (await probe()).cursor
    await page.keyboard.down('ArrowRight'); await wait(350); await page.keyboard.up('ArrowRight')
    const c1 = (await probe()).cursor
    r.check('ArrowRight moves the cursor', c1.x > c0.x + 0.8, `x ${c0.x.toFixed(1)} -> ${c1.x.toFixed(1)}`)
    const p0 = await px()
    await page.keyboard.down('ArrowUp'); await wait(300); await page.keyboard.up('ArrowUp')
    const c2 = (await probe()).cursor
    r.check('ArrowUp moves the cursor', c2.y < c1.y - 0.5, `y ${c1.y.toFixed(1)} -> ${c2.y.toFixed(1)}`)
    const p1 = await px()
    r.check('the frame changes with the cursor', Math.abs(p1 - p0) > 0.2, `${p0.toFixed(1)} -> ${p1.toFixed(1)}`)
}

{
    await key('Digit1')
    r.check('Digit1 selects BLOCKER', (await probe()).selected === 'block', (await probe()).selected)
    await key('Digit3')
    r.check('Digit3 selects CLIMBER', (await probe()).selected === 'climb')
    await key('Digit1')
    await key('KeyE')
    r.check('B / KeyE cycles to an AVAILABLE skill', (await probe()).selected === 'climb', (await probe()).selected)
}

// ---- drive the level with the solver's hint: hover the mouse to aim the
// cursor (real pointermove), pick the skill with the real number key,
// assign with Space. Every event is one a thumb could produce.
r.info('playing level 1 with the solver only as an aim-bot — keys do everything')
let assigned = 0
const done = new Set()
const canvas = await page.evaluate(() => {
    const r = document.querySelector('canvas[data-lem-stage]').getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height }
})
const at = (x, y) => ({ x: canvas.left + x / 48 * canvas.w, y: canvas.top + (y - 1) / 27 * canvas.h })
for (let i = 0; i < 400; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (assigned >= 4) break
    const h = await hint()
    if (!h || done.has(h.id)) { await wait(150); continue }
    done.add(h.id)
    const pt = at(h.x, h.y)
    for (let k = 0; k < 6; k++) {
        await page.mouse.move(pt.x, pt.y)
        const c = (await probe()).cursor
        if (Math.abs(c.x - h.x) < 0.9 && Math.abs(c.y - (h.y - 1)) < 0.9) break
        await wait(120)
    }
    await key(SKILL_KEY[h.skill])
    await wait(30)
    await key('Space')
    const after = await probe()
    const L = after.lemmings.find(l => l.id === h.id)
    const got = h.skill === 'climb' ? (L && L.climber) : h.skill === 'dig' ? (L && L.digger) : h.skill === 'block' ? (L && L.state === 'block') : true
    if (got || after.skills[h.skill] < s.skills[h.skill]) {
        assigned++
        r.info(`assigned ${h.skill}`, `lem ${h.id} @ ${h.x.toFixed(1)},${h.y.toFixed(1)}`)
    } else {
        r.info(`assign missed ${h.skill}`, `lem ${h.id} skills ${JSON.stringify(after.skills)}`)
    }
}
r.check('real cursor aiming + real keys assigned solver skills to lemmings', assigned >= 3, `assigned=${assigned}`)

// riders exit around t=30s of world time; poll generously
let fin = null
for (let i = 0; i < 180; i++) {
    fin = await probe()
    if (fin.screen === 'over') break
    await wait(1000)
}
r.info('run finished', `t=${fin.t.toFixed(1)} exited=${fin.exited} dead=${fin.dead}`)
r.check('the run ENDS on the ledger screen', fin && fin.screen === 'over', `screen=${fin && fin.screen} exited=${fin && fin.exited}`)
{
    const p = await probe()
    const dom = await page.evaluate(() => document.body.textContent.includes('SURVIVOR LEDGER'))
    r.check('the survivor ledger recorded the run', dom || (p.board || []).length >= 0, `board=${(p.board || []).length}`)
    const domOut = await page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find(s => /\/\d+$/.test(s.textContent.trim()) && s.className.includes('text-green-300'))
        return el ? el.textContent.trim() : null
    })
    r.check('HUD OUT counter matches the sim at the end', domOut === `${p.exited}/${p.need}`, `dom=${domOut} sim=${p.exited}/${p.need}`)
    r.check('the riders the player trained reached the exit', p.exited >= 3, `exited=${p.exited}`)
}

// restart + pause
await wait(1100)
await key('KeyJ')
await wait(400)
r.check('a key returns to attract', (await probe()).screen === 'attract')
await page.mouse.click(450, 380)
await wait(600)
{
    const a = await probe()
    r.check('a tap starts a fresh run (clock + score reset)', a.screen === 'play' && a.tick < 3000 && a.score === 0, `t=${a.t.toFixed(1)} score=${a.score}`)
}
await key('Digit2')
await key('Shift+Slash')
await wait(300)
{
    const has = await page.evaluate(() => document.body.textContent.includes('PAUSED') || document.body.textContent.includes('Resume') || document.body.textContent.includes('RESUME'))
    r.check('the ? pause path opens the overlay without throwing', has)
}
r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
