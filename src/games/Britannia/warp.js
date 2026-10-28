// BRITANNIA moongate warp (#1135): a warp is a short, deterministic journey,
// not an instant cut. The gate swirls open around the Avatar, the world whites
// out, and the position swaps on the single hidden peak frame — so the jump
// between two far-flung gates is never seen as a snap. Pure and seed-stable,
// so britanniacheck can prove the whole timeline headless.

export const WARP_LEN = 46   // total ticks of the journey
export const WARP_PEAK = 24  // tick the white-out peaks; the swap happens here

const h2 = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const warpActive = (age) => age >= 0 && age < WARP_LEN

// the white-out: ramps from 0 to full at the peak, then fades to the arrival.
// The swap frame sits exactly where this reaches 1, hiding the teleport.
export function warpFlash(age) {
    if (!warpActive(age)) return 0
    if (age < WARP_PEAK) return age / WARP_PEAK
    return Math.max(0, 1 - (age - WARP_PEAK) / (WARP_LEN - WARP_PEAK))
}

// the one window of frames during which the position may be swapped — always
// under the white-out, never on the first frame (an instant cut would be age 0).
export const warpSwapAt = (age) => warpActive(age) && age >= WARP_PEAK

// the portal ring: a tight swirl that opens into a wide burst and fades.
export function warpRing(age) {
    if (!warpActive(age)) return null
    const p = age / WARP_LEN
    return { r: 16 + p * 96, a: 0.9 * (1 - p * 0.55) }
}

// light motes streaming out of the gate, orbiting the Avatar and thinning out.
export function warpMotes(age, gate, seed, count = 42) {
    if (!warpActive(age)) return []
    const p = age / WARP_LEN
    const out = []
    for (let i = 0; i < count; i++) {
        const base = h2(i, gate + 1, seed) * 6.28318
        const spin = p * (3 + (i % 4)) * (i % 2 ? 1 : -1)
        const rad = (0.25 + h2(i, gate, seed + 7) * 0.75) * (22 + p * 74)
        const a = (1 - p) * (0.35 + h2(i, gate, seed + 13) * 0.6)
        out.push({ x: Math.cos(base + spin) * rad, y: Math.sin(base + spin) * rad * 0.72, a, sz: 1 + h2(i, gate, seed + 21) * 2.6 })
    }
    return out
}
