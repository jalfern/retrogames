#!/usr/bin/env node
// pulsecheck — pins the FORGE PULSE selection (scripts/lib/pulse.mjs planPulse).
//
//   npm run pulsecheck
//
// #891: the warden made 8 duplicate "FORGE PULSE" issues because it paged the
// flat open list (per_page=100) and missed the pulse once the list grew or the
// issue was closed. The fix finds it by title search and keeps exactly one.
// This pins that decision offline: an always-create selector (the old bug)
// goes red here, so a regression to "create on a missed lookup" is caught.
import { planPulse, PULSE_TITLE } from './lib/pulse.mjs'

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const P = (n, state = 'open', title = PULSE_TITLE) => ({ number: n, state, title })

// no pulse at all -> create (the ONLY time a new one may be made)
ok(eq(planPulse([]), { keep: null, create: true, reopen: null, close: [] }), 'empty -> create')
ok(eq(planPulse([P(5, 'open', 'something else'), P(6, 'closed', 'FORGE — keep the issue list clean: one FORGE PULSE, …')]),
   { keep: null, create: true, reopen: null, close: [] }), 'title must match EXACTLY (a mention is not the pulse)')

// the one kept open -> use it, touch nothing
ok(eq(planPulse([P(795)]), { keep: 795, create: false, reopen: null, close: [] }), 'single open -> use, no reopen/close')

// the pulse closed (with older closed dups) -> reopen the newest, NEVER create a 2nd copy
ok(eq(planPulse([P(91, 'closed'), P(777, 'closed'), P(795, 'closed')]),
   { keep: 795, create: false, reopen: 795, close: [] }), 'all closed -> reopen newest, create=false')

// a stray open duplicate slipped through -> keep the newest open, close the rest
ok(eq(planPulse([P(777), P(795)]), { keep: 795, create: false, reopen: null, close: [777] }), 'two open -> keep newest, close the dup')

// mixed: the newest is closed but an older one is still open -> the open one wins (it is the one kept open)
ok(eq(planPulse([P(795, 'closed'), P(777)]), { keep: 777, create: false, reopen: null, close: [] }), 'newest closed + older open -> keep the open one')

// the live board shape at #891, verbatim: one open (#795) + seven closed dups -> keep #795, no mutation
ok(eq(planPulse([P(795), P(793, 'closed'), P(787, 'closed'), P(785, 'closed'), P(783, 'closed'), P(779, 'closed'), P(777, 'closed'), P(91, 'closed')]),
   { keep: 795, create: false, reopen: null, close: [] }), 'live board shape -> keep #795, no mutation')

// MUTANT PROOF: a neutered selector that always creates (the pre-#891 bug) must
// diverge from the fixed selector on a board that already has a pulse.
const alwaysCreate = { keep: null, create: true, reopen: null, close: [] }
ok(!eq(alwaysCreate, planPulse([P(795)])), 'mutant (always-create) diverges when a pulse exists')

console.log(`pulsecheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.error('  FAIL ' + f)
process.exit(fails.length ? 1 : 0)
