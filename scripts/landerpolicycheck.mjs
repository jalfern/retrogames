// landerpolicycheck.mjs — the JS forward pass must match the training-side probs
// for every lab policy. Fixtures come from ~/Dev/rl/export_policies.py (SB3 for the
// PPO checkpoints, torch for the BC/DAgger students). Gate: max |Δp| < 1e-5 per policy.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { policyProbs } from '../src/games/LunarLander/policy.js'

const here = dirname(fileURLToPath(import.meta.url))
const rep = (f) => JSON.parse(readFileSync(join(here, '..', 'public', 'replays', f), 'utf8'))
const NAMES = ['v2', 'v3', 'dagger6', 'bc1k', 'clone1k', 'clone1k-noisy']

let allOk = true
for (const name of NAMES) {
    const policy = rep(`lander-policy-${name}.json`)
    const parity = rep(`lander-parity-${name}.json`)
    let worst = 0
    for (let i = 0; i < parity.obs.length; i++) {
        const mine = policyProbs(policy, parity.obs[i])
        parity.probs[i].forEach((p, a) => { worst = Math.max(worst, Math.abs(p - mine[a])) })
    }
    const ok = worst < 1e-5
    allOk = allOk && ok
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${parity.obs.length} obs — max |Δp| = ${worst.toExponential(2)} (limit 1e-5)`)
}
process.exit(allOk ? 0 : 1)
