// Precompute the lab generalisation heatmap for every exported policy:
//   public/replays/lander-heat-<name>.json   grid[vi][xi] = pads out of HEAT_EPISODES
// Same seeds and cell formula as the in-page worker (both call heatCell in policy.js).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { heatCell, HEAT_XS, HEAT_VXS, HEAT_EPISODES } from '../src/games/LunarLander/policy.js'

const here = dirname(fileURLToPath(import.meta.url))
const rep = join(here, '..', 'public', 'replays')
const files = readdirSync(rep).filter((f) => /^lander-policy-.*\.json$/.test(f)).sort()
for (const f of files) {
    const name = f.replace(/^lander-policy-/, '').replace(/\.json$/, '')
    const policy = JSON.parse(readFileSync(join(rep, f), 'utf8'))
    const t0 = Date.now()
    const grid = HEAT_VXS.map((v) => HEAT_XS.map((x) => heatCell(policy, x, v, HEAT_EPISODES)))
    const total = grid.flat().reduce((a, b) => a + b, 0)
    const out = { name, gravity: 1, xs: HEAT_XS, vxs: HEAT_VXS, episodes: HEAT_EPISODES,
        note: 'pad counts per heatmap cell, grid[v][x]; precomputed by scripts/landerheat.mjs',
        grid }
    writeFileSync(join(rep, `lander-heat-${name}.json`), JSON.stringify(out))
    console.log(`${name}: ${total}/${HEAT_XS.length * HEAT_VXS.length * HEAT_EPISODES} pad episodes `
        + `(${(total / (HEAT_XS.length * HEAT_VXS.length * HEAT_EPISODES) * 100).toFixed(1)}%) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
