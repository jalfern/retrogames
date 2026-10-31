// tpscheck — #1266: generation t/s must be RECORDED, not just displayed.
//
// watch.sh shows gen t/s live; the #1258 trial report could only use items/day
// because nothing persisted it. This gate pins four things:
//   1. CONTRACT — scripts/tps.mjs prints exactly one JSON line covering the
//      three machines, with valid states, even when every machine is down
//      (that is CI's case, so this half runs everywhere).
//   2. MUTANT — with the down-fallback removed from tps.mjs the contract
//      breaks in CI: proof the check can actually fail.
//   3. ALL STREAMS (#1299) — the pure parsers fed fixtures: tps sums EVERY
//      generating stream (a box runs up to 4 at once — one stream's speed
//      under-reads the machine), gen/p sum tokens across streams, and the
//      stats parser never lets a missing counter poison the line.
//   4. WIRING — telemetry.sh materializes tps.mjs from origin/main, embeds
//      the sample as "tps" in the pulse, and appends ts/tps/slots rows to
//      the long-retention tokens ledger the trial report reads (#1299).
//
//   npm run tpscheck
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseActivity, parseStats } from './tps.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const STATES = new Set(['gen', 'prefill', 'idle', 'down'])
const validShape = (o) => ['omlx', 'omlxmini', 'omlxmbp'].every((k) =>
  o[k] && STATES.has(o[k].state) && typeof o[k].tps === 'number' && o[k].tps >= 0 &&
  typeof o[k].ctx === 'number' && (o[k].state === 'gen' || o[k].tps === 0) &&
  typeof o[k].gen === 'number' && o[k].gen >= 0 &&
  typeof o[k].p === 'number' && o[k].p >= 0 &&
  typeof o[k].n === 'number' && o[k].n >= 0 &&
  (o[k].tot === null || typeof o[k].tot === 'number'))

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
// strip BOTH unreachable-fallbacks: pending sockets then never resolve and
// the run against unreachable ports hangs or throws instead of printing down.
const src = readFileSync(resolve(HERE, 'tps.mjs'), 'utf8')
const mutant = src
  .replace("req.on('error', () => resolve(null))", '')
  .replace("req.on('timeout', () => { req.destroy(); resolve(null) })", '')
ok('mutant actually edits the sampler (pin survived a rewrite)', mutant !== src)
// point the mutant at unreachable ports so the removed fallback is what kills it
const m = spawnSync('node', ['-'], { input: mutant, encoding: 'utf8', timeout: 15000,
  env: { ...process.env, TPS_BOXES: '{"omlx":1,"omlxmini":2,"omlxmbp":3}' } })
const mOut = (m.stdout || '').trim().split('\n')[0]
ok('mutant (no down-fallback) breaks the contract in CI', m.status !== 0 || !validShape(safe(mOut)),
  `survived: ${mOut?.slice(0, 120)}`)
function safe(s) { try { return JSON.parse(s) } catch { return null } }

console.log('# 3. all-stream math (#1299)')
// two generating + one prefilling stream: the sample must see ALL of them.
const FIX = JSON.stringify({ active_models: { models: [{
  generating: [
    { tokens_per_second: 31.432, generated_tokens: 391, prompt_tokens: 152647 },
    { tokens_per_second: 10.1, generated_tokens: 50, prompt_tokens: 79847 },
  ],
  prefilling: [{ processed: 100, total: 4000 }],
}] } })
const a = parseActivity(FIX)
ok('tps sums every generating stream (31.4 + 10.1)', a.tps === 41.5, `got ${a.tps}`)
ok('gen sums generated tokens across streams', a.gen === 441, `got ${a.gen}`)
ok('p sums prompt tokens across generating AND prefilling', a.p === 152647 + 79847 + 4000, `got ${a.p}`)
ok('n counts every active stream', a.n === 3, `got ${a.n}`)
ok('ctx keeps the first generating slot (old contract)', a.ctx === 152647, `got ${a.ctx}`)
ok('single stream still reads its own speed', parseActivity(JSON.stringify(
  { active_models: { models: [{ generating: [{ tokens_per_second: 24.0, generated_tokens: 5, prompt_tokens: 9 }] }] } })).tps === 24)
ok('empty feed is idle with zeroes', (() => { const i = parseActivity('{"active_models":{"models":[]}}');
  return i.state === 'idle' && i.n === 0 && i.gen === 0 && i.p === 0 })())
ok('stats parser reads the cumulative counter', parseStats('{"total_tokens_served":300427950}') === 300427950)
ok('stats parser: missing or garbage payload is null, never a throw',
  parseStats('{}') === null && parseStats('garbage') === null && parseStats(null) === null)

console.log('# 4. wiring')
const tele = readFileSync(resolve(HERE, 'telemetry.sh'), 'utf8')
ok('telemetry.sh materializes tps.mjs from origin/main', /show origin\/main:scripts\/tps\.mjs/.test(tele))
ok('telemetry.sh embeds the sample as "tps" in the pulse', /\\"tps\\":\$TPS/.test(tele))
ok('telemetry.sh appends the long-retention tokens ledger (#1299)', tele.includes('tokens.jsonl'))

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
