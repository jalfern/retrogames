#!/usr/bin/env node
// jonq — the questions-for-Jon protocol, IO half (#605).
//
// Jon's decision (2026-10-20): questions live in issues, never in STATE.md,
// and a lane never waits on one. The rules themselves are pure and pinned in
// scripts/lib/jonq.mjs + scripts/jonqcheck.mjs; this file only speaks gh.
//
//   node scripts/jonq.mjs ask   --lane games --title "SSX rider 5 body?" \
//                           --question "…prose…" --option "keep the duplicate" \
//                           --option "fetch a sixth CC0 body" \
//                           --default "keep the duplicate" [--hours 48] [--dry]
//   node scripts/jonq.mjs sweep [--lane games] [--dry]   # warden runs it every tick
//   node scripts/jonq.mjs list  [--lane games] [--json]  # lanes read this at the claim step
//   node scripts/jonq.mjs halt                            # yes|no  — does a `halt` stop the factory?
//   node scripts/jonq.mjs steer                           # #<n>   — jalfern's steer, if any
//
// `ask` refuses (exit 2) when the decision is not decidable — fewer than two
// options, no default, or the lane already carries 3 open questions: ask
// rarely is a cap, not an aspiration.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
    DEFAULT_DEADLINE_HOURS, MAX_OPEN_PER_LANE, WAITING_LABEL, QUESTION_LABEL,
    claimOrder, decide, defaultComment, formatQuestion, halted, laneLabel,
    openQuestions, steerIssue, validateAsk,
} from './lib/jonq.mjs'

const REPO = process.env.JONQ_REPO || 'jalfern/retrogames'
const OWNER = process.env.JONQ_OWNER || 'jalfern'

