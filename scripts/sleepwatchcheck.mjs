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
//      before any question (a sleeping Mac outranks every open question), and
//      the #1392 churn line right after it;
//   E. the CLI end-to-end (fixture pmset file, temp ledger, no network, no
//      pmset) — backfill/tick/pulse/line contract, dedupe, dry-run leaves no
//      ledger, the v2 churn-no-gap night, and v1 ledger files still loading;
//   F. source wiring — warden step 0 + pulse field + slept/churn/onset actions
//      + dry guard, jonq digest reads the ledger, board imports the banners,
//      checks.mjs/ci.yml/package.json carry the alias.
//
// Mutant proofs (required one): CHURN_SLEEPS 3→90 reddens §A churn + §B
// incident churn pins; GAP_MIN 30→90 still reddens §A gap + §B incident.
// Verified by hand.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    CAFFEINATE_HINT, CHURN_SLEEPS, CHURN_WINDOW_MIN, GAP_MIN, LEDGER_KEEP_H, ONSET_LOOKBACK_MIN, ONSET_STALE_MIN, PULSE_SHOW_H,
    addChurn, addWindows, asleepField, buildChurn, buildWindows, churnCount, churnField, churnLine, detectAsleep, detectGap,
    fmtDur, fmtHM, parsePmset, pulseField, sleepLine, windowsForGap,
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
    ok(one === `😴 Studio was asleep ${hm(W1.from)}–${hm(W1.to)} (11h 18m) · reason: Software Sleep · 77 dark wakes · ${CAFFEINATE_HINT}`,
        `digest sentence, one window: ${one}`)
    ok(sleepLine([W1], nowMs).endsWith(CAFFEINATE_HINT), 'the caffeinate one-liner closes the sentence (#1392)')
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

    // ---- churn + onset (#1392) ------------------------------------------
    eq(CHURN_SLEEPS, 3, 'churn needs at least three sleeps')
    eq(CHURN_WINDOW_MIN, 30, 'the churn window is three tick intervals')
    eq(ONSET_LOOKBACK_MIN, 60, 'the live onset trusts sleep evidence at most 1 h old')
    eq(ONSET_STALE_MIN, 30, 'the onset stamp decays after two missed ticks')

    // a churning night: dark wake every ~9 min, NO full wake — ticks land, the
    // box is effectively down (the exact case the tick-gap cannot see)
    const churnEv = (n, startMs, stepMin = 9) => {
        const lines = []
        for (let i = 0; i < n; i++) {
            const iso = `${new Date(startMs + i * stepMin * 60000).toISOString().slice(0, 19).replace('T', ' ')} +0000`
            lines.push(`${iso} Sleep               \tEntering Sleep state due to 'Idle Sleep': Using AC 45 secs`)
            lines.push(`${iso} DarkWake            \tDarkWake from Deep Idle [CDNP] : due to rtc/Maintenance Using AC 40 secs`)
        }
        return parsePmset(lines.join('\n'))
    }
    const CN = at('02:00:00')
    const chEp = buildChurn(churnEv(13, at('00:00:00')), { now: CN })
    eq(chEp.length, 1, 'a night of dark wakes is ONE churn episode, not thirteen')
    eq(chEp[0]?.n, 13, 'every sleep of the night is counted')
    eq(chEp[0]?.from, at('00:00:00'), 'the episode opens at the first sleep')
    eq(chEp[0]?.to, at('00:00:00') + 12 * 9 * 60000, 'stays open at the last sleep seen (no fabricated wake)')
    eq(chEp[0]?.src, 'pmset', 'churn episodes name their witness')
    eq(buildChurn(churnEv(2, at('00:00:00')), { now: CN }).length, 0, 'two sleepy moments are not churn yet')
    const splitEv = churnEv(3, at('00:00:00')).concat(churnEv(3, at('01:30:00')))
    const splitEp = buildChurn(splitEv, { now: CN })
    eq(splitEp.length, 2, 'a usable gap longer than the window starts a NEW episode')
    eq((splitEp[0]?.n ?? 0) + (splitEp[1]?.n ?? 0), 6, 'both halves count honestly')
    const wokenEv = churnEv(4, at('00:00:00')).concat([{ kind: 'wake', ms: at('00:05:00') }])
    eq(buildChurn(wokenEv, { now: CN }).length === 1 ? buildChurn(wokenEv, { now: CN })[0].n : null, 4,
        'a full wake BETWEEN sleeps does not break the episode — a lid opened for seconds is still churn')
    eq(buildChurn(churnEv(4, CN - 49 * 3600000), { now: CN }).length, 0, 'churn older than the keep-horizon is not dredged up')

    // live trailing witness for the tick log
    eq(churnCount(churnEv(13, at('00:00:00')), { now: CN }), 3, 'churnCount sees the three sleeps of the last half hour')
    eq(churnCount(churnEv(13, at('00:00:00')), { now: at('00:00:00') - 1 }), 0, 'nothing counted before the churn started')

    // live onset: first sleep of an open chain, guarded against stale evidence
    const onEv = churnEv(13, at('00:00:00'))
    eq(detectAsleep(onEv, { now: CN })?.since, at('00:00:00'), 'onset stamps the FIRST sleep of the open chain')
    eq(detectAsleep(onEv.concat([{ kind: 'wake', ms: at('01:59:00') }]), { now: CN }), null, 'a full Wake clears the live flag')
    eq(detectAsleep(onEv, { now: at('03:00:00') }), null, 'sleep evidence older than the lookback cannot cry wolf (outage or truncated log)')
    eq(detectAsleep([], { now: CN }), null, 'no events, no claim of sleep')

    // pulse tokens
    eq(asleepField({ since: at('00:00:00'), seen: CN - 5 * 60000 }, CN), `asleep=true since=${hm(at('00:00:00'))}`, 'the live token rides while the tick reporting it stays fresh')
    eq(asleepField({ since: at('00:00:00'), seen: CN - (ONSET_STALE_MIN + 1) * 60000 }, CN), '', 'the live token decays with the silent box')
    eq(asleepField(null, CN), '', 'no stamp, no token')
    eq(asleepField({ since: 'junk', seen: CN }, CN), '', 'junk stamps never ride the pulse')
    eq(churnField(chEp, CN), 'churn=13', 'the churn token names the newest episode')
    eq(churnField(chEp, CN + (PULSE_SHOW_H + 1) * 3600000), '', 'churn drops off the pulse 24 h after the episode')
    eq(churnField([], CN), '', 'a well-behaved night has no churn token')

    // digest sentences
    const cl = churnLine(chEp, CN)
    ok(cl === `🌀 Studio churned 13 sleep cycles ${hm(at('00:00:00'))}–${hm(at('00:00:00') + 12 * 9 * 60000)} — dark wakes are not uptime · ${CAFFEINATE_HINT}`,
        `churn sentence: ${cl}`)
    ok((churnLine(splitEp, CN) || '').startsWith(`🌀 Studio churned ×2 in ${LEDGER_KEEP_H} h, 6 cycles`), 'multiple churn episodes total honestly')
    eq(churnLine([], CN), null, 'no churn, no sentence')
    eq(churnLine(chEp, CN + (LEDGER_KEEP_H + 1) * 3600000), null, 'churn older than 48 h leaves the digest')

    // churn ledger hygiene: re-seen episodes UPDATE (the night keeps counting)
    const CL1 = { from: at('00:00:00'), to: at('00:18:00'), n: 3, src: 'pmset' }
    const cl2 = addChurn([CL1], [{ from: at('00:00:10'), to: at('01:48:00'), n: 13, src: 'pmset' }], CN)
    eq(cl2.length, 1, 'the same churn night seen twice stays one row (±60 s)')
    eq(cl2[0].n, 13, 'the newer, larger count wins — churn is still growing')
    eq(addChurn(cl2, [{ from: at('00:00:20'), to: at('00:18:00'), n: 4, src: 'pmset' }], CN)[0].n, 13, 'a smaller re-sighting never shrinks the record')
    eq(addChurn(cl2, [{ from: at('01:30:00'), to: at('01:48:00'), n: 3, src: 'pmset' }], CN).length, 2, 'a distinct episode appends')
    eq(addChurn(cl2, [], CN + LEDGER_KEEP_H * 3600000 + 60000).length, 0, 'prune: stale churn leaves the ledger')
    const manyC = Array.from({ length: 260 }, (_, i) => ({ from: CAPBASE + i * 600000, to: CAPBASE + i * 600000 + 60000, n: 3 }))
    eq(addChurn(manyC, [], manyC[manyC.length - 1].to).length, 200, 'the churn ledger is capped too')
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

    // v2 (#1392) view of the same verbatim night: churn saw it as it went,
    // and the onset was nameable at 00:50 — eleven hours before the Wake did.
    const iEv = parsePmset(INCIDENT)
    const iEp = buildChurn(iEv, { now: at('11:36:00', '-0700') })
    eq(iEp.length === 1 ? iEp[0].n : null, 6, 'the night\'s sleep-churn before the long quiet is ONE episode of 6 sleeps')
    eq(detectAsleep(iEv.filter((e) => e.ms <= at('00:50:00', '-0700')), { now: at('00:50:00', '-0700') })?.since, at('00:17:40', '-0700'),
        'at 00:50 pmset already said asleep-since-00:17 — the v2 live witness for the real incident')
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

    // #1392 shapes off the same wire: live onset and churn-only
    const live = sleepBanner({ asleep: 'true', since: '03:12' })
    eq(live?.text, 'STUDIO ASLEEP SINCE 03:12', 'the live onset strip names the moment it went down')
    eq(live?.severe, true, 'a box that never woke is red')
    eq(live?.live, true, 'the strip says live')
    eq(sleepBanner({ asleep: 'true' }), null, 'asleep=true without a since is junk, hidden')
    eq(sleepBanner({ asleep: 'true', since: '3:1' }), null, 'a malformed since never renders')
    const chB = sleepBanner({ churn: '7' })
    eq(chB?.text, 'STUDIO CHURNING — 7 sleeps in the last half hour', 'churn gets its own amber strip')
    eq(chB?.severe, false, 'churn is not an outage — amber, not red')
    eq(sleepBanner({ churn: '2' }), null, 'below the churn contract (3) there is no banner')
    eq(sleepBanner({ churn: 'junk' }), null, 'junk churn never renders')
    const both = sleepBanner({ asleep: '00:17-11:35', asleepm: '678', naps: '77', churn: '5' })
    ok(both?.text.startsWith('STUDIO WAS ASLEEP'), 'when the outage is named it outranks the churn token')

    // round trip: a REAL pulse line -> deriveFloor -> banner
    const line = '12:32 alive=yes queue=3 building=1 shipped=42 main=36adbf9 qa=9 mini=up gate=none halted=no questions=0 builders=2/2 asleep=00:17-11:35 asleepm=678 naps=77 actions=slept:1'
    const d = deriveFloor({ pulses: [{ body: line, updated_at: '2026-10-31T18:32:00Z', created_at: '2026-10-31T18:32:00Z' }], now: Date.parse('2026-10-31T18:33:00Z') })
    eq(d.pulse.asleep, '00:17-11:35', 'the pulse kv parser carries the asleep field')
    eq(sleepBanner(d.pulse).minutes, 678, 'the board banner reads it off the wire')
    const liveLine = '03:20 alive=yes queue=2 building=1 shipped=41 main=abc1234 qa=8 mini=up gate=none halted=no questions=0 builders=2/2 asleep=true since=03:12 churn=7 actions=churn:1,onset:1'
    const dl = deriveFloor({ pulses: [{ body: liveLine, updated_at: '2026-10-31T03:20:00Z', created_at: '2026-10-31T03:20:00Z' }], now: Date.parse('2026-10-31T03:21:00Z') })
    eq(dl.pulse.asleep, 'true', 'the live shape survives the kv wire')
    eq(dl.pulse.since, '03:12', 'the onset minute rides as its own token')
    eq(sleepBanner(dl.pulse).text, 'STUDIO ASLEEP SINCE 03:12', 'the live strip composes straight off the wire')
    const churnLine2 = '04:00 alive=yes queue=2 building=1 shipped=41 main=abc1234 qa=8 mini=up gate=none halted=no questions=0 builders=2/2 churn=5 actions=churn:1'
    eq(sleepBanner(deriveFloor({ pulses: [{ body: churnLine2, updated_at: '2026-10-31T04:00:00Z', created_at: '2026-10-31T04:00:00Z' }], now: Date.parse('2026-10-31T04:01:00Z') }).pulse).text,
        'STUDIO CHURNING — 5 sleeps in the last half hour', 'churn reads off a real pulse line too')
    const JSX = read(path.join('..', 'src', 'pages', 'ForgeBoard.jsx'))
    ok(JSX.includes('sleepBanner') && JSX.includes('data-sleep'), 'ForgeBoard imports sleepBanner and renders the strip')
    ok(JSX.includes('data-live') && JSX.includes('sleep.hint'), 'ForgeBoard marks the live strip and renders its hint (#1392)')
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

    // #1392 — the churn sentence rides right after the sleep sentence, still
    // ahead of every question (a half-asleep Mac explains stalled lanes too).
    const CHS = '🌀 Studio churned 13 sleep cycles 00:17–01:48 — dark wakes are not uptime'
    const wc = digestText({ questions: q, sleep: '😴 Studio was asleep 00:17–11:35 (11h 18m)', churn: CHS, now: new Date('2026-10-31T12:00:00Z') })
    const wcl = wc.split('\n')
    eq(wcl[1], '😴 Studio was asleep 00:17–11:35 (11h 18m)', 'sleep still leads')
    eq(wcl[2], CHS, 'churn follows sleep, before the questions')
    const co = digestText({ questions: q, churn: CHS, now: new Date('2026-10-31T12:00:00Z') })
    eq(co.split('\n')[1], CHS, 'churn alone still outranks every question')
    ok(!digestText({ questions: q }).includes('🌀'), 'no churn ledger, no churn sentence')
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
    const sw = (...a) => execFileSync(process.execPath, [cli, ...a], { encoding: 'utf8', env: { ...process.env, SLEEPWATCH_NO_PMSET: '1' } }).trim()
    const NOWS = Math.floor(at('12:00:00') / 1000)

    eq(sw('backfill', `--pmset=${pm}`, `--out=${led}`, `--now=${NOWS}`), 'backfilled=1 churn=0', 'backfill records the incident from pmset history')
    eq(sw('backfill', `--pmset=${pm}`, `--out=${led}`, `--now=${NOWS}`), 'backfilled=1 churn=0', 'backfill again re-derives the same window')
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
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=1 src=pmset churn=0 asleep=0', 'tick records a new gap window')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=0 src=pmset churn=0 asleep=0', 'the same gap re-ticked adds nothing (dedupe)')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0 src=none churn=0 asleep=0', 'a normal 10-min tick records nothing')
    eq(sw('tick', `--last=`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0 src=none churn=0 asleep=0', 'empty --last (first tick ever) records nothing')
    const dryLed = path.join(dir, 'dry.json')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${dryLed}`, '--dry').replace(/ dry$/, ''), 'recorded=1 src=pmset churn=0 asleep=0', 'dry tick reports the same shape…')
    ok(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${dryLed}`, '--dry').endsWith(' dry'), '…and marks itself dry')
    eq(fs.existsSync(dryLed), false, '--dry writes no ledger')

    // no pmset evidence -> honest raw window
    const rawLed = path.join(dir, 'raw.json')
    fs.writeFileSync(path.join(dir, 'empty.txt'), '')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${path.join(dir, 'empty.txt')}`, `--out=${rawLed}`), 'recorded=1 src=tickgap churn=0 asleep=0', 'no pmset events -> raw tick-gap window')

    // #1392 churn night end-to-end: dark wakes every 9 min, NO tick gap. The
    // outage path stays shut; churn and the live onset carry the whole story,
    // and the onset clears when the box finally fully wakes.
    const churnLed = path.join(dir, 'churn.json')
    const churnPm = path.join(dir, 'churn.txt')
    const CH0 = Math.floor(at('00:00:00') / 1000)
    const churnLines = Array.from({ length: 3 }, (_, i) => [
        `2026-10-31 00:0${i}:0${i} +0000 Sleep               \tEntering Sleep state due to 'Idle Sleep': Using AC 45 secs`,
        `2026-10-31 00:${12 + i * 3}:00 +0000 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to rtc/Maintenance Using AC 40 secs`,
    ].flat().join('\n')).join('\n')
    fs.writeFileSync(churnPm, churnLines)
    const CHN = Math.floor(at('00:20:00') / 1000)
    eq(sw('tick', `--last=${CHN - 600}`, `--now=${CHN}`, `--pmset=${churnPm}`, `--out=${churnLed}`), 'recorded=0 src=none churn=3 asleep=1',
        'a churning night with landing ticks records NO window but names churn and the live onset')
    eq(sw('pulse', `--out=${churnLed}`, `--now=${CHN}`), `asleep=true since=${hm(at('00:00:00'))} churn=3`, 'the live pulse rides while the churn is current')
    ok(sw('line', `--out=${churnLed}`, `--now=${CHN}`).includes('🌀 Studio churned 3 sleep cycles'), 'the churn sentence reaches the digest line with no 😴 window behind it')
    eq(sw('line', `--out=${churnLed}`, `--now=${CHN}`).includes('😴'), false, 'no window fabricated for an open churn chain')
    const wakeLedger = JSON.parse(fs.readFileSync(churnLed, 'utf8'))
    eq(wakeLedger.windows.length, 0, 'the churn ledger holds no outage windows')
    eq(wakeLedger.churns.length, 1, 'the churn episode is on the ledger')
    eq(wakeLedger.asleep !== null, true, 'the onset stamp persists between ticks')
    const calmPm = path.join(dir, 'calm.txt')
    fs.writeFileSync(calmPm, `${churnLines}\n2026-10-31 00:25:00 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to HID Activity Using AC`)
    eq(sw('tick', `--last=${CHN}`, `--now=${Math.floor(at('00:26:00') / 1000)}`, `--pmset=${calmPm}`, `--out=${churnLed}`), 'recorded=0 src=none churn=3 asleep=0',
        'the full Wake clears the live flag on the next tick')
    eq(sw('pulse', `--out=${churnLed}`, `--now=${Math.floor(at('00:26:00') / 1000)}`), 'churn=3', 'after the wake only the churn token remains')

    // a v1 ledger ({windows} only) still reads — the new fields just start empty
    const v1Led = path.join(dir, 'v1.json')
    fs.writeFileSync(v1Led, JSON.stringify({ windows: [{ from: at('00:17:40'), to: at('11:35:23'), min: 678, naps: 2, reason: 'Software Sleep', src: 'pmset' }] }))
    eq(sw('pulse', `--out=${v1Led}`, `--now=${NOWS}`), `asleep=${hm(at('00:17:40'))}-${hm(at('11:35:23'))} asleepm=678 naps=2`, 'v1 ledgers keep pulsing unchanged')

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
    ok(W.includes('churn:1') && W.includes('onset:1'), '#1392: churn and live onset are ACTIONS entries too')
    ok(W.includes('sleepwatch v2:'), 'churn/onset news reaches the warden log even with no gap to record')
    ok(W.includes('[[ -s "$SW" ]]'), 'warden guards on a NON-empty materialised script (git-show failures leave 0-byte files)')
    ok(W.includes(`[[ "$DRY" != 1 ]] && print -r -- "$NOWN" > "$LOG_DIR/warden.lasttick"`), 'dry ticks never touch the lasttick stamp')
    ok(W.includes('origin/main:scripts/sleepwatch.mjs'), 'warden materialises sleepwatch from origin/main (launchd-safe)')

    const jq = read(path.join('jonq.mjs'))
    ok(jq.includes("import { churnLine, sleepLine } from './sleepwatch.mjs'"), 'jonq digest imports both sleep sentences')
    ok(jq.includes('FORGE_ASLEEP'), 'jonq reads the ledger (path overridable for harness/other machines)')
    ok(jq.includes('churnLine(led.churns'), 'jonq derives the churn sentence from the ledger')
    ok(jq.includes('digestText({ questions, runway, sleep, churn, now }'), 'jonq passes the churn line into the digest')

    const RW = read(path.join('lib', 'runway.mjs'))
    ok(RW.indexOf('if (sleep) lines.push(sleep)') < RW.indexOf('if (churn) lines.push(churn)'), 'digestText places churn right after sleep')
    ok(RW.indexOf('if (churn) lines.push(churn)') < RW.indexOf('if (questions.length === 0)'), '…and still before the questions')

    ok(CORE.checks.includes('sleepwatchcheck'), 'checks.mjs carries the alias (core scope)')
    ok(JSON.parse(read(path.join('..', 'package.json'))).scripts.sleepwatchcheck === 'node scripts/sleepwatchcheck.mjs', 'package.json alias exists')
    ok(read(path.join('..', '.github', 'workflows', 'ci.yml')).includes('npm run sleepwatchcheck'), 'ci.yml runs it in the core gate')
}

console.log(`\x1b[1m\nsleepwatchcheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
