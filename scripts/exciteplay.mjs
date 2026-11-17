// EXCITEBIKE — Chrome rides the track with NOTHING but real key events, and the
// claims a Node harness cannot see are graded in PIXELS:
//
//   npm run exciteplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — ArrowUp is the GAS, the bike accelerates and the world
//      scrolls under a rider that stays pinned at the same screen column.
//   2. THE PAINT FOLLOWS THE HEIGHTMAP — the rider's red pixels sit at exactly
//      the canvas row the sim's altitude projects to (g2s), and climb when it
//      climbs. This is the check a Node audit of sim.js structurally cannot make.
//   3. THE LEAN IS REAL IN THE AIR — an arrow key tips the pitch while airborne
//      (the one input path the shell could previously not deliver at all).
//   4. THE WATER HOLE BITES IN THE TAB — a slow bike stalls on real pixels, and
//      real SPACE pumps walk it back to life faster than idle would.
//   5. THE ENGINE BOILS off a held throttle, and a drained clock ends the race
//      and loops back through the attract — which is the autopilot's proven lap.
//   6. THE CRASH LEAGUE — rivals fly real parabolas, wipe out at the big-jump
//      lip and remount on screen, announced (#2384).
//   7. CONTACT — a downed rival blocks the lane (real gas into it = WRECK!),
//      a real SPACE hop pays a FLYBY, the hazard chevron is painted, and the
//      attract demo replays its pinned contact receipt tick-for-tick (#2391).
//   8. PACK — a rival chains into a downed rival on screen ("PILES IN!") and
//      a better rider hazard-hops the same body clean (#2420).
// The terrain, ledger, slack rule and nine mutants live in excitecheck.mjs.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.EXCITE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/excitebike`
await requireDevServer(URL)

const W = 256, H = 240
const g2s = (h) => (H - 46) - (h - 40) * 0.95
const isRed = (r, g, b) => r > 165 && g < 85 && b < 85

const r = new Report('exciteplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 680 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
// device-level AudioContext complaints (no audio device/renderer on the box)
// are not page errors — same filter lodeplay/papersplay/britanniadrive carry.
const deviceNoise = (s) => /AudioContext encountered an error from the audio device/i.test(String(s || ''))
page.on('pageerror', (e) => { if (!deviceNoise(e.message)) errors.push(`[pageerror] ${e.message}`) })
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location()) && !deviceNoise(m.text())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__bikeTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }

// red-pixel centroid (x,y) + count over the whole stage
const bikePx = () => page.evaluate(() => {
    const g = document.querySelector('canvas[data-bike-stage]').getContext('2d')
    const d = g.getImageData(0, 0, 256, 240).data
    let n = 0, sx = 0, sy = 0, y0 = 999, y1 = -1
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4
        if (d[i] > 165 && d[i + 1] < 85 && d[i + 2] < 85) { n++; sx += x; sy += y; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
    return n ? { n, cx: sx / n, cy: sy / n, y0, y1 } : { n: 0, cx: -1, cy: -1, y0: -1, y1: -1 }
})

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__bikeTest never appeared (dev server? /excitebike route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(900)

// ---- attract: the autopilot's proven lap plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let moved = false, scoreGrew = false, sawBoost = false
    const t0 = a.tick, x0 = a.x
    for (let i = 0; i < 80; i++) {
        const s = await probe()
        moved = moved || s.x > x0 + 60
        scoreGrew = scoreGrew || s.score > 0
        sawBoost = sawBoost || s.v > 6
        if (moved && scoreGrew) break
        await wait(120)
    }
    const p = await bikePx()
    r.check('attract sim is live (the proven autopilot lap rides)', moved, `tick ${t0} -> ${(await probe()).tick}, x ${x0} -> ${(await probe()).x}`)
    r.check('the autopilot demo is really SCORING (boosts it hits)', scoreGrew || sawBoost, `score=${(await probe()).score}`)
    r.check('the attract screen paints a rider on the canvas', p.n > 25, `${p.n} red px`)
}

// ---- a real key opens the splash; Enter starts a fresh race ----
await page.keyboard.press('KeyZ')
await wait(200)
{
    const s0 = await probe()
    r.check('a real key at the marquee opens the TRACKS splash (#2563)', s0.screen === 'tracks' && s0.tracks === 6,
        `screen=${s0.screen} tracks=${s0.tracks}`)
}
await page.keyboard.press('Enter')
await wait(200)
{
    const a = await probe()
    r.check('Enter rides the selected course — a fresh race', a.screen === 'play' && a.count > 0 && a.x < 40 && a.score === 0,
        `screen=${a.screen} count=${a.count} x=${a.x.toFixed(0)}`)
}
let ready = false
for (let i = 0; i < 120 && !ready; i++) { ready = (await probe()).count === 0; if (!ready) await wait(80) }
r.check('the start-gate lifts (countdown reaches GO)', ready, `count=${(await probe()).count}`)

// ---- ArrowUp is the GAS: real key -> the world scrolls under a pinned rider ----
{
    const a = await probe()
    await page.keyboard.down('ArrowUp')
    let vPeak = 0
    for (let i = 0; i < 40; i++) { vPeak = Math.max(vPeak, (await probe()).v); await wait(60) }
    const b = await probe()
    await page.keyboard.up('ArrowUp')
    const p = await bikePx()
    r.check('ArrowUp builds speed (real gas)', b.v > 3.5 && vPeak > 3.5, `v ${a.v.toFixed(2)} -> ${b.v.toFixed(2)}`)
    r.check('holding gas advances the bike down the track (real distance)', b.x > a.x + 120, `x ${a.x.toFixed(0)} -> ${b.x.toFixed(0)}`)
    r.check('the rider stays PINED at one screen column while the world scrolls past', Math.abs(p.cx - 84) < 22 && p.n > 25,
        `bike red centroid cx=${p.cx.toFixed(0)} (want ~84), ${p.n} px`)
}

// ---- the paint follows the heightmap: the rider's row is where g2s(alt) says ----
{
    // an on-ground rider's alt is the TERRAIN, not a knob — so rest it on a hill
    // top (x=1200, ground 150) and a valley (x=1800, ground 87), read the SIM's
    // own settled alt, and demand the red band sit at g2s(alt)-6 in both cases.
    const restAndSample = async (x) => {
        await page.evaluate((px) => window.__bikeTest.setup({ track: 0, x: px, v: 0 }), x)
        await wait(500)                       // let alt ease onto the terrain
        const a = await probe()
        const p = await bikePx()
        return { alt: a.alt, y0: p.y0, y1: p.y1, n: p.n }
    }
    const hi = await restAndSample(1200)
    const lo = await restAndSample(1800)
    const row = (s) => (s.y0 + s.y1) / 2
    const want = (s) => g2s(s.alt) - 6
    r.check('the rider is PAINTED at the exact canvas row the heightmap projects to (hill top)',
        hi.n > 20 && Math.abs(row(hi) - want(hi)) < 14, `alt ${hi.alt.toFixed(0)} red ${hi.y0}-${hi.y1} want ~${want(hi).toFixed(0)}`)
    r.check('...and again in a valley, lower on the canvas',
        lo.n > 20 && Math.abs(row(lo) - want(lo)) < 14 && row(lo) > row(hi) + 25,
        `alt ${lo.alt.toFixed(0)} red ${lo.y0}-${lo.y1} want ~${want(lo).toFixed(0)} (hill was ${row(hi).toFixed(0)})`)
}

// ---- the LEAN is real in the air: an arrow tips the pitch (the fixed path) ----
{
    await page.evaluate(() => window.__bikeTest.setup({ x: 3200, alt: 150, v: 6, air: true, vy: 4, pitch: -0.25 }))
    await wait(80)
    const before = (await probe()).pitch
    await page.keyboard.down('ArrowUp')   // airborne: this is the rider's weight, not the gas
    await wait(500)
    const p1 = await probe()
    await page.keyboard.up('ArrowUp')
    r.check('airborne, ArrowUp LEANS the nose up (the weight path fires on real keys)',
        p1.pitch > before + 0.08 && p1.air, `pitch ${before.toFixed(3)} -> ${p1.pitch.toFixed(3)} (air=${p1.air})`)
    await page.evaluate(() => window.__bikeTest.setup({ x: 3200, alt: 150, v: 6, air: true, vy: 4, pitch: 0.2 }))
    await wait(80)
    const b2 = (await probe()).pitch
    await page.keyboard.down('ArrowDown')  // airborne: nose down
    await wait(500)
    const p2 = await probe()
    await page.keyboard.up('ArrowDown')
    r.check('airborne, ArrowDown LEANS the nose down', p2.pitch < b2 - 0.08, `pitch ${b2.toFixed(3)} -> ${p2.pitch.toFixed(3)}`)
}

// ---- THE CRASH LEAGUE (#2384): rivals fly, wipe out and remount in the tab ----
{
    // Re-seat the race and park the player AT the big-jump lip (x1200: the
    // near-flat slope reading holds v at 0 with no gas — the bike watches).
    // Rivals stream past from the start line; SONJA takes the lip at lap-x
    // ~1367, ~5 s in, straight in front of the camera (screen x ~250).
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 1200, v: 0 }))
    let sawAir = false, sawDown = false, sawUp = false, toastHit = false, downName = ''
    for (let i = 0; i < 220 && !(sawAir && sawDown && sawUp && toastHit); i++) {
        const s = await probe()
        for (const q of s.rivals) {
            if (q.air) sawAir = true
            if (q.down > 0 && q.crashes >= 1) { sawDown = true; downName = q.name }
            if (sawDown && q.name === downName && q.down === 0 && q.crashes >= 1) sawUp = true
        }
        if (!toastHit) {
            const txt = await page.evaluate(() => document.body.innerText)
            if (/DOWN!/.test(txt)) toastHit = true
        }
        await wait(60)
    }
    r.check('rivals really leave the ground in the browser (real parabolas, not ground-bob)', sawAir)
    r.check('a rival wipes out in the tab (down state, crash counted)', sawDown, downName || 'no rival went down')
    r.check('the wiped-out rival remounts (down clears, crash remembered)', sawUp, `${downName || '?'} stayed down?`)
    r.check('the wreck is announced on screen ("<name> DOWN!")', toastHit)
}

