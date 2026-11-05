// MYST — synthesized audio. The WHAT is in soundplan.js (pure, audited by
// mystcheck); this file is the thin browser layer that plays each scheduled
// cue. Ambience is a slow layer scheduled off the fixed-timestep loop
// (wind, surf, gears, drips) — never setTimeout. #838 item 10 moved the
// per-Age voices into soundplan.js (`ambCues`) so the harness can prove a
// kind resolves, kinds stay distinct, and the same wind reads apart across the
// Ages — this layer only dispatches and keeps the re-trigger timer.

import { audioController as A } from '../../utils/AudioController'
import { plan, TONES } from './soundplan.js'

// one cue → one sound. Shared by every event and the ambience layer.
function play(c) {
  switch (c.type) {
    case 'tone': A.playTone(c.f, c.dur, c.wave, c.vol, c.delay || 0); break
    case 'sweep': A.playSweep(c.f0, c.f1, c.dur, c.wave, c.vol); break
    case 'noise': A.playNoise(c.dur, c.vol); break
    case 'fnoise': A.playFilteredNoise(c.dur, c.vol, c.freq); break
    default: break
  }
}

export function sfx(ev) { for (const c of plan(ev)) play(c) }

export function sfxTone(i) { A.playTone(TONES[i] || 262, 0.4, 'sine', 0.09) }

let ambT = 0
// #1587/#838 — `view` (the node id) rides with the ambience so every view
// wears its own Age: `amb:wind:dock` is the dusk wash, `amb:wind:selThrone`
// the caldera moan; and every open sea layers its swell rumble underneath
// (`swell:${view}` is silent for a dry view — swellCues returns [] there).
export function ambience(kind, dt, view) {
  ambT -= dt
  if (ambT <= 0) {
    for (const c of plan(`amb:${kind}:${view}`)) play(c)
    for (const c of plan(`swell:${view}`)) play(c)
    ambT = 2.4 + Math.random() * 1.6
  }
}
