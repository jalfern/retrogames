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
// Pinned seed (#1473): the FIRST HIT wait faces a seeded serve + paddle
// scatter; an unpinned draw could starve it (two luck-dependent reds on
// 2026-11-26). The rules below are what this leg proves; the seed they
// replay on is pinned, exactly like leg 5. Seed entropy itself is
// pongcheck's seedpin law, not the drive's job.
let p = await open(`${BASE}?seed=4242`)
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

// ---- leg 7: #3536 audio-spy — the widened vocabulary, in order ----
// The voice LAW lives in voice.js (pongcheck §voice proves it); this leg
// proves the shipped shell actually plays it: a serve double-clack opens the
// match, mid-rally never re-clacks, walls sit below every ping, the point
// closes with a low thud, and rally pitches VARY (the strike law made audible
// — the old fixed 400 Hz tone can pass none of this).
try {
    p = await open(`${BASE}?seed=4242`)
    const audio = await p.evaluate(() => {
        window.__game.reset(4242)
        let steps = 0
        const kinds = () => window.__pongTest.sfx().map((e) => e.kind)
        for (; steps < 180; steps++) {
            window.__game.step({ up: false, down: false }, 50)
            const k = kinds()
            const thuds = k.filter((x) => x === 'thud').length
            const pitches = new Set(window.__pongTest.sfx().filter((e) => e.kind === 'rally').map((e) => e.freq))
            if (thuds >= 2 && pitches.size >= 3) break
        }
        const log = window.__pongTest.sfx()
        const serve0 = log[0], serve1 = log[1]
        const rally = log.filter((e) => e.kind === 'rally')
        const walls = log.filter((e) => e.kind === 'wall')
        const thud = log.filter((e) => e.kind === 'thud')
        const nonWallBefore = (i) => { for (let j = i - 1; j >= 0; j--) if (log[j].kind !== 'wall') return log[j].kind; return null }
        return {
            steps,
            opensWithServe: !!serve0 && serve0.kind === 'serve' && !!serve1 && serve1.kind === 'serve' && serve1.freq > serve0.freq,
            rallyVar: new Set(rally.map((e) => e.freq)).size,
            rallyN: rally.length,
            wallBelowRally: walls.length > 0 && rally.length > 0 && walls.every((w) => rally.every((v) => w.freq < v.freq)),
            wallsUniform: walls.length > 0 && walls.every((w) => w.freq === 170),
            thudLow: thud.length >= 2 && thud.every((t) => t.freq === 98),
            midRallyServe: log.findIndex((e, i) => e.kind === 'serve' && nonWallBefore(i) === 'rally'),
            serveAfterThud: log.some((e, i) => e.kind === 'serve' && nonWallBefore(i) === 'thud'),
        }
    })
    r.check('the match opens with the serve double-clack (echo above)', audio.opensWithServe, JSON.stringify(audio).slice(0, 160))
    r.check('rally pitches vary — the strike law is audible', audio.rallyVar >= 3, `${audio.rallyVar} distinct over ${audio.rallyN} pings`)
    r.check('every wall tick sits below every rally ping', audio.wallBelowRally)
    r.check('walls are one uniform dry voice', audio.wallsUniform)
    r.check('points close with the low thud', audio.thudLow)
    r.check('the serve clack never fires mid-rally', audio.midRallyServe === -1, `idx ${audio.midRallyServe}`)
    r.check('the serve clack re-arms after a point', audio.serveAfterThud)
} catch (e) {
    r.check('leg 7 audio-spy ride completed without timeout', false, String(e))
} finally {
    await p.close()
}

// ---- leg 8: #3536 chip ergonomics at the small end (iPhone SE landscape) ----
// 667×375 is the tightest landscape phone: the QUIT chip must not crowd the
// floating-stick reach, WATCH and QUIT must read as two clear corners, and
// neither may cover the block-numeral band.
try {
    p = await openGame(browser, { url: `${BASE}?seed=555`, hook: '__pongTest', viewport: { width: 667, height: 375 }, touch: true, wait: 400 })
    p.on('pageerror', (e) => errors.push(String(e)))
    const geo = () => p.evaluate(() => {
        const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
        const cv = rect('canvas')
        const zone = (fx) => ({ l: cv.l + (cv.r - cv.l) * fx - 24, t: cv.t + 10, r: cv.l + (cv.r - cv.l) * fx + 24, b: cv.t + 55 })
        return {
            chip: rect('[data-vc="c"]'),
            pill: rect('[data-watch-toggle]'),
            stick: rect('[data-vc="stick"]'),
            pick: !!document.querySelector('.pong-pick-zone'),
            canvas: cv,
            scoreR: zone(0.75),
            scoreL: zone(0.25),
        }
    })
    const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
    const g0 = await geo()
    r.check('attract: pick band + WATCH affordance present, QUIT chip absent', g0.pick && !g0.chip && !!g0.pill, JSON.stringify(g0).slice(0, 140))
    await p.touchscreen.tap(g0.canvas.l + (g0.canvas.r - g0.canvas.l) * 0.5, g0.canvas.t + (g0.canvas.b - g0.canvas.t) * 0.35)
    await until(p, async () => { const q = await probe(p); return q.screen === 'play' ? q : null }, 3000, 'tap-to-start at 667×375')
    const g = await geo()
    r.check('play: pick band retires (no phantom dial under the pad)', !g.pick)
    r.check('QUIT chip clears the stick reach', g.chip && g.stick && !hit(g.chip, g.stick), JSON.stringify({ chip: g.chip, stick: g.stick }).slice(0, 200))
    r.check('WATCH pill never covers the right numerals band', g.pill && !hit(g.pill, g.scoreR), JSON.stringify({ pill: g.pill, scoreR: g.scoreR }).slice(0, 200))
    r.check('WATCH (top-right) and QUIT (rail) are distinct corners', g.pill && g.chip && g.chip.t > g.pill.b + 8)
    r.check('the chip stays inside the viewport', g.chip && g.chip.r <= 667 && g.chip.b <= 375)
} catch (e) {
    r.check('leg 8 phone-ergonomics ride completed without timeout', false, String(e))
} finally {
    await p.close()
}

