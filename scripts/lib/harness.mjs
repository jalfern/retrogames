// Shared plumbing for the self-verifying harness (see AGENTS.md > Self-verifying).
//
// Every check in scripts/*.mjs drives the DEV-only `window.__marioTest` hook in
// system Chrome. This module factors out the boilerplate that used to be
// copy-pasted into one-off drivers: dev-server preflight, browser launch, the
// "press a key to leave attract mode" gesture, and pass/fail reporting.
//
// Conventions:
//   - Browser comes from SHOT_CHANNEL (default 'chrome'), never a hardcoded
//     executable path, so the checks work off macOS too.
//   - Target URL comes from MARIO_URL (default localhost dev server).
//   - Checks exit non-zero on failure so npm run verify / CI can gate on them.

export const URL_DEFAULT = process.env.MARIO_URL || 'http://localhost:5173/retrogames/mario'
export const KEEP_URL_DEFAULT = process.env.KEEP_URL || 'http://localhost:5173/retrogames/ironkeep'

export function opt(args, name, d) {
    const i = args.indexOf(name)
    return i >= 0 ? (args[i + 1] ?? true) : d
}

let chromium
try {
    ({ chromium } = await import('playwright-core'))
} catch {
    console.error('playwright-core is not installed. Run `npm install` in the repo root first.')
    process.exit(1)
}

// Fail early with an actionable message instead of a 30s Playwright timeout.
export async function requireDevServer(url = URL_DEFAULT) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (res.ok) return
        console.error(`Dev server answered ${res.status} at ${url} — restart \`npm run dev\`.`)
        process.exit(1)
    } catch {
        console.error(`No dev server at ${url}.`)
        console.error('Start it in another terminal: `npm run dev`')
        console.error('(Or point the check elsewhere: MARIO_URL=http://localhost:4173/retrogames/mario)')
        process.exit(1)
    }
}

export async function launch(opts = {}) {
    const channel = opts.channel || process.env.SHOT_CHANNEL || 'chrome'
    // GitHub-hosted Linux runners need the sandbox off and a bigger shm than
    // the default 64mb, or Chromium dies on startup before the check runs.
    const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
    try {
        return await chromium.launch({
            channel,
            headless: opts.headless ?? true,
            args: ['--autoplay-policy=no-user-gesture-required', ...ciArgs],
        })
    } catch (e) {
        console.error(`Could not launch browser (channel="${channel}").`)
        console.error('Install Google Chrome, or run `npx playwright install chromium` and set SHOT_CHANNEL=chromium.')
        console.error(e.message)
        process.exit(1)
    }
}

// Open a game and wait until its DEV hook exists. The hook is import.meta.env.DEV
// only, so a production build makes this fail loudly rather than silently no-op.
// `hook` defaults to Mario's `__marioTest`; other titles pass their own name
// (IronKeep uses `__keepTest`) — see openGame below.
export async function openMario(browser, { url = URL_DEFAULT, viewport = { width: 900, height: 760 }, start = false, wait = 400 } = {}) {
    return openGame(browser, { url, viewport, start, wait, hook: '__marioTest' })
}

export async function openGame(browser, { url, viewport = { width: 900, height: 760 }, start = false, wait = 400, hook = '__marioTest' } = {}) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
    page.setDefaultTimeout(60000)
    page.on('pageerror', e => console.log('[pageerror]', e.message))
    page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()) })
    await page.goto(url, { waitUntil: 'load' })
    try {
        await page.waitForFunction((h) => !!window[h], hook, { timeout: 15000 })
    } catch {
        console.error(`window.${hook} is missing.`)
        console.error('That hook only exists on the DEV server — this check must target `npm run dev`, not a built bundle.')
        await browser.close()
        process.exit(1)
    }
    if (start) {
        await page.keyboard.press('ArrowRight') // gesture: unlocks audio + leaves attract
        await page.waitForTimeout(wait)
    }
    return page
}

// Tiny assertion recorder. Usage:
//   const r = new Report('audcheck')
//   r.check('music advancing', s1.step !== s2.step, `${s1.step} -> ${s2.step}`)
//   r.exit()
export class Report {
    constructor(name) { this.name = name; this.rows = []; this.failed = 0 }
    check(label, pass, detail = '') {
        this.rows.push({ label, pass: !!pass, detail })
        if (!pass) this.failed++
        console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`)
        return !!pass
    }
    info(label, detail) { console.log(`  ..    ${label}${detail !== undefined ? '  ' + detail : ''}`) }
    exit(browser) {
        const total = this.rows.length
        console.log(`\n${this.name}: ${total - this.failed}/${total} checks passed` +
            (this.failed ? `  — ${this.failed} FAILED` : '  — OK'))
        if (browser?.close) return browser.close().then(() => process.exit(this.failed ? 1 : 0))
        process.exit(this.failed ? 1 : 0)
    }
}