// ---- CONTACT (#2391): the league is solid IN THE TAB ----
{
    // park a rider on the start-stride with IVAN downed 70px ahead (rig via
    // the DEV hook — the DOWN and the freeze are the sim's own). Real gas
    // toward the wreck must end in a wipeout with the tab shouting about it:
    // the ride-through is gone.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 600, v: 0, rivals: { IVAN: { d: 670, v: 0, down: 400 } } }))
    let wrecked = null, toastWreck = false
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 120 && !wrecked; i++) {
        const s = await probe()
        const w = (s.contact || []).find((e) => e.type === 'crash' && e.why === 'wreck')
        if (w) wrecked = { ...w, v: s.v }
        if (!toastWreck) {
            const txt = await page.evaluate(() => document.body.innerText)
            if (/WRECK!/.test(txt)) toastWreck = true
        }
        await wait(60)
    }
    await page.keyboard.up('ArrowUp')
    if (wrecked) {
        for (let i = 0; i < 25 && !toastWreck; i++) {
            const txt = await page.evaluate(() => document.body.innerText)
            if (/WRECK!/.test(txt)) toastWreck = true
            await wait(40)
        }
    }
    r.check('a downed rival BLOCKS the lane in the tab — charging it wipes you out (why:wreck)', !!wrecked, JSON.stringify(wrecked))
    r.check('the wreck wipeout is announced on screen ("WRECK!")', toastWreck)
    // same rig, hop it instead: real SPACE over the same frozen rider must
    // pay a flyby, not eat dirt. Rig on the flat straight (x430, IVAN at
    // 500): the press lands 2-6 ticks behind setup, every one of them a
    // ≥14px apex over the body — no crest-skim lottery.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 430, v: 6, crash: 0, rivals: { IVAN: { d: 500, v: 0, down: 400 } } }))
    // hold, not press: a press's down+up can land inside one rAF frame and
    // the fixed-timestep sim never sees it (the water-pump loop survives the
    // same race only by spamming).
    await page.keyboard.down('Space')
    let flew = null
    for (let i = 0; i < 80 && !flew; i++) {
        const s = await probe()
        flew = (s.contact || []).find((e) => e.type === 'flyby') || null
        if (!flew && (s.contact || []).some((e) => e.type === 'crash')) break
        if (!flew) await wait(40)
    }
    await page.keyboard.up('Space')
    r.check('hopping the wreck with a real SPACE keys a scored FLYBY instead', !!flew, flew ? `${flew.name}@t${flew.t}` : 'no flyby / crashed')
}

