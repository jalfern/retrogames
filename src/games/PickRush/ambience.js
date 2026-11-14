// PICK RUSH — per-shift ambience (#2234).
//
// The factory floor at night is never the same room twice: the early shifts
// are quiet (a forklift beeping two aisles over, far metal rolls), the glass
// era wakes the pneumatics and the fluorescent buzz, and the graveyard peak
// adds the deep drone and relay chatter. The cadence tightens as the night
// wears on — the same event the eye sees (shift speed-up) the ear should
// hear, which the README honestly listed as owed: "no per-shift ambience
// change yet".
//
// PURE + SCHEDULED: the renderer asks `fireAt(zone, tick, playing)` once per
// sim tick and plays whatever names come back. No rng, no sim involvement —
// sim.js never imports this file, so determinism, autopilot, replays and
// state.hash never see it. pickcheck's AMB gates pin the zone map, the
// tightening cadence, the exact schedule and the play-only door.

// Ambience zones keyed to the shift eras the authored line already has:
// shifts 1–2 quiet early floor, shift 3 the glass/heavy era, shift 4 the
// graveyard peak (and clamp beyond, though the contract ends at 4).
// hum = motor-bed gain (deepens per shift); sub = belt-speed sub-harmonic
// gain (0 until the glass era wakes it); cues = scheduled ambience events,
// `every` ticks between fires, `phase` the tick-offset they land on.
export const AMB_ZONES = [
    {
        name: 'early', hum: 0.050, sub: 0,
        cues: {
            beep: { every: 540, phase: 90 },   // distant forklift reverse chirp
            roll: { every: 811, phase: 401 },  // far metal roll / cart clunk
        },
    },
    {
        name: 'glass', hum: 0.060, sub: 0.018,
        cues: {
            beep: { every: 420, phase: 61 },
            roll: { every: 811, phase: 401 },
            hiss: { every: 653, phase: 211 },  // pneumatic line vent
        },
    },
    {
        name: 'graveyard', hum: 0.070, sub: 0.030,
        cues: {
            beep: { every: 330, phase: 43 },
            roll: { every: 811, phase: 401 },
            hiss: { every: 520, phase: 151 },
            chatter: { every: 263, phase: 79 }, // relay chatter in the panel
        },
    },
]

export const zoneForShift = (shift) => (shift <= 1 ? 0 : shift === 2 ? 1 : AMB_ZONES.length - 1)

// Which ambience cues fire on this tick. Doors: only while the line actually
// runs (the renderer passes `playing`; attract and over stay clean — the
// demo must not sell a mood the player hasn't bought).
export const fireAt = (zone, tick, playing) => {
    if (!playing || tick < 0) return []
    const z = AMB_ZONES[Math.min(Math.max(zone | 0, 0), AMB_ZONES.length - 1)]
    const out = []
    for (const [name, c] of Object.entries(z.cues)) {
        if (tick % c.every === c.phase % c.every) out.push(name)
    }
    return out
}
