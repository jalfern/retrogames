// PAPERS, PLEASE-MIN — Chrome plays the booth with REAL key events only.
// The Node harness proved the papers; this proves the booth: that the key
// path reaches the sim, that the drawn stamp matches the verdict the sim
// gave, that the wrong call leaves a mark on the wall, and that the week
// ends the way the prover says it must.
//
//   npm run papersplay     (needs `npm run dev`)
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'
import { accFor, genWeek, wallNameAt, weekDecoyCount } from '../src/games/PapersPleaseMin/gen.js'

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
// #1891 MONTH-NAME DATES — the wall header prints OCT 27 1982, the original's
// shape: a name plus a number, decodable at a glance.
const wallDate = await page.evaluate(() => window.__ppTest.wallDate())
r.check(`the wall prints the month NAME (${wallDate}, not 1982.10.27)`, wallDate === 'OCT 27 1982', wallDate)
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
// #1891 THE STAMP SPEAKS — a deny stamps with its case attached: the witness
// line headlines the rule and the strip quotes the evidence VERBATIM.
{
    const ep = await page.evaluate(() => window.__ppTest.evidencePaint())
    if (v0 === 'deny') {
        const joined = (await probe()).last.evidence
        r.check(`a correct deny quotes its case (${ep.witness} — "${ep.evidence[0] || ''}")`,
            ep.witness === `WITNESS: ${(await probe()).last.why}` && ep.evidence.length >= 1 && ep.evidence.join('; ').startsWith(joined),
            JSON.stringify(ep))
    } else {
        r.check('a clean admit stays silent at the stamp', ep.witness === null && ep.evidence.length === 0, JSON.stringify(ep))
    }
}

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
// #1891 the missed clause is not just named, it is QUOTED — in the strip's
// evidence corridor, in red ink, next to the MISTAKE note.
{
    const ep = await page.evaluate(() => window.__ppTest.evidencePaint())
    const evidencePix = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-pp-stage]')
        const d = c.getContext('2d').getImageData(268, 404, 292, 28).data   // EVID corridor
        let red = 0
        for (let i = 0; i < d.length; i += 4) {
            const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
            if (rr > 140 && rr > gg + 50 && rr > bb + 40) red++
        }
        return red
    })
    if (after.last.verdict === 'deny') {
        r.check(`the WRONG call quotes what you missed (${ep.witness} — "${ep.evidence[0] || ''}", ${evidencePix} red px in the strip)`,
            ep.witness === `WITNESS: ${after.last.why}` && ep.evidence.length >= 1 && after.last.evidence.startsWith(ep.evidence[0]) && evidencePix > 30,
            JSON.stringify({ ep, evidencePix }))
    } else {
        r.check(`an innocent deny says the truth and quotes nothing (${ep.witness}, strip dark at ${evidencePix} red px)`,
            ep.witness === 'THEY WERE CLEAN' && ep.evidence.length === 0 && evidencePix < 10, JSON.stringify({ ep, evidencePix }))
    }
}

// 3b — #2021 THE INSPECTOR STAYS: the case a deny (or a wrong admit) prints
// does NOT fade with the ink. The same strings ride pinned while the judged
// document keeps the counter, and the inspector is dismissed the moment the
// next papers drop and land — the wall never shows yesterday's reason behind
// today's face. Timings: ink 30 ticks (≈0.5 s), pin 132 (≈2.2 s), drop 12
// (≈0.2 s) → the window closes ≈2.9 s after the press.
{
    await wait(850)                    // ≈ press+1.1 s: ink gone, pin riding
    const pinMid = await page.evaluate(() => window.__ppTest.evidencePaint())
    const want = after.last.verdict === 'deny' ? `WITNESS: ${after.last.why}` : 'THEY WERE CLEAN'
    const witnessPx = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-pp-stage]')
        const d = c.getContext('2d').getImageData(430, 284, 152, 14).data   // witness line zone
        let red = 0
        for (let i = 0; i < d.length; i += 4) {
            const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
            if (rr > 140 && rr > gg + 50 && rr > bb + 40) red++
        }
        return red
    })
    r.check(`the case stays pinned after the ink fades (${pinMid.witness}, ${witnessPx} red px)`,
        pinMid.pinned === true && pinMid.inked === false && pinMid.witness === want &&
        (after.last.verdict !== 'deny' || pinMid.evidence.join('; ').startsWith(after.last.evidence)) && witnessPx > 40,
        JSON.stringify({ pinMid, witnessPx, want }))
    await wait(2400)                 // ≈ press+3.6 s: read window closed, papers dropped and landed
    const pinEnd = await page.evaluate(() => window.__ppTest.evidencePaint())
    r.check('the pin clears when the next papers land',
        pinEnd.witness === null && pinEnd.evidence.length === 0 && pinEnd.pinned === false && pinEnd.pinTicks === -1,
        JSON.stringify(pinEnd))
}