// ---- PACK (#2420): the league is solid to ITSELF in the tab ----
{
    // Park the player on the start straight and set up the same chain the
    // MOTOCROSS campaign produces: a frozen body 80px ahead, the tail rider
    // closing at pace. Real physics, no script — IVAN commits late and PILES
    // IN behind the wreck, staying behind it.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 100, v: 0, rivals: { GORDON: { d: 250, v: 0, down: 400 }, IVAN: { d: 170, v: 4.8 }, KATO: { d: 20, v: 0 } } }))
    let piled = null, toastPiled = false
    // #2498: the HUD div lags the sim a couple of frames (the toast text lands
    // via the step-boundary write), so exiting the moment `piled` seats read the
    // innerText one frame too early and the gate failed every run, deterministic.
    // Poll until BOTH the state chain and its on-screen announcement are seen.
    for (let i = 0; i < 70 && !(piled && toastPiled); i++) {
        const s = await probe()
        const iv = s.rivals.find((q) => q.name === 'IVAN')
        if (iv && iv.down > 0 && iv.crashes >= 1) piled = { d: iv.d, gd: s.rivals.find((q) => q.name === 'GORDON').d }
        if (!toastPiled) {
            const txt = await page.evaluate(() => document.body.innerText)
            if (/PILES IN!/.test(txt)) toastPiled = true
        }
        await wait(40)
    }
    r.check('a rival chains into a downed rival in the tab (tail rider wiped onto the body)', !!piled && piled.d <= piled.gd, JSON.stringify(piled))
    r.check('the chain is announced on screen ("<name> PILES IN!")', toastPiled)
    // the SAME rig, better rider: KATO reads the body earlier and flies it —
    // over the frozen rival with no wipeout, the pack's line-choice in the tab.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 100, v: 0, rivals: { GORDON: { d: 250, v: 0, down: 400 }, KATO: { d: 170, v: 5 }, IVAN: { d: 30, v: 0 } } }))
    let clean = null, sawAir = false
    for (let i = 0; i < 70 && !clean; i++) {
        const s = await probe()
        const ka = s.rivals.find((q) => q.name === 'KATO')
        if (ka) { if (ka.air) sawAir = true; if (ka.d > 262 && ka.crashes === 0 && ka.down === 0) clean = { d: ka.d } }
        await wait(40)
    }
    r.check('a front-office rival hazard-hops the SAME body clean (skill grades the line)', !!clean && sawAir, JSON.stringify(clean))
}

// ---- #2434: the toast is ONE line — a minor scuffle must not stomp a live headline ----
// The chain's "PILES IN!" is a headline (prio 2); a rival wheel-to-wheel is a
// minor (prio 1). While the headline is still on screen the minor must YIELD,
// so a dense pack reads as one dramatic beat, not a strobe of four messages.
{
    // Rig the chain: a frozen body, the tail rider committing late and PILING IN.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 100, v: 0, rivals: { GORDON: { d: 250, v: 0, down: 400 }, IVAN: { d: 248, v: 5 } } }))
    let headline = false
    for (let i = 0; i < 90 && !headline; i++) {
        const s = await probe()
        if (s.toast && s.toast.prio === 2 && /PILES IN!/.test(s.toast.msg)) headline = true
        await wait(30)
    }
    r.check('the chain headlines the toast ("<name> PILES IN!", prio 2)', headline)
    // Fresh race (the toast is renderer state, so the headline SURVIVES the reset):
    // MARIO closes on KATO inside contact range — a guaranteed minor rbump — while
    // the headline is still up. The toast must HOLD the headline, not flip to "bumps".
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 100, v: 0, rivals: { MARIO: { d: 80, v: 5.3 }, KATO: { d: 86, v: 4.7 } } }))
    let scuffle = 0, heldToast = ''
    for (let i = 0; i < 60; i++) {
        const s = await probe()
        scuffle = s.fxRBump || 0
        heldToast = s.toast ? s.toast.msg : ''
        if (scuffle >= 1) break
        await wait(30)
    }
    r.check('a minor scuffle fired while the headline was up (vacuity)', scuffle >= 1, JSON.stringify({ scuffle, heldToast }))
    r.check('the headline held through the scuffle (no minor "bumps" clobber)', /PILES IN!/.test(heldToast), JSON.stringify({ heldToast, scuffle }))
}

// ---- LANE (#2457): the axis is real IN THE TAB — steering, draft, rub ----
{
    // real ← moves the bike to the far line, and the paint climbs with it:
    // the same bike on the same flat ground sits HIGHER on the canvas when
    // it is on the far line (the NES depth trick, graded in pixels).
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 600, v: 0 }))
    await wait(250)
    const s0 = await probe()
    const p0 = await bikePx()
    await page.keyboard.down('ArrowLeft')
    let lane1 = 0
    for (let i = 0; i < 40; i++) { lane1 = (await probe()).lane; if (lane1 >= 0.4) break; await wait(30) }
    await page.keyboard.up('ArrowLeft')
    const s1 = await probe()
    const p1 = await bikePx()
    r.check('ArrowLeft is STEERING — the lateral line moves on real keys', lane1 >= 0.4, `lane ${s0.lane} -> ${lane1}`)
    r.check('the far line is PAINTED higher (depth on screen, not just state)',
        p1.n > 20 && p0.n > 20 && (p0.y0 + p0.y1) / 2 - (p1.y0 + p1.y1) / 2 > 4,
        `red row ${((p0.y0 + p0.y1) / 2).toFixed(0)} -> ${((p1.y0 + p1.y1) / 2).toFixed(0)} at lane ${s1.lane}`)
    // cross-line DRAFT: the exact same downed-body rig that wipes you out on
    // line 0 (CONTACT block above) — crossed from the far line it is NOTHING.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 600, v: 0, lane: 0.5, rivals: { IVAN: { d: 670, v: 0, down: 400 }, MARIO: { d: -60, v: 0, down: 400 }, KATO: { d: -100, v: 0, down: 400 }, GORDON: { d: -140, v: 0, down: 400 }, SONJA: { d: -180, v: 0, down: 400 } } }))
    let crossed = false, ateDirt = false
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 140 && !crossed; i++) {
        const s = await probe()
        if ((s.contact || []).some((e) => e.type === 'crash')) { ateDirt = true; break }
        crossed = s.x > 690
        await wait(40)
    }
    await page.keyboard.up('ArrowUp')
    r.check('crossing a downed rival on the FAR line is clean — no wreck, no hold', crossed && !ateDirt, `x=${(await probe()).x.toFixed(0)} crash=${(await probe()).crash}`)
    // RUB: matched speed behind a riding back, same line — the old silent
    // ghost now bites: contact event + the toast telling you the fix.
    // (Wait for the previous section's prio-2 headline to clear first — the
    // one-line-toast law #2434 correctly refuses to stomp it, and a blocked
    // say is lost, so the rig must start with a clean toast.)
    await page.waitForFunction(() => window.__bikeTest.probe().toast.left === 0, null, { timeout: 10000 })
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 200, v: 5, rivals: { KATO: { d: 208, v: 5, down: 0 }, MARIO: { d: -60, v: 0, down: 400 }, GORDON: { d: -100, v: 0, down: 400 }, SONJA: { d: -140, v: 0, down: 400 }, IVAN: { d: -180, v: 0, down: 400 } } }))
    let rubbed = null, toastRub = false, seenToast = null
    for (let i = 0; i < 80 && !rubbed; i++) {
        const s = await probe()
        rubbed = (s.contact || []).find((e) => e.type === 'rub') || null
        if (!toastRub && s.toast && /RUB!/.test(s.toast.msg)) toastRub = true
        if (rubbed) seenToast = s.toast
        if (!rubbed) await wait(30)
    }
    r.check('matched speed in the SAME line is a RUB now — the ghost is closed', !!rubbed, JSON.stringify(rubbed))
    r.check('the rub tells you the fix ("RUB! TAKE THE LINE")', toastRub, JSON.stringify(seenToast))
}

