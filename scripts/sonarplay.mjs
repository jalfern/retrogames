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
// Headless boxes with no audio device throw "AudioContext encountered an
// error from the audio device/WebAudio renderer" (britanniadrive precedent) —
// environmental, not game code; real page/console errors still land.
const ENV_NOISE = /AudioContext encountered an error from the audio device/i
page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location()) && !ENV_NOISE.test(m.text())) errors.push(`[console.error] ${m.text()}`) })

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
// Hold a direction long enough to span a moveEvery boundary for certain:
// 90 ms ≈ 1.8 ticks can straddle two boundaries and step zero times —
// under load that stalls the planner swim and the descent flakes.
const swim = async (k) => { await page.keyboard.down(k); await wait(160); await page.keyboard.up(k); await wait(25) }

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
    // #2589/#2594 order law: a run started FROM ATTRACT must be dark and cold.
    // With loadDepth called before the mode flips, seeds shaped like the fixed
    // fallback layout inherit the attract replay's mid-dive state: pre-lit map
    // and gs.tick ≈ join (seed 20261135 → tick 152, the #2589 fingerprint).
    r.check('the fresh run starts dark and cold — no inherited attract state (#2589)', a.t < 2 && a.cooldown === 0 && a.litOpen < 80, `t=${a.t.toFixed(2)}s litOpen=${a.litOpen} cd=${a.cooldown}`)
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
        const rows = []
        for (let p = 0; p < d.length; p += 4) {
            const rb = d[p] - d[p + 2]
            mx = Math.max(mx, rb)
            if (rb >= 30) {
                red++
                const q = p / 4
                const rrow = Math.floor(q / 16), rcol = q % 16
                rows.push(`${rrow}:${rcol}`)
                if (rrow >= 11) low++          // #2383: below row 10 — chevron country
            }
            if (d[p] >= 85 && d[p + 2] - d[p] >= 25 && d[p + 1] <= 170) cold++
        }
        return { max: mx, red, cold, low, rows, x, y }
    }, [x, y])
    const collect = async (s) => {
        if (s.screen !== 'play') return
        // A cell the route already touched on a NEAR ring still paints that
        // hot mark (chevron included) for the whole fade window; a later cold
        // contact in the same cell cannot make the cell "single". Grade cold
        // only on cells with no live hot blip.
        // hot paint (halo + chevron) is heat > 0.55, i.e. ring <= 6 (contactHeat
        // at ring 6 = 0.56). Exclude those cells — and their 8-neighbours, the
        // danger halo (r ≈ 14 px) spills red into the lower band of adjacent
        // cells — not just the ring<=5 showcase set.
        const hotCells = new Set()
        for (const m of (s.contactMarks || [])) {
            if (m.ring < 0 || m.ring > 6) continue
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) hotCells.add(`${m.x + dx},${m.y + dy}`)
        }
        for (const m of (s.contactMarks || [])) {
            if (m.ring < 0) continue
            // Load spikes stall page.evaluate for seconds — by then a blip has
            // faded toward alpha 0.3 and cannot count cold on any ground. Only
            // sample marks still bright (world age <10 ticks: alpha ≥ 0.93).
            if ((m.age || 0) > 10) continue
            if (m.x === s.player.x && m.y === s.player.y) continue
            if (m.ring >= 9 && hotCells.has(`${m.x},${m.y}`)) continue
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
        // Rig a patrol to walk at the diver: its contact must arrive on a
        // NEAR ring (setup-only — the wavefront touch itself stays honest).
        // The death section above may already have spent a life — a respawned
        // diver still catches rig approaches. Re-seat every iteration while no
        // hot sample exists: a compound gate of (modulo AND cooldown) only
        // offered a few coin-flips per run, and zero offers meant zero hot
        // samples. trailEel re-routes from the eel's CURRENT cell, so calling
        // it repeatedly is just a steady chase, not a teleport chain.
        if (c0.hotN === 0 && st.lives >= 1) await page.evaluate(() => window.__sonarTest.trailEel())
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
        `${cLowBad}/${c.coldN} cold samples leaked lower-band red` + (cLowBad ? ` @ ${[...seen].filter(([k, v]) => Number(k.split(',')[2]) >= 9 && v.low > 2).map(([k, v]) => `${k}[${v.rows.slice(0, 12).join(' ')}]`).join(' | ')}` : ''))
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

