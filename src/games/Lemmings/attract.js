// LEMMINGS-LITE attract copy — single source of truth the shell renders
// through <AttractMessage> and attractcheck audits. Rule 6 (#365): one
// informational message at a time, cycling. The old attract stacked a tagline,
// the press prompt and a four-line rules panel over the demo, and ended with
// "this demo replays a proven solution on screen" — harness meta as copy.

import { W, WATER, replay } from './sim.js'

export const PRESS = 'TAP / PRESS ANY KEY'

export const MESSAGES = [
    'THEY WALK. THEY FALL. YOU DECIDE OTHERWISE',
    'HOLD A LEMMING · RELEASE TO ASSIGN',
    'TAP A SKILL BUTTON TO PICK IT',
    'ARROWS AIM · SPACE ASSIGNS · 1-6 PICK SKILL',
    'SKILL COUNTS ARE LIMITED — PLAN THE CHAIN',
    'ANYTHING THAT TOUCHES WATER DROWNS',
    'SAVE THE QUOTA AND THE LEVEL CLEARS',
]

// #3853 attract-parachute — the demo never opened a parachute: attract is a
// replay of the solver's proven script, and the solver has no need of floaters,
// so the demo showed four skills while the game offers five. The original's
// attract demonstrated its skills; here is the demo's own hand, kept PURE so
// lemcheck can pin it. Two grants, in priority order: the lemming that is
// airborne right now (the canopy catches it mid-fall — DOOR and LEDGE step
// their crowds off a lip every cycle), else, once the crowd has been walking
// for `grace` ticks, the first walker. Script targets are excluded, so a
// proven line is never re-timed and a canopy can only ever save a life, never
// cost one; the striped canopy rides on show (walking and falling), and a
// faller over the pond is skipped — the original's floaters drown like
// everyone else, and a parachute that only sinks is mockery, not rescue.
// Shared land-check: does any water sit within 8 rows below (fx, fy)?
const overLand = (gs, x, y) => {
    const fx = Math.floor(x)
    const fy0 = Math.floor(y + 1e-6) + 1           // groundRow convention (sim.js)
    for (let fy = fy0; fy < fy0 + 8; fy++)
        if (gs.grid[fy * W + fx] === WATER) return false
    return true
}

export function demoFloatPick(gs, plan, grace = 300) {
    const targets = new Set(plan.map(c => c.id))
    let walk = null
    for (const L of gs.lemmings) {
        if (!L.live || L.floater || targets.has(L.id)) continue
        if (L.state === 'fall') {
            if (overLand(gs, L.x, L.y)) return L.id   // airborne now — canopy first
        } else if (L.state === 'walk' && walk === null) walk = L.id
    }
    return gs.tick >= grace ? walk : null
}

// #3892 CERTIFIED demo floats — the honest sibling of the picker above.
// The pre-#3892 world ran every script command one tick early; that desync
// manufactured crowd-falls (bodies tossed over lips the solver had actually
// held), and the picker caught one mid-air so the canopy deployed. With the
// phase fixed, the solved boards hold their crowds: unsripted bodies no longer
// leave the ground, and a walker-granted chute that never falls is the "only
// ever sinks is mockery" case the picker's own comment refuses. So the demo
// grant is now PROVEN, not hoped: scan the replay world (the very world attract
// renders — solve-phase, same cached plan) for the picker's candidates, and
// certify each by replaying script+grant with the outcome demanded intact —
// win, exited and dead equal. An airborne candidate certifies → the canopy is
// shown DEPLOYING mid-fall (the original's attract did exactly this); else the
// walker candidate certifies — physics-neutral by the equality demanded, so
// the canopy rides on show and the world provably never moved. Airborne
// candidates come first: a deploy is the better demo, and where one lives the
// stripes-on-show fallback is beneath it. Exported so lemcheck can mirror the
// drive and watch what the player sees.
export function certifyDemoFloat(level, grid, plan, opts = {}) {
    const maxGrants = opts.maxGrants ?? 2
    const grace = opts.grace ?? 300
    const grants = []
    while (grants.length < maxGrants) {
        const script = [...plan, ...grants.map(f => ({ tick: f.tick, id: f.id, skill: 'float' }))]
        const base = replay(level, grid, script)
        if (!base.win) break
        const cands = []
        const fresh = (id) => !grants.some(f => f.id === id) && !cands.some(c => c.id === id)
        replay(level, grid, script, {
            onTick: (g) => {
                // airborne candidates may be script bodies: on today's honest
                // boards the only over-land fallers ARE the bodies the proven
                // line sends down (SPIRE's descent, DOOR's post-bomb drop), and
                // the certifier — not the exclusion — is what guards the line
                // here: a grant that re-times the world away from its proven
                // outcome cannot certify.
                for (const L of g.lemmings)
                    if (L.live && !L.floater && L.state === 'fall' && fresh(L.id) && overLand(g, L.x, L.y))
                        cands.push({ tick: g.tick, id: L.id, air: true })
                const wid = demoFloatPick(g, plan, grace)   // walker fallback keeps the picker's rules
                if (wid != null && fresh(wid)) cands.push({ tick: g.tick, id: wid, air: false })
            },
        })
        const ordered = [...cands.filter(c => c.air), ...cands.filter(c => !c.air)]
        const pick = ordered.find(c => {
            const r = replay(level, grid, [...script, { tick: c.tick, id: c.id, skill: 'float' }])
            return r.win && r.exited === base.exited && r.dead === base.dead
        })
        if (!pick) break
        grants.push(pick)
    }
    return grants
}
