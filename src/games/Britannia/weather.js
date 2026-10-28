// BRITANNIA weather — pure sim, no DOM (#1135): the sky is decided per
// 16x16-tile region from a hash of (region, seed), and the whole pattern
// rides west-to-east at one region per WX_EPOCH (#1135 fronts) — mid-latitudes
// blow off the ocean like they do on Earth. So rain/snow/storm are
// deterministic (harness-replayable), coherent in space and time (a cell keeps
// its kind as it travels), yet vary across the land. North of the snow line
// precipitation falls as snow; lightning only ever strikes at night, inside a
// storm, and rides the storm cell east.

export const WX = { CLEAR: 0, RAIN: 1, SNOW: 2, STORM: 3 }
export const WX_NAME = ['CLEAR', 'RAIN', 'SNOW', 'STORM']
export const SNOW_LINE = 72
export const WX_EPOCH = 1440
export const ROCK = 3
export const SHADOW_D = 8
export const UPLIFT_D = 8
export const SHADOW_MAX = 0.22
export const UPLIFT_MAX = 0.12
export const SUMMIT = 0.15
export const driftOf = (tick) => Math.floor(tick / WX_EPOCH)
const FLASH_PERIOD = 90
const FLASH_FRAMES = 5

const hash3 = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const regionOf = (x, y) => [x >> 4, y >> 4]
export const isFrozen = (y) => y < SNOW_LINE

// rain shadow (#1135): fronts ride west-to-east, so rock is a wind barrier.
// A cell east of the nearest ridge sits in the dry leeward shadow (the air
// lost its rain on the far side); a cell west of it climbs the windward face
// and gets wetter; standing on the rock itself is summit uplift. The bias
// falls off linearly with distance and is 0 beyond SHADOW_D/UPLIFT_D, so the
// effect is local, monotone, and terrain-only — oceans cast no shadow (sea is
// not rock), and with no terrain passed the sky is exactly the old drift field.
export function reliefBias(x, y, terrainAt) {
    if (!terrainAt) return 0
    if (terrainAt(x, y) === ROCK) return SUMMIT
    let dW = 99, dE = 99
    for (let d = 1; d <= SHADOW_D; d++) {
        if (dW === 99 && terrainAt(x - d, y) === ROCK) dW = d
        if (dE === 99 && terrainAt(x + d, y) === ROCK) dE = d
    }
    if (dW < dE) return -SHADOW_MAX * (1 - (dW - 1) / SHADOW_D)
    if (dE < dW) return UPLIFT_MAX * (1 - (dE - 1) / UPLIFT_D)
    return 0
}

export function weatherAt(x, y, tick, seed = 0, terrainAt = null) {
    const [gx, gy] = regionOf(x, y)
    let r = hash3(gx - driftOf(tick), gy, seed + 1013)
    const b = reliefBias(x, y, terrainAt)
    if (b !== 0) r = Math.min(0.999, Math.max(0.001, r + b))
    if (r < 0.62) return WX.CLEAR
    if (r < 0.88) return isFrozen(y) ? WX.SNOW : WX.RAIN
    return WX.STORM
}

// night window for lightning, as a fraction of the day (matches the shell's
// night curve: dusk ~0.25..0.34, dawn ~0.72..0.81)
export const stormNight = (tod) => tod >= 0.26 && tod <= 0.80

export function flashAt(x, y, tick, tod, seed = 0, terrainAt = null) {
    if (weatherAt(x, y, tick, seed, terrainAt) !== WX.STORM) return 0
    if (!stormNight(tod)) return 0
    const [gx, gy] = regionOf(x, y)
    const b = Math.floor(tick / FLASH_PERIOD)
    if (hash3(gx - driftOf(tick), gy, (b ^ seed) * 7 + 31) > 0.28) return 0
    const ph = tick % FLASH_PERIOD
    return ph < FLASH_FRAMES ? 1 - ph / FLASH_FRAMES : 0
}

// strike onset: the frame a flash begins, so the shell can schedule thunder
export const flashOnset = (x, y, tick, tod, seed = 0, terrainAt = null) => (flashAt(x, y, tick, tod, seed, terrainAt) >= 1 ? 1 : 0)
