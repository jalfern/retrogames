#!/usr/bin/env node
// pulse — keeps exactly ONE open "FORGE PULSE" issue (#891). The warden calls
// this every tick; it prints the pulse number to post to on the last line.
//
//   node scripts/pulse.mjs          # act; prints the pulse number
//   node scripts/pulse.mjs --dry    # no mutations; prints the number (0 = would create)
//
// The lookup is a title SEARCH (open AND closed), immune to the flat-list
// paging that once made a 2nd copy. The decision is planPulse
// (scripts/lib/pulse.mjs), pinned by scripts/pulsecheck.mjs. A search failure
// aborts (empty output) rather than risk a duplicate — the warden treats a
// non-numeric result as fatal.
import { execFileSync } from 'node:child_process'
import { planPulse } from './lib/pulse.mjs'

const REPO = process.env.JONQ_REPO || 'jalfern/retrogames'
const DRY = process.argv.includes('--dry')
const gh = (...a) => execFileSync('gh', ['api', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const ghj = (...a) => JSON.parse(gh(...a))

const items = ghj(`search/issues?q=repo:${REPO}+is:issue+in:title+%22FORGE+PULSE%22&per_page=30`)
    .items
    .map((i) => ({ number: i.number, title: i.title, state: i.state }))
const plan = planPulse(items)

if (plan.create) {
    if (DRY) { console.log(0); process.exit(0) }
    const created = ghj('repos/' + REPO + '/issues',
        '-f', 'title=FORGE PULSE',
        '-f', 'body=Machine-updated status line for https://jalfern.com/retrogames/forge — do not close.')
    console.log(created.number)
    process.exit(0)
}
if (DRY) { console.log(plan.keep); process.exit(0) }
if (plan.reopen != null) gh('-X', 'PATCH', `repos/${REPO}/issues/${plan.reopen}`, '-f', 'state=open')
for (const n of plan.close) gh('-X', 'PATCH', `repos/${REPO}/issues/${n}`, '-f', 'state=closed', '-f', 'state_reason=completed')
console.log(plan.keep)
