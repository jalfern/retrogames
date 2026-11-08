#!/usr/bin/env node
// pulse — keeps exactly ONE open "FORGE PULSE" issue (#891). The warden calls
// this every tick; it prints the pulse number to post to on the last line.
//
//   node scripts/pulse.mjs          # act; prints the pulse number
//   node scripts/pulse.mjs --dry    # no mutations; prints the number (0 = would create)
//
// The lookup is a title SEARCH (open AND closed), immune to the flat-list
// paging that once made a 2nd copy, unioned with the open list (search lags).
// A pulse near GitHub's 2,500-comment cap is rotated (#1842, see lib/pulse.mjs). The decision is planPulse
// (scripts/lib/pulse.mjs), pinned by scripts/pulsecheck.mjs. A search failure
// aborts (empty output) rather than risk a duplicate — the warden treats a
// non-numeric result as fatal.
import { execFileSync } from 'node:child_process'
import { planPulse } from './lib/pulse.mjs'

const REPO = process.env.JONQ_REPO || 'jalfern/retrogames'
const DRY = process.argv.includes('--dry')
const gh = (...a) => execFileSync('gh', ['api', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const ghj = (...a) => JSON.parse(gh(...a))

// Title search (open AND closed) for history, UNIONED with the flat open list:
// search lags issue creation by seconds-to-minutes, and the tick right after a
// rotation must still see the pulse it just made (or it would make another).
// The open list is unlagged; the search covers closed and >100-open boards.
const seen = new Map()
const add = (i) => seen.set(i.number, { number: i.number, title: i.title, state: i.state, comments: i.comments ?? 0 })
ghj(`search/issues?q=repo:${REPO}+is:issue+in:title+%22FORGE+PULSE%22&per_page=30`).items.forEach(add)
ghj(`repos/${REPO}/issues?state=open&per_page=100`).filter((i) => !i.pull_request).forEach(add)
const plan = planPulse([...seen.values()])

if (DRY) { console.log(plan.create ? 0 : plan.keep); process.exit(0) }
let keep = plan.keep
if (plan.create) {
    // Create BEFORE retiring the full one, so there is never a tick with no open pulse.
    const from = plan.close.length ? `\n\nRotated from #${plan.close.join(', #')} (2,500-comment limit).` : ''
    keep = ghj('repos/' + REPO + '/issues',
        '-f', 'title=FORGE PULSE',
        '-f', `body=Machine-updated status line for https://jalfern.com/retrogames/forge — do not close.${from}`).number
}
if (plan.reopen != null) gh('-X', 'PATCH', `repos/${REPO}/issues/${plan.reopen}`, '-f', 'state=open')
for (const n of plan.close) gh('-X', 'PATCH', `repos/${REPO}/issues/${n}`, '-f', 'state=closed', '-f', 'state_reason=completed')
console.log(keep)
