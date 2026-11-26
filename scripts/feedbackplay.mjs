// FEEDBACKPLAY (#3407) — the phone-width proof of "a report Jon makes never
// disappears silently", in real Chrome at 390×844 against the REAL panel.
//
// The relay is stubbed at the network layer (page.route): the client code runs
// its production path — probe, submit, retry — with nothing GitHub-side and no
// test hooks in the game. Dictation is simulated the way iOS/macOS does it:
// Input.insertText, which inserts text WITHOUT dispatching keydown/keypress —
// and the script counts keydowns to prove it stayed at zero, because "text
// arrived although no key was pressed" is exactly what the panel used to miss.
//
//   npm run dev -- --port 5178 --strictPort     (DEV_PORT)
//   npm run feedbackplay
//
//   S1 dictate → send → refused 503 → the panel says why, the note stays in
//      the box, the report lands in localStorage — reload — the kept report
//      delivers itself and the toast names the issue number.
//   S2 a half-written note survives closing the panel AND a reload (draft).
//   S3 zero page errors across the whole run.

import { requireDevServer, Report } from './lib/harness.mjs'
import { launchChrome } from './lib/chromeboot.mjs'

const PORT = process.env.DEV_PORT || 5173
const PAGE_URL = `http://localhost:${PORT}/retrogames/pacman`
const RELAY_HOST = 'retrogames.jalfern.workers.dev'
const OUTBOX = 'rg.feedback.outbox'
const DRAFT = 'rg.feedback.draft'
const NOTE = 'lap times jump at the dusk deck windsock'

const r = new Report('feedbackplay')
await requireDevServer(PAGE_URL)

// ── relay stub: /status opens the button; /feedback answers from a script ─────
let postAnswers = [] // [{status, body}] consumed front; last one sticks
const relayPosts = [] // notes that reached the relay, in order
const routeHandler = async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname === '/status') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, service: 'relay-stub', feedback: true }) })
    }
    if (url.pathname === '/feedback' && req.method() === 'POST') {
        try { relayPosts.push(JSON.parse(req.postData() || '{}').note) } catch { relayPosts.push('') }
        const ans = postAnswers.length > 1 ? postAnswers.shift() : postAnswers[0]
        if (!ans) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, err: 'no answer scripted' }) })
        return route.fulfill({ status: ans.status, contentType: 'application/json', body: JSON.stringify(ans.body) })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
}
const answer = (list) => { postAnswers = list }
const okAns = { status: 200, body: { ok: true, issue: 'https://github.com/jalfern/retrogames/issues/3407', labels: ['feedback'] } }
const failAns = (err) => ({ status: 503, body: { ok: false, err } })

const until = async (fn, ms = 12000) => {
    const t0 = Date.now()
    for (;;) {
        let v = null
        try { v = await fn() } catch { return null }
        if (v) return v
        if (Date.now() - t0 > ms) return null
        await new Promise((res) => setTimeout(res, 150))
    }
}

// Instrumentation that survives reload: a keydown counter (capture, so nothing
// downstream can hide it) and a toast recorder (the confirmations are short).
const INSTRUMENT = () => {
    window.__kd = 0
    addEventListener('keydown', () => { window.__kd++ }, true)
    window.__toasts = []
    const watch = (ms) => {
        for (const m of ms) {
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue
                if (n.matches && n.matches('[data-feedback="toast"]') && n.textContent) window.__toasts.push(n.textContent)
                if (n.querySelector) { const t = n.querySelector('[data-feedback="toast"]'); if (t && t.textContent) window.__toasts.push(t.textContent) }
            }
            const t = m.target
            if (m.type === 'characterData' && t && t.parentElement && t.parentElement.matches && t.parentElement.matches('[data-feedback="toast"]')) window.__toasts.push(t.textContent)
        }
    }
    const start = () => new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    if (document.documentElement) start()
    else document.addEventListener('DOMContentLoaded', start)
}

const storeRead = (page, key) => page.evaluate((k) => { try { return localStorage.getItem(k) } catch { return null } }, key)
const outboxNotes = async (page) => {
    const raw = await storeRead(page, OUTBOX)
    try { return (JSON.parse(raw || '[]') || []).map((e) => e && e.payload && e.payload.note) } catch { return null }
}

