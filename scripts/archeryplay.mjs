// ARENA ARCHERY in Chrome — real key events only. The Node audit owns the
// math; this file owns the CLAIMS ONLY A BROWSER CAN MAKE:
//
//   - attract mode is alive: the demo tick advances through the real
//     step() with no human attached,
//   - the keys a human actually presses drive P1 (through the window
//     listeners, not the DEV hook), and the DRAWN PIXELS match the LOGICAL
//     position after every input — sprite-is-state, the issue's demand,
//   - hold/release on Space is a real charge-and-loose,
//   - an arrow stuck by the sim is painted, and a pulled one is not,
//   - one key starts, ? pauses, R restarts, and zero page errors fall on
//     the floor during the whole ride,
//   - and (#2558) SEAT TWO: the `2` duel is driven by real WASD+F keystrokes
//     — walk, jump, draw, hit, pull, the same-tick stamp, and the win.
import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.ARCHERY_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/arena-archery`
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__archeryTest', wait: 300 })
const r = new Report('archeryplay')
const probe = () => page.evaluate(() => window.__archeryTest.probe())
// #2565 Fletching pixels: for every stuck shaft, count owner-colour pixels
// around its tail — the paint point is the stuck CELL centre and the shaft
// draws along s.ang, so the tail sits at −8 px along it (barbs at the very
// end). Seat red #ff5d6c / cyan #4ad7ff collide with nothing in that
// neighbourhood (stone grey-blue, shafts tan) — except the archers' own
// bodies, so cells whose tail box overlaps a body are skipped: only barbs
// may answer for the colour here.
const fletchScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-archery-stage]')
    const g = c.getContext('2d')
    const s = c.width / (20 * 24)
    const near = (a, b, w) => Math.abs(a - b) <= w
    const st = window.__archeryTest.probe()
    const bods = [st.p1, st.p2].map((p) => ({ x: p.x * s, y: (p.y - 10) * s }))
    const out = []
    for (const sc of st.stuckCells) {
        const tx = Math.round((sc.x - 8 * Math.cos(sc.ang)) * s)
        const ty = Math.round((sc.y - 8 * Math.sin(sc.ang)) * s)
        if (bods.some((b) => Math.abs(tx - b.x) < 16 && Math.abs(ty - b.y) < 20)) continue
        const d = g.getImageData(Math.max(0, tx - 5), Math.max(0, ty - 5), 11, 11).data
        let red = 0, cyan = 0
        for (let i = 0; i < d.length; i += 4) {
            if (near(d[i], 255, 50) && near(d[i + 1], 93, 50) && near(d[i + 2], 108, 50)) red++
            if (near(d[i], 74, 50) && near(d[i + 1], 215, 45) && near(d[i + 2], 255, 30)) cyan++
        }
        out.push({ owner: sc.owner, ang: sc.ang, red, cyan })
    }
    return out
})
const fletchOk = (cells, bothOwners) => cells.length >= 1
    && cells.every((o) => (o.owner === 0 ? o.red >= 2 : o.cyan >= 2))
    && (!bothOwners || (cells.some((o) => o.owner === 0) && cells.some((o) => o.owner === 1)))
// #2565 item 3 — ceremony pixels: seat chips above the bodies and DRAW! across
// the centre strip. Chips paint at baseline p.y−24 (body top is p.y−12), so the
// 14-row boxes cannot be answered by the archers themselves; the centre strip
// holds no gameplay ink — the board is HELD at spawn while the ceremony rings
// (no ticks run, so no arrows can exist), and the only gold on it is the word.
const ceremonyScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-archery-stage]')
    const g = c.getContext('2d')
    const st = window.__archeryTest.probe()
    const near = (a, b, w) => Math.abs(a - b) <= w
    const count = (x, y, w, h, test) => {
        const d = g.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), w, h).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
        return n
    }
    return {
        p1: count(st.p1.x - 12, st.p1.y - 36, 24, 14, (r, gg, b) => near(r, 255, 50) && near(gg, 93, 50) && near(b, 108, 50)),
        p2: count(st.p2.x - 12, st.p2.y - 36, 24, 14, (r, gg, b) => near(r, 74, 50) && near(gg, 215, 45) && near(b, 255, 30)),
        gold: count(c.width / 2 - 70, c.height / 2 - 44, 140, 38, (r, gg, b) => near(r, 255, 40) && near(gg, 210, 45) && near(b, 62, 80)),
    }
})
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

let pageErrors = 0
page.on('pageerror', () => { pageErrors++ })

// ------------------------------------------------------------ attract ----
{
    const a = await probe()
    r.check('loads in attract mode', a.screen === 'attract', a.screen)
    await sleep(1200)
    const b = await probe()
    r.check('attract demo drives itself', b.demo && b.demo.tick > a.demo.tick + 20, `${a.demo?.tick} -> ${b.demo?.tick}`)
    r.check('attract plays a real match (not an idle board)', b.demo.tick > 0, JSON.stringify(b.demo))
}

// ------------------------------------------------------ start + move ----
{
    await page.keyboard.press('Digit1')
    await sleep(250)
    const a = await probe()
    r.check('1 starts the solo duel', a.screen === 'play' && a.mode === '1p', a.screen)
    const x0 = a.p1.x
    await page.keyboard.down('ArrowRight')
    await sleep(500)
    await page.keyboard.up('ArrowRight')
    await sleep(120)
    const b = await probe()
    r.check('held ArrowRight walks P1 right (real keys)', b.p1.x > x0 + 20, `${x0.toFixed(0)} -> ${b.p1.x.toFixed(0)}`)

    // the drawn sprite must be where the sim says it is
    const lit = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-archery-stage]')
        const x = window.__archeryTest.probe().p1
        const g = c.getContext('2d')
        const s = c.width / (20 * 24)
        const px = Math.round(x.x * s), py = Math.round(x.y * s)
        let count = 0
        const d = g.getImageData(Math.max(0, px - 8), Math.max(0, py - 10), 16, 20).data
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 2] < 130) count++
        return count
    })
    r.check('the archer is PAINTED at his logical position', lit > 20, `${lit} red pixels at (p1.x, p1.y)`)

    const y0 = (await probe()).p1.y
    await page.keyboard.down('ArrowUp')
    let minY = y0
    for (let k = 0; k < 12; k++) { await sleep(60); const s = await probe(); minY = Math.min(minY, s.p1.y) }
    await page.keyboard.up('ArrowUp')
    r.check('UP jumps — UP is the jump the title card promises', minY < y0 - 10, `${y0.toFixed(0)} -> ${minY.toFixed(0)}`)
    await sleep(600)
}

// ------------------------------------------------------ draw + loose ----
{
    // #2381 the walk/jump phase above ate ~2.6 s of real time, so bot0
    // (flat-shot since #1707/#2307) has already loosed and its arrow lands
    // mid-phase: a dead archer cannot charge (charge 0.00, quiver 6->6).
    // Restart the duel at the top of this phase so the charge lands at low
    // ticks, before the bot's first arrow reaches home. startPlay() is
    // synchronous — the 900 ms restart lock is key-handler-only — and the
    // fresh duel is already on 'play', so the next RAF steps it. Harness-
    // only: the sim and the bot stay honest.
    await page.evaluate(() => window.__archeryTest.start('1p', 0))
    const a = await probe()
    await page.keyboard.down('Space')
    await sleep(350)
    const mid = await probe()
    r.check('holding SPACE charges a draw', mid.p1.charge > 0.25, mid.p1.charge.toFixed(2))
    await page.keyboard.up('Space')
    await sleep(120)
    const b = await probe()
    // count arrows the PLAYER loosed by id — a census of the sky is not a
    // receipt, the bot has arrows up there too
    const seen = new Set(a.arrows.map((x) => x.id))
    const mine = b.arrows.filter((x) => x.owner === 0 && !seen.has(x.id))
    // #1739 economy-aware: the pull-back (#1685/#1707) is gated on a NON-full
    // quiver, so the release press itself opens the slot and a stuck arrow at
    // the feet is pulled on the very next tick — 6→5→6 before any scalar
    // sample. The provable statement is the identity: quiver moved by exactly
    // -1 per arrow loosed +1 per receipt (pull/dryout/resupply). Drop the
    // quiver-- line and this gate reddens directly, not just the ledger.
    const rc = b.p1.receipts - a.p1.receipts
    r.check('releasing looses YOUR arrow (exact accounting: one loosed, quiver net of receipts)', b.p1.alive && b.p1.quiver === a.p1.quiver - mine.length + rc && mine.length >= 1, `q ${a.p1.quiver}->${b.p1.quiver} loosed ${mine.length} receipts +${rc} new ${JSON.stringify(mine)}`)
    // the stuck chain: wait for an arrow to be in the terrain and painted
    let paintedStuck = 0
    for (let k = 0; k < 40 && !paintedStuck; k++) {
        await sleep(150)
        const s = await probe()
        if (s.stuck > 0) {
            paintedStuck = await page.evaluate(() => {
                const c = document.querySelector('canvas[data-archery-stage]')
                const st = window.__archeryTest.probe()
                void st
                const g = c.getContext('2d')
                const d = g.getImageData(0, 0, c.width, c.height).data
                let n = 0
                for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] > 140 && d[i + 2] < 110) n++
                return n
            })
        }
    }
    r.check('a stuck arrow is painted as terrain', paintedStuck > 0, `${paintedStuck} amber pixels incl. stuck shafts`)
}

// ---------------------------------------------- bot plays, game moves ----
{
    const a = await probe()
    await page.evaluate(() => window.__archeryTest.drive(600))
    await sleep(300)
    const b = await probe()
    r.check('the bot archer actually fights (it moves and shoots)', b.p2.x !== a.p2.x || b.p2.quiver !== a.p2.quiver, JSON.stringify([a.p2.x, a.p2.quiver]) + ' -> ' + JSON.stringify([b.p2.x, b.p2.quiver]))
    r.check('the arrow ledger is exact in the browser too', b.ledger.now === b.ledger.total, JSON.stringify(b.ledger))
    // #2565 fletching, both seats at once: the bot duel keeps shafts of BOTH
    // owners in the terrain — every sampled tail must carry its owner's barbs,
    // proving the tint tracks the shooter, not the surface. The duel keeps
    // running live, so poll a few windows for the both-owners frame.
    let fletchBots = []
    let fOkBots = false
    for (let k = 0; k < 8 && !fOkBots; k++) {
        fletchBots = await fletchScan()
        fOkBots = fletchOk(fletchBots, true)
        if (!fOkBots) await sleep(150)
    }
    r.check('stuck shafts wear owner-tinted fletching — red for P1, cyan for P2 (#2565)', fOkBots, JSON.stringify(fletchBots))
    const rc = await page.evaluate(() => window.__archeryTest.replayCheck())
    r.check('live replay of the input stream hashes identical', rc && rc.match,
        rc && `${rc.live} vs ${rc.replay} tick ${rc.tick}/${rc.twinTick} p1 ${JSON.stringify(rc.liveP1)} vs ${JSON.stringify(rc.twinP1)} stuck ${rc.liveStuck.length}/${rc.twinStuck.length}`)
}

// ------------------------------------------- pause / die / restart ----
{
    await page.keyboard.down('Shift')
    await page.keyboard.press('Slash') // the real '?': shift+/
    await page.keyboard.up('Shift')
    await sleep(200)
    const pausedTxt = await page.evaluate(() => document.body.textContent.includes('RESUME GAME'))
    r.check('? opens the pause overlay (real keys)', pausedTxt)
    await page.keyboard.down('Shift')
    await page.keyboard.press('Slash')
    await page.keyboard.up('Shift')
    await sleep(200)
    const resumedTxt = await page.evaluate(() => !document.body.textContent.includes('RESUME GAME'))
    r.check('? again resumes play', resumedTxt)

    // walk the match to its REAL end through driven real ticks
    await page.evaluate(async () => {
        const t = window.__archeryTest
        for (let k = 0; k < 80 && t.probe().screen === 'play'; k++) t.drive(120)
    })
    const ov = await probe()
    r.check('a real match ENDS and shows the result', ov.screen === 'over', `${ov.screen} ${JSON.stringify(ov.scores)}`)
    r.check('every kill made the board flinch (#2565 kill juice receipt)', (ov.juice || {}).kills >= 3, `kills=${(ov.juice || {}).kills}`)
    await sleep(1000)
    await page.keyboard.press('KeyR')
    await sleep(250)
    const re = await probe()
    r.check('R restarts a fresh duel', re.screen === 'play' && re.scores.join() === '0,0', `${re.screen} ${re.scores.join()}`)
}

// ------------------------------------------------- climb juice (#2314) ----
{
    // juice is DERIVED from the sim's grounded transitions — the sim stays
    // pure, the component owns the dust. Receipt: drive real step() ticks
    // (both seats on the proven skill-1 brain, which climbs arena 0), and a
    // landing inside a 30-tick chunk MUST still be wearing its puff when the
    // chunk's probe lands (puff life 42 > chunk 30, and the probe runs in
    // the same evaluate — no RAF tick can age it out in between).
    const res = await page.evaluate(() => {
        const t = window.__archeryTest
        let seenPuff = false, landed = 0, blocked = 0
        for (let k = 0; k < 40; k++) {
            if (t.probe().screen !== 'play') break
            t.drive(30)
            const j = t.probe().juice
            if (j.landings > landed && j.puffs > 0) seenPuff = true
            landed = j.landings; blocked = j.blocked
        }
        return { seenPuff, landed, blocked, over: t.probe().screen !== 'play' }
    })
    r.check('landings are counted through a real match', res.landed > 0, `landings=${res.landed}`)
    r.check('a climb landing puffs dust at the feet (derived, not scripted)', res.seenPuff, `landings=${res.landed} puff=${res.seenPuff}`)
    if (res.blocked > 0) console.log(`  (head-bumps tocked: ${res.blocked})`)
}

// ------------------------------------------- heat — dry spells bake (#2377) ----
{
    // Fresh duel, bot-driven until cover exists. Phases are SEPARATE
    // evaluates with real sleeps between — getImageData reads the PAINTED
    // canvas, and the paint only runs on RAF, so a synchronous probe-and-
    // sample pair would grade the previous frame.
    const setup = await page.evaluate(() => {
        const t = window.__archeryTest
        t.start('1p', 0)
        const p0 = t.probe()
        for (let k = 0; k < 40 && t.probe().stuck === 0 && t.probe().screen === 'play'; k++) t.drive(15)
        const c = t.probe().stuckCells[0] || null
        return { startDry: p0.dryTicks, startHeat: p0.heat, cell: c ? { x: c.x, y: c.y } : null }
    })
    await sleep(250)   // a cool frame of the stuck cell must reach the canvas
    const coolPx = await page.evaluate(({ cell }) => {
        if (!cell) return -1
        const g = document.querySelector('canvas[data-archery-stage]').getContext('2d')
        const d = g.getImageData(Math.max(0, cell.x - 10), Math.max(0, cell.y - 10), 20, 20).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 110 && d[i + 1] < 90 && d[i + 2] < 90) n++
        return n
    }, { cell: setup.cell })
    await page.evaluate(() => { const t = window.__archeryTest; t.forceHeat(); t.drive(3); return t.probe().heat })
    await sleep(250)   // let RAF paint the fire
    const hotState = await page.evaluate(() => {
        const p = window.__archeryTest.probe()
        return { heat: p.heat, cell: p.stuckCells[0] || null }
    })
    const hotPx = await page.evaluate(({ cell }) => {
        if (!cell) return -1
        const g = document.querySelector('canvas[data-archery-stage]').getContext('2d')
        const d = g.getImageData(Math.max(0, cell.x - 10), Math.max(0, cell.y - 10), 20, 20).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 110 && d[i + 1] < 90 && d[i + 2] < 90) n++
        return n
    }, { cell: hotState.cell || setup.cell })
    // first blood cools: drive() seats the autopilot at SEAT 1, so first
    // blood is usually P1's — watch BOTH scores, not just the bot's.
    const scoreBefore = await page.evaluate(() => window.__archeryTest.probe().scores.reduce((a, b) => a + b, 0))
    await page.evaluate(() => {
        const t = window.__archeryTest
        for (let k = 0; k < 20 && t.probe().heat && t.probe().screen === 'play'; k++) t.drive(20)
    })
    const coolP = await page.evaluate(() => window.__archeryTest.probe())
    r.check('the duel starts cool, dry spell counted from zero', setup.startHeat === false && setup.startDry >= 0 && setup.startDry < 450, JSON.stringify({ heat: setup.startHeat, dry: setup.startDry }))
    r.check('the forced dry spell heats the arena through a real tick', hotState.heat === true, `dry-forced, heat=${hotState.heat}`)
    r.check('hot cover is PAINTED red where cool cover was amber', coolPx >= 0 && hotPx > coolPx + 15, `hot px ${coolPx} -> ${hotPx} in the stuck cell`)
    r.check('first blood cools the arena in the browser too', coolP.heat === false && coolP.scores.reduce((a, b) => a + b, 0) > scoreBefore, `scores ${scoreBefore}->${coolP.scores.join()} heat=${coolP.heat}`)
}

// ------------------------------ telegraph receipts in the live shell (#2385) ----
{
    // derive-only receipts: fx must be visible on the probe, and an honest
    // bot duel (longest dry spell 275, archerycheck pins it) must NEVER ring
    // the telegraph here either — the bell is stalemate-only by law.
    const res = await page.evaluate(() => {
        const t = window.__archeryTest
        t.start('1p', 0)
        // warnNotes is a session accumulator (resetJuice re-arms the latch but
        // the counter spans matches): RAF stretches between earlier evaluates
        // drove seat 1 human-idle vs seat 2's bot — a legitimate stalemate
        // that may ring the bell by design. Sample the DELTA across THIS pure
        // bot stream, not the session lifetime (the lodeplay #2553 lesson).
        const warnBase = t.probe().fx ? t.probe().fx.warnNotes : 0
        let warn = -1
        for (let k = 0; k < 40 && t.probe().screen === 'play'; k++) {
            t.drive(30)
            const fx = t.probe().fx
            if (fx) warn = fx.warnNotes - warnBase
        }
        const p = t.probe()
        return { hasFx: !!p.fx, warn, dryFx: p.fx ? p.fx.dryFx : -1, screen: p.screen }
    })
    r.check('the shell exposes #2385 fx receipts on the probe', res.hasFx && res.dryFx >= 0 && res.warn >= 0, JSON.stringify(res))
    r.check('an honest tempo never rings the heat telegraph', res.warn === 0, `warnNotes=${res.warn} (driven to ${res.screen})`)
}

// ------------------------------------------------- DUEL — seat two (#2558) ----
{
    // The gap this session closes: `archeryplay` drives P1 only. Reload to the
    // marquee, seat TWO humans, and drive seat 2 with real WASD+F keystrokes.
    // Geometry (CROSSGLOVE): P1 spawn centre x=132, P2 x=300, both centres at
    // y=280 with the floor top 8 px below — a flat shaft self-fires into the
    // floor after v·t ≈ 88 px at full charge, which is why every seat-2 hit
    // here is taken at ~70 px, the range the physics actually grants.
    await page.reload()
    await page.waitForFunction(() => window.__archeryTest)
    await sleep(250)
    await page.keyboard.press('Digit2')
    await sleep(250)
    const seat = await probe()
    r.check('2 seats a two-human duel (no bot at seat 2)', seat.screen === 'play' && seat.mode === '2p', `${seat.screen}/${seat.mode}`)
    const hud2 = await page.evaluate(() => document.body.textContent.includes('P2 0'))
    r.check('the HUD re-names the seat: P2, not BOT', hud2)

    // #2565 item 3 — DUEL CEREMONY: the board announces a two-seat match
    // before it lets the duel begin. The world HOLDS (ticks delayed, never
    // skipped), seat pings ring in the seats' own pitches (the #2565 loose
    // split 320/390 — readable by ear), chips name the archers, DRAW! lands,
    // and the release hands the board over.
    {
        const cer0 = await probe()
        r.check('the duel holds the board for its ceremony, seat 1 rings first',
            cer0.ceremony.pings[0] === 1 && cer0.tick <= 2,
            `ms ${cer0.ceremony.ms} pings ${JSON.stringify(cer0.ceremony.pings)} tick ${cer0.tick}`)
        await sleep(Math.max(0, cer0.ceremony.ms - 150))
        const cer1 = await probe()
        r.check('seat pings ring P1 then P2 and the DRAW beat lands',
            cer1.ceremony.pings[0] === 1 && cer1.ceremony.pings[1] === 1 && cer1.ceremony.draw === 1,
            JSON.stringify(cer1.ceremony))
        const cerPx = await ceremonyScan()
        r.check('the ceremony is PAINTED — P1/P2 chips and DRAW across the board',
            cerPx.p1 >= 4 && cerPx.p2 >= 4 && cerPx.gold >= 30, JSON.stringify(cerPx))
        await sleep(260)
        const cer2 = await probe()
        r.check('DRAW releases the board — the duel runs',
            cer2.ceremony.ms === 0 && cer2.tick > 0, `ms ${cer2.ceremony.ms} tick ${cer2.tick}`)
    }

    // No second on-screen touchpad (AGENTS.md multiplayer law). The retired pad
    // was the ONLY pad rendering glyph buttons (◀▲▼▶ + J); the P1 pad is SVG.
    const pads = await page.evaluate(() => {
        const glyph = (b) => ['◀', '▲', '▼', '▶', 'J'].includes((b.textContent || '').trim())
        return [...document.querySelectorAll('button')].filter(glyph).length
    })
    r.check('no second touchpad on screen — duel is the keyboard option (#2558)', pads === 0, `second-pad glyph buttons found: ${pads}`)

    // Bot-vacated proof: the basic bot LOOSES within ~0.5 s of a duel start
    // (it fires whenever the foe is within 240 px, and spawns 168 px apart).
    // Two idle humans must still hold full quivers after 1.2 s.
    const i0 = await probe()
    await sleep(1200)
    const i1 = await probe()
    r.check('seat 2 is human: quivers stay full untouched (a bot would be loosing)',
        i1.p1.quiver === 6 && i1.p2.quiver === 6 && i1.arrows.length === 0,
        `q ${i1.p1.quiver}/${i1.p2.quiver} arrows ${i1.arrows.length}`)

    // seat-2 locomotion
    const w0 = i1.p2.x
    await page.keyboard.down('KeyA')
    await sleep(600)
    await page.keyboard.up('KeyA')
    await sleep(120)
    const w1 = await probe()
    r.check('held KeyA walks P2 left (real keys)', w1.p2.x < w0 - 20, `${w0.toFixed(0)} -> ${w1.p2.x.toFixed(0)}`)
    const litP2 = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-archery-stage]')
        const x = window.__archeryTest.probe().p2
        const g = c.getContext('2d')
        const s = c.width / (20 * 24)
        const px = Math.round(x.x * s), py = Math.round(x.y * s)
        let count = 0
        const d = g.getImageData(Math.max(0, px - 8), Math.max(0, py - 10), 16, 20).data
        for (let i = 0; i < d.length; i += 4) if (d[i] < 130 && d[i + 1] > 150 && d[i + 2] > 150) count++
        return count
    })
    r.check('seat 2 is PAINTED at his logical position', litP2 > 20, `${litP2} cyan pixels at (p2.x, p2.y)`)
    const jy0 = (await probe()).p2.y
    await page.keyboard.down('KeyW')
    let jMinY = jy0
    for (let k = 0; k < 12; k++) { await sleep(60); const s = await probe(); jMinY = Math.min(jMinY, s.p2.y) }
    await page.keyboard.up('KeyW')
    r.check('W jumps P2 too (both seats share the stick)', jMinY < jy0 - 10, `${jy0.toFixed(0)} -> ${jMinY.toFixed(0)}`)
    await sleep(500)

    // NO DUD AT THE FEET (this stage's sim fix, proven on the live board): a
    // jump press zeroes the aim X ("straight up is a jump"), and a release
    // with no direction keys zeroes the aim Y — together they used to hand
    // looseArrow the vector (0,0): a shaft spawning at the body with zero
    // velocity, fizzling into the floor and pulling back (+1 receipt). TowerFall
    // always fires: the fix looses toward the facing. Proof: after a released
    // draw at zero aim the quiver is down EXACTLY one and no receipt moved —
    // the shaft flew downrange, it did not fizzle and come home.
    const d0 = await probe()
    const dMaxId = Math.max(0, ...d0.arrows.map((a) => a.id))
    await page.keyboard.down('KeyF')
    await sleep(220)
    await page.keyboard.up('KeyF')
    await sleep(250)
    const d1 = await probe()
    const dArrow = d1.arrows.filter((a) => a.owner === 1 && a.id > dMaxId)[0]
    r.check('a direction-free release fires toward the facing — no dud at the feet',
        !!dArrow && dArrow.x < d1.p2.x - 8 && d1.p2.quiver === d0.p2.quiver - 1 && d1.p2.receipts === d0.p2.receipts,
        `${dArrow ? `#${dArrow.id}@x${dArrow.x} vs shooter x${Math.round(d1.p2.x)} (P2 faces left)` : 'no shaft at all'} q ${d0.p2.quiver}->${d1.p2.quiver} rc ${d0.p2.receipts}->${d1.p2.receipts}`)

    // ONE TICK, TWO HUMANS: Space and KeyF released together — two shafts born
    // the same tick, P1's numbered first (the stamp order, visible in pixels).
    // At the 168 px spawn gap both arcs land short on the floor (flat range is
    // v·t), so the exchange is a draw by physics — and leaves cover to pull.
    const q0 = await probe()
    await page.keyboard.down('Space')
    await page.keyboard.down('KeyF')
    await sleep(300)
    await page.keyboard.up('Space')
    await page.keyboard.up('KeyF')
    await sleep(120)
    const stamp = await probe()
    const newArrows = stamp.arrows.filter((a) => a.born >= q0.tick)
    const b0 = newArrows.filter((a) => a.owner === 0)
    const b1 = newArrows.filter((a) => a.owner === 1)
    const sameTick = b0.length === 1 && b1.length === 1 && b0[0].born === b1[0].born && b1[0].id === b0[0].id + 1
    r.check('both humans loose the SAME tick, P1 stamped first', sameTick,
        JSON.stringify(newArrows.map((a) => `#${a.id} p${a.owner + 1}@${a.born}`)))
    r.check('both seats loosed (seat-keyed release receipts, #2565)',
        stamp.fx.seatLoose[0] >= 1 && stamp.fx.seatLoose[1] >= 1,
        JSON.stringify(stamp.fx.seatLoose))

    // the pull economy runs at seat 2 too: the exchange's flat shafts land on
    // the floor just ahead (~84 px, the range the physics grants) and stick in
    // the walk row; walking P2 over one must move P2's receipts — P1 never
    // moved, so any other pull would be the bot's ghost.
    await sleep(500)                      // the shafts come home first

    // Fletching at seat-two too (the strict both-owners proof runs in the
    // bot match above): whatever shafts this exchange leaves stuck — the
    // crossing lanes knock each other — every one must wear its owner tint.
    const fletch = await fletchScan()
    r.check('stuck shafts wear owner-tinted fletching (duel seats, #2565)',
        fletchOk(fletch, false), JSON.stringify(fletch))
    const r0 = await probe()
    await page.keyboard.down('KeyA')
    await sleep(900)
    await page.keyboard.up('KeyA')
    await sleep(150)
    const r1 = await probe()
    r.check('P2 pulls stuck arrows walking over them (seat-2 economy)',
        r1.p2.receipts > r0.p2.receipts && r1.p1.receipts === r0.p1.receipts && r1.stuck < r0.stuck,
        `p2 receipts ${r0.p2.receipts}->${r1.p2.receipts}, stuck ${r0.stuck}->${r1.stuck}`)

    // drive home the win: nudge — measure, not guess — into a clear lane ~55 px
    // right of P1's respawn (P1 centre x=132, bodies share cells, so the park
    // band 140–165 keeps the leftward lane free of the shooter's own stuck
    // shafts, which would knock out the draw). Full draws into P1's spawn, and
    // the duel ends for PLAYER 2. Each victim gets the honest 75-tick respawn
    // and 45-tick invulnerability; the loop waits them out (4.3 s per kill).
    for (let n = 0; n < 8; n++) {
        const s = await probe()
        const dx = s.p2.x - 155
        if (Math.abs(dx) < 8) break
        const key = dx > 0 ? 'KeyA' : 'KeyD'
        await page.keyboard.down(key)
        await sleep(Math.min(400, Math.abs(dx) * 12))
        await page.keyboard.up(key)
        await sleep(120)
    }
    await sleep(120)
    let duel = await probe()
    let kills = 0
    const flinches = []
    for (let round = 0; round < 5 && duel.scores[1] < 3; round++) {
        await page.keyboard.down('KeyF')
        await sleep(1000)
        await page.keyboard.up('KeyF')
        // poll fast so the ~130 ms shake window of the kill lands inside a
        // sample: flinch = the stepped screen-shake counter, > 0 right after
        // the sim tick that scored (hitstop + killFx arm in the same frame).
        let hit = duel
        for (let k = 0; k < 20; k++) {
            await sleep(25)
            hit = await probe()
            flinches.push(hit.juice.shake)
            if (hit.scores[1] > duel.scores[1]) break
        }
        if (hit.scores[1] > duel.scores[1]) kills++
        duel = hit
        if (duel.scores[1] < 3) await sleep(4300) // respawn + invulnerability
    }
    r.check('seat 2 scores the hits (P1 keeps falling, P2 keeps scoring)', kills >= 3 && duel.scores[1] === 3, JSON.stringify(duel.scores))
    r.check('the board visibly flinches when P1 falls (live screen shake, #2565)',
        flinches.length > 0 && Math.max(...flinches) > 0, `max shake=${flinches.length ? Math.max(...flinches) : '-'}`)
    await sleep(300)
    const fin = await probe()
    r.check('the duel ends with PLAYER 2 TAKES THE ARENA', fin.screen === 'over' && fin.end != null, `${fin.screen} ${JSON.stringify(fin.scores)}`)
    const endTxt = await page.evaluate(() => document.body.textContent.includes('PLAYER 2 TAKES THE ARENA'))
    r.check('the result screen credits seat 2', endTxt)

    // and the dual-driven stream is still honest: replay reproduces the whole
    // two-human duel hash-for-hash (both seats were stamped into cmds all along)
    const rc2 = await page.evaluate(() => window.__archeryTest.replayCheck())
    r.check('the two-human duel replays hash-identical', rc2 && rc2.match, rc2 && `${rc2.live} vs ${rc2.replay} tick ${rc2.tick}`)
}

r.check('zero page errors across the whole session', pageErrors === 0, `errors=${pageErrors}`)
r.exit(browser)
