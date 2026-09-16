// prodsmoke — the checks in this repo all run against `npm run dev`, which means
// the *thing that actually ships* has never been tested. That gap is not
// theoretical: stage 0 changed how the emulator loads (js-dos moved out of
// index.html into an on-demand loader), and the dev server and the production
// bundle resolve `/retrogames/...` differently — which is precisely how "broken
// in dev, fine in prod" survived for months in the other direction.
//
// So this drives the PRODUCTION build. Two consequences of that, both honest:
//
//   * The DEV hooks (`__kqTest`, `__zorkTest`, `__keepTest`, `__marioTest`) do
//     not exist here — they are gated on `import.meta.env.DEV`. So nothing here
//     peeks at state. Evidence is what a visitor can see: did a canvas appear,
//     does it contain lit pixels, does the text change when you type, does the
//     frame change when you press a real key.
//   * `window.Dos` is expected to be *absent* on non-DOS titles. That is the
//     point of the on-demand loader: Pong and Mario must not download a 300 KB
//     emulator plus 1.4 MB of wasm.
//
// One more honesty note, learned the hard way while writing the first version of
// this file in /tmp: I "measured" the IronKeep agent getting stuck there and it
// was noise — IronKeep has no agent at all (its `AI` is the enemy pathfinding
// grid), so a probe that presses keys and calls any change "the agent" will
// always find a story. Every assertion below is tied to a specific, named
// affordance or channel, and the non-DOS titles assert only that the page draws
// and that js-dos stayed out of it.
//
// Prereq: `npm run build && npm run preview` (or just `npm run prodsmoke`,
// which does both).
//
// Usage:
//   npm run prodsmoke
//   node scripts/prodsmoke.mjs [--url http://localhost:4173/retrogames] [--only kingsquest]

import { spawn } from 'node:child_process'
import { opt, launch, Report } from './lib/harness.mjs'

const args = process.argv.slice(2)
const BASE = opt(args, '--url', process.env.PROD_URL || 'http://localhost:4173/retrogames')
const only = opt(args, '--only', null)

// ── boot the production build ourselves, so this is one command ─────────────
let preview = null
async function reachable() {
  try {
    const r = await fetch(`${BASE}/mario`, { signal: AbortSignal.timeout(2500) })
    return r.ok
  } catch { return false }
}
if (!(await reachable())) {
  console.log('  building + previewing the production bundle (one time) …')
  spawn('npm', ['run', 'build'], { stdio: 'ignore', shell: true }).on('exit', () => {
    preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'],
      { stdio: 'ignore', shell: true })
  })
  for (let i = 0; i < 90 && !(await reachable()); i++) await new Promise(r => setTimeout(r, 1000))
}
if (!(await reachable())) {
  console.error(`prodsmoke: nothing serving the production build at ${BASE}\n` +
    '             run `npm run build && npm run preview` first.')
  process.exit(1)
}

const browser = await launch()
const r = new Report('prodsmoke')

const TITLES = [
  { game: 'mario', kind: 'canvas' },
  { game: 'ironkeep', kind: 'canvas' },
  { game: 'defender', kind: 'canvas' },
  { game: 'rogue', kind: 'text' },        // ncurses-in-dos? no — Rogue is a DOM/grid title
  { game: 'zork', kind: 'text' },
  { game: 'kingsquest', kind: 'dos' },
  { game: 'ultima1', kind: 'dos' },
]
const DOS = new Set(['kingsquest', 'ultima1'])
const list = only ? TITLES.filter(t => t.game === only) : TITLES

async function sample(page, w = 24, h = 16) {
  return page.evaluate(([w, h]) => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const t = document.createElement('canvas')
    t.width = w; t.height = h
    const x = t.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingEnabled = false
    x.drawImage(c, 0, 0, w, h)
    const d = x.getImageData(0, 0, w, h).data
    let lit = 0
    let h32 = 0
    for (let i = 0; i < d.length; i += 4) {
      const luma = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
      if (luma > 24) lit++
      h32 = ((h32 << 5) - h32 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0
    }
    return { w: c.width, h: c.height, lit: +(lit / (w * h)).toFixed(3), hash: (h32 >>> 0).toString(16) }
  }, [w, h])
}

const waitPainted = (page, secs) => page.waitForFunction(() => {
  const c = document.querySelector('canvas')
  if (!c) return false
  const t = document.createElement('canvas')
  t.width = 24; t.height = 16
  const x = t.getContext('2d', { willReadFrequently: true })
  x.imageSmoothingEnabled = false
  x.drawImage(c, 0, 0, 24, 16)
  const d = x.getImageData(0, 0, 24, 16).data
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 40) return true
  return false
}, null, { timeout: secs * 1000 }).then(() => true).catch(() => false)

