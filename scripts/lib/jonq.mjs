// jonq — the questions-for-Jon protocol (#605), pure half.
//
// Jon's decision (2026-10-20): questions live in issues, not STATE.md. A
// question is ONE issue labeled `waiting-jon` + `question` + `lane:<lane>`,
// whose body carries Options A/B, the Default the lane will take, and a
// Deadline (+48 h). No answer by the deadline = the default stands. The QA
// lane already parked on `waiting-jon` and resumed on a reply (FORGE-QA.md
// 5b, #180 lesson); this is that loop, lifted to both lanes and given the
// missing half — a question nobody answers must never park a lane forever.
//
// This module is the decision logic ONLY: no gh, no fs, no clock it invents
// (`now` is injected, same discipline as src/pages/floor.js), so
// scripts/jonqcheck.mjs pins every rule offline. The gh calls live in
// scripts/jonq.mjs.
//
// Issue shape this module speaks (the CLI maps GitHub's JSON to it):
//   { number, author, state, labels: ['game-queue', ...], created_at, body,
//     comments: [{ author, body, created_at }] }

export const QUESTION_LABEL = 'question'
export const WAITING_LABEL = 'waiting-jon'
export const STEER_LABEL = 'steer'
export const HALT_LABEL = 'halt'
export const DEFAULT_DEADLINE_HOURS = 48
export const MAX_OPEN_PER_LANE = 3

// Comments the factory writes itself. Anything NOT written by one of these
// is Jon (or Claude for him) speaking, and Jon outranks his own default —
// the answer-wins rule copied from FORGE-QA.md step 2.
export const ROBOT_PREFIXES = ['FORGE:', 'WARDEN:', 'QA:', 'QA (']

export const laneLabel = (lane) => `lane:${lane}`
const has = (issue, label) => (issue.labels || []).includes(label)
const isOpen = (issue) => issue.state === 'open'

export const isQuestion = (issue) => has(issue, QUESTION_LABEL)
export const isWaiting = (issue) => has(issue, WAITING_LABEL)

// ---- body format ------------------------------------------------------
// The markers are machine-parsed; a question without them cannot be swept,
// so `ask` refuses to file one (validateAsk). Layout (parseQuestion's
// counterpart, and the source of truth for the fixtures):
//
//   <the question, prose>
//
//   **Options:**
//   A) …
//   B) …
//
//   **Default:** <what the lane does if nobody answers>
//   **Deadline:** 2026-10-22T12:00:00.000Z
//   **Lane:** games

