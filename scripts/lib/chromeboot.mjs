// chromeboot — #1622: launch a browser that WORKS on nodes where full Chrome dies.
//
// The Studio (and any launchd-kicked session with no Aqua GUI session — no
// WindowServer, no gui/<uid> domain) cannot run full Google Chrome headless:
// Chrome aborts inside TransformProcessType/_RegisterApplication trying to
// register with the window server, and even chrome-headless-shell dies on
// `bootstrap_check_in` of its Mach port rendezvous unless started with
// `--single-process`. That silently killed every lane's screenshots for days
// (PR #1583: "blocked by dead Chrome on this box").
//
// Fix: try, in order —
//   1. the configured channel (default 'chrome'), as before
//   2. same channel + --single-process
//   3. playwright's bundled headless shell (channel omitted)
//   4. headless shell + --single-process
// The first mode that boots is recorded in a mode file; later launches hoist
// it to the front (fast path) until it fails or the file goes stale. The
// successful mode is stamped on the browser object as `browser.__bootMode`.
//
// Pure parts (bootLadder, shotsField) are pinned by scripts/chromesmokecheck.mjs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const MODE_FILE = process.env.CHROME_MODE_FILE || '/tmp/forge/chromeboot.mode'
export const SMOKE_FILE = process.env.CHROME_SMOKE_FILE || '/tmp/forge/chrome-smoke.json'
// cached mode trusted for 30 min; smoke status shown on the pulse for 12 h
const MODE_TTL_S = 30 * 60
const SMOKE_TTL_S = 12 * 3600

const chanName = (c) => (c ? String(c) : 'shell')

// Ordered attempts: [{ mode, channel|null, single }]. `channel` null means
// playwright's bundled headless shell. Cached mode (if it names an attempt)
// is hoisted to the front; duplicates collapse.
export function bootLadder(channel = 'chrome', cached = null) {
    const attempts = [
        { mode: chanName(channel), channel, single: false },
        { mode: chanName(channel) + '+sp', channel, single: true },
        { mode: 'shell', channel: null, single: false },
        { mode: 'shell+sp', channel: null, single: true },
    ]
    const seen = new Set()
    const list = attempts.filter((a) => !seen.has(a.mode) && seen.add(a.mode))
    if (cached) {
        const i = list.findIndex((a) => a.mode === cached)
        if (i > 0) list.unshift(...list.splice(i, 1))
    }
    return list
}

function readCachedMode(nowS = Date.now() / 1000) {
    try {
        const [mode, stamp] = readFileSync(MODE_FILE, 'utf8').trim().split(/\s+/)
        if (mode && stamp && nowS - Number(stamp) < MODE_TTL_S) return mode
    } catch { /* no cache */ }
    return null
}

function writeMode(mode, nowS = Math.floor(Date.now() / 1000)) {
    try { mkdirSync(dirname(MODE_FILE), { recursive: true }); writeFileSync(MODE_FILE, `${mode} ${nowS}\n`) } catch { /* best effort */ }
}

// Launch with the ladder. Throws the LAST attempt's error when every mode
// fails. Never process.exit here — callers own the failure UX.
export async function launchChrome({ channel, headless = true, extraArgs = [], quiet = false } = {}) {
    const ch = channel ?? (process.env.SHOT_CHANNEL || 'chrome')
    const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
    const envArgs = (process.env.SHOT_EXTRA_ARGS || '').split(/\s+/).filter(Boolean)
    const frameArgs = [
        '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
    ]
    const { chromium } = await import('playwright-core')
    let lastErr = null
    for (const a of bootLadder(ch, readCachedMode())) {
        try {
            const browser = await chromium.launch({
                ...(a.channel ? { channel: a.channel } : {}),
                headless,
                args: [...frameArgs, ...ciArgs, ...envArgs, ...(a.single ? ['--single-process'] : []), ...extraArgs],
            })
            writeMode(a.mode)
            try { Object.defineProperty(browser, '__bootMode', { value: a.mode, configurable: true }) } catch { /* frozen impl */ }
            if (a.mode !== chanName(ch) && !quiet) {
                console.error(`chromeboot: ${chanName(ch)} cannot boot here — using ${a.mode} (#1622)`)
            }
            return browser
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr ?? new Error('chromeboot: no launch attempts')
}

// Pulse field (#1622 rule): say so on the pulse instead of quietly skipping
// screenshots. `status` is the parsed SMOKE_FILE (null/absent/stale → unknown).
export function shotsField(status, nowS = Math.floor(Date.now() / 1000)) {
    if (!status || typeof status.at !== 'number' || nowS - status.at > SMOKE_TTL_S) return 'shots=unknown'
    if (status.ok) return `shots=ok(${status.mode || '?'})`
    return `shots=broken(${status.reason || 'launch'})`
}
