// BOMB DEFUSE — synthesized SFX set (#1800). Every action sounds; nothing
// plays before the AudioContext unlock (App.jsx handles that).
import { audioController as A } from '../../utils/AudioController.js'

// #1812 item 10 — the powered-device bed. A live bomb is never silent: a low
// hum runs while the unit is armed, and the pitch climbs as the fuse drains
// (the transformer straining). The law is PURE and exported so defusecheck can
// pin it without a browser: standby under CRITICAL seconds, +STEP Hz per second
// gone, capped at TOP so the climb stays a groan, never a squeal. The duck is
// the caller's (index.jsx pumpBed): while the boom rings out the bed stops
// re-firing and the crack owns the room.
export const BED = { BASE: 55, TOP: 98, CRITICAL: 15, STEP: 3, EVERY: 30 }
export const bedHz = (secs) => {
    const s = Math.max(0, secs | 0)
    if (s >= BED.CRITICAL) return BED.BASE
    return Math.min(BED.TOP, BED.BASE + (BED.CRITICAL - s) * BED.STEP)
}

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
    // #1812 item 9: the voice warning — a descending double blip, heard as
    // "not that one" without needing any words.
    warn() { A.playTone(320, 0.06, 'square', 0.10); A.playTone(240, 0.09, 'square', 0.10, 0.05) },
    // #1812 item 10: one breath of the powered-device bed (retriggered by the
    // shell every BED.EVERY ticks; 0.55 s > 0.5 s so the hum never gaps).
    bed(secs) { A.playTone(bedHz(secs), 0.55, 'triangle', 0.016) },
    // whole run cleared
    win() {
        for (let i = 0; i < 6; i++) A.playTone([392, 523, 659, 784, 1047, 1319][i], 0.12, 'square', 0.11, i * 0.11)
    },
    // #1812 item 6: win-tally ding — one per line as it lands, rising; the
    // grand total lands highest.
    tally(i) { A.playTone(660 + (i | 0) * 110, 0.07, 'square', 0.09) },
    // UI blips
    blip() { A.playTone(880, 0.04, 'square', 0.07) },
    // #1812 online fold-in item 2: the crew is together — the kick and the
    // mid-run re-seat were silent (the shared Lobby chime only sounds on the
    // attract overlay). Rising C-E-C on the pair's own voice.
    crew() { A.playTone(523, 0.08, 'square', 0.10); A.playTone(659, 0.08, 'square', 0.10, 0.07); A.playTone(784, 0.14, 'square', 0.11, 0.14) },
    deny() { A.playTone(160, 0.09, 'square', 0.08) },
}
