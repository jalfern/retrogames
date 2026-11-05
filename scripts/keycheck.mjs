// #1614 — key rotation must not kill the lanes. Pinned:
//
//   npm run keycheck              # the laws
//   npm run keycheck -- --mutate # prove every load-bearing rule can fail
//
// Rule A (launch sync): scripts/lib/keysync.mjs copies provider.omlx's key
//   into the three Studio tap providers (omlxtap, omlxtapstudio, omlxtapb),
//   never into the Mini/MBP trio (omlxmini, omlxtapmini, omlxmbp) which have
//   their own key, never invents providers, is idempotent, atomic, and
//   fail-open (bad config => skip, exit 0 — a lane never fails to start
//   because the key plumbing hiccuped).
// Rule B (warden key-death): check-log answers KEYDEAD <category> for the
//   signatures ("Invalid API key", 401) and `ok` otherwise — and never
//   echoes a log line, so a key can't ride the answer onto the board.
// Rule C (wiring): forge.sh and forge-qa.sh call the sync BEFORE their model
//   routing (so the session rides the fresh key) and materialise the lib from
//   origin/main; warden.sh guards `add_label ... stalled` with key_dead and
//   opens a waiting-jon note instead; the alias + CORE entry exist so CI
//   actually runs this file; no lane script ever names apiKey.
//
// Secrets law (the issue's own): no test may print a key value either — the
// dummy keys below double as tripwires (C4 asserts none reach stdout/stderr).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'
import { KEY_SOURCE, TAP_TARGETS, PROTECTED, syncKeys, scanKeyDeath } from './lib/keysync.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const LIB = join(root, 'scripts', 'lib', 'keysync.mjs')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }

// fresh fixture: every provider has a DISTINCTIVE dummy key
const K = { src: 'sk-SOURCE-0123456789abcdef', staleA: 'sk-STALE-a', staleB: 'sk-STALE-b',
    staleC: 'sk-STALE-c', mini: 'sk-MINI-own', tapmini: 'sk-TAPMINI-own', mbp: 'sk-MBP-own' }
const fixture = () => ({
    model: 'omlx/Qwen3.8-Flash-Next-oQ4e-mtp',
    provider: {
        [KEY_SOURCE]: { options: { apiKey: K.src, baseURL: 'http://127.0.0.1:8000/v1' } },
        omlxtap: { options: { apiKey: K.staleA, baseURL: 'http://127.0.0.1:8010/v1' } },
        omlxtapstudio: { options: { apiKey: K.staleB, baseURL: 'http://127.0.0.1:8011/v1' } },
        omlxtapb: { options: { apiKey: K.staleC, baseURL: 'http://127.0.0.1:8012/v1' } },
        omlxmini: { options: { apiKey: K.mini, baseURL: 'http://127.0.0.1:18000/v1' } },
        omlxtapmini: { options: { apiKey: K.tapmini, baseURL: 'http://127.0.0.1:8013/v1' } },
        omlxmbp: { options: { apiKey: K.mbp, baseURL: 'http://127.0.0.1:18001/v1' } },
    },
    permission: { bash: { '*': 'allow' } },
})
const keyOf = (cfg, p) => cfg.provider?.[p]?.options?.apiKey