// 4 — the rest of day 1 honestly: the rulebook grows the next morning
const nextDay = await page.evaluate(() => window.__ppTest.runDay())
await wait(200)
s = await probe()
r.check(`day 1 cleared by the honest path — the line moved to day ${nextDay}`, nextDay === 2 && s.day === 2)
r.check('the rulebook grew: day 2 prints 4 rules', s.rules.length === 4, s.rules.join(','))
r.check('the day banner spoke on the canvas', s.banner && /DAY 2/.test(s.banner.text), s.banner && s.banner.text)
r.check('the strikes reset with the morning', s.strikes === 0)
// #1891 PAPER WEIGHT on live pixels: stamp once from the harness, and watch
// the settle counter through the stamp hold — when the judged document is
// picked up the next papers must DROP (dy reaches the law's top step) and
// land back at rest. Self-contained in one evaluate: the interval starts the
// moment act() returns, so the window cannot slip between round trips.
{
    const drop = await page.evaluate(() => {
        window.__ppTest.stamp('approve')
        return new Promise((res) => {
            let m = 0, n = 0
            // #2021 the window covers BOTH hand-offs: a silent ruling drops
            // right after the ink (~0.7 s), a ruling WITH a case holds the
            // counter for the read window (~2.9 s) — either way the next
            // papers must drop and rest inside 3.4 s. The live floor is
            // -2px, not the law's -10px top: software-rendered Chrome
            // catches up 3+ sim ticks per frame, and the late hand-off
            // starts 160 ticks in, so the top step can exist only mid-frame
            // here — its exact size is Node law (paperscheck section 5).
            const iv = setInterval(() => {
                m = Math.min(m, window.__ppTest.settlePx())
                if (++n > 900) { clearInterval(iv); res({ min: m, rest: window.__ppTest.settlePx(), top: window.__ppTest.settleTop }) }
            }, 4)
        })
    })
    r.check(`new papers drop onto the counter (settle reached ${drop.min}px, rests at ${drop.rest})`,
        drop.min <= -2 && drop.rest === 0 && drop.top <= -8, JSON.stringify(drop))
}

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
// #1891: wait past the stamp hold (30 ticks) AND the settle (12 ticks) —
// 700ms landed exactly on the landing; sample only when the papers rest.
await wait(950)
s = await probe()
r.check('the stamp has ticked out before pixel sampling', !s.stamp || s.stamp.ticks <= 0, JSON.stringify(s.stamp))
const paint = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-pp-stage]')
    const d = c.getContext('2d').getImageData(588, 64, 66, 76).data   // PAPERS+PHOTO box
    // #1976 THE PRINT AGES: the photo's beige background is now an amber-washed
    // (184/185,167,123/124) — an exact-hex check would lie (the alpha byte may
    // round 76 or 77, the #1908 lesson), so aged pixels count as a family.
    const age = (r, g, b) => r >= 179 && r <= 190 && g >= 162 && g <= 172 && b >= 118 && b <= 129
    let n = 0, beige = 0, aged = 0
    for (let i = 0; i < d.length; i += 4) {
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
        if (k === 0xd8d2b8 || k === 0xc9c2a4 || age(d[i], d[i + 1], d[i + 2])) beige++   // paper / aged print
        else n++
        if (age(d[i], d[i + 1], d[i + 2])) aged++
    }
    // #1972 zoom-crop proof, #1943 deepened: the longest non-beige run across
    // the head, now scanned over the whole head block (rows 30..52 of the
    // frame) instead of one equator line. The old flat-0.6 head measured <=41
    // even at its widest; the 0.75 crop read 47..57; the 0.90 zoom runs the
    // head (and ears) 48..61 — the gate stays >=44 as the flat-crop separator,
    // the s>=0.85 + head-width>=54 floors in paperscheck are the ratchet.
    let run = 0, best = 0
    for (let row = 30; row <= 52; row++) {
        run = 0
        for (let x = 0; x < 66; x++) {
            const i = (row * 66 + x) * 4
            const k = (d[i] << 16) | (d[i + 1]) << 8 | d[i + 2]
            if (!(k === 0xd8d2b8 || k === 0xc9c2a4 || age(d[i], d[i + 1], d[i + 2]))) { run++; best = Math.max(best, run) } else run = 0
        }
    }
    return { n, beige, aged, headRun: best }
})
r.check(`the passport carries a painted photo (${paint.n} face px in a ${paint.beige} px aged frame)`,
    paint.n > 250 && paint.beige > 100)