// ---- #3713 item 4: lit open water carries hash grain (pixels) -----------
// Water used to be ONE flat rgba fill — the poster-board read the parent art
// pass flagged against the grained rock. Gate: any WATER cell (truth openAt,
// harness eyes only, like eels/pearlCells) 3–8 rings from the diver that is
// lit-and-settled — memAge (knowledge, the knownAt family) in 9..50 ticks:
// past the frontier stroke, past the ring trail, past the fresh shell, and
// bright enough that two specks cannot round onto one byte; before the fade —
// and clear of the vent, pearls and contact marks. Its 12×12
// interior must show ≥3 distinct green levels: the per-cell tonal base plus
// its two silt specks. A flat fill shows ONE. State-independent by design: a
// mid-suite cell may ride ANY ping's memory, so an upstream eel or a crowded
// board cannot starve it — if none is settled yet, one honest ping and the
// page-side poll wait for the front to cross and settle a dark candidate.
{
    let grainOk = false, grainSeen = 0, grainCell = '-', recoveries = 0
    const levels = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const d = c.getContext('2d').getImageData(x * 16 + 2, y * 16 + 2, 12, 12).data
        const s = new Set()
        for (let i = 1; i < d.length; i += 4) s.add(d[i])         // green channel
        return s.size
    }, [x, y])
    const scan = s0 => page.evaluate(([p, marks, pearls, vent]) => {
        const settled = [], dark = []
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
            const cheb = Math.max(Math.abs(dx), Math.abs(dy))
            if (cheb < 3 || cheb > 8) continue
            const x = p.x + dx, y = p.y + dy
            if (x < 1 || y < 1 || x > 47 || y > 25) continue
            if (!window.__sonarTest.openAt(x, y)) continue
            if (Math.abs(x - vent[0]) <= 1 && Math.abs(y - vent[1]) <= 1) continue
            if (marks.some(m => m.x === x && m.y === y)) continue
            if (pearls.some(q => q.x === x && q.y === y)) continue
            const age = window.__sonarTest.memAge(x, y)
            if (age >= 9 && age <= 50) settled.push({ x, y })
            else if (age < 0) dark.push([x, y])
        }
        return { settled, dark }
    }, [s0.player, s0.contactMarks, s0.pearlCells, [s0.vent.x, s0.vent.y]])
    const sample = async cell => {
        const lv = await levels(cell.x, cell.y)
        if (lv > grainSeen) { grainSeen = lv; grainCell = `${cell.x},${cell.y}@a${await page.evaluate(c => window.__sonarTest.memAge(c.x, c.y), cell)}` }
        if (lv >= 3) grainOk = true
    }
    for (let attempt = 0; attempt < 12 && !grainOk; attempt++) {
        const s0 = await probe()
        if (s0.screen !== 'play') {
            if (++recoveries > 4) break
            await tap('KeyT'); await wait(1100); attempt--
            continue
        }
        const sc = await scan(s0)
        for (const cell of sc.settled.slice(0, 3)) { await sample(cell); if (grainOk) break }
        if (grainOk || !sc.dark.length || s0.cooldown > 1) {     // nothing to light (yet) — new vantage
            if (!grainOk) {
                const h = await hint()
                if (h && h !== 'PING') await swim(h)
                await wait(150)
            }
            continue
        }
        await tap('Space')                                        // one honest ping…
        const lit = await page.evaluate(cells => new Promise(res => {   // …wait for a front to CROSS and settle
            const t0 = performance.now()
            const poll = () => {
                for (const [x, y] of cells) {
                    const a = window.__sonarTest.memAge(x, y)
                    if (a >= 9 && a <= 50) return res({ x, y })
                }
                if (performance.now() - t0 > 2200) return res(null)
                setTimeout(poll, 60)
            }
            poll()
        }), sc.dark)
        if (!lit) continue
        await sample(lit)
    }
    r.check('lit open water carries hash grain (pixels)', grainOk, `levels=${grainSeen} @ ${grainCell}`)
}

