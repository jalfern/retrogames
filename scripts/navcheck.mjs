// NAVCHECK — the phone escape hatch (#437), proven in three browser-free layers
// plus an opt-in real-Chrome drive.
//
//   npm run navcheck              # static layers, runs in seconds
//   npm run navcheck -- --browser # + real Chrome against `npm run dev`
//
// The bug: installed fullscreen (no address bar), a phone player landed on a
// random game with no '?' key — no pause, no way back. The fix is three files:
// manifest start_url -> /retrogames/games, the GameChrome ARCADE/PAUSE corner
// buttons on every game route, and a service-worker version bump so no installed
// app reboots into a stale manifest or start page. This check fails if any of
// the three rot, or if the synthetic '?' stops satisfying either pause dialect.

import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { launch, opt } from './lib/harness.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

// --- layer A: the PWA files on disk ------------------------------------
const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8'))
ok(manifest.start_url === '/retrogames/games', `manifest start_url is the showcase (${manifest.start_url})`)
ok(manifest.scope === '/retrogames/', `manifest scope still covers the arcade (${manifest.scope})`)
ok(manifest.start_url.startsWith(manifest.scope), 'start_url is inside scope (or iOS will not launch in-app)')
const sw = readFileSync(join(root, 'public', 'sw.js'), 'utf8')
ok(/VERSION = 'retrogames-v[2-9]'/.test(sw), 'sw.js VERSION bumped past v1 (old manifest/start caches die on activate)')

// --- layer B: the shared chrome renders on games and nowhere else -----
// Stub every game component (same trick as builtbycheck): the registry imports
// 44 browsers' worth of engines this check has no business loading.
const STUB = join(root, 'node_modules', '.navcheck-stub.cjs')
writeFileSync(STUB, `module.exports = new Proxy({}, { get: () => () => null })\n`)

async function bundle(entrySrc, outfile) {
    const src = join(root, 'node_modules', outfile + '.src.jsx')
    writeFileSync(src, entrySrc)
    const out = join(root, 'node_modules', outfile)
    await build({
        entryPoints: [src],
        absWorkingDir: root,
        outfile: out,
        bundle: true,
        format: 'esm',
        platform: 'node',
        jsx: 'automatic',
        banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
        logLevel: 'silent',
        plugins: [{
            name: 'stub-games',
            setup(b) {
                b.onResolve({ filter: /(^|\.\.\/)games\// }, () => ({ path: STUB, external: false }))
                b.onResolve({ filter: /^\.\/games\// }, () => ({ path: STUB, external: false }))
            },
        }],
    })
    return pathToFileURL(out).href
}

const B = await bundle(`
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import GameChrome from ${JSON.stringify(join(root, 'src', 'components', 'GameChrome.jsx'))}
export const render = (path) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><GameChrome /></MemoryRouter>)
`, '.navcheck-B.mjs')
const { render } = await import(B)

const GAME_ROUTES = ['/', '/mario', '/mario-classic', '/pong', '/tetris', '/raccoon-heist']
for (const path of GAME_ROUTES) {
    const html = render(path)
    ok((html.match(/data-nav="arcade"/g) || []).length === 1, `${path}: exactly one ARCADE button`)
    ok((html.match(/data-nav="pause"/g) || []).length === 1, `${path}: exactly one PAUSE button`)
}
for (const path of ['/games', '/games-classic', '/games-v2', '/forge']) {
    const html = render(path)
    ok(!html.includes('data-nav='), `${path}: no chrome buttons (not a game)`)
}

// --- layer C: the synthetic '?' speaks both pause dialects -------------
globalThis.window = new EventTarget()
globalThis.KeyboardEvent = class KeyboardEvent extends Event {
    constructor(type, init = {}) {
        super(type, init)
        this.key = init.key
        this.code = init.code
        this.shiftKey = !!init.shiftKey
    }
}
const C = await bundle(`
import { dispatchPause, PAUSE_EVENT_PROPS } from ${JSON.stringify(join(root, 'src', 'utils', 'pauseEvent.js'))}
export { dispatchPause, PAUSE_EVENT_PROPS }
`, '.navcheck-C.mjs')
const { dispatchPause, PAUSE_EVENT_PROPS } = await import(C)
ok(PAUSE_EVENT_PROPS.key === '?', 'PAUSE_EVENT_PROPS carries key "?"')
const seen = []
window.addEventListener('keydown', (e) => seen.push(e))
dispatchPause()
ok(seen.length === 1, `one keydown on window (${seen.length})`)
const e = seen[0] || {}
ok((e.key === '?') || (e.shiftKey && e.key === '/'), 'dialect A (24 games: e.key === "?")')
const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
ok(code === 'Question', 'dialect B (QBert/Zelda/Joust…: shifted Slash → "Question")')

console.log(`navcheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  FAIL  ${f}`)

// --- layer D (opt-in): real Chrome, real taps, zero page errors --------
if (process.argv.includes('--browser')) {
    const base = String(opt(process.argv, '--url', `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`))
    try {
        const res = await fetch(`${base}/pong`, { signal: AbortSignal.timeout(2000) })
        if (!res.ok) throw new Error(String(res.status))
    } catch {
        console.error(`FAIL  no dev server at ${base} — run \`npm run dev\` (--browser layer needs it)`)
        process.exit(1)
    }
    const browser = await launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    const txt = () => page.evaluate(() => document.body.innerText)

    await page.goto(`${base}/pong`, { waitUntil: 'load' })
    await page.waitForSelector('[data-nav="pause"]')
    ok((await page.$$('[data-nav="pause"]')).length === 1, 'chrome: one PAUSE on the live page')
    ok((await page.$$('[data-nav="arcade"]')).length === 1, 'chrome: one ARCADE on the live page')
    const box = await (await page.$('[data-nav="pause"]')).boundingBox()
    ok(box.y < 100, `PAUSE sits in the top corner (y=${Math.round(box.y)})`)

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForFunction(() => document.body.innerText.includes('RESUME GAME'))
    ok((await txt()).includes('RESUME GAME'), 'tap PAUSE opens the game pause overlay')
    const box2 = await (await page.$('[data-nav="pause"]')).boundingBox()
    await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2)
    await page.waitForFunction(() => !document.body.innerText.includes('RESUME GAME'))
    ok(!(await txt()).includes('RESUME GAME'), 'tap PAUSE again resumes')

    // Mario Original: no '?' on a phone used to be a one-way door; PAUSE returns.
    await page.goto(`${base}/mario-classic`, { waitUntil: 'load' })
    await page.waitForSelector('[data-nav="pause"]')
    await page.tap('[data-nav="pause"]')
    await page.waitForURL((u) => u.pathname === '/retrogames/mario')
    ok(page.url().includes('menu=1'), `PAUSE escapes Mario Original to the Mario menu (${page.url()})`)

    // ARCADE: the way back from anywhere.
    await page.tap('[data-nav="arcade"]')
    await page.waitForURL((u) => u.pathname === '/retrogames/games')
    ok((await txt()).includes('JALFERN'), 'ARCADE lands on the showcase')

    ok(errors.length === 0, `zero page errors (${errors.join(' | ') || 'clean'})`)
    await browser.close()
    console.log(`navcheck (browser layer): ${pass} passed, ${fails.length} failed`)
    for (const f of fails) console.log(`  FAIL  ${f}`)
}

process.exit(fails.length ? 1 : 0)
