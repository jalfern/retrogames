// studiotrial.mjs — the #1258 48-hour fleet trial: clock, verdict, memory.
//
// Jon's condition: "Trial for 48 h, then report total Studio tokens/s and
// items shipped per day against the 48 h before. If throughput didn't go up,
// drop back to 1 builder + 1 QA and say so." So this script:
//   tick     — records the trial start (first run on main after the merge);
//              at 48 h computes items/day for the two windows, posts the
//              report on #1258 (with the #1290 lane split — mini's ships on
//              their own line), and persists keep|revert to
//              /tmp/forge/studio-lanes.verdict — warden step 4 reads it and
//              refuses to kick slot b on `revert` (that IS the drop-back).
//   status   — one human line for `forge status` / the board.
//
// #1299 — the aggregate-throughput ask. tokens/s is now persisted (tps.mjs
// sums EVERY stream, telemetry keeps a ~7-day ledger), and the oMLX servers'
// own usage API returns hourly token buckets with 400-day retention — so the
// report can measure total tokens/hr per box (ALL streams, Jon's RETRO chat
// included) for BEFORE and after, plus how many streams were active, plus
// sessions that hit their time box without shipping (spans from the session
// logs, ships attributed by claim lineage), with a sparkline chart.
//
// Pure core (verdict + report text + #1299 math) is exported and pinned
// offline by lanecheck.mjs; the IO (gh fetch, usage fetch, files, comment)
// stays thin here.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import http from 'node:http'

export const TRIAL_HOURS = 48
const FILE = '/tmp/forge/studio-lanes.json'
export const VERDICT_FILE = '/tmp/forge/studio-lanes.verdict'
const REPO = 'jalfern/retrogames'
const LEDGER = '/tmp/forge/tokens.jsonl'
const LOG_DIR = '/tmp/forge'

// Time boxes (minutes, #1299): a session that runs ~its full box without
// shipping is the hidden cost of a slower stream. Tolerance: the warden re-
// kicks on its ~10-min tick, and SIGTERM lands at the cap — anything from
// (box − 12) min on counts as having hit the box.
export const BOX_MIN = { a: 180, b: 180, qaStudio: 60, qaMini: 60 }
const BOX_TOL_MIN = 12

// verdict — pure: two closed-issue lists (ISO closed_at strings), the later
// window must ship STRICTLY more items/day to keep the fleet.
export function trialVerdict({ closedBefore = [], closedAfter = [], hours = TRIAL_HOURS }) {
    const rate = (n) => Math.round((n / hours) * 24 * 100) / 100
    const before = rate(closedBefore.length)
    const after = rate(closedAfter.length)
    return { keep: after > before, before, after, hours }
}

// usageWindow — pure (#1299): total tokens (+ covered hours) inside
// [fromMs, toMs] from an oMLX usage payload {start, heatmap:[{date,
// tokens:[24 hourly buckets]}]}. Bucket h of date D covers local midnight(D)
// + h .. +1 h; the offset comes from `start` ("...T00:00:00-07:00"). A
// boundary hour counts its overlap fraction (tokens spread evenly in the
// hour — an approximation, honest to the bucket size). Missing/short days
// just contribute less: hours says what was actually covered.
export function usageWindow(usage, fromMs, toMs) {
    if (!usage || !Array.isArray(usage.heatmap) || !usage.start) return null
    const off = String(usage.start).match(/([+-])(\d{2}):(\d{2})$/)
    const offMs = off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) * 60e3 : 0
    let tokens = 0, hours = 0
    const perHour = []
    for (const day of usage.heatmap) {
        if (!day || !Array.isArray(day.tokens)) continue
        const midnight = Date.parse(`${day.date}T00:00:00.000${off[1]}${off[2]}:${off[3]}`)
        if (!Number.isFinite(midnight)) continue
        for (let h = 0; h < day.tokens.length; h++) {
            const t = Number.isFinite(day.tokens[h]) && day.tokens[h] > 0 ? day.tokens[h] : 0
            const bs = midnight + h * 3600e3, be = bs + 3600e3
            const ov = Math.min(be, toMs) - Math.max(bs, fromMs)
            if (ov <= 0) continue
            const frac = ov / 3600e3
            tokens += t * frac
            hours += frac          // quiet hours still count as coverage
            perHour.push({ at: bs, tok: t * frac })
        }
    }
    perHour.sort((x, y) => x.at - y.at)
    return { tokens: Math.round(tokens), hours: Math.round(hours * 10) / 10, perHour }
}

