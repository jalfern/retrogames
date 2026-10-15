// LUNAR LANDER — sim.js : the whole game as one pure function of (state, input).
// No DOM, no React, no Math.random — the seeded rng.js only. This is the exact
// module scripts/landercheck.mjs imports in Node, so what the harness proves
// winnable is the exact descent the cabinet flies, tick for tick.
//
// THE CONTRACT (the arcade's, honoured):
// - GRAVITY PULLS, ROCKET POINTS. The stick rotates the lander; the main engine
//   fires along the craft's own axis. Fuel is finite — the tank is the clock.
// - THE READOUTS ARE THE INSTRUMENTS: altitude, horizontal speed (L/R), vertical
//   speed and fuel, because you cannot eyeball a soft touchdown on a vector line.
// - LAND IT OR LOSE IT: touch a pad slow, straight and flat and it banks the
//   pad value × multiplier plus a fuel bonus. Too fast, too tilted, or the slope
//   of rough ground — the lander tumbles and explodes.
// - THE ORBITER IS THE WAY OUT: after a landing, relight and climb; dock with
//   the lunar orbiter crossing the sky to refuel and take the next terrain —
//   each new terrain carries a bigger multiplier. Crashes cost landers.
// - FIVE LANDERS, and a mission is five land-and-dock cycles (the original ran
//   endless; a terminal state is what a proof needs — see README).

import { genTerrain, terrainY, padAt, WORLD_W } from './terrain.js'

export const W = 512
export const H = 384
export const ORBIT_Y = 310
export const ORBIT_SPD = 90
export const TARGET_CYCLES = 5

export const CFG = {
    gravity: 15.6,                 // u/s² — one-sixth of nowhere
    thrust: 34,                    // engine accel along the ship axis
    rotRate: 2.3,                  // rad/s stick rotation
    burn: 10,                      // fuel / second at full burn
    startFuel: 240,
    softVert: 28,                  // max descent speed (u/s) for a soft touch
    softHoriz: 14,                 // max sideways speed for a soft touch
    tiltMax: 0.26,                 // ~15° — feet spread wider than that and you tip
    flatTol: 2.2,                 // ground height delta across the feet = "flat"
    dockHoriz: 20,                 // dock capture half-window at the orbiter
    dockRelV: 50,                  // max |Δvx| against the orbiter
    dockVert: 30,                  // grapple reach above and below the orbit line
    landers: 4,
    padScoring: true,              // pad value × multiplier + fuel bonus
    refuel: true,                  // docking refills the tanks (it must)
}

// three foot points in ship-local space (x right, y up)
const FEET = [[-9.5, -10], [9.5, -10], [0, -9]]

const rnd = (g) => { g._rs = (Math.imul(g._rs, 1664525) + 1013904223) >>> 0; return g._rs / 4294967296 }

export function push(g, e) { if (!g.search) g.events.push(e) }

function spawnLander(g) {
    g.x = WORLD_W / 2
    g.y = 300
    g.vx = (rnd(g) * 2 - 1) * 3
    g.vy = -4
    g.rot = 0
    g.fuel = CFG.startFuel
    g.fuelOut = false
    g.phase = 'descent'
    g.phaseT = 0
}

function newOrbiter(g) {
    const ltr = g.terrainIdx % 2 === 0
    g.orb = { x: ltr ? 70 : WORLD_W - 70, vx: ltr ? ORBIT_SPD : -ORBIT_SPD }
}

export function makeGame(seed = 0) {
    const g = {
        seed, tick: 0, _rs: (Math.imul(seed + 1, 2246822519) ^ 0x9e3779b9) >>> 0,
        terrainIdx: 0, terrain: genTerrain(seed, 0),
        mult: 1, score: 0, banked: 0, landers: CFG.landers, crashes: 0, cycle: 0,
        x: WORLD_W / 2, y: 300, vx: 0, vy: -4, rot: 0,
        fuel: CFG.startFuel, fuelOut: false,
        phase: 'descent', phaseT: 0, landedPad: null, lastPts: 0,
        orb: null, end: null, win: false, events: [], search: false, holdAt: null,
    }
    spawnLander(g)
    newOrbiter(g)
    return g
}

// the hash of everything a future branch could depend on — identical seeds and
// scripts MUST hash identical at every tick.
export function stateHash(g) {
    let h = 0x811c9dc5
    const add = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } }
    add(`${g.tick}|${g.terrainIdx}|${g.mult}|${g.score}|${g.banked}|${g.landers}|${g.crashes}|${g.cycle}`
        + `|${g.x.toFixed(2)}|${g.y.toFixed(2)}|${g.vx.toFixed(2)}|${g.vy.toFixed(2)}|${g.rot.toFixed(3)}`
        + `|${g.fuel.toFixed(2)}|${g.phase}|${g.orb.x.toFixed(1)}|${g.orb.vx}|${g._rs}|${g.end}`)
    return (h >>> 0).toString(16)
}

function footWorld(g, f) {
    const c = Math.cos(g.rot), s = Math.sin(g.rot)
    return [g.x + f[0] * c + f[1] * s, g.y - f[0] * s + f[1] * c]
}

function crash(g, why) {
    g.crashes++
    g.landers--
    g.phase = 'crashed'
    g.phaseT = 0
    g.vx = 0; g.vy = 0
    push(g, { type: 'crash', why, x: g.x, y: g.y, landers: g.landers })
    if (g.landers <= 0) { g.end = 'over'; g.win = false; push(g, { type: 'over', win: false }) }
}

