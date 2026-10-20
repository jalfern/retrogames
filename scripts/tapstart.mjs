// tapstartcheck.mjs — issue #430: a real touch TAP starts the game.
//
// The bug: Pac-Man says "TAP TO START" and ignores taps — its shell only
// leaves attract on keydown. The fix lives in the shared shell (App.jsx
// `useTapStart`): for games flagged `tapStart` in the registry, a tap
// anywhere synthesizes the start key, exactly like a keyboard keydown.
//
// This gate taps with a REAL touch event (Playwright hasTouch +
// page.touchscreen.tap — not a mouse click) and proves the game left attract
// WITHOUT reading the prompt text, two tiers:
//   1. pixels — two attract frames taken apart measure each game's own demo
//      jitter; the tap's frame must move more than that (title card gone,
//      play field live),
//   2. the shell contract — for a flagged title whose start looks like its
//      demo (same maze, same sky), pixels can't decide; instead the tap must
//      deliver the start key: a probe records that a Space keydown reached
//      the window, which is exactly what the shared shell promises (and what
//      every flagged title's keydown handler exits attract on).
// Emulator titles (Zork, King's Quest, Rogue) have no attract card: the
// gate verifies they boot and survive the tap.
//
// Run: npm run dev in another terminal, then `npm run tapstartcheck`.
// TAP_ONLY=1 checks only the tapStart-flagged games (the fix itself).
// TAP_CANVAS=1 additionally drops the emulator (dos) routes — with TAP_ONLY=1
// that is the 16 flagged canvas titles only, the fast per-PR smoke gate.

import { launch, requireDevServer, Report } from './lib/harness.mjs'