r.check(`the photo is a zoom-crop — head reads ${paint.headRun}px across (flat-0.6 read <=41)`, paint.headRun >= 44)
r.check(`the print is aged — ${paint.aged}px of amber wash inside the frame (a fresh print has none)`, paint.aged >= 100)
const earV = await page.evaluate(() => window.__ppTest.earPix())
r.check(`ears live under all four hair cuts (${earV.join('/')}, full ears = 60)`, earV.every((v) => v >= 60), JSON.stringify(earV))
let sawForge = 0, sawHonest = 0, bandFails = 0
const art = { browMax: 0, browMin: 1e9, mouthMax: 0, mouthMin: 1e9, whitesMax: 0, sawBare: false, pbMax: 0, pbMin: 1e9, pbN: 0 }
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
        // #1943 photo-scale brow survival: the brow ink inside the PHOTO box
        // (outer brow columns only — the uni bridge sits between them, the
        // lens ink is excluded by the family). Exact hex lies about AA-scaled
        // ink (the #1908 lesson), so count the dark family; glasses wearers
        // would contaminate the band with their rims, so skip them.
        const fam = (x, y, w, h) => {
            const d = c.getContext('2d').getImageData(x, y, w, h).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 120) n++
            return n
        }
        const photoBrow = p.face.glasses ? -1 : fam(606, 95, 10, 5) + fam(627, 95, 10, 5)
        return { name: p.passport.name, feats, glasses: p.face.glasses, brow: p.face.brow, browPhoto: photoBrow, pix: t.portraitPix(), browInk: ink(300, 64, 34, 5), mouthInk: ink(310, 89, 16, 9) }
    })
    if (pp && pp.pix) {
        if (pp.feats.length === 0) { sawHonest++; if (pp.pix.total !== 0) bandFails++ }
        else { sawForge++; for (const f of pp.feats) if (!(pp.pix[f] > 0)) bandFails++ }
        art.browMax = Math.max(art.browMax, pp.browInk); art.browMin = Math.min(art.browMin, pp.browInk)
        art.mouthMax = Math.max(art.mouthMax, pp.mouthInk); art.mouthMin = Math.min(art.mouthMin, pp.mouthInk)
        art.whitesMax = Math.max(art.whitesMax, pp.pix.whites)
        if (!pp.glasses) art.sawBare = true
        if (pp.browPhoto >= 0) { art.pbMax = Math.max(art.pbMax, pp.browPhoto); art.pbMin = Math.min(art.pbMin, pp.browPhoto); art.pbN++ }
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
// #1976 EVIDENCE AUDIO — when a correct deny names a brow/mouth break, the
// booth adds a sharp tick (1050Hz) over the deny thunk. Seed 2 day 1 carries
// a brow forger; walk it with live keys (only act() plays audio) and prove
// the tick fires exactly when the witness names the face.
await page.evaluate(() => window.__ppTest.start(2))
await wait(700)
const ticks0 = await page.evaluate(() => window.__ppTest.sfxTicks())
let bmDenied = 0, bmTicks = 0
for (let guard = 0; guard < 12; guard++) {
    s = await probe()
    if (s.day !== 1 || s.end) break
    const need = await page.evaluate(() => {
        const p = window.__ppTest.probe().view.person
        return !!(p.face && p.passport?.photo && (p.face.brow !== p.passport.photo.brow || p.face.mouth !== p.passport.photo.mouth))
    })
    const v = await page.evaluate(() => window.__ppTest.verdict())
    await page.keyboard.press(v === 'approve' ? 'a' : 'd')
    if (need && v === 'deny') {
        bmDenied++
        await wait(120)
        bmTicks = await page.evaluate(() => window.__ppTest.sfxTicks()) - ticks0
    }
    await wait(140)
}
r.check(`a brow/mouth deny earns its evidence tick (${bmDenied} face denies, ${bmTicks} ticks)`,
    bmDenied >= 1 && bmTicks >= bmDenied, `denied=${bmDenied} ticks=${bmTicks}`)
r.check('day 1 staged its forger at the window', sawForge >= 1, `${sawForge}`)
// #1972 PORTRAIT-DETAIL pixel proof: the day's faces show both brow
// thicknesses and both mouth shapes on the canvas, and a bare-eyed face
// paints whites. (Open 108 vs shut 48; thick 100 vs thin 40; bare 128.)
r.check(`brows paint both thicknesses (${art.browMin}..${art.browMax} ink px)`, art.browMin < 60 && art.browMax > 60)
r.check(`mouths paint both shapes (${art.mouthMin}..${art.mouthMax} ink px)`, art.mouthMin < 80 && art.mouthMax > 80)
r.check(`eyes get whites — a bare face paints ${art.whitesMax} white px`, art.sawBare && art.whitesMax > 60)
// #1943 PORTRAIT LEGIBILITY live: inside the photo the brow ink survives the
// zoom-crop (min > 12 dark-family px on bare faces) and thick brows paint
// clearly more than thin — the compared feature is readable where the rule is
// actually checked, not just on the counter.
r.check(`photo brows survive at photo scale (${art.pbMin}..${art.pbMax} ink px on ${art.pbN} bare faces)`,
    art.pbN >= 2 && art.pbMin > 12 && art.pbMax > art.pbMin, JSON.stringify({ min: art.pbMin, max: art.pbMax, n: art.pbN }))

// #2072 SILHOUETTE + HOLD-TO-INSPECT + the WIDE-HEAD crop gate — a fresh
// seed-0 day 1: every settled passport photo is scanned. The widest (narrow
// = 0) head must run the crop >= 55px — the old >=44 gate rode seed 0's
// single head and could silently pass a shallower zoom. A press-and-hold on
// the photo must grow the print while portraitPix (the PORTRAIT evidence)
// counts the SAME bytes — the zoom is booth-side paint, never a rule. And
// every hair cut carries its shadow tone at the hairline of the counter face.
{
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(700)
    const geo = await page.evaluate(() => {
        const t = window.__ppTest.photoRect()
        const b = document.querySelector('canvas[data-pp-stage]').getBoundingClientRect()
        return { t, x: b.x, y: b.y, w: b.width, h: b.height }
    })
    const photoClient = { x: geo.x + (geo.t.x + geo.t.w / 2) / 680 * geo.w, y: geo.y + (geo.t.y + geo.t.h / 2) / 440 * geo.h }
    const cropScan = () => page.evaluate(() => {
        const d = document.querySelector('canvas[data-pp-stage]').getContext('2d').getImageData(588, 64, 66, 76).data
        const age = (r, g, b) => r >= 179 && r <= 190 && g >= 162 && g <= 172 && b >= 118 && b <= 129
        let run = 0, best = 0, n = 0
        for (let row = 0; row < 76; row++) {
            run = 0
            for (let x = 0; x < 66; x++) {
                const i = (row * 66 + x) * 4
                const k = (d[i] << 16) | (d[i + 1]) << 8 | d[i + 2]
                const face = !(k === 0xd8d2b8 || k === 0xc9c2a4 || age(d[i], d[i + 1], d[i + 2]))
                if (face) {
                    if (row >= 30 && row <= 52) { run++; best = Math.max(best, run) }
                    n++
                } else if (row >= 30 && row <= 52) run = 0
            }
        }
        return { best, n }
    })
    let wideBest = 0, wideN = 0, zoomDelta = 0, zoomOk = false, liftedOk = false, evHold = true, shadowMax = 0, seen = 0
    const judged = new Set() // QUOTE pins judged papers (stamp ink crosses the crop) — measure fresh faces only
    for (let guard = 0; guard < 14 && seen < 6; guard++) {
        s = await probe()
        if (s.screen !== 'play' || s.end || s.day !== 1) break
        if (s.stamp && s.stamp.ticks > 0) { await wait(400); continue }
        const p = await page.evaluate(() => {
            const q = window.__ppTest.probe().view.person
            return q?.passport?.photo ? { name: q.passport.name, narrow: q.passport.photo.narrow, hairC: q.face.hairC } : null
        })
        if (!p) {
            const v0 = await page.evaluate(() => window.__ppTest.verdict())
            await page.keyboard.press(v0 === 'approve' ? 'a' : 'd')
            await wait(1100)
            continue
        }
        const fresh = !judged.has(p.name)
        if (fresh) {
            await wait(150)
            const straight = await cropScan()
            shadowMax = Math.max(shadowMax, await page.evaluate((hc) => {
                const col = window.__ppTest.hairShadow()[hc]
                const n = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16)
                const d = document.querySelector('canvas[data-pp-stage]').getContext('2d').getImageData(280, 31, 74, 26).data
                let k = 0
                for (let i = 0; i < d.length; i += 4) if (d[i] === n && d[i + 1] === g && d[i + 2] === b) k++
                return k
            }, p.hairC))
            const total0 = await page.evaluate(() => { const px = window.__ppTest.portraitPix(); return px ? px.total : -1 })
            await page.mouse.move(photoClient.x, photoClient.y)
            await page.mouse.down()
            await wait(400)
            const zoomed = await page.evaluate(() => window.__ppTest.photoZoom())
            const grown = await cropScan()
            const total1 = await page.evaluate(() => { const px = window.__ppTest.portraitPix(); return px ? px.total : -1 })
            await page.mouse.up()
            await wait(150)
            const lifted = await page.evaluate(() => window.__ppTest.photoZoom())
            seen++
            if (p.narrow === 0) { wideBest = Math.max(wideBest, straight.best); wideN++ }
            if (zoomed && grown.n > zoomDelta) zoomDelta = grown.n - straight.n
            if (zoomed && grown.n >= straight.n + 150) zoomOk = true
            if (lifted === false) liftedOk = true
            if (total0 >= 0 && total1 !== total0) evHold = false
        }
        judged.add(p.name)
        const v = await page.evaluate(() => window.__ppTest.verdict())
        await page.keyboard.press(v === 'approve' ? 'a' : 'd')
        await wait(1100)
    }
    r.check(`a wide-head photo runs the crop ${wideBest}px (gate >=55; seed 0's narrow head can no longer carry the zoom-crop proof alone)`,
        wideBest >= 55, `wide photos seen=${wideN}`)
    r.check(`hold-to-inspect grows the print (${zoomDelta}px more face area at PHOTO_ZOOM)`, zoomOk, `area delta=${zoomDelta}`)
    r.check('the zoom is booth-side paint — PORTRAIT evidence counts the same bytes while held', evHold)
    r.check('release lifts the crop back', liftedOk)
    r.check(`hair carries its shadow tone at the hairline (${shadowMax}px of shadow ink on the counter face)`, shadowMax >= 10)
}

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

