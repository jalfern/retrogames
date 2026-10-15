// THE BARD'S TALE — every action that matters makes a sound, synthesized at
// runtime through the shared AudioController (no assets). Events come from the
// sim's event queue; this maps each to a tone/sweep/noise.

import { audioController as A } from '../../utils/AudioController.js'

const T = (f, d, type = 'square', v = 0.09) => A.playTone(f, d, type, v)

export function playEvents(events) {
    for (const e of events || []) {
        switch (e.type) {
            case 'descend': A.playSweep(320, 120, 0.35, 'sawtooth', 0.08); break
            case 'ascend': A.playSweep(140, 380, 0.3, 'triangle', 0.08); break
            case 'ambush': A.playSweep(200, 520, 0.18, 'square', 0.1); A.playNoise(0.1, 0.12); break
            case 'strike': A.playNoise(0.06, 0.1); T(180, 0.05, 'square', 0.06); break
            case 'shot': T(220, 0.05, 'square', 0.05); break
            case 'hit': T(120, 0.08, 'square', 0.09); break
            case 'slay': A.playSweep(300, 90, 0.22, 'sawtooth', 0.1); break
            case 'fall': A.playSweep(400, 60, 0.6, 'sawtooth', 0.1); break
            case 'round': T(150, 0.04, 'square', 0.04); break
            case 'canto': T(660, 0.14, 'sine', 0.06); break
            case 'buff': T(500, 0.1, 'triangle', 0.06); break
            case 'victory': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.14, 'square', 0.08, i * 0.08)); break
            case 'cast': A.playSweep(600, 1200, 0.22, 'sine', 0.07); break
            case 'song': [392, 494, 587, 494].forEach((f, i) => T(f, 0.16, 'triangle', 0.07, i * 0.09)); break
            case 'heal': case 'templeHeal': [523, 784].forEach((f, i) => T(f, 0.16, 'sine', 0.08, i * 0.09)); break
            case 'raise': [300, 400, 520, 660].forEach((f, i) => T(f, 0.16, 'sine', 0.08, i * 0.09)); break
            case 'potion': T(880, 0.12, 'sine', 0.08); A.playSweep(500, 900, 0.14, 'sine', 0.06); break
            case 'treasure': T(1200, 0.06, 'square', 0.07); T(1600, 0.08, 'square', 0.06, 0.05); break
            case 'gotFloorKey': T(980, 0.1, 'square', 0.08); T(1320, 0.12, 'square', 0.07, 0.07); break
            case 'pickupPotion': T(760, 0.1, 'triangle', 0.07); break
            case 'pickupAle': T(560, 0.1, 'triangle', 0.07); break
            case 'buy': T(700, 0.08, 'square', 0.07); T(500, 0.1, 'square', 0.06, 0.06); break
            case 'bump': T(90, 0.05, 'square', 0.05); break
            case 'doorLocked': case 'lockedGate': case 'atDoor': T(110, 0.12, 'square', 0.08); T(80, 0.14, 'square', 0.08, 0.1); break
            case 'door': A.playSweep(200, 420, 0.2, 'triangle', 0.07); break
            case 'fled': A.playSweep(500, 180, 0.24, 'sawtooth', 0.08); break
            case 'grantKey': [659, 880, 1319].forEach((f, i) => T(f, 0.18, 'square', 0.09, i * 0.1)); break
            case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.14, 'square', 0.08, i * 0.07)); break
            case 'thaw': [200, 300, 400, 600, 800, 1200].forEach((f, i) => T(f, 0.22, 'triangle', 0.08, i * 0.12)); break
            case 'badCode': T(160, 0.12, 'square', 0.06); break
            default: break
        }
    }
}
