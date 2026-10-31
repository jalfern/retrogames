// SHORT ORDER SHOUT — synthesized sound (#1248). Every action gets a voice via
// AudioController; nothing plays before the AudioContext unlock (App.jsx).

import { audioController as AC } from '../../utils/AudioController'

const PENTA = [523, 587, 659, 784, 880]

export function playFx(f) {
    switch (f.k) {
        case 'print': // dot-matrix ticket zip
            for (let i = 0; i < 4; i++) AC.playTone(1200 + i * 140, 0.03, 'square', 0.035, i * 0.045)
            break
        case 'take': AC.playTone(660, 0.05, 'square', 0.06); break
        case 'pick': AC.playTone(520, 0.05, 'square', 0.05); break
        case 'chop': AC.playNoise(0.05, 0.12); AC.playTone(220, 0.04, 'square', 0.06); break
        case 'sear': AC.playNoise(0.18, 0.05); break
        case 'seared': AC.playTone(880, 0.06, 'triangle', 0.07); AC.playTone(1100, 0.08, 'triangle', 0.06, 0.07); break
        case 'smoke': AC.playNoise(0.3, 0.06); break
        case 'fire':
            AC.playTone(180, 0.3, 'sawtooth', 0.08)
            AC.playSweep(400, 120, 0.4, 'sawtooth', 0.06)
            break
        case 'douse': AC.playNoise(0.35, 0.12); break
        case 'boil': AC.playSweep(120, 200, 0.5, 'triangle', 0.05); break
        case 'stir': AC.playTone(300 + (f.n || 1) * 60, 0.06, 'triangle', 0.06); break
        case 'boilover': AC.playNoise(0.5, 0.14); AC.playSweep(300, 80, 0.5, 'sawtooth', 0.08); break
        case 'ready': AC.playTone(990, 0.07, 'triangle', 0.08); AC.playTone(1320, 0.1, 'triangle', 0.08, 0.08); break
        case 'ladle': AC.playSweep(500, 320, 0.12, 'triangle', 0.07); break
        case 'toss': AC.playSweep(420, 760, 0.12, 'square', 0.05); break
        case 'catch': AC.playTone(760, 0.05, 'square', 0.06); break
        case 'drop': AC.playTone(160, 0.08, 'square', 0.07); break
        case 'fill': AC.playSweep(240, 520, 0.18, 'sine', 0.06); break
        case 'rinse': AC.playNoise(0.2, 0.08); break
        case 'rinsePot': AC.playNoise(0.25, 0.09); AC.playTone(340, 0.08, 'triangle', 0.05); break
        case 'build':
            AC.playTone(520, 0.05, 'square', 0.06)
            AC.playTone(f.g ? 780 : 660, 0.07, 'square', 0.06, 0.05)
            break
        case 'serve': {
            const n = Math.min(4, PENTA.length)
            for (let i = 0; i < n; i++) AC.playTone(PENTA[i], 0.07, 'triangle', 0.08, i * 0.06)
            if ((f.pts || 0) >= 80) AC.playTone(1568, 0.12, 'triangle', 0.07, 0.24) // fat tip bell
            break
        }
        case 'deny': AC.playTone(140, 0.16, 'square', 0.08); break
        case 'expire': AC.playTone(220, 0.2, 'sawtooth', 0.09); AC.playTone(180, 0.25, 'sawtooth', 0.09, 0.18); break
        case 'streak': for (let i = 0; i < 3; i++) AC.playTone(PENTA[i + 2], 0.06, 'square', 0.06, i * 0.05); break
        case 'trash': AC.playTone(120, 0.1, 'square', 0.06); break
        case 'whistle': AC.playSweep(880, 1200, 0.3, 'square', 0.08); AC.playTone(1200, 0.3, 'square', 0.06, 0.3); break
        case 'fired': AC.playSweep(400, 80, 0.7, 'sawtooth', 0.1); break
        case 'start': AC.playTone(440, 0.07, 'square', 0.07); AC.playTone(660, 0.07, 'square', 0.07, 0.08); AC.playTone(880, 0.12, 'square', 0.08, 0.16); break
        case 'ui': AC.playTone(520, 0.04, 'square', 0.05); break
        default: break
    }
}
