// MYST — synthesized audio. The WHAT is in soundplan.js (pure, audited by
// mystcheck); this file is the thin browser layer that plays each scheduled
// cue. Ambience is a slow layer scheduled off the fixed-timestep loop
// (wind, surf, gears, drips) — never setTimeout.

import { audioController as A } from '../../utils/AudioController'
import { plan, TONES } from './soundplan.js'

export function sfx(ev) {
  for (const c of plan(ev)) {
    switch (c.type) {
      case 'tone': A.playTone(c.f, c.dur, c.wave, c.vol, c.delay || 0); break
      case 'sweep': A.playSweep(c.f0, c.f1, c.dur, c.wave, c.vol); break
      case 'noise': A.playNoise(c.dur, c.vol); break
      case 'fnoise': A.playFilteredNoise(c.dur, c.vol, c.freq); break
      default: break
    }
  }
}

export function sfxTone(i) { A.playTone(TONES[i] || 262, 0.4, 'sine', 0.09) }

const AMB = {
  sea: () => { A.playNoise(1.4, 0.05); A.playSweep(70, 50, 1.6, 'sine', 0.04) },
  wind: () => { A.playNoise(1.8, 0.04) },
  birds: () => { A.playSweep(1600, 2400, 0.12, 'sine', 0.04); A.playSweep(2100, 1500, 0.1, 'sine', 0.03) },
  fire: () => { A.playNoise(0.25, 0.05) },
  drip: () => { A.playTone(900 + Math.random() * 400, 0.06, 'sine', 0.05) },
  gears: () => { A.playTone(90, 0.05, 'square', 0.05); A.playNoise(0.08, 0.04) },
  sphere: () => { A.playTone(174, 1.2, 'sine', 0.03) },
  falls: () => { A.playNoise(1.6, 0.07) },
}

let ambT = 0
export function ambience(kind, dt) {
  ambT -= dt
  if (ambT <= 0) {
    const f = AMB[kind]
    if (f) f()
    ambT = 2.4 + Math.random() * 1.6
  }
}