// ---- leg 9 (#3565): the RANGE knob in real Chrome — dial, thumb, honest cap ----
try {
    p = await open(`${BASE}?seed=4242`)
    r.check('attract defaults to FREE (the b16 uncapped table)', (await probe(p)).range === 'FREE')
    await p.keyboard.press('ArrowUp')
    const a1 = await probe(p)
    r.check('ArrowUp on attract turns RANGE FREE → 1 without starting', a1.range === '1' && a1.screen === 'attract' && a1.score === 0)
    await p.keyboard.press('ArrowDown')
    r.check('ArrowDown cycles back 1 → FREE', (await probe(p)).range === 'FREE')
    await p.click('.pong-range-zone')
    r.check('a thumb on the RANGE label rides the dial (FREE → 1)', (await probe(p)).range === '1')
    await p.keyboard.press('KeyY') // seat the proven driver, starts the match
    const capped = await until(p, async () => {
        const q = await probe(p)
        return q.screen === 'over' ? q : null
    }, 60000, 'the RANGE 1 cap closes the match')
    r.check('RANGE 1 binds: the first point ends the match at play time',
        capped.score + capped.opp === 1 && capped.screen === 'over', `${capped.score}-${capped.opp}`)
    const winSfx = await p.evaluate(() => window.__pongTest.sfx().filter((s) => s.kind === 'win'))
    r.check('the cap rings the ascending win sting (660 → 880)',
        winSfx.length === 2 && winSfx[0].freq === 660 && winSfx[1].freq > winSfx[0].freq, JSON.stringify(winSfx))
    await p.keyboard.press('Enter') // any key restarts
    const again = await until(p, async () => {
        const q = await probe(p)
        return q.screen === 'play' ? q : null
    }, 5000, 'restart after the cap')
    r.check('restart after a cap win: fresh scores, the target stands',
        again.score === 0 && again.opp === 0 && again.range === '1')
    await p.close()
    p = await open(`${BASE}?seed=777&range=3`) // the QA pin
    r.check('?range=3 pins the target on attract', (await probe(p)).range === '3')
    await p.close()
} catch (e) {
    r.check('leg 9 RANGE knob ride completed without timeout', false, String(e))
}

// ---- leg 10 (#3584): the switch bank leaves the field centre open ----
// The nightly tapstartcheck taps the exact canvas centre. When the GAME/RANGE
// dials grew half-width bands meeting at x=50%, that tap died on the RANGE
// button's stopPropagation — attract could not be tapped away on a phone.
try {
    p = await openGame(browser, { url: `${BASE}?seed=99`, hook: '__pongTest', viewport: { width: 390, height: 844 }, touch: true, wait: 400 })
    p.on('pageerror', (e) => errors.push(String(e)))
    const centre = await p.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await p.touchscreen.tap(centre.x, centre.y)
    const live = await until(p, async () => { const q = await probe(p); return q.screen === 'play' ? q : null }, 3000, 'centre tap starts the match')
    r.check('#3584: a centre tap on attract starts the match (centre column is open)', live.score === 0 && live.opp === 0, `score ${live.score}-${live.opp}`)
    r.check('#3584: the centre tap rode no dial (RANGE stands FREE after the start)', live.range === 'FREE')
    await p.close()
    p = await openGame(browser, { url: `${BASE}?seed=99`, hook: '__pongTest', viewport: { width: 390, height: 844 }, touch: true, wait: 400 })
    p.on('pageerror', (e) => errors.push(String(e)))
    const onCanvas = (fx, fy) => p.evaluate(({ fx, fy }) => {
        const r = document.querySelector('canvas').getBoundingClientRect()
        return { x: r.left + r.width * fx, y: r.top + r.height * fy }
    }, { fx, fy })
    const rc = await onCanvas(0.75, 0.52) // RANGE column, off the centre gap
    await p.touchscreen.tap(rc.x, rc.y)
    const afterRange = await probe(p)
    r.check('#3584: the RANGE column still answers a thumb (FREE → 1, still attract)',
        afterRange.range === '1' && afterRange.screen === 'attract', JSON.stringify(afterRange).slice(0, 120))
    const gc = await onCanvas(0.25, 0.52) // GAME column
    await p.touchscreen.tap(gc.x, gc.y)
    const afterPick = await probe(p)
    r.check('#3584: the GAME column still cycles the pick (NORMAL → HARD, still attract)',
        afterPick.diff === 'HARD' && afterPick.screen === 'attract', JSON.stringify(afterPick).slice(0, 120))
    await p.close()
} catch (e) {
    r.check('leg 10 centre-tap ride completed without timeout', false, String(e))
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
        ['#3536: the serve clack fires on every hit', `if (ev.serve)`, `if (true)`],
        ['#3536: the rally pitch is pinned flat (strike law inaudible)', `rallyVoice(state.ball.dy, state.ball.dx, state.diff)`, `rallyVoice(0, 4, state.diff)`],
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
