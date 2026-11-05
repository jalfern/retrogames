// #838 item 15 — the harbour lives (Jon's look pass, third Age: STONESHIP).
//
// The 1993 Stoneship is a working harbour, not a still life: gulls wheel over
// the mooring crying on their own cadences, and the Atlantic washes along the
// hull's flank — water sliding up and off the planks as the swell passes. Our
// Stoneship had the floating hull (item 12) and the Age-tinted sea (item 2),
// but nothing flew and nothing lapped: the birds hung as silence and the hull
// sat dry on its own waterline.
//
// Everything here is pure like sea.js/storm.js/forge.js: deterministic
// functions of the world clock `t` (seconds), no Math.random anywhere — the
// harness replays the sky frame-for-frame and gates the LAW, not the pixels.
//
// Scope is the one-sky law (items 8/13/14): gulls live over the harbour views
// only, and the wash runs exactly where a hull floats — `SHIP_VIEWS` is the
// same table item 12 moored the ship on. The ridge observatory looks down at
// the harbour from above the birds and keeps its empty calm; the island's
// rotted boat is beached and never washes.

import { SEA_VIEWS, seaSwell, shipFloat, SHIP_ROCK, SHIP_VIEWS } from './sea.js'

// The harbour poses: the pier and the quarterdeck. Both see the mooring and
// the birds over it — one place, two seats (item 6's anchorage law, on birds).
export const STONE_VIEWS = ['stoneship', 'stoneDeck']

// FNV-style string hash in [0,1) — deterministic, no Math.random anywhere.
function h01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

export const GULLS = {
  n: 3,             // a harbour ring of three
  r0: 10, r1: 10,   // orbit radius: 10..20 m out from the mooring
  h0: 5, h1: 6,     // glide height above the sea's rest line
  p0: 11, p1: 8,    // one circuit every 11..19 s — gulls loiter, they don't race
  w0: 4.5, w1: 2.0, // wingbeats per second, hashed per bird
}

// The wheeling ring at instant t for a harbour view: [{ x, y, z, yaw, flap }].
// Each bird traces its own hashed circle (own radius, height, period and
// direction) and bobs a touch between beats; `flap` is 0..1 wing phase.
// [] outside the harbour — the other Ages keep their own skies.
export function gullsAt(t, view) {
  if (!STONE_VIEWS.includes(view)) return []
  const out = []
  for (let i = 0; i < GULLS.n; i++) {
    const a0 = h01(`${view}:g${i}:a`) * Math.PI * 2
    const r = GULLS.r0 + h01(`${view}:g${i}:r`) * GULLS.r1
    const h = GULLS.h0 + h01(`${view}:g${i}:h`) * GULLS.h1
    const per = GULLS.p0 + h01(`${view}:g${i}:p`) * GULLS.p1
    const dir = h01(`${view}:g${i}:d`) < 0.5 ? 1 : -1
    const a = a0 + dir * ((t / per) % 1) * Math.PI * 2
    const bob = 0.5 * Math.sin(t * 0.8 + i * 2.1)
    const wingHz = GULLS.w0 + h01(`${view}:g${i}:w`) * GULLS.w1
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

// A gull's cry envelope in [0,1]: its own hashed 7–14 s cadence, a short
// duty (a cry is a cry, not a siren) and a true rest gap between calls —
// the vent rule (item 13), on birds.
export const GULLCRY = { p0: 7, p1: 7, duty: 0.16 }

export function gullCry(t, view, i) {
  if (!STONE_VIEWS.includes(view)) return 0
  const key = `${view}:cry${i}`
  const period = GULLCRY.p0 + h01(key) * GULLCRY.p1
  const phase = ((t / period) + h01(key + '#p')) % 1
  if (phase >= GULLCRY.duty) return 0
  const u = Math.sin((Math.PI * phase) / GULLCRY.duty)
  return u * u
}

// The wash: how hard the sea is sliding along the floating hull right now.
// The hull rides the AVERAGE swell under its keel (item 12's heave) — so the
// waterline on the plank is where the LOCAL swell disagrees with that average.
// Sample the swell at the four hull seats, keep only the excess over the
// hull's own heave (water rising up the side, not the whole ocean), average
// it and normalise by WASH.scale to a 0..1 lap strength.
export const WASH = { scale: 0.35 }

export function hullWash(t, view) {
  if (!SHIP_VIEWS.includes(view)) return 0
  const fl = shipFloat(t, view)
  if (!fl) return 0
  const [sx, sz] = SHIP_ROCK.seat
  const seats = [
    [sx - SHIP_ROCK.halfW, sz],
    [sx + SHIP_ROCK.halfW, sz],
    [sx, sz - SHIP_ROCK.halfL],
    [sx, sz + SHIP_ROCK.halfL],
  ]
  let s = 0
  for (const [x, z] of seats) s += Math.max(0, seaSwell(x, z, t, view) - fl.heave)
  return Math.min(1, (s / seats.length) / WASH.scale)
}