// spark — pure: values → sparkline chars, ▁ low to █ high; all-zero → ·.
export function spark(values) {
    const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
    const vals = (values || []).filter((v) => Number.isFinite(v))
    if (!vals.length) return '·'
    const max = Math.max(...vals)
    if (max <= 0) return '·'.repeat(vals.length)
    return vals.map((v) => BARS[Math.round((v / max) * 7)] || BARS[0]).join('')
}

// streamStats — pure: from ledger rows ({ts, tps:{box:{n,...}}}) take box's
// active-stream counts inside the window. mean covers idle samples too (that's
// utilization), max is peak concurrency. `since` = first sample's ISO.
export function streamStats(rows, boxKey, fromMs, toMs) {
    const ns = []
    let since = null
    for (const r of rows || []) {
        if (!r || !Number.isFinite(r.ts) || r.ts * 1000 < fromMs || r.ts * 1000 > toMs) continue
        const n = r.tps && r.tps[boxKey] && r.tps[boxKey].n
        if (!Number.isFinite(n)) continue
        ns.push(n)
        if (since === null) since = new Date(r.ts * 1000).toISOString().replace(/\.\d{3}Z/, 'Z')
    }
    if (!ns.length) return null
    return { samples: ns.length, mean: Math.round((ns.reduce((s, v) => s + v, 0) / ns.length) * 100) / 100,
        max: Math.max(...ns), since }
}

// laneOfClaims — pure: LAST claim lineage decides whose ship it is (a
// takeover moves the credit, same rule as laneSplit). Maps to session lanes.
export function laneOfClaims(bodies) {
    const LINEAGE = /^(QA|FORGE) \(([a-z0-9-]+)\): (claimed|checkpoint)/
    let last = null
    for (const b of bodies || []) if (LINEAGE.test(b || '')) last = b
    if (!last) return null
    const [lane, node] = last.match(LINEAGE).slice(1)
    if (lane === 'FORGE') return node === 'b' ? 'b' : 'a'
    if (node === 'mini') return 'qaMini'
    if (node === 'studio' || node === 'builder') return 'qaStudio'
    return null // parked mbp etc. — not a lane this metric measures
}

// boxMisses — pure: session spans [{lane, startMs, endMs, alive}] vs ships
// [{lane, atMs}] inside [fromMs, toMs]. Only complete sessions count (an
// alive span hasn't reached its verdict). hit = ran ≥ box − tolerance;
// miss = hit without any ship of that lane landing in the span (±5 min).
export function boxMisses(spans, ships, fromMs, toMs) {
    const out = {}
    for (const lane of Object.keys(BOX_MIN)) out[lane] = { n: 0, hit: 0, miss: 0 }
    for (const s of spans || []) {
        if (!s || !(s.lane in out) || s.alive) continue
        if (s.startMs < fromMs || s.endMs > toMs) continue
        out[s.lane].n++
        if (s.endMs - s.startMs < (BOX_MIN[s.lane] - BOX_TOL_MIN) * 60e3) continue
        out[s.lane].hit++
        const shipped = (ships || []).some((p) => p && p.lane === s.lane && p.atMs >= s.startMs - 5 * 60e3 && p.atMs <= s.endMs + 5 * 60e3)
        if (!shipped) out[s.lane].miss++
    }
    return out
}

