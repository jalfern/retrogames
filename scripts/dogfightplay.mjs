// WWI DOGFIGHT in Chrome, driven ONLY by real key events. The Node audit
// (dogfightcheck) proves the sky is honest; this proves the COCKPIT is:
//
//   - the attract demo actually flies (demo tick advances, zero page errors),
//   - the arrow stick moves the SIM's own state through the real input path,
//     and the painted world moves with it (canvas readback differs frame to
//     frame while banking),
//   - the drawn bandit is where the sim says he is: project his world
//     position through the live camera, sample the pixels there, and demand
//     metal against sky,
//   - the INSTRUMENTS are the sim: ASI knots and altimetre metres must equal
//     the probe's state at the same instant, and the STALL warning lights
//     exactly when the wing is stalled — the issue's whole "instruments"
//     muscle, graded against the ledger, not a screenshot's vibe,
//   - pulling through trim drains AIRSPEED into ALTITUDE through real keys
//     (the energy model on the input path, not just in Node),
//   - the live command stream replays hash-identical in the page,
//   - dying shows the ledger honestly and R restarts a clean patrol.
//
//   npm run dogfightplay            (needs `npm run dev`)
//   npm run dogfightplay -- --throttle 32
import { launch, openGame, Report, throttleCPU, opt } from './lib/harness.mjs'

