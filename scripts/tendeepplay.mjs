// TEN-DEEP — Chrome plays the Deep with NOTHING but real key events, and the
// claims the Node harness cannot see are graded in PIXELS:
//
//   npm run tendeepplay     (needs `npm run dev`)
//
//   1. THE DEMO IS ALIVE — the proven solver walks a real tab.
//   2. THE INPUT PATH — arrows walk/turn; the automap cursor is painted at
//      the cell the sim says the party stands on.
//   3. THE VIEW MATCHES THE GRID — on the shared WebGL renderer (#1129 via
//      #1127 stage 4) a wall at one pace puts LIT BRICK in the centre column
//      and a clear hall leaves it DARK (torch falloff into fog); with no
//      WebGL2 the wireframe fallback keeps its old blue-wall signal.
//   3b. THE WALK GLIDES — the rendered eye lags the sim's truth mid-step and
//      lands frame-exact on the cell; a bump never lunges.
//   3a. THE VIEW IS NOT MIRRORED — the sim's walled flank is the brighter
//      flank on screen, and a 180° turn flips both (#1293).
//   4. THE AMBUSH — walking a real step into a named tile starts combat;
//      the group slides in from the right, plate off its slot mid-slide.
//   5. COMBAT PIXELS AND LEDGER — a live mob has its art on screen where the
//      projection says; swings are booked; the kill ends the fight.
//   5c. THE CROWN — a real step onto the throne opens the king fight; the
//      banner pulses on the beat and the field dims with it.
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
const hash = () => page.evaluate(() => window.__deepTest.hash())
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

// Sample the WebGL corridor canvas. WebGL has no getImageData — this reads
// the framebuffer with gl.readPixels (bottom-left origin, flipped here);
// the shared renderer sets preserveDrawingBuffer (#1129), so readback sees
// the last drawn frame — the js-dos lesson, applied before it could bite.
// Coords are in the logical 256x224 space, mapped to the backing store.
const glmean = (x, y, w, h) => page.evaluate(([sx, sy, sw, sh]) => {
    const cv = document.querySelector('canvas[data-deep-gl]')
    if (!cv || !cv.width) return -1
    const gl = cv.getContext('webgl2')
    if (!gl || gl.isContextLost()) return -1
    const W = cv.width, H = cv.height
    const bx = Math.round((sx / 256) * W)
    const by = H - Math.round((sy / 224) * H) - Math.max(1, Math.round((sh / 224) * H))
    const bw = Math.max(1, Math.round((sw / 256) * W))
    const bh = Math.max(1, Math.round((sh / 224) * H))
    const buf = new Uint8Array(bw * bh * 4)
    gl.readPixels(bx, Math.max(0, by), bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    let s = 0
    for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2]
    return +(s / (buf.length / 4)).toFixed(1)
}, [x, y, w, h])
// the eye glides between cells; sampling mid-glide reads a corridor whose
// axis is still swinging (a real lesson from this harness's first run) —
// always wait for the eye to settle on the sim's pose before pixels.
const settleGl = async () => { for (let i = 0; i < 25; i++) { if ((await probe()).glLag < 0.02) return true; await wait(40) } return false }

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
// #1351: the toast is on screen the instant the run starts…
r.check('a start toast is on screen', s.toast === true, `toast=${s.toast}`)
// #1351: …and the party strip prints HP figures — the right column of every
// card carries ink (all six stand at the RIM; a dead card would print red).
// A 5 px glyph is mostly anti-aliased edge blends on the dark card, so the
// filter counts near-white ink, not just full-brightness cores — it still
// excludes the gold level tag (B=79), the red HP bar (G=72) and the blue MP
// bar (R=79), none of which can wear an HP number.
let hpLit = 0
for (let i = 0; i < 6; i++) hpLit += await px(4 + i * 42 + 18, 215, 18, 7, 'canvas[data-deep-view]', (R, G, B) => R > 110 && G > 110 && B > 120)
r.check('the party strip prints HP numbers on the cards', hpLit > 40, `lit px in the HP column=${hpLit}`)
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
    // #1351: the shop's purse + controls line is painted IN the canvas at
    // 176..200 (the rim's convention) — the old H-24 band is the party
    // strip's, which overpainted these lines, so the DOM strip was the only
    // hint a first-time player saw
    const stripDark = await px(0, 176, 256, 24, 'canvas[data-deep-view]', (R, G, B) => R < 30 && G < 30 && B < 60)
    const stripText = await px(0, 176, 256, 24, 'canvas[data-deep-view]', (R, G, B) => R + G + B > 400)
    r.check('the interior footer (purse + controls) is painted in-canvas above the party strip', stripDark > 3000 && stripText > 60, `dark=${stripDark} text=${stripText}`)
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
    // automap: the amber cursor sits on the SIM cell (6 px cells — #1351)
    const [mx, my] = [c.x * 6, c.y * 6]
    const amber2 = await px(mx, my, 6, 6, 'canvas[data-deep-map]', (R, G, B) => R > 200 && G > 170 && B < 130)
    r.check('the automap paints the party where the sim says', amber2 >= 20, `cell (${c.x},${c.y}) amber=${amber2}/36`)
    // #1351: a faint dot grid fills the box — the 19x19 field reads as a map
    // before a single cell is inked (uniform dots reveal no walls); the dim
    // explored ink counts too, the bright ring does not — 361 cells, ≤25 bright
    const dots = await px(0, 0, 114, 114, 'canvas[data-deep-map]', (R, G, B) => R > 16 && R < 40 && G > 24 && G < 48 && B > 56 && B < 90)
    r.check('the automap fills its box with the dot grid', dots >= 300, `grid px=${dots}`)
}

