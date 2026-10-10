// SONAR ABYSS — Chrome plays the dark with NOTHING but real key/tap events.
//
//   npm run sonarplay     (needs `npm run dev`)
//
// The integrity of the reveal pipeline is proven in Node (sonarcheck); this is
// the other half: does the RENDERER actually obey "knowledge only, never
// truth"? The driver proves it in pixels: it finds a water cell the sim says
// is UNKOWNED, samples the canvas there, and demands darkness; it pings with a
// real Space press and demands the cell light up. It then swims a whole cave
// with the planner's arrows, descends, gets eaten by a rigged-but-real eel
// collision, and restarts — all through page.keyboard, the same events the
// virtual pad dispatches on a phone.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.SONAR_URL || 'http://localhost:5173/retrogames/sonar'
await requireDevServer(URL)

const r = new Report('sonarplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__sonarTest.probe())
const hint = () => page.evaluate(() => window.__sonarTest.hint())
const knownAt = (x, y) => page.evaluate(([x, y]) => window.__sonarTest.knownAt(x, y), [x, y])
const px = (x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-sonar-stage]')
    const d = c.getContext('2d').getImageData(x * 16 + 8, y * 16 + 8, 1, 1).data
    return (d[0] + d[1] + d[2]) / 3
}, [x, y])
const wait = ms => page.waitForTimeout(ms)
const tap = k => page.keyboard.press(k)
const swim = async (k) => { await page.keyboard.down(k); await wait(90); await page.keyboard.up(k); await wait(20) }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__sonarTest, null, { timeout: 25000 })
} catch {
    r.check('DEV hook exists', false, 'window.__sonarTest never appeared (dev server? /sonar route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1500)

// ---- attract: the proven route replays, honestly lit ----
let hid = 0
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    const t0 = a.t
    await wait(900)
    const b = await probe()
    r.check('the attract sim is live', b.t > t0, `t ${t0.toFixed(1)} -> ${b.t.toFixed(1)}`)
    for (let i = 0; i < 12; i++) {
        const s = await probe()
        if (s.hiddenEels > 0) hid++
        await wait(120)
    }
    r.check('dark eels exist on the attract screen (truth not drawn)', hid > 2, `hidden on ${hid}/12 samples`)
}

// ---- a real key starts a fresh run ----
await tap('KeyX')
await wait(400)
{
    const a = await probe()
    r.check('a real key starts a fresh seeded run', a.screen === 'play' && a.score === 0 && a.lives === 3 && a.pearls > 0, `screen=${a.screen} lives=${a.lives} pearls=${a.pearls} seed=${a.seed}`)
    const p0 = await px(a.player.x, a.vent.y)
    void p0
    const pp = await px(a.player.x, a.player.y)
    r.check('the diver is painted (not a black screen)', pp > 30, `mean=${pp.toFixed(1)} at player`)
}

// ---- the fog is real: an UNKNOWN cell is painted black ----
{
    let checks = 0, dark = 0
    const s = await probe()
    for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) {
        const x = s.player.x + dx, y = s.player.y + dy
        if (x < 1 || y < 1 || x > 47 || y > 25) continue
        if (await knownAt(x, y)) continue
        checks++
        const v = await px(x, y)
        if (v < 6) dark++
    }
    r.check('unknowing renders as darkness', checks >= 2 && dark === checks, `${dark}/${checks} unlit probes were black`)
}

// ---- Space pings, and the wavefront lights pixels ----
{
    const a = await probe()
    r.check('cooldown lets a fresh ping off the line', a.cooldown <= 1, `cooldown=${a.cooldown}`)
    await tap('Space')
    await wait(1000)
    const b = await probe()
    // the cooldown is WORLD time: a ~1 s real wait burns ~20 of the 30 ticks,
    // so "reloaded" means still >5 ticks cold AND the cave visibly lit up.
    r.check('a real SPACE ping reloaded the cooldown and lit the cave', b.cooldown > 5 && b.litOpen > a.litOpen + 50, `lit ${a.litOpen} -> ${b.litOpen}, cd=${b.cooldown}`)
    let lit = 0, tot = 0
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2]]) {
        const x = b.player.x + dx, y = b.player.y + dy
        if (!(await knownAt(x, y))) continue
        tot++
        if (await px(x, y) > 3) lit++
    }
    r.check('known cells near the diver are painted, not black', tot >= 2 && lit === tot, `${lit}/${tot}`)
}

// ---- swim the whole cave with the planner's arrows: pearls, score, descend ----
let descended = false
for (let i = 0; i < 900; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (s.depth >= 2) { descended = true; break }
    const h = await hint()
    if (h === 'PING') await tap('Space')
    else if (h) await swim(h)
    if (i % 40 === 39) await wait(60)
    else await wait(25)
}
{
    const s = await probe()
    r.check('real arrows + pings crossed the cave and DOWN the vent', descended, `depth=${s.screen === 'over' ? 'over' : s.depth} score=${s.score}`)
    r.check('pearls were collected on the way', s.score > 0, `score=${s.score}`)
}

// ---- a rigged approach, but the kill itself is the real sim colliding ----
{
    let a = await probe()
    if (a.screen !== 'play') {
        await tap('KeyJ'); await wait(500)
        a = await probe()
        if (a.screen !== 'play') { await tap('KeyK'); await wait(500) }
    }
    const b = await probe()
    r.info('eel rig', `screen=${b.screen} lives=${b.lives}`)
    const hops = await page.evaluate(() => window.__sonarTest.trailEel())
    r.check('the eel rig re-routed a patrol to the standing diver (setup only)', typeof hops === 'number' && hops >= 2, `route length ${hops}`)
    let hit = false
    for (let i = 0; i < 200; i++) {
        const s = await probe()
        if (s.screen === 'over' || s.lives < 3) { hit = true; break }
        await wait(60)
    }
    r.check('the eel reached and hit through the real collision loop', hit, `screen=${(await probe()).screen}`)
    for (let k = 0; k < 2; k++) {
        const s0 = await probe()
        if (s0.screen === 'over') break
        await page.evaluate(() => window.__sonarTest.trailEel())
        for (let i = 0; i < 200; i++) {
            const s = await probe()
            if (s.screen === 'over' || s.lives < s0.lives) break
            await wait(60)
        }
    }
    const o = await probe()
    r.check('a real run dies to eels and shows the ledger', o.screen === 'over', `screen=${o.screen}`)
    await wait(1000)
    await tap('KeyL')
    await wait(300)
    r.check('a key returns to attract', (await probe()).screen === 'attract')
    await tap('KeyM')
    await wait(400)
    {
        const p = await probe()
        r.check('another key starts a NEW run with a new seed', p.screen === 'play' && p.seed !== o.seed && p.lives === 3, `seed=${p.seed}`)
    }
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
