// probe1570a — seed-trace gate 6 failure: phase timeline, hand/can heights, slips.
import { createRobotSim, createAutopilot, WIN_TICKS, BENCH_TOP } from './src/utils/robot/index.js'

const SEEDS = process.argv.slice(2).map(Number).filter((n) => n >= 1)
for (const seed of SEEDS) {
    console.log(`===== seed ${seed} =====`)
    const sim = createRobotSim(seed)
    const ap = createAutopilot(sim)
    let lastPhase = ''
    let slips = 0
    let minCanBottomOverDoor = Infinity
    let minCanBottomAt = null
    let prevHeld = null
    for (let i = 0; i < WIN_TICKS; i++) {
        const s = sim.step({ pad: ap() })
        const ph = ap.phaseInfo()
        const phName = ph.split(':')[0]
        if (phName !== lastPhase) {
            console.log(`t=${i} phase ${lastPhase} -> ${ph} held=${s.held} hand=${s.hand} can=${s.canPos.y.toFixed(3)} goals=${Object.entries(s.goals).filter(([, v]) => v).map(([k]) => k).join(',')}`)
            lastPhase = phName
        }
        if (s.slips > slips) {
            slips = s.slips
            console.log(`t=${i} SLIP at phase ${ph} hand=${s.hand} can=[${s.canPos.x.toFixed(3)},${s.canPos.y.toFixed(3)},${s.canPos.z.toFixed(3)}]`)
        }
        // can bottom clearance while transiting over the door zone (x between -0.35 and -0.05)
        if (s.held === 'can' && s.canPos.x < -0.05 && s.canPos.x > -0.35 && i > 1500) {
            const bottom = s.canPos.y - 0.045
            if (bottom < minCanBottomOverDoor) { minCanBottomOverDoor = bottom; minCanBottomAt = `t=${i} ph=${ph} x=${s.canPos.x.toFixed(2)}` }
        }
        if (s.done) { console.log(`t=${i} DONE score=${s.score}`); break }
        prevHeld = s.held
    }
    console.log('min can-bottom over door zone: ' + (minCanBottomOverDoor === Infinity ? 'n/a' : (minCanBottomOverDoor * 1000).toFixed(1) + ' mm @ ' + minCanBottomAt + ' (door top 1160 mm)'))
    const ev = sim.events.filter((e) => /slip|drop|goal|refused/.test(e))
    console.log('events:', ev.join(' | '))
}
