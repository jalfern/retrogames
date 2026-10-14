// JOUST (Williams, 1982) — the sound table. The cabinet's SFX had grain: a
// distinct growl, a wing-flap crash, an egg-tinkle. This build collapsed each
// event to one noise burst or one tone, which reads as a flat beep. Every
// event class now maps to a small RECIPE of voices (the AudioController
// primitives: tone / sweep / noise / fanfare / death) that index.jsx plays in
// order. Kept as pure data so scripts/joustcheck.mjs can pin the timbres in
// Node — the same contract as Tetris/music.js. A recipe is a list of voices:
//   { k:'tone',  f, d, w, v }   { k:'sweep', f0, f1, d, w, v }
//   { k:'noise', d, v }         { k:'fanfare' }   { k:'death' }
// No two event classes may share an identical recipe — the distinction is the
// whole point of the grain.

export const SFX = {
    // the lance meets a rider: a low wooden thock under a short rising growl
    joust: [
        { k: 'tone', f: 180, d: 0.05, w: 'square', v: 0.09 },
        { k: 'sweep', f0: 320, f1: 760, d: 0.13, w: 'sawtooth', v: 0.07 },
    ],
    // a foe smitten by lava / hand / crumble (+50): a sharper, shorter crack
    smite: [
        { k: 'tone', f: 520, d: 0.04, w: 'square', v: 0.07 },
        { k: 'sweep', f0: 480, f1: 240, d: 0.11, w: 'square', v: 0.06 },
    ],
    // the rider dies: the wing-flap crash — a noise burst under a falling thud
    death: [
        { k: 'noise', d: 0.22, v: 0.16 },
        { k: 'sweep', f0: 300, f1: 90, d: 0.2, w: 'triangle', v: 0.1 },
    ],
    // bank an egg: the egg-tinkle — two quick bright high notes
    'egg-get': [
        { k: 'tone', f: 880, d: 0.04, w: 'triangle', v: 0.08 },
        { k: 'tone', f: 1320, d: 0.06, w: 'triangle', v: 0.07 },
    ],
    // an egg drops: one short dull plop
    'egg-drop': [
        { k: 'sweep', f0: 300, f1: 180, d: 0.06, w: 'triangle', v: 0.06 },
    ],
    // an egg hatches into something worse: the low growl
    hatch: [
        { k: 'sweep', f0: 150, f1: 70, d: 0.22, w: 'sawtooth', v: 0.09 },
    ],
    // a ledge crumbles under a rider: a short granular rumble
    crumble: [
        { k: 'noise', d: 0.16, v: 0.1 },
    ],
    // a wave clears: the fanfare
    clear: [
        { k: 'fanfare' },
    ],
    // a 1-up: a bright double ding
    oneup: [
        { k: 'tone', f: 1046, d: 0.06, w: 'square', v: 0.08 },
        { k: 'tone', f: 1568, d: 0.08, w: 'square', v: 0.07 },
    ],
    // game over: the descending dirge
    over: [
        { k: 'death' },
    ],
    // victory: the fanfare held under one extra high note — the win outdoes
    // the wave-clear (they must not be the same sound)
    win: [
        { k: 'fanfare' },
        { k: 'tone', f: 1760, d: 0.25, w: 'square', v: 0.09 },
    ],
}

export const SFX_IDS = Object.keys(SFX)
