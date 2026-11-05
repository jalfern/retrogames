// #838 item 8 — SELENITIC storms LIVE (#1587-sibling stage of the MYST fidelity
// issue). Pure: no THREE, no DOM. In the original, Selenitic's sky is never a
// still green wash — the storm flashes: the whole Age lights at once (sky, sea,
// dome), then falls back into murk, and the thunder rolls in after the light.
// Until now the flash existed only inside the Spectator's little lens
// (visions.js), while standing IN the Age showed a static sky. This module is
// that law, so the lens and the world strike on the SAME clock: the pane you
// glance at and the sea you stand over brighten on the same instant.
//
// Envelope (world seconds, the loop's own `t` — deterministic, no Math.random):
//   period   6.4 s — the exact cycle the Spectator lens already runs, so the
//            two never quarrel over when the storm fires.
//   width    0.16 s main stroke, decaying linearly from full to nil — the
//            lens's 160 ms window, unchanged.
//   bounce   the original's strikes are doubles: a second, weaker crack lifts
//            the sky again mid-decay. The envelope is main + bounce, clamped.
// The gain laws below say what the flash DOES: the sky dome brightens past
// white (tone-mapped), the sea's emissive catches the same pale jade, and the
// thunder answers STORM.rumbleDelay seconds after the light — the storm is in
// the caldera, close, but not overhead.

export const STORM = {
  period: 6.4,        // s — the same clock visions.js paints with
  width: 0.16,        // s — main stroke length (the lens's flash window)
  bounce: 0.07,       // s — the second strike lands mid-decay
  bounceWidth: 0.06,  // s — how long the bounce takes to fall
  bounceAmt: 0.55,    // the bounce is weaker than the main stroke
  rumbleDelay: 1.7,   // s — thunder AFTER light: distance inside the caldera
  color: [0.88, 0.97, 0.90], // pale jade — the flash colour of SKY_CLOUD.selenitic, lit
}

// The nodes that stand under the storm: every Selenitic view. The other Ages
// keep their own skies — the island's dusk never flickers, Channelwood's cloud
// floor stays calm, Mechanical's forge glows steady.
export const STORM_VIEWS = ['selenitic', 'selSound', 'selThrone', 'selGate', 'selTop']

export function stormView(view) {
  return STORM_VIEWS.includes(view)
}

// flash brightness 0..1 at world time t for `view`: 0 everywhere outside
// Selenitic, a decaying double strike inside it. Same t, same number — the
// harness replays the envelope tick for tick, and every Selenitic view shares
// one clock, so the whole Age lights at once.
export function stormFlash(t, view) {
  if (!stormView(view) || !Number.isFinite(t) || t < 0) return 0
  const x = t % STORM.period
  let f = x < STORM.width ? 1 - x / STORM.width : 0
  if (x >= STORM.bounce && x < STORM.bounce + STORM.bounceWidth) {
    f += STORM.bounceAmt * (1 - (x - STORM.bounce) / STORM.bounceWidth)
  }
  return Math.min(1, f)
}

// how hard the sky dome is driven past its resting colour at (t, view) — the
// scene multiplies its sky texture by 1 + gain*color, so flash lands as light,
// not as a flat overlay.
export function skyGain(t, view) {
  return stormFlash(t, view) * 1.8
}

// how hard the sea's emissive catches the flash (the water mirrors the strike
// from below, the way the FMV seas whiten under the storm).
export function seaGain(t, view) {
  return stormFlash(t, view) * 0.5
}
