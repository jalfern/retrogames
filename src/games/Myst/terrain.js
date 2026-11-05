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

// #838 item 1 — the other three Ages' ground, the same law as the Selenitic
// dome: a pure height the scene displaces its heightfield with and mystcheck
// proves against. Each outdoor view carries: the base its flat beds sit on
// (equal to the old disc's height, so nothing placed on the ground moves),
// the crest that gives the view its sculpt (the island ridge, the tower's
// promontory, the falls' lip, the sluice's rise, the ledges under the domes),
// flat carves under every path and puzzle, and the drop to a seabed below the
// sea plane so the shared ocean meets a real coast — or the cliff a terrace
// is cut into — instead of a flat disc edge. `water` is the view's sea level
// always below the bed: the player stands on dry land, as on the 1993 beach
 // (the old disc rode 7 cm under one shared sea plane — that is the look this
 // stage removes). null where the view has no sea, e.g. the tower floor.
export const AGE_GROUND = {
  stoneship:        { base: 0,   water: -0.3, crest: { x: 0, z: -14, core: 6, rim: 26, h: 4 }, drop: 3.5, skirt: 16, flats: [{ x0: -9, x1: 9, z0: -27, z1: 3, soft: 5 }] },
  stoneDeck:        { base: 0,   water: -0.3, crest: { x: 0, z: 40, core: 10, rim: 22, h: 4 }, drop: 3.5, skirt: 16, flats: [{ x0: -14, x1: 14, z0: -18, z1: 16, soft: 4 }] },
  stoneObservatory: { base: 5.1, water: -1.5, crest: { x: 0, z: 3, core: 5, rim: 16, h: 1.5 }, drop: 7.5, skirt: 18, flats: [{ x0: -9, x1: 9, z0: -8, z1: 1, soft: 5 }] },
  mechanical:       { base: 0,   water: null, crest: { x: 2, z: 34, core: 10, rim: 30, h: 3.5 }, drop: 3.5, skirt: 16, flats: [{ x0: -16, x1: 16, z0: -17, z1: 12, soft: 6 }] },
  mechWalk:         { base: 0,   water: null, crest: { x: 0, z: 12, core: 6, rim: 22, h: 5 }, drop: 3.5, skirt: 16, flats: [{ x0: -10, x1: 10, z0: -12, z1: 8, soft: 5 }] },
  channelwood:      { base: 0,   water: -0.3, crest: { x: 0, z: -15, core: 5, rim: 20, h: 5 }, drop: 3.5, skirt: 16, flats: [{ x0: -8, x1: 8, z0: -28, z1: -13.5, soft: 4 }] },
  chanChannels:     { base: 0,   water: -0.3, crest: { x: 0, z: -20, core: 10, rim: 30, h: 5.5 }, drop: 3.5, skirt: 16, flats: [{ x0: -10, x1: 10, z0: -44, z1: -21, soft: 4 }] },
  chanWheel:        { base: 2.2, water: -0.5, crest: { x: 0, z: -53, core: 3, rim: 12, h: 0.8 }, drop: 3, skirt: 10, flats: [{ x0: -11, x1: 11, z0: -61, z1: -49, soft: 5 }] },
  chanObs:          { base: 4.4, water: -0.5, crest: { x: 0, z: -57, core: 5, rim: 16, h: 1.2 }, drop: 6, skirt: 18, flats: [{ x0: -10, x1: 10, z0: -72, z1: -61, soft: 5 }] },
}

export function ageHeight(x, z, view) {
  const v = AGE_GROUND[view]
  const c = v.crest
  const d = Math.hypot(x - c.x, z - c.z)
  const t = clamp01((c.rim - Math.max(d - c.core, 0)) / (c.rim - c.core))
  const bump = c.h * smooth(t)
  const fall = v.drop * clamp01((d - c.rim) / v.skirt)
  const raw = v.base + bump - fall
  return v.base + (raw - v.base) * flatMask(x, z, v.flats)
}

// one entry point the scene displaces with: the Selenitic dome (#1033), or
// the other three Ages' ground (#838 item 1).
export function groundHeight(x, z, view) {
  if (view === 'selenitic' || view === 'selSound') return domeHeight(x, z, view)
  return ageHeight(x, z, view)
}
