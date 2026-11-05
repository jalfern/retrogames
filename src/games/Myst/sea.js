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

// #838 item 4 — the DEEP ocean wears the Age too. Items 2+3 gave the shore its
// tint and its waterline, but past the break every sea was still one uniform
// sheet: the same colour from the foam to the fog line, the same chop under
// everything. The original's FMV seas are never one colour — water deepens as
// land falls away, the chop flattens into long ground-swell, and the last band
// before the horizon catches the low sky back. This is that ladder, as pure law.
//
// Distances (from the view's own origin, world units):
//   coast — shore water keeps the Age tint (foam, glint, puzzle beds live here)
//   deep  — darkest: multiply-tint toward the deep (×DEEP_DARK), hue kept
//   mirror— the last band brightens again (×MIRROR_LIFT) — the sky's return
// past mirror the fog (#1587's horizon) finishes the melt into the sky.
export const SEA_DEEP = { coast: 60, deep: 300, mirror: 380 }
export const DEEP_DARK = 0.55
export const MIRROR_LIFT = 0.72

// { r, g, b } as [r,g,b] at distance d from the player for `view`, or null
// for a dry view. Deterministic, monotone darkening shore→deep, then a lift.
export function deepTint(view, d) {
  const v = SEA_VIEWS[view]
  if (!v) return null
  const dist = Math.max(0, d)
  const { coast, deep, mirror } = SEA_DEEP
  if (dist <= coast) return [v.color[0], v.color[1], v.color[2]]
  if (dist <= deep) {
    const k = (dist - coast) / (deep - coast)
    const f = 1 + k * (DEEP_DARK - 1)
    return [v.color[0] * f, v.color[1] * f, v.color[2] * f]
  }
  if (dist <= mirror) {
    const k = (dist - deep) / (mirror - deep)
    const f = DEEP_DARK + k * (MIRROR_LIFT - DEEP_DARK)
    return [v.color[0] * f, v.color[1] * f, v.color[2] * f]
  }
  return [v.color[0] * MIRROR_LIFT, v.color[1] * MIRROR_LIFT, v.color[2] * MIRROR_LIFT]
}