// ---- the solid-wreck hazard cue is PAINTED (amber chevron over a downed rider) ----
{
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 1200, v: 0 }))
    let sawDownHere = false, chevron = 0
    for (let i = 0; i < 220 && !(sawDownHere && chevron > 0); i++) {
        const s = await probe()
        const d0 = (s.rivals || []).find((q) => q.down > 0)
        if (d0) {
            sawDownHere = true
            const sx = Math.round(((d0.d % 6400) + 6400) % 6400 - Math.max(0, s.x - 84))
            chevron = await page.evaluate((col) => {
                const g = document.querySelector('canvas[data-bike-stage]').getContext('2d')
                const d = g.getImageData(Math.max(0, col - 14), 0, 28, 240).data
                let n = 0
                for (let y = 0; y < 240; y++) for (let x = 0; x < 28; x++) {
                    const i = (y * 28 + x) * 4
                    if (d[i] >= 235 && d[i + 1] >= 155 && d[i + 1] <= 205 && d[i + 2] <= 95) n++
                }
                return n
            }, sx)
        }
        if (!sawDownHere || chevron === 0) await wait(60)
    }
    r.check('a downed rider flies an amber hazard chevron (the solidity cue is pixels, not theory)', chevron > 0, `${chevron} amber px`)
}

// ---- JUICE (#2387): the polish layer is live state in the tab, not wishful README ----
{
    // charge the same solid-wreck rig: the wipeout must leave a terrain scar.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 600, v: 0, crash: 0, rivals: { IVAN: { d: 670, v: 0, down: 400 } } }))
    await page.keyboard.down('ArrowUp')
    let scarred = 0
    for (let i = 0; i < 140 && !(scarred > 0); i++) {
        const s = await probe()
        scarred = (s.juice || {}).scars || 0
        await wait(50)
    }
    await page.keyboard.up('ArrowUp')
    r.check('charging a wreck leaves a dirt-mound scar on the ground (juice.scars > 0)', scarred > 0, `${scarred} scars`)
    // hop the frozen rider: the scored flyby must pop (+n pop states alive).
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 430, v: 6, crash: 0, rivals: { IVAN: { d: 500, v: 0, down: 400 } } }))
    await page.keyboard.down('Space')
    let popped = 0
    for (let i = 0; i < 80 && !(popped > 0); i++) {
        const s = await probe()
        if ((s.contact || []).some((e) => e.type === 'crash')) break
        popped = (s.juice || {}).pops || 0
        if (!popped) await wait(40)
    }
    await page.keyboard.up('Space')
    r.check('a scored flyby pops +150 over the rival (juice.pops > 0)', popped > 0, `${popped} pops`)
    // pre-tell: a rival closing on your back arms the warning BEFORE contact.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 1500, v: 5, crash: 0, rivals: { IVAN: { d: 1440, v: 6.4, down: 0 } } }))
    let told = false
    for (let i = 0; i < 40 && !told; i++) {
        const s = await probe()
        told = !!(s.juice || {}).preTell
        if (!told) await wait(40)
    }
    r.check('a rival closing from behind arms the jolt pre-tell before contact', told, told ? 'preTell up' : 'never armed')
}
{
    const WATER_END = 3580
    // drop a slow bike just inside the water band -> it must stall on real physics
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 3548, v: 1.2 }))
    let stalled = null
    for (let i = 0; i < 60 && !stalled; i++) { const s = await probe(); if (s.stall > 0) { stalled = s; break } await wait(60) }
    r.check('a slow bike entering the water STALLS in the browser (real physics, not rigged)', !!stalled, stalled ? `stall=${stalled.stall}` : 'never stalled')
    if (stalled) {
        // The honest, runner-independent claim: the throttle alone re-stalls
        // forever (water drag 0.034 > high-gear accel 0.026) — only a real
        // SPACE pump gives the kick that drives the bike past the far edge.
        // So grade the outcome the player cares about: does the bike ESCAPE?
        const x0 = (await probe()).x
        await page.keyboard.down('ArrowUp')                 // real throttle...
        let escaped = false, ticks = 0
        for (let i = 0; i < 900 && !escaped; i++) {
            await page.keyboard.press('Space'); ticks++     // ...and real pump
            const s = await probe(); if (s.x > WATER_END + 2) { escaped = true; break }
            await wait(15)
        }
        await page.keyboard.up('ArrowUp')
        const s = await probe()
        r.check('real throttle + SPACE pumps the stalled bike OUT of the water (pump is load-bearing)',
            escaped, `x ${x0.toFixed(0)} -> ${s.x.toFixed(0)} after ${ticks} pumps (far edge ${WATER_END})`)
    }
}

// ---- the engine boils off a held throttle ----
{
    // track 0 (the fast one; supercross is hillier and heats slower). Start
    // already fast and warm — the Throttle still does the crossing, we just do
    // not ask a browser to idle 20s. hot=true is the sim's own verdict.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 300, v: 6, heat: 72 }))
    for (let i = 0; i < 20; i++) { if ((await probe()).count > 0) await wait(40); else break }
    await page.keyboard.down('ArrowUp')
    let boiled = false, peak = 0
    for (let i = 0; i < 260 && !boiled; i++) { const s = await probe(); peak = Math.max(peak, s.heat); boiled = s.hot; if (!boiled) await wait(60) }
    await page.keyboard.up('ArrowUp')
    const after = await probe()
    r.check('holding the gas BOILS the engine (the throttle is a real risk)', boiled, `hot=${after.hot} heat peaked ${peak.toFixed(0)}/100`)
}