// ---- #2594 pearl memory, in pixels + real keys: bright when heard, a dim
// glint when remembered, bright again on re-hearing. Organic ghosting: after
// one real SPACE ping the diver simply WAITS (the core dodge), so no wavefront
// refreshes the memory — the fade boundary is reached by living, not rigging.
// Fresh = counted pink-white px; ghost = counted dim-pink px on a cell the
// knowledge says dark (only the remembered pearl draw can brighten it). ----
{
    const cellPix = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const d = c.getContext('2d').getImageData(x * 16, y * 16, 16, 16).data
        let bright = 0, dim = 0
        for (let p = 0; p < d.length; p += 4) {
            const R = d[p], G = d[p + 1], B = d[p + 2]
            if (R >= 190 && G >= 150 && B >= 170) bright++                 // fresh pearl / glint
            if (R >= 55 && R <= 170 && G >= 35 && G <= 130 && B >= 45 && B <= 170) dim++   // remembered glint on black
        }
        return { bright, dim }
    }, [x, y])
    let st = await probe()
    if (st.screen !== 'play') { await tap('KeyG'); await wait(1100) }
    let freshPx = -1, ghostPx = -1, ghostBrightPx = -1, revivePx = -1, knownAfterGhost = true, recoveries = 0, attempts = 0
    let gx = -1, gy = -1, gIdx = -1
    for (let i = 0; i < 240 && ghostPx < 0 && attempts < 8; i++) {
        st = await probe()
        if (st.screen !== 'play') {
            if (++recoveries > 4) break
            await tap('KeyR'); await wait(1100); attempts++
            freshPx = ghostPx = revivePx = -1
            continue
        }
        if (freshPx < 0) {
            if (st.cooldown > 1) { await wait(150); continue }
            await tap('Space')                                             // the one honest ping
            const t0 = Date.now()
            while (Date.now() - t0 < 900) {
                const s2 = await probe()
                if (s2.screen !== 'play') break
                for (let k = 0; k < s2.pearlSignals.length; k++) {
                    if (s2.pearlSignals[k] !== 2) continue
                    const cell = s2.pearlCells[k]
                    if (cell.taken) continue
                    const v = await cellPix(cell.x, cell.y)
                    if (v.bright >= 4) { freshPx = v.bright; gx = cell.x; gy = cell.y; gIdx = k; break }
                }
                if (freshPx >= 0) break
                await wait(80)
            }
            continue
        }
        // wait out the fade WITHOUT pinging — this is the ghost forming in plain
        // living. Poll the sim's own signal; sample pixels only once it is 1.
        const sig = st.pearlSignals[gIdx]
        if (sig === 1) {
            knownAfterGhost = await knownAt(gx, gy)
            const v = await cellPix(gx, gy)
            ghostPx = v.dim
            ghostBrightPx = v.bright
            break
        }
        if (sig === 0) break                                              // collected/never — restart the hunt
        await wait(120)
        if (i % 40 === 39) attempts++                                     // bound stalled waits
    }
    r.check('a real ping paints a fresh pearl bright (pixels)', freshPx >= 4, `bright=${freshPx}`)
    // #2601 window shift: the ghost is a hollow shimmering ring, not a 2px dot —
    // the arc covers ~44 px in the dim window at every shimmer phase (measured
    // on the ring, α 0.30–0.58 stays inside the window), so the floor rises from
    // 2 to 20. The ring's α never crosses the bright floor (0.745): a remembered
    // pearl can no longer read fresh — hollow-vs-solid hierarchy, in numbers.
    r.check('the remembered pearl keeps its dim ring after the fade (pixels)', ghostPx >= 20, `dim=${ghostPx}`)
    r.check('the remembered ring never reads fresh (pixels)', ghostPx >= 20 && ghostBrightPx === 0, `bright=${ghostBrightPx}`)
    r.check('the ghosted pearl cell is knowledge-dark — only memory draws it', ghostPx >= 20 && !knownAfterGhost, `known=${knownAfterGhost}`)
    if (ghostPx >= 20) {
        await wait(200)
        for (let k = 0; k < 20 && revivePx < 0; k++) {
            const s3 = await probe()
            if (s3.screen !== 'play') break
            if (s3.cooldown <= 1) await tap('Space')
            const t0 = Date.now()
            while (Date.now() - t0 < 900) {
                const s4 = await probe()
                if (s4.screen !== 'play') break
                if (s4.pearlSignals[gIdx] === 2) {
                    const v = await cellPix(gx, gy)
                    if (v.bright >= 4) { revivePx = v.bright; break }
                }
                await wait(80)
            }
        }
    }
    r.check('a second ping revives the remembered pearl to bright (pixels)', revivePx >= 4, `revive=${revivePx}`)
}