// #1979 THE REGULARS, live: every signature mark paints its own ink through
// the SAME drawFace the booth uses, and a face from the neighborhood really
// walks up the line — authored name, mark at the counter, honest paper.
{
    const EXPECT = {
        grubak: { name: 'VOLEN GRUBAK', scar: [10, 40], mole: [0, 0], wrinkle: [0, 0], ear: [20, 52], freckles: [0, 0], patch: [0, 0] },
        marko: { name: 'MARKO DRENIN', scar: [0, 0], mole: [3, 12], wrinkle: [0, 0], ear: [20, 52], freckles: [0, 0], patch: [0, 0] },
        anja: { name: 'ANJA TOLKA', scar: [0, 0], mole: [0, 0], wrinkle: [60, 72], ear: [20, 52], freckles: [0, 0], patch: [0, 0] },
        petr: { name: 'PETR ZEMEK', scar: [0, 0], mole: [0, 0], wrinkle: [0, 0], ear: [64, 100], freckles: [0, 0], patch: [0, 0] },
        sonya: { name: 'SONYA MALAK', scar: [0, 0], mole: [0, 0], wrinkle: [0, 0], ear: [20, 52], freckles: [8, 16], patch: [0, 0] },
        tadek: { name: 'TADEK HRUBY', scar: [0, 0], mole: [0, 0], wrinkle: [0, 0], ear: [20, 52], freckles: [0, 0], patch: [20, 28] },
    }
    const cp = await page.evaluate(() => window.__ppTest.castPix())
    r.check('castPix paints all six regulars', Array.isArray(cp) && cp.length === 6, JSON.stringify((cp || []).map((x) => x.id)))
    for (const row of cp || []) {
        const e = EXPECT[row.id]
        if (!e) { r.check(`unknown cast id ${row.id}`, false); continue }
        r.check(`${e.name}: every ink in its own region ${JSON.stringify({ scar: row.scar, mole: row.mole, wrinkle: row.wrinkle, ear: row.ear, freckles: row.freckles, patch: row.patch })}`,
            row.scar >= e.scar[0] && row.scar <= e.scar[1]
            && row.mole >= e.mole[0] && row.mole <= e.mole[1]
            && row.wrinkle >= e.wrinkle[0] && row.wrinkle <= e.wrinkle[1]
            && row.ear >= e.ear[0] && row.ear <= e.ear[1]
            && row.freckles >= e.freckles[0] && row.freckles <= e.freckles[1]
            && row.patch >= e.patch[0] && row.patch <= e.patch[1])
    }
    // live recurrence: seed 0's day 2 carries cast[0] — Volen Grubak walks the
    // same line he walked… well, will walk again on day 6. The window sees it.
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    await page.evaluate(() => window.__ppTest.runDay())   // honest day 1 (no cast day)
    await wait(300)
    let reg = null, regVerdict = null, greetBubble = -1
    for (let g = 0; g < 12 && !reg; g++) {
        reg = await page.evaluate(() => {
            const p = window.__ppTest.probe()
            const per = p && p.view && p.view.person
            if (!per || !per.regular) return null
            return { id: per.regular, name: per.passport ? per.passport.name : null, mark: per.mark || null, say: per.say || null }
        })
        if (reg) {
            // #1997 the neighbor introduces itself: after the previous stamp's
            // 30-tick hold ticks out, the greet bubble prints at the counter.
            await wait(650)
            greetBubble = await page.evaluate(() => window.__ppTest.bubblePix())
            regVerdict = await page.evaluate(() => window.__ppTest.verdict()); break
        }
        const v = await page.evaluate(() => window.__ppTest.verdict())
        await page.keyboard.press(v === 'approve' ? 'a' : 'd')
        await wait(140)
    }
    r.check('a regular walks the live line (seed 0 day 2 — Volen Grubak, scar, honest paper)',
        !!reg && reg.id === 'grubak' && reg.name === 'VOLEN GRUBAK' && reg.mark === 'scar' && regVerdict === 'approve',
        JSON.stringify({ reg, regVerdict }))
    r.check(`the first walk-up greets — bubble prints ${greetBubble} paper px with his thread`,
        greetBubble > 4000 && !!reg && Array.isArray(reg.say) && reg.say.length === 2 && reg.say[0] === 'GOOD DAY, GUARD.' && reg.say[1] === 'THE BREAD LINE WAS LONG.',
        `${greetBubble} ${reg && JSON.stringify(reg.say)}`)
    await page.keyboard.press('a') // stamp the neighborhood in
    await page.evaluate(() => window.__ppTest.runDay())    // finish day 2 clean
    await wait(250)
}