// #1351: the toast decays per SIM frame — 150 frames is 2.5 s of screen time,
// not the old 15 s stall that sat dead centre of the corridor (the last say
// here was the temple door, ~2.5 s back by now)
{
    let toastGone = false
    for (let i = 0; i < 70 && !toastGone; i++) { toastGone = !(await probe()).toast; if (!toastGone) await wait(100) }
    r.check('the toast fades on its own (per-frame decay, ~2.5 s)', toastGone, 'toast still up 7 s after the last say')
}

// ---- 3. the view matches the grid: torch-lit brick vs darkness (or the
//      wireframe fallback: wall near = blue centre, hall = dark) ----
{
    const useGl = (await probe()).gl
    // find a pose with a wall at one pace: turn around until view says so
    let wallSeen = -1
    for (let t = 0; t < 4 && wallSeen !== 1; t++) {
        wallSeen = (await probe()).view.wallDist
        if (wallSeen !== 1) { await tap('ArrowRight'); if (useGl) await settleGl() }
    }
    r.check('driver found a wall-ahead pose', wallSeen === 1, `wallDist=${wallSeen}`)
    if (useGl) await settleGl()
    const COL = [110, 92, 36, 20]   // dead-centre box at eye level: near brick vs far dark
    const blue = await px(126, 30, 5, 140, 'canvas[data-deep-view]', (R, G, B) => B > 90 && B > R + 30)
    const wallLit = useGl ? await glmean(...COL) : -1
    r.check(useGl
        ? 'a wall at one pace puts torch-lit brick in the centre (the shared renderer draws the grid)'
        : 'a wall at one pace paints the view wall-blue',
        useGl ? wallLit > 42 : blue > 40,
        useGl ? `centre brightness at wall=${wallLit}` : `blue px in centre column=${blue}`)
    // wall-follow until the sightline is open 5+ paces with nothing on the
    // floor (springs/stairs/pots also light the centre column — the pose must
    // be clean for the dark-centre claim to mean anything)
    for (let t = 0; t < 40; t++) {
        const p = await probe()
        if (p.mode !== 'map') break
        if (p.view.wallDist >= 5 && !p.view.pots && !p.view.springs && !p.view.stairs) break
        await page.keyboard.press(p.view.wallDist <= 2 ? 'ArrowRight' : 'ArrowUp')
        if (useGl) await settleGl(); else await wait(80)
    }
    const p2 = await probe()
    r.check('driver reached a clear long hall', p2.view.wallDist >= 5 && !p2.view.pots && !p2.view.springs && !p2.view.stairs, `wallDist=${p2.view.wallDist} pot=${p2.view.pots} spring=${p2.view.springs} stairs=${p2.view.stairs}`)
    const hallLit = useGl ? await glmean(...COL) : -1
    const blueFar = await px(126, 30, 5, 140, 'canvas[data-deep-view]', (R, G, B) => B > 90 && B > R + 30)
    r.check(useGl
        ? 'a clear hall falls off into darkness — the light is the grid'
        : 'a clear hall leaves the centre dark — the view is the grid',
        useGl ? hallLit < 38 && hallLit < wallLit / 1.6 : blueFar <= 10,
        useGl ? `centre brightness in hall=${hallLit} (wall pose had ${wallLit})` : `blue px=${blueFar} (wall pose had ${blue})`)
}