export function formatQuestion({ lane, question, options = [], defaultText, hours = DEFAULT_DEADLINE_HOURS, now = new Date() }) {
    const deadline = new Date(now.getTime() + hours * 3600 * 1000)
    return [
        question.trim(),
        '',
        '**Options:**',
        ...options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`),
        '',
        `**Default:** ${defaultText.trim()}`,
        `**Deadline:** ${deadline.toISOString()}`,
        `**Lane:** ${lane}`,
        '',
        `No answer by the deadline = the default is taken automatically (warden sweep, scripts/jonq.mjs). Reply here any time — your word beats the default, even late.`,
        '',
    ].join('\n')
}

export function parseQuestion(body) {
    const text = String(body || '')
    const grab = (marker) => {
        const m = text.match(new RegExp(`^\\*\\*${marker}:\\*\\*\\s*(.+)$`, 'm'))
        return m ? m[1].trim() : null
    }
    const rawDeadline = grab('Deadline')
    const deadline = rawDeadline ? new Date(rawDeadline) : null
    const optBlock = text.match(/\*\*Options:\*\*\s*\n((?:(?:[A-Z]\).*)\n?)+)/)
    return {
        question: text.split(/\n\s*\n/)[0].trim(),
        options: optBlock ? optBlock[1].split('\n').filter((l) => /^[A-Z]\)/.test(l)).map((l) => l.replace(/^[A-Z]\)\s*/, '')) : [],
        defaultText: grab('Default'),
        deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
        lane: grab('Lane'),
    }
}

// `ask` refuses anything the sweep could not resolve on its own.
export function validateAsk({ lane, question, options = [], defaultText }) {
    const errors = []
    if (!lane) errors.push('a question needs a lane (--lane games|qa|demos|platform)')
    if (!question || !question.trim()) errors.push('a question needs the question text')
    if (options.length < 2) errors.push('a question needs Options A/B — a question with one option is an order, not a decision')
    if (!defaultText || !defaultText.trim()) errors.push('a question needs a Default: what the lane does if nobody answers')
    return errors
}

// ---- per-question state -----------------------------------------------
export const isAnswer = (comment) => !ROBOT_PREFIXES.some((p) => String(comment.body || '').trim().startsWith(p))
export const isDefaultNote = (comment) => String(comment.body || '').trim().startsWith('FORGE: no answer')
export const isOverdue = (deadline, now) => !!deadline && now.getTime() > deadline.getTime()

export const defaultComment = (defaultText, now = new Date()) =>
    `FORGE: no answer by ${now.toISOString().slice(0, 10)}, took ${defaultText}`

// AWAITING  — parked on Jon, still inside the deadline
// OVERDUE   — no reply, past deadline; sweep will take the default this tick
// ANSWERED  — Jon (or Claude) spoke; his word beats the default, even late
// DEFAULTED — the default was taken; the question is a record, not a block
// MALFORMED — no **Default:** line to fall back on; a lane must fix or close it
export function decide(issue, now = new Date()) {
    const { defaultText, deadline } = parseQuestion(issue.body)
    const comments = issue.comments || []
    const answered = comments.some(isAnswer)
    const defaulted = comments.some(isDefaultNote)
    const state = answered ? 'ANSWERED'
        : defaulted ? 'DEFAULTED'
            : defaultText == null ? 'MALFORMED'
                : isOverdue(deadline, now) ? 'OVERDUE'
                    : 'AWAITING'
    return { state, defaultText, deadline }
}

// ---- lane caps --------------------------------------------------------
export function openQuestions(issues, lane = null) {
    return issues.filter((i) => isOpen(i) && isQuestion(i) && isWaiting(i)
        && (lane == null || lane === 'all' || has(i, laneLabel(lane))))
}
export const capReached = (issues, lane, cap = MAX_OPEN_PER_LANE) => openQuestions(issues, lane).length >= cap

// ---- steer + halt -----------------------------------------------------
// `halt` stops the factory: any OPEN issue carrying it (the label is
// collaborator-only, so carrying it means Jon put it there).
export const halted = (issues) => issues.some((i) => isOpen(i) && has(i, HALT_LABEL))

// `steer` = Jon's "do this next", honoured at the next cycle boundary:
// behind a half-built `building` item (FORGE.md step 1b never abandons a
// corpse mid-edit), ahead of `next`. Only jalfern's steer counts, and a
// question is never a work item.
export function steerIssue(issues, owner = 'jalfern') {
    return issues
        .filter((i) => isOpen(i) && has(i, STEER_LABEL) && i.author === owner
            && !isWaiting(i) && !has(i, 'stalled') && !has(i, QUESTION_LABEL))
        .sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0]?.number ?? null
}

// The builder's claim order, in one place so warden.sh and FORGE.md agree:
// resume the corpse > Jon's steer > next > oldest game-queue.
export function claimOrder(issues, owner = 'jalfern') {
    const ok = issues.filter((i) => isOpen(i) && !has(i, 'stalled') && !isWaiting(i))
    const byOldest = (list) => list.sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0]?.number ?? null
    return byOldest(ok.filter((i) => has(i, 'building')))
        ?? steerIssue(ok, owner)
        ?? byOldest(ok.filter((i) => has(i, 'next')))
        ?? byOldest(ok.filter((i) => has(i, 'game-queue')))
        ?? null
}
