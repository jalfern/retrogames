// runway.mjs — "N days of queued work left" per lane (#1201). Pure core.
//
// Jon's brief: a rough number that is roughly right beats a precise one that
// is wrong. So the estimator has three dials and no dials hidden behind them:
//   SIZE   — every queued item is S/M/L in build-days (keywords decide, the
//            default is M). No line counts, no fake diffs.
//   RATE   — what the lane actually delivered in the trailing window: issues
//            closed carrying `building` (Builder) / `feedback` (QA).
//   DAYS   — Σ estimates ÷ rate, rounded to the nearest half-day.
// A rate of zero in the window makes days `null` (the line shows `?`), never
// a made-up number. A lane under a day goes amber. An empty queue is not
// "0 days" — it is the self-directed polish fallback, said out loud.
//
// IO lives in scripts/runway.mjs (gh + file); the board renders the JSON this
// produces (via board.json) and src/pages/floor.js only chooses the colour.

export const SIZES = { S: 0.4, M: 0.8, L: 1.5 }
export const WINDOW_DAYS = 14
export const AMBER_UNDER_DAYS = 1
// HISTORY_DAYS (#1233) — the trend window behind the strip's sparkline: one
// sample per UTC day, seven deep ("is the queue shrinking?" readable at a
// glance). A reboot of the telemetry box empties the /tmp file and the
// sparkline refills over seven days — honest, like the last-known-runway
// fallback a failed run already gives the board.
export const HISTORY_DAYS = 7

// S first: "POLISH — SSX: fix audio" stays S even though SSX sounds big;
// then L, else M. Title carries most of the signal, body only its first line.
const L_WORDS = /\b(3d|hd|open[- ]?world|multiplayer|survival|procedural|campaign|colony|city[- ]?builder|simulator|sim kit|dungeon crawl|rpg|platformer 64|world)\b/i
const S_WORDS = /\b(polish|juice|fix|tweak|sfx|audio|music|hud|menu|title screen|high score|attract|palette|font|icon|balance|copy|text)\b/i

export const sizeClass = (issue) => {
    const text = `${issue.title || ''} ${(issue.body || '').split('\n')[0]}`
    if (S_WORDS.test(text)) return 'S'
    if (L_WORDS.test(text)) return 'L'
    return 'M'
}

export const estimateIssue = (issue) => SIZES[sizeClass(issue)]

// shipRate: closed timestamps (ISO strings) inside the trailing window ->
// closes per day; zero closes is null ("no recent ships"), not 0 (÷0).
export function shipRate(closedAts, { windowDays = WINDOW_DAYS, now = Date.now() } = {}) {
    const cutoff = now - windowDays * 86400e3
    const n = closedAts.filter((t) => { const ms = Date.parse(t); return Number.isFinite(ms) && ms >= cutoff }).length
    return n > 0 ? n / windowDays : null
}

// fmtDays: nearest half-day; singular through 1 ("~0.5 day", "~1 day" — Jon's
// own example), plural above ("~1.5 days"); null rate -> "~?" (honest, never
// invented). A non-empty lane never reads "~0 days": positive work clamps to
// the smallest bucket, half a day.
export function fmtDays(days) {
    if (days == null) return '~?'
    const r = Math.max(0.5, Math.round(days * 2) / 2)
    const num = Number.isInteger(r) ? String(r) : r.toFixed(1)
    return `~${num} ${r <= 1 ? 'day' : 'days'}`
}

// laneRunway: items = the lane's open issues (queue + what is building: a
// half-built game is still days of work before the lane is free).
export function laneRunway({ items = [], ratePerDay = null }) {
    const total = items.reduce((s, i) => s + estimateIssue(i), 0)
    // mix (#1233) — the per-item S/M/L breakdown behind the total size, so the
    // board can show HOW the "~N days" was counted, not just the number.
    const mix = { S: 0, M: 0, L: 0 }
    for (const i of items) mix[sizeClass(i)]++
    const days = ratePerDay ? total / ratePerDay : null
    const polish = items.length === 0
    return {
        items: items.length,
        size: Math.round(total * 100) / 100,
        mix,
        rate: ratePerDay ? Math.round(ratePerDay * 100) / 100 : null,
        days: days == null ? null : Math.round(days * 10) / 10,
        amber: !polish && days != null && days < AMBER_UNDER_DAYS,
        polish,
    }
}

// historyPoint (#1233) — one sparkline sample from a computed runway: each
// lane's day-count for one UTC day. A lane with no recent ships carries null
// (the sparkline leaves that day's cell blank, never a made-up zero).
export const historyPoint = (runway, dateKey) => ({
    d: dateKey,
    b: runway?.builder?.days ?? null,
    q: runway?.qa?.days ?? null,
})

// historyAppend (#1233) — the 7-day trend as a pure list update. Re-sampling
// the same UTC day REPLACES that day's entry, so the tail always reads as
// "now"; the list stays date-ascending and capped (older days fall off the
// left). Junk entries are dropped, never thrown on: the file is /tmp-local
// and a corrupt line must not take the runway strip down.
export const historyAppend = (history, point, { cap = HISTORY_DAYS } = {}) => {
    const clean = Array.isArray(history)
        ? history.filter((p) => p && typeof p === 'object' && typeof p.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.d))
        : []
    const next = [...clean.filter((p) => p.d !== point.d), point]
    next.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    return next.slice(-cap)
}