// spanLine — pure: render one window's misses compactly ("x/y missed").
function spanLine(label, m) {
    const fmt = (lane) => (m[lane] && m[lane].n ? `${m[lane].miss}/${m[lane].n}` : null)
    const builders = ((m.a && m.a.n) || (m.b && m.b.n))
        ? `${(m.a ? m.a.miss : 0) + (m.b ? m.b.miss : 0)}/${(m.a ? m.a.n : 0) + (m.b ? m.b.n : 0)}` : null
    const bits = []
    if (builders) bits.push(`builders ${builders}`)
    if (fmt('qaStudio')) bits.push(`studio QA ${fmt('qaStudio')}`)
    if (fmt('qaMini')) bits.push(`mini QA ${fmt('qaMini')}`)
    return bits.length ? `${label}: ${bits.join(' · ')} missed their box` : null
}

const kfmt = (n) => (Number.isFinite(n) ? `${Math.round(n / 100) / 10}k` : '—')

// reportText — the #1258 comment. Numbers from the verdict, tone factual.
// `split` (optional, #1290) is laneSplit() over the after-window ships: mini
// runs the smaller model, so Jon sees its ships on their own line.
// `perf` (optional, #1299) adds tokens/hr per box, stream counts, time-box
// misses and the hourly sparkline chart — each sub-part omitted honestly
// when its source had no data.
export function reportText({ since, until, verdict, split, perf }) {
    const v = verdict.keep ? 'KEEP — throughput went up.' : 'REVERT — throughput did not go up; warden stops kicking slot b (back to 1 builder + 1 QA).'
    const lines = [
        'FORGE STUDIO TRIAL REPORT (#1258) — first 48 h of 2 builders + 1 QA',
        `Trial window: ${since.slice(0, 16)}Z → ${until.slice(0, 16)}Z`,
        '',
        `Items shipped per day — before: ${verdict.before} · after: ${verdict.after} (issues closed carrying building/feedback)`,
        `Builder output: ${verdict.keep ? 'up' : 'not up'} with the second slot.`,
    ]
    if (split) lines.push('',
        `Lane split (after window): builders ${split.builder} · studio QA ${split.studioQa} · mini QA ${split.mini} · other ${split.other}`,
        split.capped
            ? `(classified by last claim comment lineage over the first ${split.capped} ships — window capped)`
            : '(classified by last claim comment lineage; other = unclaimed close or a parked node)')
    if (perf) {
        if (perf.boxes.length) {
            lines.push('', 'Tokens/hr — EVERY stream on each box counted (server usage counters, hourly buckets):')
            for (const b of perf.boxes) {
                const rate = (w) => (w && w.hours > 0 ? `${kfmt(w.tokens / w.hours)}/hr` : '—')
                lines.push(`  ${b.name}: before ${rate(b.before)} → after ${rate(b.after)}`)
            }
            for (const b of perf.boxes) {
                if (b.streams) lines.push(`  ${b.name} streams: mean ${b.streams.mean} active, peak ${b.streams.max} (5-min samples since ${b.streams.since})`)
                else lines.push(`  ${b.name} streams: no ledger samples yet`)
            }
        }
        if (perf.spansBefore || perf.spansAfter) {
            lines.push('', `Sessions that hit their time box without shipping (3 h builders, 1 h QA):`)
            const b = perf.spansBefore && spanLine('before', perf.spansBefore)
            const a = perf.spansAfter && spanLine('after', perf.spansAfter)
            if (b) lines.push(`  ${b}`)
            if (a) lines.push(`  ${a}`)
        }
        if (perf.chartLines && perf.chartLines.length) {
            lines.push('', `Chart — tokens per hour, ${perf.chartSince ? perf.chartSince.slice(5, 10) : 'before'} → ${until.slice(5, 10)} (${TRIAL_HOURS * 2} h span; ▁ low → █ high, "|" = fleet-on at trial start):`)
            for (const cl of perf.chartLines) lines.push(`  ${cl}`)
        }
    }
    lines.push('', `VERDICT: ${v}`)
    if (perf) {
        lines.push('',
            'Metric honesty: tokens/hr come from the servers\' own usage counters (hourly buckets,',
            'every stream on the box — Jon\'s RETRO chat included, active-stream counts from the',
            'telemetry ledger). Items/day counts issues closed carrying building/feedback.',
        )
        if (perf.honesty && perf.honesty.length) lines.push(...perf.honesty)
    } else {
        lines.push('',
            'Metric honesty: tokens/s streams live in watch.sh but nothing persisted it before',
            'the trial, so the comparison uses items/day; if the fleet keeps, wiring t/s',
            'persistence into telemetry is the obvious follow-up.',
        )
    }
    return lines.join('\n')
}

