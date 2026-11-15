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
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.SONAR_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/sonar`
await requireDevServer(URL)

const r = new Report('sonarplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

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

// ---- #2383 attract showcase: the demo joins its proven replay ~3 s before
// its first NEAR contact, so a hot (ring ≤5) mark paints within seconds of
// landing on the attract screen — the heat cue sells itself inside five. ----
{
    let hotT = -1
    for (let i = 0; i < 30 && hotT < 0; i++) {
        const s = await probe()
        if (s.screen !== 'attract') break
        if ((s.contactMarks || []).some((m) => m.ring >= 0 && m.ring <= 5)) hotT = s.t
        else await wait(120)
    }
    r.check('attract showcases a HOT near mark within seconds (join)', hotT >= 0,
        hotT >= 0 ? `hot mark live at attract t=${hotT.toFixed(1)}s` : 'no ring<=5 contact mark appeared')
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
    // #2383 haptics: the hits on the way down must have rung the long pulse.
    {
        const hl2 = await page.evaluate(() => window.__sonarTest.haptics())
        r.check('a hit buzzes the phone (long pulse intent logged)', hl2.some((e) => e.endsWith(':90,40,90')),
            hl2.slice(-6).join(' ') || 'no pulses logged')
    }
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

// ---- #2365 distance cue: a contact mark's COLOR must read the ring it came
// in on. Hot marks (ring ≤5, ≈10 cells) must be red-dominant in pixels; cold
// marks (ring ≥9, ≈18+ cells) must stay blue-dominant.
// #2383 discriminator rewrite: the old metric was max(r−b) over the cell, and
// a pearl (rgba(255,220,240,.85), r−b ≈ +15 over dark ground) landing in the
// same cell flipped a genuinely-blue sample red — it broke 4/4 local runs.
// Counted pixels instead, thresholds measured on the real renderer:
//   hot  = pixels with r−b >= 30   (the hot stroke composites ≈ +70 fresh;
//          pearls top out ≈ +21 — they cannot fake it)
//   cold = purple mark pixels r >= 85 && b−r >= 25 && g <= 170
//          (cold stroke ≈ (145,111,178) on lit water; the frontier stroke
//          (g ≈ 215), plain water (r < 13), rock/sparkle (r ≤ 74) and pearls
//          (b−r ≈ 0) all fail one leg — measured, not assumed)
// The mean-r−b check below keeps the old metric for the near/far separation. ----
{
    const seen = new Map()                     // "x,y,ring" -> pixel counts {max,red,cold,low}
    let pings = 0
    const sampleCell = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const d = c.getContext('2d').getImageData(x * 16, y * 16, 16, 16).data
        let mx = -255, red = 0, cold = 0, low = 0
        for (let p = 0; p < d.length; p += 4) {
            const rb = d[p] - d[p + 2]
            mx = Math.max(mx, rb)
            if (rb >= 30) {
                red++
                if ((p / 4) % 16 >= 11) low++          // #2383: below row 10 — chevron country
            }
            if (d[p] >= 85 && d[p + 2] - d[p] >= 25 && d[p + 1] <= 170) cold++
        }
        return { max: mx, red, cold, low }
    }, [x, y])
    const collect = async (s) => {
        if (s.screen !== 'play') return
        for (const m of (s.contactMarks || [])) {
            if (m.ring < 0) continue
            if (m.x === s.player.x && m.y === s.player.y) continue
            const key = `${m.x},${m.y},${m.ring}`
            if (seen.has(key)) continue
            seen.set(key, await sampleCell(m.x, m.y))
        }
    }
    const classify = () => {
        let hotN = 0, hotOk = 0, coldN = 0, coldOk = 0
        for (const [key, v] of seen) {
            const ring = Number(key.split(',')[2])
            if (ring <= 5) { hotN++; if (v.red >= 15) hotOk++ }
            else if (ring >= 9) { coldN++; if (v.cold >= 15) coldOk++ }
        }
        return { hotN, hotOk, coldN, coldOk }
    }
    // make sure we're in a run with pings falling; the planner swim above
    // has already produced far contacts — harvest them from a fresh run too.
    let st = await probe()
    if (st.screen !== 'play') { await tap('KeyN'); await wait(500) }
    for (let i = 0; i < 260; i++) {
        st = await probe()
        if (st.screen !== 'play') break
        await collect(st)
        const c0 = classify()
        if (c0.coldN >= 1 && c0.hotN >= 1) break
        if (st.cooldown <= 1) { await tap('Space'); pings++ }
        // rig a patrol to walk at the diver: its contact must arrive on a
        // NEAR ring (setup-only — the wavefront touch itself stays honest).
        if (c0.hotN === 0 && st.cooldown <= 1 && i % 12 === 11 && st.lives === 3) await page.evaluate(() => window.__sonarTest.trailEel())
        await wait(70)
    }
    const c = classify()
    r.check('far contacts really paint cold (counted blue-dominant pixels)', c.coldN >= 1 && c.coldOk === c.coldN,
        `${c.coldOk}/${c.coldN} cold samples [${[...seen].filter(([k]) => Number(k.split(',')[2]) >= 9).map(([, v]) => `c${v.cold}`).join(' ')}], ${pings} pings`)
    r.check('near contacts really paint hot (counted red-dominant pixels)', c.hotN >= 1 && c.hotOk === c.hotN,
        `${c.hotOk}/${c.hotN} hot samples [${[...seen].filter(([k]) => Number(k.split(',')[2]) <= 5).map(([, v]) => `r${v.red}`).join(' ')}]`)
    // #2383 colourblind SHAPE cue: hot marks grow a chevron below row 10 of
    // their cell; cold marks stay single. Counted in the lower band as red px.
    let hLowOk = 0, cLowBad = 0
    for (const [key, v] of seen) {
        const ring = Number(key.split(',')[2])
        if (ring <= 5 && v.low >= 6) hLowOk++
        if (ring >= 9 && v.low > 2) cLowBad++
    }
    r.check('hot marks grow the double-stroke chevron (shape cue, pixels)', c.hotN >= 1 && hLowOk === c.hotN,
        `${hLowOk}/${c.hotN} hot samples carry the chevron`)
    r.check('cold marks stay single (shape cue, pixels)', c.coldN >= 1 && cLowBad === 0,
        `${cLowBad}/${c.coldN} cold samples leaked lower-band red`)
    // #2383 haptics: the hot contact must have rung a short pulse. The motors
    // stay silent under the harness (window.__game); the logged intent proves
    // the rule fired. (hit's long pulse is proven after the death section.)
    const hl = await page.evaluate(() => window.__sonarTest.haptics())
    r.check('a HOT contact buzzes the phone (short pulse intent logged)', hl.some((e) => e.endsWith(':30')),
        hl.slice(-6).join(' ') || 'no pulses logged')
    // monotonic in pixels too: mean hot excess must exceed mean cold excess
    let hotSum = 0, hotCnt2 = 0, coldSum = 0, coldCnt2 = 0
    for (const [key, v] of seen) {
        const ring = Number(key.split(',')[2])
        if (ring <= 5) { hotSum += v.max; hotCnt2++ }
        else if (ring >= 9) { coldSum += v.max; coldCnt2++ }
    }
    r.check('pixel heat separates near from far', hotCnt2 > 0 && coldCnt2 > 0 && (hotSum / hotCnt2) > (coldSum / coldCnt2) + 40,
        `hot mean ${(hotSum / Math.max(1, hotCnt2)).toFixed(0)} vs cold mean ${(coldSum / Math.max(1, coldCnt2)).toFixed(0)}`)
}

// ---- #2367 vent signal + wavefront ring, in pixels. Sampled as max green
// over the INNER 8x8 of a cell: the frontier edge stroke lives on the outer
// ring of a cell, so whatever brightens the interior is the swirl, the ghost
// or the passing ring — nothing else the renderer draws. ----
{
    const innerGreen = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const d = c.getContext('2d').getImageData(x * 16 + 4, y * 16 + 4, 8, 8).data
        let g = 0
        for (let i = 1; i < d.length; i += 4) g = Math.max(g, d[i])
        return g
    }, [x, y])

    // A fresh front must RIPPLE (bright swirl) and remembered knowledge must
    // sit as a dimmer GHOST — sampled against the sim's own signal state so
    // the pixel claim is paired with the knowledge claim, not a lucky frame.
    let st = await probe()
    if (st.screen !== 'play') { await tap('KeyQ'); await wait(500) }
    let ripG = -1, ghostG = -1
    for (let i = 0; i < 600; i++) {
        st = await probe()
        if (st.screen !== 'play') break
        if (ripG < 0 && st.ventSignal === 2) ripG = await innerGreen(st.vent.x, st.vent.y)
        else if (ripG >= 0 && ghostG < 0 && st.ventSignal === 1) ghostG = await innerGreen(st.vent.x, st.vent.y)
        if (ripG >= 0 && ghostG >= 0) break
        const h = await hint()
        if (h === 'PING') await tap('Space')
        else if (h) await swim(h)
        await wait(30)
    }
    r.check('fresh vent knowledge ripples; remembered vent ghosts (pixels)',
        ripG >= 90 && ghostG >= 0 && ripG >= ghostG + 30,
        `ripple=${ripG} ghost=${ghostG}`)
}

// ---- #2367 ping wavefront ring: right after a real SPACE ping, an open cell
// the ping newly lights must briefly read brighter than the plain lit water
// that follows — that spike is the ring crossing the cell interior. Peaks at
// multiple distances/attempts; a cell the discrete rings skip on one ping is
// hit on the next (the trail rings interleave the 32-px jumps). ----
{
    let ringOk = false, ringPeak = -1, ringPlain = -1, recoveries = 0
    const innerGreen = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const d = c.getContext('2d').getImageData(x * 16 + 4, y * 16 + 4, 8, 8).data
        let g = 0
        for (let i = 1; i < d.length; i += 4) g = Math.max(g, d[i])
        return g
    }, [x, y])
    for (let attempt = 0; attempt < 14 && !ringOk; attempt++) {
        const s0 = await probe()
        if (s0.screen !== 'play') {
            // the over screen eats keys for 900 ms — recover the run without
            // burning measurement attempts on swallowed taps
            if (++recoveries > 4) break
            await tap('KeyT'); await wait(1100); attempt--
            continue
        }
        if (s0.cooldown > 1) { await wait(150); continue }
        let tx = -1, ty = -1
        for (const off of [[3, 0], [4, 0], [5, 0], [-3, 0], [-4, 0], [-5, 0], [0, 3], [0, 4], [0, -3], [0, -4]]) {
            const x = s0.player.x + off[0], y = s0.player.y + off[1]
            if (x < 1 || y < 1 || x > 47 || y > 25) continue
            if (await knownAt(x, y)) continue
            tx = x; ty = y; break
        }
        if (tx < 0) {
            // whole horizon remembered — walk toward the dark and try again
            const h = await hint()
            if (h && h !== 'PING') await swim(h)
            await wait(120)
            continue
        }
        await tap('Space')
        const t0 = Date.now()
        let peak = 0
        while (Date.now() - t0 < 500) {
            const v = await innerGreen(tx, ty)
            if (v > peak) peak = v
        }
        const plain = await innerGreen(tx, ty)
        ringPeak = peak; ringPlain = plain
        if (peak >= 45 && peak >= plain + 35) ringOk = true
    }
    r.check('the ping paints a visible expanding wavefront ring (pixels)', ringOk,
        `peak=${ringPeak} plain=${ringPlain}`)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