const errors = []
const browser = await launchChrome()
let ctx = null
try {
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    let page = await ctx.newPage()
    page.setDefaultTimeout(30000)
    page.on('pageerror', (e) => errors.push(`${e} @ ${(e.stack || '').split('\n').slice(1, 3).join(' <- ')}`))
    await page.addInitScript(INSTRUMENT)
    await page.route((u) => u.hostname === RELAY_HOST, routeHandler)

    // ============ S1 — dictate, refused, kept, delivered after reload ==========
    await page.goto(PAGE_URL, { waitUntil: 'load' })
    const openBtn = await until(() => page.locator('[data-feedback="open"]').count(), 15000)
    r.check('the FEEDBACK button shows once the relay advertises /status', !!openBtn)

    await page.tap('[data-feedback="open"]')
    await page.waitForSelector('[data-feedback="note"]', { timeout: 5000 })
    r.check('panel opens at phone width (390px)', true)

    await page.tap('[data-feedback="note"]')
    await page.evaluate(() => { window.__kd = 0 })
    await page.keyboard.insertText(NOTE) // dictation: insertion, zero keypresses
    const afterDictation = await page.evaluate(() => ({
        value: document.querySelector('[data-feedback="note"]').value,
        disabled: document.querySelector('[data-feedback="send"]').disabled,
        kd: window.__kd,
    }))
    r.check('dictated words land in the box', afterDictation.value === NOTE, `value="${afterDictation.value}"`)
    r.check('the dictated note ENABLES send (state caught the keypress-free insertion)', afterDictation.disabled === false)
    r.check('it was insertion without keypresses (zero keydowns)', afterDictation.kd === 0, `keydowns=${afterDictation.kd}`)

    answer([failAns('relay at capacity'), okAns])
    await page.tap('[data-feedback="send"]')
    const keptStatus = await until(() => page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find((s) => /failed:/.test(s.textContent || ''))
        return el ? el.textContent : null
    }), 8000)
    r.check('a refused send says plainly why, on the panel', /relay at capacity/.test(keptStatus || ''), keptStatus || 'no failure line')
    r.check('and promises the report is kept', /kept/i.test(keptStatus || ''), keptStatus || '')
    const keptNotes = await outboxNotes(page)
    r.check('the refused report is kept in localStorage', Array.isArray(keptNotes) && keptNotes.length === 1 && keptNotes[0] === NOTE, JSON.stringify(keptNotes))
    const stillVisible = await page.evaluate(() => document.querySelector('[data-feedback="note"]').value)
    r.check('the note stays visible too (nothing silently cleared)', stillVisible === NOTE)
    r.check('the relay was offered the dictated words, not an empty note', relayPosts.length === 1 && relayPosts[0] === NOTE, JSON.stringify(relayPosts))

    // Reload: the kept report must deliver itself without Jon touching anything.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-feedback="open"]', { timeout: 15000 })
    const toast = await until(() => page.evaluate(() => (window.__toasts || []).find((t) => /#\d+/.test(t)) || null), 15000)
    r.check('after a reload the kept report delivers itself, confirming with the issue number',
        /#3407/.test(toast || ''), toast || 'no delivered toast')
    const emptied = await outboxNotes(page)
    r.check('the outbox empties once the report is filed', Array.isArray(emptied) && emptied.length === 0, JSON.stringify(emptied))
    r.check('the retry rode the relay with the same dictated words', relayPosts.length === 2 && relayPosts[1] === NOTE, JSON.stringify(relayPosts))
    r.check('a delivered report leaves no draft behind', (await storeRead(page, DRAFT)) === null)

    // ============ S2 — a half-written note survives close + reload =============
    await page.tap('[data-feedback="open"]')
    await page.waitForSelector('[data-feedback="note"]', { timeout: 5000 })
    await page.tap('[data-feedback="note"]')
    await page.keyboard.insertText('half a thought about sprite flicker')
    const s2mid = await page.evaluate(() => ({
        panel: document.querySelectorAll('[data-feedback="panel"]').length,
        note: document.querySelector('[data-feedback="note"]').value,
        draft: localStorage.getItem('rg.feedback.draft'),
    }))
    console.log('  ..   S2 before Escape:', JSON.stringify(s2mid))
    await page.keyboard.press('Escape') // the panel owns Escape (#905)
    const draftGone = await until(() => page.locator('[data-feedback="panel"]').count().then((c) => c === 0), 5000)
    r.check('Escape closes the panel', !!draftGone)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-feedback="open"]', { timeout: 15000 })
    await page.tap('[data-feedback="open"]')
    await page.waitForTimeout(400)
    const s2after = await page.evaluate(() => ({
        panel: document.querySelectorAll('[data-feedback="panel"]').length,
        note: (() => { const n = document.querySelector('[data-feedback="note"]'); return n ? n.value : null })(),
        draft: localStorage.getItem('rg.feedback.draft'),
    }))
    console.log('  ..   S2 after reopen:', JSON.stringify(s2after))
    const restored = await until(() => page.evaluate(() => document.querySelector('[data-feedback="note"]') && document.querySelector('[data-feedback="note"]').value), 5000)
    r.check('a half-written note survives closing + reload (the draft rides the device)',
        restored === 'half a thought about sprite flicker', `box="${restored}"`)
    const draftStore = await storeRead(page, DRAFT)
    r.check('and it rides as a draft, not by luck', draftStore === 'half a thought about sprite flicker')

    r.check('zero page errors across the run', errors.length === 0, errors.join(' | '))
} catch (e) {
    r.check('scenario completed without unexpected failure', false, String(e))
} finally {
    try { if (ctx) await ctx.close() } catch { /* already closed */ }
    try { await browser.close() } catch { /* already closed */ }
}

console.log(`\nfeedbackplay: ${r.rows.length - r.failed}/${r.rows.length} ${r.failed ? 'RED' : 'GREEN'}`)
process.exit(r.failed ? 1 : 0)