// laneSplit — pure (#1290). Rows are closed issues, each carrying its claim
// comment bodies oldest-first. Classify by the LAST lineage (a takeover moves
// the ship): FORGE (a|b) = builder slot · QA (studio|builder) = studio-model
// QA · QA (mini) = mini · anything else (never claimed, parked node) = other.
export function laneSplit(rows) {
    const split = { builder: 0, studioQa: 0, mini: 0, other: 0 }
    const LINEAGE = /^(QA|FORGE) \(([a-z0-9-]+)\): (claimed|checkpoint)/
    for (const r of rows || []) {
        let last = null
        for (const b of r.claims || []) if (LINEAGE.test(b || '')) last = b
        if (!last) { split.other++; continue }
        const [lane, node] = last.match(LINEAGE).slice(1)
        if (lane === 'FORGE') split.builder++
        else if (node === 'mini') split.mini++
        else if (node === 'studio' || node === 'builder') split.studioQa++
        else split.other++
    }
    return split
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })

function closedInWindow(label, fromMs, toMs) {
    // paginate a capped window; filter on closed_at precisely
    let out
    try {
        out = gh(['api', '--paginate', `repos/${REPO}/issues?state=closed&labels=${label}&per_page=100`])
    } catch { return [] }
    let rows
    try { rows = JSON.parse(out) } catch { return [] }
    return rows
        .filter((i) => !i.pull_request)
        .map((i) => ({ number: i.number, at: i.closed_at }))
        .filter((i) => { const ms = Date.parse(i.at); return Number.isFinite(ms) && ms >= fromMs && ms <= toMs })
}

// claimLines (#1290) — the claim/checkpoint bodies on one issue, oldest-first.
function claimLines(n) {
    let out
    try {
        out = gh(['api', '--paginate', `repos/${REPO}/issues/${n}/comments?per_page=100`])
    } catch { return [] }
    let rows
    try { rows = JSON.parse(out) } catch { return [] }
    return rows.map((c) => c.body || '')
        .filter((b) => /^(QA|FORGE) \([a-z0-9-]+\): (claimed|checkpoint)/.test(b))
}

function load() {
    try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return null }
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z/, 'Z')

// --- #1299 IO (thin; math is pure above) -------------------------------------

const BOXES_USAGE = [['Studio', 'omlx', 8000], ['Mini', 'omlxmini', 18000]]

let cfg = {}
try { cfg = JSON.parse(readFileSync(`${process.env.HOME}/.config/opencode/opencode.json`, 'utf8')) } catch { /* no config: usage fetches go unauthed and fail soft */ }

function fetchUsage(port, key) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/admin/api/usage?range=7d', timeout: 3000,
            headers: key ? { Authorization: `Bearer ${key}` } : {} }, (res) => {
            let body = ''
            res.on('data', (c) => { body += c })
            res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
        })
        req.on('error', () => resolve(null))
        req.on('timeout', () => { req.destroy(); resolve(null) })
    })
}

function ledgerRows() {
    try {
        return readFileSync(LEDGER, 'utf8').splitlines()
            .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    } catch { return [] }
}

