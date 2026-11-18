// EXCITEBIKE attract copy — single source of truth the shell renders
// through <AttractMessage> and attractcheck audits. Rule 6 (#365): one
// informational message at a time, cycling. The old attract stacked a tagline,
// the press prompt and a six-line rules wall over an undimmed demo.

export const PRESS = 'TAP / PRESS ANY KEY'

export const MESSAGES = [
    'LEAN THE BIKE OR EAT DIRT',
    'UP IS GAS — AND LEANS THE NOSE UP',
    'DOWN BRAKES — AND TUCKS THE NOSE DOWN',
    'SPACE JUMPS — HOLD FOR FLOAT, PUMP MUD',
    'REDLINE TOO LONG AND THE ENGINE BOILS',
    'NOSE-LAND OR OVER-ROTATE = OVER THE BARS',
    'RIVALS ARE SOLID — HOP THE WRECKS',
    '← STEER OUT · RUB MEANS TAKE THE LINE',
    'BEAT THE CLOCK · G SWITCHES GEAR',
]

// #2647 ATTRACT RIDES YOUR DESIGNS — the seat rotation, pure so excitecheck
// grades the ladder without a browser. Seats are roster coordinates: 0 =
// MOTOCROSS (the byte-pinned proven replay), 1..n = your saved designs in
// roster order (CUSTOM 1..Cn). Zero designs → [0]: byte-honest to the demo
// that shipped before this law. The shell maps seat → track index and labels.
export function demoSeats(n) {
    const out = [0]
    for (let k = 1; k <= Math.max(0, n); k++) out.push(k)
    return out
}
export const demoSeatTrack = (seat, trackCount) => (seat === 0 ? 0 : trackCount + seat - 1)
export const demoSeatLabel = (seat) => (seat === 0 ? 'MOTOCROSS' : `CUSTOM ${seat}`)

// #2651 BADGE RIDES THE NAME — a saved design is called by its OWN name in the
// marquee. The badge reads the design's stored name (collapsed, uppercased, the
// bay's 12-char cap); roster grammar survives only as the FALLBACK: no name, a
// whitespace mush, or a placeholder (`CUSTOM`, `CUSTOM k`) keeps `CUSTOM k`, so
// every pre-naming save is byte-honest and MOTOCROSS is untouchable.
const PLACEHOLDER = /^CUSTOM( \d+)?$/
export const demoSeatName = (seat, savedName) => {
    if (seat === 0) return 'MOTOCROSS'
    const n = String(savedName == null ? '' : savedName).trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 12)
    return !n || PLACEHOLDER.test(n) ? `CUSTOM ${seat}` : n
}

