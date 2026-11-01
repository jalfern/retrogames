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
// v2 (#1392) closes the honest gaps the tick-gap design leaves open:
//   - CHURN: a box dark-waking every few minutes lets the warden tick normally,
//     so no gap ever fires — yet it is effectively unusable. ≥ CHURN_SLEEPS Sleep
//     events within CHURN_WINDOW_MIN form a churn episode; `churn=N` rides the
//     pulse and the digest says "dark wakes are not uptime" — without pretending
//     an open churn chain was one long outage window.
//   - ONSET: `asleep=true since=HH:MM` stamps the pulse the moment the FIRST
//     sleep of an open chain appears with no later full Wake (guarded by
//     ONSET_LOOKBACK_MIN so a rotated/truncated log can never cry wolf). Jon
//     sees it live, not retroactively.
//   - HINT: the digest sentence closes with the one-liner that fixes it —
//     `sudo pmset -a sleep 0`. Keeping the shared Mac awake stays Jon's call.
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
    // floor, not round: 29m59s is two missed ticks plus normal drift, not an
    // outage; the claim needs a full GAP_MIN between tick starts.
    const min = Math.floor((+now - +lastTick) / 60)
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

// ---- churn (#1392) ---------------------------------------------------------

export const CHURN_SLEEPS = 3        // ≥3 Sleeps inside the window = churning
export const CHURN_WINDOW_MIN = 30   // three tick intervals; dark wakes ~every 9
//                                     min rack up 3+ sleeps well inside it
export const ONSET_LOOKBACK_MIN = 60 // "asleep now" needs a sleep seen within 1 h
export const ONSET_STALE_MIN = 30    // the stamp decays with 2 missed dark wakes

// buildChurn(events, {now}) -> churn episodes [{from,to,n,src}]. Consecutive
// Sleep events ≤ maxGapMin apart form one episode; episodes with < minSleeps
// sleeps drop. Full wakes in between do NOT break an episode (a lid open for
// 45 s between sleep attempts is still churn — the #1392 failure mode); only
// a usable gap longer than maxGapMin does. An episode still in progress stays
// open (`to` = last sleep seen), so the pulse can report it before the box
// ever fully wakes — no fabricated outage window.
export function buildChurn(events, { now = Date.now(), minSleeps = CHURN_SLEEPS, maxGapMin = CHURN_WINDOW_MIN, keepH = LEDGER_KEEP_H } = {}) {
    const eps = []
    let cur = null
    for (const e of events) {
        if (e.kind !== 'sleep' || e.ms > now || now - e.ms > keepH * 3600000) continue
        if (cur && e.ms - cur.to <= maxGapMin * 60000) { cur.to = e.ms; cur.n++ }
        else {
            if (cur && cur.n >= minSleeps) eps.push(cur)
            cur = { from: e.ms, to: e.ms, n: 1, src: 'pmset' }
        }
    }
    if (cur && cur.n >= minSleeps) eps.push(cur)
    return eps
}

// churnCount(events, {now, windowMin}) -> Sleep events inside the trailing
// window. The live `churn=N` witness for the tick log; buildChurn owns the
// ledger-side episode.
export function churnCount(events, { now = Date.now(), windowMin = CHURN_WINDOW_MIN } = {}) {
    return events.filter((e) => e.kind === 'sleep' && e.ms <= now && now - e.ms <= windowMin * 60000).length
}

