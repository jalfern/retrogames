#!/usr/bin/env node
// sleepwatch.mjs — notice when the STUDIO itself was asleep (#1354).
//
// Oct 31 2026: someone put the Studio to sleep at 00:17 (Software Sleep from
// loginwindow); it then fell back asleep on every maintenance dark-wake, so
// the fleet crawled for 11 hours and nothing shipped — and nobody noticed.
// The warden's own tick clock is the cheapest honest witness: launchd cannot
// run it while the machine sleeps, so a gap between ticks ≫ the 10-min tick
// means the whole box was down. This module turns that gap into a named
// window and where pmset agrees it, reports what really happened:
//
//   - window = first `Sleep` event → last full `Wake` (dark-wakes inside the
//     window are naps, not uptime — the issue's exact failure mode),
//   - the sleep REASON rides along (`Software Sleep`, `Thermal Emergency`…),
//   - a ledger `/tmp/forge/asleep.json` (48 h retention) feeds the pulse
//     field (`asleep=00:17-11:29 asleepm=678 naps=41`), the /forge board
//     banner (floor.js sleepBanner) and the questions digest (jonq digest).
//
// Keeping the Mac awake stays Jon's call (the box is shared with Joy) —
// this only REPORTS. Pure exports are pinned by scripts/sleepwatchcheck.mjs;
// the CLI below is what scripts/warden.sh materialises to /tmp and runs
// (same launchd-safe one-file pattern as tps.mjs).
//
// pmset grammar (macOS 26, `pmset -g log`; fixtures in sleepwatchcheck are
// verbatim samples):
//   2026-10-31 00:17:40 -0700 Sleep   Entering Sleep state due to 'Software
//                 Sleep pid=79692':… Using AC (Charge:0%) 11 secs
//   2026-10-31 00:17:51 -0700 DarkWake DarkWake from Deep Idle [CDNP] : due
//                 to … Using AC (Charge:0%) 45 secs
//   2026-10-31 11:35:23 -0700 Wake    Wake from Deep Idle [CDNVA] : due to
//                 … HID Activity Using AC (Charge:0%)
// "Wake Requests" / "WakeDetails" share the column prefix — the message
// ("Entering Sleep state" / "DarkWake" / "Wake from") is what identifies a
// real power event.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

export const TICK_MIN = 10          // launchd StartInterval of the warden
export const GAP_MIN = 30          // "much longer than 10 min" = 3 missed ticks
export const LEDGER_KEEP_H = 48    // ledger retention
export const PULSE_SHOW_H = 24     // how long after a window it rides the pulse

// ---- pure parsing ---------------------------------------------------------

const LINE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([-+]\d{2})(\d{2}) (Sleep|DarkWake|Wake)\s+(.*)$/

// parsePmset(text) -> chronological power events [{kind,ms,reason,durSecs}].
// Unrecognised lines are ignored — pmset log carries ~15 other columns.
export function parsePmset(text) {
    const out = []
    for (const line of String(text).split('\n')) {
        const m = line.match(LINE_RE)
        if (!m) continue
        const [, date, time, tza, tzb, kind, msg] = m
        const ms = Date.parse(`${date}T${time}${tza}:${tzb}`)
        if (!Number.isFinite(ms)) continue
        if (kind === 'Sleep' && msg.startsWith('Entering Sleep state')) {
            const r = msg.match(/due to '([^']+)'/)
            const d = msg.match(/(\d+)\s+secs?\s*$/)
            out.push({ kind: 'sleep', ms, reason: (r ? r[1] : 'Sleep').replace(/\s+pid=\d+$/, ''), durSecs: d ? +d[1] : 0 })
        } else if (kind === 'DarkWake' && msg.startsWith('DarkWake')) {
            const d = msg.match(/(\d+)\s+secs?\s*$/)
            out.push({ kind: 'dark', ms, durSecs: d ? +d[1] : 0 })
        } else if (kind === 'Wake' && msg.startsWith('Wake from')) {
            out.push({ kind: 'wake', ms })
        }
    }
    return out.sort((a, b) => a.ms - b.ms)
}

