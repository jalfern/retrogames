// smashplay — advisory browser driver (step 6: start, play, die and restart
// with real keys and zero page errors; the drawn frame tracks the sim).
// Needs `npm run dev` running (or SMASH_URL pointed at one).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.SMASH_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/smash-tv`
const r = new Report('smashplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__smashTest', start: false, viewport: { width: 820, height: 640 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__smashTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const h1 = await page.evaluate(() => window.__smashTest.hash())
await page.waitForTimeout(700)
const h2 = await page.evaluate(() => window.__smashTest.hash())
r.check('attract demo is alive', h1 !== h2)

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p0 = await probe()
r.check('press any key starts the show', p0.screen === 'play' && p0.room === 0, `${p0.screen} room ${p0.room}`)
r.check('spawn shield up', p0.player.invuln > 0)

// twin-stick: run right while firing left — drawn state must track
const before = await probe()
await page.keyboard.down('ArrowRight')
await page.keyboard.down('KeyJ')
await page.waitForTimeout(350)
await page.keyboard.up('ArrowRight')
await page.keyboard.up('KeyJ')
await page.waitForTimeout(150)
const after = await probe()
r.check('arrows move the contestant', Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 3,
    `${before.player.x.toFixed(0)},${before.player.y.toFixed(0)} -> ${after.player.x.toFixed(0)},${after.player.y.toFixed(0)}`)
r.check('firing stick aims independently', after.player.aim[0] === -1 || after.player.aim.join(',') === '-1,0', `aim ${after.player.aim}`)
let evs = await page.evaluate(() => window.__smashTest.events().map((e) => e.type))
r.check('the guns fired', evs.includes('shoot'), [...new Set(evs)].join(','))

// firebomb spends power
const e0 = await probe()
await page.evaluate(() => window.__smashTest.bomb())
await page.waitForTimeout(200)
const e1 = await probe()
r.check('firebomb costs POWER', e1.energy === e0.energy - 34, `${e0.energy} -> ${e1.energy}`)

// one honest death: drop a bullet on the player after the shield lapses
await page.evaluate(() => { const gs = window.__smashTest.state(); gs.player.invuln = 0; gs.ebullets.push({ id: 7001, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' }) })
await page.waitForTimeout(300)
let p = await probe()
r.check('one hit takes a life', p.lives < 3 || p.end === 'over', `lives ${p.lives}`)

// burn the rest of the lives
for (let i = 0; i < 12 && p.screen === 'play'; i++) {
    await page.evaluate(() => { const gs = window.__smashTest.state(); gs.player.invuln = 0; gs.ebullets.push({ id: 7100 + gs.tick, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' }) })
    await page.waitForTimeout(700)
    p = await probe()
}
r.check('all lives spent -> game over', p.screen === 'over' || p.end === 'over', `${p.screen} end=${p.end}`)

await page.waitForTimeout(1200)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p = await probe()
r.check('restart returns to the arena', p.screen === 'play' && p.room === 0 && p.lives === 3, p.screen)

// --------------------------------------------------------------- co-op #496 ----
// seat 2 opens and two seats share the arena. The autopilot partner moves on
// its own pads; then the contract drives seat 2 with an explicit pad so a
// harness / second gamepad is proven to reach the sim.
{
    await page.evaluate(() => window.__smashTest.start2P(0, 'cpu'))
    await page.waitForTimeout(200)
    let c = await probe()
    r.check('seat 2 opens a two-player show', c.players === 2 && c.screen === 'play', `players ${c.players} ${c.screen}`)
    r.check('both heroes spawn', !!c.player2 && Math.hypot(c.player.x - c.player2.x, c.player.y - c.player2.y) > 0)

    // the cpu partner travels under its own pads
    const q0 = await probe()
    await page.waitForTimeout(600)
    const q1 = await probe()
    const moved = Math.hypot(q1.player2.x - q0.player2.x, q1.player2.y - q0.player2.y)
    r.check('the CPU partner moves under its own steam', moved > 2, `partner moved ${moved.toFixed(1)}`)

    // drive BOTH seats through the one-pad contract, seat 2 by explicit pad
    const g = await page.evaluate(() => {
        const api = window.__game
        if (!api) return { err: 'no __game' }
        api.reset(0, 2)
        let before = api.state()
        // one tick, two pads: p1 runs right + fires right, p2 runs up + fires up
        const s = api.step([{ right: true, aimRight: true, a: true }, { up: true, aimUp: true, a: true }])
        return { players: s.players, before, after: s, hashShift: s.hash !== before.hash }
    })
    r.check('contract opens seat 2 from reset(seed, 2)', g.players === 2, `players ${g.players}`)
    r.check('step([p1, p2]) steps both seats one tick', g.after && g.hashShift && (g.after.x !== g.before.x) && (g.after.y2 < g.before.y2), JSON.stringify(g.before && g.after && { t0: g.before.tick, t1: g.after.tick, h0: g.before.hash, h1: g.after.hash, x0: g.before.x, x1: g.after.x, y0: g.before.y2, y1: g.after.y2 }))
    const twoPad = await page.evaluate(() => {
        const api = window.__game
        api.reset(0, 2)
        const b = api.state()
        // only seat 2 presses; seat 1 idles — seat 2 must still travel
        let s = b
        for (let i = 0; i < 10; i++) s = api.step([{ }, { left: true, a: true }])
        return { x1: s.x, x2: s.x2, bx1: b.x, bx2: b.x2 }
    })
    r.check('seat 2 drives independently of seat 1', twoPad.x2 < twoPad.bx2 - 2 && Math.abs(twoPad.x1 - twoPad.bx1) < 0.5,
        `p1 ${(twoPad.x1 - twoPad.bx1).toFixed(1)} p2 ${(twoPad.x2 - twoPad.bx2).toFixed(1)}`)
    await page.evaluate(() => window.__game && window.__game.release())
}

// the cabinet pose (#1945), proven in pixels: with the twin aimed up, barrel
// chrome crosses the head column; aimed down, the same column above the head
// stays clean (the carriage lives on the shoulders, not wherever it lands).
{
    const posePx = await page.evaluate(async () => {
        const raf = () => new Promise((res) => requestAnimationFrame(res))
        const api = window.__game
        api.reset(0, 1)
        for (let i = 0; i < 4; i++) api.step([{ }])
        const gs = window.__smashTest.state()
        gs.player.invuln = 0 // the spawn blink would blank the sprite on odd frames
        gs.enemies.length = 0 // camera-leg chrome is the same grey — the column
        gs.roomData.spawns.length = 0 // must hold only what the contestant carries
        const c = document.querySelector('canvas[data-smash-stage]')
        const g = c.getContext('2d')
        const chrome = (x0, y0, w, h) => {
            const d = g.getImageData(x0, y0, w, h).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) {
                const [r, gg, b] = [d[i], d[i + 1], d[i + 2]]
                if (Math.abs(r - 141) < 40 && Math.abs(gg - 153) < 40 && Math.abs(b - 181) < 40) n++
            }
            return n
        }
        const col = () => [Math.round(gs.player.x) - 4, Math.round(gs.player.y) - 12]
        gs.player.aim = [0, -1]
        await raf(); await raf()
        const above = chrome(col()[0], col()[1], 9, 5)
        gs.player.aim = [0, 1]
        await raf(); await raf()
        const below = chrome(col()[0], col()[1], 9, 5)
        return { above, below }
    })
    r.check('over-the-shoulder in pixels: twin chrome crosses the head column aimed up', posePx.above >= 4, `${posePx.above} chrome px`)
    r.check('aimed down leaves the column above the head clean (the guns ride the shoulders)', posePx.below === 0, `${posePx.below} chrome px`)
}

// pixel sanity: the arena is not blank while playing
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-smash-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(40, 60, 160, 140).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++
    return lit
})
r.check('the arena actually renders', px > 500, `${px} lit px`)

// the big room and its camera (#1973), proven in pixels: the ladder climbs to
// room 5, the hero walks the extra floor, and the pan reveals studio floor
// where the old screen-edge wall stood — with the far chrome border arriving
// at the right once the camera clamps.
{
    const cam = await page.evaluate(async () => {
        const raf = () => new Promise((res) => requestAnimationFrame(res))
        const T = window.__smashTest
        const gs = T.state()
        for (let target = 1; target <= 4; target++) {
            gs.enemies = []; gs.roomData.spawns = []; gs.spawnT = 0; gs.bonusT = 0
            T.stepWith({})
            gs.player.x = 8 * 16 + 8; gs.player.y = 24 + 8
            T.stepWith({})
        }
        const inBig = gs.room === 4 && gs.roomData.gw === 24
        gs.enemies = []; gs.roomData.spawns = []; gs.spawnT = 1e9; gs.player.invuln = 1e9
        for (let i = 0; i < 900; i++) T.stepWith({ mx: 1, my: 0 })
        await raf(); await raf()
        const c = document.querySelector('canvas[data-smash-stage]')
        const g = c.getContext('2d')
        const at = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return { r: d[0], gg: d[1], b: d[2] } }
        return { inBig, camX: T.probe().camX, px: Math.round(gs.player.x), left: at(2, 122), right: at(253, 100) }
    })
    r.check('room 5 boards wide and the camera pans with the hero', cam.inBig && cam.camX >= 100 && cam.px > 300, JSON.stringify({ camX: cam.camX, x: cam.px }))
    r.check('the pan shows studio floor where the old screen-edge wall was', cam.left.b < 60, JSON.stringify(cam.left))
    r.check('the far chrome border appears on the clamp', cam.right.b >= 60, JSON.stringify(cam.right))
}

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
