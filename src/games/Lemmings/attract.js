// LEMMINGS-LITE attract copy — single source of truth the shell renders
// through <AttractMessage> and attractcheck audits. Rule 6 (#365): one
// informational message at a time, cycling. The old attract stacked a tagline,
// the press prompt and a four-line rules panel over the demo, and ended with
// "this demo replays a proven solution on screen" — harness meta as copy.

import { W, WATER } from './sim.js'

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
export function demoFloatPick(gs, plan, grace = 300) {
    const targets = new Set(plan.map(c => c.id))
    let walk = null
    for (const L of gs.lemmings) {
        if (!L.live || L.floater || targets.has(L.id)) continue
        if (L.state === 'fall') {
            const fx = Math.floor(L.x)
            const fy0 = Math.floor(L.y + 1e-6) + 1   // groundRow convention (sim.js)
            let overWater = false
            for (let fy = fy0; fy < fy0 + 8; fy++)
                if (gs.grid[fy * W + fx] === WATER) overWater = true
            if (!overWater) return L.id               // airborne now — canopy first
        } else if (L.state === 'walk' && walk === null) walk = L.id
    }
    return gs.tick >= grace ? walk : null
}
