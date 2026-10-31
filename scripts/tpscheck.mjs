// tpscheck — #1266: generation t/s must be RECORDED, not just displayed.
//
// watch.sh shows gen t/s live; the #1258 trial report could only use items/day
// because nothing persisted it. This gate pins three things:
//   1. CONTRACT — scripts/tps.mjs prints exactly one JSON line covering the
//      three machines, with valid states, even when every machine is down
//      (that is CI's case, so this half runs everywhere).
//   2. MUTANT — with the down-fallback removed from tps.mjs the contract
//      breaks in CI: proof the check can actually fail.
//   3. WIRING — telemetry.sh materializes tps.mjs from origin/main and embeds
//      the sample as "tps" in the pulse (telemetry.jsonl -> telemetry.json and
//      board.json ride the same file), so a merge lands it on the next tick.
//
//   npm run tpscheck
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const STATES = new Set(['gen', 'prefill', 'idle', 'down'])
const validShape = (o) => ['omlx', 'omlxmini', 'omlxmbp'].every((k) =>
  o[k] && STATES.has(o[k].state) && typeof o[k].tps === 'number' && o[k].tps >= 0 &&
  typeof o[k].ctx === 'number' && (o[k].state === 'gen' || o[k].tps === 0))

console.log('# 1. contract')
const r = spawnSync('node', [resolve(HERE, 'tps.mjs')], { encoding: 'utf8', timeout: 15000 })
ok('tps.mjs exits 0', r.status === 0, r.stderr?.split('\n')[0])
const lines = (r.stdout || '').trim().split('\n')
ok('prints exactly one line', lines.length === 1, `got ${lines.length}`)
let out = null
try { out = JSON.parse(lines[0]) } catch { /* reported below */ }
ok('that line is JSON with the three machines in contract', validShape(out || {}),
  lines[0]?.slice(0, 120))

console.log('# 2. mutant')
// strip the down-fallback: unreachable machines then throw or print nothing.
const src = readFileSync(resolve(HERE, 'tps.mjs'), 'utf8')
const mutant = src.replace("req.on('error', () => resolve({ state: 'down', tps: 0, ctx: 0, n: 0 }))", '')
// point the mutant at unreachable ports so the removed fallback is what kills it
const m = spawnSync('node', ['-'], { input: mutant, encoding: 'utf8', timeout: 15000,
  env: { ...process.env, TPS_BOXES: '{"omlx":1,"omlxmini":2,"omlxmbp":3}' } })
const mOut = (m.stdout || '').trim().split('\n')[0]
ok('mutant (no down-fallback) breaks the contract in CI', m.status !== 0 || !validShape(safe(mOut)),
  `survived: ${mOut?.slice(0, 120)}`)
function safe(s) { try { return JSON.parse(s) } catch { return null } }

console.log('# 3. wiring')
const tele = readFileSync(resolve(HERE, 'telemetry.sh'), 'utf8')
ok('telemetry.sh materializes tps.mjs from origin/main', /show origin\/main:scripts\/tps\.mjs/.test(tele))
ok('telemetry.sh embeds the sample as "tps" in the pulse', /\\"tps\\":\$TPS/.test(tele))

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
