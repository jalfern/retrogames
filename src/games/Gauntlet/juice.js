// GAUNTLET — juice: the view's reactive overlays (issue #275 item 4).
// index.jsx's drawView renders exactly what this module decides, and
// gauntletcheck proves the decisions in plain Node. No canvas at import.
//
// The arcade's view breathed. As your health ran thin the screen edges
// throbbed red; a sweep of the blade left a light-arc streaking across the
// hall; and while Death drained you the whole view flushed green, frame by
// frame. The DECISIONS live here; the pixels are index.jsx's.

import { CFG } from './sim.js'

// the low-health line the arcade already used: 30% (sim.js shouts
// "NEEDS FOOD, BADLY!" at this same threshold)
export const LOW_HP = 0.3
export const PULSE_PERIOD = 48

// the screen-edge vignette throb: dead above the 30% line, then a smooth
// 0 -> 1 -> 0 heartbeat on a fixed period while you stay under it.
export function lowHpPulse(hp, maxHp, tick) {
    if (maxHp <= 0) return 0
    if (hp >= maxHp * LOW_HP) return 0
    const t = (tick % PULSE_PERIOD) / PULSE_PERIOD
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2)
}

// the light-arc trail a swing leaves: only while the sword is mid-swing
// (atkAnim counts down from swordCool). It sweeps ahead of the blade on the
// SAME arc the blade takes and fades as the swing settles. null between swings.
export function swordTrail(atkAnim) {
    if (atkAnim <= 0) return null
    const t = 1 - atkAnim / CFG.swordCool
    return {
        t,
        lead: -CFG.swordArc + t * CFG.swordArc * 2, // streak centre, same sweep as the blade
        alpha: 0.85 * (1 - 0.6 * t),                // bright at the strike, fading after
        reach: 12 + 5 * (1 - t),                    // the streak stretches as the swing opens
    }
}

// is Death within his drain range this tick? (sim.js drains when d < 0.75)
export function isDraining(gs) {
    const h = gs.hero
    const d = gs.monsters.find((m) => m.kind === 'death')
    return !!d && Math.hypot(d.x - h.x, d.y - h.y) < 0.75
}

export const DEATH_PERIOD = 40

// the green flush while he drains: 0 the moment he lifts, a living
// 0.35 -> 0.75 beat (changing every frame) while he is in range.
export function deathTint(draining, tick) {
    if (!draining) return 0
    const t = (tick % DEATH_PERIOD) / DEATH_PERIOD
    return 0.35 + 0.4 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2))
}
