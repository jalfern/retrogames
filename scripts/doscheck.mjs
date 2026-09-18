// doscheck — the seams every DOS title depends on, asserted instead of assumed.
//
// Stage 0 of docs/archive/qwen-run-2026-09/AI-PLAN.md was supposed to be "purge the dead AI, add hooks". It
// found four live bugs instead, all invisible because no check in this repo had
// ever opened a DOS title:
//
//  1. js-dos 404'd in `npm run dev`. index.html hard-required
//     /retrogames/js-dos/js-dos.js; Vite prepends the base to absolute URLs in
//     index.html, so the dev server was asked for /retrogames/retrogames/... ,
//     the SPA fallback answered with index.html at status 200 (so nothing
//     looked wrong), and window.Dos stayed undefined. King's Quest and Ultima
//     I-V all rendered "DOSBox emulator failed to load" in dev while working in
//     production — which is why nobody noticed. Fixed by loading js-dos on
//     demand from utils/jsdos.js, which also stops Pong downloading an emulator.
//
//  2. The keyboard capture captured nothing. The old code patched
//     HTMLCanvasElement.prototype.addEventListener, but js-dos 8 registers
//     keydown/keyup on **window** — verified by instrumenting a live boot. The
//     "call the emulator's handler directly" path therefore never existed, and
//     every press fell through to a DOM dispatch needing a user gesture: an AI
//     loop could never press a key.
//
//  3. The canvas could not be read. js-dos draws with WebGL without
//     preserveDrawingBuffer, so the buffer is cleared after compositing: the
//     game looks perfect while drawImage / getImageData / toDataURL all return
//     solid black (measured: 0 lit pixels of 64,000 on the very canvas an
//     element screenshot showed rendering the intro). The entire `eye` sensor
//     arm — OCR, sprite match, screen fingerprints — was impossible until
//     utils/jsdos.js forces the flag on before the emulator asks for a context.
//
//  4. An unmoving frame is not a broken actuator. King's Quest sits on the AGI
//     copy-protection box "Cracked Version !!! Weiter mit ESC", where arrows do
//     nothing by design and only ESC advances. That single fact wasted a
//     debugging session, so the check presses ESC *first* and only then walks.
//
// Slow on purpose: DOSBox-in-wasm boots at 40-90 s headless, so everything
// below polls for a condition instead of sleeping a guessed number.
//
// Usage:
//   npm run doscheck
//   node scripts/doscheck.mjs [--boot 200] [--quick]   (--quick = kingsquest only)

import { opt, requireDevServer, launch, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const base = (process.env.DOS_URL || URL_DEFAULT).replace(/\/mario.*$/, '')
// DOSBox-in-wasm under software GL (`--use-gl=swiftshader`) boots at 40-150 s and
// the variance is large, so patience is a feature. Measure the worst case with
// --verbose-info below; if a title needs more than this, that is a real finding.
const bootTimeout = Number(opt(args, '--boot', 300))      // seconds
const quick = !!opt(args, '--quick', false)
const games = quick ? ['zork', 'kingsquest'] : ['zork', 'kingsquest', 'ultima1', 'mario']

await requireDevServer(`${base}/kingsquest`)
const browser = await launch()
const r = new Report('doscheck')

const ESC = 27

const until = (page, fn, secs, arg) =>
  page.waitForFunction(fn, arg, { timeout: secs * 1000 }).then(() => true).catch(() => false)

/**
 * Best frame seen over several samples. AGI fades to black between screens, so
 * one sample at an arbitrary moment can legitimately be all black — a single
 * read would call that a broken sensor. (And a sensor that is only sometimes
 * right is the exact failure mode this repo cannot afford: the Mario `?`-block
 * rule aimed one tile early and so missed the fire flower every single run.)
 */
async function bestFrame(page, tries = 6, gapMs = 700) {
  let best = null
  for (let i = 0; i < tries; i++) {
    const f = await frameOf(page)
    if (f && (!best || f.lit > best.lit)) best = f
    if (best && best.lit > 0.15) break
    await page.waitForTimeout(gapMs)
  }
  return best
}

/** lit-pixel fraction of the emulator's framebuffer, read in-page. */
const frameOf = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return null
  const t = document.createElement('canvas')
  t.width = 32; t.height = 20
  const x = t.getContext('2d', { willReadFrequently: true })
  x.imageSmoothingEnabled = false
  x.drawImage(c, 0, 0, 32, 20)
  const d = x.getImageData(0, 0, 32, 20).data
  let lit = 0
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 > 24) lit++
  }
  return { w: c.width, h: c.height, lit: +(lit / 640).toFixed(3) }
})

