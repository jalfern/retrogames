// #838 item 2 — the sea wears each Age (#1570-sibling stage of the MYST fidelity
// issue). Pure: no THREE, no DOM. The original was FMV: every Age swims in its
// own light and its own water — Selenitic's murky green, Stoneship's teal
// Atlantic, Channelwood's cloud-glass pools, the island at dusk amber. Ours
// ran every view on one blue plane; `atmosphere()` already retints fog and sun
// per Age, so the sea was the last view element still wearing Myst's sky.
//
// `SEA_VIEWS` is the single source of truth the scene colours and animates
// through and mystcheck proves against: per view the sea's water level (the
// plane it draws at), its multiply-tint colour, its swell amplitude and its
// texture drift. `seaSwell(x, z, t, view)` is the deterministic swell — three
// incommensurate sines scaled by the view's amplitude, no Math.random — and
// `foamAt`/`foamLine` answer where the sculpted ground (terrain.js) meets its
// own sea level: foam exists on the coast only, never on dry ground, never on
// open water.

import { groundHeight, groundRaw, AGE_GROUND, ISLAND_GROUND } from './terrain.js'

// views items 1+3 sculpted a bed for: foam can only hug a measured coast.
const HAS_GROUND = (view) => view === 'selenitic' || view === 'selSound' || !!AGE_GROUND[view] || !!ISLAND_GROUND[view]

// water: the y the view's sea plane draws at (matches seaPlane calls).
// colour: multiply-tint over the shared sea texture (r,g,b 0..1). Hue laws the
// harness proves: selenitic green-dominant (its haze), stoneship teal (b ≥ g,
// both well over r — Atlantic), channelwood moss-dark green (g over both, dark
// — a pool world under cloud light), island dusk amber (warm: r > g > b — the
// 1993 landing is lit by the same sunset as its fog).
export const SEA_VIEWS = {
  dock:             { water: 0,    color: [0.98, 0.80, 0.60], swell: 0.16, drift: 0.020 },
  cliffPath:        { water: -1,   color: [0.96, 0.78, 0.58], swell: 0.16, drift: 0.020 },
  beach:            { water: 0,    color: [0.98, 0.80, 0.60], swell: 0.18, drift: 0.022 },
  stairTop:         { water: -4,   color: [0.94, 0.76, 0.56], swell: 0.16, drift: 0.018 },
  selenitic:        { water: 0.02, color: [0.52, 0.90, 0.62], swell: 0.30, drift: 0.030 },
  selSound:         { water: 0.02, color: [0.50, 0.88, 0.60], swell: 0.30, drift: 0.030 },
  stoneship:        { water: -0.3, color: [0.48, 0.84, 0.98], swell: 0.55, drift: 0.045 },
  stoneDeck:        { water: -0.3, color: [0.46, 0.82, 0.98], swell: 0.55, drift: 0.045 },
  stoneObservatory: { water: -1.5, color: [0.44, 0.80, 0.96], swell: 0.60, drift: 0.048 },
  channelwood:      { water: -0.3, color: [0.42, 0.74, 0.70], swell: 0.06, drift: 0.010 },
  chanChannels:     { water: -0.3, color: [0.42, 0.74, 0.70], swell: 0.06, drift: 0.010 },
  chanWheel:        { water: -0.5, color: [0.40, 0.72, 0.68], swell: 0.05, drift: 0.008 },
  chanObs:          { water: -0.5, color: [0.40, 0.72, 0.68], swell: 0.05, drift: 0.008 },
}

// foam band: how close (world units) the sculpted ground must ride to the
// view's sea level to wear a waterline. Past the band: dry land above, or
// open water below — no foam either side.
export const FOAM_BAND = 0.45

// #1587 — the horizon: the sea plane's half-span must reach PAST the sky
// dome (radius 900) so the water's edge is never inside the dome. Then the
// horizon is fog fade into the dome's own horizon band — the FMV cut, not the
// rim of a floating disc. (Views sit 4000 apart; 2400/2 + 900 < 4000, so a
// plane never pokes through its neighbour's dome.)
export const SEA_EXTENT = 2400

// #1587 — shore break LAGS the swell: real foam holds the waterline of a
// third-second ago while the crest is already passing. The foam puffs ride
// seaSwell evaluated at (t - FOAM_LAG), so the line visibly trails the water.
export const FOAM_LAG = 0.3

// #1587 — the break is ragged: every foam seat wears its own width, a
// deterministic hash of its position (the harness replays it; no random).
// Factors 0.85..2.0 over the base 1.7 unit quad — short scallops between
// long runnels, never a uniform comb.
export function foamScale(x, z, view) {
  let h = 2166136261
  for (let i = 0; i < view.length; i++) { h ^= view.charCodeAt(i); h = Math.imul(h, 16777619) }
  h = Math.imul(h ^ Math.imul(x + 128, 374761393), 668265263)
  h = Math.imul(h ^ Math.imul(z + 128, 1440662683), 668265263)
  const f = ((h >>> 0) % 10000) / 10000
  return 0.85 + 1.15 * f
}

