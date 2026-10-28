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
