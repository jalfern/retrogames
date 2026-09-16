// Run the whole self-verifying suite and summarise.
//
//   npm run verify              # audio + menu/touch + autopilot + plants + quick evolve smoke
//   npm run verify -- --full     # ...with the full 60-generation evolution check
//
// IRONKEEP's check (fpscheck) is not Mario-specific — it audits every IronKeep
// level and drives the raycaster — but it runs here so one command proves the
// whole arcade still works. zorkcheck is not browser-specific either: it boots
// the real .z3 in Node, which is why it is also in the CI *static* job.
//
// Requires a running `npm run dev` in another terminal (each check fails fast
// with that instruction if the server is down). Exits non-zero if any check fails.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const full = process.argv.includes('--full')

const node = (script, args = []) => ({
    label: script.replace('.mjs', ''),
    cmd: process.execPath,
    args: [join(here, script), ...args],
})
const npm = (script, args = []) => ({
    label: script,
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', script, '--', ...args],
})

const suite = [
    npm('audcheck'),
    node('mariocheck.mjs'),
    node('autopilotcheck.mjs'),
    node('plantcheck.mjs'),
    node('levelcheck.mjs'),
    node('fpscheck.mjs'),
    // Browser-free: boots the real Zork I story file in Node. Cheapest gate here.
    node('aicheck.mjs'),   // the spine's own contract: rejections, watchdog, honest arms
    node('zorkcheck.mjs'),
    // DOS seams (js-dos on demand, keyboard capture, readable framebuffer).
    // Slow: DOSBox-in-wasm boots at ~40-90s headless. See scripts/doscheck.mjs.
    node('doscheck.mjs'),
    full ? node('evocheck.mjs') : node('evocheck.mjs', ['--gens', '30', '--min-fit', '500']),
]

const run = (t) => new Promise((resolve) => {
    console.log(`\n\x1b[1m=== ${t.label} ===\x1b[0m`)
    const child = spawn(t.cmd, t.args, { stdio: 'inherit', cwd: process.cwd() })
    child.on('close', code => resolve({ label: t.label, code }))
})

const t0 = Date.now()
const results = []
for (const t of suite) results.push(await run(t))

const bad = results.filter(r => r.code !== 0)
console.log(`\n\x1b[1m=== verify (${((Date.now() - t0) / 1000).toFixed(0)}s) ===\x1b[0m`)
for (const r of results) console.log(`  ${r.code === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.label}`)
console.log(bad.length ? `\n${bad.length} check(s) failed: ${bad.map(b => b.label).join(', ')}` : '\nall checks passed')
process.exit(bad.length ? 1 : 0)
