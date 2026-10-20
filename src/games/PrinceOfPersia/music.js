// PRINCE OF PERSIA — the sound spine (pure, testable). The 1989 original is
// silence-first: a dungeon you hear before you see, diegetic sound on every
// action, no music on the title. This module carries the two decisions the tab
// makes no music out of: WHICH bed the moment deserves (`trackFor`) and WHAT
// every sim event sounds like (`SFX`, one recipe per event the engine can
// emit — popcheck pins the table against the sim both ways, so a future event
// with no voice fails the gate). The tracks themselves live in AudioController
// and are original melodies in the Hijaz / "Persian" mode (D Eb F# G A Bb C#),
// composed for this build. No DOM, no audio calls here — the component
// interprets recipes as ['tone'|'sweep'|'noise', ...] steps.

import { T } from './levels.js'

export const TRACKS = ['pop', 'popThrone', 'popJaffar']

// ---- chase-sound duck (QA #341-8 / #343-2) --------------------------------------
// During a chase the escort/doorCross cues have to cut through the pop bed. The
// faint escort rustle is buried by the raw music bus; ducking the bed for the
// length of the cue lifts the cue above it. Pure mixing policy — popcheck pins the
// peak relationship (cue vs ducked bed) without a browser; AudioController.duckMusic
// applies it for real over the analyser.
export const MUSIC_BUS_REF = 0.16               // documentation only; the live bus is AudioController.MUSIC_BUS
export const BED_VOICE = 0.6                    // the loudest bed voice unit (_note/bass)
export const DUCK_LEVEL = 0.5                   // how far the bed ducks while a chase cue plays
export const CHASE_CUES = ['escort', 'doorCross']
// #326-1: during a duel the Jaffar ostinato competes with parry rings and hits.
// The bed yields ~4 dB (0.63 ≈ -4 dBFS ratio) for the length of the exchange —
// shallower than the chase duck, because a duel runs many cues in a row and a
// deep pump would make the music hiccup.
export const DUEL_DUCK = 0.63
export const DUEL_CUES = ['parry', 'hit', 'hitPlayer', 'guardWind']
// #326-2: a room flip is a stone event; the bed dips for the slide, and the
// flip cue itself is two layers (see SFX.room).
export const ROOM_DUCK = 0.55
export const ROOM_CUES = ['room']
export function duckFor(cueType) {
    if (CHASE_CUES.includes(cueType)) return DUCK_LEVEL
    if (DUEL_CUES.includes(cueType)) return DUEL_DUCK
    if (ROOM_CUES.includes(cueType)) return ROOM_DUCK
    return 1
}

// #326-5: clock pressure. The original's anxiety is tempo; the shell tightens
// the bed's step as the hour drains (AudioController.setMusicStep). Pure so
// popcheck can pin the ladder without a browser.
export const PRESSURE_MIN = 5 * 60 * 60        // ticks: under five minutes the bed tightens
export const PRESSURE_RISER = 0.85
export const FINAL_MIN = 60 * 60              // ticks: the last minute runs faster still
export const FINAL_RISER = 0.72
export function stepFor(clock, base) {
    if (clock <= FINAL_MIN) return base * FINAL_RISER
    if (clock <= PRESSURE_MIN) return base * PRESSURE_RISER
    return base
}

// the bed for a moment: silent menus/deaths (the original drops to silence
// when you die), Jaffar's theme while the vizier stands between you and the
// princess, palace stone for the palace levels, dungeon drip everywhere else.
export function trackFor(g) {
    if (!g || g.status === 'win' || g.status === 'lost' || g.status === 'dying') return null
    const vizier = (g.guards || []).some((q) => !q.dead && q.boss && q.room === g.room && Math.abs(q.x - g.p.x) < 8 * T)
    if (vizier) return 'popJaffar'
    return g.level && g.level.theme === 'palace' ? 'popThrone' : 'pop'
}