// detectAsleep(events, {now}) -> {since} when the newest power evidence says
// the box is down RIGHT NOW: a chain of Sleep events (dark wakes in between
// don't count as waking) with no later full Wake, opening at its FIRST sleep.
// The last sleep of the chain must be fresher than ONSET_LOOKBACK_MIN — an
// older open chain is either an outage the tick-gap already owns or a pmset
// log truncated by rotation, and this live field must never cry wolf.
export function detectAsleep(events, { now = Date.now() } = {}) {
    let chain = null
    for (const e of events) {
        if (e.kind === 'wake') chain = null
        else if (e.kind === 'sleep') {
            if (!chain) chain = { since: e.ms, last: e.ms }
            else chain.last = e.ms
        }
    }
    if (!chain || now - chain.last > ONSET_LOOKBACK_MIN * 60000) return null
    return { since: chain.since }
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

// asleepField(asleep, now) -> the LIVE onset token (#1392). The stamp only
// survives as long as the ticks reporting it stay fresh (the field lands on a
// pulse only when the warden runs, i.e. during a dark wake; ONSET_STALE_MIN of
// silence means the chain closed or the box went fully dark — either way the
// window/tick-gap path takes over the story).
export function asleepField(asleep, now = Date.now()) {
    if (!asleep || !Number.isFinite(asleep.since) || !Number.isFinite(asleep.seen)) return ''
    if (now - asleep.seen > ONSET_STALE_MIN * 60000) return ''
    return `asleep=true since=${fmtHM(asleep.since)}`
}

// churnField(churns, now) -> `churn=N` for the newest episode ≤ PULSE_SHOW_H
// old ("" when the box has been sleeping properly — or awake properly).
export function churnField(churns, now = Date.now()) {
    const recent = (churns || []).filter((e) => now - e.to <= PULSE_SHOW_H * 3600000)
    if (!recent.length) return ''
    return `churn=${recent[recent.length - 1].n}`
}

// sleepLine(windows, now) -> the digest/board sentence, or null. It closes
// with the one-line fix (#1392): keeping the shared Mac awake stays Jon's
// call, but the caffeinate one-liner sits one glance from the symptom.
export const CAFFEINATE_HINT = 'keep it awake: sudo pmset -a sleep 0'
export function sleepLine(windows, now = Date.now()) {
    const ws = (windows || []).filter((w) => now - w.to <= LEDGER_KEEP_H * 3600000)
    if (!ws.length) return null
    const last = ws[ws.length - 1]
    const dur = (w) => fmtDur(Math.max(1, Math.round((w.to - w.from) / 60000)))
    if (ws.length === 1) {
        return `😴 Studio was asleep ${fmtHM(last.from)}–${fmtHM(last.to)} (${dur(last)})`
            + `${last.reason ? ` · reason: ${last.reason}` : ''}`
            + `${last.naps ? ` · ${last.naps} dark wakes` : ''}`
            + ` · ${CAFFEINATE_HINT}`
    }
    const total = ws.reduce((s, w) => s + Math.max(1, Math.round((w.to - w.from) / 60000)), 0)
    const naps = ws.reduce((s, w) => s + (w.naps || 0), 0)
    return `😴 Studio asleep ×${ws.length} in ${LEDGER_KEEP_H} h, total ${fmtDur(total)}`
        + ` · latest ${fmtHM(last.from)}–${fmtHM(last.to)} (${dur(last)})`
        + `${naps ? ` · ${naps} dark wakes` : ''}`
        + ` · ${CAFFEINATE_HINT}`
}

// churnLine(churns, now) -> the digest sentence for a churning night (#1392).
// Honest framing: the tick clock never stopped, so this is NOT an outage — it
// says the box was effectively down without claiming a window it cannot prove.
export function churnLine(churns, now = Date.now()) {
    const es = (churns || []).filter((e) => now - e.to <= LEDGER_KEEP_H * 3600000)
    if (!es.length) return null
    const last = es[es.length - 1]
    if (es.length === 1) {
        return `🌀 Studio churned ${last.n} sleep cycles ${fmtHM(last.from)}–${fmtHM(last.to)} — dark wakes are not uptime · ${CAFFEINATE_HINT}`
    }
    const total = es.reduce((s, e) => s + (e.n || 0), 0)
    return `🌀 Studio churned ×${es.length} in ${LEDGER_KEEP_H} h, ${total} cycles`
        + ` · latest ${last.n} ${fmtHM(last.from)}–${fmtHM(last.to)} — dark wakes are not uptime · ${CAFFEINATE_HINT}`
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

// addChurn(existing, fresh, now) -> churn episodes, deduped by start (±60 s).
// Unlike windows, a re-seen episode UPDATES: the night is still churning, so
// the newer sighting has the larger, more honest count.
export function addChurn(existing, fresh, now = Date.now()) {
    let list = Array.isArray(existing) ? existing.slice() : []
    for (const e of fresh || []) {
        const i = list.findIndex((x) => Math.abs(x.from - e.from) < 60000)
        if (i < 0) list.push(e)
        else if ((e.n || 0) >= (list[i].n || 0)) list[i] = { ...list[i], ...e }
    }
    list = list.filter((e) => Number.isFinite(e.from) && Number.isFinite(e.to) && now - e.to <= LEDGER_KEEP_H * 3600000)
    list.sort((a, b) => a.from - b.from)
    return list.slice(-200)
}

// ---- CLI (what warden.sh runs; ledger IO lives here, not in the pure core)

const arg = (argv, name) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i < 0) return undefined
    return argv[i] === `--${name}` ? argv[i + 1] : argv[i].slice(name.length + 3)
}
const has = (argv, name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`))

// Ledger v2 shape {windows, churns, asleep}; v1 files ({windows} only) read
// fine — the extra fields just start empty (never wipe what IS there).
function readLedger(file) {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'))
        return {
            windows: Array.isArray(j.windows) ? j.windows : [],
            churns: Array.isArray(j.churns) ? j.churns : [],
            asleep: j.asleep && Number.isFinite(j.asleep.since) && Number.isFinite(j.asleep.seen) ? j.asleep : null,
        }
    } catch { return { windows: [], churns: [], asleep: null } }
}
function writeLedger(file, led) {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({
        windows: led.windows || [],
        churns: led.churns || [],
        asleep: led.asleep || null,
    }, null, 1) + '\n')
    fs.renameSync(tmp, file)
}
// pmset capture — Studio-only. v2 runs it EVERY tick (churn and onset are
// invisible in gap-only mode); SLEEPWATCH_NO_PMSET=1 keeps the harness
// deterministic on machines whose real log would leak into the pins.
function capturePmset() {
    if (process.env.SLEEPWATCH_NO_PMSET === '1') return []
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
        if (!events || !events.length) { console.log('backfilled=0 churn=0'); return }
        const ws = buildWindows(events, { until: NOW }).filter((w) => NOW - w.to <= LEDGER_KEEP_H * 3600000)
        const cs = buildChurn(events, { now: NOW })
        const as = detectAsleep(events, { now: NOW })
        const led = readLedger(file)
        if (!dry) writeLedger(file, {
            windows: addWindows(led.windows, ws, NOW),
            churns: addChurn(led.churns, cs, NOW),
            asleep: as ? { since: as.since, seen: NOW } : led.asleep,
        })
        console.log(`backfilled=${ws.length} churn=${cs.length}${dry ? ' dry' : ''}`)
        return
    }
    if (cmd === 'tick') {
        const gap = detectGap({ lastTick: arg(argv, 'last'), now: NOW / 1000 })
        const events = arg(argv, 'pmset') ? parsePmset(fs.readFileSync(arg(argv, 'pmset'), 'utf8')) : capturePmset()
        const ws = gap ? windowsForGap(gap, events || []) : []
        const cs = buildChurn(events || [], { now: NOW })
        const as = detectAsleep(events || [], { now: NOW })
        const before = readLedger(file)
        const after = addWindows(before.windows, ws, NOW)
        const afterC = addChurn(before.churns, cs, NOW)
        const asleepNow = as ? { since: as.since, seen: NOW } : null
        if (!dry) writeLedger(file, { windows: after, churns: afterC, asleep: asleepNow })
        // report what was ADDED (dedupe can swallow a re-seen outage, and an
        // already-recorded gap must not fire the warden's slept action twice).
        // churn=N is the LIVE trailing-window count (not the ledger episode),
        // asleep=1 says the box never fully woke since the stamped onset.
        console.log(`recorded=${after.length - before.windows.length} src=${ws[0]?.src || 'none'} `
            + `churn=${churnCount(events || [], { now: NOW })} asleep=${asleepNow ? 1 : 0}${dry ? ' dry' : ''}`)
        return
    }
    if (cmd === 'pulse') {
        const led = readLedger(file)
        // one `asleep` key on the wire: the live outranks the retroactive.
        const head = asleepField(led.asleep, NOW) || pulseField(led.windows, NOW)
        const tail = churnField(led.churns, NOW)
        console.log([head, tail].filter(Boolean).join(' '))
        return
    }
    if (cmd === 'line') {
        const led = readLedger(file)
        console.log([sleepLine(led.windows, NOW), churnLine(led.churns, NOW)].filter(Boolean).join('\n'))
        return
    }
    console.error('usage: sleepwatch.mjs backfill|tick|pulse|line [--last s] [--now s] [--pmset f] [--out f] [--dry]')
    process.exit(2)
}

if (process.argv[1] && process.argv[1].includes('sleepwatch.mjs')) run(process.argv.slice(2))