// ---- #2601 items 4+5: the seed ledger made actionable ------------------
// A DEEP LOG row printed a seed hex and the game had no way to act on it:
// ?seed= pinned EVERY dive with no escape, and the just-finished seed was
// display-only. These gates drive the real keys/mouse: ?seed= pins and is
// announced; E (keyboard) and a ≥600 ms hold (touch) re-swim the finished
// seed; U pulls the pin and the next dive is random again — no URL edits.
{
    const SEED = 0xab12
    await page.goto(`${URL}?seed=${SEED}`, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__sonarTest, null, { timeout: 25000 })
    await wait(700)
    const announced = await page.evaluate(() => document.body.innerText.includes('PINNED'))
    r.check('a pinned page announces the pin (no silent pinning)', announced)
    await tap('Enter')
    await wait(350)
    let sp = await probe()
    r.check('?seed= pins the first dive to that exact seed', sp.screen === 'play' && sp.seed === SEED, `screen=${sp.screen} seed=${(sp.seed ?? -1).toString(16)}`)
    r.check('the pin is probeable', (await page.evaluate(() => window.__sonarTest.pin())) === SEED)

    // E on the over screen replays the run's own seed.
    await page.evaluate(() => window.__sonarTest.forceOver())
    await wait(1100)
    r.check('rig: the live loop ends the dive onto the over screen', (await probe()).screen === 'over')
    await tap('KeyE')
    await wait(350)
    sp = await probe()
    r.check('E on the over screen swims the SAME seed again', sp.screen === 'play' && sp.seed === SEED, `screen=${sp.screen} seed=${(sp.seed ?? -1).toString(16)}`)

    // touch path: hold the water ≥600 ms to repeat, short before it, tap stays
    // any-tap-to-attract (exercised at the end of the section).
    await page.evaluate(() => window.__sonarTest.forceOver())
    await wait(1100)
    const box = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-sonar-stage]')
        const b = c.getBoundingClientRect()
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    })
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await wait(700)
    await page.mouse.up()
    await wait(350)
    sp = await probe()
    r.check('holding the water repeats the dive on the same seed (touch)', sp.screen === 'play' && sp.seed === SEED, `screen=${sp.screen} seed=${(sp.seed ?? -1).toString(16)}`)

    // U pulls the pin: it un-pins WITHOUT starting (any key on attract starts),
    // and the dive after it is random again.
    await page.evaluate(() => window.__sonarTest.forceOver())
    await wait(1100)
    await tap('Enter')                       // any other key still leaves for attract
    await wait(300)
    r.check('a plain key on the over screen still goes to attract', (await probe()).screen === 'attract')
    await tap('KeyU')
    await wait(250)
    sp = await probe()
    r.check('U pulls the pin without starting a dive', (await page.evaluate(() => window.__sonarTest.pin())) === null && sp.screen === 'attract', `screen=${sp.screen}`)
    await tap('Enter')
    await wait(350)
    sp = await probe()
    r.check('after U the next dive is random again (no URL edit)', sp.screen === 'play' && sp.seed !== SEED, `screen=${sp.screen} seed=${(sp.seed ?? -1).toString(16)}`)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