for (const { game, kind } of list) {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // Record what the page actually fetched — real evidence, no product hooks.
  const fetched = []
  page.on('request', (req) => { if (/js-dos|wdosbox/i.test(req.url())) fetched.push(req.url()) })

  let status = 0
  try {
    const resp = await page.goto(`${BASE}/${game}`, { waitUntil: 'load' })
    status = resp ? resp.status() : 0
  } catch { status = 0 }
  r.check(`${game}: route serves the production bundle`, status === 200, `HTTP ${status}`)
  if (status !== 200) { await page.close(); continue }

  // Which bundle did the page actually pull? This is the whole point of the
  // on-demand loader, and it is only checkable in the PRODUCTION bundle — under
  // `npm run dev` Vite serves whatever you ask for, which is how the old
  // double-base URL bug hid.
  if (DOS.has(game)) {
    const loaded = await page.waitForFunction(() => typeof window.Dos === 'function', null, { timeout: 60000 })
      .then(() => true).catch(() => false)
    r.check(`${game}: js-dos loaded on demand for a DOS title`, loaded,
      `window.Dos=${loaded ? 'function' : 'undefined'} (${fetched.length} emulator request${fetched.length === 1 ? '' : 's'})`)
    // The base-path rule from AGENTS.md: the emulator must be fetched under
    // /retrogames/, exactly once. Doubling it is the bug that broke every DOS
    // title in dev, and prod is the only place the real resolution is visible.
    const paths = fetched.map(u => u.replace(/^https?:\/\/[^/]+/, ''))
    const jsdos = paths.filter(u => /js-dos\.js/.test(u))
    r.check(`${game}: emulator fetched exactly once, under the /retrogames base`,
      jsdos.length === 1 && jsdos[0].startsWith('/retrogames/') && !/retrogames\/retrogames/.test(jsdos[0]),
      jsdos.join(', ') || '(never fetched)')
  } else {
    const srcs = await page.evaluate(() => [...document.querySelectorAll('script[src]')]
      .map(x => x.getAttribute('src')).filter(x => /js-dos|wdosbox/i.test(x)))
    r.check(`${game}: did NOT download an emulator it cannot use`, srcs.length === 0, srcs[0] || 'no js-dos request')
  }

  if (kind === 'text') {
    await page.waitForTimeout(5000)
    const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
    r.check(`${game}: the story/screen is on screen`, text.length > 80, `${text.length} chars: "${text.slice(0, 60)}…"`)
    if (game === 'zork') {
      // Assert the CONTRACT, not a chosen future. The first version of this
      // required `north` to reply with "path/trees/house" and went red on a run
      // where the story answered "The way is blocked" — a perfectly legal Zork
      // reply from a different starting state. So: the typed command must be
      // echoed back and answered by the VM (that is the production-only thing
      // worth proving here: Glk, the input path and the .z3 fetch all work in a
      // built bundle with no DEV hooks), and `look` must produce a description.
      const input = await page.$('input')
      if (!input) {
        r.check('zork: an input box exists', false, 'no <input> found')
      } else {
        const before = text
        await input.click()
        await input.type('north\n')
        await page.waitForTimeout(2200)
        const mid = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
        r.check('zork: typed command reached the VM and was echoed',
          // NB `before` is the transcript STRING. The first version compared
          // `mid.length > before` — number vs string, always false — so this
          // check failed on runs where the VM had answered perfectly well.
          // A check that can only fail for the wrong reason is worse than none.
          mid.length > before.length && />\s*north/i.test(mid), `${before.length} → ${mid.length} chars`)
        r.info('zork: the story said', mid.slice(mid.toLowerCase().lastIndexOf('> north') + 7, mid.length).slice(0, 90))

        await input.type('look\n')
        await page.waitForTimeout(2200)
        const after = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ')
        r.check('zork: LOOK describes a room (the VM is really simulating)',
          /you are|you see|it is/i.test(after) && after.length > mid.length, `${after.length} chars`)
      }
    }
  } else {
    const painted = await waitPainted(page, kind === 'dos' ? 180 : 30)
    // Best of several samples: DOSBox fades through black between screens, so a
    // single read at an arbitrary moment can legitimately be ~0 (Ultima I's
    // title sits at 0.016). Retry rather than round the threshold down.
    let s = null
    for (let i = 0; i < (kind === 'dos' ? 8 : 2); i++) {
      const one = await sample(page)
      if (one && (!s || one.lit > s.lit)) s = one
      if (s && s.lit > 0.05) break
      await page.waitForTimeout(900)
    }
    r.check(`${game}: canvas is drawn AND readable (not composited-and-cleared)`,
      painted && !!s && s.lit > 0.01, s ? `lit=${s.lit} ${s.w}x${s.h}` : 'no canvas')

    if (game === 'kingsquest' && painted) {
      // Real events only: focus the emulator the way a player does, then press.
      const box = await (await page.$('canvas'))?.boundingBox?.().catch(() => null)
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7)
        await page.waitForTimeout(1000)
      }
      const a = await sample(page, 40, 25)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(3000)
      const b = await sample(page, 40, 25)
      r.check('kingsquest: a real ESC advances past the AGI box in production',
        !!a && !!b && a.hash !== b.hash, `${a && a.hash} → ${b && b.hash} (lit ${a && a.lit} → ${b && b.lit})`)
      const before = (await sample(page, 40, 25))?.hash
      for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700) }
      const c = await sample(page, 40, 25)
      r.check('kingsquest: real arrows move Graham in production', !!c && c.hash !== before, `${before} → ${c && c.hash}`)
    }
  }

  r.check(`${game}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await page.close()
}

await browser.close()
if (preview) preview.kill()
r.exit()