const hasHook = (page) => until(page, () => !!window.__kqTest, 25)

for (const game of games) {
  const page = await browser.newPage({ viewport: { width: 820, height: 640 } })
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  r.info('────', game)
  const t0 = Date.now()
  await page.goto(`${base}/${game}`, { waitUntil: 'load' })

  if (game === 'zork') {
    // The browser half of the Zork agent: zorkcheck.mjs proves the brain works in
    // Node, this proves the GlkAdapter + DEV hook the player actually gets.
    const ok = await until(page, () => !!window.__zorkTest, 40)
    r.check('zork: __zorkTest hook exists', ok, errors.slice(0, 1).join(' | '))
    if (ok) {
      // send() resolves when the VM is resumed; the reply lands a beat later,
      // so wait for the transcript to grow rather than racing it.
      const before = await page.evaluate(() => window.__zorkTest.state().lines)
      await page.evaluate(() => window.__zorkTest.send('north'))
      const grew = await until(page, (n) => window.__zorkTest.state().lines > n, 20, before)
      const state = await page.evaluate(() => window.__zorkTest.state())
      const arm = await page.evaluate(() => window.__zorkTest.arm())
      r.check('zork: a command round-trips through GlkAdapter', grew, `lines ${before} -> ${state.lines} verdict=${state.verdict}`)
      r.check('zork: the sensor read the reply', state.verdict === 'moved' && /House/.test(state.room || ''), JSON.stringify({ room: state.room, conf: state.roomConf, verdict: state.verdict }))
      r.check('zork: an arm is selected and reported', ['transcript', 'eye', 'ram', 'hybrid'].includes(arm), `arm=${arm}`)
      // No in-page bot assertion here on purpose: the browser Zork has no brain
      // mounted yet (stage 2). scripts/zorkcheck.mjs drives the real agent, in
      // Node, through the same skill library -- and it also has to survive the
      // player typing while the bot is mid-sentence, which the browser cannot
      // freeze. Keep the two checks honest about what each one covers.
    }
    await page.close()
    continue
  }

  if (game === 'mario') {
    // js-dos is loaded on demand now, so the games that never needed it must
    // not be pulling in a ~300 KB emulator (and 1.4 MB of wasm) any more.
    await page.waitForFunction(() => !!window.__marioTest, null, { timeout: 20000 }).catch(() => {})
    const dos = await page.evaluate(() => typeof window.Dos)
    const hook = await page.evaluate(() => !!window.__marioTest)
    r.check('mario renders without js-dos', hook && dos === 'undefined', `__marioTest=${hook} window.Dos=${dos}`)
    await page.close()
    continue
  }

  const hooked = await hasHook(page)
  if (hooked && game === 'kingsquest') {
    // Honesty gate. The badge must not advertise a sense the title does not
    // have: King's Quest declares `sensors: []` until stage 3 puts an eye in
    // it, so the strip has to read NOT IMPLEMENTED. The previous AI on this page
    // showed a working-looking button for a backend that had been offline for
    // months — that regression gets a check, not a comment.
    const label = await page.evaluate(() => (document.body.innerText.match(/SENSING:[^\n]*/) || ['(none)'])[0])
    r.check('kingsquest: badge refuses to claim a sensor it lacks', /NOT IMPLEMENTED/.test(label), label)
  }
  if (hooked) {
    const wiringSeen = await until(page, () => window.__kqTest.keysDebug().captured, bootTimeout)
    const wiring = await page.evaluate(() => window.__kqTest.keysDebug())
    r.check(`${game}: keyboard handler captured (window, not canvas)`, wiringSeen, JSON.stringify(wiring))
  } else if (game === 'kingsquest') {
    r.check(`${game}: __kqTest hook exists`, false, errors.slice(0, 2).join(' | '))
  } else {
    r.info(`${game}: no __kqTest hook (only King's Quest has the DOS hook yet)`)
  }

  // The canvas appears a beat after mount; the frame a good deal later.
  let drew = await until(page, () => {
    const c = document.querySelector('canvas')
    if (!c) return false
    const t = document.createElement('canvas')
    t.width = 32; t.height = 20
    const x = t.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingEnabled = false
    x.drawImage(c, 0, 0, 32, 20)
    const d = x.getImageData(0, 0, 32, 20).data
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 > 24) return true
    }
    return false
  }, Math.round(bootTimeout / 2))

  if (!drew) {
    // Half the budget gone with nothing painted. DOSBox-in-wasm under software GL
    // sometimes sits at "zero lit pixels" until something unlocks audio / focus —
    // exactly the click a human player always gives it. So give it the click and
    // the other half of the budget. This is NOT a weakened assertion: the frame
    // still has to arrive, and the reason for the nudge is reported, so a real
    // regression still fails and a flake still leaves a trace in the log.
    const box = await (await page.$('canvas'))?.boundingBox?.().catch(() => null)
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.evaluate(() => window.__kqTest?.focus())
    r.info(`${game}: nothing painted after ${Math.round(bootTimeout / 2)}s — clicked the canvas and kept waiting`)
    drew = await until(page, () => {
      const c = document.querySelector('canvas')
      if (!c) return false
      const t = document.createElement('canvas')
      t.width = 32; t.height = 20
      const x = t.getContext('2d', { willReadFrequently: true })
      x.imageSmoothingEnabled = false
      x.drawImage(c, 0, 0, 32, 20)
      const d = x.getImageData(0, 0, 32, 20).data
      for (let i = 0; i < d.length; i += 4) {
        if ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 > 24) return true
      }
      return false
    }, Math.round(bootTimeout / 2))
  }

  const frame = await bestFrame(page)
  const secs = Math.round((Date.now() - t0) / 1000)
  r.check(`${game}: framebuffer readable (WebGL preserveDrawingBuffer)`, !!frame && frame.lit > 0.02,
    frame ? `lit=${frame.lit} ${frame.w}x${frame.h} after ${secs}s` : `never drew within ${bootTimeout}s`)

  if (!frame || frame.lit <= 0) {
    const st = await page.evaluate(() => (window.__kqTest ? window.__kqTest.state() : null))
    r.check(`${game}: booted without error`, false, `state=${JSON.stringify(st)} errors=${errors.slice(0, 1).join('')}`)
    await page.close()
    continue
  }

  if (game === 'kingsquest' && hooked) {
    // ESC first — the AGI copy-protection box ignores everything else.
    const before = await page.evaluate(() => window.__kqTest.print().hash)
    await page.evaluate(() => { window.__kqTest.focus(); window.__kqTest.press({ keyCode: 27 }) })
    await page.waitForTimeout(3500)
    const afterEsc = await page.evaluate(() => window.__kqTest.print().hash)
    r.check('kingsquest: injected ESC advanced past the copy-protection box', before !== afterEsc, `${before} -> ${afterEsc}`)

    await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__kqTest.arrow('right') })
    await page.waitForTimeout(3000)
    const afterWalk = await page.evaluate(() => window.__kqTest.print().hash)
    r.check('kingsquest: injected arrows moved Graham', afterEsc !== afterWalk, `${afterEsc} -> ${afterWalk}`)

    const scene = await bestFrame(page)
    r.check('kingsquest: a real scene is on screen', !!scene && scene.lit > 0.15, JSON.stringify(scene))
  }

  r.check(`${game}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await page.close()
}

await browser.close()
r.exit()