// #1983 THE ARC, live: the familiar face comes back WANTED. seed 0's day 6
// carries Volen Grubak again — the bulletin pairs his name with the number he
// carries, every paper stays honest, and DENY is the right call the face makes
// you doubt. The callback bubble prints as pixels: a paper field up on the
// turn, dark on strangers. And at seed 1 the trap snaps the other way: a
// sympathetic APPROVE of MARKO costs the strike.
{
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    await page.evaluate(() => window.__ppTest.runDay())   // honest day 1 (no cast day)
    await wait(250)
    const quiet = await page.evaluate(() => window.__ppTest.bubblePix())
    const quietGrow = await page.evaluate(() => window.__ppTest.bubbleGrowPix())
    r.check(`strangers say nothing — bubble field dark (${quiet} paper px, growth strip ${quietGrow})`, quiet < 100 && quietGrow < 100, `${quiet}/${quietGrow}`)
    for (let d = 2; d < 6; d++) { await page.evaluate(() => window.__ppTest.runDay()); await wait(150) }
    // #1891 THE NEW MONTH — the morning that crosses the seam announces it:
    // the week rolls OCT 27 → NOV 02, and day 6's banner must say NOVEMBER.
    s = await probe()
    r.check(`the calendar turn is announced on the morning it happens (${s.banner && s.banner.text} | ${s.banner && s.banner.month})`,
        s.day === 6 && !!s.banner && s.banner.month === 'NOVEMBER', JSON.stringify(s.banner))
    let sayProbe = null, bubbleUp = -1, arcVerdict = null
    for (let g = 0; g < 14 && !sayProbe; g++) {
        sayProbe = await page.evaluate(() => {
            const p = window.__ppTest.probe()
            const per = p && p.view && p.view.person
            if (!per || !per.arc) return null
            return { id: per.regular, name: per.passport.name, say: per.say, ppId: per.passport.id, wanted: p.wanted.filter((w) => w.name === per.passport.name).map((w) => w.id) }
        })
        if (sayProbe) {
            // the stamp on the PREVIOUS document holds 30 ticks — the counter
            // shows the judged papers until it fades (#1938 doctrine): let it
            // tick out, or the bubble sample measures the wrong entrant.
            await wait(650)
            bubbleUp = await page.evaluate(() => window.__ppTest.bubblePix())
            arcVerdict = await page.evaluate(() => window.__ppTest.verdict())
            break
        }
        const v = await page.evaluate(() => window.__ppTest.verdict())
        await page.keyboard.press(v === 'approve' ? 'a' : 'd')
        await wait(140)
    }
    r.check('the arc walk-up: Volen Grubak returns on day 6 and the sheet carries HIS number',
        !!sayProbe && sayProbe.id === 'grubak' && sayProbe.wanted.includes(sayProbe.ppId), JSON.stringify(sayProbe))
    r.check(`the returning face speaks — bubble prints ${bubbleUp} paper px with its lines`,
        bubbleUp > 4000 && !!sayProbe && sayProbe.say[0] === 'YOU AGAIN.' && /\.\.\./.test(sayProbe.say[1]), `${bubbleUp}`)
    r.check('recognition is not safety: the booth denies the familiar face', arcVerdict === 'deny', `${arcVerdict}`)
    const caughtBefore = (await probe()).caught
    await page.keyboard.press('d')   // the real deny — Jorji turned away
    await wait(160)
    const afterArc = await probe()
    r.check(`the right deny scores and names the witness (${afterArc.last.why}: ${afterArc.last.evidence})`,
        afterArc.last.ok === true && afterArc.last.why === 'WANTED' && afterArc.caught === caughtBefore + 1, JSON.stringify(afterArc.last))
    // #2012 THE CROWDED RETURN, live: the shift that turns a neighbor carries
    // a HELLO too. Seed 0's day 6 seats sonya (tail seat s+4) right behind the
    // arc face — one shift where the wall says YOU AGAIN and the knit-seller
    // introduces herself. The day's second bubble printing is the gap's
    // "second bubble sample per window," made pixels.
    let crowd6 = null, crowd6Bubble = -1
    for (let g = 0; g < 4 && !crowd6; g++) {
        crowd6 = await page.evaluate(() => {
            const p = window.__ppTest.probe()
            const per = p && p.view && p.view.person
            if (!per || per.regular !== 'sonya') return null
            return { day: p.day, name: per.passport.name, say: per.say }
        })
        if (!crowd6) await wait(220)
    }
    await wait(650)   // let the deny-hold tick out before the bubble counts
    crowd6Bubble = await page.evaluate(() => window.__ppTest.bubblePix())
    r.check('the crowded shift: Sonya walks the SAME day the arc turn lands (seed 0 day 6 — tail seat s+4)',
        !!crowd6 && crowd6.day === 6 && crowd6.name === 'SONYA MALAK'
        && Array.isArray(crowd6.say) && crowd6.say[0] === 'MY SON LIVES IN OR VECHNA.' && crowd6.say[1] === 'I SELL MY KNITS AT MARKET.',
        JSON.stringify(crowd6))
    r.check(`one shift, two voices — the day's second bubble prints ${crowd6Bubble} paper px of greeting`,
        crowd6Bubble > 4000, `${crowd6Bubble}`)
    await page.keyboard.press('a')   // Sonya is honest — stamp the neighbor in
    // the trap snaps the other way at seed 1: cast[1] MARKO DRENIN turns on
    // day 6 — approving the pleading face is the mistake the stage exists for.
    await page.evaluate(() => window.__ppTest.start(1))
    await wait(250)
    for (let d = 1; d < 6; d++) { await page.evaluate(() => window.__ppTest.runDay()); await wait(120) }
    let fell = null
    for (let g = 0; g < 14 && !fell; g++) {
        fell = await page.evaluate(() => {
            const p = window.__ppTest.probe()
            const per = p && p.view && p.view.person
            return per && per.arc ? { name: per.passport.name, say: per.say } : null
        })
        if (!fell) {
            const v = await page.evaluate(() => window.__ppTest.verdict())
            await page.keyboard.press(v === 'approve' ? 'a' : 'd')
            await wait(120)
        }
    }
    const beforeNaive = await probe()
    await page.keyboard.press('a')   // approve the familiar face — the trap snaps
    await wait(160)
    const naive = await probe()
    r.check(`approving the familiar face is the trap: strikes ${beforeNaive.strikes}->${naive.strikes} (${naive.last && naive.last.why})`,
        !!fell && fell.name === 'MARKO DRENIN' && Array.isArray(fell.say) && fell.say[0] === 'YOU AGAIN.'
        && naive.strikes === beforeNaive.strikes + 1 && naive.last.ok === false && naive.last.why === 'WANTED',
        JSON.stringify({ fell, why: naive.last && naive.last.why }))
    await page.evaluate(() => window.__ppTest.runDay())    // walk the rest of the day honestly
    await wait(250)
}

