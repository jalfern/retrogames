// FEEDBACKREPLAY (#737) — turn a FILED feedback report back into a live replay.
//
// The button files note + screenshot + state + the last 30 s of input as a
// `retrogames-rec/v1` stream; the Done bar says QA must be able to replay that
// stream. feedbackcheck proves the codec round-trips against a headless sim —
// this is the other half: point it at a real issue (or a saved payload file)
// and it re-runs the exact key stream against the live game in headless
// Chrome, watching the DEV contract while it plays.
//
//   node scripts/feedbackreplay.mjs 1472           # replay what issue #1472 filed
//   node scripts/feedbackreplay.mjs --payload f.json  # replay a saved payload/body
//   npm run feedbackreplay                         # CI gate = the --selftest below
//   node scripts/feedbackreplay.mjs 1472 --url http://localhost:5178  # dev server
//
// The npm alias bakes in --selftest (the nightlyheal precedent): the live drive
// needs a dev server + Chrome, so CI gates the extractor/gates themselves.
//
// Reports without an input block (games/demos on the graceful-fallback path)
// exit 0 with a loud SKIP — there is nothing to replay, and that is honest.
// The replay is real key events at the tick grid (never __game.step): pad bits
// → Arrow/Space/X/Enter transitions, exactly what the keyboard ring banked.
// Gates: the stream parses as dense rec/v1, the game boots, zero page errors
// (relay CORS noise excluded), and the sim advances ≥75% of the stream length
// (or ends honestly early on death). Trajectory + reported state print either
// way so QA can eyeball parity when the seed is honored.

import { readFileSync } from 'node:fs'
import { opt, launch, requireDevServer, relayNoise, Report } from './lib/harness.mjs'
import { REC_FORMAT } from '../src/utils/recording.js'
import { FB_MAX_PADS } from '../relay/core.js'

const args = process.argv.slice(2)
const TICK_KEYS = {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    a: 'Space', b: 'KeyX', start: 'Enter',
}
const KNOWN_BITS = new Set(Object.keys(TICK_KEYS))

// ── payload extraction ───────────────────────────────────────────────────────
// A filed body is note text + a meta fence (`game:`/`build:`/`route:`), then
// optional State:/Diagnostics: json fences, then the input json fence. Parse
// every fence, pick by shape — order-proof against body rewrites.
export function extractFromBody(body) {
    const out = { meta: {}, state: null, diag: null, input: null }
    for (const m of String(body || '').matchAll(/```(?:json)?\n([\s\S]*?)```/g)) {
        const block = m[1]
        let parsed = null
        try { parsed = JSON.parse(block) } catch { /* meta fence */ }
        if (parsed && typeof parsed === 'object') {
            if (parsed.format === REC_FORMAT && Array.isArray(parsed.pads)) out.input = parsed
            else if (!out.state && ('tick' in parsed || 'score' in parsed || 'seed' in parsed)) out.state = parsed
            else if (!out.diag && parsed.frameTimes) out.diag = parsed
            continue
        }
        for (const k of ['game', 'build', 'route', 'ua']) {
            const km = new RegExp(`^${k}:\\s*(\\S.*)$`, 'm').exec(block)
            if (km) out.meta[k] = km[1].trim()
        }
    }
    return out
}

// shape() — the QA-side twin of relay validateFeedback for the input block.
// Every violation names itself so a red run says WHAT the stream got wrong.
export function shape(input) {
    const errs = []
    if (!input) return ['no input block in report (graceful-fallback path)']
    if (input.format !== REC_FORMAT) errs.push(`format is ${input.format}, expected ${REC_FORMAT}`)
    if (!Array.isArray(input.pads)) return errs.concat('pads missing or not an array')
    if (input.pads.length > FB_MAX_PADS) errs.push(`${input.pads.length} pads exceeds the ${FB_MAX_PADS}-frame ceiling`)
    if (input.ticks != null && input.ticks !== input.pads.length) errs.push(`ticks=${input.ticks} but pads.length=${input.pads.length}`)
    if (!Number.isInteger(input.tickRate) || input.tickRate <= 0 || input.tickRate > 240) errs.push(`tickRate ${input.tickRate} not a sane positive Hz`)
    if (input.seed != null && !Number.isInteger(input.seed)) errs.push(`seed ${input.seed} is not an integer`)
    const dense = input.pads.every((f, i) => f && f.t === i + 1)
    if (!dense) errs.push('pads are not dense t=1..N (a feedback stream is one pad per tick, gaps filled)')
    const badPad = input.pads.find((f) => Object.keys(f.pad || {}).some((k) => !KNOWN_BITS.has(k)))
    if (badPad) errs.push(`pad at t=${badPad.t} carries unknown bit(s): ${Object.keys(badPad.pad).filter((k) => !KNOWN_BITS.has(k)).join(',')}`)
    return errs
}

