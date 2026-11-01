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
//      the #1392 churn line right after it; the #1401 live line outranks both;
//   E. the CLI end-to-end (fixture pmset file, temp ledger, no network, no
//      pmset) — backfill/tick/pulse/line contract, dedupe, dry-run leaves no
//      ledger, the v2 churn-no-gap night, the v3 deep-dark night (the stamp
//      rides through a failed pmset capture and a lookback-aged chain, and
//      dies only to a visible Wake), and v1 ledger files still loading;
//   F. source wiring — warden step 0 + pulse field + slept/churn/onset actions
//      + dry guard + the v3 held line, jonq digest reads the ledger, board
//      imports the banners, checks.mjs/ci.yml/package.json carry the alias.
//
// v4 (#1406): §A gains coalesceWindows (adjacent raw tick-gap segments merge
// into ONE night; a later pmset window retires the raw scaffolding it covers)
// and pmsetCoverage/utcDay (the log's visible span, reported once per day);
// §C gains the pulse-age budget on the LIVE strips; §E re-pins the deep-dark
// night to the merged truth (asleep=00:20→11:30, not the last 6 h) and pins
// once-per-day span reporting + suppression; §F threads pulseAge/pulse v4 log.
//
// Mutant proofs (required one): CHURN_SLEEPS 3→90 reddens §A churn + §B
// incident churn pins; GAP_MIN 30→90 still reddens §A gap + §B incident.
// v3 (#1401): inverting the disprove comparison in resolveAsleep (wake never
// clears) reddens §A resolve + §E wake-tick pins; hardcoding CHURN_WINDOW_MIN
// to 45 reddens the derive pin and every churnwin token pin.
// v4 (#1406): widening the coalesce seam test `<= maxGapMin` to `>=` reddens
// 15 gates (budget pins + the whole deep-dark night); inverting the freshness
// budget in floor.js (`age <= LIVE_SHOWN_MS` → `>=`) reddens 6 §C gates (fresh
// strips die, stale ones return); disabling the merge branch reddens 15;
// deleting the `covered(w)` drop reddens exactly the scaffolding-retirement
// pin (1 — correctly narrow); removing the once-per-day span gate reddens 5
// suppression pins. Verified by hand, all restored green (274/0).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    CAFFEINATE_HINT, CHURN_SLEEPS, CHURN_WINDOW_MIN, COALESCE_GAP_MIN, GAP_MIN, LEDGER_KEEP_H, ONSET_LOOKBACK_MIN, ONSET_STALE_MIN, PULSE_SHOW_H, TICK_MIN,
    addChurn, addWindows, asleepField, buildChurn, buildWindows, churnCount, churnField, churnLine, coalesceWindows, detectAsleep, detectGap,
    fmtDur, fmtHM, liveLine, liveValid, parsePmset, pmsetCoverage, pulseField, resolveAsleep, sleepLine, utcDay, windowsForGap,
} from './sleepwatch.mjs'
import { deriveFloor, LIVE_SHOWN_MS, sleepBanner } from '../src/pages/floor.js'
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

    // ---- coalesce (#1406) — one outage night told once ----------------
    eq(COALESCE_GAP_MIN, 2 * TICK_MIN, 'the raw seam budget DERIVES from the cadence: two tick intervals, one place')
    const RW = (f, t, extra = {}) => ({ from: at(f), to: at(t), min: Math.round((at(t) - at(f)) / 60000), naps: 0, reason: null, src: 'tickgap', ...extra })
    eq(coalesceWindows([]).length, 0, 'coalescing nothing yields nothing')
    const seg2 = coalesceWindows([RW('00:20:00', '03:20:00'), RW('03:20:00', '05:20:00')])
    eq(seg2.length, 1, 'two back-to-back raw segments are ONE outage')
    eq(JSON.stringify([seg2[0].from, seg2[0].to]), JSON.stringify([at('00:20:00'), at('05:20:00')]), 'the merged window spans the whole night, not its last segment')
    eq(seg2[0].min, 300, 'and its minutes are the FULL span')
    const seg3 = coalesceWindows([RW('00:20:00', '03:20:00'), RW('03:20:00', '05:20:00'), RW('05:20:00', '11:30:00')])
    eq(seg3.length === 1 ? seg3[0].min : null, 670, 'merging is chained: the ×3 staged night becomes one 11h 10m story')
    eq(coalesceWindows([RW('00:20:00', '03:20:00'), RW('03:40:00', '05:40:00')]).length, 1, 'a seam of exactly COALESCE_GAP_MIN still merges (≤)')
    eq(coalesceWindows([RW('00:20:00', '03:20:00'), RW('03:41:00', '05:41:00')]).length, 2, 'a seam one minute over the budget stays TWO outages')
    const napM = coalesceWindows([RW('00:20:00', '03:20:00', { naps: 2 }), RW('03:20:00', '05:20:00', { naps: 3 })])
    eq(napM[0].naps, 5, 'naps from merged segments sum')
    eq(coalesceWindows([RW('00:20:00', '03:20:00', { reason: 'Idle Sleep' }), RW('03:20:00', '05:20:00')])[0].reason, 'Idle Sleep', 'a claimed reason survives the merge')
    const NAMED = (f, t) => ({ from: at(f), to: at(t), min: Math.round((at(t) - at(f)) / 60000), naps: 1, reason: 'Software Sleep', src: 'pmset' })
    const inter = coalesceWindows([RW('00:20:00', '03:20:00'), NAMED('03:00:00', '03:15:00'), RW('03:25:00', '05:25:00')])
    eq(inter.length, 3, 'a pmset-named window BREAKS a raw run — raw segments across named truth do not merge')
    eq(coalesceWindows([NAMED('00:00:00', '02:00:00'), NAMED('02:00:00', '04:00:00')]).length, 2, 'pmset-named windows NEVER merge — the observed truth wins outright')
    const retire = coalesceWindows([RW('00:20:00', '03:20:00'), RW('03:20:00', '05:20:00'), NAMED('00:17:00', '11:35:00')])
    eq(retire.length, 1, 'raw scaffolding a pmset window fully covers is DROPPED when the named truth arrives')
    eq(retire[0].src, 'pmset', 'and the survivor is the named window (reason and naps and all)')
    eq(coalesceWindows([RW('00:20:00', '05:20:00'), NAMED('03:00:00', '06:00:00')]).length, 2, 'partial overlap is not coverage — the raw claim stays (never quietly shrink a claimed outage)')
    const legacy = coalesceWindows([RW('00:20:00', '03:20:00'), { from: at('03:20:00'), to: at('04:20:00'), min: 60 }, RW('04:20:00', '06:20:00')])
    eq(legacy.length, 3, 'windows with unknown src are left alone AND break raw runs — never merge what you cannot name')
    const ledRaw = addWindows([RW('00:20:00', '03:20:00')], [RW('03:20:00', '05:20:00')], at('05:30:00'))
    eq(ledRaw.length, 1, 'addWindows coalesces: the LEDGER holds the merged night, so every reader tells it once')
    eq(ledRaw[0].min, 300, 'the merged ledger row spans both staged segments')

    // ---- coverage honesty (#1406) -----------------------------------------
    eq(COALESCE_GAP_MIN, 20, 'and lands on 20 min at the current 10-min tick')
    eq(pmsetCoverage([]), null, 'no visible events = no measurable log')
    eq(pmsetCoverage(null), null, 'a failed capture cannot report its own reach')
    eq(pmsetCoverage([{ kind: 'wake', ms: at('12:10:00') }], { now: at('12:00:00') }), null, 'future-only events measure nothing')
    const cov1 = pmsetCoverage([{ kind: 'wake', ms: at('11:20:00') }, { kind: 'sleep', ms: at('11:30:00') }], { now: at('12:00:00') })
    eq(cov1.spanMin, 40, 'the span is oldest-visible-event -> now')
    eq(cov1.covers, false, '40 min of log does not cover a 48 h horizon')
    eq(pmsetCoverage([{ kind: 'wake', ms: at('12:00:00') - LEDGER_KEEP_H * 3600000 }], { now: at('12:00:00') })?.covers, true, 'exactly-horizon coverage covers')
    eq(pmsetCoverage([{ kind: 'wake', ms: at('12:00:00') - LEDGER_KEEP_H * 3600000 + 60000 }], { now: at('12:00:00') })?.covers, false, 'one minute short of the horizon is short')
    eq(utcDay(Date.parse('2026-10-31T23:59:00Z')), '2026-10-31', 'utcDay is the UTC calendar day')
    eq(utcDay(Date.parse('2026-11-01T00:00:00Z')), '2026-11-01', '…and rolls over at the UTC midnight')

    // ---- churn + onset (#1392) ------------------------------------------
    eq(CHURN_SLEEPS, 3, 'churn needs at least three sleeps')
    eq(CHURN_WINDOW_MIN, CHURN_SLEEPS * TICK_MIN, 'the churn window DERIVES from the cadence (three tick intervals, one place)')
    eq(CHURN_WINDOW_MIN, 30, 'and lands on 30 min at the current 10-min tick')
    eq(ONSET_LOOKBACK_MIN, 60, 'the live onset trusts sleep evidence at most 1 h old')
    eq(ONSET_STALE_MIN, 3 * TICK_MIN, 'the fresh onset stamp decays at three tick intervals (derived, #1401)')

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
    eq(asleepField({ since: at('00:00:00'), seen: CN - (ONSET_STALE_MIN + 1) * 60000 }, CN), '', 'a FRESH token decays with the silent box')
    eq(asleepField({ since: at('00:00:00'), seen: CN - (ONSET_STALE_MIN + 1) * 60000, persisted: true }, CN), `asleep=true since=${hm(at('00:00:00'))}`,
        'a v3 PERSISTED stamp ignores the stale-seen decay — truth survives the dark (#1401)')
    eq(asleepField({ since: at('00:00:00'), seen: at('00:20:00'), persisted: true }, at('00:20:00') + (LEDGER_KEEP_H + 1) * 3600000), '',
        'even persistence bows to the 48 h keep-horizon')
    eq(asleepField(null, CN), '', 'no stamp, no token')
    eq(asleepField({ since: 'junk', seen: CN }, CN), '', 'junk stamps never ride the pulse')
    eq(churnField(chEp, CN), 'churn=13 churnwin=30', 'the churn token names the newest episode AND carries its window (#1401)')
    eq(churnField(chEp, CN + (PULSE_SHOW_H + 1) * 3600000), '', 'churn drops off the pulse 24 h after the episode')
    eq(churnField([], CN), '', 'a well-behaved night has no churn token')

    // ---- persistent live stamp (resolveAsleep, #1401) -------------------
    const DK_S = CN - 10 * 60000 // a sleep ten minutes before the churn-now
    const dkSleep = [{ kind: 'sleep', ms: DK_S, durSecs: 10 }]
    const dkWake = { kind: 'wake', ms: at('03:00:00') }
    const freshStamp = resolveAsleep(null, dkSleep, { now: CN })
    eq(freshStamp?.since, DK_S, 'a visible chain raises the stamp (v2 behaviour kept)')
    eq(freshStamp?.seen, CN, 'fresh stamps stamp their sighting')
    eq(freshStamp?.persisted, undefined, 'a re-observed stamp is not persisted')
    const carried = resolveAsleep(freshStamp, [], { now: CN + 6 * 3600000, pmsetOk: false })
    eq(carried?.persisted, true, 'a FAILED pmset capture is the dark — carry the stamp (#1401)')
    eq(carried?.seen, CN, 'carry freezes `seen`: the box was NOT verifiably awake')
    eq(carried?.since, DK_S, 'and the onset minute is the night\'s honest one')
    eq(liveValid(carried, CN + 6 * 3600000), true, 'a carried stamp is live-valid hours into the dark')
    const aged = resolveAsleep(freshStamp, dkSleep, { now: at('03:00:00') })
    eq(aged?.persisted, true, 'a chain aged past the lookback but wake-free and covered VALIDATES the hold')
    eq(aged?.since, DK_S, 'validated holds keep the original onset')
    eq(resolveAsleep(freshStamp, dkSleep.concat([dkWake]), { now: dkWake.ms + 60000 }), null, 'a visible full Wake DISPROVES the stamp — cleared')
    eq(resolveAsleep(freshStamp, [{ kind: 'sleep', ms: at('02:30:00'), durSecs: 10 }], { now: at('05:30:00') }), null,
        'a log that no longer covers the onset cannot validate it — cleared, never carried on faith')
    const reSleep = resolveAsleep(freshStamp, [dkWake, { kind: 'sleep', ms: at('03:30:00'), durSecs: 10 }], { now: at('03:40:00') })
    eq(reSleep?.since, at('03:30:00'), 'a wake-then-new-sleep restarts the story at the new chain')
    eq(reSleep?.persisted, undefined, 'and the restart is a fresh sighting, not a carry')
    const earlier = resolveAsleep({ since: at('01:10:00'), seen: CN }, dkSleep, { now: CN })
    eq(earlier?.since, at('01:10:00'), 'an undisproved prev keeps the EARLIER onset when the chain re-reports')
    eq(resolveAsleep({ since: DK_S, seen: CN }, [], { now: CN + (LEDGER_KEEP_H + 1) * 3600000, pmsetOk: false }), null,
        'persistence still bows to the 48 h horizon')
    eq(resolveAsleep({ since: 'junk' }, dkSleep, { now: CN })?.since, DK_S, 'junk prev is ignored, the chain still speaks')
    eq(liveValid({ since: DK_S, seen: CN - (ONSET_STALE_MIN + 1) * 60000 }, CN), false, 'a stale unpersisted stamp is not live-valid')
    const LL = liveLine({ since: DK_S, seen: CN, persisted: true }, CN + 3 * 3600000 + 21 * 60000)
    ok(LL === `😴 Studio is asleep RIGHT NOW — since ${hm(DK_S)} (3h 31m) · ${CAFFEINATE_HINT}`, `digest live sentence: ${LL}`)
    eq(liveLine({ since: DK_S, seen: CN - (ONSET_STALE_MIN + 1) * 60000 }, CN), null, 'a stale stamp never says RIGHT NOW')
    eq(liveLine(null, CN), null, 'no stamp, no live sentence')
    ok(liveLine({ since: DK_S, seen: CN, persisted: true }, CN + 11 * 3600000).includes('11h'),
        'a persisted stamp names the true elapsed hours in the digest')

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
    eq(chB?.text, 'STUDIO CHURNING — 7 sleeps in the last 30 min', 'churn gets its own amber strip')
    eq(chB?.severe, false, 'churn is not an outage — amber, not red')
    eq(sleepBanner({ churn: '2' }), null, 'a v2-era token below the legacy minimum (3) still shows no banner')
    eq(sleepBanner({ churn: 'junk' }), null, 'junk churn never renders')
    // #1401: the window rides the wire, and the emitter owns the threshold —
    // a v3 token (with churnwin) is the claim itself, whatever the cadence is.
    const chW = sleepBanner({ churn: '8', churnwin: '45' })
    eq(chW?.text, 'STUDIO CHURNING — 8 sleeps in the last 45 min', 'churnwin reads the window off the wire — no mirrored arithmetic (#1401)')
    eq(chW?.live, true, 'churn is news happening, marked live')
    eq(sleepBanner({ churn: '4', churnwin: '30' })?.text, 'STUDIO CHURNING — 4 sleeps in the last 30 min', 'a v3 token carries its own window')
    const both = sleepBanner({ asleep: '00:17-11:35', asleepm: '678', naps: '77', churn: '5' })
    ok(both?.text.startsWith('STUDIO WAS ASLEEP'), 'when the outage is named it outranks the churn token')

    // #1406 pulse-age budget: LIVE claims answer to the pulse's age.
    eq(LIVE_SHOWN_MS, 24 * 60 * 60 * 1000, 'the board vouches for LIVE strips exactly as long as the wire shows windows (24 h)')
    const LIVE_SHAPE = { asleep: 'true', since: '03:12' }
    eq(sleepBanner(LIVE_SHAPE, 10 * 60000)?.text, 'STUDIO ASLEEP SINCE 03:12', 'a 10-min-old pulse carries the live strip — the warden just vouched')
    eq(sleepBanner(LIVE_SHAPE, LIVE_SHOWN_MS)?.text, 'STUDIO ASLEEP SINCE 03:12', 'exactly the budget is still shown (≤)')
    eq(sleepBanner(LIVE_SHAPE, LIVE_SHOWN_MS + 1), null, 'a live stamp past the budget is yesterday\'s weather — the strip drops')
    eq(sleepBanner(LIVE_SHAPE, Infinity), null, 'an unparseable pulse age claims no freshness — live strips drop')
    eq(sleepBanner(LIVE_SHAPE, NaN), null, 'junk age is stale age, not unknown age')
    eq(sleepBanner(LIVE_SHAPE)?.live, true, 'age UNKNOWN (v3-era caller) keeps v3 behavior — unknowing callers are not made liars')
    eq(sleepBanner({ churn: '7', churnwin: '30' }, LIVE_SHOWN_MS + 1), null, '"sleeps in the last W min" is also a NOW-claim — stale wires drop churn too')
    eq(sleepBanner({ churn: '7', churnwin: '30' }, 60000)?.live, true, 'fresh churn still renders')
    const staleRetro = sleepBanner({ asleep: '00:17-11:35', asleepm: '678' }, 2 * LIVE_SHOWN_MS)
    ok(staleRetro?.text.startsWith('STUDIO WAS ASLEEP'), 'a retroactive window survives a stale wire — history baked at write time is still history')
    eq(staleRetro?.live, false, 'and it is not a live claim, so the budget does not bind it')

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
    eq(dl.pulseAge, 60000, 'deriveFloor exposes the pulse age the WARDEN lamp already derives — one clock, two readers (#1406)')
    eq(sleepBanner(dl.pulse, dl.pulseAge)?.text, 'STUDIO ASLEEP SINCE 03:12', 'fresh off the wire, the threaded age keeps the strip')
    const staleDl = deriveFloor({ pulses: [{ body: liveLine, updated_at: '2026-10-29T03:20:00Z', created_at: '2026-10-29T03:20:00Z' }], now: Date.parse('2026-10-31T03:21:00Z') })
    eq(staleDl.pulse.asleep, 'true', 'the two-day-old wire still carries the token…')
    eq(sleepBanner(staleDl.pulse, staleDl.pulseAge), null, '…but the board reads its age and drops the live strip — no "ASLEEP SINCE" for a box that woke two days ago (#1406)')
    const churnLine2 = '04:00 alive=yes queue=2 building=1 shipped=41 main=abc1234 qa=8 mini=up gate=none halted=no questions=0 builders=2/2 churn=5 actions=churn:1'
    eq(sleepBanner(deriveFloor({ pulses: [{ body: churnLine2, updated_at: '2026-10-31T04:00:00Z', created_at: '2026-10-31T04:00:00Z' }], now: Date.parse('2026-10-31T04:01:00Z') }).pulse).text,
        'STUDIO CHURNING — 5 sleeps in the last 30 min', 'a v2-era churn line still renders (legacy wire compat)')
    const churnLine3 = '04:00 alive=yes queue=2 building=1 shipped=41 main=abc1234 qa=8 mini=up gate=none halted=no questions=0 builders=2/2 churn=5 churnwin=45 actions=churn:1'
    const dc3 = deriveFloor({ pulses: [{ body: churnLine3, updated_at: '2026-10-31T04:00:00Z', created_at: '2026-10-31T04:00:00Z' }], now: Date.parse('2026-10-31T04:01:00Z') })
    eq(dc3.pulse.churnwin, '45', 'the churn window token survives the kv wire')
    eq(sleepBanner(dc3.pulse).text, 'STUDIO CHURNING — 5 sleeps in the last 45 min', 'a v3 churn line renders its own window off a real pulse')
    const JSX = read(path.join('..', 'src', 'pages', 'ForgeBoard.jsx'))
    ok(JSX.includes('sleepBanner') && JSX.includes('data-sleep'), 'ForgeBoard imports sleepBanner and renders the strip')
    ok(JSX.includes('data-live') && JSX.includes('sleep.hint'), 'ForgeBoard marks the live strip and renders its hint (#1392)')
    ok(JSX.includes('sleepBanner(pulse, floor.pulseAge)'), 'ForgeBoard threads the pulse age into the banner — the live strip answers to wire freshness (#1406)')
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

    // #1401 — the live sentence outranks its own retrospective: "RIGHT NOW"
    // sits above "was asleep", which sits above churn, above the questions.
    const LVS = '😴 Studio is asleep RIGHT NOW — since 00:17 (11h 43m) · keep it awake: sudo pmset -a sleep 0'
    const all3 = digestText({
        questions: q, live: LVS, sleep: '😴 Studio was asleep 00:17–11:35 (11h 18m)', churn: CHS,
        now: new Date('2026-10-31T12:00:00Z'),
    })
    const a3 = all3.split('\n')
    eq(a3[1], LVS, 'the live line leads the digest — the present outranks the past')
    eq(a3[2], '😴 Studio was asleep 00:17–11:35 (11h 18m)', 'the retrospective follows')
    eq(a3[3], CHS, 'churn follows, then the questions')
    const liveOnly = digestText({ questions: q, live: LVS, now: new Date('2026-10-31T12:00:00Z') })
    eq(liveOnly.split('\n')[1], LVS, 'a live stamp alone outranks every question (#1401)')
    ok(!digestText({ questions: q }).includes('RIGHT NOW'), 'no live stamp, no live sentence')
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
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=1 src=pmset churn=0 asleep=0 logspan=40 logshort=1',
        'tick records a new gap window (+ the UTC day\'s first coverage report: 40 min of log, far short of 48 h — #1406)')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${led}`), 'recorded=0 src=pmset churn=0 asleep=0', 'the same gap re-ticked adds nothing (dedupe) — and the span was already named today (once-per-day, #1406)')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0 src=none churn=0 asleep=0', 'a normal 10-min tick records nothing')
    eq(sw('tick', `--last=`, `--now=${NOWS}`, `--out=${led}`), 'recorded=0 src=none churn=0 asleep=0', 'empty --last (first tick ever) records nothing')
    const dryLed = path.join(dir, 'dry.json')
    eq(sw('tick', `--last=${NOWS - 3600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${dryLed}`, '--dry').replace(/ dry$/, ''), 'recorded=1 src=pmset churn=0 asleep=0 logspan=40 logshort=1', 'dry tick reports the same shape…')
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
    eq(sw('tick', `--last=${CHN - 600}`, `--now=${CHN}`, `--pmset=${churnPm}`, `--out=${churnLed}`), 'recorded=0 src=none churn=3 asleep=1 logspan=20 logshort=1',
        'a churning night with landing ticks records NO window but names churn, the live onset, and the day\'s log span')
    eq(sw('pulse', `--out=${churnLed}`, `--now=${CHN}`), `asleep=true since=${hm(at('00:00:00'))} churn=3 churnwin=30`, 'the live pulse rides while the churn is current')
    ok(sw('line', `--out=${churnLed}`, `--now=${CHN}`).includes('🌀 Studio churned 3 sleep cycles'), 'the churn sentence reaches the digest line with no 😴 window behind it')
    ok(!sw('line', `--out=${churnLed}`, `--now=${CHN}`).includes('was asleep'), 'no window fabricated for an open churn chain')
    ok(sw('line', `--out=${churnLed}`, `--now=${CHN}`).includes('asleep RIGHT NOW'), 'the digest still answers "sleeping now?" while churn is live (#1401)')
    const wakeLedger = JSON.parse(fs.readFileSync(churnLed, 'utf8'))
    eq(wakeLedger.windows.length, 0, 'the churn ledger holds no outage windows')
    eq(wakeLedger.churns.length, 1, 'the churn episode is on the ledger')
    eq(wakeLedger.asleep !== null, true, 'the onset stamp persists between ticks')
    const calmPm = path.join(dir, 'calm.txt')
    fs.writeFileSync(calmPm, `${churnLines}\n2026-10-31 00:25:00 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to HID Activity Using AC`)
    eq(sw('tick', `--last=${CHN}`, `--now=${Math.floor(at('00:26:00') / 1000)}`, `--pmset=${calmPm}`, `--out=${churnLed}`), 'recorded=0 src=none churn=3 asleep=0',
        'the full Wake clears the live flag on the next tick')
    eq(sw('pulse', `--out=${churnLed}`, `--now=${Math.floor(at('00:26:00') / 1000)}`), 'churn=3 churnwin=30', 'after the wake only the churn token remains')

    // #1401 deep-dark night end-to-end: the churn raises the stamp, then the
    // box falls into a LONG dark sleep — ticks vanish, pmset goes unreachable.
    // v2's field would have decayed at 30 min of silence; v3 carries it, the
    // gap path names the windows retroactively, and only the visible full Wake
    // ends the story. The pulse leads with the live truth the whole while.
    const ddLed = path.join(dir, 'deepdark.json')
    eq(sw('tick', `--last=${CHN - 600}`, `--now=${CHN}`, `--pmset=${churnPm}`, `--out=${ddLed}`), 'recorded=0 src=none churn=3 asleep=1 logspan=20 logshort=1',
        'deep-dark setup: the churn raises a fresh live stamp (and names the day\'s span)')
    const D3 = Math.floor(at('03:20:00') / 1000)
    eq(sw('tick', `--last=${CHN}`, `--now=${D3}`, `--pmset=${churnPm}`, `--out=${ddLed}`), 'recorded=1 src=tickgap churn=0 asleep=1 held=1',
        'three hours of silence: the gap names the window AND the stamp survives, validated (no Wake, log covers the onset); span already named today')
    eq(sw('pulse', `--out=${ddLed}`, `--now=${D3 + 300}`), `asleep=true since=${hm(at('00:00:00'))} churn=3 churnwin=30`,
        'the live stamp leads the pulse three hours into the dark — the field v2 lost at 30 min (#1401)')
    // pmset unreachable (PATH stripped — the capture failing IS the deep dark)
    const swNoPmset = (...a) => execFileSync(process.execPath, [cli, ...a], { encoding: 'utf8', env: { PATH: '/nonexistent-forge-path' } }).trim()
    const D5 = Math.floor(at('05:20:00') / 1000)
    eq(swNoPmset('tick', `--last=${D3}`, `--now=${D5}`, `--out=${ddLed}`), 'recorded=0 src=tickgap churn=0 asleep=1 held=1',
        'a failed pmset capture carries the stamp rather than clearing it (#1401); the new segment COALESCES onto the open night (#1406) — extending a known outage is not a new one, and a blind capture reports no span')
    const ddLine = sw('line', `--out=${ddLed}`, `--now=${Math.floor(at('05:21:00') / 1000)}`)
    ok(ddLine.includes(`😴 Studio is asleep RIGHT NOW — since ${hm(at('00:00:00'))} (5h 21m)`), `deep-dark digest leads with the true elapsed: ${ddLine.split('\n')[0]}`)
    ok(!ddLine.includes('×2') && !ddLine.includes('×3'), `the staged recovery tells the night ONCE, not as stacked segments: ${ddLine.split('\n')[1] || 'no retro line'}`)
    ok((ddLine.split('\n')[1] || '').includes(`${hm(at('00:20:00'))}–${hm(at('05:20:00'))}`), 'the retro sentence spans the merged outage, not its last segment')
    ok(ddLine.includes('🌀 Studio churned 3 sleep cycles'), 'the churn episode rides alongside')
    const ddPm = path.join(dir, 'deepdark-wake.txt')
    fs.writeFileSync(ddPm, `${churnLines}\n2026-10-31 11:29:00 +0000 Wake                \tWake from Deep Idle [CDNVA] : due to HID Activity Using AC`)
    const DW = Math.floor(at('11:30:00') / 1000)
    eq(sw('tick', `--last=${D5}`, `--now=${DW}`, `--pmset=${ddPm}`, `--out=${ddLed}`), 'recorded=0 src=tickgap churn=0 asleep=0',
        'the visible Wake ends the vigil: asleep drops off the tick report, no held token — and the last segment merges into the night, so no NEW outage count')
    eq(sw('pulse', `--out=${ddLed}`, `--now=${DW}`), `asleep=${hm(at('00:20:00'))}-${hm(at('11:30:00'))} asleepm=670 churn=3 churnwin=30`,
        'after the wake the pulse tells the WHOLE night — 00:20→11:30, the night that began at 00:20 (was 05:20–11:30 pre-#1406) — plus the churn')
    const ddLedger = JSON.parse(fs.readFileSync(ddLed, 'utf8'))
    eq(ddLedger.asleep, null, 'the ledger stamp dies with the Wake it could not dodge')
    eq(ddLedger.windows.length, 1, 'the deep-dark night is ONE window on the ledger (#1406)')
    eq(JSON.stringify([ddLedger.windows[0].from, ddLedger.windows[0].to]), JSON.stringify([CHN * 1000, DW * 1000]), 'merged span: first tick that vanished to the tick that landed awake')
    eq(ddLedger.windows[0].src, 'tickgap', 'still honestly raw — pmset never named this night')
    // an empty log validates NOTHING — the stamp is never carried on faith
    const faithLed = path.join(dir, 'faith.json')
    eq(sw('tick', `--last=${CHN - 600}`, `--now=${CHN}`, `--pmset=${churnPm}`, `--out=${faithLed}`), 'recorded=0 src=none churn=3 asleep=1 logspan=20 logshort=1', 'stamp raised (span named)')
    eq(sw('tick', `--last=${CHN}`, `--now=${Math.floor(at('00:35:00') / 1000)}`, `--pmset=${path.join(dir, 'empty.txt')}`, `--out=${faithLed}`), 'recorded=0 src=none churn=0 asleep=0',
        'a reachable-but-empty log cannot cover the onset — cleared, never carried on trust (and an empty log has no span to report)')

    // #1406 coverage honesty end-to-end: the span rides the tick line ONCE per
    // UTC day, re-arms the next day, names covers honestly, and a blind
    // capture (deep dark) stays silent.
    const covLed = path.join(dir, 'coverage.json')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--pmset=${gapPm}`, `--out=${covLed}`), 'recorded=0 src=none churn=0 asleep=0 logspan=40 logshort=1',
        'a normal tick with a short log reports the day\'s ceiling: 40 min visible, short of 48 h')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS + 300}`, `--pmset=${gapPm}`, `--out=${covLed}`), 'recorded=0 src=none churn=0 asleep=0',
        'the next tick the same day stays quiet — once per day, not per tick')
    const NEXTDAY = NOWS + 86400
    eq(sw('tick', `--last=${NEXTDAY - 600}`, `--now=${NEXTDAY}`, `--pmset=${gapPm}`, `--out=${covLed}`), 'recorded=0 src=none churn=0 asleep=0 logspan=1480 logshort=1',
        'the next UTC day re-arms the report, now 24h40m of visible log — still short of the horizon')
    const covLedger = JSON.parse(fs.readFileSync(covLed, 'utf8'))
    eq(covLedger.spanDay, utcDay(NEXTDAY * 1000), 'the ledger keeps the day the span was named')
    const longPm = path.join(dir, 'pmset-long.txt')
    fs.writeFileSync(longPm, [
        `${new Date(NOWS * 1000 - 3 * 86400000).toISOString().slice(0, 19).replace('T', ' ')} +0000 Wake                \tWake from Deep Idle : due to HID Activity Using AC`,
        `2026-10-31 11:20:00 +0000 Sleep               \tEntering Sleep state due to 'Idle Sleep': Using AC`,
        `2026-10-31 11:55:00 +0000 Wake                \tWake from Deep Idle : due to HID Activity`,
    ].join('\n'))
    const covOk = path.join(dir, 'coverage-ok.json')
    eq(sw('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--pmset=${longPm}`, `--out=${covOk}`), 'recorded=0 src=none churn=0 asleep=0 logspan=4320',
        'a 3-day log covers the horizon — logspan says so and NO logshort flag rides')
    const covBlind = swNoPmset('tick', `--last=${NOWS - 600}`, `--now=${NOWS}`, `--out=${covOk}`)
    ok(!covBlind.includes('logspan'), `a failed capture cannot measure its own reach — no span token: ${covBlind}`)

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
    ok(W.includes('held=1') && W.includes('sleepwatch v3:'), '#1401: a tick that carried the stamp through silence names itself in the log')
    ok(W.includes('*logspan=*') && W.includes('sleepwatch v4:'), '#1406: the once-per-day coverage report reaches the warden log')
    ok(W.includes('[[ -s "$SW" ]]'), 'warden guards on a NON-empty materialised script (git-show failures leave 0-byte files)')
    ok(W.includes(`[[ "$DRY" != 1 ]] && print -r -- "$NOWN" > "$LOG_DIR/warden.lasttick"`), 'dry ticks never touch the lasttick stamp')
    ok(W.includes('origin/main:scripts/sleepwatch.mjs'), 'warden materialises sleepwatch from origin/main (launchd-safe)')

    const jq = read(path.join('jonq.mjs'))
    ok(jq.includes("import { churnLine, liveLine, sleepLine } from './sleepwatch.mjs'"), 'jonq digest imports all three sleep sentences (#1401 live joins)')
    ok(jq.includes('FORGE_ASLEEP'), 'jonq reads the ledger (path overridable for harness/other machines)')
    ok(jq.includes('churnLine(led.churns'), 'jonq derives the churn sentence from the ledger')
    ok(jq.includes('liveLine(led.asleep'), 'jonq derives the live sentence from the stamp (#1401)')
    ok(jq.includes('digestText({ questions, runway, sleep, churn, live, now }'), 'jonq passes the live+churn lines into the digest')

    const RW = read(path.join('lib', 'runway.mjs'))
    ok(RW.indexOf('if (live) lines.push(live)') < RW.indexOf('if (sleep) lines.push(sleep)'), 'the live line outranks its own retrospective (#1401)')
    ok(RW.indexOf('if (sleep) lines.push(sleep)') < RW.indexOf('if (churn) lines.push(churn)'), 'digestText places churn right after sleep')
    ok(RW.indexOf('if (churn) lines.push(churn)') < RW.indexOf('if (questions.length === 0)'), '…and still before the questions')

    ok(CORE.checks.includes('sleepwatchcheck'), 'checks.mjs carries the alias (core scope)')
    ok(JSON.parse(read(path.join('..', 'package.json'))).scripts.sleepwatchcheck === 'node scripts/sleepwatchcheck.mjs', 'package.json alias exists')
    ok(read(path.join('..', '.github', 'workflows', 'ci.yml')).includes('npm run sleepwatchcheck'), 'ci.yml runs it in the core gate')
}

console.log(`\x1b[1m\nsleepwatchcheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
