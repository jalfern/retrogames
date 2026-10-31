// SLEEPWATCH — notice when the Studio was asleep (#1354), pinned offline.
//
//   npm run sleepwatchcheck
//
// Layers:
//   A. scripts/sleepwatch.mjs (pure) — the pmset grammar (only "Entering
//      Sleep state" / "DarkWake…" / "Wake from…" are power events; the
//      lookalike "Wake Requests"/"WakeDetails" columns never count), dark
//      wakes bridge into the window and count as naps, windows shorter than
//      GAP_MIN drop, the tick-gap threshold is FLOORed (29m59s of drift is
//      not an outage), reasons strip their pid, formats are exact, recency
//      windows (pulse 24 h, digest 48 h), the ledger dedupes ±60 s, prunes
//      and caps;
//   B. the real Oct 31 incident as a verbatim pmset fixture — the failure
//      that motivated the issue must replay exactly: 00:17→11:35, reason
//      "Software Sleep", dark wakes counted, 11h 18m;
//   C. the board — floor.js sleepBanner maps the pulse kv block to the red
//      strip (text, severity, junk-safe), round-tripped through deriveFloor
//      on a REAL pulse line;
//   D. the digest — digestText puts the sleep line FIRST, under the header,
//      before any question (a sleeping Mac outranks every open question);
//   E. the CLI end-to-end (fixture pmset file, temp ledger, no network, no
//      pmset) — backfill/tick/pulse/line contract, dedupe, dry-run leaves no
//      ledger;
//   F. source wiring — warden step 0 + pulse field + slept action + dry
//      guard, jonq digest reads the ledger, board imports the banner,
//      checks.mjs/ci.yml/package.json carry the alias.
//
// Mutant proof (required one): change GAP_MIN in scripts/sleepwatch.mjs from
// 30 to 90 -> §A threshold + §B incident fixtures go red. Verified by hand.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    GAP_MIN, LEDGER_KEEP_H, PULSE_SHOW_H,
    addWindows, buildWindows, detectGap, fmtDur, fmtHM, parsePmset,
    pulseField, sleepLine, windowsForGap,
} from './sleepwatch.mjs'
import { deriveFloor, sleepBanner } from '../src/pages/floor.js'
import { digestText } from './lib/runway.mjs'
import { CORE } from './checks.mjs'

