// GRAVEL PLAY — real-input drive of GRAVEL YARD (#1253, AGENTS.md step 6).
// Attract -> select -> play with real keystrokes/taps; the digger walks, digs
// and dumps with real keys only; drawn pixels must agree with the sim position
// (yellow machine where the digger stands, dirt where it left); pause/resume;
// game-over reached through the contract clock and restarted with a real key.
// Screenshots land in /tmp/forge. Zero page errors or it is red.

const URL = process.env.GY_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/gravel-yard`
const { chromium } = await import('playwright-core')
const fs = await import('node:fs')

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
try {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
    await page.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })

    const sim = () => page.evaluate(() => window.__gyTest.state())
    const screen = () => page.evaluate(() => window.__gyTest.screen())
    const sleep = (ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms)

    // walk seat 0 with a real held key until the sim reports the target cell
    const drive = async (key, axis, target) => {
        await page.keyboard.down(key)
        const t0 = Date.now()
        while (Date.now() - t0 < 4000) {
            const s = await sim()
            if (s.digger[axis] === target) { await page.keyboard.up(key); return true }
            await sleep(40)
        }
        await page.keyboard.up(key)
        return false
    }
    // read the centre pixel of a cell from the game canvas (native pixels)
    const pixelAt = (cx, cy) => page.evaluate(([x, y]) => {
        const cvs = document.querySelector('canvas')
        const g = cvs.getContext('2d')
        const d = g.getImageData(x, y, 1, 1).data
        return [d[0], d[1], d[2]]
    }, [cx, cy])
    const cellCenter = (x, y) => [x * 32 + 16, 44 + y * 32 + 16]
    const isYellow = ([r, g, b]) => r > 200 && g > 130 && b < 110
    const isDirtish = ([r, g, b]) => r < 200 // no machine yellow left behind

    console.log('— attract + start —')
    ok('attract first', (await screen()) === 'attract')
    fs.writeFileSync('/tmp/forge-gy-attract.png', await page.locator('canvas').screenshot())
    await page.keyboard.press('Space') // attract -> select
    ok('select screen after key', (await screen()) === 'select')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // pick 3 hands
    await page.keyboard.press('Space') // start
    ok('play after select', (await screen()) === 'play')
    const s0 = await sim()
    ok('fresh shift clocked', s0.tick >= 0 && !s0.done && s0.score === 0)

    console.log('— digger drives and digs with real keys —')
    ok('steer up to the pile face', await drive('ArrowUp', 'y', 3), JSON.stringify((await sim()).digger))
    const sA = await sim()
    ok('sim agrees: digger at (3,3)', sA.digger.x === 3 && sA.digger.y === 3, `${sA.digger.x},${sA.digger.y}`)
    let px = null
    for (const [ox, oy] of [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, 4]]) {
        px = await pixelAt(cellCenter(3, 3)[0] + ox, cellCenter(3, 3)[1] + oy)
        if (isYellow(px)) break
    }
    ok('drawn pixel is the digger at its cell', isYellow(px), `rgb(${px.join(',')})`)

    await page.keyboard.press('Space') // DIG
    for (let i = 0; i < 40 && (await sim()).digger.bucket === 0; i++) await sleep(50)
    ok('real SPACE cuts a unit', (await sim()).digger.bucket >= 1)

    console.log('— haul to the hopper and dump —')
    ok('steer right', await drive('ArrowRight', 'x', 7))
    ok('step down off the solid face', await drive('ArrowDown', 'y', 4))
    ok('steer onto the hopper pad', await drive('ArrowRight', 'x', 8))
    await page.keyboard.down('ArrowUp') // bump into the feed sets facing (held > 1 frame)
    await sleep(140)
    await page.keyboard.up('ArrowUp')
    await sleep(80)
    await page.keyboard.press('KeyB') // DUMP
    for (let i = 0; i < 40 && (await sim()).plant.hopper === 0; i++) await sleep(50)
    ok('real B dumps the bucket into the hopper', (await sim()).plant.hopper >= 1, JSON.stringify((await sim()).plant))
    const oldCell = await pixelAt(...cellCenter(3, 3))
    ok('the cell it left is bare again', isDirtish(oldCell), `rgb(${oldCell.join(',')})`)
    fs.writeFileSync('/tmp/forge-gy-play.png', await page.locator('canvas').screenshot())

    console.log('— pause —')
    await page.keyboard.press('Escape')
    ok('pause overlay mounts', !!(await page.evaluate(() => !!document.body.textContent.match(/CONTROLS|backspace|GRAVEL YARD/i))) && (await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).opacity) !== '0'))
    await sleep(300)
    const pausedTick = (await sim()).tick
    await sleep(400)
    ok('sim frozen while paused', (await sim()).tick === pausedTick)
    await page.keyboard.press('Escape')
    await sleep(200)
    ok('resume moves the clock', (await sim()).tick > pausedTick)

    console.log('— game over + restart with a real key —')
    await page.evaluate(async () => {
        await window.__game.reset(9, 1)
        for (let i = 0; i < 10820; i++) await window.__game.step({})
        window.__game.release()
    })
    for (let i = 0; i < 50 && (await screen()) !== 'over'; i++) await sleep(60)
    ok('shift end reaches the over screen', (await screen()) === 'over')
    fs.writeFileSync('/tmp/forge-gy-over.png', await page.locator('canvas').screenshot())
    await sleep(1000)
    await page.keyboard.press('Space')
    ok('SPACE restarts to select', (await screen()) === 'select')

    // tap-to-start on a phone: back to attract via reload, then a canvas tap
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })
    await page.locator('canvas').click({ position: { x: 40, y: 300 } })
    ok('tap on canvas leaves attract', (await screen()) === 'select')

    ok('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
    await browser.close()
}

console.log(`\ngravelplay: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
