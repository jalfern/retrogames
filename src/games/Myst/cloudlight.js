// Pure cloud-floor law for CHANNELWOOD (#838 item 14 — "the cloud floor
// breathes", Jon's item-3 look pass, second Age).
//
// The 1993 original floats ON the clouds: a near-white cloud sea below the
// platforms supplies half the Age's light. Three facts this module makes law:
//
// 1. The bounce below BREATHES — banks thicken and thin, so the upwelling
//    brightness pumps slowly (`cloudBounce`). By the one-sky law every
//    Channelwood view answers the SAME gain at the same instant: it is one
//    cloud sea, not four props (item 8's storm rule, on gentle light).
// 2. It lights FROM BELOW — no other Age uplights; the wood's undersides
//    glow cool white off the cloud floor. The scene seats one `cloudLamp`
//    under each platform riding the bounce; the lamp colour IS
//    `SKY_CLOUD.channelwood` from sea.js — the very constant the mirrored
//    horizon already paints (item 12's shared-law rule: mirror and bounce
//    cannot drift apart).
// 3. Banks CROSS the deck (`cloudShade`): a per-view hashed crossing period,
//    duty 0.55 with a TRUE clear gap (a bank that never leaves is a ceiling,
//    not weather), and a linear moving front so the shade sweeps in ground
//    direction — a point stays bright while the bank still hangs short of it.
//
// Scope is the whole point (items 8/13's rule): `cloudBounce` answers exactly
// 1 and `cloudShade` exactly 0 outside Channelwood. Deterministic in the world
// clock `t` (seconds) — no Math.random — so mystcheck gates the law, not the
// pixels.

import { SKY_CLOUD } from './sea.js'

export const CLOUD_VIEWS = ['channelwood', 'chanChannels', 'chanWheel', 'chanObs']

export const CLOUD = {
  lamp: 5.5, // nominal uplight intensity at full bounce
  reach: 30, // metres: the lamp floods the platform above the cloud floor
  period: 17, // seconds — the bank-breath (slow: the storm's 160 ms is a different voice)
  min: 0.80, // envelope bounds — the glow dims but never fails
  max: 1.06,
  depth: 0.26, // how much of the light a full bank takes away
  passPeriod0: 34, // shortest bank crossing in seconds…
  passPeriod1: 24, // …plus this much, hashed per view: every platform its weather
  duty: 0.55, // fraction of the cycle a bank can cover; the rest is clear sky
  front: 46, // metres: the width over which a crossing bank ramps on and off
}

// The cloud floor's own colour — the same constant sea.js mirrors onto the
// horizon (SKY_CLOUD.channelwood). Exported as the law, not a copy.
export const BOUNCE_TINT = SKY_CLOUD.channelwood

// Where the glow lives in each Channelwood view — [x, y, z]. Every seat sits
// BELOW the view's own sea/cloud level (SEA_VIEWS[v].water): the light comes
// up out of the clouds, which is the whole point of the Age.
export const CLOUD_SEATS = {
  channelwood: [0, -2.7, -18],
  chanChannels: [0, -2.7, -30],
  chanWheel: [0, -3.0, -52],
  chanObs: [0, -3.0, -62],
}

// FNV-style string hash in [0,1) — deterministic, no Math.random anywhere.
function h01(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}

// Upwelling gain from the cloud sea at instant t for `view`: one shared pump
// (the one-sky law), clamped to [min, max]; exactly 1 outside Channelwood.
export function cloudBounce(t, view) {
  if (!CLOUD_VIEWS.includes(view)) return 1
  const pump = 0.93 + 0.11 * Math.sin((t * 2 * Math.PI) / CLOUD.period)
    + 0.03 * Math.sin(t * 0.23 + 1.7)
  return Math.min(CLOUD.max, Math.max(CLOUD.min, pump))
}

// Bank shade 0..1 over a deck point at t — 0 for open sky, 1 dead under the
// bank; exactly 0 outside Channelwood. A point sits in the moving front:
// shade ramps up as the bank's leading edge reaches it, holds through the
// bank's body, and the cycle ends in a true clear gap before the next bank.
export function cloudShade(t, x, z, view) {
  if (!CLOUD_VIEWS.includes(view)) return 0
  const period = CLOUD.passPeriod0 + h01(String(view)) * CLOUD.passPeriod1
  const phase = ((t / period) + h01(`${view}#p`)) % 1
  if (phase >= CLOUD.duty) return 0 // clear sky — a bank is not a ceiling
  const u = phase / CLOUD.duty // 0 arrival → 1 departure within the crossing
  const front = Math.max(0, Math.min(1, (z + u * 3 * CLOUD.front - CLOUD.front) / CLOUD.front))
  const ragged = 0.55 + 0.45 * Math.sin(x * 0.05 + t * 0.11 + h01(`${view}#e`) * 6.283)
  return front * Math.max(0, Math.min(1, ragged))
}

// What the deck actually receives: the breath, minus whatever bank stands
// between it and the sun. Outside Channelwood this is exactly 1 — neutral.
export function deckLight(t, x, z, view) {
  return cloudBounce(t, view) * (1 - CLOUD.depth * cloudShade(t, x, z, view))
}