// Far ground-swell: long, slow, low-frequency waves the deep ocean rides that
// shore water never feels. Zero inside the coast band (the foam and the beds sit
// in the near chop only), ramping to full past `deep`. Bounded by the view's
// swell — combined with seaSwell the deep heaves harder than the shore, as an
// ocean should. Deterministic: no Math.random, the harness replays it.
export const FAR_GAIN = 0.9
export function farSwell(x, z, t, view) {
  const v = SEA_VIEWS[view]
  if (!v || v.swell === 0) return 0
  const r = Math.sqrt(x * x + z * z)
  const { coast, deep } = SEA_DEEP
  if (r <= coast) return 0
  const ramp = Math.min(1, (r - coast) / (deep - coast))
  return v.swell * FAR_GAIN * ramp * (
    0.65 * Math.sin(x * 0.009 + z * 0.004 + t * 0.33) +
    0.35 * Math.sin(x * 0.004 - z * 0.011 + t * 0.47)
  )
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

// #838 item 5 — the horizon is not empty. Items 2–4 graded the water and rolled
// it, but the original's FMV seas were never empty twice over: the water mirrors
// the sky it sits under, and the horizon carries land. Two laws here, pure like
// the rest of this file.
//
// Mirrored cloud banks: past the mirror edge (SEA_DEEP.mirror) the sky's clouds
// lay onto the water. Per-sky cloud colours — dusk rose off the island sunset,
// Selenitic's pale jade haze, the Atlantic's silver-grey banks, Channelwood's
// near-white cloud floor (it floats ON the clouds). The clumps are a product of
// two long sine bands squared into broken cotton, drifting at a slow fraction of
// the texture drift; zero inside the mirror edge, so shore water keeps the
// items 2/3 law untouched. Deterministic — no Math.random; the harness replays it.
export const SKY_CLOUD = {
  dusk:        [0.99, 0.72, 0.66], // rose-lit cirrus over the amber sea
  selenitic:   [0.72, 0.92, 0.80], // pale jade — the storm haze, lit from behind
  stoneship:   [0.88, 0.91, 0.95], // silver-grey Atlantic banks
  channelwood: [0.95, 1.00, 0.98], // cloud-floor white, brightest of all
}
// distance from the view's own origin where the banks reach full strength.
export const MIRROR_RAMP = 120

export function cloudTint(view) {
  if (!SEA_VIEWS[view]) return null
  return SKY_CLOUD[skyOf(view)]
}

// mirrored cloud brightness 0..1 at (x, z) at world time t for `view`; 0 for a
// dry view and everywhere inside the mirror band.
export function cloudMirror(x, z, t, view) {
  const v = SEA_VIEWS[view]
  if (!v) return 0
  const r = Math.sqrt(x * x + z * z)
  if (r <= SEA_DEEP.mirror) return 0
  const ramp = Math.min(1, (r - SEA_DEEP.mirror) / MIRROR_RAMP)
  const ph = t * v.drift * 11
  const u = 0.5 + 0.5 * Math.sin(x * 0.010 + z * 0.004 + ph)
  const w = 0.5 + 0.5 * Math.sin(x * 0.004 - z * 0.012 + ph * 0.7 + 2.1)
  const q = u * w
  return ramp * q * q
}

// Neighbouring land on the skyline. The island's dusk views look out over the
// bay of Myst itself — its own coast curving away past the frame reads as dark
// headlands on the haze line; Stoneship's Atlantic carries two low, far islands
// past the swell. Selenitic gets none — its horizon is the caldera dome;
// Channelwood none — it floats above the clouds, not over a shore; Mechanical's
// forge floor is dry. Deterministic per view (a name hash picks bearings and
// sizes), and every isle stands inside the fog's reach: past ISL_LIMIT.far the
// scene's fog swallows it whole, which is exactly the wrong kind of empty.
export const ISL_LIMIT = { min: 120, far: 640 }
// The land-bearing skies — the table IS the law: a sky absent from it keeps its
// own horizon (Selenitic's dome, Channelwood's cloud floor, Mechanical's stone).
const ISLE_LAW = {
  dusk:      { n: 3, base: 380, span: 180, w0: 90, h0: 14, tint: [0.16, 0.11, 0.16] }, // Myst's own headlands, basalt-dark in the dusk haze
  stoneship: { n: 2, base: 240, span: 120, w0: 60, h0: 7,  tint: [0.30, 0.33, 0.38] }, // low far islands, cold Atlantic grey
}

// [{ x, z, w, h, color[3] }] — silhouettes seated on the view's own waterline,
// or [] where the Age keeps its own horizon.
export function islesFor(view) {
  const v = SEA_VIEWS[view]
  if (!v) return []
  const law = ISLE_LAW[skyOf(view)]
  if (!law) return []
  const out = []
  for (let i = 0; i < law.n; i++) {
    const a = ((18 + 324 * hash01(`${view}:isle${i}:a`)) * Math.PI) / 180
    const d = law.base + hash01(`${view}:isle${i}:d`) * law.span
    const w = law.w0 + hash01(`${view}:isle${i}:w`) * 120
    const h = law.h0 + hash01(`${view}:isle${i}:h`) * 20
    out.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, w, h, color: law.tint })
  }
  return out
}

// #838 item 6 — the skyline carries landmarks. Item 5 answered the horizon with
// generic headlands; the residual said it plain: the original's skyline also
// carried neighbouring Ages' landmarks faintly (the clock tower from far
// beaches). An island is never faceless — Myst's ridge holds the brass clock
// tower, and across the bay the mountain wears Selenitic's green dome.
//
// The law that makes them landmarks and not props is ANCHORAGE: the generic
// headlands above are hash-born per view (fog texture, free to re-seat), but a
// named landmark keeps ONE seat in every dusk view — all four poses on the
// island see the tower at the same bearing and distance, because the island is
// one place, not four sets of props. That is why the table is fixed numbers,
// not hashes.
//
// Shape laws: a headland is wide and low (w > h); a tower is thin and tall and
// stands above every headland on the skyline. The crag carries a jade dome
// (green-dominant against its basalt body — Selenitic seen from across the
// bay), and only the tower carries a light: one warm dial (r > b) that breathes
// on the world clock, the last sun caught in brass. An empty entry is the law
// table SAYING a sky keeps its own horizon: the Atlantic rides generic low
// islands, Selenitic's horizon is its caldera, Channelwood floats on clouds,
// Mechanical is dry — all answer [] through the missing key.
export const LANDMARK_LAW = {
  dusk: [
    { kind: 'clockTower', az: 251, dist: 415, w: 13, h: 52, body: [0.17, 0.1, 0.13], roof: [0.11, 0.06, 0.09], glow: [0.96, 0.78, 0.36], dome: null },
    { kind: 'domeCrag', az: 322, dist: 470, w: 150, h: 44, body: [0.14, 0.12, 0.17], roof: null, glow: null, dome: [0.36, 0.62, 0.46] },
  ],
  stoneship: [],
}