// #1997 THE WINDOW ROTATES, live: seed 4's week belongs to the two newest
// seats. Days 2-5 carry Sonya, Tadek, Grubak, Marko; Sonya's return on day 6
// is THIS week's arc turn (the wall convicts the familiar knit-seller) and
// Tadek returns on day 7 with a callback of his own. Both new faces greet at
// the counter, Sonya's authored scarf + earring paint their own inks, and the
// correct deny on her turn proves the arc rides the rotated head of the window.
{
    await page.evaluate(() => window.__ppTest.start(4))
    await wait(300)
    await page.evaluate(() => window.__ppTest.runDay())   // honest day 1
    await wait(250)
    const walkTo = async (id) => {
        for (let g = 0; g < 14; g++) {
            const hit = await page.evaluate((want) => {
                const p = window.__ppTest.probe()
                const per = p && p.view && p.view.person
                if (!per || per.regular !== want) return null
                return { day: p.day, name: per.passport ? per.passport.name : null, mark: per.mark || null, say: per.say || null, arc: !!per.arc, ppId: per.passport ? per.passport.id : null, wanted: p.wanted.filter((w) => w.name === per.passport.name).map((w) => w.id) }
            }, id)
            if (hit) { await wait(650); return { hit, bubble: await page.evaluate(() => window.__ppTest.bubblePix()), grow: await page.evaluate(() => window.__ppTest.bubbleGrowPix()), verdict: await page.evaluate(() => window.__ppTest.verdict()), pix: await page.evaluate(() => window.__ppTest.crowdPix()) } }
            const v = await page.evaluate(() => window.__ppTest.verdict())
            await page.keyboard.press(v === 'approve' ? 'a' : 'd')
            await wait(140)
        }
        return null
    }
    const sy2 = await walkTo('sonya')
    r.check('the fifth regular walks the live line (seed 4 day 2 — Sonya Malak, freckles, honest paper)',
        !!sy2 && sy2.hit.name === 'SONYA MALAK' && sy2.hit.mark === 'freckles' && sy2.verdict === 'approve',
        JSON.stringify(sy2 && { n: sy2.hit.name, m: sy2.hit.mark, v: sy2.verdict }))
    r.check(`Sonya greets her first shift — bubble prints ${sy2 ? sy2.bubble : -1} paper px with her thread`,
        !!sy2 && sy2.bubble > 4000 && sy2.hit.say && sy2.hit.say.length === 2 && sy2.hit.say[0] === 'MY SON LIVES IN OR VECHNA.' && sy2.hit.say[1] === 'I SELL MY KNITS AT MARKET.',
        `${sy2 && sy2.bubble} ${sy2 && JSON.stringify(sy2.hit.say)}`)
    r.check(`the knit-seller's authored scarf and earring paint at the counter ${JSON.stringify(sy2 && sy2.pix && { hat: sy2.pix.hat, ear: sy2.pix.ear })}`,
        !!sy2 && sy2.pix && sy2.pix.hat > 0 && sy2.pix.ear > 0, JSON.stringify(sy2 && sy2.pix))
    await page.keyboard.press('a')
    await page.evaluate(() => window.__ppTest.runDay())    // finish day 2
    await wait(200)
    const tk3 = await walkTo('tadek')
    r.check('the sixth regular walks the live line (seed 4 day 3 — Tadek Hruby, patch, honest paper)',
        !!tk3 && tk3.hit.name === 'TADEK HRUBY' && tk3.hit.mark === 'patch' && tk3.verdict === 'approve',
        JSON.stringify(tk3 && { n: tk3.hit.name, m: tk3.hit.mark, v: tk3.verdict }))
    r.check(`the retired clerk greets — bubble prints ${tk3 ? tk3.bubble : -1} paper px ("I AM RETIRED, GUARD.")`,
        !!tk3 && tk3.bubble > 4000 && tk3.hit.say && tk3.hit.say[0] === 'I AM RETIRED, GUARD.',
        `${tk3 && tk3.bubble} ${tk3 && JSON.stringify(tk3.hit.say)}`)
    await page.keyboard.press('a')
    await page.evaluate(() => window.__ppTest.runDay())    // finish day 3
    await wait(200)
    for (let d = 4; d < 6; d++) { await page.evaluate(() => window.__ppTest.runDay()); await wait(150) }
    const sy6 = await walkTo('sonya')
    r.check('the rotated window puts a NEW face on the wall (seed 4 day 6 — the sheet carries SONYA\'S number)',
        !!sy6 && sy6.hit.arc && sy6.hit.name === 'SONYA MALAK' && sy6.hit.wanted.includes(sy6.hit.ppId) && sy6.verdict === 'deny',
        JSON.stringify(sy6 && { n: sy6.hit.name, arc: sy6.hit.arc, w: sy6.hit.wanted, pp: sy6.hit.ppId, v: sy6.verdict }))
    r.check('the turn keeps the canonical Jorji pair under the new face',
        !!sy6 && sy6.hit.say && sy6.hit.say[0] === 'YOU AGAIN.' && /\.\.\./.test(sy6.hit.say[1]),
        JSON.stringify(sy6 && sy6.hit.say))
    await page.keyboard.press('d')   // the right deny — the neighborhood is not safe
    await wait(160)
    // #2012 the crowded turn-day, live on the rotated window: seed 4's day 6
    // pairs SONYA'S arrest with ANJA'S first walk-up (tail seat s+4 = seat 2).
    const aj6 = await walkTo('anja')
    r.check('the arc day is crowded too (seed 4 day 6 — Anja greets while the wall works, tail seat s+4)',
        !!aj6 && aj6.hit.day === 6 && !aj6.hit.arc && aj6.hit.name === 'ANJA TOLKA'
        && aj6.hit.say && aj6.hit.say[0] === 'I VISIT MY DAUGHTER.' && aj6.verdict === 'approve' && aj6.bubble > 4000,
        JSON.stringify(aj6 && { d: aj6.hit.day, say: aj6.hit.say, b: aj6.bubble, v: aj6.verdict }))
    await page.keyboard.press('a')   // honest papers — the daughter-visiting neighbor goes through
    // Anja is day 6's LAST head now (the crowd took the fill slot): the stamp
    // may roll the day before we get here, and runDay() would then stamp away
    // all of day 7 (it captures gs.day on entry). Only finish day 6 if it is
    // still open; day 7's own walk belongs to walkTo('tadek') below.
    const sD6 = await probe()
    if (sD6.day === 6) { await page.evaluate(() => window.__ppTest.runDay()) }
    await wait(200)
    const tk7 = await walkTo('tadek')
    r.check('day 7\'s return speaks for itself (Tadek: "YOU LET ME THROUGH.") and walks honest',
        !!tk7 && !tk7.hit.arc && tk7.hit.say && tk7.hit.say[0] === 'YOU AGAIN.' && tk7.hit.say[1] === 'YOU LET ME THROUGH.' && tk7.verdict === 'approve',
        JSON.stringify(tk7 && tk7.hit.say))
    // #2003 THE LONG CONVERSATION, live: the return is a THREAD — the topic
    // Tadek planted on day 3 ("THE PENSION BUYS LITTLE.") gets its answer
    // ("LITTLE, BUT IT BUYS."), and the third line grew the bubble field
    // past its old bottom — paper in the growth strip is pixel proof.
    r.check(`the return pays off its planted topic and the field grows for it ${JSON.stringify(tk7 && tk7.hit.say)}`,
        !!tk7 && tk7.hit.say && tk7.hit.say.length === 3 && tk7.hit.say[2] === 'LITTLE, BUT IT BUYS.' && tk7.bubble > 4000 && tk7.grow > 300,
        JSON.stringify(tk7 && { say: tk7.hit.say, bubble: tk7.bubble, grow: tk7.grow }))
    // #2012 the crowded return again: seed 4's day 7 pairs Tadek's payoff
    // with PETR'S fresh hello (tail seat s+5 = seat 3) — recognition and
    // introduction on one shift, both bubbles printing, the finale denser.
    const pt7 = await walkTo('petr')
    r.check('day 7 carries two neighbors (seed 4 — Petr greets behind Tadek\'s payoff, tail seat s+5)',
        !!pt7 && pt7.hit.day === 7 && !pt7.hit.arc && pt7.hit.name === 'PETR ZEMEK'
        && pt7.hit.say && pt7.hit.say[0] === 'WORK IN THE CITY.' && pt7.hit.say[1] === 'THE TRAIN WAS LATE.' && pt7.verdict === 'approve' && pt7.bubble > 4000,
        JSON.stringify(pt7 && { d: pt7.hit.day, say: pt7.hit.say, b: pt7.bubble, v: pt7.verdict }))
    await page.keyboard.press('a')   // stamp the commuter through the finale line
    await page.evaluate(() => window.__ppTest.runDay())    // finish day 7 honestly
    await wait(250)
}