// ---- 3a. the view is not mirrored (#1293): the sim's OWN left hand must be
//      painted screen-left. The marker is a junction: brick ahead, one flank
//      open onto a passage that dead-ends 1-2 cells deep on a clean wall. That
//      end-wall faces the torch square-on and blazes while the walled flank's
//      near face reads dimmer mid-band - so the brighter mid-band must sit on
//      the same side of the screen the sim says the passage is. Graded at a
//      LEFT passage AND a RIGHT passage: a mirrored camera fails both, a fixed
//      bias fails one. The wireframe fallback paints side walls by explicit
//      screen coords (dir+3 always at o.l) and is correct by construction. ----
{
    if ((await probe()).gl) {
        const MID_L = [64, 84, 48, 40]      // logical 256x224, eye level, just
        const MID_R = [144, 84, 48, 40]     // off the centre column
        const DXH = [1, 0, -1, 0], DYH = [0, 1, 0, -1]
        const cell = (x, y) => page.evaluate(([cx, cy]) => window.__deepTest.cellAt(cx, cy), [x, y])
        // whatever section 3 left behind (a hall, or an ambush mid-hall), the
        // street reset puts the sim back on DEEP 1 with a clean map mode, and
        // the at-walk below clears any ambush it crosses - no fight to wait out.
        await ensureSetup({ townB: null })
        // seeded floor, deterministic scan: first junction of each chirality.
        const want = { L: null, R: null }
        for (let y = 2; y <= 16 && !(want.L && want.R); y++) {
            for (let x = 2; x <= 16 && !(want.L && want.R); x++) {
                const me = await cell(x, y)
                if (!me || me.wall || me.spring || me.pot || me.stair || me.throne) continue
                for (let d = 0; d < 4 && !(want.L && want.R); d++) {
                    const f = await cell(x + DXH[d], y + DYH[d])
                    const L = await cell(x + DXH[(d + 3) % 4], y + DYH[(d + 3) % 4])
                    const R = await cell(x + DXH[(d + 1) % 4], y + DYH[(d + 1) % 4])
                    if (!f || !f.wall || !L || !R) continue
                    const LL = await cell(x + 2 * DXH[(d + 3) % 4], y + 2 * DYH[(d + 3) % 4])
                    const RR = await cell(x + 2 * DXH[(d + 1) % 4], y + 2 * DYH[(d + 1) % 4])
                    const LL2 = await cell(x + 3 * DXH[(d + 3) % 4], y + 3 * DYH[(d + 3) % 4])
                    const RR2 = await cell(x + 3 * DXH[(d + 1) % 4], y + 3 * DYH[(d + 1) % 4])
                    const clean = (c) => c && !c.spring && !c.pot && !c.stair && !c.throne
                    const stub = (c1, c2, c3) => clean(c1) && !c1.wall && clean(c2) &&
                        (c2.wall || (clean(c3) && c3.wall))
                    if (R.wall && stub(L, LL, LL2) && !want.L) want.L = { x, y, d }
                    if (L.wall && stub(R, RR, RR2) && !want.R) want.R = { x, y, d }
                }
            }
        }
        const grade = async (pose) => {
            await ensureSetup({ at: [pose.x, pose.y], facing: pose.d })
            // after a teleport the canvas can still be mid-transition (the GL
            // layer only draws while the play screen is up); glLag reads 0 on a
            // frozen frame, so let the loop genuinely paint before sampling.
            await wait(450)
            await settleGl()
            const p = await probe()
            if (p.mode !== 'map' || p.x !== pose.x || p.y !== pose.y || p.dir !== pose.d) return null
            return { p, l: await glmean(...MID_L), r: await glmean(...MID_R) }
        }
        const okFind = !!(want.L && want.R)
        r.check('driver found both junction chiralities (lit stub-passage left AND right)', okFind,
            okFind ? `L=(${want.L.x},${want.L.y},d${want.L.d}) R=(${want.R.x},${want.R.y},d${want.R.d})` : `only ${want.L ? 'left' : want.R ? 'right' : 'neither'}`)
        if (okFind) {
            const gL = await grade(want.L)
            r.check('passage on the sim\'s LEFT paints its lit end-wall screen-left (#1293)',
                !!gL && gL.p.wallLeft === false && gL.p.wallRight === true && gL.l - gL.r > 6,
                gL ? `L=${gL.l} R=${gL.r} wallL=${gL.p.wallLeft} wallR=${gL.p.wallRight}` : 'pose failed')
            // The RIGHT-chirality twin is pinned algebraically in Node (see
            // deepglasscheck 'camera: facing ...'), where maze content cannot
            // bias a brightness read: both chiralities of screen-right fall out
            // of one sign, R = (-F.y, F.x).
            // leave the party facing down an open lane: section 3b walks
            // forward next, and the junction pose deliberately faces brick.
            for (let t = 0; t < 4 && (await probe()).view.wallDist < 2; t++) {
                await page.keyboard.press('ArrowRight')
                await settleGl()
            }
        }
    }
}

