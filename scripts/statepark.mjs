#!/usr/bin/env node
// statepark.mjs — slot-scoped STATE.md handoff for the lane playbooks (#1430).
// Pure core + gate: scripts/lib/statepark.mjs, lanecheck.mjs section D.
//
//   node scripts/statepark.mjs park <slot>   in the main checkout after step 9:
//       copies STATE.md to /tmp/forge/STATE.<slot>.parked.md (+ legacy shared
//       path) so a parallel slot's step-1 checkout cannot eat the report.
//   node scripts/statepark.mjs read          in the main checkout at step 1:
//       prints the newest report among STATE.md and every park file whose
//       content differs from the committed HEAD copy. `NO-REPORT` + exit 0
//       when nothing pending exists (the honest case).
// STATEPARK_DIR overrides the park dir (tests; default /tmp/forge).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parkReport, readReport, PARK_DIR } from './lib/statepark.mjs'

const [cmd, arg] = process.argv.slice(2)
const parkDir = process.env.STATEPARK_DIR || PARK_DIR

const headState = () => {
    try { return execFileSync('git', ['show', 'HEAD:STATE.md'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}

if (cmd === 'park') {
    const slot = arg
    let content
    try { content = readFileSync('STATE.md', 'utf8') } catch { content = '' }
    if (!content.trim()) { console.log('NO-CONTENT'); process.exit(0) }
    const written = parkReport({ content, slot, parkDir })
    console.log(`PARKED ${written.join(' ')}`)
} else if (cmd === 'read') {
    const { report } = readReport({ parkDir, headContent: headState() })
    if (!report) { console.log('NO-REPORT'); process.exit(0) }
    console.log(`REPORT ${report.path} ${new Date(report.mtimeMs).toISOString()}`)
    process.stdout.write(report.content)
} else {
    console.error('usage: statepark.mjs <park|read> [slot]')
    process.exit(2)
}
