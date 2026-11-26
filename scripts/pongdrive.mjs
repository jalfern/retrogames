// pongdrive — #3502 in real Chrome: the cabinet selector with REAL keys only.
// pongcheck owns the physics; this leg proves what a player feels:
//   - attract shows the pick and LEFT/RIGHT cycles it (without starting),
//   - any other key starts with the pick standing,
//   - ?diff=N pins the pick for QA,
//   - arrows drive the left paddle, hits accrue, pixels follow the logic,
//   - quit is honest; any key restarts at fresh scores,
//   - 2P (diff=4): W/S move ONLY the right paddle, arrows only the left,
//   - #3529: touch quit — a tap starts, the QUIT chip ends the match, a
//     tap restarts, and the chip exists only while a match is alive,
//   - zero page errors across the ride.
// `--mutant` re-plants broken chip wirings in index.jsx; each child MUST die.
import { spawnSync } from 'node:child_process'
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/pong`
await requireDevServer(BASE)
const browser = await launch()
const r = new Report('pongdrive')
const errors = []

const open = async (url) => {
    const p = await openGame(browser, { url, hook: '__pongTest', wait: 400 })
    p.on('pageerror', (e) => errors.push(String(e)))
    return p
}
const probe = (p) => p.evaluate(() => window.__pongTest.probe())
const until = async (p, fn, ms, label) => {
    const t0 = Date.now()
    for (;;) {
        const v = await fn()
        if (v) return v
        if (Date.now() - t0 > ms) throw new Error(`timeout waiting: ${label}`)
        await p.waitForTimeout(50)
    }
}

// ---- leg 1: attract carries the pick; LEFT/RIGHT cycles without starting ----
let p = await open(BASE)
try {
    r.check('attract defaults to NORMAL (shipped physics)', (await probe(p)).diff === 'NORMAL')
    await p.keyboard.press('ArrowRight')
    r.check('ArrowRight on attract cycles NORMAL → HARD', (await probe(p)).diff === 'HARD')
    const before = await probe(p)
    await p.keyboard.press('ArrowLeft')
    await p.keyboard.press('ArrowLeft')
    r.check('ArrowLeft cycles back past NORMAL to EASY', (await probe(p)).diff === 'EASY')
    await p.keyboard.press('ArrowLeft')
    r.check('the pick wraps: LEFT from EASY lands on 2P', (await probe(p)).diff === 'TWO')
    r.check('cycling never started the match (still attract)', (await probe(p)).score === 0 && (await probe(p)).opp === 0)

    // ---- leg 1b: a tap on the pick label rides the same dial (touch path) ----
    await p.click('.pong-pick-zone')
    r.check('a tap on the pick label cycles the pick (TWO → EASY, still attract)', (await probe(p)).diff === 'EASY' && (await probe(p)).score === 0)

    // ---- leg 2: any other key starts with the pick standing (EASY) ----
    await p.keyboard.press('Enter')
    const started = await until(p, async () => {
        const q = await probe(p)
        return q.diff === 'EASY' && q.tick > before.tick ? q : null
    }, 4000, 'match start on ENTER')
    r.check('ENTER starts with EASY standing', started.diff === 'EASY')

    // ---- leg 3: arrows drive the paddle; hits accrue; pixels follow ----
    const y0 = started.leftY
    await p.keyboard.down('ArrowUp')
    await until(p, async () => (await probe(p)).leftY < y0 - 40, 3000, 'left paddle up')
    await p.keyboard.up('ArrowUp')
    const moved = await probe(p)
    r.check('arrows drive the left paddle', moved.leftY < y0, `${y0} → ${moved.leftY}`)
    await until(p, async () => (await probe(p)).hits > 0, 15000, 'first paddle hit')
    r.check('the rally reaches real paddle hits', true)
    const px = await p.evaluate(() => {
        const cv = document.querySelector('canvas')
        const g = cv.getContext('2d')
        const dpr = window.devicePixelRatio || 1
        const img = g.getImageData(0, 0, cv.width, cv.height).data
        const col = Math.round(25 * dpr) // inside the left paddle column
        let bestTop = -1
        let bestLen = 0
        let runTop = -1
        for (let y = 0; y <= cv.height; y++) {
            const i = (y * cv.width + col) * 4
            const white = y < cv.height && img[i] > 200 && img[i + 1] > 200 && img[i + 2] > 200
            if (white) { if (runTop < 0) runTop = y }
            else if (runTop >= 0) {
                if (y - runTop > bestLen) { bestTop = runTop; bestLen = y - runTop }
                runTop = -1
            }
        }
        const q = window.__pongTest.probe()
        return { center: (bestTop + bestLen / 2) / dpr, len: bestLen / dpr, leftY: q.leftY }
    })
    r.check('drawn paddle (longest white run in the paddle column) tracks the logical leftY',
        px.len > 60 && Math.abs(px.center - (px.leftY + 40)) <= 8,
        `px ${px.center.toFixed(1)} len ${px.len.toFixed(0)} vs logic ${(px.leftY + 40).toFixed(1)}`)

    // ---- leg 4: quit is honest, any key restarts fresh ----
    await p.keyboard.press('KeyQ')
    const overQ = await until(p, async () => {
        const st = await p.evaluate(() => window.__game && window.__game.state && window.__game.state())
        return st && st.done ? st : null
    }, 3000, 'quit terminal')
    r.check('q ends the match honestly (done + seed in the report)', overQ.done === true && typeof overQ.seed === 'number', `seed ${overQ.seed}`)
    r.check('the report carries the pick', overQ.diff === 'EASY', overQ.diff)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(300)
    const fresh = await probe(p)
    r.check('any key after quit restarts at fresh scores', fresh.score === 0 && fresh.opp === 0, `${fresh.score}-${fresh.opp}`)
} catch (e) {
    r.check('leg 1 ride completed without timeout', false, String(e))
} finally {
    await p.close()
}

// ---- leg 5: ?diff=4 pins 2P; W/S drive ONLY the right paddle ----
try {
    p = await open(`${BASE}?diff=4&seed=4242`)
    r.check('?diff=4 pins TWO on attract', (await probe(p)).diff === 'TWO')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(300)
    const a = await probe(p)
    let drove = false
    try {
        await p.keyboard.down('KeyW')
        await until(p, async () => Math.abs((await probe(p)).rightY - a.rightY) > 40, 3000, 'W drives right')
        drove = true
    } catch { /* graded below */ } finally { await p.keyboard.up('KeyW') }
    const b = await probe(p)
    r.check('W/S drive the RIGHT paddle', drove && b.rightY < a.rightY, `${a.rightY} → ${b.rightY}`)
    r.check('2P: W leaves the left paddle alone', Math.abs(b.leftY - a.leftY) <= 8, `${a.leftY} → ${b.leftY}`)
    let ldrove = false
    try {
        await p.keyboard.down('ArrowDown')
        await until(p, async () => (await probe(p)).leftY > a.leftY + 20, 3000, 'arrows drive left')
        ldrove = true
    } catch { /* graded below */ } finally { await p.keyboard.up('ArrowDown') }
    const c = await probe(p)
    r.check('arrows still drive the LEFT paddle in 2P', ldrove && c.leftY > a.leftY, `${a.leftY} → ${c.leftY}`)
    r.check('2P match keeps the pinned pick through play', c.diff === 'TWO')
} catch (e) {
    r.check('leg 5 ride completed without timeout', false, String(e))
} finally {
    await p.close()
}

// ---- leg 6: #3529 touch quit — the terminal reaches the phone ----
// Phone viewport, REAL touch events only, no keyboard: a tap starts the
// match, the QUIT chip rides the #2324 rail beside the pad, its Escape
// press lands on the shipped play-to-quit terminal (#1473), and a tap
// restarts. The chip exists ONLY while a match is alive.
try {
    p = await openGame(browser, { url: `${BASE}?seed=777`, hook: '__pongTest', viewport: { width: 390, height: 844 }, touch: true, wait: 400 })
    p.on('pageerror', (e) => errors.push(String(e)))
    const chip = () => p.evaluate(() => {
        const el = document.querySelector('[data-vc="c"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: el.getAttribute('data-key'), text: el.textContent.trim() }
    })
    const tapTable = async (fx, fy) => {
        const b = await p.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
        })
        await p.touchscreen.tap(b.x + b.w * fx, b.y + b.h * fy)
    }
    r.check('attract carries no QUIT chip (nothing to quit)', (await chip()) === null && (await probe(p)).screen === 'attract')
    // right of the floating-stick half, above the pick band and the chrome bar
    await tapTable(0.6, 0.3)
    const live = await until(p, async () => { const q = await probe(p); return q.screen === 'play' ? q : null }, 3000, 'tap-to-start reaches play')
    r.check('a tap starts the match (screen play, scores zeroed)', live.score === 0 && live.opp === 0)
    const c1 = await chip()
    r.check('the QUIT chip rides the rail beside the pad in play', !!c1 && c1.key === 'Escape' && c1.text === 'QUIT', JSON.stringify(c1))
    await p.touchscreen.tap(c1.x, c1.y)
    const overT = await until(p, async () => {
        const st = await p.evaluate(() => window.__game && window.__game.state && window.__game.state())
        return st && st.done ? st : null
    }, 3000, 'chip tap ends the match')
    r.check('tapping QUIT ends the match honestly (done + seed in the report)', overT.done === true && typeof overT.seed === 'number', `seed ${overT.seed}`)
    r.check('the chip retires with the match (no QUIT on the over card)', (await chip()) === null && (await probe(p)).screen === 'over')
    await tapTable(0.6, 0.75) // below the pick band, clear of the chrome bar
    const fresh6 = await until(p, async () => { const q = await probe(p); return q.screen === 'play' ? q : null }, 3000, 'tap restarts')
    r.check('a tap after quit restarts at fresh scores', fresh6.score === 0 && fresh6.opp === 0, `${fresh6.score}-${fresh6.opp}`)
    r.check('the chip returns with the fresh match', (await chip())?.text === 'QUIT')
} catch (e) {
    r.check('leg 6 touch-quit ride completed without timeout', false, String(e))
} finally {
    await p.close()
}

r.check('zero page errors across the ride', errors.length === 0, errors.join(' | '))

// ---- chip mutants (#3529): each MUST die ----
// The chip gates are browser-level, so the mutants ride this script: plant a
// broken chip into index.jsx, re-run pongdrive childless, expect red. The tree
// must be CLEAN at start (mutateguard law, #2047) — commit, then mutate.
if (process.argv.includes('--mutant')) {
    const { plant, pull } = await import('./lib/mutateguard.mjs')
    const { readFileSync } = await import('node:fs')
    console.log('chip mutants (each MUST die)')
    const I = 'src/games/Pong/index.jsx'
    const CHIP = `thirdAction={screen === 'play' && !paused ? { label: 'QUIT', code: 'Escape' } : null}`
    const MUTANTS = [
        ['the QUIT chip is never rendered', CHIP, `thirdAction={null}`],
        ['the chip appears on attract and hides in play', `thirdAction={screen === 'play' && !paused`, `thirdAction={screen === 'attract' && !paused`],
        ['the chip fires a dead key', `{ label: 'QUIT', code: 'Escape' } : null}`, `{ label: 'QUIT', code: 'KeyM' } : null}`],
    ]
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        const orig = readFileSync(I, 'utf8')
        if (!orig.includes(from)) { console.log(`  FAIL mutant anchor: ${name} — missing`); continue }
        plant(I, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/pongdrive.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; console.log(`  ok   mutant dies: ${name}`) }
        else { console.log(`  FAIL mutant dies: ${name} — child passed despite the bug`) }
        pull(I)
    }
    console.log(died === MUTANTS.length ? `all ${MUTANTS.length} chip mutants die` : `FAIL ${died}/${MUTANTS.length} chip mutants die`)
    if (died !== MUTANTS.length) errors.push('a chip mutant survived')
}

r.exit(browser)