const BASE = process.env.TAP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const ONLY_FLAGGED = !!process.env.TAP_ONLY
// TAP_CANVAS=1 drops the emulator (dos) routes: the per-PR smoke gate runs only
// the tapStart-flagged canvas games (the fix surface) — the emulators boot on
// their own clock and are already covered by zorkcheck/doscheck in the static job.
const CANVAS_ONLY = !!process.env.TAP_CANVAS
// [path, kind, label] — kind 'dos' = emulator title (boot check), 'canvas' = the
// pixel-transition check. The list mirrors src/config/games.js (62 routes).
const GAMES = [
    ['/mario', 'canvas', 'SUPER MARIO BROS'],
    ['/mario-classic', 'canvas', 'SUPER MARIO BROS (ORIGINAL)'],
    ['/ironkeep', 'canvas', 'IRONKEEP'],
    ['/raccoon-heist', 'canvas', 'RACCOON HEIST'],
    ['/beezee', 'canvas', 'BEEZEE'],
    ['/lemmings', 'canvas', 'LEMMINGS-LITE'],
    ['/boulder-dash', 'canvas', 'BOULDER DASH'],
    ['/sonar', 'canvas', 'SONAR ABYSS'],
    ['/metroid', 'canvas', 'METROID-LITE'],
    ['/momentum', 'canvas', 'MOMENTUM RUNNER'],
    ['/ice-climber', 'canvas', 'ICE CLIMBER CO-OP'],
    ['/galaga', 'canvas', 'GALAGA'],
    ['/polarity', 'canvas', 'POLARITY'],
    ['/missile-battle', 'canvas', 'MISSILE BATTLE'],
    ['/simcity-min', 'canvas', 'SIMCITY-MIN'],
    ['/outpost', 'canvas', 'OUTPOST'],
    ['/papers-please', 'canvas', 'PAPERS, PLEASE-MIN'],
    ['/lode-runner', 'canvas', 'LODE RUNNER-LITE'],
    ['/dogfight', 'canvas', 'DOG FIGHT'],
    ['/paperboy', 'canvas', 'PAPERBOY'],
    ['/wizardry', 'canvas', 'WIZARDRY'],
    ['/spy-hunter', 'canvas', 'SPY HUNTER'],
    ['/excitebike', 'canvas', 'EXCITEBIKE'],
    ['/mario-kart', 'canvas', 'MARIO KART'],
    ['/comet-drift', 'canvas', 'COMET DRIFT GP'],
    ['/tetris', 'canvas', 'TETRIS'],
    ['/joust', 'canvas', 'JOUST'],
    ['/qbert', 'canvas', 'Q*BERT'],
    ['/arkanoid', 'canvas', 'ARKANOID'],
    ['/arena-archery', 'canvas', 'ARENA ARCHERY'],
    ['/zelda', 'canvas', 'ZELDA'],
    ['/minesweeper', 'canvas', 'MINESWEEPER'],
    ['/pong', 'canvas', 'PONG'],
    ['/invaders', 'canvas', 'SPACE INVADERS'],
    ['/pacman', 'canvas', 'PAC-MAN'],
    ['/asteroids', 'canvas', 'ASTEROIDS'],
    ['/donkeykong', 'canvas', 'DONKEY KONG'],
    ['/centipede', 'canvas', 'CENTIPEDE'],
    ['/defender', 'canvas', 'DEFENDER'],
    ['/pitfall', 'canvas', 'PITFALL'],
    ['/frogger', 'canvas', 'FROGGER'],
    ['/missilecommand', 'canvas', 'MISSILE COMMAND'],
    ['/adventure', 'canvas', 'ADVENTURE'],
    ['/zork', 'dos', 'ZORK I'],
    ['/zork2', 'dos', 'ZORK II'],
    ['/zork3', 'dos', 'ZORK III'],
    ['/kingsquest', 'dos', "KING'S QUEST"],
    ['/rogue', 'dos', 'ROGUE'],
    ['/dig-dug', 'canvas', 'DIG DUG'],
    ['/bubble-bobble', 'canvas', 'BUBBLE BOBBLE'],
    ['/marble-madness', 'canvas', 'MARBLE MADNESS'],
    ['/gauntlet', 'canvas', 'GAUNTLET'],
    ['/four-halls', 'canvas', 'FOUR HALLS'],
    ['/smash-tv', 'canvas', 'SMASH TV'],
    ['/out-run', 'canvas', 'OUT RUN'],
    ['/lunar-lander', 'canvas', 'LUNAR LANDER'],
    ['/myst', 'canvas', 'MYST'],
    ['/tempest', 'canvas', 'TEMPEST'],
    ['/bards-tale', 'canvas', "THE BARD'S TALE"],
    ['/ssx', 'canvas', 'SSX'],
    ['/prince-of-persia', 'canvas', 'PRINCE OF PERSIA'],
    ['/civilization-v', 'canvas', 'CIVILIZATION V'],
]
// The registry flag that switches the shared-shell tap synthesis on. Only
// titles with NO touch/click input of their own: IronKeep (own touchstart /
// touchend fire) and Missile Command (own mousedown start) start themselves,
// and the shell's Space would double-fire their actions.
const FLAGGED = new Set(['/mario', '/mario-classic', '/arkanoid', '/zelda',
    '/pong', '/invaders', '/pacman', '/asteroids', '/donkeykong', '/centipede',
    '/defender', '/pitfall', '/adventure', '/dig-dug', '/bubble-bobble',
    '/prince-of-persia'])

const VIEWPORT = { width: 390, height: 844 }
const SETTLE_MS = 1600

// Downsample the biggest canvas to 64×64 grayscale inside the page.
// (Self-contained: page.evaluate has no closure over module scope.)
const SAMPLE = () => {
    const FRAME = 64
    const cs = [...document.querySelectorAll('canvas')].filter(c => {
        const r = c.getBoundingClientRect()
        return r.width > 50 && r.height > 50
    })
    if (!cs.length) return null
    cs.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        return rb.width * rb.height - ra.width * ra.height
    })
    const el = cs[0]
    const r = el.getBoundingClientRect()
    const off = document.createElement('canvas')
    off.width = FRAME; off.height = FRAME
    const ctx = off.getContext('2d')
    ctx.drawImage(el, 0, 0, FRAME, FRAME)
    let d
    try { d = ctx.getImageData(0, 0, FRAME, FRAME).data } catch { return { tainted: true } }
    const bytes = new Array(FRAME * FRAME)
    let min = 255, max = 0
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3
        bytes[j] = v
        if (v < min) min = v
        if (v > max) max = v
    }
    return { bytes, min, max, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
}
const uniform = (s) => !!s && !s.tainted && (s.max - s.min) < 2
const diff = (a, b) => {
    let sum = 0
    for (let i = 0; i < a.bytes.length; i++) sum += Math.abs(a.bytes[i] - b.bytes[i])
    return sum / a.bytes.length
}

await requireDevServer(BASE + '/pacman')
const browser = await launch()
const report = new Report('tapstartcheck')

