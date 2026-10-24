// SELENITIC terrain (#1033) — the grass-covered grey dome, sculpted.
// Pure: no THREE, no DOM. `domeHeight` is the single source of truth the
// scene displaces its heightfield with and mystcheck proves against: the
// landing pad stays flat under the rings and posts, the dome rises to a
// crest beyond the field, and the skirt dips below the waterline so the
// shared ocean meets a real coast instead of running under a flat disc.

export const DOME = { rim: 62, core: 24, skirt: 16, seabed: -3.5 }

export const SEL_CRESTS = {
  selenitic: { x: 0, z: 95, h: 14 },
  selSound: { x: 0, z: 0, h: 9 },
}

// flat carves where the sculpt must never touch the ground: the landing pad
// (rings, posts and sphere keep their level bed) and the sounding-path
// corridor (the six stones and the sealed gate stay level; the cliff the
// gate is cut into rises behind it).
export const SEL_FLATS = {
  selenitic: [{ x0: -55, x1: 55, z0: -55, z1: 55, soft: 30 }],
  selSound: [{ x0: -7, x1: 7, z0: -46, z1: -25, soft: 6 }],
}

const smooth = (t) => t * t * (3 - 2 * t)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function flatMask(x, z, flats) {
  let m = 1
  for (const f of flats) {
    const dx = Math.max(f.x0 - x, 0, x - f.x1)
    const dz = Math.max(f.z0 - z, 0, z - f.z1)
    m = Math.min(m, clamp01(Math.max(dx, dz) / f.soft))
  }
  return m
}

export function domeHeight(x, z, view = 'selenitic') {
  const crest = SEL_CRESTS[view] || SEL_CRESTS.selenitic
  const d = Math.hypot(x - crest.x, z - crest.z)
  let h
  if (d <= DOME.core) h = crest.h
  else if (d >= DOME.rim + DOME.skirt) h = DOME.seabed
  else if (d >= DOME.rim) h = DOME.seabed * ((d - DOME.rim) / DOME.skirt)
  else h = crest.h * smooth((DOME.rim - d) / (DOME.rim - DOME.core))
  return h * flatMask(x, z, SEL_FLATS[view] || [])
}