// buildWindows(events) -> sleep windows [{from,to,min,naps,reason,src}].
// A window opens at a Sleep event and closes at the next FULL Wake; dark
// wakes inside are naps (a dark-woken Mac is not usable uptime — the #1354
// failure was precisely a 12 h stretch "wake"ed every few minutes).
// Windows shorter than minMin are dropped (a short nap lost no tick).
export function buildWindows(events, { minMin = GAP_MIN, until = null } = {}) {
    const out = []
    let cur = null
    const close = () => {
        if (!cur) return
        const min = Math.round((cur.to - cur.from) / 60000)
        if (min >= minMin) out.push({ ...cur, min })
        cur = null
    }
    for (const e of events) {
        if (e.kind === 'sleep') {
            if (!cur) cur = { from: e.ms, to: e.ms, naps: 0, reason: e.reason || 'Sleep', src: 'pmset' }
            else cur.to = Math.max(cur.to, e.ms)
        } else if (e.kind === 'dark') {
            if (cur) { cur.naps++; cur.to = Math.max(cur.to, e.ms + (e.durSecs || 0) * 1000) }
        } else if (e.kind === 'wake') {
            if (cur) { cur.to = Math.max(cur.to, e.ms); close() }
        }
    }
    if (cur) {
        if (until != null) cur.to = Math.max(cur.to, until)
        close()
    }
    return out
}

// detectGap({lastTick, now}) (epoch seconds) -> raw window or null.
export function detectGap({ lastTick = null, now }) {
    if (lastTick == null || lastTick === '' || !Number.isFinite(+lastTick)) return null
    const min = Math.round((+now - +lastTick) / 60)
    if (min < GAP_MIN) return null
    return { from: +lastTick * 1000, to: +now * 1000, min, naps: 0, reason: null, src: 'tickgap' }
}

// windowsForGap(gap, events) -> the windows inside (and slightly before) the
// gap. pmset-named windows win; if pmset names none, the raw tick-gap window
// is the honest claim ("down at least this long, cause unknown").
export function windowsForGap(gap, events) {
    if (!gap) return []
    const pad = 15 * 60000
    const inside = events.filter((e) => e.ms >= gap.from - pad && e.ms <= gap.to)
    const ws = buildWindows(inside, { until: gap.to })
    return ws.length ? ws : [gap]
}

// ---- pure presentation ----------------------------------------------------

