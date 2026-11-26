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

// #3456 stage 4 autopsy: at the killing tick capture what the route was DOING
// and where the killer came from — the columns say how many died, this says why.
// die() rewinds the player to the respawn seat, so the record reads the PRE-step
// snapshot plus its mirrored integration (same law as killProbe). Reports only;
// pins nothing.
const deathRecord = (snap, inp, kind) => {
    const px = ((snap.x + snap.vx) % 4000 + 4000) % 4000
    const py = snap.y + snap.vy
    const wrapD = (a, b) => { let d = (a - b) % 4000; if (d > 2000) d -= 4000; if (d < -2000) d += 4000; return d }
    let killer = null
    let kD = Infinity
    for (const e of snap.enemies) {
        const ex = ((e.x + e.vx) % 4000 + 4000) % 4000
        const ey = e.y + e.vy
        const d = Math.abs(wrapD(ex, px)) + Math.abs(ey - py) * 3
        if (kind === 'enemy' && d < kD) { kD = d; killer = { x: ex, y: ey, vy: e.vy, type: e.type } }
    }
    const dx = killer ? wrapD(killer.x, px) : 0
    const side = !killer ? '—' : (Math.sign(dx || snap.facing) === snap.facing ? 'fore' : 'astern')
    const pressed = ['left', 'right', 'up', 'down', 'fire'].filter(k => inp[k]).join('+') || 'none'
    return { kind, side, ktype: killer ? killer.type : 'terrain', kdx: Math.round(dx), kdy: killer ? Math.round(killer.y - py) : 0,
        kvy: killer ? Math.round(killer.vy * 10) / 10 : 0, x: Math.round(px), y: Math.round(py), vx: Math.round(snap.vx * 10) / 10, vy: Math.round(snap.vy * 10) / 10,
        carry: snap.carry, pressed }
}

export const patrol = (base, autopsy = false, horizon = 9000) => {
    let survived = 0, waveSeeds = 0, minScore = Infinity, catches = 0, delivers = 0, livesSpent = 0, worstSeedHits = 0
    const why = { terrain: 0, enemy: 0, other: 0 }
    let diedHauling = 0
    const perSeed = []
    const deaths = []
    for (let k = 0; k < 20; k++) {
        const rand = seedRng(base + k * 91)
        const w = createSim({ rand, height: 420 })
        let waves = 0, hits = 0
        let cap = horizon
        while (!w.over && cap > 0) {
            const probe = killProbe(w)
            const hauling = w.carrying !== null
            const snap = autopsy && (probe === 'terrain' || probe === 'enemy')
                ? { x: w.player.x, y: w.player.y, vx: w.player.vx, vy: w.player.vy, facing: w.player.facing, carry: hauling, enemies: w.enemies.map(e => ({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, type: e.type })) }
                : null
            const inp = watchRoute(w)
            w.step(inp)
            for (const e of w.events) {
                if (e.t === 'wave') waves++
                if (e.t === 'catch') catches++
                if (e.t === 'deliver') delivers++
                if (e.t === 'die') {
                    hits++
                    why[probe]++
                    if (hauling) diedHauling++
                    if (snap) deaths.push({ seed: base + k * 91, tick: cap, wave: w.wave, lives: w.lives, ...deathRecord(snap, inp, probe) })
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
    return { survived, waveSeeds, minScore, catches, delivers, livesSpent, worstSeedHits, why, diedHauling, perSeed, deaths }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const au = process.argv.includes('--autopsy')
    const wi = patrol(2000, au)
    const ho = patrol(5000, au)
    for (const [name, r] of [['witness', wi], ['holdout', ho]]) {
        console.log(`${name}: survived ${r.survived}/20 · minScore ${r.minScore} · waves>=1 ${r.waveSeeds}/20 · ` +
            `catches ${r.catches} · delivers ${r.delivers} · lives spent ${r.livesSpent} · worst seed ${r.worstSeedHits} hits`)
        console.log(`  deaths: terrain ${r.why.terrain} · enemy ${r.why.enemy} · other ${r.why.other} · hauling ${r.diedHauling}`)
        if (au) for (const d of r.deaths) {
            console.log(`  #${d.seed} t${d.tick} w${d.wave} L${d.lives} ${d.kind}/${d.ktype} ${d.side} k(${d.kdx},${d.kdy}) kvy ${d.kvy} ` +
                `at(${d.x},${d.y}) v(${d.vx},${d.vy})${d.carry ? ' CARRY' : ''} pressed ${d.pressed}`)
        }
    }
}
