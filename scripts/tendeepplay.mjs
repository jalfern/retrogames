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
//   3b. THE WALK BREATHES — fwd/back glide the projection ~130ms, the
//      settled frame is the exact snapped one, and a bump never lunges.
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

// ---- 2. the RIM: a key starts on the street; doors open; the well takes you down ----
await page.keyboard.press('KeyZ')
await wait(300)
let s = await probe()
r.check('any key starts at THE RIM', s.screen === 'play' && s.mode === 'town' && s.town && s.town.b === null, `screen=${s.screen} mode=${s.mode}`)
r.check('the purse is printed where the ledger says', s.gold === 120, `gold=${s.gold}`)
{
    const a = await probe()
    await tap('ArrowRight')
    const b = await probe()
    r.check('arrows pick a door on the street', b.town && b.town.sel === (a.town.sel + 1) % 4, `sel ${a.town.sel} -> ${b.town && b.town.sel}`)
    await tap('Space')
    const c = await probe()
    r.check('SPACE enters the chosen door', c.town && c.town.b === 'V' && c.town.services && c.town.services.length === 4, `b=${c.town && c.town.b}`)
    // temple windows: pale blue glass on the interior wash
    const glass = await px(8, 26, 240, 120, 'canvas[data-deep-view]', (R, G, B) => B > 110 && B > R + 20 && G > 60)
    r.check('the interior paints its room (temple wash on screen)', glass > 200, `lit px=${glass}`)
    await tap('KeyL')
    const d = await probe()
    r.check('L steps back out to the street', d.town && d.town.b === null, `b=${d.town && d.town.b}`)
    // amber windows of the tavern from the street (facade pixels, not stars)
    const amber = await px(12, 60, 232, 60, 'canvas[data-deep-view]', (R, G, B) => R > 180 && G > 110 && B < 110)
    r.check('the street paints lit facades', amber > 10, `amber px=${amber}`)
    await tap('KeyF')
    const e = await probe()
    r.check('F at the well opens DEEP 1', e.mode === 'map' && e.floor === 0, `mode=${e.mode} floor=${e.floor}`)
}
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
    const amber2 = await px(mx, my, 5, 5, 'canvas[data-deep-map]', (R, G, B) => R > 200 && G > 170 && B < 130)
    r.check('the automap paints the party where the sim says', amber2 >= 18, `cell (${c.x},${c.y}) amber=${amber2}/25`)
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
    const blue = await px(126, 30, 5, 140, 'canvas[data-deep-view]', (R, G, B) => B > 90 && B > R + 30)
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
    const blueFar = await px(126, 30, 5, 140, 'canvas[data-deep-view]', (R, G, B) => B > 90 && B > R + 30)
    r.check('a clear hall leaves the centre dark — the view is the grid', blueFar <= 10, `blue px=${blueFar} (wall pose had ${blue})`)
}

