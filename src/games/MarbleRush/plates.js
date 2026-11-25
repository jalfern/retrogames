// MARBLE RUSH — plates.js: the rolling-surface tone. One pure module: the
// look (surface tags) exists in course.js as seg/stage `plate` data, this file
// owns the SOUND of that data — a satin hum, a gravel rumble, an ice hiss —
// plus the per-stage sky ambience. No THREE, no DOM, no audio deps: the sim
// stays pure and this module stays Node-testable.
//
// Rules:
//   - satin is the shipped hum EXACTLY (44 base / 6.2 per m/s, sawtooth, the
//     same volume curve) — rung 1 shelves must sound identical to before
//   - gravel: heavier and rougher — a touch lower base, more body, real noise
//   - ice: higher and slicker — triangle, airy noise, slightly faster curve
//   - anything unknown falls back to satin (never a silent surface)

export const PLATES = ['satin', 'gravel', 'ice']

// { freq, type, vol, noise } — noise is a playNoise amount (0 = silent)
export function plateTone(plate, v) {
    switch (plate) {
        case 'gravel':
            return { freq: 52 + v * 5.0, type: 'sawtooth', vol: 0.030 + Math.min(0.036, v * 0.0022), noise: 0.014 }
        case 'ice':
            return { freq: 66 + v * 8.4, type: 'triangle', vol: 0.024 + Math.min(0.034, v * 0.0020), noise: 0.008 }
        case 'satin':
        default:
            return { freq: 44 + v * 6.2, type: 'sawtooth', vol: 0.028 + Math.min(0.035, v * 0.0018), noise: 0 }
    }
}

// per-stage sky ambience — quiet, near-bed level, one tone per sky
export function skyAmbience(sky) {
    switch (sky) {
        case 'dawn':  return { freq: 88,  type: 'triangle', vol: 0.016 }
        case 'day':   return { freq: 104, type: 'triangle', vol: 0.015 }
        case 'dusk':  return { freq: 82,  type: 'sine',     vol: 0.018 }
        case 'storm': return { freq: 56,  type: 'sawtooth', vol: 0.019 }
        default:      return { freq: 104, type: 'triangle', vol: 0.015 }
    }
}
