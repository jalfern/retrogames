// dynamics.js — the piano dynamics for MARBLE MADNESS's beds (#1758 item 2).
// Marsyas is a pedalled piano: the sustain lets runs bloom into each other and
// the whole piece crescendos against the clock. Two channels fake it here —
// the original two, no third voice needed:
//   * the bus level rides the CARRY BANK (every banked second makes the bed
//     run hotter — the risk you're holding is the volume you hear), and
//   * a slow vibrato engages on the LEAD once the clock enters the same
//     warning band the tick-beep lives in (WARN_SECS), deepening as it drains.
// Pure and deterministic; the game applies these on play frames (quantized, so
// the API is called at boundaries, not 60x/s — ducks dip from and recover to
// the held level, so they keep their depth against the swell). No audio here —
// the sim's audio-free determinism gate (#1752) stays intact; AudioController
// owns the graph.

export const SWELL_BASE = 0.82 // bed sits here with an empty carry bank
export const SWELL_FULL_SECS = 30 // bank this many carry-seconds and the bus opens full
export const WARN_SECS = 10 // the sim's tick-beep threshold — the same warning the ear should feel
export const VIB_HZ = 5.5 // slow singing wobble; faster reads as panic, not a pedal push
export const VIB_BASE_CENTS = 12
export const VIB_MAX_CENTS = 26

export const busLevel = (carryTicks) => {
    const secs = Math.max(0, carryTicks) / 60
    return SWELL_BASE + Math.min(1, secs / SWELL_FULL_SECS) * (1 - SWELL_BASE)
}

export const leadVibrato = (secsLeft) => {
    if (secsLeft > WARN_SECS) return null
    const urgency = Math.max(0, WARN_SECS - secsLeft)
    return { hz: VIB_HZ, cents: Math.min(VIB_MAX_CENTS, VIB_BASE_CENTS + urgency * 1.4) }
}

// one call per play frame — gs carries the carry bank (ticks) and the clock.
export const dynamicsFor = (gs) => ({
    level: busLevel(gs.carry),
    vib: leadVibrato(Math.ceil(Math.max(0, gs.timeT) / 60)),
})