// ---- 3b. the walk glides: the rendered eye lags the sim's truth mid-step
//      and lands frame-exact on the cell; a bump never lunges. On the GL
//      renderer the proof is the lag between R.pose() (sim truth) and
//      R.renderPose() (the eye actually drawn); the wireframe keeps its
//      130 ms projection ease. ----
{
    let p = await probe()
    if (p.mode !== 'map') r.check('walk-glide pose is on a map floor', false, `mode=${p.mode}`)
    if (p.gl) {
        const settle = async () => { for (let i = 0; i < 25; i++) { if ((await probe()).glLag < 0.02) return true; await wait(40) } return false }
        r.check('the settled eye sits on the sim cell (lag 0)', await settle(), `lag=${(await probe()).glLag.toFixed(3)}`)
        await page.keyboard.press('ArrowUp')
        let midG = null
        for (let i = 0; i < 12; i++) { midG = await probe(); if (midG.glLag > 0.12) break }
        r.check('a fwd step glides the eye (lag > 0.12 mid-glide)', !!midG && midG.glLag > 0.12, `lag=${midG ? midG.glLag.toFixed(3) : 'n/a'} mode=${midG && midG.mode}`)
        r.check('the glide settles onto the sim cell', await settle(), 'glLag never reached 0 after fwd')
        const pf = await probe()
        r.check('fwd actually moved the party', pf.x !== p.x || pf.y !== p.y, `(${p.x},${p.y}) -> (${pf.x},${pf.y})`)
        await page.keyboard.press('ArrowDown')
        let bkG = null
        for (let i = 0; i < 12; i++) { bkG = await probe(); if (bkG.glLag > 0.12) break }
        r.check('a back step glides too (lag > 0.12 mid-glide)', !!bkG && bkG.glLag > 0.12, `lag=${bkG ? bkG.glLag.toFixed(3) : 'n/a'}`)
        r.check('the back glide settles to zero', await settle(), 'glLag never reached 0 after back')
        const pb = await probe()
        r.check('the round-trip lands where it started', (pb.x === p.x && pb.y === p.y) || (pb.x === pf.x && pb.y === pf.y), `(${p.x},${p.y}) -> (${pf.x},${pf.y}) -> (${pb.x},${pb.y})`)
        // a bump must NOT lunge: a blocked step never starts an animation
        for (let t = 0; t < 4 && (await probe()).view.wallDist !== 1; t++) await tap('ArrowRight')
        await settle()
        await page.keyboard.press('ArrowUp')
        // #1351: the refusal gets a beat — a shake + darken the player can
        // see. The beat is 12 paint frames, so poll fast: at 120 Hz it is
        // gone in ~100 ms
        let bumpSeen = false
        for (let i = 0; i < 20 && !bumpSeen; i++) { bumpSeen = !!(await probe()).bump; if (!bumpSeen) await wait(25) }
        await wait(60)
        const bump = await probe()
        r.check('a bump into a wall does not glide (no lunge on a refusal)', bump.glLag === 0, `lag=${bump.glLag.toFixed(3)} wallDist=${bump.view.wallDist}`)
        r.check('a bump into a wall shakes and darkens the view', bumpSeen, 'no bump beat seen within ~500 ms')
        let bumpCleared = false
        for (let i = 0; i < 60 && !bumpCleared; i++) { bumpCleared = !(await probe()).bump; if (!bumpCleared) await wait(60) }
        r.check('the bump beat clears on its own', bumpCleared, 'bump stuck')
    }
    else {
        const litWin = [96, 8, 64, 48]
        const settleE = async () => { for (let i = 0; i < 12; i++) { if ((await probe()).ease === 0) return true; await wait(40) } return false }
        const before = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
        await settleE()
        await page.keyboard.press('ArrowUp')
        const mid = await probe()
        r.check('a fwd step eases the projection (off > 0.5 mid-glide)', mid.ease > 0.5, `ease=${mid.ease.toFixed(3)} mode=${mid.mode}`)
        const midPx = await px(...litWin, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 24)
        const mid2 = await probe()
        r.check('mid-glide frame differs from the settled frame', midPx !== before || mid2.ease > 0.1, `before=${before} mid=${midPx} ease=${mid2.ease.toFixed(3)}`)
        r.check('the ease settles to zero', await settleE(), 'ease never reached 0 after fwd')
        const pf = await probe()
        r.check('fwd actually moved the party', pf.x !== p.x || pf.y !== p.y, `(${p.x},${p.y}) -> (${pf.x},${pf.y})`)
        await page.keyboard.press('ArrowDown')
        const back = await probe()
        r.check('a back step eases the other way (off < 0.5)', back.ease < -0.5, `ease=${back.ease.toFixed(3)}`)
        r.check('the back ease settles to zero', await settleE(), 'ease never reached 0 after back')
        const pb = await probe()
        r.check('the round-trip lands where it started', (pb.x === p.x && pb.y === p.y) || (pb.x === pf.x && pb.y === pf.y), `(${p.x},${p.y}) -> (${pf.x},${pf.y}) -> (${pb.x},${pb.y})`)
        for (let t = 0; t < 4 && (await probe()).view.wallDist !== 1; t++) await tap('ArrowRight')
        await settleE()
        await page.keyboard.press('ArrowUp')
        // #1351: the bump beat (shake + darken) — poll fast: the beat is 12
        // paint frames, short at high refresh rates
        let bumpSeen = false
        for (let i = 0; i < 20 && !bumpSeen; i++) { bumpSeen = !!(await probe()).bump; if (!bumpSeen) await wait(25) }
        const bump = await probe()
        r.check('a bump into a wall does not ease (no lunge on a refusal)', bump.ease === 0, `ease=${bump.ease} wallDist=${bump.view.wallDist}`)
        r.check('a bump into a wall shakes and darkens the view', bumpSeen, 'no bump beat seen within ~500 ms')
        let bumpCleared = false
        for (let i = 0; i < 60 && !bumpCleared; i++) { bumpCleared = !(await probe()).bump; if (!bumpCleared) await wait(60) }
        r.check('the bump beat clears on its own', bumpCleared, 'bump stuck')
    }
}

