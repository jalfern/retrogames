// BRITANNIA weather — pure sim, no DOM (#1135): the sky is decided per
// 16x16-tile region and per 24s epoch from a hash of (region, epoch, seed),
// so rain/snow/storm are deterministic (harness-replayable) yet vary across
// the land and drift over the night. North of the snow line precipitation
// falls as snow; lightning only ever strikes at night, and only in storms.

export const WX = { CLEAR: 0, RAIN: 1, SNOW: 2, STORM: 3 }
export const WX_NAME = ['CLEAR', 'RAIN', 'SNOW', 'STORM']
export const SNOW_LINE = 72
export const WX_EPOCH = 1440
const FLASH_PERIOD = 90
const FLASH_FRAMES = 5

const hash3 = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * -1640531527) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const regionOf = (x, y) => [x >> 4, y >> 4]
export const isFrozen = (y) => y < SNOW_LINE

export function weatherAt(x, y, tick, seed = 0) {
    const [gx, gy] = regionOf(x, y)
    const ep = Math.floor(tick / WX_EPOCH)
    const r = hash3(gx, gy, (ep ^ seed) + 1013)
    if (r < 0.62) return WX.CLEAR
    if (r < 0.88) return isFrozen(y) ? WX.SNOW : WX.RAIN
    return WX.STORM
}

// night window for lightning, as a fraction of the day (matches the shell's
// night curve: dusk ~0.25..0.34, dawn ~0.72..0.81)
export const stormNight = (tod) => tod >= 0.26 && tod <= 0.80

export function flashAt(x, y, tick, tod, seed = 0) {
    if (weatherAt(x, y, tick, seed) !== WX.STORM) return 0
    if (!stormNight(tod)) return 0
    const [gx, gy] = regionOf(x, y)
    const b = Math.floor(tick / FLASH_PERIOD)
    if (hash3(gx, gy, (b ^ seed) * 7 + 31) > 0.28) return 0
    const ph = tick % FLASH_PERIOD
    return ph < FLASH_FRAMES ? 1 - ph / FLASH_FRAMES : 0
}

// strike onset: the frame a flash begins, so the shell can schedule thunder
export const flashOnset = (x, y, tick, tod, seed = 0) => (flashAt(x, y, tick, tod, seed) >= 1 ? 1 : 0)