export const fmtHM = (ms) => {
    const d = new Date(ms)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// fmtDur(minutes) -> "45m" | "11h 12m" (minutes zero-padded after hours).
export function fmtDur(min) {
    const h = Math.floor(min / 60), m = min % 60
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// pulseField(windows, now) -> pulse-line tokens ("" when nothing recent):
// the LATEST window ≤ PULSE_SHOW_H old rides the line; a `naps=` suffix only
// when the machine actually kept waking up (the #1354 signature).
export function pulseField(windows, now = Date.now()) {
    const recent = (windows || []).filter((w) => now - w.to <= PULSE_SHOW_H * 3600000)
    if (!recent.length) return ''
    const w = recent[recent.length - 1]
    const min = Math.max(1, Math.round((w.to - w.from) / 60000))
    return `asleep=${fmtHM(w.from)}-${fmtHM(w.to)} asleepm=${min}${w.naps ? ` naps=${w.naps}` : ''}`
}

// sleepLine(windows, now) -> the digest/board sentence, or null.
export function sleepLine(windows, now = Date.now()) {
    const ws = (windows || []).filter((w) => now - w.to <= LEDGER_KEEP_H * 3600000)
    if (!ws.length) return null
    const last = ws[ws.length - 1]
    const dur = (w) => fmtDur(Math.max(1, Math.round((w.to - w.from) / 60000)))
    if (ws.length === 1) {
        return `😴 Studio was asleep ${fmtHM(last.from)}–${fmtHM(last.to)} (${dur(last)})`
            + `${last.reason ? ` · reason: ${last.reason}` : ''}`
            + `${last.naps ? ` · ${last.naps} dark wakes` : ''}`
    }
    const total = ws.reduce((s, w) => s + Math.max(1, Math.round((w.to - w.from) / 60000)), 0)
    const naps = ws.reduce((s, w) => s + (w.naps || 0), 0)
    return `😴 Studio asleep ×${ws.length} in ${LEDGER_KEEP_H} h, total ${fmtDur(total)}`
        + ` · latest ${fmtHM(last.from)}–${fmtHM(last.to)} (${dur(last)})`
        + `${naps ? ` · ${naps} dark wakes` : ''}`
}

// addWindows(ledger, fresh, now) -> new windows list: append, dedupe
// (same start minute = same outage seen twice), prune LEDGER_KEEP_H + cap.
export function addWindows(existing, fresh, now = Date.now()) {
    let list = Array.isArray(existing) ? existing.slice() : []
    for (const w of fresh || []) {
        if (!list.some((e) => Math.abs(e.from - w.from) < 60000)) list.push(w)
    }
    list = list.filter((w) => Number.isFinite(w.from) && Number.isFinite(w.to) && now - w.to <= LEDGER_KEEP_H * 3600000)
    list.sort((a, b) => a.from - b.from)
    return list.slice(-200)
}

// ---- CLI (what warden.sh runs; ledger IO lives here, not in the pure core)

const arg = (argv, name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (argv, name) => argv.includes(`--${name}`)

function readLedger(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')).windows || [] } catch { return [] }
}
function writeLedger(file, windows) {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ windows }, null, 1) + '\n')
    fs.renameSync(tmp, file)
}
// pmset capture — Studio-only, and only when there is a gap to name.
function capturePmset() {
    try {
        const txt = execFileSync('pmset', ['-g', 'log'], { encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024 })
        return parsePmset(txt)
    } catch { return null }
}

function run(argv) {
    const cmd = argv[0]
    const file = arg(argv, 'out') || '/tmp/forge/asleep.json'
    const dry = has(argv, 'dry')
    const NOW = has(argv, 'now') ? +arg(argv, 'now') * 1000 : Date.now()

    if (cmd === 'backfill') {
        const events = arg(argv, 'pmset') ? parsePmset(fs.readFileSync(arg(argv, 'pmset'), 'utf8')) : capturePmset()
        if (!events || !events.length) { console.log('backfilled=0'); return }
        const ws = buildWindows(events, { until: NOW }).filter((w) => NOW - w.to <= LEDGER_KEEP_H * 3600000)
        if (!dry && ws.length) writeLedger(file, addWindows(readLedger(file), ws, NOW))
        console.log(`backfilled=${ws.length}`)
        return
    }
    if (cmd === 'tick') {
        const gap = detectGap({ lastTick: arg(argv, 'last'), now: NOW / 1000 })
        if (!gap) { console.log('recorded=0'); return }
        const events = arg(argv, 'pmset') ? parsePmset(fs.readFileSync(arg(argv, 'pmset'), 'utf8')) : capturePmset()
        const ws = windowsForGap(gap, events || [])
        if (!dry) writeLedger(file, addWindows(readLedger(file), ws, NOW))
        console.log(`recorded=${ws.length} src=${ws[0]?.src || 'none'}`)
        return
    }
    if (cmd === 'pulse') {
        console.log(pulseField(readLedger(file), NOW))
        return
    }
    if (cmd === 'line') {
        console.log(sleepLine(readLedger(file), NOW) || '')
        return
    }
    console.error('usage: sleepwatch.mjs backfill|tick|pulse|line [--last s] [--now s] [--pmset f] [--out f] [--dry]')
    process.exit(2)
}

if (process.argv[1] && process.argv[1].includes('sleepwatch.mjs')) run(process.argv.slice(2))
