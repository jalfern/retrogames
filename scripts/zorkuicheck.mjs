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
 * ─── the clock this file keeps, and why it is not a wall clock ────────────────
 *
 * One CI run went red on checks 2 and 3 ("1 rooms mapped", "the text field is
 * live while the agent types") and a re-run of the same commit was 12/12. That
 * is not the agent being flaky; that is a check that asked the wall "have you
 * had long enough?" on a runner whose speed is not its own. Two rules, both
 * lifted from `heistplay` after it ate ten CI checks the same way:
 *
 *   * **Budgets are in the agent's turns.** The unit of progress in a text
 *     adventure is one command in, one reply out — there is no `__gameTime` to
 *     read because the turn *is* the clock. `untilTurns` waits for rooms while
 *     turns keep arriving, so a machine that manages 0.3 turns/s gets the same
 *     number of commands as one that manages 2, and the wall only ever acts as a
 *     stall detector (no turn at all for `--stall` ms) with a hard cap.
 *   * **A property of a running system is sampled, not glimpsed.** "The input is
 *     disabled while it drives" checked once, one moment after the previous poll,
 *     i.e. at whatever point in the turn cycle the runner happened to be — and on
 *     a busy box that moment was regularly between turns, where the field is
 *     *supposed* to be live. `whileDriving` takes N samples with the loop running
 *     and asserts the property on every one of them, then refuses to report
 *     anything if it could not catch the loop running at least 3 times. A check
 *     that cannot tell "false" from "never looked" is not a check.
 *
 * Reproduce the load instead of arguing with it:
 *
 *   npm run zorkuicheck -- --throttle 32     # a 32x slower CPU, the CI shape
 *   npm run zorkuicheck -- --play 30000      # floor budget, in ms at 1 turn/s-ish
 *
 *   npm run zorkuicheck          (needs `npm run dev` running)
 */
import { launch, requireDevServer, Report, opt, throttleCPU } from './lib/harness.mjs'

const ARGV = process.argv.slice(2)
const URL = opt(ARGV, '--url', 'http://localhost:5173/retrogames/zork')
// A FLOOR, not a deadline: `untilTurns` keeps going while the agent keeps taking
// turns. The number that actually decides is the stall window below.
const PLAY_MS = Number(opt(ARGV, '--play', 12000))
const STALL_MS = Number(opt(ARGV, '--stall', 30000))
const THROTTLE = Number(opt(ARGV, '--throttle', 0))

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
if (THROTTLE) await throttleCPU(page, THROTTLE)

/** Turns per second the page is actually managing, as an EMA. Printed once per wait. */
let rate = 0
const rateLine = () => `${rate.toFixed(2)} turns/s${THROTTLE ? ` @ ${THROTTLE}x throttle` : ''}`

/**
 * Wait for the agent to map `want` rooms, budget measured in ITS OWN turns.
 *
 * Returns `{ ok, rooms, turns, stalled, waited }` and the caller reports all of
 * them, because "1 room" and "1 room after 3 turns in 12 s" are different bug
 * reports — one is the map, the other is the runner.
 */
async function untilRooms(want, { floorMs = PLAY_MS, stallMs = STALL_MS, capMs = 180000 } = {}) {
  const t0 = Date.now()
  let turns = -1, turnAt = Date.now(), out = { ok: false, rooms: 0, turns: 0, stalled: false }
  while (true) {
    let s = null
    try {
      s = await page.evaluate(() => ({
        turns: window.__zorkTest.state().exchanges,
        running: window.__zorkTest.aiRunning(),
      }))
    } catch { /* page not ready */ }
    const now = Date.now()
    if (s) {
      if (s.turns > turns && turns >= 0) {
        const dt = (now - turnAt) / 1000
        if (dt > 0.05) rate = rate ? rate * 0.6 + (1 / dt) * 0.4 : 1 / dt
      }
      if (s.turns !== turns) { turns = s.turns; turnAt = now }
      const map = await page.evaluate(() => window.__zorkTest.aiRooms())
      out = { ...out, rooms: map, turns: s.turns }
      if (map >= want) { out.ok = true; break }
    }
    const waited = Date.now() - t0
    // Never bail inside the floor: at 1 turn/s a three-room walk is ten seconds
    // even on a machine that is perfectly healthy.
    if (waited > Math.max(floorMs, 4000)) {
      if (Date.now() - turnAt > stallMs) { out.stalled = true; break }
      if (waited > capMs) break
    }
    await sleep(250)
  }
  out.waited = Date.now() - t0
  return out
}

/**
 * Sample the arbitration while the loop is running. The property under test is
 * "while IT has the keyboard, you cannot type" — which says nothing at all about
 * the instants between turns, when a live field is correct behaviour.
 */
async function whileDriving(want = 5, maxMs = 30000) {
  const seen = []
  const t0 = Date.now()
  let revived = 0
  while (seen.filter((x) => x.running).length < want && Date.now() - t0 < maxMs) {
    seen.push(await page.evaluate(() => ({
      running: window.__zorkTest.aiRunning(),
      // null = the field is not in the DOM at all (page still mounting)
      live: (() => { const i = document.querySelector('input[type=text]'); return i ? !i.disabled : null })(),
    })))
    // The loop may have finished its budget or tripped its watchdog between the
    // previous check and this one. That is not an arbitration failure, and silently
    // sampling an idle page would report one — so put it back to work, and count it.
    if (!seen[seen.length - 1].running && Date.now() - t0 > 3000 && revived < 2) {
      revived++
      await page.evaluate(() => window.__zorkTest.aiStart())
    }
    await sleep(150)
  }
  return { seen, revived, running: seen.filter((x) => x.running) }
}

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
  // Explored, not just started. Poll for ground, and be impatient only about the
  // FLOOR: the first version counted rooms the instant an exchange appeared and
  // read 1, and its successor demanded 3 rooms inside a fixed 12 s, which is a
  // statement about the runner. Turns decide now (`untilRooms` at the top).
  const spread = await untilRooms(3)
  const rooms = spread.rooms
  // THE SAME GATE `zorkcheck` runs in Node, with the transport a visitor actually
  // gets. In Node the harness hands the sensor one newline-separated reply per
  // command; the browser hands it Glk chunks glued together, which is how the
  // parser came to map 13 rooms in Node and 1 in the page. So the anti-walkthrough
  // rule is asserted HERE too: every object the brain asked for must be a word the
  // GAME printed in an earlier reply of this very session. A noun smuggled in from
  // a walkthrough — or from the harness's own script — is a red build here, where
  // it would otherwise be invisible.
  const lastVerbs = await page.evaluate(() => window.__zorkTest.exchanges().slice(-6).map((e) => e.command).join(' · '))
  r.info(`agent rate`, `${rateLine()} · ${spread.turns} turns in ${(spread.waited / 1000).toFixed(1)} s · last verbs: ${lastVerbs}`)
  // THE SAME ANTI-WALKTHROUGH GATE `zorkcheck` runs in Node, with the transport a
  // visitor actually gets. In Node the harness hands the sensor one newline-separated
  // reply per command; the browser hands it Glk chunks GLUED together, which is how
  // this parser once mapped 13 rooms in Node and 1 in the page. So the rule is
  // asserted here too: every object the brain asked for must be a word the GAME
  // printed earlier in this session.
  //
  // And it waits for the chance to be meaningful. The first version read one snapshot
  // after 12 seconds of play, found one object command, asserted `asked >= 3` and
  // went red — a gate that fails because the agent had not said enough yet is a gate
  // about the clock again. So: keep polling in TURNS until it has asked for three
  // objects or the turns stop arriving, and then report how thin the evidence was.
  const audit = async () => page.evaluate((from) => {
    const all = window.__zorkTest.exchanges(0)
    const corpus = []
    const invented = []
    let asked = 0
    for (let i = 0; i < all.length; i++) {
      const e = all[i]
      const m = /^(?:take|get|turn on|open|light|drop)\s+(.+)$/i.exec(String(e.command).trim())
      // Only the BRAIN'S commands are under suspicion — the boot script is the harness
      // talking, and grading the harness's own vocabulary proves nothing. But every
      // REPLY counts as evidence from exchange zero: a word the game printed before
      // the click is still a word the GAME printed, and excluding it would fail an
      // agent for repeating the world back.
      if (m && i >= from) {
        asked++
        const noun = m[1].toLowerCase()
        if (!corpus.join('\n').toLowerCase().includes(noun)) invented.push(`"${e.command}" — the game never said "${noun}"`)
      }
      corpus.push(String(e.output || ''))
    }
    return { asked, invented, turns: all.length }
  }, before)
  let nouns = await audit()
  const turnFloor = await audit
  let waited = 0
  while (nouns.asked < 3 && waited < 30000) {
    const t0 = nouns.turns
    await page.waitForTimeout(1500)
    waited += 1500
    const again = await audit()
    if (again.turns === t0) break          // no turn arrived: the box is done, not slow
    nouns = again
  }
  void turnFloor
  if (nouns.asked < 3) r.info('thin evidence here', `only ${nouns.asked} object command(s) before the turns ran out — zorkcheck's 95-command gate is the thick one`)
  r.check('every noun it asked for came from the game, not from a walkthrough',
    nouns.invented.length === 0,
    nouns.invented.length ? nouns.invented.slice(0, 3).join(' | ')
      : `${nouns.asked} object commands since the click, ${nouns.turns} replies scanned, none invented`)
  r.check('it maps real ground in the browser, not only in Node', spread.ok,
    spread.stalled
      ? `${rooms} rooms and NO turn for ${STALL_MS / 1000} s — the loop stopped, it was not the box`
      : `${rooms} rooms in ${spread.turns} turns (${(spread.waited / 1000).toFixed(1)} s, ${rateLine()})`)

  // 3 ─ one keyboard, one owner — sampled while it is demonstrably driving.
  const drive = await whileDriving(5)
  const running = drive.running
  const live = running.filter((s) => s.live !== false)
  r.check('the loop was caught driving often enough to judge', running.length >= 3,
    `${running.length}/${drive.seen.length} samples had the loop running${drive.revived ? ` (restarted ${drive.revived}x — its budget ran out, the field being live is then correct)` : ''}`)
  r.check('the human cannot interleave while it drives (input disabled)', running.length >= 3 && live.length === 0,
    live.length ? `${live.length} of ${running.length} running samples had a live field — a keystroke could land mid-word`
      : `${running.length} running samples, field disabled in all of them`)

  // 4 ─ the human wins. One real key, no DEV hook involved. If the loop had
  // already stopped on its own, the key would be pressing into an idle page and
  // the check would pass having tested nothing — so put it back to work first,
  // with the same PLAY a person would press, and say that we did. Real input only:
  // reviving through `aiStart()` could itself be the thing no visitor ever does.
  let restarts = 0
  if (!(await page.evaluate(() => window.__zorkTest.aiRunning()))) {
    restarts = 1
    await clickPlay()
    await until(() => page.evaluate(() => window.__zorkTest.aiRunning()), 15000)
  }
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
  r.check('ONE KEY takes the keyboard back', handed && !after.running,
    `running=${after.running}${restarts ? ', after restarting the agent so the key interrupted something' : ''}`)
  r.check('the input is live again for the human', freed && after.enabled, `enabled=${after.enabled}`)
  r.check('it says what happened, on screen', /keyboard|stopped/i.test(after.said), after.said || 'nothing printed')

  // And the takeover must be permanent-until-asked, not a pause that resumes.
  // "A while" is three of the AGENT's turns: on a throttled box 1500 ms of wall
  // is a tenth of a turn, and an agent that crept back in that window could not
  // have done anything about it either way.
  await sleep(Math.max(1500, Math.min(20000, 3000 / Math.max(0.15, rate))))
  const crept = await page.evaluate(() => window.__zorkTest.aiRunning())
  r.check('it does NOT creep back after being interrupted', !crept, crept ? 'the agent resumed on its own' : '')

  r.check('no page errors across the whole session', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (e) {
  r.check('session survived', false, e.message)
} finally {
  // r.exit() closes it
}

r.exit()
