// engineSfx.js — the pure sound laws behind COMET DRIFT's engine bed
// (#440 item 6). ART.md rule 4: every action has a sound. The engine used to
// be one square buzz whose POP PERIOD stepped with Math.round(v): every time
// speed crossed an integer the buzz rate lurched (a plastic gear-shift), the
// pitch was dead-steady (no life), and held drifts and sand runs were silent
// apart from one-shot crashes. All the note decisions live here as pure laws
// of (v, state, tick) so cometcheck can gate them without a browser or an
// audio device; index.jsx only accumulates phases and calls AudioController.

export const ENGINE = {
    floor: 58,          // idle base, Hz
    vMul: 13,           // Hz per unit of speed — the ladder stays audible
    boostBase: 34,      // same step the old buzz used, so the tier ladder
    boostTierMul: 52,   // through engineVoice is bit-for-bit the old one
    wob1: 3.0, wobR1: 0.13,   // two incommensurate sines = pitch wobble
    wob2: 4.5, wobR2: 0.047,  // (engine mounts flex; no dead laser-tone)
    minV: 0.5,
}

export const SCRAPE = { minV: 4.5, maxGrip: 60, period: 4 }
export const WHOOSH = { minV: 1.0, period: 8 }

// the engine pop for this tick: continuous period (no round(v) gear-step),
// pitch riding speed + boost tier, wobbling on two slow sines.
export function engineVoice(v, boostTier, tick) {
    if (v < ENGINE.minV) return null
    const boost = boostTier >= 0 ? ENGINE.boostBase + boostTier * ENGINE.boostTierMul : 0
    const wob = ENGINE.wob1 * Math.sin(tick * ENGINE.wobR1) + ENGINE.wob2 * Math.sin(tick * ENGINE.wobR2)
    const period = Math.max(3, 15 - v)
    return { freq: ENGINE.floor + v * ENGINE.vMul + boost + wob, period, vol: 0.028 }
}

// tyre-scrape under a held drift (road/kerb): a bright filtered-noise crackle
// that grows with the charge, its cutoff falling as the tyre grips back —
// screech into rumble, the way a slide ages.
export function driftScrape(driftT, v) {
    if (driftT <= 0 || v <= SCRAPE.minV) return null
    const grip = Math.min(1, driftT / SCRAPE.maxGrip)
    const speed = Math.min(1, v / 12)
    return {
        dur: 0.05 + 0.04 * speed,
        vol: 0.014 + 0.02 * grip,
        freq: 2400 - 900 * grip,
        period: SCRAPE.period,
    }
}

// sand whoosh off-road: sand drinks the top end, so this sits far below the
// kerb scrape and swells with speed.
export function sandWhoosh(offroad, v) {
    if (!offroad || v <= WHOOSH.minV) return null
    const speed = Math.min(1, v / 12)
    return {
        dur: 0.12,
        vol: 0.01 + 0.028 * speed,
        freq: 300 + 500 * speed,
        period: WHOOSH.period,
    }
}
