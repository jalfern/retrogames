// GRAVEL YARD — synthesized sound (#1253). Diesel and hydraulics via
// AudioController; nothing plays before the AudioContext unlock (App.jsx).

import { audioController as AC } from '../../utils/AudioController'

const TRIAD = [392, 494, 587]

export function playFx(f) {
    switch (f.k) {
        case 'order': // board clip + air horn chirp
            AC.playTone(220, 0.05, 'square', 0.05); AC.playTone(330, 0.07, 'square', 0.05, 0.06)
            break
        case 'radio': { // squelch + per-seat voice formants (#1306): the crew
            // is identifiable with eyes off the screen — TRUCK dark, SCREEN
            // bright, DIGGER mid, BOARD high.
            const F = { TRUCK: [240, 900], SCREEN: [420, 1600], DIGGER: [300, 1200], BOARD: [520, 1900] }
            const [f1, f2] = F[f.who] || [350, 1300]
            AC.playTone(f1, 0.05, 'square', 0.035)
            AC.playTone(f2, 0.07, 'square', 0.028, 0.06)
            AC.playNoise(0.06, 0.05); AC.playTone(1400, 0.02, 'square', 0.02, 0.11)
            break
        }
        case 'drone': { // diesel idle under play (48-tick cadence, ~0.8 s)
            AC.playTone(52, 0.55, 'sawtooth', 0.03)
            AC.playTone(57, 0.5, 'sawtooth', 0.022, 0.05)
            if (f.load) AC.playNoise(0.45, 0.014) // screen running adds grit
            break
        }
        case 'roll': // heavy idle roll
            if (Math.random() < 0.6) AC.playNoise(0.05, f.big ? 0.03 : 0.02)
            break
        case 'bump': AC.playTone(110, 0.09, 'square', 0.08); AC.playNoise(0.06, 0.06); break
        case 'digStart': AC.playSweep(180, 260, 0.25, 'sawtooth', 0.05); break
        case 'dig': // gravel bite
            AC.playNoise(0.14, 0.1); AC.playTone(f.wet ? 90 : 130, 0.08, 'square', 0.06); break
        case 'dumpStart': AC.playSweep(300, 160, 0.2, 'triangle', 0.05); break
        case 'dump':
            AC.playNoise(0.28, 0.11)
            AC.playTone(150, 0.1, 'square', 0.05)
            if (f.spill > 0) AC.playTone(90, 0.18, 'sawtooth', 0.06, 0.12)
            break
        case 'loadStart': AC.playSweep(240, 320, 0.15, 'square', 0.04); break
        case 'load': AC.playNoise(0.12, 0.09); AC.playTone(300 + (f.n || 1) * 50, 0.05, 'square', 0.05); break
        case 'gate': {
            const n = f.gate === 'wide' ? 2 : f.gate === 'medium' ? 1 : 0
            AC.playTone(200 + n * 90, 0.07, 'square', 0.06)
            break
        }
        case 'batchStart':
            AC.playTone(70, 0.4, 'sawtooth', 0.07)
            AC.playSweep(60, 110, 0.5, 'square', 0.04)
            break
        case 'batchEnd':
            AC.playTone(TRIAD[0], 0.06, 'triangle', 0.07)
            AC.playTone(TRIAD[1], 0.06, 'triangle', 0.07, 0.06)
            AC.playTone(TRIAD[2], 0.09, 'triangle', 0.07, 0.12)
            break
        case 'jam': // motor bogging down
            AC.playSweep(160, 45, 0.6, 'sawtooth', 0.1); AC.playNoise(0.3, 0.08); break
        case 'jog': AC.playTone(120 + (f.n || 1) * 30, 0.05, 'square', 0.07); AC.playNoise(0.05, 0.05); break
        case 'spill': AC.playNoise(0.3, 0.09); AC.playTone(80, 0.22, 'sawtooth', 0.07, 0.1); break
        case 'deny': AC.playTone(140, 0.14, 'square', 0.07); break
        case 'noMix': AC.playTone(160, 0.1, 'square', 0.07); AC.playTone(120, 0.12, 'square', 0.07, 0.1); break
        case 'tip': AC.playSweep(200, 340, 0.18, 'square', 0.05); AC.playNoise(0.2, 0.09); break
        case 'orderDone': {
            // cents ticker: one blip per ~30C earned, counting up to the payout
            const n = Math.max(0, Math.min(8, Math.round((f.cents || 0) / 30)))
            for (let i = 0; i < n; i++) AC.playTone(660 + i * 110, 0.03, 'square', 0.03, i * 0.035)
            for (let i = 0; i < TRIAD.length; i++) AC.playTone(TRIAD[i] * 2, 0.07, 'square', 0.06, 0.3 + i * 0.07)
            if ((f.bonus || 0) >= 25) AC.playTone(1568, 0.12, 'triangle', 0.07, 0.54)
            break
        }
        case 'lapse': AC.playTone(200, 0.2, 'sawtooth', 0.08); AC.playTone(150, 0.25, 'sawtooth', 0.08, 0.18); break
        case 'refuse': AC.playSweep(240, 90, 0.4, 'sawtooth', 0.1); AC.playNoise(0.2, 0.08); break
        case 'ruined': AC.playSweep(300, 60, 0.8, 'sawtooth', 0.1); break
        case 'whistle': AC.playSweep(700, 1100, 0.3, 'square', 0.08); AC.playTone(1100, 0.3, 'square', 0.06, 0.3); break
        case 'shiftEnd': AC.playSweep(500, 180, 0.5, 'square', 0.07); break
        case 'start':
            AC.playTone(90, 0.2, 'sawtooth', 0.07) // ignition rumble
            AC.playTone(392, 0.07, 'square', 0.06, 0.22)
            AC.playTone(587, 0.12, 'square', 0.06, 0.3)
            break
        case 'ui': AC.playTone(440, 0.04, 'square', 0.05); break
        default: break
    }
}
