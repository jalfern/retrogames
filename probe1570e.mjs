// probe1570b — toDoorway phase deep trace: hand vs target vs can vs torque.
import { createRobotSim, createAutopilot, WIN_TICKS } from './src/utils/robot/index.js'

for (const seed of [Number(process.argv[2] || 1)]) {
    console.log(`===== seed ${seed} toDoorway trace =====`)
    const sim = createRobotSim(seed)
    const ap = createAutopilot(sim)
    let lastPhase = ''
    let inPhase = false
    let n = 0
    for (let i = 0; i < WIN_TICKS; i++) {
        const s = sim.step({ pad: ap() })
        const ph = ap.phaseInfo()
        const name = ph.split(':')[0]
        if (name !== lastPhase) { lastPhase = name; if (name === 'toDoorway') { inPhase = true; n = 0 } else inPhase = false }
        if (!inPhase) continue
        n++
        if (n % 24 === 1 || n > 520) {
            const gp = sim.arm.graspPoint()
            console.log(`t=${i} n=${n} tgt=[${sim.arm.target.x.toFixed(3)},${sim.arm.target.y.toFixed(3)},${sim.arm.target.z.toFixed(3)}] gp=[${gp[0].toFixed(3)},${gp[1].toFixed(3)},${gp[2].toFixed(3)}] can=[${s.canPos.x.toFixed(3)},${s.canPos.y.toFixed(3)},${s.canPos.z.toFixed(3)}] tq=${JSON.stringify(s.torque)} sat=${s.sat} grip=${s.gripN} grind=${sim.arm.grind} gap=${s.gap}`)
        }
    }
    const s = sim.state()
    console.log(`final can=[${s.canPos.x.toFixed(3)},${s.canPos.y.toFixed(3)},${s.canPos.z.toFixed(3)}] canIn=${s.goals.canIn} interior=${sim.cabinet.interiorContains(s.canPos)}`)
}
