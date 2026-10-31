// studiotrial.mjs — the #1258 48-hour fleet trial: clock, verdict, memory.
//
// Jon's condition: "Trial for 48 h, then report total Studio tokens/s and
// items shipped per day against the 48 h before. If throughput didn't go up,
// drop back to 1 builder + 1 QA and say so." So this script:
//   tick     — records the trial start (first run on main after the merge);
//              at 48 h computes items/day for the two windows, posts the
//              report on #1258, and persists keep|revert to
//              /tmp/forge/studio-lanes.verdict — warden step 4 reads it and
//              refuses to kick slot b on `revert` (that IS the drop-back).
//   status   — one human line for `forge status` / the board.
//
// Honest metric note, said out loud in the report: tokens/s is visible live in
// watch.sh but nothing persisted it before the trial, so the before/after
// number is issues shipped per day (label lineage from runway.mjs: closes
// carrying `building` = builder output, `feedback` = QA output). A tie is a
// revert — "didn't go up" means exactly that.
//
// Pure core (verdict + report text) is exported and pinned offline by
// lanecheck.mjs; the IO (gh fetch, files, comment) stays thin here.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export const TRIAL_HOURS = 48
const FILE = '/tmp/forge/studio-lanes.json'
export const VERDICT_FILE = '/tmp/forge/studio-lanes.verdict'
const REPO = 'jalfern/retrogames'

// verdict — pure: two closed-issue lists (ISO closed_at strings), the later
// window must ship STRICTLY more items/day to keep the fleet.
export function trialVerdict({ closedBefore = [], closedAfter = [], hours = TRIAL_HOURS }) {
    const rate = (n) => Math.round((n / hours) * 24 * 100) / 100
    const before = rate(closedBefore.length)
    const after = rate(closedAfter.length)
    return { keep: after > before, before, after, hours }
}

// reportText — the #1258 comment. Numbers from the verdict, tone factual.
export function reportText({ since, until, verdict }) {
    const v = verdict.keep ? 'KEEP — throughput went up.' : 'REVERT — throughput did not go up; warden stops kicking slot b (back to 1 builder + 1 QA).'
    return [
        'FORGE STUDIO TRIAL REPORT (#1258) — first 48 h of 2 builders + 1 QA',
        `Trial window: ${since.slice(0, 16)}Z → ${until.slice(0, 16)}Z`,
        '',
        `Items shipped per day — before: ${verdict.before} · after: ${verdict.after} (issues closed carrying building/feedback)`,
        `Builder output: ${verdict.keep ? 'up' : 'not up'} with the second slot.`,
        '',
        `VERDICT: ${v}`,
        '',
        'Metric honesty: tokens/s streams live in watch.sh but nothing persisted it before',
        'the trial, so the comparison uses items/day; if the fleet keeps, wiring t/s',
        'persistence into telemetry is the obvious follow-up.',
    ].join('\n')
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
        .map((i) => i.closed_at)
        .filter((t) => { const ms = Date.parse(t); return Number.isFinite(ms) && ms >= fromMs && ms <= toMs })
}

function load() {
    try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return null }
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z/, 'Z')

const tick = () => {
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
    try {
        gh(['api', `repos/${REPO}/issues/1258/comments`, '-f', `body=${reportText({ since: st.since, until: iso(now), verdict })}`])
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
    if (cmd === 'tick') console.log(tick())
    else if (cmd === 'status') console.log(status())
    else { console.log('usage: studiotrial.mjs [tick|status]'); process.exit(2) }
}