// #1989 THE CROWD, live: walk seed 0's whole week with real keys and
// prove the one-off looks are PIXELS through the same drawFace — hats,
// unibrows, earrings and missing teeth paint at the counter and (on honest
// papers) in the photo; bare heads paint nothing; and every browser face
// carries exactly the decor Node's accFor(serial, nation, sex) computed:
// cross-process, byte for byte. #1996 widened the walk to seven days — the
// nation table makes a two-day seed-0 window a coin-flip on the ushanka,
// and the whole line is where nations read. Volen Grubak arrives day 2 in
// his authored cap+unibrow.
{
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    const rows = []
    for (let d = 1; d <= 7; d++) {
        for (let g = 0; g < 12; g++) {
            const row = await page.evaluate(() => {
                const t = window.__ppTest
                const p = t.probe()
                if (!p || p.end) return null
                const cp = t.crowdPix()
                const per = p && p.view && p.view.person
                if (!cp || !per) return null
                return { day: p.day, name: per.passport ? per.passport.name : 'NO PAPERS', pic: per.pic, nation: per.nation, sex: per.passport ? per.passport.sex : null, reg: !!per.regular, cp }
            })
            if (row && row.day === d) rows.push(row)
            const v = await page.evaluate(() => window.__ppTest.verdict())
            await page.keyboard.press(v === 'approve' ? 'a' : 'd')
            await wait(130)
            const s0 = await probe()
            if (s0.day !== d) break
        }
        const sMid = await probe()
        if (sMid.day === d && !sMid.end) { await page.evaluate(() => window.__ppTest.runDay()); await wait(200) }
    }
    r.check(`the live walk saw ${rows.length} faces across the week`, rows.length >= 30, `${rows.length}`)
    const maxOf = (k) => Math.max(...rows.map((x) => x.cp[k] || 0))
    for (const fam of ['hat', 'uni', 'ear', 'gap']) {
        r.check(`${fam}s paint their own pixels at the counter (max ${maxOf(fam)} px)`, maxOf(fam) > 0)
    }
    const hatRows = rows.filter((x) => x.cp.acc.hat > 0)
    r.check(`three hat kinds walk the line live (${[...new Set(hatRows.map((x) => x.cp.acc.hat))].sort().join(',')})`,
        new Set(hatRows.map((x) => x.cp.acc.hat)).size === 3, JSON.stringify(hatRows.map((x) => x.cp.acc.hat)))
    const photoRows = rows.filter((x) => x.cp.photoAcc)
    r.check(`the photo carries the hat too (${photoRows.filter((x) => x.cp.hatPhoto > 0).length} hatted photos)`,
        photoRows.every((x) => ['hat', 'uni', 'ear', 'gap'].every((k) => x.cp.photoAcc[k] === x.cp.acc[k])) &&
        photoRows.some((x) => x.cp.acc.hat > 0 && x.cp.hatPhoto > 0),
        JSON.stringify(photoRows.slice(0, 3).map((x) => [x.name, x.cp.acc, x.cp.hatPhoto])))
    const bare = rows.filter((x) => x.cp.acc.hat === 0)
    r.check(`bare heads paint no hat ink (${bare.length} bare rows)`, bare.length >= 3 && bare.every((x) => x.cp.hat === 0))
    let mismatch = 0, checked = 0, national = 0, nationalOk = 0
    const HOME = { KIRINIA: 1, ANTEGRIA: 1, VESKOLE: 2, PARMENISTAN: 3 }
    for (const x of rows) {
        if (x.reg) continue // authored decor is identity, not hash — the
        // cast wears what the script gave them (paperscheck pins the authored
        // decor every appearance); the serial law governs the rolled crowd.
        if (!x.sex) continue // the PASSPORT violator carries no papers to
        // grade a sex from; its decor was rolled from the sex BEHIND the
        // missing papers — no witness, no comparison.
        checked++
        if (JSON.stringify(x.cp.acc) !== JSON.stringify(accFor(x.pic, x.nation, x.sex))) mismatch++
        // #1996: the same pixels must also read by NATION — a hatted rolled
        // head wears its home kind (women wrap in scarves, Veskole in fur).
        if (x.cp.acc.hat > 0 && x.sex) {
            national++
            const okHat = x.sex === 'F'
                ? x.cp.acc.hat === 3 || (x.nation === 'VESKOLE' && x.cp.acc.hat === 2)   // Veskole wraps mostly in fur
                : x.nation === 'ARSTOTZKA' || x.cp.acc.hat === HOME[x.nation]             // the host stays the mix
            if (okHat) nationalOk++
        }
    }
    r.check(`rolled decor === Node accFor(serial, nation, sex), every background face (${checked} rows)`, mismatch === 0, `${mismatch} mismatches`)
    r.check(`the hatted heads dress by nation live (${nationalOk}/${national})`, national >= 3 && nationalOk === national, `${nationalOk}/${national}`)
    const grub = rows.find((x) => x.name === 'VOLEN GRUBAK')
    r.check(`Grubak walks the line in his authored cap and unibrow ${grub ? JSON.stringify({ hat: grub.cp.hat, uni: grub.cp.uni }) : ''}`,
        !!grub && grub.cp.hat > 0 && grub.cp.uni > 0)
    await page.evaluate(() => window.__ppTest.runDay())
    await wait(200)
}

