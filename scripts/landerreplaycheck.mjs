// landerreplaycheck.mjs — replay the PPO button tape in the real sim (Node).
// Passes only if the tape lands on a PAD and banks exactly the recorded score.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step } from '../src/games/LunarLander/sim.js'

const here = dirname(fileURLToPath(import.meta.url))
const rec = JSON.parse(readFileSync(join(here, '..', 'public', 'replays', 'lander-ppo.json'), 'utf8'))
const BTN = { nothing: [0, false], rotate_left: [-1, false], rotate_right: [1, false], thrust: [0, true] }

const g = makeGame(rec.seed)
const landings = []
for (let i = 0; i < rec.actions.length && !g.end; i++) {
    const [rot, thrust] = BTN[rec.actions[i]] || [0, false]
    step(g, { rot, thrust })
    for (const e of g.events) if (e.type === 'land' || e.type === 'crash') landings.push({ ...e, tick: g.tick })
    g.events.length = 0
}
const pad = landings.find((e) => e.type === 'land' && e.pad)
const ok = g.phase === 'landed' && !!pad && Math.round(g.score) === rec.score
console.log(`${ok ? 'PASS' : 'FAIL'} seed=${rec.seed} phase=${g.phase} score=${Math.round(g.score)} want=${rec.score} pad=${pad ? pad.pad : 'none'} ticks=${g.tick} events=${JSON.stringify(landings)}`)
process.exit(ok ? 0 : 1)