function gh(args, { input } = {}) {
    return execFileSync('gh', ['api', ...args], { encoding: 'utf8', input: input ?? null, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
const ghJson = (...args) => JSON.parse(gh(args))

const toIssue = (i) => ({
    number: i.number,
    author: i.user?.login ?? i.user ?? '',
    state: i.state,
    labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
    created_at: i.created_at,
    body: i.body || '',
})

const openIssues = (labels) =>
    ghJson(`repos/${REPO}/issues?state=open${labels ? `&labels=${labels}` : ''}&per_page=100`)
        .filter((i) => !i.pull_request)
const commentsOf = (n) => ghJson(`repos/${REPO}/issues/${n}/comments?per_page=100`)
    .map((c) => ({ author: c.user.login, body: c.body || '', created_at: c.created_at }))

function ensureLabel(name, color = '8C9556') {
    try { gh([`repos/${REPO}/labels/${name}`]) } catch {
        gh(['repos/' + REPO + '/labels', '-f', `name=${name}`, '-f', `color=${color}`, '-f', `description=${name} (jonq #605)`])
    }
}

function parseArgs(argv) {
    const opts = { options: [] }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--dry' || a === '--json') opts[a.slice(2)] = true
        else if (a === '--option') opts.options.push(argv[++i])
        else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i]
    }
    return opts
}

function cmdAsk(opts, now) {
    if (opts.file) opts.question = readFileSync(opts.file, 'utf8')
    const errors = validateAsk({ lane: opts.lane, question: opts.question, options: opts.options, defaultText: opts.default })
    if (errors.length) {
        for (const e of errors) console.error(`jonq ask refused: ${e}`)
        process.exit(2)
    }
    const lane = opts.lane
    ensureLabel(WAITING_LABEL, 'ededed'); ensureLabel(QUESTION_LABEL, 'ededed'); ensureLabel(laneLabel(lane), 'c5def5')
    const queue = openIssues(QUESTION_LABEL).map(toIssue)
    if (openQuestions(queue, lane).length >= (Number(opts.cap) || MAX_OPEN_PER_LANE)) {
        console.error(`jonq ask refused: lane ${lane} already carries ${MAX_OPEN_PER_LANE} open questions — ask rarely (list them: jonq.mjs list --lane ${lane})`)
        process.exit(2)
    }
    const body = formatQuestion({
        lane,
        question: opts.question,
        options: opts.options,
        defaultText: opts.default,
        hours: Number(opts.hours) || DEFAULT_DEADLINE_HOURS,
        now,
    })
    if (opts.dry) { console.log(`DRY would file:\n--- ${opts.title}\n${body}---`); return }
    const created = ghJson(['repos/' + REPO + '/issues', '-f', `title=${opts.title}`, '-f', `body=${body}`,
        '-f', `labels[]=${WAITING_LABEL}`, '-f', `labels[]=${QUESTION_LABEL}`, '-f', `labels[]=${laneLabel(lane)}`])
    console.log(`#${created.number} ${created.html_url}`)
}

function cmdSweep(opts, now) {
    let actions = 0
    for (const raw of openIssues(`${QUESTION_LABEL},${WAITING_LABEL}`)) {
        const issue = { ...toIssue(raw), comments: commentsOf(raw.number) }
        const { state, defaultText } = decide(issue, now)
        if (opts.lane && opts.lane !== 'all' && !issue.labels.includes(laneLabel(opts.lane))) continue
        if (state === 'ANSWERED') {
            if (opts.dry) { console.log(`DRY #${issue.number} answered — un-park`); actions++; continue }
            gh(['-X', 'DELETE', `repos/${REPO}/issues/${issue.number}/labels/${WAITING_LABEL}`])
            console.log(`#${issue.number} ANSWERED — un-parked`)
            actions++
        } else if (state === 'OVERDUE') {
            const note = defaultComment(defaultText, now)
            if (opts.dry) { console.log(`DRY #${issue.number} overdue — ${note}`); actions++; continue }
            gh(['repos/' + REPO + `/issues/${issue.number}/comments`, '-f', `body=${note}`])
            gh(['-X', 'DELETE', `repos/${REPO}/issues/${issue.number}/labels/${WAITING_LABEL}`])
            console.log(`#${issue.number} DEFAULTED — ${note}`)
            actions++
        } else if (state === 'MALFORMED' && !issue.comments.some((c) => c.body.trim().startsWith('FORGE: malformed'))) {
            const note = 'FORGE: malformed question — no **Default:** line, so this can never time out into a decision. Edit the body (see scripts/lib/jonq.mjs) or close it.'
            if (opts.dry) { console.log(`DRY #${issue.number} malformed — annotate`); actions++; continue }
            gh(['repos/' + REPO + `/issues/${issue.number}/comments`, '-f', `body=${note}`])
            console.log(`#${issue.number} MALFORMED — annotated`)
            actions++
        }
    }
    console.log(`sweep: ${actions} action${actions === 1 ? '' : 's'}`)
}

function cmdList(opts) {
    const rows = openIssues(QUESTION_LABEL).map((raw) => {
        const issue = { ...toIssue(raw), comments: commentsOf(raw.number) }
        const { state, defaultText, deadline } = decide(issue, new Date())
        return { number: issue.number, title: issue.title, labels: issue.labels, state, defaultText, deadline: deadline ? deadline.toISOString() : null }
    }).filter((r) => !opts.lane || opts.lane === 'all' || r.labels.includes(laneLabel(opts.lane)))
    if (opts.json) { console.log(JSON.stringify(rows)); return }
    if (!rows.length) { console.log('no open questions'); return }
    for (const r of rows) {
        console.log(`#${r.number} [${r.state}] ${(r.labels.find((l) => l.startsWith('lane:')) || 'lane:?')} ${r.title}`)
        if (r.deadline) console.log(`    deadline ${r.deadline}  default: ${r.defaultText}`)
    }
}

const argv = process.argv.slice(2)
const cmd = argv[0]
const opts = parseArgs(argv.slice(1))
const now = new Date()
switch (cmd) {
    case 'ask': cmdAsk(opts, now); break
    case 'sweep': cmdSweep(opts, now); break
    case 'list': cmdList(opts); break
    case 'halt': console.log(halted(openIssues(null).map(toIssue)) ? 'yes' : 'no'); break
    case 'steer': {
        const n = steerIssue(openIssues(null).map(toIssue), OWNER)
        console.log(n == null ? '' : `#${n}`)
        break
    }
    case 'claim': {
        const n = claimOrder(openIssues(null).map(toIssue), OWNER)
        console.log(n == null ? '' : `#${n}`)
        break
    }
    default:
        console.error('usage: jonq.mjs ask|sweep|list|halt|steer|claim [opts]')
        process.exit(2)
}
