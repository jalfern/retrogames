// TEN-DEEP — Chrome plays the Deep with NOTHING but real key events, and the
// claims the Node harness cannot see are graded in PIXELS:
//
//   npm run tendeepplay     (needs `npm run dev`)
//
//   1. THE DEMO IS ALIVE — the proven solver walks a real tab.
//   2. THE INPUT PATH — arrows walk/turn; the automap cursor is painted at
//      the cell the sim says the party stands on.
//   3. THE VIEW MATCHES THE GRID — wall at one pace paints the centre
//      wall-blue; a clear hall leaves it dark.
//   4. THE AMBUSH — walking a real step into a named tile starts combat.
//   5. COMBAT PIXELS AND LEDGER — a live mob has its art on screen where the
//      projection says; swings are booked; the kill ends the fight.
//   6. THE STAIRS — real SPACE descends.
//   7. DEATH, THE OVER SCREEN, ONE KEY BACK.
//   8. ? pauses. Zero page errors throughout.
// Reachability, the ledger pins, slack and determinism live in tendeepcheck (Node).

import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.DEEP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/ten-deep`
await requireDevServer(URL)

const r = new Report('tendeepplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 700, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__deepTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const tap = async (key, times = 1) => {
    for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(90) }
}
const setup = (o) => page.evaluate((x) => window.__deepTest.setup(x), o)
const ensureSetup = async (o) => {
    for (let i = 0; i < 8; i++) {
        if (await setup(o)) return true
        await wait(300)
    }
    return false
}
const waitEv = async (pred, tries = 160) => {
    for (let i = 0; i < tries; i++) {
        const s = await probe()
        const ev = s.evLog.find(pred)
        if (ev) return ev
        await wait(60)
    }
    return null
}
const px = (x, y, w, h, sel, filter) => page.evaluate(([sx, sy, sw, sh, slct, flt]) => {
    const cv = document.querySelector(slct)
    void flt
    const d = cv.getContext('2d').getImageData(sx, sy, sw, sh).data
    let n = 0
    const f = eval('(' + flt + ')')
    for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++
    return n
}, [x, y, w, h, sel, filter.toString()])

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__deepTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__deepTest never appeared (dev server? /ten-deep route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(900)

// ---- 1. attract: the Node-proven solver walks a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let grew = false
    const t0 = a.tick
    let sawCombat = false
    for (let i = 0; i < 40; i++) {
        const s = await probe()
        grew = grew || s.tick > t0 + 8   // the demo acts on a 170 ms heartbeat, not per frame
        sawCombat = sawCombat || s.mode === 'combat'
        if (grew && sawCombat) break
        await wait(150)
    }
    const after = await probe()
    r.check('the solver demo is live (ticks advance)', grew, `tick ${t0} -> ${after.tick}`)
    r.check('the demo actually fights (ambushes fire)', sawCombat || after.evLog.some((e) => e.type === 'slay'), `explored=${after.explored}`)
}

// ---- 2. a real key starts the crawl; arrows walk; automap tracks the sim ----
await page.keyboard.press('KeyZ')
await wait(300)
let s = await probe()
r.check('any key starts the crawl', s.screen === 'play' && s.mode === 'map', `screen=${s.screen} mode=${s.mode}`)
{
    const a = await probe()
    await tap('ArrowUp', 2)
    const b = await probe()
    r.check('ARROW UP walks forward', b.x !== a.x || b.y !== a.y, `(${a.x},${a.y}) -> (${b.x},${b.y})`)
    await tap('ArrowRight')
    const c = await probe()
    r.check('ARROW RIGHT turns', c.dir === (a.dir + 1) % 4, `dir ${a.dir} -> ${c.dir}`)
    // automap: the amber cursor sits on the SIM cell
    const [mx, my] = [c.x * 5, c.y * 5]
    const amber = await px(mx, my, 5, 5, 'canvas[data-deep-map]', (R, G, B) => R > 200 && G > 170 && B < 130)
    r.check('the automap paints the party where the sim says', amber >= 18, `cell (${c.x},${c.y}) amber=${amber}/25`)
}

// ---- 3. the wireframe matches the grid: wall near = blue centre, hall = dark ----
{
    // find a pose with a wall at one pace: turn around until view says so
    let wallSeen = -1
    for (let t = 0; t < 4 && wallSeen !== 1; t++) {
        wallSeen = (await probe()).view.wallDist
        if (wallSeen !== 1) await tap('ArrowRight')
    }
    r.check('driver found a wall-ahead pose', wallSeen === 1, `wallDist=${wallSeen}`)
    const blue = await px(126, 30, 5, 140, 'canvas[data-wiz-view]', (R, G, B) => B > 90 && B > R + 30)
    r.check('a wall at one pace paints the view wall-blue', blue > 40, `blue px in centre column=${blue}`)
    // wall-follow until the sightline is open 5+ paces with nothing on the
    // floor (springs/stairs/pots also light the centre column — the pose must
    // be clean for the dark-centre claim to mean anything)
    for (let t = 0; t < 40; t++) {
        const p = await probe()
        if (p.mode !== 'map') break
        if (p.view.wallDist >= 5 && !p.view.pots && !p.view.springs && !p.view.stairs) break
        await page.keyboard.press(p.view.wallDist <= 2 ? 'ArrowRight' : 'ArrowUp')
        await wait(80)
    }
    const p2 = await probe()
    r.check('driver reached a clear long hall', p2.view.wallDist >= 5 && !p2.view.pots && !p2.view.springs && !p2.view.stairs, `wallDist=${p2.view.wallDist} pot=${p2.view.pots} spring=${p2.view.springs} stairs=${p2.view.stairs}`)
    const blueFar = await px(126, 30, 5, 140, 'canvas[data-wiz-view]', (R, G, B) => B > 90 && B > R + 30)
    r.check('a clear hall leaves the centre dark — the view is the grid', blueFar <= 10, `blue px=${blueFar} (wall pose had ${blue})`)
}

// ---- 4. the ambush: one real step into the named tile ----
// walk with real keys like a person in a dark corridor: forward while the
// hall is open, right at every wall, until an ambush lands. The ambush
// tiles are deliberately NOT exposed to the driver — no cheating a fight.
let ambush = null
for (let stepN = 0; stepN < 130 && !ambush; stepN++) {
    const p = await probe()
    if (p.mode === 'combat') { ambush = p; break }
    await page.keyboard.press(p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
    await wait(80)
}
ambush = ambush || ((await probe()).mode === 'combat' ? await probe() : null)
r.check('a real step onto an ambush tile starts combat', !!ambush, ambush ? `mode=${ambush.mode}` : 'never met an ambush walking')

// ---- 5. combat: art on screen, swings booked, the kill lands ----
if (ambush) {
    let p = await probe()
    r.check('the fight opens with mobs on the ledger', !!p.combat && p.combat.mobs.length >= 1, JSON.stringify((p.combat || {}).mobs || []))
    const m0 = p.mobPx.find((m) => m.hp > 0)
    const sx = Math.round(m0.sx - m0.size * 0.4), sy = Math.round(140 - m0.size * 0.85)
    const art = await px(sx, sy, Math.round(m0.size * 0.8), Math.round(m0.size * 0.7), 'canvas[data-wiz-view]', (R, G, B) => (R + G + B) > 120)
    r.check('a live mob has its painted plate where the projection says', art >= 10, `mob at x=${m0.sx} size=${Math.round(m0.size)} painted=${art}`)
    const dealt0 = p.ledger.dealt
    await tap('Space', 2)
    p = await probe()
    r.check('real SPACE swings book damage in the ledger', p.ledger.dealt > dealt0, `${dealt0} -> ${p.ledger.dealt}`)
    // fight to the end: attack, fire when the caster has MP, heal when hurting
    for (let t = 0; t < 60 && (await probe()).mode === 'combat'; t++) {
        const q = await probe()
        const hp = q.party.filter((h) => h.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
        if (hp && hp.hp / hp.maxHp < 0.35 && q.potions > 0) await page.keyboard.press('KeyP')
        else await page.keyboard.press('Space')
        await wait(110)
    }
    const won = await waitEv((e) => e.type === 'victory', 20)
    p = await probe()
    r.check('the party wins the fight by pressing keys', !!won && p.mode === 'map', `won=${!!won} mode=${p.mode}`)
    const xpLvl = p.party.some((h) => h.lvl > 1)
    r.check('battle paid XP (someone crossed a level)', xpLvl, p.party.map((h) => 'L' + h.lvl).join(','))
}
else {
    r.check('combat section (no ambush reached — every combat check is meaningless without it)', false, 'skipped with the ambush failure')
}

// ---- 6. the stairs: real SPACE descends ----
{
    await ensureSetup({ at: [1, 1] })
    const stairs = await page.evaluate(async () => {
        const cv = window.__deepTest
        const st = cv.probe()
        return st.stairs
    })
    await ensureSetup({ at: [stairs.x, stairs.y] })
    const before = await probe()
    await page.keyboard.press('Space')
    await wait(250)
    const after = await probe()
    r.check('SPACE on the stairs descends', after.floor === before.floor + 1, `floor ${before.floor} -> ${after.floor}`)
}

// ---- 7. death is real, the over screen shows, one key returns ----
{
    await ensureSetup({ at: [1, 1], party: [{ i: 0, hp: 1 }, { i: 1, hp: 1 }, { i: 2, hp: 1 }, { i: 3, hp: 1 }, { i: 4, hp: 1 }, { i: 5, hp: 1 }], potions: 0 })
    let over = null
    for (let t = 0; t < 80 && !over; t++) {
        const p = await probe()
        if (p.screen === 'over') { over = p; break }
        if (p.mode === 'combat') await page.keyboard.press('Space')
        else await page.keyboard.press(p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
        await wait(90)
    }
    r.check('a last-life mistake ends the party (over screen)', !!over, over ? 'screen=over' : `still ${(await probe()).screen}/${(await probe()).mode}`)
    await wait(1200)
    await page.keyboard.press('KeyZ')
    await wait(400)
    let o = await probe()
    r.check('one press returns to attract', o.screen === 'attract' || o.screen === 'play', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(300)
    o = await probe()
    r.check('and the crawl starts again fresh', o.screen === 'play' && o.floor === 0 && o.party.every((h) => h.alive), `screen=${o.screen} floor=${o.floor}`)
}

// ---- 8. ? pauses and hands the keyboard back ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    r.check('? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await page.keyboard.press('Shift+Slash')
    await wait(200)
    const back = await probe()
    r.check('? gives the keep back', back.screen === 'play')
}

r.check('zero page errors for the whole crawl', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