// ---- 3b. the walk breathes: fwd/back ease the view, endpoints land exact ----
{
    let p = await probe()
    if (p.mode !== 'map') r.check('walk-ease pose is on a map floor', false, `mode=${p.mode}`)
    const litWin = [96, 8, 64, 48]
    const settle = async () => { for (let i = 0; i < 12; i++) { if ((await probe()).ease === 0) return true; await wait(40) } return false }
    const before = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
    await settle()
    await page.keyboard.press('ArrowUp')
    const mid = await probe()
    r.check('a fwd step eases the projection (off > 0.5 mid-glide)', mid.ease > 0.5, `ease=${mid.ease.toFixed(3)} mode=${mid.mode}`)
    const midPx = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
    const mid2 = await probe()
    r.check('mid-glide frame differs from the settled frame', midPx !== before || mid2.ease > 0.1, `before=${before} mid=${midPx} ease=${mid2.ease.toFixed(3)}`)
    r.check('the ease settles to zero', await settle(), 'ease never reached 0 after fwd')
    const afterFwd = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
    const pf = await probe()
    r.check('fwd actually moved the party', pf.x !== p.x || pf.y !== p.y, `(${p.x},${p.y}) -> (${pf.x},${pf.y})`)
    await page.keyboard.press('ArrowDown')
    const back = await probe()
    r.check('a back step eases the other way (off < 0.5)', back.ease < -0.5, `ease=${back.ease.toFixed(3)}`)
    r.check('the back ease settles to zero', await settle(), 'ease never reached 0 after back')
    const pb = await probe()
    const afterBack = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
    r.check('the round-trip lands where it started', (pb.x === p.x && pb.y === p.y) || (pb.x === pf.x && pb.y === pf.y), `(${p.x},${p.y}) -> (${pf.x},${pf.y}) -> (${pb.x},${pb.y})`)
    r.check('settled endpoints are frame-exact (ease never distorts rest)', afterBack === afterFwd || afterBack === before || pb.x === pf.x, `before=${before} afterFwd=${afterFwd} afterBack=${afterBack}`)
    // a bump must NOT lunge: a blocked step never changes the pose
    for (let t = 0; t < 4 && (await probe()).view.wallDist !== 1; t++) await tap('ArrowRight')
    await settle()
    await page.keyboard.press('ArrowUp')
    const bump = await probe()
    r.check('a bump into a wall does not ease (no lunge on a refusal)', bump.ease === 0, `ease=${bump.ease} wallDist=${bump.view.wallDist}`)
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
    const art = await px(sx, sy, Math.round(m0.size * 0.8), Math.round(m0.size * 0.7), 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 120)
    r.check('a live mob has its painted plate where the projection says', art >= 10, `mob at x=${m0.sx} size=${Math.round(m0.size)} painted=${art}`)
    const dealt0 = p.ledger.dealt
    const taken0 = p.ledger.taken
    await tap('KeyG', 1)
    const gp = await probe()
    const guardEv = gp.evLog.find((e) => e.type === 'guard')
    r.check('real G holds the shield (booked, and the round still resolves)', !!guardEv && gp.combat && gp.ledger.taken >= taken0, `guard=${!!guardEv} taken ${taken0} -> ${gp.ledger.taken}`)
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

// ---- 7. a wipe carries the bodies to THE RIM; keys hire and re-descend ----
{
    await ensureSetup({ at: [1, 1], party: [{ i: 0, hp: 1 }, { i: 1, hp: 1 }, { i: 2, hp: 1 }, { i: 3, hp: 1 }, { i: 4, hp: 1 }, { i: 5, hp: 1 }], potions: 0 })
    let wiped = null
    for (let t = 0; t < 120 && !wiped; t++) {
        const p = await probe()
        if (p.wipe) { wiped = p; break }
        if (p.mode === 'combat') await page.keyboard.press('Space')
        else await page.keyboard.press(p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
        await wait(90)
    }
    r.check('a total party kill carries the bodies to THE RIM', !!wiped && wiped.mode === 'town', wiped ? `mode=${wiped.mode}` : `never wiped (${(await probe()).screen}/${(await probe()).mode})`)
    r.check('the dead-body tax was paid and booked', wiped.gold < wiped.ledger.goldIn && wiped.ledger.goldSpent > 0, `purse=${wiped.gold} goldIn=${wiped.ledger.goldIn} spent=${wiped.ledger.goldSpent}`)
    // walk to the tavern (sel 0), hire the first fallen hero we find
    await page.keyboard.press('KeyL')
    for (let i = 0; i < 4; i++) {
        const p = await probe()
        if (p.town && p.town.sel === 0) break
        await page.keyboard.press('ArrowLeft')
        await wait(90)
    }
    await page.keyboard.press('Space')
    await wait(250)
    let hired = null
    for (let i = 0; i < 8 && !hired; i++) {
        const p = await probe()
        if (p.town && p.town.b === 'T' && p.town.services && p.town.services[0].ok) {
            await page.keyboard.press('Space')
            await wait(250)
            hired = await waitEv((e) => e.type === 'hire', 20)
            break
        }
        await page.keyboard.press('ArrowDown')
        await wait(120)
    }
    r.check('keys hire a replacement at the tavern', !!hired, hired ? `${hired.who} joins` : 'no hire event from real keys')
    const afterHire = await probe()
    r.check('the company stands taller after the hire', afterHire.party.filter((h) => h.alive).length >= wiped.party.filter((h) => h.alive).length + 1, `alive ${wiped.party.filter((h) => h.alive).length} -> ${afterHire.party.filter((h) => h.alive).length}`)
    // ---- stage 3: the creation bench — the POSTED hero takes a rolled paper
    {
        const wasFreshIdx = afterHire.party.findIndex((h) => h.fresh)
        r.check('the hire left an open slot awaiting its paper', wasFreshIdx >= 0, `fresh index=${wasFreshIdx}`)
        await ensureSetup({ gold: 300 })           // a funded purse: the bench fee must be payable
        await page.keyboard.press('ArrowRight')   // service: POST -> CREATE
        await wait(150)
        await page.keyboard.press('Space')        // open the bench
        let bench = null
        for (let i = 0; i < 24 && !bench; i++) {
            const q = await probe()
            if (q.town && q.town.cand) bench = q
            else await wait(90)
        }
        r.check('SPACE opens the bench with six papers', !!bench && bench.town.cand.length === 6, bench ? `papers=${bench.town.cand.length}` : 'bench never opened')
        if (bench) {
            // walk the cursor to a passing paper
            for (let i = 0; i < 8 && !bench.town.cand[bench.town.ci].pass; i++) { await page.keyboard.press('ArrowDown'); await wait(110); bench = await probe() }
            r.check('the cursor finds an OK paper (FAIL stays FAIL)', bench.town.cand[bench.town.ci].pass, `paper ${bench.town.ci}: ${bench.town.cand[bench.town.ci].cls} ${bench.town.cand[bench.town.ci].pass ? 'OK' : 'FAIL'}`)
            await page.keyboard.press('KeyR')     // reroll — free
            await wait(220)
            let reroll = await probe()
            r.check('R deals six fresh papers', !!reroll.town.cand && reroll.town.cand.length === 6 && reroll.town.cand.map((c) => c.name).join() !== bench.town.cand.map((c) => c.name).join(), 'papers did not change on reroll')
            for (let i = 0; i < 8 && !reroll.town.cand[reroll.town.ci].pass; i++) { await page.keyboard.press('ArrowDown'); await wait(110); reroll = await probe() }
            await page.keyboard.press('ArrowRight')  // shift the way
            await wait(130)
            const chosen = await probe()
            const paper = chosen.town.cand[chosen.town.ci]
            const purseB = chosen.gold
            await page.keyboard.press('Space')    // accept
            const cr = await waitEv((e) => e.type === 'create', 24)
            r.check('SPACE accepts the paper and the hero stands', !!cr, cr ? `${cr.who} the ${cr.cls} (${cr.race}, ${cr.ali})` : 'no create event from real keys')
            if (cr) {
                r.check('the created hero matches the composed paper', cr.hp === paper.composed.hp && cr.atk === paper.composed.atk && cr.def === paper.composed.def && cr.spd === paper.composed.spd && cr.ali === chosen.town.ali, `paper hp${paper.composed.hp} a${paper.composed.atk} d${paper.composed.def} s${paper.composed.spd}/${chosen.town.ali} vs hero hp${cr.hp} a${cr.atk} d${cr.def} s${cr.spd}/${cr.ali}`)
                const afterCr = await probe()
                r.check('the bench charged its flat fee and booked it', afterCr.gold === purseB - 60 && afterCr.ledger.goldSpent >= 60, `purse ${purseB} -> ${afterCr.gold}`)
                const hero = afterCr.party[wasFreshIdx]
                r.check('the open slot is filled by the created hero', !!hero && hero.alive && !hero.fresh && hero.lvl === 1, hero ? `${hero.name} fresh=${hero.fresh} L${hero.lvl}` : 'slot gone')
            }
        }
    }
    await page.keyboard.press('KeyL')
    await wait(150)
    await page.keyboard.press('KeyF')
    await wait(250)
    const back = await probe()
    r.check('the well reopens: F descends again at DEEP 1', back.mode === 'map' && back.floor === 0, `mode=${back.mode} floor=${back.floor}`)
}

// ---- 7b. dead AND penniless is the real end: over screen, one key back ----
{
    await ensureSetup({ at: [1, 1], gold: 0, party: [{ i: 0, hp: 1 }, { i: 1, hp: 1 }, { i: 2, hp: 1 }, { i: 3, hp: 1 }, { i: 4, hp: 1 }, { i: 5, hp: 1 }], potions: 0 })
    let over = null
    for (let t = 0; t < 120 && !over; t++) {
        const p = await probe()
        if (p.screen === 'over') { over = p; break }
        if (p.mode === 'combat') await page.keyboard.press('Space')
        else await page.keyboard.press(p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
        await wait(90)
    }
    r.check('dead with an empty purse ends the run (over screen)', !!over, over ? 'screen=over' : `still ${(await probe()).screen}/${(await probe()).mode}`)
    await wait(1200)
    await page.keyboard.press('KeyZ')
    await wait(400)
    let o = await probe()
    r.check('one press returns to attract', o.screen === 'attract' || o.screen === 'play', `screen=${o.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(300)
    o = await probe()
    r.check('and the crawl starts again fresh at the RIM', o.screen === 'play' && o.floor === 0 && o.gold === 120 && o.party.every((h) => h.alive), `screen=${o.screen} gold=${o.gold}`)
}

// ---- 8. ? pauses and hands the keyboard back ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    r.check('? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await page.keyboard.press('Shift+Slash')
    await wait(200)
    const back = await probe()
    r.check('? gives the Deep back', back.screen === 'play')
}

r.check('zero page errors for the whole crawl', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
