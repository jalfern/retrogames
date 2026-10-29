import { createRobotSim, createAutopilot } from '../src/utils/robot/index.js'

const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8]
for (const seed of seeds) {
    const sim = createRobotSim(seed)
    const ap = createAutopilot(sim)
    let last = ''
    for (let i = 0; i < 4200; i++) {
        const pad = ap()
        const s = sim.step({ pad })
        const line = s.goals && Object.entries(s.goals).filter(([, v]) => v).map(([k]) => k).join(',')
        if (line !== last) { last = line; console.log(`  ${seed} t=${i} ${line}`) }
        if (s.done || s.timeout) break
    }
    const f = sim.state()
    console.log(`SEED ${seed} done=${f.done} tick=${f.tick} goals=${Object.entries(f.goals).filter(([, v]) => v).map(([k]) => k).join(',')} drawerZ=${f.drawerZ.toFixed(3)} doorA=${f.doorA} hand=${f.hand} held=${f.held}`)
}
