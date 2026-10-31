// voicecoopdrive — advisory browser drive for spoken co-op (#1249). Step 6:
// real clicks and keys, zero page errors, the drawn state tracks the logical
// one. Headless Chrome has no speech SERVICE, so after the real consent flow
// the words enter through __gauntletTest.voiceCall — the same parse→apply→
// banner→record path the mic feeds on a real box (speechListen just isn't in
// that stretch). Needs `npm run dev` running.
//
//   DEV_PORT=5178 npm run voicecmdcheck        # the rules gate (Node)
//   DEV_PORT=5178 node scripts/voicecoopdrive.mjs   # this drive (advisory)
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.GAUNTLET_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/gauntlet`
const r = new Report('voicecoopdrive')
// Fake media (voicedrive's idiom): a generated tone stands in for the mic so
// the consent + session flow runs headless; our OWN overlay still must be
// clicked — --use-fake-ui only pre-grants the browser bubble.
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false, extraArgs: ['--use-fake-device-for-media-capture', '--use-fake-ui-for-media-capture'] })
const page = await openGame(browser, { url: URL, hook: '__gauntletTest', start: false, viewport: { width: 820, height: 640 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__gauntletTest.probe())
const voiceMode = () => page.evaluate(() => window.__gauntletTest.voiceMode())

const p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)

// V at hero select — the consent overlay is the #1247 ask, answered by a real click.
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await page.keyboard.press('KeyV')
let consented = true
try {
    await page.waitForSelector('#vc-yes', { timeout: 3000 })
    await page.click('#vc-yes')
} catch { consented = false }
r.check('V opens the mic consent (the #1247 ask)', consented)
await page.waitForTimeout(300)
let vm = await voiceMode()
r.check('voice co-op ON after YES', vm.on === true, JSON.stringify(vm))
let pill = await page.$('[data-voice-coop]')
r.check('MIC ON pill visible', pill !== null)

// start the run; the order path: words -> intent -> seat moves.
await page.keyboard.press('Digit1')
await page.waitForTimeout(400)
const before = await probe()
const call1 = await page.evaluate(() => window.__gauntletTest.voiceCall('take the upper right'))
r.check('"take the upper right" -> goto, accepted', call1.ok === true && call1.cmd.kind === 'goto' && call1.cmd.goal !== null, JSON.stringify(call1))
r.check('the banner heard the words', call1.said.toLowerCase().includes('upper right'), call1.said)
for (let i = 0; i < 400; i++) await page.evaluate(() => window.__gauntletTest.frame())
const after = await probe()
r.check('the CPU seat WALKED under the order', Math.hypot(after.p2.x - before.p2.x, after.p2.y - before.p2.y) > 1.5,
    `${before.p2.x.toFixed(1)},${before.p2.y.toFixed(1)} -> ${after.p2.x.toFixed(1)},${after.p2.y.toFixed(1)}`)
r.check('the pill now names the order', (await page.getAttribute('[data-voice-coop]', 'data-voice-order')) === 'UPPER RIGHT')

// nonsense is honest: refusal, not misobedience.
const call2 = await page.evaluate(() => window.__gauntletTest.voiceCall('the marmalade ducks') )
r.check('nonsense refused with NOT SURE', call2.ok === false && call2.why === 'NOT SURE', JSON.stringify(call2))

// recording: from a SEEDED reset (replay reproduces from the seed), driven
// through the game's OWN loop (rule: one driver per loop) so the recorder
// banks the CONSUMED pads — including the CPU seat's pads — not just the
// seat-1 stream. Contract step() with one pad would bank seat 2 as idle and
// the replay would leave the partner standing while the recording walked him.
await page.click('canvas') // real user activation for the recorder's consent gate
await page.evaluate(() => { window.__game.reset(11, 2); window.__game.recordStart(30) })
await page.evaluate(() => window.__gauntletTest.voiceCall('grab the key'))
await page.waitForTimeout(1100)
await page.evaluate(() => window.__gauntletTest.voiceCall('hold here'))
await page.waitForTimeout(1100)
const rec = await page.evaluate(async () => {
    const out = window.__game.recordStop()
    window.__game.release()
    await (window.__voiceFlush || Promise.resolve())
    return JSON.parse(JSON.stringify(out))
})
r.check('recording banks voiceCmd entries', Array.isArray(rec.voiceCmd) && rec.voiceCmd.length >= 2, JSON.stringify((rec.voiceCmd || []).map((c) => c.intent)))
r.check('said + understood + ok all present', rec.voiceCmd.some((c) => c.said && c.ok && (c.intent === 'key' || c.intent === 'hold')), JSON.stringify(rec.voiceCmd))
const replay = await page.evaluate((file) => window.__game.replay(file), rec)
r.check('the recorded file replays hash-exact', replay.ok === true, JSON.stringify(replay.mismatch || replay.error || 'ok'))
r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await page.screenshot({ path: process.env.SHOT_OUT || '/tmp/voicecoopdrive.png' })
r.exit(browser)
