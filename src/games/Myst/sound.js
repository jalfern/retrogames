// MYST — synthesized audio. Actions via audioController; ambience is a slow
// layer scheduled off the fixed-timestep loop (wind, surf, gears, drips).

import { audioController as A } from '../../utils/AudioController'

export function sfx(ev) {
  switch (ev) {
    case 'turn': A.playTone(220, 0.05, 'triangle', 0.05); break
    case 'travel': A.playSweep(140, 420, 0.5, 'sine', 0.08); break
    case 'look': A.playTone(520, 0.06, 'sine', 0.05); break
    case 'blocked': A.playTone(110, 0.12, 'square', 0.06); break
    case 'reveal': A.playSweep(330, 180, 0.35, 'triangle', 0.09); A.playNoise(0.2, 0.1); break
    case 'takePage': A.playNoise(0.18, 0.12); A.playTone(660, 0.12, 'sine', 0.07, 0.08); break
    case 'placePage': A.playTone(392, 0.18, 'sine', 0.09); A.playTone(523, 0.22, 'sine', 0.08, 0.12); break
    case 'pickup': A.playTone(587, 0.1, 'square', 0.06); break
    case 'dial': A.playTone(150 + Math.random() * 40, 0.04, 'square', 0.05); break
    case 'safeOpen': A.playSweep(90, 300, 0.6, 'sawtooth', 0.1); A.playNoise(0.3, 0.12); break
    case 'switchSolved': A.playTone(196, 0.1, 'square', 0.07); A.playTone(294, 0.1, 'square', 0.07, 0.09); A.playTone(392, 0.16, 'square', 0.07, 0.18); break
    case 'starSolved': A.playSweep(300, 900, 0.7, 'sine', 0.08); break
    case 'sphereSolved': A.playTone(262, 0.25, 'sine', 0.08); A.playTone(330, 0.25, 'sine', 0.08, 0.1); A.playTone(392, 0.3, 'sine', 0.08, 0.2); A.playNoise(0.4, 0.1); break
    case 'burn': A.playNoise(0.9, 0.16); A.playSweep(200, 80, 0.8, 'sawtooth', 0.08); break
    case 'whitePage': [523, 659, 784, 1046].forEach((f, i) => A.playTone(f, 0.35, 'sine', 0.09, i * 0.14)); break
    case 'endGood': [392, 494, 587, 784, 988].forEach((f, i) => A.playTone(f, 0.5, 'triangle', 0.1, i * 0.16)); break
    case 'endBad': A.playSweep(300, 60, 1.2, 'sawtooth', 0.12); A.playNoise(0.8, 0.14); break
    case 'link': A.playSweep(80, 1200, 0.9, 'sine', 0.1); A.playNoise(0.5, 0.12); break
    case 'restart': A.playSweep(600, 200, 0.4, 'triangle', 0.08); break
    default: break
  }
}

const TONES = [196, 262, 330, 392]

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
