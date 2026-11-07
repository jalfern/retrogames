// wobble.js — the steely knock spin/wobble for MARBLE MADNESS (#1758 item 4).
// On the cabinet a steelie hit didn't just shove the marble — it set it
// spinning and rocking visibly, and the Marsyas piano bent with the interrupt.
// The sim's knock (sim.js updateSteelies) is untouched: it already emits
// `steelieHit`, so the spin law lives painter-side and stays deterministic —
// same inputs, same wobble, hashes unchanged (the same seam the bed and
// dynamics chose, #1752/#1758). Pure: no rng, no audio, no Date.
//
// Both laws take `t` = ticks REMAINING in the wobble window (the game counts
// it down per world tick from WOBBLE_TICKS on the knock event).

export const WOBBLE_TICKS = 34 // visible settle window (< the 40-tick knock cooldown)
export const KNOCK_TURNS = 1.75 // full revolutions the spin reads before it steadies
export const KNOCK_VIB_HZ = 9.5 // shudder rate — faster than the sung warn vibrato (5.5 Hz)
export const KNOCK_VIB_CENTS = 38 // deepest bend at the hit; VIB_MAX_CENTS is the sung ceiling

// null at rest; {angle (rad, spin), tilt (rad, rock), decay (1 at hit -> 0 settled)}
export function wobbleAt(t) {
    if (t <= 0) return null
    const d = Math.min(1, t / WOBBLE_TICKS)
    const p = 1 - d // progress since the hit
    const angle = KNOCK_TURNS * Math.PI * 2 * (1 - (1 - p) * (1 - p)) // fast out, eased to rest
    return { angle, tilt: 0.30 * d * Math.sin(angle * 2), decay: d }
}

// the bed's detune sweep at the hit: 38 cents sweeping down to the sung
// warning depth (12), so releasing hands back to leadVibrato seamlessly.
export function knockVibrato(t) {
    if (t <= 0) return null
    const d = Math.min(1, t / WOBBLE_TICKS)
    return { hz: KNOCK_VIB_HZ, cents: 12 + (KNOCK_VIB_CENTS - 12) * d }
}