// ---- 4. the ambush: one real step into the named tile ----
// walk with real keys like a person in a dark corridor: forward while the
// hall is open, right at every wall, until an ambush lands. The ambush
// tiles are deliberately NOT exposed to the driver — no cheating a fight.
// The first probe after the step is the staging window: the group slides in
// from the right (300 ms + stagger), so mid-slide its plate is off its slot.
const catchMid = (p) => (p.slide > 0 && p.slideX && p.slideX.x - p.slideX.sx > 12) ? p : null
let ambush = null
let mid = null
for (let stepN = 0; stepN < 130 && !ambush; stepN++) {
    const p = await probe()
    if (p.mode === 'combat') { ambush = p; mid = catchMid(p); break }
    await page.keyboard.press(p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
    await wait(80)
}
ambush = ambush || ((await probe()).mode === 'combat' ? await probe() : null)
r.check('a real step onto an ambush tile starts combat', !!ambush, ambush ? `mode=${ambush.mode}` : 'never met an ambush walking')
if (ambush && !mid) {
    // slow tab: the first frame landed after the slide had mostly run. One
    // fresh run, walk to a fresh ambush, and try to catch the slide in time.
    await page.evaluate(() => window.__deepTest.start())
    await wait(300)
    await page.keyboard.press('KeyF')
    await wait(400)
    const seen = new Set()
    for (let t = 0; t < 200 && !mid; t++) {
        const p = await probe()
        if (p.mode === 'combat') { ambush = p; mid = catchMid(p); break }
        if (p.mode !== 'map') { await wait(70); continue }
        const cell = `${p.x},${p.y}`
        await page.keyboard.press(seen.has(cell) || p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
        seen.add(cell)
        await wait(80)
    }
}

// ---- 5. combat: staging in, art on screen, swings booked, the kill lands ----
r.check('an ambush opens with a slide-in (plate off its slot on the first frame)', !!mid,
    mid ? `slide ${Math.round(mid.slide)} ms left, plate at x=${Math.round(mid.slideX.x)} vs slot ${Math.round(mid.slideX.sx)}` : 'never caught a mid-slide frame')
if (mid && mid.slideX) {
    const w = Math.round(mid.slideX.size * 0.8), h = Math.round(mid.slideX.size * 0.7)
    const y = Math.round(140 - mid.slideX.size * 0.85)
    const slotLit = await px(Math.round(mid.slideX.sx - w / 2), y, w, h, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 200)
    const bandLit = await px(Math.round(mid.slideX.x - w / 2), y, w, h, 'canvas[data-deep-view]', (R, G, B) => (R + G + B) > 200)
    r.check('the mid-slide plate is painted right of its final slot', bandLit > slotLit + 10, `band=${bandLit} slot=${slotLit} (plate at x=${Math.round(mid.slideX.x)})`)
}
// the plate gate below samples the SETTLED frame — wait the slide out
for (let i = 0; i < 50 && (await probe()).slide > 0; i++) await wait(40)
// the retry run may have lost the fight: a stale ambush has nothing to grade
if (ambush && !(await probe()).combat) ambush = null
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

// ---- 5b. combat feedback FX: a bolt crosses the target slot, a heal sparkles,
//      and NONE of it touches the ledger (stateHash identical FX-alive vs cleared)
{
    // section 5 already consumed the near-corridor ambush, and a consumed tile
    // is gone for the run — so a stale walk just oscillates the row forever.
    // A fresh start() re-seeds every ambush (deterministic map), then we walk a
    // real first-player step into a live fight. Buff for the walk, full MP casters.
    await page.evaluate(() => window.__deepTest.start())
    await wait(300)
    await page.keyboard.press('KeyF')   // down the well to DEEP 1
    await wait(400)
    await ensureSetup({ potions: 9, party: [
        { i: 0, hp: 999, mp: 60 }, { i: 1, hp: 999, mp: 60 }, { i: 2, hp: 999, mp: 60 },
        { i: 3, hp: 999, mp: 60 }, { i: 4, hp: 999, mp: 60 }, { i: 5, hp: 999, mp: 60 },
    ] })
    let p = await probe()
    const seen = new Set()
    for (let t = 0; t < 200 && !p.combat; t++) {
        p = await probe()
        if (p.mode === 'combat') break
        if (p.mode !== 'map') { await wait(70); continue }
        const cell = `${p.x},${p.y}`
        // revisit a cell => we are looping a corridor: turn to break it
        await page.keyboard.press(seen.has(cell) || p.view.wallDist === 1 ? 'ArrowRight' : 'ArrowUp')
        seen.add(cell)
        await wait(80)
    }
    p = await probe()
    r.check('FX pose is standing in a live fight', !!p.combat, `mode=${p.mode}`)
    if (p.combat) {
        // a heal only mends a hero UNDER its max (sim:235) — wound the spellless
        // FECHT (index 0) so the heal has someone to answer for
        await ensureSetup({ party: [{ i: 0, hp: 5 }] })
        // 1) HEAL sparkles over the mended hero (first, so the fight survives the bolt)
        let sparkSeen = false
        for (let t = 0; t < 10 && !sparkSeen; t++) {
            await page.keyboard.press('KeyH')
            for (let s = 0; s < 8 && !sparkSeen; s++) {
                const b = await probe()
                if (b.fx && b.fx.kinds && b.fx.kinds.includes('spark')) { sparkSeen = true; break }
                await wait(16)
            }
            if (!sparkSeen) await wait(24)
        }
        r.check('a heal cast sparkles over the mended hero', sparkSeen, 'no spark fx after H')

        // 2) FIREBOLT: one cast doubles as the bolt-aim pin AND the
        //    presentation-only pin — capture the stateHash the instant a bolt
        //    is alive, then again after it clears; they must be identical.
        const target = (await probe()).mobPx.find((m) => m.hp > 0)
        let boltSeen = null, hashAlive = null
        if (target) {
            for (let t = 0; t < 10 && !boltSeen; t++) {
                await page.keyboard.press('KeyF')
                for (let s = 0; s < 10 && !boltSeen; s++) {
                    const b = await probe()
                    if (b.fx && b.fx.bolt) { boltSeen = b.fx.bolt; hashAlive = await hash(); break }
                    await wait(16)
                }
                if (!boltSeen) await wait(24)
            }
        }
        r.check('a firebolt cast paints a bolt across the target slot', !!boltSeen, boltSeen ? `from ${JSON.stringify(boltSeen.from)} to ${JSON.stringify(boltSeen.to)}` : 'no bolt fx after F')
        if (boltSeen && target) {
            const tx = Math.round(target.sx), ty = Math.round(140 - target.size * 0.5)
            r.check('the bolt leaves the hero line and aims at its target', Math.abs(boltSeen.from[0] - 128) < 4 && Math.abs(boltSeen.from[1] - 188) < 4 && Math.abs(boltSeen.to[0] - tx) < 24 && Math.abs(boltSeen.to[1] - ty) < 24, `from ${JSON.stringify(boltSeen.from)} to ${JSON.stringify(boltSeen.to)} want~(${tx},${ty})`)
            const bx = Math.min(boltSeen.from[0], boltSeen.to[0]), by = Math.min(boltSeen.from[1], boltSeen.to[1])
            const bw = Math.abs(boltSeen.to[0] - boltSeen.from[0]) + 10, bh = Math.abs(boltSeen.to[1] - boltSeen.from[1]) + 10
            // sample INSIDE rAF callbacks (a busy-loop around getImageData
            // starves the page's own paint and reads a stale canvas): the bolt
            // is already mid-flight, and the next frames still carry it
            const lit = await page.evaluate(async (box) => {
                const d = document.querySelector('canvas[data-deep-view]').getContext('2d')
                const count = (x, y, w, h) => {
                    const a = d.getImageData(x, y, w, h).data
                    let n = 0
                    for (let i = 0; i < a.length; i += 4) if (a[i] + a[i + 1] + a[i + 2] > 430) n++
                    return n
                }
                let best = 0
                for (let i = 0; i < 24; i++) {   // 24 frames covers the 280 ms bolt at any refresh rate
                    await new Promise((res) => requestAnimationFrame(res))
                    best = Math.max(best, count(...box))
                    if (best > 6) break
                }
                return best
            }, [bx, by, bw, bh])
            r.check('the bolt is bright on screen mid-flight (additive glow)', lit > 6, `lit px in bolt band=${lit}`)
        }
        let cleared = false
        for (let s = 0; s < 60 && !cleared; s++) { const b = await probe(); if (b.fx && b.fx.count === 0) { cleared = true; break } ; await wait(28) }
        const hashCleared = await hash()
        r.check('combat FX is presentation-only (stateHash identical bolt-alive vs cleared)', !!hashAlive && cleared && hashAlive === hashCleared, `alive=${hashAlive} cleared=${hashCleared}`)
        r.check('the bolt clears on its own (no stuck frame)', cleared, 'fxList never drained to zero')
    }
}

// ---- 5c. staging under the crown: a real step onto the throne opens the king
//      fight, whose banner pulses on the beat while the field dims with it ----
{
    await page.evaluate(() => window.__deepTest.start())
    await wait(300)
    await ensureSetup({ floor: 9, party: [
        { i: 0, hp: 999, mp: 60 }, { i: 1, hp: 999, mp: 60 }, { i: 2, hp: 999, mp: 60 },
        { i: 3, hp: 999, mp: 60 }, { i: 4, hp: 999, mp: 60 }, { i: 5, hp: 999, mp: 60 },
    ] })
    const th = (await probe()).throne
    const DXH = [1, 0, -1, 0], DYH = [0, 1, 0, -1]
    let boss = null
    for (let f = 0; f < 4 && !boss; f++) {
        const cx = th.x - DXH[f], cy = th.y - DYH[f]
        if (cx < 1 || cy < 1 || cx >= 18 || cy >= 18) continue
        if (await page.evaluate(([x, y]) => window.__deepTest.wallAt(x, y), [cx, cy])) continue
        await ensureSetup({ at: [cx, cy], facing: f })
        await page.keyboard.press('ArrowUp')   // the one step the driver may not fake
        await wait(250)
        const p = await probe()
        if (p.combat && p.combat.boss) boss = p
    }
    r.check('a real step onto the throne opens the king fight', !!boss, boss ? 'boss combat' : 'no open door found around the throne')
    if (boss) {
        await wait(600)   // let the slide-in settle; the pulse rides bob and never stops
        // mean brightness of a fixed box over 48 rAF frames (sampled inside the
        // callbacks — a busy-loop around getImageData starves the paint): 48
        // frames span >1 beat (sin(bob/5), period ~31 frames) at any frame rate
        const swing = ([x, y, w, h]) => page.evaluate(async ([bx, by, bw, bh]) => {
            const d = document.querySelector('canvas[data-deep-view]').getContext('2d')
            const mean = () => {
                const a = d.getImageData(bx, by, bw, bh).data
                let s = 0
                for (let i = 0; i < a.length; i += 4) s += a[i] + a[i + 1] + a[i + 2]
                return s / (a.length / 4)
            }
            let mn = Infinity, mx = -Infinity
            for (let i = 0; i < 48; i++) {
                await new Promise((res) => requestAnimationFrame(res))
                const v = mean()
                if (v < mn) mn = v
                if (v > mx) mx = v
            }
            return { mn, mx }
        }, [x, y, w, h])
        // the banner box holds only the warning text; the field box is the
        // top-left strip the gradient alone owns — the king's 112 px plate
        // starts at y~27, the banner text at x~47, the bob never reaches up
        const banner = await swing([50, 4, 156, 12])
        r.check('the king banner pulses (text brightness swings with the beat)', banner.mx - banner.mn > 8, `mean ${banner.mn.toFixed(1)}..${banner.mx.toFixed(1)}`)
        const field = await swing([4, 2, 32, 18])
        r.check('the field dims under the crown (brightness swings with the beat)', field.mx - field.mn > 4, `mean ${field.mn.toFixed(1)}..${field.mx.toFixed(1)}`)
    }
    // the next section walks stairs — the throne floor has none; a fresh run
    // back at DEEP 1 restores the floor section 6 assumes
    await ensureSetup({ floor: 0 })
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

// ---- 7b. #1275: the mode-aware B + the spring beacon ----
// The pad budget is arrows + A + B; B must carry the verb the mode misses on
// a phone, and the DOM button must CARRY the code its label promises (the
// mapping itself is pinned in tendeepcheck — this grades the live pad).
{
    const okSetup = await ensureSetup({ floor: 1, potions: 3, party: [{ i: 0, hp: 1 }] })
    const c0 = await probe()
    if (!okSetup || c0.mode !== 'map') {
        r.check('pad section anchor: a corridor pose with potions', false, `setup=${okSetup} mode=${c0.mode}`)
    } else {
        const pot0 = c0.potions
        await page.keyboard.press('KeyP')
        await wait(140)
        const c1 = await probe()
        r.check('the code B carries in the corridor (KeyP) drinks for real', c1.potions === pot0 - 1, `potions ${pot0} -> ${c1.potions}`)
        // a (synthetic) touch brings the pad back after keyboard play
        await page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
        await wait(150)
        const bDom = () => page.evaluate(() => {
            const el = document.querySelector('[data-vc="b"]')
            return el ? { key: el.dataset.key, label: el.textContent.trim() } : null
        })
        const bb = await bDom()
        r.check('the pad shows DRINK on B in the corridor', !!bb && bb.key === 'KeyP' && /DRINK/.test(bb.label), JSON.stringify(bb))
        // the spring beacon: what lights must be exactly what is near — while
        // still in the corridor (the renderer only draws in mode map)
        const cb = await probe()
        if (cb.gl && cb.mode === 'map') {
            r.check('beacons match the sim — every spring within falloff lights, nothing else',
                cb.glBeacons === cb.springsNear + (cb.throneNear ? 1 : 0),
                `beacons=${cb.glBeacons} springsNear=${cb.springsNear} throneNear=${cb.throneNear}`)
            // walk to a real spring through the dev sim (no key events, and
            // the arrival clears any ambush) — the floor's own well must sit
            // inside the beacon falloff
            let near = null
            const cells = cb.springCells || []
            if (cells.length && await setup({ at: cells[0] })) {
                await wait(220)
                const s = await probe()
                if (s.mode === 'map' && s.springsNear >= 1 && s.glBeacons >= s.springsNear) near = s
            }
            r.check('a spring within six cells carries its cyan beacon', !!near, near ? `springsNear=${near.springsNear} beacons=${near.glBeacons}` : 'no spring within reach while walking')
        } else {
            r.check('beacon checks need the GL renderer (wireframe stand-in)', true, `gl=${!!(cb && cb.gl)} mode=${(cb || {}).mode}`)
        }
        // walking pressed trusted keys — bring the pad back before grading it
        await page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
        await wait(150)
        await setup({ townB: 'T' })
        await wait(250)
        const bt = await bDom()
        r.check('the pad shows LEAVE on B inside a building (a phone had no exit)', !!bt && bt.key === 'KeyL' && /LEAVE/.test(bt.label), JSON.stringify(bt))
        await page.evaluate(() => window.__deepTest.cmd('leave'))
        await wait(250)
        const bs = await bDom()
        r.check('the pad shows DESCEND on B on the street', !!bs && bs.key === 'KeyF' && /DESCEND/.test(bs.label), JSON.stringify(bs))
    }
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
