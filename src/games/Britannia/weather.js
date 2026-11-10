// BRITANNIA weather — pure sim, no DOM (#1135): the sky is decided per
// 16x16-tile region from a hash of (region, seed), and the whole pattern
// rides west-to-east on the zonal wind (#1135 fronts) — mid-latitudes blow
// off the ocean like they do on Earth. So rain/snow/storm are
// deterministic (harness-replayable), coherent in space and time (a cell keeps
// its kind as it travels), yet vary across the land. North of the snow line
// precipitation falls as snow; lightning only ever strikes at night, inside a
// storm, and rides the storm cell east.
//
// #1853 — the wind has weather of its own: a seeded pressure cycle sets the
// drift SPEED each epoch (0 becalmed, 1 steady, 2 fresh, 3 gale regions), and
// the pattern's drift is the running sum. Fronts still only ride east, cells
// still keep their kind; what varies is how fast the sky travels — a gale
// races fronts across the map in one epoch, a high parks a storm over the moor.

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
const FLASH_PERIOD = 90
const FLASH_FRAMES = 5

const hash3 = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// the zonal wind for one epoch: a seeded pressure cycle. Distribution leans to
// steady/fresh weather (40/35%), with stalling highs (15%) and rare gales (10%).
export const windOf = (epoch, seed = 0) => {
    const h = hash3(epoch, 17, ((seed ^ 0x9e37) * 2654435761) | 0)
    return h < 0.4 ? 1 : h < 0.75 ? 2 : h < 0.9 ? 0 : 3
}
export const WX_WIND_NAME = ['BECALMED', 'STEADY', 'FRESH', 'GALE']

// drift = cumulative regions travelled by epoch n, memoized per seed so the
// per-frame weatherAt calls stay O(1). The memo only ever appends the same
// deterministic series, so replays and hashes see identical values.
const _driftMemo = new Map()
export function driftOf(tick, seed = 0) {
    const n = Math.floor(tick / WX_EPOCH)
    if (n < 0) { // swell memory asks before time began: integrate backward
        let d = 0
        for (let e = n; e < 0; e++) d += windOf(e, seed)
        return -d
    }
    let acc = _driftMemo.get(seed)
    if (!acc) { acc = [0]; _driftMemo.set(seed, acc) }
    while (acc.length <= n) acc.push(acc[acc.length - 1] + windOf(acc.length - 1, seed))
    return acc[n]
}
export const windNow = (tick, seed = 0) => windOf(Math.floor(tick / WX_EPOCH), seed)

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
    let r = hash3(gx - driftOf(tick, seed), gy, seed + 1013)
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
    if (hash3(gx - driftOf(tick, seed), gy, (b ^ seed) * 7 + 31) > 0.28) return 0
    const ph = tick % FLASH_PERIOD
    return ph < FLASH_FRAMES ? 1 - ph / FLASH_FRAMES : 0
}

// strike onset: the frame a flash begins, so the shell can schedule thunder
export const flashOnset = (x, y, tick, tod, seed = 0, terrainAt = null) => (flashAt(x, y, tick, tod, seed, terrainAt) >= 1 ? 1 : 0)