// sessionSpans — the session logs the warden wrappers leave behind:
//   builder  : YYYYMMDD-HHMMSS.log            (slot= line inside names the slot)
//   mini QA  : qa-YYYYMMDD-HHMMSS.log
//   studio QA: qa-studio-YYYYMMDD-HHMMSS.log
// Name = start (local time, same box), mtime = last breath. A log still being
// written (mtime within 12 min) is an ALIVE session — no verdict yet.
export function parseSpanName(name) {
    const local = (y, mo, d, h, mi, s) => new Date(y, mo - 1, d, h, mi, s).getTime()
    let m, lane
    if ((m = name.match(/^qa-studio-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.log$/))) lane = 'qaStudio'
    else if ((m = name.match(/^qa-(?!studio)(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.log$/))) lane = 'qaMini'
    else if ((m = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.log$/))) lane = 'builder'
    else return null
    return { lane, startMs: local(...m.slice(1).map(Number)), name }
}

// Pre-fleet builder logs carry no slot= marker (the two-slot world starts at
// the trial `since`), so an unmarked builder log that ENDED before `since`
// was slot a — the only builder that existed. Unmarked AFTER fleet-start is
// unattributable and dropped, never guessed.
function sessionSpans(fleetSinceMs) {
    const out = []
    let names
    try { names = readdirSync(LOG_DIR) } catch { return out }
    for (const name of names) {
        const s = parseSpanName(name)
        if (!s) continue
        let st
        try { st = statSync(`${LOG_DIR}/${name}`) } catch { continue }
        const endMs = st.mtimeMs
        let lane = s.lane
        if (lane === 'builder') {
            // the wrapper writes "… session pid=N log=… slot=a" — post-fleet logs
            // without a marker are unattributable; skip them.
            let head = ''
            try { head = readFileSync(`${LOG_DIR}/${name}`, 'utf8').slice(0, 4000) } catch { continue }
            const slot = head.match(/session pid=\d+ .*slot=([ab])/)
            if (slot) lane = slot[1]
            else if (endMs < fleetSinceMs) lane = 'a'   // single-builder era
            else continue
        }
        out.push({ lane, startMs: s.startMs, endMs, alive: endMs > Date.now() - 12 * 60e3 })
    }
    return out
}

function shipsFor(fromMs, toMs) {
    const closed = [...closedInWindow('building', fromMs, toMs), ...closedInWindow('feedback', fromMs, toMs)]
    const seen = new Set()
    const ships = []
    for (const c of closed.slice(0, 40)) {
        if (seen.has(c.number)) continue
        seen.add(c.number)
        const lane = laneOfClaims(claimLines(c.number))
        if (lane) ships.push({ lane, atMs: Date.parse(c.at) })
    }
    return ships
}

export async function perfData(sinceMs, nowMs) {
    const beforeFrom = sinceMs - TRIAL_HOURS * 3600e3
    const rows = ledgerRows()
    const spans = sessionSpans(sinceMs)
    const honesty = []
    const boxes = []
    for (const [name, key, port] of BOXES_USAGE) {
        const usage = await fetchUsage(port, cfg.provider?.[key]?.options?.apiKey || '')
        const before = usageWindow(usage, beforeFrom, sinceMs)
        const after = usageWindow(usage, sinceMs, nowMs)
        const streams = streamStats(rows, key, sinceMs, nowMs)
        if (!before && !after) continue // box unreachable at report time — omit, don't zero
        boxes.push({ name, before, after, streams })
    }
    if (boxes.some((b) => b.before && b.before.hours < TRIAL_HOURS - 2)) {
        honesty.push(`Tokens/hr uses the servers' hourly usage buckets; where a window's coverage`,
            `(hours listed above) is short, the rate averages only the hours that reported.`)
    }
    if (boxes.some((b) => b.streams)) {
        honesty.push('Stream counts come from the 5-min telemetry ledger, wired with #1299 — they cover',
            'the ledger span only. Tokens/hr need no ledger: the server counters go back further.')
    }
    const spansBefore = boxMisses(spans, shipsFor(beforeFrom, sinceMs), beforeFrom, sinceMs)
    const spansAfter = boxMisses(spans, shipsFor(sinceMs, nowMs), sinceMs, nowMs)
    const empty = (m) => Object.values(m).every((l) => !l.n)
    const chartLines = []
    for (const b of boxes) {
        const series = [...(b.before?.perHour || []), ...(b.after?.perHour || [])]
        if (series.length < 6) continue
        const markIdx = (b.before?.perHour || []).length
        const s = spark(series.map((x) => x.tok))
        chartLines.push(`${b.name.padEnd(6)} ${markIdx > 0 && markIdx < s.length ? `${s.slice(0, markIdx)}|${s.slice(markIdx)}` : s}`)
    }
    return {
        boxes,
        spansBefore: empty(spansBefore) ? null : spansBefore,
        spansAfter: empty(spansAfter) ? null : spansAfter,
        chartLines,
        chartSince: iso(beforeFrom),
        honesty,
    }
}