const here = dirnameOf(fileURLToPath(import.meta.url))
function dirnameOf(u) { return path.dirname(u) }
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const eq = (got, want, m) => ok(got === want, `${m}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// machine-portable HH:MM (same 24h zero-padded shape fmtHM promises)
const hm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const at = (hmss, off = '+00:00') => Date.parse(`2026-10-31T${hmss}${off}`)

section('A. pure core')
{
    // the pmset grammar: real events only — lookalike columns never count
    const FIXTURE = [
        `2026-10-31 00:17:40 +0000 Sleep               \tEntering Sleep state due to 'Software Sleep pid=79692':TCPKeepAlive=active Using AC (Charge:0%) 11 secs`,
        `2026-10-31 00:17:42 +0000 Wake Requests       \t[process=mDNSResponder request=Maintenance deltaSecs=7198 wakeAt=2026-10-31 02:17:40 info="upkeep wake"]`,
        `2026-10-31 00:17:51 +0000 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to smc.sysState.Wake(0x70070000) wifibt SMC.OutboxNotEmpty E_RX_IP_PACKET ARPT/ Using AC (Charge:0%) 45 secs`,
        `2026-10-31 00:18:36 +0000 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=active Using AC (Charge:0%) 10 secs`,
        `2026-10-31 00:18:46 +0000 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to bluetooth-pcie/ Using AC (Charge:0%) 1 secs`,
        `2026-10-31 00:18:47 +0000 Sleep               \tEntering Sleep state due to 'Dark Wake Thermal Emergency':TCPKeepAlive=inactive Using AC (Charge:0%) 60 secs`,
        `2026-10-31 01:00:00 +0000 Assertions          \tSummary- [System: PrevIdle] Using AC`,
        `2026-10-31 11:35:23 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to smc.sysState.Wake(0x70070000) HID Activity Using AC (Charge:0%)`,
        `2026-10-31 11:35:24 +0000 WakeDetails         \tDriverReason:smc.sysState.Wake(0x70070000) - DriverDetails:`,
        `not a pmset line at all`,
    ].join('\n')
    const ev = parsePmset(FIXTURE)
    eq(ev.length, 6, 'only Sleep/DarkWake/Wake power lines parse (requests, details, assertions, junk drop)')
    eq(ev[0].kind, 'sleep', 'first event is the Software Sleep')
    eq(ev[0].reason, 'Software Sleep', 'reason strips its pid')
    eq(ev[0].ms, at('00:17:40'), 'pmset offset is honored in the epoch')
    eq(ev.filter((e) => e.kind === 'dark').length, 2, 'both dark wakes parse')
    eq(ev[ev.length - 1].kind, 'wake', 'the HID wake closes the incident')

    const ws = buildWindows(ev)
    eq(ws.length, 1, 'dark wakes between sleep and wake are ONE window, not many')
    eq(ws[0].from, at('00:17:40'), 'window opens at the first Sleep')
    eq(ws[0].to, at('11:35:23'), 'window closes at the full Wake')
    eq(ws[0].naps, 2, 'the dark wakes are counted as naps')
    eq(ws[0].reason, 'Software Sleep', 'the window names the reason it went down')
    eq(ws[0].min, 678, 'span in minutes, honestly measured')
    eq(ws[0].src, 'pmset', 'a pmset-named window says so')

    // short naps are not outages; open windows extend to `until`
    const shortEv = parsePmset([
        `2026-10-31 05:00:00 +0000 Sleep               \tEntering Sleep state due to 'Idle Sleep': Using AC 300 secs`,
        `2026-10-31 05:06:00 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to HID Activity Using AC`,
    ].join('\n'))
    eq(buildWindows(shortEv).length, 0, 'a 6-minute sleep lost no ticks and is no outage')

    const openEv = parsePmset(`2026-10-31 06:00:00 +0000 Sleep               \tEntering Sleep state due to 'Software Sleep': Using AC`)
    const openWs = buildWindows(openEv, { until: at('07:05:00') })
    eq(openWs.length === 1 ? openWs[0].to : null, at('07:05:00'), 'a still-open window extends to `until` (last sighting)')
    ok(buildWindows([]).length === 0, 'no events, no windows')

    // the tick-gap threshold (FLOOR, not round)
    const N = 1_793_500_000
    eq(detectGap({ lastTick: N - 29 * 60, now: N }), null, '29 min gap is drift, not an outage')
    eq(detectGap({ lastTick: N - 30 * 60 + 1, now: N }), null, '29m59s floors to 29 — a hair short of the claim stays null')
    const g = detectGap({ lastTick: N - 30 * 60, now: N })
    ok(g && g.min === 30 && g.src === 'tickgap', 'exactly GAP_MIN records a raw tickgap window')
    eq(detectGap({ lastTick: '', now: N }), null, 'empty last-tick (first tick ever) never claims an outage')
    eq(detectGap({ lastTick: null, now: N }), null, 'null last-tick never claims an outage')
    eq(detectGap({ lastTick: 'not-a-number', now: N }), null, 'junk last-tick never claims an outage')

    // windowsForGap: pmset names win; otherwise the raw gap is the claim
    const gapBig = { from: at('00:10:00'), to: at('11:40:00'), min: 690, naps: 0, reason: null, src: 'tickgap' }
    const refined = windowsForGap(gapBig, ev)
    eq(refined.length === 1 ? refined[0].src : null, 'pmset', 'a gap with pmset evidence reports the named window')
    eq(windowsForGap(gapBig, []).length, 1, 'no pmset evidence still reports the honest raw gap')
    eq(windowsForGap(gapBig, [])[0].src, 'tickgap', 'and marks it as tick-gap, cause unknown')
    // a sleep that started up to 15 min before the last tick still belongs to the gap
    const preEv = parsePmset(`2026-10-31 00:02:00 +0000 Sleep               \tEntering Sleep state due to 'Software Sleep': Using AC`)
        .concat([{ kind: 'wake', ms: at('05:00:00') }])
    const preWs = windowsForGap(gapBig, preEv)
    eq(preWs.length === 1 ? preWs[0].from : null, at('00:02:00'), 'sleep just before the tick is still the outage')
    ok(windowsForGap(null, ev).length === 0, 'no gap, no windows')

    // formats (pinned per the session-68 lesson: render, read, then pin)
    eq(fmtDur(45), '45m', 'sub-hour durations are minutes')
    eq(fmtDur(60), '1h 00m', 'whole hours zero-pad the minutes')
    eq(fmtDur(678), '11h 18m', 'the incident reads 11h 18m')
    eq(fmtHM(at('00:17:40')), hm(at('00:17:40')), 'fmtHM is local HH:MM zero-padded (portable check)')

    // recency: pulse 24 h, digest 48 h
    const W1 = { from: at('00:17:40'), to: at('11:35:23'), min: 678, naps: 77, reason: 'Software Sleep' }
    const nowMs = at('12:00:00')
    const field = pulseField([W1], nowMs)
    eq(field, `asleep=${hm(W1.from)}-${hm(W1.to)} asleepm=678 naps=77`, 'pulse field: window, minutes, naps')
    eq(pulseField([{ ...W1, naps: 0 }], nowMs), `asleep=${hm(W1.from)}-${hm(W1.to)} asleepm=678`, 'no dark wakes = no naps token')
    eq(pulseField([W1], nowMs + (PULSE_SHOW_H + 1) * 3600000), '', 'the field drops off the pulse 24 h after the window ends')
    eq(pulseField([], nowMs), '', 'nothing recorded, no field')
    ok(pulseField([W1], nowMs + (PULSE_SHOW_H - 1) * 3600000).startsWith('asleep='), 'the field rides for 23 h, too (still yesterday news)')

    const one = sleepLine([W1], nowMs)
    ok(one === `😴 Studio was asleep ${hm(W1.from)}–${hm(W1.to)} (11h 18m) · reason: Software Sleep · 77 dark wakes`,
        `digest sentence, one window: ${one}`)
    const two = sleepLine([W1, { from: at('12:30:00'), to: at('13:30:00'), min: 60, naps: 0, reason: 'Idle Sleep' }], nowMs)
    ok(two.startsWith(`😴 Studio asleep ×2 in ${LEDGER_KEEP_H} h, total 12h 18m`), `multi-window digest sentence totals: ${two}`)
    eq(sleepLine([W1], nowMs + (LEDGER_KEEP_H + 1) * 3600000), null, 'outages older than 48 h leave the digest')
    eq(sleepLine([], nowMs), null, 'no ledger, no sentence')

    // ledger hygiene
    const led = addWindows([W1], [{ ...W1, reason: 'rewritten' }], nowMs)
    eq(led.length, 1, 'the same outage seen twice is one row (±60 s dedupe)')
    eq(led[0].reason, 'Software Sleep', 'the first sighting is the record')
    const led2 = addWindows(led, [{ from: at('12:30:00'), to: at('13:30:00'), min: 60 }], nowMs)
    eq(led2.length === 2 ? led2[1].from : null, at('12:30:00'), 'a new outage appends after the old')
    eq(addWindows(led, [], nowMs + LEDGER_KEEP_H * 3600000 + 60000).length, 0, 'prune: >48 h old windows leave the ledger')
    const CAPBASE = 1_793_000_000_000
    const many = Array.from({ length: 260 }, (_, i) => ({ from: CAPBASE + i * 600000, to: CAPBASE + i * 600000 + 60000, min: 1 }))
    eq(addWindows(many, [], many[many.length - 1].to).length, 200, 'the ledger is capped (newest survive)')
}

section('B. the real Oct 31 incident replays')
{
    // verbatim-shape lines from `pmset -g log` on the Studio (Oct 31 2026)
    const INCIDENT = [
        `2026-10-31 00:17:40 -0700 Sleep               \tEntering Sleep state due to 'Software Sleep pid=79692':TCPKeepAlive=active Using AC (Charge:0%) 11 secs`,
        `2026-10-31 00:17:42 -0700 Wake Requests       \t[process=mDNSResponder request=Maintenance deltaSecs=7198 wakeAt=2026-10-31 02:17:40 info="upkeep wake"] [*process=dasd request=TimerPlugin deltaSecs=920]`,
        `2026-10-31 00:17:51 -0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to smc.sysState.Wake(0x70070000) wifibt SMC.OutboxNotEmpty E_RX_IP_PACKET ARPT/ Using AC (Charge:0%) 45 secs`,
        `2026-10-31 00:18:36 -0700 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=active Using AC (Charge:0%) 10 secs`,
        `2026-10-31 00:18:46 -0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to smc.sysState.Wake(0x70070000) wifbt SMC.OutboxNotEmpty E_RX_IP_PACKET ARPT/ Using AC (Charge:0%) 45 secs`,
        `2026-10-31 00:19:31 -0700 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=active Using AC (Charge:0%) 11 secs`,
        `2026-10-31 00:19:42 -0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to bluetooth-pcie/ Using AC (Charge:0%) 1 secs`,
        `2026-10-31 00:19:43 -0700 Sleep               \tEntering Sleep state due to 'Dark Wake Thermal Emergency':TCPKeepAlive=inactive Using AC (Charge:0%) 23 secs`,
        `2026-10-31 00:20:06 -0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to E_RX_IP_PACKET ARPT/ Using AC (Charge:0%) 1 secs`,
        `2026-10-31 00:20:07 -0700 Sleep               \tEntering Sleep state due to 'Dark Wake Thermal Emergency':TCPKeepAlive=inactive Using AC (Charge:0%) 21 secs`,
        `2026-10-31 00:39:42 -0700 DarkWake            \tDarkWake from Deep Idle [CDNPB] : due to NUB.SPMI0Sw3IRQ nub-spmi0.0x02 rtc/SleepService Using AC (Charge:0%) 359 secs`,
        `2026-10-31 00:45:41 -0700 Sleep               \tEntering Sleep state due to 'Dark Wake Thermal Emergency':TCPKeepAlive=inactive Using AC (Charge:0%) 1002 secs`,
        `2026-10-31 11:23:18 -0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to NUB.SPMI0Sw3IRQ nub-spmi0.0x02 rtc/Maintenance Using AC (Charge:0%) 45 secs`,
        `2026-10-31 11:24:03 -0700 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=inactive Using AC (Charge:0%) 680 secs`,
        `2026-10-31 11:35:23 -0700 Wake                \tWake from Deep Idle [CDNVA] : due to smc.sysState.Wake(0x70070000) wifibt SMC.OutboxNotEmpty bluetooth-pcie/HID Activity Using AC (Charge:0%)`,
    ].join('\n')
    const w = buildWindows(parsePmset(INCIDENT))
    eq(w.length, 1, 'the whole 11-hour night — thermal emergencies and dark wakes included — is ONE outage')
    eq(w[0].reason, 'Software Sleep', 'and it names the human who started it (issue text: "put to sleep by hand")')
    eq(w[0].naps, 6, 'every maintenance dark wake of the night is counted')
    ok(w[0].min >= 670 && w[0].min <= 680, `the outage spans ~11.3 h as the issue says (${w[0].min} min)`)
}

section('C. the board banner (floor.js)')
{
    eq(sleepBanner(null), null, 'no pulse, no banner')
    eq(sleepBanner({}), null, 'a pulse without the field shows no banner')
    eq(sleepBanner({ asleep: 'garbage', asleepm: '60' }), null, 'a malformed window never renders')
    eq(sleepBanner({ asleep: '01:00-02:00' }), null, 'missing minutes = no banner (never invent duration)')
    eq(sleepBanner({ asleep: '01:00-02:00', asleepm: '0' }), null, 'zero-minute banner is nonsense, hidden')
    const b = sleepBanner({ asleep: '00:17-11:35', asleepm: '678', naps: '77' })
    // the board treats the window as an opaque token (the warden formatted it
    // in its own local time at send) — the banner only en-dashes and decorates.
    eq(b.text, 'STUDIO WAS ASLEEP 00:17–11:35 · 11h 18m · 77 dark wakes', 'banner text: window · duration · naps')
    eq(b.severe, true, 'an 11-hour outage is red')
    eq(b.minutes, 678, 'minutes ride along for the harness/JSX')
    const soft = sleepBanner({ asleep: '01:00-01:45', asleepm: '45' })
    eq(soft.severe, false, 'a short outage is amber, not red')
    eq(soft.text.includes('dark wakes'), false, 'no naps, no naps clause')

    // round trip: a REAL pulse line -> deriveFloor -> banner
    const line = '12:32 alive=yes queue=3 building=1 shipped=42 main=36adbf9 qa=9 mini=up gate=none halted=no questions=0 builders=2/2 asleep=00:17-11:35 asleepm=678 naps=77 actions=slept:1'
    const d = deriveFloor({ pulses: [{ body: line, updated_at: '2026-10-31T18:32:00Z', created_at: '2026-10-31T18:32:00Z' }], now: Date.parse('2026-10-31T18:33:00Z') })
    eq(d.pulse.asleep, '00:17-11:35', 'the pulse kv parser carries the asleep field')
    eq(sleepBanner(d.pulse).minutes, 678, 'the board banner reads it off the wire')
    const JSX = read(path.join('..', 'src', 'pages', 'ForgeBoard.jsx'))
    ok(JSX.includes('sleepBanner') && JSX.includes('data-sleep'), 'ForgeBoard imports sleepBanner and renders the strip')
}

section('D. the questions digest')
{
    const q = [{ number: 1, title: 'Which sprite?', state: 'AWAITING', lane: 'games', defaultText: 'the horse', deadline: null }]
    const d = digestText({ questions: q, runway: { line: 'Builder: ~2 days queued' }, sleep: '😴 Studio was asleep 00:17–11:35 (11h 18m)', now: new Date('2026-10-31T12:00:00Z') })
    const lines = d.split('\n')
    eq(lines[0], 'FORGE QUESTIONS DIGEST — 2026-10-31', 'digest header unchanged')
    eq(lines[1], '😴 Studio was asleep 00:17–11:35 (11h 18m)', 'the sleep sentence opens the digest — it outranks the questions')
    ok(d.trimEnd().endsWith('⏱ Builder: ~2 days queued'), 'the runway line still closes the digest (#1201 unchanged)')
    const quiet = digestText({ questions: [] })
    ok(!quiet.includes('😴'), 'no sleep ledger = a quiet digest unchanged')
    eq(quiet.split('\n')[1], '(no open questions)', 'the quiet digest is byte-identical otherwise')
}

section('E. CLI end-to-end (fixture pmset, temp ledger, no network)')
{
    const cli = path.join(here, 'sleepwatch.mjs')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepwatch-'))
    const led = path.join(dir, 'asleep.json')
    const pm = path.join(dir, 'pmset.txt')
    fs.writeFileSync(pm, [
        `2026-10-31 00:17:40 +0000 Sleep               \tEntering Sleep state due to 'Software Sleep pid=79692': Using AC (Charge:0%) 11 secs`,
        `2026-10-31 00:17:51 +0000 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to SMC.OutboxNotEmpty Using AC (Charge:0%) 45 secs`,
        `2026-10-31 11:35:23 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to HID Activity Using AC (Charge:0%)`,
    ].join('\n'))
    const sw = (...a) => execFileSync(process.execPath, [cli, ...a], { encoding: 'utf8' }).trim()
    const NOWS = Math.floor(at('12:00:00') / 1000)

    eq(sw('backfill', `--pmset=${pm}`, `--out=${led}`, `--now=${NOWS}`), 'backfilled=1', 'backfill records the incident from pmset history')
    eq(sw('backfill', `--pmset=${pm}`, `--out=${led}`, `--now=${NOWS}`), 'backfilled=1', 'backfill again re-derives the same window')
    const ledAfterTwice = JSON.parse(fs.readFileSync(led, 'utf8')).windows
    eq(ledAfterTwice.length, 1, 'and the ledger still holds ONE row (dedupe survives re-backfill)')

    const pulseOut = sw('pulse', `--out=${led}`, `--now=${NOWS}`)
    eq(pulseOut, `asleep=${hm(at('00:17:40'))}-${hm(at('11:35:23'))} asleepm=678 naps=1`, 'pulse CLI emits the line tokens')
    ok(sw('line', `--out=${led}`, `--now=${NOWS}`).startsWith('😴 Studio was asleep'), 'line CLI emits the digest sentence')

    // a fresh gap ticks a NEW outage onto the existing ledger
    const gapPm = path.join(dir, 'pmset2.txt')
    fs.writeFileSync(gapPm, [
        `2026-10-31 11:20:00 +0000 Sleep               \tEntering Sleep state due to 'Idle Sleep': Using AC`,
        `2026-10-31 11:55:00 +0000 Wake                \tWake from Deep Idle : due to HID Activity`,
    ].join('\n'))
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=1 src=pmset', 'tick records a new gap window')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=0 src=pmset', 'the same gap re-ticked adds nothing (dedupe)')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0', 'a normal 10-min tick records nothing')
    eq(sw('tick', `--last=`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0', 'empty --last (first tick ever) records nothing')
    const dryLed = path.join(dir, 'dry.json')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${dryLed}`, '--dry').replace(/ dry$/, ''), 'recorded=1 src=pmset', 'dry tick reports the same shape…')
    ok(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${dryLed}`, '--dry').endsWith(' dry'), '…and marks itself dry')
    eq(fs.existsSync(dryLed), false, '--dry writes no ledger')

    // no pmset evidence -> honest raw window
    const rawLed = path.join(dir, 'raw.json')
    fs.writeFileSync(path.join(dir, 'empty.txt'), '')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${path.join(dir, 'empty.txt')}`, `--out=${rawLed}`), 'recorded=1 src=tickgap', 'no pmset events -> raw tick-gap window')
    let badExit = 0
    try { execFileSync(process.execPath, [cli, 'nope'], { encoding: 'utf8' }) } catch (e) { badExit = e.status }
    eq(badExit, 2, 'an unknown CLI subcommand exits 2 with usage')
    fs.rmSync(dir, { recursive: true, force: true })
}

