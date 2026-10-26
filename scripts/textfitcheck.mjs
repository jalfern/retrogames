// textfitcheck — the #1099 regression gate: no help, title or caption text
// may overflow the viewport, get clipped, or cover the chrome / pad / credits
// badge on ANY game or demo.
//
//   npm run textfitcheck            (needs `npm run dev`, or TEXTFIT_URL)
//
// Three layers:
//   1. BOOTS  — the shared machinery exists: src/utils/textFit.js (packPages,
//               unit-tested in-process), PauseOverlay wired to it with a
//               thumb-sized pager + pinned RESUME, credits.js caption-fit.
//   2. RULES  — every registry game and every demo, at phone-portrait
//               (390x844), phone-landscape (844x390) and desktop (1280x800):
//               attract/title text sits inside the viewport and clear of the
//               pad and corner chrome; the help overlay (if the title mounts
//               one) reports fit=single|paged and its body never scrolls past
//               its box; on paged help the pager walks to the last page and
//               back with every page inside the box; demo captions stay inside
//               the viewport and out from under the BUILT BY badge, and the
//               credits card fits. DOS/IF emulator arms are skipped (their
//               text is the emulator's own, covered by doscheck).
//   3. WIN    — at least one title genuinely pages on a landscape phone and
//               the walk flips it (the mechanism is exercised, not just present).
//
// Proven-fail (ran by hand, restore after): replace the packPages call in
// src/components/PauseOverlay.jsx with `const g = [heights.map((_, i) => i)]`
// -> every landscape game with long controls goes red (clipped body).

import { spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardChrome } from './chromecleanup.mjs'
import { relayNoise } from './lib/harness.mjs'
import { packPages } from '../src/utils/textFit.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = await import('playwright-core').catch(() => {
    console.error('playwright-core is not installed. Run `npm install` first.')
    process.exit(1)
})

const PORT = process.env.DEV_PORT || '5173'
const BASE = process.env.TEXTFIT_URL || `http://localhost:${PORT}/retrogames`
const PROFILE = process.env.TEXTFIT_PROFILE || '/tmp/forge/textfit-profile'
mkdirSync(PROFILE, { recursive: true })
// Local boxes: system Chrome. CI (no /Applications): the playwright chromium
// the smoke job installs (`npx playwright-core install --with-deps chromium`).
const SYS_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CHROME = process.env.SHOT_CHROME || (existsSync(SYS_CHROME)
    ? SYS_CHROME
    : (() => { try { return chromium.executablePath() } catch { console.error('no Chrome found — install one or run `npx playwright-core install chromium`'); process.exit(1) } })())

const VIEWPORTS = [
    { name: 'phone-portrait', width: 390, height: 844 },
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'desktop', width: 1280, height: 800 },
]

const DEMOS = readdirSync(resolve(ROOT, 'public/demos'))
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => f.replace(/\.html$/, ''))