// [{ kind, x, z, w, h, body[3], roof[3]|null, glow[3]|null, dome[3]|null }] —
// named silhouettes seated on the view's waterline, anchored per sky (never
// per view). [] where the Age keeps its own horizon.
export function landmarksFor(view) {
  const v = SEA_VIEWS[view]
  if (!v) return []
  const list = LANDMARK_LAW[skyOf(view)]
  if (!list) return []
  return list.map((L) => ({
    kind: L.kind,
    x: Math.sin((L.az * Math.PI) / 180) * L.dist,
    z: Math.cos((L.az * Math.PI) / 180) * L.dist,
    w: L.w,
    h: L.h,
    body: L.body,
    roof: L.roof,
    glow: L.glow,
    dome: L.dome,
  }))
}

// #838 item 12 — the ship floats. The Spectator lens always painted the
// Atlantic ship lifting on its swell (visions.js bobbed and rolled it), but
// standing IN Stoneship the longship was welded to its rock shelf — the
// quarterdeck view had, by the README's own words, "no live mechanism to
// drive". In the 1993 clip the whole frame rocks: you are aboard a floating
// hull. `shipFloat(t, view)` answers what the hull does on the very water
// under it, sampled from seaSwell at five seats — centre, port, starboard,
// stern, bow of the moored footprint:
//   heave  the average of the five (a sixty-foot hull cannot surf one chop
//          crest — it rides the water its keel actually spans),
//   roll   the water's slope across the beam — port lifts when starboard's
//          sample is lower (and vice versa: the sign follows the sea),
//   pitch  the same along the keel, bow lifting when astern's sample is low.
// All three come straight from the sea's own three-sine clock — the pane, the
// hull and the quarterdeck camera therefore rock in step, sharing one law the
// harness replays. Deterministic: no Math.random.
export const SHIP_ROCK = {
  seat: [0, 2], // hull centre on the stoneDeck sea (matches the scene's mooring)
  halfW: 1.6, // half-beam of the buoyed box (the plank hull is 3.2 across)
  halfL: 5.3, // half-length of the buoyed run (11-unit hull plus the cone bow)
  maxTilt: 0.09, // a moored longship never exceeds ~5° on Myst's Atlantic
  camGain: 1, // you stand ON the deck: the horizon tilts exactly as much as it heels
  paneGain: 2.2, // the Spectator paints the heel big enough to read at 152 px
}
// The island's rotted boat stays beached; Channelwood has no ship at all:
// the quarterdeck is the only deck that rides.
export const SHIP_VIEWS = ['stoneDeck']

// { heave, roll, pitch } on the deck's own view — null everywhere the sea
// carries no ship.
export function shipFloat(t, view) {
  if (!SHIP_VIEWS.includes(view)) return null
  const [sx, sz] = SHIP_ROCK.seat
  const c = seaSwell(sx, sz, t, view)
  const port = seaSwell(sx - SHIP_ROCK.halfW, sz, t, view)
  const star = seaSwell(sx + SHIP_ROCK.halfW, sz, t, view)
  const stern = seaSwell(sx, sz - SHIP_ROCK.halfL, t, view)
  const bow = seaSwell(sx, sz + SHIP_ROCK.halfL, t, view)
  const cap = (v) => Math.max(-SHIP_ROCK.maxTilt, Math.min(SHIP_ROCK.maxTilt, v))
  return {
    heave: (c + port + star + stern + bow) / 5,
    roll: cap(Math.atan((star - port) / (2 * SHIP_ROCK.halfW))),
    pitch: cap(Math.atan((stern - bow) / (2 * SHIP_ROCK.halfL))),
  }
}