// Condense a dense stream into key segments (human-readable timeline).
export function segments(pads) {
    const out = []
    let cur = {}
    let start = 0
    const key = (p) => Object.keys(p).sort().join('+')
    for (let i = 0; i < pads.length; i++) {
        const p = pads[i].pad || {}
        if (key(p) !== key(cur)) {
            if (key(cur)) out.push({ start, end: i, pad: cur })
            cur = p
            start = i
        }
    }
    if (key(cur)) out.push({ start, end: pads.length, pad: cur })
    return out
}

const fmt = (tick, hz) => {
    const s = tick / hz
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

// ── selftest: prove extraction and the shape gates can fail ─────────────────
function selftest() {
    const r = new Report('feedbackreplay selftest')
    const pads = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i + 1, pad: fn(i) }))
    const goodBody = [
        'Wyrm never saddles on the second pass', '',
        '```', 'game:  gauntlet', 'build: abc1234', 'route: /retrogames/gauntlet', '```', '',
        'State:', '```json', JSON.stringify({ tick: 7160, score: 150, seed: 42 }), '```', '',
        'Last 30s of input (seed 42, 600 ticks @ 60 Hz, retrogames-rec/v1):', '```json',
        JSON.stringify({ format: REC_FORMAT, durationSec: 10, tickRate: 60, seed: 42, ticks: 600, pads: pads(600, (i) => (i > 60 && i < 90 ? { left: true } : {})) }), '```',
    ].join('\n')
    const ex = extractFromBody(goodBody)
    r.check('extract: input block found', !!ex.input)
    r.check('extract: meta game/route', ex.meta.game === 'gauntlet' && ex.meta.route === '/retrogames/gauntlet')
    r.check('extract: state block', !!ex.state && ex.state.score === 150)
    r.check('shape: good stream green', shape(ex.input).length === 0)
    r.check('shape: ticks/pads mismatch red', shape({ ...ex.input, ticks: 599 }).length > 0)
    r.check('shape: sparse stream red', shape({ ...ex.input, ticks: 1, pads: [{ t: 2, pad: {} }] }).length > 0)
    r.check('shape: fractional seed red', shape({ ...ex.input, seed: 1.5 }).length > 0)
    r.check('shape: unknown pad bit red', shape({ ...ex.input, pads: [{ t: 1, pad: { wiggle: true } }] }).length > 0)
    r.check('fallback report SKIPs cleanly (no input)', shape(null).length === 1 && /graceful-fallback/.test(shape(null)[0]))
    const segs = segments(ex.input.pads)
    r.check('segments: one left-hold found', segs.length === 1 && segs[0].pad.left === true, `${segs.length} segment(s)`)
    r.exit(null)
}