// ---- a drained clock ends the race, and a real key loops back through attract ----
{
    // clock counts DOWN once per real second (60 ticks); 2s is enough to watch
    // the sim decide 'time' on its own — we set the state, the rule is the sim's.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 400, v: 5, clock: 2 }))
    let over = null
    for (let i = 0; i < 200 && !over; i++) { over = (await probe()).screen === 'over'; if (!over) await wait(60) }
    r.check('a drained clock ends the race (over screen — the timeout is real)', !!over, `screen=${(await probe()).screen}`)
    await wait(1100)
    await page.keyboard.press('KeyZ')
    await wait(300)
    let mid = await probe()
    r.check('a real key returns to the attract screen', mid.screen === 'attract', `screen=${mid.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(250)
    mid = await probe()
    r.check('and the marquee opens the splash again (#2563)', mid.screen === 'tracks', `screen=${mid.screen}`)
    // ---- SPLASH driven with real keys only (#2563) ----
    // Keyboard first (fresh cursor, absolute assertions), then the phone story:
    // the pad hides on trusted keyboard and shows on touch (step-5 feel law),
    // so touch gets its own cleanly-opened splash.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    r.check('arrow-down walks the cursor (2 steps -> index 2)', (await probe()).sel === 2, `sel=${(await probe()).sel}`)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    r.check('arrow-up wraps backward past row 0 onto the EDIT row (#2576 grew the menu)', (await probe()).sel === 6, `sel=${(await probe()).sel}`)
    await page.keyboard.press('ArrowRight')
    r.check('arrow-forward wraps past the last row to row 0', (await probe()).sel === 0, `sel=${(await probe()).sel}`)
    await page.keyboard.press('Escape')
    r.check('Escape at the splash steps back to the marquee', (await probe()).screen === 'attract')
    await page.keyboard.press('KeyZ')
    await wait(200)
    // phone: touch wakes the pad; the stick STEERS the cursor, a tap outside
    // the pad seats the course the cursor picked.
    const wakePad = () => page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
    const barSel = '[data-vc="1"]' // the pad's button bar — one per mounted pad
    const padUp = async () => {
        await wakePad()
        for (let i = 0; i < 20 && (await page.locator(barSel).count()) === 0; i++) await wait(100)
        return page.locator(barSel).count()
    }
    r.check('the pad is up on the splash — a phone picks a course too', (await padUp()) === 1)
    {
        const st = await page.locator('[data-vc="stick"]').first().boundingBox()
        if (st) {
            await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2)
            await page.mouse.down()
            await page.mouse.move(st.x + 6, st.y + st.height / 2, { steps: 4 }) // push the stick LEFT
            await wait(150)
            r.check('the pad itself walks the splash cursor — left push wraps onto the EDIT row (#2576)', (await probe()).sel === 6, `sel=${(await probe()).sel}`)
            await page.mouse.up()
        } else {
            r.check('the pad itself walks the splash cursor — left push wraps onto the EDIT row (#2576)', false, 'no [data-vc="stick"] to push')
        }
    }
    await page.mouse.click(500, 120) // tap OUTSIDE the pad executes the row: the bay opens for a phone
    await wait(250)
    mid = await probe()
    r.check('a tap on the EDIT row opens the design bay on touch (#2576)', mid.screen === 'edit', `screen=${mid.screen}`)
    await page.keyboard.press('Escape')
    await wait(200)
    mid = await probe()
    r.check('Esc leaves the bay back on the last real course (K.O. CROSS)', mid.screen === 'tracks' && mid.sel === 5, `screen=${mid.screen} sel=${mid.sel}`)
    await page.mouse.click(500, 120) // and a tap now seats the course the cursor rests on
    await wait(250)
    mid = await probe()
    r.check('a tap outside the pad rides the course the cursor picked (K.O. CROSS)',
        mid.screen === 'play' && mid.track === 5 && mid.count > 0,
        `screen=${mid.screen} track=${mid.track} count=${mid.count}`)
    // fresh tab: digits fast-seat, the race rides on pixels, the one-pad law holds
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(900)
    await page.keyboard.press('KeyZ')
    await wait(200)
    await page.keyboard.press('KeyG')
    await page.keyboard.press('Digit5')
    await wait(250)
    mid = await probe()
    r.check('digit 5 fast-seats BIG AIR and the splash gear carries into the race',
        mid.screen === 'play' && mid.track === 4 && mid.gear === 'low' && mid.count > 0,
        `screen=${mid.screen} track=${mid.track} gear=${mid.gear} count=${mid.count}`)
    await wakePad(); await wait(150)
    r.check('exactly one pad on screen — the phone never gets a second one', (await page.locator(barSel).count()) === 1)
    await page.keyboard.press('KeyG')
    r.check('G in-race still shifts (low -> high)', (await probe()).gear === 'high')
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    await hold('ArrowUp', 3000)
    mid = await probe()
    const bigAirPx = await bikePx()
    r.check('BIG AIR races on real pixels (gas on, world scrolling, rider painted)',
        mid.x > 250 && bigAirPx.n > 12, `x=${mid.x.toFixed(0)} red px=${bigAirPx.n}`)
    await page.keyboard.press('Escape')
    r.check('Escape mid-race is not a secret exit (the race keeps running)', (await probe()).screen === 'play')
}

// ---- the pause door ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    r.check('a real ? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await page.keyboard.press('Shift+Slash')
    await wait(250)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

// ---- the attract demo replays its contact receipts byte-exact IN THE TAB ----
{
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    let fb = null
    for (let i = 0; i < 260 && !fb; i++) {
        const s = await probe()
        fb = (s.contact || []).find((e) => e.type === 'flyby' && e.name === 'SONJA' && e.t === 553) || null
        if (!fb) await wait(60)
    }
    r.check('attract replays the pinned contact receipt (SONJA flyby t553) tick-for-tick in the browser', !!fb, fb ? `t=${fb.t}` : 'not seen within 15s')
}

// ---- EDIT TRACK (#2576): design in real keys — stamp, refuse, save, seat, ride ----
{
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(700)
    await page.keyboard.press('KeyZ')
    await wait(200)
    r.check('the splash advertises the design bay (the NES second menu entry)', (await page.locator('text=DESIGN TRACK').count()) > 0, 'no DESIGN TRACK row in the DOM')
    await page.keyboard.press('Digit0')
    await wait(200)
    let e = (await probe()).edit
    r.check('digit 0 opens EDIT TRACK', (await probe()).screen === 'edit' && !!e && e.stamps.length === 0, `screen=${(await probe()).screen}`)

    // cursor law in the bay: 40px steps
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await wait(40) }
    e = (await probe()).edit
    r.check('the stamp cursor walks 40px per tap', e.cursor === 240, `cursor=${e && e.cursor}`)

    // stamp a RAMP
    await page.keyboard.press('Space')
    await wait(120)
    e = (await probe()).edit
    r.check('SPACE stamps the tool under the cursor', !!e && e.stamps.length === 1 && e.stamps[0][0] === 'RAMP' && e.stamps[0][1] === 240, JSON.stringify(e && e.stamps))

    // the live law: overlapping is refused before it can ever reach SAVE
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await wait(40) } // 240 -> 400, inside the RAMP footprint
    await page.keyboard.press('Space')
    await wait(120)
    e = (await probe()).edit
    r.check('an overlapping stamp is refused at the cursor (fits red, no stamp added)', !!e && e.stamps.length === 1 && e.msg.includes('NO'), `${JSON.stringify(e && { n: e.stamps.length, msg: e.msg })}`)

    // tool strip wraps; SAVE tool writes slot 1 (the tool under the cursor is law:
    // RAMP(0) --up--> EXIT(8) --up--> SAVE(7))
    await page.keyboard.press('ArrowUp'); await wait(40)
    await page.keyboard.press('ArrowUp'); await wait(40)
    e = (await probe()).edit
    r.check('the tool strip wraps backward onto SAVE', !!e && e.tool === 'SAVE', e && e.tool)
    await page.keyboard.press('Space')
    await wait(150)
    let p = await probe()
    r.check('SAVE batteries a legal draft into CUSTOM 1', p.customs === 1 && !!p.edit && p.edit.msg.includes('SAVED'), `customs=${p.customs} msg=${p.edit && p.edit.msg}`)

    // erase, then SAVE refuses the blank — the audit is the SAVE gate
    await page.keyboard.press('ArrowUp'); await wait(40) // SAVE -> ERASE
    await page.keyboard.press('Space'); await wait(120)   // cursor 400 sits inside the RAMP footprint
    p = await probe()
    r.check('ERASE lifts the stamp under the cursor', p.customs === 1 && p.edit.stamps.length === 0, JSON.stringify(p.edit && p.edit.stamps))
    await page.keyboard.press('ArrowDown'); await wait(40) // ERASE -> SAVE
    await page.keyboard.press('Space'); await wait(120)
    p = await probe()
    r.check('SAVE refuses an empty course (the audit refuses, so storage never sees it)', p.customs === 1 && p.edit.msg.includes('DRAW'), p.edit && p.edit.msg)

    // exit lands back on the splash with the roster grown
    await page.keyboard.press('ArrowDown'); await wait(40) // SAVE -> EXIT
    await page.keyboard.press('Space'); await wait(200)
    p = await probe()
    r.check('EXIT returns to the grown splash (cursor restored where it entered — TRACK 1)', p.screen === 'tracks' && p.customs === 1 && p.sel === 0, `screen=${p.screen} customs=${p.customs} sel=${p.sel}`)
    r.check('the splash row 7 presents the saved design', (await page.locator('text=CUSTOM 1').count()) > 0, 'no CUSTOM row')

    // the battery is real: reload the tab, the design survives hydration
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(700)
    p = await probe()
    r.check('a saved custom rides the roster after a fresh load (localStorage battery)', p.customs === 1 && p.rows === 8, `customs=${p.customs} rows=${p.rows}`)

    // and it RIDES: seat TRACK 7 with the cursor and drive it
    await page.keyboard.press('KeyZ')
    await wait(200)
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await wait(40) }
    p = await probe()
    r.check('the cursor seats TRACK 7 (the saved design)', p.sel === 6, `sel=${p.sel}`)
    await page.keyboard.press('Enter')
    await wait(250)
    p = await probe()
    r.check('CUSTOM 1 seats a real race (same engine, same rivals)', p.screen === 'play' && p.track === 6 && p.count > 0 && p.rivals.length === 5, `screen=${p.screen} track=${p.track} rivals=${p.rivals.length}`)
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    await hold('ArrowUp', 2600)
    p = await probe()
    const px = await bikePx()
    r.check('the custom course races on real pixels (gas on, world scrolling, rider painted)', p.x > 200 && px.n > 12, `x=${p.x.toFixed(0)} red px=${px.n}`)
}

// ---- TEST RIDE (#2587): seat the draft unsaved, Esc back to the bay ----
{
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(700)
    await page.keyboard.press('KeyZ'); await wait(200)
    await page.keyboard.press('Digit0'); await wait(200)
    let p = await probe()
    r.check('the bay opens clean (tool RAMP, cursor 120)', p.screen === 'edit' && !!p.edit && p.edit.tool === 'RAMP' && p.edit.cursor === 120, `screen=${p.screen} ${JSON.stringify(p.edit)}`)

    // draft: one RAMP at 240
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await wait(40) }
    await page.keyboard.press('Space'); await wait(120)
    p = await probe()
    r.check('draft drawn (one RAMP @240)', !!p.edit && p.edit.stamps.length === 1 && p.edit.stamps[0][0] === 'RAMP' && p.edit.stamps[0][1] === 240, JSON.stringify(p.edit && p.edit.stamps))

    // walk the strip down onto TEST (RAMP(0) --down x6--> TEST(6))
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await wait(40) }
    p = await probe()
    r.check('the tool strip offers TEST between BOOST and ERASE', !!p.edit && p.edit.tool === 'TEST', p.edit && p.edit.tool)

    // TEST seats a lap of the draft — one lap, the TRANSIENT seat, the gate up
    await page.keyboard.press('Space'); await wait(250)
    p = await probe()
    r.check('TEST seats the draft — one lap, TRANSIENT track, gate up', p.screen === 'play' && p.test === true && p.track === -1 && p.laps === 1 && p.count > 0, JSON.stringify(p && { s: p.screen, t: p.test, tk: p.track, l: p.laps, c: p.count }))

    // Esc walks straight back to the bay — the missing esc-to-the-bay
    await page.keyboard.press('Escape'); await wait(150)
    p = await probe()
    r.check('Esc returns to the bay with the draft intact', p.screen === 'edit' && p.test === false && !!p.edit && p.edit.stamps.length === 1 && p.edit.msg.includes('BACK TO THE BAY'), JSON.stringify(p && { s: p.screen, t: p.test, m: p.edit && p.edit.msg }))

    // ride it to the line: the lap itself ends the test — back to the bay,
    // never the over screen, never the leaderboard
    await page.keyboard.press('Space'); await wait(250)
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    await hold('ArrowUp', 500)
    await page.evaluate(() => window.__bikeTest.setup({ x: 6340 }))
    await hold('ArrowUp', 1200)
    p = await probe()
    r.check('finishing the test lap returns to the bay (no over screen)', p.screen === 'edit' && p.test === false && !!p.edit && p.edit.msg.includes('LAP DOWN') && p.edit.stamps.length === 1, JSON.stringify(p && { s: p.screen, t: p.test, m: p.edit && p.edit.msg }))
    r.check('a test seat never grows the roster (the phantom is nowhere)', p.customs === 1 && p.rows === 8, `customs=${p.customs} rows=${p.rows}`)

    // an illegal draft refuses TEST by name — the same law SAVE reads
    await page.keyboard.press('ArrowDown'); await wait(40) // TEST -> ERASE
    await page.keyboard.press('Space'); await wait(120)    // lift the RAMP under the cursor
    await page.keyboard.press('ArrowUp'); await wait(40)   // back onto TEST
    await page.keyboard.press('Space'); await wait(150)
    p = await probe()
    r.check('an empty draft refuses TEST by name (stays in the bay)', p.screen === 'edit' && p.test === false && !!p.edit && p.edit.msg.includes('DRAW'), JSON.stringify(p && { s: p.screen, m: p.edit && p.edit.msg }))
}

// ---- ABANDON (#2573): a phone leaves a test ride too — the third pad ----
// button carries the shipped Escape law. The C button lives or dies with the
// seat: bay and splash never grow it (EXIT stays in the tool strip there),
// and a league race never grows it either — races stay unescapable.
{
    const cSel = '[data-vc="c"]'
    const wakePad = () => page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
    await wakePad(); await wait(150)
    r.check('no ABANDON in the bay — EXIT lives in the tool strip', (await page.locator(cSel).count()) === 0)

    // re-open the bay clean, stamp one RAMP, seat the TEST lap
    await page.keyboard.press('Escape'); await wait(150) // bay -> splash
    await page.keyboard.press('Digit0'); await wait(200) // fresh bay
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await wait(40) }
    await page.keyboard.press('Space'); await wait(120)  // RAMP @240
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await wait(40) }
    await page.keyboard.press('Space'); await wait(250)   // TEST seats the lap
    let p = await probe()
    await wakePad(); await wait(150) // keyboard use hides the pad (Step 5 feel) — a thumb brings it back
    r.check('a seated test ride grows an ABANDON button on the pad', (await page.locator(cSel).count()) === 1 && p.screen === 'play' && p.test === true, `${JSON.stringify(p && { s: p.screen, t: p.test })} c=${await page.locator(cSel).count()}`)
    r.check('the button is labelled ABANDON and rides the Escape law', await page.locator(cSel).getAttribute('data-key') === 'Escape' && (await page.locator(cSel).innerText()).trim() === 'ABANDON')

    // a thumb press walks back to the bay — same law, same landing as Esc
    const cb = await page.locator(cSel).boundingBox()
    if (cb) {
        await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
        await page.mouse.down(); await wait(60); await page.mouse.up()
        await wait(200)
        p = await probe()
        r.check('tapping ABANDON returns to the bay with the draft intact', p.screen === 'edit' && p.test === false && !!p.edit && p.edit.stamps.length === 1 && p.edit.msg.includes('BACK TO THE BAY'), JSON.stringify(p && { s: p.screen, t: p.test, m: p.edit && p.edit.msg }))
    } else {
        r.check('tapping ABANDON returns to the bay with the draft intact', false, 'no [data-vc="c"] to tap')
    }
    r.check('ABANDON leaves the pad when the seat does', (await page.locator(cSel).count()) === 0)

    // the league stays unescapable: no ABANDON grows for a real race
    await page.keyboard.press('Escape'); await wait(150)
    await page.keyboard.press('Digit1'); await wait(400)
    await wakePad(); await wait(150) // wake the pad so this measures the law, not the keyboard-hide
    p = await probe()
    r.check('a league race grows no ABANDON (races are not a draft)', p.screen === 'play' && p.test === false && (await page.locator(cSel).count()) === 0, JSON.stringify(p && { s: p.screen, t: p.test }))
}

// ---- OWN EXIT (#2603): your track gives you back — pad EXIT + Esc reloads the bay ----
{
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(700)
    const board = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('excitebike.board') || '[]').length } catch { return -1 } })
    const exitBtn = () => page.locator('[data-vc="c"]')

    // the league keeps its commitment: no EXIT button, no own flag, Escape is
    // still not a door — the pad face on tracks 1-6 is byte-shape unchanged.
    await page.keyboard.press('KeyZ'); await wait(200)
    await page.keyboard.press('Enter'); await wait(250)
    let p = await probe()
    r.check('league seat: track 1 is not own terrain', p.screen === 'play' && p.track === 0 && p.own === false, JSON.stringify(p && { s: p.screen, tk: p.track, own: p.own }))
    await page.keyboard.press('Escape')
    r.check('league race keeps running through Escape (the full-race promise stands)', (await probe()).screen === 'play')

    // seat the saved CUSTOM 1: the pad grows EXIT and the toast teaches it
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(700)
    await page.keyboard.press('KeyZ'); await wait(200)
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await wait(40) }
    await page.keyboard.press('Enter'); await wait(250)
    p = await probe()
    r.check('a splash-seated custom is own terrain (the save-and-race gate is off)', p.screen === 'play' && p.track === 6 && p.own === true, JSON.stringify(p && { s: p.screen, tk: p.track, own: p.own }))
    r.check('the seat toast teaches the exit on your own design', p.toast.msg.includes('YOUR DESIGN'), p.toast && p.toast.msg)
    const board0 = await board()

    // ride a while, then walk out with the PAD button (the phone's door).
    // NB the pad hides under trusted keyboard (step-5 feel law) — wake it AFTER
    // the gas hold, immediately before asserting and clicking, exactly as a
    // phone thumb would find it.
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    const x0 = (await probe()).x
    await hold('ArrowUp', 1600)
    p = await probe()
    r.check('the custom ride actually moved before the exit (x advanced)', p.x > x0 + 80, `x ${x0.toFixed(0)} -> ${p.x.toFixed(0)}`)
    await page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
    await wait(250)
    const eb = exitBtn()
    r.check('the pad grows EXIT beside the action zone on own rides', await eb.count() === 1 && await eb.getAttribute('data-key') === 'Escape' && (await eb.innerText()).includes('EXIT'), `count=${await eb.count()} key=${await eb.getAttribute('data-key')}`)
    await eb.click(); await wait(200)
    p = await probe()
    r.check('pad EXIT walks a custom race back into the bay, design loaded', p.screen === 'edit' && p.own === false && !!p.edit && p.edit.stamps.length === 1 && p.edit.stamps[0][0] === 'RAMP' && p.edit.stamps[0][1] === 240 && p.edit.msg.includes('DESIGN LOADED'), JSON.stringify(p && { s: p.screen, own: p.own, st: p.edit && p.edit.stamps, m: p.edit && p.edit.msg }))
    r.check('EXIT detaches when the ride ends (the bay pad is plain again)', (await exitBtn().count()) === 0)

    // Esc chain: bay -> splash lands on the custom row; Enter re-seats; a real
    // keyboard Escape mid-custom opens the same door (same bytes loaded).
    await page.keyboard.press('Escape'); await wait(200)
    p = await probe()
    r.check('Esc out of the bay lands on the custom row (the loop closes)', p.screen === 'tracks' && p.sel === 6, `screen=${p.screen} sel=${p.sel}`)
    await page.keyboard.press('Enter'); await wait(250)
    p = await probe()
    r.check('re-seating the custom owns the ride again (exit is law, not one-shot)', p.screen === 'play' && p.track === 6 && p.own === true, JSON.stringify(p && { s: p.screen, tk: p.track, own: p.own }))
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    await page.keyboard.press('Escape'); await wait(200)
    p = await probe()
    r.check('keyboard Esc mid-custom reloads the same design (entry stamps, byte-honest)', p.screen === 'edit' && !!p.edit && JSON.stringify(p.edit.stamps) === JSON.stringify([['RAMP', 240]]), JSON.stringify(p && { s: p.screen, st: p.edit && p.edit.stamps }))

    // abandoning submits nothing: the leaderboard saw neither walk-out
    const board1 = await board()
    r.check('two abandonments, zero leaderboard entries (abandon submits nothing)', board0 === board1, `board ${board0} -> ${board1}`)
    r.check('the roster stands as density says (no phantom from the exits)', p.customs === 1 && p.rows === 8, `customs=${p.customs} rows=${p.rows}`)
}

// ---- #2573 SPLASH FEEL — wordmark clearance, bike-sprite cursor, gear-bound rev ----
{
    // The chrome law: the EXCITEBIKE wordmark keeps ≥4px from every on-screen
    // button (the app's fixed ARCADE/PAUSE/speaker chrome). Phone viewport first
    // — that is where the crowding was reported.
    const clearance = () => page.evaluate(() => {
        const wm = document.querySelector('[data-wordmark]')
        if (!wm) return { ok: false, why: 'no [data-wordmark]' }
        const rg = document.createRange(); rg.selectNodeContents(wm) // the WORD's box, not the full-width line
        const a = rg.getBoundingClientRect()
        for (const b of document.querySelectorAll('button')) {
            const q = b.getBoundingClientRect()
            const cs = getComputedStyle(b)
            if (!q.width || !q.height || cs.visibility === 'hidden' || cs.opacity === '0') continue
            const dx = Math.max(0, Math.max(a.left - q.right, q.left - a.right))
            const dy = Math.max(0, Math.max(a.top - q.bottom, q.top - a.bottom))
            if (dx < 4 && dy < 4) return { ok: false, button: (b.getAttribute('aria-label') || b.textContent.trim() || 'button').slice(0, 14), dx: +dx.toFixed(1), dy: +dy.toFixed(1), wm: [Math.round(a.left), Math.round(a.top), Math.round(a.width)] }
        }
        return { ok: true, top: Math.round(a.top), w: Math.round(a.width) }
    })
    await page.setViewportSize({ width: 375, height: 380 })
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(400)
    const cA = await clearance()
    r.check('attract wordmark clears the app chrome at phone width (#2573)', cA.ok, JSON.stringify(cA))
    await page.keyboard.press('Enter'); await wait(300)
    let p = await probe()
    const cS = await clearance()
    r.check('splash wordmark clears the app chrome at phone width (#2573)', cS.ok && p.screen === 'tracks', JSON.stringify({ cS, s: p.screen }))
    // bike-sprite cursor: one bike, and it walks with the cursor law
    const curs = () => page.evaluate(() => [...document.querySelectorAll('svg[data-bikecursor]')].map((s) => s.dataset.on))
    const c0 = await curs()
    r.check('splash rows carry bike sprites, not text glyphs (one lit)', c0.length === p.rows && c0.filter((v) => v === '1').length === 1 && c0[0] === '1', JSON.stringify(c0))
    await page.keyboard.press('ArrowDown'); await wait(140)
    p = await probe()
    const c1 = await curs()
    r.check('the bike walks with the cursor (row 2)', p.sel === 1 && c1[1] === '1' && c1[0] === '0', `sel=${p.sel} ${JSON.stringify(c1)}`)
    for (let i = 0; i < p.rows - 2; i++) { await page.keyboard.press('ArrowDown'); await wait(70) }
    p = await probe()
    const c2 = await curs()
    r.check('the bike reaches the EDIT row last', p.sel === p.rows - 1 && c2[c2.length - 1] === '1', `sel=${p.sel} ${JSON.stringify(c2)}`)
    await page.keyboard.press('ArrowDown'); await wait(90)
    p = await probe()
    const c3 = await curs()
    r.check('the bike wraps the grown roster exactly with the cursor', p.sel === 0 && c3[0] === '1' && c3.filter((v) => v === '1').length === 1, `sel=${p.sel} ${JSON.stringify(c3)}`)
    // gear-bound seat rev — HIGH seat first (fresh load defaults HIGH)
    p = await probe()
    r.check('the rev log is fresh at the splash (no phantom seat)', p.rev.length === 0, JSON.stringify(p.rev))
    await page.keyboard.press('Enter'); await wait(160)
    p = await probe()
    r.check('seating HIGH revs the engine before the countdown ends (#2573)', p.screen === 'play' && p.count > 0 && p.rev.length === 1 && p.rev[0][0] === 220 && p.rev[0][1] === 760 && p.rev[0][2] === 'high', JSON.stringify({ s: p.screen, c: p.count, rev: p.rev }))
    await page.waitForFunction(() => window.__bikeTest.probe().count === 0, null, { timeout: 8000 }).catch(() => {})
    await page.evaluate(() => window.__bikeTest.setup({ x: 6340 }))
    await page.waitForFunction(() => !!window.__bikeTest.probe().end, null, { timeout: 20000 }).catch(() => {})
    // LOW leg on a FRESH mount — the over→attract→splash walk is a timing minefield
    // (attract auto-WATCHes after a dwell and steals the keys mid-chain); reload
    // lands splash-side fast and also resets revLog, so the LOW seat is rev[0].
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
    await wait(300)
    await page.keyboard.press('Enter'); await wait(250)
    await page.keyboard.press('KeyG'); await wait(140) // gear LOW on the splash
    await page.keyboard.press('Enter'); await wait(160)
    p = await probe()
    r.check('LOW seats a LOWER rev — the sweep is keyed to the gear (#2573)', p.screen === 'play' && p.count > 0 && p.gear === 'low' && p.rev.length === 1 && p.rev[0][0] === 160 && p.rev[0][1] === 480 && p.rev[0][2] === 'low', JSON.stringify({ s: p.screen, g: p.gear, c: p.count, rev: p.rev }))
    await page.setViewportSize({ width: 620, height: 680 })
}

r.check('zero page errors across the whole ride', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