// ---------------------------------------------------- A. sync (pure core) ----
{
    const { updated } = syncKeys(fixture())
    ok(TAP_TARGETS.every((t) => updated.includes(t)), `A1: sync must refresh all three taps (got ${updated.join(',')})`)
    const cfg = fixture(); syncKeys(cfg)
    ok(TAP_TARGETS.every((t) => keyOf(cfg, t) === K.src), 'A1b: every tap must carry the SOURCE key')
    ok(PROTECTED.every((p) => keyOf(cfg, p) !== K.src), 'A2: the Mini/MBP trio must keep its OWN key')
    ok(keyOf(cfg, KEY_SOURCE) === K.src, 'A2b: the source must be untouched')
    const missing = fixture(); delete missing.provider.omlxtapstudio; syncKeys(missing)
    ok(!('omlxtapstudio' in missing.provider), 'A3: sync must never INVENT a provider')
    ok(cfg.model === 'omlx/Qwen3.8-Flash-Next-oQ4e-mtp' && cfg.permission?.bash?.['*'] === 'allow', 'A4: unrelated config fields survive the sync')
    ok(cfg.provider.omlxtap.options.baseURL === 'http://127.0.0.1:8010/v1', 'A4b: tap baseURLs survive (only the key moves)')
    const noSrc = fixture(); delete noSrc.provider[KEY_SOURCE].options.apiKey
    const r = syncKeys(noSrc)
    ok(r.updated.length === 0 && r.reason === 'no-source-key', 'A5: no source key -> no writes, reason named')
    const emptySrc = fixture(); emptySrc.provider[KEY_SOURCE].options.apiKey = ''
    ok(syncKeys(emptySrc).updated.length === 0, 'A5b: empty-string source key -> no writes')
    const once = fixture(); syncKeys(once)
    ok(syncKeys(once).updated.length === 0, 'A6: sync is idempotent (second run writes nothing)')
    ok(JSON.stringify(TAP_TARGETS) === JSON.stringify(['omlxtap', 'omlxtapstudio', 'omlxtapb']), 'A7: TAP_TARGETS is exactly the Studio trio')
    ok(JSON.stringify(PROTECTED) === JSON.stringify(['omlxmini', 'omlxtapmini', 'omlxmbp']), 'A8: PROTECTED is exactly the Mini/MBP trio')
    ok(TAP_TARGETS.every((t) => !PROTECTED.includes(t)) && KEY_SOURCE !== 'omlxmini' && KEY_SOURCE !== 'omlxmbp', 'A9: targets and protected are disjoint')
}

// -------------------------------------------------- B. key-death signatures ----
{
    ok(scanKeyDeath('Error: Invalid API key') === 'invalid-key', 'B1: "Invalid API key" is key-death')
    ok(scanKeyDeath('request failed: HTTP 401 Unauthorized') === 'unauthorized-401', 'B2: 401 Unauthorized is key-death')
    ok(scanKeyDeath('provider answered status=401') === 'status-401', 'B3: bare status-401 is key-death')
    ok(scanKeyDeath('kicked forge session pid=4242 log=/tmp/forge/20261105-101203.log slot=a\nnightly GREEN') === null, 'B4: a healthy launch log is not key-death')
    ok(scanKeyDeath('pkill user-data-dir=/tmp/forge/p4017/ — 502 upstream, port 8012 busy') === null, 'B5: ports/502s must not read as 401 (no false positives)')
    ok(scanKeyDeath('model route: direct (no tap)\nhalt label open') === null, 'B5b: normal lane chatter stays ok')
}

