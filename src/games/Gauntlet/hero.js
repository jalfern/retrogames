// GAUNTLET — the hero reads as a living fighter (issue #302 item 2): he takes
// a step only on the ticks he is actually walking, and flashes white the moment
// he is struck. The DECISIONS live here (pure, no canvas); the pixels are
// index.jsx's; gauntletcheck proves the rules in plain Node.

import { CFG } from './sim.js'

// a step every WALK_SHIFT ticks of real walking (the beasts step on the same
// cadence, gs.tick >> 3, so the hero matches them)
export const WALK_SHIFT = 3

// the walk frame to show, given the hero's walk accumulator (one per moved
// tick, fed by the sim) and his sprite's frame count. It cycles 0..n-1 and
// never leaves that range — it does not step while standing still because the
// sim only feeds the accumulator the ticks he moves.
export const walkFrame = (walk, n) => (n > 0 ? ((walk >> WALK_SHIFT) % n + n) % n : 0)

// the white hit-flash: full the tick he is struck, then a steady fade to
// nothing over CFG.hitFlash ticks. 0 the moment the flash has run out.
export const hitFlashAlpha = (hitT) => (hitT <= 0 ? 0 : Math.min(1, hitT / CFG.hitFlash))