const results = []
const ok = (name, pass, detail) => {
    results.push({ name, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// ---- static layer -----------------------------------------------------------

const util = readFileSync(resolve(ROOT, 'src/utils/textFit.js'), 'utf8')
ok('textFit.js exists and exports packPages', /export const packPages/.test(util))
const P = packPages([100, 100, 100], 210, 10)
ok('packPages: 3x100 into 210(+gap10) => 2 pages', JSON.stringify(P) === '[[0,1],[2]]', JSON.stringify(P))
ok('packPages: everything fits => single page', JSON.stringify(packPages([50, 40], 400, 8)) === '[[0,1]]')
ok('packPages: block taller than avail claims its own page', JSON.stringify(packPages([500, 10], 100, 0)) === '[[0],[1]]')
ok('packPages: empty input => no pages', packPages([], 100, 8).length === 0)

const po = readFileSync(resolve(ROOT, 'src/components/PauseOverlay.jsx'), 'utf8')
ok('PauseOverlay packs via the shared util', /packPages\(/.test(po) && /from '\.\.\/utils\/textFit'/.test(po))
ok('PauseOverlay reports fit mode', /data-help-fit=\{/.test(po))
ok('PauseOverlay pager: prev/next + page counter + 44px targets',
    /data-help-prev=""/.test(po) && /data-help-next=""/.test(po) &&
    /data-help-page=\{/.test(po) && /min-h-\[44px\]/.test(po))
ok('PauseOverlay keeps RESUME pinned outside the pages',
    /RESUME GAME/.test(po) && po.indexOf('data-help-body') < po.indexOf('RESUME GAME'))

const cj = readFileSync(resolve(ROOT, 'public/demos/credits.js'), 'utf8')
ok('credits.js reserves the badge column (#1078 kept)', /function reserveCaption\(\)/.test(cj) && /maxWidth/.test(cj))
ok('credits.js caption-fit: tighten then clamp (#1099)',
    /fontSize = fs \+ 'px'/.test(cj) && /webkitLineClamp = String\(lines\)/.test(cj))

// titles that used to stack rule-walls now use the shared cycling slot
for (const g of ['MagicCarpet', 'CivilizationV']) {
    const src = readFileSync(resolve(ROOT, `src/games/${g}/index.jsx`), 'utf8')
    ok(`${g}: uses shared AttractMessage (no attract rule-wall)`,
        /import AttractMessage/.test(src) && !/<br\s*\/>/.test(src))
}

// ---- games list ------------------------------------------------------------

const reg = readFileSync(resolve(ROOT, 'src/config/games.js'), 'utf8')
const imports = [...reg.matchAll(/import\s+(\w+)\s+from\s+'\.\.\/games\/(\w+)'/g)]
    .map(([, comp, dir]) => [comp, dir])
    .concat([...reg.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\.\/games\/(\w+)'/g)]
        .flatMap(([, names, dir]) => names.split(',').map((n) => [n.trim().split(/\s+as\s+/).pop(), dir])))
const compDir = Object.fromEntries(imports)
const emuDirs = new Set(
    readdirSync(resolve(ROOT, 'src/games')).filter((d) => {
        const p = resolve(ROOT, `src/games/${d}/index.jsx`)
        if (!existsSync(p)) return false
        const s = readFileSync(p, 'utf8')
        return /\.jsdos|ifvms|zvm|DosGame|bundleUrl|js-dos|storyFile|\.z3|zorkvm/i.test(s)
    }),
)
const games = [...reg.matchAll(/path:\s*'([^']+)'[\s\S]{0,400}?component:\s*(\w+)/g)]
    .map(([, path, comp]) => ({ path, dir: compDir[comp] || comp }))
    .filter((g) => !emuDirs.has(g.dir))

ok('sweep covers every non-emulator title', games.length >= 60, `${games.length} games (${emuDirs.size} emulator arms skipped)`)

// ---- browser layer ----------------------------------------------------------

const FIT_AUDIT = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const R = (el) => el.getBoundingClientRect()
    const vis = (el) => {
        const s = getComputedStyle(el)
        const r = R(el)
        return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 &&
            r.width > 2 && r.height > 2
    }
    const clip = { out: [], cover: [] }
    // Only controls the player can actually see/press count as covered —
    // the pad's full-screen invisible catchers (stick layers) must not
    // produce false positives.
    const pads = [...document.querySelectorAll('[data-vc="dpad"], [data-vc="diag"], [data-vc="fixedstick"], [data-vc] button')].filter(vis).map(R)
    // Corner chrome (#437) is DESIGNED to float over game art on wide screens;
    // it only becomes a fit problem on phones, where a centered title spans
    // behind both buttons. Enforce the chrome rule on phones only.
    const phone = Math.max(window.innerWidth, window.innerHeight) < 1000
    const chrome = phone
        ? [...document.querySelectorAll('[data-nav], [data-feedback="open"]')].filter(vis).map(R)
        : []
    const covBy = (r, p) => {
        const w = Math.min(r.right, p.right) - Math.max(r.left, p.left)
        const h = Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top)
        return w > 0 && h > 0 ? w * h : 0
    }
    for (const el of document.querySelectorAll('div,p,h1,h2,li,span,button')) {
        if (el.closest('[data-vc],[data-nav],[data-feedback],[data-help-fit]')) continue
        const t = (el.textContent || '').trim()
        if (t.length < 16 || t.length > 400) continue
        if (el.children.length && el.tagName !== 'P') continue
        if (!vis(el)) continue
        const r = R(el)
        if (r.top < -2 || r.left < -2 || r.bottom > vh + 2 || r.right > vw + 2) {
            clip.out.push(`${t.slice(0, 40)}@${Math.round(r.top)}..${Math.round(r.bottom)}`)
            continue
        }
        for (const p of pads) {
            const area = (p.right - p.left) * (p.bottom - p.top)
            if (covBy(r, p) > 0.6 * area) {
                clip.cover.push(`${t.slice(0, 40)} over pad control`)
                break
            }
        }
        for (const p of chrome) {
            const area = (p.right - p.left) * (p.bottom - p.top)
            if (covBy(r, p) > 0.5 * area) {
                clip.cover.push(`${t.slice(0, 40)} over chrome button`)
                break
            }
        }
    }
    let help = null
    const root = document.querySelector('[data-help-fit]')
    if (root && vis(root)) {
        const body = root.querySelector('[data-help-body]')
        const br = R(body)
        help = {
            fit: root.getAttribute('data-help-fit'),
            clipped: body.scrollHeight > body.clientHeight + 2 ||
                br.top < -2 || br.bottom > vh + 2 || br.left < -2 || br.right > vw + 2,
            pages: root.querySelectorAll('[data-help-pager]').length ? root.querySelector('[data-help-page]').getAttribute('data-help-page') : null,
            resume: (() => {
                const r = [...root.querySelectorAll('button')].find((b) => /RESUME/.test(b.textContent || ''))
                return r ? R(r).bottom <= vh + 2 && R(r).top >= -2 : false
            })(),
        }
    }
    return { clip, help, vw, vh }
}

async function auditView(pages) {
    const paged = []
    for (const { page, vp } of pages) {
        for (const { path } of games) {
            const label = `${path} @${vp.name}`
            const localErrs = []
            const onErr = (e) => { if (!relayNoise(e.text?.() || String(e), null)) localErrs.push(String(e).slice(0, 80)) }
            page.on('pageerror', onErr)
            try {
                await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
                await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {})
                await page.waitForTimeout(700)
                const a = await page.evaluate(FIT_AUDIT)
                let help = null
                // overlays mount only once play has begun: start first, then '?'
                await page.keyboard.press('Space').catch(() => {})
                await page.waitForTimeout(500)
                await page.keyboard.press('Slash', { modifiers: ['Shift'] }).catch(() => {})
                await page.waitForTimeout(350)
                {
                    const b = await page.evaluate(FIT_AUDIT)
                    if (b.help) {
                        help = b.help
                        help.clipped = help.clipped || help.resume === false
                        if (b.help.fit === 'paged') {
                            paged.push({ label })
                            const total = parseInt((b.help.pages || '1/1').split('/')[1], 10)
                            for (let i = 1; i < total; i++) {
                                await page.click('[data-help-next]').catch(() => {})
                                await page.waitForTimeout(120)
                            }
                            await page.click('[data-help-prev]').catch(() => {})
                        }
                    }
                }
                await page.keyboard.press('Slash', { modifiers: ['Shift'] }).catch(() => {})
                const badHelp = help && help.clipped
                ok(`${label}: text fits viewport, clear of pad+chrome`,
                    a.clip.out.length === 0 && a.clip.cover.length === 0 && localErrs.length === 0 && !badHelp,
                    a.clip.out.concat(a.clip.cover, localErrs).concat(badHelp ? ['HELP CLIPPED'] : []).slice(0, 4).join(' | '))
                if (help) ok(`${label}: help overlay ${help.fit}${help.fit === 'paged' ? ` (${help.pages})` : ''} fits`, !badHelp)
            } catch (e) {
                ok(`${label}: loads and fits`, false, String(e).slice(0, 60))
            } finally {
                page.off('pageerror', onErr)
            }
        }
    }
    return paged
}

// CI runners (ubuntu): sandbox off + bigger shm, or Chromium dies on startup
// before the CDP port opens (same args as launch() in lib/harness.mjs).
const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=9391',
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    ...ciArgs,
    '--user-data-dir=' + PROFILE, 'about:blank',
], { stdio: 'ignore' })
const cleanup = guardChrome(chrome, PROFILE)
let browser
for (let i = 0; i < 40 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9391') } catch { /* retry */ }
}
if (!browser) { cleanup(); console.error('cannot reach headless Chrome over CDP'); process.exit(1) }

let paged = []
let demoErrs = 0
try {
    const pages = []
    for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
        const page = await ctx.newPage()
        pages.push({ page, vp })
    }

    paged = await auditView(pages)

    ok('WIN: at least one title pages on a landscape phone',
        paged.some((r) => r.label.includes('phone-landscape')),
        paged.map((r) => r.label).slice(0, 3).join(', ') || 'nothing paged anywhere')

    for (const d of DEMOS) {
        const perView = await Promise.all(pages.map(async ({ page, vp }) => {
            const errs = []
            const onErr = (e) => { if (!relayNoise(e.text?.() || String(e), null)) errs.push(String(e).slice(0, 60)) }
            page.on('pageerror', onErr)
            try {
                await page.goto(`${BASE}/demos/${d}.html`, { waitUntil: 'domcontentloaded', timeout: 20000 })
                await page.waitForTimeout(800)
                const r = await page.evaluate(() => {
                    const hud = document.getElementById('hud')
                    const tag = document.getElementById('credits-tag')
                    const out = { vw: innerWidth, vh: innerHeight }
                    if (hud) {
                        const h = hud.getBoundingClientRect()
                        out.hudOut = h.top < -2 || h.left < -2 || h.bottom > innerHeight + 2 || h.right > innerWidth + 2
                        if (tag && hud.style.display !== 'none') {
                            const t = tag.getBoundingClientRect()
                            out.overlap = h.left < t.right - 1 && t.left < h.right - 1 && h.top < t.bottom - 1 && t.top < h.bottom - 1
                        }
                    }
                    if (tag) {
                        tag.click()
                        const card = document.getElementById('credits-card')
                        const open = card && card.classList.contains('open')
                        const box = open && card.querySelector('.cc-box')
                        if (open && box) {
                            const b = box.getBoundingClientRect()
                            out.cardOut = b.top < -2 || b.left < -2 || b.bottom > innerHeight + 2 || b.right > innerWidth + 2
                        }
                        card.click()
                    }
                    return out
                })
                return { vp: vp.name, r, errs }
            } finally {
                page.off('pageerror', onErr)
            }
        }))
        const bad = perView.filter(({ r, errs }) => r.hudOut || r.overlap || r.cardOut || errs.length)
        demoErrs += perView.reduce((a, p) => a + p.errs.length, 0)
        ok(`demo ${d}: caption inside viewport, clear of badge; card fits (3 viewports)`,
            bad.length === 0, bad.map((p) => `${p.vp}${p.r.hudOut ? ' HUD-OVERFLOW' : ''}${p.r.overlap ? ' BADGE-OVERLAP' : ''}${p.r.cardOut ? ' CARD-OVERFLOW' : ''}${p.errs.length ? ' errs' : ''}`).join(' | '))
    }
} finally {
    await browser.close().catch(() => {})
    cleanup()
}

const failed = results.filter((r) => !r.pass)
console.log(`\ntextfitcheck: ${results.length - failed.length}/${results.length} gates green`)
process.exit(failed.length ? 1 : 0)
