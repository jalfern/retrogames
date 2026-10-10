// BOULDER DASH — Chrome plays a cave with NOTHING but real key/tap events.
//
//   npm run dashplay     (needs `npm run dev`)
//
// The caves and their engine rules are proven in Node (dashcheck); this is the
// other half: the INPUT path and the render loop. The driver READS state
// through the DEV probe (read-only) and only ever ACTS through page.keyboard /
// page.mouse — the same events a thumb on the virtual pad dispatches. The
// `hint()` probe says which arrow the proven planner would press next; the
// driver still has to send a real arrow key for it to move. It then proves the
// win, the crush-death (the CA, not a scripted flag), and the restart.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.DASH_URL || 'http://localhost:5173/retrogames/boulder-dash'
await requireDevServer(URL)

const r = new Report('dashplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__dashTest.probe())
const hint = () => page.evaluate(() => window.__dashTest.hint())
const crush = () => page.evaluate(() => window.__dashTest.crush())
const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-dash-stage]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 997) { sum += d[i] + d[i + 1] + d[i + 2]; n++ }
    return sum / n
})
const wait = ms => page.waitForTimeout(ms)
const key = k => page.keyboard.press(k)

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__dashTest, null, { timeout: 25000 })
} catch {
    r.check('DEV hook exists', false, 'window.__dashTest never appeared (dev server? /boulder-dash route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

// ---- attract: the proven route is already playing itself ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    const gemsUpfront = a.gems
    const p = await px()
    r.check('the cave is painted, not black', p > 25, `mean=${p.toFixed(1)}`)
    const t0 = a.t
    await wait(700)
    const b = await probe()
    r.check('the attract sim is live (clock + gems moving)', b.t > t0 || b.have > a.have, `t ${t0.toFixed(1)} -> ${b.t.toFixed(1)} have ${a.have}->${b.have}`)
    r.info('attract cave', `${a.name}: ${gemsUpfront} gems on the board`)
}

// ---- a real key leaves attract and starts a clean run ----
await key('KeyX')
await wait(300)
{
    const a = await probe()
    r.check('a real key starts the run fresh (score + gems reset)', a.screen === 'play' && a.score === 0 && a.have === 0, `screen=${a.screen} score=${a.score} have=${a.have}`)
}

// ---- real arrows dig and move the digger; the painted frame follows ----
{
    const before = await probe()
    const p0 = await px()
    const dir = await hint()
    await key(dir || 'ArrowRight')
    await wait(160)
    const after = await probe()
    const moved = after.player.x !== before.player.x || after.player.y !== before.player.y
    r.check('a real arrow moves the digger one cell', moved, `(${before.player.x},${before.player.y}) -> (${after.player.x},${after.player.y}) [${dir}]`)
    const p1 = await px()
    r.check('the frame changes with the move', Math.abs(p1 - p0) > 0.05, `${p0.toFixed(1)} -> ${p1.toFixed(1)}`)
}

// ---- collect the quota: the driver presses the planner's arrows; gems drop off the board ----
const gems0 = (await probe()).gems
const need0 = (await probe()).need
r.info('digging for the quota', `need ${need0} gems, ${gems0} on the board`)
let assignedTries = 0
for (let i = 0; i < 1600; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (s.have >= s.need) break
    const d = await hint()
    if (!d) { await wait(120); continue }
    await key(d)
    assignedTries++
    await wait(55)
}
{
    const s = await probe()
    r.check('real arrows gathered the gem quota', s.have >= s.need, `have ${s.have}/${s.need} over ${assignedTries} arrow presses`)
    r.check('the board visibly lost the gems it collected', s.gems < gems0, `gems ${gems0} -> ${s.gems}`)
    r.check('score tracked the gems (score > 0)', s.score > 0, `score=${s.score}`)
}

// ---- reach the exit, still with real arrows only ----
let reached = null
for (let i = 0; i < 1200; i++) {
    const s = await probe()
    if (s.screen !== 'play') { reached = s; break }
    const d = await hint()
    if (d) await key(d)
    await wait(55)
}
reached = reached || await probe()
r.check('the run ENDS on the ledger (exit reached, quota met)', reached.screen === 'over' && reached.win, `screen=${reached.screen} win=${reached.win} have=${reached.have}/${reached.need}`)
{
    const s = await probe()
    const dom = await page.evaluate(() => document.body.textContent.includes('DEEP DIGGERS'))
    r.check('the scoreboard rendered the finished run', dom, `board=${(s.board || []).length}`)
    const domGems = await page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find(x => /\/\d+$/.test(x.textContent.trim()) && x.className.includes('text-cyan-300'))
        return el ? el.textContent.trim() : null
    })
    r.check('HUD GEM counter matches the sim at the end', domGems === `${s.have}/${s.need}`, `dom=${domGems} sim=${s.have}/${s.need}`)
}

// ---- restart, then get crushed for real and restart again ----
await wait(1200)
await key('KeyJ')
await wait(400)
r.check('a key returns to attract', (await probe()).screen === 'attract')
await key('KeyK')
await wait(300)
r.check('another key starts a fresh play (clock reset)', (await probe()).screen === 'play' && (await probe()).tick < 400)
{
    const cr = await crush()
    r.check('the crush rig loosened a boulder (setup only)', cr === true, `crush()=${cr}`)
    let dead = null
    for (let i = 0; i < 40; i++) {
        const s = await probe()
        if (s.screen === 'over' || !s.player.alive) { dead = s; break }
        await wait(120)
    }
    r.check('a falling boulder crushed the digger (real CA death -> over screen)', dead && dead.screen === 'over', `screen=${dead && dead.screen} alive=${dead && dead.player.alive}`)
    await wait(1100)
    await key('KeyL')
    await wait(300)
    r.check('a real key restarts after death', (await probe()).screen === 'attract')
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