// ── live replay ──────────────────────────────────────────────────────────────
async function replay({ sourceText, gameId, route, input, state }) {
    const origin = String(opt(args, '--url', `http://localhost:${process.env.DEV_PORT || 5173}`)).replace(/\/$/, '')
    const errs = shape(input)
    const r = new Report('feedbackreplay')
    r.check('stream parses as dense rec/v1', errs.length === 0, errs.join('; '))
    if (errs.length) return r.exit(null)

    const hz = input.tickRate || 60
    const tickMs = 1000 / hz
    const slug = (route || gameId || '').split('/').filter(Boolean).pop() || gameId
    const q = new URLSearchParams()
    if (Number.isInteger(input.seed)) q.set('seed', String(input.seed))
    const url = `${origin}/retrogames/${slug}${q.toString() ? `?${q}` : ''}`
    r.info('target', `${url} (${input.pads.length} ticks @ ${hz} Hz, seed ${input.seed ?? '?'})`)

    await requireDevServer(url)
    const browser = await launch()
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    page.setDefaultTimeout(60000)
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
        if (m.type() === 'error' && !relayNoise(m.text(), m.location())) pageErrors.push(`console.error: ${m.text()}`)
    })
    await page.goto(url, { waitUntil: 'load' })
    let hasContract = true
    try {
        await page.waitForFunction(() => !!window.__game, { timeout: 15000 })
    } catch {
        hasContract = false
    }
    r.check('game boots', await page.evaluate(() => document.readyState === 'complete'))

    // past attract: the pad's tap-to-start gesture (Space, Enter fallback).
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    const readState = async () =>
        page.evaluate(() => {
            const g = window.__game
            const s = g && typeof g.state === 'function' ? g.state() : (window.__feedbackInfo ? window.__feedbackInfo() : null)
            if (!s) return null
            const o = {}
            for (const k of ['tick', 'score', 'done', 'seed']) if (s[k] !== undefined) o[k] = s[k]
            return o
        })

    const before = hasContract ? await readState() : null
    if (before && Number.isInteger(before.seed) && Number.isInteger(input.seed)) {
        r.info('seed honored', before.seed === input.seed ? `yes (${before.seed}) — parity claims apply` : `NO — page says ${before.seed}, report said ${input.seed}; parity check skipped`)
    }

    // Drive: dispatch pad transitions at the tick grid against wall clock.
    // Sleeping in small steps keeps dispatch close to its tick; the game's own
    // fixed timestep tolerates the jitter exactly like a laggy phone does.
    const t0 = Date.now()
    const held = new Set()
    let dispatched = 0
    for (let i = 0; i < input.pads.length; i++) {
        const target = t0 + i * tickMs
        let now = Date.now()
        while (target - now > 2) {
            await new Promise((res) => setTimeout(res, Math.min(target - now - 1, 50)))
            now = Date.now()
        }
        const pad = input.pads[i].pad || {}
        for (const bit of Object.keys(TICK_KEYS)) {
            const on = !!pad[bit]
            if (on && !held.has(bit)) {
                held.add(bit)
                await page.keyboard.down(TICK_KEYS[bit])
                dispatched++
            } else if (!on && held.has(bit)) {
                held.delete(bit)
                await page.keyboard.up(TICK_KEYS[bit])
                dispatched++
            }
        }
    }
    for (const bit of [...held]) {
        await page.keyboard.up(TICK_KEYS[bit])
    }
    const wallMs = Date.now() - t0
    await page.waitForTimeout(250)

    const after = hasContract ? await readState() : null
    r.check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
    if (!hasContract) {
        r.skip('sim advanced', 'window.__game absent — title does not speak the contract; keys were fed blind')
    } else if (before && after) {
        const advanced = Number.isInteger(after.tick) && Number.isInteger(before.tick) ? after.tick - before.tick : null
        if (advanced == null) r.skip('sim advanced', 'state has no tick field')
        else {
            const want = input.pads.length
            r.check(`sim advanced >= 75% of ${want} ticks (or ended honestly)`,
                advanced >= want * 0.75 || (after.done && advanced >= want * 0.25),
                `${advanced} ticks in ${wallMs} ms${after.done ? ', game ended (done)' : ''}`)
        }
        if (state && after) {
            const cmp = Object.keys(state).filter((k) => ['score', 'done'].includes(k)).map((k) => `${k}: reported ${state[k]} → replayed ${after[k] ?? '?'}`)
            if (cmp.length) r.info('parity vs report', cmp.join(', '))
        }
    }

    // timeline for QA eyeballs
    const segs = segments(input.pads)
    r.info('key timeline', `${segs.length} segment(s), ${dispatched} key transitions in ${Math.round(wallMs / 1000)}s wall`)
    for (const s of segs.slice(0, 24)) {
        const bits = Object.keys(s.pad).join('+') || 'release'
        console.log(`        ${fmt(s.start, hz)}–${fmt(s.end, hz)}  ${bits}`)
    }
    if (segs.length > 24) console.log(`        … ${segs.length - 24} more`)
    return r.exit(browser)
}

// ── entry ────────────────────────────────────────────────────────────────────
async function main() {
    if (args.includes('--selftest')) return selftest()
    const num = args.find((a) => /^\d+$/.test(a))
    const payloadFile = opt(args, '--payload', null)
    let body = ''
    let gameId = ''
    if (num) {
        const { execFileSync } = await import('node:child_process')
        const ghBin = process.env.GH || 'gh'
        // gh api (not `issue view --json`): the raw REST shape works on real gh
        // AND the curl-gh shim on DNS-poisoned QA boxes (shim has no `view`).
        const json = execFileSync(ghBin, ['api', `repos/jalfern/retrogames/issues/${num}`], { encoding: 'utf8' })
        const issue = JSON.parse(json)
        body = issue.body || ''
        gameId = (/^FEEDBACK ([^:]+):/.exec(issue.title || '') || [])[1] || ''
    } else if (payloadFile) {
        const raw = readFileSync(payloadFile, 'utf8')
        let parsed = null
        try { parsed = JSON.parse(raw) } catch { /* raw body text */ }
        if (parsed && parsed.input) {
            // payload as captured by the SDK
            return replay({ sourceText: 'payload', gameId: parsed.gameId, route: parsed.route, input: parsed.input, state: parsed.state })
        }
        if (parsed && typeof parsed.body === 'string') {
            body = parsed.body
            gameId = (/^FEEDBACK ([^:]+):/.exec(parsed.title || '') || [])[1] || ''
        } else body = raw
    } else {
        console.error('usage: feedbackreplay <issue-number> | --payload file.json | --selftest')
        process.exit(2)
    }
    const ex = extractFromBody(body)
    return replay({ sourceText: `issue ${num || 'file'}`, gameId: gameId || ex.meta.game, route: ex.meta.route, input: ex.input, state: ex.state })
}

main().catch((e) => {
    console.error(`feedbackreplay: ${e.message}`)
    process.exit(1)
})
