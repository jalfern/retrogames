// TALK ME DOWN — every action earns a sound, synthesized via AudioController
// (no assets). Relay clicks, a chunky fuse tick, sparks, green-lamp chimes.
import { audioController as A } from '../../utils/AudioController'

export const sfx = {
    move() { A.playTone(220, 0.03, 'square', 0.04) },
    // #1305: a real rotary dial ratchets — a quick click series, pitch rising
    // slightly as the detent snaps over.
    dial() {
        for (let i = 0; i < 4; i++) A.playTone(170 + i * 16 + Math.random() * 10, 0.02, 'square', 0.05, i * 0.035)
        A.playNoise(0.02, 0.07)
    },
    // #1305: "in the box" bed — a sub-bass hum retriggered by the shell every
    // half-second of live play (Raccoon Heist pattern), quiet on purpose.
    hum() { A.playTone(55, 0.52, 'triangle', 0.016) },
    // #1305: below 10 s the defuser's own pulse joins the clock — lub-dub.
    heart() { A.playTone(70, 0.09, 'triangle', 0.13); A.playTone(58, 0.12, 'triangle', 0.1, 0.15) },
    key() { A.playTone(520, 0.06, 'square', 0.09); A.playTone(660, 0.05, 'square', 0.07, 0.05) },
    snip() { A.playNoise(0.05, 0.22); A.playTone(180, 0.08, 'sawtooth', 0.12, 0.02) },
    safe() { A.playTone(660, 0.09, 'square', 0.1); A.playTone(880, 0.12, 'square', 0.1, 0.09) },
    strike() { A.playNoise(0.18, 0.3); A.playSweep(320, 90, 0.28, 'sawtooth', 0.16) },
    tick() { A.playTone(1200, 0.02, 'square', 0.05) },
    tock() { A.playTone(1500, 0.03, 'square', 0.08) },
    page() { A.playNoise(0.07, 0.08) },
    flag() { A.playTone(980, 0.05, 'triangle', 0.08); A.playTone(1240, 0.06, 'triangle', 0.07, 0.05) },
    heard() { A.playTone(760, 0.05, 'triangle', 0.09) },
    refused() { A.playTone(240, 0.09, 'square', 0.08); A.playTone(180, 0.12, 'square', 0.08, 0.08) },
    order() { A.playTone(880, 0.04, 'triangle', 0.06); A.playTone(1100, 0.05, 'triangle', 0.05, 0.04) },
    clear() { [523, 659, 784, 1046].forEach((f, i) => A.playTone(f, 0.12, 'square', 0.1, i * 0.09)) },
    boom() { A.playNoise(0.7, 0.45); A.playSweep(160, 30, 0.9, 'sawtooth', 0.3) },
    start() { [392, 523, 659].forEach((f, i) => A.playTone(f, 0.09, 'square', 0.09, i * 0.07)) },
}
