// PAPERS, PLEASE-MIN — Chrome plays the booth with REAL key events only.
// The Node harness proved the papers; this proves the booth: that the key
// path reaches the sim, that the drawn stamp matches the verdict the sim
// gave, that the wrong call leaves a mark on the wall, and that the week
// ends the way the prover says it must.
//
//   npm run papersplay     (needs `npm run dev`)
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.PP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/papers-please`
await requireDevServer(URL)

const r = new Report('papersplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 880, height: 620 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => !!window.__ppTest)) break
    await page.waitForTimeout(200)
}
r.check('the __ppTest hook is live', await page.evaluate(() => !!window.__ppTest))

const probe = async () => {
    for (let i = 0; i < 30; i++) {
        const p = await page.evaluate(() => window.__ppTest ? window.__ppTest.probe() : null)
        if (p && p.view) return p
        await wait(60)
    }
    throw new Error('__ppTest vanished')
}
const wait = (ms) => page.waitForTimeout(ms)
// the stamp lives over the papers: sample its window, green in = admitted,
// red in = denied. One pixel on a rotated stroke would lie; a window does not.
const stampPix = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-pp-stage]')
    if (!c) return null
    const d = c.getContext('2d').getImageData(416, 66, 180, 90).data
    let green = 0, red = 0
    for (let i = 0; i < d.length; i += 4) {
        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
        if (gg > 120 && gg > rr + 30 && gg > bb + 30) green++
        if (rr > 140 && rr > gg + 50 && rr > bb + 40) red++
    }
    return { green, red }
})

// 1 — attract: the proven week stamps itself without a single key
await wait(3200)
let s = await probe()
r.check('attract mode is showing', s && s.screen === 'attract')
const lit = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-pp-stage]')
    if (!c) return 0
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 40) n++
    return n
})
r.check(`attract booth is not black (${lit} lit samples)`, lit > 400)
const seen = (await probe()).view.person.pic
await wait(2600)
const seen2 = (await probe()).view.person.pic
r.check('the demo stamps entrants WITHOUT any key (the proven week, not a still frame)', seen !== seen2, `${seen} -> ${seen2}`)

// 2 — one key into the booth; the REAL verdict, ADMITTED by real key
await page.keyboard.press('Digit1')
await wait(400)
s = await probe()
r.check('pressing 1 opens day 1 (seed 0)', s.screen === 'play' && s.day === 1 && s.idx === 0)
const v0 = await page.evaluate(() => window.__ppTest.verdict())
r.check(`day 1 has a decidable verdict (${v0})`, v0 === 'approve' || v0 === 'deny')
await page.keyboard.press(v0 === 'approve' ? 'a' : 'd')
await wait(150)
let after = await probe()
r.check(`the RIGHT call stamped (${v0}) and scored: strikes ${after.strikes} score ${after.score}`, after.strikes === 0 && after.score === 1 && after.idx === 1)
let px = await stampPix()
if (v0 === 'approve') r.check(`APPROVED paints GREEN on the papers ${JSON.stringify(px)}`, px.green > 40 && px.red === 0)
else r.check(`DENIED paints RED on the papers ${JSON.stringify(px)}`, px.red > 40 && px.green === 0)
r.check('the stamped document is the one just judged (the name in last is on screen)',
    (await probe()).last.name === (s.view.person.passport ? s.view.person.passport.name : 'NO PAPERS'),
    `${(await probe()).last && (await probe()).last.name}`)

// 3 — the WRONG call: real key, red stamp, a strike on the wall, a witness named
const v1 = await page.evaluate(() => window.__ppTest.verdict())
await page.keyboard.press(v1 === 'approve' ? 'd' : 'a')
await wait(150)
after = await probe()
r.check(`the WRONG call took a strike (strikes ${after.strikes}) and named the witness (${after.last.why})`,
    after.strikes === 1 && after.last.ok === false && after.last.why.length > 2)
// a mistake frames the whole document in red — the grade window widens
// with it, so a shrunken frame (or a missing witness mark) cannot pass
px = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-pp-stage]')
    const d = c.getContext('2d').getImageData(352, 36, 308, 238).data
    let green = 0, red = 0
    for (let i = 0; i < d.length; i += 4) {
        const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
        if (gg > 120 && gg > rr + 30 && gg > bb + 30) green++
        if (rr > 140 && rr > gg + 50 && rr > bb + 40) red++
    }
    return { green, red }
})
r.check(`a mistake frames the papers in red ${JSON.stringify(px)}`, px.red > 300)

// 4 — the rest of day 1 honestly: the rulebook grows the next morning
const nextDay = await page.evaluate(() => window.__ppTest.runDay())
await wait(200)
s = await probe()
r.check(`day 1 cleared by the honest path — the line moved to day ${nextDay}`, nextDay === 2 && s.day === 2)
r.check('the rulebook grew: day 2 prints 4 rules', s.rules.length === 4, s.rules.join(','))
r.check('the day banner spoke on the canvas', s.banner && /DAY 2/.test(s.banner.text), s.banner && s.banner.text)
r.check('the strikes reset with the morning', s.strikes === 0)

// 5 — three mistakes and the day is over: DEMOTED, then one key home
const v2 = await page.evaluate(() => window.__ppTest.verdict())
await page.keyboard.press(v2 === 'approve' ? 'd' : 'a')
await wait(120)
for (let i = 0; i < 2 && !(await probe()).end; i++) {
    const v = await page.evaluate(() => window.__ppTest.verdict())
    await page.keyboard.press(v === 'approve' ? 'd' : 'a')
    await wait(120)
}
s = await probe()
r.check(`pure chaos ends the day: ${s.end} — ${s.why}`, s.end === 'lose' && s.day === 2)
await wait(1100)
await page.keyboard.press('Space')
await wait(300)
r.check('one key returns to the attract booth', (await probe()).screen === 'attract')

// 6 — the perfect inspector again: a full week, real verdicts, victory
await page.keyboard.press('Digit3')
await wait(300)
await page.evaluate(() => window.__ppTest.runToEnd())
s = await probe()
r.check(`seed 2 survived the whole week (score ${s.score}, caught ${s.caught})`, s.end === 'win' && s.day === 7 && s.score > 50)

// 7 — PORTRAIT (#1938): the photo on the paper against the face at the
// counter, proven with pixels from the SAME drawFace the booth paints with.
// Honest papers render byte-identical faces (total 0); every forged photo
// lights the band of its broken feature — the evidence string is pixels.
await wait(1100)
await page.keyboard.press('Space')            // home from the win screen
await wait(300)
await page.keyboard.press('Digit1')          // seed 0 — PORTRAIT rides the day-1 wall
await wait(400)
s = await probe()
r.check('PORTRAIT prints on the day-1 wall', s.rules.includes('PORTRAIT'), s.rules.join(','))
// Walk past the first two documents (the no-papers and ALLOWED violators),
// then let the stamp tick out — every pixel gate after this samples a LIVE
// booth, never a stamping frame. The live entrant is now the day-1
// PORTRAIT forger: its forged mini face must be painted on the passport.
for (let i = 0; i < 2; i++) {
    const v = await page.evaluate(() => window.__ppTest.verdict())
    await page.keyboard.press(v === 'approve' ? 'a' : 'd')
    await wait(140)
}
await wait(700)
s = await probe()
r.check('the stamp has ticked out before pixel sampling', !s.stamp || s.stamp.ticks <= 0, JSON.stringify(s.stamp))
const paint = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-pp-stage]')
    const d = c.getContext('2d').getImageData(588, 64, 66, 76).data   // PAPERS+PHOTO box
    let n = 0, beige = 0
    for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
        if (k === 0xd8d2b8 || k === 0xc9c2a4) beige++                  // paper / frame
        else n++
    }
    // #1972 zoom-crop proof: longest non-beige run across the head's widest
    // row (canvas y=100 = frame center). The old flat-0.6 head measured
    // ~41px wide even at its widest (narrow) cut — the 0.75 crop with ears
    // measures 47 (narrow) to 57 (wide). 44 separates new from old.
    let run = 0, best = 0
    for (let x = 0; x < 66; x++) {
        const i = (36 * 66 + x) * 4
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
        if (k !== 0xd8d2b8 && k !== 0xc9c2a4) { run++; best = Math.max(best, run) } else run = 0
    }
    return { n, beige, headRun: best }
})
r.check(`the passport carries a painted photo (${paint.n} face px in a ${paint.beige} px beige frame)`,
    paint.n > 250 && paint.beige > 100)
r.check(`the photo is a zoom-crop — head reads ${paint.headRun}px across (flat-0.6 read <=41)`, paint.headRun >= 44)
let sawForge = 0, sawHonest = 0, bandFails = 0
const art = { browMax: 0, browMin: 1e9, mouthMax: 0, mouthMin: 1e9, whitesMax: 0, sawBare: false }
for (let guard = 0; guard < 12 && s.day === 1 && !s.end; guard++) {
    const pp = await page.evaluate(() => {
        const t = window.__ppTest
        const p = t.probe().view.person
        if (!p.passport || !p.face) return null
        const FE = ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']
        const feats = FE.filter((f) => p.face[f] !== p.passport.photo[f])
        // #1972 live-portrait ink: the brow band (thin 2px vs thick 5px)
        // and the mouth band (shut bar 48px vs open block 108px), counted
        // in the exact ink color in the portrait column.
        const c = document.querySelector('canvas[data-pp-stage]')
        const ink = (x, y, w, h) => {
            const d = c.getContext('2d').getImageData(x, y, w, h).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === 0x20242e) n++
            return n
        }
        return { name: p.passport.name, feats, glasses: p.face.glasses, brow: p.face.brow, pix: t.portraitPix(), browInk: ink(300, 64, 34, 5), mouthInk: ink(310, 89, 16, 9) }
    })
    if (pp && pp.pix) {
        if (pp.feats.length === 0) { sawHonest++; if (pp.pix.total !== 0) bandFails++ }
        else { sawForge++; for (const f of pp.feats) if (!(pp.pix[f] > 0)) bandFails++ }
        art.browMax = Math.max(art.browMax, pp.browInk); art.browMin = Math.min(art.browMin, pp.browInk)
        art.mouthMax = Math.max(art.mouthMax, pp.mouthInk); art.mouthMin = Math.min(art.mouthMin, pp.mouthInk)
        art.whitesMax = Math.max(art.whitesMax, pp.pix.whites)
        if (!pp.glasses) art.sawBare = true
    }
    const v = await page.evaluate(() => window.__ppTest.verdict())
    if (pp && pp.feats.length > 0) {
        r.check(`a forged photo (${pp.feats.join(',')}) denies with its band lit ${JSON.stringify(pp.pix)}`,
            v === 'deny' && pp.pix.total > 0, pp.name)
    }
    await page.keyboard.press(v === 'approve' ? 'a' : 'd')
    await wait(140)
    s = await probe()
}
r.check(`honest papers painted ONE face (${sawHonest} papers, every total 0)`, sawHonest >= 3 && bandFails === 0, `bandFails=${bandFails}`)
r.check('day 1 staged its forger at the window', sawForge >= 1, `${sawForge}`)
// #1972 PORTRAIT-DETAIL pixel proof: the day's faces show both brow
// thicknesses and both mouth shapes on the canvas, and a bare-eyed face
// paints whites. (Open 108 vs shut 48; thick 100 vs thin 40; bare 128.)
r.check(`brows paint both thicknesses (${art.browMin}..${art.browMax} ink px)`, art.browMin < 60 && art.browMax > 60)
r.check(`mouths paint both shapes (${art.mouthMin}..${art.mouthMax} ink px)`, art.mouthMin < 80 && art.mouthMax > 80)
r.check(`eyes get whites — a bare face paints ${art.whitesMax} white px`, art.sawBare && art.whitesMax > 60)

// #1960 THE SHIFT CLOCK, live: the printed minutes move with real frames,
// a dawdled day closes the gate (banner + dock + morning rewind), and the
// finale refuses to survive an unfinished line.
{
    await page.evaluate(() => window.__ppTest.start(3))
    await wait(400)
    s = await probe()
    const m0 = s.clock.hh * 60 + s.clock.mm
    await wait(1600)
    s = await probe()
    const m1 = s.clock.hh * 60 + s.clock.mm
    r.check(`the wall clock ticks with the shift (${m0} -> ${m1})`, s.screen === 'play' && s.clock.hh === 8 && m1 > m0 && !s.clock.red, JSON.stringify(s.clock))
    const ff = await page.evaluate(() => window.__ppTest.ff(8000)) // day 1 budget is 7×SEAT = 7560 ticks
    s = await probe()
    r.check('dawdling past the shift closes the gate — day advances, nobody dies', ff.day === 2 && !ff.end && s.screen === 'play', JSON.stringify(ff))
    r.check('the GATE CLOSED banner spoke on the canvas', s.banner && /GATE CLOSED/.test(s.banner.text) && /TURNED AWAY/.test(s.banner.sub), s.banner && `${s.banner.text} | ${s.banner.sub}`)
    r.check('morning rewound a full shift after the close', s.clock.hh === 8 && s.clock.mm === 0 && s.ticksLeft > 7000, JSON.stringify({ hh: s.clock.hh, mm: s.clock.mm, left: s.ticksLeft }))
    // the finale must finish: honest days 1-6, then dawdle the day-7 line away
    await page.evaluate(() => window.__ppTest.start(1))
    for (let d = 1; d < 7; d++) await page.evaluate(() => window.__ppTest.runDay())
    const ff7 = await page.evaluate(() => window.__ppTest.ff(13 * 1080 + 10))
    r.check(`the unfinished finale is a quota loss: ${ff7.why}`, ff7.end === 'lose' && /QUOTA UNMET/.test(ff7.why || ''), JSON.stringify(ff7))
    await wait(1200)
    await page.keyboard.press('a') // leave the over screen
}

// #1966 THE PURSE, live: a correct stamp pays, the night settles onto a
// printed slip, the slip is PIXELS on the booth — and a booth that works
// nobody and sleeps twice in the cold loses the week to money, not strikes.
{
    const cfg = await page.evaluate(() => window.__ppTest.cfg)
    r.check(`pay law reaches the booth (PAY ${cfg.PAY}, SOUP ${cfg.SOUP}, HEAT ${cfg.HEAT}, RENT ${Object.entries(cfg.RENTS)})`,
        cfg.PAY === 5 && cfg.SOUP === 3 && cfg.HEAT === 3 && cfg.RENTS[3] === 30 && cfg.RENTS[6] === 45)
    // one honest day: night 1's bills come off the payroll
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    await page.evaluate(() => window.__ppTest.runDay())
    await wait(250)
    s = await probe()
    r.check(`night 1 settles onto the slip: CR ${s.credits} = ${cfg.PAY}×${s.score} − ${cfg.SOUP + cfg.HEAT}`,
        s.credits === cfg.PAY * s.score - cfg.SOUP - cfg.HEAT
        && s.slip && s.slip.day === 1 && s.slip.soup === cfg.SOUP && s.slip.heat === cfg.HEAT && !s.slip.hungry,
        JSON.stringify({ credits: s.credits, score: s.score, slip: s.slip }))
    // the deduction slip is painted paper on the booth — beige field, ink rows
    const slipPix = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-pp-stage]')
        const d = c.getContext('2d').getImageData(452, 304, 202, 88).data
        let paper = 0, ink = 0
        for (let i = 0; i < d.length; i += 4) {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
            if (k === 0xd8d2b8) paper++
            else if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 110 && d[i] + d[i + 1] + d[i + 2] > 40) ink++
        }
        return { paper, ink }
    })
    r.check(`the deduction slip prints (${slipPix.paper} paper px, ${slipPix.ink} ink px)`, slipPix.paper > 500 && slipPix.ink > 40, JSON.stringify(slipPix))
    // no work, two nights: the apartment wins over the quota arithmetic
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(200)
    const ffn1 = await page.evaluate(() => window.__ppTest.ff(7560))   // day 1 budget, zero stamps
    r.check(`night one unpaid only marks the booth hungry (${ffn1.why || 'alive'})`, !ffn1.end && ffn1.credits === 0, JSON.stringify(ffn1))
    const ffn2 = await page.evaluate(() => window.__ppTest.ff(8640))   // day 2 budget, still zero
    r.check(`two nights without soup starves the stampless booth: ${ffn2.why}`, ffn2.end === 'lose' && /STARVED/.test(ffn2.why || ''), JSON.stringify(ffn2))
    await wait(1100)
    await page.keyboard.press('a') // leave the over screen
    // glory carries the purse: the proven week ends at 233 credits
    await page.keyboard.press('Digit3')
    await wait(300)
    await page.evaluate(() => window.__ppTest.runToEnd())
    s = await probe()
    r.check(`the survived week counts its money: CR ${s.credits} on night 7's slip`,
        s.end === 'win' && s.credits === 70 * cfg.PAY - (7 * (cfg.SOUP + cfg.HEAT) + cfg.RENTS[3] + cfg.RENTS[6])
        && s.slip && s.slip.day === 7 && s.slip.balance === s.credits, JSON.stringify({ end: s.end, credits: s.credits, slip: s.slip }))
    await wait(1100)
    await page.keyboard.press('a')
}

await wait(400)
const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