// #1908 THE WALL THAT LIVES, live: seed 0's bulletin is the plan — every row
// the browser sim prints matches Node's week row-for-row (name AND number),
// the sheet paints in its own brighter red, no name repeats across the seven
// walls, and no row names anyone standing in that week's line. The drawn sheet
// IS the logical plan, pixel-proved.
{
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    const wk = genWeek(0)
    const weekEntrants = new Set(wk.days.flatMap((d) => d.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)))
    const seenNames = new Set()
    let dupAcrossDays = 0, framed = 0, offPlanRows = 0, totalRows = 0
    let ink3 = -1, ink5 = -1
    for (let d = 1; d <= 7; d++) {
        const sheet = await page.evaluate(() => {
            const p = window.__ppTest.probe()
            const wi = window.__ppTest.wantedInk()
            return { day: p.day, wanted: p.wanted, ink: wi.ink, rows: wi.rows }
        })
        const nodeRows = wk.days[d - 1].wanted
        const rowStr = (x) => `${x.name}#${x.id}:${x.planted ? 1 : 0}`
        if (sheet.day === d && sheet.wanted.length === nodeRows.length && sheet.wanted.every((x, i) => rowStr(x) === rowStr(nodeRows[i]))) {
            totalRows += nodeRows.length
            nodeRows.forEach((w, i) => {
                if (w.planted) return
                if (w.name !== wallNameAt(0, d, nodeRows.slice(0, i).filter((x) => !x.planted).length)) offPlanRows++
                if (seenNames.has(w.name)) dupAcrossDays++
                seenNames.add(w.name)
                if (weekEntrants.has(w.name)) framed++
            })
            if (nodeRows.length === 3 && ink3 < 0) ink3 = sheet.ink
            if (nodeRows.length === 5) ink5 = Math.max(ink5, sheet.ink)
        } else {
            r.check(`day ${d} sheet read live`, false, JSON.stringify({ got: sheet.day, rows: sheet.wanted.length }))
        }
        if (d < 7) { await page.evaluate(() => window.__ppTest.runDay()); await wait(200) }
    }
    r.check(`seed 0's whole week: ${totalRows} bulletin rows painted row-for-row on Node's plan`, totalRows === wk.days.reduce((a, x) => a + x.wanted.length, 0) && offPlanRows === 0, `${totalRows} rows, ${offPlanRows} off-plan`)
    r.check(`the sheet paints in the brighter red (${ink3} ink px on the three-row day)`, ink3 > 300, `${ink3}`)
    r.check('no name repeats across the live week\'s walls — the bulletin reads lived-in', dupAcrossDays === 0, `${dupAcrossDays}`)
    r.check('no wall row names anyone standing in the line this week', framed === 0, `${framed}`)
    r.check(`the five-row bulletin paints more sheet than the three-row day (${ink5} > ${ink3})`, ink5 > ink3 && ink5 > 0, `${ink5}/${ink3}`)
    await wait(1100)
    await page.keyboard.press('a') // leave the week-end screen
}

// #1982 THE RECOGNITION CUE, live: seed 0's whole week walked with the door's
// own memory. Strangers and first walk-ups pass in silence (days 1-5, every
// greet tail on days 6-7); the week rings EXACTLY twice — when the arc face
// returns to the glass (day 6) and when the second regular returns (day 7).
// The counter is delta-based (dev hooks survive restarts, like sfxTicks).
{
    await page.evaluate(() => window.__ppTest.start(0))
    await wait(300)
    const ag = () => page.evaluate(() => ({ n: window.__ppTest.sfxAgain(), log: window.__ppTest.againLog() }))
    const a0 = await ag()
    await page.evaluate(() => window.__ppTest.runDay()) // day 1 (no regulars) -> day 2 greets
    await wait(200)
    r.check('day 1 passes in silence — strangers and first walk-ups never ring', (await ag()).n === a0.n, `${(await ag()).n} vs ${a0.n}`)
    await page.evaluate(() => { const t = window.__ppTest; t.runDay(); t.runDay(); t.runDay(); t.runDay() })
    await wait(250)
    const a6 = await ag()
    r.check('the day-6 row opens silent — the violators ahead of the neighbor earn no welcome',
        a6.n === a0.n && a6.log.length === a0.log.length, JSON.stringify(a6.log.slice(a0.log.length)))
    await page.evaluate(() => window.__ppTest.runDay()) // the row parts mid-day for GRUBAK'S return (the wall's turn), then the greet tail
    await wait(250)
    const a7 = await ag()
    r.check("the door rings when the arc face returns to the glass (seed 0: GRUBAK, day 6) and the greet tail stays silent",
        a7.n === a0.n + 1 && JSON.stringify(a7.log.slice(a0.log.length)) === JSON.stringify(['6|grubak|turn']),
        JSON.stringify(a7.log.slice(a0.log.length)))
    await page.evaluate(() => window.__ppTest.runToEnd()) // day 7's row parts for MARKO'S return; the finale ends in silence
    await wait(250)
    const aEnd = await ag()
    r.check('a whole week rings exactly twice, named: GRUBAK day 6 (turn), MARKO day 7 (again) — the greet tails never',
        aEnd.n === a0.n + 2 && JSON.stringify(aEnd.log.slice(a0.log.length)) === JSON.stringify(['6|grubak|turn', '7|marko|again']),
        JSON.stringify(aEnd.log.slice(a0.log.length)))
    await wait(1100)
    await page.keyboard.press('a') // leave the week-end screen
}

await wait(400)
const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e) &&
    // headless Chrome on a shared box logs this when the OS audio renderer
    // fails for the page's AudioContext — a device-level complaint, not a
    // page error (all synthesized-audio gates above passed on real tones).
    !/AudioContext encountered an error from the audio device/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
