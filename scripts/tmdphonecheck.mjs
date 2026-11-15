// tmdphonecheck — the phone's typed mouth (#2287): a TYPE pill opens a real
// soft-keyboard line into the SAME #1894 CALL pipeline. Phone viewport, real
// taps and keystrokes only: pill appears at play (never at attract, never on a
// keyboard box), tap opens the canvas line, typed words reach voiceCall exactly
// once, nonsense is refused with why, Escape/blur/pause put the line away —
// and the seat pads stay COLD while typing (words are not hands: B/W/A/S/D/F/
// Space are seat verbs, "CUT BLUE" has two of them). Zero page errors.
//
//   npm run dev  (DEV_PORT=5173)  &&  npm run tmdphonecheck
import { launchChrome } from './lib/chromeboot.mjs'

const URL = process.env.TMD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/talk-me-down`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// tap the pill, but a MISSING pill is a FAIL, not a crash — a mutant that
// hides the pill (e.g. leaking Escape into pause) must read RED, not stack-trace.
async function tapPill(tag = '') {
    if (await phone.$('[data-tmd-type-btn]') === null) { ok(`TYPE pill tappable ${tag}`, false, 'pill absent'); return false }
    await phone.tap('[data-tmd-type-btn]')
    return true
}

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const errs = []
const watch = (pg, tag) => {
    pg.on('pageerror', (e) => errs.push(`${tag}: ${e}`))
    pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback/i.test(m.text())) errs.push(`${tag}: ${m.text()}`) })
}
const T = (pg, fn, arg) => pg.evaluate(fn, arg)
// #2095 boot parity: seed the honest DECLINED consent before page scripts run,
// or the auto-record gate swallows the start taps (same law as watchcheck).
const DECLINED_CONSENT = () => {
    try { localStorage.setItem('retrogames-consent-v1', JSON.stringify({ player: { motion: false, voice: false, at: Date.now() } })) } catch { /* private mode */ }
}
const callLine = (pg) => T(pg, () => window.__tmdTest.callLine())
const typeUI = (pg) => T(pg, () => window.__tmdTest.typeUI())
const screenOf = (pg) => T(pg, () => window.__tmdTest.screen())
const keysNow = (pg) => T(pg, () => window.__tmdTest.keys())
const vlog = (pg) => T(pg, () => window.__tmdTest.voiceLog())

// amber pixels of the CALL line on the canvas (drawCallLine owns that strip)
const lineAmber = (pg) => pg.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(18, 316, 384, 14).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i + 1] > 160 && d[i + 1] < 235 && d[i + 2] < 140) n++
    }
    return n
})

// ---- phone page ----------------------------------------------------------
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
watch(phone, 'phone')
await phone.addInitScript(DECLINED_CONSENT)
await phone.goto(`${URL}?touch=1`, { waitUntil: 'load' })
await phone.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(1000)
ok('boots into attract', (await screenOf(phone)) === 'attract')

const tpill = () => phone.$('[data-tmd-type-btn]')
ok('TYPE pill is NOT offered before play (screen gating)', (await tpill()) === null, JSON.stringify(await typeUI(phone)))

// real taps: attract -> select -> play (seat 1)
await phone.tap('canvas'); await sleep(300)
ok('tap at attract lands on select', (await screenOf(phone)) === 'select')
await phone.tap('canvas'); await sleep(500)
ok('tap at select starts the run', (await screenOf(phone)) === 'play')
ok('TYPE pill shows on a phone at play', (await tpill()) !== null, JSON.stringify(await typeUI(phone)))
ok('MIC pill and TYPE pill coexist (one thumb row)', (await phone.$('[data-voice-coop]')) !== null)

// tap the pill: the line opens, the keyboard's mouth takes focus
await tapPill(); await sleep(350)
let cl = await callLine(phone)
ok('TYPE tap opens the CALL line (cl.open)', cl.open === true, JSON.stringify(cl))
ok('the soft-keyboard <input> is on screen', (await typeUI(phone)).line === true)
ok('focus sits in the line (keys type words)', (await T(phone, () => document.activeElement?.getAttribute('data-tmd-type') !== null)) === true)
let amber = 0
for (let i = 0; i < 12 && amber === 0; i++) { amber = await lineAmber(phone); await sleep(120) }
ok('the canvas paints the empty CALL line', amber > 0, `amber=${amber}`)

// words are not hands: seat verbs stay COLD while they pass through the mouth
const padsCold = async (code) => {
    await phone.keyboard.down(code)
    const held = await keysNow(phone)
    await phone.keyboard.up(code)
    return Object.values(held).every((v) => !v)
}
ok('KeyB through the line never presses b', await padsCold('KeyB'))
ok('KeyW never presses up', await padsCold('KeyW'))
ok('KeyA never presses left', await padsCold('KeyA'))
ok('KeyD never presses right', await padsCold('KeyD'))
ok('KeyF never presses seat-2 a', await padsCold('KeyF'))
ok('Space through the line never presses a', await padsCold('Space'))
// the probes typed letters into the value (that is what a keyboard does at a
// mouth) — put the line away and reopen so the phrase below starts clean.
await phone.keyboard.press('Escape'); await sleep(200)
await tapPill(); await sleep(250)
ok('reopen after probes starts an empty line', (await callLine(phone)).buf === '')

// type a real call and shout it: exactly ONE bank entry, grammar ran
await phone.keyboard.type('CUT BLUE', { delay: 40 }); await sleep(150)
cl = await callLine(phone)
ok('typed words sit in the line intact', cl.buf === 'CUT BLUE', JSON.stringify(cl))
ok('the line still paints typed text', (await lineAmber(phone)) > 0)
await phone.keyboard.press('Enter'); await sleep(250)
const v1 = await vlog(phone)
const heard = v1.filter((e) => e.said === 'CUT BLUE')
ok('GO shouted the words exactly once (#1415 bank)', heard.length === 1, JSON.stringify(heard))
ok('the grammar heard a CUT', heard[0]?.intent?.kind === 'cut', JSON.stringify(heard[0]))
ok('a banner answered (obey or refuse-with-why)', (await T(phone, () => window.__tmdTest.hud().banner)) !== null)
ok('the line put itself away after GO', (await callLine(phone)).open === false && (await typeUI(phone)).line === false)
ok('focus left the mouth (keyboard down)', (await T(phone, () => document.activeElement?.getAttribute('data-tmd-type') !== null)) === false)
ok('pads still cold after the shout', Object.values(await keysNow(phone)).every((v) => !v))

// nonsense is honest on the phone too
await tapPill(); await sleep(250)
await phone.keyboard.type('ZZZ QQQ', { delay: 30 })
await phone.keyboard.press('Enter'); await sleep(250)
const v2 = await vlog(phone)
const junk = v2.filter((e) => e.said === 'ZZZ QQQ')
ok('typed nonsense reached the mic path once', junk.length === 1, JSON.stringify(junk))
ok('nonsense refused with intent null', junk[0]?.intent === null && junk[0]?.ok === false, JSON.stringify(junk[0]))

// Escape puts the phone's mouth away
await tapPill(); await sleep(250)
await phone.keyboard.type('SET', { delay: 30 })
await phone.keyboard.press('Escape'); await sleep(200)
cl = await callLine(phone)
ok('Escape closes the line and empties it', cl.open === false && cl.buf === '', JSON.stringify(cl))
ok('Escape hides the input', (await typeUI(phone)).line === false)

// blur (keyboard dismissed the phone way) closes it too
await tapPill(); await sleep(250)
await T(phone, () => document.querySelector('[data-tmd-type]')?.blur())
await sleep(200)
ok('blur puts the line away', (await callLine(phone)).open === false && (await typeUI(phone)).line === false)

// pause while typing: the line lives on the panel, not past it. The keyboard
// is DOWN here — the line swallows keys by law — so dismiss the keyboard the
// way a thumb does (blur) before the desktop pause key reaches the game.
await tapPill(); await sleep(250)
await T(phone, () => document.querySelector('[data-tmd-type]')?.blur()); await sleep(150)
await tapPill(); await sleep(250) // line open again, focused
await phone.keyboard.press('Backquote'); await sleep(300) // swallowed by the mouth? paused?
const pausedNow = (await callLine(phone)).paused
if (!pausedNow) { // Backquote stayed at the mouth (correct): blur, then pause
    await T(phone, () => document.querySelector('[data-tmd-type]')?.blur()); await sleep(150)
    await phone.keyboard.press('Backquote'); await sleep(300)
}
ok('pause puts the typed line away', (await callLine(phone)).open === false && (await typeUI(phone)).line === false)
await phone.keyboard.press('Backquote'); await sleep(300) // resume
ok('resume brings the pill back', (await tpill()) !== null)

// ---- desktop page: X stays exactly the desktop channel ----------------
const desk = await browser.newPage({ viewport: { width: 900, height: 760 } })
watch(desk, 'desk')
await desk.addInitScript(DECLINED_CONSENT)
await desk.goto(URL, { waitUntil: 'load' })
await desk.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(900)
await desk.keyboard.press('Space'); await sleep(250)
await desk.keyboard.press('Space'); await sleep(450)
ok('desktop reaches play', (await screenOf(desk)) === 'play')
ok('no TYPE pill on a keyboard box', (await typeUI(desk)).pill === false && (await desk.$('[data-tmd-type-btn]')) === null)
ok('no TYPE input on a keyboard box', (await typeUI(desk)).line === false)
await desk.keyboard.press('KeyX'); await sleep(150)
ok('desktop X still opens the line (untouched)', (await callLine(desk)).open === true)
await desk.keyboard.type('SET', { delay: 30 }); await sleep(100)
ok('desktop typing still intact', (await callLine(desk)).buf === 'set', JSON.stringify(await callLine(desk)))
await desk.keyboard.press('KeyX'); await sleep(150)
ok('X closes what X opened (untouched)', (await callLine(desk)).open === false)

ok('zero page errors across both boxes', errs.length === 0, errs.join(' | '))

await browser.close()
console.log(`\ntmdphonecheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