// #1587 — the low sun: every open sea catches a specular strip running from
// its seat toward the player, the way the original's FMV seas gild the water
// toward the sun. Deterministic per view: a seat hash picks the bearing and
// distance, the strip wears its sky's sun colour (the same table the scene
// lights with), and its strength dies as the swell chews the mirror — a heaving
// Atlantic breaks its glint, the dusk wash holds it.
const GLINT_SUN = {
  dusk:        [1.00, 0.69, 0.48], // 0xffb07a — the island's amber sunset
  selenitic:   [0.75, 0.91, 0.80], // 0xbfe8cc — the green haze sun
  stoneship:   [0.87, 0.89, 0.92], // 0xdfe4ea — the cold Atlantic sun
  channelwood: [0.81, 0.93, 0.90], // 0xcfeee6 — cloud-glass light
}
function skyOf(view) {
  if (['dock', 'cliffPath', 'beach', 'stairTop'].includes(view)) return 'dusk'
  if (view.startsWith('sel')) return 'selenitic'
  if (view.startsWith('stone')) return 'stoneship'
  return 'channelwood'
}
function hash01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}
// { x, z, rot, w, len, color[3], base, rate } or null for a dry view.
//   x,z   the strip's seat on the sea (r units out from the view origin)
//   rot   the seat's bearing (radians) — the strip lies along this line
//   base  resting opacity; the scene pulses it around this at `rate`
export function glintFor(view) {
  const v = SEA_VIEWS[view]
  if (!v) return null
  const a = hash01(view + ':a') * Math.PI * 2
  const r = 46 + 26 * hash01(view + ':r')
  const strength = 0.03 + 0.30 * v.color[0] * (1 - v.swell / 0.6)
  return {
    x: Math.sin(a) * r,
    z: Math.cos(a) * r,
    rot: a,
    w: 2.6 + 3.2 * hash01(view + ':w'),
    len: 70 + 50 * hash01(view + ':l'),
    color: GLINT_SUN[skyOf(view)],
    base: strength,
    rate: 0.9 + 1.6 * (1 - v.swell / 0.6),
  }
}

export function seaProfile(view) {
  return SEA_VIEWS[view] || null
}

// deterministic swell: the sea surface's vertical offset at (x, z) at world
// time t for `view`, bounded by the view's amplitude. Incommensurate sines so
// the pattern never visibly repeats; no Math.random (the harness replays it).
export function seaSwell(x, z, t, view) {
  const v = SEA_VIEWS[view]
  if (!v || v.swell === 0) return 0
  const s = v.swell
  return s * (
    0.55 * Math.sin(x * 0.045 + z * 0.021 + t * 0.9) +
    0.30 * Math.sin(x * 0.017 - z * 0.033 + t * 1.31) +
    0.15 * Math.sin((x + z) * 0.062 - t * 1.73)
  )
}

// foam intensity 0..1 where the sculpted ground meets its sea: strongest right
// at the waterline, gone past the band. Views with no sculpted ground entry
// (the island's prop views) have no measured coast and return 0 — the harness
// only expects foam lines where item 1 sculpted the bed.
export function foamAt(x, z, view) {
  const v = SEA_VIEWS[view]
  if (!v || v.water === null || !HAS_GROUND(view)) return 0
  const g = groundHeight(x, z, view)
  if (g === null || g === undefined || Number.isNaN(g)) return 0
  // a coast, not a dry pad: the RAW sculpt must meet the water too, so the
  // carve that keeps a puzzle bed level never reads as a beach at sea level
  const raw = groundRaw(x, z, view)
  if (raw === null || Number.isNaN(raw)) return 0
  const nearRaw = Math.abs(raw - v.water)
  if (nearRaw >= FOAM_BAND) return 0
  const d = Math.abs(g - v.water)
  if (d >= FOAM_BAND) return 0
  return 1 - d / FOAM_BAND
}

// the coast itself: foam puffs hugging the waterline of a coastal view, in
// deterministic grid order, capped at CAP. Each puff is [x, z, intensity];
// every puff satisfies foamAt > 0 at its own seat (mystcheck proves they hug
// the coast — foam only where land and sea agree).
export function foamLine(view, step = 2, cap = 64) {
  const out = []
  if (!SEA_VIEWS[view] || !HAS_GROUND(view)) return out
  for (let x = -70; x <= 70 && out.length < cap; x += step) {
    for (let z = -70; z <= 70 && out.length < cap; z += step) {
      const i = foamAt(x, z, view)
      if (i > 0.25) out.push([x, z, i])
    }
  }
  return out
}
