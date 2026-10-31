// chromeguardcheck — #907: killed check scripts must take their Chrome with them.
//
// The *check.mjs scripts used to kill Chrome only in a `finally`, so a killed
// session (forge-qa hard cap, interrupted run) orphaned headless Chrome under
// launchd. scripts/chromecleanup.mjs now guards every spawn with exit/SIGTERM/
// SIGINT handlers. This harness proves the guard actually reaps, without needing
// a real browser:
//   1. SIGNALS — a driver that spawns a fake Chrome and guards it, then gets
//      SIGTERM / SIGINT / clean-exit, leaves zero processes behind holding
//      its /tmp/forge profile (the issue's exact done-when).
//   2. WIRING — every script that spawns Chrome (#907's seven) imports the
//      guard and wires it; both lane starters carry the /tmp/forge backstop.
//   3. SYNTAX — every touched script still parses.
//
//   npm run chromeguardcheck
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const alive = prof => spawnSync('pgrep', ['-f', `user-data-dir=${prof}`]).status === 0

async function until(cond, ms) {
  for (let i = 0; i < ms / 100; i++) { if (await cond()) return true; await sleep(100) }
  return cond()
}

const DRIVER = (guardPath) => `import { spawn } from 'node:child_process'
import { guardChrome } from ${JSON.stringify(guardPath)}
const [prof, mode] = process.argv.slice(2)
const chrome = spawn('node', ['-e', 'setInterval(() => {}, 1000)', \`--user-data-dir=\${prof}\`], { stdio: 'ignore' })
guardChrome(chrome, prof)
if (mode === 'exit') setTimeout(() => process.exit(0), 300)
else setInterval(() => {}, 1000)
`

async function reapCase(label, signal) {
  const prof = `/tmp/forge/chromeguard-test-${process.pid}-${label}`
  const driver = `${prof}-driver.mjs`
  writeFileSync(driver, DRIVER(resolve(HERE, 'chromecleanup.mjs')))
  try {
    const child = spawn('node', [driver, prof, signal || 'exit'], { stdio: 'ignore' })
    ok(`${label}: fake Chrome is up`, await until(() => alive(prof), 3000))
    if (signal) child.kill(signal)
    await new Promise(r => child.on('exit', r))
    const reaped = await until(async () => !alive(prof), 3000)
    ok(`${label}: no process holds the profile after ${signal || 'clean exit'} (#907)`, reaped,
      reaped ? undefined : 'orphan survived — still matching user-data-dir=' + prof)
  } finally {
    spawnSync('pkill', ['-f', `user-data-dir=${prof}`])
    rmSync(driver, { force: true })
  }
}

console.log('# 1. reap behaviours')
await reapCase('sigterm', 'SIGTERM')
await reapCase('sigint', 'SIGINT')
await reapCase('exit', null)

console.log('# 2. wiring')
const guardSrc = resolve(HERE, 'chromecleanup.mjs')
for (const f of ['mountainscheck', 'campfirecheck', 'stormcheck', 'oceancheck', 'shorecheck', 'creditscheck', 'shoreperf']) {
  const src = await import('node:fs').then(m => m.readFileSync(resolve(HERE, `${f}.mjs`), 'utf8'))
  ok(`${f}.mjs imports guardChrome (#907)`, /from '\.\/chromecleanup\.mjs'/.test(src))
  ok(`${f}.mjs guards its Chrome spawn (#907)`, /guardChrome\(chrome,/.test(src))
}
// #1266: profiles are namespaced by the lane's DEV_PORT, so two lanes running
// the same check never share a profile dir and a lane restart never kills the
// other's live browser. spawn and guard must agree on the namespaced path.
const NS = /\/tmp\/forge\/p\$\{process\.env\.DEV_PORT \|\| 5173\}\/[a-z]+-profile/
for (const f of ['mountainscheck', 'campfirecheck', 'stormcheck', 'oceancheck', 'shorecheck', 'creditscheck', 'reefcheck', 'neonraincheck', 'volcanocheck', 'textfitcheck']) {
  const src = await import('node:fs').then(m => m.readFileSync(resolve(HERE, `${f}.mjs`), 'utf8'))
  const hits = src.match(/\/tmp\/forge\/[a-z]*-?(?:p\$\{[^}]*\}\/)?[a-z]*-?profile/g) || []
  const unsuffixed = src.match(/\/tmp\/forge\/[a-z]+-profile(?!-)/g) || []
  ok(`${f}.mjs namespaces its profile dir by DEV_PORT (#1266)`, NS.test(src),
    unsuffixed.length ? `unsuffixed path remains: ${unsuffixed[0]}` : 'no p${DEV_PORT} path found')
  ok(`${f}.mjs keeps no unsuffixed /tmp/forge profile (#1266)`, unsuffixed.length === 0,
    unsuffixed.join(' '))
  void hits
}
ok('guard installs SIGTERM + SIGINT + exit handlers (#907)',
  /process\.on\('exit'/.test(await import('node:fs').then(m => m.readFileSync(guardSrc, 'utf8'))) &&
  /process\.on\('SIGTERM'/.test(await import('node:fs').then(m => m.readFileSync(guardSrc, 'utf8'))) &&
  /process\.on\('SIGINT'/.test(await import('node:fs').then(m => m.readFileSync(guardSrc, 'utf8'))))
for (const f of ['forge.sh', 'forge-qa.sh']) {
  const src = await import('node:fs').then(m => m.readFileSync(resolve(HERE, f), 'utf8'))
  ok(`${f} carries a lane-scoped /tmp/forge orphan backstop (#907 #1266)`,
    /pkill -u "\$\(id -u\)" -f "user-data-dir=\/tmp\/forge\/p(5173|\$DEV)\//.test(src))
  ok(`${f} no longer sweeps every lane's Chrome (#1266)`,
    !/pkill -u "\$\(id -u\)" -f "user-data-dir=\/tmp\/forge\/"/.test(src))
}

console.log('# 3. syntax')
for (const f of ['chromecleanup.mjs', 'mountainscheck.mjs', 'campfirecheck.mjs', 'stormcheck.mjs', 'oceancheck.mjs', 'shorecheck.mjs', 'creditscheck.mjs', 'shoreperf.mjs', 'reefcheck.mjs', 'neonraincheck.mjs', 'volcanocheck.mjs', 'textfitcheck.mjs', 'tps.mjs', 'tpscheck.mjs']) {
  const r = spawnSync('node', ['--check', resolve(HERE, f)])
  ok(`${f} parses`, r.status === 0, r.stderr.toString().split('\n')[0])
}

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