function settle(g) {
    g.vx = 0; g.vy = 0; g.rot = 0
    // rest on the surface (rot 0): the highest foot wins
    let best = -Infinity
    for (const f of FEET) best = Math.max(best, terrainY(g.terrain.pts, g.x + f[0]) - f[1])
    g.y = best
    g.phase = 'landed'
    g.phaseT = 0
}

function land(g) {
    const allOnPad = FEET.every((f) => {
        const fx = g.x + f[0] * Math.cos(g.rot) + f[1] * Math.sin(g.rot)
        return padAt(g.terrain, fx)
    })
    const pad = allOnPad ? padAt(g.terrain, g.x) : null
    let pts = 0
    if (CFG.padScoring) {
        const base = pad ? pad.val : 10
        pts = base * g.mult
        if (pad) pts += Math.round(g.fuel) * g.mult          // the fuel bonus
    }
    g.lastPts = pts
    g.banked = pts
    g.score += pts
    g.landedPad = pad ? pad.val : 0
    settle(g)
    push(g, { type: 'land', pad: pad ? pad.val : 0, pts, mult: g.mult, fuel: g.fuel })
}

export function step(g, inp) {
    if (g.end) return
    g.tick++
    g.phaseT++
    const dt = 1 / 60

    // the orbiter always flies
    g.orb.x += g.orb.vx * dt
    if (g.orb.x > WORLD_W + 40) g.orb.x = -40
    if (g.orb.x < -40) g.orb.x = WORLD_W + 40

    if (g.phase === 'crashed') {
        if (g.phaseT >= 110) { spawnLander(g); push(g, { type: 'respawn' }) }
        return
    }
    if (g.phase === 'landed') {
        if (inp.thrust && g.fuel > 0) {
            g.phase = 'ascent'
            g.phaseT = 0
            push(g, { type: 'launch' })
            return
        }
        if (g.fuel <= 0 && g.phaseT > 120) {          // stranded: no tank to reach orbit
            g.landers--
            push(g, { type: 'stranded', landers: g.landers })
            if (g.landers <= 0) { g.end = 'over'; g.win = false; push(g, { type: 'over', win: false }); return }
            spawnLander(g)
        }
        return
    }

    // ------- flight (descent / ascent) -------
    const rot = Math.max(-1, Math.min(1, inp.rot || 0))
    g.rot += rot * CFG.rotRate * dt
    if (g.rot > Math.PI) g.rot -= Math.PI * 2
    if (g.rot < -Math.PI) g.rot += Math.PI * 2

    if (inp.thrust && g.fuel <= 0 && !g.fuelOut) { g.fuelOut = true; push(g, { type: 'fuelout' }) }
    const burning = !!inp.thrust && g.fuel > 0
    if (burning) {
        g.fuel -= CFG.burn * dt
        if (g.fuel <= 0) {
            g.fuel = 0
            if (!g.fuelOut) { g.fuelOut = true; push(g, { type: 'fuelout' }) }
        }
        g.vx += Math.sin(g.rot) * CFG.thrust * dt
        g.vy += Math.cos(g.rot) * CFG.thrust * dt
    }
    g.vy -= CFG.gravity * dt

    g.x += g.vx * dt
    g.y += g.vy * dt

    // side walls of the valley: soft
    if (g.x < 14) { g.x = 14; g.vx = Math.max(0, g.vx) }
    if (g.x > WORLD_W - 14) { g.x = WORLD_W - 14; g.vx = Math.min(0, g.vx) }
    if (g.y > 330) { g.y = 330; g.vy = Math.min(0, g.vy) }

    // ------- docking: the way to the next terrain -------
    if (g.phase === 'ascent' && Math.abs(g.y - ORBIT_Y) <= CFG.dockVert && Math.abs(g.x - g.orb.x) <= CFG.dockHoriz) {
        g.cycle++
        g.score += 200 * g.mult                          // docking bonus
        if (CFG.refuel) g.fuel = CFG.startFuel
        g.terrainIdx++
        g.mult = Math.min(10, g.mult + 1)
        g.terrain = genTerrain(g.seed, g.terrainIdx)
        newOrbiter(g)
        push(g, { type: 'dock', cycle: g.cycle, mult: g.mult, terrain: g.terrainIdx })
        if (g.cycle >= TARGET_CYCLES) {
            g.end = 'win'; g.win = true
            push(g, { type: 'over', win: true })
            return
        }
        const prevFuel = g.fuel
        spawnLander(g)
        g.fuel = CFG.refuel ? CFG.startFuel : prevFuel
        return
    }

    // ------- touchdown -------
    let touching = false
    for (const f of FEET) {
        const [fx, fy] = footWorld(g, f)
        if (fy <= terrainY(g.terrain.pts, fx) - 0.01) { touching = true; break }   // epsilon: a foot resting exactly on the pad is NOT a new touchdown
    }
    if (!touching) return

    const allOnPad = padAt(g.terrain, g.x) && FEET.every((f) => {
        const fx = g.x + f[0] * Math.cos(g.rot) + f[1] * Math.sin(g.rot)
        return padAt(g.terrain, fx)
    })
    const fyL = terrainY(g.terrain.pts, g.x - 9.5)
    const fyR = terrainY(g.terrain.pts, g.x + 9.5)
    const flat = allOnPad || Math.abs(fyR - fyL) <= CFG.flatTol
    const gentle = g.vy <= 0.1 && -g.vy <= CFG.softVert && Math.abs(g.vx) <= CFG.softHoriz && Math.abs(g.rot) <= CFG.tiltMax

    if (flat && gentle) land(g)
    else crash(g, !flat ? 'slope' : g.vy > 0.1 ? 'climb' : -g.vy > CFG.softVert ? 'impact' : Math.abs(g.vx) > CFG.softHoriz ? 'drift' : 'tilt')
}
