// BRITANNIA moongate flavor (#1135): the original (Ultima IV, 1985) names
// every gate after one of the eight moons/virtues and the sky's moon phase
// sets the mood of the trip. Pure + deterministic: the phase is the day count
// mod 8, so britanniacheck can prove the whole wheel headless and the menu
// never lies about tonight's moon.

export const DAY_TICKS = 7200

export const MOONS = [
    'Humility', 'Honesty', 'Compassion', 'Valor',
    'Spirituality', 'Justice', 'Sacrifice', 'Honor',
]

export const PHASES = [
    'new moon', 'waxing crescent', 'first quarter', 'waxing gibbous',
    'full moon', 'waning gibbous', 'last quarter', 'waning crescent',
]

export const dayOf = (tick) => Math.floor(Math.max(0, tick) / DAY_TICKS)
export const moonPhase = (tick) => dayOf(tick) % PHASES.length
export const moonName = (gate) => MOONS[((gate % MOONS.length) + MOONS.length) % MOONS.length]

// 0..1 lit fraction for the little phase disc (0 new, 1 full).
export const phaseLit = (phase) => (phase <= 4 ? phase : 8 - phase) / 4

// One flavor line per phase (#1135 gate-menu polish): each names its own
// phase word, so the menu never decorates a full moon with crescent talk.
// Pure, finite, and bounded so britanniacheck can read the whole table.
export const PHASE_FLAVOR = [
    'new moon: the gate hums, patient as a seed',
    'waxing crescent: a silver sliver coaches it',
    'first quarter: half the sky holds its breath',
    'waxing gibbous: the near-full moon pulls taut',
    'full moon: silver light floods the gate',
    'waning gibbous: the light loosens; step on',
    'last quarter: half-dark, steady as ever',
    'waning crescent: nearly dark — the bold ride',
]

export const gateFlavor = (phase) => PHASE_FLAVOR[((Math.round(phase) % 8) + 8) % 8]

// Moon-phase routing (#1862): in the original the gate is no taxi — the moon
// decides the destination. Ultima IV's exact table isn't in the bundle, so
// rather than fake its rows we honour the RULE honestly: each phase rotates
// the gate circle by a fixed non-zero offset — the wheel turns wider as the
// moon waxes (1,3,5,7), the full moon rides diameters (4), and the waning
// mirrors the waxing (7,5,3). Fixed, learnable, deterministic — and since
// every phase is a rotation, each is a derangement: no gate ever routes to
// itself, and no gate is ever left without a destination.
export const ROUTE_OFFSET = [1, 3, 5, 7, 4, 7, 5, 3]

// gate --phase--> destination gate, n = gates on the map. The shift is held
// in 1..n-1 so the rotation stays well-formed (never self) for any n >= 2.
export const routeDest = (gate, phase, n = MOONS.length) => {
    if (n < 2) return gate
    const off = ROUTE_OFFSET[((Math.round(phase) % 8) + 8) % 8]
    const shift = ((off - 1) % (n - 1)) + 1
    return (((gate % n) + n) % n + shift) % n
}