const tone = (freq, dur, type = 'square', vol = 0.1, delay = 0) => ['tone', freq, dur, type, vol, delay]
const sweep = (f0, f1, dur, type = 'triangle', vol = 0.1) => ['sweep', f0, f1, dur, type, vol]
const noise = (dur, vol = 0.2) => ['noise', dur, vol]

// one recipe per event the sim can emit. Recipes are functions so the flavours
// that depend on the event (kind of flask, run vs walk, up vs down) live here
// instead of in if-chains at the call site.
export const SFX = {
    // #326-3: leather alternates by footfall parity (e.foot = L/R), the sim's
    // stepParity — the same boot never thuds twice at the same pitch.
    foot: (e) => (e.run
        ? [noise(0.035, 0.11), tone(e.foot ? 82 : 70, 0.05, 'triangle', 0.13)]
        : e.soft
            ? [noise(0.03, e.foot ? 0.038 : 0.045)]
            : [noise(0.04, 0.075), tone(e.foot ? 108 : 95, 0.05, 'triangle', 0.09)]),
    land: (e) => (e.floors >= 2 ? [noise(0.07, 0.16), tone(80, 0.1, 'triangle', 0.2), tone(55, 0.14, 'sine', 0.16, 0.02)]
        : [noise(0.045, 0.1), tone(95, 0.07, 'triangle', 0.14)]),
    chain: (e) => [noise(0.045, 0.07), tone(e.up ? 620 : 430, 0.035, 'square', 0.045)],
    // QA #421: the single "latch" when a gate starts closing behind you — a low
    // thunk plus a downward settle, distinct from the per-tick 'chain' rattle.
    gateClose: () => [noise(0.06, 0.12), tone(95, 0.12, 'square', 0.13), tone(58, 0.2, 'sine', 0.11, 0.03)],

    jump: () => [sweep(300, 520, 0.07, 'triangle', 0.12)],
    hangjump: () => [sweep(320, 200, 0.09, 'triangle', 0.1)],
    // #326-3: fingers scraping stone as weight goes onto the ledge — grit plus a
    // short downward drag, not the old single 220 Hz blip.
    grab: () => [noise(0.05, 0.09), sweep(300, 190, 0.09, 'triangle', 0.07)],
    climb: () => [sweep(240, 420, 0.12, 'triangle', 0.12)],
    swing: () => [sweep(900, 300, 0.08, 'sawtooth', 0.06)],
    hit: () => [noise(0.08, 0.2), tone(180, 0.1, 'square', 0.14)],
    hitPlayer: () => [noise(0.1, 0.22), tone(140, 0.14, 'square', 0.16), tone(90, 0.2, 'sine', 0.12, 0.04)],
    hurtoffall: () => [noise(0.12, 0.2), tone(110, 0.18, 'square', 0.14)],
    parry: () => [noise(0.06, 0.25), tone(1150, 0.1, 'square', 0.07), tone(1720, 0.07, 'sine', 0.05, 0.01)],
    guardWind: (e) => [tone(e.boss ? 190 : 140, 0.06, 'square', 0.07)],
    guardDown: (e) => [sweep(e.boss ? 400 : 400, 80, e.boss ? 0.45 : 0.25, 'sawtooth', 0.18), noise(0.12, 0.14)],

    loose: () => [noise(0.15, 0.18), tone(130, 0.12, 'triangle', 0.1)],
    door: () => [sweep(120, 60, 0.3, 'square', 0.12)],
    // Stage 7 escorts: boots starting behind you, and stone under crossing feet
    escort: () => [noise(0.05, 0.06), tone(160, 0.05, 'square', 0.05), tone(120, 0.09, 'square', 0.05, 0.07)],
    doorCross: () => [sweep(140, 70, 0.28, 'triangle', 0.12), noise(0.16, 0.12), tone(55, 0.22, 'sine', 0.1, 0.06)],
    sword: () => [sweep(500, 1400, 0.2, 'sawtooth', 0.12), tone(1880, 0.08, 'sine', 0.05, 0.16)],
    checkpoint: () => [tone(760, 0.1, 'square', 0.1)],
    potion: (e) => {
        if (e.kind === 'r') return [sweep(400, 900, 0.2, 'sine', 0.14), tone(1200, 0.06, 'sine', 0.06, 0.18)]
        if (e.kind === '+') return [sweep(400, 1200, 0.28, 'sine', 0.15), tone(1600, 0.08, 'sine', 0.07, 0.24)]
        if (e.kind === 'b') return [sweep(300, 90, 0.3, 'sine', 0.16), noise(0.08, 0.08)]
        if (e.kind === 'f') return [tone(880, 0.09, 'sine', 0.09), tone(1100, 0.09, 'sine', 0.09, 0.07), tone(1320, 0.14, 'sine', 0.09, 0.14)]
        return [sweep(700, 300, 0.18, 'triangle', 0.12), tone(520, 0.1, 'triangle', 0.1, 0.18), tone(700, 0.12, 'triangle', 0.1, 0.28)]
    },
    // #326-2: the room flip punches a two-layer stone slide (grinding slab +
    // dust rumble + a low tail that reads as the reverb change between rooms),
    // replacing the bare 150 Hz tick.
    room: () => [sweep(110, 48, 0.34, 'square', 0.14), noise(0.28, 0.07), tone(52, 0.3, 'sine', 0.12, 0.05)],
    // #326-4: the chomper's mechanism whines up in the ~20 ticks before the
    // jaws reach down — a dread telegraph, deterministic like the jaws themselves.
    chompWarn: () => [sweep(180, 520, 0.28, 'sawtooth', 0.05), tone(90, 0.28, 'square', 0.03)],

    mirror: () => [sweep(1200, 500, 0.35, 'sine', 0.12), tone(1560, 0.12, 'sine', 0.06, 0.05)],
    bridge: () => [tone(520, 0.06, 'triangle', 0.1), tone(780, 0.08, 'triangle', 0.1, 0.05)],
    mouse: () => [tone(980, 0.05, 'square', 0.08), noise(0.025, 0.05)],
    shadowDrink: () => [sweep(300, 700, 0.15, 'sine', 0.08)],
    shadowFall: () => [noise(0.1, 0.1)],
    shadowDown: () => [sweep(500, 120, 0.3, 'triangle', 0.12)],
    merge: () => [sweep(200, 900, 0.5, 'sine', 0.14), tone(1200, 0.3, 'sine', 0.08, 0.3)],

    // #326-6: six causes, six stings — popcheck pins the per-cause poses in
    // art; this mirrors that in sound. Unknown causes keep the old descent.
    die: (e) => {
        switch (e.why) {
            case 'fall': return [noise(0.14, 0.22), tone(70, 0.22, 'triangle', 0.22), tone(44, 0.34, 'sine', 0.18, 0.06)]
            case 'spikes': return [tone(980, 0.1, 'sawtooth', 0.16), sweep(1250, 220, 0.34, 'sawtooth', 0.12, 0.05), noise(0.08, 0.1)]
            case 'chomper': return [noise(0.06, 0.26), tone(170, 0.07, 'square', 0.2), sweep(240, 60, 0.42, 'sawtooth', 0.15, 0.06)]
            case 'sword': return [sweep(1500, 320, 0.16, 'sawtooth', 0.14), noise(0.09, 0.16), tone(120, 0.28, 'square', 0.12, 0.09)]
            case 'poison': return [sweep(520, 140, 0.36, 'sine', 0.13), tone(300, 0.1, 'sine', 0.08, 0.12), noise(0.12, 0.06)]
            case 'shadow': return [sweep(420, 50, 0.6, 'triangle', 0.16), noise(0.24, 0.08)]
            default: return [sweep(300, 60, 0.5, 'sawtooth', 0.2), noise(0.2, 0.12)]
        }
    },
    clear: () => [sweep(400, 800, 0.3, 'square', 0.14), tone(1200, 0.12, 'square', 0.08, 0.22)],
    timeup: () => [sweep(200, 60, 0.8, 'sawtooth', 0.2)],
    win: () => [sweep(400, 1200, 0.6, 'square', 0.16), tone(1568, 0.3, 'square', 0.08, 0.5)],
}