section('F. wiring tripwires')
{
    const W = read(path.join('warden.sh'))
    ok(W.includes('0. SLEEP WATCH'), 'warden.sh carries step 0 (sleep watch)')
    ok(W.includes('warden.lasttick'), 'warden stamps its tick start')
    ok(W.includes('asleep.json'), 'warden keeps the sleep ledger')
    ok(W.includes('$ASLEEP') && W.includes('builders=$nb/2$suf actions=$2'), 'pulse_line splices the precomputed field in place (warden does no time math itself)')
    ok(W.includes('slept:1'), 'a recorded outage is an ACTIONS entry (follow-up pulse + log line)')
    ok(W.includes('[[ -s "$SW" ]]'), 'warden guards on a NON-empty materialised script (git-show failures leave 0-byte files)')
    ok(W.includes(`[[ "$DRY" != 1 ]] && print -r -- "$NOWN" > "$LOG_DIR/warden.lasttick"`), 'dry ticks never touch the lasttick stamp')
    ok(W.includes('origin/main:scripts/sleepwatch.mjs'), 'warden materialises sleepwatch from origin/main (launchd-safe)')

    const jq = read(path.join('jonq.mjs'))
    ok(jq.includes("import { sleepLine } from './sleepwatch.mjs'"), 'jonq digest imports the sleep line')
    ok(jq.includes('FORGE_ASLEEP'), 'jonq reads the ledger (path overridable for harness/other machines)')
    ok(jq.includes('digestText({ questions, runway, sleep, now }'), 'jonq passes the sleep line into the digest')

    const RW = read(path.join('lib', 'runway.mjs'))
    ok(RW.indexOf('if (sleep) lines.push(sleep)') < RW.indexOf('if (questions.length === 0)'), 'digestText places sleep BEFORE the questions')

    ok(CORE.checks.includes('sleepwatchcheck'), 'checks.mjs carries the alias (core scope)')
    ok(JSON.parse(read(path.join('..', 'package.json'))).scripts.sleepwatchcheck === 'node scripts/sleepwatchcheck.mjs', 'package.json alias exists')
    ok(read(path.join('..', '.github', 'workflows', 'ci.yml')).includes('npm run sleepwatchcheck'), 'ci.yml runs it in the core gate')
}

console.log(`\x1b[1m\nsleepwatchcheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