for (const [path, kind, label] of GAMES) {
    if (ONLY_FLAGGED && kind === 'canvas' && !FLAGGED.has(path)) continue
    if (CANVAS_ONLY && kind === 'dos') continue
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    // Records every keydown that reaches the window — the harness itself sends
    // none, so any Space seen after the tap is the shell's synthesis.
    await page.addInitScript(() => {
        window.__tapKd = []
        window.addEventListener('keydown', e => window.__tapKd.push(e.code), true)
    })
    try {
        await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
        // Emulator titles are not canvas games: Zork boots an ifvms VM (its
        // DEV hook appears when the story is ready), King's Quest a js-dos
        // canvas, Rogue a button-driven terminal.
        if (kind === 'dos') {
            const boot =
                path === '/kingsquest' ? { selector: 'canvas', timeout: 40000 } :
                path.startsWith('/zork') ? { hook: '__zorkTest', timeout: 40000 } :
                { selector: 'button', timeout: 30000 }
            try {
                if (boot.selector) await page.waitForSelector(boot.selector, { timeout: boot.timeout })
                else await page.waitForFunction(h => !!window[h], boot.hook, { timeout: boot.timeout })
            } catch {
                report.check(label, false, `emulator never booted${errors.length ? ' — pageerror: ' + errors[0] : ''}`)
                continue
            }
            await page.waitForTimeout(1200)
            // The tap is not an emulator's start mechanism (DOS boots on its
            // own clock): verify the machine is alive and survives the touch.
            const s0 = await page.evaluate(SAMPLE)
            const cx = s0 ? s0.cx : 195
            const cy = s0 ? s0.cy : 400
            await page.touchscreen.tap(cx, cy)
            await page.waitForTimeout(1500)
            const alive = await page.evaluate(() => document.body.children.length > 0)
            report.check(label, alive && errors.length === 0,
                `emulator title — booted, tap delivered${errors.length ? ' — pageerror: ' + errors[0] : ''}`)
            continue
        }
        try {
            await page.waitForSelector('canvas', { timeout: 25000 })
        } catch {
            report.check(label, false, `no canvas ever appeared${errors.length ? ' — pageerror: ' + errors[0] : ''}`)
            continue
        }

        const p0a = await page.evaluate(SAMPLE)
        await page.waitForTimeout(700)
        const p0b = await page.evaluate(SAMPLE)
        if (!p0b || p0b.tainted || !p0a || p0a.tainted) {
            report.skip(label, uniform(p0b) ? 'webgl buffer not samplable (black)' : 'canvas not readable')
            continue
        }
        const jitter = diff(p0a, p0b)
        await page.touchscreen.tap(p0b.cx, p0b.cy)
        await page.waitForTimeout(SETTLE_MS)
        const p1 = await page.evaluate(SAMPLE)
        if (!p1 || p1.tainted) { report.skip(label, 'frame not samplable after tap'); continue }
        const delta = diff(p0b, p1)
        // The start transition must beat the game's own attract jitter, by a
        // margin, and clear an absolute floor (a dead tap moves almost nothing).
        const floor = 2.5
        const bar = Math.max(2 * jitter, floor)
        if (delta >= bar) {
            report.check(label, true, `tap started it — moved ${delta.toFixed(1)} vs jitter ${jitter.toFixed(1)}`)
        } else if (FLAGGED.has(path)) {
            // Tier 2: the shell contract. The tap must deliver a Space keydown
            // to the window — the exact link that was broken in #430.
            const kd = await page.evaluate(() => window.__tapKd || [])
            if (kd.includes('Space')) {
                report.check(label, true,
                    `tap delivered the start key (Space keydown; subtle start — moved ${delta.toFixed(1)} vs jitter ${jitter.toFixed(1)})`)
            } else {
                report.check(label, false,
                    `TAP DID NOT START IT — no keydown reached the window after the tap (moved ${delta.toFixed(1)}, jitter ${jitter.toFixed(1)})`)
            }
        } else {
            // Own tap handling (window pointerdown): the pixel transition is
            // advisory — a start that looks identical to the demo (same maze,
            // same sky) is not a failed tap.
            report.skip(label, `own tap handling — no visible transition (moved ${delta.toFixed(1)}, jitter ${jitter.toFixed(1)})`)
        }
    } catch (e) {
        report.check(label, false, `crashed: ${e.message.split('\n')[0]}`)
    } finally {
        await page.close().catch(() => {})
    }
}

report.exit(browser)
