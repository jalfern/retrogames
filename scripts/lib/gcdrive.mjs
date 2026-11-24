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

    ok('boots clean', errors.length === 0, errors.join(';'))
    const attract = await page.evaluate(() => window.__game.state())
    await new Promise(r => setTimeout(r, 1200))
    const attract2 = await page.evaluate(() => window.__game.state())
    ok('attract skates on its own', attract2.tick > attract.tick + 30 && attract.phase === 'play' && attract.attract === true, `${attract.tick}→${attract2.tick} phase=${attract.phase} speed=${attract.speed}`)
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

    console.log(out.join('\n'))
    console.log(out.every(l => l.startsWith('PASS')) ? 'DRIVE GREEN' : 'DRIVE RED')
    process.exitCode = out.every(l => l.startsWith('PASS')) ? 0 : 1
} finally {
    await browser.close()
}
