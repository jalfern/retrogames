// vpadboot — the #384 step-1 mount gate, in one real browser.
//
// vpadcheck pins the *decision* (shouldUseStick + the registry's d-pad
// exceptions) in Node. This script pins the *mount*: every route this step
// touched boots with zero page errors, and once its pad is on screen the
// floating-stick zone is present exactly when the registry declares the stick
// — absent for the grid-/menu-driven d-pad exceptions (which may render the
// 150px d-pad or a title's own 2x2 corner pad; #384 only flips the stick
// default, it never re-shapes a title's own left control).
//
// Getting a title to the pad-on-screen state needs its own start gesture
// (tap, select-screen confirm, or a keyboard start), so a bounded ladder of
// generic gestures is tried until the left control appears. A synthetic
// (non-isTrusted) keydown is used for keyboard-only starts on purpose: it
// starts the game without tripping VirtualControls' hide-on-real-keyboard.
//
//   npm run dev          (another terminal, or point VPAD_URL at any dev server)
//   npm run vpadboot

import { launch, requireDevServer, Report } from './lib/harness.mjs'

const BASE = process.env.VPAD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`

// The routes #384/#420 touch, with the input method each registry entry
// declares ('stick' | 'dpad' | 'pointer'). A drift here (a silent revert of the
// default, a reason-less d-pad, or a pilot's method flipping) fails the boot,
// not just the Node pin.
const TOUCHED = [
    ['/mario', 'stick'], ['/ironkeep', 'stick'], ['/beezee', 'stick'],
    ['/lemmings', 'pointer'], ['/metroid', 'stick'], ['/polarity', 'stick'],
    ['/simcity-min', 'dpad'], ['/outpost', 'dpad'], ['/papers-please', 'dpad'],
    ['/lode-runner', 'stick'], ['/dogfight', 'stick'], ['/paperboy', 'stick'],
    ['/ten-deep', 'dpad'], ['/spy-hunter', 'stick'], ['/excitebike', 'stick'],
    ['/tetris', 'dpad'], ['/qbert', 'dpad'], ['/zelda', 'stick'],
    ['/minesweeper', 'dpad'], ['/bubble-bobble', 'stick'], ['/gauntlet', 'stick'],
    ['/four-halls', 'stick'], ['/smash-tv', 'stick'], ['/lunar-lander', 'stick'],
    ['/bards-tale', 'dpad'], ['/ssx', 'stick'], ['/prince-of-persia', 'stick'],
    ['/mario-classic', 'stick'], ['/pong', 'stick'], ['/invaders', 'stick'],
    ['/pacman', 'dpad'], ['/asteroids', 'stick'], ['/donkeykong', 'stick'],
    ['/centipede', 'stick'], ['/defender', 'stick'], ['/pitfall', 'stick'],
    ['/boulder-dash', 'stick'], ['/sonar', 'stick'], ['/momentum', 'stick'],
    ['/frogger', 'stick'], ['/tempest', 'stick'], ['/dig-dug', 'stick'],
    ['/adventure', 'stick'], ['/joust', 'stick'], ['/arkanoid', 'stick'],
    ['/missile-battle', 'stick'],
    ['/mario-kart', 'stick'], ['/comet-drift', 'stick'],
    ['/comet-drift-hd', 'stick'], ['/emberwood', 'stick'],
]

// #906: the drawn face buttons must say the game's verbs — the exact list of
// labels, in draw order (B left, A right), for the games Jon plays most.
const VERBS = {
    '/momentum': ['JUMP'],
    '/comet-drift': ['DRIFT'],
    '/comet-drift-hd': ['DRIFT'],
    '/emberwood': ['BOMB', 'ACT'],
    '/mario-kart': ['DRIFT', 'ITEM'],
}

// The left control VirtualControls renders, tagged with data-vc (the
// component's own testable-markup convention):
//   stick       the legacy floating stick (anchors under the thumb)
//   fixedstick  the always-visible fixed stick (method 'stick')
//   dpadgate    the #439 diamond-gate stick (method 'dpad' + ways)
//   dpad        the legacy fixed d-pad (layout 'dpad' without ways)
//   diag        the 2x2 corner pad (Q*BERT's diag prop)
// A 'stick' registry method renders `stick` or `fixedstick`; a 'dpad' method
// renders one of the three d-pad shapes; a 'pointer' method renders none (the
// canvas is the control surface).
const STICK_VCS = ['stick', 'fixedstick']
const DPAD_VCS = ['dpadgate', 'dpad', 'diag']
const LEFT_VCS = [...STICK_VCS, ...DPAD_VCS]

async function leftCtrl(page) {
    const vcs = await page.evaluate(() =>
        [...document.querySelectorAll('[data-vc]')].map((d) => d.getAttribute('data-vc')))
    return {
        stick: vcs.some((v) => STICK_VCS.includes(v)),
        any: vcs.some((v) => LEFT_VCS.includes(v)),
    }
}

// Try generic start gestures until a left control is on screen. Bounded, so a
// title that never gets there fails loudly instead of hanging the gate.
async function enterPlay(page) {
    const steps = [
        async () => page.touchscreen.tap(215, 320),          // touch start
        async () => page.evaluate(() => {                    // keyboard start (non-isTrusted)
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }))
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }))
        }),
        async () => page.touchscreen.tap(380, 300),          // select-screen confirm (right side)
        async () => page.evaluate(() => {                    // one more keyboard start
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', bubbles: true }))
        }),
    ]
    for (const step of steps) {
        await step()
        await page.waitForTimeout(1200)
        if ((await leftCtrl(page)).any) return
    }
}

await requireDevServer(BASE + '/mario')
const browser = await launch()
const r = new Report('vpadboot')

for (const [path, method] of TOUCHED) {
    const errors = []
    const page = await browser.newPage({
        viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    })
    page.setDefaultTimeout(60000)
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)))
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
    try {
        await page.goto(BASE + path, { waitUntil: 'load' })
        await page.waitForSelector('canvas', { timeout: 20000 })
        await page.waitForTimeout(800) // let the mount settle past the first frames
        await enterPlay(page)
        const { stick, any } = await leftCtrl(page)
        const pageErrors = errors.filter(e => !e.startsWith('console:'))
        r.check(`${path} boots with zero page errors`, pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300))
        if (errors.some(e => e.startsWith('console:')))
            r.info(`${path} console.error`, errors.filter(e => e.startsWith('console:')).join(' | ').slice(0, 200))
        const isPointer = method === 'pointer'
        r.check(`${path} pad is on screen`, any === !isPointer,
            isPointer ? 'pointer game: no left control (tap the field)' : 'no left control after the start ladder')
        r.check(`${path} stick zone ${method === 'stick' ? 'present' : 'absent'}`, stick === (method === 'stick'),
            `stick=${stick} expected=${method === 'stick'}`)
        // #734/#745: the DRAWN action buttons must be tappable — the topmost
        // element at each button's centre is inside the action zone, not chrome
        // overlapping it. (The bottom-right mute toggle once covered the A
        // button's right edge: a tap on A muted the game instead of firing.)
        const tapOk = await page.evaluate(() => {
            const zone = document.querySelector('[data-vc="actzone"]')
            if (!zone) return { pad: false, bad: [], labels: [] }
            const bad = []
            for (const btn of zone.children) {
                const b = btn.getBoundingClientRect()
                const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
                if (!zone.contains(el)) bad.push(btn.textContent.trim() + '->' + ((el && el.tagName) || 'null'))
            }
            return { pad: true, bad, labels: [...zone.children].map((b) => b.textContent.trim()) }
        })
        if (tapOk.pad)
            r.check(`${path} action buttons are tappable (no chrome overlap)`, tapOk.bad.length === 0, tapOk.bad.join(' '))
        if (VERBS[path]) {
            r.check(`${path} face buttons say the game's verbs`, JSON.stringify(tapOk.labels) === JSON.stringify(VERBS[path]),
                `drawn ${JSON.stringify(tapOk.labels)}, want ${JSON.stringify(VERBS[path])}`)
        }
    } catch (e) {
        r.check(`${path} boots with zero page errors`, false, String(e.message).slice(0, 200))
        r.check(`${path} pad is on screen`, false, 'boot failed')
        r.check(`${path} stick zone ${method === 'stick' ? 'present' : 'absent'}`, false, 'boot failed')
    } finally {
        await page.close()
    }
}

await r.exit(browser)
