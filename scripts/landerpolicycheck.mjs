// landerpolicycheck.mjs — the JS forward pass must match SB3's probabilities.
// Fixture obs + probs were produced by ~/Dev/rl/export_policy.py from the same
// checkpoint the policy JSON was exported from. Gate: max |Δp| < 1e-5.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { policyProbs } from '../src/games/LunarLander/policy.js'

const here = dirname(fileURLToPath(import.meta.url))
const rep = (f) => JSON.parse(readFileSync(join(here, '..', 'public', 'replays', f), 'utf8'))
const policy = rep('lander-ppo-policy.json')
const parity = rep('lander-ppo-parity.json')

let worst = 0
for (let i = 0; i < parity.obs.length; i++) {
    const mine = policyProbs(policy, parity.obs[i])
    parity.probs[i].forEach((p, a) => { worst = Math.max(worst, Math.abs(p - mine[a])) })
}
const ok = worst < 1e-5
console.log(`${ok ? 'PASS' : 'FAIL'} ${parity.obs.length} obs — max |Δp| = ${worst.toExponential(2)} (limit 1e-5)`)
process.exit(ok ? 0 : 1)
