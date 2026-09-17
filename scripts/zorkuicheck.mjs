/**
 * zorkuicheck — the AI has a face, and the human still owns the keyboard.
 *
 * zorkcheck.mjs proves the brain can play. It does that in Node, with no page,
 * no button, and no human. This is the gate for the thing a visitor actually
 * meets, and it drives ONLY real input — one mouse click on the badge's own
 * button, one real keypress — because every bug worth finding in a UI lives in
 * the gap that a DEV-hook call would have stepped straight over.
 *
 * It asserts four things, and the fourth is the one the whole feature turns on:
 *
 *  1. THE BUTTON EXISTS. `AiBadge` renders its control only when a host passes
 *     onToggle, which on this page meant "never" until stage 5a. A badge with no
 *     affordance is honest, but a brain that exists and cannot be started is a
 *     feature nobody can use.
 *  2. IT PLAYS BY ITSELF. After the click, exchanges grow and rooms get mapped
 *     with NO keystroke from this harness — the commands on screen are the
 *     agent's, not mine.
 *  3. THE KEYBOARD HAS ONE OWNER. While it drives, the input field is disabled,
 *     so no human keystroke can land inside the half-typed word the machine is
 *     waiting for.
 *  4. THE HUMAN WINS. One real keypress must end the agent's turn, hand the
 *     field back, and say so on screen. An agent that cannot be interrupted is a
 *     broken feature however well it plays the game.
 *
 *   npm run zorkuicheck          (needs `npm run dev` running)
 */
import { launch, requireDevServer, Report, opt } from './lib/harness.mjs'

const URL = opt(process.argv.slice(2), '--url', 'http://localhost:5173/retrogames/zork')
const PLAY_MS = Number(opt(process.argv.slice(2), '--play', 12000))

const sleep = (ms) => new Promise(res => setTimeout(res, ms))
async function until(fn, ms = 20000, arg = null) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if (await fn(arg)) return true } catch { /* page not ready */ }
    await sleep(200)
  }
  return false
}

await requireDevServer(URL)
const browser = await launch()
const r = new Report('zorkuicheck')
const errors = []
const page = await browser.newPage()
page.on('pageerror', (e) => errors.push(String(e.message || e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
  const booted = await until(() => page.evaluate(() => !!window.__zorkTest?.ready?.()), 60000)
  r.check('Zork boots in the browser', booted, errors.slice(0, 1).join(' | '))
  await until(() => page.evaluate(() => window.__zorkTest.state().inputEnabled), 60000)

  // 1 ─ the affordance itself, in the DOM, clickable by a person.
  const hasButton = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    return btns.some((b) => /play|ai|▶/i.test(b.textContent || ''))
  })
  r.check('the AI button EXISTS on the page (no dead badge, no invisible brain)', hasButton,
    hasButton ? '' : 'no button matching /play|ai|▶/ — stage 5a did not render')

  const sensing = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  r.check('the strip says which sensor it is using', /SENSING|ARM/.test(sensing) && !/NOT IMPLEMENTED/.test(sensing),
    (sensing.match(/(SENSING|ARM)[^|]{0,40}/) || ['none found'])[0])

  const before = await page.evaluate(() => window.__zorkTest.state().exchanges)

  // 2 ─ one click. Not `aiStart()`: the click is the feature.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /play|ai|▶/i.test(x.textContent || ''))
    b.click()
  })
  const drove = await until(() => page.evaluate((n) => window.__zorkTest.state().exchanges > n + 1, before), 20000)
  const mid = await page.evaluate(() => window.__zorkTest.state())
  r.check('one click and it plays BY ITSELF', drove, `exchanges ${before} -> ${mid.exchanges}, room="${mid.room}"`)
  // Explored, not just started. The first version counted rooms the instant an
  // exchange appeared and read 1 — the same mistake as a "it can drive" test that
  // watches the key turn instead of the car move. Poll for ground, and be
  // impatient only about the FLOOR: 3 rooms in a browser where the agent types
  // one verb per 600ms, which is why PLAY_MS is the outer budget.
  const spread = await until(() => page.evaluate(() => window.__zorkTest.aiRooms() >= 3), PLAY_MS)
  const rooms = await page.evaluate(() => window.__zorkTest.aiRooms())
  const seen = await page.evaluate(() => window.__zorkTest.exchanges().slice(-6).map((e) => e.command).join(' · '))
  r.check('it maps real ground in the browser, not only in Node', spread, `${rooms} rooms · last verbs: ${seen}`)

  // 3 ─ one keyboard, one owner.
  const muted = await page.evaluate(() => {
    const i = document.querySelector('input[type=text]')
    return !!(i && i.disabled)
  })
  r.check('the human cannot interleave while it drives (input disabled)', muted,
    muted ? '' : 'the text field is live while the agent types — keystrokes could land mid-word')
  const aiLive = await page.evaluate(() => window.__zorkTest.aiRunning())
  r.check('the loop reports itself as running', aiLive)

  // 4 ─ the human wins. One real key, no DEV hook involved.
  await page.keyboard.press('a')
  const handed = await until(() => page.evaluate(() => !window.__zorkTest.aiRunning()), 5000)
  // The field only becomes usable once the machine is ALSO done replying, so poll
  // rather than assert immediately — otherwise this check fails for a reason that
  // has nothing to do with arbitration.
  const freed = await until(() => page.evaluate(() => {
    const i = document.querySelector('input[type=text]')
    return !!window.__zorkTest.state().inputEnabled && i && !i.disabled
  }), 8000)
  const after = await page.evaluate(() => ({
    running: window.__zorkTest.aiRunning(),
    enabled: (() => { const i = document.querySelector('input[type=text]'); return i ? !i.disabled : false })(),
    said: document.body.innerText.replace(/\s+/g, ' ').match(/keyboard is yours|stopped[^\n]{0,40}/i)?.[0] || '',
  }))
  r.check('ONE KEY takes the keyboard back', handed && !after.running, `running=${after.running}`)
  r.check('the input is live again for the human', freed && after.enabled, `enabled=${after.enabled}`)
  r.check('it says what happened, on screen', /keyboard|stopped/i.test(after.said), after.said || 'nothing printed')

  // And the takeover must be permanent-until-asked, not a pause that resumes.
  await sleep(1500)
  const crept = await page.evaluate(() => window.__zorkTest.aiRunning())
  r.check('it does NOT creep back after being interrupted', !crept, crept ? 'the agent resumed on its own' : '')

  r.check('no page errors across the whole session', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (e) {
  r.check('session survived', false, e.message)
} finally {
  // r.exit() closes it
}

r.exit()