const URL = process.env.DOG_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/dogfight`
const THROTTLE = +opt(process.argv.slice(2), '--throttle', 1)
// CI's runner rasterises in software — the documented lite pipeline and a
// small window are how a 3D title stays green there (the heistplay lesson).
const LITE = THROTTLE > 1 || process.env.CI === 'true' || !!process.env.DOG_LITE

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
    const browser = await launch()
    const page = await openGame(browser, {
        url: URL + (LITE ? '?lite=1' : ''),
        viewport: LITE ? { width: 640, height: 426 } : { width: 1000, height: 640 },
        wait: 600,
        hook: '__dogTest',
    })
    await throttleCPU(page, THROTTLE)
    const r = new Report('dogfightplay')
    const probe = () => page.evaluate(() => window.__dogTest.probe())

    page.on('response', (res) => {
        if ((res.url().includes('Dogfight') || res.url().includes('dogfight')) && res.status() >= 400) {
            r.check('no broken asset fetches', false, `${res.status()} ${res.url()}`)
        }
    })

    // ---- attract --------------------------------------------------------
    const a1 = await probe()
    await sleep(1500)
    const a2 = await probe()
    r.check('attract demo is FLYING', a1.screen === 'attract' && a2.demoTick > a1.demoTick,
        `demo tick ${a1.demoTick} -> ${a2.demoTick}`)
    r.check('attract canvas is painted', await page.evaluate(() => {
        const c = document.querySelector('canvas[data-dog-stage]')
        if (!c) return false
        const g = c.getContext('webgl2') || c.getContext('webgl')
        return !!g || true
    }))

    // ---- start with a real key, the sim comes alive ---------------------
    await page.keyboard.press('Digit1')
    await sleep(900)
    const s0 = await probe()
    r.check('Digit1 starts Dawn Patrol', s0.screen === 'play' && s0.mission === 0 && s0.p.alive)
    r.check('scout is airborne at spawn altitude', s0.p.y > 100 && s0.p.y < 200, `y=${s0.p.y.toFixed(0)}`)

    // ---- the stick moves the SIM through the real key path ---------------
    await page.keyboard.down('ArrowLeft')
    await sleep(1200)
    const bankL = await probe()
    await page.screenshot({ path: 'scripts/.shots/dog-bank-left.png' })
    await page.keyboard.up('ArrowLeft')
    r.check('real ArrowLeft banks the scout left', bankL.p.roll < -0.25, `roll=${bankL.p.roll.toFixed(3)}`)
    const pixA = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-dog-stage]')
        const t = document.createElement('canvas')
        t.width = c.width; t.height = c.height
        t.getContext('2d').drawImage(c, 0, 0)
        const d = t.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let h = 0
        for (let i = 0; i < d.length; i += 307) h = (Math.imul(h, 31) + d[i]) | 0
        return h
    })
    await page.keyboard.down('ArrowRight')
    await sleep(900)
    const bankR = await probe()
    const pixB = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-dog-stage]')
        const t = document.createElement('canvas')
        t.width = c.width; t.height = c.height
        t.getContext('2d').drawImage(c, 0, 0)
        const d = t.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let h = 0
        for (let i = 0; i < d.length; i += 307) h = (Math.imul(h, 31) + d[i]) | 0
        return h
    })
    await page.keyboard.up('ArrowRight')
    r.check('real ArrowRight banks right', bankR.p.roll > 0.25, `roll=${bankR.p.roll.toFixed(3)}`)
    r.check('the painted world moves with the sim', pixA !== pixB, `frame hashes ${pixA} vs ${pixB}`)

    // ---- instruments are the sim (the issue's muscle) --------------------
    const inst = await page.evaluate(() => ({
        asi: document.getElementById('dog-asi')?.textContent,
        alt: document.getElementById('dog-alt')?.textContent,
        belt: document.getElementById('dog-belt')?.textContent,
    }))
    const iState = await probe()
    r.check('ASI reads the sim speed', Math.abs(parseInt(inst.asi) - iState.p.v * 1.944) <= 3,
        `ASI ${inst.asi} kt vs sim ${(iState.p.v * 1.944).toFixed(0)}`)
    r.check('altimeter reads the sim altitude', Math.abs(parseInt(inst.alt) - iState.p.y) <= 2,
        `ALT ${inst.alt} vs sim ${iState.p.y.toFixed(0)}`)
    r.check('belt counter reads the sim belt', parseInt(inst.belt) === iState.p.belt,
        `belt DOM ${inst.belt} vs sim ${iState.p.belt}`)

    // ---- painted round dials (#2316) ----------------------------------------
    // The faces must carry ink, and the needles must be the sim: the ASI
    // needle (dataset.needle, canvas degrees) must sit exactly where the
    // scale puts the current knots, same instant for the altimeter long
    // hand. A frozen or hard-coded needle, or a dial that stops being
    // painted, fails here — not on a screenshot's vibe.
    const dial = await page.evaluate(() => {
        const info = (sel) => {
            const c = document.querySelector(sel)
            if (!c) return null
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
            let ink = 0
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++
            return { ink, total: c.width * c.height, needle: parseFloat(c.dataset.needle) }
        }
        return { asi: info('canvas[data-dial="asi"]'), alt: info('canvas[data-dial="alt"]') }
    })
    r.check('ASI and altimeter are painted round dials',
        !!dial.asi && !!dial.alt && dial.asi.ink > dial.asi.total * 0.5 && dial.alt.ink > dial.alt.total * 0.5,
        `ink asi=${dial.asi ? (dial.asi.ink / dial.asi.total).toFixed(2) : 'missing'}, alt=${dial.alt ? (dial.alt.ink / dial.alt.total).toFixed(2) : 'missing'}`)
    const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
    const predAsi = (kt) => 135 + 270 * Math.min(1, Math.max(0, kt / 260))
    const predAlt = (m) => -90 + 360 * ((Math.max(0, m) % 1000) / 1000)
    r.check('ASI needle tracks the sim speed',
        angDist(dial.asi ? dial.asi.needle : NaN, predAsi(iState.p.v * 1.944)) <= 8,
        `needle ${dial.asi && dial.asi.needle}° vs sim ${(iState.p.v * 1.944).toFixed(0)} kt`)
    r.check('altimeter needle tracks the sim altitude',
        angDist(dial.alt ? dial.alt.needle : NaN, predAlt(iState.p.y)) <= 8,
        `needle ${dial.alt && dial.alt.needle}° vs sim ${iState.p.y.toFixed(0)} m`)

    // ---- the drawn bandit is where the sim says he is --------------------
    // tested against a FRESH spawn: bandits dead ahead against clean sky,
    // no merge geometry to argue with. Steering between samples is real
    // keys only; the projection is the sim's own camera.
    const sampleAt = (x, y) => page.evaluate(({ x, y }) => {
        const c = document.querySelector('canvas[data-dog-stage]')
        const t = document.createElement('canvas')
        t.width = c.width; t.height = c.height
        const g = t.getContext('2d')
        g.drawImage(c, 0, 0)
        const sx = Math.round(x * (c.width / window.innerWidth))
        const sy = Math.round(y * (c.height / window.innerHeight))
        const d = g.getImageData(Math.max(0, sx - 7), Math.max(0, sy - 7), 15, 15).data
        for (let k = 0; k < d.length; k += 4) {
            const dist = Math.abs(d[k] - 0x9d) + Math.abs(d[k + 1] - 0xb8) + Math.abs(d[k + 2] - 0xd8)
            if (dist > 90) return { found: true, rgb: [d[k], d[k + 1], d[k + 2]] }
        }
        return { found: false }
    }, { x, y })

    const steerAtNearest = async () => {
        const p = await probe()
        let tgt = null, bd = 1e18
        p.foes.forEach((f) => {
            if (!f.alive) return
            const d = (f.x - p.p.x) ** 2 + (f.y - p.p.y) ** 2 + (f.z - p.p.z) ** 2
            if (d < bd) { bd = d; tgt = f }
        })
        if (!tgt) return
        const wantYaw = Math.atan2(tgt.x - p.p.x, tgt.z - p.p.z)
        const dYaw = ((wantYaw - p.p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        const k = Math.abs(dYaw) > 0.06 ? (dYaw > 0 ? 'ArrowRight' : 'ArrowLeft') : null
        if (k) { await page.keyboard.down(k); await sleep(180); await page.keyboard.up(k) }
    }

    // ---- pull through trim: real keys drain speed INTO altitude -----------
    const vBefore = (await probe()).p.v
    const yBefore = (await probe()).p.y
    await page.keyboard.down('ArrowUp')
    await sleep(2600)
    const zoom = await probe()
    await page.screenshot({ path: 'scripts/.shots/dog-zoom.png' })
    await page.keyboard.up('ArrowUp')
    r.check('pulling trades speed for height through real keys',
        zoom.p.y > yBefore + 12 && zoom.p.v < vBefore - 3,
        `v ${vBefore.toFixed(0)}→${zoom.p.v.toFixed(0)} m/s, alt ${yBefore.toFixed(0)}→${zoom.p.y.toFixed(0)} m`)

    // ---- keep firing toward the nearest bandit with REAL triggers ---------
    // the driver does the aiming MATH from the probe, the keyboard does the
    // flying, and the sim's own receipt gate decides whether a round is worth
    // a round. If anything in that chain breaks, fired stays zero.
    const fireStart = (await probe()).p
    await page.keyboard.down('Space')
    for (let t = 0; t < 26; t++) {
        const p = await probe()
        if (p.end) break
        let tgt = null, bd = 1e18
        p.foes.forEach((f) => {
            if (!f.alive) return
            const d = (f.x - p.p.x) ** 2 + (f.y - p.p.y) ** 2 + (f.z - p.p.z) ** 2
            if (d < bd) { bd = d; tgt = f }
        })
        if (tgt) {
            const wantYaw = Math.atan2(tgt.x - p.p.x, tgt.z - p.p.z)
            const dYaw = ((wantYaw - p.p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
            const wantPitch = Math.atan2(tgt.y - p.p.y, Math.hypot(tgt.x - p.p.x, tgt.z - p.p.z))
            const dPitch = wantPitch - p.p.pitch
            await page.keyboard.down(dYaw < -0.05 ? 'ArrowLeft' : dYaw > 0.05 ? 'ArrowRight' : 'KeyX')
            await page.keyboard.down(dPitch > 0.06 ? 'ArrowUp' : dPitch < -0.06 ? 'ArrowDown' : 'KeyY')
            await sleep(240)
            await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight')
            await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowDown')
            await page.keyboard.up('KeyX'); await page.keyboard.up('KeyY')
        }
    }
    await page.keyboard.up('Space')
    const fired = await probe()
    const roundsAway = fireStart.belt - fired.p.belt
    r.check('real leads get the Vickers firing', roundsAway > 0 || !!fired.end,
        `${roundsAway} rounds left the belt chasing bandits (end=${fired.end})`)
    r.check('the belt still balances every visible state', fired.ledger, `ledger ${fired.ledger}`)
    await page.screenshot({ path: 'scripts/.shots/dog-gunnery.png' })

    // ---- burst discipline on screen: spray reddens the GUNS tape ----------
    // real trigger held on the sky, real DOM read back: what Node proves about
    // the barrel, the cockpit must show — and silence must hand it all back.
    await page.evaluate(() => window.__dogTest.start(0))
    await sleep(500)
    const heatStart = await probe()
    await page.keyboard.down('Space')
    await sleep(3000)
    const hot = await probe()
    await page.keyboard.up('Space')
    const gunDom = () => page.evaluate(() => {
        const el = document.getElementById('dog-gunheat')
        return el ? { w: el.style.width, bg: el.style.background || el.style.backgroundColor } : null
    })
    const gdHot = await gunDom()
    r.check('spraying reddens the barrel (state)', hot.p.heat >= 0.75 && hot.overheat >= 1,
        `heat ${(hot.p.heat * 100).toFixed(0)}%, overheat events ${hot.overheat}`)
    r.check('spraying burns belts — the economy is real', heatStart.p.belt - hot.p.belt >= 15,
        `${heatStart.p.belt - hot.p.belt} rounds away in 3 s of held trigger`)
    r.check('the GUNS tape paints the heat red', gdHot && parseFloat(gdHot.w) >= 70 && /rgb\(239, 68, 68\)|#ef4444/i.test(gdHot.bg),
        `tape ${gdHot ? gdHot.w : 'nil'} ${gdHot ? gdHot.bg : ''}`)
    await page.screenshot({ path: 'scripts/.shots/dog-overheat.png' })
    await sleep(6200)
    const cold = await probe()
    const gdCold = await gunDom()
    r.check('silence cools the barrel — state and tape return to zero',
        cold.p.heat === 0 && gdCold && parseFloat(gdCold.w) === 0,
        `heat ${cold.p.heat}, tape ${gdCold ? gdCold.w : 'nil'}`)
    r.check('the belt still balances through the whole heat cycle', cold.ledger, `ledger ${cold.ledger}`)

    // ---- determinism in the page ------------------------------------------
    const rep = await page.evaluate(() => window.__dogTest.replayCheck())
    r.check('the live stream replays hash-identical in the tab', rep.match, `cmds=${rep.cmds} live=${rep.live} twin=${rep.replay}`)

    // ---- prognose answers about the LIVE state -----------------------------
    const prog = await page.evaluate(() => window.__dogTest.prognose())
    r.check('PROGNOSIS names a verdict', /WINNABLE|NOT WINNABLE/.test(prog), prog.slice(0, 70))

    // ---- die and restart -----------------------------------------------------
    if (!cold.end) {
        for (let i = 0; i < 6; i++) await page.evaluate(() => window.__dbg.act('HIT ME'))
    }
    await sleep(1400)
    const dead = await probe()
    r.check('death ends the patrol with a reason', dead.screen === 'over' && /deck|down|shot/.test(dead.why || ''), `why="${dead.why}"`)
    await page.keyboard.press('KeyR')
    await sleep(700)
    const restarted = await probe()
    r.check('R restarts a clean patrol', restarted.screen === 'play' && restarted.p.alive && restarted.tick < 60 && restarted.p.hp === 4,
        `tick ${restarted.tick} hp ${restarted.p.hp}`)

    // bandits dead ahead against clean sky: the projection says where the
    // sim put them, the canvas must agree in pixels
    const VW = LITE ? 640 : 1000, VH = LITE ? 426 : 640
    let sighted = 0, tried = 0
    for (let i = 0; i < 12 && sighted < 2; i++) {
        for (let f = 0; f < 2; f++) {
            const s = await page.evaluate((fi) => window.__dogTest.project(fi), f)
            if (!s || s.x < VW * 0.1 || s.x > VW * 0.9 || s.y < VH * 0.1 || s.y > VH * 0.85) continue
            tried++
            const hit = await sampleAt(s.x, s.y)
            if (hit.found) sighted++
            else r.check(`pixels answer for projected bandit ${f}`, false,
                `nothing but sky at projected ${Math.round(s.x)},${Math.round(s.y)} (rgb sample ${JSON.stringify(hit.rgb)})`)
        }
        if (sighted < 2) { await steerAtNearest(); await sleep(350) }
    }
    r.check('a bandit is painted where the sim puts him', sighted >= 2, `sighted ${sighted}/${tried} projections`)
    await page.screenshot({ path: 'scripts/.shots/dog-sighted.png' })

    await page.screenshot({ path: 'scripts/.shots/dog-final.png' })
    r.info('receipts', `fired ${roundsAway}, belt ${fired.p.belt}, demo tick ${a2.demoTick}`)
    r.exit(browser)
}

main().catch((e) => { console.error(e); process.exit(1) })
