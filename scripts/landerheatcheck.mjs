// Gate: the precomputed v3 heat grid must equal a fresh in-page-protocol recompute,
// cell for cell (the worker path runs the same heatCell(); this catches stale files,
// serialization drift, and any sim/protocol change that invalidates the precompute).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { heatCell, HEAT_XS, HEAT_VXS, HEAT_EPISODES } from '../src/games/LunarLander/policy.js'

const here = dirname(fileURLToPath(import.meta.url))
const rep = (f) => JSON.parse(readFileSync(join(here, '..', 'public', 'replays', f), 'utf8'))
const heat = rep('lander-heat-v3.json')
const policy = rep('lander-policy-v3.json')
const xs = heat.xs, vxs = heat.vxs, ep = heat.episodes
const bad = []
for (let vi = 0; vi < vxs.length; vi++) {
    for (let xi = 0; xi < xs.length; xi++) {
        const mine = heatCell(policy, xs[xi], vxs[vi], ep)
        if (heat.grid[vi][xi] !== mine) bad.push({ vi, xi, v: vxs[vi], x: xs[xi], want: mine, got: heat.grid[vi][xi] })
    }
}
const ok = xs.join() === HEAT_XS.join() && vxs.join() === HEAT_VXS.join()
    && ep === HEAT_EPISODES && bad.length === 0
console.log(ok ? `PASS v3 heat grid — all ${vxs.length * xs.length} cells match fresh recompute`
    : `FAIL v3 heat grid — ${bad.length} mismatched cells, first: ${JSON.stringify(bad[0])}`)
process.exit(ok ? 0 : 1)