// splitRunway (#1233) — the Builder lane is ONE worker, so the platform/games
// split never divides the rate: each sub-queue shows how many days its own
// size would take AT THE SHARED full-lane rate (platform.size + games.size =
// the total, so the two day-counts sum to the lane's days). Unlabeled items
// are games — the builder's default job; `lane:platform` opts out.
export const splitRunway = (items, ratePerDay) => {
    const isPlatform = (i) => (i.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === 'lane:platform')
    const bucket = (pred) => {
        const it = items.filter(pred)
        const size = it.reduce((s, i) => s + estimateIssue(i), 0)
        return {
            items: it.length,
            size: Math.round(size * 100) / 100,
            days: ratePerDay ? Math.round((size / ratePerDay) * 10) / 10 : null,
        }
    }
    return { platform: bucket(isPlatform), games: bucket((i) => !isPlatform(i)) }
}

const lanePhrase = (name, lane) =>
    `${name}: ${lane.polish ? 'polish-only — self-directed' : `${fmtDays(lane.days)}${lane.days == null ? ' (no recent ships)' : ''} queued`}`

// runwayLine — the strip Jon reads on the board and in the digest. His
// brief said "something like 'Builder: ~2.5 days queued · QA: ~0.5 day'";
// both lanes carry the same shape (the example's tail abbreviated — the
// asymmetric reading would look like a bug to every reader).
export const runwayLine = ({ builder, qa }) => `${lanePhrase('Builder', builder)} · ${lanePhrase('QA', qa)}`

// Lane rates come from LABEL LINEAGE, not PR titles (the repo merges ~45
// commits/day across four boxes — title-guessing a lane from that is noise).
// What each lane demonstrably DELIVERS stays on the issue after it closes:
//   builder output = issues closed while carrying `building` (a claimed
//     queue item that shipped);
//   QA output      = issues closed while carrying `feedback`.
// Multi-stage issues (#1141) stay open between stages, so a stage-merge
// under-counts by design — the number errs long, never short.
//
// computeRunway assembles everything from raw GitHub payloads (arrays, no
// network) so scripts/runway.mjs and jonq digest share ONE truth.
export function computeRunway({ issues, closedBuilder = [], closedQa = [], now = Date.now(), windowDays = WINDOW_DAYS }) {
    const isOpenIssue = (i) => i.state === 'open' && !i.pull_request
    const has = (i, name) => (i.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === name)
    const builderItems = issues.filter((i) => isOpenIssue(i)
        && (has(i, 'game-queue') || has(i, 'building') || has(i, 'next') || has(i, 'steer'))
        && !has(i, 'stalled'))
    const qaItems = issues.filter((i) => isOpenIssue(i) && (has(i, 'feedback') || has(i, 'building-qa')) && !has(i, 'needs-approval'))
    const builderRate = shipRate((closedBuilder || []).map((i) => i.closed_at), { windowDays, now })
    const qaRate = shipRate((closedQa || []).map((i) => i.closed_at), { windowDays, now })
    // lanes (#1233) — the platform/games split rides the builder lane: the
    // strip's reveal can show WHERE the days sit without changing the line.
    const builder = { ...laneRunway({ items: builderItems, ratePerDay: builderRate }), lanes: splitRunway(builderItems, builderRate) }
    const qa = laneRunway({ items: qaItems, ratePerDay: qaRate })
    return { builder, qa, line: runwayLine({ builder, qa }), windowDays }
}

// digestText is the questions-digest body (#1201: the runway line must be
// visible without opening the site). Rows: #num [state] lane — title, with
// deadline + default indented; then the runway line, always.
// #1354: a `sleep` line (when the Studio was down) rides FIRST, right under
// the header — a sleeping machine outranks every open question, because it
// explains why none of them moved.
// #1392: the `churn` line rides right after it — same family of excuse
// (the ticks landed, but a dark-wake-churning box shipped nothing either).
// #1401: the `live` line rides FIRST of them all — "is it sleeping RIGHT
// NOW?" outranks "it slept earlier"; the live stamp answers it directly.
export function digestText({ questions = [], runway = null, sleep = null, churn = null, live = null, now = new Date() }) {
    const lines = [`FORGE QUESTIONS DIGEST — ${now.toISOString().slice(0, 10)}`]
    if (live) lines.push(live)
    if (sleep) lines.push(sleep)
    if (churn) lines.push(churn)
    if (questions.length === 0) lines.push('(no open questions)')
    for (const q of questions) {
        lines.push(`#${q.number} [${q.state}] ${q.lane ? `lane:${q.lane}` : 'lane:?'} — ${q.title}`)
        if (q.deadline) lines.push(`    due ${String(q.deadline).slice(0, 16).replace('T', ' ')} UTC · default: ${q.defaultText}`)
    }
    if (runway && runway.line) lines.push(`⏱ ${runway.line}`)
    return lines.join('\n')
}
