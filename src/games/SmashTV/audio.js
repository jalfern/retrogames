// SMASH TV — audio identity (pure: the component plays exactly these).
//   each gun gets its own voice (twin a short blip, the machine gun a staccato
//   click, the spread a low chord, the laser a descending zap), the firebomb
//   swells with a filtered-noise whoosh under the blast, the bonus rooms get an
//   entry jingle and a soft crowd-murmur bed that exists ONLY while the bonus
//   clock runs, and a single warning blip stings when the nearest gun closes
//   inside the alert ring.

// per-weapon fire timbre. notes = [freq, delay, dur] played as `type`; a sweep
// is one oscillator falling from f0 to f1 over dur (the laser's zap).
export const FIRE = {
    twin: { notes: [[880, 0, 0.04]], type: 'square', vol: 0.05 },
    gun: { notes: [[170, 0, 0.03], [1150, 0, 0.012]], type: 'square', vol: 0.06 },
    spread: { notes: [[262, 0, 0.07], [330, 0, 0.07], [392, 0, 0.07]], type: 'square', vol: 0.045 },
    laser: { sweep: { f0: 1600, f1: 160, dur: 0.12 }, type: 'sawtooth', vol: 0.06 },
}
export const fireTimbre = (weapon) => FIRE[weapon] || FIRE.twin

// the bonus-entry jingle: a quick rising C-E-G-C (square), never one bare
// sweep — [freq, delay, dur, vol]
export const BONUS_JINGLE = [
    [523.25, 0, 0.09, 0.07],
    [659.25, 0.09, 0.09, 0.07],
    [783.99, 0.18, 0.09, 0.07],
    [1046.5, 0.27, 0.2, 0.08],
]

// the crowd murmur: one soft lowpassed-noise burst every MURMUR_TICKS sim
// ticks while a bonus room is on. The bursts overlap into a bed; it stops the
// tick the bonus room ends (no murmur anywhere else in the studio).
export const MURMUR_TICKS = 28
export const MURMUR = { dur: 0.5, vol: 0.022, freq: 420 }

// the firebomb whoosh: a short bright band of filtered noise under the blast
export const WHOOSH = { dur: 0.22, vol: 0.06, freq: 1800 }

// the single-enemy-close warning: one blip per ALERT_CD ticks while the
// nearest gun sits inside ALERT_RADIUS — it stings, it does not buzz
export const ALERT_RADIUS = 48
export const ALERT_CD = 60
export const ALERT = { freq: 1320, dur: 0.07, type: 'square', vol: 0.05 }