// --------------------------------------- C. CLI behaviour (spawned child) ------
const runCli = (args) => spawnSync('node', [LIB, ...args], { encoding: 'utf8' })
{
    const dir = mkdtempSync(join(tmpdir(), 'keycheck-'))
    try {
        const cfgPath = join(dir, 'opencode.json')
        writeFileSync(cfgPath, JSON.stringify(fixture(), null, 2) + '\n')
        const r = runCli(['sync', cfgPath])
        ok(r.status === 0, `C1: sync exits 0 (got ${r.status})`)
        ok(/keysync: refreshed/.test(r.stdout) && TAP_TARGETS.every((t) => r.stdout.includes(t)), 'C1b: summary names exactly the refreshed providers')
        const after = JSON.parse(readFileSync(cfgPath, 'utf8'))
        ok(TAP_TARGETS.every((t) => keyOf(after, t) === K.src), 'C1c: written config carries the source key in the taps')
        ok(PROTECTED.every((p) => keyOf(after, p) !== K.src), 'C1d: written config keeps the Mini/MBP keys')
        const r2 = runCli(['sync', cfgPath])
        ok(/nothing to do/.test(r2.stdout), 'C2: second sync reports nothing to do')
        ok(readdirSync(dir).every((f) => !f.endsWith('.tmp') && !f.startsWith('.keysync')), 'C3: no temp-file litter after sync')

        const badPath = join(dir, 'bad.json')
        const badRaw = '{ provider: oops'
        writeFileSync(badPath, badRaw)
        const rb = runCli(['sync', badPath])
        ok(rb.status === 0 && readFileSync(badPath, 'utf8') === badRaw && /skipped/.test(rb.stdout),
            'C4: bad JSON -> exit 0, file untouched, reason on stdout (fail-open)')

        const noKeyPath = join(dir, 'nokey.json')
        const noKeyRaw = JSON.stringify({ provider: { omlx: { options: { baseURL: 'x' } }, omlxtap: { options: { apiKey: K.staleA } } } })
        writeFileSync(noKeyPath, noKeyRaw)
        const rn = runCli(['sync', noKeyPath])
        ok(rn.status === 0 && readFileSync(noKeyPath, 'utf8') === noKeyRaw && /skipped|nothing/.test(rn.stdout),
            'C5: missing source key -> exit 0, file untouched')

        // secrets law: no dummy key rides ANY stdout/stderr of either command
        const allOut = [r, r2, rb, rn, runCli(['check-log', join(dir, 'nope.log')])]
            .map((x) => `${x.stdout}\n${x.stderr}`).join('\n')
        ok(Object.values(K).every((k) => !allOut.includes(k)), 'C6: the CLI never prints a key value')

        const deadPath = join(dir, 'dead.log')
        writeFileSync(deadPath, `[Thu Nov 05 10:12:03 PDT 2026]: kicked forge session pid=9 log=x slot=a\nError: Invalid API key\nkilled apiKey = ${K.staleA}\n`)
        const rd = runCli(['check-log', deadPath])
        ok(rd.status === 0 && /^KEYDEAD invalid-key$/m.test(rd.stdout), 'C7: check-log answers KEYDEAD <category>')
        ok(!rd.stdout.includes(K.staleA), 'C8: check-log never echoes the log line (key tripwire)')
        const ro = runCli(['check-log', join(dir, 'missing.log')])
        ok(ro.status === 0 && ro.stdout.trim() === 'ok', 'C9: missing log answers ok, exit 0 (fail-open)')
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

// ------------------------------------------------------- C+. wiring laws -----
{
    const forge = read('scripts/forge.sh'), qa = read('scripts/forge-qa.sh'), warden = read('scripts/warden.sh')
    const pkg = read('package.json'), table = read('scripts/checks.mjs')
    const syncCall = /node "\$KEYSYNC" sync /
    ok(syncCall.test(forge), 'W1: forge.sh calls the keysync sync')
    ok(forge.search(syncCall) > -1 && forge.search(syncCall) < forge.search(/TAP_CODE=\$\(curl/),
        'W1b: forge.sh syncs BEFORE the tap/model routing (the session rides the fresh key)')
    ok(syncCall.test(qa), 'W2: forge-qa.sh calls the keysync sync')
    ok(qa.search(syncCall) > -1 && qa.search(syncCall) < qa.search(/model route:/),
        'W2b: forge-qa.sh syncs BEFORE its model routing')
    ok(forge.includes('origin/main:scripts/lib/keysync.mjs') && qa.includes('origin/main:scripts/lib/keysync.mjs'),
        'W3: both launchers materialise the lib from origin/main (merge = install)')
    ok(warden.includes('origin/main:scripts/lib/keysync.mjs'), 'W4: warden materialises the lib from origin/main too')
    ok(/key_dead\(\)/.test(warden) && warden.includes('check-log'), 'W5: warden has key_dead() via check-log')
    ok(warden.includes('last.log') && warden.includes('last-forge-b.log'), 'W5b: key_dead reads BOTH slots newest logs')
    ok(warden.search(/if key_dead "\$s"; then/) > -1 && warden.search(/if key_dead "\$s"; then/) < warden.indexOf('add_label "$n" stalled'),
        'W6: the stalled label sits BEHIND the key_dead guard in kick_slot')
    ok(warden.includes('add_label "$n" stalled'), 'W6b: the real stalled path still exists (guard is a bypass, not a removal)')
    ok(warden.includes('keydead:$s'), 'W7: key-death rides the pulse as a keydead action')
    ok(/key_note/.test(warden) && /labels\[\]=waiting-jon/.test(warden) && /labels\[\]=lane:platform/.test(warden),
        'W8: the key note opens as waiting-jon + lane:platform')
    ok(!/jq.*apiKey/.test(warden), 'W9: warden.sh never extracts a key VALUE via jq (the JSON-path mention in the note body is a path, not a secret)')
    ok(!/jq.*apiKey/.test(forge) && !/jq.*apiKey/.test(qa), 'W9b: the launch scripts never extract an apiKey VALUE (the #1356 clone moves the whole provider object; only a word in a comment is fine)')
    ok(/"keycheck"\s*:/.test(pkg), 'W10: package.json carries the keycheck alias')
    ok(/'keycheck'/.test(table), 'W11: checks.mjs CORE runs keycheck')
}

if (process.argv.includes('--mutate')) {
    // ------------------------------------------------------- mutants ----
    const lib = read('scripts/lib/keysync.mjs')
    const forge = read('scripts/forge.sh'), qa = read('scripts/forge-qa.sh'), warden = read('scripts/warden.sh')
    const MUTANTS = [
        ['targets include the Mini provider', 'scripts/lib/keysync.mjs',
            lib, lib.replace("export const TAP_TARGETS = ['omlxtap'", "export const TAP_TARGETS = ['omlxmini', 'omlxtap'")],
        ['targets drop omlxtapstudio', 'scripts/lib/keysync.mjs',
            lib, lib.replace(", 'omlxtapstudio',", ',')],
        ['PROTECTED drops omlxmbp', 'scripts/lib/keysync.mjs',
            lib, lib.replace(", 'omlxmbp']", ']')],
        ['invalid-key signature removed', 'scripts/lib/keysync.mjs',
            lib, lib.replace(/\['invalid-key',[^\n]*\n/, '')],
        ['status-401 signature removed', 'scripts/lib/keysync.mjs',
            lib, lib.replace(/\['status-401',[^\n]*\n/, '')],
        ['forge.sh drops the sync call', 'scripts/forge.sh',
            forge, forge.replace('node "$KEYSYNC" sync', 'node "$KEYSYNC" nudge')],
        ['forge-qa.sh drops the sync call', 'scripts/forge-qa.sh',
            qa, qa.replace('node "$KEYSYNC" sync', 'node "$KEYSYNC" nudge')],
        ['warden stalled guard neutralised', 'scripts/warden.sh',
            warden, warden.replace('if key_dead "$s"; then', 'if false; then')],
        ['summary leaks the key value', 'scripts/lib/keysync.mjs',
            lib, lib.replace("from ${KEY_SOURCE}`)", ` key=\${config.provider[KEY_SOURCE].options.apiKey}\`)`)],
    ]
    for (const [name, file, orig, mutated] of MUTANTS) {
        if (orig === mutated) { fails.push(`mutant inert: ${name}`); continue }
        plant(join(root, file), mutated)
        const r = spawnSync('node', [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
        pull(join(root, file))
        const out = `${r.stdout}\n${r.stderr}`
        ok(r.status !== 0, `mutant survived: ${name}`)
        ok(!Object.values(K).some((k) => out.includes(k)), `mutant run leaked a key: ${name}`)
    }
}

console.log(`keycheck: ${pass} pass, ${fails.length} fail`)
for (const f of fails) console.log(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