const tick = async () => {
    const now = Date.now()
    let st = load()
    if (!st) {
        st = { since: iso(now), reported: false }
        writeFileSync(FILE, JSON.stringify(st, null, 2) + '\n')
        return `started ${st.since}`
    }
    if (st.reported) return `done (${VERDICT_FILE} exists: ${existsSync(VERDICT_FILE) ? readFileSync(VERDICT_FILE, 'utf8').trim() : 'missing!'})`
    const sinceMs = Date.parse(st.since)
    const hours = Math.floor((now - sinceMs) / 3600e3)
    if (hours < TRIAL_HOURS) return `running ${hours}h/${TRIAL_HOURS}h`
    const beforeClosed = [...closedInWindow('building', sinceMs - TRIAL_HOURS * 3600e3, sinceMs),
        ...closedInWindow('feedback', sinceMs - TRIAL_HOURS * 3600e3, sinceMs)]
    const afterClosed = [...closedInWindow('building', sinceMs, now),
        ...closedInWindow('feedback', sinceMs, now)]
    const verdict = trialVerdict({ closedBefore: beforeClosed, closedAfter: afterClosed })
    // #1290: lane split of the after-window ships — one comment fetch per ship,
    // capped at 40 (well above any observed 48 h count; the report says so).
    const allAfter = [...new Set(afterClosed.map((i) => i.number))]
    const split = laneSplit(allAfter.slice(0, 40).map((n) => ({ claims: claimLines(n) })))
    if (allAfter.length > 40) split.capped = allAfter.length
    // #1299: aggregate throughput — never let a perf failure lose the verdict
    // report itself; degrade to the pre-#1299 shape instead.
    let perf = null
    try { perf = perfData(sinceMs, now) } catch (e) {
        console.log(`perf failed: ${String(e && e.message || e).slice(0, 120)}`)
    }
    try {
        gh(['api', `repos/${REPO}/issues/1258/comments`, '-f', `body=${reportText({ since: st.since, until: iso(now), verdict, split, perf })}`])
    } catch (e) {
        return `report failed: ${String(e.message || e).slice(0, 120)}`
    }
    writeFileSync(VERDICT_FILE, `${verdict.keep ? 'keep' : 'revert'} ${iso(now)} (before ${verdict.before}/day after ${verdict.after}/day)\n`)
    st.reported = true
    writeFileSync(FILE, JSON.stringify(st, null, 2) + '\n')
    return `reported ${verdict.keep ? 'keep' : 'revert'} before=${verdict.before}/day after=${verdict.after}/day`
}

const status = () => {
    const st = load()
    if (!st) return 'trial not started'
    if (!st.reported) {
        const hours = Math.floor((Date.now() - Date.parse(st.since)) / 3600e3)
        return `trial running ${hours}h/${TRIAL_HOURS}h (since ${st.since})`
    }
    const v = existsSync(VERDICT_FILE) ? readFileSync(VERDICT_FILE, 'utf8').trim() : 'reported, verdict missing'
    return `trial ${v}`
}

// CLI only when invoked directly — lanecheck imports the pure core above.
if (process.argv[1] && process.argv[1].endsWith('studiotrial.mjs')) {
    const cmd = process.argv[2] || 'tick'
    if (cmd === 'tick') console.log(await tick())
    else if (cmd === 'status') console.log(status())
    else { console.log('usage: studiotrial.mjs [tick|status]'); process.exit(2) }
}
