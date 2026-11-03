#!/usr/bin/env node
// scrubcheck — #1536: pins the shared secret scrub (scripts/lib/scrub.mjs).
//
//   npm run scrubcheck
//
// jalfern/forge-telemetry is public; a lane terminal line with an
// `Authorization: Bearer …` header leaked through the board's act lines.
// Every writer that publishes lane text now pipes its payload through
// scrub() before the push (telemetry.sh gates, dailylog, shiftreport,
// nightlybot). This check is the gate's gate:
//   A. one fake line per pattern — nothing secret survives, `<redacted>` lands
//   B. clean text (board phrases, short values) passes byte-identical
//   C. MUTANT: the very same assertions run against the scrub turned off
//      (identity) all fail — a neutered scrub is caught by THIS check
//   D. WIRING: every publish gate calls the shared function (raw-text pins,
//      the #1387 way — the gate cannot be unwired silently)
//   E. the CLI (stdin -> stdout) scrubs: telemetry.sh's python gates shell
//      out to it, so pin the pipe, not just the import
import { readFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { scrub, REDACTED } from './lib/scrub.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(HERE, f), 'utf8')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

// [fake line, the secret it carries] — one per pattern from the issue.
const CASES = [
    ['Authorization: Bearer ghp_FAKEFAKEFAKE000000', 'ghp_FAKEFAKEFAKE000000'],
    ['Authorization: Basic dGVzdDpwYXNzd29yZA==', 'dGVzdDpwYXNzd29yZA=='],
    ['curl -H "Authorization: Bearer sk-FAKE0000000000000000" https://omlx.local/v1/chat', 'sk-FAKE0000000000000000'],
    ['retry with Bearer FAKEBEARERTOKEN1234567890', 'FAKEBEARERTOKEN1234567890'],
    ['found sk-FAKE0000000000000000 in the log', 'sk-FAKE0000000000000000'],
    ['key is ghp_FAKEFAKEFAKE000000 on this box', 'ghp_FAKEFAKEFAKE000000'],
    ['gho_FAKEFAKEFAKE000000 rotated out', 'gho_FAKEFAKEFAKE000000'],
    ['github_pat_FAKEFAKEFAKEFAKEFAKE1234 pasted by accident', 'github_pat_FAKEFAKEFAKEFAKEFAKE1234'],
    ['xoxb-FAKE-FAKEFAKEFAKE12345 slack token', 'xoxb-FAKE-FAKEFAKEFAKE12345'],
    ['password=0123456789abcdef0123456789abcdef', '0123456789abcdef0123456789abcdef'],
    ['token=QUJDREVGR0hJSktMTU5PUFFSVFRUVldYWVo=', 'QUJDREVGR0hJSktMTU5PUFFSVFRUVldYWVo='],
    ['secret="dGhpcyBmYWtlIHNlY3JldCBlbmNvZGVk"', 'dGhpcyBmYWtlIHNlY3JldCBlbmNvZGVk'],
    ['key=DEADBEEFdeadbeef', 'DEADBEEFdeadbeef'],
]

// A: nothing secret survives, the marker lands
for (const [line, secret] of CASES) {
    const out = scrub(line)
    ok(!out.includes(secret), `secret redacted: ${secret.slice(0, 12)}…`)
    ok(out.includes(REDACTED), `marker lands: ${secret.slice(0, 12)}…`)
}

// B: clean text passes byte-identical (short values are not secret-shaped;
// board phrases must not be mangled)
const CLEAN = [
    'QA (mini): claimed 2026-11-03T21:31Z — plan: shared secret scrub + gates',
    'password=hunter2',
    'key=42',
    'the builder merged PR 1534 at 14:02; board samples look flat',
    `key=${'a'.repeat(15)}`,   // 15 chars: under the long-value floor
]
for (const line of CLEAN) ok(scrub(line) === line, `clean passes: ${line.slice(0, 40)}`)
ok(scrub(`key=${'a'.repeat(16)}`) === `key=${REDACTED}`, 'the 16-char floor: 15 passes, 16 redacts')

// the gate feeds scrub SERIALISED payloads — pin both directions there
const cleanJson = JSON.stringify({ act: '→ all good', commit: 'qa/secret-scrub: gate at the push' })
ok(scrub(cleanJson) === cleanJson, 'clean JSON payload passes byte-identical')
const dirtyJson = JSON.stringify({ act: '$ curl -H "Authorization: Bearer ghp_FAKEFAKEFAKE000000"' })
const scrubbedJson = scrub(dirtyJson)
ok(!scrubbedJson.includes('ghp_FAKEFAKEFAKE000000') && scrubbedJson.includes(REDACTED),
    'a secret in a serialised payload is redacted')
ok(JSON.parse(scrubbedJson).act !== undefined, 'scrubbing a JSON payload keeps it parseable')

// C: MUTANT — the scrub turned off (identity) must fail the very same
// assertions, so a neutered scrub goes red HERE, not on a public leak.
const identity = s => s
const mutantEscapes = CASES.filter(([line, secret]) => !identity(line).includes(secret) || identity(line).includes(REDACTED))
ok(mutantEscapes.length === 0, 'mutant (scrub off) fails every secret assertion — the check is load-bearing')
ok(CASES.every(([line, secret]) => identity(line).includes(secret)),
    'every fake line really carries its secret (the mutant has something to leak)')

// D: WIRING — every publish gate calls the shared function
const tele = read('telemetry.sh')
ok(tele.includes('show origin/main:scripts/lib/scrub.mjs'), 'telemetry.sh materialises the shared scrub from origin/main')
ok((tele.match(/['"]node['"],\s*['"]\/tmp\/forge\/lib\/scrub\.mjs['"]/g) || []).length >= 2,
    'both telemetry gates (telemetry.json + board.json) pipe through the scrub')
ok(tele.includes('scrub failed'), 'a scrub failure skips the push (stale board beats a public leak)')
ok(tele.includes('/tmp/forge/dailylog-run.mjs') && tele.includes('/tmp/forge/shiftreport-run.mjs'),
    'dailylog/shiftreport run materialised (a stdin module cannot import the scrub)')
const daily = read('dailylog.mjs')
ok(daily.includes("from './lib/scrub.mjs'") && daily.includes('scrub(JSON.stringify(log))'),
    'log.json is scrubbed at its push gate')
const shift = read('shiftreport.mjs')
ok(shift.includes("from './lib/scrub.mjs'") && shift.includes('scrub(JSON.stringify(report))'),
    'report.json is scrubbed at its push gate')
const nightly = read('nightlybot.mjs')
ok(nightly.includes("from './lib/scrub.mjs'") && nightly.includes('scrub(JSON.stringify(doc))'),
    'nightly.json is scrubbed at its push gate')

// E: the CLI pipe — telemetry.sh's python gates shell out to it.
// E runs it from a /tmp path on purpose: /tmp is a symlink to /private/tmp
// on macOS, and the isMain test must realpath or the CLI sits silent with
// exit 0 and the gates ship empty payloads (caught in E2E before ship).
const cliDir = join('/tmp', 'scrubcheck-cli')
rmSync(cliDir, { recursive: true, force: true })
mkdirSync(cliDir, { recursive: true })
copyFileSync(join(HERE, 'lib/scrub.mjs'), join(cliDir, 'scrub.mjs'))
const cli = execFileSync('node', [join(cliDir, 'scrub.mjs')],
    { input: 'x ghp_FAKEFAKEFAKE000000 y\npassword=0123456789abcdef\n', encoding: 'utf8' })
rmSync(cliDir, { recursive: true, force: true })
ok(!cli.includes('ghp_FAKEFAKEFAKE000000') && !cli.includes('0123456789abcdef') && cli.includes(REDACTED),
    'the CLI (stdin -> stdout) scrubs, even from a symlinked /tmp path')
ok(scrub('plain line') === 'plain line', 'the CLI and the import share one function (same pass-through)')
ok(tele.includes('empty output'), 'the gates skip the push on silent scrub (empty output would clobber the board)')

console.log(`scrubcheck: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.error('  FAIL ' + f)
process.exit(fails.length ? 1 : 0)
