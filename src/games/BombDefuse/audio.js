// BOMB DEFUSE — synthesized SFX set (#1800). Every action sounds; nothing
// plays before the AudioContext unlock (App.jsx handles that).
import { audioController as A } from '../../utils/AudioController.js'

export const sfx = {
    // brass key barrel turning over
    key() { A.playTone(300, 0.05, 'square', 0.09); A.playTone(520, 0.06, 'square', 0.08, 0.04) },
    // both keys home — the lock accepts
    click() { A.playTone(620, 0.07, 'square', 0.12); A.playTone(930, 0.10, 'square', 0.10, 0.06) },
    // cutter arm stepping color to color
    move() { A.playTone(210, 0.025, 'square', 0.04) },
    // blade snipping a wire
    snip() { A.playNoise(0.04, 0.24); A.playTone(1500, 0.03, 'square', 0.06, 0.01) },
    // both blades through — wire out
    cut() { A.playNoise(0.09, 0.2); A.playTone(700, 0.08, 'square', 0.1); A.playTone(1050, 0.11, 'square', 0.09, 0.07) },
    // gauge needle swinging softly while unattended
    creak() { A.playSweep(90, 130, 0.16, 'triangle', 0.03) },
    // needle seated in the green
    sealed() { A.playTone(440, 0.08, 'triangle', 0.12); A.playTone(660, 0.12, 'triangle', 0.11, 0.07) },
    // pressure surge — held too late
    surge() { A.playSweep(220, 60, 0.34, 'sawtooth', 0.16); A.playNoise(0.14, 0.18) },
    // needle swings past without a seat — a dud, not a strike
    dud() { A.playTone(140, 0.05, 'triangle', 0.05) },
    // blade through the wrong cable — a nick, the wire survives
    nick() { A.playNoise(0.05, 0.18); A.playSweep(240, 120, 0.12, 'square', 0.08) },
    // a strike: broken sync window
    strike() { A.playNoise(0.16, 0.28); A.playSweep(300, 110, 0.24, 'square', 0.12) },
    // fuse ticks in the last ten seconds
    tick() { A.playTone(1250, 0.02, 'square', 0.05) },
    // the bomb is down
    defused() {
        for (let i = 0; i < 4; i++) A.playTone([523, 659, 784, 1047][i], 0.10, 'square', 0.10, i * 0.09)
    },
    // zero fuse
    boom() {
        A.playNoise(0.7, 0.5)
        A.playSweep(140, 30, 0.9, 'sawtooth', 0.22)
    },
    // ratchet detent mid key-turn (#1812 item 2 — the spring pose crosses the
    // click on the way in; the way out is the softer return)
    ratchet() { A.playTone(740, 0.02, 'square', 0.05) },
    ratchetBack() { A.playTone(520, 0.025, 'square', 0.03) },
    // whole run cleared
    win() {
        for (let i = 0; i < 6; i++) A.playTone([392, 523, 659, 784, 1047, 1319][i], 0.12, 'square', 0.11, i * 0.11)
    },
    // UI blips
    blip() { A.playTone(880, 0.04, 'square', 0.07) },
    deny() { A.playTone(160, 0.09, 'square', 0.08) },
}
