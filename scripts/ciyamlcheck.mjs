// ciyamlcheck — parse every GitHub workflow file BEFORE pushing it (#1676 hole 2).
//
// Why: both pushes of forge/watch-phone (runs 1685/1688) carried a duplicated
// YAML mapping key (`if:` twice on one step, from an auto-merge). GitHub refused
// to parse ci.yml, produced ZERO check-runs, and every rule-5 "poll until
// static == SUCCESS" loop sat in Pending forever — it cannot distinguish
// "queued" from "workflow never started". A machine-merge that edits ci.yml
// must never learn that from a silent CI.
//
// js-yaml throws on parse errors AND on duplicated mapping keys (the exact
// shape of the incident), so a plain parse is the whole gate.
//
// Usage: npm run ciyamlcheck            — check .github/workflows/*.{yml,yaml}
//        npm run ciyamlcheck -- --selftest  — prove the checker can fail
// (the default run does the selftest first, so a linter that stops throwing
// on duplicate keys reddens CI too.)

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

const WF_DIR = '.github/workflows'

function checkText(text, name) {
  try {
    load(text, { json: false })
    return null
  } catch (e) {
    return `${name}: ${e.message.split('\n')[0]}`
  }
}

// Red-proof (#1575 lesson): a checker that cannot fail is not a checker.
// The BAD fixture is the exact runs-1685 shape — one step, two `if:` keys.
function selftest() {
  const ok = 'jobs:\n  j:\n    steps:\n      - run: x\n        if: a == b\n'
  const bad = 'jobs:\n  j:\n    steps:\n      - run: x\n        if: a == b\n        if: c == d\n'
  const okErr = checkText(ok, 'selftest-valid')
  const badErr = checkText(bad, 'selftest-dup-if')
  if (okErr) { console.error(`FAIL selftest: valid YAML rejected — ${okErr}`); return false }
  if (!badErr) { console.error('FAIL selftest: duplicated `if:` key ACCEPTED — gate is dead'); return false }
  return true
}

const doSelftest = process.argv.includes('--selftest')
if (!selftest()) process.exit(1)
if (doSelftest) { console.log('ciyamlcheck selftest: ok (valid parses, duplicated if: rejected)'); process.exit(0) }

let files
try {
  files = readdirSync(WF_DIR).filter((f) => /\.(yml|yaml)$/i.test(f)).sort()
} catch (e) {
  console.error(`ciyamlcheck: cannot read ${WF_DIR}: ${e.message}`)
  process.exit(1)
}
if (files.length === 0) { console.error(`ciyamlcheck: ${WF_DIR} holds no workflow files — suspicious`); process.exit(1) }

const errors = []
for (const f of files) {
  const err = checkText(readFileSync(join(WF_DIR, f), 'utf8'), f)
  if (err) errors.push(err)
}
if (errors.length) {
  console.error(`ciyamlcheck: ${errors.length} workflow file(s) will NOT parse on GitHub:`)
  errors.forEach((e) => console.error(`  ${e}`))
  console.error('A workflow GitHub cannot parse produces NO check-runs — every rule-5')
  console.error('static-wait loop spins blind on it (#1676). Fix the YAML, push again.')
  process.exit(1)
}
console.log(`ciyamlcheck: ${files.length} workflow file(s) parse clean (duplicate-key strict mode on)`)
