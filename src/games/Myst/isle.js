// #838 item 16 — the island lives (Jon's look pass, the home Age: MYST itself).
//
// The 1993 island is a permanent dusk over a working bay: gulls wheel the
// water crying on their own cadences, the swell laps up the dock pilings as
// it passes, and the clock tower's one warm dial breathes — the island's
// landmark, the same dial item 6's skyline law paints on the FAR tower in
// every dusk view. Ours had the sea (items 2/3), the dusk (atmosphere) and
// the skyline silhouette — but nothing flew in the 3D sky, the pier sat dry
// on its own waterline, and the NEAR tower at stairTop carried no dial at
// all: the island read as one place at the horizon and a still life up close.
//
// Everything here is pure like sea.js/storm.js/forge.js/stone.js:
// deterministic functions of the world clock `t` (seconds), no Math.random
// anywhere — the harness replays the sky frame-for-frame and gates the LAW,
// not the pixels.
//
// Scope is the one-sky law (items 8/13/14/15): the island's laws live over
// the island's four outdoor poses only, and nowhere else. The Stoneship
// harbour keeps its own gulls and wash; the beached boat stays dry
// (stone.js's scope says so); stairTop already carries the island's bird
// ambience, so the island cry scopes to the three waterline views and never
// double-chirps the terrace.
//
// The dial is the shared-law rule (item 12): the NEAR tower's dial and the
// FOUR skyline dials breathe on the SAME formula with the SAME
// LANDMARK_LAW glow — near and far cannot drift apart, so the law lives
// here once and scene.js reads it in both seats.

import { seaSwell, LANDMARK_LAW } from './sea.js'

// The island's outdoor poses: the dock, the cliff path, the beach and the
// library terrace. The interiors (library, tower, cave, cabin, silo) and
// every other Age keep their own skies.
export const ISLE_VIEWS = ['dock', 'cliffPath', 'beach', 'stairTop']

// FNV-style string hash in [0,1) — deterministic, no Math.random anywhere.
function h01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

// The bay is bigger than a mooring: the island gulls ride a wider, higher
// and lazier ring than the harbour's (stone.js GULLS) — they wheel the whole
// dusk bay, not a single piling.
export const ISLE_GULLS = {
  n: 3,             // a bay ring of three
  r0: 8, r1: 8,     // orbit radius: 8..16 m out from the view's seat
  h0: 6, h1: 5,     // glide height: 6..11 above the view's seat (over the water, under the cliff)
  p0: 13, p1: 9,    // one circuit every 13..22 s — bay gulls loiter harder than harbour gulls
  w0: 4.0, w1: 2.0, // wingbeats per second, hashed per bird
}

// The wheeling ring at instant t for an island view: [{ x, y, z, yaw, flap }].
// Each bird traces its own hashed circle (own radius, height, period and
// direction) and bobs a touch between beats; `flap` is 0..1 wing phase.
// [] outside the island — the other Ages keep their own skies.
export function isleGulls(t, view) {
  if (!ISLE_VIEWS.includes(view)) return []
  const out = []
  for (let i = 0; i < ISLE_GULLS.n; i++) {
    const a0 = h01(`${view}:ig${i}:a`) * Math.PI * 2
    const r = ISLE_GULLS.r0 + h01(`${view}:ig${i}:r`) * ISLE_GULLS.r1
    const h = ISLE_GULLS.h0 + h01(`${view}:ig${i}:h`) * ISLE_GULLS.h1
    const per = ISLE_GULLS.p0 + h01(`${view}:ig${i}:p`) * ISLE_GULLS.p1
    const dir = h01(`${view}:ig${i}:d`) < 0.5 ? 1 : -1
    const a = a0 + dir * ((t / per) % 1) * Math.PI * 2
    const bob = 0.5 * Math.sin(t * 0.7 + i * 2.3)
    const wingHz = ISLE_GULLS.w0 + h01(`${view}:ig${i}:w`) * ISLE_GULLS.w1
    out.push({
      x: Math.sin(a) * r,
      y: h + bob,
      z: Math.cos(a) * r,
      yaw: a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      flap: 0.5 + 0.5 * Math.sin(t * wingHz * Math.PI * 2 + a0),
    })
  }
  return out
}

// The island's cry cadence: the same kye-ow voice as the harbour (the `gull`
// event — a species, not an Age), but the island birds sit farther out over
// the water, so they call slower and shorter than the harbour ring.
export const ISLECRY = { p0: 9, p1: 9, duty: 0.14 }

// The cry scopes to the three waterline views. stairTop already carries the
// island's `birds` ambience (nodes.js) — a terrace that chirps twice at once
// is a sound bug, so the law answers 0 there and in every other Age.
export const ISLE_CRY_VIEWS = ['dock', 'cliffPath', 'beach']

export function isleCry(t, view, i) {
  if (!ISLE_CRY_VIEWS.includes(view)) return 0
  const key = `${view}:icry${i}`
  const period = ISLECRY.p0 + h01(key) * ISLECRY.p1
  const phase = ((t / period) + h01(key + '#p')) % 1
  if (phase >= ISLECRY.duty) return 0
  const u = Math.sin((Math.PI * phase) / ISLECRY.duty)
  return u * u
}

// The dock stands on six pilings in the shallows (scene.js: px ±1.5 at
// z 30 / 31.6 / 33.2, the sea's rest line at y = 0). The wash is how hard
// the swell is currently standing ABOVE that rest line under the pier:
// sample seaSwell at the six piling seats, keep only the excess (water
// rising up the piling, not the whole ocean), average and normalise by
// PIER_WASH.scale to a 0..1 lap strength — hullWash's law (item 15) with
// the float term gone, because the pier does not float.
export const PIER_SEATS = [
  [-1.5, 30], [1.5, 30],
  [-1.5, 31.6], [1.5, 31.6],
  [-1.5, 33.2], [1.5, 33.2],
]

export const PIER_WASH = { scale: 0.1 }

export function pierWash(t, view) {
  if (view !== 'dock') return 0
  let s = 0
  for (const [x, z] of PIER_SEATS) s += Math.max(0, seaSwell(x, z, t, view))
  return Math.min(1, (s / PIER_SEATS.length) / PIER_WASH.scale)
}

// The clock tower's dial: item 6's skyline law gives it one warm colour and
// a breath (scene.js used to run `0.55 + 0.28·sin(0.7t + lm.h)` inline, lm.h
// the law's tower height). The law now lives HERE once — the near dial on
// the stairTop tower and the four far dials on the dusk skyline both read
// it, so the island's one landmark breathes in step near and far.
const TOWER = LANDMARK_LAW.dusk.find((L) => L.kind === 'clockTower')

export const DIAL = {
  freq: 0.7,                       // rad/s — the slow dusk breath
  phase: TOWER.h,                  // 52 — the law table's own tower height, as the skyline always ran it
  min: 0.55 - 0.28,                // 0.27 — the dial gutters but never goes dark
  max: 0.55 + 0.28,                // 0.83 — it brightens but never blows out
  glow: TOWER.glow,                // [0.96, 0.78, 0.36] — warm (r > b), the law's own colour
}

export function dialBreath(t) {
  return 0.55 + 0.28 * Math.sin(t * DIAL.freq + DIAL.phase)
}
