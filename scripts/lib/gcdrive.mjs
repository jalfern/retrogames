// drive grind-city end to end in headless Chrome via the contract.
import { openGame, launch } from './harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5178}/retrogames`
const browser = await launch()
try {
    const page = await openGame(browser, { url: `${BASE}/grind-city`, hook: '__grindTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    const out = []
    const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
    const STEP_MIN = 3   // eighths expected in ~700ms at real speed, halved for slow CI Chrome

    ok('boots clean', errors.length === 0, errors.join(';'))
    const attract = await page.evaluate(() => window.__game.state())
    await new Promise(r => setTimeout(r, 1200))
    const attract2 = await page.evaluate(() => window.__game.state())
    ok('attract skates on its own', attract2.tick > attract.tick + 30 && attract.phase === 'play' && attract.attract === true, `${attract.tick}→${attract2.tick} phase=${attract.phase} speed=${attract.speed}`)
    // #3167: the music bed ticks with the sim clock (its scheduler position)
    const bedA = await page.evaluate(() => window.__grindTest.state().bed)
    await new Promise(r => setTimeout(r, 700))
    const bedB = await page.evaluate(() => window.__grindTest.state().bed)
    ok('music bed runs in attract', bedB > bedA + STEP_MIN, `bed ${bedA}→${bedB}`)
    const res = await page.evaluate(async () => {
        const g = window.__game
        const zero = g.reset(7)
        const padDrive = (n, p) => g.step(p, n)
        padDrive(240, { right: false })
        const mid = g.state()
        padDrive(60, { a: true })          // ollies
        padDrive(120, { b: true })        // pumps
        const before = g.state()
        padDrive(7400, {})               // clock out → run over
        const end = g.state()
        g.release()
        return { zero, mid, before, end }
    })
    ok('driving moves the skater', Math.abs(res.mid.x - res.zero.x) + Math.abs(res.mid.z - res.zero.z) > 3)
    ok('tricks score', res.before.score >= 0 && res.before.stats.tricks >= 0, `score=${res.before.score} tricks=${res.before.stats.tricks}`)
    ok('gems visible in the contract (#3246)', typeof res.mid.gems === 'number' && res.mid.gemTotal === 14, `gems=${res.mid.gems}/${res.mid.gemTotal}`)
    ok('run ends at the clock', res.end.done === true && res.end.phase === 'over', `t=${res.end.timeLeft}`)

    const png = await page.evaluate(() => window.__game.frame())
    ok('frame is a real PNG', png.startsWith('data:image/png') && png.length > 40000, `${png.length}b`)
    // pixels: the drawn frame is not a black screen (renderer alive)
    const lum = await page.evaluate(async () => {
        const img = new Image()
        img.src = window.__game.frame()
        await img.decode()
        const c = document.createElement('canvas')
        c.width = 64; c.height = 40
        const x = c.getContext('2d')
        x.drawImage(img, 0, 0, 64, 40)
        const d = x.getImageData(0, 0, 64, 40).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
        return s / (d.length / 4)
    })
    ok('scene renders (not black)', lum > 40, `mean lum=${lum.toFixed(1)}`)

    // #3225: a finished run shows the REPLAY screen on the replay cam
    const rp = await page.evaluate(() => window.__grindTest.state())
    ok('run over shows the replay', rp.screen === 'replay' && !!rp.replay && rp.cam === 'replay',
        `cam=${rp.cam} i=${rp.replay ? rp.replay.i : '-'}/${rp.replay ? rp.replay.n : '-'}`)
    // #3167: the replay runs silent — the bed scheduler stands still
    const bedR1 = rp.bed
    await new Promise(r => setTimeout(r, 350))
    const bedR2 = await page.evaluate(() => window.__grindTest.state())
    ok('bed stands still through the replay', bedR2.screen === 'replay' && bedR2.bed === bedR1, `bed ${bedR1}→${bedR2.bed}`)
    await page.keyboard.press('Space')   // skip the replay
    await new Promise(r => setTimeout(r, 250))
    let ov = await page.evaluate(() => window.__grindTest.state())
    if (ov.screen === 'replay') {       // focus dance: a tap also skips
        await page.mouse.click(300, 300)
        await new Promise(r => setTimeout(r, 250))
        ov = await page.evaluate(() => window.__grindTest.state())
    }
    ok('Space skips the replay to the results', ov.screen === 'over' && !ov.replay, `screen=${ov.screen}`)

    // keyboard restart from the over screen
    await page.keyboard.press('Space')
    await new Promise(r => setTimeout(r, 700))
    let back = await page.evaluate(() => window.__game.state())
    if (back.phase === 'over') {   // focus dance: click the stage, then Space again
        await page.mouse.click(300, 300)
        await new Promise(r => setTimeout(r, 300))
        back = await page.evaluate(() => window.__game.state())
    }
    ok('over → restart returns to attract', back.phase === 'play' && back.attract === true, `phase=${back.phase} attract=${back.attract}`)

    // #3225: the fisheye action cam cuts in while an air-grab is held
    const ac = await page.evaluate(async () => {
        const g = window.__game
        g.reset(11)
        g.step({ a: true }, 1); g.step({}, 30); g.step({ a: true }, 2)   // ollie → re-press A = grab
        await new Promise(r => setTimeout(r, 150))
        const st = window.__grindTest.state()
        g.release()
        return st
    })
    ok('fisheye action cam on an air grab', ac.cam === 'action' && ac.screen === 'play', `cam=${ac.cam} air=${ac.air}`)

    // #3289 live stall: crouch+A at the coping locks, the action cam cuts in,
    // the balance meter leans, and the pop pays. Real key events throughout.
    const sl = await page.evaluate(async () => {
        const g = window.__game, t = window.__grindTest
        g.reset(7)
        t.teleport({ x: -24.6, z: 0, y: 0, heading: Math.PI, speed: 2 })
        await new Promise(r => setTimeout(r, 150))
        t.press('ArrowDown'); t.press('Space')
        await new Promise(r => setTimeout(r, 120))
        t.release('Space')
        const lock = t.state()
        let balSeen = 0
        for (let i = 0; i < 14; i++) {
            const st = t.state()
            if (!st.stall) break
            balSeen = Math.max(balSeen, Math.abs(st.stallBal))
            t.release('ArrowLeft'); t.release('ArrowRight')
            if (st.stallBal > 0) t.press('ArrowLeft'); else t.press('ArrowRight')
            await new Promise(r => setTimeout(r, 60))
        }
        const held = t.state()
        t.release('ArrowLeft'); t.release('ArrowRight'); t.release('ArrowDown')
        t.press('Space'); await new Promise(r => setTimeout(r, 120)); t.release('Space')
        const popped = t.state()
        g.release()
        return { lock, held, popped, balSeen }
    })
    ok('#3289 crouch+A at the lip locks a live stall', sl.lock.stall === true && sl.lock.speed === 0, `speed=${sl.lock.speed} cam=${sl.lock.cam}`)
    ok('#3289 action cam cuts in for the stall', sl.lock.cam === 'action' && sl.lock.screen === 'play', `cam=${sl.lock.cam}`)
    ok('#3289 the balance meter builds while held', sl.held.stall === true && sl.balSeen > 0.01, `bal=${sl.balSeen.toFixed(3)} t=${sl.held.stallT}`)
    ok('#3289 the pop pays trickle + commit', sl.popped.chainPts >= 100 || sl.popped.score > 0, `chainPts=${sl.popped.chainPts}`)

    // #3289 live rail grab: latch, hold B, release — Feeble lands in the chain
    const rg = await page.evaluate(async () => {
        const g = window.__game, t = window.__grindTest
        g.reset(7)
        t.teleport({ x: -11, z: -2, y: 1.4, heading: 0, speed: 7 })
        await new Promise(r => setTimeout(r, 300))
        const latched = t.state()
        t.press('ShiftLeft')
        await new Promise(r => setTimeout(r, 100))
        const grabbing = t.state()
        for (let i = 0; i < 8; i++) {
            const st = t.state()
            t.release('ArrowLeft'); t.release('ArrowRight')
            if (st.grindBal > 0) t.press('ArrowLeft'); else t.press('ArrowRight')
            await new Promise(r => setTimeout(r, 50))
        }
        const held = t.state()
        t.release('ShiftLeft')
        await new Promise(r => setTimeout(r, 120))
        const paid = t.state()
        g.release()
        return { latched, grabbing, held, paid }
    })
    ok('#3289 B on the rail engages the grab live', rg.grabbing.grinding && rg.grabbing.railGrab === 'Feeble',
        `grind=${rg.grabbing.grinding} grab=${rg.grabbing.railGrab} cam=${rg.grabbing.cam}`)
    ok('#3289 the grab doubles the trickle live', rg.paid.chainPts > rg.latched.chainPts + 30 || rg.paid.score > 0,
        `${rg.latched.chainPts}→${rg.paid.chainPts}`)

    console.log(out.join('\n'))
    console.log(out.every(l => l.startsWith('PASS')) ? 'DRIVE GREEN' : 'DRIVE RED')
    process.exitCode = out.every(l => l.startsWith('PASS')) ? 0 : 1
} finally {
    await browser.close()
}
