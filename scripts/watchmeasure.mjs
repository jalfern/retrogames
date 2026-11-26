// watchmeasure — #3456 research harness: replay the two deterministic 20-seed
// patrol sets (witness 2000+k*91, holdout 5000+k*91 — the SAME sets the WITNESS
// pins use) against whatever sim.js currently holds, and print survival,
// banks, waves, rescues and per-seed life-spend. Research tool: it reports,
// it pins nothing. `npm run watchmeasure` prints both sets side by side.
import { createSim, watchRoute, groundAt } from '../src/games/Defender/sim.js'
import { seedRng } from '../src/utils/gameContract.js'

// Death taxonomy (#3445 mortality): evaluate the sim's own kill conditions on
// the pre-step state (die() rewinds the player to the respawn seat), so a loss
// is attributed to terrain graze vs enemy proximity — and whether the pilot was
// hauling at the moment.
const killProbe = (w) => {
    const p = w.player
    // The sim spends freeze/dark/invuln, integrates motion, THEN checks kills —
    // mirror one tick (decrement + position) or the killing tick reads as safe.
    if (w.freeze > 0) return 'other'
    const dark = p.dark > 0 ? p.dark - 1 : 0
    const invuln = p.invuln > 0 ? p.invuln - 1 : 0
    if (dark > 0 || invuln > 0) return 'other'
    const py = p.y + p.vy
    const px = ((p.x + p.vx) % 4000 + 4000) % 4000
    if (groundAt(w.terrain, px) - py < 8) return 'terrain'
    for (const e of w.enemies) {
        const ex = ((e.x + e.vx) % 4000 + 4000) % 4000
        if (Math.abs(ex - px) < 18 && Math.abs(e.y + e.vy - py) < 16) return 'enemy'
    }
    return 'other'
}

export const patrol = (base) => {
    let survived = 0, waveSeeds = 0, minScore = Infinity, catches = 0, delivers = 0, livesSpent = 0, worstSeedHits = 0
    const why = { terrain: 0, enemy: 0, other: 0 }
    let diedHauling = 0
    const perSeed = []
    for (let k = 0; k < 20; k++) {
        const rand = seedRng(base + k * 91)
        const w = createSim({ rand, height: 420 })
        let waves = 0, hits = 0
        let cap = 9000
        while (!w.over && cap > 0) {
            const probe = killProbe(w)
            const hauling = w.carrying !== null
            w.step(watchRoute(w))
            for (const e of w.events) {
                if (e.t === 'wave') waves++
                if (e.t === 'catch') catches++
                if (e.t === 'deliver') delivers++
                if (e.t === 'die') {
                    hits++
                    why[probe]++
                    if (hauling) diedHauling++
                }
            }
            cap--
        }
        if (!w.over) survived++
        if (waves >= 1) waveSeeds++
        minScore = Math.min(minScore, w.score)
        livesSpent += hits
        worstSeedHits = Math.max(worstSeedHits, hits)
        perSeed.push({ k, seed: base + k * 91, score: w.score, hits, waves, over: w.over })
    }
    return { survived, waveSeeds, minScore, catches, delivers, livesSpent, worstSeedHits, why, diedHauling, perSeed }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const wi = patrol(2000)
    const ho = patrol(5000)
    for (const [name, r] of [['witness', wi], ['holdout', ho]]) {
        console.log(`${name}: survived ${r.survived}/20 · minScore ${r.minScore} · waves>=1 ${r.waveSeeds}/20 · ` +
            `catches ${r.catches} · delivers ${r.delivers} · lives spent ${r.livesSpent} · worst seed ${r.worstSeedHits} hits`)
        console.log(`  deaths: terrain ${r.why.terrain} · enemy ${r.why.enemy} · other ${r.why.other} · hauling ${r.diedHauling}`)
    }
}
