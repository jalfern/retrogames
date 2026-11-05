#!/usr/bin/env node
// chromesmokecheck — #1622: pin the Chrome boot ladder and the pulse field.
//
// Proves three things: (1) bootLadder is ordered + deduped + hoists the cached
// mode; (2) shotsField tells the truth (ok/broken/unknown, staleness); (3) the
// live smoke actually produces a PNG, AND a bogus channel still boots via the
// ladder (fallback is real, not decorative). Local/Studio check — CI has no
// bundled headless shell install, so this is not wired into `verify`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootLadder, shotsField, launchChrome } from './lib/chromeboot.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let fails = 0
const ok = (cond, msg) => { if (!cond) { console.log('FAIL', msg); fails++ } else console.log('  ok', msg) }

// ---- 1. pure ladder ------------------------------------------------
ok(JSON.stringify(bootLadder('chrome').map(a => a.mode)) === JSON.stringify(['chrome', 'chrome+sp', 'shell', 'shell+sp']),
    'ladder tries chrome, chrome+sp, shell, shell+sp')
ok(bootLadder('chrome', 'shell+sp')[0].mode === 'shell+sp', 'cached mode hoists to front')
ok(bootLadder('chrome', 'nonsense').length === 4, 'unknown cached mode is ignored')
ok(JSON.stringify(bootLadder(null).map(a => a.mode)) === JSON.stringify(['shell', 'shell+sp']),
    'null channel dedupes to the two shell modes')
ok(bootLadder('chrome').every(a => a.channel === 'chrome' || a.channel === null), 'attempts only name real channels')
ok(shotsField(null) === 'shots=unknown', 'no status = unknown')
ok(shotsField({ ok: true, mode: 'shell+sp', at: 1000 }, 1001) === 'shots=ok(shell+sp)', 'ok rides the pulse with its mode')
ok(shotsField({ ok: false, reason: 'launch', at: 1000 }, 1001) === 'shots=broken(launch)', 'broken rides the pulse')
ok(shotsField({ ok: true, mode: 'chrome', at: 0 }, 99999999) === 'shots=unknown', 'a stale status is unknown, not ok')

// ---- 2. live smoke -------------------------------------------------
const smoke = execFileSync('node', [join(ROOT, 'scripts', 'chromesmoke.mjs')], { encoding: 'utf8', timeout: 120000 }).trim()
ok(/^CHROMESMOKE ok mode=\S+ bytes=\d+$/.test(smoke), `smoke boots and shoots (${smoke})`)

// ---- 3. pulse path, including the truth about a broken box ---------
const dir = mkdtempSync(join(tmpdir(), 'chromesmoke-'))
const smokeFile = join(dir, 'smoke.json')
const env = { ...process.env, CHROME_SMOKE_FILE: smokeFile }
writeFileSync(smokeFile, JSON.stringify({ ok: false, reason: 'launch', at: Math.floor(Date.now() / 1000) }))
const pulseBroken = execFileSync('node', [join(ROOT, 'scripts', 'chromesmoke.mjs'), '--pulse'], { encoding: 'utf8', env }).trim()
ok(pulseBroken === 'shots=broken(launch)', 'a recorded failure says so on the pulse')
const pulseOut = execFileSync('node', [join(ROOT, 'scripts', 'chromesmoke.mjs'), '--pulse'], { encoding: 'utf8', timeout: 60000 }).trim()
ok(/^shots=ok\(\S+\)$/.test(pulseOut), `fresh smoke reports ok (${pulseOut})`)

// ---- 4. fallback is real: a bogus channel still boots ---------------
// Only asserted where playwright's bundled shell exists (CI installs only
// system Chrome); elsewhere it prints a skip rather than a fake green.
let shellPresent = false
try {
    const { chromium } = await import('playwright-core')
    chromium.executablePath() // bundled browser path; throws when never installed
    shellPresent = true
} catch { /* not installed here */ }
if (shellPresent) {
    let bogus = null
    try {
        bogus = await launchChrome({ channel: 'definitely-not-installed', quiet: true })
        await bogus.close()
    } catch { /* judged below */ }
    ok(bogus !== null, `bogus channel falls through the ladder and boots (mode ${bogus && bogus.__bootMode})`)
} else {
    console.log('  skip bogus-channel proof (no bundled headless shell here)')
}

console.log(fails ? `CHROMESMOKECHECK ${fails} FAIL` : 'CHROMESMOKECHECK all green')
process.exit(fails ? 1 : 0)
