// COMET DRIFT HD bank voices (#478 item 5). Node-safe: pure data + a pure
// mapper, so cometdrifthdcheck pins the ladder's voices without a browser or
// an AudioContext. index.jsx dispatches each op to audioController.
//
// Each tier already has its own whoosh (#471 item 7). GOLD adds a bell chime
// the other two never ring: an ascending sine arpeggio that tops out on a high
// sparkle, so banking the top tier sounds earned, not just louder.

export const GOLD_BELL = 3136 // G7 — the sparkle only GOLD rings

// #502 item 6: per-course engine register. The circuits' surface mixes cap
// top speed differently, so Sandbank's long straights redden at a higher
// pitch than the Gulch's dusk cruise. A multiplier on the gear-curve base —
// dusk keeps the shipped engine untouched (×1).
export const ENGINE_REGISTER = { dusk: 1, dawn: 1.06, noon: 1.12 }
export const engineRegister = (id) => ENGINE_REGISTER[id] || ENGINE_REGISTER.dusk

// [freq, dur, type, vol, delay] — rising, short, pure (bell, not chiptune square)
export const GOLD_CHIME = [
    [1568, 0.16, 'sine', 0.10, 0.00],
    [2093, 0.16, 'sine', 0.09, 0.07],
    [2637, 0.22, 'sine', 0.08, 0.14],
    [GOLD_BELL, 0.28, 'sine', 0.07, 0.21],
]

// The bank voices for a COMET tier: whoosh ladder, plus the gold bell on tier 2.
export function bankVoices(tier) {
    const v = []
    if (tier === 0) v.push({ k: 'sweep', a: 340, b: 900, d: 0.3, t: 'square', g: 0.1 })
    else if (tier === 1) {
        v.push({ k: 'sweep', a: 240, b: 1150, d: 0.42, t: 'sawtooth', g: 0.11 })
        v.push({ k: 'tone', f: 1240, d: 0.09, t: 'square', g: 0.07 })
    } else {
        v.push({ k: 'sweep', a: 180, b: 1450, d: 0.55, t: 'sawtooth', g: 0.12 })
        v.push({ k: 'noise', d: 0.22, g: 0.1 })
        for (const c of GOLD_CHIME) v.push({ k: 'tone', f: c[0], d: c[1], t: c[2], g: c[3], delay: c[4] })
    }
    return v
}

// #675: the crowd. The grandstands are the circuit's only audience, and the
// stands sit outside the sim's wall clamp while the player rides within
// ±216px of the centerline — so proximity is the distance from the player to
// the NEAREST stand centre. Beyond R_MAX the crowd is no sound at all; inside
// R_MIN it is at full voice; between them a smoothstep ramp, so the murmur
// swells as the kart comes down the straight and dies on the backstretch.
// The burst is LONGER than its period, so the murmur beds without dead air.
// The engine law is untouched — the crowd sits under it.
export const CROWD_R_MIN = 340   // px — full gain at the line
export const CROWD_R_MAX = 1000  // px — silent beyond
export const CROWD_GAIN = 0.13   // peak murmur (under the engine's presence)
export const CROWD_PERIOD = 5    // ticks between bursts (83 ms)
export const CROWD_BURST = 0.16  // s — longer than the period: a continuous bed
export const CROWD_FREQ = 900    // Hz lowpass — a murmur, not static

// proximity -> gain: 1 at the stands, 0 at the horizon, smoothstep between.
export const crowdSwellGain = (d) => {
    if (d <= CROWD_R_MIN) return 1
    if (d >= CROWD_R_MAX) return 0
    const t = (CROWD_R_MAX - d) / (CROWD_R_MAX - CROWD_R_MIN)
    return t * t * (3 - 2 * t)
}

// Node-safe: distance in px from (x, y) to the nearest grandstand centre
// (Infinity when the plan carries no stands).
export const nearestStandPx = (plan, x, y) => {
    let d = Infinity
    for (const e of plan) {
        if (e.id !== 'grandstand') continue
        const dx = x - e.wx; const dy = y - e.wz
        const dd = dx * dx + dy * dy
        if (dd < d) d = dd
    }
    return d === Infinity ? Infinity : Math.sqrt(d)
}
